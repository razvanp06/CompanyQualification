import { useState, useCallback, useMemo, useRef } from "react";

// ─── EMBEDDED DATA ──────────────────────────────────────────────────────────
const COMPANIES = [
  {
    operational_name: "Meridian Logistics GmbH",
    website: "meridian-logistics.de",
    year_founded: 2003,
    address: "Munich, Germany",
    employee_count: 342,
    revenue: 48000000,
    primary_naics: {
      code: "488510",
      label: "Freight Transportation Arrangement",
    },
    secondary_naics: [
      { code: "493110", label: "General Warehousing and Storage" },
    ],
    description:
      "Full-service freight forwarding and supply chain management company offering customs brokerage, warehousing, and transportation solutions across Europe.",
    business_model: ["B2B", "Service Provider"],
    core_offerings: ["freight forwarding", "customs brokerage", "warehousing"],
    target_markets: ["automotive", "manufacturing"],
    is_public: false,
  },
  {
    operational_name: "TransBalkan SRL",
    website: "transbalkan.ro",
    year_founded: 2011,
    address: "Bucharest, Romania",
    employee_count: 180,
    revenue: 12000000,
    primary_naics: {
      code: "484121",
      label: "General Freight Trucking, Long-Distance, Truckload",
    },
    secondary_naics: [
      { code: "493110", label: "General Warehousing and Storage" },
    ],
    description:
      "Romanian freight and logistics company specializing in cross-border trucking and warehousing services across the Balkans and Central Europe.",
    business_model: ["B2B", "Service Provider"],
    core_offerings: [
      "freight trucking",
      "warehousing",
      "cross-border logistics",
    ],
    target_markets: ["retail", "agriculture"],
    is_public: false,
  },
  {
    operational_name: "Cargus Express",
    website: "cargus.ro",
    year_founded: 2001,
    address: "Cluj-Napoca, Romania",
    employee_count: 2200,
    revenue: 95000000,
    primary_naics: {
      code: "492110",
      label: "Couriers and Express Delivery Services",
    },
    secondary_naics: [
      { code: "488510", label: "Freight Transportation Arrangement" },
    ],
    description:
      "Leading Romanian courier and parcel delivery service offering nationwide express shipping, last-mile delivery, and e-commerce fulfillment solutions.",
    business_model: ["B2B", "B2C"],
    core_offerings: [
      "courier services",
      "parcel delivery",
      "e-commerce fulfillment",
    ],
    target_markets: ["e-commerce", "retail"],
    is_public: false,
  },
  {
    operational_name: "SAP SE",
    website: "sap.com",
    year_founded: 1972,
    address: "Walldorf, Germany",
    employee_count: 107000,
    revenue: 31000000000,
    primary_naics: { code: "511210", label: "Software Publishers" },
    secondary_naics: [
      { code: "541512", label: "Computer Systems Design Services" },
    ],
    description:
      "Multinational software corporation providing enterprise resource planning, supply chain management, and business intelligence solutions globally.",
    business_model: ["B2B", "SaaS"],
    core_offerings: [
      "ERP software",
      "cloud computing",
      "business intelligence",
    ],
    target_markets: ["enterprise", "manufacturing", "finance"],
    is_public: true,
  },
  {
    operational_name: "Stripe Inc",
    website: "stripe.com",
    year_founded: 2010,
    address: "San Francisco, United States",
    employee_count: 8000,
    revenue: 14000000000,
    primary_naics: {
      code: "522320",
      label: "Financial Transactions Processing",
    },
    secondary_naics: [{ code: "511210", label: "Software Publishers" }],
    description:
      "Financial infrastructure platform for the internet enabling businesses to accept payments, manage revenue, and accelerate growth through technology.",
    business_model: ["B2B", "SaaS", "Platform"],
    core_offerings: ["payment processing", "billing", "financial APIs"],
    target_markets: ["e-commerce", "SaaS", "marketplace"],
    is_public: false,
  },
  {
    operational_name: "Revolut Ltd",
    website: "revolut.com",
    year_founded: 2015,
    address: "London, United Kingdom",
    employee_count: 6000,
    revenue: 1800000000,
    primary_naics: { code: "522110", label: "Commercial Banking" },
    secondary_naics: [
      { code: "522320", label: "Financial Transactions Processing" },
    ],
    description:
      "Digital banking alternative offering multi-currency accounts, cryptocurrency trading, stock investing, and international money transfers via mobile app.",
    business_model: ["B2C", "B2B", "Fintech"],
    core_offerings: [
      "digital banking",
      "currency exchange",
      "crypto trading",
      "investing",
    ],
    target_markets: ["consumers", "freelancers", "SMBs"],
    is_public: false,
  },
  {
    operational_name: "N26 GmbH",
    website: "n26.com",
    year_founded: 2013,
    address: "Berlin, Germany",
    employee_count: 1500,
    revenue: 300000000,
    primary_naics: { code: "522110", label: "Commercial Banking" },
    secondary_naics: [
      { code: "522320", label: "Financial Transactions Processing" },
    ],
    description:
      "European mobile bank offering fee-free current accounts, savings, investments, and insurance products entirely through a smartphone application.",
    business_model: ["B2C", "Fintech"],
    core_offerings: ["mobile banking", "savings", "insurance", "investing"],
    target_markets: ["consumers", "millennials"],
    is_public: false,
  },
  {
    operational_name: "Klarna AB",
    website: "klarna.com",
    year_founded: 2005,
    address: "Stockholm, Sweden",
    employee_count: 5000,
    revenue: 1900000000,
    primary_naics: {
      code: "522298",
      label: "All Other Nondepository Credit Intermediation",
    },
    secondary_naics: [
      { code: "522320", label: "Financial Transactions Processing" },
    ],
    description:
      "Swedish fintech providing buy-now-pay-later solutions, online payment processing, and direct-to-consumer shopping services globally.",
    business_model: ["B2B", "B2C", "Fintech"],
    core_offerings: ["buy now pay later", "payment solutions", "shopping app"],
    target_markets: ["e-commerce", "retail", "consumers"],
    is_public: false,
  },
  {
    operational_name: "Danone SA",
    website: "danone.com",
    year_founded: 1919,
    address: "Paris, France",
    employee_count: 96000,
    revenue: 27600000000,
    primary_naics: { code: "311511", label: "Fluid Milk Manufacturing" },
    secondary_naics: [{ code: "311421", label: "Fruit and Vegetable Canning" }],
    description:
      "Multinational food company producing dairy products, plant-based alternatives, bottled water, and specialized nutrition products sold worldwide.",
    business_model: ["B2C", "B2B"],
    core_offerings: [
      "dairy products",
      "bottled water",
      "plant-based foods",
      "specialized nutrition",
    ],
    target_markets: ["consumers", "healthcare", "retail"],
    is_public: true,
  },
  {
    operational_name: "Pernod Ricard",
    website: "pernod-ricard.com",
    year_founded: 1975,
    address: "Paris, France",
    employee_count: 18500,
    revenue: 12100000000,
    primary_naics: { code: "312140", label: "Distilleries" },
    secondary_naics: [{ code: "312130", label: "Wineries" }],
    description:
      "French spirits and wine company owning a premium portfolio of international brands including Absolut, Jameson, Ricard, and Chivas Regal.",
    business_model: ["B2B", "B2C"],
    core_offerings: ["spirits", "wine", "premium beverages"],
    target_markets: ["hospitality", "retail", "consumers"],
    is_public: true,
  },
  {
    operational_name: "Lactalis Group",
    website: "lactalis.fr",
    year_founded: 1933,
    address: "Laval, France",
    employee_count: 85000,
    revenue: 28000000000,
    primary_naics: { code: "311513", label: "Cheese Manufacturing" },
    secondary_naics: [{ code: "311511", label: "Fluid Milk Manufacturing" }],
    description:
      "World's largest dairy group producing cheese, milk, yogurt, and butter under brands including Président, Galbani, and Parmalat.",
    business_model: ["B2B", "B2C"],
    core_offerings: ["cheese", "milk", "yogurt", "butter"],
    target_markets: ["retail", "food service"],
    is_public: false,
  },
  {
    operational_name: "Amcor plc",
    website: "amcor.com",
    year_founded: 1860,
    address: "Zurich, Switzerland",
    employee_count: 42500,
    revenue: 14700000000,
    primary_naics: {
      code: "322211",
      label: "Corrugated and Solid Fiber Box Manufacturing",
    },
    secondary_naics: [
      {
        code: "326112",
        label: "Plastics Packaging Film and Sheet Manufacturing",
      },
    ],
    description:
      "Global packaging company developing and producing flexible and rigid packaging solutions for food, beverage, pharmaceutical, medical, home, and personal care industries.",
    business_model: ["B2B"],
    core_offerings: [
      "flexible packaging",
      "rigid packaging",
      "specialty cartons",
    ],
    target_markets: ["food", "beverage", "healthcare", "personal care"],
    is_public: true,
  },
  {
    operational_name: "Berlin Packaging",
    website: "berlinpackaging.com",
    year_founded: 1898,
    address: "Chicago, United States",
    employee_count: 3000,
    revenue: 3000000000,
    primary_naics: { code: "326160", label: "Plastics Bottle Manufacturing" },
    secondary_naics: [
      { code: "327213", label: "Glass Container Manufacturing" },
    ],
    description:
      "Hybrid packaging supplier offering glass, plastic, and metal containers along with closures and design services for beauty, food, beverage, and pharmaceutical industries.",
    business_model: ["B2B"],
    core_offerings: ["bottles", "jars", "closures", "packaging design"],
    target_markets: ["beauty", "food", "beverage", "pharmaceutical"],
    is_public: false,
  },
  {
    operational_name: "Sealed Air Corporation",
    website: "sealedair.com",
    year_founded: 1960,
    address: "Charlotte, United States",
    employee_count: 16500,
    revenue: 5500000000,
    primary_naics: {
      code: "326112",
      label: "Plastics Packaging Film and Sheet Manufacturing",
    },
    secondary_naics: [
      { code: "322211", label: "Corrugated and Solid Fiber Box Manufacturing" },
    ],
    description:
      "Packaging solutions company known for Bubble Wrap and Cryovac brands, providing food safety and product protection solutions globally.",
    business_model: ["B2B"],
    core_offerings: [
      "protective packaging",
      "food packaging",
      "automation solutions",
    ],
    target_markets: ["food", "e-commerce", "industrial"],
    is_public: true,
  },
  {
    operational_name: "Turner Construction",
    website: "turnerconstruction.com",
    year_founded: 1902,
    address: "New York, United States",
    employee_count: 10000,
    revenue: 16000000000,
    primary_naics: {
      code: "236220",
      label: "Commercial and Institutional Building Construction",
    },
    secondary_naics: [
      { code: "237310", label: "Highway, Street, and Bridge Construction" },
    ],
    description:
      "Leading American construction company providing general contracting, construction management, and project development services for commercial, institutional, and infrastructure projects.",
    business_model: ["B2B", "B2G"],
    core_offerings: [
      "general contracting",
      "construction management",
      "project development",
    ],
    target_markets: [
      "commercial real estate",
      "healthcare",
      "education",
      "government",
    ],
    is_public: false,
  },
  {
    operational_name: "Bechtel Corporation",
    website: "bechtel.com",
    year_founded: 1898,
    address: "Reston, United States",
    employee_count: 55000,
    revenue: 21800000000,
    primary_naics: {
      code: "237120",
      label: "Oil and Gas Pipeline and Related Structures Construction",
    },
    secondary_naics: [
      { code: "236210", label: "Industrial Building Construction" },
    ],
    description:
      "One of the largest construction and civil engineering companies in the world, building infrastructure for energy, transportation, telecommunications, and government sectors.",
    business_model: ["B2B", "B2G"],
    core_offerings: ["engineering", "construction", "project management"],
    target_markets: ["energy", "infrastructure", "defense", "mining"],
    is_public: false,
  },
  {
    operational_name: "Kiewit Corporation",
    website: "kiewit.com",
    year_founded: 1884,
    address: "Omaha, United States",
    employee_count: 29000,
    revenue: 14300000000,
    primary_naics: {
      code: "237310",
      label: "Highway, Street, and Bridge Construction",
    },
    secondary_naics: [
      { code: "236210", label: "Industrial Building Construction" },
    ],
    description:
      "American construction and engineering company specializing in transportation, water, power, oil and gas, and building projects across North America.",
    business_model: ["B2B", "B2G"],
    core_offerings: [
      "heavy civil construction",
      "transportation infrastructure",
      "power construction",
    ],
    target_markets: ["transportation", "water", "energy"],
    is_public: false,
  },
  {
    operational_name: "Novartis AG",
    website: "novartis.com",
    year_founded: 1996,
    address: "Basel, Switzerland",
    employee_count: 76000,
    revenue: 51600000000,
    primary_naics: {
      code: "325412",
      label: "Pharmaceutical Preparation Manufacturing",
    },
    secondary_naics: [
      { code: "325414", label: "Biological Product Manufacturing" },
    ],
    description:
      "Swiss multinational pharmaceutical corporation researching, developing, and manufacturing a wide range of healthcare products including innovative medicines and generic drugs.",
    business_model: ["B2B", "B2C"],
    core_offerings: ["pharmaceuticals", "gene therapies", "biosimilars"],
    target_markets: ["healthcare", "hospitals", "pharmacies"],
    is_public: true,
  },
  {
    operational_name: "Roche Holding AG",
    website: "roche.com",
    year_founded: 1896,
    address: "Basel, Switzerland",
    employee_count: 100000,
    revenue: 63300000000,
    primary_naics: {
      code: "325412",
      label: "Pharmaceutical Preparation Manufacturing",
    },
    secondary_naics: [
      { code: "325413", label: "In-Vitro Diagnostic Substance Manufacturing" },
    ],
    description:
      "Swiss healthcare company operating in pharmaceuticals and diagnostics, focused on oncology, immunology, infectious diseases, and personalized healthcare.",
    business_model: ["B2B", "B2C"],
    core_offerings: [
      "pharmaceuticals",
      "diagnostics",
      "personalized healthcare",
    ],
    target_markets: ["healthcare", "hospitals", "laboratories"],
    is_public: true,
  },
  {
    operational_name: "Lonza Group",
    website: "lonza.com",
    year_founded: 1897,
    address: "Basel, Switzerland",
    employee_count: 17000,
    revenue: 6200000000,
    primary_naics: {
      code: "325414",
      label: "Biological Product Manufacturing",
    },
    secondary_naics: [
      {
        code: "325199",
        label: "All Other Basic Organic Chemical Manufacturing",
      },
    ],
    description:
      "Swiss specialty chemicals and biotechnology company providing contract development and manufacturing services for pharmaceutical, biotech, and nutrition markets.",
    business_model: ["B2B", "CDMO"],
    core_offerings: [
      "biologics manufacturing",
      "cell therapy",
      "small molecules",
      "capsules",
    ],
    target_markets: ["pharma", "biotech", "nutrition"],
    is_public: true,
  },
  {
    operational_name: "BambooHR",
    website: "bamboohr.com",
    year_founded: 2008,
    address: "Lindon, United States",
    employee_count: 1200,
    revenue: 250000000,
    primary_naics: { code: "511210", label: "Software Publishers" },
    secondary_naics: [],
    description:
      "Cloud-based human resources software platform for small and medium businesses providing applicant tracking, onboarding, payroll, time tracking, and performance management.",
    business_model: ["B2B", "SaaS"],
    core_offerings: [
      "HR software",
      "payroll",
      "applicant tracking",
      "performance management",
    ],
    target_markets: ["SMBs", "mid-market"],
    is_public: false,
  },
  {
    operational_name: "Personio GmbH",
    website: "personio.de",
    year_founded: 2015,
    address: "Munich, Germany",
    employee_count: 1800,
    revenue: 200000000,
    primary_naics: { code: "511210", label: "Software Publishers" },
    secondary_naics: [],
    description:
      "European HR platform providing all-in-one human resource management software including recruiting, onboarding, payroll, and absence management for SMEs.",
    business_model: ["B2B", "SaaS"],
    core_offerings: [
      "HR management",
      "recruiting",
      "payroll",
      "absence management",
    ],
    target_markets: ["SMEs", "mid-market", "Europe"],
    is_public: false,
  },
  {
    operational_name: "Workday Inc",
    website: "workday.com",
    year_founded: 2005,
    address: "Pleasanton, United States",
    employee_count: 17000,
    revenue: 6200000000,
    primary_naics: { code: "511210", label: "Software Publishers" },
    secondary_naics: [],
    description:
      "Enterprise cloud applications for finance and human resources providing planning, analytics, and people management solutions for large organizations.",
    business_model: ["B2B", "SaaS"],
    core_offerings: ["HCM", "financial management", "planning", "analytics"],
    target_markets: ["enterprise", "large organizations"],
    is_public: true,
  },
  {
    operational_name: "Vestas Wind Systems",
    website: "vestas.com",
    year_founded: 1945,
    address: "Aarhus, Denmark",
    employee_count: 29000,
    revenue: 15400000000,
    primary_naics: {
      code: "333611",
      label: "Turbine and Turbine Generator Set Units Manufacturing",
    },
    secondary_naics: [
      { code: "221115", label: "Wind Electric Power Generation" },
    ],
    description:
      "Danish manufacturer and installer of wind turbines, providing wind energy solutions including design, manufacture, installation, and servicing of turbines worldwide.",
    business_model: ["B2B"],
    core_offerings: [
      "wind turbines",
      "wind energy solutions",
      "turbine maintenance",
    ],
    target_markets: ["utilities", "energy", "government"],
    is_public: true,
  },
  {
    operational_name: "Siemens Gamesa",
    website: "siemensgamesa.com",
    year_founded: 2017,
    address: "Boadilla del Monte, Spain",
    employee_count: 27000,
    revenue: 10200000000,
    primary_naics: {
      code: "333611",
      label: "Turbine and Turbine Generator Set Units Manufacturing",
    },
    secondary_naics: [
      { code: "221115", label: "Wind Electric Power Generation" },
    ],
    description:
      "Wind energy company manufacturing onshore and offshore wind turbines and providing comprehensive wind power plant solutions and services.",
    business_model: ["B2B"],
    core_offerings: [
      "onshore wind turbines",
      "offshore wind turbines",
      "wind farm services",
    ],
    target_markets: ["utilities", "energy developers"],
    is_public: true,
  },
  {
    operational_name: "Northvolt AB",
    website: "northvolt.com",
    year_founded: 2016,
    address: "Stockholm, Sweden",
    employee_count: 5000,
    revenue: 200000000,
    primary_naics: { code: "335911", label: "Storage Battery Manufacturing" },
    secondary_naics: [
      { code: "335912", label: "Primary Battery Manufacturing" },
    ],
    description:
      "Swedish battery manufacturer designing and producing sustainable lithium-ion batteries for electric vehicles, energy storage, and industrial applications.",
    business_model: ["B2B"],
    core_offerings: [
      "lithium-ion batteries",
      "battery recycling",
      "energy storage systems",
    ],
    target_markets: ["automotive", "energy storage", "industrial"],
    is_public: false,
  },
  {
    operational_name: "CATL",
    website: "catl.com",
    year_founded: 2011,
    address: "Ningde, China",
    employee_count: 80000,
    revenue: 45000000000,
    primary_naics: { code: "335911", label: "Storage Battery Manufacturing" },
    secondary_naics: [
      { code: "335912", label: "Primary Battery Manufacturing" },
    ],
    description:
      "World's largest manufacturer of lithium-ion batteries for electric vehicles and energy storage systems, leading in battery technology innovation and recycling.",
    business_model: ["B2B"],
    core_offerings: [
      "EV batteries",
      "energy storage batteries",
      "battery management systems",
    ],
    target_markets: ["automotive", "energy storage"],
    is_public: true,
  },
  {
    operational_name: "Umicore",
    website: "umicore.com",
    year_founded: 1805,
    address: "Brussels, Belgium",
    employee_count: 11000,
    revenue: 4200000000,
    primary_naics: {
      code: "331419",
      label: "Primary Smelting and Refining of Nonferrous Metal",
    },
    secondary_naics: [
      { code: "335911", label: "Storage Battery Manufacturing" },
    ],
    description:
      "Materials technology and recycling group specializing in cathode materials for rechargeable batteries, automotive catalysts, and precious metals recycling.",
    business_model: ["B2B"],
    core_offerings: [
      "cathode materials",
      "automotive catalysts",
      "precious metals recycling",
    ],
    target_markets: ["automotive", "electronics", "energy"],
    is_public: true,
  },
  {
    operational_name: "Albemarle Corporation",
    website: "albemarle.com",
    year_founded: 1887,
    address: "Charlotte, United States",
    employee_count: 6000,
    revenue: 9600000000,
    primary_naics: {
      code: "325180",
      label: "Other Basic Inorganic Chemical Manufacturing",
    },
    secondary_naics: [
      { code: "212393", label: "Other Chemical and Fertilizer Mineral Mining" },
    ],
    description:
      "Global specialty chemicals company and one of the world's largest producers of lithium for electric vehicle batteries, as well as bromine and catalysts.",
    business_model: ["B2B"],
    core_offerings: ["lithium", "bromine", "catalysts"],
    target_markets: ["automotive", "energy storage", "electronics"],
    is_public: true,
  },
  {
    operational_name: "SunPower Solutions",
    website: "sunpowersol.dk",
    year_founded: 2019,
    address: "Copenhagen, Denmark",
    employee_count: 85,
    revenue: 12000000,
    primary_naics: {
      code: "334413",
      label: "Semiconductor and Related Device Manufacturing",
    },
    secondary_naics: [
      { code: "221114", label: "Solar Electric Power Generation" },
    ],
    description:
      "Danish clean energy startup developing next-generation photovoltaic panels and solar energy management systems for residential and commercial installations.",
    business_model: ["B2B", "B2C"],
    core_offerings: ["solar panels", "energy management", "solar installation"],
    target_markets: ["residential", "commercial", "utilities"],
    is_public: false,
  },
  {
    operational_name: "GreenHydrogen AS",
    website: "greenhydrogen.no",
    year_founded: 2020,
    address: "Oslo, Norway",
    employee_count: 45,
    revenue: 3000000,
    primary_naics: { code: "325120", label: "Industrial Gas Manufacturing" },
    secondary_naics: [
      { code: "333249", label: "Other Industrial Machinery Manufacturing" },
    ],
    description:
      "Norwegian startup developing electrolyzers for green hydrogen production, enabling industrial decarbonization through renewable-powered hydrogen generation.",
    business_model: ["B2B"],
    core_offerings: ["electrolyzers", "green hydrogen", "hydrogen storage"],
    target_markets: ["energy", "industrial", "transportation"],
    is_public: false,
  },
  {
    operational_name: "Shopify Inc",
    website: "shopify.com",
    year_founded: 2006,
    address: "Ottawa, Canada",
    employee_count: 10000,
    revenue: 5600000000,
    primary_naics: { code: "511210", label: "Software Publishers" },
    secondary_naics: [
      {
        code: "518210",
        label: "Data Processing, Hosting, and Related Services",
      },
    ],
    description:
      "Commerce platform providing online store, point-of-sale, marketing, shipping, and payment solutions for businesses of all sizes.",
    business_model: ["B2B", "SaaS", "Platform"],
    core_offerings: [
      "e-commerce platform",
      "POS",
      "payment processing",
      "shipping",
    ],
    target_markets: ["SMBs", "enterprise", "retail"],
    is_public: true,
  },
  {
    operational_name: "BigCommerce",
    website: "bigcommerce.com",
    year_founded: 2009,
    address: "Austin, United States",
    employee_count: 1500,
    revenue: 300000000,
    primary_naics: { code: "511210", label: "Software Publishers" },
    secondary_naics: [
      {
        code: "518210",
        label: "Data Processing, Hosting, and Related Services",
      },
    ],
    description:
      "Open SaaS e-commerce platform enabling merchants to create, manage, and scale online stores with built-in features and headless commerce capabilities.",
    business_model: ["B2B", "SaaS"],
    core_offerings: [
      "e-commerce platform",
      "headless commerce",
      "omnichannel selling",
    ],
    target_markets: ["mid-market", "enterprise", "retail"],
    is_public: true,
  },
  {
    operational_name: "Faire Wholesale",
    website: "faire.com",
    year_founded: 2017,
    address: "San Francisco, United States",
    employee_count: 1000,
    revenue: 400000000,
    primary_naics: {
      code: "423990",
      label: "Other Miscellaneous Durable Goods Merchant Wholesalers",
    },
    secondary_naics: [
      { code: "454110", label: "Electronic Shopping and Mail-Order Houses" },
    ],
    description:
      "Online wholesale marketplace connecting independent retailers with brands, offering net-60 payment terms and free returns to simplify wholesale buying.",
    business_model: ["B2B", "Marketplace"],
    core_offerings: [
      "wholesale marketplace",
      "retail buying",
      "brand discovery",
    ],
    target_markets: ["independent retailers", "consumer brands"],
    is_public: false,
  },
  {
    operational_name: "Etsy Inc",
    website: "etsy.com",
    year_founded: 2005,
    address: "Brooklyn, United States",
    employee_count: 2500,
    revenue: 2700000000,
    primary_naics: {
      code: "454110",
      label: "Electronic Shopping and Mail-Order Houses",
    },
    secondary_naics: [],
    description:
      "Global online marketplace for unique, handmade, and vintage items connecting creative entrepreneurs with millions of buyers worldwide.",
    business_model: ["B2C", "Marketplace"],
    core_offerings: ["online marketplace", "handmade goods", "vintage items"],
    target_markets: ["consumers", "artisans", "crafters"],
    is_public: true,
  },
  {
    operational_name: "Henkel AG",
    website: "henkel.com",
    year_founded: 1876,
    address: "Düsseldorf, Germany",
    employee_count: 50000,
    revenue: 22400000000,
    primary_naics: {
      code: "325611",
      label: "Soap and Other Detergent Manufacturing",
    },
    secondary_naics: [{ code: "325520", label: "Adhesive Manufacturing" }],
    description:
      "German multinational chemical and consumer goods company operating in adhesive technologies, beauty care, and laundry and home care.",
    business_model: ["B2B", "B2C"],
    core_offerings: [
      "adhesives",
      "beauty care",
      "laundry products",
      "home care",
    ],
    target_markets: ["industrial", "consumers", "automotive"],
    is_public: true,
  },
  {
    operational_name: "L'Oréal",
    website: "loreal.com",
    year_founded: 1909,
    address: "Clichy, France",
    employee_count: 87000,
    revenue: 41000000000,
    primary_naics: {
      code: "325620",
      label: "Toilet Preparation Manufacturing",
    },
    secondary_naics: [],
    description:
      "World's largest cosmetics and beauty company offering haircare, skincare, makeup, and fragrance products across luxury, consumer, and professional divisions.",
    business_model: ["B2C", "B2B"],
    core_offerings: ["cosmetics", "skincare", "haircare", "fragrance"],
    target_markets: ["consumers", "salons", "luxury retail"],
    is_public: true,
  },
  {
    operational_name: "Nordic Solar Farms",
    website: "nordicsolarfarms.se",
    year_founded: 2021,
    address: "Malmö, Sweden",
    employee_count: 32,
    revenue: 5000000,
    primary_naics: { code: "221114", label: "Solar Electric Power Generation" },
    secondary_naics: [],
    description:
      "Swedish clean energy startup developing and operating utility-scale solar farms across Scandinavia, focused on accelerating the Nordic energy transition.",
    business_model: ["B2B", "B2G"],
    core_offerings: [
      "solar farm development",
      "renewable energy generation",
      "PPA contracts",
    ],
    target_markets: ["utilities", "municipalities", "corporates"],
    is_public: false,
  },
  {
    operational_name: "WattBridge Energy",
    website: "wattbridge.fi",
    year_founded: 2019,
    address: "Helsinki, Finland",
    employee_count: 28,
    revenue: 2000000,
    primary_naics: {
      code: "335999",
      label:
        "All Other Miscellaneous Electrical Equipment and Component Manufacturing",
    },
    secondary_naics: [
      { code: "221118", label: "Other Electric Power Generation" },
    ],
    description:
      "Finnish clean energy startup building smart grid solutions and battery energy storage systems to optimize renewable energy distribution and grid stability.",
    business_model: ["B2B"],
    core_offerings: [
      "battery storage systems",
      "smart grid solutions",
      "energy optimization",
    ],
    target_markets: ["utilities", "energy", "infrastructure"],
    is_public: false,
  },
  {
    operational_name: "DHL Supply Chain",
    website: "dhl.com",
    year_founded: 1969,
    address: "Bonn, Germany",
    employee_count: 380000,
    revenue: 81000000000,
    primary_naics: {
      code: "488510",
      label: "Freight Transportation Arrangement",
    },
    secondary_naics: [
      { code: "492110", label: "Couriers and Express Delivery Services" },
    ],
    description:
      "Global logistics company providing warehousing, distribution, freight transportation, and supply chain management solutions worldwide.",
    business_model: ["B2B", "B2C"],
    core_offerings: [
      "express delivery",
      "freight forwarding",
      "warehousing",
      "supply chain management",
    ],
    target_markets: ["e-commerce", "manufacturing", "healthcare", "automotive"],
    is_public: false,
  },
  {
    operational_name: "FlexPackCo",
    website: "flexpackco.com",
    year_founded: 2005,
    address: "Atlanta, United States",
    employee_count: 450,
    revenue: 85000000,
    primary_naics: {
      code: "326112",
      label: "Plastics Packaging Film and Sheet Manufacturing",
    },
    secondary_naics: [
      {
        code: "322220",
        label: "Paper Bag and Coated and Treated Paper Manufacturing",
      },
    ],
    description:
      "Specialty packaging company producing custom flexible pouches, sachets, and wrapping solutions for cosmetics, personal care, and food industries.",
    business_model: ["B2B"],
    core_offerings: [
      "flexible pouches",
      "sachets",
      "custom packaging",
      "sustainable packaging",
    ],
    target_markets: ["cosmetics", "personal care", "food"],
    is_public: false,
  },
  {
    operational_name: "Skanska AB",
    website: "skanska.com",
    year_founded: 1887,
    address: "Stockholm, Sweden",
    employee_count: 28000,
    revenue: 18000000000,
    primary_naics: {
      code: "236220",
      label: "Commercial and Institutional Building Construction",
    },
    secondary_naics: [
      { code: "237310", label: "Highway, Street, and Bridge Construction" },
    ],
    description:
      "Swedish multinational construction and development company active in building construction, civil engineering, and residential and commercial property development.",
    business_model: ["B2B", "B2G"],
    core_offerings: [
      "building construction",
      "civil engineering",
      "property development",
    ],
    target_markets: ["commercial", "residential", "infrastructure"],
    is_public: true,
  },
  {
    operational_name: "Mondi Group",
    website: "mondi.com",
    year_founded: 1967,
    address: "Vienna, Austria",
    employee_count: 22000,
    revenue: 8900000000,
    primary_naics: { code: "322130", label: "Paperboard Mills" },
    secondary_naics: [
      { code: "322211", label: "Corrugated and Solid Fiber Box Manufacturing" },
    ],
    description:
      "Global packaging and paper group producing sustainable packaging and paper solutions for consumer goods, e-commerce, and industrial applications.",
    business_model: ["B2B"],
    core_offerings: [
      "corrugated packaging",
      "flexible packaging",
      "uncoated fine paper",
    ],
    target_markets: ["consumer goods", "e-commerce", "industrial"],
    is_public: true,
  },
];

