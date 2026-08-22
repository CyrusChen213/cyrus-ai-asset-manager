const state = {
  assets: [],
  selected: new Set(),
  sendStatus: new Map(),
  page: null,
  folders: [{ id: "default", name: "默认文件夹" }],
  hasLibrary: false,
};

const isPanelMode = new URLSearchParams(location.search).get("panel") === "1";
const popupSettingsKey = "assetVaultPopupSettings";
const popupSettings = {
  folderId: "default",
};

const elements = {
  pageTitle: document.querySelector("#pageTitle"),
  scanButton: document.querySelector("#scanButton"),
  summaryText: document.querySelector("#summaryText"),
  selectAll: document.querySelector("#selectAll"),
  notice: document.querySelector("#notice"),
  assetList: document.querySelector("#assetList"),
  sendButton: document.querySelector("#sendButton"),
  copyButton: document.querySelector("#copyButton"),
  folderSelect: document.querySelector("#folderSelect"),
  dragHandle: document.querySelector("#dragHandle"),
  collapseButton: document.querySelector("#collapseButton"),
  closeButton: document.querySelector("#closeButton"),
};

const refreshScanButton = document.createElement("button");
refreshScanButton.id = "refreshScanButton";
refreshScanButton.className = "icon-button";
refreshScanButton.type = "button";
refreshScanButton.title = "刷新网页后重新扫描";
refreshScanButton.textContent = "刷新";
elements.scanButton?.parentElement?.insertBefore(refreshScanButton, elements.scanButton);
elements.refreshScanButton = refreshScanButton;

function formatType(type) {
  if (type === "video") return "视频";
  if (type === "animation") return "动图";
  if (type === "background") return "背景图";
  return "图片";
}

function formatSize(asset) {
  if (asset.width && asset.height) return `${asset.width} x ${asset.height}`;
  return "未知尺寸";
}

function extensionFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-z0-9]{2,5})$/i);
    return match ? match[1].toUpperCase() : "未知格式";
  } catch {
    return "未知格式";
  }
}

function assetFormatLabel(asset) {
  const label = extensionFromUrl(primaryDownloadUrl(asset) || asset?.previewUrl || asset?.url || "");
  if (label !== "未知格式") return label;
  if (asset?.type === "video") return "视频";
  if (asset?.type === "animation") return "动图";
  if (asset?.type === "background") return "背景";
  if (asset?.type === "image") return "图片";
  return label;
}

function isBlockedPreviewUrl(url) {
  if (!url || typeof url !== "string") return true;
  const trimmed = url.trim();
  if (/^data:(image|video)\//i.test(trimmed) || trimmed.startsWith("blob:")) return false;
  try {
    const pathname = new URL(trimmed).pathname.toLowerCase();
    return /\.(?:js|mjs|cjs|css|html?|json|map|wasm|woff2?|ttf|otf|eot|txt|xml)$/i.test(pathname);
  } catch {
    return true;
  }
}

function pickPreviewUrl(candidates) {
  return (candidates || []).find((url) => url && !isBlockedPreviewUrl(url)) || "";
}

function isDownloadableVideoUrl(url) {
  return /\.(m3u8|mp4|webm|mov|m4v|mkv|avi|ogv|3gp|3g2|ts)(?:[?#]|$)/i.test(url || "")
    || /^data:video\//i.test(url || "")
    || /^blob:/i.test(url || "");
}

function isVideoUrl(url) {
  return /\.(mp4|webm|mov|m4v|mkv|avi|ogv|3gp|3g2|ts|m3u8)(?:[?#]|$)/i.test(url || "");
}

function showNotice(message) {
  elements.notice.hidden = !message;
  elements.notice.textContent = message || "";
}

function loadPopupSettings() {
  return new Promise((resolve) => {
    if (!chrome.storage?.local) {
      resolve(popupSettings);
      return;
    }
    chrome.storage.local.get(popupSettingsKey, (result) => {
      const saved = result?.[popupSettingsKey] || {};
      if (saved.folderId) popupSettings.folderId = saved.folderId;
      resolve(popupSettings);
    });
  });
}

function savePopupSettings(patch = {}) {
  Object.assign(popupSettings, patch);
  chrome.storage?.local?.set({ [popupSettingsKey]: popupSettings });
}

function selectedFolderId() {
  return elements.folderSelect?.value || popupSettings.folderId || "default";
}

function setAssetStatus(assetId, status) {
  if (!assetId) return;
  if (!status) state.sendStatus.delete(assetId);
  else state.sendStatus.set(assetId, status);
}

function urlsMatch(asset, url) {
  if (!asset || !url) return false;
  const candidates = [asset.url, asset.localUrl, asset.fallbackUrl, asset.previewUrl, asset.poster, ...(asset.candidateUrls || [])].filter(Boolean);
  return candidates.includes(url);
}

function assetByResultUrl(url) {
  return state.assets.find((asset) => urlsMatch(asset, url));
}

function primaryDownloadUrl(asset) {
  if (!asset) return "";
  if (asset.type !== "video") return asset.url || "";
  return uniqueUrls([asset.url, ...(asset.candidateUrls || []), asset.fallbackUrl])
    .find(isDownloadableVideoUrl)
    || asset.url
    || "";
}

function renderFolders() {
  if (!elements.folderSelect) return;
  const current = popupSettings.folderId || elements.folderSelect.value || "default";
  elements.folderSelect.innerHTML = "";
  const folders = state.folders.length ? state.folders : [{ id: "default", name: "默认文件夹" }];
  for (const folder of folders) {
    const option = document.createElement("option");
    option.value = folder.id;
    option.textContent = folder.name || "未命名文件夹";
    elements.folderSelect.append(option);
  }
  const hasCurrentFolder = folders.some((folder) => folder.id === current);
  const nextValue = hasCurrentFolder ? current : "default";
  elements.folderSelect.value = nextValue;
  if (state.hasLibrary) {
    savePopupSettings({ folderId: nextValue });
  } else if (hasCurrentFolder) {
    popupSettings.folderId = nextValue;
  }
}

async function refreshVaultStatus({ quiet = false } = {}) {
  try {
    const response = await fetch("http://127.0.0.1:17321/status", { cache: "no-store" });
    const status = await response.json().catch(() => ({}));
    state.hasLibrary = !!status.hasLibrary;
    if (Array.isArray(status.folders) && status.folders.length) {
      state.folders = status.folders;
    } else {
      state.folders = [{ id: "default", name: "默认文件夹" }];
    }
    renderFolders();
    if (!state.hasLibrary && !quiet) showNotice("桌面素材库还没有设置保存位置，请先打开软件并选择素材库目录。");
    return status;
  } catch {
    state.hasLibrary = false;
    state.folders = [{ id: "default", name: "默认文件夹" }];
    renderFolders();
    if (!quiet) showNotice("没有连接到桌面素材库，请先打开软件后再发送。");
    return { ok: false, hasLibrary: false };
  }
}

function updateSummary() {
  const selectedCount = state.selected.size;
  const total = state.assets.length;
  const typeCounts = state.assets.reduce((acc, asset) => {
    acc[asset.type] = (acc[asset.type] || 0) + 1;
    return acc;
  }, {});
  const parts = [];
  if (typeCounts.image) parts.push(`图片 ${typeCounts.image}`);
  if (typeCounts.animation) parts.push(`动图 ${typeCounts.animation}`);
  if (typeCounts.video) parts.push(`视频 ${typeCounts.video}`);
  if (typeCounts.background) parts.push(`背景图 ${typeCounts.background}`);
  elements.summaryText.textContent = total ? `共 ${total} 个素材，已选 ${selectedCount} 个${parts.length ? ` · ${parts.join(" / ")}` : ""}` : "未发现可收集素材";
  elements.selectAll.checked = total > 0 && selectedCount === total;
  elements.selectAll.indeterminate = selectedCount > 0 && selectedCount < total;
  elements.copyButton.disabled = selectedCount === 0;
  elements.sendButton.disabled = selectedCount === 0;
}

function renderAssets() {
  elements.assetList.innerHTML = "";
  if (!state.assets.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "当前页面暂未扫描到图片、动图或视频素材。可以滚动网页让懒加载内容出现后再扫描。";
    elements.assetList.append(empty);
    updateSummary();
    return;
  }

  const fragment = document.createDocumentFragment();
  const columns = [document.createElement("div"), document.createElement("div")];
  const columnHeights = [0, 0];
  for (const column of columns) column.className = "asset-column";
  for (const asset of state.assets) {
    const card = document.createElement("label");
    const status = state.sendStatus.get(asset.id);
    card.className = `asset-card ${state.selected.has(asset.id) ? "selected" : ""} ${status?.state ? `is-${status.state}` : ""}`;
    card.dataset.assetId = asset.id;

    const thumb = document.createElement("div");
    thumb.className = "thumb";
    if (asset.width && asset.height) {
      thumb.style.aspectRatio = `${asset.width} / ${asset.height}`;
    }
    if (asset.type === "video") {
      const video = document.createElement("video");
      const previewVideoUrl = uniqueUrls([
        asset.localUrl,
        asset.url,
        ...(asset.candidateUrls || []),
      ]).find((url) => /^blob:/i.test(url) || /^data:video\//i.test(url) || (isDownloadableVideoUrl(url) && !/\.m3u8(?:[?#]|$)/i.test(url)));
      if (previewVideoUrl) video.src = previewVideoUrl;
      video.poster = pickPreviewUrl([asset.poster, asset.previewUrl, asset.fallbackUrl]);
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.autoplay = true;
      video.preload = "auto";
      video.addEventListener("loadeddata", () => {
        if (video.videoWidth && video.videoHeight) {
          thumb.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
        }
        video.play().catch(() => {});
      }, { once: true });
      video.addEventListener("error", () => {
        thumb.classList.add("video-preview-failed");
        if (!thumb.querySelector(".preview-hint")) {
          const hint = document.createElement("span");
          hint.className = "preview-hint";
          hint.textContent = "预览失败";
          thumb.append(hint);
        }
      }, { once: true });
      thumb.append(video);
    } else {
      const img = document.createElement("img");
      const previewUrl = pickPreviewUrl([asset.previewUrl, asset.fallbackUrl, asset.url]);
      if (previewUrl) img.src = previewUrl;
      img.loading = "lazy";
      img.addEventListener("load", () => {
        if (!asset.width && !asset.height && img.naturalWidth && img.naturalHeight) {
          thumb.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
        }
      }, { once: true });
      img.alt = asset.alt || asset.title || "网页素材";
      img.addEventListener("error", () => {
        const fallback = pickPreviewUrl([asset.url]);
        if (fallback && img.src !== fallback) img.src = fallback;
      }, { once: true });
      thumb.append(img);
    }
    if (status?.state) {
      const statusMark = document.createElement("span");
      statusMark.className = `thumb-status ${status.state}`;
      statusMark.textContent = status.state === "success" ? "✓" : status.state === "failed" ? "!" : "…";
      statusMark.title = status.state === "success" ? "已成功发送" : status.state === "failed" ? "发送失败" : "正在发送";
      thumb.append(statusMark);
    }

    const meta = document.createElement("div");
    meta.className = "asset-meta";
    const title = document.createElement("strong");
    title.textContent = asset.alt || asset.fileName || asset.host || formatType(asset.type);
    const size = document.createElement("span");
    const downloadUrl = primaryDownloadUrl(asset);
    size.textContent = `${formatSize(asset)} · ${assetFormatLabel(asset)}`;
    const url = document.createElement("small");
    url.textContent = downloadUrl || asset.url;
    meta.append(title, size, url);
    if (status?.state === "failed") {
      const reason = document.createElement("small");
      reason.className = "asset-error";
      reason.textContent = status.reason || "发送失败";
      meta.append(reason);
    }

    const side = document.createElement("div");
    side.className = "asset-side";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "asset-check";
    checkbox.title = "选择素材";
    checkbox.checked = state.selected.has(asset.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) state.selected.add(asset.id);
      else state.selected.delete(asset.id);
      syncSelectionState();
    });
    const type = document.createElement("span");
    type.className = "type-pill";
    type.textContent = assetFormatLabel(asset);
    side.append(checkbox, type);
    if (status?.state === "success") {
      const success = document.createElement("span");
      success.className = "status-pill success";
      success.textContent = "已收集";
      side.append(success);
    }
    if (status?.state === "sending") {
      const sending = document.createElement("span");
      sending.className = "status-pill sending";
      sending.textContent = "发送中";
      side.append(sending);
    }
    if (status?.state === "failed") {
      const failed = document.createElement("span");
      failed.className = "status-pill failed";
      failed.textContent = "收集失败";
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "retry-button";
      retry.textContent = "重试";
      retry.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        retryAsset(asset.id);
      });
      side.append(failed, retry);
    }

    card.append(thumb, meta, side);
    const width = Number(asset.width) || 1;
    const height = Number(asset.height) || 1;
    const estimatedHeight = Math.max(90, Math.min(520, (height / width) * 180));
    const targetColumn = Number.isInteger(asset.columnIndex) ? asset.columnIndex : (columnHeights[0] <= columnHeights[1] ? 0 : 1);
    asset.columnIndex = targetColumn;
    columns[targetColumn].append(card);
    columnHeights[targetColumn] += estimatedHeight + 8;
  }
  fragment.append(...columns);
  elements.assetList.append(fragment);
  updateSummary();
}

function syncSelectionState() {
  for (const card of elements.assetList.querySelectorAll(".asset-card")) {
    const assetId = card.dataset.assetId;
    const selected = state.selected.has(assetId);
    card.classList.toggle("selected", selected);
    const checkbox = card.querySelector(".asset-check");
    if (checkbox) checkbox.checked = selected;
  }
  updateSummary();
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const pageTabs = tabs.filter((tab) => /^https?:\/\//i.test(tab.url || "") && !tab.url.includes(chrome.runtime.id));
  return pageTabs[0] || tabs[0];
}

async function scanPage() {
  showNotice("");
  elements.scanButton.disabled = true;
  elements.scanButton.textContent = "扫描中";
  state.assets = [];
  state.selected = new Set();
  state.sendStatus = new Map();
  elements.assetList.innerHTML = '<div class="empty">正在扫描当前页面素材...</div>';
  updateSummary();
  try {
    const tab = await getActiveTab();
    if (!tab?.id) throw new Error("没有找到当前标签页");
    state.page = { title: tab.title || "", url: tab.url || "" };
    await chrome.runtime.sendMessage({ type: "clear-video-requests", tabId: tab.id }).catch(() => ({}));
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: warmUpLazyAssets,
    }).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 300));
    const videoRequestResult = await chrome.runtime.sendMessage({ type: "get-video-requests", tabId: tab.id }).catch(() => ({}));
    const backgroundVideoUrls = Array.isArray(videoRequestResult?.urls) ? videoRequestResult.urls : [];
    elements.pageTitle.textContent = state.page.title || "当前页面";
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectPageAssets,
      args: [backgroundVideoUrls],
    });
    let scanResult = result;
    state.assets = Array.isArray(scanResult?.assets) ? scanResult.assets : [];
    state.selected = new Set();
    if (scanResult?.blockedNotice) showNotice(scanResult.blockedNotice);
    renderAssets();
  } catch (error) {
    state.assets = [];
    state.selected = new Set();
    renderAssets();
    showNotice(`扫描失败：${error?.message || "当前页面不允许扩展访问"}`);
  } finally {
    elements.scanButton.disabled = false;
    elements.scanButton.textContent = "扫描";
  }
}

