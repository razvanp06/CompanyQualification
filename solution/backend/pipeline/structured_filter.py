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


def apply_structured_filter(df: pd.DataFrame, intent: dict) -> pd.DataFrame:
    """
    Apply all hard-constraint filters from the intent dict.
    Returns a (possibly smaller) DataFrame.
    """
    mask = pd.Series([True] * len(df), index=df.index)

    # --- Country filter ---
    countries = intent.get("countries")
    if countries:
        codes = {c.lower() for c in countries}
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

    filtered = df[mask].copy()
    return filtered
