"""
PostgreSQL (Neon) data-access layer for VitaCore.

This module replaces Flask-PyMongo. It exposes a small compatibility layer
(`ObjectId`, `ReturnDocument`, and a `Mongo`/`Database`/`Collection` object
tree) whose method names and call shapes mirror the subset of the PyMongo
API this codebase actually uses (find/find_one/insert_one/update_one/
delete_one/count_documents/aggregate/create_index/find_one_and_update),
so the route modules — written against `mongo.db.<collection>.<method>(...)`
— needed no rewriting beyond swapping their `bson.objectid` import for this
module's `ObjectId`.

Every collection maps 1:1 to a real, typed PostgreSQL table (see schema.sql).
Columns are named exactly like the original Mongo document fields. Any
field not modeled as a real column round-trips through that table's `data`
JSONB catch-all column instead, so nothing is silently dropped.
"""
import json
import os
import re
import uuid
from datetime import date, datetime

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool


def _dumps(value):
    return json.dumps(value, default=str)


def _jsonb(value):
    return Jsonb(value, dumps=_dumps)


# ── id shim (replaces bson.objectid.ObjectId) ──────────────────────────────

_UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


class InvalidId(ValueError):
    pass


class ObjectId(str):
    def __new__(cls, value=None):
        if value is None:
            return str.__new__(cls, str(uuid.uuid4()))
        text = str(value)
        if not _UUID_RE.match(text):
            raise InvalidId(f"{value!r} is not a valid id")
        return str.__new__(cls, text)

    @staticmethod
    def is_valid(value):
        if value is None:
            return False
        return bool(_UUID_RE.match(str(value)))


def new_id():
    return str(uuid.uuid4())


class ReturnDocument:
    BEFORE = "before"
    AFTER = "after"


# ── result shims ────────────────────────────────────────────────────────────

class InsertOneResult:
    def __init__(self, inserted_id):
        self.inserted_id = inserted_id


class InsertManyResult:
    def __init__(self, inserted_ids):
        self.inserted_ids = inserted_ids


class UpdateResult:
    def __init__(self, matched_count, modified_count, upserted_id=None):
        self.matched_count = matched_count
        self.modified_count = modified_count
        self.upserted_id = upserted_id


class DeleteResult:
    def __init__(self, deleted_count):
        self.deleted_count = deleted_count


# ── connection pool ─────────────────────────────────────────────────────────

_pool = None


def _dsn():
    dsn = os.environ.get("DATABASE_URL") or os.environ.get("NEON_DATABASE_URL")
    if not dsn:
        raise RuntimeError("DATABASE_URL environment variable is not set.")
    return dsn


def init_pool(min_size=1, max_size=10):
    global _pool
    if _pool is None:
        _pool = ConnectionPool(conninfo=_dsn(), min_size=min_size, max_size=max_size, open=True, kwargs={"row_factory": dict_row})
    return _pool


def _conn():
    return init_pool().connection()


def ping():
    with _conn() as conn:
        conn.execute("SELECT 1").fetchone()
    return True


def run_schema(sql_text):
    with _conn() as conn:
        conn.execute(sql_text)


# ── column introspection ────────────────────────────────────────────────────

_columns_cache = {}


def _table_columns(table):
    if table in _columns_cache:
        return _columns_cache[table]
    with _conn() as conn:
        rows = conn.execute(
            "SELECT column_name, data_type FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = %s",
            (table,),
        ).fetchall()
    columns = {row["column_name"]: row["data_type"] for row in rows}
    _columns_cache[table] = columns
    return columns


_unique_index_cache = {}


def _unique_index_column_sets(table):
    """Non-partial unique indexes/constraints (including the PK) for `table`,
    as a list of frozensets of column names. Used to detect when an upsert's
    filter keys exactly correspond to a real unique key, so it can be done
    as one atomic `INSERT ... ON CONFLICT DO UPDATE` instead of a
    check-then-act UPDATE/INSERT pair that races under concurrent requests.
    Partial indexes are excluded since ON CONFLICT inference for those needs
    a matching WHERE predicate this generic path doesn't attempt.
    """
    if table in _unique_index_cache:
        return _unique_index_cache[table]
    with _conn() as conn:
        rows = conn.execute(
            """
            SELECT ix.indexrelid AS idx,
                   array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) AS cols
            FROM pg_index ix
            JOIN pg_class t ON t.oid = ix.indrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
            WHERE n.nspname = 'public' AND t.relname = %s
              AND ix.indisunique = true AND ix.indpred IS NULL
            GROUP BY ix.indexrelid
            """,
            (table,),
        ).fetchall()
    result = [frozenset(row["cols"]) for row in rows]
    _unique_index_cache[table] = result
    return result


