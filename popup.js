const statusEl = document.getElementById("status");
const gradeEl = document.getElementById("grade");
const gradeDescriptionEl = document.getElementById("gradeDescription");
const findingsEl = document.getElementById("findings");
const toggleBtn = document.getElementById("toggle");
const analyzeBtn = document.getElementById("analyze");
const feedbackBtn = document.getElementById("feedback");
const gradeSlider = document.getElementById("gradeSlider");
const gradeValue = document.getElementById("gradeValue");
const whitelistBtn = document.getElementById("whitelist");
const blacklistBtn = document.getElementById("blacklist");
const adsBlockedCheck = document.getElementById("adsBlockedCheck");
const popupsBlockedCheck = document.getElementById("popupsBlockedCheck");

// ── i18n ─────────────────────────────────────────────────────────────────────
const STRINGS = {
  he: {
    title: 'סינון תוכן',
    toggle: 'הפעל / כבה',
    analyze: 'נתח דף',
    feedback: 'משוב',
    gradeOverride: 'עקוף דירוג (1-10):',
    blockAds: '🚫 חסום פרסומות',
    blockPopups: '🚫 חסום חלונות',
    whitelist: '✓ רשימה לבנה',
    blacklist: '✗ רשימה שחורה',
    feedbackTitle: 'שלח משוב',
    feedbackDesc: 'עזור לשפר את מערכת הדירוג. מה לא נכון בדירוג הנוכחי?',
    feedbackPlaceholder: 'האתר הזה הוא...',
    submit: 'שלח',
    cancel: 'בטל',
    statusOn: 'סטטוס: פעיל',
    statusOff: 'סטטוס: כבוי',
    grade: 'דירוג',
  },
  ru: {
    title: 'Фильтр контента',
    toggle: 'Вкл / Выкл',
    analyze: 'Анализ страницы',
    feedback: 'Обратная связь',
    gradeOverride: 'Изменить оценку (1-10):',
    blockAds: '🚫 Блокировать рекламу',
    blockPopups: '🚫 Блокировать попапы',
    whitelist: '✓ Белый список',
    blacklist: '✗ Чёрный список',
    feedbackTitle: 'Отправить отзыв',
    feedbackDesc: 'Помогите улучшить систему оценки. Что не так с текущей оценкой?',
    feedbackPlaceholder: 'Этот сайт на самом деле...',
    submit: 'Отправить',
    cancel: 'Отмена',
    statusOn: 'Статус: ВКЛ',
    statusOff: 'Статус: ВЫКЛ',
    grade: 'Оценка',
  },
  en: {
    title: 'Content Filter',
    toggle: 'Toggle Filter',
    analyze: 'Analyze Page',
    feedback: 'Give Feedback',
    gradeOverride: 'Override Grade (1-10):',
    blockAds: '🚫 Block Ads',
    blockPopups: '🚫 Block Pop-ups',
    whitelist: '✓ Whitelist',
    blacklist: '✗ Blacklist',
    feedbackTitle: 'Send Feedback',
    feedbackDesc: 'Help improve the grading system. What\'s wrong with the current grade?',
    feedbackPlaceholder: 'This site is actually...',
    submit: 'Submit',
    cancel: 'Cancel',
    statusOn: 'Status: ON',
    statusOff: 'Status: OFF',
    grade: 'Grade',
  },
};

let currentLang = 'he';

function applyLanguage(lang) {
  currentLang = lang;
  const s = STRINGS[lang];
  const rtl = lang === 'he';
  document.body.style.direction = rtl ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (s[key]) el.textContent = s[key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (s[key]) el.placeholder = s[key];
  });
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
  chrome.storage.local.set({ uiLang: lang });
  // Re-render status text
  updateUI();
}

document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => applyLanguage(btn.dataset.lang));
});

// Load saved language (default: he)
chrome.storage.local.get({ uiLang: 'he' }, ({ uiLang }) => {
  applyLanguage(uiLang);
});

const modal = document.getElementById("feedbackModal");
const submitFeedbackBtn = document.getElementById("submitFeedback");
const cancelFeedbackBtn = document.getElementById("cancelFeedback");
const feedbackText = document.getElementById("feedbackText");

