// WriteRight — content script
// Shows a gold ✦ bubble near any focused text field (once user has typed 10+ chars),
// opens a toolbar to pick a mode, rewrites the text, lets user Apply or Discard.

(() => {
  if (window.__WR_INJECTED__) return;
  window.__WR_INJECTED__ = true;

  const MIN_CHARS = 10;

  const MODES = [
    { id: "professional", label: "Professional", emoji: "💼" },
    { id: "casual",       label: "Casual",       emoji: "💬" },
    { id: "formal",       label: "Formal",       emoji: "🏛️" },
    { id: "friendly",     label: "Friendly",     emoji: "😊" },
    { id: "persuasive",   label: "Persuasive",   emoji: "🎯" },
    { id: "cold_email",   label: "Cold Email",   emoji: "📨" },
    { id: "follow_up",    label: "Follow-up",    emoji: "🔁" },
    { id: "concise",      label: "Concise",      emoji: "✂️" },
  ];

  let activeEl = null;           // the text field
  let bubbleEl = null;
  let panelEl = null;
  let selectedMode = "professional";
  let lastPreview = "";

  // ---------- storage helpers ----------
  const storageGet = (keys) =>
    new Promise((r) => chrome.storage?.sync?.get(keys, r) || r({}));

  (async () => {
    const { defaultMode } = await storageGet(["defaultMode"]);
    if (defaultMode) selectedMode = defaultMode;
  })();

  // ---------- text field detection ----------
  function isEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag === "TEXTAREA") return true;
    if (tag === "INPUT") {
      const t = (el.getAttribute("type") || "text").toLowerCase();
      return ["text", "email", "search", "url", "tel", ""].includes(t);
    }
    return false;
  }

  function getText(el) {
    if (!el) return "";
    if (el.isContentEditable) return el.innerText || "";
    return el.value || "";
  }

  function setText(el, text) {
    if (!el) return;
    if (el.isContentEditable) {
      el.focus();
      // Replace all content. Use selectAll + insertText so most rich editors
      // (Gmail, Outlook, LinkedIn, Slack, Notion) record it in their undo stack.
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
      const ok = document.execCommand("insertText", false, text);
      if (!ok) {
        el.textContent = text;
        el.dispatchEvent(new InputEvent("input", { bubbles: true }));
      }
    } else {
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      setter.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  // ---------- positioning ----------
  function positionBubble() {
    if (!bubbleEl || !activeEl) return;
    const r = activeEl.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
      hideBubble();
      return;
    }
    const top = window.scrollY + r.bottom - 38;
    const left = window.scrollX + r.right - 42;
    bubbleEl.style.top = `${top}px`;
    bubbleEl.style.left = `${left}px`;
  }

  function positionPanel() {
    if (!panelEl || !activeEl) return;
    const r = activeEl.getBoundingClientRect();
    let top = window.scrollY + r.bottom + 8;
    let left = window.scrollX + r.right - 380;
    if (left < window.scrollX + 8) left = window.scrollX + 8;
    // If panel would overflow bottom, flip above
    if (r.bottom + 420 > window.innerHeight) {
      top = window.scrollY + r.top - 8 - (panelEl.offsetHeight || 380);
      if (top < window.scrollY + 8) top = window.scrollY + 8;
    }
    panelEl.style.top = `${top}px`;
    panelEl.style.left = `${left}px`;
  }

  // ---------- bubble ----------
  function ensureBubble() {
    if (bubbleEl) return bubbleEl;
    bubbleEl = document.createElement("div");
    bubbleEl.className = "wr-bubble wr-bubble-hidden";
    bubbleEl.setAttribute("data-testid", "wr-bubble");
    bubbleEl.title = "WriteRight — click to correct";
    bubbleEl.textContent = "✦";
    bubbleEl.addEventListener("mousedown", (e) => {
      // Prevent blurring the target field
      e.preventDefault();
      e.stopPropagation();
    });
    bubbleEl.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPanel();
    });
    document.body.appendChild(bubbleEl);
    return bubbleEl;
  }

  function showBubble() {
    ensureBubble();
    bubbleEl.classList.remove("wr-bubble-hidden");
    positionBubble();
  }
  function hideBubble() {
    if (bubbleEl) bubbleEl.classList.add("wr-bubble-hidden");
  }

  function maybeToggleBubble() {
    if (!activeEl || !document.body.contains(activeEl)) {
      hideBubble();
      return;
    }
    const txt = getText(activeEl).trim();
    if (txt.length >= MIN_CHARS) showBubble();
    else hideBubble();
  }

  // ---------- panel ----------
  function closePanel() {
    if (panelEl) {
      panelEl.remove();
      panelEl = null;
    }
  }

  function openPanel() {
    if (!activeEl) return;
    closePanel();
    lastPreview = "";

    panelEl = document.createElement("div");
    panelEl.className = "wr-panel";
    panelEl.setAttribute("data-testid", "wr-panel");

    panelEl.innerHTML = `
      <div class="wr-header">
        <div class="wr-brand">
          <span class="wr-brand-mark">✦</span>
          <span>WriteRight</span>
        </div>
        <button class="wr-close" data-testid="wr-close" title="Close">×</button>
      </div>
      <div class="wr-body">
        <div class="wr-label">Choose a mode</div>
        <div class="wr-modes" data-testid="wr-modes"></div>

        <div class="wr-label">Preview</div>
        <div class="wr-preview wr-preview-empty" data-testid="wr-preview">
          Click “Correct my writing” to see the rewrite here.
        </div>

        <div class="wr-actions">
          <button class="wr-btn wr-btn-ghost" data-testid="wr-discard">Discard</button>
          <button class="wr-btn wr-btn-ghost" data-testid="wr-correct">Correct my writing</button>
          <button class="wr-btn wr-btn-primary" data-testid="wr-apply" disabled>Apply</button>
        </div>
        <div class="wr-status" data-testid="wr-status"></div>
      </div>
    `;

    // prevent clicks in panel from blurring the target field
    panelEl.addEventListener("mousedown", (e) => e.preventDefault());

    document.body.appendChild(panelEl);

    const modesBox = panelEl.querySelector('[data-testid="wr-modes"]');
    MODES.forEach((m) => {
      const btn = document.createElement("button");
      btn.className = "wr-mode" + (m.id === selectedMode ? " wr-mode-active" : "");
      btn.setAttribute("data-testid", `wr-mode-${m.id}`);
      btn.innerHTML = `<span class="wr-mode-emoji">${m.emoji}</span><span>${m.label}</span>`;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        selectedMode = m.id;
        chrome.storage?.sync?.set({ defaultMode: m.id });
        modesBox.querySelectorAll(".wr-mode").forEach((x) => x.classList.remove("wr-mode-active"));
        btn.classList.add("wr-mode-active");
      });
      modesBox.appendChild(btn);
    });

    panelEl.querySelector('[data-testid="wr-close"]').addEventListener("click", closePanel);
    panelEl.querySelector('[data-testid="wr-discard"]').addEventListener("click", () => {
      lastPreview = "";
      const prev = panelEl.querySelector('[data-testid="wr-preview"]');
      prev.classList.add("wr-preview-empty");
      prev.textContent = "Discarded. Pick a mode and run again, or close.";
      panelEl.querySelector('[data-testid="wr-apply"]').disabled = true;
    });

    panelEl.querySelector('[data-testid="wr-correct"]').addEventListener("click", runCorrection);
    panelEl.querySelector('[data-testid="wr-apply"]').addEventListener("click", () => {
      if (lastPreview && activeEl) {
        setText(activeEl, lastPreview);
        closePanel();
      }
    });

    positionPanel();
  }

  async function runCorrection() {
    if (!activeEl || !panelEl) return;
    const text = getText(activeEl).trim();
    if (!text) return;

    const status = panelEl.querySelector('[data-testid="wr-status"]');
    const preview = panelEl.querySelector('[data-testid="wr-preview"]');
    const correctBtn = panelEl.querySelector('[data-testid="wr-correct"]');
    const applyBtn = panelEl.querySelector('[data-testid="wr-apply"]');

    status.classList.remove("wr-status-error");
    status.innerHTML = `<span class="wr-spin"></span> Rewriting in ${modeLabel(selectedMode)} mode…`;
    correctBtn.disabled = true;
    applyBtn.disabled = true;

    try {
      const resp = await chrome.runtime.sendMessage({
        type: "WR_CORRECT",
        text,
        mode: selectedMode,
      });
      if (!resp?.ok) {
        status.classList.add("wr-status-error");
        status.textContent = `Error: ${resp?.error || "Unknown error"}`;
        return;
      }
      lastPreview = resp.data.corrected || "";
      preview.classList.remove("wr-preview-empty");
      preview.textContent = lastPreview;
      status.textContent = `Done · ${resp.data.original_length}→${resp.data.corrected_length} chars`;
      applyBtn.disabled = false;
      positionPanel();
    } catch (e) {
      status.classList.add("wr-status-error");
      status.textContent = `Error: ${e?.message || e}`;
    } finally {
      correctBtn.disabled = false;
    }
  }

  function modeLabel(id) {
    const m = MODES.find((x) => x.id === id);
    return m ? m.label : id;
  }

  // ---------- event wiring ----------
  function onFocusIn(e) {
    const t = e.target;
    if (isEditable(t)) {
      activeEl = t;
      maybeToggleBubble();
    }
  }

  function onInput(e) {
    if (e.target === activeEl) maybeToggleBubble();
  }

  function onFocusOut(e) {
    // Delay so clicking the bubble/panel still works
    setTimeout(() => {
      const ae = document.activeElement;
      if (ae && (ae === bubbleEl || (panelEl && panelEl.contains(ae)))) return;
      if (ae && isEditable(ae)) {
        activeEl = ae;
        maybeToggleBubble();
        return;
      }
      if (!panelEl) hideBubble();
    }, 120);
  }

  function onScrollOrResize() {
    positionBubble();
    positionPanel();
  }

  function onDocClick(e) {
    if (!panelEl) return;
    if (panelEl.contains(e.target)) return;
    if (bubbleEl && bubbleEl.contains(e.target)) return;
    if (activeEl && activeEl.contains(e.target)) return;
    closePanel();
  }

  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("focusout", onFocusOut, true);
  document.addEventListener("input", onInput, true);
  document.addEventListener("click", onDocClick, true);
  window.addEventListener("scroll", onScrollOrResize, true);
  window.addEventListener("resize", onScrollOrResize);
})();
