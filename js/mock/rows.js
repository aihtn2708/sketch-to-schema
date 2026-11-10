// Sample data as rows: { tableId: { name, cols: [{ id, name }], rows: [[text or null]], source } }
// source is "generated", "edited" or "imported"; edited and imported tables are kept when new
// sample data is generated. Turns rows into INSERT statements, lines saved rows up with the
// current draft, and checks cells. Pure, covered by tests/rows.test.js.
import { colById } from "../schema/model.js";
import { quoteIdent as q, tName, cName } from "../schema/export.js";
import { pgType, kindOf } from "./setup.js";

const SOURCES = new Set(["generated", "edited", "imported"]);
const usable = (tables) => tables.filter((t) => t.columns.length);
export const norm = (s) => String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

// Parents before children, so the script reads naturally (constraints are added after the data anyway).
export function tableOrder(tables) {
  const list = usable(tables), byId = new Map(list.map((t) => [t.id, t]));
  const out = [], done = new Set();
  const visit = (t, path = new Set()) => {
    if (done.has(t.id) || path.has(t.id)) return;
    path.add(t.id);
    for (const c of t.columns) {
      const hit = c.ref && colById(tables, c.ref.c);
      if (hit && hit.t.id !== t.id && byId.has(hit.t.id)) visit(hit.t, path);
    }
    done.add(t.id); out.push(t);
  };
  for (const t of list) visit(t);
  return out;
}

const NUM = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
function lit(kind, v) {
  if (v === null || v === undefined) return "NULL";
  if ((kind === "int" || kind === "num" || kind === "float") && NUM.test(v)) return v;
  if (kind === "bool" && /^(true|false)$/i.test(v)) return v.toUpperCase();
  return `'${String(v).replace(/'/g, "''")}'`;   // PostgreSQL turns a quoted value into the column's type
}

// The rows as an INSERT script, parents first, 200 rows per statement.
export function rowsToSql(tables, data, note = "from the Table view") {
  const parts = [`-- Sample data: ${note}.`, "-- Edit it freely; it runs every time the mock database is built.", ""];
  for (const t of tableOrder(tables)) {
    const d = data[t.id], name = tName(t);
    const rows = d ? lineUp(t, d) : [];
    if (!rows.length) { parts.push(`-- ${name}: no rows`, ""); continue; }
    const kinds = t.columns.map((c) => kindOf(pgType(c.type)).kind);
    const head = `INSERT INTO ${q(name)} (${t.columns.map((c) => q(cName(c))).join(", ")}) VALUES`;
    for (let s = 0; s < rows.length; s += 200) {
      const chunk = rows.slice(s, s + 200).map((row) => `  (${row.map((v, j) => lit(kinds[j], v)).join(", ")})`);
      parts.push(`${head}\n${chunk.join(",\n")};`, "");
    }
  }
  return parts.join("\n");
}

// Saved rows lined up with the table's current columns: matched by column id, then by name;
// new columns are empty (NULL).
export function lineUp(t, d) {
  const idx = t.columns.map((c) => {
    let j = d.cols.findIndex((x) => x.id === c.id);
    if (j < 0) j = d.cols.findIndex((x) => norm(x.name) === norm(cName(c)));
    return j;
  });
  if (idx.every((j, i) => j === i) && d.cols.length === t.columns.length) return d.rows;
  return d.rows.map((row) => idx.map((j) => (j < 0 ? null : row[j] ?? null)));
}

// The same entry with its columns brought up to date with the draft.
export const remap = (t, d) => ({ name: tName(t), cols: t.columns.map((c) => ({ id: c.id, name: cName(c) })), rows: lineUp(t, d), source: d.source });

/* ---------- Checking cells ---------- */
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TS = /^\d{4}-\d{2}-\d{2}([ T]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?)?\s*([+-]\d{2}(:?\d{2})?|Z)?$/i;
const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const realDate = (s) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); const x = new Date(Date.UTC(y, m - 1, d)); return x.getUTCMonth() === m - 1 && x.getUTCDate() === d; };

