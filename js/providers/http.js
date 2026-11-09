// Shared request helpers for provider files.

// The error message an API returned, if any (most use {error: {message}}).
export async function apiError(res) {
  try {
    const b = await res.json();
    return b?.error?.message || b?.message || "";
  } catch {
    return "";
  }
}

// Every provider's extract() receives these options:
//   model     the model name chosen in AI connection
//   signal    AbortSignal for the Stop button
//   onStatus  (text) => void, to show progress on the board
// and returns { result: <compact JSON reply>, model: <model that answered> }, or throws Error with a message for the user.