let currentDomain = '';
let currentGrade = 6;
let currentAnalysis = null;

// Get current tab and domain
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]?.url) {
    currentDomain = getDomain(tabs[0].url);
    updateUI();
  }
});

function getDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    return '';
  }
}

function updateUI() {
  chrome.storage.local.get(['enabled', 'siteGrades', 'whitelist', 'blacklist', 'adsBlocked', 'popupsBlocked'], (result) => {
    const enabled = result.enabled !== false;
    const siteGrades = result.siteGrades || {};
    const whitelist = result.whitelist || [];
    const blacklist = result.blacklist || [];
    const adsBlocked = result.adsBlocked !== false;
    const popupsBlocked = result.popupsBlocked !== false;

    const s = STRINGS[currentLang];

    // Update status
    statusEl.textContent = enabled ? s.statusOn : s.statusOff;
    statusEl.style.color = enabled ? '#10b981' : '#ef4444';

    // Update blocker checkboxes
    adsBlockedCheck.checked = adsBlocked;
    popupsBlockedCheck.checked = popupsBlocked;

    // Get grade and description
    let grade = 6;
    if (siteGrades[currentDomain]) {
      grade = siteGrades[currentDomain].userGrade || siteGrades[currentDomain].autoGrade || 6;
    }
    currentGrade = grade;
    gradeSlider.value = grade;
    gradeValue.textContent = grade;

    gradeEl.textContent = `${s.grade}: ${grade}/10`;
    gradeDescriptionEl.textContent = getGradeDescription(grade);

    // Update whitelist/blacklist buttons
    if (whitelist.includes(currentDomain)) {
      whitelistBtn.textContent = s.whitelist.replace('✓', '✓ ✓').replace('✓ ✓', '✓');
      whitelistBtn.textContent = '✓ ' + s.whitelist.replace(/^✓\s*/, '').toUpperCase();
      whitelistBtn.style.opacity = '1';
      whitelistBtn.style.fontWeight = 'bold';
      whitelistBtn.style.backgroundColor = '#22c55e';
      whitelistBtn.style.color = 'white';
      whitelistBtn.style.borderColor = '#16a34a';
      whitelistBtn.style.boxShadow = '0 0 8px rgba(34, 197, 94, 0.4)';
    } else {
      whitelistBtn.textContent = s.whitelist;
      whitelistBtn.style.opacity = '1';
      whitelistBtn.style.fontWeight = 'normal';
      whitelistBtn.style.backgroundColor = '#dcfce7';
      whitelistBtn.style.color = '#15803d';
      whitelistBtn.style.borderColor = '#86efac';
      whitelistBtn.style.boxShadow = 'none';
    }

    if (blacklist.includes(currentDomain)) {
      blacklistBtn.textContent = '✗ ' + s.blacklist.replace(/^✗\s*/, '').toUpperCase();
      blacklistBtn.style.opacity = "1";
      blacklistBtn.style.fontWeight = "bold";
      blacklistBtn.style.backgroundColor = "#ef4444";
      blacklistBtn.style.color = "white";
      blacklistBtn.style.borderColor = "#dc2626";
      blacklistBtn.style.boxShadow = "0 0 8px rgba(239, 68, 68, 0.4)";
    } else {
      blacklistBtn.textContent = s.blacklist;
      blacklistBtn.style.opacity = "1";
      blacklistBtn.style.fontWeight = "normal";
      blacklistBtn.style.backgroundColor = "#fee2e2";
      blacklistBtn.style.color = "#991b1b";
      blacklistBtn.style.borderColor = "#fca5a5";
      blacklistBtn.style.boxShadow = "none";
    }
  });
}

function getGradeDescription(grade) {
  const descriptions = {
    1: '🔴 Adult content (BLOCKED)',
    2: '🔴 Dangerous content (BLOCKED)',
    3: '🔴 Restricted content (BLOCKED)',
    4: '🟠 News / Video / High media',
    5: '🟡 Finance / Medical / Shopping',
    6: '🟡 Educational content',
    7: '🟢 Technical / Programming',
    8: '🟢 Religious with media',
    9: '🟢 Religious, low media',
    10: '📚 Jewish text-only (No blur)',
  };
  return descriptions[grade] || 'Unknown';
}

