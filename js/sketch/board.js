// The sketch board: one canvas that shows either a photo (Photo mode) or the drawing (Draw mode).
// Also: zoom, board size, meeting mode, full screen, photo upload/drop/paste, and the image sent for extraction.
import { $, store, showMsg } from "../util.js";
import { state, emit, EXAMPLE_PHOTO_NAME } from "../state.js";
import { paintShape, strokeScale, shapesBounds } from "./shapes.js";
import { drawExample } from "./example.js";
import { encodeRegion, imageToJpeg, loadImage } from "./image.js";
import { setLabel } from "../icons.js";

export const cv = $("#sketch");
export const cx = cv.getContext("2d");
export const board = $("#board");

// View-only state (not saved): the shape being drawn right now, and the zoom level.
export const view = { drag: null, zoom: "fit" };

// This browser's last board and text size, used for new projects.
(() => {
  const [w, h] = (store.get("s2s.boardSize") || "").split("x").map(Number);
  if (w >= 600 && h >= 400) { state.boardW = w; state.boardH = h; }
  const ts = Number(store.get("s2s.textSize"));
  if ([24, 30, 40].includes(ts)) state.textSize = ts;
})();

/* ---------- Painting ---------- */
function drawPhoto() {
  const img = state.photo.img;
  if (!img) { drawExample(cv, cx); return; }
  const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  cv.width = Math.round(img.naturalWidth * scale); cv.height = Math.round(img.naturalHeight * scale);
  cx.drawImage(img, 0, 0, cv.width, cv.height);
}

export function drawBoard(withGrid = true) {
  cv.width = state.boardW; cv.height = state.boardH;
  cx.fillStyle = "#fbfbf9"; cx.fillRect(0, 0, cv.width, cv.height);
  if (withGrid) {
    cx.fillStyle = "rgba(60,80,75,0.16)";
    for (let gx = 20; gx < cv.width; gx += 40) for (let gy = 20; gy < cv.height; gy += 40) cx.fillRect(gx - 1, gy - 1, 2, 2);
  }
  const sf = strokeScale(state.boardW);
  for (const s of state.shapes) paintShape(cx, s, sf);
  if (view.drag) paintShape(cx, view.drag, sf);
  $("#drawHint").hidden = state.mode !== "draw" || state.shapes.length > 0 || !!view.drag;
}

export function redraw() {
  if (state.mode === "draw") drawBoard(true); else drawPhoto();
  applyZoom();
}

// Canvas pixel position of a pointer event.
export function toCanvas(e) {
  const r = cv.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * cv.width, ((e.clientY - r.top) / r.height) * cv.height];
}

/* ---------- Zoom ---------- */
const ZOOM_STEPS = [0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 2, 3];
export const inMeeting = () => document.body.classList.contains("meeting");

function fitZoom() {
  const availW = Math.max(100, board.clientWidth - 2);
  const availH = inMeeting() ? Math.max(100, board.clientHeight - 2) : Infinity;
  return Math.min(availW / state.boardW, availH / state.boardH);
}
const currentZoom = () => (view.zoom === "fit" ? fitZoom() : view.zoom);

export function applyZoom() {
  if (state.mode !== "draw") { cv.style.width = ""; return; }
  const z = currentZoom();
  cv.style.width = Math.round(state.boardW * z) + "px";
  $("#zoomVal").textContent = view.zoom === "fit" ? `Fit · ${Math.round(z * 100)}%` : `${Math.round(z * 100)}%`;
}

export function setZoom(z) {
  // Keep the point at the middle of the view in place while zooming.
  const rx = (board.scrollLeft + board.clientWidth / 2) / Math.max(1, cv.offsetWidth);
  const ry = (board.scrollTop + board.clientHeight / 2) / Math.max(1, cv.offsetHeight);
  view.zoom = z; applyZoom();
  board.scrollLeft = rx * cv.offsetWidth - board.clientWidth / 2;
  board.scrollTop = ry * cv.offsetHeight - board.clientHeight / 2;
}

export function stepZoom(dir) {
  const z = currentZoom();
  const next = dir > 0 ? ZOOM_STEPS.find((s) => s > z + 0.001) : [...ZOOM_STEPS].reverse().find((s) => s < z - 0.001);
  if (next) setZoom(next);
}

$("#zoomIn").addEventListener("click", () => stepZoom(1));
$("#zoomOut").addEventListener("click", () => stepZoom(-1));
$("#zoomFit").addEventListener("click", () => setZoom("fit"));
board.addEventListener("wheel", (e) => {
  if (state.mode !== "draw" || !(e.ctrlKey || e.metaKey)) return;
  e.preventDefault(); stepZoom(e.deltaY < 0 ? 1 : -1);
}, { passive: false });
addEventListener("resize", () => applyZoom());

/* ---------- Board and text size ---------- */
export const contentBounds = () => shapesBounds(cx, state.shapes);

// Put the selects in line with state (after a project opens).
export function syncBoardControls() {
  $("#boardSize").value = `${state.boardW}x${state.boardH}`;
  if ($("#boardSize").value !== `${state.boardW}x${state.boardH}`) {   // not one of the sizes offered
    state.boardW = 1200; state.boardH = 760; $("#boardSize").value = "1200x760";
  }
  $("#textSize").value = String(state.textSize);
}

