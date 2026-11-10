// Google Gemini through the Gemini API (generateContent).
import { runPasses } from "./passes.js";
import { postJson, apiError, ProviderError } from "./http.js";
import { link } from "../util.js";

// Thinking counts toward maxOutputTokens, and reading a diagram needs little of it.
// Gemini 3 models take a level; 2.5 Flash models can turn it off with a budget of 0.
function thinkingFor(model) {
  if (/gemini-3/.test(model)) return { thinkingLevel: "low" };
  if (/gemini-2\.5-flash/.test(model)) return { thinkingBudget: 0 };
  return undefined;
}

async function request(key, dataUrl, prompt, model, signal) {
  const generationConfig = { responseMimeType: "application/json", temperature: 0, maxOutputTokens: 16000 };
  const thinking = thinkingFor(model);
  if (thinking) generationConfig.thinkingConfig = thinking;
  let res;
  try {
    res = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { "x-goog-api-key": key }, {
      contents: [{ role: "user", parts: [{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: dataUrl.split(",")[1] } }] }],
      generationConfig
    }, {
      signal,
      fallbacks: [
        { when: /thinking/i, fix: (b) => { delete b.generationConfig.thinkingConfig; return b; } },
        { when: /maxOutputTokens|output tokens/i, fix: (b) => { b.generationConfig.maxOutputTokens = 8192; return b; } }
      ]
    });
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    throw new ProviderError("Couldn't reach Gemini. Check your connection.");
  }
  if (!res.ok) {
    const d = await apiError(res);
    if (/api key/i.test(d) || res.status === 401 || res.status === 403) throw new ProviderError("Gemini rejected the key. Check it under AI connection.", { fatal: true });
    if (res.status === 404) throw new ProviderError(`Gemini doesn't recognize the model "${model}". Pick another under AI connection → Model.`, { fatal: true });
    if (res.status === 429) throw new ProviderError("Gemini quota reached (free-tier limits are per day and per minute). Wait, or use another provider.");
    throw new ProviderError(d || `Gemini returned an error (${res.status}).`);
  }
  const msg = await res.json();
  if (msg.promptFeedback?.blockReason) throw new ProviderError("Gemini declined to read this image. Try a different sketch.", { fatal: true });
  const cand = msg.candidates?.[0];
  const text = (cand?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
  return { text, truncated: cand?.finishReason === "MAX_TOKENS", model: msg.modelVersion || model };
}

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

  extract(key, dataUrl, { model, signal, onStatus }) {
    return runPasses((prompt, m) => request(key, dataUrl, prompt, m, signal), { model, onStatus, label: "Gemini" });
  }
};
