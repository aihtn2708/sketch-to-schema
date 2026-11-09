// All AI providers. The order here is the order in the Provider menu.
//
// To add a provider: copy a file like gemini.js, change its fields and extract(),
// then import it and add it to this list. Nothing else needs to change.
import openrouter from "./openrouter.js";
import gemini from "./gemini.js";
import openai from "./openai.js";
import anthropic from "./anthropic.js";
import deepseek from "./deepseek.js";

export const PROVIDERS = Object.fromEntries([openrouter, gemini, openai, anthropic, deepseek].map((p) => [p.id, p]));
