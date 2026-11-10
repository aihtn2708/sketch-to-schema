// The mock database's saved part of a project. Pure, covered by tests/mock.test.js.
//   mode        "rows": the sample data is the rows in `tables` (edited in the Table view)
//               "sql":  the sample data is the script in `data` (edited in the SQL view)
//   tables      { tableId: { name, cols, rows, source } }, see rows.js
//   tablesFor   schema fingerprint the rows were last lined up with
//   rows, seed  settings for generated data
//   query       the SQL being edited; tests: saved tests
import { cleanTests } from "./compare.js";
import { cleanTables } from "./rows.js";

export const defaultMock = () => ({ mode: "rows", tables: {}, tablesFor: "", rows: 20, seed: 1, data: "", dataSchema: "", query: "", tests: [] });

// Saved or imported projects are untrusted: rebuild field by field.
export function cleanMock(m) {
  const d = defaultMock();
  if (!m || typeof m !== "object") return d;
  const data = typeof m.data === "string" ? m.data.slice(0, 5_000_000) : "";
  // Projects saved before the Table view kept hand-edited SQL with edited: true; keep using it.
  const mode = m.mode === "sql" || m.mode === "rows" ? m.mode : (m.edited && data.trim() ? "sql" : "rows");
  return {
    mode: mode === "sql" && !data.trim() ? "rows" : mode,
    tables: cleanTables(m.tables),
    tablesFor: typeof m.tablesFor === "string" ? m.tablesFor : "",
    rows: Number.isInteger(m.rows) && m.rows >= 1 && m.rows <= 500 ? m.rows : d.rows,
    seed: Number.isInteger(m.seed) && m.seed >= 1 ? m.seed : d.seed,
    data,
    dataSchema: typeof m.dataSchema === "string" ? m.dataSchema : "",
    query: typeof m.query === "string" ? m.query.slice(0, 50000) : "",
    tests: cleanTests(m.tests)
  };
}