$("#boardSize").addEventListener("change", (e) => {
  const [w, h] = e.target.value.split("x").map(Number);
  const b = contentBounds();
  if (b && (b.x1 > w || b.y1 > h)) {
    showMsg("Your drawing doesn't fit on that board. Pick a bigger size, or move or erase shapes near the right and bottom edges first.", true);
    e.target.value = `${state.boardW}x${state.boardH}`;
    return;
  }
  state.boardW = w; state.boardH = h; store.set("s2s.boardSize", e.target.value);
  const suggested = w >= 2600 ? 40 : w >= 1800 ? 30 : state.textSize;   // keep text readable at Fit
  if (suggested > state.textSize) { state.textSize = suggested; $("#textSize").value = String(suggested); store.set("s2s.textSize", String(suggested)); }
  view.zoom = "fit"; drawBoard(); applyZoom(); showMsg(""); emit("dirty");
});
$("#textSize").addEventListener("change", (e) => { state.textSize = Number(e.target.value); store.set("s2s.textSize", e.target.value); });

/* ---------- Meeting mode and full screen ---------- */
export function setMeeting(on) {
  emit("text:commit");
  if (on && state.mode !== "draw") setMode("draw");
  document.body.classList.toggle("meeting", on);
  $("#meetingBtn").setAttribute("aria-pressed", on);
  setLabel("#meetingBtn", on ? "Exit meeting mode" : "Meeting mode");
  if (!on && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  if (on) view.zoom = "fit";
  requestAnimationFrame(applyZoom);
}
$("#meetingBtn").addEventListener("click", () => setMeeting(!inMeeting()));
if (!document.fullscreenEnabled) $("#fsBtn").hidden = true;
$("#fsBtn").addEventListener("click", () => {
  if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
  setMeeting(true);
  document.documentElement.requestFullscreen?.().catch(() => showMsg("Full screen isn't available in this browser. Meeting mode is on instead."));
});
document.addEventListener("fullscreenchange", () => {
  setLabel("#fsBtn", document.fullscreenElement ? "Exit full screen" : "Full screen");
  requestAnimationFrame(applyZoom);
});

/* ---------- Photo / Draw mode ---------- */
export function setMode(m) {
  emit("text:commit");
  if (m === "photo" && inMeeting()) setMeeting(false);
  state.mode = m;
  $("#viewBar").hidden = m !== "draw";
  $("#modePhoto").setAttribute("aria-selected", m === "photo");
  $("#modeDraw").setAttribute("aria-selected", m === "draw");
  $("#photoBar").hidden = m !== "photo";
  $("#drawBar").hidden = m !== "draw";
  board.classList.toggle("drawing", m === "draw");
  $("#sourceName").textContent = m === "draw" ? "Your drawing" : state.photo.name;
  $("#sourceTip").textContent = m === "draw" ? "Saved with the project as you draw" : "Drop or paste an image here too";
  $("#drawHint").hidden = m !== "draw" || state.shapes.length > 0;
  redraw();
  emit("dirty");
}
$("#modePhoto").addEventListener("click", () => setMode("photo"));
$("#modeDraw").addEventListener("click", () => setMode("draw"));

/* ---------- Photo sources: upload, drop, paste, example ---------- */
async function takeFile(file) {
  if (!file || !/^image\//.test(file.type)) { showMsg("That isn't an image. Use a JPEG, PNG, WebP or GIF photo of the sketch.", true); return; }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    state.photo = { img, data: imageToJpeg(img), name: file.name || "Pasted image" };
    setMode("photo");
    showMsg("Photo ready. Press Extract schema to draft the tables.");
  } catch {
    showMsg("That image couldn't be opened. Try another file.", true);
  }
}
$("#fileInput").addEventListener("change", (e) => { takeFile(e.target.files[0]); e.target.value = ""; });
board.addEventListener("dragover", (e) => { e.preventDefault(); board.classList.add("drag"); });
board.addEventListener("dragleave", () => board.classList.remove("drag"));
board.addEventListener("drop", (e) => { e.preventDefault(); board.classList.remove("drag"); takeFile(e.dataTransfer.files[0]); });
document.addEventListener("paste", (e) => {
  if (e.target.closest?.("input, textarea, select")) return;
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
  if (item) { e.preventDefault(); takeFile(item.getAsFile()); }
});
$("#useExample").addEventListener("click", () => {
  state.photo = { img: null, data: null, name: EXAMPLE_PHOTO_NAME };
  setMode("photo"); showMsg("");
});

/* ---------- The image sent to the model ---------- */
// Photo: the whole image. Drawing: only the area drawn on (plus a margin) and without the dot grid,
// so a large board doesn't shrink the text before the model reads it.
export function sketchImage() {
  let rect = { x: 0, y: 0, w: cv.width, h: cv.height };
  if (state.mode === "draw") {
    drawBoard(false);
    const b = contentBounds();
    if (b) {
      const m = 40;
      const x = Math.max(0, Math.floor(b.x0 - m)), y = Math.max(0, Math.floor(b.y0 - m));
      rect = { x, y, w: Math.min(cv.width, Math.ceil(b.x1 + m)) - x, h: Math.min(cv.height, Math.ceil(b.y1 + m)) - y };
    }
  }
  const dataUrl = encodeRegion(cv, rect, 1300);
  if (state.mode === "draw") drawBoard(true);
  return dataUrl;
}
