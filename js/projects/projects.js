// Projects: autosave, the project bar (name, New, Export, Import) and the Projects list.
import { $, esc, store, showMsg, slug } from "../util.js";
import { state, on, emit, EXAMPLE_PHOTO_NAME } from "../state.js";
import { DB } from "./db.js";
import { cleanDraft, fromModel, snapshotOf } from "../schema/model.js";
import { cleanShapes } from "../sketch/shapes.js";
import { setMode, syncBoardControls, boardThumbnail } from "../sketch/board.js";
import { loadImage } from "../sketch/image.js";
import { cleanPositions } from "../diagram/layout.js";
import { cleanQueries } from "../query/prompt.js";
import { cleanMock, defaultMock } from "../mock/saved.js";
import { EXAMPLE_DRAFT } from "../sketch/example.js";
import { svgIcon } from "../icons.js";

let loading = false, saveTimer = null, dbReady = false;
const dlg = $("#projDialog");
const newId = () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function relTime(ts) {
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  if (d < 7 * 86400) return `${Math.floor(d / 86400)} d ago`;
  return new Date(ts).toLocaleDateString();
}

function setSaveState(kind, detail) {
  const el = $("#saveState");
  el.classList.toggle("err", kind === "error");
  el.textContent = kind === "saving" ? "Saving…"
    : kind === "saved" ? `Saved · ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : kind === "error" ? detail : "";
}

// Collapsed tables in the editor: a list of table ids → { id: true }.
const cleanCollapsed = (list) => Object.fromEntries((Array.isArray(list) ? list : []).filter((x) => typeof x === "string").slice(0, 2000).map((x) => [x, true]));

/* ---------- Saving ---------- */
// The open project as a record, from the current app state.
function currentRecord() {
  return {
    ...state.project, name: $("#projName").value.trim() || "Untitled project", updatedAt: Date.now(),
    mode: state.mode, photo: state.photo.data, photoName: state.photo.data ? state.photo.name : null,
    drawing: { shapes: state.shapes },
    draft: { tables: state.schema.tables, warnings: state.schema.warnings }, original: state.original,
    diagram: { pos: state.diagram.pos },
    editor: { collapsed: Object.keys(state.editor.collapsed) },
    queries: state.queries,
    mock: state.mock,
    tableCount: state.schema.tables.length, thumb: boardThumbnail()
  };
}

function markDirty() {
  if (loading || !state.project || !dbReady) return;
  setSaveState("saving");
  clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 700);
}

async function saveNow() {
  clearTimeout(saveTimer); saveTimer = null;
  if (!state.project || !dbReady) return;
  try {
    const rec = currentRecord();
    await DB.put(rec);
    state.project = rec;
    setSaveState("saved");
  } catch (e) {
    setSaveState("error", /quota/i.test(String(e?.name || e))
      ? "Not saved: browser storage is full. Export and delete old projects."
      : "Not saved: this browser blocked storage.");
  }
}

on("dirty", markDirty);
document.addEventListener("visibilitychange", () => { if (document.hidden && saveTimer) saveNow(); });
addEventListener("pagehide", () => { if (saveTimer) saveNow(); });

/* ---------- Opening ---------- */
function blankProject(name) {
  const now = Date.now();
  return { id: newId(), name, createdAt: now, updatedAt: now, mode: "draw", photo: null, photoName: null,
    drawing: { shapes: [] }, draft: { tables: [], warnings: [] },
    original: {}, diagram: { pos: {} }, editor: { collapsed: [] }, queries: [], mock: defaultMock(), tableCount: 0, thumb: null };
}

async function uniqueName(base) {
  const names = new Set(dbReady ? (await DB.all()).map((x) => x.name) : []);
  if (!names.has(base)) return base;
  for (let i = 2; ; i++) if (!names.has(`${base} ${i}`)) return `${base} ${i}`;
}

async function loadProject(p) {
  emit("text:commit");
  loading = true;
  try {
    state.project = p;
    $("#projName").value = p.name || "Untitled project";
    state.shapes = cleanShapes(p.drawing?.shapes);
    syncBoardControls();
    const photoData = typeof p.photo === "string" && /^data:image\/(jpeg|png|webp|gif);base64,/.test(p.photo) ? p.photo : null;
    const img = photoData ? await loadImage(photoData).catch(() => null) : null;
    state.photo = img ? { img, data: photoData, name: p.photoName || "Saved photo" } : { img: null, data: null, name: EXAMPLE_PHOTO_NAME };
    state.schema = { tables: cleanDraft(p.draft?.tables), warnings: (Array.isArray(p.draft?.warnings) ? p.draft.warnings : []).map(String) };
    state.original = p.original && typeof p.original === "object" ? p.original : {};
    state.diagram = { pos: cleanPositions(p.diagram?.pos) };
    state.editor = { collapsed: cleanCollapsed(p.editor?.collapsed) };
    state.queries = cleanQueries(p.queries);
    state.mock = cleanMock(p.mock);
    $("#draftMsg").hidden = true;
    emit("project:loaded");
    emit("draft:replaced");
    setMode(p.mode === "draw" ? "draw" : "photo");
    showMsg("");
    store.set("s2s.currentProject", p.id);
    setSaveState(dbReady ? "saved" : "");
  } finally {
    loading = false;
  }
}

/* ---------- Project bar ---------- */
$("#projName").addEventListener("input", markDirty);

$("#newProj").addEventListener("click", async () => {
  await saveNow();
  const np = blankProject(await uniqueName("Untitled project"));
  if (dbReady) await DB.put(np).catch(() => {});
  await loadProject(np);
  showMsg("New project. Draw the schema here, or switch to Photo to upload one.");
  $("#projName").focus(); $("#projName").select();
});

function exportProject(rec) {
  const { thumb, ...rest } = rec;
  const blob = new Blob([JSON.stringify({ format: "sketch-to-schema", version: 1, exportedAt: new Date().toISOString(), project: rest })], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `${slug(rec.name)}.s2s.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

$("#exportProj").addEventListener("click", async () => {
  if (!state.project) return;
  await saveNow();
  exportProject(currentRecord());
  showMsg(`Exported "${$("#projName").value.trim() || "Untitled project"}" as a file. Import it on another browser to continue there.`);
});

$("#importFile").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  let data;
  try { data = JSON.parse(await f.text()); } catch { data = null; }
  const ip = data?.project;
  if (data?.format !== "sketch-to-schema" || !ip || typeof ip !== "object") { showMsg("That file isn't a Sketch to Schema project export.", true); return; }
  await saveNow();
  const now = Date.now();
  // Imported files are untrusted: copy only known fields, and clean them.
  const np = {
    ...blankProject(await uniqueName(String(ip.name || "Imported project").slice(0, 120))),
    mode: ip.mode === "draw" ? "draw" : "photo", photo: ip.photo, photoName: ip.photoName ? String(ip.photoName) : null,
    drawing: { shapes: cleanShapes(ip.drawing?.shapes) },
    diagram: { pos: cleanPositions(ip.diagram?.pos) },
    editor: { collapsed: Object.keys(cleanCollapsed(ip.editor?.collapsed)) },
    queries: cleanQueries(ip.queries),
    mock: cleanMock(ip.mock),
    draft: { tables: cleanDraft(ip.draft?.tables), warnings: (Array.isArray(ip.draft?.warnings) ? ip.draft.warnings : []).map(String) },
    original: ip.original && typeof ip.original === "object" ? ip.original : {}, createdAt: now, updatedAt: now
  };
  await loadProject(np);
  if (dbReady) await saveNow();
  if (dlg.open) renderProjectList();
  showMsg(`Imported "${np.name}".`);
});