function getSelectedAssets() {
  return state.assets.filter((asset) => state.selected.has(asset.id));
}

function createCollectPayload() {
  const selected = getSelectedAssets();
  return createPayloadForAssets(selected);
}

function createPayloadForAssets(assets) {
  savePopupSettings({ folderId: selectedFolderId() });
  return {
    page: state.page,
    collectedAt: new Date().toISOString(),
    folderId: selectedFolderId(),
    assets,
  };
}

function uniqueUrls(urls) {
  return [...new Set((urls || []).filter(Boolean).map((url) => String(url).trim()).filter(Boolean))];
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("读取素材失败"));
    reader.readAsDataURL(blob);
  });
}

function parseBrowserM3u8(text, playlistUrl) {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const variants = [];
  const segments = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith("#EXT-X-KEY")) throw new Error("视频流已加密，暂不支持直接合并");
    if (line.startsWith("#EXT-X-STREAM-INF")) {
      const next = lines[index + 1];
      if (next && !next.startsWith("#")) variants.push(new URL(next, playlistUrl).href);
    } else if (!line.startsWith("#")) {
      segments.push(new URL(line, playlistUrl).href);
    }
  }
  return { variants, segments };
}

async function fetchWithPageSession(url, accept = "*/*") {
  const response = await fetch(url, {
    credentials: "include",
    cache: "force-cache",
    referrer: state.page?.url || location.href,
    headers: { Accept: accept },
  });
  if (!response.ok) throw new Error(`浏览器读取失败 ${response.status}`);
  return response;
}

async function hydrateBrowserHls(asset, m3u8Url, remainingBytes, depth = 0) {
  if (depth > 2) throw new Error("视频流层级过深，暂不支持");
  const playlistResponse = await fetchWithPageSession(m3u8Url, "application/vnd.apple.mpegurl,application/x-mpegurl,*/*");
  const playlistText = await playlistResponse.text();
  if (!playlistText.trimStart().startsWith("#EXTM3U")) throw new Error("不是有效的视频流列表");
  const { variants, segments } = parseBrowserM3u8(playlistText, playlistResponse.url || m3u8Url);
  if (variants.length) return hydrateBrowserHls(asset, variants[variants.length - 1], remainingBytes, depth + 1);
  if (!segments.length) throw new Error("视频流没有可下载分片");
  if (segments.length > 360) throw new Error("视频分片过多，暂不支持直接合并");

  const chunks = [];
  let totalBytes = 0;
  for (let index = 0; index < segments.length; index += 1) {
    elements.sendButton.textContent = `合并视频 ${index + 1}/${segments.length}`;
    const response = await fetchWithPageSession(segments[index], "video/*,*/*");
    const blob = await response.blob();
    totalBytes += blob.size;
    if (totalBytes > remainingBytes) throw new Error("视频较大，超过本次浏览器传输限制");
    chunks.push(blob);
  }
  const blob = new Blob(chunks, { type: "video/mp2t" });
  return {
    asset: {
      ...asset,
      dataUrl: await blobToDataUrl(blob),
      dataSourceUrl: m3u8Url,
      transferHint: "browser-hls-data",
    },
    bytes: blob.size,
  };
}

