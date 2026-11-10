// Sample data for the mock database, made in the browser (no AI request), as rows per table.
// Values come from each column's type and name (email, price, created_at, …). Foreign keys
// point at real parent rows, and about 1 parent in 5 gets no child rows, so questions like
// "customers with no orders" have something to find. The same seed always gives the same data.
// Pure, covered by tests/mock.test.js.
import { colById } from "../schema/model.js";
import { quoteIdent as q, tName, cName } from "../schema/export.js";
import { pgType, kindOf } from "./setup.js";
import { rowsToSql } from "./rows.js";

// Small fast seeded random numbers (mulberry32).
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["Anna", "Ben", "Chloe", "David", "Emma", "Felix", "Grace", "Hana", "Ivan", "Julia", "Kenji", "Linh", "Minh", "Nora",
  "Omar", "Priya", "Quinn", "Rosa", "Sam", "Thao", "Uma", "Victor", "Wei", "Yuki", "Zoe", "Lucas", "Mai", "Arjun"];
const LAST = ["Nguyen", "Smith", "Garcia", "Tanaka", "Kim", "Patel", "Brown", "Tran", "Lopez", "Wilson", "Chen", "Silva", "Khan",
  "Johnson", "Le", "Martin", "Rossi", "Sato", "Park", "Ali", "Novak", "Pham", "Haddad", "Okafor"];
const CITIES = ["Hanoi", "Ho Chi Minh City", "Bangkok", "Singapore", "Tokyo", "Seoul", "Sydney", "London", "Berlin", "Paris",
  "New York", "Toronto", "Madrid", "Dubai", "Mumbai", "Da Nang", "Chiang Mai", "Osaka"];
const COUNTRIES = ["Vietnam", "Thailand", "Singapore", "Japan", "South Korea", "Australia", "United Kingdom", "Germany", "France",
  "United States", "Canada", "Spain", "India"];
const REGIONS = ["North", "South", "East", "West", "Central"];
const STREETS = ["Main St", "Oak Ave", "Lake Rd", "Park Lane", "River St", "Hill Rd", "Market St", "Station Rd"];
const CATEGORIES = ["Coffee", "Tea", "Snacks", "Bakery", "Drinks", "Household"];
const ADJ = ["Classic", "Organic", "Premium", "Fresh", "Daily", "Golden", "Dark", "Light", "Spicy", "Sweet", "Smoky", "Wild"];
const NOUN = ["Espresso", "Green Tea", "Cookies", "Croissant", "Lemonade", "Granola", "Chips", "Latte", "Muffin", "Juice",
  "Bagel", "Chocolate", "Oolong", "Crackers", "Cold Brew", "Soap"];
const COMPANIES = ["Acme", "Globex", "Initech", "Blue River", "Northwind", "Contoso", "Fabrikam", "Lotus Trading", "Red Dune",
  "Silver Oak", "Green Field", "Sunrise Foods", "Harbor Supply", "Peak Goods"];
const STATUS = ["active", "pending", "completed", "cancelled"];
const DEPTS = ["Sales", "Support", "Engineering", "Finance", "Operations", "Marketing"];
const TYPES = ["standard", "premium", "basic"];
const WORDS = ["quick", "note", "about", "order", "sample", "review", "update", "item", "team", "great", "later", "check", "new",
  "value", "delivery", "service", "price", "fresh", "request", "follow", "up"];
const COLORS = ["red", "blue", "green", "black", "white", "yellow"];
const CURRENCIES = ["USD", "EUR", "VND", "THB", "SGD", "JPY"];

const PERSON = /(customer|client|user|member|employee|staff|person|people|author|student|teacher|patient|contact|owner|driver|player|guest|subscriber|buyer|manager|agent|rep|doctor|instructor|account)/;
const PRODUCT = /(product|item|sku|article|menu|dish|book|course|service|goods|inventory|stock|catalog)/;
const COMPANY = /(company|supplier|vendor|organi[sz]ation|brand|merchant|partner|manufacturer|carrier|publisher)/;
const PLACE = /(store|shop|warehouse|branch|location|office|site|outlet|depot)/;

