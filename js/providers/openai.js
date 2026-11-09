// ChatGPT models through the OpenAI API.
import { chatCompletion } from "./chat-completions.js";
import { link } from "../util.js";

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
    return chatCompletion({
      url: "https://api.openai.com/v1/chat/completions", key, model, dataUrl, signal, onStatus, label: "OpenAI",
      // Newer OpenAI models count reasoning in max_completion_tokens and reject a custom temperature.
      extra: { max_completion_tokens: 6000, response_format: { type: "json_object" } }
    });
  }
};
