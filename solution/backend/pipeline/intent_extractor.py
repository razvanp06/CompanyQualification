"""
Filter 0 — Local Intent Extraction (no API call, instant)

Replaces the LLM-based extractor with regex + keyword matching.
Extracts the same schema fields, works in Romanian and English.
"""

import re
from typing import Optional


# Obsolete / non-existent countries → helpful message
_OBSOLETE_COUNTRIES = {
    "yugoslavia":       "Yugoslavia dissolved in 1991. Its successor states are Slovenia, Croatia, Bosnia & Herzegovina, Serbia, Montenegro, and North Macedonia.",
    "ussr":             "The USSR dissolved in 1991. Try searching by a specific country: Russia, Ukraine, Belarus, Georgia, etc.",
    "soviet union":     "The Soviet Union dissolved in 1991. Try searching by a specific country: Russia, Ukraine, Belarus, etc.",
    "czechoslovakia":   "Czechoslovakia split in 1993 into two countries: Czechia (Czech Republic) and Slovakia.",
    "east germany":     "East Germany reunified with West Germany in 1990. Try searching for 'Germany'.",
    "west germany":     "West Germany reunified with East Germany in 1990. Try searching for 'Germany'.",
    "burma":            "Burma is now officially called Myanmar.",
    "rhodesia":         "Rhodesia is now Zimbabwe.",
    "zaire":            "Zaire is now the Democratic Republic of the Congo.",
    "siam":             "Siam is now Thailand.",
    "persia":           "Persia is now Iran.",
    "ceylon":           "Ceylon is now Sri Lanka.",
    "south vietnam":    "South Vietnam no longer exists as a separate country. Try searching for 'Vietnam'.",
    "north vietnam":    "North Vietnam no longer exists as a separate country. Try searching for 'Vietnam'.",
    "prussia":          "Prussia no longer exists. Its territory is largely in modern Germany and Poland.",
    "ottoman empire":   "The Ottoman Empire dissolved in 1922. Its territory spans modern Turkey, and parts of the Middle East and Balkans.",
}

# Country name → ISO-2 (Romanian + English)
_COUNTRY_MAP = {
    # English
    "germany": "de", "german": "de",
    "france": "fr", "french": "fr",
    "romania": "ro", "romanian": "ro",
    "switzerland": "ch", "swiss": "ch",
    "united states": "us", "usa": "us", "america": "us", "american": "us",
    "sweden": "se", "swedish": "se",
    "norway": "no", "norwegian": "no",
    "denmark": "dk", "danish": "dk",
    "finland": "fi", "finnish": "fi",
    "uk": "gb", "united kingdom": "gb", "britain": "gb", "british": "gb", "england": "gb",
    "netherlands": "nl", "dutch": "nl", "holland": "nl",
    "belgium": "be", "belgian": "be",
    "italy": "it", "italian": "it",
    "spain": "es", "spanish": "es",
    "portugal": "pt", "portuguese": "pt",
    "poland": "pl", "polish": "pl",
    "austria": "at", "austrian": "at",
    "ireland": "ie", "irish": "ie",
    "canada": "ca", "canadian": "ca",
    "australia": "au", "australian": "au",
    "japan": "jp", "japanese": "jp",
    "china": "cn", "chinese": "cn",
    "india": "in", "indian": "in",
    "czechia": "cz", "czech": "cz",
    "hungary": "hu", "hungarian": "hu",
    "slovakia": "sk", "slovak": "sk",
    "bulgaria": "bg", "bulgarian": "bg",
    "croatia": "hr", "croatian": "hr",
    "greece": "gr", "greek": "gr",
    # Romanian
    "germania": "de",
    "franta": "fr", "franța": "fr", "franţa": "fr",
    "românia": "ro", "romaniei": "ro",
    "elvetia": "ch", "elveția": "ch", "elveţia": "ch",
    "sua": "us", "statele unite": "us",
    "suedia": "se",
    "norvegia": "no",
    "danemarca": "dk",
    "finlanda": "fi",
    "marea britanie": "gb", "anglia": "gb",
    "olanda": "nl", "tarile de jos": "nl", "țările de jos": "nl",
    "belgia": "be",
    "italia": "it",
    "spania": "es",
    "portugalia": "pt",
    "polonia": "pl",
    "irlanda": "ie",
    "japonia": "jp",
    "australia": "au",
    "cehia": "cz",
    "ungaria": "hu",
    "slovacia": "sk",
    "bulgaria": "bg",
    "croatia": "hr", "croația": "hr",
    "grecia": "gr",
}

# Multi-word country names must be checked before single-word ones
_MULTI_WORD_COUNTRIES = {k: v for k, v in _COUNTRY_MAP.items() if " " in k}
_SINGLE_WORD_COUNTRIES = {k: v for k, v in _COUNTRY_MAP.items() if " " not in k}

