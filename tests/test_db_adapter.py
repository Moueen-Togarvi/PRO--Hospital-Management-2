"""Unit tests for the pure query/update-translation logic in db.py.

These test the SQL-building functions directly (mocking out the
information_schema column lookup) so they run without a live database —
this is the highest-risk, highest-leverage code to have regression coverage
on, since it's what stands between every route's Mongo-style query and the
real SQL executed against Postgres.
"""
import uuid

import pytest

import db


PATIENTS_COLUMNS = {
    "_id": "text",
    "name": "text",
    "admissionDate": "text",
    "isDischarged": "boolean",
    "patient_ids": "ARRAY",
    "laundryAmount": "integer",
    "data": "jsonb",
}


@pytest.fixture(autouse=True)
def fake_columns(monkeypatch):
    monkeypatch.setattr(db, "_table_columns", lambda table: dict(PATIENTS_COLUMNS))
    db._columns_cache.clear()
    yield
    db._columns_cache.clear()


# ── ObjectId shim ────────────────────────────────────────────────────────────

def test_object_id_generates_valid_uuid():
    oid = db.ObjectId()
    assert db.ObjectId.is_valid(oid)


def test_object_id_accepts_valid_uuid_string():
    raw = str(uuid.uuid4())
    oid = db.ObjectId(raw)
    assert oid == raw


def test_object_id_rejects_invalid_string():
    with pytest.raises(db.InvalidId):
        db.ObjectId("not-a-uuid")


def test_object_id_is_valid_false_for_garbage():
    assert db.ObjectId.is_valid("abc123") is False
    assert db.ObjectId.is_valid(None) is False


# ── _normalize ───────────────────────────────────────────────────────────────

def test_normalize_converts_object_id_to_str():
    oid = db.ObjectId()
    assert db._normalize(oid) == str(oid)
    assert isinstance(db._normalize(oid), str)
    assert not isinstance(db._normalize(oid), db.ObjectId)


def test_normalize_recurses_into_dict_and_list():
    oid = db.ObjectId()
    value = {"a": [oid, {"b": oid}]}
    normalized = db._normalize(value)
    assert normalized == {"a": [str(oid), {"b": str(oid)}]}


# ── _build_where / _build_condition ─────────────────────────────────────────

def test_equality_filter():
    params = []
    where = db._build_where("patients", {"name": "Ali"}, params)
    assert where == '"name" = %s'
    assert params == ["Ali"]


def test_id_filter_uses_id_column():
    params = []
    where = db._build_where("patients", {"_id": "abc"}, params)
    assert where == '"_id" = %s'
    assert params == ["abc"]


def test_object_id_value_normalized_in_equality():
    oid = db.ObjectId()
    params = []
    db._build_where("patients", {"_id": oid}, params)
    assert params == [str(oid)]
    assert isinstance(params[0], str)


def test_exists_true_and_false():
    params = []
    where = db._build_where("patients", {"isDischarged": {"$exists": True}}, params)
    assert where == '"isDischarged" IS NOT NULL'
    assert params == []

    params = []
    where = db._build_where("patients", {"deleted_at": {"$exists": False}}, params)
    assert "IS NULL" in where
    # deleted_at isn't in PATIENTS_COLUMNS, so it falls back to the data column
    assert "data" in where


def test_ne_scalar():
    params = []
    where = db._build_where("patients", {"name": {"$ne": "Ali"}}, params)
    assert where == '"name" IS DISTINCT FROM %s'
    assert params == ["Ali"]


def test_ne_array_column():
    params = []
    where = db._build_where("patients", {"patient_ids": {"$ne": []}}, params)
    assert "text[]" in where
    assert params == [[]]


def test_in_with_values():
    params = []
    where = db._build_where("patients", {"name": {"$in": ["Ali", "Umar"]}}, params)
    assert "= ANY(" in where
    assert params == [["Ali", "Umar"]]


def test_in_with_empty_list_short_circuits_false():
    params = []
    where = db._build_where("patients", {"name": {"$in": []}}, params)
    assert where == "FALSE"


@pytest.mark.parametrize("op,sql_op", [("$gte", ">="), ("$lte", "<="), ("$gt", ">"), ("$lt", "<")])
def test_comparison_operators(op, sql_op):
    params = []
    where = db._build_where("patients", {"laundryAmount": {op: 100}}, params)
    assert sql_op in where
    assert params == [100]


def test_regex_operator():
    params = []
    where = db._build_where("patients", {"admissionDate": {"$regex": "^2026-08-"}}, params)
    assert "~" in where
    assert params == ["^2026-08-"]


def test_or_combines_subqueries():
    params = []
    where = db._build_where(
        "patients",
        {"$or": [{"name": "Ali"}, {"name": "Umar"}]},
        params,
    )
    assert " OR " in where
    assert params == ["Ali", "Umar"]


