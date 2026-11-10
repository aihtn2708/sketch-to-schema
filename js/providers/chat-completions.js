// One request in the Chat Completions format, shared by OpenAI and DeepSeek. dataUrl is optional (text-only questions).
// Returns { text, truncated, model } for runPasses().
import { postJson, apiError, ProviderError } from "./http.js";

export async function chatRequest({ url, key, model, dataUrl, prompt, signal, label, body, fallbacks, unreachable }) {
  let res;
  try {
    res = await postJson(url, { Authorization: `Bearer ${key}` }, {
      model,
      messages: [{ role: "user", content: dataUrl ? [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: dataUrl } }] : prompt }],
      ...body
    }, { signal, fallbacks });
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    throw new ProviderError(unreachable || `Couldn't reach ${label}. Check your connection.`);
  }
  if (res.status === 401) throw new ProviderError(`${label} rejected the key. Check it under AI connection.`, { fatal: true });
  if (res.status === 402) throw new ProviderError(`Your ${label} account has no balance left. Add credit, then try again.`, { fatal: true });
  if (res.status === 404) throw new ProviderError(`${label} doesn't recognize the model "${model}". Pick another under AI connection → Model.`, { fatal: true });
  if (res.status === 429) throw new ProviderError(`${label} rate limit or quota reached. Wait a minute, or check your plan's limits.`);
  if (!res.ok) throw new ProviderError((await apiError(res)) || `${label} returned an error (${res.status}).`);
  const msg = await res.json();
  const choice = msg.choices?.[0];
  if (choice?.message?.refusal) throw new ProviderError(`${label} declined to read this image. Try a different sketch.`, { fatal: true });
  const content = choice?.message?.content;
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((c) => c?.text || "").join("") : "";
  return { text, truncated: choice?.finish_reason === "length", model: msg.model || model };
}
