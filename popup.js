const DEFAULT_SETTINGS = {
  language: "en",
  theme: "light",
  floatingPinned: false,
  sourceText: "",
  autoMarkdown: true,
  enableDirectives: true,
  speedRandom: true,
  speedMinSec: 35,
  speedMaxSec: 65,
  typoEnabled: true,
  typoMin: 1,
  typoMax: 4,
  whitespaceEnabled: false,
  whitespaceMin: 0,
  whitespaceMax: 2,
  whitespaceKeep: false,
  noiseCorrectionMode: "legacy",
  noiseCorrectionDelayMinMs: 500,
  noiseCorrectionDelayMaxMs: 2200,
  pauseMinMs: 400,
  pauseMaxMs: 1300,
  pauseCountPer100: 5,
  stopShortcut: "Ctrl+Shift+X",
  clearShortcut: "Ctrl+Shift+Y",
  apiBaseUrl: "https://api.openai.com/v1",
  apiKey: "",
  apiModel: "gpt-4o-mini",
  deletedSentenceCount: 2
};

const I18N = {
  en: {
    appTitle: "Human Typing Composer",
    appSubtitle: "Type naturally, one character at a time.",
    themeLight: "Light",
    themeDark: "Dark",
    pinOn: "Pin floating panel",
    pinOff: "Unpin floating panel",
    inputTitle: "Input Text",
    inputLabel: "Text / Markdown",
    inputPlaceholder: "Paste the text you want to type...",
    autoMarkdown: "Auto markdown font mode",
    markdownOff: "Plain text mode",
    markdownOn: "Markdown font mode",
    enableDirectives: "Enable syntax directives",
    syntaxSummary: "Custom writing syntax",
    syntaxIntro: "Directives are optional. When used, built-in random typo/whitespace/pause noise is disabled.",
    syntaxGuide: "Open Syntax Guide",
    rewriteWithAi: "Rewrite with AI",
    progressTitle: "Progress",
    progressIdle: "Idle",
    progressRunning: "Running",
    progressDone: "Done",
    progressStopped: "Stopped",
    progressEtaUnknown: "ETA --:--",
    progressFinishUnknown: "Estimated finish: --",
    progressFinishAt: "Estimated finish:",
    lockReady: "Target highlighted. Confirm to start.",
    lockTargetPrefix: "Target",
    confirmStart: "Confirm Start",
    cancelLock: "Cancel",
    statusPinnedOn: "Floating panel pinned on page.",
    statusPinnedOff: "Floating panel unpinned.",
    statusReady: "Ready",
    saveInput: "Save Input",
    stopTyping: "Stop",
    clearTyping: "Cancel & Clear",
    startTyping: "Start Typing",
    statusSaved: "Input saved.",
    statusStarted: "Typing started in current page.",
    statusStopped: "Emergency stop sent.",
    statusCleared: "Emergency clear sent.",
    statusNeedText: "Please enter text first.",
    statusNeedApiKey: "Please set API Key in Settings first.",
    statusAiRunning: "AI rewriting in progress...",
    statusAiDone: "AI rewrite finished.",
    statusAiEmpty: "AI returned empty content.",
    statusRestrictedPage: "Current tab does not allow extension injection (for example chrome:// pages).",
    statusStartFailed: "Failed to start typing.",
    statusStopFailed: "Failed to stop typing.",
    statusClearFailed: "Failed to clear typing output.",
    statusRewriteFailed: "AI rewrite failed.",
    statusSendFailed: "Unable to send command.",
    statusLockFailed: "Unable to lock target."
  },
  zh: {
    appTitle: "拟人输入编排器",
    appSubtitle: "逐字符模拟真实键盘输入。",
    themeLight: "浅色",
    themeDark: "深色",
    pinOn: "固定悬浮窗",
    pinOff: "取消固定悬浮窗",
    inputTitle: "输入区",
    inputLabel: "文本 / Markdown",
    inputPlaceholder: "粘贴你希望自动输入的内容...",
    autoMarkdown: "自动识别 Markdown 并切换字体",
    markdownOff: "普通文本模式",
    markdownOn: "Markdown 字体模式",
    enableDirectives: "启用语法指令",
    syntaxSummary: "自定义笔法语法",
    syntaxIntro: "语法是可选的。启用并使用后，会自动关闭内置随机 typo/空白噪点/停顿。",
    syntaxGuide: "打开语法说明",
    rewriteWithAi: "使用 AI 改写",
    progressTitle: "进度",
    progressIdle: "空闲",
    progressRunning: "运行中",
    progressDone: "完成",
    progressStopped: "已停止",
    progressEtaUnknown: "剩余 --:--",
    progressFinishUnknown: "预计完成时间：--",
    progressFinishAt: "预计完成时间：",
    lockReady: "目标已高亮，请确认后开始。",
    lockTargetPrefix: "目标",
    confirmStart: "确认开始",
    cancelLock: "取消",
    statusPinnedOn: "已固定页面悬浮窗。",
    statusPinnedOff: "已取消固定悬浮窗。",
    statusReady: "就绪",
    saveInput: "保存输入",
    stopTyping: "停止",
    clearTyping: "取消并清空",
    startTyping: "开始输入",
    statusSaved: "输入已保存。",
    statusStarted: "已在当前页面开始输入。",
    statusStopped: "已发送紧急停止。",
    statusCleared: "已发送取消清空。",
    statusNeedText: "请先输入文本内容。",
    statusNeedApiKey: "请先在设置页填写 API Key。",
    statusAiRunning: "AI 正在改写...",
    statusAiDone: "AI 改写完成。",
    statusAiEmpty: "AI 返回了空内容。",
    statusRestrictedPage: "当前页面不支持注入扩展（例如 chrome:// 页面）。",
    statusStartFailed: "开始输入失败。",
    statusStopFailed: "停止失败。",
    statusClearFailed: "清空失败。",
    statusRewriteFailed: "AI 改写失败。",
    statusSendFailed: "无法发送指令。",
    statusLockFailed: "锁定目标失败。"
  }
};

