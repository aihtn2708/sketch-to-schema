// The schema sidebar on the Ask and Test tabs: the draft, read-only, so you can see names while
// writing a question or a query.
//   List:    tables and columns, with a filter; tables can be folded.
//   Diagram: the same diagram as Sketch to schema (same layout); drag to move around,
//            Ctrl/⌘ + scroll to zoom; the filter fades tables that don't match.
// Click a table or column name (in either) to insert it at the cursor in the question box (Ask)
// or the SQL editor (Test). Drag the sidebar's right edge to resize it. The Schema button in the
// tab bar shows or hides it. View, width and shown/hidden are remembered.
import { $, esc, store } from "../util.js";
import { state, on, emit } from "../state.js";
import { colById } from "./model.js";
import { tName, cName } from "./export.js";
import { svgIcon } from "../icons.js";
import { diagramParts } from "../diagram/diagram.js";

const work = $("#wsWork"), list = $("#schemaList"), filter = $("#schemaFilter");
const closed = new Set();       // tables folded in the sidebar (by id)
let lastTarget = null;          // the question box or SQL editor last typed in

const side = $("#schemaSide"), dgBox = $("#sideDg"), dgSvg = $("#sideDgSvg");
const WIDTH = { list: 270, diagram: 520 };
let mode = store.get("s2s.schemaSideMode") === "diagram" ? "diagram" : "list";
let widths = {};
try { widths = JSON.parse(store.get("s2s.schemaSideW") || "{}") || {}; } catch { widths = {}; }

const saved = store.get("s2s.schemaSide");
setShown(saved ? saved === "1" : !matchMedia("(max-width: 900px)").matches, false);

function setShown(on, remember = true) {
  work.classList.toggle("no-side", !on);
  if (on) requestAnimationFrame(renderDg);
  $("#schemaToggle").setAttribute("aria-pressed", String(on));
  $("#schemaToggle").title = on ? "Hide the schema" : "Show the schema next to Ask and Test";
  if (remember) store.set("s2s.schemaSide", on ? "1" : "0");
}

const hl = (text, q) => {
  if (!q) return esc(text);
  const i = text.toLowerCase().indexOf(q);
  return i < 0 ? esc(text) : esc(text.slice(0, i)) + `<mark class="hl">${esc(text.slice(i, i + q.length))}</mark>` + esc(text.slice(i + q.length));
};

export function renderSide() {
  renderDg();
  const tables = state.schema.tables, q = filter.value.trim().toLowerCase();
  const cols = tables.reduce((n, t) => n + t.columns.length, 0);
  $("#schemaSideCount").textContent = tables.length ? `${tables.length} table${tables.length === 1 ? "" : "s"} · ${cols} column${cols === 1 ? "" : "s"}` : "";
  if (!tables.length) {
    list.innerHTML = `<p class="side-empty">No tables yet. Extract or add them in Sketch to schema.</p>`;
    return;
  }
  const html = tables.map((t) => {
    const name = tName(t);
    const tableHit = !q || name.toLowerCase().includes(q);
    const shown = t.columns.filter((c) => tableHit || cName(c).toLowerCase().includes(q));
    if (!shown.length && !tableHit) return "";
    const open = q ? true : !closed.has(t.id);
    return `<details class="side-tbl" data-t="${esc(t.id)}"${open ? " open" : ""}>
      <summary>${svgIcon("chevron")}<button type="button" class="side-name" data-insert="${esc(name)}" title="Insert ${esc(name)}">${hl(name, q)}</button><span class="tc">${t.columns.length}</span></summary>
      <ul class="side-cols">${shown.map((c) => {
        const hit = c.ref && colById(tables, c.ref.c);
        const ref = hit ? `→ ${tName(hit.t)}.${cName(hit.c)}` : "";
        return `<li><button type="button" class="side-col${c.flags.length ? " flagged" : ""}" data-insert="${esc(cName(c))}" title="Insert ${esc(cName(c))}${ref ? ` (${esc(ref)})` : ""}${c.flags.length ? " · marked to check" : ""}">
          ${c.pk ? `<span class="kb">PK</span>` : ""}<span class="cn">${hl(cName(c), q)}</span>${ref ? `<span class="rf">${esc(ref)}</span>` : ""}<span class="ct">${esc(c.type || "text")}</span></button></li>`;
      }).join("")}</ul></details>`;
  }).join("");
  list.innerHTML = html || `<p class="side-empty">Nothing matches “${esc(filter.value.trim())}”.</p>`;
}

