// The mock database runs here, in a background worker, so a slow query never freezes the page
// and Stop can end it. PostgreSQL itself is PGlite (WebAssembly), loaded on first use.
//
// Messages in:  { id, type: "build", url, steps: [{ sql, label, soft }], countSql }
//               { id, type: "run", sql, maxRows }
// Messages out: { id, ok: true, ...result } or { id, ok: false, error: { message, position, detail, hint, label } }
import { digest, sortRows } from "./compare.js";

let db = null;

// Dates and times stay exactly as PostgreSQL prints them.
const raw = (s) => s;
const parsers = { 1082: raw, 1083: raw, 1114: raw, 1184: raw, 1186: raw, 1266: raw };

const text = (v) => {
  if (v === null || v === undefined) return null;
  if (v instanceof Uint8Array) return "\\x" + Array.from(v, (b) => b.toString(16).padStart(2, "0")).join("");
  if (typeof v === "object") return JSON.stringify(v, (k, x) => (typeof x === "bigint" ? x.toString() : x));
  return String(v);
};

function fail(e, label) {
  return { message: e?.message || String(e), position: e?.position ? +e.position : null, detail: e?.detail || "", hint: e?.hint || "", label: label || "" };
}

async function build({ url, steps, countSql }) {
  let PGlite;
  try { ({ PGlite } = await import(url)); }
  catch { throw { message: "Couldn't download the database engine. Check your connection; some company networks block cdn.jsdelivr.net.", label: "load" }; }
  if (db) { try { await db.close(); } catch { /* already closed */ } }
  db = await PGlite.create();
  const warnings = [];
  for (const s of steps) {
    if (!s.sql.trim()) continue;
    try { await db.exec(s.sql); }
    catch (e) {
      if (s.soft) warnings.push({ label: s.label, message: e.message, detail: e.detail || "" });
      else throw fail(e, s.label);
    }
  }
  const counts = countSql ? (await db.query(countSql)).rows : [];
  return { counts, warnings };
}

async function run({ sql, maxRows = 1000 }) {
  if (!db) throw { message: "The database isn't ready yet.", label: "query" };
  const t0 = performance.now();
  let results;
  await db.exec("BEGIN");
  try { results = await db.exec(sql, { rowMode: "array", parsers }); }
  catch (e) { throw fail(e, "query"); }
  finally { try { await db.exec("ROLLBACK"); } catch { /* nothing to undo */ } }
  const ms = Math.round(performance.now() - t0);
  // Show the last statement that returned columns; otherwise the last statement.
  const main = [...results].reverse().find((r) => r.fields?.length) || results[results.length - 1] || { rows: [], fields: [] };
  const rows = (main.rows || []).map((row) => row.map(text));
  return {
    ms,
    statements: results.length,
    command: main.command || "",
    affected: results.reduce((n, r) => n + (r.affectedRows || 0), 0),
    columns: (main.fields || []).map((f) => f.name),
    rowCount: rows.length,
    rows: rows.slice(0, maxRows),
    hash: digest(rows),
    hashSorted: digest(sortRows(rows))
  };
}

self.onmessage = async ({ data: m }) => {
  try {
    const out = m.type === "build" ? await build(m) : await run(m);
    self.postMessage({ id: m.id, ok: true, ...out });
  } catch (e) {
    self.postMessage({ id: m.id, ok: false, error: e?.message !== undefined && "label" in e ? e : fail(e) });
  }
};
