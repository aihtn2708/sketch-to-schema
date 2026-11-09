// Draw mode: the tools (box, text, line, 1 → many, pen, eraser, hand), undo/clear,
// moving around the open-ended board, and keyboard shortcuts.
import { $ } from "../util.js";
import { state, on, emit } from "../state.js";
import { hitShape } from "./shapes.js";
import { cv, cx, board, view, drawBoard, toScreen, toWorld, boardSize, panBy, setZoom, stepZoom, fitView, setMeeting, inMeeting } from "./board.js";
import { setLabel } from "../icons.js";

let tool = "box";
let undoStack = [];       // previous versions of the drawing (JSON)
let erasing = null;       // { snap, any } while the eraser is held down
let pan = null;           // { x, y, vx, vy } while moving the board
let spaceDown = false;
let textBox = null;       // the text field currently placed on the board
const pointers = new Map(); // active touch pointers, for two-finger pinch
let pinch = null;

const changed = () => emit("dirty");
function pushUndo(snap = JSON.stringify(state.shapes)) {
  undoStack.push(snap);
  if (undoStack.length > 100) undoStack.shift();
}

function eraseAt(px, py) {
  const shapes = state.shapes;
  for (let i = shapes.length - 1; i >= 0; i--) {
    // Same 12-pixel reach on screen at any zoom level.
    if (hitShape(cx, shapes[i], px, py, 12 / view.k)) { shapes.splice(i, 1); drawBoard(); return true; }
  }
  return false;
}

/* ---------- Auto-scroll: drawing past an edge moves the board, so there's always more room ---------- */
const EDGE = 36;          // px from the board's edge where auto-scroll starts
let edge = null;          // { vx, vy, e } while the pointer is near an edge during a stroke
function edgeLoop() {
  if (!edge || (!view.drag && !erasing)) { edge = null; return; }
  view.x -= edge.vx * 10; view.y -= edge.vy * 10;
  moveStroke(edge.e);
  requestAnimationFrame(edgeLoop);
}
function checkEdge(e) {
  const [sx, sy] = toScreen(e), [w, h] = boardSize();
  const vx = sx < EDGE ? -1 : sx > w - EDGE ? 1 : 0;
  const vy = sy < EDGE ? -1 : sy > h - EDGE ? 1 : 0;
  if (!vx && !vy) { edge = null; return; }
  const running = !!edge;
  edge = { vx, vy, e };
  if (!running) requestAnimationFrame(edgeLoop);
}

/* ---------- Pointer ---------- */
function moveStroke(e) {
  const [px, py] = toWorld(e);
  if (erasing) { if (eraseAt(px, py)) erasing.any = true; return; }
  const d = view.drag;
  if (!d) return;
  if (d.type === "pen") d.pts.push([px, py]); else { d.x2 = px; d.y2 = py; }
  drawBoard();
}

cv.addEventListener("pointerdown", (e) => {
  if (state.mode !== "draw" || e.button > 1) return;
  e.preventDefault();
  cv.setPointerCapture(e.pointerId);
  if (e.pointerType === "touch") {
    pointers.set(e.pointerId, toScreen(e));
    if (pointers.size === 2) {
      // Second finger: cancel the stroke and pinch-zoom / move instead.
      view.drag = null; erasing = null; edge = null; pan = null;
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: view.k, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 };
      drawBoard();
      return;
    }
  }
  if (tool === "pan" || spaceDown || e.button === 1) {
    emit("text:commit");
    pan = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    board.classList.add("panning");
    return;
  }
  const [px, py] = toWorld(e);
  if (tool === "text") { openTextInput(px, py); return; }
  if (tool === "eraser") { erasing = { snap: JSON.stringify(state.shapes), any: false }; if (eraseAt(px, py)) erasing.any = true; return; }
  view.drag = tool === "pen" ? { type: "pen", pts: [[px, py]] } : { type: tool, x1: px, y1: py, x2: px, y2: py };
  drawBoard();
});

cv.addEventListener("pointermove", (e) => {
  if (state.mode !== "draw") return;
  if (pinch && pointers.has(e.pointerId)) {
    pointers.set(e.pointerId, toScreen(e));
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    view.x += mx - pinch.mx; view.y += my - pinch.my; pinch.mx = mx; pinch.my = my;
    setZoom(pinch.k * (d / Math.max(1, pinch.d)), mx, my);
    return;
  }
  if (pan) { view.x = pan.vx + (e.clientX - pan.x); view.y = pan.vy + (e.clientY - pan.y); drawBoard(); return; }
  if (!view.drag && !erasing) return;
  moveStroke(e);
  checkEdge(e);
});