def test_and_combines_subqueries():
    params = []
    where = db._build_where(
        "patients",
        {"$and": [{"name": "Ali"}, {"isDischarged": True}]},
        params,
    )
    assert " AND " in where
    assert params == ["Ali", True]


def test_multiple_top_level_keys_are_anded():
    params = []
    where = db._build_where("patients", {"name": "Ali", "isDischarged": False}, params)
    assert " AND " in where
    assert params == ["Ali", False]


def test_unknown_field_falls_back_to_data_jsonb():
    params = []
    where = db._build_where("patients", {"entry_type": "other"}, params)
    assert 'data' in where
    assert "->>" in where
    # the field name itself becomes a bound parameter, then the value
    assert params == ["entry_type", "other"]


def test_empty_filter_is_true():
    params = []
    assert db._build_where("patients", {}, params) == "TRUE"
    assert params == []


def test_unsupported_operator_raises():
    with pytest.raises(ValueError):
        db._build_where("patients", {"name": {"$unsupported": 1}}, [])


# ── _split_update ────────────────────────────────────────────────────────────

def test_set_on_real_column():
    set_exprs, params = db._split_update("patients", {"$set": {"name": "New Name"}})
    assert set_exprs == ['"name" = %s']
    assert params == ["New Name"]


def test_set_dot_notation_on_jsonb_column(monkeypatch):
    columns_with_schedule = dict(PATIENTS_COLUMNS, schedule="jsonb")
    monkeypatch.setattr(db, "_table_columns", lambda table: columns_with_schedule)
    set_exprs, params = db._split_update("patients", {"$set": {"schedule.morning": "done"}})
    assert "jsonb_set" in set_exprs[0]
    assert params[0] == "{morning}"
    assert params[1] == '"done"'


def test_set_unknown_key_goes_to_data_merge():
    set_exprs, params = db._split_update("patients", {"$set": {"some_extra_field": "value"}})
    assert any('"data"' in expr for expr in set_exprs)
    assert any("value" in str(p) for p in params)


def test_inc_on_real_column():
    set_exprs, params = db._split_update("patients", {"$inc": {"laundryAmount": 500}})
    assert "coalesce" in set_exprs[0]
    assert params == [500]


def test_unset_plain_column_sets_null():
    set_exprs, params = db._split_update("patients", {"$unset": {"name": ""}})
    assert set_exprs == ['"name" = NULL']
    assert params == []


def test_unset_dot_notation_on_jsonb_column(monkeypatch):
    columns_with_days = dict(PATIENTS_COLUMNS, days="jsonb")
    monkeypatch.setattr(db, "_table_columns", lambda table: columns_with_days)
    set_exprs, params = db._split_update("patients", {"$unset": {"days.5": ""}})
    assert "- %s" in set_exprs[0]
    assert params == ["5"]


def test_push_on_jsonb_column(monkeypatch):
    columns_with_payments = dict(PATIENTS_COLUMNS, payments="jsonb")
    monkeypatch.setattr(db, "_table_columns", lambda table: columns_with_payments)
    set_exprs, params = db._split_update("patients", {"$push": {"payments": {"amount": 100}}})
    assert "jsonb_build_array" in set_exprs[0]
    assert '"amount": 100' in params[0]


def test_empty_update_yields_no_set_exprs():
    set_exprs, params = db._split_update("patients", {})
    assert set_exprs == []
    assert params == []


# ── row <-> doc conversion ───────────────────────────────────────────────────

def test_row_to_doc_merges_data_catchall():
    row = {"_id": "1", "name": "Ali", "data": {"extra_field": "value"}}
    doc = db._row_to_doc(row)
    assert doc["_id"] == "1"
    assert doc["name"] == "Ali"
    assert doc["extra_field"] == "value"
    assert "data" not in doc


def test_row_to_doc_real_column_wins_over_data_key_collision():
    row = {"_id": "1", "name": "Ali", "data": {"name": "Stale"}}
    doc = db._row_to_doc(row)
    assert doc["name"] == "Ali"


def test_row_to_doc_none_passthrough():
    assert db._row_to_doc(None) is None


def test_apply_projection_inclusion():
    doc = {"_id": "1", "name": "Ali", "cnic": "12345"}
    result = db._apply_projection(doc, {"name": 1})
    assert result == {"_id": "1", "name": "Ali"}


def test_apply_projection_exclusion():
    doc = {"_id": "1", "name": "Ali", "password": "secret"}
    result = db._apply_projection(doc, {"password": 0})
    assert result == {"_id": "1", "name": "Ali"}


def test_apply_projection_none_is_passthrough():
    doc = {"_id": "1", "name": "Ali"}
    assert db._apply_projection(doc, None) == doc
