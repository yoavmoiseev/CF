# Content Filter — Chrome Extension (Manifest V3)

Blurs all images and videos on every website by default. Double-click any media to reveal it. Toggle the filter on/off via the popup.

---

## Files

| File | Purpose |
|---|---|
| `manifest.json` | Extension config — permissions, content script injection |
| `content.js` | Runs on every page — applies blur, handles Shadow DOM, MutationObserver, setInterval |
| `popup.html` | Popup UI — Toggle button + Status label |
| `popup.js` | Popup logic — reads/writes `chrome.storage.local`, reloads the active tab |

---

## How It Works

1. **On page load** — `content.js` reads `enabled` from `chrome.storage.local` (default: `true`)
2. If enabled, every `<img>` and `<video>` gets `filter: blur(20px) brightness(0.6)` applied as an **inline style** (bypasses CSP)
3. **Shadow DOM support** — `collectMedia()` recursively walks all shadow roots (needed for MSN, news sites, Web Components)
4. **Dynamic content** — `MutationObserver` + `setInterval(800ms)` catches lazy-loaded and JS-injected media
5. **Double-click to reveal** — removes blur from that element only; `preventDefault` + `stopImmediatePropagation` prevent the click from navigating away
6. **Toggle** — popup writes `enabled: true/false` → `storage.onChanged` in `content.js` reacts immediately → tab reloads to fully reset

---

## Install (unpacked)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select this folder
4. Done — visit any website

---

## Planned Expansions

- [ ] Filter by content category (violence, adult, ads)
- [ ] Whitelist / blacklist domains
- [ ] Blur text content (articles, headlines)
- [ ] Blur background images (`background-image` CSS)
- [ ] Per-site settings
- [ ] Keyboard shortcut to toggle
- [ ] Reveal timer (auto re-blur after N seconds)
- [ ] Statistics (how many items filtered per session)