const elements = {};
let currentLanguage = "en";
let activeTabId = null;
let currentSessionId = null;
let statusPollTimerId = 0;
let pendingLockId = null;
let pendingLockExpiresAt = 0;
let pendingTargetLabel = "--";

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  bindEvents();
  const settings = await loadSettings();
  applySettingsToForm(settings);
  currentLanguage = settings.language || "en";
  applyTheme(settings.theme || "light");
  applyPinState(Boolean(settings.floatingPinned));
  applyLanguage(currentLanguage);
  updateMarkdownMode();
  resetProgressUi();
  resetLockPanel();
  await refreshActiveTabStatus();
  if (statusPollTimerId) {
    window.clearInterval(statusPollTimerId);
  }
  statusPollTimerId = window.setInterval(() => {
    void refreshActiveTabStatus();
  }, 900);

  chrome.runtime.onMessage.addListener((message, sender) => {
    if (!message || message.type !== "TYPING_PROGRESS") {
      return;
    }
    if (typeof activeTabId === "number" && sender && sender.tab && sender.tab.id !== activeTabId) {
      return;
    }
    updateProgressUi(message.payload || {});
  });

  window.addEventListener("beforeunload", () => {
    if (statusPollTimerId) {
      window.clearInterval(statusPollTimerId);
      statusPollTimerId = 0;
    }
  });
}

function cacheElements() {
  const ids = [
    "pinToggleBtn",
    "themeToggleBtn",
    "openSettingsBtn",
    "sourceText",
    "autoMarkdown",
    "enableDirectives",
    "markdownBadge",
    "openSyntaxGuideBtn",
    "rewriteWithAiBtn",
    "progressStatus",
    "progressFill",
    "progressPercent",
    "progressEta",
    "progressFinishAt",
    "saveInputBtn",
    "stopTypingBtn",
    "clearTypingBtn",
    "startTypingBtn",
    "lockPanel",
    "lockTargetLabel",
    "confirmStartBtn",
    "cancelLockBtn",
    "statusBar"
  ];
  ids.forEach((id) => {
    elements[id] = document.getElementById(id);
  });
}