const singular = (s) => s.replace(/ies$/, "y").replace(/(ss|us)$/, "$1").replace(/([^s])s$/, "$1");
const words = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pad = (n, w) => String(n).padStart(w, "0");
const two = (n) => pad(n, 2);

// Values ready for SQL: numbers and booleans as-is, everything else quoted.
function lit(kind, v) {
  if (v === null || v === undefined) return "NULL";
  if ((kind === "int" || kind === "num" || kind === "float") && typeof v === "number") return String(v);
  if (kind === "bool") return v ? "TRUE" : "FALSE";
  return `'${String(v).replace(/'/g, "''")}'`;
}

// Display form of a generated value: what the table shows and what the INSERT statements hold.
function str(ci, v) {
  if (v === null || v === undefined) return null;
  if (ci.kind === "bool") return v ? "true" : "false";
  if (ci.kind === "num" && typeof v === "number") return v.toFixed(ci.s);
  return String(v);
}
// Back from display form, for tables that are kept as they are (edited or imported).
function parse(ci, v) {
  if (v === null || v === undefined) return null;
  if ((ci.kind === "int" || ci.kind === "num" || ci.kind === "float") && /^[-+]?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (ci.kind === "bool") return /^(true|t|yes|y|on|1)$/i.test(v);
  return v;
}

// tables: the draft. keep: { tableId: { rows } } tables to leave as they are (rows already lined up
// with the table's columns); their values are still used as parents for foreign keys.
// → { tableId: { name, cols: [{ id, name }], rows: [[text or null]], source } }
export function generateRows(tables, { rows = 20, seed = 1, today = new Date(), keep = {} } = {}) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const often = (a) => a[Math.floor(Math.pow(r(), 1.8) * a.length)];   // earlier entries more common
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const day = 86400000, now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const isoDate = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`; };
  const isoTs = (t) => { const d = new Date(t); return `${isoDate(t)} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}`; };
  const uuid = () => { const h = () => Math.floor(r() * 16).toString(16); const x = (n) => Array.from({ length: n }, h).join(""); return `${x(8)}-${x(4)}-4${x(3)}-${"89ab"[int(0, 3)]}${x(3)}-${x(12)}`; };
  const sentence = () => cap(Array.from({ length: int(3, 7) }, () => pick(WORDS)).join(" ")) + ".";

  const list = tables.filter((t) => t.columns.length);
  const info = new Map(list.map((t) => [t.id, {
    t, name: tName(t), w: words(tName(t)),
    cols: t.columns.map((c) => ({ c, name: cName(c), w: words(cName(c)).replace(/ /g, "_"), pg: pgType(c.type), ...kindOf(pgType(c.type)),
      ref: c.ref ? colById(tables, c.ref.c) : null })),
    rows: []
  }]));
  for (const ti of info.values()) for (const ci of ti.cols) if (ci.ref && !info.has(ci.ref.t.id)) ci.ref = null;
  for (const ti of info.values()) {
    const k = keep[ti.t.id];
    if (!k) continue;
    ti.kept = true;
    ti.rows = k.rows.map((row) => new Map(ti.cols.map((ci, j) => [ci, parse(ci, row[j] ?? null)])));
  }

  // A value for one column of one row, from its kind and its name.
  function value(ti, ci, i, ctx) {
    const n = ci.w, k = ci.kind, tw = ti.w;
    const pks = ti.cols.filter((x) => x.c.pk);
    if (ci.c.pk && pks.length === 1) {
      if (k === "int") return i + 1;
      if (k === "uuid") return uuid();
      if (k === "text") {
        const pre = ti.name.replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase() || "ID";
        const s = `${pre}-${pad(i + 1, 4)}`;
        return ci.len ? s.slice(-ci.len) : s;
      }
    }
    if (ci.c.pk && k === "int") return i + 1;   // part of a composite key, e.g. line_no
    const range = (lo, hi) => Math.min(hi, ci.max ?? hi);
    switch (k) {
      case "bool": return /(deleted|archived|blocked|banned|cancel|disabled|suspended)/.test(n) ? r() < 0.1 : r() < 0.7;
      case "uuid": return uuid();
      case "json": return JSON.stringify({ id: i + 1, tag: pick(WORDS) });
      case "bytea": return "\\x" + Array.from({ length: 8 }, () => pad(int(0, 255).toString(16), 2)).join("");
      case "interval": return `${int(1, 90)} days`;
      case "time": return `${two(int(7, 21))}:${pick(["00", "15", "30", "45"])}:00`;
      case "date": case "ts": {
        const t = /(birth|dob|born)/.test(n) ? Date.UTC(int(1955, 2006), int(0, 11), int(1, 28))
          : now - int(0, 3 * 365) * day - int(0, 86399) * 1000;
        return k === "date" ? isoDate(t) : isoTs(t);
      }
      case "int": case "num": case "float": {
        let v;
        if (/(salary|wage|income)/.test(n)) v = int(30000, 150000);
        else if (/(price|cost|amount|total|subtotal|balance|fee|revenue|charge|payment|paid|budget|spend)/.test(n)) v = int(100, 50000) / 100;
        else if (/(qty|quantity|units)/.test(n)) v = int(1, 10);
        else if (/(stock|on_hand|count|capacity|seats|inventory)/.test(n)) v = int(0, 200);
        else if (/(rating|stars|score)/.test(n)) v = int(1, 5);
        else if (/(^|_)age($|_)/.test(n)) v = int(18, 80);
        else if (/year/.test(n)) v = int(2018, today.getFullYear());
        else if (/(discount|percent|pct|rate|tax)/.test(n)) v = int(0, 30);
        else if (/(^|_)lat/.test(n)) v = int(-6000, 7000) / 100;
        else if (/(^|_)(lng|lon)/.test(n)) v = int(-18000, 18000) / 100;
        else v = k === "int" ? int(1, 1000) : int(100, 100000) / 100;
        if (k === "int") return Math.min(Math.round(v), range(0, Number.MAX_SAFE_INTEGER));
        if (k === "num") {
          const max = Math.pow(10, ci.p - ci.s) - Math.pow(10, -ci.s);
          return Number(Math.min(v, max).toFixed(ci.s));
        }
        return v;
      }
    }
    // Text: by column name first, then a readable fallback.
    let s;
    const person = PERSON.test(tw);
    if (/(^|_)email/.test(n)) s = `${ctx.first}.${ctx.last}${i + 1}@example.com`.toLowerCase();
    else if (/(first_?name|given_name|fname|forename)/.test(n)) s = ctx.first;
    else if (/(last_?name|surname|family_name|lname)/.test(n)) s = ctx.last;
    else if (/(full_?name|display_name|contact_name)/.test(n)) s = `${ctx.first} ${ctx.last}`;
    else if (/(username|user_name|login|handle|nickname)/.test(n)) s = `${ctx.first}${ctx.last}${i + 1}`.toLowerCase();
    else if (/(phone|mobile|tel|fax)/.test(n)) s = `+1-555-${pad(int(0, 9999), 4)}`;
    else if (/(^|_)city/.test(n)) s = pick(CITIES);
    else if (/country/.test(n)) s = pick(COUNTRIES);
    else if (/(region|province|(^|_)state$|territory|area)/.test(n)) s = pick(REGIONS);
    else if (/(address|street)/.test(n)) s = `${int(1, 999)} ${pick(STREETS)}`;
    else if (/(zip|postal|postcode)/.test(n)) s = pad(int(10000, 99999), 5);
    else if (/(url|website|link|homepage)/.test(n)) s = `https://example.com/${tw.replace(/ /g, "-")}/${i + 1}`;
    else if (/(image|photo|avatar|picture|logo)/.test(n)) s = `https://example.com/img/${tw.replace(/ /g, "-")}-${i + 1}.jpg`;
    else if (/(sku|barcode|(^|_)code$|_code$|(^|_)ref$|_number$|_no$)/.test(n)) s = `${(tw.replace(/[^a-z]/g, "").slice(0, 3) || "ref").toUpperCase()}-${pad(int(1, 99999), 5)}`;
    else if (/(category|genre|segment)/.test(n)) s = often(CATEGORIES);
    else if (/(department|dept|team)/.test(n)) s = pick(DEPTS);
    else if (/(status|stage)/.test(n)) s = pick(STATUS);
    else if (/((^|_)type$|kind|tier|plan|level|class)/.test(n)) s = pick(TYPES);
    else if (/(currency)/.test(n)) s = pick(CURRENCIES);
    else if (/(colou?r)/.test(n)) s = pick(COLORS);
    else if (/(lang|locale)/.test(n)) s = pick(["en", "vi", "th", "ja", "ko", "fr"]);
    else if (/(gender|sex)/.test(n)) s = pick(["female", "male", "other"]);
    else if (/(password|hash|token|secret|salt|key)/.test(n)) s = Array.from({ length: 16 }, () => Math.floor(r() * 16).toString(16)).join("");
    else if (/(company|employer|organi[sz]ation|supplier_name|vendor_name|brand)/.test(n)) s = pick(COMPANIES);
    else if (/(description|notes?|comment|body|content|message|summary|bio|remark|details)/.test(n)) s = sentence();
    else if (/(_at|_on|date|time)$/.test(n)) s = isoTs(now - int(0, 3 * 365) * day);
    else if (/((^|_)name$|title|label)/.test(n)) {
      if (person && !/title/.test(n)) s = `${ctx.first} ${ctx.last}`;
      else if (PRODUCT.test(tw)) s = `${pick(ADJ)} ${pick(NOUN)}`;
      else if (COMPANY.test(tw)) s = pick(COMPANIES);
      else if (PLACE.test(tw)) s = `${pick(CITIES)} ${cap(singular(tw.split(" ").pop()))}`;
      else if (/title/.test(n)) s = cap(sentence().replace(/\.$/, ""));
      else s = `${cap(singular(tw))} ${i + 1}`;
    } else s = `${cap(words(ci.name))} ${i + 1}`;
    return ci.len ? s.slice(0, ci.len) : s;
  }

  // Unique columns (and single-column keys): make a repeated value distinct.
  function distinct(ci, v, seen, i) {
    if (v === null || !seen.has(lit(ci.kind, v))) return v;
    if (ci.kind === "text") {
      for (let k = 2; k < 1000; k++) {
        const tail = `-${i + 1}${k > 2 ? "-" + k : ""}`;
        const s = ci.len ? String(v).slice(0, Math.max(0, ci.len - tail.length)) + tail : v + tail;
        if (!seen.has(lit("text", s))) return s;
      }
    }
    if (ci.kind === "int" || ci.kind === "num" || ci.kind === "float") {
      let x = Number(v);
      for (let k = 0; k < 100000 && seen.has(lit(ci.kind, x)); k++) x = ci.kind === "int" ? x + 1 : Number((x + 0.01).toFixed(2));
      return seen.has(lit(ci.kind, x)) ? undefined : x;
    }
    return undefined;   // can't make it unique (a unique date or boolean): skip the row
  }

  const counts = (ti) => {
    const hasParent = ti.cols.some((ci) => ci.ref && ci.ref.t.id !== ti.t.id);
    return Math.max(1, Math.min(2000, hasParent ? rows * 4 : rows));
  };

  // Pass 1: every column except foreign keys.
  for (const ti of info.values()) {
    if (ti.kept) continue;
    const seen = new Map(ti.cols.map((ci) => [ci, new Set()]));
    const n = counts(ti);
    for (let i = 0; i < n; i++) {
      const ctx = { first: pick(FIRST), last: pick(LAST) };
      const row = new Map();
      let ok = true;
      for (const ci of ti.cols) {
        if (ci.ref) continue;
        let v = value(ti, ci, i, ctx);
        if (ci.c.nullable && !ci.c.pk && !ci.c.unique && r() < 0.05) v = null;
        if (ci.c.unique || (ci.c.pk && ti.cols.filter((x) => x.c.pk).length === 1)) {
          v = distinct(ci, v, seen.get(ci), i);
          if (v === undefined) { ok = false; break; }
        }
        seen.get(ci).add(lit(ci.kind, v));
        row.set(ci, v);
      }
      if (ok) ti.rows.push(row);
    }
  }

  // Parents before children (cycles are fine: constraints are added after the data).
  const order = [], done = new Set();
  const visit = (ti, path = new Set()) => {
    if (done.has(ti.t.id) || path.has(ti.t.id)) return;
    path.add(ti.t.id);
    for (const ci of ti.cols) if (ci.ref && ci.ref.t.id !== ti.t.id) visit(info.get(ci.ref.t.id), path);
    done.add(ti.t.id); order.push(ti);
  };
  for (const ti of info.values()) visit(ti);

  // Pass 2: foreign keys, from the parents' real values. About 1 in 5 parents gets no children.
  for (const ti of order) {
    const fks = ti.cols.filter((ci) => ci.ref);
    if (!fks.length || ti.kept) continue;
    const pkCols = ti.cols.filter((ci) => ci.c.pk);
    const tuples = new Set();
    const uniq = new Map(fks.filter((ci) => ci.c.unique || (ci.c.pk && pkCols.length === 1)).map((ci) => [ci, new Set()]));
    const pools = new Map(fks.map((ci) => {
      const parent = info.get(ci.ref.t.id), pci = parent.cols.find((x) => x.c.id === ci.ref.c.id);
      const vals = [...new Set(parent.rows.map((row) => row.get(pci)).filter((v) => v !== null && v !== undefined))];
      for (let j = vals.length - 1; j > 0; j--) { const k = Math.floor(r() * (j + 1)); [vals[j], vals[k]] = [vals[k], vals[j]]; }
      const used = vals.length > 2 && !uniq.has(ci) ? vals.slice(0, Math.ceil(vals.length * 0.8)) : vals;
      // A key whose type can't hold the parent's values (integer → uuid) gets its own values;
      // the relationship then can't be added, and the build says so.
      const num = (k) => k === "int" || k === "num" || k === "float";
      const fits = ci.kind === "text" || ci.kind === pci.kind || (num(ci.kind) && num(pci.kind) && vals.every((v) => typeof v === "number"));
      return [ci, { used: fits ? used : [], fits, self: parent === ti, pci }];
    }));
    const kept = [];
    ti.rows.forEach((row, i) => {
      for (let attempt = 0; attempt < 30; attempt++) {
        for (const ci of fks) {
          const p = pools.get(ci);
          let v = null;
          const optional = ci.c.nullable && !ci.c.pk;
          if (!p.fits) { row.set(ci, value(ti, ci, i, { first: "A", last: "B" })); continue; }
          if (p.used.length && !(optional && r() < (p.self ? 0.3 : 0.1))) {
            v = p.used[Math.floor(Math.pow(r(), 1.4) * p.used.length)];   // some parents get many rows
            if (p.self && v === row.get(p.pci)) v = optional ? null : v;
          }
          row.set(ci, v);
        }
        const bad = fks.some((ci) => row.get(ci) === null && (!ci.c.nullable || ci.c.pk))
          || [...uniq].some(([ci, s]) => row.get(ci) !== null && s.has(lit(ci.kind, row.get(ci))));
        const tuple = pkCols.length > 1 ? JSON.stringify(pkCols.map((ci) => row.get(ci))) : null;
        if (bad || (tuple && tuples.has(tuple))) continue;
        for (const [ci, s] of uniq) if (row.get(ci) !== null) s.add(lit(ci.kind, row.get(ci)));
        if (tuple) tuples.add(tuple);
        kept.push(row);
        return;
      }
    });
    ti.rows = kept;
  }

  const out = {};
  for (const ti of order) out[ti.t.id] = {
    name: ti.name, cols: ti.cols.map((ci) => ({ id: ci.c.id, name: ci.name })),
    rows: ti.rows.map((row) => ti.cols.map((ci) => str(ci, row.get(ci)))),
    source: ti.kept ? keep[ti.t.id].source || "edited" : "generated"
  };
  return out;
}

// Generated data as an INSERT script, plus row counts by table name.
export function generateData(tables, opts = {}) {
  const data = generateRows(tables, opts);
  const counts = {};
  for (const d of Object.values(data)) counts[d.name] = d.rows.length;
  return { sql: rowsToSql(tables, data, `generated from the draft schema (seed ${opts.seed ?? 1})`), counts, data };
}
