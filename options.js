const DEFAULT_SETTINGS = {
  language: "en",
  theme: "light",
  floatingPinned: false,
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
    title: "Human Typing Composer Settings",
    subtitle: "Move advanced controls here to keep popup focused on writing and launch.",
    openShortcutPage: "Open Chrome Shortcut Page",
    generalTitle: "General",
    language: "Language",
    theme: "Theme",
    themeLight: "Light",
    themeDark: "Dark",
    autoMarkdown: "Auto markdown font mode",
    enableDirectives: "Enable syntax directives by default",
    syntaxGuide: "Open syntax guide",
    enabled: "Enabled",
    typingTitle: "Typing Behavior",
    speedMin: "Min seconds / 100 chars",
    speedMax: "Max seconds / 100 chars",
    speedRandom: "Random speed in range",
    typoEnabled: "Enable typo simulation",
    typoMin: "Min typos / 100 chars",
    typoMax: "Max typos / 100 chars",
    wsEnabled: "Whitespace noise enabled",
    wsMin: "Min ws events / 100 chars",
    wsMax: "Max ws events / 100 chars",
    wsKeep: "Keep whitespace noise in final text",
    noiseFixMode: "Noise correction mode",
    noiseFixLegacy: "Legacy behavior",
    noiseFixOff: "Do not auto-correct",
    noiseFixImmediate: "Correct immediately",
    noiseFixDelayed: "Correct after delay",
    noiseFixRandom: "Random immediate/delayed",
    noiseFixDelayMin: "Correction delay min (ms)",
    noiseFixDelayMax: "Correction delay max (ms)",
    pauseMin: "Min pause (ms)",
    pauseMax: "Max pause (ms)",
    pauseCount: "Pause events / 100 chars",
    shortcutTitle: "Emergency Shortcuts",
    shortcutHint: "These are in-page shortcuts. You can also adjust global command shortcuts from Chrome shortcut page.",
    stopShortcut: "Stop typing shortcut",
    clearShortcut: "Clear output shortcut",
    aiTitle: "AI Rewrite (OpenAI-Compatible)",
    apiBaseUrl: "API Base URL",
    apiKey: "API Key",
    apiModel: "Model",
    deletedSentenceCount: "Deleted sentence target count",
    statusReady: "Ready",
    resetDefaults: "Reset Defaults",
    saveSettings: "Save Settings",
    statusSaved: "Settings saved."
  },
  zh: {
    title: "拟人输入编排器 - 设置",
    subtitle: "将高级配置放在此页面，让弹窗专注输入与启动。",
    openShortcutPage: "打开 Chrome 快捷键页面",
    generalTitle: "通用设置",
    language: "界面语言",
    theme: "主题",
    themeLight: "浅色",
    themeDark: "深色",
    autoMarkdown: "自动识别 Markdown 字体",
    enableDirectives: "默认启用语法指令",
    syntaxGuide: "打开语法说明",
    enabled: "启用",
    typingTitle: "输入行为",
    speedMin: "每 100 字最少秒数",
    speedMax: "每 100 字最多秒数",
    speedRandom: "在区间内随机速度",
    typoEnabled: "启用 typo 模拟",
    typoMin: "每 100 字最少错字数",
    typoMax: "每 100 字最多错字数",
    wsEnabled: "启用空白噪点",
    wsMin: "每 100 字最少空白次数",
    wsMax: "每 100 字最多空白次数",
    wsKeep: "保留空白噪点到最终文本",
    noiseFixMode: "噪点修正模式",
    noiseFixLegacy: "兼容旧行为",
    noiseFixOff: "不自动修正",
    noiseFixImmediate: "立即修正",
    noiseFixDelayed: "延迟后修正",
    noiseFixRandom: "随机立即/延迟",
    noiseFixDelayMin: "修正延迟最短（毫秒）",
    noiseFixDelayMax: "修正延迟最长（毫秒）",
    pauseMin: "最短停顿（毫秒）",
    pauseMax: "最长停顿（毫秒）",
    pauseCount: "每 100 字停顿次数",
    shortcutTitle: "紧急快捷键",
    shortcutHint: "这些是页面内快捷键；全局命令快捷键可在 Chrome 快捷键页面调整。",
    stopShortcut: "停止输入快捷键",
    clearShortcut: "清空输出快捷键",
    aiTitle: "AI 改写（兼容 OpenAI）",
    apiBaseUrl: "API 地址",
    apiKey: "API Key",
    apiModel: "模型",
    deletedSentenceCount: "删除句子目标次数",
    statusReady: "就绪",
    resetDefaults: "恢复默认",
    saveSettings: "保存设置",
    statusSaved: "设置已保存。"
  }
};

