// Small helpers shared by every module. Nothing here touches the page until it's called.

export const $ = (selector) => document.querySelector(selector);

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

export const uid = () => Math.random().toString(36).slice(2, 9);

export const link = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;

// localStorage that never throws (private windows and blocked storage just return nothing).
export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } }
};

// The message line under the Extract button.
export function showMsg(text, isErr = false) {
  const m = $("#msg");
  m.hidden = !text;
  m.textContent = text || "";
  m.classList.toggle("err", isErr);
}