// ─── QUERY PARSER ───────────────────────────────────────────────────────────
const COUNTRY_MAP = {
  romania: ["romania", "romanian", "bucharest", "cluj", "timisoara", ".ro"],
  germany: [
    "germany",
    "german",
    "berlin",
    "munich",
    "hamburg",
    "frankfurt",
    ".de",
  ],
  france: ["france", "french", "paris", "lyon", "marseille", ".fr"],
  "united states": [
    "united states",
    "usa",
    "us",
    "american",
    "new york",
    "california",
    "texas",
    "chicago",
    "boston",
    "atlanta",
    "san francisco",
    "charlotte",
    "omaha",
    "reston",
    "pleasanton",
    "lindon",
    "austin",
    "brooklyn",
  ],
  switzerland: ["switzerland", "swiss", "zurich", "basel", "geneva", ".ch"],
  "united kingdom": [
    "uk",
    "united kingdom",
    "british",
    "london",
    "england",
    ".co.uk",
  ],
  sweden: ["sweden", "swedish", "stockholm", "malmö", ".se"],
  denmark: ["denmark", "danish", "aarhus", "copenhagen", ".dk"],
  norway: ["norway", "norwegian", "oslo", ".no"],
  finland: ["finland", "finnish", "helsinki", ".fi"],
  china: ["china", "chinese", "ningde"],
  belgium: ["belgium", "belgian", "brussels", ".be"],
  austria: ["austria", "austrian", "vienna", ".at"],
  spain: ["spain", "spanish", "madrid", "barcelona", ".es"],
  canada: ["canada", "canadian", "ottawa", ".ca"],
};
const REGION_MAP = {
  europe: [
    "germany",
    "france",
    "united kingdom",
    "switzerland",
    "sweden",
    "denmark",
    "norway",
    "finland",
    "belgium",
    "austria",
    "spain",
    "romania",
  ],
  scandinavia: ["sweden", "denmark", "norway", "finland"],
  nordic: ["sweden", "denmark", "norway", "finland"],
};
const INDUSTRY_DEFS = {
  logistics: {
    naics: ["484", "488", "492", "493"],
    terms: [
      "logistics",
      "freight",
      "shipping",
      "trucking",
      "courier",
      "delivery",
      "warehousing",
      "supply chain",
      "transportation",
    ],
  },
  software: {
    naics: ["5112"],
    terms: ["software", "saas", "cloud", "platform", "app", "application"],
  },
  food_beverage: {
    naics: ["311", "312"],
    terms: [
      "food",
      "beverage",
      "dairy",
      "cheese",
      "milk",
      "spirits",
      "wine",
      "beer",
      "distill",
      "manufacturing",
    ],
  },
  packaging: {
    naics: ["3221", "3261", "3272"],
    terms: [
      "packaging",
      "package",
      "container",
      "bottle",
      "pouch",
      "wrap",
      "box",
      "carton",
      "film",
    ],
  },
  construction: {
    naics: ["236", "237"],
    terms: [
      "construction",
      "building",
      "contracting",
      "civil engineering",
      "infrastructure",
    ],
  },
  pharmaceutical: {
    naics: ["3254"],
    terms: [
      "pharmaceutical",
      "pharma",
      "drug",
      "medicine",
      "biotech",
      "biolog",
    ],
  },
  hr_solutions: {
    naics: ["5112"],
    terms: [
      "hr",
      "human resource",
      "recruiting",
      "payroll",
      "onboarding",
      "talent",
      "workforce",
      "people management",
      "hcm",
    ],
  },
  clean_energy: {
    naics: ["2211", "3334", "3359"],
    terms: [
      "clean energy",
      "renewable",
      "solar",
      "wind",
      "hydrogen",
      "green energy",
      "battery storage",
      "smart grid",
    ],
  },
  fintech: {
    naics: ["5223", "5221"],
    terms: [
      "fintech",
      "banking",
      "payment",
      "financial",
      "neobank",
      "digital bank",
      "buy now pay later",
      "money transfer",
    ],
  },
  ecommerce: {
    naics: ["4541", "5112"],
    terms: [
      "e-commerce",
      "ecommerce",
      "online store",
      "marketplace",
      "shopify",
      "online shopping",
    ],
  },
  renewable_equipment: {
    naics: ["3336", "3359", "3354"],
    terms: [
      "turbine",
      "solar panel",
      "wind turbine",
      "electrolyzer",
      "renewable equipment",
      "photovoltaic",
    ],
  },
  ev_battery: {
    naics: ["3359", "3314", "3251"],
    terms: [
      "battery",
      "lithium",
      "cathode",
      "anode",
      "ev battery",
      "electric vehicle",
      "energy storage",
      "battery recycling",
    ],
  },
  cosmetics: {
    naics: ["3256"],
    terms: [
      "cosmetics",
      "beauty",
      "skincare",
      "makeup",
      "personal care",
      "fragrance",
    ],
  },
};

