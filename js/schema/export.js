// Draft tables → PostgreSQL DDL and DBML. Pure functions, covered by tests/export.test.js.
import { colById } from "./model.js";

const RESERVED = new Set(["user", "order", "group", "table", "select", "from", "where", "limit", "offset", "column", "check",
  "default", "references", "primary", "key", "end", "to", "desc", "asc", "all", "and", "or", "not", "null", "true", "false",
  "case", "when", "grant", "role"]);
const q = (n) => (/^[a-z_][a-z0-9_]*$/.test(n) && !RESERVED.has(n) ? n : `"${String(n).replace(/"/g, '""')}"`);
const tName = (t) => t.name.trim() || "untitled_table";
const cName = (c) => c.name.trim() || "untitled_column";
const cType = (c) => c.type.trim() || "text";
// Shared with the mock database (js/mock/setup.js), so both write names the same way.
export { q as quoteIdent, tName, cName };

export function toDDL(tables) {
  if (!tables.length) return "-- No tables yet.";
  const out = [], fks = [];
  for (const t of tables) {
    const pks = t.columns.filter((c) => c.pk);
    const lines = t.columns.map((c) => {
      let l = `  ${q(cName(c))} ${cType(c)}`;
      if (pks.length === 1 && c.pk) l += " PRIMARY KEY"; else if (!c.nullable) l += " NOT NULL";
      if (c.unique && !(pks.length === 1 && c.pk)) l += " UNIQUE";
      return l;
    });
    if (pks.length > 1) lines.push(`  PRIMARY KEY (${pks.map((c) => q(cName(c))).join(", ")})`);
    out.push(`CREATE TABLE ${q(tName(t))} (\n${lines.join(",\n")}\n);`);
    // Foreign keys go last, so table order never matters.
    for (const c of t.columns) if (c.ref) {
      const hit = colById(tables, c.ref.c);
      if (hit) fks.push(`ALTER TABLE ${q(tName(t))}\n  ADD FOREIGN KEY (${q(cName(c))}) REFERENCES ${q(tName(hit.t))} (${q(cName(hit.c))});`);
    }
  }
  return out.join("\n\n") + (fks.length ? "\n\n" + fks.join("\n\n") : "") + "\n";
}

export function toDBML(tables) {
  if (!tables.length) return "// No tables yet.";
  const dq = (n) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(n) ? n : `"${n.replace(/"/g, '\\"')}"`);
  return tables.map((t) => {
    const pks = t.columns.filter((c) => c.pk);
    const lines = t.columns.map((c) => {
      const s = [];
      if (pks.length === 1 && c.pk) s.push("pk"); else if (!c.nullable) s.push("not null");
      if (c.unique && !(pks.length === 1 && c.pk)) s.push("unique");
      if (c.ref) { const hit = colById(tables, c.ref.c); if (hit) s.push(`ref: > ${dq(tName(hit.t))}.${dq(cName(hit.c))}`); }
      return `  ${dq(cName(c))} ${cType(c).replace(/\s+/g, "")}${s.length ? ` [${s.join(", ")}]` : ""}`;
    });
    if (pks.length > 1) lines.push(`\n  indexes {\n    (${pks.map((c) => dq(cName(c))).join(", ")}) [pk]\n  }`);
    return `Table ${dq(tName(t))} {\n${lines.join("\n")}\n}`;
  }).join("\n\n") + "\n";
}
