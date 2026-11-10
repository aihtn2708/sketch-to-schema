// The Diagram view: the draft drawn as table cards with relationship lines (dbdiagram style).
// Drag tables to move them, drag the background to move around, Ctrl/⌘ + scroll to zoom,
// double-click a table to edit it.
import { $, esc, store, slug } from "../util.js";
import { state, on, emit } from "../state.js";
import { expandTable } from "../schema/editor.js";
import { HEAD_H, ROW_H, PAD_X, KEY_W, tableSize, relations, autoLayout, placeMissing, edgeGeometry, bounds } from "./layout.js";

const wrap = $("#dgWrap");
const svg = $("#diagramSvg");
const FONT_HEAD = '600 14px "Schibsted Grotesk", "Segoe UI", system-ui, sans-serif';
const FONT_NAME = '600 12.5px "IBM Plex Mono", ui-monospace, Menlo, monospace';
const FONT_TYPE = '400 12px "IBM Plex Mono", ui-monospace, Menlo, monospace';
const MONO = `'IBM Plex Mono', ui-monospace, Menlo, monospace`;
const SANS = `'Schibsted Grotesk', 'Segoe UI', system-ui, sans-serif`;
const KEY_PATH = "M5.5 8.5a3 3 0 1 1 2.2 2.9L6.4 12.7H5v1.3H3.7v1.3H2v-1.7l3.6-3.6A3 3 0 0 1 5.5 8.5z";

let dv = { x: 40, y: 40, k: 1 };     // screen = diagram position × k + (x, y)
let needsFit = true;
let visible = false;
let sizes = {};
let drag = null;                       // { kind: "table" | "pan", ... }
let hot = null;                        // table id under the pointer
let lastDown = {};                     // for double-click detection

/* ---------- Measuring ---------- */
const mctx = document.createElement("canvas").getContext("2d");
function measure(text, kind) {
  mctx.font = kind === "head" ? FONT_HEAD : kind === "name" ? FONT_NAME : FONT_TYPE;
  return mctx.measureText(text).width;
}

// Colors come from the page theme, written into the SVG so downloads look the same.
function palette() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  return { bg: v("--sunk"), card: v("--surface"), ink: v("--ink"), muted: v("--muted"), line: v("--line"),
    accent: v("--accent"), accentInk: v("--accent-ink"), check: v("--check") };
}

/* ---------- Building the SVG ---------- */
function prepare() {
  const tables = state.schema.tables;
  sizes = Object.fromEntries(tables.map((t) => [t.id, tableSize(t, measure)]));
  // Forget positions of tables that no longer exist; place new ones.
  const pos = {};
  for (const t of tables) if (state.diagram.pos[t.id]) pos[t.id] = state.diagram.pos[t.id];
  if (!Object.keys(pos).length) needsFit = true;      // a fresh draft: lay it out and show all of it
  state.diagram.pos = placeMissing(tables, sizes, pos);
}

function cardSvg(t, p, c) {
  const { w, h } = sizes[t.id];
  const isHot = hot === t.id;
  let rows = "";
  t.columns.forEach((col, i) => {
    const y = HEAD_H + i * ROW_H, mid = y + ROW_H / 2;
    if (i % 2 === 1) rows += `<rect x="1" y="${y}" width="${w - 2}" height="${ROW_H}" fill="${c.bg}" fill-opacity="0.6"/>`;
    if (i > 0) rows += `<line x1="1" y1="${y}" x2="${w - 1}" y2="${y}" stroke="${c.line}" stroke-width="1"/>`;
    if (col.pk) rows += `<path d="${KEY_PATH}" transform="translate(${PAD_X - 2},${mid - 9})" fill="none" stroke="${c.accent}" stroke-width="1.4" stroke-linejoin="round"/>`;
    rows += `<text x="${PAD_X + KEY_W}" y="${mid}" dominant-baseline="central" font-family="${MONO}" font-size="12.5" font-weight="${col.pk ? 600 : 500}" fill="${col.flags.length ? c.check : c.ink}">${esc(col.name || "untitled")}</text>`;
    rows += `<text x="${w - PAD_X}" y="${mid}" dominant-baseline="central" text-anchor="end" font-family="${MONO}" font-size="12" fill="${c.muted}"${col.typeGuessed ? ' font-style="italic"' : ""}>${esc(col.type || "text")}</text>`;
  });
  if (!t.columns.length) rows = `<text x="${PAD_X}" y="${HEAD_H + ROW_H / 2}" dominant-baseline="central" font-family="${SANS}" font-size="12" fill="${c.muted}">No columns</text>`;
  return `<g class="dg-table" data-id="${esc(t.id)}" transform="translate(${p.x},${p.y})">
    <rect width="${w}" height="${h}" rx="8" fill="${c.card}" stroke="${isHot ? c.accent : c.line}" stroke-width="${isHot ? 1.6 : 1}"/>
    <path d="M0,8 a8,8 0 0 1 8,-8 h${w - 16} a8,8 0 0 1 8,8 v${HEAD_H - 8} h-${w} z" fill="${t.flags.length ? c.check : c.accent}"/>
    <text x="${PAD_X}" y="${HEAD_H / 2}" dominant-baseline="central" font-family="${SANS}" font-size="14" font-weight="600" fill="${c.accentInk}">${esc(t.name || "untitled")}</text>
    ${rows}
  </g>`;
}