// Why a value doesn't fit a column's type, or "".
export function typeProblem(pg, v) {
  const k = kindOf(pg);
  switch (k.kind) {
    case "int":
      if (!/^[-+]?\d+$/.test(v)) return "Must be a whole number.";
      if (Math.abs(Number(v)) > k.max) return `Too large for ${pg}.`;
      return "";
    case "num": case "float": {
      if (!NUM.test(v)) return "Must be a number.";
      if (k.kind === "num") {
        const whole = v.replace(/^[-+]/, "").split(/[.eE]/)[0].replace(/^0+/, "");
        if (whole.length > k.p - k.s) return `Too large for ${pg}.`;
      }
      return "";
    }
    case "bool": return /^(true|false|t|f|yes|no|y|n|on|off|1|0)$/i.test(v) ? "" : "Must be true or false.";
    case "date": return DATE.test(v) && realDate(v) ? "" : "Must be a date like 2026-11-10.";
    case "ts": return TS.test(v) && realDate(v) ? "" : "Must be a date and time like 2026-11-10 14:30:00.";
    case "time": return /^\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(v) ? "" : "Must be a time like 14:30:00.";
    case "uuid": return UUID.test(v) ? "" : "Must be a UUID.";
    case "json": try { JSON.parse(v); return ""; } catch { return "Must be valid JSON."; }
    case "text": return k.len && v.length > k.len ? `Longer than ${k.len} characters.` : "";
    default: return "";
  }
}

// Every problem in one table's rows: { "row:col": message }. Rows are already lined up with t.columns.
export function checkTable(t, rows, tables, data) {
  const out = {};
  const add = (r, c, m) => { const key = `${r}:${c}`; if (!out[key]) out[key] = m; };
  const pks = t.columns.map((c, j) => (c.pk ? j : -1)).filter((j) => j >= 0);
  t.columns.forEach((c, j) => {
    const pg = pgType(c.type), seen = new Map();
    const unique = c.unique || (c.pk && pks.length === 1);
    let parent = null;
    const hit = c.ref && colById(tables, c.ref.c);
    if (hit && data[hit.t.id]) {
      const pRows = lineUp(hit.t, data[hit.t.id]), pj = hit.t.columns.indexOf(hit.c);
      parent = { name: tName(hit.t), col: cName(hit.c), vals: new Set(pRows.map((r) => r[pj]).filter((v) => v !== null).map(String)) };
    }
    rows.forEach((row, r) => {
      const v = row[j];
      if (v === null || v === undefined) { if (!c.nullable || c.pk) add(r, j, "Can't be empty: the column is NOT NULL."); return; }
      const bad = typeProblem(pg, v);
      if (bad) { add(r, j, bad); return; }
      if (unique) {
        const k = kindOf(pg).kind === "int" ? String(Number(v)) : v;
        if (seen.has(k)) { add(r, j, `Repeats row ${seen.get(k) + 1}; the column must be unique.`); add(seen.get(k), j, `Repeated in row ${r + 1}; the column must be unique.`); }
        else seen.set(k, r);
      }
      if (parent && !parent.vals.has(v) && !(NUM.test(v) && parent.vals.has(String(Number(v)))))
        add(r, j, `No ${parent.name} row has ${parent.col} = ${v}.`);
    });
  });
  if (pks.length > 1) {
    const seen = new Map();
    rows.forEach((row, r) => {
      const k = JSON.stringify(pks.map((j) => row[j]));
      if (seen.has(k)) for (const j of pks) { add(r, j, `Same key as row ${seen.get(k) + 1}.`); }
      else seen.set(k, r);
    });
  }
  return out;
}

/* ---------- CSV out ---------- */
export function toCsv(names, rows) {
  const cell = (v) => (v === null || v === undefined ? "" : /[",\r\n]|^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [names, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/* ---------- Saved data ---------- */
export function cleanTables(obj) {
  const out = {};
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
  for (const [id, d] of Object.entries(obj).slice(0, 500)) {
    if (!d || !Array.isArray(d.cols) || !Array.isArray(d.rows)) continue;
    const cols = d.cols.filter((c) => c && typeof c.name === "string").map((c) => ({ id: String(c.id ?? ""), name: c.name })).slice(0, 500);
    if (!cols.length) continue;
    const rows = d.rows.slice(0, 50000).filter(Array.isArray).map((r) => cols.map((_, j) => (r[j] === null || r[j] === undefined ? null : String(r[j]))));
    out[String(id)] = { name: String(d.name ?? ""), cols, rows, source: SOURCES.has(d.source) ? d.source : "edited" };
  }
  return out;
}
