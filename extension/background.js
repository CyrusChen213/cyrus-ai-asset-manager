chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id || !/^https?:\/\//i.test(tab.url || "")) return;
  panelFollowEnabled = true;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        window.__ASSET_VAULT_PANEL_OPEN_ONLY__ = true;
      },
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content-panel.js"],
    });
  } catch (error) {
    console.warn("素材库面板打开失败", error);
  }
});

const tabVideoRequests = new Map();
const reopenPanelTabs = new Set();
const reopenTimers = new Map();
let panelFollowEnabled = false;

function isPageUrl(url) {
  return /^https?:\/\//i.test(url || "");
}

function rememberVideoRequest(details) {
  if (details.tabId < 0 || !details.url) return;
  if (!/\.(?:m3u8|mp4|webm|mov|m4v|mkv|avi|ogv|3gp|3g2|ts)(?:[?#]|$)|\/videos\//i.test(details.url)) return;
  const current = tabVideoRequests.get(details.tabId) || [];
  const next = [details.url, ...current.filter((url) => url !== details.url)].slice(0, 180);
  tabVideoRequests.set(details.tabId, next);
}

chrome.webRequest.onBeforeRequest.addListener(
  rememberVideoRequest,
  { urls: ["<all_urls>"] }
);

chrome.tabs.onRemoved.addListener((tabId) => {
  tabVideoRequests.delete(tabId);
  reopenPanelTabs.delete(tabId);
  clearReopenTimers(tabId);
});

function clearReopenTimers(tabId) {
  const timers = reopenTimers.get(tabId) || [];
  for (const timer of timers) clearTimeout(timer);
  reopenTimers.delete(tabId);
}

async function openPanel(tabId, { openOnly = false } = {}) {
  try {
    if (openOnly) {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          window.__ASSET_VAULT_PANEL_OPEN_ONLY__ = true;
        },
      });
    }
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content-panel.js"],
    });
  } catch (error) {
    console.warn("绱犳潗搴撻潰鏉挎墦寮€澶辫触", error);
  }
}

async function removePanel(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        document.getElementById("__asset_vault_collector_panel__")?.remove();
      },
    });
  } catch {}
}

async function isPanelOpen(tabId) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => !!document.getElementById("__asset_vault_collector_panel__"),
    });
    return !!result;
  } catch {
    return false;
  }
}

function schedulePanelRestore(tabId, delays = [120, 360, 760, 1300]) {
  clearReopenTimers(tabId);
  const timers = delays.map((delay) =>
    setTimeout(async () => {
      if (!reopenPanelTabs.has(tabId)) return;
      await openPanel(tabId, { openOnly: true });
      if (await isPanelOpen(tabId)) {
        reopenPanelTabs.delete(tabId);
        clearReopenTimers(tabId);
      }
    }, delay)
  );
  reopenTimers.set(tabId, timers);
}

function startPersistentPanelRestore(tabId, durationMs = 8000) {
  reopenPanelTabs.add(tabId);
  clearReopenTimers(tabId);
  const timers = [];
  const startedAt = Date.now();
  const attempt = async () => {
    if (!reopenPanelTabs.has(tabId)) return;
    await openPanel(tabId, { openOnly: true });
    if (await isPanelOpen(tabId)) {
      reopenPanelTabs.delete(tabId);
      clearReopenTimers(tabId);
      return;
    }
    if (Date.now() - startedAt >= durationMs) {
      reopenPanelTabs.delete(tabId);
      clearReopenTimers(tabId);
      return;
    }
    const timer = setTimeout(attempt, 320);
    timers.push(timer);
    reopenTimers.set(tabId, timers);
  };
  for (const delay of [30, 90, 180]) {
    const timer = setTimeout(attempt, delay);
    timers.push(timer);
  }
  reopenTimers.set(tabId, timers);
}

async function openPanelOnActiveTab() {
  if (!panelFollowEnabled) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  if (!tab?.id || !isPageUrl(tab.url)) return;
  await openPanel(tab.id, { openOnly: true });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (panelFollowEnabled && isPageUrl(tab.url)) {
    if (changeInfo.status === "loading") {
      setTimeout(() => openPanel(tabId, { openOnly: true }), 80);
      setTimeout(() => openPanel(tabId, { openOnly: true }), 240);
    }
    if (changeInfo.status === "complete") {
      setTimeout(() => openPanel(tabId, { openOnly: true }), 60);
    }
  }
  if (!reopenPanelTabs.has(tabId)) return;
  if (!/^https?:\/\//i.test(tab.url || "")) return;
  if (changeInfo.status === "loading") {
    startPersistentPanelRestore(tabId, 8000);
    return;
  }
  if (changeInfo.status === "complete") {
    startPersistentPanelRestore(tabId, 5000);
  }
});

chrome.tabs.onActivated.addListener(() => {
  setTimeout(openPanelOnActiveTab, 120);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "get-video-requests") {
    const tabId = message.tabId ?? sender.tab?.id;
    sendResponse({ urls: tabVideoRequests.get(tabId) || [] });
    return true;
  }
  if (message?.type === "clear-video-requests") {
    const tabId = message.tabId ?? sender.tab?.id;
    if (tabId) tabVideoRequests.set(tabId, []);
    sendResponse({ ok: true });
    return true;
  }
  if (message?.type === "panel-closed") {
    panelFollowEnabled = false;
    reopenPanelTabs.clear();
    for (const tabId of [...reopenTimers.keys()]) clearReopenTimers(tabId);
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs || []) {
        if (tab?.id && isPageUrl(tab.url)) removePanel(tab.id);
      }
    });
    sendResponse({ ok: true });
    return true;
  }
  if (message?.type === "refresh-and-reopen-panel") {
    const tabId = message.tabId ?? sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "missing tabId" });
      return true;
    }
    panelFollowEnabled = true;
    tabVideoRequests.set(tabId, []);
    startPersistentPanelRestore(tabId, 8000);
    chrome.tabs.reload(tabId, {}, () => {
      const error = chrome.runtime.lastError;
      sendResponse(error ? { ok: false, error: error.message } : { ok: true });
    });
    return true;
  }
  return false;
});