function endStroke(e) {
  pointers.delete(e.pointerId);
  if (pinch) { if (pointers.size < 2) pinch = null; return; }
  edge = null;
  if (pan) { pan = null; board.classList.remove("panning"); return; }
  if (erasing) {
    if (erasing.any) { pushUndo(erasing.snap); changed(); }
    erasing = null;
    return;
  }
  const s = view.drag;
  if (!s) return;
  view.drag = null;
  // Ignore stray clicks (measured on screen, so it works the same at any zoom).
  const big = s.type === "pen" ? s.pts.length > 1 : Math.hypot(s.x2 - s.x1, s.y2 - s.y1) * view.k > 8;
  if (big) { pushUndo(); state.shapes.push(s); changed(); }
  drawBoard();
}
cv.addEventListener("pointerup", endStroke);
cv.addEventListener("pointercancel", endStroke);

/* ---------- Text tool: a text field placed over the board ---------- */
function openTextInput(px, py) {
  closeTextInput(true);
  const k = view.k, size = state.textSize;
  const inp = document.createElement("input");
  inp.className = "text-input"; inp.type = "text"; inp.setAttribute("aria-label", "Text to add");
  inp.style.left = (px * k + view.x) + "px";
  inp.style.top = ((py - size) * k + view.y) + "px";
  inp.style.fontSize = Math.max(12, size * k) + "px";
  inp.style.height = Math.max(18, (size + 10) * k) + "px";
  board.appendChild(inp);
  textBox = { inp, x: px, y: py + 4, size };
  inp.focus();
  requestAnimationFrame(() => { if (textBox?.inp === inp && document.activeElement !== inp) inp.focus(); });
  inp.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      // Enter adds the text and starts the next line below it (like typing column names).
      ev.preventDefault();
      const next = textBox ? { x: textBox.x, y: textBox.y + Math.round(textBox.size * 1.35) } : null;
      closeTextInput(true);
      if (next && !ev.shiftKey) openTextInput(next.x, next.y - 4);
    }
    if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); closeTextInput(true); }
  });
  inp.addEventListener("blur", () => setTimeout(() => { if (textBox?.inp === inp) closeTextInput(true); }, 0));
}

function closeTextInput(commit) {
  if (!textBox) return;
  const { inp, x, y, size } = textBox;
  textBox = null;
  const v = inp.value.trim();
  inp.remove();
  if (commit && v) { pushUndo(); state.shapes.push({ type: "text", x, y, size, text: v }); changed(); }
  drawBoard();
}

/* ---------- Toolbar ---------- */
function setTool(t) {
  tool = t;
  document.querySelectorAll("#drawBar [data-tool]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.tool === t));
  board.classList.toggle("t-eraser", t === "eraser");
  board.classList.toggle("t-text", t === "text");
  board.classList.toggle("t-pan", t === "pan" || spaceDown);
}
document.querySelectorAll("#drawBar [data-tool]").forEach((b) => b.addEventListener("click", () => setTool(b.dataset.tool)));

function undo() {
  if (!undoStack.length) return;
  state.shapes = JSON.parse(undoStack.pop());
  changed(); drawBoard();
}
$("#undoBtn").addEventListener("click", undo);

let clearArmed = false;
$("#clearBtn").addEventListener("click", () => {
  if (!state.shapes.length) return;
  if (!clearArmed) {
    clearArmed = true; setLabel("#clearBtn", "Click again to clear");
    setTimeout(() => { clearArmed = false; setLabel("#clearBtn", "Clear"); }, 2500);
    return;
  }
  clearArmed = false; setLabel("#clearBtn", "Clear");
  pushUndo(); state.shapes = []; changed(); fitView();
});

/* ---------- Keyboard ---------- */
const TOOL_KEYS = { b: "box", t: "text", l: "line", m: "many", p: "pen", e: "eraser", h: "pan" };
const ARROWS = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
document.addEventListener("keydown", (e) => {
  if (state.mode !== "draw" || e.target.closest("input, textarea, select")) return;
  const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); return; }
  if (e.code === "Space") { e.preventDefault(); if (!spaceDown) { spaceDown = true; board.classList.add("t-pan"); } return; }
  if (e.key === "Escape" && inMeeting()) { setMeeting(false); return; }
  if (e.key === "0" && plain) { fitView(); return; }
  if ((e.key === "+" || e.key === "=") && plain) { stepZoom(1); return; }
  if (e.key === "-" && plain) { stepZoom(-1); return; }
  // Arrow keys move around the board (when the focus isn't on a form control).
  if (ARROWS[e.key] && plain && !e.target.closest("button")) {
    e.preventDefault();
    const [dx, dy] = ARROWS[e.key];
    panBy(dx * 120, dy * 120);
    return;
  }
  if (plain && TOOL_KEYS[e.key.toLowerCase()]) setTool(TOOL_KEYS[e.key.toLowerCase()]);
});
document.addEventListener("keyup", (e) => {
  // preventDefault stops a focused toolbar button from being "clicked" by the Space release.
  if (e.code === "Space" && spaceDown) { e.preventDefault(); spaceDown = false; board.classList.toggle("t-pan", tool === "pan"); }
});

/* ---------- Other modules ---------- */
on("text:commit", () => closeTextInput(true));
on("project:loaded", () => { undoStack = []; view.needsFit = true; });