const elements = {};
let currentLanguage = "en";

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  bindEvents();
  const settings = await loadSettings();
  applySettingsToForm(settings);
  currentLanguage = settings.language || "en";
  applyTheme(settings.theme || "light");
  applyLanguage(currentLanguage);
}

function cacheElements() {
  const ids = [
    "openShortcutsBtn",
    "language",
    "theme",
    "autoMarkdown",
    "enableDirectives",
    "openSyntaxGuideBtn",
    "speedMinSec",
    "speedMaxSec",
    "speedRandom",
    "typoEnabled",
    "typoMin",
    "typoMax",
    "whitespaceEnabled",
    "whitespaceMin",
    "whitespaceMax",
    "whitespaceKeep",
    "noiseCorrectionMode",
    "noiseCorrectionDelayMinMs",
    "noiseCorrectionDelayMaxMs",
    "pauseMinMs",
    "pauseMaxMs",
    "pauseCountPer100",
    "stopShortcut",
    "clearShortcut",
    "apiBaseUrl",
    "apiKey",
    "apiModel",
    "deletedSentenceCount",
    "statusBar",
    "saveBtn",
    "resetDefaultsBtn"
  ];
  ids.forEach((id) => {
    elements[id] = document.getElementById(id);
  });
}

function bindEvents() {
  elements.openShortcutsBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  });
  elements.openSyntaxGuideBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("syntax-guide.html") });
  });
  elements.saveBtn.addEventListener("click", onSave);
  elements.resetDefaultsBtn.addEventListener("click", onReset);
  elements.language.addEventListener("change", () => {
    applyLanguage(elements.language.value || "en");
  });
  elements.theme.addEventListener("change", () => {
    applyTheme(elements.theme.value || "light");
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
  elements.language.value = settings.language;
  elements.theme.value = settings.theme || "light";
  elements.autoMarkdown.checked = Boolean(settings.autoMarkdown);
  elements.enableDirectives.checked = settings.enableDirectives !== false;
  elements.speedMinSec.value = settings.speedMinSec;
  elements.speedMaxSec.value = settings.speedMaxSec;
  elements.speedRandom.checked = Boolean(settings.speedRandom);
  elements.typoEnabled.checked = Boolean(settings.typoEnabled);
  elements.typoMin.value = settings.typoMin;
  elements.typoMax.value = settings.typoMax;
  elements.whitespaceEnabled.checked = Boolean(settings.whitespaceEnabled);
  elements.whitespaceMin.value = settings.whitespaceMin;
  elements.whitespaceMax.value = settings.whitespaceMax;
  elements.whitespaceKeep.checked = Boolean(settings.whitespaceKeep);
  elements.noiseCorrectionMode.value = settings.noiseCorrectionMode || DEFAULT_SETTINGS.noiseCorrectionMode;
  elements.noiseCorrectionDelayMinMs.value = settings.noiseCorrectionDelayMinMs;
  elements.noiseCorrectionDelayMaxMs.value = settings.noiseCorrectionDelayMaxMs;
  elements.pauseMinMs.value = settings.pauseMinMs;
  elements.pauseMaxMs.value = settings.pauseMaxMs;
  elements.pauseCountPer100.value = settings.pauseCountPer100;
  elements.stopShortcut.value = settings.stopShortcut;
  elements.clearShortcut.value = settings.clearShortcut;
  elements.apiBaseUrl.value = settings.apiBaseUrl;
  elements.apiKey.value = settings.apiKey;
  elements.apiModel.value = settings.apiModel;
  elements.deletedSentenceCount.value = settings.deletedSentenceCount;
}

function collectFormValues() {
  const speedMin = numberValue(elements.speedMinSec.value, 1, 600, DEFAULT_SETTINGS.speedMinSec);
  const speedMax = numberValue(elements.speedMaxSec.value, 1, 600, DEFAULT_SETTINGS.speedMaxSec);
  const typoMin = numberValue(elements.typoMin.value, 0, 100, DEFAULT_SETTINGS.typoMin);
  const typoMax = numberValue(elements.typoMax.value, 0, 100, DEFAULT_SETTINGS.typoMax);
  const wsMin = numberValue(elements.whitespaceMin.value, 0, 100, DEFAULT_SETTINGS.whitespaceMin);
  const wsMax = numberValue(elements.whitespaceMax.value, 0, 100, DEFAULT_SETTINGS.whitespaceMax);
  const correctionMin = numberValue(
    elements.noiseCorrectionDelayMinMs.value,
    0,
    20000,
    DEFAULT_SETTINGS.noiseCorrectionDelayMinMs
  );
  const correctionMax = numberValue(
    elements.noiseCorrectionDelayMaxMs.value,
    0,
    20000,
    DEFAULT_SETTINGS.noiseCorrectionDelayMaxMs
  );
  const pauseMin = numberValue(elements.pauseMinMs.value, 0, 20000, DEFAULT_SETTINGS.pauseMinMs);
  const pauseMax = numberValue(elements.pauseMaxMs.value, 0, 20000, DEFAULT_SETTINGS.pauseMaxMs);

  return {
    language: elements.language.value || "en",
    theme: elements.theme.value === "dark" ? "dark" : "light",
    autoMarkdown: elements.autoMarkdown.checked,
    enableDirectives: elements.enableDirectives.checked,
    speedRandom: elements.speedRandom.checked,
    speedMinSec: Math.min(speedMin, speedMax),
    speedMaxSec: Math.max(speedMin, speedMax),
    typoEnabled: elements.typoEnabled.checked,
    typoMin: Math.min(typoMin, typoMax),
    typoMax: Math.max(typoMin, typoMax),
    whitespaceEnabled: elements.whitespaceEnabled.checked,
    whitespaceMin: Math.min(wsMin, wsMax),
    whitespaceMax: Math.max(wsMin, wsMax),
    whitespaceKeep: elements.whitespaceKeep.checked,
    noiseCorrectionMode: normalizeNoiseCorrectionMode(elements.noiseCorrectionMode.value),
    noiseCorrectionDelayMinMs: Math.min(correctionMin, correctionMax),
    noiseCorrectionDelayMaxMs: Math.max(correctionMin, correctionMax),
    pauseMinMs: Math.min(pauseMin, pauseMax),
    pauseMaxMs: Math.max(pauseMin, pauseMax),
    pauseCountPer100: numberValue(elements.pauseCountPer100.value, 0, 20, DEFAULT_SETTINGS.pauseCountPer100),
    stopShortcut: normalizeShortcut(elements.stopShortcut.value, DEFAULT_SETTINGS.stopShortcut),
    clearShortcut: normalizeShortcut(elements.clearShortcut.value, DEFAULT_SETTINGS.clearShortcut),
    apiBaseUrl: (elements.apiBaseUrl.value || DEFAULT_SETTINGS.apiBaseUrl).trim(),
    apiKey: (elements.apiKey.value || "").trim(),
    apiModel: (elements.apiModel.value || DEFAULT_SETTINGS.apiModel).trim(),
    deletedSentenceCount: numberValue(elements.deletedSentenceCount.value, 0, 100, DEFAULT_SETTINGS.deletedSentenceCount)
  };
}

async function onSave() {
  try {
    const values = collectFormValues();
    await storageSet(values);
    currentLanguage = values.language;
    applyTheme(values.theme);
    applyLanguage(currentLanguage);
    setStatus("statusSaved", "success");
  } catch (error) {
    setStatus(error.message, "error", true);
  }
}

async function onReset() {
  applySettingsToForm(DEFAULT_SETTINGS);
  currentLanguage = DEFAULT_SETTINGS.language;
  applyTheme(DEFAULT_SETTINGS.theme);
  applyLanguage(currentLanguage);
  await storageSet(DEFAULT_SETTINGS);
  setStatus("statusSaved", "success");
}

function applyLanguage(language) {
  currentLanguage = I18N[language] ? language : "en";
  document.documentElement.lang = currentLanguage;
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.getAttribute("data-i18n");
    node.textContent = t(key);
  });
  document.querySelectorAll("option[data-i18n]").forEach((option) => {
    const key = option.getAttribute("data-i18n");
    if (key) {
      option.textContent = t(key);
    }
  });
}

function applyTheme(theme) {
  const safe = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = safe;
  if (elements.theme) {
    elements.theme.value = safe;
  }
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

function numberValue(value, min, max, fallback) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function normalizeShortcut(value, fallback) {
  const cleaned = (value || "").replace(/\s+/g, "");
  return cleaned || fallback;
}

function normalizeNoiseCorrectionMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "legacy" || mode === "off" || mode === "immediate" || mode === "delayed" || mode === "random") {
    return mode;
  }
  return DEFAULT_SETTINGS.noiseCorrectionMode;
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
