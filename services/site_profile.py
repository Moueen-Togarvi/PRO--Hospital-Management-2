from copy import deepcopy
from datetime import datetime


PROFILE_KEY = "site_profile"

DEFAULT_SITE_PROFILE = {
    "name": "Pakistan Recovery Oasis",
    "system_name": "PRO System",
    "header_label": "PRO HMS",
    "short_name": "PRO",
    "phase_label": "Phase 1",
    "tagline": "Addiction Treatment & Psychological Services",
    "owner_name": "Imran Khan",
    "phone": "+966-557385262",
    "email": "hashim@codedclouds.org",
    "address": "Lahore, Pakistan",
    "website_url": "https://pakistanrecoveryoasis.com",
    "logo_url": "https://pakistanrecoveryoasis.com/Images/logo.png",
}

PROFILE_FIELDS = tuple(DEFAULT_SITE_PROFILE.keys())

FIELD_LIMITS = {
    "name": 120,
    "system_name": 80,
    "header_label": 40,
    "short_name": 24,
    "phase_label": 32,
    "tagline": 160,
    "owner_name": 100,
    "phone": 40,
    "email": 120,
    "address": 180,
    "website_url": 200,
}


def _clean_value(key, value):
    value = "" if value is None else str(value).strip()
    limit = FIELD_LIMITS.get(key)
    if limit:
        value = value[:limit]
    return value


def normalize_site_profile(profile=None):
    normalized = deepcopy(DEFAULT_SITE_PROFILE)
    if isinstance(profile, dict):
        source = profile.get("profile") if isinstance(profile.get("profile"), dict) else profile
        for key in PROFILE_FIELDS:
            if key in source:
                cleaned = _clean_value(key, source.get(key))
                normalized[key] = cleaned or DEFAULT_SITE_PROFILE[key]
    return normalized


def get_site_profile(mongo=None):
    if mongo is None or getattr(mongo, "db", None) is None:
        return normalize_site_profile()

    try:
        doc = mongo.db.app_settings.find_one({"key": PROFILE_KEY})
        return normalize_site_profile(doc)
    except Exception:
        return normalize_site_profile()


def save_site_profile(mongo, data, user_id=None):
    if mongo is None or getattr(mongo, "db", None) is None:
        raise RuntimeError("Database is not available")

    current = get_site_profile(mongo)
    next_profile = deepcopy(current)

    for key in PROFILE_FIELDS:
        if key in data:
            cleaned = _clean_value(key, data.get(key))
            next_profile[key] = cleaned or DEFAULT_SITE_PROFILE[key]

    mongo.db.app_settings.update_one(
        {"key": PROFILE_KEY},
        {
            "$set": {
                "key": PROFILE_KEY,
                "profile": next_profile,
                "updated_at": datetime.utcnow(),
                "updated_by": user_id,
            },
            "$setOnInsert": {"created_at": datetime.utcnow()},
        },
        upsert=True,
    )
    return next_profile