def _is_jsonb(table, column):
    return _table_columns(table).get(column) == "jsonb"


def _is_array(table, column):
    return _table_columns(table).get(column) == "ARRAY"


def _quote(col):
    return '"%s"' % col.replace('"', '""')


def _normalize(value):
    """Recursively convert ObjectId-shim instances to plain str so the
    driver's type dispatch never has to guess about a str subclass."""
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value
    if isinstance(value, dict):
        return {k: _normalize(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_normalize(v) for v in value]
    return value


def _wrap_value(table, column, value):
    value = _normalize(value)
    if _is_jsonb(table, column):
        return _jsonb(value)
    return value


# ── row <-> doc conversion ──────────────────────────────────────────────────

def _row_to_doc(row):
    if row is None:
        return None
    doc = dict(row)
    extra = doc.pop("data", None)
    if isinstance(extra, dict):
        for key, value in extra.items():
            if key not in doc:
                doc[key] = value
    return doc


def _apply_projection(doc, projection):
    if not projection or doc is None:
        return doc
    include_keys = [key for key, val in projection.items() if val]
    exclude_keys = [key for key, val in projection.items() if not val]
    if include_keys:
        keep = set(include_keys)
        if "_id" not in projection:
            keep.add("_id")
        return {key: value for key, value in doc.items() if key in keep}
    if exclude_keys:
        drop = set(exclude_keys)
        return {key: value for key, value in doc.items() if key not in drop}
    return doc


# ── filter (WHERE) translation ──────────────────────────────────────────────

_COMPARISON_OPS = {
    "$gte": ">=",
    "$lte": "<=",
    "$gt": ">",
    "$lt": "<",
}


def _build_condition(table, field, condition, params):
    columns = _table_columns(table)
    if field == "_id":
        col_sql = _quote("_id")
        is_array_col = False
    elif field in columns:
        col_sql = _quote(field)
        is_array_col = columns[field] == "ARRAY"
    else:
        col_sql = "(%s->>%%s)" % _quote("data")
        params.append(field)
        is_array_col = False

    if isinstance(condition, dict) and any(key.startswith("$") for key in condition):
        clauses = []
        for op, value in condition.items():
            if op == "$exists":
                clauses.append("%s IS NOT NULL" % col_sql if value else "%s IS NULL" % col_sql)
            elif op == "$ne":
                if is_array_col:
                    clauses.append("%s IS DISTINCT FROM %%s::text[]" % col_sql)
                    params.append(list(value) if value is not None else None)
                else:
                    clauses.append("%s IS DISTINCT FROM %%s" % col_sql)
                    params.append(str(value) if isinstance(value, ObjectId) else value)
            elif op == "$in":
                values = [str(v) if isinstance(v, ObjectId) else v for v in value]
                if not values:
                    clauses.append("FALSE")
                else:
                    clauses.append("%s = ANY(%%s)" % col_sql)
                    params.append(values)
            elif op in _COMPARISON_OPS:
                clauses.append("%s %s %%s" % (col_sql, _COMPARISON_OPS[op]))
                params.append(value)
            elif op == "$regex":
                clauses.append("%s ~ %%s" % col_sql)
                params.append(value)
            else:
                raise ValueError("Unsupported query operator: %s" % op)
        return " AND ".join(clauses) if clauses else "TRUE"

    value = str(condition) if isinstance(condition, ObjectId) else condition
    if is_array_col and isinstance(value, list):
        params.append(value)
        return "%s = %%s::text[]" % col_sql
    params.append(value)
    return "%s = %%s" % col_sql


def _build_where(table, filter_dict, params):
    filter_dict = filter_dict or {}
    if not filter_dict:
        return "TRUE"

    clauses = []
    for field, condition in filter_dict.items():
        if field == "$or":
            sub = [_build_where(table, sub_filter, params) for sub_filter in condition]
            clauses.append("(" + " OR ".join("(%s)" % s for s in sub) + ")")
        elif field == "$and":
            sub = [_build_where(table, sub_filter, params) for sub_filter in condition]
            clauses.append("(" + " AND ".join("(%s)" % s for s in sub) + ")")
        else:
            clauses.append(_build_condition(table, field, condition, params))
    return " AND ".join(clauses) if clauses else "TRUE"


# ── update ($set/$inc/$unset/$push) translation ─────────────────────────────

def _split_update(table, update):
    """Returns (set_exprs, params) for the SET clause of an UPDATE."""
    columns = _table_columns(table)
    set_exprs = []
    params = []
    extra_set = {}
    extra_unset = []

    for key, value in (update.get("$set") or {}).items():
        if "." in key:
            col, subkey = key.split(".", 1)
            if col in columns and columns[col] == "jsonb":
                set_exprs.append(
                    "%s = jsonb_set(coalesce(%s, '{}'::jsonb), %%s::text[], %%s::jsonb, true)" % (_quote(col), _quote(col))
                )
                params.append("{%s}" % subkey)
                params.append(json.dumps(_normalize(value), default=str))
                continue
        if key in columns:
            set_exprs.append("%s = %%s" % _quote(key))
            params.append(_wrap_value(table, key, value))
        else:
            extra_set[key] = value

    for key, value in (update.get("$inc") or {}).items():
        if key in columns:
            set_exprs.append("%s = coalesce(%s, 0) + %%s" % (_quote(key), _quote(key)))
            params.append(value)
        else:
            extra_set[key] = value

    for key in (update.get("$unset") or {}).keys():
        if "." in key:
            col, subkey = key.split(".", 1)
            if col in columns and columns[col] == "jsonb":
                set_exprs.append("%s = coalesce(%s, '{}'::jsonb) - %%s" % (_quote(col), _quote(col)))
                params.append(subkey)
                continue
        if key in columns:
            set_exprs.append("%s = NULL" % _quote(key))
        else:
            extra_unset.append(key)

    for key, value in (update.get("$push") or {}).items():
        if key in columns:
            set_exprs.append(
                "%s = coalesce(%s, '[]'::jsonb) || jsonb_build_array(%%s::jsonb)" % (_quote(key), _quote(key))
            )
            params.append(json.dumps(_normalize(value), default=str))

    if extra_set or extra_unset:
        if "data" in columns:
            expr = "coalesce(%s, '{}'::jsonb)" % _quote("data")
            params_extra = None
            if extra_set:
                expr = "(%s || %%s::jsonb)" % expr
                params_extra = json.dumps(_normalize(extra_set), default=str)
            if extra_unset:
                expr = "(%s - %%s::text[])" % expr
            set_exprs.append("%s = %s" % (_quote("data"), expr))
            if params_extra is not None:
                params.append(params_extra)
            if extra_unset:
                params.append(extra_unset)

    return set_exprs, params


# ── cursor ──────────────────────────────────────────────────────────────────

DEFAULT_QUERY_CAP = 5000


class Cursor:
    def __init__(self, table, filter_dict, projection=None):
        self._table = table
        self._filter = filter_dict or {}
        self._projection = projection
        self._sort = []
        self._limit = None
        self._results = None

    def sort(self, key_or_list, direction=None):
        if isinstance(key_or_list, str):
            self._sort = [(key_or_list, direction if direction is not None else 1)]
        else:
            self._sort = list(key_or_list)
        return self

    def limit(self, n):
        self._limit = n
        return self

    def _execute(self):
        if self._results is not None:
            return self._results
        params = []
        where_sql = _build_where(self._table, self._filter, params)
        sql = 'SELECT * FROM %s WHERE %s' % (self._table, where_sql)
        if self._sort:
            order_parts = []
            for field, direction in self._sort:
                col_sql = _quote(field) if field in _table_columns(self._table) else "(%s->>'%s')" % (_quote("data"), field)
                order_parts.append("%s %s" % (col_sql, "DESC" if direction == -1 else "ASC"))
            sql += " ORDER BY " + ", ".join(order_parts)
        sql += " LIMIT %d" % (self._limit if self._limit is not None else DEFAULT_QUERY_CAP)
        with _conn() as conn:
            rows = conn.execute(sql, params).fetchall()
        self._results = [_apply_projection(_row_to_doc(row), self._projection) for row in rows]
        return self._results

    def __iter__(self):
        return iter(self._execute())

    def __list__(self):
        return self._execute()


# ── collection ───────────────────────────────────────────────────────────────

class Collection:
    def __init__(self, name):
        self.name = name

    def find_one(self, filter=None, projection=None, sort=None):
        cursor = Cursor(self.name, filter, projection)
        if sort:
            cursor.sort(sort)
        cursor.limit(1)
        results = cursor._execute()
        return results[0] if results else None

    def find(self, filter=None, projection=None):
        return Cursor(self.name, filter, projection)

    def count_documents(self, filter=None):
        params = []
        where_sql = _build_where(self.name, filter, params)
        sql = "SELECT COUNT(*) AS c FROM %s WHERE %s" % (self.name, where_sql)
        with _conn() as conn:
            return conn.execute(sql, params).fetchone()["c"]

    def _insert_row(self, conn, doc):
        columns = _table_columns(self.name)
        doc = dict(doc)
        if "_id" not in doc or doc["_id"] is None:
            doc["_id"] = new_id()
        else:
            doc["_id"] = str(doc["_id"])

        row_values = {}
        extra = {}
        for key, value in doc.items():
            if key in columns:
                row_values[key] = _wrap_value(self.name, key, value)
            else:
                extra[key] = _normalize(value)

        if "data" in columns and extra:
            existing_data = row_values.get("data")
            if hasattr(existing_data, "obj"):
                existing_data = existing_data.obj
            merged = dict(existing_data) if isinstance(existing_data, dict) else {}
            merged.update(extra)
            row_values["data"] = _jsonb(merged)

        cols = list(row_values.keys())
        placeholders = ["%s"] * len(cols)
        sql = "INSERT INTO %s (%s) VALUES (%s)" % (
            self.name,
            ", ".join(_quote(c) for c in cols),
            ", ".join(placeholders),
        )
        conn.execute(sql, [row_values[c] for c in cols])
        return doc["_id"]

    def insert_one(self, doc):
        with _conn() as conn:
            inserted_id = self._insert_row(conn, doc)
        return InsertOneResult(inserted_id)

    def insert_many(self, docs):
        ids = []
        with _conn() as conn:
            for doc in docs:
                ids.append(self._insert_row(conn, doc))
        return InsertManyResult(ids)

    def _upsert_insert_doc(self, filter, update):
        insert_doc = {}
        for key, value in (filter or {}).items():
            if key.startswith("$") or isinstance(value, dict):
                continue
            insert_doc[key] = value
        for key, value in (update.get("$set") or {}).items():
            if "." in key:
                col, subkey = key.split(".", 1)
                insert_doc.setdefault(col, {})
                if isinstance(insert_doc[col], dict):
                    insert_doc[col][subkey] = value
            else:
                insert_doc[key] = value
        for key, value in (update.get("$setOnInsert") or {}).items():
            insert_doc.setdefault(key, value)
        for key, value in (update.get("$inc") or {}).items():
            insert_doc.setdefault(key, value)
        return insert_doc

    def _upsert_on_conflict(self, conflict_cols, filter, update, set_exprs, set_params):
        """Atomic upsert via INSERT ... ON CONFLICT DO UPDATE — avoids the
        check-then-act race of the UPDATE-then-INSERT fallback."""
        insert_doc = self._upsert_insert_doc(filter, update)
        columns = _table_columns(self.name)
        if "_id" not in insert_doc or insert_doc["_id"] is None:
            insert_doc["_id"] = new_id()
        else:
            insert_doc["_id"] = str(insert_doc["_id"])

        row_values = {}
        extra = {}
        for key, value in insert_doc.items():
            if key in columns:
                row_values[key] = _wrap_value(self.name, key, value)
            else:
                extra[key] = _normalize(value)
        if "data" in columns and extra:
            row_values["data"] = _jsonb(extra)

        cols = list(row_values.keys())
        insert_sql = "INSERT INTO %s (%s) VALUES (%s)" % (
            self.name,
            ", ".join(_quote(c) for c in cols),
            ", ".join(["%s"] * len(cols)),
        )
        conflict_target = ", ".join(_quote(c) for c in sorted(conflict_cols))
        sql = "%s ON CONFLICT (%s) DO UPDATE SET %s RETURNING *, (xmax = 0) AS inserted" % (
            insert_sql, conflict_target, ", ".join(set_exprs),
        )
        all_params = [row_values[c] for c in cols] + set_params
        with _conn() as conn:
            row = conn.execute(sql, all_params).fetchone()
        was_insert = row.pop("inserted", False)
        return UpdateResult(
            0 if was_insert else 1,
            0 if was_insert else 1,
            upserted_id=row["_id"] if was_insert else None,
        )

    def _do_update(self, filter, update, upsert=False):
        set_exprs, params = _split_update(self.name, update)
        if not set_exprs:
            return UpdateResult(0, 0)

        if upsert:
            plain_filter_keys = {
                key for key, value in (filter or {}).items()
                if not key.startswith("$") and not isinstance(value, dict)
            }
            conflict_cols = next(
                (u for u in _unique_index_column_sets(self.name) if u.issubset(plain_filter_keys)),
                None,
            )
            if conflict_cols:
                return self._upsert_on_conflict(conflict_cols, filter, update, set_exprs, params)

        where_params = []
        where_sql = _build_where(self.name, filter, where_params)
        sql = "UPDATE %s SET %s WHERE %s" % (self.name, ", ".join(set_exprs), where_sql)
        all_params = params + where_params
        with _conn() as conn:
            cur = conn.execute(sql, all_params)
            matched = cur.rowcount
            if matched == 0 and upsert:
                # No unique key models this upsert's filter shape, so fall back
                # to best-effort UPDATE-then-INSERT (races under true
                # concurrent duplicate submissions; every known call site in
                # this codebase is covered by the atomic path above instead).
                insert_doc = self._upsert_insert_doc(filter, update)
                new_id_val = self._insert_row(conn, insert_doc)
                return UpdateResult(0, 0, upserted_id=new_id_val)
        return UpdateResult(matched, matched)

    def update_one(self, filter, update, upsert=False):
        return self._do_update(filter, update, upsert=upsert)

    def update_many(self, filter, update, upsert=False):
        return self._do_update(filter, update, upsert=upsert)

    def delete_one(self, filter):
        return self.delete_many(filter)

    def delete_many(self, filter):
        params = []
        where_sql = _build_where(self.name, filter, params)
        sql = "DELETE FROM %s WHERE %s" % (self.name, where_sql)
        with _conn() as conn:
            cur = conn.execute(sql, params)
            count = cur.rowcount
        return DeleteResult(count)

    def create_index(self, *args, **kwargs):
        return None

    def find_one_and_update(self, filter, update, upsert=False, return_document=None):
        id_value = filter.get("_id")
        if id_value is None:
            result = self._do_update(filter, update, upsert=upsert)
            if result.matched_count == 0 and not upsert:
                return None
            return self.find_one(filter)

        columns = _table_columns(self.name)
        set_parts = []
        insert_cols = ["_id"]
        insert_params = [str(id_value)]
        update_params = []

        for key, value in (update.get("$inc") or {}).items():
            if key in columns:
                set_parts.append("%s = %s.%s + %%s" % (_quote(key), self.name, _quote(key)))
                update_params.append(value)
                insert_cols.append(key)
                insert_params.append(value)
        for key, value in (update.get("$set") or {}).items():
            if key in columns:
                set_parts.append("%s = %%s" % _quote(key))
                update_params.append(_wrap_value(self.name, key, value))
                insert_cols.append(key)
                insert_params.append(_wrap_value(self.name, key, value))

        sql = "INSERT INTO %s (%s) VALUES (%s) ON CONFLICT (%s) DO UPDATE SET %s RETURNING *" % (
            self.name,
            ", ".join(_quote(c) for c in insert_cols),
            ", ".join(["%s"] * len(insert_cols)),
            _quote("_id"),
            ", ".join(set_parts) if set_parts else '"_id" = EXCLUDED."_id"',
        )
        with _conn() as conn:
            row = conn.execute(sql, insert_params + update_params).fetchone()
        return _row_to_doc(row)

    # ── aggregate ($match + $group) ──────────────────────────────────────────
    # $sum-only groupings (the common case: totals/counts by patient, date,
    # etc.) are pushed down to a real SQL GROUP BY so they don't have to
    # fetch every matching row. $push groupings (collecting whole sub-docs
    # per group, e.g. "items per patient today") still fetch matching rows
    # and group them in Python, since that shape has no SQL equivalent here.

    def aggregate(self, pipeline):
        combined_filter = {}
        group_stage = None
        for stage in pipeline:
            if "$match" in stage:
                combined_filter.update(stage["$match"])
            elif "$group" in stage:
                group_stage = stage["$group"]

        if group_stage is None:
            return list(self.find(combined_filter))

        accumulators = {k: v for k, v in group_stage.items() if k != "_id"}
        if not any("$push" in spec for spec in accumulators.values()):
            sql_result = self._aggregate_sql(combined_filter, group_stage, accumulators)
            if sql_result is not None:
                return sql_result

        return self._aggregate_python(list(self.find(combined_filter)), group_stage, accumulators)

    def _aggregate_sql(self, combined_filter, group_stage, accumulators):
        """Returns the grouped/summed rows via a real SQL query, or None if
        the group/accumulator shape isn't one this can translate (caller
        falls back to Python-side grouping in that case)."""
        columns = _table_columns(self.name)
        group_id_spec = group_stage.get("_id")

        if group_id_spec is None:
            group_col_sql = None
        elif isinstance(group_id_spec, str) and group_id_spec.startswith("$"):
            field = group_id_spec[1:]
            group_col_sql = _quote(field) if field in columns else "(%s->>'%s')" % (_quote("data"), field)
        elif isinstance(group_id_spec, dict) and "$dateToString" in group_id_spec:
            spec = group_id_spec["$dateToString"]
            field = spec.get("date")
            field_name = field[1:] if isinstance(field, str) and field.startswith("$") else field
            if spec.get("format", "%Y-%m-%d") != "%Y-%m-%d" or field_name not in columns:
                return None
            group_col_sql = "to_char(%s, 'YYYY-MM-DD')" % _quote(field_name)
        else:
            return None

        select_parts = ["%s AS _id" % (group_col_sql if group_col_sql else "NULL")]
        for name, spec in accumulators.items():
            if "$sum" not in spec:
                return None
            operand = spec["$sum"]
            if operand == 1:
                select_parts.append("COUNT(*) AS %s" % _quote(name))
                continue
            field_name = operand[1:] if isinstance(operand, str) and operand.startswith("$") else None
            if not field_name or field_name not in columns:
                return None
            select_parts.append("COALESCE(SUM(%s), 0) AS %s" % (_quote(field_name), _quote(name)))

        params = []
        where_sql = _build_where(self.name, combined_filter, params)
        sql = "SELECT %s FROM %s WHERE %s" % (", ".join(select_parts), self.name, where_sql)
        if group_col_sql:
            sql += " GROUP BY %s" % group_col_sql
        with _conn() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [dict(row) for row in rows]

    def _aggregate_python(self, docs, group_stage, accumulators):
        group_id_spec = group_stage.get("_id")

        def group_key(doc):
            if group_id_spec is None:
                return None
            if isinstance(group_id_spec, str) and group_id_spec.startswith("$"):
                return doc.get(group_id_spec[1:])
            if isinstance(group_id_spec, dict) and "$dateToString" in group_id_spec:
                spec = group_id_spec["$dateToString"]
                field = spec["date"]
                field_name = field[1:] if isinstance(field, str) and field.startswith("$") else field
                value = doc.get(field_name)
                if value is None:
                    return None
                if isinstance(value, str):
                    try:
                        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
                    except ValueError:
                        return value
                fmt = spec.get("format", "%Y-%m-%d")
                return value.strftime(fmt)
            return group_id_spec

        def resolve_field(doc, spec):
            if isinstance(spec, str) and spec.startswith("$"):
                return doc.get(spec[1:])
            return spec

        groups = {}
        order = []
        for doc in docs:
            key = group_key(doc)
            if key not in groups:
                groups[key] = {name: (0 if "$sum" in spec else []) for name, spec in accumulators.items()}
                order.append(key)
            bucket = groups[key]
            for name, spec in accumulators.items():
                if "$sum" in spec:
                    operand = spec["$sum"]
                    if operand == 1:
                        bucket[name] += 1
                    else:
                        field_name = operand[1:] if isinstance(operand, str) and operand.startswith("$") else operand
                        raw = doc.get(field_name, 0) if isinstance(field_name, str) else operand
                        try:
                            bucket[name] += raw or 0
                        except TypeError:
                            pass
                elif "$push" in spec:
                    push_spec = spec["$push"]
                    if isinstance(push_spec, dict):
                        bucket[name].append({k: resolve_field(doc, v) for k, v in push_spec.items()})
                    else:
                        bucket[name].append(resolve_field(doc, push_spec))

        return [dict(_id=key, **groups[key]) for key in order]


class Database:
    def __init__(self):
        self._collections = {}

    def __getattr__(self, name):
        return self[name]

    def __getitem__(self, name):
        if name not in self._collections:
            self._collections[name] = Collection(name)
        return self._collections[name]


class _Admin:
    def command(self, name):
        if name == "ping":
            ping()
            return {"ok": 1}
        raise NotImplementedError(name)


class _Client:
    def __init__(self):
        self.admin = _Admin()


class Mongo:
    """Drop-in-ish replacement for a flask_pymongo.PyMongo instance."""

    def __init__(self):
        init_pool()
        self.db = Database()
        self.cx = _Client()
