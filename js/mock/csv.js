// CSV import: reading the file, and guessing a table definition from it (column types,
// primary key, references). Pure, covered by tests/csv.test.js.
import { norm } from "./rows.js";

export const MAX_ROWS = 50000;

// RFC 4180 CSV, plus what spreadsheets really write: a byte-order mark, ; or tab separators,
// CRLF line ends, quoted fields with commas, quotes ("") and line breaks inside.
// → { header, rows (text or null; empty cells are NULL), delimiter, warnings }
export function parseCsv(text) {
  let s = String(text || "").replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(s);
  const records = [];
  let field = "", row = [], quoted = false, wasQuoted = false;
  const endField = () => { row.push(field === "" && !wasQuoted ? null : field); field = ""; wasQuoted = false; };
  const endRow = () => { endField(); records.push(row); row = []; };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += ch;
    } else if (ch === '"' && field === "") { quoted = true; wasQuoted = true; }
    else if (ch === delimiter) endField();
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && s[i + 1] === "\n") i++; endRow(); }
    else field += ch;
  }
  if (field !== "" || wasQuoted || row.length) endRow();
  const warnings = [];
  if (quoted) warnings.push("The file ends inside a quoted value; the last row may be incomplete.");
  // Drop blank lines.
  const nonEmpty = records.filter((r) => r.some((v) => v !== null && v.trim() !== ""));
  if (!nonEmpty.length) return { header: [], rows: [], delimiter, warnings: ["The file is empty."] };
  const header = cleanHeader(nonEmpty[0]);
  let rows = nonEmpty.slice(1);
  let ragged = 0;
  rows = rows.map((r) => {
    if (r.length !== header.length) ragged++;
    return header.map((_, j) => (r[j] === undefined ? null : r[j] === "" ? null : r[j]));
  });
  if (ragged) warnings.push(`${ragged} row${ragged === 1 ? " has" : "s have"} a different number of values than the header; missing values are left empty and extra ones dropped.`);
  if (rows.length > MAX_ROWS) { warnings.push(`Only the first ${MAX_ROWS.toLocaleString()} of ${rows.length.toLocaleString()} rows are used.`); rows = rows.slice(0, MAX_ROWS); }
  return { header, rows, delimiter, warnings };
}

function detectDelimiter(s) {
  const first = [];
  let quoted = false;
  for (let i = 0; i < s.length && first.length < 5000; i++) {
    const ch = s[i];
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === "\n" || ch === "\r")) break;
    else if (!quoted) first.push(ch);
  }
  const count = (d) => first.filter((c) => c === d).length;
  return [",", ";", "\t", "|"].reduce((best, d) => (count(d) > count(best) ? d : best), ",");
}

// Column names fit for SQL: snake_case, not empty, not repeated.
function cleanHeader(h) {
  const seen = new Map();
  return h.map((v, j) => {
    let n = norm(v ?? "") || `column_${j + 1}`;
    if (/^\d/.test(n)) n = "c_" + n;
    const k = seen.get(n) || 0;
    seen.set(n, k + 1);
    return k ? `${n}_${k + 1}` : n;
  });
}

// A table name from a file name: "Customer Orders (2026).csv" → "customer_orders_2026".
export const tableNameFromFile = (file) => {
  let n = norm(String(file || "").replace(/\.[^.]+$/, "")) || "imported";
  return /^\d/.test(n) ? "t_" + n : n;
};

const INT = /^[-+]?\d+$/, DEC = /^[-+]?(\d+\.\d*|\.\d+|\d+)$/;
const BOOL = /^(true|false|yes|no|t|f|y|n)$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TS = /^\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?\s*(Z|[+-]\d{2}(:?\d{2})?)?$/i;
const TZ = /(Z|[+-]\d{2}(:?\d{2})?)$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCAL_DATE = /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/;

