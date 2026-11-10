// Small helpers shared by every module. Nothing here touches the page until it's called.

export const $ = (selector) => document.querySelector(selector);

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

export const uid = () => Math.random().toString(36).slice(2, 9);

// Ids from saved or imported files end up in HTML attributes and as object keys, so they must be
// plain: letters, digits, _ and -, at most 64 characters, and not a name every object already has
// ("__proto__", "constructor", ...). Anything else maps to a stable safe id (the same input always
// gives the same output, so references between tables stay intact).
const RESERVED = new Set(["__proto__", "constructor", "prototype", "hasOwnProperty", "toString", "valueOf"]);
export function safeId(v) {
  const s = String(v ?? "");
  if (/^[A-Za-z0-9_-]{1,64}$/.test(s) && !RESERVED.has(s)) return s;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return "x" + (h >>> 0).toString(36);
}

export const link = (href, text) => `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;

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

// A file-name-safe version of a name ("Shop schema (v2)" → "shop-schema-v2").
export const slug = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
