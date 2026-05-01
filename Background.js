// WriteRight — background service worker
// Uses Groq API with llama-3.3-70b-versatile model

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_API_KEY = "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";
const GROQ_MODEL   = "llama-3.3-70b-versatile";

const MODE_PROMPTS = {
  professional: "Rewrite this text to sound professional, polished, and business-appropriate. Fix grammar and spelling. Keep the core meaning.",
  casual:       "Rewrite this text in a relaxed, conversational, casual tone. Fix grammar and spelling. Keep it natural.",
  formal:       "Rewrite this text in a formal, structured, and authoritative tone. Fix all grammar and spelling errors.",
  friendly:     "Rewrite this text to sound warm, friendly, and approachable. Fix grammar and spelling. Make it feel positive.",
  persuasive:   "Rewrite this text to be persuasive, compelling, and action-oriented. Fix grammar and spelling. Use confident language.",
  cold_email:   "Rewrite this as a concise, effective cold email. Fix grammar and spelling. Make it attention-grabbing with a clear call to action.",
  follow_up:    "Rewrite this as a polite, professional follow-up message. Fix grammar and spelling. Be brief and include a clear next step.",
  concise:      "Rewrite this text to be as concise and clear as possible. Remove fluff, fix grammar and spelling. Keep only what's essential.",
};

chrome.runtime.onInstalled.addListener(async () => {
  const { defaultMode } = await chrome.storage.sync.get(["defaultMode"]);
  if (!defaultMode) await chrome.storage.sync.set({ defaultMode: "professional" });
});

async function callGroq(text, mode) {
  const instruction = MODE_PROMPTS[mode] || MODE_PROMPTS.professional;

  const resp = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: "system",
          content: `${instruction}\n\nReturn ONLY the rewritten text. No commentary, no quotes, no explanation.`,
        },
        {
          role: "user",
          content: text,
        },
      ],
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    let msg = `Groq API error ${resp.status}`;
    try { msg = JSON.parse(errText)?.error?.message || msg; } catch (_) {}
    throw new Error(msg);
  }

  const data = await resp.json();
  const raw = data?.choices?.[0]?.message?.content;
  return (raw || "").trim();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "WR_CORRECT") {
    (async () => {
      try {
        const corrected = await callGroq(message.text, message.mode);
        if (!corrected) throw new Error("Empty response from AI");
        sendResponse({
          ok: true,
          data: {
            corrected,
            original_length: message.text.length,
            corrected_length: corrected.length,
          },
        });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || String(e) });
      }
    })();
    return true;
  }

  if (message?.type === "WR_GET_MODES") {
    sendResponse({ ok: true, data: Object.keys(MODE_PROMPTS).map(id => ({ id })) });
    return true;
  }
});
