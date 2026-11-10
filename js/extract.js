// The Extract button: sketch image → chosen provider → draft schema.
import { $, showMsg } from "./util.js";
import { state, emit } from "./state.js";
import { active, updateConnStatus } from "./connection.js";
import { sketchImage, inMeeting } from "./sketch/board.js";
import { fromCompact, fromModel, snapshotOf } from "./schema/model.js";

let ctl = null;

$("#extractBtn").addEventListener("click", async () => {
  emit("text:commit");
  const { provider, key, model } = active();
  if (!key) { showMsg("Add your API key under AI connection first.", true); $("#apiKey").focus(); return; }
  if (state.mode === "draw" && !state.shapes.length) { showMsg("Draw something first: a box per table with its name and columns.", true); return; }

  ctl = new AbortController();
  $("#busy").hidden = false; $("#busyText").textContent = "Reading the sketch…";
  $("#extractBtn").disabled = true; showMsg("");
  try {
    const out = await provider.extract(key, sketchImage(), {
      model, signal: ctl.signal, onStatus: (text) => { $("#busyText").textContent = text; }
    });
    const next = fromModel(fromCompact(out.result));
    if (!next.tables.length) {
      showMsg(next.warnings[0] ? `No tables found. ${next.warnings[0]}` : "No tables found. Try a clearer sketch.", true);
      return;
    }
    state.schema = next;
    state.original = snapshotOf(next.tables);
    emit("draft:replaced"); emit("dirty");
    const n = next.tables.reduce((a, t) => a + t.flags.length + t.columns.reduce((b, c) => b + c.flags.length, 0), 0);
    const howRead = out.parts > 1 ? ` (read in ${out.parts} parts${out.incomplete ? "; some tables may be missing" : ""})` : "";
    showMsg(`Drafted ${next.tables.length} tables with ${out.model}${howRead}. ` +
      (n ? `${n} item${n === 1 ? "" : "s"} marked to check.` : "Nothing marked, but give it a once-over.") +
      (inMeeting() ? " Leave meeting mode (Esc) to review the draft." : ""));
  } catch (e) {
    if (e?.name === "AbortError") showMsg("Stopped. The draft wasn't changed.");
    else showMsg(e?.message || "Extraction failed. Try again.", true);
  } finally {
    $("#busy").hidden = true; ctl = null; updateConnStatus();
  }
});

$("#stopBtn").addEventListener("click", () => ctl?.abort());