function parseQuery(query) {
  const q = query.toLowerCase();
  let countries = [];
  let regionMatch = null;
  for (const [region, rc] of Object.entries(REGION_MAP)) {
    if (q.includes(region)) {
      countries = rc;
      regionMatch = region;
      break;
    }
  }
  if (!countries.length) {
    for (const [country, pats] of Object.entries(COUNTRY_MAP)) {
      if (pats.some((p) => q.includes(p))) countries.push(country);
    }
  }
  const extractNum = (regex) => {
    const m = q.match(regex);
    return m ? parseInt(m[1].replace(/,/g, "")) : null;
  };
  const employeeMin =
    extractNum(/more than ([\d,]+) employees/i) ||
    extractNum(/over ([\d,]+) employees/i) ||
    extractNum(/(\d[\d,]*)\+ employees/i);
  const employeeMax =
    extractNum(/fewer than ([\d,]+) employees/i) ||
    extractNum(/under ([\d,]+) employees/i) ||
    extractNum(/less than ([\d,]+) employees/i);
  const yearMin = extractNum(/(?:founded|started) after (\d{4})/i);
  let revenueMin = null;
  const rm = q.match(
    /revenue (?:over|above|more than|exceeding) \$?([\d.]+)\s*(million|billion|m|b)?/i,
  );
  if (rm) {
    let v = parseFloat(rm[1]);
    const u = (rm[2] || "").toLowerCase();
    if (u.startsWith("b")) v *= 1e9;
    else if (u.startsWith("m") || u === "million") v *= 1e6;
    else if (v < 1000) v *= 1e6;
    revenueMin = v;
  }
  let isPublic = null;
  if (
    q.includes("public compan") ||
    q.includes("publicly traded") ||
    q.match(/\bpublic\b.*\bcompan/)
  )
    isPublic = true;
  let industries = [];
  for (const [key, ind] of Object.entries(INDUSTRY_DEFS)) {
    const score = ind.terms.reduce((s, t) => s + (q.includes(t) ? 1 : 0), 0);
    if (score > 0) industries.push({ key, score, ...ind });
  }
  industries.sort((a, b) => b.score - a.score);
  industries = industries.slice(0, 3);
  const businessModels = [];
  if (q.includes("b2b")) businessModels.push("B2B");
  if (q.includes("b2c")) businessModels.push("B2C");
  if (q.includes("saas")) businessModels.push("SaaS");
  const isSupplyChain =
    q.includes("supply") ||
    q.includes("supplier") ||
    q.includes("component") ||
    q.includes("critical");
  const isEcosystem =
    q.includes("competing") ||
    q.includes("alternative") ||
    q.includes("similar");
  const isStartup = q.includes("startup") || q.includes("start-up");
  const isFastGrowing =
    q.includes("fast-growing") || q.includes("fast growing");
  let complexity = 1;
  if (industries.length > 1) complexity += 1;
  if (isSupplyChain || isEcosystem) complexity += 2;
  if (employeeMin || employeeMax || revenueMin || yearMin || isPublic !== null)
    complexity -= 0.5;
  complexity = Math.max(1, Math.min(5, Math.round(complexity)));
  return {
    raw: query,
    countries,
    regionMatch,
    industries,
    employeeMin,
    employeeMax,
    revenueMin,
    yearMin,
    isPublic,
    businessModels,
    isSupplyChain,
    isEcosystem,
    isStartup,
    isFastGrowing,
    complexity,
  };
}

