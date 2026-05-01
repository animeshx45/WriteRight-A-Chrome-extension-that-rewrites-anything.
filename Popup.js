const DEFAULT_BACKEND =
  "https://7ea138b1-8553-4115-ab97-9ddf041b3831.preview.emergentagent.com";

const $ = (id) => document.getElementById(id);
const msg = $("msg");

function setMsg(text, cls) {
  msg.className = "msg " + (cls || "");
  msg.textContent = text;
}

async function load() {
  const { backendUrl, defaultMode } = await chrome.storage.sync.get([
    "backendUrl", "defaultMode",
  ]);
  $("backend").value = backendUrl || DEFAULT_BACKEND;
  $("mode").value = defaultMode || "professional";
}

$("save").addEventListener("click", async () => {
  const backendUrl = ($("backend").value || "").trim() || DEFAULT_BACKEND;
  const defaultMode = $("mode").value;
  await chrome.storage.sync.set({ backendUrl, defaultMode });
  setMsg("Saved.", "ok");
});

$("test").addEventListener("click", async () => {
  const url = ($("backend").value || "").trim() || DEFAULT_BACKEND;
  setMsg("Testing…");
  try {
    const resp = await fetch(`${url}/api/`);
    if (!resp.ok) { setMsg(`Server responded ${resp.status}`, "err"); return; }
    const data = await resp.json();
    setMsg(`OK — ${data.service || "online"} (${data.model || "model"})`, "ok");
  } catch (e) {
    setMsg(`Failed: ${e.message || e}`, "err");
  }
});

load();
