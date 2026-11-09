// DeepSeek's own API (same request format as OpenAI).
import { chatCompletion } from "./chat-completions.js";
import { link } from "../util.js";

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
    return chatCompletion({
      url: "https://api.deepseek.com/chat/completions", key, model, dataUrl, signal, onStatus, label: "DeepSeek",
      extra: { max_tokens: 4000, temperature: 0, response_format: { type: "json_object" } },
      unreachable: "Couldn't reach DeepSeek. It may not accept requests from web pages; use OpenRouter with deepseek/deepseek-v4.1-flash instead."
    });
  }
};