// ─── SCORER ─────────────────────────────────────────────────────────────────
function detectCountry(c) {
  const a = (c.address || "").toLowerCase();
  const w = (c.website || "").toLowerCase();
  for (const [country, pats] of Object.entries(COUNTRY_MAP)) {
    if (pats.some((p) => a.includes(p) || w.endsWith(p))) return country;
  }
  return null;
}
function matchNaics(c, prefixes) {
  const codes = [
    c.primary_naics?.code,
    ...(c.secondary_naics || []).map((n) => n.code),
  ].filter(Boolean);
  return prefixes.some((p) => codes.some((cc) => cc.startsWith(p)));
}
function textHits(c, terms) {
  const blob = [
    c.description || "",
    c.operational_name || "",
    (c.core_offerings || []).join(" "),
    (c.target_markets || []).join(" "),
    c.primary_naics?.label || "",
    ...(c.secondary_naics || []).map((n) => n.label || ""),
  ]
    .join(" ")
    .toLowerCase();
  return terms.reduce((s, t) => s + (blob.includes(t) ? 1 : 0), 0);
}

function scoreCompanies(companies, parsed) {
  return companies
    .map((company) => {
      let score = 0,
        maxScore = 0;
      const signals = [];
      if (parsed.countries.length) {
        maxScore += 30;
        const cc = detectCountry(company);
        if (cc && parsed.countries.includes(cc)) {
          score += 30;
          signals.push({ label: "Country match", pts: 30 });
        }
      }
      if (parsed.industries.length) {
        maxScore += 35;
        const top = parsed.industries[0];
        if (matchNaics(company, top.naics)) {
          score += 20;
          signals.push({
            label: `NAICS: ${top.key.replace(/_/g, " ")}`,
            pts: 20,
          });
        }
        const kw = textHits(company, top.terms);
        if (kw > 0) {
          const p = Math.round(15 * Math.min(1, kw / (top.terms.length * 0.3)));
          score += p;
          signals.push({
            label: `Keywords (${kw}/${top.terms.length})`,
            pts: p,
          });
        }
        for (let i = 1; i < parsed.industries.length; i++) {
          const ind = parsed.industries[i];
          if (
            matchNaics(company, ind.naics) ||
            textHits(company, ind.terms) > 1
          ) {
            score += 5;
            signals.push({
              label: `Secondary: ${ind.key.replace(/_/g, " ")}`,
              pts: 5,
            });
          }
        }
      }
      if (parsed.employeeMin !== null) {
        maxScore += 10;
        if (
          company.employee_count &&
          company.employee_count > parsed.employeeMin
        ) {
          score += 10;
          signals.push({
            label: `Employees > ${parsed.employeeMin.toLocaleString()}`,
            pts: 10,
          });
        }
      }
      if (parsed.employeeMax !== null) {
        maxScore += 10;
        if (
          company.employee_count &&
          company.employee_count < parsed.employeeMax
        ) {
          score += 10;
          signals.push({
            label: `Employees < ${parsed.employeeMax.toLocaleString()}`,
            pts: 10,
          });
        } else if (!company.employee_count) {
          score += 3;
          signals.push({ label: "Employees unknown", pts: 3 });
        }
      }
      if (parsed.revenueMin !== null) {
        maxScore += 10;
        if (company.revenue && company.revenue > parsed.revenueMin) {
          score += 10;
          signals.push({
            label: `Revenue > $${(parsed.revenueMin / 1e6).toFixed(0)}M`,
            pts: 10,
          });
        }
      }
      if (parsed.yearMin !== null) {
        maxScore += 10;
        if (company.year_founded && company.year_founded > parsed.yearMin) {
          score += 10;
          signals.push({ label: `Founded after ${parsed.yearMin}`, pts: 10 });
        }
      }
      if (parsed.isPublic !== null) {
        maxScore += 10;
        if (company.is_public === parsed.isPublic) {
          score += 10;
          signals.push({
            label: parsed.isPublic ? "Publicly traded" : "Private",
            pts: 10,
          });
        }
      }
      if (parsed.businessModels.length) {
        maxScore += 10;
        const bm = (company.business_model || []).map((b) => b.toLowerCase());
        const mc = parsed.businessModels.filter((m) =>
          bm.includes(m.toLowerCase()),
        ).length;
        if (mc) {
          const p = Math.round((10 * mc) / parsed.businessModels.length);
          score += p;
          signals.push({ label: "Business model match", pts: p });
        }
      }
      if (parsed.isSupplyChain) {
        maxScore += 15;
        const bm = (company.business_model || []).map((b) => b.toLowerCase());
        if (bm.includes("b2b")) {
          score += 5;
          signals.push({ label: "B2B supplier role", pts: 5 });
        }
        const tgt = (company.target_markets || []).map((t) => t.toLowerCase());
        const related = {
          cosmetics: ["beauty", "cosmetics", "personal care"],
          ev_battery: ["automotive", "energy storage", "electronics"],
        };
        if (
          parsed.industries.some((ind) =>
            (related[ind.key] || []).some((r) => tgt.includes(r)),
          )
        ) {
          score += 10;
          signals.push({ label: "Serves target industry", pts: 10 });
        }
      }
      if (parsed.isStartup) {
        maxScore += 5;
        if (
          company.employee_count &&
          company.employee_count < 500 &&
          company.year_founded &&
          company.year_founded > 2010
        ) {
          score += 5;
          signals.push({ label: "Startup profile", pts: 5 });
        }
      }
      const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
      return {
        ...company,
        score: pct,
        rawScore: score,
        maxScore,
        signals,
        qualified: pct >= 50,
      };
    })
    .sort((a, b) => b.score - a.score);
}

