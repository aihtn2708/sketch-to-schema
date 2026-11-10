// What every provider sends, and how replies are read. Shared by all provider files.
// Pure (no page access), covered by tests/prompt.test.js.

export const PROMPT = `The image is a database schema (ER diagram) — a whiteboard photo, a paper sketch, or a drawing made on screen with boxes, typed text and lines.
Extract every table, column and relationship. Reply with ONLY a JSON object, no other text, in exactly this shape:
{"tables":[{"n":"orders","cols":[{"n":"id","t":"integer","g":true,"pk":true},{"n":"customer_id","t":"integer","g":true,"nul":false,"ref":"customers.id","flag":"ref: line end is faint, assumed many orders per customer"},{"n":"note","t":"text"}]}],"warnings":[]}

Keys: n=name, t=SQL type, g=type was inferred (not written), pk=primary key, nul=nullable, u=unique, ref="table.column", flag="field: note" (field is name|type|pk|ref).
Keep the reply short: leave out any key that has its default value. Defaults: g false, pk false, u false, ref "", flag "", nul true (false for pk columns).
Rules:
- A box is a table. Its first or top text is the table name; the other lines are columns.
- Names lowercase snake_case as written. Don't invent tables or columns.
- Use a written type if present (e.g. "price numeric"); otherwise infer and set g=true: id/*_id integer, *_at timestamp, *_on/*_date date, is_*/has_* boolean, price/amount/total numeric(10,2), qty/count integer, description/notes text, other text varchar(255).
- pk=true for underlined, "PK" or key-marked names. nul=false for required columns.
- Lines between boxes are relationships. A crow's-foot (three short prongs) marks the "many" side, which holds the foreign key; a short bar marks the "one" side.
- flag only real doubts (unreadable text, unclear line direction, guessed key).
- warnings: notes or crossed-out items you did not turn into schema. If the image is not a schema, return {"tables":[],"warnings":["<what it shows>"]}.`;

// The same shape as a JSON Schema, for providers that can enforce it (Claude structured outputs).
export const SCHEMA = {
  type: "object", additionalProperties: false, required: ["tables", "warnings"],
  properties: {
    warnings: { type: "array", items: { type: "string" } },
    tables: { type: "array", items: {
      type: "object", additionalProperties: false, required: ["n", "cols"],
      properties: {
        n: { type: "string" },
        cols: { type: "array", items: {
          type: "object", additionalProperties: false, required: ["n", "t", "g", "pk", "nul", "u", "ref", "flag"],
          properties: { n: { type: "string" }, t: { type: "string" }, g: { type: "boolean" }, pk: { type: "boolean" },
            nul: { type: "boolean" }, u: { type: "boolean" }, ref: { type: "string" }, flag: { type: "string" } } } }
      } } }
  }
};

// Tolerant parse: the whole reply, else a ```json fence, else the first { to the last }.
export function parseJson(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1];
  const braces = text.includes("{") ? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1) : "";
  for (const t of [text, fence, braces]) {
    if (!t) continue;
    try { return JSON.parse(t); } catch { /* try the next form */ }
  }
  return null;
}

export const validShape = (v) => !!v && Array.isArray(v.tables) &&
  v.tables.every((t) => typeof t?.n === "string" && Array.isArray(t.cols) && t.cols.every((c) => typeof c?.n === "string"));

// The request after a reply was cut off: the same task, minus the tables already received.
export function continuePrompt(names) {
  return PROMPT + `

This is a follow-up: an earlier reply was cut off. These tables were already extracted: ${names.join(", ")}.
Reply with the same JSON shape containing ONLY the tables that are not in that list (columns may still reference listed tables). If none remain, reply {"tables":[],"warnings":[]}.`;
}

// A reply cut off part-way: keep every table whose JSON was complete before the cut.
export function salvageTables(text) {
  const key = text.indexOf('"tables"');
  const start = key < 0 ? -1 : text.indexOf("[", key);
  if (start < 0) return [];
  let depth = 0, inStr = false, escaped = false, lastEnd = -1;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 1 && ch === "}") lastEnd = i;    // a whole table just closed
      if (depth === 0) break;
    }
  }
  if (lastEnd < 0) return [];
  try {
    return JSON.parse(text.slice(start, lastEnd + 1) + "]")
      .filter((t) => typeof t?.n === "string" && Array.isArray(t.cols))
      .map((t) => ({ ...t, cols: t.cols.filter((c) => typeof c?.n === "string") }));
  } catch {
    return [];
  }
}

// Add tables from a later reply, skipping names already present.
export function mergeTables(have, more) {
  const seen = new Set(have.map((t) => t.n.toLowerCase()));
  const out = [...have];
  for (const t of Array.isArray(more) ? more : []) {
    if (typeof t?.n !== "string" || seen.has(t.n.toLowerCase())) continue;
    seen.add(t.n.toLowerCase());
    out.push(t);
  }
  return out;
}
