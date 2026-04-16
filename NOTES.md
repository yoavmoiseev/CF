# Content Filter — Проблемы и решения

## Машов (mashov.org.il) — ЗАЩИЩЁННЫЙ САЙТ

**Машов нельзя ломать.** Это Angular Material + Angular CDK сайт, который добавляется в whitelist.

При добавлении в whitelist:
- `html` получает атрибут `data-cf-whitelisted`
- `shouldProcess = false` — JS полностью останавливает обработку
- `injectShadowStyles()` никогда не вызывается для whitelisted сайтов
- CSS: `html[data-cf-whitelisted] * { filter: none !important }` убирает все фильтры

**Что было сломано из-за Машов:**
- Нельзя ставить `visibility: visible !important` / `opacity: 1 !important` / `pointer-events: auto !important` на CDK exclusions — Angular CDK намеренно ставит `pointer-events: none` на tooltip panes, наш override вызывал мерцание тултипов.
- CDK exclusion block (низ `content.css`) содержит **только** `filter: none !important` — больше ничего.

---

## Проблема 1: MSN.com — изображения не блюрились (фоновые картинки)

**Симптом:** MSN полностью игнорировался, несмотря на grade=4.

**Причина:** MSN использует `background-image: url(...)` в inline стилях для превью карточек, а не `<img>` теги. CSS-правила вида `html[data-cf-grade="4"] img` не покрывали эти элементы.

**Решение:**
- `content.css`: добавлен `[style*="background-image: url"]` во все grade 4–9 правила и DEFAULT MEDIA BLUR
- `content.js`: добавлен `[style*="background-image: url"]` в константу `SELECTOR`

---

## Проблема 2: CSS не может пронизывать Shadow DOM

**Симптом:** grade=4 установлен на `<html>`, JS работает, но изображения на MSN остаются видимыми.

**Причина:** MSN построен на **Microsoft FAST Web Components** — вся разметка карточек находится внутри Shadow DOM. CSS-правила расширения (`html[data-cf-grade="4"] img`) **физически не могут** достичь элементов внутри `#shadow-root`. Это фундаментальное ограничение браузера — CSS-селекторы не пересекают границы shadow root.

**Неудачные попытки:**
- `el.style.setProperty("filter", blurVal, "important")` на найденных элементах — ненадёжно, т.к. нужно найти каждый элемент, а MSN имеет 5+ уровней вложенных shadow roots
- Увеличение глубины поиска `searchShadows` — не решает проблему полностью

**Финальное решение — инжекция `<style>` тега в каждый shadow root:**
```js
function injectShadowStyles() {
  // traverse() рекурсивно обходит ВСЕ shadow roots в документе
  // В каждый вставляет <style data-cf-injected> с правилами blur
}
```
- Функция `traverse(root)` рекурсивно обходит всё дерево, входя в каждый `shadowRoot`
- В каждый shadow root вставляется `<style data-cf-injected>` с правилами `img,video,picture,[style*="background-image"]{filter:blur(...)!important}`
- При disable/whitelist/grade10 — все инжектированные теги удаляются через `clearShadowStyles()`
- **Машов не затронут**: `injectShadowStyles()` вызывается только из `processAll()`, который немедленно возвращается при `isWhitelisted === true`

---

## Проблема 3: Мерцание hero/carousel (новые элементы видны ~0.5 секунды)

**Симптом:** Карусель на MSN меняет картинку каждые несколько секунд. Новая картинка видна ~0.5 секунды, потом блюрится.

**Причина:** MSN при смене слайда создаёт **новый shadow root** (новый компонент). Наш `<style>` инжектирован в старый shadow root, а новый — без стилей. MutationObserver и setInterval реагируют через 120–500ms — за это время кадр уже отрисован браузером.

**Решение:** В MutationObserver-ах (и документа, и per-shadow-root) при обнаружении `childList` изменений — вызывать `injectShadowStyles()` **синхронно, без debounce**, до того как браузер отрисует следующий кадр:
```js
observer = new MutationObserver((mutations) => {
  if (shouldProcess && mutations.some(m => m.type === 'childList' && m.addedNodes.length)) {
    injectShadowStyles(); // сразу, без задержки
  }
  // processAll() — по-прежнему debounced 120ms
  clearTimeout(mutationDebounceTimer);
  mutationDebounceTimer = setTimeout(() => processAll(), 120);
});
```

---

## Проблема 4: Специфичность CSS — grade rules перекрывались

**Симптом:** DEFAULT MEDIA BLUR или CDK exclusions перекрывали grade-правила.

**Причина:** Grade-правила имели специфичность (0,1,2), CDK exclusions — (0,4,2).

**Решение:**
- Все grade 4–9 правила написаны с `:not([data-cf-off]):not([data-cf-whitelisted])` → специфичность (0,3,2)
- DEFAULT MEDIA BLUR тоже (0,3,2), стоит **до** grade rules → grade rules побеждают по порядку каскада
- CDK exclusions (0,4,2) остаются в конце файла, содержат **только** `filter: none !important`

---

## Проблема 5: Двойной клик навигировал по ссылке вместо reveal

**Симптом:** Двойной клик на заблюренной картинке открывал страницу по ссылке.

**Причина:** Картинки на MSN обёрнуты в `<a>` теги. `dblclick` на картинке всплывал до `<a>` и вызывал навигацию.

**Решение:** Функция `onClickCapture` в capture-фазе: блокирует `preventDefault() + stopImmediatePropagation()` для одиночных кликов на заблюренных элементах. После reveal (dblclick) — клики проходят нормально.

---

## Архитектура расширения

| Файл | Роль |
|------|------|
| `manifest.json` | MV3, content scripts на `document_start`, all_urls |
| `content.css` | Инжектируется при старте страницы, blur через `html[data-cf-grade="X"]` атрибут |
| `content.js` | Устанавливает атрибут на `<html>`, управляет reveal/re-blur, инжектирует CSS в shadow roots |
| `storage.js` | Хранение grade и настроек |
| `analyzer.js` | Определение grade для домена |

**Система grade:**
- 1–3: Блокировка всей страницы (`body { display: none }`)
- 4–5: Сильный blur (`blur(40px) brightness(0.05)`)
- 6–7: Средний blur (`blur(25px) brightness(0.2)`)
- 8–9: Лёгкий blur (`blur(15px) brightness(0.4)`)
- 10 / whitelisted: `filter: none`
