(() => {
  const panelId = "__asset_vault_collector_panel__";
  const panelVersion = "2026-06-28-panel-recreate";
  const storageKey = "assetVaultPanelSettings";
  const openOnly = window.__ASSET_VAULT_PANEL_OPEN_ONLY__ === true;
  window.__ASSET_VAULT_PANEL_OPEN_ONLY__ = false;
  const existing = document.getElementById(panelId);
  if (existing) {
    existing.remove();
    if (!openOnly) {
      chrome.runtime.sendMessage({ type: "panel-closed" }).catch(() => {});
      return;
    }
  }

  const panel = document.createElement("div");
  panel.id = panelId;
  panel.dataset.assetVaultPanelVersion = panelVersion;
  panel.style.position = "fixed";
  panel.style.top = "72px";
  panel.style.right = "24px";
  panel.style.width = "414px";
  panel.style.height = "650px";
  panel.style.zIndex = "2147483647";
  panel.style.border = "1px solid rgba(154, 167, 183, 0.42)";
  panel.style.borderRadius = "10px";
  panel.style.overflow = "hidden";
  panel.style.background = "#eef2f6";
  panel.style.boxShadow = "0 18px 48px rgba(30, 41, 59, 0.18), 0 2px 10px rgba(30, 41, 59, 0.1)";

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const minWidth = 360;
  const minHeight = 520;
  const maxWidth = 760;
  const maxHeight = 900;
  const collapsedWidth = 96;
  const collapsedHeight = 36;
  const collapsedMargin = 8;
  let panelSettings = {};
  let isCollapsed = false;
  let normalRect = { left: null, top: null, width: 414, height: 650 };
  chrome.storage?.local?.get(storageKey, (result) => {
    const settings = result?.[storageKey] || {};
    panelSettings = settings;
    const width = clamp(Number(settings.width) || 414, minWidth, Math.min(maxWidth, window.innerWidth - 16));
    const height = clamp(Number(settings.height) || 650, minHeight, Math.min(maxHeight, window.innerHeight - 16));
    const left = Number(settings.left);
    const top = Number(settings.top);
    normalRect = {
      left: Number.isFinite(left) ? left : null,
      top: Number.isFinite(top) ? top : 72,
      width,
      height,
    };
    panel.style.width = `${width}px`;
    panel.style.height = `${height}px`;
    if (Number.isFinite(left) && Number.isFinite(top)) {
      panel.style.left = `${clamp(left, 8, window.innerWidth - width - 8)}px`;
      panel.style.top = `${clamp(top, 8, window.innerHeight - height - 8)}px`;
      panel.style.right = "auto";
    }
    if (settings.collapsed) collapsePanel({ persist: false });
  });

  const iframe = document.createElement("iframe");
  iframe.src = chrome.runtime.getURL("popup.html?panel=1");
  iframe.title = "素材库网页收集助手";
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "0";
  iframe.style.display = "block";
  iframe.style.background = "transparent";
  panel.append(iframe);

  const collapsedButton = document.createElement("button");
  collapsedButton.type = "button";
  collapsedButton.title = "展开网页素材面板";
  collapsedButton.innerHTML = '<span>素材</span><svg aria-hidden="true" viewBox="0 0 16 16"><path d="M4.25 6.25 8 9.75l3.75-3.5" /></svg>';
  collapsedButton.style.position = "absolute";
  collapsedButton.style.inset = "0";
  collapsedButton.style.display = "none";
  collapsedButton.style.alignItems = "center";
  collapsedButton.style.justifyContent = "center";
  collapsedButton.style.gap = "7px";
  collapsedButton.style.width = "100%";
  collapsedButton.style.height = "100%";
  collapsedButton.style.padding = "0 14px";
  collapsedButton.style.border = "0";
  collapsedButton.style.borderRadius = "999px";
  collapsedButton.style.background = "#f8fafc";
  collapsedButton.style.color = "#1e293b";
  collapsedButton.style.font = '700 13px "Microsoft YaHei", "Segoe UI", sans-serif';
  collapsedButton.style.cursor = "pointer";
  collapsedButton.style.boxShadow = "inset 0 0 0 1px rgba(154, 167, 183, 0.35)";
  collapsedButton.style.userSelect = "none";
  collapsedButton.style.lineHeight = "1";
  const collapsedIcon = collapsedButton.querySelector("svg");
  collapsedIcon.style.display = "block";
  collapsedIcon.style.width = "16px";
  collapsedIcon.style.height = "16px";
  collapsedIcon.style.flex = "0 0 auto";
  collapsedIcon.style.fill = "none";
  collapsedIcon.style.stroke = "#5f83ad";
  collapsedIcon.style.strokeWidth = "2";
  collapsedIcon.style.strokeLinecap = "round";
  collapsedIcon.style.strokeLinejoin = "round";
  panel.append(collapsedButton);

  const resizeHandle = document.createElement("div");
  resizeHandle.title = "调整浮窗大小";
  resizeHandle.style.position = "absolute";
  resizeHandle.style.right = "0";
  resizeHandle.style.bottom = "0";
  resizeHandle.style.width = "20px";
  resizeHandle.style.height = "20px";
  resizeHandle.style.cursor = "nwse-resize";
  resizeHandle.style.zIndex = "2";
  resizeHandle.style.opacity = "0";
  resizeHandle.style.background = "transparent";
  panel.append(resizeHandle);
  document.documentElement.append(panel);

  function currentPanelRect() {
    const rect = panel.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }

  function persistPanelSettings(extra = {}) {
    panelSettings = {
      ...panelSettings,
      left: normalRect.left,
      top: normalRect.top,
      width: normalRect.width,
      height: normalRect.height,
      ...extra,
    };
    chrome.storage?.local?.set({ [storageKey]: panelSettings });
  }

  function collapsePanel({ persist = true } = {}) {
    if (isCollapsed) return;
    const rect = currentPanelRect();
    normalRect = {
      left: rect.left,
      top: rect.top,
      width: Math.max(minWidth, rect.width),
      height: Math.max(minHeight, rect.height),
    };
    isCollapsed = true;
    iframe.style.display = "none";
    resizeHandle.style.display = "none";
    collapsedButton.style.display = "inline-flex";
    panel.style.width = `${collapsedWidth}px`;
    panel.style.height = `${collapsedHeight}px`;
    panel.style.borderRadius = "999px";
    panel.style.background = "#f8fafc";
    panel.style.boxShadow = "0 10px 28px rgba(30, 41, 59, 0.16), 0 2px 8px rgba(30, 41, 59, 0.08)";
    const collapsedLeft = Number(panelSettings.collapsedLeft);
    const collapsedTop = Number(panelSettings.collapsedTop);
    panel.style.left = `${Number.isFinite(collapsedLeft) ? clamp(collapsedLeft, collapsedMargin, window.innerWidth - collapsedWidth - collapsedMargin) : clamp(rect.left + rect.width - collapsedWidth - collapsedMargin, collapsedMargin, window.innerWidth - collapsedWidth - collapsedMargin)}px`;
    panel.style.top = `${Number.isFinite(collapsedTop) ? clamp(collapsedTop, collapsedMargin, window.innerHeight - collapsedHeight - collapsedMargin) : clamp(rect.top, collapsedMargin, window.innerHeight - collapsedHeight - collapsedMargin)}px`;
    panel.style.right = "auto";
    if (persist) {
      const nextRect = panel.getBoundingClientRect();
      persistPanelSettings({ collapsed: true, collapsedLeft: nextRect.left, collapsedTop: nextRect.top });
    }
  }

  function expandPanel({ persist = true } = {}) {
    if (!isCollapsed) return;
    isCollapsed = false;
    const width = clamp(Number(normalRect.width) || 414, minWidth, Math.min(maxWidth, window.innerWidth - 16));
    const height = clamp(Number(normalRect.height) || 650, minHeight, Math.min(maxHeight, window.innerHeight - 16));
    const left = Number.isFinite(normalRect.left)
      ? clamp(normalRect.left, 8, window.innerWidth - width - 8)
      : clamp(window.innerWidth - width - 24, 8, window.innerWidth - width - 8);
    const top = clamp(Number(normalRect.top) || 72, 8, window.innerHeight - height - 8);
    collapsedButton.style.display = "none";
    iframe.style.display = "block";
    resizeHandle.style.display = "block";
    panel.style.width = `${width}px`;
    panel.style.height = `${height}px`;
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = "auto";
    panel.style.borderRadius = "10px";
    panel.style.background = "#eef2f6";
    panel.style.boxShadow = "0 18px 48px rgba(30, 41, 59, 0.18), 0 2px 10px rgba(30, 41, 59, 0.1)";
    normalRect = { left, top, width, height };
    if (persist) persistPanelSettings({ collapsed: false });
  }

  const dragState = {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    dx: 0,
    dy: 0,
    frame: 0,
  };
  const resizeState = {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    nextWidth: 0,
    nextHeight: 0,
    frame: 0,
  };

  function applyDrag() {
    dragState.frame = 0;
    const nextLeft = clamp(dragState.left + dragState.dx, 8, window.innerWidth - dragState.width - 8);
    const nextTop = clamp(dragState.top + dragState.dy, 8, window.innerHeight - dragState.height - 8);
    panel.style.transform = `translate3d(${nextLeft - dragState.left}px, ${nextTop - dragState.top}px, 0)`;
  }

  function commitDrag() {
    if (dragState.frame) {
      cancelAnimationFrame(dragState.frame);
      dragState.frame = 0;
    }
    const nextLeft = clamp(dragState.left + dragState.dx, 8, window.innerWidth - dragState.width - 8);
    const nextTop = clamp(dragState.top + dragState.dy, 8, window.innerHeight - dragState.height - 8);
    panel.style.left = `${nextLeft}px`;
    panel.style.top = `${nextTop}px`;
    panel.style.right = "auto";
    panel.style.transform = "translate3d(0, 0, 0)";
    dragState.left = nextLeft;
    dragState.top = nextTop;
    dragState.dx = 0;
    dragState.dy = 0;
    normalRect = {
      left: nextLeft,
      top: nextTop,
      width: dragState.width,
      height: dragState.height,
    };
    persistPanelSettings({ collapsed: false });
  }

  function savePanelSettings() {
    if (isCollapsed) {
      persistPanelSettings({ collapsed: true });
      return;
    }
    const rect = panel.getBoundingClientRect();
    normalRect = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
    persistPanelSettings({ collapsed: false });
  }

  function applyResize() {
    resizeState.frame = 0;
    panel.style.width = `${resizeState.nextWidth}px`;
    panel.style.height = `${resizeState.nextHeight}px`;
  }

  function commitResize() {
    if (resizeState.frame) {
      cancelAnimationFrame(resizeState.frame);
      resizeState.frame = 0;
    }
    panel.style.width = `${resizeState.nextWidth}px`;
    panel.style.height = `${resizeState.nextHeight}px`;
    iframe.style.pointerEvents = "auto";
    savePanelSettings();
  }

  window.addEventListener("message", (event) => {
    if (event.source !== iframe.contentWindow || event.data?.source !== "asset-vault-panel") return;
    if (event.data.type === "close") {
      panel.remove();
      chrome.runtime.sendMessage({ type: "panel-closed" }).catch(() => {});
      return;
    }
    if (event.data.type === "collapse") {
      collapsePanel();
      return;
    }
    if (event.data.type === "drag-start") {
      const rect = panel.getBoundingClientRect();
      dragState.x = Number(event.data.x || 0);
      dragState.y = Number(event.data.y || 0);
      dragState.left = rect.left;
      dragState.top = rect.top;
      dragState.width = rect.width;
      dragState.height = rect.height;
      dragState.dx = 0;
      dragState.dy = 0;
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;
      panel.style.right = "auto";
      panel.style.willChange = "transform";
      return;
    }
    if (event.data.type === "drag-end") {
      commitDrag();
      panel.style.willChange = "auto";
      return;
    }
    if (event.data.type !== "drag") return;
    dragState.dx = Number(event.data.x || 0) - dragState.x;
    dragState.dy = Number(event.data.y || 0) - dragState.y;
    if (!dragState.frame) dragState.frame = requestAnimationFrame(applyDrag);
  });

  resizeHandle.addEventListener("pointerdown", (event) => {
    if (isCollapsed) return;
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = panel.getBoundingClientRect();
    resizeState.x = event.clientX;
    resizeState.y = event.clientY;
    resizeState.left = rect.left;
    resizeState.top = rect.top;
    resizeState.width = rect.width;
    resizeState.height = rect.height;
    resizeState.nextWidth = rect.width;
    resizeState.nextHeight = rect.height;
    iframe.style.pointerEvents = "none";
    resizeHandle.setPointerCapture(event.pointerId);
  });

  resizeHandle.addEventListener("pointermove", (event) => {
    if (isCollapsed) return;
    if (!resizeHandle.hasPointerCapture?.(event.pointerId)) return;
    const maxAllowedWidth = Math.min(maxWidth, window.innerWidth - resizeState.left - 8);
    const maxAllowedHeight = Math.min(maxHeight, window.innerHeight - resizeState.top - 8);
    resizeState.nextWidth = clamp(resizeState.width + event.clientX - resizeState.x, minWidth, maxAllowedWidth);
    resizeState.nextHeight = clamp(resizeState.height + event.clientY - resizeState.y, minHeight, maxAllowedHeight);
    if (!resizeState.frame) resizeState.frame = requestAnimationFrame(applyResize);
  });

  const stopResize = (event) => {
    if (!resizeHandle.hasPointerCapture?.(event.pointerId)) return;
    resizeHandle.releasePointerCapture(event.pointerId);
    commitResize();
  };

  resizeHandle.addEventListener("pointerup", stopResize);
  resizeHandle.addEventListener("pointercancel", stopResize);
  let suppressCollapsedClick = false;
  collapsedButton.addEventListener("click", () => {
    if (suppressCollapsedClick) {
      suppressCollapsedClick = false;
      return;
    }
    expandPanel();
  });
  let collapsedDrag = null;
  collapsedButton.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const rect = panel.getBoundingClientRect();
    collapsedDrag = {
      x: event.clientX,
      y: event.clientY,
      left: rect.left,
      top: rect.top,
      moved: false,
    };
    collapsedButton.setPointerCapture(event.pointerId);
  });
  collapsedButton.addEventListener("pointermove", (event) => {
    if (!collapsedDrag || !collapsedButton.hasPointerCapture?.(event.pointerId)) return;
    const dx = event.clientX - collapsedDrag.x;
    const dy = event.clientY - collapsedDrag.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) collapsedDrag.moved = true;
    panel.style.left = `${clamp(collapsedDrag.left + dx, collapsedMargin, window.innerWidth - collapsedWidth - collapsedMargin)}px`;
    panel.style.top = `${clamp(collapsedDrag.top + dy, collapsedMargin, window.innerHeight - collapsedHeight - collapsedMargin)}px`;
    panel.style.right = "auto";
  });
  const stopCollapsedDrag = (event) => {
    if (!collapsedDrag) return;
    const moved = collapsedDrag.moved;
    if (collapsedButton.hasPointerCapture?.(event.pointerId)) collapsedButton.releasePointerCapture(event.pointerId);
    collapsedDrag = null;
    const rect = panel.getBoundingClientRect();
    persistPanelSettings({ collapsed: true, collapsedLeft: rect.left, collapsedTop: rect.top });
    if (moved) suppressCollapsedClick = true;
    if (!moved) expandPanel();
  };
  collapsedButton.addEventListener("pointerup", stopCollapsedDrag);
  collapsedButton.addEventListener("pointercancel", stopCollapsedDrag);
})();
