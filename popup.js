const statusEl = document.getElementById("status");
const toggleBtn = document.getElementById("toggle");

chrome.storage.local.get({ enabled: true }, ({ enabled }) => {
  updateUI(enabled);
});

toggleBtn.addEventListener("click", () => {
  chrome.storage.local.get({ enabled: true }, ({ enabled }) => {
    const next = !enabled;
    chrome.storage.local.set({ enabled: next }, () => {
      updateUI(next);
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) chrome.tabs.reload(tabs[0].id);
      });
    });
  });
});

function updateUI(enabled) {
  statusEl.textContent = "Status: " + (enabled ? "ON" : "OFF");
  statusEl.style.color = enabled ? "#c0392b" : "#27ae60";
}