function edgesSvg(c) {
  const pos = state.diagram.pos;
  let out = "";
  for (const r of relations(state.schema.tables)) {
    if (!pos[r.from.t] || !pos[r.to.t]) continue;
    const g = edgeGeometry(r, pos, sizes);
    const lit = hot && (hot === r.from.t || hot === r.to.t);
    const color = lit ? c.accent : c.muted;
    // "*" = many (the column holding the foreign key), "1" = the column it references.
    const label = (pt, text) => `<text x="${pt.x + pt.dir * 9}" y="${pt.y - 7}" text-anchor="${pt.dir > 0 ? "start" : "end"}" font-family="${SANS}" font-size="12" font-weight="600" fill="${color}">${text}</text>`;
    out += `<g class="dg-edge"><path d="${g.d}" fill="none" stroke="${color}" stroke-width="${lit ? 2.2 : 1.5}"/>`
      + `<circle cx="${g.a.x}" cy="${g.a.y}" r="2.6" fill="${color}"/><circle cx="${g.b.x}" cy="${g.b.y}" r="2.6" fill="${color}"/>`
      + label(g.a, "*") + label(g.b, "1") + `</g>`;
  }
  return out;
}

function contentSvg(c) {
  const pos = state.diagram.pos;
  return `<g>${edgesSvg(c)}</g><g>${state.schema.tables.map((t) => cardSvg(t, pos[t.id], c)).join("")}</g>`;
}

export function renderDiagram() {
  if (!visible) return;
  const empty = !state.schema.tables.length;
  $("#dgEmpty").hidden = !empty;
  svg.style.display = empty ? "none" : "";
  if (empty) return;
  prepare();
  if (needsFit && wrap.clientWidth) { needsFit = false; fit(false); }
  const c = palette();
  svg.innerHTML = `<g transform="translate(${dv.x},${dv.y}) scale(${dv.k})">${contentSvg(c)}</g>`;
  // The dot background moves and scales with the view.
  const g = 20 * dv.k;
  wrap.style.backgroundSize = `${g}px ${g}px`;
  wrap.style.backgroundPosition = `${dv.x % g}px ${dv.y % g}px`;
  $("#dgZoomVal").textContent = `${Math.round(dv.k * 100)}%`;
}

/* ---------- View ---------- */
function fit(draw = true) {
  const b = bounds(state.schema.tables, state.diagram.pos, sizes);
  const W = wrap.clientWidth, H = wrap.clientHeight;
  if (!b || !W) { dv = { x: 40, y: 40, k: 1 }; }
  else {
    const m = 32, bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    const k = Math.max(0.2, Math.min(1.25, (W - 2 * m) / bw, (H - 2 * m) / bh));
    dv = { k, x: (W - bw * k) / 2 - b.x0 * k, y: (H - bh * k) / 2 - b.y0 * k };
  }
  if (draw) renderDiagram();
}

function zoomAt(k, sx = wrap.clientWidth / 2, sy = wrap.clientHeight / 2) {
  const nk = Math.max(0.2, Math.min(3, k));
  const wx = (sx - dv.x) / dv.k, wy = (sy - dv.y) / dv.k;
  dv = { k: nk, x: sx - wx * nk, y: sy - wy * nk };
  renderDiagram();
}

function arrange() {
  sizes = Object.fromEntries(state.schema.tables.map((t) => [t.id, tableSize(t, measure)]));
  state.diagram.pos = autoLayout(state.schema.tables, sizes);
  fit(); emit("dirty");
}

$("#dgArrange").addEventListener("click", arrange);
$("#dgFit").addEventListener("click", () => fit());
$("#dgZoomIn").addEventListener("click", () => zoomAt(dv.k * 1.25));
$("#dgZoomOut").addEventListener("click", () => zoomAt(dv.k / 1.25));
new ResizeObserver(() => renderDiagram()).observe(wrap);

