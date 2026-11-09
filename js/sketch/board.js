// The sketch board: one canvas that shows either a photo (Photo mode) or the drawing (Draw mode).
// In Draw mode the board is an open-ended space: shapes live in "world" coordinates, and the
// view (pan + zoom) decides which part is on screen. Also: meeting mode, full screen,
// photo upload/drop/paste, and the image sent for extraction.
import { $, store, showMsg } from "../util.js";
import { state, emit, EXAMPLE_PHOTO_NAME } from "../state.js";
import { paintShape, shapesBounds } from "./shapes.js";
import { drawExample } from "./example.js";
import { encodeRegion, imageToJpeg, loadImage, thumbnail } from "./image.js";
import { setLabel } from "../icons.js";

export const cv = $("#sketch");
export const cx = cv.getContext("2d");
export const board = $("#board");

// View-only state (not saved). Screen position = world position × k + (x, y), in CSS pixels.
export const view = { drag: null, x: 0, y: 0, k: 1, needsFit: true };
const MIN_K = 0.1, MAX_K = 4;
let dpr = 1, cssW = 0, cssH = 0;

// This browser's last text size, used for new text.
(() => {
  const ts = Number(store.get("s2s.textSize"));
  if ([24, 30, 40].includes(ts)) state.textSize = ts;
})();

/* ---------- Painting ---------- */
function drawPhoto() {
  cv.style.width = ""; cv.style.height = "";
  const img = state.photo.img;
  if (!img) { drawExample(cv, cx); return; }
  const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  cv.width = Math.round(img.naturalWidth * scale); cv.height = Math.round(img.naturalHeight * scale);
  cx.drawImage(img, 0, 0, cv.width, cv.height);
}

// Match the canvas to the board's size on screen (only reallocates when the size changes).
function fitCanvasToBoard() {
  const w = board.clientWidth, h = board.clientHeight, r = window.devicePixelRatio || 1;
  if (w === cssW && h === cssH && r === dpr) return;
  cssW = w; cssH = h; dpr = r;
  cv.width = Math.max(1, Math.round(w * r)); cv.height = Math.max(1, Math.round(h * r));
  cv.style.width = w + "px"; cv.style.height = h + "px";
}

export function drawBoard() {
  if (state.mode !== "draw") return;
  fitCanvasToBoard();
  if (!cssW || !cssH) return;              // not visible yet
  if (view.needsFit) { view.needsFit = false; fitView(false); }
  const { x, y, k } = view;
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cx.fillStyle = "#fbfbf9"; cx.fillRect(0, 0, cssW, cssH);
  // Dot grid every 40 world units, thinned out when zoomed far out.
  let g = 40;
  while (g * k < 16) g *= 2;
  cx.fillStyle = "rgba(60,80,75,0.18)";
  const gx0 = Math.floor(-x / k / g) * g, gy0 = Math.floor(-y / k / g) * g;
  for (let gx = gx0; gx * k + x < cssW; gx += g) {
    for (let gy = gy0; gy * k + y < cssH; gy += g) cx.fillRect(gx * k + x - 1, gy * k + y - 1, 2, 2);
  }
  cx.setTransform(dpr * k, 0, 0, dpr * k, dpr * x, dpr * y);
  for (const s of state.shapes) paintShape(cx, s);
  if (view.drag) paintShape(cx, view.drag);
  cx.setTransform(1, 0, 0, 1, 0, 0);
  $("#drawHint").hidden = state.shapes.length > 0 || !!view.drag;
  $("#zoomVal").textContent = `${Math.round(k * 100)}%`;
}

export function redraw() {
  if (state.mode === "draw") drawBoard(); else drawPhoto();
}

// Redraw when the board changes size (window resize, meeting mode, full screen).
new ResizeObserver(() => { if (state.mode === "draw") drawBoard(); }).observe(board);

/* ---------- Coordinates ---------- */
// Pointer position on the board, in CSS pixels.
export function toScreen(e) {
  const r = board.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}
// Pointer position in world coordinates.
export function toWorld(e) {
  const [sx, sy] = toScreen(e);
  return [(sx - view.x) / view.k, (sy - view.y) / view.k];
}
export const boardSize = () => [cssW, cssH];

/* ---------- Pan and zoom ---------- */
export const inMeeting = () => document.body.classList.contains("meeting");

