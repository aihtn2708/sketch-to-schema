// Workspace tabs: Sketch to schema · Ask in plain language · Test on mock data.
// One function fills the page at a time; the page always opens on Sketch to schema.
// Other modules switch with emit("view", "design" | "ask" | "test").
import { $ } from "./util.js";
import { state, on } from "./state.js";
import { inMeeting } from "./sketch/board.js";

const VIEWS = ["design", "ask", "test"];
const tab = (v) => $(`.ws-tab[data-view="${v}"]`);
const panelOf = (v) => $("#view" + v.charAt(0).toUpperCase() + v.slice(1));
let current = "design";

export function showView(v) {
  if (!VIEWS.includes(v) || (inMeeting() && v !== "design")) return;
  current = v;
  for (const x of VIEWS) {
    const on = x === v;
    panelOf(x).hidden = !on;
    tab(x).setAttribute("aria-selected", String(on));
    tab(x).tabIndex = on ? 0 : -1;
  }
  // If the tabs are pinned at the top, start the new view at its top.
  const bar = $(".ws-tabs");
  if (bar.getBoundingClientRect().top <= 0) window.scrollTo({ top: window.scrollY + panelOf(v).getBoundingClientRect().top - bar.offsetHeight - 12 });
}
export const currentView = () => current;

document.querySelectorAll(".ws-tab").forEach((b) => {
  b.addEventListener("click", () => showView(b.dataset.view));
  b.addEventListener("keydown", (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    const next = VIEWS[(VIEWS.indexOf(b.dataset.view) + step + VIEWS.length) % VIEWS.length];
    showView(next); tab(next).focus(); e.preventDefault();
  });
});

// Badges: items to check on Sketch to schema, number of tests on Test on mock data.
function updateBadges() {
  let n = 0;
  for (const t of state.schema.tables) { n += t.flags.length; for (const c of t.columns) n += c.flags.length; }
  const b = $("#draftBadge");
  b.hidden = !n; b.textContent = n; b.title = `${n} item${n === 1 ? "" : "s"} to check`;
  const tests = state.mock.tests.length, failed = state.mock.tests.filter((t) => t.last && !t.last.pass).length;
  $("#wsTestCount").textContent = tests ? `(${failed ? `${failed} failed` : tests})` : "";
}
for (const ev of ["draft:replaced", "draft:edited", "dirty", "project:loaded"]) on(ev, updateBadges);

on("view", showView);
updateBadges();
