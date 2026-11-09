// What every provider sends, and how replies are read. Shared by all provider files.
// Pure (no page access), covered by tests/prompt.test.js.

export const PROMPT = `The image is a database schema (ER diagram) — a whiteboard photo, a paper sketch, or a drawing made on screen with boxes, typed text and lines.
Extract every table, column and relationship. Reply with ONLY a JSON object, no other text, in exactly this shape:
{"tables":[{"n":"orders","cols":[{"n":"id","t":"integer","g":true,"pk":true,"nul":false,"u":false,"ref":"","flag":""},{"n":"customer_id","t":"integer","g":true,"pk":false,"nul":false,"u":false,"ref":"customers.id","flag":"ref: line end is faint, assumed many orders per customer"}]}],"warnings":[]}

Keys: n=name, t=SQL type, g=type was inferred (not written), pk=primary key, nul=nullable, u=unique, ref="table.column" or "", flag="field: note" or "" (field is name|type|pk|ref).
Rules:
- A box is a table. Its first or top text is the table name; the other lines are columns.
- Names lowercase snake_case as written. Don't invent tables or columns.
- Use a written type if present (e.g. "price numeric"); otherwise infer and set g=true: id/*_id integer, *_at timestamp, *_on/*_date date, is_*/has_* boolean, price/amount/total numeric(10,2), qty/count integer, description/notes text, other text varchar(255).
- pk=true for underlined, "PK" or key-marked names. nul=false for pk and required columns.
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
