# Content Filter — Chrome Extension (Manifest V3)

**Advanced grade-based content filtering with machine learning feedback.**

Automatically grades websites 1-10 based on content analysis. Blocks (grade 1-3), blurs (4-9), or allows (10) media accordingly. Users can override grades and provide feedback to improve the system.

---

## Grade System

| Grade | Category | Action |
|-------|----------|--------|
| 1-3 | 🔴 Adult/Dangerous/Violence | **BLOCKED** (hidden) |
| 4 | 🟠 News, Video sites, High media | Heavy blur (40px, 0.05 brightness) |
| 5 | 🟡 Finance, Medical, E-commerce | Heavy blur |
| 6 | 🟡 Educational content | Heavy blur |
| 7 | 🟢 Technical, Programming | Medium blur (25px, 0.2 brightness) |
| 8 | 🟢 Religious content with media/video | Light blur (15px, 0.4 brightness) |
| 9 | 🟢 Religious content, low media | Light blur |
| 10 | 📚 Jewish religious text-only | No blur |

---

## How It Works

### 1. **Page Analysis**
- Counts: images, videos, background images, ads, pop-ups
- Scans text content + metadata for keyword matching
- Detects categories: Adult, Violence, Medical, Finance, Education, Tech, News

### 2. **Auto-Grading**
- Algorithm assigns grade 1-10 based on findings
- Considers media count, text/media ratio, keyword density
- Determines blur intensity automatically

### 3. **User Override**
- Slider in popup allows manual grade adjustment
- Changes apply immediately (page reloads)
- System learns from feedback

### 4. **Whitelist / Blacklist**
- Per-site controls in popup
- Whitelist: always unblurred (grade 10)
- Blacklist: always blocked (grade 1)

### 5. **Feedback System**
- Users can report incorrect grades
- Feedback stored as "teaching examples"
- Plans: future ML improvements from accumulated data

---

## Files

| File | Purpose |
|---|---|
| `manifest.json` | V3 config, permissions, scripts |
| `content.css` | Grade-based blur levels via `data-cf-grade` attribute |
| `content.js` | DOM monitoring, blur/block logic, page analysis, message handler |
| `analyzer.js` | Standalone page grading algorithm |
| `storage.js` | Chrome storage API wrapper (grades, whitelist/blacklist, feedback) |
| `popup.html` | Status, grade override slider, feedback modal, list controls |
| `popup.js` | Popup UI logic, messaging to content.js, storage management |

---

## Installation

1. `chrome://extensions` → Enable **Developer mode**
2. **Load unpacked** → select this folder
3. Visit any website → popup shows grade + findings
4. Adjust grade slider, provide feedback, whitelist/blacklist as needed

---

## Features

✅ **Automatic grading** — AI-like analysis of page content  
✅ **Grade override** — Adjust with slider (1-10)  
✅ **Whitelist / Blacklist** — Per-site rules  
✅ **Detailed findings** — See what triggered the grade  
✅ **User feedback** — Report misclassifications  
✅ **Learning examples** — Feedback stored for future improvements  
✅ **Shadow DOM support** — Works with Web Components, MSN, news sites  
✅ **Dynamic content** — Catches lazy-loaded images  
✅ **Double-click reveal** — Temporarily unblur individual items  

---

## Planned Expansions

- [ ] **Ad blocker** — Hide ad containers, block tracking pixels
- [ ] **Pop-up blocker** — Block modal dialogs
- [ ] **Cloud sync** — Backup grades/feedback to account
- [ ] **Statistics** — How many items filtered per session/site
- [ ] **Smart learning** — Retrain algorithm on user feedback
- [ ] **Keyboard shortcuts** — Quick toggle (Ctrl+Shift+F)
- [ ] **Per-category settings** — Different rules for violence vs adult vs ads
- [ ] **Analytics dashboard** — View top sites, grades, trends
- [ ] **Blur text mode** — Optional blur of article headlines

---

## Architecture

```
popup.js (UI)
    ↓ (chrome.tabs.sendMessage)
content.js (DOM mutations, runtime.onMessage)
    ↓ (reads from storage)
storage.js (persistence layer)
    ↓ (queries)
chrome.storage.local
    ↓ (synced via content.css attribute)
content.css (CSS grade-based rules)
```

**Key Design Decisions:**

- **WeakSets**: Track state in JS memory (zero DOM pollution, React-safe)
- **CSS Rules First**: `data-cf-grade` attribute in CSS avoids hydration issues
- **Per-Domain Caching**: Grades stored by hostname for instant recall
- **Inline Styles**: Override author !important with higher specificity

---

## Security & Privacy

- ✅ No tracking/analytics
- ✅ No server communication
- ✅ All data stored locally (`chrome.storage.local`)
- ✅ Feedback optional (user controls when shared)
- ✅ No external APIs called

---

## Troubleshooting

**Blur not applying?**
- Check grade in popup
- Ensure extension is enabled (toggle)
- Try reloading page (Ctrl+R)

**Can't override grade?**
- Refresh page after slider change (should be automatic)
- Check whitelist/blacklist doesn't conflict

**Feedback not saving?**
- Check storage quota: `chrome://settings/content/storage`
- Try clearing old entries in Settings

---

## Development

To modify scoring logic:
1. Edit `analyzer.js` → `calculateGrade()` function
2. Add new keyword lists for content categories
3. Reload extension (`chrome://extensions` → Reload)

To add new UI controls:
1. Add HTML to `popup.html`
2. Add event handlers in `popup.js`
3. Use `chrome.storage.local.set/get` to persist