// Where a click inserts: the box last typed in, else the one for the open tab.
function target() {
  const view = $("#viewAsk").hidden ? "test" : "ask";
  if (lastTarget && !lastTarget.closest("[hidden]")) return lastTarget;
  return view === "ask" ? $("#askInput") : $("#mockSql");
}

function insert(text) {
  const el = target();
  if (el.id === "mockSql" && el.closest("[hidden]")) $("#mtQuery").click();   // Test: make sure the Query tab is open
  el.focus();
  const before = el.value.slice(0, el.selectionStart);
  const pad = before && !/[\s(,.]$/.test(before) ? " " : "";
  // insertText keeps the box's own undo history (Ctrl/⌘+Z) and fires its input event.
  if (!document.execCommand("insertText", false, pad + text)) {
    el.setRangeText(pad + text, el.selectionStart, el.selectionEnd, "end");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function updateHint() {
  const where = $("#viewAsk").hidden ? "the SQL query" : "the question";
  $("#schemaInsertHint").textContent = mode === "diagram"
    ? `Click a table or column to put its name in ${where}. Drag to move around; Ctrl/⌘ + scroll to zoom.`
    : `Click a name to put it in ${where}.`;
}

list.addEventListener("click", (e) => {
  const b = e.target.closest("[data-insert]");
  if (!b) return;
  e.preventDefault();          // a table name sits in <summary>: don't fold it
  insert(b.dataset.insert);
});
list.addEventListener("toggle", (e) => {
  const d = e.target.closest?.(".side-tbl");
  if (!d || filter.value.trim()) return;
  if (d.open) closed.delete(d.dataset.t); else closed.add(d.dataset.t);
}, true);
filter.addEventListener("input", renderSide);

/* ---------- List or Diagram, and the sidebar's width ---------- */
function applyWidth() {
  const max = Math.max(260, work.clientWidth * 0.7);
  const w = Math.round(Math.min(max, Math.max(240, widths[mode] || WIDTH[mode])));
  work.style.setProperty("--side-w", `${w}px`);
}
function setMode(m, remember = true) {
  mode = m;
  side.classList.toggle("dg-mode", m === "diagram");
  $("#sideList").setAttribute("aria-selected", String(m === "list"));
  $("#sideDiagram").setAttribute("aria-selected", String(m === "diagram"));
  $("#schemaList").hidden = m !== "list";
  $("#sideDgWrap").hidden = m !== "diagram";
  if (remember) store.set("s2s.schemaSideMode", m);
  applyWidth(); updateHint();
  if (m === "diagram") { fitPending = true; requestAnimationFrame(renderDg); }
}
$("#sideList").addEventListener("click", () => setMode("list"));
$("#sideDiagram").addEventListener("click", () => setMode("diagram"));

const resizer = $("#sideResize");
resizer.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  resizer.setPointerCapture(e.pointerId);
  resizer.classList.add("dragging"); document.body.classList.add("resizing");
  const left = work.getBoundingClientRect().left;
  const move = (ev) => { widths[mode] = ev.clientX - left; applyWidth(); };
  const up = () => {
    resizer.removeEventListener("pointermove", move);
    resizer.classList.remove("dragging"); document.body.classList.remove("resizing");
    store.set("s2s.schemaSideW", JSON.stringify(widths));
  };
  resizer.addEventListener("pointermove", move);
  resizer.addEventListener("pointerup", up, { once: true });
  resizer.addEventListener("pointercancel", up, { once: true });
});
resizer.addEventListener("dblclick", () => { delete widths[mode]; applyWidth(); store.set("s2s.schemaSideW", JSON.stringify(widths)); });
resizer.addEventListener("keydown", (e) => {
  const step = { ArrowLeft: -40, ArrowRight: 40 }[e.key];
  if (!step) return;
  e.preventDefault();
  widths[mode] = side.getBoundingClientRect().width + step; applyWidth();
  store.set("s2s.schemaSideW", JSON.stringify(widths));
});
addEventListener("resize", applyWidth);

/* ---------- The diagram ---------- */
let sv = { x: 0, y: 0, k: 1 };     // screen = diagram position × k + (x, y)
let fitPending = true;             // fit the whole diagram until the person moves or zooms it
let sHot = null, sDrag = null;

function renderDg() {
  if (mode !== "diagram" || work.hidden || work.classList.contains("no-side") || !dgBox.clientWidth) return;
  const tables = state.schema.tables, q = filter.value.trim().toLowerCase();
  $("#sideDgEmpty").hidden = !!tables.length;
  dgSvg.style.display = tables.length ? "" : "none";
  if (!tables.length) return;
  const dim = q ? new Set(tables.filter((t) => !tName(t).toLowerCase().includes(q) && !t.columns.some((c) => cName(c).toLowerCase().includes(q))).map((t) => t.id)) : null;
  const { content, bounds: b } = diagramParts({ hot: sHot, dim, hits: true });
  if (fitPending && b) {
    const W = dgBox.clientWidth, H = dgBox.clientHeight, m = 16, bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    const k = Math.max(0.15, Math.min(1, (W - 2 * m) / bw, (H - 2 * m) / bh));
    // Centered across, from the top down (the box can reach below the window).
    sv = { k, x: (W - bw * k) / 2 - b.x0 * k, y: m - b.y0 * k };
  }
  dgSvg.innerHTML = `<g transform="translate(${sv.x},${sv.y}) scale(${sv.k})">${content}</g>`;
  const g = 20 * sv.k;
  dgBox.style.backgroundSize = `${g}px ${g}px`;
  dgBox.style.backgroundPosition = `${sv.x % g}px ${sv.y % g}px`;
  $("#sideDgZoom").textContent = `${Math.round(sv.k * 100)}%`;
}

function zoomAt(k, sx = dgBox.clientWidth / 2, sy = dgBox.clientHeight / 2) {
  const nk = Math.max(0.15, Math.min(3, k));
  const wx = (sx - sv.x) / sv.k, wy = (sy - sv.y) / sv.k;
  sv = { k: nk, x: sx - wx * nk, y: sy - wy * nk };
  fitPending = false; renderDg();
}
$("#sideDgFit").addEventListener("click", () => { fitPending = true; renderDg(); });
$("#sideDgIn").addEventListener("click", () => zoomAt(sv.k * 1.25));
$("#sideDgOut").addEventListener("click", () => zoomAt(sv.k / 1.25));

const local = (e) => { const r = dgBox.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
dgBox.addEventListener("pointerdown", (e) => {
  if (e.button > 1) return;
  const [x, y] = local(e);
  sDrag = { x, y, sv: { ...sv }, moved: false, insert: e.target.closest?.(".dg-hit")?.dataset.insert || null };
  dgBox.setPointerCapture(e.pointerId);
});
dgBox.addEventListener("pointermove", (e) => {
  const [x, y] = local(e);
  if (sDrag) {
    if (!sDrag.moved && Math.hypot(x - sDrag.x, y - sDrag.y) < 4) return;
    sDrag.moved = true; dgBox.classList.add("panning");
    sv = { ...sDrag.sv, x: sDrag.sv.x + x - sDrag.x, y: sDrag.sv.y + y - sDrag.y };
    fitPending = false; renderDg();
    return;
  }
  const id = e.target.closest?.(".dg-table")?.dataset.id || null;
  if (id !== sHot) { sHot = id; renderDg(); }
});
const endDrag = () => {
  if (!sDrag) return;
  const d = sDrag; sDrag = null; dgBox.classList.remove("panning");
  if (!d.moved && d.insert) insert(d.insert);
};
dgBox.addEventListener("pointerup", endDrag);
dgBox.addEventListener("pointercancel", () => { sDrag = null; dgBox.classList.remove("panning"); });
dgBox.addEventListener("pointerleave", () => { if (!sDrag && sHot) { sHot = null; renderDg(); } });
dgBox.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) { const [x, y] = local(e); zoomAt(sv.k * Math.exp(-e.deltaY * 0.0025), x, y); }
  else { sv = { ...sv, x: sv.x - e.deltaX, y: sv.y - e.deltaY }; fitPending = false; renderDg(); }
}, { passive: false });
new ResizeObserver(() => renderDg()).observe(dgBox);
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", renderDg);
for (const id of ["#askInput", "#mockSql"]) $(id).addEventListener("focus", (e) => { lastTarget = e.target; });

$("#schemaToggle").addEventListener("click", () => setShown(work.classList.contains("no-side")));
$("#schemaSideClose").addEventListener("click", () => { setShown(false); $("#schemaToggle").focus(); });
$("#schemaEdit").addEventListener("click", () => emit("view", "design"));

let t = null;
const soon = () => { clearTimeout(t); t = setTimeout(renderSide, 150); };
on("draft:replaced", soon);
on("draft:edited", soon);
on("project:loaded", () => { closed.clear(); filter.value = ""; renderSide(); });
on("view:shown", (v) => { if (v !== "design") { lastTarget = null; applyWidth(); updateHint(); renderSide(); } });
setMode(mode, false);
renderSide();
