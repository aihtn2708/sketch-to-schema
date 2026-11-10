// Clickjacking guard (imported first by main.js): GitHub Pages can't send a header that forbids framing, so refuse to run
// inside another site's frame (it could trick clicks into spending your AI requests).
if (window.top !== window.self) {
  const note = document.createElement("p");
  note.className = "framed-note";
  note.textContent = "Sketch to Schema can't run inside another page. Open it in its own tab: ";
  const a = document.createElement("a");
  a.href = location.href; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = location.href;
  note.append(a);
  document.body.replaceChildren(note);
  throw new Error("Framed: not starting.");
}
