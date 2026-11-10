// Shared request helpers for provider files.
//
// Every provider exports:
//   extract(key, dataUrl, { model, signal, onStatus }) → { result: <compact JSON>, model, parts, incomplete? }
//   ask(key, prompt, { model, signal, schema })         → { text, truncated, model }   (text only, no image)
// and throws an Error with a message for the user.
import { countRequest } from "../usage.js";

// An error with a message for the user. fatal = trying another model won't help (bad key, no credit, daily limit).
export class ProviderError extends Error {
  constructor(message, { fatal = false } = {}) {
    super(message);
    this.fatal = fatal;
  }
}

// The error message an API returned, if any (most use {error: {message}}).
export async function apiError(res) {
  try {
    const b = await res.json();
    return b?.error?.message || b?.message || "";
  } catch {
    return "";
  }
}

// POST a JSON body. When the API answers 400 (often: a setting this model doesn't support),
// apply one fallback and try again. Each fallback is { when: RegExp, fix(body) → body }; the first
// one whose `when` matches the error message is used, otherwise the next one in the list.
export async function postJson(url, headers, body, { signal, fallbacks = [] } = {}) {
  const left = [...fallbacks];
  let b = body;
  for (;;) {
    countRequest();
    const res = await fetch(url, { method: "POST", signal, headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(b) });
    if (res.status !== 400 || !left.length) return res;
    const detail = await apiError(res.clone());
    const i = Math.max(0, left.findIndex((f) => f.when.test(detail)));
    b = left.splice(i, 1)[0].fix(structuredClone(b));
  }
}

// Common fallbacks.
export const without = (key, when = new RegExp(key, "i")) => ({ when, fix: (b) => { delete b[key]; return b; } });
export const capTokens = (key, n) => ({
  when: new RegExp(`${key}|max.?tokens|output tokens|too large|exceeds`, "i"),
  fix: (b) => { b[key] = n; return b; }
});
