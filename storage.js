/**
 * Storage Manager — Handles site grades, user feedback, whitelist/blacklist
 */

const StorageManager = {
  /**
   * Get or create a default storage structure
   */
  getDefaults: function() {
    return {
      enabled: true,
      siteGrades: {}, // domain -> { grade, userGrade, feedback, teachingExamples }
      whitelist: [],  // domains always unblurred
      blacklist: [],  // domains always blocked
      adBlockEnabled: true,
      popupBlockerEnabled: true,
      autoAnalyze: true, // Auto-analyze on page load
    };
  },

  /**
   * Initialize storage if not exists
   */
  init: function(callback) {
    chrome.storage.local.get(null, (data) => {
      if (Object.keys(data).length === 0) {
        // First run
        chrome.storage.local.set(this.getDefaults(), () => {
          if (callback) callback(this.getDefaults());
        });
      } else {
        if (callback) callback(data);
      }
    });
  },

  /**
   * Get current settings
   */
  getSettings: function(callback) {
    chrome.storage.local.get(null, callback);
  },

  /**
   * Save a page analysis result with optional user override
   */
  setSiteGrade: function(domain, autoGrade, userGrade = null, feedback = '', teachingExamples = null, callback) {
    chrome.storage.local.get(['siteGrades'], (result) => {
      const siteGrades = result.siteGrades || {};
      
      siteGrades[domain] = {
        autoGrade,
        userGrade: userGrade || autoGrade, // User override
        feedback,
        teachingExamples: teachingExamples || null,
        lastSaved: new Date().toISOString(),
      };

      chrome.storage.local.set({ siteGrades }, () => {
        if (callback) callback(siteGrades[domain]);
      });
    });
  },

  /**
   * Get saved grade for a domain
   */
  getSiteGrade: function(domain, callback) {
    chrome.storage.local.get(['siteGrades'], (result) => {
      const siteGrades = result.siteGrades || {};
      const grade = siteGrades[domain] || null;
      if (callback) callback(grade);
    });
  },

  /**
   * Add domain to whitelist (never blur)
   */
  addToWhitelist: function(domain, callback) {
    chrome.storage.local.get(['whitelist'], (result) => {
      const whitelist = result.whitelist || [];
      if (!whitelist.includes(domain)) {
        whitelist.push(domain);
        chrome.storage.local.set({ whitelist }, () => {
          if (callback) callback(whitelist);
        });
      }
    });
  },

  /**
   * Add domain to blacklist (always block)
   */
  addToBlacklist: function(domain, callback) {
    chrome.storage.local.get(['blacklist'], (result) => {
      const blacklist = result.blacklist || [];
      if (!blacklist.includes(domain)) {
        blacklist.push(domain);
        chrome.storage.local.set({ blacklist }, () => {
          if (callback) callback(blacklist);
        });
      }
    });
  },

  /**
   * Remove from whitelist
   */
  removeFromWhitelist: function(domain, callback) {
    chrome.storage.local.get(['whitelist'], (result) => {
      let whitelist = result.whitelist || [];
      whitelist = whitelist.filter(d => d !== domain);
      chrome.storage.local.set({ whitelist }, () => {
        if (callback) callback(whitelist);
      });
    });
  },

  /**
   * Remove from blacklist
   */
  removeFromBlacklist: function(domain, callback) {
    chrome.storage.local.get(['blacklist'], (result) => {
      let blacklist = result.blacklist || [];
      blacklist = blacklist.filter(d => d !== domain);
      chrome.storage.local.set({ blacklist }, () => {
        if (callback) callback(blacklist);
      });
    });
  },

  /**
   * Check if domain is whitelisted
   */
  isWhitelisted: function(domain, callback) {
    chrome.storage.local.get(['whitelist'], (result) => {
      const whitelist = result.whitelist || [];
      if (callback) callback(whitelist.includes(domain));
    });
  },

  /**
   * Check if domain is blacklisted
   */
  isBlacklisted: function(domain, callback) {
    chrome.storage.local.get(['blacklist'], (result) => {
      const blacklist = result.blacklist || [];
      if (callback) callback(blacklist.includes(domain));
    });
  },

  /**
   * Extract domain from full URL
   */
  getDomain: function(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      return '';
    }
  },

  /**
   * Get all saved grades (for analytics)
   */
  getAllGrades: function(callback) {
    chrome.storage.local.get(['siteGrades'], (result) => {
      const siteGrades = result.siteGrades || {};
      if (callback) callback(siteGrades);
    });
  },

  /**
   * Record teaching example (for machine learning / pattern recognition)
   */
  recordTeachingExample: function(domain, autoGrade, userGrade, pageAnalysis, callback) {
    chrome.storage.local.get(['siteGrades'], (result) => {
      const siteGrades = result.siteGrades || {};
      
      if (!siteGrades[domain]) {
        siteGrades[domain] = {
          autoGrade,
          userGrade,
          feedback: '',
          teachingExamples: [],
          lastSaved: new Date().toISOString(),
        };
      }

      if (!siteGrades[domain].teachingExamples) {
        siteGrades[domain].teachingExamples = [];
      }

      siteGrades[domain].teachingExamples.push({
        timestamp: new Date().toISOString(),
        autoGrade,
        userGrade,
        pageAnalysis, // media count, ad count, keywords, etc.
      });

      chrome.storage.local.set({ siteGrades }, () => {
        if (callback) callback(siteGrades[domain]);
      });
    });
  },

  /**
   * Toggle extension on/off
   */
  setEnabled: function(enabled, callback) {
    chrome.storage.local.set({ enabled }, () => {
      if (callback) callback(enabled);
    });
  },

  /**
   * Toggle ad blocker
   */
  setAdBlockEnabled: function(enabled, callback) {
    chrome.storage.local.set({ adBlockEnabled: enabled }, () => {
      if (callback) callback(enabled);
    });
  },

  /**
   * Toggle popup blocker
   */
  setPopupBlockerEnabled: function(enabled, callback) {
    chrome.storage.local.set({ popupBlockerEnabled: enabled }, () => {
      if (callback) callback(enabled);
    });
  },

  /**
   * Set auto-analyze
   */
  setAutoAnalyze: function(enabled, callback) {
    chrome.storage.local.set({ autoAnalyze: enabled }, () => {
      if (callback) callback(enabled);
    });
  },
};

// Make globally available for other scripts
if (typeof window !== 'undefined') {
  window.StorageManager = StorageManager;
}