// ─── PRESET QUERIES ─────────────────────────────────────────────────────────
const PRESETS = [
  "Logistic companies in Romania",
  "Public software companies with more than 1,000 employees.",
  "Food and beverage manufacturers in France",
  "Companies that could supply packaging materials for a direct-to-consumer cosmetics brand",
  "Construction companies in the United States with revenue over $50 million",
  "Pharmaceutical companies in Switzerland",
  "B2B SaaS companies providing HR solutions in Europe",
  "Clean energy startups founded after 2018 with fewer than 200 employees",
  "Fast-growing fintech companies competing with traditional banks in Europe.",
  "E-commerce companies using Shopify or similar platforms",
  "Renewable energy equipment manufacturers in Scandinavia",
  "Companies that manufacture or supply critical components for electric vehicle battery production",
];

// ─── HELPERS ────────────────────────────────────────────────────────────────
const fmtRev = (r) => {
  if (!r) return null;
  if (r >= 1e9) return `$${(r / 1e9).toFixed(1)}B`;
  if (r >= 1e6) return `$${(r / 1e6).toFixed(0)}M`;
  return `$${r.toLocaleString()}`;
};

// ─── COMPONENTS ─────────────────────────────────────────────────────────────
function ScoreRing({ score }) {
  const r = 18,
    circ = 2 * Math.PI * r,
    off = circ - (score / 100) * circ;
  const color = score >= 70 ? "#00e5a0" : score >= 50 ? "#ffaa2c" : "#ff4d6a";
  return (
    <div style={{ width: 44, height: 44, position: "relative", flexShrink: 0 }}>
      <svg width="44" height="44" viewBox="0 0 44 44">
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="2.5"
        />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={off}
          transform="rotate(-90 22 22)"
          style={{ transition: "stroke-dashoffset 0.5s ease-out" }}
        />
      </svg>
      <span
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          fontFamily: '"DM Mono",monospace',
          fontSize: "0.72rem",
          fontWeight: 500,
          color,
        }}
      >
        {score}
      </span>
    </div>
  );
}

