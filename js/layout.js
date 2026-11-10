// The page layout: two panes side by side, each with its own tabs.
//   Design: Sketch · Draft schema · Export        SQL: Ask in plain language · Test on mock data
// Drag the divider (or focus it and use ←/→) to resize; double-click it to reset.
// On narrow screens one pane shows at a time, with a Design / SQL switch above.
// Other modules bring a panel forward with emit("show", "<panel id>").
import { $, store } from "./util.js";
import { state, on } from "./state.js";
import { inMeeting } from "./sketch/board.js";

const PANES = { design: ["sketchPanel", "draftPanel", "outPanel"], sql: ["askPanel", "mockPanel"] };
const paneOf = (id) => Object.keys(PANES).find((p) => PANES[p].includes(id));
const split = $("#split"), divider = $("#splitDivider");

let saved = {};
try { saved = JSON.parse(store.get("s2s.layout") || "{}") || {}; } catch { saved = {}; }
const active = {
  design: PANES.design.includes(saved.design) ? saved.design : "sketchPanel",
  sql: PANES.sql.includes(saved.sql) ? saved.sql : "askPanel"
};
let ratio = Number.isFinite(saved.ratio) ? Math.min(0.75, Math.max(0.25, saved.ratio)) : 0.5;
let narrowPane = saved.narrow === "sql" ? "sql" : "design";
const remember = () => store.set("s2s.layout", JSON.stringify({ ...active, ratio, narrow: narrowPane }));

function selectPanel(pane, id) {
  active[pane] = id;
  for (const pid of PANES[pane]) $("#" + pid).hidden = pid !== id;
  document.querySelectorAll(`#pane${pane === "design" ? "Design" : "Sql"} .pane-tab`).forEach((b) => {
    const on = b.dataset.panel === id;
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
  });
}

function showPane(pane) {
  narrowPane = pane;
  split.dataset.show = pane;
  $("#swDesign").setAttribute("aria-selected", String(pane === "design"));
  $("#swSql").setAttribute("aria-selected", String(pane === "sql"));
}

// Bring a panel forward: select its tab, and on narrow screens switch to its pane.
export function showPanel(id) {
  const pane = paneOf(id);
  if (!pane || (inMeeting() && id !== "sketchPanel")) return;
  selectPanel(pane, id);
  showPane(pane);
  remember();
}

function setRatio(r) {
  ratio = Math.min(0.75, Math.max(0.25, r));
  split.style.setProperty("--split-l", `${ratio}fr`);
  split.style.setProperty("--split-r", `${1 - ratio}fr`);
  divider.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
}

/* ---------- Tabs ---------- */
document.querySelectorAll(".pane-tab").forEach((b) => {
  b.addEventListener("click", () => showPanel(b.dataset.panel));
  // ←/→ move between tabs in the same pane.
  b.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const list = PANES[paneOf(b.dataset.panel)];
    const next = list[(list.indexOf(b.dataset.panel) + (e.key === "ArrowRight" ? 1 : list.length - 1)) % list.length];
    showPanel(next);
    document.querySelector(`.pane-tab[data-panel="${next}"]`)?.focus();
    e.preventDefault();
  });
});
$("#swDesign").addEventListener("click", () => { showPane("design"); remember(); });
$("#swSql").addEventListener("click", () => { showPane("sql"); remember(); });

/* ---------- Divider ---------- */
divider.setAttribute("aria-valuemin", "25");
divider.setAttribute("aria-valuemax", "75");
divider.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  divider.setPointerCapture(e.pointerId);
  divider.classList.add("dragging"); document.body.classList.add("resizing");
  const box = split.getBoundingClientRect();
  const move = (ev) => setRatio((ev.clientX - box.left - 7) / (box.width - 14));
  const up = () => {
    divider.removeEventListener("pointermove", move);
    divider.classList.remove("dragging"); document.body.classList.remove("resizing");
    remember();
  };
  divider.addEventListener("pointermove", move);
  divider.addEventListener("pointerup", up, { once: true });
  divider.addEventListener("pointercancel", up, { once: true });
});
divider.addEventListener("dblclick", () => { setRatio(0.5); remember(); });
divider.addEventListener("keydown", (e) => {
  const step = { ArrowLeft: -0.05, ArrowRight: 0.05 }[e.key];
  if (step) { setRatio(ratio + step); remember(); e.preventDefault(); }
  else if (e.key === "Home" || e.key === "End") { setRatio(e.key === "Home" ? 0.25 : 0.75); remember(); e.preventDefault(); }
});

/* ---------- Draft tab badge: how many items are marked to check ---------- */
function updateBadge() {
  let n = 0;
  for (const t of state.schema.tables) { n += t.flags.length; for (const c of t.columns) n += c.flags.length; }
  const b = $("#draftBadge");
  b.hidden = !n; b.textContent = n; b.title = `${n} item${n === 1 ? "" : "s"} to check`;
}
on("draft:replaced", updateBadge);
on("draft:edited", updateBadge);
on("dirty", updateBadge);   // "Looks right" clears a flag without other events

on("show", showPanel);

selectPanel("design", active.design);
selectPanel("sql", active.sql);
showPane(narrowPane);
setRatio(ratio);
