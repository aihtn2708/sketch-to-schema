import { safeId } from "../util.js";
// Diagram geometry: table card sizes, relationships, automatic arrangement and connector paths.
// Pure functions (no page access), covered by tests/diagram.test.js.

export const HEAD_H = 36, ROW_H = 28, PAD_X = 12, KEY_W = 18, MIN_W = 190, GAP_X = 120, GAP_Y = 40;

// measure(text, kind) → width in px, where kind is "head" (table name), "name" (column) or "type".
export function tableSize(t, measure) {
  const head = measure(t.name || "untitled", "head") + 2 * PAD_X + 24;
  let row = 0;
  for (const c of t.columns) row = Math.max(row, KEY_W + measure(c.name || "untitled", "name") + 28 + measure(c.type || "text", "type") + 2 * PAD_X);
  return { w: Math.ceil(Math.max(MIN_W, head, row)), h: HEAD_H + Math.max(1, t.columns.length) * ROW_H };
}

// Every foreign key as { id, from: {t, c, i}, to: {t, c, i} }: from = the referencing column (the "many" side).
export function relations(tables) {
  const where = new Map();
  for (const t of tables) t.columns.forEach((c, i) => where.set(c.id, { t: t.id, c: c.id, i }));
  const out = [];
  for (const t of tables) t.columns.forEach((c, i) => {
    const to = c.ref && where.get(c.ref.c);
    if (to) out.push({ id: c.id, from: { t: t.id, c: c.id, i }, to });
  });
  return out;
}

// Referenced tables on the left, the tables pointing at them further right.
// Within a column, tables are ordered to sit near the tables they point at.
export function autoLayout(tables, sizes) {
  const parents = new Map(tables.map((t) => [t.id, new Set()]));
  for (const r of relations(tables)) if (r.from.t !== r.to.t) parents.get(r.from.t).add(r.to.t);
  const level = new Map(tables.map((t) => [t.id, 0]));
  for (let pass = 0; pass < tables.length; pass++) {      // longest path, capped so cycles stop
    let changed = false;
    for (const t of tables) for (const p of parents.get(t.id)) {
      const L = level.get(p) + 1;
      if (L > level.get(t.id) && L < tables.length) { level.set(t.id, L); changed = true; }
    }
    if (!changed) break;
  }
  const columns = [];
  tables.forEach((t) => (columns[level.get(t.id)] ||= []).push(t));
  const order = new Map(), pos = {};
  let x = 0;
  for (const col of columns) {
    if (!col) continue;
    const rank = (t) => { const ps = [...parents.get(t.id)].filter((p) => order.has(p)); return ps.length ? ps.reduce((a, p) => a + order.get(p), 0) / ps.length : Infinity; };
    col.sort((a, b) => rank(a) - rank(b));
    let y = 0;
    col.forEach((t, i) => { pos[t.id] = { x, y }; order.set(t.id, i); y += sizes[t.id].h + GAP_Y; });
    x += Math.max(...col.map((t) => sizes[t.id].w)) + GAP_X;
  }
  return pos;
}

// Place tables that have no position yet, to the right of the ones that do.
export function placeMissing(tables, sizes, pos) {
  const missing = tables.filter((t) => !pos[t.id]);
  if (!missing.length) return pos;
  const placed = tables.filter((t) => pos[t.id]);
  const out = { ...pos };
  if (!placed.length) return autoLayout(tables, sizes);
  const startX = Math.max(...placed.map((t) => pos[t.id].x + sizes[t.id].w)) + GAP_X;
  const fresh = autoLayout(missing, sizes);
  for (const t of missing) out[t.id] = { x: fresh[t.id].x + startX, y: fresh[t.id].y + Math.min(...placed.map((p) => pos[p.id].y)) };
  return out;
}

// The connector between two column rows: leaves and enters cards on the facing sides,
// or loops out on the right when the cards overlap horizontally (including a table pointing at itself).
export function edgeGeometry(r, pos, sizes) {
  const A = pos[r.from.t], B = pos[r.to.t], sa = sizes[r.from.t], sb = sizes[r.to.t];
  const ya = A.y + HEAD_H + r.from.i * ROW_H + ROW_H / 2;
  const yb = B.y + HEAD_H + r.to.i * ROW_H + ROW_H / 2;
  let xa, xb, da, db;
  if (A.x + sa.w + 24 < B.x) { xa = A.x + sa.w; da = 1; xb = B.x; db = -1; }
  else if (B.x + sb.w + 24 < A.x) { xa = A.x; da = -1; xb = B.x + sb.w; db = 1; }
  else { xa = A.x + sa.w; da = 1; xb = B.x + sb.w; db = 1; }
  const reach = Math.max(48, Math.abs(xb - xa) / 2);
  return {
    d: `M${xa},${ya} C${xa + da * reach},${ya} ${xb + db * reach},${yb} ${xb},${yb}`,
    a: { x: xa, y: ya, dir: da },
    b: { x: xb, y: yb, dir: db }
  };
}

// The area all cards cover.
export function bounds(tables, pos, sizes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of tables) {
    const p = pos[t.id], s = sizes[t.id];
    if (!p || !s) continue;
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + s.w); y1 = Math.max(y1, p.y + s.h);
  }
  return x0 === Infinity ? null : { x0, y0, x1, y1 };
}

// Saved or imported positions are untrusted: keep only {id: {x, y}} with finite numbers.
export function cleanPositions(pos) {
  const out = {};
  if (!pos || typeof pos !== "object") return out;
  for (const [id, p] of Object.entries(pos)) {
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) out[safeId(id)] = { x: p.x, y: p.y };
  }
  return out;
}
