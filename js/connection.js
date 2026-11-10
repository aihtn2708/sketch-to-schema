// The AI connection panel: which provider, its key and its model.
// Keys stay in this browser (localStorage when "Remember" is on, otherwise memory only).
import { $, esc, store, showMsg } from "./util.js";
import { PROVIDERS } from "./providers/index.js";
import { requestsToday, onUsage } from "./usage.js";

let current = PROVIDERS[store.get("s2s.provider")] ? store.get("s2s.provider") : "openrouter";
const sessionKeys = {};

const keyFor = (id) => sessionKeys[id] || store.get("s2s.key." + id) || "";
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

// The Provider menu is built from the provider list, so adding a provider needs no HTML change.
$("#provider").innerHTML = Object.values(PROVIDERS).map((p) => `<option value="${p.id}">${esc(p.menuLabel)}</option>`).join("");
$("#remember").checked = store.get("s2s.remember") !== "0";

$("#provider").addEventListener("change", (e) => { current = e.target.value; store.set("s2s.provider", current); renderConn(); });
$("#apiKey").addEventListener("input", (e) => {
  const v = e.target.value.trim();
  sessionKeys[current] = v;
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
  sessionKeys[current] = ""; store.del("s2s.key." + current); $("#apiKey").value = ""; updateConnStatus();
  showMsg(`${PROVIDERS[current].name} key removed from this browser.`);
});
