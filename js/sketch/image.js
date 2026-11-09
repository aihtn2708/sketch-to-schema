// Turning canvases and photos into JPEG data URLs (for sending to a model, saving, and previews).

// Part of a canvas (rect in canvas pixels) as a JPEG no larger than maxEdge on its long side.
export function encodeRegion(source, rect, maxEdge = 1300, quality = 0.88) {
  const { x, y, w, h } = rect;
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale));
  const g = c.getContext("2d");
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(source, x, y, w, h, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", quality);
}

// An uploaded photo as a JPEG to store in the project (keeps projects small).
export function imageToJpeg(img, maxEdge = 1600) {
  return encodeRegion(img, { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight }, maxEdge, 0.85);
}

// A small preview for the Projects list.
export function thumbnail(source, width = 240) {
  return encodeRegion(source, { x: 0, y: 0, w: source.width, h: source.height }, width, 0.7);
}

export const loadImage = (src) => new Promise((ok, bad) => {
  const i = new Image();
  i.onload = () => ok(i); i.onerror = bad; i.src = src;
});
