// Counts AI requests sent from this browser today (all features together), so people can see
// how close they are to a daily budget. Stored per browser; resets each local day.
const KEY = "s2s.requests";
const listeners = [];
const today = () => new Date().toLocaleDateString("en-CA");          // YYYY-MM-DD, local time
const hasStorage = () => typeof window !== "undefined" && typeof localStorage !== "undefined";

export function requestsToday() {
  if (!hasStorage()) return 0;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "{}");
    return v.day === today() ? Number(v.n) || 0 : 0;
  } catch { return 0; }
}

export function countRequest() {
  if (!hasStorage()) return;
  try { localStorage.setItem(KEY, JSON.stringify({ day: today(), n: requestsToday() + 1 })); } catch { /* storage blocked */ }
  for (const fn of listeners) fn();
}

export const onUsage = (fn) => listeners.push(fn);
