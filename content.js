(function () {
  // Only attribute we ever set — goes on <html>, which React does NOT own.
  const OFF_ATTR = "data-cf-off";
  const BLOCKED_ATTR = "data-cf-blocked";
  const GRADE_ATTR = "data-cf-grade";

  // Apply grade-6 blur immediately (synchronous, before async storage read).
  // This prevents a window where no grade attribute exists and images are unblurred.
  // The async storage read below will overwrite this with the correct grade/whitelist state.
  if (!document.documentElement.hasAttribute(OFF_ATTR) &&
      !document.documentElement.hasAttribute('data-cf-whitelisted') &&
      !document.documentElement.hasAttribute(GRADE_ATTR)) {
    document.documentElement.setAttribute(GRADE_ATTR, '6');
  }

  // WeakSets live entirely in JS memory — zero DOM mutations on img/video.
  let blurred  = new WeakSet();
  let revealed = new WeakSet();
  let listened = new WeakSet();
  // Shadow DOM elements with inline blur applied (CSS selectors can't cross shadow root boundaries)
  let shadowBlurred = new Set();
  let shadowObservers = new Map();
  // Shadow roots where we injected a <style data-cf-injected> tag
  let shadowRootsInjected = new Set();

  // Track current settings
  let currentSettings = {
    enabled: true,
    grade: 6,
    isWhitelisted: false,
    isBlacklisted: false,
    blurMode: 'light', // 'none', 'light', 'heavy', 'block'
    adsBlocked: true,
    popupsBlocked: true,
  };

  // Seconds until full unblur on hover (configurable from popup)
  let unblurSeconds = 6;
  chrome.storage.local.get({ unblurSeconds: 6 }, (r) => { unblurSeconds = r.unblurSeconds; });

  // Map of el → { timer, currentBlur, targetBlur, interval }
  const hoverState = new Map();

  // Global flag to stop ALL processing
  let shouldProcess = true;

  // Track all active timers so we can clear them
  let activeTimers = [];
  let observer = null;
  let interval = null;
  let mutationDebounceTimer = null;

  // Ultra-aggressive selector - catch ALL possible image/video elements including MSN video players
  // SELECTOR FOR REAL MEDIA - target HTML5 + Google Images web components
  // Google Images uses: g-img (web component), g-tabs, shadow DOMs
  // Avoid: SPAN with [role="img"] (UI elements)
  const SELECTOR = `
    img,
    video,
    picture,
    g-img,
    [data-image],
    [data-img],
    #image,
    #photo,
    #picture,
    svg image,
    [style*="background-image: url"],
    iframe:not([src*="google_ads"]):not([src*="doubleclick"]):not([src*="googleadservices"])
  `.trim();

  function collectAll(root) {
    // CRITICAL: Skip CDK overlay container - it contains ALL tooltips/popovers
    const selectorResults = Array.from(root.querySelectorAll(SELECTOR));
    
    const found = selectorResults.filter(el => {
      // Exclude any element inside CDK overlay container
      return !el.closest('.cdk-overlay-container');
    });
    
    // Shadow DOM search — only custom elements (tag contains hyphen, per web spec)
    // Avoids expensive querySelectorAll('*') on large Angular DOMs
    function searchShadows(el, depth = 0) {
      if (!el.shadowRoot || depth > 4) return [];
      const images = [];
      try {
        // Standard media + inline background-image elements
        images.push(...Array.from(el.shadowRoot.querySelectorAll(
          'img, video, g-img, [data-image], [style*="background-image: url"]'
        )));
        // Pseudo-element background-images (e.g. heading::after on MSN hero carousel)
        // Only check 2 levels deep inside shadow root to avoid perf hit
        el.shadowRoot.querySelectorAll(':scope > *, :scope > * > *').forEach(child => {
          try {
            const afterBg = window.getComputedStyle(child, '::after').backgroundImage;
            const beforeBg = window.getComputedStyle(child, '::before').backgroundImage;
            if ((afterBg && afterBg !== 'none' && afterBg.includes('url')) ||
                (beforeBg && beforeBg !== 'none' && beforeBg.includes('url'))) {
              images.push(child);
            }
          } catch (e) {}
        });
        // Watch this shadow root for dynamic changes (rotating hero, lazy load)
        observeShadowRoot(el.shadowRoot);
        // Recurse into nested shadow roots
        el.shadowRoot.querySelectorAll('*').forEach(child => {
          if (child.tagName && child.tagName.includes('-') && child.shadowRoot) {
            images.push(...searchShadows(child, depth + 1));
          }
        });
      } catch (e) {}
      return images;
    }

    try {
      // Only check custom elements for shadow roots (have hyphens — web components spec)
      root.querySelectorAll('*').forEach(el => {
        if (el.tagName && el.tagName.includes('-') && el.shadowRoot) {
          found.push(...searchShadows(el));
        }
      });
    } catch (e) {
      console.log('[CF] collectAll: shadow search error:', e.message);
    }
    
    // Remove duplicates
    return [...new Set(found)];
  }
  // Returns the CSS filter value for a given grade (for shadow DOM inline styles)
  function getBlurForGrade(grade) {
    if (grade <= 5) return "blur(40px) brightness(0.05)";
    if (grade <= 7) return "blur(25px) brightness(0.2)";
    if (grade <= 9) return "blur(15px) brightness(0.4)";
    return null;
  }

  // Return the numeric blur px for the current grade (used by hover animation)
  function getBlurPxForGrade(grade) {
    if (grade <= 5) return 40;
    if (grade <= 7) return 25;
    if (grade <= 9) return 15;
    return 0;
  }

  // Log element details to console when fully unblurred (for debugging)
  function logUnblurredElement(el) {
    try {
      const rect = el.getBoundingClientRect();
      const attrs = {};
      for (const a of el.attributes) attrs[a.name] = a.value;
      console.groupCollapsed('[CF] ✅ Full unblur reached — element details');
      console.log('Tag:', el.tagName.toLowerCase());
      console.log('Attributes:', attrs);
      console.log('src / currentSrc:', el.src || el.currentSrc || attrs.src || '(none)');
      console.log('Size:', Math.round(rect.width) + 'x' + Math.round(rect.height));
      console.log('Position (viewport):', { top: Math.round(rect.top), left: Math.round(rect.left) });
      console.log('Parent:', el.parentElement ? el.parentElement.tagName.toLowerCase() + (el.parentElement.className ? '.' + el.parentElement.className.split(' ').join('.') : '') : '(none)');
      console.log('outerHTML (first 300 chars):', el.outerHTML.slice(0, 300));
      console.log('Element ref:', el);
      console.groupEnd();
    } catch (e) { /* ignore */ }
  }

  // Start gradual unblur on mouseenter, restore immediately on mouseleave
  function attachHoverUnblur(el) {
    if (el._cfHoverAttached) return;
    el._cfHoverAttached = true;

    el.addEventListener('mouseenter', () => {
      if (!shouldProcess) return;
      if (revealed.has(el)) return; // already fully revealed by dblclick
      if (currentSettings.isBlacklisted || currentSettings.grade <= 3) return;

      const maxBlur = getBlurPxForGrade(currentSettings.grade);
      if (!maxBlur) return; // grade 10 — no blur

      // Clear any existing interval for this element
      const prev = hoverState.get(el);
      if (prev && prev.interval) clearInterval(prev.interval);

      const steps = unblurSeconds; // one step per second
      const blurStep = maxBlur / steps;
      let currentBlur = maxBlur;
      let fullyUnblurred = false;

      const interval = setInterval(() => {
        if (!shouldProcess || revealed.has(el)) {
          clearInterval(interval);
          hoverState.delete(el);
          return;
        }
        currentBlur = Math.max(0, currentBlur - blurStep);
        const brightnessVal = currentSettings.grade <= 5 ? 0.05 + (1 - 0.05) * (1 - currentBlur / maxBlur)
                            : currentSettings.grade <= 7 ? 0.2  + (1 - 0.2)  * (1 - currentBlur / maxBlur)
                            :                              0.4  + (1 - 0.4)  * (1 - currentBlur / maxBlur);
        const filterStr = currentBlur > 0
          ? `blur(${currentBlur.toFixed(1)}px) brightness(${brightnessVal.toFixed(2)})`
          : 'none';
        el.style.setProperty('filter', filterStr, 'important');

        if (currentBlur <= 0 && !fullyUnblurred) {
          fullyUnblurred = true;
          clearInterval(interval);
          hoverState.delete(el);
          logUnblurredElement(el);
        }
      }, 1000);

      hoverState.set(el, { interval, maxBlur });
    });

    el.addEventListener('mouseleave', () => {
      const state = hoverState.get(el);
      if (state && state.interval) {
        clearInterval(state.interval);
        hoverState.delete(el);
      }
      if (revealed.has(el)) return; // dblclick revealed — don't re-blur
      // Immediately restore full blur
      const blurVal = getBlurForGrade(currentSettings.grade);
      if (blurVal) {
        el.style.setProperty('filter', blurVal, 'important');
      }
    });
  }

  // Removes inline filter from all shadow DOM elements and removes injected style tags
  function clearShadowStyles() {
    for (const el of shadowBlurred) {
      try { el.style.removeProperty("filter"); } catch (e) {}
    }
    shadowBlurred = new Set();
    // Remove injected <style> tags from all tracked shadow roots
    for (const sr of shadowRootsInjected) {
      try {
        const injected = sr.querySelector('style[data-cf-injected]');
        if (injected) injected.remove();
      } catch (e) {}
    }
    shadowRootsInjected = new Set();
  }

  // Observe a shadow root for attribute/child changes (hero carousels etc.)
  function observeShadowRoot(sr) {
    if (!sr || shadowObservers.has(sr)) return;
    const obs = new MutationObserver((mutations) => {
      // Immediately inject CSS into new shadow roots on child additions — no debounce.
      // Prevents hero/carousel flash: MSN creates new shadow roots each slide swap.
      if (shouldProcess && mutations.some(m => m.type === 'childList' && m.addedNodes.length)) {
        injectShadowStyles();
      }
      clearTimeout(mutationDebounceTimer);
      mutationDebounceTimer = setTimeout(() => processAll(), 150);
    });
    obs.observe(sr, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ['style', 'class', 'src', 'data-src']
    });
    shadowObservers.set(sr, obs);
  }

  // Disconnect and clear all per-shadow-root observers
  function clearShadowObservers() {
    for (const obs of shadowObservers.values()) {
      try { obs.disconnect(); } catch (e) {}
    }
    shadowObservers = new Map();
  }

  // Inject blur CSS directly into every shadow root in the document tree.
  // This is the ONLY way to style elements across shadow root boundaries.
  // Extension CSS (content.css) and regular selectors cannot pierce shadow DOM.
  function injectShadowStyles() {
    if (!shouldProcess) return;
    const blurVal = getBlurForGrade(currentSettings.grade);
    if (!blurVal) return;
    const css = `img,video,picture,[style*="background-image"]{filter:${blurVal}!important}`;

    function traverse(root) {
      root.querySelectorAll('*').forEach(el => {
        if (!el.shadowRoot) return;
        const sr = el.shadowRoot;
        // Update or inject the <style> tag
        const existing = sr.querySelector('style[data-cf-injected]');
        if (existing) {
          if (existing.textContent !== css) existing.textContent = css;
        } else {
          const style = document.createElement('style');
          style.setAttribute('data-cf-injected', '1');
          style.textContent = css;
          sr.insertBefore(style, sr.firstChild);
          shadowRootsInjected.add(sr);
        }
        // Watch shadow root for dynamic content (carousels, lazy load)
        observeShadowRoot(sr);
        // Recurse — querySelectorAll does NOT cross nested shadow roots
        traverse(sr);
      });
    }

    traverse(document);
  }
  // ── Document-level click handler (capture phase) ─────────────────────────
  // Works across shadow roots via e.composedPath().
  // Single click on blurred media: block link navigation.
  // Double-click (two clicks < 350ms) on blurred: reveal.
  // Double-click on revealed: re-blur.
  let _lastClickEl = null;
  let _lastClickTime = 0;

  function onDocumentClick(e) {
    if (!shouldProcess) return;
    const path = e.composedPath ? e.composedPath() : (e.path || []);
    const mediaEl = path.find(el => el && el.nodeType === 1 && blurred.has(el));
    if (!mediaEl) return;

    const now = Date.now();
    const isDbl = (_lastClickEl === mediaEl && now - _lastClickTime < 350);
    _lastClickEl = mediaEl;
    _lastClickTime = now;

    if (revealed.has(mediaEl)) {
      if (isDbl) {
        // Double-click on revealed → re-blur
        revealed.delete(mediaEl);
        mediaEl.style.removeProperty('filter');
        mediaEl.style.removeProperty('visibility');
        mediaEl.style.removeProperty('cursor');
        if (shadowBlurred.has(mediaEl)) {
          const blurVal = getBlurForGrade(currentSettings.grade);
          if (blurVal) mediaEl.style.setProperty('filter', blurVal, 'important');
        }
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      // Single click on revealed → allow navigation (do nothing)
    } else {
      // Blurred: always block navigation
      e.preventDefault();
      e.stopImmediatePropagation();
      if (isDbl) {
        // Double-click on blurred → reveal
        if (currentSettings.isBlacklisted || currentSettings.grade <= 3) return;
        revealed.add(mediaEl);
        mediaEl.style.setProperty('filter', 'none', 'important');
        mediaEl.style.setProperty('visibility', 'visible', 'important');
        mediaEl.style.setProperty('cursor', 'pointer', 'important');
      }
    }
  }

  // ── Register dblclick listeners on new media elements ──────────────────────
  // Only tracks elements in blurred set for composedPath lookup.
  // Click handling is done by document-level onDocumentClick listener.
  function processAll() {
    if (!shouldProcess) return;
    if (document.documentElement.hasAttribute(OFF_ATTR)) return;
    if (currentSettings.isWhitelisted || currentSettings.grade >= 10) return;
    if (currentSettings.isBlacklisted || currentSettings.grade <= 3) return;

    // Inject CSS into every shadow root — the only way to blur shadow DOM content
    injectShadowStyles();

    collectAll(document).forEach(el => {
      if (listened.has(el)) return;
      listened.add(el);
      blurred.add(el);
      // Hover unblur listener (gradual reveal on mouseenter, instant re-blur on mouseleave)
      attachHoverUnblur(el);
      // Shadow DOM elements: extension CSS can't cross shadow root boundaries — apply inline filter
      if (el.getRootNode() !== document) {
        shadowBlurred.add(el);
        const blurVal = getBlurForGrade(currentSettings.grade);
        if (blurVal) el.style.setProperty('filter', blurVal, 'important');
      }
    });
  }

  // ── Enable / disable ────────────────────────────────────────────────────────

  function applyGradeToPage() {
    // Clear all grade attributes first
    document.documentElement.removeAttribute(GRADE_ATTR);
    document.documentElement.removeAttribute('data-cf-whitelisted');
    document.documentElement.removeAttribute('data-cf-blacklisted');
    
    // Apply appropriate attribute based on current settings
    if (currentSettings.isBlacklisted) {
      document.documentElement.setAttribute('data-cf-blacklisted', '1');
    } else if (currentSettings.isWhitelisted) {
      document.documentElement.setAttribute('data-cf-whitelisted', '1');
    } else {
      document.documentElement.setAttribute(GRADE_ATTR, currentSettings.grade);
    }

    // Apply ad/popup blocker attributes
    applyBlockerAttributes();
    
    // Debug log
    console.log('Content Filter - Applied grade:', {
      grade: currentSettings.grade,
      blacklisted: currentSettings.isBlacklisted,
      whitelisted: currentSettings.isWhitelisted,
      enabled: currentSettings.enabled
    });
  }

  function applyBlockerAttributes() {
    if (currentSettings.adsBlocked && !currentSettings.isWhitelisted) {
      document.documentElement.setAttribute('data-cf-ads-blocked', '1');
    } else {
      document.documentElement.removeAttribute('data-cf-ads-blocked');
    }
    if (currentSettings.popupsBlocked && !currentSettings.isWhitelisted) {
      document.documentElement.setAttribute('data-cf-popups-blocked', '1');
    } else {
      document.documentElement.removeAttribute('data-cf-popups-blocked');
    }
  }

  function enable() {
    // Don't auto-process for whitelisted or grade 10 sites - just set attribute
    // These sites should not have blur applied, and constant DOM scanning breaks pages
    if (currentSettings.isWhitelisted || currentSettings.grade >= 10) {
      shouldProcess = false;
      applyGradeToPage();
      
      // Remove only the inline filter overrides we may have set on revealed media elements.
      // Do NOT touch other inline styles — Angular uses them for layout/positioning.
      try {
        for (const el of document.querySelectorAll('img, video, iframe, picture')) {
          el.style.removeProperty("filter");
          el.style.removeProperty("visibility");
          el.style.removeProperty("cursor");
        }
      } catch (e) {}

      clearShadowStyles();
      clearShadowObservers();
      console.log('[CF] Grade 10/Whitelist - disabled processing, cleaned media inline styles');
      return;
    }

    // Enable processing for grades 1-9
    shouldProcess = true;

    if (!currentSettings.enabled) return;
    document.documentElement.removeAttribute(OFF_ATTR);
    applyGradeToPage();
    
    console.log('[CF] ENABLE called - starting processing. Grade:', currentSettings.grade);
    
    if (!observer) {
      // Document-level click handler: composedPath works across shadow roots.
      // Attached once here, removed in disable().
      document.addEventListener('click', onDocumentClick, true);

      observer = new MutationObserver((mutations) => {
        // If new DOM nodes were added, immediately inject blur CSS into any new shadow roots.
        // This prevents carousel/hero flash: new shadow roots are blurred before browser paints.
        // (processAll below is debounced and would be too slow to prevent the flash)
        if (shouldProcess && mutations.some(m => m.type === 'childList' && m.addedNodes.length)) {
          injectShadowStyles();
        }
        // Debounce the full processAll() to avoid thrash on Angular SPAs
        clearTimeout(mutationDebounceTimer);
        mutationDebounceTimer = setTimeout(() => {
          processAll();
        }, 120);
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      console.log('[CF] MutationObserver started (debounced 120ms)');
    }
    // Sweep every 500ms for dynamically loaded content
    if (!interval) {
      interval = setInterval(() => {
        processAll();
      }, 500);
      console.log('[CF] Interval started - will process every 500ms');
    }
    
    // Additional sweeps for MSN-like sites where content loads after page init
    activeTimers.push(setTimeout(() => { processAll(); }, 100));
    activeTimers.push(setTimeout(() => { processAll(); }, 400));
    activeTimers.push(setTimeout(() => { processAll(); }, 1000));
    activeTimers.push(setTimeout(() => { processAll(); }, 2500));
  }

  function disable() {
    // Stop all active processing with master switch FIRST
    shouldProcess = false;
    document.removeEventListener('click', onDocumentClick, true);
    
    // IMMEDIATELY disconnect observer BEFORE doing anything else
    if (observer) { 
      observer.disconnect(); 
      observer = null; 
    }
    clearTimeout(mutationDebounceTimer);
    mutationDebounceTimer = null;
    clearInterval(interval); 
    interval = null;
    
    // Stop all timers
    activeTimers.forEach(timerId => clearTimeout(timerId));
    activeTimers = [];
    
    // Set OFF attribute FIRST to prevent CSS rules from applying
    document.documentElement.setAttribute(OFF_ATTR, "1");
    document.documentElement.removeAttribute(GRADE_ATTR);
    document.documentElement.removeAttribute('data-cf-whitelisted');
    document.documentElement.removeAttribute('data-cf-blacklisted');
    
    // Remove only inline filter overrides from media elements (set by dblclick reveal).
    // Do NOT touch other inline styles — Angular uses them for layout/positioning.
    try {
      for (const el of document.querySelectorAll('img, video, iframe, picture')) {
        el.style.removeProperty("filter");
        el.style.removeProperty("visibility");
        el.style.removeProperty("cursor");
      }
    } catch (e) {}
    
    // Clear shadow DOM inline styles
    clearShadowStyles();
    clearShadowObservers();

    // Clear all WeakSets
    blurred  = new WeakSet();
    revealed = new WeakSet();
    listened = new WeakSet();
    
    currentSettings = {
      enabled: false,
      grade: 6,
      isWhitelisted: false,
      isBlacklisted: false,
      blurMode: 'none',
    };
    
    console.log('[CF] Extension completely disabled - all styles removed');
  }

  // ── Get domain from URL ────────────────────────────────────────────────────
  function getDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      return '';
    }
  }

  // ── Analyzer module (compact version) ─────────────────────────────────────
  const pageAnalyzer = {
    analyzePage: function() {
      const findings = {
        mediaCount: 0,
        adCount: 0,
        popupCount: 0,
        textLength: 0,
        hasAdultIndicators: false,
        adultKeywords: [],
        hasViolenceIndicators: false,
        hasMedicalKeywords: false,
        hasFinanceKeywords: false,
        hasEducationKeywords: false,
        hasTechKeywords: false,
        hasNewsKeywords: false,
        backgroundImages: 0,
        iframeCount: 0,
      };

      const mediaElements = collectAll(document);
      findings.mediaCount = mediaElements.length;
      findings.adCount = this.countAds();
      findings.popupCount = this.countPopups();
      findings.backgroundImages = this.countBackgroundImages();
      findings.iframeCount = document.querySelectorAll('iframe').length;

      const textContent = document.body.innerText.toLowerCase();
      findings.textLength = textContent.length;

      const adultKeywords = ['porn', 'sex', 'xxx', 'adult', 'nude', 'naked', 'escort'];
      const violenceKeywords = ['kill', 'murder', 'terrorist', 'bomb', 'weapon'];

      findings.adultKeywords = adultKeywords.filter(kw => textContent.includes(kw));
      findings.hasAdultIndicators = findings.adultKeywords.length > 0;
      findings.hasViolenceIndicators = violenceKeywords.some(kw => textContent.includes(kw));

      const medicalKeywords = ['doctor', 'hospital', 'medical', 'patient', 'treatment', 'pharmacy'];
      const financeKeywords = ['bank', 'credit', 'loan', 'invest', 'stock', 'trading', 'payment'];
      const educationKeywords = ['course', 'lesson', 'tutorial', 'learn', 'education', 'school', 'university'];
      const techKeywords = ['programming', 'code', 'software', 'algorithm', 'framework', 'api', 'developer'];
      const newsKeywords = ['news', 'article', 'report', 'breaking', 'today', 'announced'];

      findings.hasMedicalKeywords = medicalKeywords.some(kw => textContent.includes(kw));
      findings.hasFinanceKeywords = financeKeywords.some(kw => textContent.includes(kw));
      findings.hasEducationKeywords = educationKeywords.some(kw => textContent.includes(kw));
      findings.hasTechKeywords = techKeywords.some(kw => textContent.includes(kw));
      findings.hasNewsKeywords = newsKeywords.some(kw => textContent.includes(kw));

      const metaDescription = document.querySelector('meta[name="description"]')?.content?.toLowerCase() || '';
      const metaKeywords = document.querySelector('meta[name="keywords"]')?.content?.toLowerCase() || '';
      const pageTitle = document.title.toLowerCase();
      const metaContent = metaDescription + ' ' + metaKeywords + ' ' + pageTitle;

      if (adultKeywords.some(kw => metaContent.includes(kw))) findings.hasAdultIndicators = true;
      if (violenceKeywords.some(kw => metaContent.includes(kw))) findings.hasViolenceIndicators = true;
      if (medicalKeywords.some(kw => metaContent.includes(kw))) findings.hasMedicalKeywords = true;
      if (financeKeywords.some(kw => metaContent.includes(kw))) findings.hasFinanceKeywords = true;
      if (educationKeywords.some(kw => metaContent.includes(kw))) findings.hasEducationKeywords = true;
      if (techKeywords.some(kw => metaContent.includes(kw))) findings.hasTechKeywords = true;
      if (newsKeywords.some(kw => metaContent.includes(kw))) findings.hasNewsKeywords = true;

      const grade = this.calculateGrade(findings);

      return {
        grade,
        findings,
        datetime: new Date().toISOString(),
        url: window.location.href,
      };
    },

    countAds: function() {
      let count = 0;
      const adSelectors = [
        '[class*="ad"]', '[id*="ad"]', '[class*="banner"]',
        '[class*="advertisement"]', 'ins[class*="adsbygoogle"]', '.advert', '#advert',
      ];
      adSelectors.forEach(selector => {
        try { count += document.querySelectorAll(selector).length; } catch (e) {}
      });
      return count;
    },

    countPopups: function() {
      let count = 0;
      const popupSelectors = ['[role="dialog"]', '.modal', '.popup', '.overlay', '[class*="modal"]', '[class*="popup"]'];
      popupSelectors.forEach(selector => {
        try {
          const els = document.querySelectorAll(selector);
          els.forEach(el => {
            const style = window.getComputedStyle(el);
            if (style.display !== 'none' && style.visibility !== 'hidden') count++;
          });
        } catch (e) {}
      });
      return count;
    },

    countBackgroundImages: function() {
      let count = 0;
      const allElements = document.querySelectorAll('*');
      allElements.forEach(el => {
        const bgImage = window.getComputedStyle(el).backgroundImage;
        if (bgImage && bgImage !== 'none') count++;
      });
      return count;
    },

    calculateGrade: function(findings) {
      if (findings.hasAdultIndicators) return 1;
      if (findings.hasViolenceIndicators) return 2;
      if (findings.adultKeywords.length > 3) return 2;
      if (findings.hasNewsKeywords && findings.mediaCount > 5) return 4;
      if (findings.mediaCount > 40 || findings.adCount > 15) return 4;
      if (findings.hasFinanceKeywords || findings.hasMedicalKeywords) return 5;
      if (findings.mediaCount > 20 && findings.adCount > 5) return 5;
      if (findings.hasEducationKeywords) return 6;
      if (findings.hasTechKeywords) return 7;
      if (findings.mediaCount > 15) return 6;
      if (findings.mediaCount > 5) return 7;
      if (findings.textLength > 2000 && findings.mediaCount < 3) return 10;
      if (findings.textLength > 1000 && findings.mediaCount < 5) return 9;
      if (findings.mediaCount < 8) return 8;
      return 6;
    },
  };

  // ── Listen to messages from popup ───────────────────────────────────────────
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const domain = getDomain(window.location.href);
    
    if (request.action === 'analyze') {
      const analysis = pageAnalyzer.analyzePage();
      sendResponse({ analysis });
    }
    
    if (request.action === 'updateGrade') {
      // User manually changed grade in popup
      currentSettings.grade = request.grade;
      currentSettings.isWhitelisted = false;
      currentSettings.isBlacklisted = false;
      
      // If grade 10, disable processing
      if (request.grade >= 10) {
        disable();
      } else {
        applyGradeToPage();
        processAll();
      }
      console.log('[CF] Grade updated to:', request.grade);
      sendResponse({ success: true });
    }
    
    if (request.action === 'toggleWhitelist') {
      console.log('[CF] Whitelist toggled:', request.whitelisted);
      
      currentSettings.isWhitelisted = request.whitelisted;
      currentSettings.isBlacklisted = false;
      
      // If whitelisted, AGGRESSIVELY clean everything
      if (request.whitelisted) {
        console.log('[CF] Site added to whitelist - aggressive cleanup');
        shouldProcess = false;
        
        // Disconnect observer and timers FIRST
        if (observer) { observer.disconnect(); observer = null; }
        clearInterval(interval); interval = null;
        activeTimers.forEach(t => clearTimeout(t)); activeTimers = [];
        
        // Set whitelist attribute
        document.documentElement.setAttribute('data-cf-whitelisted', '1');
        document.documentElement.removeAttribute(OFF_ATTR);
        document.documentElement.removeAttribute(GRADE_ATTR);
        document.documentElement.removeAttribute('data-cf-blacklisted');
        
        // Remove only inline filter overrides from media elements (set by dblclick reveal).
        // Do NOT touch other inline styles — Angular uses them for layout/positioning.
        try {
          for (const el of document.querySelectorAll('img, video, iframe, picture')) {
            el.style.removeProperty("filter");
            el.style.removeProperty("visibility");
            el.style.removeProperty("cursor");
          }
        } catch (e) {}

        clearShadowStyles();
        clearShadowObservers();
        console.log('[CF] Whitelist applied - media inline styles cleared');
      } else {
        // Remove from whitelist - re-enable processing
        currentSettings.isWhitelisted = false;
        applyGradeToPage();
        enable();
        console.log('[CF] Whitelist removed - reprocessing page');
      }
      
      sendResponse({ success: true });
    }
    
    if (request.action === 'toggleBlacklist') {
      currentSettings.isBlacklisted = request.blacklisted;
      currentSettings.isWhitelisted = false;
      
      // Blacklist still needs to process (to show blocking message)
      applyGradeToPage();
      processAll();
      console.log('[CF] Blacklist toggled:', request.blacklisted);
      sendResponse({ success: true });
    }
    
    if (request.action === 'toggleAds') {
      currentSettings.adsBlocked = request.adsBlocked;
      applyBlockerAttributes();
      sendResponse({ success: true });
    }

    if (request.action === 'togglePopups') {
      currentSettings.popupsBlocked = request.popupsBlocked;
      applyBlockerAttributes();
      sendResponse({ success: true });
    }

    if (request.action === 'refresh') {
      // Refresh filter settings
      initializeFilter();
      sendResponse({ success: true });
    }
    
    if (request.action === 'toggleOff') {
      // Explicitly turn OFF the extension
      console.log('[CF] TOGGLE OFF received - disabling extension');
      currentSettings.enabled = false;
      disable();
      console.log('[CF] Extension toggled OFF - shouldProcess =', shouldProcess);
      console.log('[CF] OFF attribute set:', document.documentElement.hasAttribute(OFF_ATTR));
      sendResponse({ success: true });
    }

    if (request.action === 'setUnblurSeconds') {
      unblurSeconds = request.seconds;
      sendResponse({ success: true });
    }
  });

  // ── Initialize on load ─────────────────────────────────────────────────────
  function initializeFilter() {
    const domain = getDomain(window.location.href);
    
    console.log('[CF] Initializing for domain:', domain);

    chrome.storage.local.get(['enabled', 'siteGrades', 'whitelist', 'blacklist', 'adsBlocked', 'popupsBlocked'], (result) => {
      const enabled = result.enabled !== false;
      const siteGrades = result.siteGrades || {};
      const whitelist = (result.whitelist || []).map(d => d.toLowerCase());
      const blacklist = (result.blacklist || []).map(d => d.toLowerCase());
      const domainLower = domain.toLowerCase();
      currentSettings.adsBlocked = result.adsBlocked !== false;
      currentSettings.popupsBlocked = result.popupsBlocked !== false;

      console.log('[CF] Storage check:', { enabled, hasWhitelist: whitelist.length, hasBlacklist: blacklist.length });

      // 1. Check blacklist first (highest priority)
      if (blacklist.includes(domainLower)) {
        currentSettings.enabled = enabled;
        currentSettings.isBlacklisted = true;
        currentSettings.isWhitelisted = false;
        currentSettings.grade = 1; // Force grade 1 for blacklist
        console.log('[CF] Site IS BLACKLISTED');
      }
      // 2. Check whitelist
      else if (whitelist.includes(domainLower)) {
        currentSettings.enabled = enabled;
        currentSettings.isWhitelisted = true;
        currentSettings.isBlacklisted = false;
        currentSettings.grade = 10; // Force grade 10 for whitelist
        console.log('[CF] Site IS WHITELISTED');
      }
      // 3. Use stored grade or auto-grade
      else {
        currentSettings.enabled = enabled;
        currentSettings.isBlacklisted = false;
        currentSettings.isWhitelisted = false;
        
        if (siteGrades[domainLower]) {
          // User override takes priority, then auto-grade
          currentSettings.grade = siteGrades[domainLower].userGrade || siteGrades[domainLower].autoGrade || 6;
          console.log('[CF] Using stored grade:', currentSettings.grade);
        } else {
          currentSettings.grade = 6; // Default grade
          console.log('[CF] Using default grade: 6');
        }
      }

      console.log('[CF] Final settings:', currentSettings);

      if (!enabled) {
        document.documentElement.setAttribute(OFF_ATTR, "1");
        console.log('[CF] Extension disabled');
        return;
      }

      // For whitelisted or grade 10 sites, don't run processing - just set attribute
      if (currentSettings.isWhitelisted || currentSettings.grade >= 10) {
        applyGradeToPage();
        console.log('[CF] Site whitelisted or grade 10 - no processing');
        return;
      }

      // Wait for DOM to be ready - only if we need to process
      if (document.readyState === "complete" || document.readyState === "interactive") {
        enable();
      } else {
        window.addEventListener("load", enable, { once: true });
        document.addEventListener("DOMContentLoaded", enable, { once: true });
      }
    });
  }

  // Listen to storage changes
  chrome.storage.onChanged.addListener((changes) => {
    if ("enabled" in changes) {
      const enabled = changes.enabled.newValue;
      currentSettings.enabled = enabled;
      if (enabled) enable(); else disable();
    }
    
    if ("siteGrades" in changes || "whitelist" in changes || "blacklist" in changes) {
      // Re-evaluate settings for this site
      initializeFilter();
    }

    if ("unblurSeconds" in changes) {
      unblurSeconds = changes.unblurSeconds.newValue;
    }
  });

  // Initialize on document start
  initializeFilter();
})();