function bindEvents() {
  elements.pinToggleBtn.addEventListener("click", onPinToggle);
  elements.themeToggleBtn.addEventListener("click", onThemeToggle);
  elements.openSettingsBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
  elements.sourceText.addEventListener("input", updateMarkdownMode);
  elements.autoMarkdown.addEventListener("change", updateMarkdownMode);
  elements.openSyntaxGuideBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("syntax-guide.html") });
  });
  elements.saveInputBtn.addEventListener("click", onSaveInput);
  elements.startTypingBtn.addEventListener("click", onStartTyping);
  elements.stopTypingBtn.addEventListener("click", onStopTyping);
  elements.clearTypingBtn.addEventListener("click", onClearTyping);
  elements.rewriteWithAiBtn.addEventListener("click", onRewriteWithAi);
  elements.confirmStartBtn.addEventListener("click", onConfirmStart);
  elements.cancelLockBtn.addEventListener("click", onCancelLock);
  window.addEventListener("beforeunload", () => {
    void clearTargetPreview();
  });
}

async function loadSettings() {
  const stored = await storageGet(Object.keys(DEFAULT_SETTINGS));
  return {
    ...DEFAULT_SETTINGS,
    ...stored
  };
}

function applySettingsToForm(settings) {
  elements.sourceText.value = settings.sourceText || "";
  elements.autoMarkdown.checked = Boolean(settings.autoMarkdown);
  elements.enableDirectives.checked = settings.enableDirectives !== false;
}

function collectPopupValues() {
  return {
    sourceText: elements.sourceText.value || "",
    autoMarkdown: elements.autoMarkdown.checked,
    enableDirectives: elements.enableDirectives.checked
  };
}

function updateMarkdownMode() {
  const isMarkdown = elements.autoMarkdown.checked && looksLikeMarkdown(elements.sourceText.value);
  elements.sourceText.classList.toggle("markdown-mode", isMarkdown);
  elements.markdownBadge.classList.toggle("active", isMarkdown);
  elements.markdownBadge.textContent = isMarkdown ? t("markdownOn") : t("markdownOff");
}

