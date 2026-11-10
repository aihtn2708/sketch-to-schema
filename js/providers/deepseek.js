// DeepSeek's own API (same request format as OpenAI).
import { chatRequest } from "./chat-completions.js";
import { runPasses } from "./passes.js";
import { without, capTokens } from "./http.js";
import { link } from "../util.js";

const URL = "https://api.deepseek.com/chat/completions";
const UNREACHABLE = "Couldn't reach DeepSeek. It may not accept requests from web pages; use OpenRouter with deepseek/deepseek-v4.1-flash instead.";

// Thinking is on by default and uses reply space; reading a diagram or writing a query doesn't need it.
const send = (key, { prompt, dataUrl, model, signal }) => chatRequest({
  url: URL, key, model, dataUrl, prompt, signal, label: "DeepSeek", unreachable: UNREACHABLE,
  body: { max_tokens: 16000, temperature: 0, thinking: { type: "disabled" }, response_format: { type: "json_object" } },
  fallbacks: [capTokens("max_tokens", 8000), without("thinking"), without("response_format", /response_format|json/i)]
});

export default {
  id: "deepseek",
  menuLabel: "DeepSeek",
  name: "DeepSeek",
  keyLabel: "DeepSeek API key",
  placeholder: "sk-…",
  modelLabel: "Model",
  defaultModel: "deepseek-flash",
  models: ["deepseek-flash"],
  hint: `Paid, about $0.001–0.002 per extraction. Get a key at ${link("https://platform.deepseek.com/api_keys", "platform.deepseek.com")}. If you see a connection error, DeepSeek may not accept requests from web pages; use OpenRouter with deepseek/deepseek-v4.1-flash instead.`,

  extract(key, dataUrl, { model, signal, onStatus }) {
    return runPasses((prompt, m) => send(key, { prompt, dataUrl, model: m, signal }), { model, onStatus, label: "DeepSeek" });
  },
  ask(key, prompt, { model, signal }) {
    return send(key, { prompt, model, signal });
  }
};
