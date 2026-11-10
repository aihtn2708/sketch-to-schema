// Ask in plain language: the schema as the model sees it, the prompt, and reading the answer.
// Pure (no page access), covered by tests/query.test.js.
import { colById } from "../schema/model.js";
import { safeId } from "../util.js";

export const DIALECTS = { postgresql: "PostgreSQL", mysql: "MySQL", sqlite: "SQLite", sqlserver: "SQL Server" };

// Venn regions by number of sets: "a" = only in A, "ab" = in A and B but not C, "abc" = in all three.
export const REGIONS = { 2: ["a", "b", "ab"], 3: ["a", "b", "c", "ab", "ac", "bc", "abc"] };

// The schema in one compact line per table: orders(id integer PK, customer_id integer → customers.id).
export function schemaText(tables) {
  return tables.map((t) => `${t.name || "untitled"}(${t.columns.map((c) => {
    let s = `${c.name || "untitled"} ${c.type || "text"}`;
    if (c.pk) s += " PK";
    if (c.unique && !c.pk) s += " UNIQUE";
    if (!c.nullable && !c.pk) s += " NOT NULL";
    if (c.ref) { const hit = colById(tables, c.ref.c); if (hit) s += ` → ${hit.t.name}.${hit.c.name}`; }
    return s;
  }).join(", ")})`).join("\n");
}

// A short fingerprint of the schema text, to spot answers made for an older version of the schema.
export function schemaKey(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

export function askPrompt({ schema, question, dialect, today }) {
  const d = DIALECTS[dialect] || DIALECTS.postgresql;
  return `You write ${d} SQL for the database below. Use ONLY these tables and columns (→ marks a foreign key).

${schema}

Today is ${today}.
Question: ${question}

Reply with ONLY a JSON object, no other text, in exactly this shape:
{"sql":"SELECT ...","explanation":"...","venn":{"sets":[{"label":"Inventory items","table":"inventory_items"},{"label":"Items with a transaction in the last 2 years","table":"inventory_transactions"}],"result":["a"]},"assumptions":["..."],"missing":["..."]}

Rules:
- Never invent tables or columns. If the question needs data the schema doesn't have, say what is missing in "missing" and write the closest useful query, or "" if there is none.
- Write ${d} syntax. Prefer relative dates (for example the current date minus 2 years) over fixed dates, so the query keeps working.
- For "with no …" / "never …" questions use NOT EXISTS. Qualify columns with table aliases.
- Format the SQL with line breaks and 2-space indents, and keep it to one statement.
- explanation: 1–3 short plain sentences on how the query answers the question.
- venn: when the answer compares groups of rows (with / without, both, either, not), give 2 or 3 sets and the regions the result covers: "a", "b", "c" = only in that set; "ab", "ac", "bc" = in exactly those two; "abc" = in all three. Otherwise use {"sets":[],"result":[]}.
- assumptions: how you read anything ambiguous (for example which date column means "transaction date"). Use [] if none.`;
}

// The same shape as a JSON Schema, for providers that enforce it (Claude).
export const ASK_SCHEMA = {
  type: "object", additionalProperties: false, required: ["sql", "explanation", "venn", "assumptions", "missing"],
  properties: {
    sql: { type: "string" },
    explanation: { type: "string" },
    venn: {
      type: "object", additionalProperties: false, required: ["sets", "result"],
      properties: {
        sets: { type: "array", items: { type: "object", additionalProperties: false, required: ["label", "table"],
          properties: { label: { type: "string" }, table: { type: "string" } } } },
        result: { type: "array", items: { type: "string" } }
      }
    },
    assumptions: { type: "array", items: { type: "string" } },
    missing: { type: "array", items: { type: "string" } }
  }
};

const strings = (v, max = 8) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()).slice(0, max) : []);

// A Venn description we can draw, or null.
export function normalizeVenn(v) {
  const sets = Array.isArray(v?.sets) ? v.sets.filter((s) => typeof s?.label === "string" && s.label.trim()) : [];
  if (sets.length < 2 || sets.length > 3) return null;
  const allowed = REGIONS[sets.length];
  const result = allowed.filter((r) => Array.isArray(v.result) && v.result.map((x) => String(x).toLowerCase()).includes(r));
  if (!result.length) return null;
  return { sets: sets.map((s) => ({ label: s.label.trim(), table: typeof s.table === "string" ? s.table.trim() : "" })), result };
}

// The model's reply → { sql, explanation, venn, assumptions, missing }, or null if unusable.
export function normalizeAnswer(v) {
  if (!v || typeof v !== "object" || typeof v.sql !== "string") return null;
  const sql = v.sql.trim();
  const missing = strings(v.missing);
  if (!sql && !missing.length) return null;
  return {
    sql,
    explanation: typeof v.explanation === "string" ? v.explanation.trim() : "",
    venn: normalizeVenn(v.venn),
    assumptions: strings(v.assumptions),
    missing
  };
}

export const sameQuestion = (a, b) => a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");

// Saved or imported history is untrusted: keep well-formed entries only, newest first, at most 30.
export function cleanQueries(list) {
  return (Array.isArray(list) ? list : []).map((q) => {
    const answer = normalizeAnswer(q?.answer);
    if (!answer || typeof q?.question !== "string" || !q.question.trim()) return null;
    return {
      id: q.id ? safeId(q.id) : Math.random().toString(36).slice(2, 9),
      question: q.question.trim().slice(0, 1000),
      dialect: DIALECTS[q.dialect] ? q.dialect : "postgresql",
      schemaKey: typeof q.schemaKey === "string" ? q.schemaKey : "",
      model: typeof q.model === "string" ? q.model : "",
      at: Number.isFinite(q.at) ? q.at : 0,
      answer
    };
  }).filter(Boolean).slice(0, 30);
}

// Starter questions built from the schema's own relationships (no request needed).
export function suggestions(tables) {
  const out = [];
  for (const t of tables) for (const c of t.columns) {
    if (!c.ref) continue;
    const hit = colById(tables, c.ref.c);
    if (!hit || hit.t.id === t.id) continue;
    const parent = hit.t.name.replace(/_/g, " "), child = t.name.replace(/_/g, " ");
    const one = parent.replace(/ies$/, "y").replace(/([^s])s$/, "$1");          // "inventory items" → "inventory item"
    const many = (s) => (/s$/.test(s) ? s : s.replace(/([^aeiou])y$/, "$1ie") + "s");   // "customer" → "customers"
    const Cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    out.push(`${Cap(many(parent))} with no ${many(child)} in the past year`, `Number of ${many(child)} per ${one}`, `${Cap(many(parent))} that have ${many(child)}`);
    if (out.length >= 6) return out.slice(0, 6);
  }
  return out;
}
