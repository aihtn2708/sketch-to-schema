// The schema sidebar on the Ask and Test tabs: the draft's tables and columns, read-only, so
// you can see names while writing a question or a query. Click a name to insert it at the
// cursor in the question box (Ask) or the SQL editor (Test). The Schema button in the tab bar
// shows or hides it; the choice is remembered.
import { $, esc, store } from "../util.js";
import { state, on, emit } from "../state.js";
import { colById } from "./model.js";
import { tName, cName } from "./export.js";
import { svgIcon } from "../icons.js";

const work = $("#wsWork"), list = $("#schemaList"), filter = $("#schemaFilter");
const closed = new Set();       // tables folded in the sidebar (by id)
let lastTarget = null;          // the question box or SQL editor last typed in

const saved = store.get("s2s.schemaSide");
setShown(saved ? saved === "1" : !matchMedia("(max-width: 900px)").matches, false);

function setShown(on, remember = true) {
  work.classList.toggle("no-side", !on);
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
  $("#schemaInsertHint").textContent = $("#viewAsk").hidden ? "Click a name to put it in the SQL query." : "Click a name to put it in the question.";
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
for (const id of ["#askInput", "#mockSql"]) $(id).addEventListener("focus", (e) => { lastTarget = e.target; });

$("#schemaToggle").addEventListener("click", () => setShown(work.classList.contains("no-side")));
$("#schemaSideClose").addEventListener("click", () => { setShown(false); $("#schemaToggle").focus(); });
$("#schemaEdit").addEventListener("click", () => emit("view", "design"));

let t = null;
const soon = () => { clearTimeout(t); t = setTimeout(renderSide, 150); };
on("draft:replaced", soon);
on("draft:edited", soon);
on("project:loaded", () => { closed.clear(); filter.value = ""; renderSide(); });
on("view:shown", (v) => { if (v !== "design") { lastTarget = null; updateHint(); renderSide(); } });
renderSide();
