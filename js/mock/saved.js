// The mock database's saved part of a project: sample data settings and script, the query
// being edited, and the tests. Pure, covered by tests/mock.test.js.
import { cleanTests } from "./compare.js";

export const defaultMock = () => ({ rows: 20, seed: 1, data: "", dataSchema: "", edited: false, query: "", tests: [] });

// Saved or imported projects are untrusted: rebuild field by field.
export function cleanMock(m) {
  const d = defaultMock();
  if (!m || typeof m !== "object") return d;
  return {
    rows: Number.isInteger(m.rows) && m.rows >= 1 && m.rows <= 500 ? m.rows : d.rows,
    seed: Number.isInteger(m.seed) && m.seed >= 1 ? m.seed : d.seed,
    data: typeof m.data === "string" ? m.data.slice(0, 5_000_000) : "",
    dataSchema: typeof m.dataSchema === "string" ? m.dataSchema : "",
    edited: !!m.edited,
    query: typeof m.query === "string" ? m.query.slice(0, 50000) : "",
    tests: cleanTests(m.tests)
  };
}
