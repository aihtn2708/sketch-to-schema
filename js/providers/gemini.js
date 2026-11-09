// Google Gemini through the Gemini API (generateContent).
import { PROMPT, parseJson, validShape } from "./prompt.js";
import { apiError } from "./http.js";
import { link } from "../util.js";

export default {
  id: "gemini",
  menuLabel: "Gemini (Google)",
  name: "Gemini",
  keyLabel: "Gemini API key",
  placeholder: "AIza…",
  modelLabel: "Model",
  defaultModel: "gemini-3.1-flash-lite",
  models: ["gemini-3.1-flash-lite", "gemini-2.5-flash-lite", "gemini-3-flash-preview", "gemini-2.5-flash"],
  hint: `Free tier with daily limits; Google may use free-tier inputs to improve its products. Paid use is about $0.001–0.003 per extraction. Get a key at ${link("https://aistudio.google.com/apikey", "Google AI Studio")}.`,

  async extract(key, dataUrl, { model, signal, onStatus }) {
    onStatus(`Reading the sketch with ${model}…`);
    let res;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST", signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: PROMPT }, { inline_data: { mime_type: "image/jpeg", data: dataUrl.split(",")[1] } }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0, maxOutputTokens: 8192 }
        })
      });
    } catch (e) {
      if (e?.name === "AbortError") throw e;
      throw new Error("Couldn't reach Gemini. Check your connection.");
    }
    if (!res.ok) {
      const d = await apiError(res);
      if (/api key/i.test(d) || res.status === 401 || res.status === 403) throw new Error("Gemini rejected the key. Check it under AI connection.");
      if (res.status === 404) throw new Error(`Gemini doesn't recognize the model "${model}". Pick another under AI connection → Model.`);
      if (res.status === 429) throw new Error("Gemini quota reached (free-tier limits are per day and per minute). Wait, or use another provider.");
      throw new Error(d || `Gemini returned an error (${res.status}).`);
    }
    const msg = await res.json();
    if (msg.promptFeedback?.blockReason) throw new Error("Gemini declined to read this image. Try a different sketch.");
    const cand = msg.candidates?.[0];
    if (cand?.finishReason === "MAX_TOKENS") throw new Error("The diagram was too large for one pass. Crop it into parts.");
    const parsed = parseJson((cand?.content?.parts || []).map((p) => p.text || "").join(""));
    if (!validShape(parsed)) throw new Error("The reply couldn't be read. Try again, or pick a stronger model.");
    return { result: parsed, model: msg.modelVersion || model };
  }
};
