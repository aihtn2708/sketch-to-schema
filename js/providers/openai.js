// ChatGPT models through the OpenAI API.
import { chatRequest } from "./chat-completions.js";
import { runPasses } from "./passes.js";
import { without, capTokens } from "./http.js";
import { link } from "../util.js";

const URL = "https://api.openai.com/v1/chat/completions";

// Reasoning counts toward max_completion_tokens, so keep it low and leave plenty of room for the reply.
// (Newer models also reject a custom temperature, so none is sent.)
const send = (key, { prompt, dataUrl, model, signal }) => chatRequest({
  url: URL, key, model, dataUrl, prompt, signal, label: "OpenAI",
  body: { max_completion_tokens: 16000, reasoning_effort: "low", response_format: { type: "json_object" } },
  fallbacks: [without("reasoning_effort"), without("response_format", /response_format|json/i), capTokens("max_completion_tokens", 8000)]
});

export default {
  id: "openai",
  menuLabel: "ChatGPT (OpenAI)",
  name: "ChatGPT",
  keyLabel: "OpenAI API key",
  placeholder: "sk-…",
  modelLabel: "Model",
  defaultModel: "gpt-6-luna",
  models: ["gpt-6-luna", "gpt-6.1-terra", "gpt-6.1-sol"],
  hint: `Paid, about $0.001 per extraction with gpt-6-luna. Get a key at ${link("https://platform.openai.com/api-keys", "platform.openai.com")} and set a usage limit there.`,

  extract(key, dataUrl, { model, signal, onStatus }) {
    return runPasses((prompt, m) => send(key, { prompt, dataUrl, model: m, signal }), { model, onStatus, label: "OpenAI" });
  },
  ask(key, prompt, { model, signal }) {
    return send(key, { prompt, model, signal });
  }
};