// Toggle filter on/off
toggleBtn.addEventListener("click", () => {
  chrome.storage.local.get({ enabled: true }, ({ enabled }) => {
    const next = !enabled;
    chrome.storage.local.set({ enabled: next }, () => {
      // Immediately send message to content script to disable/enable
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          if (!next) {
            // Disabling - send explicit OFF command, NO reload
            chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleOff' }).catch(() => {
              // If messaging fails, still don't reload - just show disabled
            });
          } else {
            // Enabling - send refresh command then reload
            chrome.tabs.sendMessage(tabs[0].id, { action: 'refresh' }).catch(() => {
              chrome.tabs.reload(tabs[0].id);
            });
            reloadTab();
          }
        }
      });
      updateUI();
    });
  });
});

// Analyze page
analyzeBtn.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      // Execute analyzer in content script
      chrome.tabs.sendMessage(tabs[0].id, { action: 'analyze' }, (response) => {
        if (response && response.analysis) {
          currentAnalysis = response.analysis;
          displayAnalysis(response.analysis);
          
          // Save the grade
          const domain = getDomain(tabs[0].url);
          const grade = response.analysis.grade;
          // StorageManager.setSiteGrade(domain, grade, grade, '', response.analysisFindings);
          
          // For now, just show findings
          displayFindings(response.analysis.findings);
        }
      });
    }
  });
});

// Grade slider
gradeSlider.addEventListener("input", (e) => {
  const newGrade = parseInt(e.target.value);
  gradeValue.textContent = newGrade;
  gradeDescriptionEl.textContent = getGradeDescription(newGrade);

  // Save to storage
  chrome.storage.local.get(['siteGrades'], (result) => {
    const siteGrades = result.siteGrades || {};
    
    if (!siteGrades[currentDomain]) {
      siteGrades[currentDomain] = {
        autoGrade: 6,
        userGrade: newGrade,
        feedback: '',
        teachingExamples: null,
        lastSaved: new Date().toISOString(),
      };
    } else {
      siteGrades[currentDomain].userGrade = newGrade;
      siteGrades[currentDomain].lastSaved = new Date().toISOString();
    }

    chrome.storage.local.set({ siteGrades }, () => {
      console.log('[Popup] Grade changed to:', newGrade);
      // Notify content script of the change
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'updateGrade',
            grade: newGrade
          }).catch(() => {
            // Tab may not have content script, just reload
            chrome.tabs.reload(tabs[0].id);
          });
        }
      });
    });
  });
});

// Feedback modal
feedbackBtn.addEventListener("click", () => {
  modal.classList.add("show");
  feedbackText.value = '';
  feedbackText.focus();
});

cancelFeedbackBtn.addEventListener("click", () => {
  modal.classList.remove("show");
});

submitFeedbackBtn.addEventListener("click", () => {
  const feedback = feedbackText.value.trim();
  if (!feedback) return;

  chrome.storage.local.get(['siteGrades'], (result) => {
    const siteGrades = result.siteGrades || {};
    
    if (!siteGrades[currentDomain]) {
      siteGrades[currentDomain] = {
        autoGrade: 6,
        userGrade: currentGrade,
        feedback: feedback,
        teachingExamples: currentAnalysis?.findings || null,
        lastSaved: new Date().toISOString(),
      };
    } else {
      siteGrades[currentDomain].feedback = feedback;
      if (currentAnalysis?.findings) {
        if (!siteGrades[currentDomain].teachingExamples) {
          siteGrades[currentDomain].teachingExamples = [];
        }
        if (Array.isArray(siteGrades[currentDomain].teachingExamples)) {
          siteGrades[currentDomain].teachingExamples.push(currentAnalysis.findings);
        }
      }
      siteGrades[currentDomain].lastSaved = new Date().toISOString();
    }

    chrome.storage.local.set({ siteGrades }, () => {
      modal.classList.remove("show");
      alert("Feedback saved! Thank you for helping improve the grading system.");
    });
  });
});