/* ---------- Projects list ---------- */
async function renderProjectList() {
  const q = $("#projSearch").value.trim().toLowerCase();
  let list = dbReady ? await DB.all() : (state.project ? [currentRecord()] : []);
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  if (q) list = list.filter((x) => String(x.name || "").toLowerCase().includes(q));
  $("#projList").innerHTML = list.length ? list.map((x) => {
    const isCur = x.id === state.project?.id;
    const n = x.tableCount ?? x.draft?.tables?.length ?? 0;
    const thumb = typeof x.thumb === "string" && x.thumb.startsWith("data:image/jpeg;base64,") ? x.thumb : "";
    return `<li class="proj-item${isCur ? " current" : ""}" data-id="${esc(x.id)}">
      ${thumb ? `<img class="proj-thumb" src="${esc(thumb)}" alt="">` : `<div class="proj-thumb" aria-hidden="true"></div>`}
      <div class="proj-meta"><b>${esc(x.name || "Untitled project")}</b><span>${n} table${n === 1 ? "" : "s"} · edited ${relTime(x.updatedAt)}${isCur ? " · open now" : ""}</span></div>
      <div class="proj-actions">
        ${isCur ? "" : `<button type="button" class="primary" data-act="open">${svgIcon("folder")}Open</button>`}
        <button type="button" data-act="dup">${svgIcon("copy")}Duplicate</button>
        <button type="button" data-act="export">${svgIcon("download")}Export</button>
        <button type="button" class="danger" data-act="del">${svgIcon("trash")}<span>Delete</span></button>
      </div></li>`;
  }).join("") : `<li class="empty">${q ? "No projects match that search." : "No saved projects yet."}</li>`;
}