async function hydrateAssetData(asset, index, remainingBytes) {
  if (index >= 30 || remainingBytes <= 0) return { asset, bytes: 0 };
  let candidates = uniqueUrls([
    asset.url,
    ...(asset.candidateUrls || []),
    asset.fallbackUrl,
    asset.previewUrl,
    asset.poster,
  ]);
  if (asset.type === "video") {
    const videoOnly = candidates.filter(isDownloadableVideoUrl);
    candidates = videoOnly.length ? videoOnly : candidates;
    if (!videoOnly.length) {
      return { asset: { ...asset, dataError: "只找到了视频封面，没有找到真实视频文件" }, bytes: 0 };
    }
  }
  candidates = candidates.sort((a, b) => {
    const score = (url) => {
      if (!url) return 0;
      if (/_audio\.m3u8(?:[?#]|$)/i.test(url)) return 1;
      if (isDownloadableVideoUrl(url)) return 100;
      if (asset.type === "video" && /^blob:/i.test(url)) return 90;
      if (asset.type === "video" && /^data:video\//i.test(url)) return 90;
      if (asset.type === "video" && isVideoUrl(url)) return 80;
      if (asset.type === "video" && /\.(jpg|jpeg|png|webp|gif|bmp|avif|svg|ico)(?:[?#]|$)/i.test(url)) return 10;
      return 20;
    };
    return score(b) - score(a);
  });
  let lastError = "";
  for (const candidate of candidates) {
    try {
      if (asset.type === "video" && /\.m3u8(?:[?#]|$)/i.test(candidate)) {
        return await hydrateBrowserHls(asset, candidate, remainingBytes);
      }
      const response = await fetchWithPageSession(candidate, asset.type === "video" ? "video/*,*/*" : "image/*,*/*");
      const blob = await response.blob();
      const cleanType = String(blob.type || "").toLowerCase();
      const candidateLooksVideo = /\.(mp4|webm|mov|m4v|mkv|avi|ogv|3gp|3g2|ts)(?:[?#]|$)/i.test(candidate);
      if (asset.type === "video" && !cleanType.startsWith("video/") && !candidateLooksVideo) {
        lastError = "浏览器读取到的不是视频文件";
        continue;
      }
      const maxBytes = asset.type === "video" ? remainingBytes : Math.min(25 * 1024 * 1024, remainingBytes);
      if (blob.size > maxBytes) {
        lastError = asset.type === "video" ? "视频较大，改用链接下载" : "图片超过 25MB，改用链接下载";
        continue;
      }
      if (blob.size > remainingBytes) {
        lastError = "本次传输内容较多，改用链接下载";
        continue;
      }
      return {
        asset: {
          ...asset,
          dataUrl: await blobToDataUrl(blob),
          dataSourceUrl: candidate,
          transferHint: "browser-data",
        },
        bytes: blob.size,
      };
    } catch (error) {
      lastError = error?.message || "浏览器读取失败";
    }
  }
  return { asset: { ...asset, dataError: lastError || "浏览器读取失败" }, bytes: 0 };
}

async function hydrateLocalPageAsset(asset, tabId, remainingBytes) {
  if (!asset.localUrl || remainingBytes <= 0) return { asset, bytes: 0 };
  try {
    const maxBytes = asset.type === "video"
      ? Math.min(120 * 1024 * 1024, remainingBytes)
      : Math.min(25 * 1024 * 1024, remainingBytes);
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: readLocalPageAsset,
      args: [asset.localUrl, maxBytes],
    });
    if (!result?.dataUrl) throw new Error(result?.error || "页面本地资源读取失败");
    return {
      asset: {
        ...asset,
        dataUrl: result.dataUrl,
        dataSourceUrl: asset.localUrl,
        transferHint: "page-local-data",
      },
      bytes: result.size || 0,
    };
  } catch (error) {
    return { asset: { ...asset, dataError: error?.message || "页面本地资源读取失败" }, bytes: 0 };
  }
}

async function hydratePageHlsAsset(asset, tabId, remainingBytes) {
  if (!tabId || asset.type !== "video" || remainingBytes <= 0) return { asset, bytes: 0 };
  const hlsUrl = uniqueUrls([asset.url, ...(asset.candidateUrls || [])])
    .find((url) => /\.m3u8(?:[?#]|$)/i.test(url) && !/_audio\.m3u8(?:[?#]|$)/i.test(url));
  if (!hlsUrl) return { asset, bytes: 0 };
  const audioUrls = uniqueUrls([asset.url, ...(asset.candidateUrls || [])])
    .filter((url) => /_audio\.m3u8(?:[?#]|$)/i.test(url));
  try {
    const maxBytes = Math.min(120 * 1024 * 1024, remainingBytes);
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: readPageHlsAssetInlineWithAudio,
      args: [hlsUrl, maxBytes, audioUrls],
    });
    if (!result?.dataUrl) throw new Error(result?.error || "页面视频流读取失败");
    return {
      asset: {
        ...asset,
        dataUrl: result.dataUrl,
        dataSourceUrl: result.sourceUrl || hlsUrl,
        audioDataUrl: result.audioDataUrl || "",
        transferHint: "page-hls-data",
      },
      bytes: (result.size || 0) + (result.audioSize || 0),
    };
  } catch (error) {
    return { asset: { ...asset, dataError: error?.message || "页面视频流读取失败" }, bytes: 0 };
  }
}

async function createSendPayload() {
  const payload = createCollectPayload();
  return hydratePayload(payload);
}

async function hydratePayload(payload) {
  const hydrated = [];
  let remainingBytes = 120 * 1024 * 1024;
  const tab = await getActiveTab().catch(() => null);
  for (let index = 0; index < payload.assets.length; index += 1) {
    elements.sendButton.textContent = `准备 ${index + 1}/${payload.assets.length}`;
    const sourceAsset = payload.assets[index];
    const localResult = await hydrateLocalPageAsset(sourceAsset, tab?.id, remainingBytes);
    const hlsResult = localResult.bytes ? localResult : await hydratePageHlsAsset(localResult.asset, tab?.id, remainingBytes);
    const result = hlsResult.bytes ? hlsResult : await hydrateAssetData(hlsResult.asset, index, remainingBytes);
    remainingBytes -= result.bytes;
    const hasVideoCandidate = sourceAsset.type === "video"
      && Array.isArray(result.asset.candidateUrls)
      && result.asset.candidateUrls.some((url) => /\.(m3u8|mp4|webm|mov|m4v|mkv|avi|ogv|3gp|3g2|ts)(?:[?#]|$)/i.test(url));
    hydrated.push({
      ...result.asset,
      hydrationFailed: sourceAsset.type === "video" && !!sourceAsset.localUrl && !result.bytes && !hasVideoCandidate,
    });
  }
  return { ...payload, assets: hydrated };
}

function applySendResult(payload, result) {
  const failedUrls = new Set((result.failed || []).map((item) => item.url).filter(Boolean));
  for (const imported of result.imported || []) {
    const asset = assetByResultUrl(imported.assetUrl) || assetByResultUrl(imported.finalUrl) || assetByResultUrl(imported.downloadedFrom);
    if (asset) setAssetStatus(asset.id, { state: "success" });
  }
  for (const failure of result.failed || []) {
    const asset = assetByResultUrl(failure.url);
    if (asset) setAssetStatus(asset.id, { state: "failed", reason: failure.reason || "发送失败" });
  }
  for (const asset of payload.assets || []) {
    if (!failedUrls.has(asset.url) && !state.sendStatus.has(asset.id)) {
      setAssetStatus(asset.id, { state: "success" });
    }
  }
}

async function postPayloadToVault(payload) {
  let response;
  try {
    response = await fetch("http://127.0.0.1:17321/collect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Asset-Vault-Extension": "web-collector",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new Error("无法连接桌面素材库，请确认软件正在运行；如果是视频素材，请少选几个后重试");
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(result.error || `接收失败 ${response.status}`);
  return result;
}

async function sendSelectedToVault() {
  const selected = getSelectedAssets();
  if (!selected.length) return;
  elements.sendButton.disabled = true;
  elements.sendButton.textContent = "发送中";
  let successCount = 0;
  let failedCount = 0;
  let firstFailureReason = "";
  const batchId = `web-batch-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    const status = await refreshVaultStatus({ quiet: true });
    if (!status.hasLibrary) throw new Error("请先打开桌面素材库，并确认已经设置保存位置");
    selected.forEach((asset) => setAssetStatus(asset.id, { state: "sending" }));
    renderAssets();

    for (let index = 0; index < selected.length; index += 1) {
      const asset = selected[index];
      elements.sendButton.textContent = `发送 ${index + 1}/${selected.length}`;
      try {
        const payload = await hydratePayload({
          ...createPayloadForAssets([asset]),
          batch: {
            id: batchId,
            total: selected.length,
            index,
            previousSuccess: successCount,
            previousFailed: failedCount,
          },
        });
        const result = await postPayloadToVault(payload);
        applySendResult(payload, result);
        if (result.failed?.length) {
          failedCount += 1;
          firstFailureReason ||= result.failed[0]?.reason || "";
        } else {
          successCount += result.importedCount || 1;
        }
      } catch (error) {
        failedCount += 1;
        const reason = error?.message || "发送失败";
        firstFailureReason ||= reason;
        setAssetStatus(asset.id, { state: "failed", reason });
      }
      renderAssets();
    }

    const firstFailure = firstFailureReason ? `：${firstFailureReason}` : "";
    const failedText = failedCount ? `，${failedCount} 个失败${firstFailure}` : "";
    showNotice(`已发送 ${successCount} 个素材到桌面软件${failedText}。`);
    elements.sendButton.textContent = "已发送";
    setTimeout(() => {
      elements.sendButton.textContent = "发送到素材库";
      updateSummary();
    }, 1400);
  } catch (error) {
    selected.forEach((asset) => setAssetStatus(asset.id, { state: "failed", reason: error?.message || "发送失败" }));
    renderAssets();
    showNotice(`发送失败：${error?.message || "请先打开桌面素材库软件"}`);
    elements.sendButton.textContent = "发送到素材库";
    updateSummary();
  }
}

async function retryAsset(assetId) {
  const asset = state.assets.find((item) => item.id === assetId);
  if (!asset) return;
  setAssetStatus(asset.id, { state: "sending" });
  renderAssets();
  try {
    const status = await refreshVaultStatus({ quiet: true });
    if (!status.hasLibrary) throw new Error("请先打开桌面素材库，并确认已经设置保存位置");
    const payload = await hydratePayload(createPayloadForAssets([asset]));
    const result = await postPayloadToVault(payload);
    applySendResult(payload, result);
    showNotice(result.failed?.length ? "重试失败，请查看该素材标记。" : "已重试成功。");
  } catch (error) {
    setAssetStatus(asset.id, { state: "failed", reason: error?.message || "重试失败" });
    showNotice(`重试失败：${error?.message || "请稍后再试"}`);
  } finally {
    renderAssets();
  }
}

async function copySelectedLinks() {
  const selected = getSelectedAssets();
  if (!selected.length) return;
  const payload = createCollectPayload();
  const text = JSON.stringify(payload, null, 2);
  elements.copyButton.disabled = true;
  elements.copyButton.textContent = "复制中";
  try {
    await copyText(text);
    showNotice(`已复制 ${selected.length} 个素材链接。桌面软件接收功能完成后会改为一键收藏。`);
    elements.copyButton.textContent = "已复制";
    setTimeout(() => {
      elements.copyButton.textContent = "复制选中链接";
      updateSummary();
    }, 1200);
  } catch (error) {
    showNotice(`复制失败：${error?.message || "浏览器暂时不允许写入剪贴板，请刷新页面后重试。"}`);
    elements.copyButton.textContent = "复制选中链接";
    updateSummary();
  }
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {}
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.append(textarea);
  textarea.focus();
  textarea.select();
  const ok = document.execCommand("copy");
  textarea.remove();
  if (!ok) throw new Error("剪贴板写入被浏览器拒绝");
}

async function refreshPageAndRestorePanel() {
  elements.refreshScanButton.disabled = true;
  elements.refreshScanButton.textContent = "刷新中";
  showNotice("正在刷新网页并重新打开收集面板...");
  try {
    const tab = await getActiveTab();
    if (!tab?.id) throw new Error("没有找到当前网页");
    await chrome.runtime.sendMessage({ type: "refresh-and-reopen-panel", tabId: tab.id });
  } catch (error) {
    elements.refreshScanButton.disabled = false;
    elements.refreshScanButton.textContent = "刷新";
    showNotice(`刷新失败：${error?.message || "请手动刷新页面后再试"}`);
  }
}

elements.scanButton.addEventListener("click", scanPage);
elements.refreshScanButton.addEventListener("click", refreshPageAndRestorePanel);
elements.sendButton.addEventListener("click", sendSelectedToVault);
elements.copyButton.addEventListener("click", copySelectedLinks);
elements.folderSelect?.addEventListener("change", () => {
  const folderId = elements.folderSelect.value || "default";
  popupSettings.folderId = folderId;
  savePopupSettings({ folderId });
});
elements.closeButton?.addEventListener("click", () => {
  if (isPanelMode) parent.postMessage({ source: "asset-vault-panel", type: "close" }, "*");
  else window.close();
});
elements.collapseButton?.addEventListener("click", () => {
  if (isPanelMode) parent.postMessage({ source: "asset-vault-panel", type: "collapse" }, "*");
});
elements.selectAll.addEventListener("change", () => {
  state.selected = elements.selectAll.checked ? new Set(state.assets.map((asset) => asset.id)) : new Set();
  syncSelectionState();
});

if (isPanelMode && elements.dragHandle) {
  let drag = null;
  elements.dragHandle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY };
    elements.dragHandle.setPointerCapture(event.pointerId);
    parent.postMessage({ source: "asset-vault-panel", type: "drag-start", x: event.screenX, y: event.screenY }, "*");
  });
  elements.dragHandle.addEventListener("pointermove", (event) => {
    if (!drag) return;
    drag = { x: event.clientX, y: event.clientY };
    parent.postMessage({ source: "asset-vault-panel", type: "drag", x: event.screenX, y: event.screenY }, "*");
  });
  const stopDrag = (event) => {
    drag = null;
    parent.postMessage({ source: "asset-vault-panel", type: "drag-end" }, "*");
    if (elements.dragHandle.hasPointerCapture?.(event.pointerId)) {
      elements.dragHandle.releasePointerCapture(event.pointerId);
    }
  };
  elements.dragHandle.addEventListener("pointerup", stopDrag);
  elements.dragHandle.addEventListener("pointercancel", stopDrag);
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadPopupSettings();
  await refreshVaultStatus({ quiet: true });
  await scanPage();
});

async function warmUpLazyAssets() {
  const startX = window.scrollX;
  const startY = window.scrollY;
  const isInViewport = (element) => {
    const rect = element.getBoundingClientRect();
    return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
  };
  const touchVideos = async () => {
    for (const video of Array.from(document.querySelectorAll("video")).filter(isInViewport).slice(0, 8)) {
      try {
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
        await video.play().catch(() => {});
        video.pause();
      } catch {}
    }
  };
  await touchVideos();
  window.scrollTo({ top: startY, left: startX, behavior: "instant" });
  await touchVideos();
  await new Promise((resolve) => setTimeout(resolve, 180));
  return true;
}

async function readLocalPageAsset(url, maxBytes) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`读取失败 ${response.status}`);
    const blob = await response.blob();
    if (blob.size > maxBytes) throw new Error("文件过大，无法通过浏览器直接传输");
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("读取失败"));
      reader.readAsDataURL(blob);
    });
    return { dataUrl, size: blob.size, type: blob.type || "" };
  } catch (error) {
    return { error: error?.message || "读取失败" };
  }
}

function parsePageM3u8(text, playlistUrl) {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const variants = [];
  const segments = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith("#EXT-X-KEY")) throw new Error("视频流已加密，暂不支持直接合并");
    if (line.startsWith("#EXT-X-STREAM-INF")) {
      const next = lines[index + 1];
      if (next && !next.startsWith("#")) variants.push(new URL(next, playlistUrl).href);
    } else if (!line.startsWith("#")) {
      segments.push(new URL(line, playlistUrl).href);
    }
  }
  return { variants, segments };
}

async function readPageHlsAsset(url, maxBytes, depth = 0) {
  try {
    const parseM3u8 = (text, playlistUrl) => {
      const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const variants = [];
      const segments = [];
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (line.startsWith("#EXT-X-KEY")) throw new Error("video stream is encrypted");
        if (line.startsWith("#EXT-X-STREAM-INF")) {
          const next = lines[index + 1];
          if (next && !next.startsWith("#")) variants.push(new URL(next, playlistUrl).href);
        } else if (!line.startsWith("#")) {
          segments.push(new URL(line, playlistUrl).href);
        }
      }
      return { variants, segments };
    };
    if (depth > 2) throw new Error("视频流层级过深，暂不支持");
    const playlistResponse = await fetch(url, { credentials: "include", cache: "force-cache" });
    if (!playlistResponse.ok) throw new Error(`读取视频流失败 ${playlistResponse.status}`);
    const playlistText = await playlistResponse.text();
    if (!playlistText.trimStart().startsWith("#EXTM3U")) throw new Error("不是有效的视频流列表");
    const { variants, segments } = parseM3u8(playlistText, playlistResponse.url || url);
    if (variants.length) return readPageHlsAsset(variants[variants.length - 1], maxBytes, depth + 1);
    if (!segments.length) throw new Error("视频流没有可下载分片");
    if (segments.length > 360) throw new Error("视频分片过多，暂不支持直接合并");

    const chunks = [];
    let totalBytes = 0;
    for (const segmentUrl of segments) {
      const response = await fetch(segmentUrl, { credentials: "include", cache: "force-cache" });
      if (!response.ok) throw new Error(`读取视频分片失败 ${response.status}`);
      const blob = await response.blob();
      totalBytes += blob.size;
      if (totalBytes > maxBytes) throw new Error("视频较大，超过本次浏览器传输限制");
      chunks.push(blob);
    }
    const blob = new Blob(chunks, { type: "video/mp2t" });
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("读取视频失败"));
      reader.readAsDataURL(blob);
    });
    return { dataUrl, size: blob.size, type: blob.type || "video/mp2t", sourceUrl: url };
  } catch (error) {
    return { error: error?.message || "读取视频失败" };
  }
}

async function readPageHlsAssetInline(url, maxBytes) {
  try {
    const parseM3u8 = (text, playlistUrl) => {
      const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const variants = [];
      const segments = [];
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (line.startsWith("#EXT-X-KEY")) throw new Error("视频流已加密，暂不支持直接合并");
        if (line.startsWith("#EXT-X-STREAM-INF")) {
          const next = lines[index + 1];
          if (next && !next.startsWith("#")) variants.push(new URL(next, playlistUrl).href);
        } else if (!line.startsWith("#")) {
          segments.push(new URL(line, playlistUrl).href);
        }
      }
      return { variants, segments };
    };

    let playlistUrl = url;
    let parsed = null;
    for (let level = 0; level <= 2; level += 1) {
      const playlistResponse = await fetch(playlistUrl, { credentials: "include", cache: "force-cache" });
      if (!playlistResponse.ok) throw new Error(`读取视频流失败 ${playlistResponse.status}`);
      const playlistText = await playlistResponse.text();
      if (!playlistText.trimStart().startsWith("#EXTM3U")) throw new Error("不是有效的视频流列表");
      parsed = parseM3u8(playlistText, playlistResponse.url || playlistUrl);
      if (!parsed.variants.length) break;
      playlistUrl = parsed.variants[parsed.variants.length - 1];
    }
    if (parsed?.variants?.length) throw new Error("视频流层级过深，暂不支持");
    const segments = parsed?.segments || [];
    if (!segments.length) throw new Error("视频流没有可下载分片");
    if (segments.length > 360) throw new Error("视频分片过多，暂不支持直接合并");

    const chunks = [];
    let totalBytes = 0;
    for (const segmentUrl of segments) {
      const response = await fetch(segmentUrl, { credentials: "include", cache: "force-cache" });
      if (!response.ok) throw new Error(`读取视频分片失败 ${response.status}`);
      const blob = await response.blob();
      totalBytes += blob.size;
      if (totalBytes > maxBytes) throw new Error("视频较大，超过本次浏览器传输限制");
      chunks.push(blob);
    }
    const blob = new Blob(chunks, { type: "video/mp2t" });
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("读取视频失败"));
      reader.readAsDataURL(blob);
    });
    return { dataUrl, size: blob.size, type: blob.type || "video/mp2t", sourceUrl: url };
  } catch (error) {
    return { error: error?.message || "读取视频失败" };
  }
}

async function readPageHlsAssetInlineWithAudio(url, maxBytes, audioUrls = []) {
  try {
    const parseM3u8 = (text, playlistUrl) => {
      const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const variants = [];
      const segments = [];
      const audioRenditions = [];
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (line.startsWith("#EXT-X-KEY")) throw new Error("视频流已加密，暂不支持直接合并");
        if (line.startsWith("#EXT-X-MEDIA") && /TYPE=AUDIO/i.test(line)) {
          const uri = line.match(/URI="([^"]+)"/i)?.[1];
          if (uri) audioRenditions.push(new URL(uri, playlistUrl).href);
        }
        if (line.startsWith("#EXT-X-STREAM-INF")) {
          const next = lines[index + 1];
          if (next && !next.startsWith("#")) variants.push(new URL(next, playlistUrl).href);
        } else if (!line.startsWith("#")) {
          segments.push(new URL(line, playlistUrl).href);
        }
      }
      return { variants, segments, audioRenditions };
    };

    const readDataUrl = (blob, errorText) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error(errorText));
      reader.readAsDataURL(blob);
    });

    const readHls = async (startUrl, byteLimit, label) => {
      let playlistUrl = startUrl;
      let parsed = null;
      let audioRenditions = [];
      for (let level = 0; level <= 2; level += 1) {
        const playlistResponse = await fetch(playlistUrl, { credentials: "include", cache: "force-cache" });
        if (!playlistResponse.ok) throw new Error(`读取${label}流失败 ${playlistResponse.status}`);
        const playlistText = await playlistResponse.text();
        if (!playlistText.trimStart().startsWith("#EXTM3U")) throw new Error(`不是有效的${label}流列表`);
        parsed = parseM3u8(playlistText, playlistResponse.url || playlistUrl);
        if (parsed.audioRenditions.length) audioRenditions = parsed.audioRenditions;
        if (!parsed.variants.length) break;
        playlistUrl = parsed.variants[parsed.variants.length - 1];
      }
      if (parsed?.variants?.length) throw new Error(`${label}流层级过深，暂不支持`);
      const segments = parsed?.segments || [];
      if (!segments.length) throw new Error(`${label}流没有可下载分片`);
      if (segments.length > 360) throw new Error(`${label}分片过多，暂不支持直接合并`);

      const chunks = [];
      let totalBytes = 0;
      for (const segmentUrl of segments) {
        const response = await fetch(segmentUrl, { credentials: "include", cache: "force-cache" });
        if (!response.ok) throw new Error(`读取${label}分片失败 ${response.status}`);
        const blob = await response.blob();
        totalBytes += blob.size;
        if (totalBytes > byteLimit) throw new Error(`${label}较大，超过本次浏览器传输限制`);
        chunks.push(blob);
      }
      return {
        blob: new Blob(chunks, { type: "video/mp2t" }),
        audioRenditions,
        sourceUrl: playlistUrl,
      };
    };

    const video = await readHls(url, maxBytes, "视频");
    const dataUrl = await readDataUrl(video.blob, "读取视频失败");
    let audioDataUrl = "";
    let audioSize = 0;
    const audioCandidates = [...new Set([...(Array.isArray(audioUrls) ? audioUrls : []), ...(video.audioRenditions || [])])]
      .filter((candidate) => /\.m3u8(?:[?#]|$)/i.test(candidate) && candidate !== url);
    for (const audioUrl of audioCandidates) {
      try {
        const audioLimit = Math.min(50 * 1024 * 1024, Math.max(0, maxBytes - video.blob.size));
        if (audioLimit <= 0) break;
        const audio = await readHls(audioUrl, audioLimit, "音频");
        audioDataUrl = await readDataUrl(audio.blob, "读取音频失败");
        audioSize = audio.blob.size;
        break;
      } catch {}
    }
    return {
      dataUrl,
      audioDataUrl,
      size: video.blob.size,
      audioSize,
      type: video.blob.type || "video/mp2t",
      sourceUrl: url,
    };
  } catch (error) {
    return { error: error?.message || "读取视频失败" };
  }
}

function collectPageAssets(backgroundVideoUrls = []) {
  const assets = [];
  const seen = new Set();
  const seenFingerprints = new Set();
  const pageUrl = location.href;
  const isPinterestPinPage = /(^|\.)pinterest\./i.test(location.hostname) && /\/pin\/\d+/i.test(location.pathname);
  let skippedTemporaryUrl = false;
  const mediaExtensions = [
    "jpg", "jpeg", "png", "webp", "gif", "bmp", "tif", "tiff", "avif", "svg", "ico", "heic", "heif", "jxl",
    "mp4", "webm", "mov", "m4v", "mkv", "avi", "ogv", "3gp", "3g2", "ts", "m3u8",
    "psd", "ai", "eps", "pdf",
  ];
  const blockedResourceExtensions = [
    "js", "mjs", "cjs", "css", "html", "htm", "json", "map", "wasm",
    "woff", "woff2", "ttf", "otf", "eot", "txt", "xml",
  ];
  const mediaUrlPattern = new RegExp(`\\.(${mediaExtensions.join("|")})(?:[?#].*)?$`, "i");
  const blockedResourcePattern = new RegExp(`\\.(${blockedResourceExtensions.join("|")})(?:[?#].*)?$`, "i");
  const lazyAttributes = [
    "src", "href", "poster", "content",
    "data-src", "data-original", "data-original-src", "data-lazy-src", "data-url", "data-image", "data-image-url",
    "data-full", "data-full-url", "data-fullsrc", "data-hires", "data-large", "data-large-url",
    "data-zoom-src", "data-src-large", "data-pin-media", "data-video-src",
    "data-cover", "data-cover-url", "data-poster", "data-thumb", "data-thumbnail", "data-bg", "data-background",
    "data-main-image", "data-img", "data-img-url", "data-actualsrc", "data-ks-lazyload", "data-file", "data-key", "data-image-key",
  ];
  const observedVideoUrls = (() => {
    try {
      return uniqueUrls([
        ...(Array.isArray(backgroundVideoUrls) ? backgroundVideoUrls : []),
        ...performance.getEntriesByType("resource")
        .map((entry) => entry.name || "")
        .filter((url) => /\.(m3u8|mp4|webm|mov|m4v)(?:[?#]|$)|\/videos\//i.test(url)),
      ]);
    } catch {
      return uniqueUrls(Array.isArray(backgroundVideoUrls) ? backgroundVideoUrls : []);
    }
  })();
  const observedVideoGroups = (() => {
    const groups = new Map();
    for (const url of observedVideoUrls) {
      const match = url.match(/\/([a-f0-9]{32})(?:_[^/?#]+)?\.(?:m3u8|mp4|webm|mov|m4v|cmfv|cmfa)(?:[?#]|$)/i);
      const key = match?.[1] || url;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(url);
    }
    return [...groups.entries()].map(([key, urls]) => ({
      key,
      urls: [...new Set(urls)]
      .filter((url) => /\.(m3u8|mp4|webm|mov|m4v|mkv|avi|ogv|3gp|3g2|ts)(?:[?#]|$)/i.test(url))
      .sort((a, b) => {
        const score = (url) => {
          if (/_audio\.m3u8/i.test(url)) return -1;
          if (/_720w\.m3u8/i.test(url)) return 4;
          if (/_480w\.m3u8/i.test(url)) return 3;
          if (/_360w\.m3u8/i.test(url)) return 2;
          if (/_240w\.m3u8/i.test(url)) return 1;
          if (/\.m3u8/i.test(url)) return 5;
          return 0;
        };
        return score(b) - score(a);
      }),
    })).filter((group) => group.urls.length);
  })();

  function uniqueUrls(urls) {
    return [...new Set((urls || []).filter(Boolean).map((url) => String(url).trim()).filter(Boolean))];
  }

  let cachedScanRoots = null;

  function scanRoots() {
    if (cachedScanRoots) return cachedScanRoots;
    const roots = [document];
    const queue = [document];
    const seenRoots = new Set(roots);
    let inspectedElements = 0;
    while (queue.length && roots.length < 40 && inspectedElements < 3500) {
      const root = queue.shift();
      let elements = [];
      try {
        elements = Array.from(root.querySelectorAll("*"));
      } catch {
        elements = [];
      }
      for (const element of elements) {
        inspectedElements += 1;
        if (inspectedElements > 3500 || roots.length >= 40) break;
        if (element.shadowRoot && !seenRoots.has(element.shadowRoot)) {
          seenRoots.add(element.shadowRoot);
          roots.push(element.shadowRoot);
          queue.push(element.shadowRoot);
        }
      }
    }
    cachedScanRoots = roots;
    return roots;
  }

  function queryAllInRoots(selector) {
    const result = [];
    const used = new Set();
    for (const root of scanRoots()) {
      for (const element of root.querySelectorAll(selector)) {
        if (used.has(element)) continue;
        used.add(element);
        result.push(element);
      }
    }
    return result;
  }

  function visibleRectForElement(element) {
    if (!element || element === document || element === document.body) return true;
    const target = element.matches?.("source") && element.parentElement ? element.parentElement : element;
    const rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const visibleWidth = Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0);
    const visibleHeight = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
    if (visibleWidth <= 0 || visibleHeight <= 0) return null;
    return { rect, viewportWidth, viewportHeight, visibleWidth, visibleHeight, area: visibleWidth * visibleHeight };
  }

  function isElementInViewport(element) {
    if (!element || element === document || element === document.body) return true;
    const visible = visibleRectForElement(element);
    if (!visible) return false;
    if (element.matches?.("img, video, picture, source") && visible.area < 1800) return false;
    return visible.rect.bottom > 0 && visible.rect.right > 0 && visible.rect.top < visible.viewportHeight && visible.rect.left < visible.viewportWidth;
  }

  function visibleElements(selector) {
    return queryAllInRoots(selector).filter(isElementInViewport);
  }

  function absoluteUrl(value) {
    if (!value || typeof value !== "string") return "";
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
      skippedTemporaryUrl = true;
      return trimmed;
    }
    try {
      return new URL(trimmed, location.href).href;
    } catch {
      return "";
    }
  }

  function fileNameFromUrl(url) {
    try {
      const pathname = decodeURIComponent(new URL(url).pathname);
      return pathname.split("/").filter(Boolean).pop() || "";
    } catch {
      return "";
    }
  }

  function cleanCandidateUrl(value) {
    if (!value || typeof value !== "string") return "";
    const trimmed = value.trim();
    if (!trimmed || trimmed === "none") return "";
    if (trimmed.startsWith("//")) return `${location.protocol}${trimmed}`;
    return trimmed;
  }

  function extractUrlsFromText(text) {
    return uniqueUrls(String(text || "")
      .replace(/\\u002F/gi, "/")
      .replace(/\\u0026/gi, "&")
      .replace(/\\\//g, "/")
      .replace(/&amp;/g, "&")
      .match(/(?:https?:)?\/\/[^"'()\s<>]+|(?:\/[^"'()\s<>]+?\.(?:jpg|jpeg|png|webp|gif|bmp|tif|tiff|avif|svg|heic|heif|jxl|mp4|webm|mov|m4v|m3u8))(?:[?#][^"'()\s<>]*)?/gi) || [])
      .map(cleanCandidateUrl);
  }

  function hostFromUrl(url) {
    try {
      return new URL(url).host;
    } catch {
      return "";
    }
  }

  function closestMediaCard(element) {
    let current = element;
    for (let depth = 0; current && depth < 8; depth += 1) {
      const text = String(current.innerText || "");
      if (/\b\d{1,2}:\d{2}\b/.test(text)) return current;
      if (current.matches?.('a, [role="link"], article, figure, li, [class*="card" i], [class*="item" i], [class*="pin" i], [data-test-id*="pin" i], [data-grid-item]') && current.querySelector?.("img, video, picture, source, [style]")) return current;
      current = current.parentElement;
    }
    return element;
  }

  function collectElementAttributeUrls(element) {
    const urls = [];
    const addValue = (value) => {
      if (!value || typeof value !== "string") return;
      if (value.includes("url(")) {
        for (const match of value.matchAll(/url\((['"]?)(.*?)\1\)/g)) urls.push(match[2]);
      }
      urls.push(...extractUrlsFromText(value));
      const direct = cleanCandidateUrl(value);
      if (direct && (/^(?:https?:)?\/\//i.test(direct) || direct.startsWith("/") || hasMediaExtension(direct) || mediaHintFromUrl(direct))) urls.push(direct);
    };
    try {
      for (const attr of element.attributes || []) {
        if (!attr?.value) continue;
        const name = String(attr.name || "").toLowerCase();
        if (
          lazyAttributes.includes(name)
          || name.includes("src")
          || name.includes("url")
          || name.includes("image")
          || name.includes("img")
          || name.includes("video")
          || name.includes("poster")
          || name.includes("cover")
          || name.includes("thumb")
          || name.includes("media")
          || name === "style"
        ) {
          addValue(attr.value);
        }
      }
    } catch {}
    return uniqueUrls(urls.map((url) => absoluteUrl(cleanCandidateUrl(url))).filter(Boolean));
  }

  function collectVisibleCardUrls(element) {
    const urls = [];
    const roots = [];
    const usedRoots = new Set();
    for (const root of [element, closestMediaCard(element)].filter(Boolean)) {
      if (usedRoots.has(root)) continue;
      usedRoots.add(root);
      roots.push(root);
    }
    for (const root of roots) {
      urls.push(...collectElementAttributeUrls(root));
      for (const child of root.querySelectorAll?.("img, video, source, picture, a[href], [style], [poster]") || []) {
        if (!isElementInViewport(child) && !root.contains(child)) continue;
        urls.push(...collectElementAttributeUrls(child));
        urls.push(child.currentSrc || child.src || child.href || child.poster || "");
        for (const item of parseSrcset(child.getAttribute?.("srcset") || "")) urls.push(item.url);
        for (const item of parseSrcset(child.getAttribute?.("data-srcset") || "")) urls.push(item.url);
      }
    }
    return uniqueUrls(urls.map((url) => absoluteUrl(cleanCandidateUrl(url))).filter(Boolean));
  }

  function elementLooksLikeVideoCard(element) {
    const card = closestMediaCard(element);
    const text = String(card?.innerText || element?.alt || element?.title || "");
    if (/\b\d{1,2}:\d{2}\b/.test(text)) return true;
    if (card?.querySelector?.("video, [aria-label*='video' i], [aria-label*='视频'], [data-test-id*='video' i]")) return true;
    return false;
  }

  function isTemporaryAssetUrl(url) {
    return /^data:(image|video)\//i.test(url) || url.startsWith("blob:");
  }

  function hasBlockedResourceExtension(url) {
    if (!url || isTemporaryAssetUrl(url)) return false;
    try {
      return blockedResourcePattern.test(new URL(url, location.href).pathname);
    } catch {
      return true;
    }
  }

  function hasMediaExtension(url) {
    if (!url) return false;
    if (isTemporaryAssetUrl(url)) return true;
    try {
      const parsed = new URL(url, location.href);
      return mediaUrlPattern.test(parsed.pathname) || mediaUrlPattern.test(parsed.href);
    } catch {
      return mediaUrlPattern.test(url);
    }
  }

  function mediaHintFromUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      return /pinimg\.com|hbimg\.huabanimg\.com|huabanimg\.com|media\.tenor\.com|giphy\.com|giphy\.com\/media|i\.ytimg\.com|ytimg\.com|images|media|image|video|photo|thumb|thumbnail|cdn/i.test(parsed.hostname + parsed.pathname);
    } catch {
      return false;
    }
  }

  function isLikelyMediaCdnUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      return /(?:^|\.)(?:pinimg|huabanimg|tenor|giphy|gstatic|alicdn|qpic|gtimg|bdstatic|bcebos|douyinpic|byteimg|ixigua|vimeo|ytimg)\./i.test(parsed.hostname)
        || /(?:image|img|media|photo|picture|video|thumb|thumbnail|cover|poster|upload|file|asset|cdn)/i.test(parsed.hostname + parsed.pathname);
    } catch {
      return false;
    }
  }

  function inferType(url, fallback = "image") {
    const lower = url.toLowerCase().split("?")[0];
    if (/\.(mp4|webm|mov|m4v|mkv|avi|ogv|3gp|3g2|ts|m3u8)$/.test(lower)) return "video";
    if (/\.(gif)$/.test(lower)) return "animation";
    if (/\.(jpg|jpeg|png|webp|bmp|tif|tiff|avif|svg|ico|heic|heif|jxl)$/.test(lower)) return "image";
    if (/\.(psd|ai|eps|pdf)$/.test(lower)) return "file";
    return fallback;
  }

  function isVideoUrl(url) {
    return inferType(url, "") === "video";
  }

  function isDownloadableVideoUrl(url) {
    return /\.(m3u8|mp4|webm|mov|m4v|mkv|avi|ogv|3gp|3g2|ts)(?:[?#]|$)/i.test(url || "")
      || /^data:video\//i.test(url || "")
      || /^blob:/i.test(url || "");
  }

  function decodeJsonUrl(raw) {
    return cleanCandidateUrl(String(raw || "")
      .replace(/\\u002F/gi, "/")
      .replace(/\\u0026/gi, "&")
      .replace(/\\\//g, "/")
      .replace(/&amp;/g, "&"));
  }

  function decodeJsonText(raw) {
    return String(raw || "")
      .replace(/\\u002F/gi, "/")
      .replace(/\\u0026/gi, "&")
      .replace(/\\\//g, "/")
      .replace(/&amp;/g, "&");
  }

  function looksLikeMediaUrl(url) {
    const clean = absoluteUrl(cleanCandidateUrl(url));
    if (!clean) return false;
    if (hasBlockedResourceExtension(clean)) return false;
    return hasMediaExtension(clean) || mediaHintFromUrl(clean);
  }

  function shouldAcceptAssetUrl(url, { source = "generic", element = null } = {}) {
    const clean = absoluteUrl(cleanCandidateUrl(url));
    if (!clean) return false;
    if (hasBlockedResourceExtension(clean)) return false;
    if (hasMediaExtension(clean)) return true;
    const looseSource = /^(img|source-srcset|video|video-source|inline-background|computed-background|background)$/i.test(source);
    if (looseSource) return isLikelyMediaCdnUrl(clean);
    if (element) {
      const tag = element.tagName?.toLowerCase();
      if (tag === "img" || tag === "video" || tag === "source") return isLikelyMediaCdnUrl(clean);
    }
    return false;
  }

  function improveAssetUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      if (/huabanimg\.com$/i.test(parsed.hostname)) {
        parsed.searchParams.delete("imageView2");
        parsed.searchParams.delete("imageMogr2");
        parsed.searchParams.delete("thumbnail");
        return absoluteUrl(parsed.href);
      }
      if (!/pinimg\.com$/i.test(parsed.hostname)) return absoluteUrl(url);
      return absoluteUrl(url);
    } catch {
      return absoluteUrl(url);
    }
  }

  function assetFingerprint(url) {
    try {
      const parsed = new URL(url, location.href);
      const pathname = decodeURIComponent(parsed.pathname);
      if (/pinimg\.com$/i.test(parsed.hostname)) {
        const parts = pathname.split('/').filter(Boolean);
        const file = parts.at(-1) || '';
        const fileStem = file.replace(/\.(jpg|jpeg|png|webp|gif|mp4|webm|mov|m4v)$/i, '');
        if (fileStem.length >= 16) return `pinimg:${fileStem.toLowerCase()}`;
      }
      const cleanPath = pathname
        .replace(/\/(?:originals|1200x|736x|564x|474x|236x|170x|75x|webp|webp\d+)\//gi, '/')
        .replace(/\.(jpg|jpeg|png|webp|gif|mp4|webm|mov|m4v)$/i, '');
      return `${parsed.hostname.toLowerCase()}:${cleanPath.toLowerCase()}`;
    } catch {
      return url;
    }
  }

  function pinimgMediaStem(url) {
    try {
      const parsed = new URL(url, location.href);
      const pathname = decodeURIComponent(parsed.pathname);
      const exact = pathname.match(/\/([a-f0-9]{32})(?:_[^/?#]+)?\.(?:jpg|jpeg|png|webp|gif|mp4|webm|mov|m4v|m3u8|cmfv|cmfa)(?:[?#]|$)?/i);
      if (exact) return exact[1].toLowerCase();
      const loose = pathname.match(/([a-f0-9]{32})/i);
      return loose ? loose[1].toLowerCase() : "";
    } catch {
      return "";
    }
  }

  function mediaUrlMatches(text, extensions) {
    const pattern = new RegExp(`https?:\\\\/\\\\/[^"'\\s<>]+?\\\\.(?:${extensions})(?:\\\\?[^"'\\s<>]*)?|https?:\/\/[^"'\\s<>]+?\\.(?:${extensions})(?:\\?[^"'\\s<>]*)?`, "gi");
    return String(text || "").match(pattern) || [];
  }

  function pinIdsFromText(text) {
    return uniqueUrls([
      ...String(text || "").matchAll(/\/pin\/(\d{8,24})/gi),
      ...String(text || "").matchAll(/["'](?:id|pin_id|pinId)["']\s*:\s*["']?(\d{8,24})/gi),
    ].map((match) => match[1]));
  }

  function pinIdsFromElement(element) {
    if (!element) return [];
    const ids = [];
    const card = closestMediaCard(element);
    for (const root of [...new Set([element, card].filter(Boolean))]) {
      for (const link of root.querySelectorAll?.('a[href*="/pin/"]') || []) {
        const href = link.getAttribute("href") || "";
        const match = href.match(/\/pin\/(\d{8,24})/i);
        if (match) ids.push(match[1]);
      }
      for (const attr of ["href", "data-pin-id", "data-pin-href", "data-test-id", "aria-label"]) {
        const value = root.getAttribute?.(attr) || "";
        ids.push(...pinIdsFromText(value));
      }
    }
    return uniqueUrls(ids);
  }

  function isLikelyDetailPageUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      if (!/^https?:$/i.test(parsed.protocol)) return false;
      if (hasMediaExtension(parsed.href) || mediaHintFromUrl(parsed.href)) return false;
      const path = parsed.pathname;
      if (/\/pin\/\d{8,24}\/?/i.test(path)) return true;
      if (/\/pins?\/\d{4,}\/?/i.test(path)) return true;
      if (/\/(?:artwork|works-details-page|work|photo|video|post|posts|item|items|detail|details)\//i.test(path)) return true;
      return false;
    } catch {
      return false;
    }
  }

  function detailPageUrlFromElement(element) {
    if (!element) return "";
    const roots = [...new Set([element, closestMediaCard(element)].filter(Boolean))];
    const links = [];
    for (const root of roots) {
      const ownHref = root.matches?.("a[href]") ? root.getAttribute("href") : "";
      if (ownHref) links.push(ownHref);
      for (const link of root.querySelectorAll?.("a[href]") || []) {
        links.push(link.getAttribute("href") || link.href || "");
      }
      for (const attr of ["data-pin-href", "data-url", "data-href", "data-link", "data-detail-url"]) {
        const value = root.getAttribute?.(attr) || "";
        if (value) links.push(value);
      }
      for (const id of pinIdsFromElement(root)) {
        links.push(`${location.origin}/pin/${id}/`);
      }
    }
    const normalized = uniqueUrls(links.map((url) => absoluteUrl(cleanCandidateUrl(url))).filter(Boolean));
    return normalized.find((url) => /\/pin\/\d{8,24}\/?/i.test(new URL(url, location.href).pathname))
      || normalized.find(isLikelyDetailPageUrl)
      || "";
  }

  function sortVideoUrlsByQuality(urls) {
    const score = (url) => {
      if (/_720w\.m3u8|[?&](?:quality|q)=720/i.test(url)) return 70;
      if (/_480w\.m3u8|[?&](?:quality|q)=480/i.test(url)) return 60;
      if (/_360w\.m3u8|[?&](?:quality|q)=360/i.test(url)) return 50;
      if (/_240w\.m3u8|[?&](?:quality|q)=240/i.test(url)) return 40;
      if (/\.m3u8(?:[?#]|$)/i.test(url)) return 80;
      if (/\.(mp4|webm|mov|m4v)(?:[?#]|$)/i.test(url)) return 30;
      return 0;
    };
    return uniqueUrls(urls)
      .sort((a, b) => score(b) - score(a));
  }

  function buildPageVideoRecords() {
    const records = new Map();
    const addRecord = ({ videoUrls = [], posterUrls = [], pinIds = [] }) => {
      const videos = sortVideoUrlsByQuality(videoUrls.map((url) => absoluteUrl(decodeJsonUrl(url))).filter(isDownloadableVideoUrl));
      if (!videos.length) return;
      const key = pinimgMediaStem(videos[0]) || videos[0];
      const current = records.get(key) || { videoUrls: [], posterUrls: [], stems: [], pinIds: [] };
      current.videoUrls = sortVideoUrlsByQuality([...current.videoUrls, ...videos]);
      const posters = uniqueUrls(posterUrls.map((url) => absoluteUrl(decodeJsonUrl(url))).filter((url) => url && inferType(url, "") !== "video"));
      current.posterUrls = uniqueUrls([...current.posterUrls, ...posters]);
      current.stems = uniqueUrls([
        ...current.stems,
        ...current.videoUrls.map(pinimgMediaStem),
        ...current.posterUrls.map(pinimgMediaStem),
      ].filter(Boolean));
      current.pinIds = uniqueUrls([...current.pinIds, ...pinIds]);
      records.set(key, current);
    };

    for (const group of observedVideoGroups) {
      addRecord({ videoUrls: group.urls });
    }

    for (const script of document.querySelectorAll('script[type="application/json"], script:not([src])')) {
      const text = decodeJsonText(script.textContent || "");
      if (!/pinimg\.com|\.mp4|\.webm|m3u8|video_list|duration/i.test(text)) continue;
      const videos = uniqueUrls(mediaUrlMatches(text, "mp4|webm|mov|m4v|m3u8").map(decodeJsonUrl)).filter(isVideoUrl);
      if (!videos.length) continue;
      for (const videoUrl of videos.slice(0, 160)) {
        const index = text.indexOf(videoUrl);
        const context = index >= 0 ? text.slice(Math.max(0, index - 5000), index + 5000) : text;
        const posters = mediaUrlMatches(context, "jpg|jpeg|png|webp|gif|avif").map(decodeJsonUrl);
        addRecord({
          videoUrls: [videoUrl],
          posterUrls: posters,
          pinIds: pinIdsFromText(context),
        });
      }
    }

    for (const video of queryAllInRoots("video")) {
      const videoUrls = uniqueUrls([
        video.currentSrc || video.src || video.getAttribute("data-src") || video.getAttribute("data-video-src") || "",
        ...Array.from(video.querySelectorAll("source[src]"), (source) => source.src || source.getAttribute("data-src") || ""),
      ]).filter((url) => isVideoUrl(url) || /^blob:/i.test(url) || /^data:video\//i.test(url));
      if (!videoUrls.length) continue;
      addRecord({
        videoUrls,
        posterUrls: [video.poster || video.getAttribute("poster") || ""],
        pinIds: pinIdsFromElement(video),
      });
    }
    return [...records.values()].filter((record) => record.videoUrls.length);
  }

  function urlsFromElement(element) {
    if (!element) return [];
    const urls = [];
    const addValue = (value) => {
      if (!value) return;
      const clean = absoluteUrl(cleanCandidateUrl(value));
      if (clean) urls.push(clean);
    };
    for (const attr of lazyAttributes) addValue(element.getAttribute?.(attr));
    addValue(element.currentSrc || element.src || element.poster || element.href);
    for (const item of parseSrcset(element.getAttribute?.("srcset") || "")) addValue(item.url);
    for (const item of parseSrcset(element.getAttribute?.("data-srcset") || "")) addValue(item.url);

    const card = closestMediaCard(element);
    if (card && card !== element) {
      for (const child of card.querySelectorAll?.("img, video, source, a[href], [poster], [data-src], [data-pin-media], [data-video-src]") || []) {
        for (const attr of lazyAttributes) addValue(child.getAttribute?.(attr));
        addValue(child.currentSrc || child.src || child.poster || child.href);
        for (const item of parseSrcset(child.getAttribute?.("srcset") || "")) addValue(item.url);
        for (const item of parseSrcset(child.getAttribute?.("data-srcset") || "")) addValue(item.url);
      }
    }
    return uniqueUrls(urls);
  }

  function matchedObservedVideoGroup(input, originalUrl, url) {
    const explicit = Array.isArray(input.observedVideoGroup) ? input.observedVideoGroup : [];
    if (explicit.length) return explicit;

    const visualUrls = uniqueUrls([
      originalUrl,
      url,
      input.previewUrl,
      input.poster,
      ...(Array.isArray(input.candidateUrls) ? input.candidateUrls : []),
      ...urlsFromElement(input.element),
    ]);
    const stems = uniqueUrls(visualUrls.map(pinimgMediaStem).filter(Boolean));
    const pinIds = pinIdsFromElement(input.element);
    if (!stems.length && !pinIds.length) return [];

    const matched = [];
    for (const record of pageVideoRecords) {
      const stemMatched = stems.length && stems.some((stem) => record.stems.includes(stem));
      const pinMatched = pinIds.length && pinIds.some((id) => record.pinIds.includes(id));
      if (stemMatched || pinMatched) {
        matched.push(...record.videoUrls);
      }
    }
    return uniqueUrls(matched);
  }

  function nearbyPosterForVideo(videoUrl) {
    const videoFingerprint = assetFingerprint(videoUrl).replace(/^pinimg:/, "");
    let best = "";
    for (const asset of assets) {
      if (asset.type === "video") continue;
      const assetKey = assetFingerprint(asset.url).replace(/^pinimg:/, "");
      if (assetKey && videoFingerprint && (assetKey.includes(videoFingerprint.slice(0, 12)) || videoFingerprint.includes(assetKey.slice(0, 12)))) {
        best = asset.previewUrl || asset.url;
        break;
      }
    }
    if (best) return best;
    const firstImage = assets.find((asset) => asset.type !== "video" && (asset.previewUrl || asset.url));
    return firstImage?.previewUrl || firstImage?.url || "";
  }

  function visiblePosterForVideo(videoUrl) {
    const poster = nearbyPosterForVideo(videoUrl);
    if (!poster) {
      const firstVideoPoster = assets.find((asset) => asset.videoCandidatePoster && (asset.previewUrl || asset.url));
      return firstVideoPoster?.previewUrl || firstVideoPoster?.url || "";
    }
    const videoFingerprint = assetFingerprint(videoUrl).replace(/^pinimg:/, "");
    const posterFingerprint = assetFingerprint(poster).replace(/^pinimg:/, "");
    if (posterFingerprint && videoFingerprint && (
      posterFingerprint.includes(videoFingerprint.slice(0, 12)) ||
      videoFingerprint.includes(posterFingerprint.slice(0, 12))
    )) return poster;
    const firstVideoPoster = assets.find((asset) => asset.videoCandidatePoster && (asset.previewUrl || asset.url));
    return firstVideoPoster?.previewUrl || firstVideoPoster?.url || "";
  }

  function visualKeyForAsset(input, url, type) {
    const poster = input.poster || input.previewUrl || "";
    if (poster && type === "video") return `visual:${assetFingerprint(poster)}`;
    if (poster && type !== "video") return `visual:${assetFingerprint(poster)}`;
    const fingerprint = assetFingerprint(url);
    if (type === "video" && /\.m3u8(?:\?|$)/i.test(url)) {
      return `video:${fingerprint}`;
    }
    return `visual:${fingerprint}`;
  }

  function parseSrcset(srcset) {
    if (!srcset) return [];
    return srcset.split(",")
      .map((part) => {
        const [url, descriptor = ""] = part.trim().split(/\s+/);
        const score = Number.parseFloat(descriptor) || 1;
        const multiplier = descriptor.endsWith("w") ? 2 : descriptor.endsWith("x") ? 1000 : 1;
        return { url: absoluteUrl(cleanCandidateUrl(url)), score: score * multiplier };
      })
      .filter((item) => item.url)
      .sort((a, b) => b.score - a.score);
  }

  function buildUrlCandidates(inputUrl, improvedUrl) {
    const originalUrl = absoluteUrl(cleanCandidateUrl(inputUrl));
    const improved = absoluteUrl(cleanCandidateUrl(improvedUrl));
    const candidates = [improved, originalUrl];
    try {
      const parsed = new URL(originalUrl || improved, location.href);
      if (/pinimg\.com$/i.test(parsed.hostname)) {
        const sizeMatch = parsed.pathname.match(/\/(236x|474x|564x|736x|1200x|originals)\//);
        for (const size of ["1200x", "736x", "564x", "474x", "236x", "originals"]) {
          const copy = new URL(parsed.href);
          if (sizeMatch) copy.pathname = copy.pathname.replace(`/${sizeMatch[1]}/`, `/${size}/`);
          candidates.push(copy.href);
        }
        if (parsed.pathname.includes("/videos/thumbnails/")) {
          const copy = new URL(parsed.href);
          copy.pathname = copy.pathname.replace("/videos/thumbnails/", "/videos/mc/");
          candidates.push(copy.href);
        }
      }
      if (/huabanimg\.com$/i.test(parsed.hostname)) {
        const clean = new URL(parsed.href);
        clean.searchParams.delete("imageView2");
        clean.searchParams.delete("imageMogr2");
        clean.searchParams.delete("thumbnail");
        candidates.push(clean.href);
      }
    } catch {}
    return uniqueUrls(candidates);
  }

  const pageVideoRecords = buildPageVideoRecords();

  function videoCandidatesForAsset(input, originalUrl, url) {
    const base = buildUrlCandidates(originalUrl, url).filter(isDownloadableVideoUrl);
    const extra = Array.isArray(input.candidateUrls) ? input.candidateUrls : [];
    const observed = matchedObservedVideoGroup(input, originalUrl, url)
      .filter(isDownloadableVideoUrl);
    return uniqueUrls([...base, ...extra, ...observed]);
  }

  function addAsset(input) {
    const originalUrl = absoluteUrl(cleanCandidateUrl(input.url));
    const localUrl = originalUrl.startsWith("blob:") || originalUrl.startsWith("data:") ? originalUrl : "";
    const remoteFallback = absoluteUrl(cleanCandidateUrl(input.previewUrl || input.poster || ""));
    const sourceTag = String(input.source || "").toLowerCase();
    const sourceElementTag = input.element?.tagName?.toLowerCase() || "";
    const preserveVideoIntent = sourceTag === "video"
      || sourceTag === "video-source"
      || sourceTag === "page-json-video"
      || sourceElementTag === "video"
      || sourceElementTag === "source";
    const effectiveOriginalUrl = localUrl && !preserveVideoIntent ? remoteFallback : originalUrl;
    if (localUrl && !effectiveOriginalUrl) return;
    if (!localUrl && !shouldAcceptAssetUrl(effectiveOriginalUrl, { source: input.source || "generic", element: input.element || null })) return;
    const url = improveAssetUrl(effectiveOriginalUrl);
    if (!shouldAcceptAssetUrl(url, { source: input.source || "generic", element: input.element || null })) return;
    if (!url || seen.has(url)) return;
    let type = input.type || inferType(url);
    const rawCandidateUrls = uniqueUrls(Array.isArray(input.candidateUrls) ? input.candidateUrls : []);
    const rawVideoCandidates = type === "video"
      ? uniqueUrls([
          ...buildUrlCandidates(originalUrl, url).filter((candidate) => inferType(candidate, "") === "video"),
          ...rawCandidateUrls,
          ...matchedObservedVideoGroup(input, originalUrl, url),
        ]).filter(isDownloadableVideoUrl)
      : [];
    if (!preserveVideoIntent && type === "video" && !isDownloadableVideoUrl(originalUrl) && !isDownloadableVideoUrl(url) && !rawVideoCandidates.length) {
      type = inferType(url, "image");
    }
    const fingerprint = visualKeyForAsset(input, url, type);
    if (fingerprint && seenFingerprints.has(fingerprint) && type !== "video") return;
    seen.add(url);
    if (fingerprint) seenFingerprints.add(fingerprint);
    const id = `${type}-${assets.length}-${url}`;
    const visible = input.element ? visibleRectForElement(input.element) : null;
    const detailPageUrl = input.detailPageUrl || detailPageUrlFromElement(input.element);
    assets.push({
      id,
      url,
      localUrl,
      fallbackUrl: remoteFallback && remoteFallback !== url ? remoteFallback : "",
      candidateUrls: type === "video"
        ? rawVideoCandidates.length ? rawVideoCandidates : videoCandidatesForAsset(input, originalUrl, url)
        : uniqueUrls([
            ...buildUrlCandidates(originalUrl, url),
            input.previewUrl ? absoluteUrl(cleanCandidateUrl(input.previewUrl)) : "",
            input.poster ? absoluteUrl(cleanCandidateUrl(input.poster)) : "",
          ]),
      previewUrl: input.previewUrl ? absoluteUrl(cleanCandidateUrl(input.previewUrl)) : originalUrl,
      poster: input.poster ? absoluteUrl(cleanCandidateUrl(input.poster)) : "",
      type,
      pageUrl,
      detailPageUrl,
      pageTitle: document.title,
      alt: input.alt || "",
      title: input.title || "",
      width: input.width || null,
      height: input.height || null,
      screenTop: visible?.rect?.top ?? null,
      screenLeft: visible?.rect?.left ?? null,
      visibleArea: visible?.area ?? ((input.width || 0) * (input.height || 0)),
      fileName: fileNameFromUrl(url),
      host: hostFromUrl(url),
      source: input.source || "unknown",
      videoCandidatePoster: type === "video" && !!input.videoCandidatePoster,
    });
  }

  for (const video of visibleElements("video")) {
    const videoUrl = video.currentSrc || video.src || video.getAttribute("data-src") || video.getAttribute("data-video-src");
    if (isVideoUrl(videoUrl) || String(videoUrl || "").startsWith("blob:")) {
      let matchedVideos = matchedObservedVideoGroup({
        element: video,
        previewUrl: video.poster || video.getAttribute("poster") || "",
        poster: video.poster || video.getAttribute("poster") || "",
      }, videoUrl, videoUrl).filter(isDownloadableVideoUrl);
      addAsset({
        url: matchedVideos[0] || videoUrl,
        type: "video",
        poster: video.poster || video.getAttribute("poster") || "",
        previewUrl: video.poster || "",
        candidateUrls: matchedVideos,
        width: video.videoWidth || video.clientWidth || null,
        height: video.videoHeight || video.clientHeight || null,
        title: video.title || video.getAttribute("aria-label") || "",
        element: video,
        source: "video",
      });
    }
    for (const source of video.querySelectorAll("source[src]")) {
      const sourceUrl = source.src || source.getAttribute("data-src");
      if (isVideoUrl(sourceUrl) || String(sourceUrl || "").startsWith("blob:")) addAsset({ url: sourceUrl, type: "video", poster: video.poster || "", previewUrl: video.poster || "", element: source, source: "video-source" });
    }
  }

  for (const img of visibleElements("img")) {
    const cardUrls = collectVisibleCardUrls(img);
    const candidates = [
      ...parseSrcset(img.getAttribute("srcset")),
      ...parseSrcset(img.getAttribute("data-srcset")),
      ...parseSrcset(img.getAttribute("data-lazy-srcset")),
      ...cardUrls.map((url) => ({ url, score: isDownloadableVideoUrl(url) ? 3 : 2 })),
      ...lazyAttributes
        .filter((attr) => attr !== "href" && attr !== "content")
        .map((attr) => ({ url: absoluteUrl(cleanCandidateUrl(img.getAttribute(attr))), score: attr.includes("large") || attr.includes("full") ? 999999 : 1 })),
      { url: absoluteUrl(cleanCandidateUrl(img.currentSrc || img.src)), score: img.naturalWidth || img.width || 1 },
    ].filter((item) => item.url && shouldAcceptAssetUrl(item.url, { source: "img", element: img }));
    const best = candidates.sort((a, b) => b.score - a.score)[0];
    const isVideoCard = elementLooksLikeVideoCard(img);
    let matchedVideos = isVideoCard
      ? matchedObservedVideoGroup({ element: img, previewUrl: img.currentSrc || img.src || best?.url, poster: best?.url }, best?.url, best?.url)
      : [];
    if (isVideoCard && !matchedVideos.length) matchedVideos = cardUrls.filter(isDownloadableVideoUrl);
    matchedVideos = matchedVideos.filter(isDownloadableVideoUrl);
    addAsset({
      url: matchedVideos[0] || best?.url,
      type: matchedVideos.length ? "video" : inferType(best?.url || "", "image"),
      previewUrl: img.currentSrc || img.src || best?.url,
      poster: matchedVideos.length ? (img.currentSrc || img.src || best?.url) : "",
      candidateUrls: matchedVideos,
      alt: img.alt,
      title: img.title,
      width: img.naturalWidth || img.width || null,
      height: img.naturalHeight || img.height || null,
      element: img,
      videoCandidatePoster: isVideoCard,
      source: "img",
    });
  }

  for (const source of visibleElements("picture source, source[srcset]")) {
    const best = [...parseSrcset(source.getAttribute("srcset")), ...parseSrcset(source.getAttribute("data-srcset"))][0];
    if (best?.url && shouldAcceptAssetUrl(best.url, { source: "source-srcset", element: source })) {
      addAsset({ url: best.url, type: inferType(best.url || "", "image"), element: source, source: "source-srcset" });
    }
  }

  for (const element of visibleElements("a[href], [poster], [data-src], [data-original], [data-full], [data-full-url], [data-large], [data-large-url], [data-pin-media], [data-video-src]")) {
    for (const attr of lazyAttributes) {
      const value = element.getAttribute(attr);
      const url = absoluteUrl(cleanCandidateUrl(value));
      const strictLinkAttr = attr === "href" || attr === "content";
      if (strictLinkAttr && !hasMediaExtension(url) && !isLikelyMediaCdnUrl(url)) continue;
      if (!looksLikeMediaUrl(value) || !shouldAcceptAssetUrl(url, { source: `attr-${attr}`, element })) continue;
      const attrLooksVideo = attr.includes("video") || isDownloadableVideoUrl(url) || elementLooksLikeVideoCard(element);
      const matchedVideos = attrLooksVideo
        ? uniqueUrls([
            ...matchedObservedVideoGroup({ element, previewUrl: element.currentSrc || element.src || element.getAttribute("poster") || url, poster: element.getAttribute("poster") || url }, url, url),
            ...collectVisibleCardUrls(element).filter(isDownloadableVideoUrl),
          ])
        : [];
      const videoUrl = matchedVideos[0] || (isDownloadableVideoUrl(url) ? url : "");
      addAsset({
        url: videoUrl || url,
        type: videoUrl ? "video" : inferType(url, "image"),
        previewUrl: element.currentSrc || element.src || element.getAttribute("poster") || url,
        poster: videoUrl ? (element.currentSrc || element.src || element.getAttribute("poster") || url) : (element.getAttribute("poster") || ""),
        candidateUrls: matchedVideos,
        alt: element.getAttribute("alt") || element.getAttribute("aria-label") || "",
        title: element.getAttribute("title") || "",
        width: element.naturalWidth || element.clientWidth || null,
        height: element.naturalHeight || element.clientHeight || null,
        element,
        videoCandidatePoster: attrLooksVideo,
        source: `attr-${attr}`,
      });
    }
  }

  // JSON often contains off-screen recommendation/cache data. Keep current-screen
  // scanning strict; visible DOM nodes above provide the authoritative results.

  for (const element of visibleElements("[style]")) {
    const style = element.getAttribute("style") || "";
    const matches = [...style.matchAll(/url\((['"]?)(.*?)\1\)/g)];
    for (const match of matches) {
      if (!shouldAcceptAssetUrl(match[2], { source: "inline-background", element })) continue;
      addAsset({
        url: match[2],
        type: inferType(match[2], "background"),
        previewUrl: match[2],
        width: element.clientWidth || null,
        height: element.clientHeight || null,
        source: "inline-background",
      });
    }
  }

  for (const element of visibleElements("*")) {
    if (assets.length > 300) break;
    const background = getComputedStyle(element).backgroundImage;
    if (!background || background === "none") continue;
    const matches = [...background.matchAll(/url\(["']?(.*?)["']?\)/g)];
    for (const match of matches) {
      if (!shouldAcceptAssetUrl(match[1], { source: "computed-background", element })) continue;
      addAsset({
        url: match[1],
        type: inferType(match[1], "background"),
        previewUrl: match[1],
        width: element.clientWidth || null,
        height: element.clientHeight || null,
        source: "computed-background",
      });
    }
  }

  function assetVisualKey(asset) {
    return asset.poster || asset.previewUrl || asset.url;
  }

  function typePriority(type) {
    if (type === "video") return 3;
    if (type === "animation") return 2;
    return 1;
  }

  function videoQuality(asset) {
    if (asset.type !== "video") return 0;
    const urls = [asset.url, asset.localUrl, asset.fallbackUrl, ...(asset.candidateUrls || [])].filter(Boolean);
    if (urls.some((url) => /\.m3u8(?:[?#]|$)/i.test(url))) return 5;
    if (urls.some((url) => /\.(mp4|webm|mov|m4v|mkv|avi|ogv|3gp|3g2|ts)(?:[?#]|$)/i.test(url))) return 4;
    if (urls.some((url) => /^data:video\//i.test(url))) return 3;
    if (urls.some((url) => /^blob:/i.test(url))) return 2;
    return 1;
  }

  function assetKeepScore(asset) {
    return typePriority(asset.type) * 100 + videoQuality(asset);
  }

  const visualMap = new Map();
  for (const asset of assets) {
    const key = assetFingerprint(assetVisualKey(asset));
    const current = visualMap.get(key);
    if (!current || assetKeepScore(asset) > assetKeepScore(current)) {
      visualMap.set(key, asset);
    }
  }
  assets.splice(0, assets.length, ...visualMap.values());

  assets.sort((a, b) => {
    const aTop = Number.isFinite(a.screenTop) ? a.screenTop : 999999;
    const bTop = Number.isFinite(b.screenTop) ? b.screenTop : 999999;
    if (Math.abs(aTop - bTop) > 24) return aTop - bTop;
    const aLeft = Number.isFinite(a.screenLeft) ? a.screenLeft : 999999;
    const bLeft = Number.isFinite(b.screenLeft) ? b.screenLeft : 999999;
    if (Math.abs(aLeft - bLeft) > 24) return aLeft - bLeft;
    const aArea = (a.width || 0) * (a.height || 0);
    const bArea = (b.width || 0) * (b.height || 0);
    return bArea - aArea;
  });

  return {
    assets,
    blockedNotice: skippedTemporaryUrl
      ? "部分临时素材链接无法直接收藏，后续会通过桌面端截图/下载策略继续增强。"
      : "",
  };
}
