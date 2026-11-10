// The page's side of the mock database: starts the worker, sends it work, and can stop it.
// Stopping ends the worker (the only way to stop a running query); the next run rebuilds.

// PostgreSQL in WebAssembly. Pinned to one version; to update, change the number and test.
export const PGLITE_URL = "https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.5.11/dist/index.js";

let worker = null, seq = 0, builtKey = null;
const pending = new Map();

function start() {
  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  worker.onmessage = ({ data }) => {
    const p = pending.get(data.id);
    if (!p) return;
    pending.delete(data.id);
    data.ok ? p.resolve(data) : p.reject(data.error);
  };
  worker.onerror = (e) => {
    e.preventDefault?.();
    reset({ message: e.message || "The database stopped unexpectedly. Run again to restart it.", label: "worker" });
  };
}

function reset(error) {
  worker?.terminate();
  worker = null; builtKey = null;
  for (const p of pending.values()) p.reject(error);
  pending.clear();
}

function call(msg) {
  if (!worker) start();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ ...msg, id });
  });
}

export const isBuilt = (key) => !!worker && builtKey === key;
export const busy = () => pending.size > 0;

// steps: [{ sql, label, soft }] run in order; soft steps only warn when they fail.
export async function build(key, steps, countSql) {
  builtKey = null;
  const r = await call({ type: "build", url: PGLITE_URL, steps, countSql });
  builtKey = key;
  return r;
}

export const run = (sql, maxRows = 1000) => call({ type: "run", sql, maxRows });

export function stop() { reset({ message: "Stopped.", label: "stopped", stopped: true }); }
