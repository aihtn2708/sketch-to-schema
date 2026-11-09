// Projects are stored in this browser's IndexedDB (database "sketch-to-schema", store "projects").
export const DB = {
  db: null,
  open() {
    return new Promise((ok, bad) => {
      if (!("indexedDB" in window)) { bad(new Error("unavailable")); return; }
      const r = indexedDB.open("sketch-to-schema", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("projects", { keyPath: "id" });
      r.onsuccess = () => { this.db = r.result; ok(); };
      r.onerror = () => bad(r.error);
      r.onblocked = () => bad(new Error("blocked"));
    });
  },
  tx(mode, fn) {
    return new Promise((ok, bad) => {
      const t = this.db.transaction("projects", mode);
      const req = fn(t.objectStore("projects"));
      t.oncomplete = () => ok(req?.result);
      t.onerror = () => bad(t.error);
      t.onabort = () => bad(t.error);
    });
  },
  all() { return this.tx("readonly", (st) => st.getAll()); },
  put(p) { return this.tx("readwrite", (st) => st.put(p)); },
  del(id) { return this.tx("readwrite", (st) => st.delete(id)); }
};