// Whitelist
whitelistBtn.addEventListener("click", () => {
  chrome.storage.local.get(['whitelist', 'blacklist'], (result) => {
    let whitelist = result.whitelist || [];
    let blacklist = result.blacklist || [];
    const isCurrentlyWhitelisted = whitelist.includes(currentDomain);

    if (isCurrentlyWhitelisted) {
      whitelist = whitelist.filter(d => d !== currentDomain);
    } else {
      whitelist.push(currentDomain);
      blacklist = blacklist.filter(d => d !== currentDomain); // Remove from blacklist
    }

    chrome.storage.local.set({ whitelist, blacklist }, () => {
      console.log('[Popup] Whitelist toggled:', !isCurrentlyWhitelisted);
      // Notify content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'toggleWhitelist',
            whitelisted: !isCurrentlyWhitelisted
          }).catch(() => {
            chrome.tabs.reload(tabs[0].id);
          });
        }
      });
      updateUI();
    });
  });
});

// Blacklist
blacklistBtn.addEventListener("click", () => {
  chrome.storage.local.get(['whitelist', 'blacklist'], (result) => {
    let whitelist = result.whitelist || [];
    let blacklist = result.blacklist || [];
    const isCurrentlyBlacklisted = blacklist.includes(currentDomain);

    if (isCurrentlyBlacklisted) {
      blacklist = blacklist.filter(d => d !== currentDomain);
    } else {
      blacklist.push(currentDomain);
      whitelist = whitelist.filter(d => d !== currentDomain); // Remove from whitelist
    }

    chrome.storage.local.set({ whitelist, blacklist }, () => {
      console.log('[Popup] Blacklist toggled:', !isCurrentlyBlacklisted);
      // Notify content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'toggleBlacklist',
            blacklisted: !isCurrentlyBlacklisted
          }).catch(() => {
            chrome.tabs.reload(tabs[0].id);
          });
        }
      });
      updateUI();
    });
  });
});

function reloadTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) chrome.tabs.reload(tabs[0].id);
  });
}

function displayFindings(findings) {
  if (!findings) return;

  const html = `
    <div><strong>📊 Media:</strong> ${findings.mediaCount} images/videos</div>
    <div><strong>📢 Ads:</strong> ${findings.adCount} detected</div>
    <div><strong>🔔 Pop-ups:</strong> ${findings.popupCount}</div>
    <div><strong>🖼️ BG Images:</strong> ${findings.backgroundImages}</div>
    <div><strong>📐 Iframes:</strong> ${findings.iframeCount}</div>
    <div><strong>📄 Text:</strong> ${Math.round(findings.textLength / 100)} words</div>
    ${findings.hasAdultIndicators ? '<div style="color: #dc2626;">⚠️ <strong>Adult indicators detected</strong></div>' : ''}
    ${findings.hasViolenceIndicators ? '<div style="color: #dc2626;">⚠️ <strong>Violence indicators detected</strong></div>' : ''}
    ${findings.hasMedicalKeywords ? '<div>🏥 Medical/Health content</div>' : ''}
    ${findings.hasFinanceKeywords ? '<div>💰 Finance/Banking content</div>' : ''}
    ${findings.hasEducationKeywords ? '<div>📚 Educational content</div>' : ''}
    ${findings.hasTechKeywords ? '<div>💻 Tech/Programming content</div>' : ''}
    ${findings.hasNewsKeywords ? '<div>📰 News/Article content</div>' : ''}
  `;

  findingsEl.innerHTML = html;
}

function displayAnalysis(analysis) {
  if (!analysis) return;
  gradeEl.textContent = `Grade: ${analysis.grade}/10 (Auto)`;
  gradeDescriptionEl.textContent = getGradeDescription(analysis.grade);
}

// Listen to storage changes from other tabs
chrome.storage.onChanged.addListener(() => {
  updateUI();
});

// Ad Blocker checkbox
adsBlockedCheck.addEventListener('change', () => {
  const val = adsBlockedCheck.checked;
  chrome.storage.local.set({ adsBlocked: val }, () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleAds', adsBlocked: val }).catch(() => {});
      }
    });
  });
});

// Popup Blocker checkbox
popupsBlockedCheck.addEventListener('change', () => {
  const val = popupsBlockedCheck.checked;
  chrome.storage.local.set({ popupsBlocked: val }, () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'togglePopups', popupsBlocked: val }).catch(() => {});
      }
    });
  });
});