export function panBy(dx, dy) {
  view.x += dx; view.y += dy;
  drawBoard();
}

// Zoom to k, keeping the world point under (sx, sy) in place (default: the middle of the board).
export function setZoom(k, sx = cssW / 2, sy = cssH / 2) {
  emit("text:commit");
  const nk = Math.min(MAX_K, Math.max(MIN_K, k));
  const wx = (sx - view.x) / view.k, wy = (sy - view.y) / view.k;
  view.k = nk; view.x = sx - wx * nk; view.y = sy - wy * nk;
  drawBoard();
}

const ZOOM_STEPS = [0.1, 0.15, 0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 2, 3, 4];
export function stepZoom(dir) {
  const k = view.k;
  const next = dir > 0 ? ZOOM_STEPS.find((s) => s > k + 0.001) : [...ZOOM_STEPS].reverse().find((s) => s < k - 0.001);
  if (next) setZoom(next);
}

// Show the whole drawing (or a fresh area at 100% when the board is empty).
export function fitView(draw = true) {
  emit("text:commit");
  const b = contentBounds();
  if (!b || !cssW) { view.k = 1; view.x = 40; view.y = 40; }
  else {
    const m = 40, bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    const k = Math.min(MAX_K, Math.max(MIN_K, Math.min((cssW - 2 * m) / Math.max(bw, 1), (cssH - 2 * m) / Math.max(bh, 1), 1.25)));
    view.k = k;
    view.x = (cssW - bw * k) / 2 - b.x0 * k;
    view.y = (cssH - bh * k) / 2 - b.y0 * k;
  }
  if (draw) drawBoard();
}

$("#zoomIn").addEventListener("click", () => stepZoom(1));
$("#zoomOut").addEventListener("click", () => stepZoom(-1));
$("#zoomFit").addEventListener("click", () => fitView());

// Ctrl/⌘ + scroll (and trackpad pinch) zooms at the pointer. In meeting mode, plain scrolling
// moves around the board; elsewhere it scrolls the page as usual.
board.addEventListener("wheel", (e) => {
  if (state.mode !== "draw") return;
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const [sx, sy] = toScreen(e);
    setZoom(view.k * Math.exp(-e.deltaY * 0.0025), sx, sy);
  } else if (inMeeting()) {
    e.preventDefault();
    emit("text:commit");
    panBy(-e.deltaX, -e.deltaY);
  }
}, { passive: false });

/* ---------- Text size ---------- */
export const contentBounds = () => shapesBounds(cx, state.shapes);

export function syncBoardControls() { $("#textSize").value = String(state.textSize); }
$("#textSize").addEventListener("change", (e) => { state.textSize = Number(e.target.value); store.set("s2s.textSize", e.target.value); });

/* ---------- Meeting mode and full screen ---------- */
export function setMeeting(on) {
  emit("text:commit");
  if (on && state.mode !== "draw") setMode("draw");
  document.body.classList.toggle("meeting", on);
  $("#meetingBtn").setAttribute("aria-pressed", on);
  setLabel("#meetingBtn", on ? "Exit meeting mode" : "Meeting mode");
  if (!on && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
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
  cssW = cssH = 0;                          // the canvas changes role, so re-measure
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

/* ---------- Images of the drawing ---------- */
// The drawn area (plus a margin) on white, at most maxEdge pixels on its long side.
function renderDrawing(maxEdge, quality) {
  const b = contentBounds() || { x0: 0, y0: 0, x1: 600, y1: 380 };
  const m = 40, w = b.x1 - b.x0 + 2 * m, h = b.y1 - b.y0 + 2 * m;
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale));
  const g = c.getContext("2d");
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height);
  g.setTransform(scale, 0, 0, scale, (m - b.x0) * scale, (m - b.y0) * scale);
  for (const s of state.shapes) paintShape(g, s);
  return c.toDataURL("image/jpeg", quality);
}

// The image sent to the model: the whole photo, or only the part of the board that was drawn on
// (so a spread-out drawing isn't shrunk before the model reads it).
export function sketchImage() {
  if (state.mode === "draw") return renderDrawing(1300, 0.88);
  return encodeRegion(cv, { x: 0, y: 0, w: cv.width, h: cv.height }, 1300);
}

// Preview for the Projects list.
export function boardThumbnail() {
  return state.mode === "draw" ? renderDrawing(240, 0.7) : thumbnail(cv);
}
