// SQL tests: a saved query plus the result it should give. Running a test re-runs the query
// on the mock database and compares. Also used by the worker to fingerprint results.
// Pure, covered by tests/mock.test.js.

export const SAMPLE_ROWS = 200;   // rows kept with a test, to show what changed

// A short fingerprint of rows, so large results can be compared without storing them.
export function digest(rows) {
  let h = 2166136261;
  for (const row of rows) {
    const s = JSON.stringify(row);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= 10; h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
export const sortRows = (rows) => [...rows].sort((a, b) => { const x = JSON.stringify(a), y = JSON.stringify(b); return x < y ? -1 : x > y ? 1 : 0; });

// SQL without comments or string contents, for simple keyword checks.
export const stripSql = (sql) => String(sql || "")
  .replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/'(?:[^']|'')*'/g, "''").replace(/\$\$[\s\S]*?\$\$/g, "''");

// Row order only counts when the query sorts its result.
export const isOrdered = (sql) => /\border\s+by\b/i.test(stripSql(sql).replace(/\([^()]*\)/g, ""));

// Each run is already wrapped in a transaction that is undone, so the query can't manage its own.
export function txControl(sql) {
  const hit = stripSql(sql).split(";").map((s) => s.trim()).find((s) => /^(begin|commit|rollback|end|abort|start\s+transaction|savepoint|release)\b/i.test(s));
  return hit ? hit.split(/\s+/)[0].toUpperCase() : null;
}

// What a test keeps from a run.
export function snapshot(result, sql) {
  const ordered = isOrdered(sql);
  return {
    columns: result.columns, rowCount: result.rowCount, command: result.command || "",
    ordered, hash: ordered ? result.hash : result.hashSorted,
    sample: (ordered ? result.rows : sortRows(result.rows)).slice(0, SAMPLE_ROWS)
  };
}

const show = (row) => `(${row.map((v) => (v === null ? "NULL" : v)).join(", ")})`;
const few = (rows) => rows.slice(0, 3).map(show).join(", ") + (rows.length > 3 ? ` and ${rows.length - 3} more` : "");

// Expected (a snapshot) vs a new run → { pass, reason }.
export function compare(expected, result) {
  const cols = (c) => c.join(", ") || "(none)";
  if (expected.columns.join("\u0000") !== result.columns.join("\u0000"))
    return { pass: false, reason: `Columns changed: expected ${cols(expected.columns)}; got ${cols(result.columns)}.` };
  const hash = expected.ordered ? result.hash : result.hashSorted;
  if (expected.rowCount === result.rowCount && expected.hash === hash) return { pass: true, reason: "" };

  const rowsNow = expected.ordered ? result.rows : sortRows(result.rows);
  let detail = "";
  const complete = expected.sample.length === expected.rowCount && result.rows.length === result.rowCount;
  if (expected.ordered) {
    const n = Math.min(expected.sample.length, rowsNow.length);
    for (let i = 0; i < n; i++) {
      if (JSON.stringify(expected.sample[i]) !== JSON.stringify(rowsNow[i])) { detail = `Row ${i + 1}: expected ${show(expected.sample[i])}, got ${show(rowsNow[i])}.`; break; }
    }
  } else if (complete) {
    const count = (rows) => { const m = new Map(); for (const r of rows) { const k = JSON.stringify(r); m.set(k, (m.get(k) || 0) + 1); } return m; };
    const a = count(expected.sample), b = count(rowsNow);
    const missing = [], extra = [];
    for (const [k, n] of a) for (let i = (b.get(k) || 0); i < n; i++) missing.push(JSON.parse(k));
    for (const [k, n] of b) for (let i = (a.get(k) || 0); i < n; i++) extra.push(JSON.parse(k));
    detail = [missing.length ? `Missing: ${few(missing)}.` : "", extra.length ? `New: ${few(extra)}.` : ""].filter(Boolean).join(" ");
  }
  const head = expected.rowCount !== result.rowCount
    ? `Expected ${expected.rowCount} row${expected.rowCount === 1 ? "" : "s"}, got ${result.rowCount}.`
    : "Same number of rows, but the values changed.";
  return { pass: false, reason: [head, detail].filter(Boolean).join(" ") };
}

// Saved or imported tests are untrusted: keep well-formed ones only.
export function cleanTests(list) {
  const strs = (a) => Array.isArray(a) && a.every((x) => typeof x === "string");
  const rowsOk = (rows) => Array.isArray(rows) && rows.every((r) => Array.isArray(r) && r.every((v) => v === null || typeof v === "string"));
  return (Array.isArray(list) ? list : []).map((t) => {
    const e = t?.expected;
    if (typeof t?.sql !== "string" || !t.sql.trim() || !e || !strs(e.columns) || !Number.isFinite(e.rowCount) || typeof e.hash !== "string" || !rowsOk(e.sample)) return null;
    return {
      id: String(t.id || Math.random().toString(36).slice(2, 9)),
      name: String(t.name || "Untitled test").slice(0, 200),
      sql: t.sql.slice(0, 20000),
      dataKey: typeof t.dataKey === "string" ? t.dataKey : "",
      at: Number.isFinite(t.at) ? t.at : 0,
      expected: { columns: e.columns, rowCount: e.rowCount, command: String(e.command || ""), ordered: !!e.ordered, hash: e.hash, sample: e.sample.slice(0, SAMPLE_ROWS) },
      last: t.last && typeof t.last.pass === "boolean" ? { pass: t.last.pass, reason: String(t.last.reason || ""), at: Number(t.last.at) || 0 } : null
    };
  }).filter(Boolean).slice(0, 100);
}