# City name (lowercase / diacritic variants) → normalized form as stored in DB
_CITY_MAP = {
    # Romania
    "bucharest": "Bucharest", "bucurești": "Bucharest", "bucuresti": "Bucharest",
    "constanta": "Constanța", "constanța": "Constanța",
    "oradea": "Oradea",
    "medias": "Mediaș", "mediaș": "Mediaș",
    "voluntari": "Voluntari",
    "dragomiresti": "Dragomirești-Vale", "dragomirești": "Dragomirești-Vale",
    "cluj": "Cluj-Napoca", "cluj-napoca": "Cluj-Napoca",
    "timisoara": "Timișoara", "timișoara": "Timișoara",
    "iasi": "Iași", "iași": "Iași",
    "brasov": "Brașov", "brașov": "Brașov",
    "galati": "Galați", "galați": "Galați",
    "ploiesti": "Ploiești", "ploiești": "Ploiești",
    "sibiu": "Sibiu",
    "craiova": "Craiova",
    # Key international cities present in dataset
    "london": "London",
    "paris": "Paris",
    "san francisco": "San Francisco",
    "oslo": "Oslo",
    "aarhus": "Aarhus",
    "basel": "Basel",
    "barcelona": "Barcelona",
    "toronto": "Toronto",
    "new york": "New York",
    "zurich": "Zurich", "zürich": "Zurich",
    "amsterdam": "Amsterdam",
    "madrid": "Madrid",
    "berlin": "Berlin",
    "munich": "Munich",
    "frankfurt": "Frankfurt",
    "stockholm": "Stockholm",
    "helsinki": "Helsinki",
    "copenhagen": "Copenhagen",
    "vienna": "Vienna",
    "warsaw": "Warsaw",
    "brussels": "Brussels",
    "singapore": "Singapore",
    "dubai": "Dubai",
    "tokyo": "Tokyo",
    "beijing": "Beijing",
    "shanghai": "Shanghai",
    "sydney": "Sydney",
    "melbourne": "Melbourne",
}

# Region expansions
_REGIONS = {
    "scandinavia": ["se", "no", "dk"],
    "scandinavian": ["se", "no", "dk"],
    "nordic": ["se", "no", "dk", "fi"],
    "eastern europe": ["ro", "pl", "cz", "sk", "hu", "bg", "hr", "si", "rs", "md", "ua", "lt", "lv", "ee"],
    "eastern european": ["ro", "pl", "cz", "sk", "hu", "bg", "hr", "si", "rs", "md", "ua", "lt", "lv", "ee"],
    "central europe": ["pl", "cz", "sk", "hu", "at", "de", "ch"],
    "central european": ["pl", "cz", "sk", "hu", "at", "de", "ch"],
    "western europe": ["fr", "de", "nl", "be", "at", "ch", "ie", "pt", "es"],
    "western european": ["fr", "de", "nl", "be", "at", "ch", "ie", "pt", "es"],
    "southern europe": ["es", "pt", "it", "gr", "hr"],
    "southern european": ["es", "pt", "it", "gr", "hr"],
    "baltics": ["lt", "lv", "ee"],
    "baltic": ["lt", "lv", "ee"],
    "europa": None,  # too broad → no country filter
    "europe": None,
}

_BUSINESS_MODEL_KEYWORDS = {
    "b2b": ["b2b", "business to business", "business-to-business", "enterprise"],
    "b2c": ["b2c", "business to consumer", "consumer", "retail"],
    "saas": ["saas", "software as a service", "cloud software", "cloud platform"],
    "marketplace": ["marketplace", "platform", "piata", "piață"],
    "subscription": ["subscription", "abonament", "recurring revenue"],
    "ecommerce": ["ecommerce", "e-commerce", "online shop", "online store"],
}


def _parse_number(text: str) -> Optional[float]:
    """Parse a number string with optional M/B/K suffix."""
    t = text.strip().replace(",", "").replace("$", "").replace("€", "").replace(" ", "")
    m = re.match(r"([\d.]+)\s*[bB](?:illion)?$", t)
    if m:
        return float(m.group(1)) * 1_000_000_000
    m = re.match(r"([\d.]+)\s*[mM](?:illion)?$", t)
    if m:
        return float(m.group(1)) * 1_000_000
    m = re.match(r"([\d.]+)\s*[kK]$", t)
    if m:
        return float(m.group(1)) * 1_000
    m = re.match(r"([\d.]+)$", t)
    if m:
        return float(m.group(1))
    return None


_NUM = r"[\d,.]+(?:\s*[mMbBkK](?:illion|illion)?)?"


