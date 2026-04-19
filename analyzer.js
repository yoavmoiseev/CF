/**
 * Content Analyzer — Determines site grade 1-10 based on page content
 * 
 * Grade System:
 * 1-3: Adult/violence/dangerous (always blocked)
 * 4-6: E-commerce/finance/medical (blurred)
 * 7-9: General education/content (light blur)
 * 10: Text-only (no blur)
 */

const Analyzer = {
  /**
   * Analyze the current page and return a grade 1-10
   * Also returns breakdown of findings for user feedback
   */
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

    // 1. Count media elements
    const mediaElements = this.collectAllMedia(document);
    findings.mediaCount = mediaElements.length;

    // 2. Count ads (heuristics)
    findings.adCount = this.countAds();

    // 3. Count pop-ups
    findings.popupCount = this.countPopups();

    // 4. Count background images
    findings.backgroundImages = this.countBackgroundImages();

    // 5. Count iframes (often ads, tracking)
    findings.iframeCount = document.querySelectorAll('iframe').length;

    // 6. Extract text content and metadata
    const textContent = document.body.innerText.toLowerCase();
    findings.textLength = textContent.length;

    // 7. Check for adult/violence/dangerous keywords
    const adultKeywords = ['porn', 'sex', 'xxx', 'adult', 'nude', 'naked', 'escort'];
    const violenceKeywords = ['kill', 'murder', 'terrorist', 'bomb', 'weapon'];
    const dangerousKeywords = ['drugs', 'cocaine', 'heroin'];

    findings.adultKeywords = adultKeywords.filter(kw => textContent.includes(kw));
    findings.hasAdultIndicators = findings.adultKeywords.length > 0;
    findings.hasViolenceIndicators = violenceKeywords.some(kw => textContent.includes(kw));

    // 8. Check for category keywords
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

    // 9. Check meta tags
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

    // 10. Calculate grade based on findings
    const grade = this.calculateGrade(findings);

    return {
      grade,
      findings,
      datetime: new Date().toISOString(),
      url: window.location.href,
    };
  },

  /**
   * Collect all media elements from main DOM + shadow roots
   */
  collectAllMedia: function(root) {
    const SELECTOR = 'img, video';
    const found = Array.from(root.querySelectorAll(SELECTOR));
    
    root.querySelectorAll("*").forEach(el => {
      if (el.shadowRoot) {
        found.push(...this.collectAllMedia(el.shadowRoot));
      }
    });
    
    return found;
  },

  /**
   * Count ad-related elements (heuristics)
   */
  countAds: function() {
    let count = 0;
    
    // Common ad container classes/IDs
    const adSelectors = [
      '[class*="ad"]',
      '[id*="ad"]',
      '[class*="banner"]',
      '[class*="advertisement"]',
      'ins[class*="adsbygoogle"]',
      '.advert',
      '#advert',
    ];

    adSelectors.forEach(selector => {
      try {
        count += document.querySelectorAll(selector).length;
      } catch (e) {}
    });

    return count;
  },

  /**
   * Count pop-ups (overlays, modals)
   */
  countPopups: function() {
    let count = 0;
    const popupSelectors = [
      '[role="dialog"]',
      '.modal',
      '.popup',
      '.overlay',
      '[class*="modal"]',
      '[class*="popup"]',
    ];

    popupSelectors.forEach(selector => {
      try {
        const els = document.querySelectorAll(selector);
        els.forEach(el => {
          const style = window.getComputedStyle(el);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            count++;
          }
        });
      } catch (e) {}
    });

    return count;
  },

  /**
   * Count elements with background images
   */
  countBackgroundImages: function() {
    let count = 0;
    
    const allElements = document.querySelectorAll('*');
    allElements.forEach(el => {
      const bgImage = window.getComputedStyle(el).backgroundImage;
      if (bgImage && bgImage !== 'none') {
        count++;
      }
    });

    return count;
  },

  /**
   * Calculate grade 1-10 based on findings
   * Grade system:
   * 1-3: Adult / violence / dangerous (always blocked)
   * 4:   News, video sites, high media count
   * 5:   Finance, Medical, E-commerce
   * 6:   Educational content
   * 7:   Technical / Programming
   * 8:   Religious content with media/video
   * 9:   Religious content, low media
   * 10:  Jewish religious text-only
   */
  calculateGrade: function(findings) {
    // 1-3: Adult content, violence, dangerous
    if (findings.hasAdultIndicators) return 1;
    if (findings.hasViolenceIndicators) return 2;
    if (findings.adultKeywords.length > 3) return 2;

    // 4: News sites, video sites, high media
    if (findings.hasNewsKeywords && findings.mediaCount > 5) return 4;
    if (findings.mediaCount > 40 || findings.adCount > 15) return 4;

    // 5: Finance / Medical / E-commerce
    if (findings.hasFinanceKeywords || findings.hasMedicalKeywords) return 5;
    if (findings.mediaCount > 20 && findings.adCount > 5) return 5;

    // 6: Educational content
    if (findings.hasEducationKeywords) return 6;

    // 7: Technical / Programming
    if (findings.hasTechKeywords) return 7;

    // 8-9: Religious / spiritual (checked via keywords below)
    // Default scoring based on media count
    if (findings.mediaCount > 15) return 6;
    if (findings.mediaCount > 5) return 7;

    // Mostly text — assume religious/spiritual
    if (findings.textLength > 2000 && findings.mediaCount < 3) return 10;
    if (findings.textLength > 1000 && findings.mediaCount < 5) return 9;
    if (findings.mediaCount < 8) return 8;

    return 6;
  },

  /**
   * Get blur intensity based on grade
   */
  getBlurIntensity: function(grade) {
    if (grade <= 3) return 'block'; // Full block
    if (grade <= 6) return 'heavy'; // 35px blur + 0.3 brightness
    if (grade <= 9) return 'light'; // 15px blur only
    return 'none'; // No blur
  },

  /**
   * Get human-readable grade description
   */
  getGradeDescription: function(grade) {
    const descriptions = {
      1: 'Adult content (BLOCKED)',
      2: 'Dangerous content (BLOCKED)',
      3: 'Restricted content (BLOCKED)',
      4: 'High media (Sales, shopping)',
      5: 'Finance / Medical',
      6: 'Educational content',
      7: 'Technical / Programming',
      8: 'News / Mixed content',
      9: 'Quality content / Low media',
      10: 'Text-only (No blur)',
    };
    return descriptions[grade] || 'Unknown';
  },
};

// Make globally available for content.js
if (typeof window !== 'undefined') {
  window.Analyzer = Analyzer;
}
