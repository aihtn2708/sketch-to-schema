// OpenRouter: free models, tried in order until one gives a usable reply.
import { PROMPT, parseJson, validShape } from "./prompt.js";
import { apiError } from "./http.js";
import { link } from "../util.js";

export default {
  id: "openrouter",
  menuLabel: "OpenRouter (free models)",
  name: "OpenRouter",
  keyLabel: "OpenRouter API key",
  placeholder: "sk-or-…",
  modelLabel: "Models to try, in order",
  defaultModel: "nvidia/nemotron-3.5-super-vl:free, thinkingmachines/inkling:free, google/gemma-4-31b-it:free, openrouter/free",
  models: ["nvidia/nemotron-3.5-super-vl:free", "thinkingmachines/inkling:free", "google/gemma-4-31b-it:free", "openrouter/free", "deepseek/deepseek-v4.1-flash"],
  statusModel: () => "free models",
  hint: `Free. Get a key at ${link("https://openrouter.ai/settings/keys", "openrouter.ai")}. Free models allow 50 requests a day per account, or 1,000 after $10 of lifetime credit, and may log what they receive. Free models change often; find current ones that accept images at ${link("https://openrouter.ai/models?q=:free", "openrouter.ai/models")}.`,

  async extract(key, dataUrl, { model, signal, onStatus }) {
    const models = model.split(",").map((s) => s.trim()).filter(Boolean);
    let last = "No model could read the sketch right now. Try again in a minute.";
    for (const m of models) {
      onStatus(`Reading the sketch with ${m}…`);
      let res;
      try {
        res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST", signal,
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "HTTP-Referer": location.origin, "X-Title": "Sketch to Schema" },
          body: JSON.stringify({ model: m, max_tokens: 4000, temperature: 0,
            messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url: dataUrl } }] }] })
        });
      } catch (e) {
        if (e?.name === "AbortError") throw e;
        last = "Couldn't reach OpenRouter. Check your connection."; continue;
      }
      if (res.status === 401) throw new Error("OpenRouter rejected the key. Check it under AI connection.");
      if (res.status === 402) throw new Error("Your OpenRouter balance is below zero, which blocks free models too. Add credit at openrouter.ai.");
      if (res.status === 429) {
        const d = await apiError(res);
        if (/per-day|per day|daily/i.test(d)) throw new Error("You've used today's free requests on this OpenRouter account. They reset at 00:00 UTC.");
        last = "Free models are busy. Try again in a minute."; continue;
      }
      if (!res.ok) { last = (await apiError(res)) || `A model failed (${res.status}).`; continue; }
      const msg = await res.json();
      if (msg.error) { last = msg.error.message || "A model failed to answer."; continue; }
      const choice = msg.choices?.[0];
      if (choice?.finish_reason === "length") { last = "The diagram was too large for one pass. Crop it into parts."; continue; }
      const parsed = parseJson(choice?.message?.content || "");
      if (validShape(parsed)) return { result: parsed, model: msg.model || m };
      last = "A model's reply couldn't be read. Try again.";
    }
    throw new Error(last);
  }
};
