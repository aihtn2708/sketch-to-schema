// Draw mode: the tools (box, text, line, 1 → many, pen, eraser, hand), undo/clear and keyboard shortcuts.
import { $ } from "../util.js";
import { state, on, emit } from "../state.js";
import { hitShape } from "./shapes.js";
import { cv, cx, board, view, drawBoard, toCanvas, setZoom, stepZoom, setMeeting, inMeeting } from "./board.js";
import { setLabel } from "../icons.js";

let tool = "box";
let undoStack = [];       // previous versions of the drawing (JSON)
let erasing = null;       // { snap, any } while the eraser is held down
let pan = null;           // { x, y, sl, st } while moving the board
let spaceDown = false;
let textBox = null;       // the text field currently placed on the board

const changed = () => emit("dirty");
function pushUndo(snap = JSON.stringify(state.shapes)) {
  undoStack.push(snap);
  if (undoStack.length > 100) undoStack.shift();
}

function eraseAt(px, py) {
  const shapes = state.shapes;
  for (let i = shapes.length - 1; i >= 0; i--) {
    if (hitShape(cx, shapes[i], px, py)) { shapes.splice(i, 1); drawBoard(); return true; }
  }
  return false;
}

/* ---------- Pointer ---------- */
cv.addEventListener("pointerdown", (e) => {
  if (state.mode !== "draw" || e.button > 1) return;
  e.preventDefault();
  if (tool === "pan" || spaceDown || e.button === 1) {
    closeTextInput(true);
    pan = { x: e.clientX, y: e.clientY, sl: board.scrollLeft, st: board.scrollTop };
    cv.setPointerCapture(e.pointerId); board.classList.add("panning");
    return;
  }
  const [px, py] = toCanvas(e);
  if (tool === "text") { openTextInput(px, py); return; }
  cv.setPointerCapture(e.pointerId);
  if (tool === "eraser") { erasing = { snap: JSON.stringify(state.shapes), any: false }; if (eraseAt(px, py)) erasing.any = true; return; }
  view.drag = tool === "pen" ? { type: "pen", pts: [[px, py]] } : { type: tool, x1: px, y1: py, x2: px, y2: py };
  drawBoard();
});

cv.addEventListener("pointermove", (e) => {
  if (state.mode !== "draw") return;
  if (pan) { board.scrollLeft = pan.sl - (e.clientX - pan.x); board.scrollTop = pan.st - (e.clientY - pan.y); return; }
  const [px, py] = toCanvas(e);
  if (erasing) { if (eraseAt(px, py)) erasing.any = true; return; }
  const d = view.drag;
  if (!d) return;
  if (d.type === "pen") d.pts.push([px, py]); else { d.x2 = px; d.y2 = py; }
  drawBoard();
});

function endStroke() {
  if (pan) { pan = null; board.classList.remove("panning"); return; }
  if (erasing) {
    if (erasing.any) { pushUndo(erasing.snap); changed(); }
    erasing = null;
    return;
  }
  const s = view.drag;
  if (!s) return;
  view.drag = null;
  const big = s.type === "pen" ? s.pts.length > 1 : Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 8;   // ignore stray clicks
  if (big) { pushUndo(); state.shapes.push(s); changed(); }
  drawBoard();
}
cv.addEventListener("pointerup", endStroke);
cv.addEventListener("pointercancel", endStroke);

/* ---------- Text tool: a text field placed over the board ---------- */
function openTextInput(px, py) {
  closeTextInput(true);
  const r = cv.getBoundingClientRect(), br = board.getBoundingClientRect(), k = r.width / cv.width;
  const size = state.textSize;
  const inp = document.createElement("input");
  inp.className = "text-input"; inp.type = "text"; inp.setAttribute("aria-label", "Text to add");
  // The board scrolls, so offsets include its scroll position.
  inp.style.left = (r.left - br.left + board.scrollLeft + px * k) + "px";
  inp.style.top = (r.top - br.top + board.scrollTop + (py - size) * k) + "px";
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
      if (next && !ev.shiftKey && next.y < cv.height - 10) openTextInput(next.x, next.y - 4);
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
  pushUndo(); state.shapes = []; changed(); drawBoard();
});

/* ---------- Keyboard ---------- */
const TOOL_KEYS = { b: "box", t: "text", l: "line", m: "many", p: "pen", e: "eraser", h: "pan" };
document.addEventListener("keydown", (e) => {
  if (state.mode !== "draw" || e.target.closest("input, textarea, select")) return;
  const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); return; }
  if (e.code === "Space") { e.preventDefault(); if (!spaceDown) { spaceDown = true; board.classList.add("t-pan"); } return; }
  if (e.key === "Escape" && inMeeting()) { setMeeting(false); return; }
  if (e.key === "0" && plain) { setZoom("fit"); return; }
  if ((e.key === "+" || e.key === "=") && plain) { stepZoom(1); return; }
  if (e.key === "-" && plain) { stepZoom(-1); return; }
  if (plain && TOOL_KEYS[e.key.toLowerCase()]) setTool(TOOL_KEYS[e.key.toLowerCase()]);
});
document.addEventListener("keyup", (e) => {
  // preventDefault stops a focused toolbar button from being "clicked" by the Space release.
  if (e.code === "Space" && spaceDown) { e.preventDefault(); spaceDown = false; board.classList.toggle("t-pan", tool === "pan"); }
});

/* ---------- Other modules ---------- */
on("text:commit", () => closeTextInput(true));
on("project:loaded", () => { undoStack = []; });
