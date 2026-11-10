// DeepSeek's own API (same request format as OpenAI).
import { chatRequest } from "./chat-completions.js";
import { runPasses } from "./passes.js";
import { without, capTokens } from "./http.js";
import { link } from "../util.js";

const URL = "https://api.deepseek.com/chat/completions";
const UNREACHABLE = "Couldn't reach DeepSeek. It may not accept requests from web pages; use OpenRouter with deepseek/deepseek-v4.1-flash instead.";

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
    return runPasses((prompt, m) => chatRequest({
      url: URL, key, model: m, dataUrl, prompt, signal, label: "DeepSeek", unreachable: UNREACHABLE,
      // Thinking is on by default and uses reply space; reading a diagram doesn't need it.
      body: { max_tokens: 16000, temperature: 0, thinking: { type: "disabled" }, response_format: { type: "json_object" } },
      fallbacks: [capTokens("max_tokens", 8000), without("thinking"), without("response_format", /response_format|json/i)]
    }), { model, onStatus, label: "DeepSeek" });
  }
};
