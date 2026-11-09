// Line icons (24×24, drawn with currentColor so they follow the button's color).
// Put data-icon="name" on any element to get its icon; svgIcon(name) is for HTML built in code.
import { $ } from "./util.js";

const ICONS = {
  box: '<rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M4 9h16"/>',
  text: '<path d="M5 6h14M12 6v13M9 19h6"/>',
  line: '<path d="M5 19L19 5"/>',
  many: '<path d="M3 12h13M6 8v8M16 12l5-5M16 12h5M16 12l5 5"/>',
  pen: '<path d="M4 20l1-4L16 5a2.1 2.1 0 0 1 3 3L8 19z"/><path d="M14 7l3 3"/>',
  eraser: '<path d="M7 20l-3-3a2 2 0 0 1 0-3L13 5a2 2 0 0 1 3 0l4 4a2 2 0 0 1 0 3l-8 8z"/><path d="M9 10l5 5M12 20h8"/>',
  hand: '<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3.8 14a1.5 1.5 0 0 1 2.4-1.8L8 14.5"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  zoomOut: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5M8 11h6"/>',
  zoomIn: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5M8 11h6M11 8v6"/>',
  fit: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  meeting: '<rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M8 21h8M12 17v4"/>',
  fullscreen: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  layout: '<rect x="3" y="4" width="7" height="6" rx="1"/><rect x="14" y="4" width="7" height="6" rx="1"/><rect x="8.5" y="14" width="7" height="6" rx="1"/><path d="M6.5 10v2h11v-2M12 12v2"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>'
};

export const svgIcon = (name) => (ICONS[name]
  ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`
  : "");

export function injectIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => el.insertAdjacentHTML("afterbegin", svgIcon(el.dataset.icon)));
}

// Change a toolbar button's text without removing its icon.
export function setLabel(selector, text) {
  const l = $(selector)?.querySelector(".lbl");
  if (l) l.textContent = text;
}
