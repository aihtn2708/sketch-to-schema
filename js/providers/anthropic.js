// Claude through the Claude API, with structured outputs so the reply always matches the shape.
import { SCHEMA } from "./prompt.js";
import { runPasses } from "./passes.js";
import { postJson, apiError, ProviderError, capTokens } from "./http.js";
import { link } from "../util.js";

async function request(key, dataUrl, prompt, model, signal) {
  const [meta, data] = dataUrl.split(",");
  const media = meta.match(/data:(.*?);/)[1];
  let res;
  try {
    res = await postJson("https://api.anthropic.com/v1/messages", {
      "x-api-key": key, "anthropic-version": "2023-06-01",
      // Each person uses their own key in their own browser, so calling from the page is fine here.
      "anthropic-dangerous-direct-browser-access": "true"
    }, {
      model, max_tokens: 16000,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: media, data } },
        { type: "text", text: prompt }
      ] }]
    }, { signal, fallbacks: [capTokens("max_tokens", 8000)] });
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    throw new ProviderError("Couldn't reach the Claude API. Check your connection.");
  }
  if (res.status === 401) throw new ProviderError("The Claude API rejected the key. Check it under AI connection.", { fatal: true });
  if (res.status === 429) throw new ProviderError("Rate limit reached on your Claude API key. Wait a minute and try again.");
  if (res.status === 529) throw new ProviderError("The Claude API is overloaded right now. Try again shortly.");
  if (!res.ok) throw new ProviderError((await apiError(res)) || `The Claude API returned an error (${res.status}).`);
  const msg = await res.json();
  if (msg.stop_reason === "refusal") throw new ProviderError("Claude declined to read this image. Try a different sketch.", { fatal: true });
  const text = (msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  return { text, truncated: msg.stop_reason === "max_tokens", model };
}

export default {
  id: "anthropic",
  menuLabel: "Claude (Anthropic)",
  name: "Claude",
  keyLabel: "Claude API key",
  placeholder: "sk-ant-…",
  modelLabel: "Model",
  defaultModel: "claude-haiku-5-5",
  models: ["claude-haiku-5-5", "claude-sonnet-5-5"],
  hint: `Paid, about $0.001 per extraction with Haiku. Get a key at ${link("https://platform.claude.com/settings/keys", "platform.claude.com")} and set a monthly spend limit there.`,

  extract(key, dataUrl, { model, signal, onStatus }) {
    return runPasses((prompt, m) => request(key, dataUrl, prompt, m, signal), { model, onStatus, label: "Claude" });
  }
};