function CompanyCard({ company, index }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      onClick={() => setOpen(!open)}
      style={{
        background: "#12141a",
        border: "1px solid #2a2e38",
        borderRadius: 10,
        padding: "18px 20px",
        cursor: "pointer",
        transition: "all 0.2s",
        borderLeft: company.qualified
          ? "3px solid #00e5a0"
          : "3px solid #2a2e38",
        opacity: company.qualified ? 1 : 0.55,
        animationDelay: `${index * 40}ms`,
      }}
      className="card-anim"
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 8,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <a
              href={`https://${company.website}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                fontSize: "1.02rem",
                fontWeight: 600,
                color: "#e8eaf0",
                textDecoration: "none",
              }}
              onMouseOver={(e) => (e.target.style.color = "#00e5a0")}
              onMouseOut={(e) => (e.target.style.color = "#e8eaf0")}
            >
              {company.operational_name}
            </a>
            {company.is_public && (
              <span
                style={{
                  fontSize: "0.6rem",
                  fontFamily: '"DM Mono",monospace',
                  background: "rgba(77,166,255,0.12)",
                  color: "#4da6ff",
                  padding: "2px 6px",
                  borderRadius: 4,
                  textTransform: "uppercase",
                  fontWeight: 500,
                  letterSpacing: "0.04em",
                }}
              >
                Public
              </span>
            )}
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              fontSize: "0.75rem",
              color: "#5a5f70",
              fontFamily: '"DM Mono",monospace',
              marginTop: 4,
            }}
          >
            {company.address && <span>◉ {company.address}</span>}
            {company.employee_count && (
              <span>⊞ {company.employee_count.toLocaleString()}</span>
            )}
            {company.revenue && <span>◈ {fmtRev(company.revenue)}</span>}
            {company.year_founded && <span>▸ {company.year_founded}</span>}
          </div>
        </div>
        <ScoreRing score={company.score} />
      </div>
      <p
        style={{
          fontSize: "0.84rem",
          color: "#8b90a0",
          lineHeight: 1.6,
          margin: "4px 0 10px",
        }}
      >
        {company.description && !open && company.description.length > 160
          ? company.description.slice(0, 157) + "…"
          : company.description}
      </p>
      {company.signals.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {company.signals.map((s, i) => (
            <span
              key={i}
              style={{
                fontSize: "0.68rem",
                fontFamily: '"DM Mono",monospace',
                padding: "2px 7px",
                borderRadius: 4,
                background:
                  s.pts > 0 ? "rgba(0,229,160,0.1)" : "rgba(255,170,44,0.1)",
                color: s.pts > 0 ? "#00e5a0" : "#ffaa2c",
              }}
            >
              +{s.pts} {s.label}
            </span>
          ))}
        </div>
      )}
      {open && (
        <div
          style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 5 }}
        >
          {(company.core_offerings || []).map((o, i) => (
            <span
              key={i}
              style={{
                fontSize: "0.68rem",
                fontFamily: '"DM Mono",monospace',
                background: "#0a0b0f",
                padding: "3px 8px",
                borderRadius: 4,
                color: "#8b90a0",
                border: "1px solid #2a2e38",
              }}
            >
              {o}
            </span>
          ))}
          {company.primary_naics && (
            <span
              style={{
                fontSize: "0.68rem",
                fontFamily: '"DM Mono",monospace',
                background: "rgba(77,166,255,0.08)",
                padding: "3px 8px",
                borderRadius: 4,
                color: "#4da6ff",
              }}
            >
              NAICS {company.primary_naics.code} — {company.primary_naics.label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ParsedPanel({ parsed }) {
  const tags = [];
  if (parsed.countries?.length)
    tags.push({
      k: "location",
      v: parsed.regionMatch || parsed.countries.join(", "),
    });
  parsed.industries?.forEach((i) =>
    tags.push({ k: "industry", v: i.key.replace(/_/g, " ") }),
  );
  if (parsed.employeeMin)
    tags.push({ k: "employees >", v: parsed.employeeMin.toLocaleString() });
  if (parsed.employeeMax)
    tags.push({ k: "employees <", v: parsed.employeeMax.toLocaleString() });
  if (parsed.revenueMin)
    tags.push({
      k: "revenue >",
      v: `$${(parsed.revenueMin / 1e6).toFixed(0)}M`,
    });
  if (parsed.yearMin)
    tags.push({ k: "founded after", v: String(parsed.yearMin) });
  if (parsed.isPublic !== null)
    tags.push({ k: "status", v: parsed.isPublic ? "public" : "private" });
  parsed.businessModels?.forEach((b) => tags.push({ k: "model", v: b }));
  if (parsed.isSupplyChain) tags.push({ k: "mode", v: "supply chain" });
  if (parsed.isEcosystem) tags.push({ k: "mode", v: "ecosystem" });
  if (parsed.isStartup) tags.push({ k: "type", v: "startup" });
  if (parsed.isFastGrowing) tags.push({ k: "trait", v: "fast-growing" });
  return (
    <div
      style={{
        background: "#12141a",
        border: "1px solid #2a2e38",
        borderRadius: 14,
        padding: "18px 20px",
        marginBottom: 22,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontSize: "0.75rem",
            color: "#5a5f70",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            fontFamily: '"DM Mono",monospace',
          }}
        >
          Query Decomposition
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span
            style={{
              fontSize: "0.72rem",
              color: "#5a5f70",
              fontFamily: '"DM Mono",monospace',
              marginRight: 4,
            }}
          >
            complexity
          </span>
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background:
                  i <= parsed.complexity
                    ? parsed.complexity >= 4
                      ? "#ffaa2c"
                      : "#00e5a0"
                    : "#2a2e38",
                transition: "background 0.3s",
              }}
            />
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {tags.length ? (
          tags.map((t, i) => (
            <span
              key={i}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                background: "#1a1d26",
                border: "1px solid #2a2e38",
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: "0.76rem",
                fontFamily: '"DM Mono",monospace',
              }}
            >
              <span style={{ color: "#5a5f70" }}>{t.k}</span>
              <span style={{ color: "#00e5a0" }}>{t.v}</span>
            </span>
          ))
        ) : (
          <span
            style={{
              color: "#5a5f70",
              fontSize: "0.78rem",
              fontFamily: '"DM Mono",monospace',
            }}
          >
            No structured filters — full semantic scoring
          </span>
        )}
      </div>
    </div>
  );
}

// ─── APP ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [tab, setTab] = useState("qualified");
  const inputRef = useRef(null);

  const run = useCallback((q) => {
    const t0 = performance.now();
    const parsed = parseQuery(q);
    const scored = scoreCompanies(COMPANIES, parsed);
    const elapsed = Math.round(performance.now() - t0);
    setResults({ query: q, parsed, scored, time: elapsed });
    setTab("qualified");
  }, []);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (query.trim()) run(query.trim());
  };

  const qualified = results?.scored?.filter((r) => r.qualified) || [];
  const rejected = results?.scored?.filter((r) => !r.qualified) || [];
  const displayed = tab === "qualified" ? qualified : rejected;

  const countryCount = useMemo(() => {
    const s = new Set();
    COMPANIES.forEach((c) => {
      const p = (c.address || "").split(",").pop()?.trim();
      if (p) s.add(p);
    });
    return s.size;
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Outfit:wght@300;400;500;600;700;800&display=swap');
        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
        html { font-size:15px; -webkit-font-smoothing:antialiased; }
        body { font-family:'Outfit',sans-serif; background:#0a0b0f; color:#e8eaf0; min-height:100vh; line-height:1.5; }
        ::-webkit-scrollbar { width:5px; }
        ::-webkit-scrollbar-track { background:#0a0b0f; }
        ::-webkit-scrollbar-thumb { background:#2a2e38; border-radius:3px; }
        .bg-grid { position:fixed; inset:0; z-index:-1;
          background-image: linear-gradient(rgba(42,46,56,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(42,46,56,0.35) 1px, transparent 1px);
          background-size: 48px 48px;
          mask-image: radial-gradient(ellipse 70% 50% at 50% 20%, black, transparent); }
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        .card-anim { animation: fadeUp 0.35s ease-out both; }
        .card-anim:hover { background:#1a1d26 !important; border-color:#3a3f4d !important; }
        input::placeholder { color:#5a5f70; }
        input:focus { border-color:#00b37d !important; box-shadow: 0 0 0 3px rgba(0,229,160,0.12) !important; }
        .preset-btn { transition: all 0.15s; }
        .preset-btn:hover { background:#1a1d26 !important; border-color:#00b37d !important; color:#00e5a0 !important; }
        .tab-btn { transition: all 0.15s; cursor:pointer; }
        .tab-btn:hover { color:#8b90a0 !important; }
      `}</style>

      <div className="bg-grid" />
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "0 20px",
          minHeight: "100vh",
        }}
      >
        {/* ─── HEADER ──── */}
        <header
          style={{
            padding: "28px 0 22px",
            borderBottom: "1px solid #2a2e38",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 7,
                background: "linear-gradient(135deg,#00e5a0,#00b37d)",
                display: "grid",
                placeItems: "center",
                fontSize: "0.88rem",
                fontWeight: 700,
                color: "#0a0b0f",
                fontFamily: '"DM Mono",monospace',
              }}
            >
              IQ
            </div>
            <h1
              style={{
                fontSize: "1.25rem",
                fontWeight: 700,
                letterSpacing: "-0.02em",
              }}
            >
              Intent Qualifier{" "}
              <span
                style={{ color: "#5a5f70", fontWeight: 400, fontSize: "1rem" }}
              >
                / company matching
              </span>
            </h1>
          </div>
          <div
            style={{
              display: "flex",
              gap: 18,
              fontFamily: '"DM Mono",monospace',
              fontSize: "0.75rem",
              color: "#5a5f70",
            }}
          >
            <span>
              <span style={{ color: "#e8eaf0", fontWeight: 500 }}>
                {COMPANIES.length}
              </span>{" "}
              companies
            </span>
            <span>
              <span style={{ color: "#e8eaf0", fontWeight: 500 }}>
                {countryCount}
              </span>{" "}
              countries
            </span>
          </div>
        </header>

        {/* ─── SEARCH ──── */}
        <section style={{ padding: "28px 0" }}>
          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", gap: 10, marginBottom: 14 }}
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Describe the companies you're looking for…"
              style={{
                flex: 1,
                background: "#12141a",
                border: "1px solid #2a2e38",
                borderRadius: 10,
                padding: "13px 16px",
                fontSize: "0.95rem",
                fontFamily: '"Outfit",sans-serif',
                color: "#e8eaf0",
                outline: "none",
                transition: "border-color 0.2s, box-shadow 0.2s",
              }}
            />
            <button
              type="submit"
              disabled={!query.trim()}
              style={{
                background: "linear-gradient(135deg,#00e5a0,#00b37d)",
                color: "#0a0b0f",
                border: "none",
                borderRadius: 10,
                padding: "13px 26px",
                fontFamily: '"Outfit",sans-serif',
                fontSize: "0.9rem",
                fontWeight: 600,
                cursor: query.trim() ? "pointer" : "not-allowed",
                opacity: query.trim() ? 1 : 0.4,
                transition: "opacity 0.2s",
                whiteSpace: "nowrap",
              }}
            >
              Qualify
            </button>
          </form>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {PRESETS.map((p, i) => (
              <button
                key={i}
                className="preset-btn"
                onClick={() => {
                  setQuery(p);
                  run(p);
                }}
                style={{
                  background: "#12141a",
                  border: "1px solid #2a2e38",
                  borderRadius: 100,
                  padding: "5px 13px",
                  fontSize: "0.73rem",
                  color: "#8b90a0",
                  cursor: "pointer",
                  fontFamily: '"Outfit",sans-serif',
                  whiteSpace: "nowrap",
                }}
              >
                {p.length > 52 ? p.slice(0, 49) + "…" : p}
              </button>
            ))}
          </div>
        </section>

        {/* ─── RESULTS ──── */}
        {results ? (
          <section style={{ paddingBottom: 48 }}>
            {/* Stats bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 0",
                borderBottom: "1px solid #2a2e38",
                marginBottom: 18,
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <h2 style={{ fontSize: "1.05rem", fontWeight: 600 }}>
                Results for{" "}
                <span
                  style={{
                    color: "#8b90a0",
                    fontWeight: 400,
                    fontStyle: "italic",
                  }}
                >
                  "{results.query}"
                </span>
              </h2>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  fontFamily: '"DM Mono",monospace',
                  fontSize: "0.73rem",
                }}
              >
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "3px 9px",
                    borderRadius: 100,
                    background: "rgba(0,229,160,0.1)",
                    color: "#00e5a0",
                    fontWeight: 500,
                  }}
                >
                  ✓ {qualified.length} qualified
                </span>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "3px 9px",
                    borderRadius: 100,
                    background: "rgba(255,77,106,0.1)",
                    color: "#ff4d6a",
                    fontWeight: 500,
                  }}
                >
                  ✗ {rejected.length} rejected
                </span>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "3px 9px",
                    borderRadius: 100,
                    background: "rgba(77,166,255,0.1)",
                    color: "#4da6ff",
                    fontWeight: 500,
                  }}
                >
                  ⚡ {results.time}ms
                </span>
              </div>
            </div>

            <ParsedPanel parsed={results.parsed} />

            {/* Tabs */}
            <div
              style={{
                display: "flex",
                gap: 0,
                marginBottom: 18,
                borderBottom: "1px solid #2a2e38",
              }}
            >
              {["qualified", "rejected"].map((t) => (
                <button
                  key={t}
                  className="tab-btn"
                  onClick={() => setTab(t)}
                  style={{
                    padding: "9px 18px",
                    fontSize: "0.85rem",
                    fontWeight: 500,
                    color: tab === t ? "#00e5a0" : "#5a5f70",
                    border: "none",
                    borderBottom:
                      tab === t ? "2px solid #00e5a0" : "2px solid transparent",
                    background: "none",
                    fontFamily: '"Outfit",sans-serif',
                  }}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                  <span
                    style={{
                      fontFamily: '"DM Mono",monospace',
                      fontSize: "0.7rem",
                      marginLeft: 6,
                      opacity: 0.6,
                    }}
                  >
                    {t === "qualified" ? qualified.length : rejected.length}
                  </span>
                </button>
              ))}
            </div>

            {/* Cards */}
            {displayed.length > 0 ? (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                {displayed.map((c, i) => (
                  <CompanyCard key={c.operational_name} company={c} index={i} />
                ))}
              </div>
            ) : (
              <div
                style={{
                  textAlign: "center",
                  padding: "60px 20px",
                  color: "#5a5f70",
                }}
              >
                <p
                  style={{
                    fontSize: "1.1rem",
                    color: "#8b90a0",
                    marginBottom: 4,
                  }}
                >
                  {tab === "qualified"
                    ? "No companies qualified"
                    : "All companies were qualified!"}
                </p>
                <p style={{ fontSize: "0.85rem" }}>
                  Try a different query or adjust your criteria
                </p>
              </div>
            )}
          </section>
        ) : (
          <div
            style={{
              textAlign: "center",
              padding: "100px 20px",
              color: "#5a5f70",
            }}
          >
            <div style={{ fontSize: "3rem", marginBottom: 16, opacity: 0.25 }}>
              ⬡
            </div>
            <p
              style={{ fontSize: "1.15rem", color: "#8b90a0", marginBottom: 6 }}
            >
              Describe what you're looking for
            </p>
            <p style={{ fontSize: "0.88rem" }}>
              Enter a query or pick a preset to qualify companies
            </p>
          </div>
        )}
      </div>
    </>
  );
}
