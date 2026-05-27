"use strict";

const urlInput = document.getElementById("dashboardUrl");
const keyInput = document.getElementById("apiKey");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");

// Load saved settings
chrome.storage.sync.get(["dashboardUrl", "apiKey"], (result) => {
  if (result.dashboardUrl) urlInput.value = result.dashboardUrl;
  if (result.apiKey) keyInput.value = result.apiKey;
});

saveBtn.addEventListener("click", () => {
  const dashboardUrl = urlInput.value.trim().replace(/\/$/, "");
  const apiKey = keyInput.value.trim();

  // Basic validation
  if (!dashboardUrl) {
    showStatus("נא להזין כתובת דאשבורד", "error");
    return;
  }
  if (!dashboardUrl.startsWith("http")) {
    showStatus("הכתובת חייבת להתחיל ב-http:// או https://", "error");
    return;
  }
  if (!apiKey) {
    showStatus("נא להזין מפתח API", "error");
    return;
  }

  chrome.storage.sync.set({ dashboardUrl, apiKey }, () => {
    if (chrome.runtime.lastError) {
      showStatus("שגיאה בשמירה: " + chrome.runtime.lastError.message, "error");
    } else {
      showStatus("ההגדרות נשמרו בהצלחה ✓", "success");
    }
  });
});

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = type;
  setTimeout(() => {
    statusEl.className = "";
    statusEl.textContent = "";
  }, 3000);
}
