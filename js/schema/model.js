// The draft schema as data: turning a model's reply into tables, and reading the draft back.
// Pure functions only (no page access), so they're covered by tests/model.test.js.
import { uid } from "../util.js";

export const FIELD_LABEL = { name: "Name", type: "Type", pk: "Key", references: "Reference" };

export const normFlags = (f) => Array.isArray(f)
  ? f.filter((x) => x && FIELD_LABEL[x.field] && x.note).map((x) => ({ field: x.field, note: String(x.note) }))
  : [];

// Long-form draft ({tables: [{name, columns: [...]}]}) → editable tables with ids and resolved references.
export function fromModel(data) {
  const tables = (Array.isArray(data?.tables) ? data.tables : []).map((t) => ({
    id: uid(), name: String(t?.name ?? ""), flags: normFlags(t?.flags),
    columns: (Array.isArray(t?.columns) ? t.columns : []).map((c) => ({
      id: uid(), name: String(c?.name ?? ""), type: String(c?.type ?? ""),
      typeGuessed: !!c?.type_guessed, pk: !!c?.pk,
      nullable: c?.nullable === undefined || c?.nullable === null ? !c?.pk : !!c.nullable,
      unique: !!c?.unique, refName: c?.references ? String(c.references) : null, ref: null,
      flags: normFlags(c?.flags)
    }))
  }));
  for (const t of tables) for (const c of t.columns) {
    if (!c.refName) continue;
    const [tn, cn] = c.refName.split(".");
    const tt = tables.find((x) => x.name.toLowerCase() === (tn || "").toLowerCase());
    const cc = tt?.columns.find((x) => x.name.toLowerCase() === (cn || "id").toLowerCase());
    if (tt && cc) c.ref = { t: tt.id, c: cc.id };
    else if (!c.flags.some((f) => f.field === "references")) c.flags.push({ field: "references", note: `Points to ${c.refName}, which isn't in the draft.` });
  }
  const warnings = (Array.isArray(data?.warnings) ? data.warnings : []).map(String).filter(Boolean);
  return { tables, warnings };
}

// Models reply with compact keys (n, t, g, pk, nul, u, ref, flag) to keep output tokens low.
const FLAG_FIELD = { name: "name", type: "type", pk: "pk", ref: "references", references: "references" };
export function fromCompact(r) {
  const tables = (Array.isArray(r?.tables) ? r.tables : []).map((t) => ({
    name: t?.n ?? "",
    columns: (Array.isArray(t?.cols) ? t.cols : []).map((c) => {
      const flags = [];
      if (typeof c?.flag === "string" && c.flag.trim()) {
        const m = c.flag.match(/^\s*(name|type|pk|ref|references)\s*:\s*(.+)$/i);
        flags.push(m ? { field: FLAG_FIELD[m[1].toLowerCase()], note: m[2] } : { field: "name", note: c.flag.trim() });
      }
      return {
        name: c?.n ?? "", type: c?.t ?? "", type_guessed: !!c?.g, pk: !!c?.pk,
        nullable: typeof c?.nul === "boolean" ? c.nul : undefined, unique: !!c?.u,
        references: c?.ref ? String(c.ref) : null, flags
      };
    })
  }));
  return { tables, warnings: Array.isArray(r?.warnings) ? r.warnings : [] };
}

export const refKey = (c) => (c.ref ? c.ref.t + "." + c.ref.c : "");

export function findObj(tables, id) {
  for (const t of tables) {
    if (t.id === id) return t;
    for (const c of t.columns) if (c.id === id) return c;
  }
  return null;
}
export function colById(tables, id) {
  for (const t of tables) for (const c of t.columns) if (c.id === id) return { t, c };
  return null;
}

// Record the draft as extracted, so we can show how much the reviewer kept.
export function snapshotOf(tables) {
  const o = {};
  for (const t of tables) {
    o[t.id] = { name: t.name };
    for (const c of t.columns) o[c.id] = { name: c.name, type: c.type, pk: c.pk, nullable: c.nullable, unique: c.unique, ref: refKey(c) };
  }
  return o;
}

// Counts for the summary pills: open flags, columns, and % of extracted fields kept.
export function draftStats(tables, original) {
  let flags = 0, cols = 0, total = 0, kept = 0;
  for (const t of tables) { flags += t.flags.length; cols += t.columns.length; for (const c of t.columns) flags += c.flags.length; }
  for (const id in original) {
    const o = original[id], obj = findObj(tables, id);
    for (const k in o) { total++; if (obj && (k === "ref" ? refKey(obj) : obj[k]) === o[k]) kept++; }
  }
  return { flags, cols, keptPct: total ? Math.round((kept / total) * 100) : null };
}

// Saved or imported drafts are untrusted: rebuild them field by field.
export function cleanDraft(tables) {
  return (Array.isArray(tables) ? tables : []).map((t) => ({
    id: String(t?.id || uid()), name: String(t?.name ?? ""), flags: normFlags(t?.flags),
    columns: (Array.isArray(t?.columns) ? t.columns : []).map((c) => ({
      id: String(c?.id || uid()), name: String(c?.name ?? ""), type: String(c?.type ?? ""),
      typeGuessed: !!c?.typeGuessed, pk: !!c?.pk, nullable: !!c?.nullable, unique: !!c?.unique,
      ref: c?.ref && typeof c.ref.t === "string" && typeof c.ref.c === "string" ? { t: c.ref.t, c: c.ref.c } : null,
      refName: c?.refName ? String(c.refName) : null, flags: normFlags(c?.flags)
    }))
  }));
}