// The type a column's values fit, with a note when the guess is shaky.
export function guessType(values) {
  const v = values.filter((x) => x !== null && x !== undefined && x.trim() !== "").map((x) => x.trim());
  if (!v.length) return { type: "text", note: "Every value is empty, so the type is a guess." };
  if (v.every((x) => INT.test(x))) {
    if (v.some((x) => /^[-+]?0\d/.test(x))) return { type: "text", note: "Numbers with leading zeros (like codes or zip codes) are kept as text." };
    return { type: v.some((x) => Math.abs(Number(x)) > 2147483647) ? "bigint" : "integer" };
  }
  if (v.every((x) => DEC.test(x))) {
    const scale = Math.min(6, Math.max(...v.map((x) => (x.split(".")[1] || "").length)));
    const whole = Math.max(...v.map((x) => x.replace(/^[-+]/, "").split(".")[0].replace(/^0+/, "").length));
    return { type: `numeric(${Math.max(12, whole + scale)},${scale})` };
  }
  if (v.every((x) => BOOL.test(x))) return { type: "boolean" };
  if (v.every((x) => DATE.test(x))) return { type: "date" };
  if (v.every((x) => DATE.test(x) || TS.test(x))) return { type: v.some((x) => TZ.test(x) && TS.test(x)) ? "timestamptz" : "timestamp" };
  if (v.every((x) => UUID.test(x))) return { type: "uuid" };
  if (v.every((x) => LOCAL_DATE.test(x))) return { type: "text", note: "Looks like dates written day/month or month/day; kept as text. Change them to 2026-11-10 form to use a date type." };
  return { type: "text" };
}

const singular = (s) => s.replace(/ies$/, "y").replace(/(ss|us)$/, "$1").replace(/([^s])s$/, "$1");
const sameTable = (name, stem) => { const a = norm(name), b = norm(stem); return a === b || singular(a) === b || a === b + "s" || a === b + "es"; };

// A table definition for a CSV. others: tables it may point to, as [{ name, pk }] (the draft's
// tables and the other files being imported). → { name, columns: [{ name, type, pk, nullable,
// references, notes: { type?, pk?, references? } }] }
export function guessTable(name, header, rows, others = []) {
  const columns = header.map((h, j) => {
    const vals = rows.map((r) => r[j]);
    const g = guessType(vals);
    const col = { name: h, type: g.type, pk: false, nullable: vals.some((x) => x === null), references: null, notes: {} };
    if (g.note) col.notes.type = g.note;
    return col;
  });
  // Primary key: "id" or "<table>_id" whose values are all there and all different.
  const stem = singular(norm(name));
  const pkAt = columns.findIndex((c, j) => (c.name === "id" || c.name === `${stem}_id` || c.name === `${norm(name)}_id`)
    && !c.nullable && new Set(rows.map((r) => r[j])).size === rows.length && rows.length > 0);
  if (pkAt >= 0) {
    columns[pkAt].pk = true;
    columns[pkAt].notes.pk = "Guessed: every value is different, in a column named like a key.";
  }
  // References: "<other table>_id" → that table's key.
  columns.forEach((c, j) => {
    if (j === pkAt) return;
    const m = c.name.match(/^(.+)_id$/);
    if (!m) return;
    const target = others.find((o) => o.pk && sameTable(o.name, m[1]) && norm(o.name) !== norm(name))
      || (sameTable(name, m[1]) && pkAt >= 0 ? { name, pk: columns[pkAt].name } : null);
    if (target) { c.references = `${target.name}.${target.pk}`; c.notes.references = `Guessed from the column name; points to ${target.name}.${target.pk}.`; }
  });
  return { name, columns };
}

// How a CSV's columns line up with an existing table: for each table column, the CSV column index
// (or -1), and the CSV columns nothing uses.
export function matchColumns(tableColumns, header) {
  const used = new Set();
  const idx = tableColumns.map((c) => {
    const j = header.findIndex((h, k) => !used.has(k) && norm(h) === norm(c.name));
    if (j >= 0) used.add(j);
    return j;
  });
  return { idx, unused: header.filter((_, k) => !used.has(k)) };
}
