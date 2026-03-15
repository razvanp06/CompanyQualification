import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// ─── BACKEND CONNECTION ──────────────────────────────────────────────────────
const API_BASE = "https://nifty-superaffluently-jennifer.ngrok-free.dev";

// Convert API intent object → format expected by ParsedPanel
function adaptIntent(intent) {
  const criteria = intent.criteria || [];
  const q = (
    intent.semantic_query ||
    intent.original_query ||
    ""
  ).toLowerCase();
  return {
    countries: intent.countries || [],
    regionMatch: null,
    industries: intent.industry ? [{ key: intent.industry }] : [],
    employeeMin: intent.min_employees || null,
    employeeMax: intent.max_employees || null,
    revenueMin: intent.min_revenue || null,
    yearMin: intent.min_year_founded || null,
    isPublic: intent.is_public ?? null,
    businessModels: intent.business_models || [],
    isSupplyChain: criteria.some((c) =>
      /supply|component|packaging|material/i.test(c),
    ),
    isEcosystem: criteria.some((c) => /compet|alternat|similar/i.test(c)),
    isStartup: criteria.some((c) => /startup|start.?up/i.test(c)),
    isFastGrowing: criteria.some((c) => /fast.?grow|rapid/i.test(c)),
    complexity: Math.min(5, Math.max(1, Math.round(criteria.length / 2) || 1)),
  };
}

// Convert API company object → format expected by CompanyCard
function adaptCompany(c) {
  const addr = c.address;
  const addrStr =
    addr && typeof addr === "object"
      ? [addr.town, addr.country_code?.toUpperCase()].filter(Boolean).join(", ")
      : addr || "";

  const score = Math.round((c.final_score || 0) * 100);
  const qualified = score >= 70;

  const signals = [];
  if (c.rag_score > 0)
    signals.push({
      label: `AI: ${c.rag_score} criteria matched`,
      pts: c.rag_score * 10,
    });
  if (c.embedding_score > 0.5)
    signals.push({
      label: "Strong semantic match",
      pts: Math.round(c.embedding_score * 10),
    });
  if (c.match_reasons) signals.push({ label: c.match_reasons, pts: 0 });

  return { ...c, address: addrStr, score, qualified, signals };
}

// ─── (old frontend data/logic removed — all qualification done by backend) ───

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
        borderLeft: company.score >= 70
          ? "3px solid #00e5a0"
          : company.score >= 50
          ? "3px solid #ffaa2c"
          : "3px solid #2a2e38",
        opacity: 1,
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