$("#openProj").addEventListener("click", async () => {
  await saveNow();
  $("#projSearch").value = "";
  await renderProjectList();
  dlg.showModal();
});
$("#closeDlg").addEventListener("click", () => dlg.close());
dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
$("#projSearch").addEventListener("input", renderProjectList);

$("#projList").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-act]");
  if (!b || !dbReady) return;
  const id = b.closest("[data-id]").dataset.id;
  const rec = (await DB.all()).find((x) => x.id === id);
  if (!rec) return;
  const act = b.dataset.act;

  if (act === "open") {
    await saveNow(); await loadProject(rec); dlg.close();
  } else if (act === "dup") {
    const now = Date.now();
    await DB.put({ ...rec, id: newId(), name: await uniqueName(`${rec.name} (copy)`), createdAt: now, updatedAt: now });
    renderProjectList();
  } else if (act === "export") {
    if (id === state.project?.id) { await saveNow(); exportProject(currentRecord()); } else exportProject(rec);
  } else if (act === "del") {
    const label = b.querySelector("span");
    if (b.dataset.armed !== "1") {
      b.dataset.armed = "1"; label.textContent = "Click again to delete";
      setTimeout(() => { if (b.isConnected) { b.dataset.armed = ""; label.textContent = "Delete"; } }, 3000);
      return;
    }
    if (id === state.project?.id) { clearTimeout(saveTimer); saveTimer = null; state.project = null; }
    await DB.del(id);
    if (!state.project) {
      const rest = (await DB.all()).sort((a, c) => c.updatedAt - a.updatedAt);
      if (rest.length) await loadProject(rest[0]);
      else { const np = blankProject("Untitled project"); await DB.put(np); await loadProject(np); }
    }
    renderProjectList();
  }
});

/* ---------- Startup ---------- */
export async function initProjects() {
  try { await DB.open(); dbReady = true; } catch { dbReady = false; }
  const example = () => {
    const ex = fromModel(EXAMPLE_DRAFT);
    return { ...blankProject("Shop schema (example)"), mode: "photo", draft: ex, tableCount: ex.tables.length };
  };

  if (!dbReady) {
    await loadProject(example());
    state.original = snapshotOf(state.schema.tables); emit("draft:replaced");
    setSaveState("error", "Projects can't be saved in this browser (private window?). Use Export to keep your work.");
    return;
  }

  let list = await DB.all();
  let created = false;
  if (!list.length) {
    // First run: start with the example, keeping any drawing from the earlier single-file version of this page.
    let legacy = [];
    try { legacy = JSON.parse(store.get("s2s.drawing") || "[]"); } catch { legacy = []; }
    const first = example();
    first.drawing.shapes = cleanShapes(legacy);
    await DB.put(first);
    store.del("s2s.drawing");
    list = [first]; created = true;
  }
  const last = store.get("s2s.currentProject");
  const pick = list.find((x) => x.id === last) || list.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  await loadProject(pick);
  if (created) { state.original = snapshotOf(state.schema.tables); emit("draft:replaced"); }
  if (created || !pick.thumb) markDirty();
}
