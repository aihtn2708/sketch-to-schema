// Checking generated SQL against the schema: tables after FROM/JOIN and alias.column references.
// A lightweight scan, not a full SQL parser; unqualified columns aren't checked.
// Pure, covered by tests/query.test.js.

const KEYWORDS = new Set(["where", "on", "left", "right", "inner", "outer", "full", "cross", "join", "group", "order", "limit",
  "having", "union", "except", "intersect", "using", "as", "natural", "lateral", "window", "offset", "fetch", "for", "select",
  "and", "or", "not", "exists", "in", "set", "values", "returning", "when", "then", "else", "end", "top", "with"]);

const NAME = String.raw`(?:"[^"]+"|\x60[^\x60]+\x60|\[[^\]]+\]|\w+)`;
const id = (s) => s.replace(/^["`[]|["`\]]$/g, "").toLowerCase();

export function checkSql(sql, tables) {
  const known = new Map(tables.map((t) => [t.name.toLowerCase(), new Set(t.columns.map((c) => c.name.toLowerCase()))]));
  const clean = String(sql || "")
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:[^']|'')*'/g, "''")
    // FROM inside function calls isn't a table: EXTRACT(year FROM x), SUBSTRING(x FROM 2), TRIM(x FROM y), IS DISTINCT FROM.
    .replace(/\b(extract|substring|trim|overlay|position)\s*\([^()]*\)/gi, "fn()")
    .replace(/\bis\s+(not\s+)?distinct\s+from\b/gi, " = ");

  const ctes = new Set();
  for (const m of clean.matchAll(new RegExp(String.raw`(?:\bwith(?:\s+recursive)?|,)\s+(${NAME})\s+as\s*\(`, "gi"))) ctes.add(id(m[1]));

  const alias = new Map();          // alias or table name → table name (null = a CTE or subquery)
  const unknownTables = new Set();
  for (const m of clean.matchAll(new RegExp(String.raw`\b(?:from|join|update|into)\s+((?:${NAME}\.)*${NAME})(?:\s+(?:as\s+)?(${NAME}))?`, "gi"))) {
    const name = id(m[1].split(".").pop());
    const al = m[2] ? id(m[2]) : null;
    const target = ctes.has(name) ? null : name;
    if (target && !known.has(target)) unknownTables.add(target);
    alias.set(name, target);
    if (al && !KEYWORDS.has(al)) alias.set(al, target);
  }
  // ") AS x" after a subquery: its columns can't be checked.
  for (const m of clean.matchAll(new RegExp(String.raw`\)\s+(?:as\s+)?(${NAME})`, "gi"))) {
    const a = id(m[1]);
    if (!KEYWORDS.has(a) && !alias.has(a)) alias.set(a, null);
  }

  const unknownColumns = new Set();
  for (const m of clean.matchAll(new RegExp(String.raw`(${NAME})\.(${NAME})`, "g"))) {
    const t = alias.get(id(m[1]));
    if (!t || !known.has(t)) continue;           // not a table we know (schema name, CTE, subquery)
    const col = id(m[2]);
    if (!known.get(t).has(col)) unknownColumns.add(`${t}.${col}`);
  }
  return { unknownTables: [...unknownTables], unknownColumns: [...unknownColumns] };
}
