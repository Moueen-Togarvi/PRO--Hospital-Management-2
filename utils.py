"""Shared helpers used across route modules, services, and the worker.

Centralizes logic that was previously copy-pasted in several places
(comma-stripped amount parsing, the patient financial-summary calculation),
so a fix here applies everywhere instead of needing to be repeated.
"""
from datetime import datetime


def safe_int_amount(raw_value):
    """Parse a value like '25,000', 25000, or None into an int, defaulting to 0."""
    try:
        return int(float(str(raw_value or '0').replace(',', '').strip() or '0'))
    except (TypeError, ValueError):
        return 0


def calculate_prorated_fee(monthly_fee, days_elapsed):
    """(monthly_fee / 30) * days_elapsed, at least 1 day charged."""
    monthly_fee = safe_int_amount(monthly_fee)
    per_day_rate = monthly_fee / 30.0
    return int(per_day_rate * max(days_elapsed, 1))


def days_elapsed_since(admission_date, reference=None):
    """Days between a patient's admission date (str or datetime) and now."""
    if not admission_date:
        return 0
    try:
        if isinstance(admission_date, str):
            admission_dt = datetime.fromisoformat(admission_date.replace('Z', '+00:00'))
        else:
            admission_dt = admission_date
        admission_dt = admission_dt.replace(tzinfo=None)
        reference_dt = (reference or datetime.now()).replace(tzinfo=None)
        return max(0, (reference_dt - admission_dt).days)
    except Exception:
        return 0


def patient_financial_summary(patient, canteen_total, month_year=None):
    """Prorated fee + canteen + laundry vs. received, for one patient.

    `canteen_total` is passed in since it always comes from a separate
    canteen_sales aggregation the caller already has to run.
    """
    days_elapsed = days_elapsed_since(patient.get('admissionDate'))
    monthly_fee_raw = safe_int_amount(patient.get('monthlyFee'))
    prorated_fee = calculate_prorated_fee(monthly_fee_raw, days_elapsed)
    laundry = safe_int_amount(patient.get('laundryAmount')) if patient.get('laundryStatus') else 0
    received = safe_int_amount(patient.get('receivedAmount'))
    total_charges = prorated_fee + canteen_total + laundry
    balance_due = total_charges - received

    summary = {
        'days_elapsed': days_elapsed,
        'monthly_fee': monthly_fee_raw,
        'prorated_fee': prorated_fee,
        'canteen_total': canteen_total,
        'laundry_amount': laundry,
        'total_charges': total_charges,
        'received_amount': received,
        'balance_due': balance_due,
    }
    if month_year is not None:
        summary['month_year'] = month_year
    return summary
