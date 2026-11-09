// Board shapes: drawing them, hit-testing them, and checking saved ones.
// No page access; drawing functions take a canvas context. cleanShapes and distToSeg are covered by tests.

export const INK = "#1f2328";

function crowFoot(ctx, ux, uy, px, py, sf) {
  const bx = px - ux * 24 * sf, by = py - uy * 24 * sf;
  for (const s of [-1, 0, 1]) {
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(px - uy * 13 * sf * s, py + ux * 13 * sf * s); ctx.stroke();
  }
}

export function paintShape(ctx, s, sf = 1) {
  ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (s.type === "pen") {
    ctx.lineWidth = 3 * sf; ctx.beginPath();
    s.pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    if (s.pts.length === 1) ctx.lineTo(s.pts[0][0] + 0.1, s.pts[0][1]);
    ctx.stroke();
  } else if (s.type === "box") {
    ctx.lineWidth = 3 * sf;
    ctx.strokeRect(Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1));
  } else if (s.type === "line" || s.type === "many") {
    ctx.lineWidth = 2.6 * sf; ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
    const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    if (s.type === "many" && L > 30 * sf) {
      const ux = (s.x2 - s.x1) / L, uy = (s.y2 - s.y1) / L;
      crowFoot(ctx, ux, uy, s.x2, s.y2, sf);
      // "one" end: a short bar across the line
      const ox = s.x1 + ux * 14 * sf, oy = s.y1 + uy * 14 * sf;
      ctx.beginPath(); ctx.moveTo(ox - uy * 11 * sf, oy + ux * 11 * sf); ctx.lineTo(ox + uy * 11 * sf, oy - ux * 11 * sf); ctx.stroke();
    }
  } else if (s.type === "text") {
    ctx.font = `${s.size || 30}px Kalam, "Comic Sans MS", cursive`; ctx.textBaseline = "alphabetic"; ctx.fillText(s.text, s.x, s.y);
  }
}

export function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / L2)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function textWidth(ctx, s) { ctx.font = `${s.size || 30}px Kalam, cursive`; return ctx.measureText(s.text).width; }

// Is the point (px, py) within tol of this shape? Used by the eraser.
export function hitShape(ctx, s, px, py, tol = 12) {
  if (s.type === "pen") return s.pts.some(([a, b], i) => (i ? distToSeg(px, py, s.pts[i - 1][0], s.pts[i - 1][1], a, b) < tol : Math.hypot(px - a, py - b) < tol));
  if (s.type === "line" || s.type === "many") return distToSeg(px, py, s.x1, s.y1, s.x2, s.y2) < tol;
  if (s.type === "box") {
    const x1 = Math.min(s.x1, s.x2), x2 = Math.max(s.x1, s.x2), y1 = Math.min(s.y1, s.y2), y2 = Math.max(s.y1, s.y2);
    return [[x1, y1, x2, y1], [x2, y1, x2, y2], [x2, y2, x1, y2], [x1, y2, x1, y1]].some(([a, b, c, d]) => distToSeg(px, py, a, b, c, d) < tol);
  }
  if (s.type === "text") {
    const w = textWidth(ctx, s), h = s.size || 30;
    return px >= s.x - 4 && px <= s.x + w + 4 && py >= s.y - h && py <= s.y + 8;
  }
  return false;
}

// The area actually drawn on, in canvas pixels (null for an empty board).
export function shapesBounds(ctx, shapes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const s of shapes) {
    if (s.type === "pen") s.pts.forEach(([x, y]) => add(x, y));
    else if (s.type === "text") { add(s.x, s.y - (s.size || 30)); add(s.x + textWidth(ctx, s), s.y + 8); }
    else { add(s.x1, s.y1); add(s.x2, s.y2); }
  }
  return x0 === Infinity ? null : { x0, y0, x1, y1 };
}

// Saved or imported drawings are untrusted: keep only well-formed shapes.
const num = (v) => typeof v === "number" && isFinite(v);
export function cleanShapes(list) {
  return (Array.isArray(list) ? list : []).filter((s) => s && (
    (s.type === "pen" && Array.isArray(s.pts) && s.pts.every((pt) => Array.isArray(pt) && num(pt[0]) && num(pt[1]))) ||
    (["box", "line", "many"].includes(s.type) && [s.x1, s.y1, s.x2, s.y2].every(num)) ||
    (s.type === "text" && typeof s.text === "string" && num(s.x) && num(s.y))
  )).map((s) => (s.type === "text" ? { ...s, size: [24, 30, 40].includes(s.size) ? s.size : 30 } : s));
}
