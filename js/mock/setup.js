// The mock database's schema: draft tables → PostgreSQL that is sure to run.
// Sketched types ("int", "datetime", "string", "money") become real PostgreSQL types, and
// foreign keys are added after the sample data is loaded, so table order never matters.
// Pure, covered by tests/mock.test.js.
import { colById } from "../schema/model.js";
import { quoteIdent as q, tName, cName } from "../schema/export.js";

const KEEP = new Set(["integer", "bigint", "smallint", "text", "boolean", "date", "time", "timestamp", "timestamptz", "uuid",
  "json", "jsonb", "bytea", "real", "double precision", "interval", "serial", "bigserial", "numeric"]);

// Any sketched type → a PostgreSQL type.
export function pgType(raw) {
  const s = String(raw || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return "text";
  const len = s.match(/^(?:n?varchar|varchar2|character varying|n?char|character|string)\s*\(\s*(\d+)\s*\)$/);
  if (len) return (/^n?char|^character$/.test(s) && !/varying/.test(s) ? "char" : "varchar") + `(${Math.min(+len[1], 10485760) || 1})`;
  const num = s.match(/^(?:decimal|numeric|number|dec)\s*\(\s*(\d+)\s*(?:,\s*(\d+)\s*)?\)$/);
  if (num) { const p = Math.min(Math.max(+num[1], 1), 1000), sc = Math.min(+(num[2] || 0), p); return `numeric(${p},${sc})`; }
  const base = s.replace(/\s*\(.*\)$/, "").replace(/ unsigned$/, "");
  if (/^(int|integer|int4|mediumint|number)$/.test(base)) return "integer";
  if (/^(bigint|int8|long)$/.test(base)) return "bigint";
  if (/^(smallint|tinyint|int2|byte)$/.test(base)) return "smallint";
  if (/^(serial|serial4|autoincrement|auto_increment|identity)$/.test(base)) return "integer";
  if (/^(bigserial|serial8)$/.test(base)) return "bigint";
  if (/^(decimal|numeric|dec)$/.test(base)) return "numeric(12,2)";
  if (/^(money|currency|smallmoney)$/.test(base)) return "numeric(12,2)";
  if (/^(float|double|double precision|float8|decimal float)$/.test(base)) return "double precision";
  if (/^(real|float4)$/.test(base)) return "real";
  if (/^(bool|boolean|bit|yes\/no|flag)$/.test(base)) return "boolean";
  if (/^(datetime|datetime2|smalldatetime|timestamp|timestamp without time zone)$/.test(base)) return "timestamp";
  if (/^(timestamptz|timestamp with time zone|datetimeoffset)$/.test(base)) return "timestamptz";
  if (/^(time|time without time zone)$/.test(base)) return "time";
  if (/^(uuid|guid|uniqueidentifier)$/.test(base)) return "uuid";
  if (/^(blob|binary|varbinary|longblob|image|bytea)$/.test(base)) return "bytea";
  if (/^(string|varchar|nvarchar|char|nchar|character varying|longtext|mediumtext|tinytext|clob|enum|set|citext|email|url|text|ntext|varchar2)$/.test(base)) return "text";
  return KEEP.has(base) ? base : "text";
}

// What kind of value a PostgreSQL type holds, for the data generator.
export function kindOf(pg) {
  const m = pg.match(/^(varchar|char)\((\d+)\)$/);
  if (m) return { kind: "text", len: +m[2] };
  const n = pg.match(/^numeric\((\d+),(\d+)\)$/);
  if (n) return { kind: "num", p: +n[1], s: +n[2] };
  if (pg === "numeric") return { kind: "num", p: 12, s: 2 };
  if (pg === "integer" || pg === "serial") return { kind: "int", max: 2147483647 };
  if (pg === "bigint" || pg === "bigserial") return { kind: "int", max: Number.MAX_SAFE_INTEGER };
  if (pg === "smallint") return { kind: "int", max: 32767 };
  if (pg === "real" || pg === "double precision") return { kind: "float" };
  return { kind: { boolean: "bool", date: "date", timestamp: "ts", timestamptz: "ts", time: "time", uuid: "uuid",
    json: "json", jsonb: "json", bytea: "bytea", interval: "interval" }[pg] || "text" };
}

const usable = (tables) => tables.filter((t) => t.columns.length);

// CREATE TABLE statements with keys, NOT NULL and UNIQUE, but no foreign keys yet.
export function createSql(tables) {
  return usable(tables).map((t) => {
    const pks = t.columns.filter((c) => c.pk);
    const lines = t.columns.map((c) => {
      let l = `  ${q(cName(c))} ${pgType(c.type)}`;
      if (pks.length === 1 && c.pk) l += " PRIMARY KEY"; else if (!c.nullable || c.pk) l += " NOT NULL";
      if (c.unique && !(pks.length === 1 && c.pk)) l += " UNIQUE";
      return l;
    });
    if (pks.length > 1) lines.push(`  PRIMARY KEY (${pks.map((c) => q(cName(c))).join(", ")})`);
    return `CREATE TABLE ${q(tName(t))} (\n${lines.join(",\n")}\n);`;
  }).join("\n\n");
}

// One step per foreign key, added after the data so it is checked against every row.
export function fkSteps(tables) {
  const out = [];
  for (const t of usable(tables)) for (const c of t.columns) {
    const hit = c.ref && colById(tables, c.ref.c);
    if (!hit) continue;
    out.push({
      label: `${tName(t)}.${cName(c)} → ${tName(hit.t)}.${cName(hit.c)}`,
      sql: `ALTER TABLE ${q(tName(t))} ADD FOREIGN KEY (${q(cName(c))}) REFERENCES ${q(tName(hit.t))} (${q(cName(hit.c))});`
    });
  }
  return out;
}

// Types that were changed to run on PostgreSQL ("orders.created: datetime → timestamp"),
// leaving out plain spellings of the same type (int → integer, string → text).
const SAME = { integer: ["int", "int4", "serial", "serial4"], bigint: ["int8", "bigserial"], smallint: ["int2"], boolean: ["bool"],
  text: ["string", "varchar", "character varying"], "double precision": ["double", "float8", "float"], real: ["float4"], timestamptz: ["timestamp with time zone"] };
export function typeNotes(tables) {
  const out = [];
  for (const t of usable(tables)) for (const c of t.columns) {
    const raw = c.type.trim(), pg = pgType(raw);
    const low = raw.toLowerCase().replace(/\s+/g, " ");
    if (raw && low.replace(/ /g, "") !== pg.replace(/ /g, "") && !SAME[pg]?.includes(low)) out.push(`${tName(t)}.${cName(c)}: ${raw} → ${pg}`);
  }
  return out;
}

// Row counts for every table in one query.
export function countSql(tables) {
  const list = usable(tables);
  if (!list.length) return "";
  return list.map((t) => `SELECT '${tName(t).replace(/'/g, "''")}' AS t, count(*)::int AS n FROM ${q(tName(t))}`).join("\nUNION ALL\n") + ";";
}
