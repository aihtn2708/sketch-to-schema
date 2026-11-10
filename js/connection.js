// The AI connection panel: which provider, its key and its model.
// Keys stay in this browser and go only to their own provider. With "Remember on this device"
// off (the default) a key is kept for this tab only (sessionStorage: gone when the tab closes);
// with it on, in localStorage until "Forget key".
import { $, esc, store, showMsg } from "./util.js";
import { PROVIDERS } from "./providers/index.js";
import { requestsToday, onUsage } from "./usage.js";

let current = PROVIDERS[store.get("s2s.provider")] ? store.get("s2s.provider") : "openrouter";
const tab = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } catch { /* storage unavailable */ } }
};
const sessionKeys = {};   // fallback when even sessionStorage is unavailable

const keyFor = (id) => sessionKeys[id] || tab.get("s2s.key." + id) || store.get("s2s.key." + id) || "";
function modelFor(id) {
  // Older versions of the page stored these two under different names.
  const legacy = id === "openrouter" ? store.get("s2s.orModels") : id === "anthropic" ? store.get("s2s.anModel") : null;
  return (store.get("s2s.model." + id) || legacy || PROVIDERS[id].defaultModel).trim();
}

// What the Extract button needs.
export function active() {
  return { provider: PROVIDERS[current], key: keyFor(current), model: modelFor(current) };
}

export function updateConnStatus() {
  const P = PROVIDERS[current], has = !!keyFor(current), m = modelFor(current);
  $("#connDot").classList.toggle("on", has);
  const n = requestsToday();
  $("#connText").textContent = (has ? `Ready · ${P.name} · ${P.statusModel ? P.statusModel(m) : m}` : "Add a key to enable Extract")
    + ` · ${n} request${n === 1 ? "" : "s"} today`;
  $("#connText").title = "AI requests sent from this browser today, by all features together";
  $("#extractBtn").disabled = !has;
}

export function renderConn() {
  const P = PROVIDERS[current];
  $("#provider").value = current;
  $("#keyLabel").textContent = P.keyLabel;
  $("#apiKey").placeholder = P.placeholder;
  $("#apiKey").value = keyFor(current);
  $("#modelLabel").textContent = P.modelLabel;
  $("#model").value = modelFor(current);
  $("#model").placeholder = P.defaultModel;
  $("#modelList").innerHTML = P.models.map((m) => `<option value="${esc(m)}">`).join("");
  $("#provHint").innerHTML = P.hint;
  updateConnStatus();
}

onUsage(updateConnStatus);

// The panel folds down to its status line once a key is set, to leave room for the work.
function setConnOpen(open, save = true) {
  $("#connBody").hidden = !open;
  $("#connToggle").setAttribute("aria-expanded", String(open));
  $("#connPanel").classList.toggle("collapsed", !open);
  if (save) store.set("s2s.connOpen", open ? "1" : "0");
}
// Used when a feature needs a key: open the panel and put the cursor in the key box.
export function focusKey() { setConnOpen(true); $("#apiKey").focus(); }
$("#connToggle").addEventListener("click", () => setConnOpen($("#connBody").hidden));
const savedOpen = store.get("s2s.connOpen");
setConnOpen(savedOpen === "1" || (savedOpen !== "0" && !keyFor(current)), false);

// The Provider menu is built from the provider list, so adding a provider needs no HTML change.
$("#provider").innerHTML = Object.values(PROVIDERS).map((p) => `<option value="${p.id}">${esc(p.menuLabel)}</option>`).join("");
// Remembering keys is opt-in; people who already had a key remembered keep that setting.
$("#remember").checked = store.get("s2s.remember") === "1" ||
  (store.get("s2s.remember") === null && Object.keys(PROVIDERS).some((id) => store.get("s2s.key." + id)));

$("#provider").addEventListener("change", (e) => { current = e.target.value; store.set("s2s.provider", current); renderConn(); });
$("#apiKey").addEventListener("input", (e) => {
  const v = e.target.value.trim();
  sessionKeys[current] = v;
  tab.set("s2s.key." + current, v);
  if ($("#remember").checked && v) store.set("s2s.key." + current, v); else store.del("s2s.key." + current);
  updateConnStatus();
});
$("#model").addEventListener("change", (e) => {
  const v = e.target.value.trim();
  if (v && v !== PROVIDERS[current].defaultModel) store.set("s2s.model." + current, v); else store.del("s2s.model." + current);
  if (!v) e.target.value = PROVIDERS[current].defaultModel;
  updateConnStatus();
});
$("#remember").addEventListener("change", (e) => {
  store.set("s2s.remember", e.target.checked ? "1" : "0");
  for (const id of Object.keys(PROVIDERS)) {
    const v = keyFor(id);
    if (e.target.checked && v) store.set("s2s.key." + id, v); else store.del("s2s.key." + id);
  }
});
$("#forgetKey").addEventListener("click", () => {
  sessionKeys[current] = ""; tab.set("s2s.key." + current, ""); store.del("s2s.key." + current); $("#apiKey").value = ""; updateConnStatus();
  showMsg(`${PROVIDERS[current].name} key removed from this browser.`);
});