// ─── PRICING MODAL ───────────────────────────────────────────────────────────
function PricingModal({ onClose, onSelect, loading }) {
  const PLANS = [
    { key: "starter",    label: "Starter",    price: "$49",  period: "/mo", desc: "100 qualification credits per month", highlight: false },
    { key: "pro",        label: "Pro",        price: "$149", period: "/mo", desc: "500 credits + priority processing",    highlight: true  },
    { key: "enterprise", label: "Enterprise", price: "$499", period: "/mo", desc: "Unlimited credits + API access",       highlight: false },
  ];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#12141a", border: "1px solid #2a2e38", borderRadius: 18, padding: "36px 32px", maxWidth: 640, width: "100%", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 20, background: "none", border: "none", color: "#5a5f70", fontSize: "1.1rem", cursor: "pointer" }}>✕</button>
        <h2 style={{ fontSize: "1.35rem", fontWeight: 700, marginBottom: 4 }}>Choose a plan</h2>
        <p style={{ color: "#5a5f70", fontSize: "0.8rem", marginBottom: 28, fontFamily: '"DM Mono",monospace' }}>
          Stripe test mode — use card <span style={{ color: "#00e5a0" }}>4242 4242 4242 4242</span>, any future date, any CVC
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
          {PLANS.map((p) => (
            <div key={p.key} style={{ background: p.highlight ? "rgba(0,229,160,0.06)" : "#0a0b0f", border: `1px solid ${p.highlight ? "#00e5a0" : "#2a2e38"}`, borderRadius: 14, padding: "22px 16px", textAlign: "center" }}>
              {p.highlight && (
                <div style={{ fontSize: "0.6rem", fontFamily: '"DM Mono",monospace', color: "#00e5a0", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Most popular</div>
              )}
              <div style={{ fontSize: "0.72rem", fontFamily: '"DM Mono",monospace', color: "#5a5f70", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>{p.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 2, marginBottom: 8 }}>
                <span style={{ fontSize: "2.1rem", fontWeight: 700, color: p.highlight ? "#00e5a0" : "#e8eaf0" }}>{p.price}</span>
                <span style={{ fontSize: "0.78rem", color: "#5a5f70", fontFamily: '"DM Mono",monospace' }}>{p.period}</span>
              </div>
              <p style={{ fontSize: "0.76rem", color: "#8b90a0", marginBottom: 20, lineHeight: 1.5 }}>{p.desc}</p>
              <button onClick={() => onSelect(p.key)} disabled={loading}
                style={{ width: "100%", background: p.highlight ? "linear-gradient(135deg,#00e5a0,#00b37d)" : "#1a1d26", color: p.highlight ? "#0a0b0f" : "#e8eaf0", border: p.highlight ? "none" : "1px solid #2a2e38", borderRadius: 9, padding: "11px 0", fontSize: "0.85rem", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", fontFamily: '"Outfit",sans-serif', transition: "all 0.15s" }}>
                {loading ? "Redirecting…" : "Get started"}
              </button>
            </div>
          ))}
        </div>
        <p style={{ marginTop: 20, textAlign: "center", fontSize: "0.72rem", color: "#3a3f4d", fontFamily: '"DM Mono",monospace' }}>
          Secured by Stripe · Cancel anytime · No hidden fees
        </p>
      </div>
    </div>
  );
}

// ─── PAYMENT SUCCESS BANNER ───────────────────────────────────────────────────
function PaymentSuccessBanner({ plan, onDismiss }) {
  const labels = { starter: "Starter", pro: "Pro", enterprise: "Enterprise" };
  return (
    <div style={{ background: "rgba(0,229,160,0.08)", border: "1px solid #00e5a0", borderRadius: 10, padding: "14px 20px", margin: "16px 0 0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontSize: "0.88rem", color: "#00e5a0" }}>
        Payment successful — <strong>{labels[plan] || "Plan"}</strong> activated. Your account is now upgraded.
      </span>
      <button onClick={onDismiss} style={{ background: "none", border: "none", color: "#5a5f70", cursor: "pointer", fontSize: "1rem", flexShrink: 0 }}>✕</button>
    </div>
  );
}

// ─── WIZARD SUB-COMPONENTS (must be at module level to preserve focus) ───────
function WizardFieldLabel({ text, optional }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <span style={{ fontSize: "0.72rem", fontFamily: '"DM Mono",monospace', color: "#5a5f70", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {text}
      </span>
      {optional && (
        <span style={{ fontSize: "0.65rem", fontFamily: '"DM Mono",monospace', color: "#3a3f4d", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          optional
        </span>
      )}
    </div>
  );
}

function WizardChipBar({ chips, onChip }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
      {chips.map((c) => (
        <button key={c} className="chip-btn" onClick={() => onChip(c)}
          style={{ background: "#0a0b0f", border: "1px solid #2a2e38", borderRadius: 100, padding: "3px 10px", fontSize: "0.68rem", color: "#5a5f70", cursor: "pointer", fontFamily: '"Outfit",sans-serif' }}>
          {c}
        </button>
      ))}
    </div>
  );
}

function WizardTextInput({ val, setVal, placeholder }) {
  return (
    <input
      value={val}
      onChange={(e) => setVal(e.target.value)}
      placeholder={placeholder}
      style={{ width: "100%", background: "#0a0b0f", border: "1px solid #2a2e38", borderRadius: 8, padding: "10px 14px", fontSize: "0.88rem", fontFamily: '"Outfit",sans-serif', color: "#e8eaf0", outline: "none", transition: "border-color 0.2s, box-shadow 0.2s" }}
    />
  );
}

function WizardToggleGroup({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(value === o.value ? "" : o.value)}
          style={{ flex: 1, minWidth: 80, background: value === o.value ? "rgba(0,229,160,0.1)" : "#0a0b0f", border: `1px solid ${value === o.value ? "#00e5a0" : "#2a2e38"}`, borderRadius: 8, padding: "8px 10px", cursor: "pointer", textAlign: "center", transition: "all 0.15s" }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: value === o.value ? "#00e5a0" : "#8b90a0", fontFamily: '"Outfit",sans-serif' }}>{o.label}</div>
          {o.sub && <div style={{ fontSize: "0.65rem", color: "#5a5f70", fontFamily: '"DM Mono",monospace', marginTop: 2 }}>{o.sub}</div>}
        </button>
      ))}
    </div>
  );
}

// ─── PROMPT WIZARD ──────────────────────────────────────────────────────────
function PromptWizard({ onBuild, onClose }) {
  const [industry, setIndustry] = useState("");
  const [size, setSize] = useState("");
  const [location, setLocation] = useState("");
  const [financial, setFinancial] = useState("");
  const [keywords, setKeywords] = useState("");

  const SIZE_OPTIONS = [
    { value: "startup", label: "Startup", sub: "1–10 emp." },
    { value: "small", label: "SME", sub: "11–50 emp." },
    { value: "medium", label: "Mid-market", sub: "51–500 emp." },
    { value: "large", label: "Corporation", sub: "500+ emp." },
  ];

  const FINANCIAL_OPTIONS = [
    { value: "revenue1m", label: "Turnover > €1M" },
    { value: "profitable", label: "Profitable" },
    { value: "early", label: "Early-stage" },
  ];

  const assemblePrompt = () => {
    const base = industry ? `${industry} companies` : "companies";
    const loc = location ? `in ${location}` : "";
    const lead = [base, loc].filter(Boolean).join(" ");
    const conditions = [];
    if (size) {
      const m = {
        startup: "with 1 to 10 employees",
        small: "with 11 to 50 employees",
        medium: "with 51 to 500 employees",
        large: "with more than 500 employees",
      };
      conditions.push(m[size]);
    }
    if (financial) {
      const m = {
        revenue1m: "with turnover over €1 million",
        profitable: "that are profitable",
        early: "that are early-stage startups",
      };
      conditions.push(m[financial]);
    }
    if (keywords) conditions.push(`focused on ${keywords}`);
    return [lead, ...conditions].join(", ");
  };

  const preview = assemblePrompt();
  const canBuild = !!(industry || location || size || financial || keywords);

  return (
    <div className="wizard-anim" style={{ background: "#12141a", border: "1px solid #2a2e38", borderRadius: 14, padding: "22px 24px", marginTop: 14 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22 }}>
        <div>
          <p style={{ fontSize: "1rem", fontWeight: 600, color: "#e8eaf0" }}>Build your search</p>
          <p style={{ fontSize: "0.78rem", color: "#5a5f70", marginTop: 3 }}>Answer what you know — all fields are optional</p>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#5a5f70", cursor: "pointer", fontSize: "1rem", padding: "4px 8px", lineHeight: 1 }}>✕</button>
      </div>

      {/* Fields */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px 28px" }}>
        <div>
          <WizardFieldLabel text="Field of Activity" />
          <WizardTextInput val={industry} setVal={setIndustry} placeholder="e.g. IT, Healthcare, Agriculture…" />
          <WizardChipBar chips={["IT", "Healthcare", "Agriculture", "E-commerce", "Construction", "Logistics"]} onChip={setIndustry} />
        </div>

        <div>
          <WizardFieldLabel text="Location" />
          <WizardTextInput val={location} setVal={setLocation} placeholder="e.g. Romania, Bucharest, Eastern Europe…" />
          <WizardChipBar chips={["Romania", "Bucharest", "France", "Germany", "Eastern Europe", "USA"]} onChip={setLocation} />
        </div>

        <div>
          <WizardFieldLabel text="Company Size" />
          <WizardToggleGroup options={SIZE_OPTIONS} value={size} onChange={setSize} />
        </div>

        <div>
          <WizardFieldLabel text="Financial Health" optional />
          <WizardToggleGroup options={FINANCIAL_OPTIONS} value={financial} onChange={setFinancial} />
        </div>

        <div style={{ gridColumn: "1 / -1" }}>
          <WizardFieldLabel text="Keywords / Technology" />
          <WizardTextInput val={keywords} setVal={setKeywords} placeholder="e.g. artificial intelligence, B2B, green energy…" />
          <WizardChipBar chips={["Artificial intelligence", "B2B", "SaaS", "Green energy", "Auto import-export", "Blockchain"]} onChip={setKeywords} />
        </div>
      </div>

      {/* Preview */}
      <div style={{ marginTop: 22, padding: "14px 16px", background: "#0a0b0f", borderRadius: 10, border: "1px solid #2a2e38" }}>
        <p style={{ fontSize: "0.65rem", fontFamily: '"DM Mono",monospace', color: "#5a5f70", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
          Generated prompt
        </p>
        <p style={{ fontSize: "0.88rem", color: canBuild ? "#e8eaf0" : "#3a3f4d", fontStyle: canBuild ? "normal" : "italic", lineHeight: 1.5 }}>
          {canBuild ? preview : "Fill in at least one field above…"}
        </p>
      </div>

      <button onClick={() => canBuild && onBuild(preview)} disabled={!canBuild}
        style={{ marginTop: 14, width: "100%", background: canBuild ? "linear-gradient(135deg,#00e5a0,#00b37d)" : "#1a1d26", color: canBuild ? "#0a0b0f" : "#3a3f4d", border: "none", borderRadius: 10, padding: "13px 20px", fontSize: "0.95rem", fontWeight: 600, fontFamily: '"Outfit",sans-serif', cursor: canBuild ? "pointer" : "not-allowed", transition: "all 0.2s" }}>
        Search with this prompt →
      </button>
    </div>
  );
}

// ─── ADAPTIVE DISPLAY ────────────────────────────────────────────────────────
// Instead of a fixed score threshold, detect the natural "gap" in the score
// distribution and show only the companies clearly above it.
//
// Algorithm:
//   1. Take the top 20 scored companies.
//   2. Find the largest score drop between consecutive companies.
//   3. If that gap is ≥ 15 points, cut there → show only companies above the gap.
//   4. If no significant gap exists (scores are tightly clustered), show top 5.
//   5. Always show at least 1 and at most 10 results.
//
// Examples:
//   [88, 82, 79, 74, 31, 22] → gap 43 between 74 and 31 → show first 4
//   [82, 78, 75, 72, 68, 64] → no gap ≥15 → show top 5
//   [90, 20, 15]             → gap 70 between 90 and 20 → show first 1
function computeDisplayed(allScored) {
  if (allScored.length === 0) return [];
  const top = allScored.slice(0, 20);
  if (top.length <= 2) return top;

  let maxGap = 0;
  let cutIdx = top.length;
  for (let i = 0; i < top.length - 1; i++) {
    const gap = top[i].score - top[i + 1].score;
    if (gap > maxGap) {
      maxGap = gap;
      cutIdx = i + 1;
    }
  }

  if (maxGap >= 15) return top.slice(0, Math.min(cutIdx, 10));
  return top.slice(0, Math.min(5, top.length));
}

// ─── APP ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);

  const [time, setTime] = useState(0);
  const [loading, setLoading] = useState(false);
  const [totalCompanies, setTotalCompanies] = useState(477);
  const inputRef = useRef(null);
  const [showWizard, setShowWizard] = useState(false);

  // ── Stripe / payment state ─────────────────────────────────────────────────
  const [showPricing, setShowPricing] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const _urlParams = new URLSearchParams(window.location.search);
  const [paymentSuccess, setPaymentSuccess] = useState(_urlParams.get("payment") === "success");
  const paidPlan = _urlParams.get("plan") || "";

  const handleCheckout = async (plan) => {
    setCheckoutLoading(true);
    try {
      const res = await fetch(`${API_BASE}/create-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, frontend_url: window.location.origin }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.detail || "Checkout failed");
    } catch (err) {
      console.error("Checkout error:", err);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const run = useCallback(async (q) => {
    setLoading(true);
    const t0 = performance.now();
    try {
      const res = await fetch(`${API_BASE}/qualify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, top_n: 50 }),
      });
      const data = await res.json();
      const elapsed = Math.round(performance.now() - t0);
      const scored = (data.results || []).map(adaptCompany);
      const parsed = adaptIntent(data.intent || {});
      setTotalCompanies(data.total_candidates || 477);
      const locationWarning = data.intent?.location_warning || null;
      setResults({ query: q, parsed, scored, time: elapsed, locationWarning });
      setTab("qualified");
      setTime(elapsed);
    } catch (err) {
      console.error("API error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleWizardBuild = (prompt) => {
    setQuery(prompt);
    setShowWizard(false);
    run(prompt);
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (query.trim() && !loading) run(query.trim());
  };

  const allScored = results?.scored ? [...results.scored].sort((a, b) => b.score - a.score) : [];
  const displayed = computeDisplayed(allScored);

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
        @keyframes wizardIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .wizard-anim { animation: wizardIn 0.25s ease-out both; }
        .chip-btn:hover { border-color:#00b37d !important; color:#00e5a0 !important; }
        .wizard-trigger-btn:hover { border-color:#00b37d !important; color:#00e5a0 !important; }
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
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontFamily: '"DM Mono",monospace', fontSize: "0.75rem", color: "#5a5f70" }}>
              <span style={{ color: "#e8eaf0", fontWeight: 500 }}>{totalCompanies}</span> companies
            </span>
            <button
              onClick={() => setShowPricing(true)}
              style={{ background: "linear-gradient(135deg,#00e5a0,#00b37d)", color: "#0a0b0f", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer", fontFamily: '"Outfit",sans-serif', letterSpacing: "-0.01em" }}
            >
              Upgrade
            </button>
          </div>
        </header>

        {paymentSuccess && (
          <PaymentSuccessBanner plan={paidPlan} onDismiss={() => setPaymentSuccess(false)} />
        )}

        {showPricing && (
          <PricingModal onClose={() => setShowPricing(false)} onSelect={handleCheckout} loading={checkoutLoading} />
        )}

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
              disabled={!query.trim() || loading}
              style={{
                background: loading
                  ? "#1a1d26"
                  : "linear-gradient(135deg,#00e5a0,#00b37d)",
                color: loading ? "#00e5a0" : "#0a0b0f",
                border: loading ? "1px solid #00e5a0" : "none",
                borderRadius: 10,
                padding: "13px 26px",
                fontFamily: '"Outfit",sans-serif',
                fontSize: "0.9rem",
                fontWeight: 600,
                cursor: query.trim() && !loading ? "pointer" : "not-allowed",
                opacity: query.trim() && !loading ? 1 : 0.7,
                transition: "all 0.2s",
                whiteSpace: "nowrap",
              }}
            >
              {loading ? "Qualifying…" : "Qualify"}
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

          {/* ─── WIZARD TRIGGER ──── */}
          <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
            <button
              className="wizard-trigger-btn"
              onClick={() => setShowWizard((v) => !v)}
              style={{
                background: "none",
                border: "1px solid #2a2e38",
                borderRadius: 100,
                padding: "7px 18px",
                fontSize: "0.78rem",
                color: showWizard ? "#00e5a0" : "#5a5f70",
                cursor: "pointer",
                fontFamily: '"Outfit",sans-serif',
                transition: "all 0.2s",
                borderColor: showWizard ? "#00e5a0" : "#2a2e38",
              }}
            >
              {showWizard ? "✕ Close guide" : "I don't know how to write a prompt"}
            </button>
          </div>

          {showWizard && (
            <PromptWizard
              onBuild={handleWizardBuild}
              onClose={() => setShowWizard(false)}
            />
          )}
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
                  ✓ {displayed.length} results
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

            {results.locationWarning && (
              <div style={{ background: "rgba(255,170,44,0.08)", border: "1px solid #ffaa2c", borderRadius: 10, padding: "14px 18px", marginBottom: 18, display: "flex", alignItems: "flex-start", gap: 12 }}>
                <span style={{ color: "#ffaa2c", fontSize: "1rem", flexShrink: 0 }}>⚠</span>
                <div>
                  <p style={{ fontSize: "0.85rem", color: "#ffaa2c", fontWeight: 600, marginBottom: 3 }}>Location not found</p>
                  <p style={{ fontSize: "0.82rem", color: "#8b90a0", lineHeight: 1.6 }}>{results.locationWarning}</p>
                </div>
              </div>
            )}

            <ParsedPanel parsed={results.parsed} />

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
                <div style={{ fontSize: "2rem", marginBottom: 14, opacity: 0.2 }}>○</div>
                <p style={{ fontSize: "1.05rem", color: "#8b90a0", marginBottom: 6 }}>
                  No companies matched your criteria
                </p>
                <p style={{ fontSize: "0.83rem", maxWidth: 400, margin: "0 auto", lineHeight: 1.6 }}>
                  {allScored.length > 0
                    ? `${allScored.length} companies were evaluated but scores were too low to show. Try broadening your criteria — widen the location, remove the employee filter, or simplify the query.`
                    : "No companies found in the database for this combination of filters."}
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