def extract_intent(query: str) -> dict:
    """
    Local regex/keyword intent extraction — no network, runs in <1ms.
    Returns the same schema as the LLM-based extractor.
    """
    q = query.lower()

    # ── result_count ─────────────────────────────────────────────────────────
    result_count = None
    m = re.search(
        r"(?:top|first|give me|show me|find me|vreau|arata-mi|cauta|găsește)\s+(\d+)", q
    )
    if not m:
        m = re.search(r"(\d+)\s+compan(?:y|ies|ii|ia|ie)", q)
    if m:
        result_count = int(m.group(1))

    # ── obsolete / invalid country detection ─────────────────────────────────
    location_warning: str | None = None
    for name, message in _OBSOLETE_COUNTRIES.items():
        if re.search(r"\b" + re.escape(name) + r"\b", q):
            location_warning = message
            break

    # ── countries ────────────────────────────────────────────────────────────
    countries: list[str] = []

    for name, codes in _REGIONS.items():
        if re.search(r"\b" + re.escape(name) + r"\b", q):
            if codes:
                countries.extend(codes)
            else:
                pass  # "europe" → no filter

    for name, code in _MULTI_WORD_COUNTRIES.items():
        if name in q:
            countries.append(code)

    for name, code in _SINGLE_WORD_COUNTRIES.items():
        if re.search(r"\b" + re.escape(name) + r"\b", q):
            countries.append(code)

    countries = list(dict.fromkeys(countries)) or None  # deduplicate; None if empty

    # ── towns (city-level filter) ─────────────────────────────────────────────
    towns: list[str] = []

    # Check multi-word cities first to avoid partial matches
    _multi_word_cities = {k: v for k, v in _CITY_MAP.items() if " " in k}
    _single_word_cities = {k: v for k, v in _CITY_MAP.items() if " " not in k}

    for name, normalized in _multi_word_cities.items():
        if name in q:
            towns.append(normalized)

    for name, normalized in _single_word_cities.items():
        if re.search(r"\b" + re.escape(name) + r"\b", q):
            towns.append(normalized)

    towns = list(dict.fromkeys(towns)) or None  # deduplicate; None if empty

    # ── employees ────────────────────────────────────────────────────────────
    min_employees = None
    max_employees = None

    m = re.search(
        r"(?:more than|over|at least|above|peste|minim|cel puțin|minimum|cel putin)\s+"
        r"(" + _NUM + r")\s*(?:employee|angajat|person|people|staff|salariat)",
        q,
    )
    if m:
        min_employees = int(_parse_number(m.group(1)) or 0)

    m = re.search(
        r"(?:fewer than|less than|under|at most|below|no more than|sub|maxim|cel mult|maximum)\s+"
        r"(" + _NUM + r")\s*(?:employee|angajat|person|people|staff|salariat)",
        q,
    )
    if m:
        max_employees = int(_parse_number(m.group(1)) or 0)

    m = re.search(
        r"between\s+(" + _NUM + r")\s+and\s+(" + _NUM + r")\s*"
        r"(?:employee|angajat|person|people|staff)",
        q,
    )
    if m:
        min_employees = int(_parse_number(m.group(1)) or 0)
        max_employees = int(_parse_number(m.group(2)) or 0)

    # "X to Y employees" / "with X to Y employees" (generated by wizard)
    if min_employees is None and max_employees is None:
        m = re.search(
            r"(\d[\d,]*)\s+to\s+(\d[\d,]*)\s*(?:employee|angajat|person|people|staff)",
            q,
        )
        if m:
            min_employees = int(_parse_number(m.group(1)) or 0)
            max_employees = int(_parse_number(m.group(2)) or 0)

    # ── revenue ──────────────────────────────────────────────────────────────
    min_revenue = None
    max_revenue = None

    _rev_word = r"(?:revenue|sales|turnover|venituri|cifra de afaceri)"
    _above = r"(?:over|more than|above|at least|peste|de peste|minim|minimum|of at least)"
    _below = r"(?:under|fewer than|less than|below|at most|no more than|sub|maxim|maximum)"

    m = re.search(rf"{_rev_word}\s+{_above}\s+\$?({_NUM})", q)
    if not m:
        m = re.search(rf"{_above}\s+\$?({_NUM})\s+{_rev_word}", q)
    if m:
        min_revenue = _parse_number(m.group(1))

    m = re.search(rf"{_rev_word}\s+{_below}\s+\$?({_NUM})", q)
    if not m:
        m = re.search(rf"{_below}\s+\$?({_NUM})\s+{_rev_word}", q)
    if m:
        max_revenue = _parse_number(m.group(1))

    # ── year_founded ─────────────────────────────────────────────────────────
    min_year = None
    max_year = None

    _founded = r"(?:founded|established|started|created|înființate|infiintate|fondate|fondata)"
    _after = r"(?:after|since|from|dupa|după|din)"
    _before = r"(?:before|until|pana|înainte de|inainte de)"
    _year = r"((?:19|20)\d{2})"

    m = re.search(rf"{_founded}\s+{_after}\s+{_year}", q)
    if not m:
        m = re.search(rf"{_after}\s+{_year}", q)
    if m:
        min_year = int(m.group(1))

    m = re.search(rf"{_founded}\s+{_before}\s+{_year}", q)
    if not m:
        m = re.search(rf"{_before}\s+{_year}", q)
    if m:
        max_year = int(m.group(1))

    # ── is_public ────────────────────────────────────────────────────────────
    is_public = None
    if re.search(r"\b(?:public|listed|traded|stock exchange|cotate la bursă|cotate la bursa|bursa)\b", q):
        is_public = True
    elif re.search(r"\b(?:private|unlisted|necotate|privat[aă]?)\b", q):
        is_public = False

    # ── business_models ──────────────────────────────────────────────────────
    business_models = []
    for model, keywords in _BUSINESS_MODEL_KEYWORDS.items():
        if any(kw in q for kw in keywords):
            business_models.append(model)

    # ── criteria (for LLM scoring in Filter 2) ───────────────────────────────
    criteria = []
    if towns:
        criteria.append(f"company is located in the city of: {', '.join(towns)}")
    elif countries:
        criteria.append(f"company is based in or operates in: {', '.join(countries)}")
    if min_employees:
        criteria.append(f"has more than {min_employees} employees")
    if max_employees:
        criteria.append(f"has fewer than {max_employees} employees")
    if min_revenue:
        criteria.append(f"has annual revenue over ${min_revenue:,.0f}")
    if max_revenue:
        criteria.append(f"has annual revenue under ${max_revenue:,.0f}")
    if min_year:
        criteria.append(f"was founded after {min_year}")
    if max_year:
        criteria.append(f"was founded before {max_year}")
    if is_public is True:
        criteria.append("is a publicly listed company")
    elif is_public is False:
        criteria.append("is a private company")
    # Industry-specific criteria — these give the LLM precise language instead of
    # vague "relevant to query", preventing energy/chemical companies being confused
    # with pharmaceutical/logistics etc.
    _INDUSTRY_HINTS = {
        ("pharmaceutical", "pharma", "drug", "medicine", "medicament"):
            ("Pharmaceutical", "primary business is pharmaceutical manufacturing, drug distribution, or medicine retail (NOT generic chemicals or consumer goods)"),
        ("logistics", "transport", "freight", "shipping", "courier", "trucking", "warehousing", "supply chain"):
            ("Logistics", "primary business is freight, trucking, warehousing, courier, rail/road/sea transport, or supply chain (NOT energy/gas/oil distribution)"),
        ("software", "saas", "tech", "technology", "it ", "information technology"):
            ("IT / Software", "primary business is software development, SaaS products, or IT services"),
        ("manufacturing", "production", "factory"):
            ("Manufacturing", "primary business is physical goods manufacturing or production"),
        ("retail", "e-commerce", "ecommerce", "shop", "store"):
            ("Retail / E-commerce", "sells products to consumers online or in physical stores — e-commerce, retail, or omnichannel. Score high if the company has a significant online sales channel even if not exclusively e-commerce"),
        ("finance", "banking", "insurance", "fintech"):
            ("Finance / Fintech", "primary business is financial services, banking, insurance, or fintech"),
        ("energy", "oil", "gas", "renewable", "solar", "wind", "electricity"):
            ("Energy", "primary business is energy production, oil/gas extraction, or renewable energy"),
        ("food", "beverage", "restaurant", "catering"):
            ("Food & Beverage", "primary business is food/beverage manufacturing, distribution, or food service"),
        ("real estate", "property", "construction"):
            ("Real Estate / Construction", "primary business is real estate, property development, or construction"),
    }
    industry_label = None
    industry_hint = None
    for keywords, (label, hint) in _INDUSTRY_HINTS.items():
        if any(kw in q for kw in keywords):
            industry_label = label
            industry_hint = hint
            break
    if industry_hint:
        criteria.append(f"company's {industry_hint}")
    else:
        criteria.append(f"relevant to the query: {query}")

    return {
        "result_count": result_count,
        "countries": countries,
        "towns": towns,
        "min_employees": min_employees,
        "max_employees": max_employees,
        "min_revenue": min_revenue,
        "max_revenue": max_revenue,
        "min_year_founded": min_year,
        "max_year_founded": max_year,
        "is_public": is_public,
        "business_models": business_models or None,
        "industry": industry_label,
        "semantic_query": query,
        "criteria": criteria,
        "original_query": query,
        "location_warning": location_warning,
    }
