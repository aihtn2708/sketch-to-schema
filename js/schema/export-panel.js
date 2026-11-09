// The Export panel: DDL / DBML tabs and the Copy button.
import { $ } from "../util.js";
import { state, on } from "../state.js";
import { toDDL, toDBML } from "./export.js";

let format = "ddl";

function update() {
  $("#code").textContent = format === "ddl" ? toDDL(state.schema.tables) : toDBML(state.schema.tables);
}

function setFormat(f) {
  format = f;
  $("#tabDdl").setAttribute("aria-selected", f === "ddl");
  $("#tabDbml").setAttribute("aria-selected", f === "dbml");
  update();
}

$("#tabDdl").addEventListener("click", () => setFormat("ddl"));
$("#tabDbml").addEventListener("click", () => setFormat("dbml"));
$("#copyBtn").addEventListener("click", () => {
  const done = (m) => { $("#copied").textContent = m; setTimeout(() => ($("#copied").textContent = ""), 2500); };
  const fallback = () => {
    const r = document.createRange(); r.selectNodeContents($("#code"));
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    done("Selected. Press Ctrl+C or ⌘C to copy.");
  };
  try { navigator.clipboard.writeText($("#code").textContent).then(() => done("Copied"), fallback); } catch { fallback(); }
});

on("draft:replaced", update);
on("draft:edited", update);
