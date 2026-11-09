// The Chat Completions request format, shared by OpenAI and DeepSeek.
import { PROMPT, parseJson, validShape } from "./prompt.js";
import { apiError } from "./http.js";

export async function chatCompletion({ url, key, model, dataUrl, signal, onStatus, label, extra, unreachable }) {
  onStatus(`Reading the sketch with ${model}…`);
  const send = (body) => fetch(url, {
    method: "POST", signal,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url: dataUrl } }] }], ...body })
  });
  let res;
  try {
    res = await send(extra);
    // Some models reject JSON mode together with images; retry once without it.
    if (res.status === 400 && extra.response_format) {
      const detail = await apiError(res.clone());
      if (/response_format|json/i.test(detail)) {
        const { response_format, ...rest } = extra;
        res = await send(rest);
      }
    }
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    throw new Error(unreachable || `Couldn't reach ${label}. Check your connection.`);
  }
  if (res.status === 401) throw new Error(`${label} rejected the key. Check it under AI connection.`);
  if (res.status === 402) throw new Error(`Your ${label} account has no balance left. Add credit, then try again.`);
  if (res.status === 404) throw new Error(`${label} doesn't recognize the model "${model}". Pick another under AI connection → Model.`);
  if (res.status === 429) throw new Error(`${label} rate limit or quota reached. Wait a minute, or check your plan's limits.`);
  if (!res.ok) throw new Error((await apiError(res)) || `${label} returned an error (${res.status}).`);
  const msg = await res.json();
  const choice = msg.choices?.[0];
  if (choice?.finish_reason === "length") throw new Error("The diagram was too large for one pass. Crop it into parts.");
  if (choice?.message?.refusal) throw new Error(`${label} declined to read this image. Try a different sketch.`);
  const content = choice?.message?.content;
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((c) => c?.text || "").join("") : "";
  const parsed = parseJson(text);
  if (!validShape(parsed)) throw new Error("The reply couldn't be read. Try again, or pick a stronger model.");
  return { result: parsed, model: msg.model || model };
}