function looksLikeMarkdown(text) {
  if (!text) {
    return false;
  }
  const patterns = [
    /^#{1,6}\s+/m,
    /^\s*[-*+]\s+/m,
    /^\s*\d+\.\s+/m,
    /\*\*[^*]+\*\*/,
    /`{1,3}[^`]+`{1,3}/,
    /\[[^\]]+\]\([^)]+\)/,
    /^>\s+/m
  ];
  return patterns.some((pattern) => pattern.test(text));
}

async function onSaveInput() {
  try {
    await storageSet(collectPopupValues());
    setStatus("statusSaved", "success");
  } catch (error) {
    setStatus(`${t("statusSendFailed")} ${error.message}`, "error", true);
  }
}

async function onStartTyping() {
  const popupValues = collectPopupValues();
  if (!popupValues.sourceText.trim()) {
    setStatus("statusNeedText", "error");
    return;
  }

  try {
    const baseSettings = await loadSettings();
    const settings = {
      ...baseSettings,
      ...popupValues
    };
    await storageSet(popupValues);
    if (pendingLockId && Date.now() > pendingLockExpiresAt) {
      await clearTargetPreview();
      resetLockPanel();
    }
    if (!pendingLockId) {
      await lockTarget(settings);
      return;
    }
    await startTypingWithLock(settings);
  } catch (error) {
    setStatus(formatRuntimeError(error, "statusStartFailed"), "error", true);
  }
}

async function onConfirmStart() {
  try {
    if (!pendingLockId) {
      setStatus("statusLockFailed", "error");
      return;
    }
    const baseSettings = await loadSettings();
    const popupValues = collectPopupValues();
    const settings = {
      ...baseSettings,
      ...popupValues
    };
    await startTypingWithLock(settings);
  } catch (error) {
    setStatus(formatRuntimeError(error, "statusStartFailed"), "error", true);
  }
}

async function lockTarget(settings) {
  const tab = await getActiveTab();
  activeTabId = tab.id;
  const response = await sendMessageToTab(tab.id, {
    type: "PREVIEW_TARGET",
    settings
  });

  if (!response || response.ok !== true || !response.lockId) {
    const message = response && response.error ? response.error : t("statusLockFailed");
    throw new Error(message);
  }

  pendingLockId = response.lockId;
  pendingLockExpiresAt = Number(response.expiresAt) || Date.now() + 15000;
  pendingTargetLabel = response.targetLabel || "--";
  elements.lockTargetLabel.textContent = `${t("lockTargetPrefix")}: ${pendingTargetLabel}`;
  elements.lockPanel.classList.remove("hidden");
  setStatus("lockReady", "success");
}

async function startTypingWithLock(settings) {
  const tab = await getActiveTab();
  activeTabId = tab.id;
  const response = await sendMessageToTab(tab.id, {
    type: "START_TYPING",
    settings,
    lockId: pendingLockId
  });

  if (!response || response.ok !== true) {
    const message = response && response.error ? response.error : t("statusStartFailed");
    throw new Error(message);
  }

  currentSessionId = response.sessionId || null;
  updateProgressUi({
    status: "running",
    progress: 0,
    etaMs: response.estimatedDurationMs || 0,
    estimatedDurationMs: response.estimatedDurationMs || 0,
    elapsedMs: 0,
    sessionId: response.sessionId || null
  });
  setStatus("statusStarted", "success");
  resetLockPanel();
  window.setTimeout(() => {
    window.close();
  }, 50);
}

async function onCancelLock() {
  await clearTargetPreview();
  resetLockPanel();
}

function resetLockPanel() {
  pendingLockId = null;
  pendingLockExpiresAt = 0;
  pendingTargetLabel = "--";
  elements.lockPanel.classList.add("hidden");
  elements.lockTargetLabel.textContent = `${t("lockTargetPrefix")}: ${pendingTargetLabel}`;
}

async function clearTargetPreview() {
  try {
    const tab = await getActiveTab();
    if (typeof tab.id !== "number") {
      return;
    }
    await sendMessageToTab(tab.id, {
      type: "CLEAR_TARGET_PREVIEW"
    });
  } catch (_error) {
    // ignore preview cleanup errors
  }
}

async function onStopTyping() {
  try {
    const tab = await getActiveTab();
    activeTabId = tab.id;
    await sendMessageToTab(tab.id, { type: "EMERGENCY_STOP" });
    setStatus("statusStopped", "success");
  } catch (error) {
    setStatus(formatRuntimeError(error, "statusStopFailed"), "error", true);
  }
}

async function onClearTyping() {
  try {
    const tab = await getActiveTab();
    activeTabId = tab.id;
    await sendMessageToTab(tab.id, { type: "EMERGENCY_CLEAR" });
    setStatus("statusCleared", "success");
  } catch (error) {
    setStatus(formatRuntimeError(error, "statusClearFailed"), "error", true);
  } finally {
    resetLockPanel();
  }
}

async function onRewriteWithAi() {
  const popupValues = collectPopupValues();
  if (!popupValues.sourceText.trim()) {
    setStatus("statusNeedText", "error");
    return;
  }

  const settings = await loadSettings();
  if (!settings.apiKey) {
    setStatus("statusNeedApiKey", "error");
    return;
  }

  elements.rewriteWithAiBtn.disabled = true;
  setStatus("statusAiRunning", "neutral");
  try {
    const merged = {
      ...settings,
      ...popupValues
    };
    const rewritten = await rewriteTextWithAi(merged.sourceText, merged);
    elements.sourceText.value = rewritten;
    updateMarkdownMode();
    await storageSet({
      sourceText: rewritten,
      autoMarkdown: merged.autoMarkdown,
      enableDirectives: merged.enableDirectives
    });
    setStatus("statusAiDone", "success");
  } catch (error) {
    setStatus(`${t("statusRewriteFailed")} ${error.message}`, "error", true);
  } finally {
    elements.rewriteWithAiBtn.disabled = false;
  }
}

async function rewriteTextWithAi(sourceText, settings) {
  const url = buildChatCompletionsUrl(settings.apiBaseUrl);
  if (!url) {
    throw new Error("Invalid API URL.");
  }

  const directiveGuidance = settings.enableDirectives
    ? [
        "You may use these directives:",
        "1) [[rev:draft=>final]]",
        "2) [[del:text]]",
        "3) [[pause:1200]] or [[pause:600-1500]]",
        "4) [[choice:a||b||c]]",
        "5) [[chance:35|text]]",
        "6) [[repeat:2|text]]",
        "7) [[speed:20-45]] and [[speed:default]]",
        "8) [[typo:on/off/default/2-5]]",
        "9) [[ws:on/off/default/1-3/keep/drop]]",
        "10) [[fix:off/immediate/delayed/random/default]]",
        "11) [[fixdelay:300-1800]]",
        "12) [[back:12]]",
        "13) [[raw:literal [[text]]]]",
        "14) [[note:any comment]]",
        "15) Escape literals with backslash: \\[[  \\]]  \\|"
      ].join("\n")
    : "Directive mode is disabled. Output plain natural text without any [[...]] directives.";

  const systemPrompt = [
    "You are editing text for a browser typing simulator.",
    "Preserve the author's tone, style, and rhythm.",
    "Output plain text only (no markdown fences and no explanations).",
    "When directives are present, built-in random typo/whitespace/pause noise is disabled by the extension.",
    directiveGuidance,
    "Rules:",
    "- Keep punctuation natural.",
    "- Keep content coherent.",
    "- Do not output any extra notes."
  ].join("\n");

  const userPrompt = [
    `Deleted sentence events target: ${settings.deletedSentenceCount}.`,
    "Rewrite the following text while keeping its original voice.",
    "Original text:",
    sourceText
  ].join("\n\n");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.apiModel || DEFAULT_SETTINGS.apiModel,
      temperature: 0.8,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data && data.error && data.error.message ? data.error.message : `HTTP ${response.status}`;
    throw new Error(message);
  }

  const content = data && data.choices && data.choices[0] && data.choices[0].message
    ? String(data.choices[0].message.content || "").trim()
    : "";

  if (!content) {
    throw new Error(t("statusAiEmpty"));
  }

  return stripCodeFence(content);
}

function stripCodeFence(text) {
  const fenced = text.match(/^```(?:\w+)?\s*([\s\S]*?)```$/);
  if (fenced) {
    return fenced[1].trim();
  }
  return text;
}

function buildChatCompletionsUrl(rawBaseUrl) {
  let base = String(rawBaseUrl || "").trim();
  if (!base) {
    return "";
  }
  base = base.replace(/\/+$/, "");
  if (base.endsWith("/chat/completions")) {
    return base;
  }
  if (/\/v\d+(\.\d+)?$/.test(base)) {
    return `${base}/chat/completions`;
  }
  return `${base}/v1/chat/completions`;
}

async function refreshActiveTabStatus() {
  try {
    const tab = await getActiveTab();
    activeTabId = tab.id;
    const response = await sendMessageToTab(tab.id, {
      type: "GET_TYPING_STATUS"
    });
    if (response && response.ok && response.payload) {
      updateProgressUi(response.payload);
    }
  } catch (_error) {
    resetProgressUi();
  }
}

function updateProgressUi(payload) {
  const status = payload.status || "idle";
  const progress = clamp01(Number(payload.progress) || 0);
  const progressPct = Math.round(progress * 100);
  const etaMs = Math.max(0, Number(payload.etaMs) || 0);
  const estimatedDurationMs = Math.max(0, Number(payload.estimatedDurationMs) || 0);

  if (payload.sessionId) {
    currentSessionId = payload.sessionId;
  }
  if (currentSessionId && payload.sessionId && payload.sessionId !== currentSessionId) {
    return;
  }

  elements.progressFill.style.width = `${progressPct}%`;
  const track = elements.progressFill.parentElement;
  if (track) {
    track.setAttribute("aria-valuenow", String(progressPct));
  }
  elements.progressPercent.textContent = `${progressPct}%`;
  elements.progressEta.textContent = etaMs > 0 ? `ETA ${formatDuration(etaMs)}` : t("progressEtaUnknown");

  const finishAt = etaMs > 0 ? new Date(Date.now() + etaMs) : null;
  elements.progressFinishAt.textContent = finishAt
    ? `${t("progressFinishAt")} ${finishAt.toLocaleTimeString()}`
    : t("progressFinishUnknown");

  elements.progressStatus.classList.remove("idle", "running", "done", "stopped");
  if (status === "running") {
    elements.progressStatus.classList.add("running");
    elements.progressStatus.textContent = t("progressRunning");
  } else if (status === "completed") {
    elements.progressStatus.classList.add("done");
    elements.progressStatus.textContent = t("progressDone");
    elements.progressFill.style.width = "100%";
    elements.progressPercent.textContent = "100%";
    elements.progressEta.textContent = "ETA 00:00";
    elements.progressFinishAt.textContent = `${t("progressFinishAt")} ${new Date().toLocaleTimeString()}`;
  } else if (status === "stopped" || status === "error") {
    elements.progressStatus.classList.add("stopped");
    elements.progressStatus.textContent = t("progressStopped");
  } else {
    elements.progressStatus.classList.add("idle");
    elements.progressStatus.textContent = t("progressIdle");
    if (!estimatedDurationMs) {
      elements.progressEta.textContent = t("progressEtaUnknown");
      elements.progressFinishAt.textContent = t("progressFinishUnknown");
    }
  }
}

function resetProgressUi() {
  updateProgressUi({
    status: "idle",
    progress: 0,
    etaMs: 0,
    estimatedDurationMs: 0
  });
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function applyLanguage(language) {
  currentLanguage = I18N[language] ? language : "en";
  document.documentElement.lang = currentLanguage;
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.getAttribute("data-i18n");
    node.textContent = t(key);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    const key = node.getAttribute("data-i18n-placeholder");
    node.setAttribute("placeholder", t(key));
  });
  applyTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  applyPinState(elements.pinToggleBtn.classList.contains("active"));
  elements.lockTargetLabel.textContent = `${t("lockTargetPrefix")}: ${pendingTargetLabel}`;
}

async function onThemeToggle() {
  const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  await storageSet({ theme: next });
}

async function onPinToggle() {
  const isPinned = elements.pinToggleBtn.classList.contains("active");
  const next = !isPinned;
  try {
    const tab = await getActiveTab();
    await sendMessageToTab(tab.id, {
      type: "SET_FLOATING_PANEL",
      enabled: next
    });
    await storageSet({
      floatingPinned: next
    });
    applyPinState(next);
    setStatus(next ? "statusPinnedOn" : "statusPinnedOff", next ? "success" : "neutral");
  } catch (error) {
    setStatus(formatRuntimeError(error, "statusSendFailed"), "error", true);
  }
}

function applyTheme(theme) {
  const safe = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = safe;
  if (elements.themeToggleBtn) {
    elements.themeToggleBtn.textContent = safe === "dark" ? "L" : "D";
    elements.themeToggleBtn.title = safe === "dark" ? t("themeLight") : t("themeDark");
  }
}

function applyPinState(pinned) {
  elements.pinToggleBtn.classList.toggle("active", Boolean(pinned));
  elements.pinToggleBtn.textContent = "📌";
  elements.pinToggleBtn.title = Boolean(pinned) ? t("pinOff") : t("pinOn");
}

function t(key) {
  const table = I18N[currentLanguage] || I18N.en;
  return table[key] || I18N.en[key] || key;
}

function setStatus(textOrKey, type = "neutral", literal = false) {
  const text = literal ? textOrKey : t(textOrKey);
  elements.statusBar.textContent = text;
  elements.statusBar.classList.remove("neutral", "success", "error");
  elements.statusBar.classList.add(type);
}

function formatRuntimeError(error, fallbackKey) {
  const message = error && error.message ? error.message : t(fallbackKey);
  if (
    message.includes("Receiving end does not exist") ||
    message.includes("Could not establish connection")
  ) {
    return t("statusRestrictedPage");
  }
  return `${t(fallbackKey)} ${message}`;
}

function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      resolve(result || {});
    });
  });
}

function storageSet(values) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

function getActiveTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      if (!tabs || !tabs[0] || typeof tabs[0].id !== "number") {
        reject(new Error("No active tab found."));
        return;
      }
      resolve(tabs[0]);
    });
  });
}

function sendMessageToTab(tabId, payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "ROUTE_TAB_MESSAGE",
        tabId,
        payload
      },
      (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response);
      }
    );
  });
}
