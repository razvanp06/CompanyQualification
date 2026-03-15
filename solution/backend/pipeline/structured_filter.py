"""
Filter 1 — Structured Pandas Filter

Applies hard constraints extracted by the intent extractor:
- Country / address
- Employee count range
- Revenue range
- Year founded range
- is_public flag
- Business model keywords

Returns a filtered DataFrame. If no constraints are present, returns all companies.
"""

import ast
import pandas as pd


# Country name aliases -> ISO-2 (supplement what the LLM might miss)
COUNTRY_ALIASES = {
    "germany": "de", "france": "fr", "romania": "ro", "switzerland": "ch",
    "united states": "us", "usa": "us", "sweden": "se", "norway": "no",
    "denmark": "dk", "finland": "fi", "austria": "at", "italy": "it",
    "spain": "es", "poland": "pl", "netherlands": "nl", "belgium": "be",
    "portugal": "pt", "czechia": "cz", "hungary": "hu", "slovakia": "sk",
    "bulgaria": "bg", "croatia": "hr", "ireland": "ie", "greece": "gr",
    "uk": "gb", "united kingdom": "gb",
}


def _parse_address(addr) -> dict:
    """Parse address field which can be a dict, a stringified dict, or a plain string."""
    if isinstance(addr, dict):
        return addr
    if isinstance(addr, str):
        try:
            return ast.literal_eval(addr)
        except Exception:
            return {"raw": addr}
    return {}


def _get_country_code(addr) -> str | None:
    parsed = _parse_address(addr)
    return parsed.get("country_code", None)


def _get_town(addr) -> str | None:
    parsed = _parse_address(addr)
    town = parsed.get("town")
    return town.lower() if town else None


def apply_structured_filter(df: pd.DataFrame, intent: dict) -> pd.DataFrame:
    """
    Apply all hard-constraint filters from the intent dict.
    Returns a (possibly smaller) DataFrame.
    """
    mask = pd.Series([True] * len(df), index=df.index)

    # --- Town (city) filter — takes priority over country filter ---
    towns = intent.get("towns")
    if towns:
        town_set = {t.lower() for t in towns}
        town_series = df["address"].apply(_get_town)
        mask &= town_series.isin(town_set)
    # --- Country filter (only applied when no city is specified) ---
    elif intent.get("countries"):
        codes = {c.lower() for c in intent["countries"]}
        country_series = df["address"].apply(_get_country_code).str.lower()
        mask &= country_series.isin(codes)

    # --- Employee count ---
    min_emp = intent.get("min_employees")
    max_emp = intent.get("max_employees")
    if min_emp is not None:
        mask &= (df["employee_count"].isna()) | (df["employee_count"] >= min_emp)
    if max_emp is not None:
        # Include companies with unknown employee count rather than exclude them
        mask &= (df["employee_count"].isna()) | (df["employee_count"] <= max_emp)

    # --- Revenue ---
    min_rev = intent.get("min_revenue")
    max_rev = intent.get("max_revenue")
    if min_rev is not None:
        mask &= (df["revenue"].isna()) | (df["revenue"] >= min_rev)
    if max_rev is not None:
        mask &= (df["revenue"].isna()) | (df["revenue"] <= max_rev)

    # --- Year founded ---
    min_year = intent.get("min_year_founded")
    max_year = intent.get("max_year_founded")
    if min_year is not None:
        mask &= (df["year_founded"].isna()) | (df["year_founded"] >= min_year)
    if max_year is not None:
        mask &= (df["year_founded"].isna()) | (df["year_founded"] <= max_year)

    # --- is_public ---
    is_public = intent.get("is_public")
    if is_public is not None:
        mask &= df["is_public"] == is_public

    # --- Industry NAICS exclusion filter ---
    # When an industry is detected in the query, exclude companies whose NAICS
    # label clearly belongs to a different sector. Uses a negative filter
    # (exclude known mismatches) rather than a positive allowlist, so companies
    # with missing or unusual NAICS codes are never accidentally removed.
    _INDUSTRY_NAICS_EXCLUDE = {
        "IT / Software": [
            "petroleum", "refin", "gasoline", "crude oil", "natural gas", "oil well",
            "coal", "mining", "agricultural", "crop", "farm", "livestock", "poultry",
            "food manufactur", "beverage", "meat", "dairy", "bakeries",
            "automobile manufactur", "motor vehicle manufactur",
            "construction of build", "heavy and civil",
            "real estate", "railroad", "postal service",
        ],
        "Logistics": [
            "software publish", "pharmaceutical manufactur", "drug manufactur",
            "petroleum refin", "coal mining", "crop production",
        ],
        "Pharmaceutical": [
            "petroleum", "software publish", "food manufactur", "automobile",
            "real estate", "financial", "insurance",
        ],
        "Energy": [
            "software publish", "pharmaceutical", "food manufactur",
            "retail", "insurance", "real estate",
        ],
        "Food & Beverage": [
            "software publish", "petroleum refin", "mining", "financial",
            "insurance", "real estate",
        ],
        "Finance / Fintech": [
            "petroleum", "food manufactur", "mining", "agricultural",
            "automobile manufactur", "construction of build",
        ],
        "Retail / E-commerce": [
            "petroleum refin", "mining", "agricultural", "pharmaceutical manufactur",
        ],
    }

    detected_industry = intent.get("industry")
    excluded_naics_kws = _INDUSTRY_NAICS_EXCLUDE.get(detected_industry, [])
    if excluded_naics_kws:
        def _naics_ok(naics_val) -> bool:
            if not naics_val or not isinstance(naics_val, dict):
                return True  # no NAICS data → keep (don't penalise missing data)
            label = naics_val.get("label", "").lower()
            if not label:
                return True
            return not any(kw in label for kw in excluded_naics_kws)
        mask &= df["primary_naics"].apply(_naics_ok)

    # --- Business model filter ---
    # Maps intent business model keys → substrings to match in the company's business_model list.
    # Uses OR logic: keep the company if ANY of its business_model entries matches ANY keyword.
    # Also keeps companies with no business_model data (null / empty list).
    _BM_KEYWORDS = {
        "ecommerce":    ["e-commerce", "ecommerce", "retail", "direct-to-consumer"],
        "b2b":          ["business-to-business", "b2b", "enterprise"],
        "b2c":          ["business-to-consumer", "b2c", "retail"],
        "saas":         ["software-as-a-service", "saas", "cloud"],
        "marketplace":  ["marketplace", "platform"],
        "subscription": ["subscription"],
    }
    business_models = intent.get("business_models") or []
    if business_models:
        wanted = set()
        for bm_key in business_models:
            wanted.update(_BM_KEYWORDS.get(bm_key, [bm_key]))

        def _has_bm(val) -> bool:
            if not val:
                return True  # no data → don't exclude
            items = val if isinstance(val, list) else [val]
            return any(
                any(kw in str(item).lower() for kw in wanted)
                for item in items
            )

        mask &= df["business_model"].apply(_has_bm)

    filtered = df[mask].copy()
    return filtered