/* ---------- Pointer: drag tables, move around, zoom, double-click to edit ---------- */
const local = (e) => { const r = wrap.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

function openInEditor(id) {
  drag = null;
  setView("editor");
  expandTable(id);
  const input = $("#t-" + CSS.escape(id));
  input?.scrollIntoView({ block: "center", behavior: "smooth" });
  input?.focus({ preventScroll: true });
}

wrap.addEventListener("pointerdown", (e) => {
  if (e.button > 1) return;
  const card = e.target.closest?.(".dg-table");
  if (card && e.button === 0) {
    const id = card.dataset.id, p = state.diagram.pos[id];
    // Second press on the same table: open it in the Editor. preventDefault keeps the browser
    // from moving focus off the table-name field we're about to focus.
    if (lastDown.id === id && e.timeStamp - lastDown.t < 400) { e.preventDefault(); lastDown = {}; openInEditor(id); return; }
    lastDown = { id, t: e.timeStamp };
    wrap.setPointerCapture(e.pointerId);
    drag = { kind: "table", id, sx: e.clientX, sy: e.clientY, x: p.x, y: p.y, moved: false };
  } else {
    wrap.setPointerCapture(e.pointerId);
    drag = { kind: "pan", sx: e.clientX, sy: e.clientY, x: dv.x, y: dv.y };
    wrap.classList.add("panning");
  }
});
wrap.addEventListener("pointermove", (e) => {
  if (!drag) {
    const id = e.target.closest?.(".dg-table")?.dataset.id || null;
    if (id !== hot) { hot = id; renderDiagram(); }
    return;
  }
  const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
  if (drag.kind === "pan") { dv.x = drag.x + dx; dv.y = drag.y + dy; renderDiagram(); return; }
  if (Math.abs(dx) + Math.abs(dy) > 2) { drag.moved = true; lastDown = {}; }
  state.diagram.pos[drag.id] = { x: Math.round(drag.x + dx / dv.k), y: Math.round(drag.y + dy / dv.k) };
  renderDiagram();
});
const endDrag = () => {
  if (drag?.kind === "table" && drag.moved) emit("dirty");
  drag = null; wrap.classList.remove("panning");
};
wrap.addEventListener("pointerup", endDrag);
wrap.addEventListener("pointercancel", endDrag);
wrap.addEventListener("pointerleave", () => { if (!drag && hot) { hot = null; renderDiagram(); } });
wrap.addEventListener("wheel", (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;     // plain scrolling scrolls the page
  e.preventDefault();
  const [sx, sy] = local(e);
  zoomAt(dv.k * Math.exp(-e.deltaY * 0.0025), sx, sy);
}, { passive: false });

/* ---------- Downloads ---------- */
function exportSvg() {
  prepare();
  const c = palette();
  const b = bounds(state.schema.tables, state.diagram.pos, sizes);
  const m = 24, x = b.x0 - m, y = b.y0 - m, w = b.x1 - b.x0 + 2 * m, h = b.y1 - b.y0 + 2 * m;
  const keepHot = hot; hot = null;
  const body = contentSvg(c);
  hot = keepHot;
  return { w, h, text: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c.bg}"/>${body}</svg>` };
}
function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const fileBase = () => slug($("#projName").value || "schema") + "-diagram";

$("#dgSvg").addEventListener("click", () => {
  if (!state.schema.tables.length) return;
  download(new Blob([exportSvg().text], { type: "image/svg+xml" }), fileBase() + ".svg");
});
$("#dgPng").addEventListener("click", () => {
  if (!state.schema.tables.length) return;
  const { w, h, text } = exportSvg();
  const img = new Image();
  const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
  img.onload = () => {
    const scale = 2, c = document.createElement("canvas");
    c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    c.toBlob((blob) => blob && download(blob, fileBase() + ".png"), "image/png");
  };
  img.src = url;
});

/* ---------- Editor | Diagram switch ---------- */
export function setView(v) {
  visible = v === "diagram";
  $("#viewEditor").setAttribute("aria-selected", !visible);
  $("#viewDiagram").setAttribute("aria-selected", visible);
  $("#editorView").hidden = visible;
  $("#diagramView").hidden = !visible;
  store.set("s2s.draftView", v);
  if (visible) requestAnimationFrame(renderDiagram);
}
$("#viewEditor").addEventListener("click", () => setView("editor"));
$("#viewDiagram").addEventListener("click", () => setView("diagram"));

on("draft:replaced", renderDiagram);
on("draft:edited", renderDiagram);
on("project:loaded", () => { needsFit = true; });
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", renderDiagram);

setView(store.get("s2s.draftView") === "diagram" ? "diagram" : "editor");
