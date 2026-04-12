(function () {
  // Only attribute we ever set — goes on <html>, which React does NOT own.
  const OFF_ATTR = "data-cf-off";
  const BLOCKED_ATTR = "data-cf-blocked";
  const GRADE_ATTR = "data-cf-grade";

  // WeakSets live entirely in JS memory — zero DOM mutations on img/video.
  const blurred  = new WeakSet();
  const revealed = new WeakSet();
  const listened = new WeakSet();

  // Track current settings
  let currentSettings = {
    enabled: true,
    grade: 6,
    isWhitelisted: false,
    isBlacklisted: false,
    blurMode: 'light', // 'none', 'light', 'heavy', 'block'
  };

  // Ultra-aggressive selector - catch ALL possible image/video elements including MSN video players
  const SELECTOR = `
    img, video, picture, svg image, g-img, g-img img,
    iframe,
    [style*="background-image"], [style*="background-url"],
    [aria-label*="image"], [aria-label*="photo"], [aria-label*="picture"],
    [aria-label*="video"], [aria-label*="media"],
    [role="img"], [role="image"],
    .image, .picture, .photo, .img,
    .video, .player, .media-container, .media,
    [data-image], [data-img], [data-photo], [data-picture],
    [data-video], [data-media], [data-src], [data-lazy],
    [class*="video"], [class*="player"], [class*="media"],
    [id*="video"], [id*="player"], [id*="media"]
  `.trim();

  function collectAll(root) {
    const found = Array.from(root.querySelectorAll(SELECTOR));
    
    // Expand search for common video/media containers (especially for MSN, news sites)
    const commonVideoContainers = `
      [class*="video"], [class*="player"], [class*="media"], [class*="stream"],
      [id*="video"], [id*="player"], [id*="media"],
      .video-container, .player-container, .media-container, .stream-container,
      .video-wrapper, .player-wrapper, .media-wrapper,
      [data-video], [data-media], [data-player],
      article img, article video, article iframe,
      .story img, .story video, .story iframe,
      .tile img, .tile video, .tile iframe,
      [role="article"] img, [role="article"] video, [role="article"] iframe,
      .news-item img, .card img, .item img
    `.trim().split(',').map(s => s.trim()).join(', ');
    
    const containerElements = Array.from(root.querySelectorAll(commonVideoContainers));
    
    // Collect web components and their images
    const webComponentSelectors = `
      cr-searchbox-dropdown, cr-searchbox-match, cr-searchbox-icon,
      cr-searchbox-dropdown img, cr-searchbox-match img, cr-searchbox-icon img,
      g-img, g-img img,
      .rg_i, .rg_ic, .rg_il, .mimg, .rISBZc,
      [data-lpage], [data-image], [data-img], [data-photo], [data-picture],
      [aria-label*="image"], [aria-label*="photo"], [aria-label*="picture"],
      .gs-image, .lNHeqf, .DhN8ae, .T4LgNb,
      [jsname], [class*="image"], [class*="photo"], [class*="picture"],
      [role="option"] img, [role="option"] [style*="background-image"],
      [aria-controls] img, [id="matches"] img,
      [role="listbox"] img, [role="list"] img,
      [class*="dropdown"] img, [class*="autocomplete"] img, [class*="popover"] img
    `.trim().split(',').map(s => s.trim()).join(', ');
    
    const webComponentElements = Array.from(root.querySelectorAll(webComponentSelectors));
    found.push(...containerElements);
    
    // Also search within dropdown/popover containers
    const dropdownContainers = root.querySelectorAll('[role="listbox"], [role="option"], [id="matches"], [class*="dropdown"], [class*="autocomplete"], [class*="popover"], cr-searchbox-dropdown');
    dropdownContainers.forEach(container => {
      found.push(...Array.from(container.querySelectorAll('img, video, g-img, [style*="background-image"]')));
    });
    
    // Aggressively search shadow DOMs - multiple passes
    function searchShadows(el) {
      if (el.shadowRoot) {
        const shadowImages = Array.from(el.shadowRoot.querySelectorAll('img, video, g-img, [style*="background-image"]'));
        found.push(...shadowImages);
        
        // Recursively search child elements' shadow DOMs
        el.shadowRoot.querySelectorAll('*').forEach(child => {
          if (child.shadowRoot) {
            searchShadows(child);
          }
        });
      }
    }
    
    // Start shadow DOM search from root and all its children
    searchShadows(root);
    root.querySelectorAll("*").forEach(el => searchShadows(el));
    
    return [...new Set(found)]; // Remove duplicates
  }

  // ── Apply blur based on current settings ───────────────────────────────────
  function applyBlur(el) {
    if (revealed.has(el) || blurred.has(el)) return;

    // Grade 1-3 and blacklist are handled by CSS completely
    if (currentSettings.isBlacklisted || currentSettings.grade <= 3) {
      return; // CSS blocks everything
    }

    // Grade 10 and whitelist - no blur needed
    if (currentSettings.isWhitelisted || currentSettings.grade >= 10) {
      el.style.removeProperty("filter");
      el.style.removeProperty("cursor");
      return;
    }

    // Grade 4-9 - CSS handles the blur, but apply inline backup + enable double-click reveal
    blurred.add(el);
    
    // Apply inline backup blur styles in case page CSS overrides it
    const blurIntensity = currentSettings.grade <= 5 ? '35px' :
                          currentSettings.grade <= 7 ? '15px' : '8px';
    const brightness = currentSettings.grade <= 5 ? '0.3' :
                       currentSettings.grade <= 7 ? '0.5' : '0.7';
    el.style.setProperty("filter", `blur(${blurIntensity}) brightness(${brightness})`, "important");
    el.style.setProperty("visibility", "visible", "important");
    el.style.setProperty("cursor", "pointer", "important");

    if (!listened.has(el)) {
      listened.add(el);
      el.addEventListener("dblclick", onDblClick, true);
    }
  }

  function applyBlockStyle(el) {
    blurred.add(el);
    // Fully hide blocked content - multiple layers to ensure invisibility
    el.style.setProperty("display", "none", "important");
    el.style.setProperty("visibility", "hidden", "important");
    el.style.setProperty("width", "0", "important");
    el.style.setProperty("height", "0", "important");
    el.style.setProperty("margin", "0", "important");
    el.style.setProperty("padding", "0", "important");
  }

  function removeBlur(el) {
    blurred.delete(el);
    el.style.removeProperty("filter");
    el.style.removeProperty("cursor");
    el.style.removeProperty("transition");
    el.style.removeProperty("display");
    el.style.removeProperty("visibility");
  }

  // ── Double-click reveal ─────────────────────────────────────────────────────
  function onDblClick(e) {
    const el = e.currentTarget;
    if (!el.matches(SELECTOR)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    
    // Prevent revealing if site is blocked/blacklisted
    if (currentSettings.isBlacklisted || currentSettings.grade <= 3) {
      console.log('[CF] Cannot reveal - site is blocked/blacklisted');
      return;
    }

    if (revealed.has(el)) {
      // Already revealed, hide it again
      revealed.delete(el);
      applyBlur(el);
    } else {
      // Reveal - remove blur
      revealed.add(el);
      el.style.setProperty("filter", "none", "important");
      el.style.setProperty("cursor", "pointer", "important");
      el.style.setProperty("visibility", "visible", "important");
    }
  }

  // ── Sweep: reinforce blur on all unrevealed elements ───────────────────────
  function processAll() {
    if (document.documentElement.hasAttribute(OFF_ATTR)) return;
    
    // For grade 1-3 and blacklist, CSS handles blocking - just enforce it
    if (currentSettings.isBlacklisted || currentSettings.grade <= 3) {
      return;
    }

    // For grade 4+, apply blur via CSS, JS just helps with cleanup
    collectAll(document).forEach(el => {
      if (!revealed.has(el)) {
        applyBlur(el);
      }
    });

    checkForUnblurredMedia();
  }

  // ── Safety check: ensure no image is visible without blur ─────────────────
  function checkForUnblurredMedia() {
    if (document.documentElement.hasAttribute(OFF_ATTR)) return;

    collectAll(document).forEach(el => {
      if (revealed.has(el)) return; // Skip revealed elements
      
      const computedStyle = window.getComputedStyle(el);
      const hasBlur = computedStyle.filter && computedStyle.filter !== 'none';
      const isVisible = computedStyle.visibility !== 'hidden' && computedStyle.display !== 'none';

      // If visible but no blur, force blur
      if (isVisible && !hasBlur && !blurred.has(el)) {
        applyBlur(el);
      }

      // If should be hidden (grade 1-3) but is visible, hide it
      if (currentSettings.isBlacklisted || currentSettings.grade <= 3) {
        if (computedStyle.display !== 'none' || computedStyle.visibility !== 'hidden') {
          applyBlockStyle(el);
        }
      }
    });
  }

  // ── Enable / disable ────────────────────────────────────────────────────────
  let observer = null;
  let interval = null;

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
    
    // Debug log
    console.log('Content Filter - Applied grade:', {
      grade: currentSettings.grade,
      blacklisted: currentSettings.isBlacklisted,
      whitelisted: currentSettings.isWhitelisted,
      enabled: currentSettings.enabled
    });
  }

  function enable() {
    if (!currentSettings.enabled) return;
    document.documentElement.removeAttribute(OFF_ATTR);
    applyGradeToPage();
    
    if (!observer) {
      observer = new MutationObserver((mutations) => {
        // Reapply on major DOM changes
        applyGradeToPage();
        processAll();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
    // Balanced sweep every 250ms - fast enough to catch dynamic content, slow enough for stability
    if (!interval) interval = setInterval(() => {
      applyGradeToPage();
      processAll();
    }, 250);
    
    // Additional aggressive sweeps for MSN-like sites where content loads after page init
    setTimeout(() => { applyGradeToPage(); processAll(); }, 50);
    setTimeout(() => { applyGradeToPage(); processAll(); }, 150);
    setTimeout(() => { applyGradeToPage(); processAll(); }, 300);
    setTimeout(() => { applyGradeToPage(); processAll(); }, 700);
    setTimeout(() => { applyGradeToPage(); processAll(); }, 1500);
  }

  function disable() {
    document.documentElement.setAttribute(OFF_ATTR, "1");
    document.documentElement.removeAttribute(GRADE_ATTR);
    if (observer) { observer.disconnect(); observer = null; }
    clearInterval(interval); interval = null;
    collectAll(document).forEach(removeBlur);
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
      if (findings.mediaCount > 50 || findings.adCount > 20) return 4;
      if (findings.mediaCount > 30 || findings.adCount > 15) return 4;
      if (findings.hasFinanceKeywords) return 5;
      if (findings.hasMedicalKeywords) return 5;
      if (findings.hasEducationKeywords) return (findings.mediaCount > 20) ? 6 : 7;
      if (findings.hasTechKeywords) return (findings.mediaCount > 15) ? 7 : 8;
      if (findings.hasNewsKeywords) return (findings.mediaCount > 25) ? 8 : 9;
      if (findings.mediaCount > 50) return 4;
      if (findings.mediaCount > 30) return 5;
      if (findings.mediaCount > 15) return 6;
      if (findings.mediaCount > 5) return 7;
      if (findings.textLength > 2000 && findings.mediaCount < 3) return 10;
      if (findings.textLength > 1000 && findings.mediaCount < 5) return 9;
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
      applyGradeToPage();
      processAll();
      console.log('[CF] Grade updated to:', request.grade);
      sendResponse({ success: true });
    }
    
    if (request.action === 'toggleWhitelist') {
      currentSettings.isWhitelisted = request.whitelisted;
      currentSettings.isBlacklisted = false;
      applyGradeToPage();
      processAll();
      console.log('[CF] Whitelist toggled:', request.whitelisted);
      sendResponse({ success: true });
    }
    
    if (request.action === 'toggleBlacklist') {
      currentSettings.isBlacklisted = request.blacklisted;
      currentSettings.isWhitelisted = false;
      applyGradeToPage();
      processAll();
      console.log('[CF] Blacklist toggled:', request.blacklisted);
      sendResponse({ success: true });
    }
    
    if (request.action === 'refresh') {
      // Refresh filter settings
      initializeFilter();
      sendResponse({ success: true });
    }
  });

  // ── Initialize on load ─────────────────────────────────────────────────────
  function initializeFilter() {
    const domain = getDomain(window.location.href);
    
    console.log('[CF] Initializing for domain:', domain);

    chrome.storage.local.get(['enabled', 'siteGrades', 'whitelist', 'blacklist'], (result) => {
      const enabled = result.enabled !== false;
      const siteGrades = result.siteGrades || {};
      const whitelist = (result.whitelist || []).map(d => d.toLowerCase());
      const blacklist = (result.blacklist || []).map(d => d.toLowerCase());
      const domainLower = domain.toLowerCase();

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

      // Wait for DOM to be ready
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
  });

  // Initialize on document start
  initializeFilter();
})();
