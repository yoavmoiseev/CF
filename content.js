(function () {
  // Only attribute we ever set — goes on <html>, which React does NOT own.
  // React mounts inside a child div/body; touching <html> is completely safe.
  const OFF_ATTR = "data-cf-off";

  // WeakSets live entirely in JS memory — zero DOM mutations on img/video.
  // This is critical: setting data-* attributes or inline styles on <img>
  // elements before React hydration causes React error #418 (hydration
  // mismatch) which breaks the page and removes all our blur.
  const blurred  = new WeakSet(); // elements we've reinforced with inline blur
  const revealed = new WeakSet(); // elements the user double-clicked to unblur
  const listened = new WeakSet(); // elements that have our dblclick listener

  // ── Collect img/video/background-image elements from main DOM + shadow roots ─
  const SELECTOR = 'img, video, [style*="background-image"]';

  function collectAll(root) {
    const found = Array.from(root.querySelectorAll(SELECTOR));
    root.querySelectorAll("*").forEach(el => {
      if (el.shadowRoot) found.push(...collectAll(el.shadowRoot));
    });
    return found;
  }

  // ── Per-element helpers ────────────────────────────────────────────────────
  function applyBlur(el) {
    if (revealed.has(el) || blurred.has(el)) return;
    blurred.add(el);
    // Inline !important beats any author-stylesheet !important, even if the
    // site loads its own CSS after content.css overriding our rule.
    el.style.setProperty("filter",     "blur(20px) brightness(0.6)", "important");
    el.style.setProperty("cursor",     "pointer",                    "important");
    el.style.setProperty("transition", "filter 0.2s",                "important");
    if (!listened.has(el)) {
      listened.add(el);
      el.addEventListener("dblclick", onDblClick, true);
    }
  }

  function removeBlur(el) {
    blurred.delete(el);
    el.style.removeProperty("filter");
    el.style.removeProperty("cursor");
    el.style.removeProperty("transition");
  }

  // ── Double-click reveal ───────────────────────────────────────────────────
  function onDblClick(e) {
    const el = e.currentTarget;
    if (!el.matches(SELECTOR)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (revealed.has(el)) return;
    revealed.add(el);
    // inline filter:none !important overrides the content.css blur rule
    el.style.setProperty("filter", "none", "important");
    el.style.setProperty("cursor", "auto", "important");
  }

  // ── Sweep: reinforce blur on all unrevealed elements ──────────────────────
  function processAll() {
    if (document.documentElement.hasAttribute(OFF_ATTR)) return;
    collectAll(document).forEach(el => {
      if (!revealed.has(el)) applyBlur(el);
    });
  }

  // ── Enable / disable ──────────────────────────────────────────────────────
  let observer = null;
  let interval = null;

  function enable() {
    document.documentElement.removeAttribute(OFF_ATTR);
    processAll();
    if (!observer) {
      observer = new MutationObserver(processAll);
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
    if (!interval) interval = setInterval(processAll, 800);
  }

  function disable() {
    document.documentElement.setAttribute(OFF_ATTR, "1");
    if (observer) { observer.disconnect(); observer = null; }
    clearInterval(interval); interval = null;
    collectAll(document).forEach(removeBlur);
  }

  chrome.storage.local.get({ enabled: true }, ({ enabled }) => {
    if (!enabled) {
      // Mark disabled immediately so CSS rule is suppressed
      document.documentElement.setAttribute(OFF_ATTR, "1");
      return;
    }
    // content.css already blurs all images from first paint — no flash.
    // We delay the JS reinforcement (inline styles) until window.load so
    // that React's SSR hydration runs first and sees a clean DOM.
    // After window.load, hydration is complete and we can safely mutate.
    if (document.readyState === "complete") {
      enable();
    } else {
      window.addEventListener("load", enable, { once: true });
    }
  });

  chrome.storage.onChanged.addListener((changes) => {
    if ("enabled" in changes) {
      if (changes.enabled.newValue) enable(); else disable();
    }
  });
})();
