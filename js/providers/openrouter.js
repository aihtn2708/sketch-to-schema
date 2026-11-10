// OpenRouter: free models, tried in order until one gives a usable reply.
import { runPasses } from "./passes.js";
import { postJson, apiError, ProviderError, without, capTokens } from "./http.js";
import { link } from "../util.js";

async function request(key, { prompt, dataUrl, model, signal }) {
  let res;
  try {
    res = await postJson("https://openrouter.ai/api/v1/chat/completions", {
      Authorization: `Bearer ${key}`, "HTTP-Referer": location.origin, "X-Title": "Sketch to Schema"
    }, {
      model, max_tokens: 16000, temperature: 0,
      // Reasoning counts toward max_tokens; keep it low so the reply has room.
      reasoning: { effort: "low" },
      messages: [{ role: "user", content: dataUrl ? [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: dataUrl } }] : prompt }]
    }, { signal, fallbacks: [without("reasoning", /reason|effort/i), capTokens("max_tokens", 8000)] });
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    throw new ProviderError("Couldn't reach OpenRouter. Check your connection.");
  }
  if (res.status === 401) throw new ProviderError("OpenRouter rejected the key. Check it under AI connection.", { fatal: true });
  if (res.status === 402) throw new ProviderError("Your OpenRouter balance is below zero, which blocks free models too. Add credit at openrouter.ai.", { fatal: true });
  if (res.status === 429) {
    const d = await apiError(res);
    if (/per-day|per day|daily/i.test(d)) throw new ProviderError("You've used today's free requests on this OpenRouter account. They reset at 00:00 UTC.", { fatal: true });
    throw new ProviderError("Free models are busy. Try again in a minute.");
  }
  if (!res.ok) throw new ProviderError((await apiError(res)) || `A model failed (${res.status}).`);
  const msg = await res.json();
  if (msg.error) throw new ProviderError(msg.error.message || "A model failed to answer.");
  const choice = msg.choices?.[0];
  return { text: choice?.message?.content || "", truncated: choice?.finish_reason === "length", model: msg.model || model };
}

// Try each model in the list until one works; stop early on errors another model wouldn't fix.
async function eachModel(list, run) {
  const models = list.split(",").map((s) => s.trim()).filter(Boolean);
  let last = new ProviderError("No model could answer right now. Try again in a minute.");
  for (const m of models) {
    try { return await run(m); } catch (e) {
      if (e?.name === "AbortError" || e?.fatal) throw e;
      last = e;
    }
  }
  throw last;
}

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

  extract(key, dataUrl, { model, signal, onStatus }) {
    // sticky: the free router picks a model per request, so later parts go to the one that answered.
    return eachModel(model, (m) => runPasses((prompt, mm) => request(key, { prompt, dataUrl, model: mm, signal }), { model: m, onStatus, label: "The model", sticky: true }));
  },
  ask(key, prompt, { model, signal }) {
    return eachModel(model, (m) => request(key, { prompt, model: m, signal }));
  }
};
