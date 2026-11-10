// Reading a sketch in one or more passes. When a reply is cut off (a large diagram), keep the tables
// that arrived complete and ask again for only the rest, up to MAX_PASSES times.
// No page access; covered by tests/passes.test.js.
import { PROMPT, continuePrompt, parseJson, validShape, salvageTables, mergeTables } from "./prompt.js";
import { ProviderError } from "./http.js";

export const MAX_PASSES = 4;
export const INCOMPLETE_WARNING = "The diagram was too large to read completely. Check for missing tables, and add them by hand or extract a cropped part of the sketch.";

// request(prompt, model) → { text, truncated, model }
// sticky: keep using the model that answered (OpenRouter's free router picks one per request).
export async function runPasses(request, { model, onStatus = () => {}, label = "The model", sticky = false }) {
  let tables = [], warnings = [], ask = model, answered = model;
  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    onStatus(pass === 1 ? `Reading the sketch with ${ask}…` : `Reading the rest of the sketch with ${ask} (part ${pass})…`);
    const r = await request(pass === 1 ? PROMPT : continuePrompt(tables.map((t) => t.n)), ask);
    answered = r.model || ask;
    if (sticky) ask = answered;

    if (!r.truncated) {
      const parsed = parseJson(r.text || "");
      if (!validShape(parsed)) {
        if (pass === 1) throw new ProviderError("The reply couldn't be read. Try again, or pick a stronger model.");
        break;                                       // keep the tables already received
      }
      tables = mergeTables(tables, parsed.tables);
      warnings.push(...(Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : []));
      return { result: { tables, warnings }, model: answered, parts: pass };
    }

    // Cut off: keep the complete tables and go again for the rest.
    const merged = mergeTables(tables, salvageTables(r.text || ""));
    if (merged.length === tables.length) {
      if (!tables.length) {
        throw new ProviderError(`${label} ran out of reply space before finishing a single table. Pick a model with a larger reply limit (for example Claude Haiku or Gemini Flash), or crop the sketch.`);
      }
      break;                                         // no progress: stop with what we have
    }
    tables = merged;
  }
  return { result: { tables, warnings: [...warnings, INCOMPLETE_WARNING] }, model: answered, parts: MAX_PASSES, incomplete: true };
}
