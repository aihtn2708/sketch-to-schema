// The mock database's data and engine, shared by the Test on mock data panel, the Sample data
// tab and CSV import. No page drawing here; changes are announced with events:
//   "mock:changed"  the sample data changed (the database is out of date)
//   "mock:status"   the engine started building, finished, failed or stopped
//   "mock:notice"   { text, undo } a message for the panel, optionally with an Undo button
import { state, emit } from "../state.js";
import { schemaKey } from "../query/prompt.js";
import { quoteIdent as q, tName, cName } from "../schema/export.js";
import { createSql, fkSteps, countSql } from "./setup.js";
import { generateRows } from "./generate.js";
import { rowsToSql, lineUp } from "./rows.js";
import * as db from "./db.js";

export const M = () => state.mock;

// The draft as the mock database sees it, with a fingerprint of its schema.
export function setup() {
  const tables = state.schema.tables.filter((t) => t.columns.length);
  const create = createSql(tables), fks = fkSteps(tables);
  return { tables, create, fks, key: schemaKey(create + "\n" + fks.map((f) => f.sql).join("\n")) };
}

/* ---------- Sample data ---------- */
let version = 0;
let cache = { version: -1, schema: "", sql: "" };
export function changed() { version++; emit("mock:changed"); emit("dirty"); }

// The data step of the build: the rows as INSERT statements, or the user's own SQL.
export function dataSql(s = setup()) {
  if (M().mode === "sql") return M().data;
  if (cache.version !== version || cache.schema !== s.key) cache = { version, schema: s.key, sql: rowsToSql(s.tables, M().tables) };
  return cache.sql;
}
export const dbKey = (s = setup()) => schemaKey(s.key + "\n" + dataSql(s));

// A table's saved rows: by table id, or by name (tables get new ids when the draft is re-extracted).
export function entryFor(t) {
  const all = M().tables;
  if (all[t.id]) return all[t.id];
  const name = tName(t).toLowerCase();
  return Object.values(all).find((d) => d.name.toLowerCase() === name) || null;
}

// Rows for every table: edited and imported tables are kept (lined up with the current columns),
// the rest are generated. regen: one table id to generate again (every other table is kept).
export function reconcile(s = setup(), { newSeed = false, regen = null } = {}) {
  if (newSeed) M().seed = (M().seed % 999999) + 1;
  const keep = {};
  for (const t of s.tables) {
    const d = entryFor(t);
    if (!d) continue;
    if (regen ? t.id !== regen : d.source !== "generated") keep[t.id] = { rows: lineUp(t, d), source: d.source };
  }
  M().tables = generateRows(s.tables, { rows: M().rows, seed: M().seed, keep });
  M().tablesFor = s.key;
  changed();
}

// Sample data follows the draft: new tables and columns get data, removed ones go.
export function ensureData(s = setup()) {
  if (!s.tables.length) return;
  if (M().mode === "sql") { if (M().data.trim()) return; M().mode = "rows"; }
  if (!Object.keys(M().tables).length || M().tablesFor !== s.key || s.tables.some((t) => !M().tables[t.id])) reconcile(s);
}

/* ---------- Undo for data changes (new data, regenerate, import, switching modes) ---------- */
let undoState = null;
export function remember() {
  const m = M();
  undoState = structuredClone({ mode: m.mode, tables: m.tables, tablesFor: m.tablesFor, data: m.data, seed: m.seed });
}
export function undo() {
  if (!undoState) return false;
  Object.assign(M(), undoState); undoState = null;
  changed();
  return true;
}
export const forgetUndo = () => { undoState = null; };
export const notice = (text, undoable = false) => emit("mock:notice", { text, undo: undoable });

/* ---------- The engine ---------- */
export const engine = { phase: "idle", info: null, error: null, started: false };

export async function ensureDb() {
  const s = setup();
  if (!s.tables.length) throw { message: "Add tables to the draft schema first. The mock database is built from it.", label: "empty" };
  ensureData(s);
  const key = dbKey(s);
  if (db.isBuilt(key) && engine.phase === "ready") return s;
  engine.phase = "building"; engine.error = null; emit("mock:status");
  try {
    engine.info = await db.build(key, [
      { sql: s.create, label: "schema" },
      { sql: dataSql(s), label: "data" },
      ...s.fks.map((f) => ({ sql: f.sql, label: f.label, soft: true }))
    ], countSql(s.tables));
    engine.phase = "ready"; engine.started = true;
  } catch (e) {
    engine.info = null;
    engine.phase = e?.stopped ? "idle" : "error";
    engine.error = e?.stopped ? null : e;
    throw e;
  } finally { emit("mock:status"); }
  return s;
}

export function stopEngine() { db.stop(); engine.phase = "idle"; emit("mock:status"); }

// Every row of one table as the database has it (for the SQL mode's read-only table).
export async function readTable(t) {
  await ensureDb();
  const r = await db.run(`SELECT * FROM ${q(tName(t))};`, 50000);
  return { cols: t.columns.map((c) => ({ id: c.id, name: cName(c) })), rows: r.rows, total: r.rowCount };
}

// Own SQL → table editing: run the SQL, read every table back as rows.
export async function sqlToRows() {
  const s = await ensureDb();
  const out = {};
  for (const t of s.tables) {
    const r = await readTable(t);
    // A table the SQL left exactly as it was keeps its kind (so New sample data still refreshes it).
    const prev = entryFor(t);
    const same = prev && JSON.stringify(lineUp(t, prev)) === JSON.stringify(r.rows);
    out[t.id] = { name: tName(t), cols: r.cols, rows: r.rows, source: same ? prev.source : "edited" };
  }
  remember();
  Object.assign(M(), { mode: "rows", tables: out, tablesFor: s.key });
  changed();
  return s;
}
