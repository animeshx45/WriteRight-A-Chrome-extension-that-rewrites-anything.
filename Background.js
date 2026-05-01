// WriteRight — background service worker
// Handles API calls to the backend so CORS / API keys stay off-page.

const DEFAULT_BACKEND =
  "https://7ea138b1-8553-4115-ab97-9ddf041b3831.preview.emergentagent.com";

async function getBackend() {
  const { backendUrl } = await chrome.storage.sync.get(["backendUrl"]);
  return (backendUrl && backendUrl.trim()) || DEFAULT_BACKEND;
}

chrome.runtime.onInstalled.addListener(async () => {
  const { backendUrl, defaultMode } = await chrome.storage.sync.get([
    "backendUrl",
    "defaultMode",
  ]);
  if (!backendUrl) {
    await chrome.storage.sync.set({ backendUrl: DEFAULT_BACKEND });
  }
  if (!defaultMode) {
    await chrome.storage.sync.set({ defaultMode: "professional" });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "WR_CORRECT") {
    (async () => {
      try {
        const backend = await getBackend();
        const resp = await fetch(`${backend}/api/correct`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: message.text, mode: message.mode }),
        });
        if (!resp.ok) {
          const errText = await resp.text();
          sendResponse({
            ok: false,
            error: `Server ${resp.status}: ${errText.slice(0, 200)}`,
          });
          return;
        }
        const data = await resp.json();
        sendResponse({ ok: true, data });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || String(e) });
      }
    })();
    return true; // keep channel open for async response
  }

  if (message?.type === "WR_GET_MODES") {
    (async () => {
      try {
        const backend = await getBackend();
        const resp = await fetch(`${backend}/api/modes`);
        const data = await resp.json();
        sendResponse({ ok: true, data });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || String(e) });
      }
    })();
    return true;
  }
});
