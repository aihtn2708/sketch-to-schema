// Claude through the Claude API, with structured outputs so the reply always matches the shape.
import { PROMPT, SCHEMA, parseJson, validShape } from "./prompt.js";
import { apiError } from "./http.js";
import { link } from "../util.js";

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

  async extract(key, dataUrl, { model, signal, onStatus }) {
    onStatus(`Reading the sketch with ${model}…`);
    const [meta, data] = dataUrl.split(",");
    const media = meta.match(/data:(.*?);/)[1];
    let res;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", signal,
        headers: {
          "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json",
          // Each person uses their own key in their own browser, so calling from the page is fine here.
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model, max_tokens: 4000,
          output_config: { format: { type: "json_schema", schema: SCHEMA } },
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: media, data } },
            { type: "text", text: PROMPT }
          ] }]
        })
      });
    } catch (e) {
      if (e?.name === "AbortError") throw e;
      throw new Error("Couldn't reach the Claude API. Check your connection.");
    }
    if (res.status === 401) throw new Error("The Claude API rejected the key. Check it under AI connection.");
    if (res.status === 429) throw new Error("Rate limit reached on your Claude API key. Wait a minute and try again.");
    if (res.status === 529) throw new Error("The Claude API is overloaded right now. Try again shortly.");
    if (!res.ok) throw new Error((await apiError(res)) || `The Claude API returned an error (${res.status}).`);
    const msg = await res.json();
    if (msg.stop_reason === "refusal") throw new Error("Claude declined to read this image. Try a different sketch.");
    if (msg.stop_reason === "max_tokens") throw new Error("The diagram was too large for one pass. Crop it into parts.");
    const parsed = parseJson(msg.content?.find((b) => b.type === "text")?.text || "");
    if (!validShape(parsed)) throw new Error("The reply couldn't be read. Try again.");
    return { result: parsed, model };
  }
};
