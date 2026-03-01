(() => {
  const DEFAULT_SETTINGS = {
    language: "en",
    sourceText: "",
    enableDirectives: true,
    theme: "light",
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
    clearShortcut: "Ctrl+Shift+Y"
  };

  const CONTENT_I18N = {
    en: {
      noEditable: "No editable target is focused. Click the target field and retry.",
      noEditableFallback: "No focused input found. No visible editable area is available on this page.",
      started: "Typing started.",
      completed: "Typing completed.",
      stopped: "Typing stopped.",
      stopQueued: "Emergency stop requested.",
      targetGone: "Target element is no longer available.",
      noClearableOutput: "No plugin output to clear.",
      cleared: "Plugin output cleared.",
      clearBlocked: "Cannot clear while typing is still running.",
      runtimeError: "Typing error:",
      miniTitle: "Typing in progress",
      miniStop: "Stop",
      miniCancel: "Cancel",
      miniClose: "Close",
      miniEta: "ETA",
      miniDone: "Completed",
      miniStopped: "Stopped",
      targetPreview: "Target locked. Confirm to start.",
      targetLabel: "Target",
      floatTitle: "Typing Panel",
      floatStart: "Start",
      floatStop: "Stop",
      floatCancel: "Cancel",
      floatUnpin: "Unpin",
      floatPinned: "Pinned panel active"
    },
    zh: {
      noEditable: "未找到可输入目标。请先点击目标输入框后重试。",
      noEditableFallback: "未检测到聚焦输入框，且页面中没有可见可编辑区域。",
      started: "已开始模拟输入。",
      completed: "输入完成。",
      stopped: "输入已停止。",
      stopQueued: "已触发紧急退出。",
      targetGone: "目标输入区域已不可用。",
      noClearableOutput: "没有可清除的插件输出。",
      cleared: "已清除插件输出。",
      clearBlocked: "当前仍在输入，暂时无法清除。",
      runtimeError: "输入异常：",
      miniTitle: "正在输入",
      miniStop: "停止",
      miniCancel: "取消",
      miniClose: "关闭",
      miniEta: "剩余",
      miniDone: "已完成",
      miniStopped: "已停止",
      targetPreview: "目标已锁定，请确认开始。",
      targetLabel: "目标",
      floatTitle: "输入控制",
      floatStart: "开始",
      floatStop: "停止",
      floatCancel: "取消",
      floatUnpin: "取消固定",
      floatPinned: "固定悬浮窗已启用"
    }
  };

  const KEYBOARD_ROWS = [
    "`1234567890-=",
    "qwertyuiop[]\\",
    "asdfghjkl;'",
    "zxcvbnm,./"
  ];
  const TOP_ROW_WORD_REGEX = /^[qwertyuiop]{3,}$/i;
  const TOP_ROW_SPECIAL_TYPO_POOL = ["-", "+", "\t"];
  const TOP_ROW_SPECIAL_TYPO_PROBABILITY = 0.9;
  const GOOGLE_DOCS_AUTOSAVE_IDLE_MIN_MS = 2200;
  const GOOGLE_DOCS_AUTOSAVE_IDLE_TRIGGER_MS = 1000;
  const PAUSE_CHUNK_MS = 120;

  const state = {
    isTyping: false,
    stopRequested: false,
    sessionId: 0,
    runtime: null,
    lastEditable: null,
    lastSession: null,
    language: "en",
    shortcutConfig: {
      stopShortcut: DEFAULT_SETTINGS.stopShortcut,
      clearShortcut: DEFAULT_SETTINGS.clearShortcut
    },
    toastEl: null,
    miniPanel: null,
    floatingPanelPinned: false,
    floatingPanelEl: null,
    floatingPanelPosition: null,
    syncedProgress: null,
    floatingProgressSessionId: null,
    floatingProgressValue: 0,
    miniProgressSessionId: null,
    miniProgressValue: 0,
    targetLock: null,
    targetHighlightEl: null,
    targetHighlightTimerId: 0,
    lastDocsPointer: null
  };

  const IS_TOP_FRAME = isTopFrameWindow();

  installListeners();
  loadShortcutConfig();

  function installListeners() {
    document.addEventListener(
      "focusin",
      (event) => {
        if (isEditable(event.target)) {
          if (isGoogleDocsPage() && !isGoogleDocsEditorElement(event.target)) {
            return;
          }
          state.lastEditable = event.target;
        }
      },
      true
    );

    document.addEventListener(
      "mousedown",
      (event) => {
        if (!isGoogleDocsContext()) {
          return;
        }
        if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
          return;
        }
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        if (!isGoogleDocsTypingFrame() && !target.closest(".kix-appview-editor, #docs-editor, .docs-editor-container, .kix-page, .kix-page-content-wrapper, .kix-canvas-tile-content")) {
          return;
        }
        state.lastDocsPointer = {
          x: Math.round(event.clientX),
          y: Math.round(event.clientY),
          at: Date.now()
        };
      },
      true
    );

    document.addEventListener(
      "keydown",
      (event) => {
        if (event.repeat) {
          return;
        }
        const stopCombo = parseShortcut(state.shortcutConfig.stopShortcut);
        const clearCombo = parseShortcut(state.shortcutConfig.clearShortcut);

        if (stopCombo && shortcutMatches(event, stopCombo)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          emergencyStop(true);
          return;
        }
        if (clearCombo && shortcutMatches(event, clearCombo)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          void emergencyClear(true);
        }
      },
      true
    );

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") {
        return;
      }
      if (changes.stopShortcut) {
        state.shortcutConfig.stopShortcut = changes.stopShortcut.newValue || DEFAULT_SETTINGS.stopShortcut;
      }
      if (changes.clearShortcut) {
        state.shortcutConfig.clearShortcut = changes.clearShortcut.newValue || DEFAULT_SETTINGS.clearShortcut;
      }
      if (changes.language) {
        state.language = changes.language.newValue || "en";
        refreshFloatingPanelTexts();
      }
      if (changes.floatingPinned) {
        setFloatingPanelPinned(Boolean(changes.floatingPinned.newValue));
      }
      if (changes.floatingPanelPosition) {
        state.floatingPanelPosition = normalizeFloatingPanelPosition(changes.floatingPanelPosition.newValue);
        if (state.floatingPanelEl && state.floatingPanelEl.isConnected) {
          applyFloatingPanelPosition(state.floatingPanelEl);
        }
      }
    });

    window.addEventListener(
      "resize",
      () => {
        if (!IS_TOP_FRAME) {
          return;
        }
        if (state.floatingPanelEl && state.floatingPanelEl.isConnected) {
          applyFloatingPanelPosition(state.floatingPanelEl);
        }
      },
      true
    );

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || typeof message.type !== "string") {
        return;
      }

      if (message.type === "START_TYPING") {
        if (!shouldHandleTypingMessagesInThisFrame()) {
          sendResponse({ ok: false, ignored: true });
          return;
        }
        void startTyping(message.settings || {}, message.lockId || null)
          .then((response) => {
            sendResponse(response);
          })
          .catch((error) => {
            sendResponse({
              ok: false,
              error: error && error.message ? error.message : "Failed to start typing."
            });
          });
        return true;
      }

      if (message.type === "PREVIEW_TARGET") {
        if (!shouldHandleTypingMessagesInThisFrame()) {
          sendResponse({ ok: false, ignored: true });
          return;
        }
        void previewTypingTarget(message.settings || {})
          .then((response) => {
            sendResponse(response);
          })
          .catch((error) => {
            sendResponse({
              ok: false,
              error: error && error.message ? error.message : t("noEditableFallback")
            });
          });
        return true;
      }

      if (message.type === "CLEAR_TARGET_PREVIEW") {
        if (!shouldHandleTypingMessagesInThisFrame()) {
          sendResponse({ ok: false, ignored: true });
          return;
        }
        clearTargetLock(true);
        sendResponse({ ok: true });
        return;
      }

      if (message.type === "SET_FLOATING_PANEL") {
        if (!IS_TOP_FRAME) {
          sendResponse({ ok: false, ignored: true });
          return;
        }
        setFloatingPanelPinned(Boolean(message.enabled));
        sendResponse({
          ok: true,
          enabled: state.floatingPanelPinned
        });
        return;
      }

      if (message.type === "EMERGENCY_STOP") {
        if (!shouldHandleEmergencyMessagesInThisFrame()) {
          sendResponse({ ok: false, ignored: true });
          return;
        }
        emergencyStop(true);
        sendResponse({
          ok: true
        });
        return;
      }

      if (message.type === "EMERGENCY_CLEAR") {
        if (!shouldHandleEmergencyMessagesInThisFrame()) {
          sendResponse({ ok: false, ignored: true });
          return;
        }
        void emergencyClear(true);
        sendResponse({
          ok: true
        });
        return;
      }

      if (message.type === "GET_TYPING_STATUS") {
        if (!shouldRespondTypingStatusInThisFrame()) {
          sendResponse({ ok: false, ignored: true });
          return;
        }
        sendResponse({
          ok: true,
          payload: getTypingStatusPayload()
        });
        return;
      }

      if (message.type === "ACTIVATE_DOCS_SURFACE") {
        if (!(IS_TOP_FRAME && isGoogleDocsPage())) {
          sendResponse({ ok: false, ignored: true });
          return;
        }
        activateGoogleDocsEditorSurface();
        sendResponse({ ok: true });
        return;
      }

      if (message.type === "TYPING_PROGRESS_SYNC") {
        if (!IS_TOP_FRAME) {
          sendResponse({ ok: false, ignored: true });
          return;
        }
        syncProgressFromRemote(message.payload || {});
        sendResponse({ ok: true });
        return;
      }
    });
  }

  function isTopFrameWindow() {
    try {
      return window.top === window;
    } catch (_error) {
      return true;
    }
  }

  function isGoogleDocsTypingFrame() {
    try {
      const frame = window.frameElement;
      if (frame instanceof HTMLIFrameElement) {
        const className = String(frame.className || "").toLowerCase();
        const id = String(frame.id || "").toLowerCase();
        const name = String(frame.name || "").toLowerCase();
        if (
          className.includes("docs-texteventtarget") ||
          className.includes("kix-clipboard") ||
          id.includes("docs-texteventtarget") ||
          name.includes("docs-texteventtarget")
        ) {
          return true;
        }
      }
      const localTarget = queryAllDeep(
        document,
        "textarea.docs-texteventtarget-ia, textarea.docs-texteventtarget-ib, textarea[class*='docs-texteventtarget'], textarea[id*='docs-texteventtarget'], textarea[class*='kix-clipboard']"
      );
      if (localTarget.length > 0) {
        return true;
      }
      const referrer = String(document.referrer || "");
      if (/^https:\/\/docs\.google\.com\/document\//.test(referrer)) {
        const hasEditableLocal = queryAllDeep(
          document,
          "textarea, [contenteditable='true'], [contenteditable=''], [contenteditable='plaintext-only'], [role='textbox']"
        ).some((node) => isEditable(node));
        if (hasEditableLocal) {
          return true;
        }
      }
      return false;
    } catch (_error) {
      return false;
    }
  }

  function isGoogleDocsContext() {
    if (isGoogleDocsPage() || isGoogleDocsTypingFrame()) {
      return true;
    }
    const referrer = String(document.referrer || "");
    if (/^https:\/\/docs\.google\.com\/document\//.test(referrer)) {
      return true;
    }
    try {
      if (!window.parent || window.parent === window) {
        return false;
      }
      return (
        window.parent.location.hostname === "docs.google.com" &&
        /^\/document\//.test(window.parent.location.pathname)
      );
    } catch (_error) {
      return false;
    }
  }

  function shouldHandleTypingMessagesInThisFrame() {
    if (!isGoogleDocsContext()) {
      return IS_TOP_FRAME;
    }
    if (isGoogleDocsTypingFrame()) {
      return true;
    }
    if (!IS_TOP_FRAME) {
      const quickLocal = queryGoogleDocsTypingTarget();
      if (quickLocal) {
        state.lastEditable = quickLocal;
        return true;
      }
      return false;
    }
    if (IS_TOP_FRAME && isGoogleDocsPage()) {
      const quickTarget = queryGoogleDocsTypingTarget();
      if (quickTarget) {
        state.lastEditable = quickTarget;
      }
      return true;
    }
    return false;
  }

  function shouldHandleEmergencyMessagesInThisFrame() {
    if (state.isTyping || (state.lastSession && state.lastSession.target)) {
      return true;
    }
    if (!isGoogleDocsContext()) {
      return IS_TOP_FRAME;
    }
    return isGoogleDocsTypingFrame();
  }

  function shouldRespondTypingStatusInThisFrame() {
    if (state.isTyping) {
      return true;
    }
    if (!isGoogleDocsContext()) {
      return IS_TOP_FRAME;
    }
    return false;
  }

  function loadShortcutConfig() {
    chrome.storage.local.get(
      ["stopShortcut", "clearShortcut", "language", "floatingPinned", "floatingPanelPosition"],
      (result) => {
        state.shortcutConfig.stopShortcut = result.stopShortcut || DEFAULT_SETTINGS.stopShortcut;
        state.shortcutConfig.clearShortcut = result.clearShortcut || DEFAULT_SETTINGS.clearShortcut;
        state.language = result.language || "en";
        state.floatingPanelPinned = Boolean(result.floatingPinned);
        state.floatingPanelPosition = normalizeFloatingPanelPosition(result.floatingPanelPosition);
        if (state.floatingPanelPinned) {
          showFloatingPanel();
        } else {
          hideFloatingPanel();
        }
      }
    );
  }

  async function previewTypingTarget(rawSettings) {
    const settings = normalizeSettings(rawSettings);
    state.language = settings.language;
    const target = await findTypingTargetWithRetry(settings);
    if (!target) {
      return {
        ok: false,
        error: t("noEditableFallback")
      };
    }

    const lockId = `lock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    state.targetLock = {
      id: lockId,
      target,
      expiresAt: Date.now() + 30000
    };
    showTargetHighlight(target);
    showToast(t("targetPreview"), "success");
    return {
      ok: true,
      lockId,
      targetLabel: describeTarget(target),
      expiresAt: state.targetLock.expiresAt
    };
  }

  async function startTyping(rawSettings, lockId) {
    const settings = normalizeSettings(rawSettings);
    state.language = settings.language;

    if (state.isTyping) {
      emergencyStop(false);
    }

    const target = await resolveStartTarget(settings, lockId);
    if (!target) {
      return {
        ok: false,
        error: t("noEditableFallback")
      };
    }

    if (isGoogleDocsContext()) {
      await ensureDocsCaretVisible();
    }

    const runtimeSettings = cloneTypingSettings(settings);
    const operations = runtimeSettings.enableDirectives
      ? parseDirectives(runtimeSettings.sourceText)
      : [{ type: "text", value: runtimeSettings.sourceText }];
    const syntaxProgramEnabled = runtimeSettings.enableDirectives && hasDirectiveOperations(operations);
    if (syntaxProgramEnabled) {
      disableImplicitNoise(runtimeSettings);
    }
    const baseSettings = cloneTypingSettings(runtimeSettings);
    const estimatedDurationMs = estimateDurationMs(runtimeSettings, operations);
    const runtime = {
      sessionId: ++state.sessionId,
      baseSettings,
      settings: runtimeSettings,
      target,
      operations,
      blockIndex: 0,
      charsInBlock: 0,
      blockPlan: createBlockPlan(runtimeSettings),
      netCommittedChars: 0,
      startedAt: Date.now(),
      estimatedDurationMs,
      progressTimerId: null,
      lastProgressSentAt: 0
    };

    state.isTyping = true;
    state.stopRequested = false;
    state.runtime = runtime;
    state.floatingProgressSessionId = runtime.sessionId;
    state.floatingProgressValue = 0;
    state.miniProgressSessionId = runtime.sessionId;
    state.miniProgressValue = 0;
    clearTargetLock(true);
    runtime.progressTimerId = window.setInterval(() => {
      reportProgress(runtime, "running", false);
    }, 250);
    showMiniPanel();
    reportProgress(runtime, "running", true);
    showToast(t("started"), "success");
    void runTyping(runtime);

    return {
      ok: true,
      sessionId: runtime.sessionId,
      estimatedDurationMs
    };
  }

  async function runTyping(runtime) {
    let finalStatus = "completed";
    try {
      await executeOperations(runtime, runtime.operations);

      if (state.stopRequested) {
        finalStatus = "stopped";
        showToast(t("stopped"), "warning");
      } else {
        finalStatus = "completed";
        showToast(t("completed"), "success");
      }
    } catch (error) {
      finalStatus = "error";
      showToast(`${t("runtimeError")} ${error.message}`, "error");
    } finally {
      finishRuntime(runtime, finalStatus);
    }
  }

  async function executeOperations(runtime, operations) {
    for (const op of operations) {
      if (!isRuntimeActive(runtime)) {
        return;
      }
      await executeOperation(runtime, op);
    }
  }

  async function executeOperation(runtime, op) {
    if (op.type === "text") {
      await typeText(runtime, op.value);
      return;
    }
    if (op.type === "rev") {
      await typeText(runtime, op.draft);
      await applyNaturalPause(runtime, 1.25);
      await deleteCharacters(runtime, countGraphemes(op.draft));
      await typeText(runtime, op.final);
      return;
    }
    if (op.type === "del") {
      await typeText(runtime, op.value);
      await applyNaturalPause(runtime, 1.05);
      await deleteCharacters(runtime, countGraphemes(op.value));
      return;
    }
    if (op.type === "pause") {
      await applyPauseWithOptionalDocsAutosave(runtime, op.ms, {
        forceAutosave: true
      });
      return;
    }
    if (op.type === "pauseRange") {
      await applyPauseWithOptionalDocsAutosave(runtime, randomInt(op.minMs, op.maxMs), {
        forceAutosave: true
      });
      return;
    }
    if (op.type === "choice") {
      if (op.options.length === 0) {
        return;
      }
      const picked = op.options[randomInt(0, op.options.length - 1)];
      await executeOperations(runtime, parseDirectives(picked));
      return;
    }
    if (op.type === "chance") {
      if (Math.random() * 100 < op.percent) {
        await executeOperations(runtime, parseDirectives(op.value));
      }
      return;
    }
    if (op.type === "repeat") {
      for (let i = 0; i < op.times; i += 1) {
        if (!isRuntimeActive(runtime)) {
          return;
        }
        await executeOperations(runtime, parseDirectives(op.value));
      }
      return;
    }
    if (op.type === "speedSet") {
      runtime.settings.speedMinSec = op.minSec;
      runtime.settings.speedMaxSec = op.maxSec;
      runtime.settings.speedRandom = true;
      reseedBehaviorPlan(runtime);
      return;
    }
    if (op.type === "speedReset") {
      runtime.settings.speedMinSec = runtime.baseSettings.speedMinSec;
      runtime.settings.speedMaxSec = runtime.baseSettings.speedMaxSec;
      runtime.settings.speedRandom = runtime.baseSettings.speedRandom;
      reseedBehaviorPlan(runtime);
      return;
    }
    if (op.type === "typoSetEnabled") {
      runtime.settings.typoEnabled = op.enabled;
      reseedBehaviorPlan(runtime);
      return;
    }
    if (op.type === "typoSetRange") {
      runtime.settings.typoEnabled = true;
      runtime.settings.typoMin = op.min;
      runtime.settings.typoMax = op.max;
      reseedBehaviorPlan(runtime);
      return;
    }
    if (op.type === "typoReset") {
      runtime.settings.typoEnabled = runtime.baseSettings.typoEnabled;
      runtime.settings.typoMin = runtime.baseSettings.typoMin;
      runtime.settings.typoMax = runtime.baseSettings.typoMax;
      reseedBehaviorPlan(runtime);
      return;
    }
    if (op.type === "wsSetEnabled") {
      runtime.settings.whitespaceEnabled = op.enabled;
      reseedBehaviorPlan(runtime);
      return;
    }
    if (op.type === "wsSetRange") {
      runtime.settings.whitespaceEnabled = true;
      runtime.settings.whitespaceMin = op.min;
      runtime.settings.whitespaceMax = op.max;
      reseedBehaviorPlan(runtime);
      return;
    }
    if (op.type === "wsSetKeep") {
      runtime.settings.whitespaceKeep = op.keep;
      return;
    }
    if (op.type === "wsReset") {
      runtime.settings.whitespaceEnabled = runtime.baseSettings.whitespaceEnabled;
      runtime.settings.whitespaceMin = runtime.baseSettings.whitespaceMin;
      runtime.settings.whitespaceMax = runtime.baseSettings.whitespaceMax;
      runtime.settings.whitespaceKeep = runtime.baseSettings.whitespaceKeep;
      reseedBehaviorPlan(runtime);
      return;
    }
    if (op.type === "noiseFixSetMode") {
      runtime.settings.noiseCorrectionMode = normalizeNoiseCorrectionMode(op.mode);
      return;
    }
    if (op.type === "noiseFixSetDelay") {
      runtime.settings.noiseCorrectionDelayMinMs = clamp(Math.min(op.minMs, op.maxMs), 0, 20000);
      runtime.settings.noiseCorrectionDelayMaxMs = clamp(Math.max(op.minMs, op.maxMs), 0, 20000);
      return;
    }
    if (op.type === "noiseFixReset") {
      runtime.settings.noiseCorrectionMode = runtime.baseSettings.noiseCorrectionMode;
      runtime.settings.noiseCorrectionDelayMinMs = runtime.baseSettings.noiseCorrectionDelayMinMs;
      runtime.settings.noiseCorrectionDelayMaxMs = runtime.baseSettings.noiseCorrectionDelayMaxMs;
      return;
    }
    if (op.type === "backspace") {
      await deleteCharacters(runtime, op.count);
      return;
    }
    if (op.type === "noop") {
      return;
    }
  }

  function finishRuntime(runtime, finalStatus) {
    if (!state.runtime || state.runtime.sessionId !== runtime.sessionId) {
      return;
    }
    if (runtime.progressTimerId) {
      window.clearInterval(runtime.progressTimerId);
    }
    reportProgress(runtime, finalStatus || "completed", true);
    const elapsed = Date.now() - runtime.startedAt;
    const finishedProgress =
      (finalStatus || "completed") === "completed"
        ? 1
        : clamp(elapsed / Math.max(1, runtime.estimatedDurationMs || 1), 0, 0.999);
    updateMiniPanel({
      status: finalStatus || "completed",
      progress: finishedProgress,
      elapsedMs: elapsed,
      etaMs: 0,
      estimatedDurationMs: runtime.estimatedDurationMs,
      sessionId: runtime.sessionId
    });
    hideMiniPanelLater();
    state.lastSession = {
      target: runtime.target,
      eraseCount: Math.max(0, runtime.netCommittedChars)
    };
    state.runtime = null;
    state.isTyping = false;
    state.stopRequested = false;
  }

  function emergencyStop(withToast) {
    if (!state.isTyping) {
      return;
    }
    state.stopRequested = true;
    if (withToast) {
      showToast(t("stopQueued"), "warning");
    }
  }

  async function resolveStartTarget(settings, lockId) {
    if (
      lockId &&
      state.targetLock &&
      state.targetLock.id === lockId &&
      state.targetLock.expiresAt >= Date.now() &&
      state.targetLock.target &&
      state.targetLock.target.isConnected &&
      isEditable(state.targetLock.target) &&
      (!isGoogleDocsPage() || isGoogleDocsEditorElement(state.targetLock.target))
    ) {
      return state.targetLock.target;
    }
    return findTypingTargetWithRetry(settings);
  }

  function clearTargetLock(clearHighlight) {
    state.targetLock = null;
    if (clearHighlight) {
      hideTargetHighlight();
    }
  }

  function setFloatingPanelPinned(enabled) {
    if (!IS_TOP_FRAME) {
      state.floatingPanelPinned = Boolean(enabled);
      return;
    }
    state.floatingPanelPinned = Boolean(enabled);
    if (state.floatingPanelPinned) {
      hideMiniPanelNow();
      showFloatingPanel();
      showToast(t("floatPinned"), "success");
    } else {
      hideFloatingPanel();
      if (state.isTyping) {
        showMiniPanel();
        updateMiniPanel(getTypingStatusPayload());
      }
    }
  }

  function showFloatingPanel() {
    if (!IS_TOP_FRAME) {
      return;
    }
    const panel = ensureFloatingPanel();
    if (!panel) {
      return;
    }
    applyFloatingPanelPosition(panel);
    panel.style.opacity = "1";
    panel.style.pointerEvents = "auto";
    updateFloatingPanel(state.syncedProgress || getTypingStatusPayload());
  }

  function hideFloatingPanel() {
    if (!IS_TOP_FRAME) {
      return;
    }
    if (state.floatingPanelEl && state.floatingPanelEl.isConnected) {
      state.floatingPanelEl.style.opacity = "0";
      state.floatingPanelEl.style.pointerEvents = "none";
    }
  }

  function ensureFloatingPanel() {
    if (!IS_TOP_FRAME) {
      return null;
    }
    if (state.floatingPanelEl && state.floatingPanelEl.isConnected) {
      return state.floatingPanelEl;
    }

    const styleId = "human-typing-floating-style";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        .human-typing-float {
          position: fixed;
          right: 14px;
          top: 72px;
          width: 230px;
          z-index: 2147483644;
          border: 1px solid #cfd8ea;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.98);
          box-shadow: 0 14px 32px rgba(17, 33, 64, 0.25);
          font-family: "Segoe UI", sans-serif;
          padding: 10px;
          opacity: 0;
          pointer-events: none;
          transition: opacity 160ms ease;
        }
        .human-typing-float .title {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
          font-weight: 700;
          color: #24334f;
          margin-bottom: 8px;
          cursor: move;
          user-select: none;
        }
        .human-typing-float .track {
          height: 8px;
          border-radius: 999px;
          background: #e7edf9;
          overflow: hidden;
        }
        .human-typing-float .fill {
          width: 0%;
          height: 100%;
          background: linear-gradient(90deg, #1d8a67, #44a8ca);
        }
        .human-typing-float .meta {
          margin-top: 6px;
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: #55627a;
        }
        .human-typing-float .actions {
          margin-top: 9px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
        }
        .human-typing-float button {
          border: 1px solid #cfd8ea;
          border-radius: 8px;
          background: #fff;
          font-size: 11px;
          padding: 6px;
          cursor: pointer;
        }
        .human-typing-float button.danger {
          border-color: #e8b7b2;
          background: #ffeceb;
          color: #8f2a22;
        }
      `;
      document.documentElement.appendChild(style);
    }

    const panel = document.createElement("div");
    panel.className = "human-typing-float";
    panel.innerHTML = `
      <div class="title">
        <span data-float="title">${escapeHtml(t("floatTitle"))}</span>
        <button data-float="unpin">${escapeHtml(t("floatUnpin"))}</button>
      </div>
      <div class="track"><div class="fill" data-float="fill"></div></div>
      <div class="meta">
        <span data-float="percent">0%</span>
        <span data-float="eta">${escapeHtml(t("miniEta"))} --:--</span>
      </div>
      <div class="actions">
        <button data-float="start">${escapeHtml(t("floatStart"))}</button>
        <button data-float="stop" class="danger">${escapeHtml(t("floatStop"))}</button>
        <button data-float="cancel" class="danger">${escapeHtml(t("floatCancel"))}</button>
        <button data-float="close">${escapeHtml(t("floatUnpin"))}</button>
      </div>
    `;
    installNonFocusMouseDown(panel.querySelector("[data-float='start']"));
    installNonFocusMouseDown(panel.querySelector("[data-float='stop']"));
    installNonFocusMouseDown(panel.querySelector("[data-float='cancel']"));
    installNonFocusMouseDown(panel.querySelector("[data-float='close']"));
    installNonFocusMouseDown(panel.querySelector("[data-float='unpin']"));

    panel.querySelector("[data-float='start']").addEventListener("click", () => {
      void startFromFloatingPanel();
    });
    panel.querySelector("[data-float='stop']").addEventListener("click", () => {
      void stopFromFloatingPanel();
    });
    panel.querySelector("[data-float='cancel']").addEventListener("click", () => {
      void clearFromFloatingPanel();
    });
    panel.querySelector("[data-float='close']").addEventListener("click", () => {
      setFloatingPanelPinned(false);
      void persistFloatingPinned(false);
    });
    panel.querySelector("[data-float='unpin']").addEventListener("click", () => {
      setFloatingPanelPinned(false);
      void persistFloatingPinned(false);
    });

    const title = panel.querySelector(".title");
    if (title) {
      title.addEventListener("pointerdown", (event) => {
        const target = event.target;
        if (target instanceof Element && target.closest("button")) {
          return;
        }
        beginFloatingPanelDrag(event, panel);
      });
    }

    document.documentElement.appendChild(panel);
    applyFloatingPanelPosition(panel);
    state.floatingPanelEl = panel;
    return panel;
  }

  function updateFloatingPanel(payload) {
    if (!IS_TOP_FRAME) {
      return;
    }
    if (!isPinnedModeActive()) {
      return;
    }
    const panel = ensureFloatingPanel();
    if (!panel) {
      return;
    }
    const stable = stabilizeProgressForDisplay(payload, "floatingProgressSessionId", "floatingProgressValue");
    const progress = clamp((Number(stable.progress) || 0) * 100, 0, 100);
    const fill = panel.querySelector("[data-float='fill']");
    const percent = panel.querySelector("[data-float='percent']");
    const eta = panel.querySelector("[data-float='eta']");
    fill.style.width = `${Math.round(progress)}%`;
    percent.textContent = `${Math.round(progress)}%`;

    if (stable.status === "completed") {
      eta.textContent = t("miniDone");
    } else if (stable.status === "stopped" || stable.status === "error") {
      eta.textContent = t("miniStopped");
    } else {
      eta.textContent = `${t("miniEta")} ${formatMs(stable.etaMs)}`;
    }
  }

  function syncProgressFromRemote(payload) {
    const progressPayload = normalizeProgressPayload(payload);
    if (
      state.runtime &&
      state.runtime.sessionId &&
      progressPayload.sessionId &&
      state.runtime.sessionId === progressPayload.sessionId
    ) {
      return;
    }

    if (
      state.syncedProgress &&
      state.syncedProgress.sessionId &&
      progressPayload.sessionId &&
      state.syncedProgress.sessionId !== progressPayload.sessionId &&
      state.syncedProgress.status === "running" &&
      progressPayload.status === "running"
    ) {
      return;
    }

    if (
      state.syncedProgress &&
      state.syncedProgress.sessionId &&
      progressPayload.sessionId &&
      state.syncedProgress.sessionId === progressPayload.sessionId &&
      progressPayload.status === "running"
    ) {
      progressPayload.progress = Math.max(Number(progressPayload.progress) || 0, Number(state.syncedProgress.progress) || 0);
    }

    state.syncedProgress = progressPayload;
    if (isPinnedModeActive()) {
      hideMiniPanelNow();
      showFloatingPanel();
      updateFloatingPanel(progressPayload);
    } else if (progressPayload.status === "running") {
      showMiniPanel();
      updateMiniPanel(progressPayload);
    } else if (progressPayload.status === "completed" || progressPayload.status === "stopped" || progressPayload.status === "error") {
      updateMiniPanel(progressPayload);
      hideMiniPanelLater();
    }
  }

  function normalizeProgressPayload(payload) {
    const source = payload && typeof payload === "object" ? payload : getTypingStatusPayload();
    return {
      sessionId: Number.isFinite(Number(source.sessionId)) ? Number(source.sessionId) : null,
      status: String(source.status || "idle"),
      progress: clamp(Number(source.progress) || 0, 0, 1),
      elapsedMs: Math.max(0, Number(source.elapsedMs) || 0),
      estimatedDurationMs: Math.max(0, Number(source.estimatedDurationMs) || 0),
      etaMs: Math.max(0, Number(source.etaMs) || 0)
    };
  }

  function stabilizeProgressForDisplay(payload, sessionKey, progressKey) {
    const normalized = normalizeProgressPayload(payload);
    const incomingSession = normalized.sessionId;
    const previousSession = state[sessionKey];
    const previousProgress = Number(state[progressKey]) || 0;

    if (normalized.status === "idle" || !incomingSession) {
      state[sessionKey] = incomingSession;
      state[progressKey] = normalized.progress;
      return normalized;
    }

    if (previousSession && incomingSession !== previousSession) {
      state[sessionKey] = incomingSession;
      state[progressKey] = normalized.progress;
      return normalized;
    }

    if (normalized.status === "running") {
      normalized.progress = Math.max(previousProgress, normalized.progress);
    } else if (normalized.status === "completed") {
      normalized.progress = Math.max(previousProgress, normalized.progress, 1);
    } else {
      normalized.progress = Math.max(previousProgress, normalized.progress);
    }

    state[sessionKey] = incomingSession || previousSession || null;
    state[progressKey] = normalized.progress;
    return normalized;
  }

  function refreshFloatingPanelTexts() {
    if (!IS_TOP_FRAME) {
      return;
    }
    if (!state.floatingPanelEl || !state.floatingPanelEl.isConnected) {
      return;
    }
    const panel = state.floatingPanelEl;
    const title = panel.querySelector("[data-float='title']");
    const start = panel.querySelector("[data-float='start']");
    const stop = panel.querySelector("[data-float='stop']");
    const cancel = panel.querySelector("[data-float='cancel']");
    const close = panel.querySelector("[data-float='close']");
    const unpin = panel.querySelector("[data-float='unpin']");
    if (title) title.textContent = t("floatTitle");
    if (start) start.textContent = t("floatStart");
    if (stop) stop.textContent = t("floatStop");
    if (cancel) cancel.textContent = t("floatCancel");
    if (close) close.textContent = t("floatUnpin");
    if (unpin) unpin.textContent = t("floatUnpin");
  }

  function installNonFocusMouseDown(button) {
    if (!(button instanceof HTMLElement)) {
      return;
    }
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
    });
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
  }

  function normalizeFloatingPanelPosition(value) {
    if (!value || typeof value !== "object") {
      return null;
    }
    const left = Number(value.left);
    const top = Number(value.top);
    if (!Number.isFinite(left) || !Number.isFinite(top)) {
      return null;
    }
    return {
      left: Math.round(left),
      top: Math.round(top)
    };
  }

  function applyFloatingPanelPosition(panel) {
    if (!(panel instanceof HTMLElement)) {
      return;
    }
    const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth - 6);
    const maxTop = Math.max(0, window.innerHeight - panel.offsetHeight - 6);
    if (state.floatingPanelPosition) {
      const left = clamp(state.floatingPanelPosition.left, 6, Math.max(6, maxLeft));
      const top = clamp(state.floatingPanelPosition.top, 6, Math.max(6, maxTop));
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      return;
    }
    panel.style.right = "14px";
    panel.style.top = "72px";
    panel.style.left = "auto";
    panel.style.bottom = "auto";
  }

  function beginFloatingPanelDrag(event, panel) {
    if (!(panel instanceof HTMLElement)) {
      return;
    }
    event.preventDefault();
    const rect = panel.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const pointerId = event.pointerId;

    panel.style.left = `${Math.round(rect.left)}px`;
    panel.style.top = `${Math.round(rect.top)}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";

    const onMove = (moveEvent) => {
      const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth - 6);
      const maxTop = Math.max(0, window.innerHeight - panel.offsetHeight - 6);
      const nextLeft = clamp(Math.round(moveEvent.clientX - offsetX), 6, Math.max(6, maxLeft));
      const nextTop = clamp(Math.round(moveEvent.clientY - offsetY), 6, Math.max(6, maxTop));
      panel.style.left = `${nextLeft}px`;
      panel.style.top = `${nextTop}px`;
    };

    const finish = () => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onCancel, true);
      const finalRect = panel.getBoundingClientRect();
      state.floatingPanelPosition = {
        left: Math.round(finalRect.left),
        top: Math.round(finalRect.top)
      };
      chrome.storage.local.set({
        floatingPanelPosition: state.floatingPanelPosition
      });
    };

    const onUp = (upEvent) => {
      if (upEvent.pointerId !== pointerId) {
        return;
      }
      finish();
    };

    const onCancel = (cancelEvent) => {
      if (cancelEvent.pointerId !== pointerId) {
        return;
      }
      finish();
    };

    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onCancel, true);
  }

  async function startFromFloatingPanel() {
    const settings = await getStoredTypingSettings();
    const preview = await routeMessageFromCurrentTab({
      type: "PREVIEW_TARGET",
      settings
    });
    if (!preview || !preview.ok || !preview.lockId) {
      showToast((preview && preview.error) || t("noEditableFallback"), "error");
      return;
    }
    const response = await routeMessageFromCurrentTab({
      type: "START_TYPING",
      settings,
      lockId: preview.lockId
    });
    if (!response || !response.ok) {
      showToast((response && response.error) || t("noEditableFallback"), "error");
      return;
    }
    showToast(t("started"), "success");
  }

  async function ensureDocsCaretVisible() {
    if (!isGoogleDocsContext()) {
      return;
    }
    if (IS_TOP_FRAME && isGoogleDocsPage()) {
      activateGoogleDocsEditorSurface();
      return;
    }
    try {
      await routeMessageFromCurrentTab({
        type: "ACTIVATE_DOCS_SURFACE"
      });
    } catch (_error) {
      // Ignore routing failures; typing target may still be available.
    }
  }

  async function stopFromFloatingPanel() {
    const response = await routeMessageFromCurrentTab({
      type: "EMERGENCY_STOP"
    });
    if (!response || !response.ok) {
      showToast((response && response.error) || t("stopQueued"), "warning");
      return;
    }
    showToast(t("stopQueued"), "warning");
  }

  async function clearFromFloatingPanel() {
    const response = await routeMessageFromCurrentTab({
      type: "EMERGENCY_CLEAR"
    });
    if (!response || !response.ok) {
      showToast((response && response.error) || t("noClearableOutput"), "warning");
      return;
    }
    showToast(t("cleared"), "warning");
  }

  function routeMessageFromCurrentTab(payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "ROUTE_FRAME_MESSAGE",
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

  function persistFloatingPinned(enabled) {
    return new Promise((resolve) => {
      chrome.storage.local.set(
        {
          floatingPinned: Boolean(enabled)
        },
        () => {
          resolve();
        }
      );
    });
  }

  function getStoredTypingSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (result) => {
        resolve(normalizeSettings(result || {}));
      });
    });
  }

  async function findTypingTargetWithRetry(settings) {
    if (isGoogleDocsContext() && !IS_TOP_FRAME) {
      const localDocsTarget = queryGoogleDocsTypingTarget();
      if (localDocsTarget) {
        state.lastEditable = localDocsTarget;
        return localDocsTarget;
      }
    }

    let target = findTypingTarget(settings);
    if (target) {
      return target;
    }

    if (!isGoogleDocsContext()) {
      return null;
    }

    for (let attempt = 0; attempt < 24; attempt += 1) {
      if (attempt % 2 === 0) {
        activateGoogleDocsEditorSurface();
      }
      await sleep(120);
      target = queryGoogleDocsTypingTarget() || findTypingTarget(settings);
      if (target) {
        return target;
      }
    }
    return null;
  }

  async function emergencyClear(withToast) {
    if (state.isTyping) {
      state.stopRequested = true;
      for (let i = 0; i < 40 && state.isTyping; i += 1) {
        await sleep(50);
      }
      if (state.isTyping) {
        showToast(t("clearBlocked"), "error");
        return;
      }
    }

    const session = state.lastSession;
    if (!session || !session.target || !session.target.isConnected || session.eraseCount <= 0) {
      if (withToast) {
        showToast(t("noClearableOutput"), "warning");
      }
      return;
    }

    await focusTarget(session.target);
    await deleteCharacters(
      {
        sessionId: -1,
        settings: normalizeSettings({}),
        target: session.target,
        netCommittedChars: session.eraseCount
      },
      session.eraseCount,
      false
    );
    state.lastSession = null;
    if (withToast) {
      showToast(t("cleared"), "warning");
    }
  }

  async function typeText(runtime, text) {
    const chars = Array.from(text);
    for (let index = 0; index < chars.length; index += 1) {
      const char = chars[index];
      if (!isRuntimeActive(runtime)) {
        return;
      }

      if (runtime.charsInBlock >= 100) {
        runtime.charsInBlock = 0;
        runtime.blockIndex += 1;
        runtime.blockPlan = createBlockPlan(runtime.settings);
      }
      runtime.charsInBlock += 1;

      const slot = runtime.charsInBlock;
      if (runtime.blockPlan.pauses.has(slot)) {
        await applyNaturalPause(runtime, 1);
      }

      if (runtime.blockPlan.whitespace.has(slot)) {
        await applyWhitespaceNoise(runtime);
      }

      if (runtime.blockPlan.typos.has(slot) && canApplyTypo(char)) {
        await applyTypo(runtime, char, buildTypoContext(chars, index));
      } else {
        await insertCharacter(runtime, char);
      }

      await sleep(getCharacterDelayMs(runtime.settings, runtime.blockPlan && runtime.blockPlan.charDelayMs));
    }
  }

  async function applyTypo(runtime, char, typoContext) {
    const wrongChar = getNearbyChar(char, typoContext);
    if (!wrongChar || wrongChar.toLowerCase() === char.toLowerCase()) {
      await insertCharacter(runtime, char);
      return;
    }

    const correction = resolveNoiseCorrection(runtime.settings, "typo");
    await insertCharacter(runtime, wrongChar);
    if (!correction.enabled) {
      return;
    }
    if (correction.delayMs > 0) {
      await sleep(correction.delayMs);
    } else {
      await sleep(randomInt(45, 170));
    }
    if (!isRuntimeActive(runtime)) {
      return;
    }
    await deleteCharacters(runtime, 1);
    if (!isRuntimeActive(runtime)) {
      return;
    }
    await sleep(randomInt(35, 150));
    if (!isRuntimeActive(runtime)) {
      return;
    }
    await insertCharacter(runtime, char);
  }

  async function applyWhitespaceNoise(runtime) {
    let noise = Math.random() < 0.75 ? " " : "\n";
    if (noise === "\n" && isSingleLineInput(runtime.target)) {
      noise = " ";
    }

    const correction = resolveNoiseCorrection(runtime.settings, "whitespace");
    await insertCharacter(runtime, noise);
    if (!correction.enabled) {
      return;
    }
    if (correction.delayMs > 0) {
      await sleep(correction.delayMs);
    } else {
      await sleep(randomInt(60, 190));
    }
    if (!isRuntimeActive(runtime)) {
      return;
    }
    await deleteCharacters(runtime, 1);
  }

  function resolveNoiseCorrection(settings, noiseType) {
    const mode = normalizeNoiseCorrectionMode(settings.noiseCorrectionMode);
    if (mode === "off") {
      return {
        enabled: false,
        delayMs: 0
      };
    }
    if (mode === "legacy") {
      if (noiseType === "whitespace") {
        return {
          enabled: !settings.whitespaceKeep,
          delayMs: 0
        };
      }
      return {
        enabled: true,
        delayMs: 0
      };
    }
    if (mode === "immediate") {
      return {
        enabled: true,
        delayMs: 0
      };
    }
    const minDelay = clamp(
      Number(settings.noiseCorrectionDelayMinMs) || DEFAULT_SETTINGS.noiseCorrectionDelayMinMs,
      0,
      20000
    );
    const maxDelay = clamp(
      Number(settings.noiseCorrectionDelayMaxMs) || DEFAULT_SETTINGS.noiseCorrectionDelayMaxMs,
      0,
      20000
    );
    const delayMs = randomInt(Math.min(minDelay, maxDelay), Math.max(minDelay, maxDelay));
    if (mode === "random") {
      if (Math.random() < 0.5) {
        return {
          enabled: true,
          delayMs: 0
        };
      }
      return {
        enabled: true,
        delayMs
      };
    }
    return {
      enabled: true,
      delayMs
    };
  }

  async function applyNaturalPause(runtime, multiplier) {
    if (!isRuntimeActive(runtime)) {
      return;
    }
    const pauseMs = getPauseMs(runtime.settings, multiplier);
    if (pauseMs > 0) {
      await applyPauseWithOptionalDocsAutosave(runtime, pauseMs, {
        forceAutosave: false
      });
    }
  }

  async function applyPauseWithOptionalDocsAutosave(runtime, pauseMs, options) {
    const safePause = Math.max(0, Math.round(Number(pauseMs) || 0));
    if (safePause <= 0) {
      return;
    }
    const forceAutosave = Boolean(options && options.forceAutosave);
    const useDocsIdle = shouldApplyGoogleDocsAutosaveIdle(safePause, forceAutosave);
    const waitMs = useDocsIdle ? Math.max(safePause, GOOGLE_DOCS_AUTOSAVE_IDLE_MIN_MS) : safePause;

    if (useDocsIdle) {
      const keyTarget = resolveKeyboardEventTarget(runtime.target);
      dispatchKeyboardIdleState(keyTarget || runtime.target);
    }

    await sleepInterruptible(runtime, waitMs);

    if (useDocsIdle && isRuntimeActive(runtime)) {
      const keyTarget = resolveKeyboardEventTarget(runtime.target);
      await focusTarget(keyTarget || runtime.target);
    }
  }

  function shouldApplyGoogleDocsAutosaveIdle(pauseMs, forceAutosave) {
    if (!isGoogleDocsContext()) {
      return false;
    }
    if (forceAutosave) {
      return true;
    }
    return pauseMs >= GOOGLE_DOCS_AUTOSAVE_IDLE_TRIGGER_MS;
  }

  function dispatchKeyboardIdleState(target) {
    if (!target || typeof target.dispatchEvent !== "function") {
      return;
    }
    dispatchKeyboard(target, "keyup", "Shift");
    dispatchKeyboard(target, "keyup", "Control");
    dispatchKeyboard(target, "keyup", "Alt");
    dispatchKeyboard(target, "keyup", "Meta");
  }

  async function sleepInterruptible(runtime, totalMs) {
    let remaining = Math.max(0, Math.round(Number(totalMs) || 0));
    while (remaining > 0) {
      if (!isRuntimeActive(runtime)) {
        return;
      }
      const chunk = Math.min(PAUSE_CHUNK_MS, remaining);
      await sleep(chunk);
      remaining -= chunk;
    }
  }

  async function insertCharacter(runtime, rawChar) {
    const target = runtime.target;
    if (!target.isConnected) {
      throw new Error(t("targetGone"));
    }

    const char = rawChar === "\n" && isSingleLineInput(target) ? " " : rawChar;
    await focusTarget(target);
    const keyTarget = resolveKeyboardEventTarget(target);
    const inputTarget = isEditable(keyTarget) ? keyTarget : target;
    if (inputTarget !== target) {
      await focusTarget(inputTarget);
    }
    const useNativeDocsInsert = shouldUseNativeGoogleDocsInsert(target, inputTarget);
    dispatchKeyboard(inputTarget, "keydown", char);
    if (shouldEmitKeyPress(char)) {
      dispatchKeyboard(inputTarget, "keypress", char);
    }
    if (useNativeDocsInsert) {
      dispatchKeyboard(inputTarget, "keyup", char);
      runtime.netCommittedChars += 1;
      return;
    }
    dispatchBeforeInput(inputTarget, "insertText", char);

    let inserted = performInsertion(inputTarget, char);
    if (!inserted && inputTarget !== target) {
      inserted = performInsertion(target, char);
    }
    if (!inserted && isGoogleDocsContext()) {
      inserted = performGoogleDocsInsertFallback(inputTarget, char);
    }

    dispatchInput(inputTarget, "insertText", char);
    dispatchKeyboard(inputTarget, "keyup", char);
    if (inserted || isGoogleDocsContext()) {
      runtime.netCommittedChars += 1;
    }
  }

  async function deleteCharacters(runtime, count, trackRuntime = true) {
    const target = runtime.target;
    for (let i = 0; i < count; i += 1) {
      if (trackRuntime && !isRuntimeActive(runtime)) {
        return;
      }
      await focusTarget(target);
      const keyTarget = resolveKeyboardEventTarget(target);
      const useNativeDocsDelete = shouldUseNativeGoogleDocsDelete(target, keyTarget);
      dispatchKeyboard(keyTarget, "keydown", "Backspace");
      dispatchKeyboard(keyTarget, "keypress", "Backspace");
      if (useNativeDocsDelete) {
        dispatchKeyboard(keyTarget, "keyup", "Backspace");
        runtime.netCommittedChars = Math.max(0, runtime.netCommittedChars - 1);
        await sleep(randomInt(16, 85));
        continue;
      }
      dispatchBeforeInput(keyTarget, "deleteContentBackward", null);
      let deleted = false;
      deleted = performDeletion(target);
      if (!deleted && keyTarget !== target) {
        deleted = performDeletion(keyTarget);
      }
      if (!deleted && isGoogleDocsContext()) {
        deleted = performGoogleDocsDeleteFallback(target, keyTarget);
      }
      dispatchInput(keyTarget, "deleteContentBackward", null);
      dispatchKeyboard(keyTarget, "keyup", "Backspace");
      if (deleted) {
        runtime.netCommittedChars = Math.max(0, runtime.netCommittedChars - 1);
      }
      await sleep(randomInt(16, 85));
    }
  }

  function shouldUseNativeGoogleDocsDelete(target, keyTarget) {
    if (!isGoogleDocsContext()) {
      return false;
    }
    if (isGoogleDocsEditorElement(keyTarget) || isGoogleDocsEditorElement(target)) {
      return true;
    }
    return false;
  }

  function shouldUseNativeGoogleDocsInsert(target, keyTarget) {
    if (!isGoogleDocsContext()) {
      return false;
    }
    if (isGoogleDocsEditorElement(keyTarget) || isGoogleDocsEditorElement(target)) {
      return true;
    }
    return false;
  }

  function resolveKeyboardEventTarget(target) {
    const ownerDoc = target && target.ownerDocument ? target.ownerDocument : document;
    const active = getDeepActiveElement(ownerDoc);
    if (active && isEditable(active)) {
      return active;
    }
    if (ownerDoc.activeElement && isEditable(ownerDoc.activeElement)) {
      return ownerDoc.activeElement;
    }
    return target;
  }

  function performInsertion(target, char) {
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? start;
      const value = target.value;
      target.value = `${value.slice(0, start)}${char}${value.slice(end)}`;
      const cursor = start + char.length;
      target.setSelectionRange(cursor, cursor);
      return true;
    }

    if (target.isContentEditable) {
      const ownerDoc = target.ownerDocument || document;
      ensureEditableSelection(target);
      if (char === "\n") {
        const inserted = execCommandSafe(ownerDoc, "insertLineBreak");
        if (!inserted) {
          return manualInsertText(target, "\n");
        }
        return true;
      } else {
        const inserted = execCommandSafe(ownerDoc, "insertText", false, char);
        if (!inserted) {
          return manualInsertText(target, char);
        }
        return true;
      }
    }
    return false;
  }

  function performDeletion(target) {
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? start;
      if (start === 0 && end === 0) {
        return false;
      }
      if (start !== end) {
        target.value = `${target.value.slice(0, start)}${target.value.slice(end)}`;
        target.setSelectionRange(start, start);
        return true;
      }
      target.value = `${target.value.slice(0, start - 1)}${target.value.slice(end)}`;
      target.setSelectionRange(start - 1, start - 1);
      return true;
    }

    if (target.isContentEditable) {
      const ownerDoc = target.ownerDocument || document;
      ensureEditableSelection(target);
      const deleted = execCommandSafe(ownerDoc, "delete");
      if (deleted) {
        return true;
      }
      const selection = getSelectionForTarget(target);
      if (deleteFromSelectionBackward(selection, target)) {
        return true;
      }
      return manualDeleteBackward(target);
    }

    return false;
  }

  function ensureEditableSelection(target) {
    const selection = getSelectionForTarget(target);
    if (!selection) {
      return;
    }
    if (
      selection.rangeCount === 0 ||
      !target.contains(selection.anchorNode) ||
      !target.contains(selection.focusNode)
    ) {
      placeCaretAtEnd(target);
    }
  }

  function manualInsertText(target, text) {
    const selection = getSelectionForTarget(target);
    const ownerDoc = target && target.ownerDocument ? target.ownerDocument : document;
    if (!selection) {
      return false;
    }
    if (selection.rangeCount === 0) {
      placeCaretAtEnd(target);
    }
    const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : ownerDoc.createRange();
    range.deleteContents();
    const node = ownerDoc.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  function manualDeleteBackward(target) {
    const selection = getSelectionForTarget(target);
    if (!selection) {
      return false;
    }
    if (selection.rangeCount === 0) {
      placeCaretAtEnd(target);
    }
    const range = selection.getRangeAt(0);
    if (!range.collapsed) {
      range.deleteContents();
      return true;
    }

    if (range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset > 0) {
      const probe = range.cloneRange();
      probe.setStart(probe.startContainer, probe.startOffset - 1);
      probe.deleteContents();
      return true;
    }

    if (deleteFromSelectionBackward(selection, target)) {
      return true;
    }

    const ownerDoc = target && target.ownerDocument ? target.ownerDocument : document;
    const walker = ownerDoc.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    let lastTextNode = null;
    while (walker.nextNode()) {
      lastTextNode = walker.currentNode;
    }
    if (lastTextNode && lastTextNode.textContent) {
      lastTextNode.textContent = lastTextNode.textContent.slice(0, -1);
      placeCaretAtEnd(target);
      return true;
    }
    return false;
  }

  function placeCaretAtEnd(target) {
    const selection = getSelectionForTarget(target);
    const ownerDoc = target && target.ownerDocument ? target.ownerDocument : document;
    if (!selection) {
      return;
    }
    const range = ownerDoc.createRange();
    range.selectNodeContents(target);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function getSelectionForTarget(target) {
    const ownerDoc = target && target.ownerDocument ? target.ownerDocument : document;
    const ownerWin = ownerDoc && ownerDoc.defaultView ? ownerDoc.defaultView : window;
    try {
      return ownerWin.getSelection();
    } catch (_error) {
      return window.getSelection();
    }
  }

  function deleteFromSelectionBackward(selection, scopeTarget) {
    if (!selection || selection.rangeCount === 0) {
      return false;
    }
    const anchorNode = selection.anchorNode;
    const isInScope =
      !scopeTarget ||
      !(scopeTarget instanceof Element) ||
      !anchorNode ||
      scopeTarget.contains(anchorNode) ||
      isGoogleDocsContext();
    if (!isInScope) {
      return false;
    }

    if (!selection.isCollapsed) {
      try {
        selection.deleteFromDocument();
        return true;
      } catch (_error) {
        // continue fallback
      }
    }

    if (typeof selection.modify === "function") {
      try {
        selection.modify("extend", "backward", "character");
        if (!selection.isCollapsed) {
          selection.deleteFromDocument();
          return true;
        }
      } catch (_error) {
        // continue fallback
      }
    }
    return false;
  }

  function execCommandSafe(doc, command, showUI, value) {
    if (!doc || typeof doc.execCommand !== "function") {
      return false;
    }
    try {
      return doc.execCommand(command, Boolean(showUI), value);
    } catch (_error) {
      return false;
    }
  }

  function performGoogleDocsDeleteFallback(target, keyTarget) {
    const doc =
      (keyTarget && keyTarget.ownerDocument) ||
      (target && target.ownerDocument) ||
      document;
    if (execCommandSafe(doc, "delete")) {
      return true;
    }
    const selection = getSelectionForTarget(target || keyTarget);
    if (deleteFromSelectionBackward(selection, target || keyTarget)) {
      return true;
    }
    return false;
  }

  function performGoogleDocsInsertFallback(target, char) {
    const doc = (target && target.ownerDocument) || document;
    if (char === "\n") {
      if (execCommandSafe(doc, "insertLineBreak")) {
        return true;
      }
    } else if (execCommandSafe(doc, "insertText", false, char)) {
      return true;
    }
    const selection = getSelectionForTarget(target);
    if (selection && selection.rangeCount > 0) {
      try {
        selection.deleteFromDocument();
      } catch (_error) {
        // continue
      }
    }
    return manualInsertText(target, char);
  }

  async function focusTarget(target) {
    const ownerDoc = target && target.ownerDocument ? target.ownerDocument : document;
    const ownerWin = ownerDoc && ownerDoc.defaultView ? ownerDoc.defaultView : window;
    const active = getDeepActiveElement(ownerDoc);
    if (active !== target) {
      if (isGoogleDocsPage()) {
        activateGoogleDocsEditorSurface();
      }
      try {
        ownerWin.focus();
      } catch (_error) {
        // Ignore focus permission issues.
      }
      try {
        target.focus({
          preventScroll: true
        });
      } catch (_error) {
        target.focus();
      }
      await sleep(0);
    }
  }

  function parseDirectives(sourceText) {
    const text = String(sourceText || "");
    const operations = [];
    let buffer = "";
    let index = 0;

    while (index < text.length) {
      if (text.startsWith("\\[[", index)) {
        buffer += "[[";
        index += 3;
        continue;
      }
      if (text.startsWith("\\]]", index)) {
        buffer += "]]";
        index += 3;
        continue;
      }
      if (text.startsWith("\\\\", index)) {
        buffer += "\\";
        index += 2;
        continue;
      }
      if (text[index] === "\\" && index + 1 < text.length) {
        buffer += text[index + 1];
        index += 2;
        continue;
      }
      if (text.startsWith("[[", index)) {
        const token = readDirectiveToken(text, index);
        if (!token) {
          buffer += text[index];
          index += 1;
          continue;
        }
        if (buffer) {
          operations.push({
            type: "text",
            value: buffer
          });
          buffer = "";
        }
        const parsed = parseDirectiveToken(token.content);
        if (parsed) {
          operations.push(parsed);
        } else {
          operations.push({
            type: "text",
            value: token.raw
          });
        }
        index = token.nextIndex;
        continue;
      }
      buffer += text[index];
      index += 1;
    }

    if (buffer) {
      operations.push({
        type: "text",
        value: buffer
      });
    }
    return operations;
  }

  function readDirectiveToken(text, startIndex) {
    if (!text.startsWith("[[", startIndex)) {
      return null;
    }
    let index = startIndex + 2;
    let depth = 1;
    while (index < text.length) {
      if (text.startsWith("\\[[", index) || text.startsWith("\\]]", index)) {
        index += 3;
        continue;
      }
      if (text[index] === "\\") {
        index += 2;
        continue;
      }
      if (text.startsWith("[[", index)) {
        depth += 1;
        index += 2;
        continue;
      }
      if (text.startsWith("]]", index)) {
        depth -= 1;
        index += 2;
        if (depth === 0) {
          return {
            raw: text.slice(startIndex, index),
            content: text.slice(startIndex + 2, index - 2),
            nextIndex: index
          };
        }
        continue;
      }
      index += 1;
    }
    return null;
  }

  function parseDirectiveToken(content) {
    const match = String(content || "").match(/^([a-zA-Z]+)\s*:\s*([\s\S]*)$/);
    if (!match) {
      return null;
    }
    return parseDirectiveCommand(match[1].toLowerCase(), match[2]);
  }

  function parseDirectiveCommand(command, payload) {
    if (command === "rev") {
      const pair = splitOnceTopLevel(payload, "=>");
      if (!pair) {
        return null;
      }
      return {
        type: "rev",
        draft: decodeEscapedText(pair.left),
        final: decodeEscapedText(pair.right)
      };
    }

    if (command === "del") {
      return {
        type: "del",
        value: decodeEscapedText(payload)
      };
    }

    if (command === "pause" || command === "wait") {
      const normalized = decodeEscapedText(payload).trim();
      const range = parseNumericRange(normalized, 0, 120000, true);
      if (range) {
        return {
          type: "pauseRange",
          minMs: range.min,
          maxMs: range.max
        };
      }
      const pauseMs = Number.parseInt(normalized, 10);
      if (!Number.isFinite(pauseMs) || pauseMs < 0) {
        return null;
      }
      return {
        type: "pause",
        ms: clamp(pauseMs, 0, 120000)
      };
    }

    if (command === "choice") {
      const options = splitTopLevel(payload, "||")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      if (options.length === 0) {
        return null;
      }
      return {
        type: "choice",
        options
      };
    }

    if (command === "chance") {
      const pair = splitOnceTopLevel(payload, "|");
      if (!pair) {
        return null;
      }
      const percent = Number.parseFloat(decodeEscapedText(pair.left).trim());
      if (!Number.isFinite(percent)) {
        return null;
      }
      return {
        type: "chance",
        percent: clamp(percent, 0, 100),
        value: pair.right
      };
    }

    if (command === "repeat") {
      const pair = splitOnceTopLevel(payload, "|");
      if (!pair) {
        return null;
      }
      const times = Number.parseInt(decodeEscapedText(pair.left).trim(), 10);
      if (!Number.isFinite(times) || times < 1) {
        return null;
      }
      return {
        type: "repeat",
        times: clamp(times, 1, 20),
        value: pair.right
      };
    }

    if (command === "speed") {
      const raw = decodeEscapedText(payload).trim().toLowerCase();
      if (raw === "default") {
        return {
          type: "speedReset"
        };
      }
      const range = parseNumericRange(raw, 1, 600, false);
      if (range) {
        return {
          type: "speedSet",
          minSec: range.min,
          maxSec: range.max
        };
      }
      const one = Number.parseFloat(raw);
      if (!Number.isFinite(one) || one <= 0) {
        return null;
      }
      const value = clamp(one, 1, 600);
      return {
        type: "speedSet",
        minSec: value,
        maxSec: value
      };
    }

    if (command === "typo") {
      return parseTypoDirective(payload);
    }

    if (command === "ws" || command === "whitespace") {
      return parseWhitespaceDirective(payload);
    }

    if (command === "fix" || command === "autofix" || command === "correct") {
      return parseNoiseFixDirective(payload);
    }

    if (command === "fixdelay") {
      return parseNoiseFixDelayDirective(payload);
    }

    if (command === "back" || command === "backspace" || command === "erase" || command === "bksp") {
      const count = Number.parseInt(decodeEscapedText(payload).trim(), 10);
      if (!Number.isFinite(count) || count < 1) {
        return null;
      }
      return {
        type: "backspace",
        count: clamp(Math.round(count), 1, 5000)
      };
    }

    if (command === "raw" || command === "literal") {
      return {
        type: "text",
        value: decodeEscapedText(payload)
      };
    }

    if (command === "note" || command === "comment") {
      return {
        type: "noop"
      };
    }

    return null;
  }

  function parseTypoDirective(payload) {
    const raw = decodeEscapedText(payload).trim().toLowerCase();
    if (raw === "on") {
      return {
        type: "typoSetEnabled",
        enabled: true
      };
    }
    if (raw === "off") {
      return {
        type: "typoSetEnabled",
        enabled: false
      };
    }
    if (raw === "default") {
      return {
        type: "typoReset"
      };
    }
    const range = parseNumericRange(raw, 0, 100, true);
    if (range) {
      return {
        type: "typoSetRange",
        min: range.min,
        max: range.max
      };
    }
    const value = Number.parseInt(raw, 10);
    if (!Number.isFinite(value) || value < 0) {
      return null;
    }
    const safe = clamp(value, 0, 100);
    return {
      type: "typoSetRange",
      min: safe,
      max: safe
    };
  }

  function parseWhitespaceDirective(payload) {
    const raw = decodeEscapedText(payload).trim().toLowerCase();
    if (raw === "on") {
      return {
        type: "wsSetEnabled",
        enabled: true
      };
    }
    if (raw === "off") {
      return {
        type: "wsSetEnabled",
        enabled: false
      };
    }
    if (raw === "keep") {
      return {
        type: "wsSetKeep",
        keep: true
      };
    }
    if (raw === "drop") {
      return {
        type: "wsSetKeep",
        keep: false
      };
    }
    if (raw === "default") {
      return {
        type: "wsReset"
      };
    }
    const range = parseNumericRange(raw, 0, 100, true);
    if (range) {
      return {
        type: "wsSetRange",
        min: range.min,
        max: range.max
      };
    }
    const value = Number.parseInt(raw, 10);
    if (!Number.isFinite(value) || value < 0) {
      return null;
    }
    const safe = clamp(value, 0, 100);
    return {
      type: "wsSetRange",
      min: safe,
      max: safe
    };
  }

  function parseNoiseFixDirective(payload) {
    const raw = decodeEscapedText(payload).trim().toLowerCase();
    if (raw === "default") {
      return {
        type: "noiseFixReset"
      };
    }
    if (raw === "legacy" || raw === "off" || raw === "immediate" || raw === "delayed" || raw === "random") {
      return {
        type: "noiseFixSetMode",
        mode: raw
      };
    }
    return parseNoiseFixDelayDirective(raw);
  }

  function parseNoiseFixDelayDirective(payload) {
    const raw = decodeEscapedText(payload).trim().toLowerCase();
    const range = parseNumericRange(raw, 0, 20000, true);
    if (range) {
      return {
        type: "noiseFixSetDelay",
        minMs: range.min,
        maxMs: range.max
      };
    }
    const value = Number.parseInt(raw, 10);
    if (!Number.isFinite(value) || value < 0) {
      return null;
    }
    const safe = clamp(value, 0, 20000);
    return {
      type: "noiseFixSetDelay",
      minMs: safe,
      maxMs: safe
    };
  }

  function decodeEscapedText(text) {
    const source = String(text || "");
    let output = "";
    let index = 0;
    while (index < source.length) {
      if (source.startsWith("\\[[", index)) {
        output += "[[";
        index += 3;
        continue;
      }
      if (source.startsWith("\\]]", index)) {
        output += "]]";
        index += 3;
        continue;
      }
      if (source[index] === "\\" && index + 1 < source.length) {
        output += source[index + 1];
        index += 2;
        continue;
      }
      output += source[index];
      index += 1;
    }
    return output;
  }

  function splitTopLevel(text, delimiter) {
    const source = String(text || "");
    if (!delimiter) {
      return [source];
    }
    const parts = [];
    let depth = 0;
    let start = 0;
    let index = 0;
    while (index < source.length) {
      if (source.startsWith("\\[[", index) || source.startsWith("\\]]", index)) {
        index += 3;
        continue;
      }
      if (source[index] === "\\") {
        index += 2;
        continue;
      }
      if (source.startsWith("[[", index)) {
        depth += 1;
        index += 2;
        continue;
      }
      if (depth > 0 && source.startsWith("]]", index)) {
        depth -= 1;
        index += 2;
        continue;
      }
      if (depth === 0 && source.startsWith(delimiter, index)) {
        parts.push(source.slice(start, index));
        index += delimiter.length;
        start = index;
        continue;
      }
      index += 1;
    }
    parts.push(source.slice(start));
    return parts;
  }

  function splitOnceTopLevel(text, marker) {
    const source = String(text || "");
    if (!marker) {
      return null;
    }
    let depth = 0;
    let index = 0;
    while (index < source.length) {
      if (source.startsWith("\\[[", index) || source.startsWith("\\]]", index)) {
        index += 3;
        continue;
      }
      if (source[index] === "\\") {
        index += 2;
        continue;
      }
      if (source.startsWith("[[", index)) {
        depth += 1;
        index += 2;
        continue;
      }
      if (depth > 0 && source.startsWith("]]", index)) {
        depth -= 1;
        index += 2;
        continue;
      }
      if (depth === 0 && source.startsWith(marker, index)) {
        return {
          left: source.slice(0, index),
          right: source.slice(index + marker.length)
        };
      }
      index += 1;
    }
    return null;
  }

  function parseNumericRange(raw, min, max, integer) {
    const normalized = String(raw || "")
      .trim()
      .replace(/[–—−~～]/g, "-")
      .replace(/\s+to\s+/gi, "-");
    const match = normalized.match(/^(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)$/);
    if (!match) {
      return null;
    }
    let a = Number.parseFloat(match[1]);
    let b = Number.parseFloat(match[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      return null;
    }
    if (integer) {
      a = Math.round(a);
      b = Math.round(b);
    }
    a = clamp(a, min, max);
    b = clamp(b, min, max);
    return {
      min: Math.min(a, b),
      max: Math.max(a, b)
    };
  }

  function cloneTypingSettings(settings) {
    return {
      ...settings
    };
  }

  function hasDirectiveOperations(operations) {
    return Array.isArray(operations) && operations.some((op) => op && op.type && op.type !== "text");
  }

  function disableImplicitNoise(settings) {
    settings.typoEnabled = false;
    settings.typoMin = 0;
    settings.typoMax = 0;
    settings.whitespaceEnabled = false;
    settings.whitespaceMin = 0;
    settings.whitespaceMax = 0;
    settings.pauseCountPer100 = 0;
    return settings;
  }

  function reseedBehaviorPlan(runtime) {
    runtime.charsInBlock = 0;
    runtime.blockIndex += 1;
    runtime.blockPlan = createBlockPlan(runtime.settings);
  }

  function createBlockPlan(settings) {
    const typoCount = settings.typoEnabled ? randomInt(settings.typoMin, settings.typoMax) : 0;
    const whitespaceCount = settings.whitespaceEnabled ? randomInt(settings.whitespaceMin, settings.whitespaceMax) : 0;
    const pauseCount = clamp(Math.round(settings.pauseCountPer100), 0, 100);
    const charDelayMs = getBlockCharDelayMs(settings);

    return {
      typos: pickPositions(100, typoCount),
      whitespace: pickPositions(100, whitespaceCount),
      pauses: pickPositions(100, pauseCount),
      charDelayMs
    };
  }

  function pickPositions(total, count) {
    const safeCount = clamp(count, 0, total);
    const slots = new Set();
    while (slots.size < safeCount) {
      slots.add(randomInt(1, total));
    }
    return slots;
  }

  function canApplyTypo(char) {
    return /^[A-Za-z0-9`~!@#$%^&*()_\-+=\[\]{}\\|;:'",.<>/?]$/.test(char);
  }

  function buildTypoContext(chars, index) {
    const current = chars[index];
    if (!/[A-Za-z]/.test(current || "")) {
      return {
        word: "",
        inTopRowWord: false
      };
    }
    let start = index;
    let end = index;
    while (start > 0 && /[A-Za-z]/.test(chars[start - 1])) {
      start -= 1;
    }
    while (end + 1 < chars.length && /[A-Za-z]/.test(chars[end + 1])) {
      end += 1;
    }
    const word = chars.slice(start, end + 1).join("");
    return {
      word,
      inTopRowWord: TOP_ROW_WORD_REGEX.test(word)
    };
  }

  function getNearbyChar(char, context) {
    const isUpper = char >= "A" && char <= "Z";
    const lower = char.toLowerCase();
    if (context && context.inTopRowWord && /[a-z]/.test(lower) && Math.random() < TOP_ROW_SPECIAL_TYPO_PROBABILITY) {
      return TOP_ROW_SPECIAL_TYPO_POOL[randomInt(0, TOP_ROW_SPECIAL_TYPO_POOL.length - 1)];
    }
    for (const row of KEYBOARD_ROWS) {
      const index = row.indexOf(lower);
      if (index === -1) {
        continue;
      }
      const candidates = [];
      if (index > 0) {
        candidates.push(row[index - 1]);
      }
      if (index < row.length - 1) {
        candidates.push(row[index + 1]);
      }
      if (candidates.length === 0) {
        return null;
      }
      const pick = candidates[randomInt(0, candidates.length - 1)];
      if (isUpper && /[a-z]/.test(pick)) {
        return pick.toUpperCase();
      }
      return pick;
    }
    return null;
  }

  function parseShortcut(shortcutText) {
    const normalized = String(shortcutText || "")
      .trim()
      .replace(/\s+/g, "");
    if (!normalized) {
      return null;
    }
    const parts = normalized.split("+").filter(Boolean);
    if (parts.length === 0) {
      return null;
    }

    const combo = {
      ctrl: false,
      shift: false,
      alt: false,
      meta: false,
      key: ""
    };

    for (const rawPart of parts) {
      const part = rawPart.toLowerCase();
      if (part === "ctrl" || part === "control") {
        combo.ctrl = true;
      } else if (part === "shift") {
        combo.shift = true;
      } else if (part === "alt" || part === "option") {
        combo.alt = true;
      } else if (part === "cmd" || part === "command" || part === "meta" || part === "win") {
        combo.meta = true;
      } else {
        combo.key = normalizeKeyToken(part);
      }
    }

    if (!combo.key) {
      return null;
    }
    return combo;
  }

  function normalizeKeyToken(token) {
    const aliases = {
      esc: "escape",
      spacebar: "space",
      space: "space",
      return: "enter",
      del: "delete",
      left: "arrowleft",
      right: "arrowright",
      up: "arrowup",
      down: "arrowdown"
    };
    if (aliases[token]) {
      return aliases[token];
    }
    return token;
  }

  function shortcutMatches(event, combo) {
    if (!combo) {
      return false;
    }
    if (event.ctrlKey !== combo.ctrl) {
      return false;
    }
    if (event.shiftKey !== combo.shift) {
      return false;
    }
    if (event.altKey !== combo.alt) {
      return false;
    }
    if (event.metaKey !== combo.meta) {
      return false;
    }
    return normalizeEventKey(event.key) === combo.key;
  }

  function normalizeEventKey(key) {
    const lower = String(key || "").toLowerCase();
    if (lower === " ") {
      return "space";
    }
    if (lower === "esc") {
      return "escape";
    }
    return lower;
  }

  function normalizeNoiseCorrectionMode(value) {
    const mode = String(value || "").trim().toLowerCase();
    if (mode === "off" || mode === "immediate" || mode === "delayed" || mode === "random" || mode === "legacy") {
      return mode;
    }
    return DEFAULT_SETTINGS.noiseCorrectionMode;
  }

  function normalizeSettings(raw) {
    const speedMin = numeric(raw.speedMinSec, DEFAULT_SETTINGS.speedMinSec, 1, 600);
    const speedMax = numeric(raw.speedMaxSec, DEFAULT_SETTINGS.speedMaxSec, 1, 600);
    const typoMin = numeric(raw.typoMin, DEFAULT_SETTINGS.typoMin, 0, 100);
    const typoMax = numeric(raw.typoMax, DEFAULT_SETTINGS.typoMax, 0, 100);
    const wsMin = numeric(raw.whitespaceMin, DEFAULT_SETTINGS.whitespaceMin, 0, 100);
    const wsMax = numeric(raw.whitespaceMax, DEFAULT_SETTINGS.whitespaceMax, 0, 100);
    const pauseMin = numeric(raw.pauseMinMs, DEFAULT_SETTINGS.pauseMinMs, 0, 20000);
    const pauseMax = numeric(raw.pauseMaxMs, DEFAULT_SETTINGS.pauseMaxMs, 0, 20000);
    const correctionMin = numeric(
      raw.noiseCorrectionDelayMinMs,
      DEFAULT_SETTINGS.noiseCorrectionDelayMinMs,
      0,
      20000
    );
    const correctionMax = numeric(
      raw.noiseCorrectionDelayMaxMs,
      DEFAULT_SETTINGS.noiseCorrectionDelayMaxMs,
      0,
      20000
    );

    return {
      ...DEFAULT_SETTINGS,
      language: raw.language || state.language || "en",
      sourceText: String(raw.sourceText || ""),
      enableDirectives: raw.enableDirectives !== false,
      speedRandom: raw.speedRandom !== false,
      speedMinSec: Math.min(speedMin, speedMax),
      speedMaxSec: Math.max(speedMin, speedMax),
      typoEnabled: raw.typoEnabled !== false,
      typoMin: Math.min(typoMin, typoMax),
      typoMax: Math.max(typoMin, typoMax),
      whitespaceEnabled: Boolean(raw.whitespaceEnabled),
      whitespaceMin: Math.min(wsMin, wsMax),
      whitespaceMax: Math.max(wsMin, wsMax),
      whitespaceKeep: Boolean(raw.whitespaceKeep),
      noiseCorrectionMode: normalizeNoiseCorrectionMode(raw.noiseCorrectionMode),
      noiseCorrectionDelayMinMs: Math.min(correctionMin, correctionMax),
      noiseCorrectionDelayMaxMs: Math.max(correctionMin, correctionMax),
      pauseMinMs: Math.min(pauseMin, pauseMax),
      pauseMaxMs: Math.max(pauseMin, pauseMax),
      pauseCountPer100: numeric(raw.pauseCountPer100, DEFAULT_SETTINGS.pauseCountPer100, 0, 100),
      stopShortcut: String(raw.stopShortcut || state.shortcutConfig.stopShortcut || DEFAULT_SETTINGS.stopShortcut),
      clearShortcut: String(raw.clearShortcut || state.shortcutConfig.clearShortcut || DEFAULT_SETTINGS.clearShortcut)
    };
  }

  function findTypingTarget(_settings) {
    if (isGoogleDocsPage()) {
      return findGoogleDocsTypingTarget();
    }

    const active = getDeepActiveElement(document);
    if (isEditable(active)) {
      return active;
    }
    if (state.lastEditable && state.lastEditable.isConnected && isEditable(state.lastEditable)) {
      return state.lastEditable;
    }
    const fallback = findBestEditableCandidate(document);
    if (fallback) {
      state.lastEditable = fallback;
      return fallback;
    }
    return null;
  }

  function findGoogleDocsTypingTarget() {
    const direct = queryGoogleDocsTypingTarget();
    if (direct) {
      return direct;
    }
    activateGoogleDocsEditorSurface();
    return queryGoogleDocsTypingTarget();
  }

  function queryGoogleDocsTypingTarget() {
    const active = getDeepActiveElement(document);
    if (isEditable(active) && isGoogleDocsEditorElement(active)) {
      return active;
    }

    if (
      state.lastEditable &&
      state.lastEditable.isConnected &&
      isEditable(state.lastEditable) &&
      isGoogleDocsEditorElement(state.lastEditable)
    ) {
      return state.lastEditable;
    }

    if (isGoogleDocsContext() && !IS_TOP_FRAME) {
      if (isGoogleDocsTypingFrame() && document.body && isEditable(document.body)) {
        state.lastEditable = document.body;
        return document.body;
      }
      const localCandidate = findBestEditableCandidate(document);
      if (localCandidate) {
        state.lastEditable = localCandidate;
        return localCandidate;
      }
    }

    const directTextareas = queryAllDeep(
      document,
      "textarea.docs-texteventtarget-ia, textarea.docs-texteventtarget-ib, textarea[class*='docs-texteventtarget'], textarea[id*='docs-texteventtarget'], textarea[class*='kix-clipboard']"
    );
    for (const textarea of directTextareas) {
      if (textarea instanceof HTMLTextAreaElement) {
        state.lastEditable = textarea;
        return textarea;
      }
    }

    const anyDocsTextarea = queryAllDeep(document, "textarea")
      .filter((node) => node instanceof HTMLTextAreaElement)
      .sort((a, b) => getGoogleDocsTextareaScore(b) - getGoogleDocsTextareaScore(a))[0];
    if (anyDocsTextarea) {
      state.lastEditable = anyDocsTextarea;
      return anyDocsTextarea;
    }

    const iframe = document.querySelector("iframe.docs-texteventtarget-iframe");
    if (iframe instanceof HTMLIFrameElement) {
      try {
        const iframeDoc = iframe.contentDocument;
        if (iframeDoc) {
          const frameActive = getDeepActiveElement(iframeDoc);
          if (isEditable(frameActive)) {
            state.lastEditable = frameActive;
            return frameActive;
          }
          if (iframeDoc.body && iframeDoc.body.isContentEditable) {
            state.lastEditable = iframeDoc.body;
            return iframeDoc.body;
          }
          const iframeCandidates = queryAllDeep(
            iframeDoc,
            "textarea, [contenteditable='true'], [contenteditable=''], [contenteditable='plaintext-only'], [role='textbox']"
          );
          for (const candidate of iframeCandidates) {
            if (isEditable(candidate)) {
              state.lastEditable = candidate;
              return candidate;
            }
          }
        }
      } catch (_error) {
        // Cross-origin protection; ignore and continue with safe fallback.
      }
    }

    const allIframes = Array.from(document.querySelectorAll("iframe"));
    for (const frame of allIframes) {
      if (!(frame instanceof HTMLIFrameElement)) {
        continue;
      }
      try {
        const frameDoc = frame.contentDocument;
        if (!frameDoc) {
          continue;
        }
        const frameCandidates = queryAllDeep(
          frameDoc,
          "textarea, [contenteditable='true'], [contenteditable=''], [contenteditable='plaintext-only'], [role='textbox']"
        ).filter((node) => isEditable(node));
        if (frameCandidates.length === 0) {
          continue;
        }
        frameCandidates.sort((a, b) => getEditableScore(b) - getEditableScore(a));
        state.lastEditable = frameCandidates[0] || null;
        if (state.lastEditable) {
          return state.lastEditable;
        }
      } catch (_error) {
        // Ignore cross-origin iframe access issues.
      }
    }

    const editorCandidates = queryAllDeep(
      document,
      "textarea, [contenteditable='true'], [contenteditable=''], [contenteditable='plaintext-only'], [role='textbox']"
    ).filter((node) => isEditable(node) && isGoogleDocsEditorElement(node));

    if (editorCandidates.length === 0) {
      return null;
    }
    editorCandidates.sort((a, b) => getEditableScore(b) - getEditableScore(a));
    state.lastEditable = editorCandidates[0] || null;
    return editorCandidates[0] || null;
  }

  function activateGoogleDocsEditorSurface() {
    const surface = queryAllDeep(
      document,
      ".kix-page-content-wrapper, .kix-page-column, .kix-page, .kix-appview-editor, .kix-appview-editor-container, #docs-editor, .docs-editor-container, .kix-canvas-tile-content"
    )
      .filter((node) => node instanceof Element)
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 40 && rect.height > 40;
      })
      .sort((a, b) => getEditableScore(b) - getEditableScore(a))[0];
    if (!(surface instanceof Element)) {
      return;
    }
    const rect = surface.getBoundingClientRect();
    const clickPoints = [
      {
        clientX: Math.round(rect.left + rect.width * 0.5),
        clientY: Math.round(rect.top + rect.height * 0.25)
      },
      {
        clientX: Math.round(rect.left + rect.width * 0.5),
        clientY: Math.round(rect.top + rect.height * 0.5)
      }
    ];
    const remembered = state.lastDocsPointer;
    if (remembered && Date.now() - remembered.at < 90000) {
      clickPoints.unshift({
        clientX: clamp(remembered.x, Math.round(rect.left + 4), Math.round(rect.right - 4)),
        clientY: clamp(remembered.y, Math.round(rect.top + 4), Math.round(rect.bottom - 4))
      });
    }
    const validPoints = clickPoints.filter((point) => Number.isFinite(point.clientX) && Number.isFinite(point.clientY));
    if (validPoints.length === 0) {
      return;
    }

    for (const point of validPoints) {
      if (typeof PointerEvent === "function") {
        surface.dispatchEvent(
          new PointerEvent("pointerdown", {
            bubbles: true,
            cancelable: true,
            clientX: point.clientX,
            clientY: point.clientY,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true
          })
        );
        surface.dispatchEvent(
          new PointerEvent("pointerup", {
            bubbles: true,
            cancelable: true,
            clientX: point.clientX,
            clientY: point.clientY,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true
          })
        );
      }
      surface.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          clientX: point.clientX,
          clientY: point.clientY
        })
      );
      surface.dispatchEvent(
        new MouseEvent("mouseup", {
          bubbles: true,
          cancelable: true,
          clientX: point.clientX,
          clientY: point.clientY
        })
      );
      surface.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          clientX: point.clientX,
          clientY: point.clientY
        })
      );
    }

    const probableTarget = queryGoogleDocsTypingTarget();
    if (probableTarget && typeof probableTarget.focus === "function") {
      probableTarget.focus({ preventScroll: true });
    }
  }

  function isGoogleDocsPage() {
    return location.hostname === "docs.google.com" && /^\/document\//.test(location.pathname);
  }

  function isGoogleDocsEditorElement(node) {
    if (!(node instanceof Element)) {
      return false;
    }
    if (node.id === "docs-title-input" || node.closest("#docs-titlebar, .docs-title-input-container, .docs-title-input")) {
      return false;
    }
    if (isGoogleDocsContext() && !IS_TOP_FRAME) {
      return isEditable(node);
    }
    if (node instanceof HTMLTextAreaElement) {
      const className = String(node.className || "").toLowerCase();
      const id = String(node.id || "").toLowerCase();
      if (
        className.includes("docs-texteventtarget") ||
        className.includes("kix-clipboard") ||
        id.includes("docs-texteventtarget")
      ) {
        return true;
      }
      if (node.getAttribute("aria-label")) {
        const label = node.getAttribute("aria-label").toLowerCase();
        if (label.includes("document") || label.includes("editor") || label.includes("type")) {
          return true;
        }
      }
    }
    if (node.closest(".kix-appview-editor, #docs-editor, .docs-editor-container, .kix-rotatingtilemanager")) {
      return true;
    }
    const doc = node.ownerDocument;
    if (doc && doc.defaultView && doc.defaultView.frameElement) {
      const frameEl = doc.defaultView.frameElement;
      if (frameEl instanceof HTMLIFrameElement && frameEl.classList.contains("docs-texteventtarget-iframe")) {
        return true;
      }
    }
    return false;
  }

  function getGoogleDocsTextareaScore(node) {
    if (!(node instanceof HTMLTextAreaElement)) {
      return -1;
    }
    let score = 0;
    const className = String(node.className || "").toLowerCase();
    const id = String(node.id || "").toLowerCase();
    const ariaLabel = String(node.getAttribute("aria-label") || "").toLowerCase();
    if (className.includes("docs-texteventtarget")) {
      score += 180;
    }
    if (className.includes("kix-clipboard")) {
      score += 140;
    }
    if (id.includes("docs-texteventtarget")) {
      score += 160;
    }
    if (ariaLabel.includes("document") || ariaLabel.includes("editor")) {
      score += 45;
    }
    if (ariaLabel.includes("type")) {
      score += 20;
    }
    if (node.closest(".kix-appview-editor, #docs-editor, .docs-editor-container, .kix-page-content-wrapper")) {
      score += 90;
    }
    if (node === document.activeElement) {
      score += 80;
    }
    if (!node.disabled && !node.readOnly) {
      score += 25;
    } else if (node.disabled) {
      score -= 40;
    }
    return score;
  }

  function describeTarget(node) {
    if (isGoogleDocsPage()) {
      return "Google Docs editor";
    }
    if (node instanceof HTMLTextAreaElement) {
      return `textarea${node.name ? ` (${node.name})` : ""}`;
    }
    if (node instanceof HTMLInputElement) {
      return `input[type=${node.type}]${node.name ? ` (${node.name})` : ""}`;
    }
    if (node.isContentEditable) {
      return "contenteditable";
    }
    return "editable area";
  }

  function showTargetHighlight(target) {
    hideTargetHighlight();

    const anchor = getTargetHighlightAnchor(target);
    if (!anchor) {
      return;
    }
    const rect = anchor.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) {
      return;
    }

    const styleId = "human-typing-target-highlight-style";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        .human-typing-target-highlight {
          position: fixed;
          z-index: 2147483645;
          border: 2px solid #2b9bf3;
          border-radius: 8px;
          box-shadow: 0 0 0 2000px rgba(5, 21, 52, 0.12), 0 0 0 4px rgba(43, 155, 243, 0.22);
          pointer-events: none;
          animation: targetPulse 1.2s ease-in-out infinite;
        }
        .human-typing-target-highlight .tag {
          position: absolute;
          top: -24px;
          left: 0;
          background: #1c74bb;
          color: #fff;
          border-radius: 999px;
          font-family: "Segoe UI", sans-serif;
          font-size: 11px;
          padding: 4px 9px;
          white-space: nowrap;
        }
        @keyframes targetPulse {
          0% { box-shadow: 0 0 0 2000px rgba(5, 21, 52, 0.12), 0 0 0 2px rgba(43, 155, 243, 0.16); }
          50% { box-shadow: 0 0 0 2000px rgba(5, 21, 52, 0.1), 0 0 0 6px rgba(43, 155, 243, 0.24); }
          100% { box-shadow: 0 0 0 2000px rgba(5, 21, 52, 0.12), 0 0 0 2px rgba(43, 155, 243, 0.16); }
        }
      `;
      document.documentElement.appendChild(style);
    }

    const overlay = document.createElement("div");
    overlay.className = "human-typing-target-highlight";
    overlay.style.left = `${Math.max(0, rect.left - 2)}px`;
    overlay.style.top = `${Math.max(0, rect.top - 2)}px`;
    overlay.style.width = `${Math.max(8, rect.width + 4)}px`;
    overlay.style.height = `${Math.max(8, rect.height + 4)}px`;

    const tag = document.createElement("div");
    tag.className = "tag";
    tag.textContent = `${t("targetLabel")}: ${describeTarget(target)}`;
    overlay.appendChild(tag);

    document.documentElement.appendChild(overlay);
    state.targetHighlightEl = overlay;
    state.targetHighlightTimerId = window.setTimeout(() => {
      hideTargetHighlight();
    }, 6000);
  }

  function hideTargetHighlight() {
    if (state.targetHighlightTimerId) {
      window.clearTimeout(state.targetHighlightTimerId);
      state.targetHighlightTimerId = 0;
    }
    if (state.targetHighlightEl && state.targetHighlightEl.isConnected) {
      state.targetHighlightEl.remove();
    }
    state.targetHighlightEl = null;
  }

  function getTargetHighlightAnchor(target) {
    if (isGoogleDocsPage()) {
      const editor = queryAllDeep(
        document,
        ".kix-page-content-wrapper, .kix-page-column, .kix-page, .kix-appview-editor, .kix-appview-editor-container, #docs-editor, .docs-editor-container"
      )
        .filter((node) => node instanceof Element)
        .sort((a, b) => getEditableScore(b) - getEditableScore(a))[0];
      if (editor instanceof Element) {
        return editor;
      }
    }
    if (target.ownerDocument === document) {
      return target;
    }
    const doc = target.ownerDocument;
    if (doc && doc.defaultView && doc.defaultView.frameElement instanceof Element) {
      return doc.defaultView.frameElement;
    }
    return target;
  }

  function getDeepActiveElement(doc) {
    let active = doc.activeElement;
    while (active && active.tagName === "IFRAME") {
      try {
        const nested = active.contentDocument ? active.contentDocument.activeElement : null;
        if (!nested || nested === active) {
          break;
        }
        active = nested;
      } catch (_error) {
        break;
      }
    }
    return active;
  }

  function queryAllDeep(root, selector) {
    if (!root || typeof selector !== "string" || !selector.trim()) {
      return [];
    }
    const results = [];
    const seen = new Set();
    const stack = [root];

    while (stack.length > 0) {
      const current = stack.pop();
      if (
        !current ||
        !(
          current instanceof Document ||
          current instanceof ShadowRoot ||
          current instanceof Element
        )
      ) {
        continue;
      }
      let found = [];
      try {
        found = Array.from(current.querySelectorAll(selector));
      } catch (_error) {
        found = [];
      }
      for (const node of found) {
        if (!seen.has(node)) {
          seen.add(node);
          results.push(node);
        }
      }
      const descendants = current.querySelectorAll("*");
      for (const descendant of descendants) {
        if (descendant.shadowRoot) {
          stack.push(descendant.shadowRoot);
        }
      }
    }
    return results;
  }

  function findBestEditableCandidate(doc) {
    const selector = [
      "textarea",
      "input[type='text']",
      "input[type='search']",
      "input[type='url']",
      "input[type='tel']",
      "input[type='email']",
      "input[type='password']",
      "[contenteditable='true']",
      "[contenteditable='plaintext-only']",
      "[contenteditable='']"
    ].join(",");

    const nodes = Array.from(doc.querySelectorAll(selector));
    const visible = nodes.filter((node) => isEditable(node) && isVisible(node));
    if (visible.length === 0) {
      return null;
    }

    visible.sort((a, b) => getEditableScore(b) - getEditableScore(a));
    return visible[0] || null;
  }

  function isVisible(node) {
    if (!(node instanceof Element)) {
      return false;
    }
    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }
    const rect = node.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) {
      return false;
    }
    const inViewport =
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth;
    return inViewport;
  }

  function getEditableScore(node) {
    const rect = node.getBoundingClientRect();
    let score = rect.width * rect.height;
    if (node instanceof HTMLTextAreaElement || node.isContentEditable) {
      score += 250000;
    }
    if (node === document.activeElement) {
      score += 500000;
    }
    return score;
  }

  function isEditable(node) {
    if (!(node instanceof Element)) {
      return false;
    }
    if (node instanceof HTMLTextAreaElement) {
      return !node.disabled && !node.readOnly;
    }
    if (node instanceof HTMLInputElement) {
      const allowed = ["text", "search", "url", "tel", "email", "password"];
      return allowed.includes(node.type) && !node.disabled && !node.readOnly;
    }
    if (node.getAttribute("role") === "textbox") {
      return true;
    }
    return node.isContentEditable;
  }

  function isSingleLineInput(node) {
    return node instanceof HTMLInputElement && node.type !== "textarea";
  }

  function isRuntimeActive(runtime) {
    return (
      state.isTyping &&
      !state.stopRequested &&
      state.runtime &&
      state.runtime.sessionId === runtime.sessionId
    );
  }

  function dispatchKeyboard(target, eventType, key) {
    const eventKey = key === "\n" ? "Enter" : key;
    const meta = getKeyEventMeta(eventKey);
    const init = {
      key: eventKey,
      code: meta.code,
      keyCode: meta.keyCode,
      which: meta.keyCode,
      charCode: eventType === "keypress" ? meta.charCode : 0,
      bubbles: true,
      cancelable: true,
      composed: true
    };

    let event;
    try {
      event = new KeyboardEvent(eventType, init);
      if (meta.keyCode > 0 && (event.keyCode !== meta.keyCode || event.which !== meta.keyCode)) {
        try {
          Object.defineProperty(event, "keyCode", {
            value: meta.keyCode
          });
          Object.defineProperty(event, "which", {
            value: meta.keyCode
          });
        } catch (_error) {
          // Some Chromium builds disallow redefining these readonly fields.
        }
      }
    } catch (_error) {
      event = new Event(eventType, {
        bubbles: true,
        cancelable: true
      });
    }
    target.dispatchEvent(event);
  }

  function shouldEmitKeyPress(key) {
    const normalized = key === "\n" ? "Enter" : String(key || "");
    if (!normalized) {
      return false;
    }
    const lower = normalized.toLowerCase();
    if (lower === "enter" || lower === "backspace" || lower === "tab") {
      return true;
    }
    return normalized.length === 1;
  }

  function getKeyEventMeta(key) {
    const raw = String(key || "");
    const lower = raw.toLowerCase();
    if (lower === "backspace") {
      return { code: "Backspace", keyCode: 8, charCode: 0 };
    }
    if (lower === "shift") {
      return { code: "ShiftLeft", keyCode: 16, charCode: 0 };
    }
    if (lower === "control" || lower === "ctrl") {
      return { code: "ControlLeft", keyCode: 17, charCode: 0 };
    }
    if (lower === "alt" || lower === "option") {
      return { code: "AltLeft", keyCode: 18, charCode: 0 };
    }
    if (lower === "meta" || lower === "command" || lower === "cmd") {
      return { code: "MetaLeft", keyCode: 91, charCode: 0 };
    }
    if (lower === "tab") {
      return { code: "Tab", keyCode: 9, charCode: 0 };
    }
    if (lower === "enter") {
      return { code: "Enter", keyCode: 13, charCode: 13 };
    }
    if (lower === "escape") {
      return { code: "Escape", keyCode: 27, charCode: 0 };
    }
    if (raw === " ") {
      return { code: "Space", keyCode: 32, charCode: 32 };
    }
    if (raw.length === 1) {
      const codePoint = raw.charCodeAt(0);
      if (/[a-z]/i.test(raw)) {
        return { code: `Key${raw.toUpperCase()}`, keyCode: codePoint, charCode: codePoint };
      }
      if (/[0-9]/.test(raw)) {
        return { code: `Digit${raw}`, keyCode: codePoint, charCode: codePoint };
      }
      return { code: "", keyCode: codePoint, charCode: codePoint };
    }
    return { code: "", keyCode: 0, charCode: 0 };
  }

  function dispatchBeforeInput(target, inputType, data) {
    try {
      const event = new InputEvent("beforeinput", {
        inputType,
        data,
        bubbles: true,
        cancelable: true,
        composed: true
      });
      target.dispatchEvent(event);
    } catch (_error) {
      const fallback = new Event("beforeinput", {
        bubbles: true,
        cancelable: true
      });
      target.dispatchEvent(fallback);
    }
  }

  function dispatchInput(target, inputType, data) {
    try {
      const event = new InputEvent("input", {
        inputType,
        data,
        bubbles: true,
        composed: true
      });
      target.dispatchEvent(event);
    } catch (_error) {
      const fallback = new Event("input", {
        bubbles: true
      });
      target.dispatchEvent(fallback);
    }
  }

  function getBlockCharDelayMs(settings) {
    const secondsPer100 = settings.speedRandom
      ? randomFloat(settings.speedMinSec, settings.speedMaxSec)
      : (settings.speedMinSec + settings.speedMaxSec) / 2;
    return Math.max(8, (secondsPer100 * 1000) / 100);
  }

  function getCharacterDelayMs(settings, blockCharDelayMs) {
    const base = Number.isFinite(blockCharDelayMs) ? blockCharDelayMs : getBlockCharDelayMs(settings);
    const jitter = base * randomFloat(-0.08, 0.08);
    return Math.max(8, Math.round(base + jitter));
  }

  function getPauseMs(settings, multiplier = 1) {
    const average = (settings.pauseMinMs + settings.pauseMaxMs) / 2;
    const jitter = average * randomFloat(-0.18, 0.18);
    return Math.max(0, Math.round((average + jitter) * multiplier));
  }

  function estimateDurationMs(settings, operations) {
    const sim = cloneTypingSettings(settings);
    const context = {
      avgCharMs: getAverageCharDelayMs(sim),
      baseSettings: cloneTypingSettings(settings)
    };
    const total = estimateOperationsDuration(operations, sim, context, 0);
    return Math.max(500, Math.round(total));
  }

  function estimateOperationsDuration(operations, settings, context, depth) {
    if (depth > 6) {
      return 0;
    }
    let total = 0;
    for (const op of operations) {
      if (op.type === "text") {
        const count = countGraphemes(op.value);
        total += estimateTextDuration(count, settings, context);
      } else if (op.type === "rev") {
        total += estimateTextDuration(countGraphemes(op.draft), settings, context);
        total += getAveragePauseMs(settings, 1.25);
        total += estimateDeletionDuration(countGraphemes(op.draft), context.avgCharMs);
        total += estimateTextDuration(countGraphemes(op.final), settings, context);
      } else if (op.type === "del") {
        total += estimateTextDuration(countGraphemes(op.value), settings, context);
        total += getAveragePauseMs(settings, 1.05);
        total += estimateDeletionDuration(countGraphemes(op.value), context.avgCharMs);
      } else if (op.type === "pause") {
        total += estimatePauseDurationMs(clamp(op.ms, 0, 120000), true);
      } else if (op.type === "pauseRange") {
        total += estimatePauseDurationMs((op.minMs + op.maxMs) / 2, true);
      } else if (op.type === "choice") {
        if (op.options.length > 0) {
          const optionDurations = op.options.map((item) => {
            const nested = parseDirectives(item);
            return estimateOperationsDuration(nested, cloneTypingSettings(settings), { ...context }, depth + 1);
          });
          total += average(optionDurations);
        }
      } else if (op.type === "chance") {
        const nested = parseDirectives(op.value);
        const chanceMs = estimateOperationsDuration(nested, cloneTypingSettings(settings), { ...context }, depth + 1);
        total += chanceMs * (clamp(op.percent, 0, 100) / 100);
      } else if (op.type === "repeat") {
        const nested = parseDirectives(op.value);
        const nestedMs = estimateOperationsDuration(nested, cloneTypingSettings(settings), { ...context }, depth + 1);
        total += nestedMs * clamp(op.times, 1, 20);
      } else if (op.type === "speedSet") {
        settings.speedMinSec = op.minSec;
        settings.speedMaxSec = op.maxSec;
        settings.speedRandom = true;
        context.avgCharMs = getAverageCharDelayMs(settings);
      } else if (op.type === "speedReset") {
        settings.speedMinSec = context.baseSettings.speedMinSec;
        settings.speedMaxSec = context.baseSettings.speedMaxSec;
        settings.speedRandom = context.baseSettings.speedRandom;
        context.avgCharMs = getAverageCharDelayMs(settings);
      } else if (op.type === "typoSetEnabled") {
        settings.typoEnabled = op.enabled;
      } else if (op.type === "typoSetRange") {
        settings.typoEnabled = true;
        settings.typoMin = op.min;
        settings.typoMax = op.max;
      } else if (op.type === "typoReset") {
        settings.typoEnabled = context.baseSettings.typoEnabled;
        settings.typoMin = context.baseSettings.typoMin;
        settings.typoMax = context.baseSettings.typoMax;
      } else if (op.type === "wsSetEnabled") {
        settings.whitespaceEnabled = op.enabled;
      } else if (op.type === "wsSetRange") {
        settings.whitespaceEnabled = true;
        settings.whitespaceMin = op.min;
        settings.whitespaceMax = op.max;
      } else if (op.type === "wsSetKeep") {
        settings.whitespaceKeep = op.keep;
      } else if (op.type === "wsReset") {
        settings.whitespaceEnabled = context.baseSettings.whitespaceEnabled;
        settings.whitespaceMin = context.baseSettings.whitespaceMin;
        settings.whitespaceMax = context.baseSettings.whitespaceMax;
        settings.whitespaceKeep = context.baseSettings.whitespaceKeep;
      } else if (op.type === "noiseFixSetMode") {
        settings.noiseCorrectionMode = normalizeNoiseCorrectionMode(op.mode);
      } else if (op.type === "noiseFixSetDelay") {
        settings.noiseCorrectionDelayMinMs = clamp(Math.min(op.minMs, op.maxMs), 0, 20000);
        settings.noiseCorrectionDelayMaxMs = clamp(Math.max(op.minMs, op.maxMs), 0, 20000);
      } else if (op.type === "noiseFixReset") {
        settings.noiseCorrectionMode = context.baseSettings.noiseCorrectionMode;
        settings.noiseCorrectionDelayMinMs = context.baseSettings.noiseCorrectionDelayMinMs;
        settings.noiseCorrectionDelayMaxMs = context.baseSettings.noiseCorrectionDelayMaxMs;
      } else if (op.type === "backspace") {
        total += estimateDeletionDuration(clamp(op.count, 0, 5000), context.avgCharMs);
      } else if (op.type === "noop") {
        total += 0;
      }
    }
    return total;
  }

  function estimateTextDuration(charCount, settings, context) {
    const avgCharMs = context.avgCharMs;
    const avgPauseMs = getAveragePauseMs(settings, 1);
    const typoRate = settings.typoEnabled ? ((settings.typoMin + settings.typoMax) / 2) / 100 : 0;
    const wsRate = settings.whitespaceEnabled ? ((settings.whitespaceMin + settings.whitespaceMax) / 2) / 100 : 0;
    const pauseRate = clamp(settings.pauseCountPer100, 0, 100) / 100;
    const typoCorrection = getCorrectionEstimate(settings, "typo");
    const wsCorrection = getCorrectionEstimate(settings, "whitespace");
    const typoExtra =
      charCount * typoRate * typoCorrection.correctRate * (avgCharMs + typoCorrection.avgDelayMs + 170);
    const wsExtra =
      charCount *
      wsRate *
      (avgCharMs + 90 + wsCorrection.correctRate * (avgCharMs + wsCorrection.avgDelayMs + 95));
    const pauseExtra = charCount * pauseRate * avgPauseMs;
    return charCount * avgCharMs + typoExtra + wsExtra + pauseExtra;
  }

  function getCorrectionEstimate(settings, noiseType) {
    const mode = normalizeNoiseCorrectionMode(settings.noiseCorrectionMode);
    const avgDelay = (Number(settings.noiseCorrectionDelayMinMs) + Number(settings.noiseCorrectionDelayMaxMs)) / 2;
    if (mode === "off") {
      return {
        correctRate: 0,
        avgDelayMs: 0
      };
    }
    if (mode === "legacy") {
      if (noiseType === "whitespace") {
        return {
          correctRate: settings.whitespaceKeep ? 0 : 1,
          avgDelayMs: 0
        };
      }
      return {
        correctRate: 1,
        avgDelayMs: 0
      };
    }
    if (mode === "immediate") {
      return {
        correctRate: 1,
        avgDelayMs: 0
      };
    }
    if (mode === "random") {
      return {
        correctRate: 1,
        avgDelayMs: Math.max(0, avgDelay / 2)
      };
    }
    return {
      correctRate: 1,
      avgDelayMs: Math.max(0, avgDelay)
    };
  }

  function estimateDeletionDuration(charCount, avgCharMs) {
    return charCount * (avgCharMs * 0.55);
  }

  function getAverageCharDelayMs(settings) {
    const secondsPer100 = settings.speedRandom
      ? (settings.speedMinSec + settings.speedMaxSec) / 2
      : (settings.speedMinSec + settings.speedMaxSec) / 2;
    return Math.max(8, (secondsPer100 * 1000) / 100);
  }

  function getAveragePauseMs(settings, multiplier) {
    const avg = (settings.pauseMinMs + settings.pauseMaxMs) / 2;
    return estimatePauseDurationMs(avg * (multiplier || 1), false);
  }

  function estimatePauseDurationMs(pauseMs, forceAutosave) {
    const safePause = Math.max(0, Number(pauseMs) || 0);
    if (!isGoogleDocsContext()) {
      return safePause;
    }
    if (forceAutosave || safePause >= GOOGLE_DOCS_AUTOSAVE_IDLE_TRIGGER_MS) {
      return Math.max(safePause, GOOGLE_DOCS_AUTOSAVE_IDLE_MIN_MS);
    }
    return safePause;
  }

  function average(values) {
    if (!values || values.length === 0) {
      return 0;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function reportProgress(runtime, status, force) {
    if (!runtime || !runtime.startedAt) {
      return;
    }
    const now = Date.now();
    if (!force && now - runtime.lastProgressSentAt < 200) {
      return;
    }
    runtime.lastProgressSentAt = now;
    const elapsedMs = Math.max(0, now - runtime.startedAt);
    const estimatedDurationMs = Math.max(1, runtime.estimatedDurationMs || 1);
    const progress = status === "completed" ? 1 : clamp(elapsedMs / estimatedDurationMs, 0, 0.995);
    const payload = {
      sessionId: runtime.sessionId,
      status: status || "running",
      progress,
      elapsedMs,
      estimatedDurationMs,
      etaMs: Math.max(0, estimatedDurationMs - elapsedMs)
    };

    state.syncedProgress = payload;
    updateFloatingPanel(payload);
    if (isPinnedModeActive()) {
      hideMiniPanelNow();
    } else {
      updateMiniPanel(payload);
    }
    chrome.runtime.sendMessage(
      {
        type: "TYPING_PROGRESS",
        payload
      },
      () => {
        void chrome.runtime.lastError;
      }
    );
  }

  function getTypingStatusPayload() {
    const runtime = state.runtime;
    if (!runtime || !state.isTyping) {
      return {
        status: "idle",
        progress: 0,
        elapsedMs: 0,
        estimatedDurationMs: 0,
        etaMs: 0,
        sessionId: null
      };
    }
    const elapsedMs = Math.max(0, Date.now() - runtime.startedAt);
    const estimatedDurationMs = Math.max(1, runtime.estimatedDurationMs || 1);
    return {
      status: "running",
      progress: clamp(elapsedMs / estimatedDurationMs, 0, 0.995),
      elapsedMs,
      estimatedDurationMs,
      etaMs: Math.max(0, estimatedDurationMs - elapsedMs),
      sessionId: runtime.sessionId
    };
  }

  function countGraphemes(text) {
    return Array.from(text || "").length;
  }

  function numeric(value, fallback, min, max) {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      return fallback;
    }
    return clamp(parsed, min, max);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function randomInt(min, max) {
    const low = Math.ceil(min);
    const high = Math.floor(max);
    return Math.floor(Math.random() * (high - low + 1)) + low;
  }

  function randomFloat(min, max) {
    return Math.random() * (max - min) + min;
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, Math.max(0, ms));
    });
  }

  function t(key) {
    const lang = CONTENT_I18N[state.language] ? state.language : "en";
    return CONTENT_I18N[lang][key] || CONTENT_I18N.en[key] || key;
  }

  function showMiniPanel() {
    if (!IS_TOP_FRAME) {
      return;
    }
    if (isPinnedModeActive()) {
      return;
    }
    const panel = ensureMiniPanel();
    if (!panel) {
      return;
    }
    panel.style.opacity = "1";
    panel.style.pointerEvents = "auto";
  }

  function updateMiniPanel(payload) {
    if (!IS_TOP_FRAME) {
      return;
    }
    if (isPinnedModeActive()) {
      return;
    }
    const panel = ensureMiniPanel();
    if (!panel) {
      return;
    }
    const stable = stabilizeProgressForDisplay(payload, "miniProgressSessionId", "miniProgressValue");
    const fill = panel.querySelector("[data-mini='fill']");
    const status = panel.querySelector("[data-mini='status']");
    const eta = panel.querySelector("[data-mini='eta']");
    const stopBtn = panel.querySelector("[data-mini='stop']");
    const cancelBtn = panel.querySelector("[data-mini='cancel']");

    const progress = clamp((Number(stable.progress) || 0) * 100, 0, 100);
    fill.style.width = `${Math.round(progress)}%`;
    status.textContent = `${Math.round(progress)}%`;

    if (stable.status === "completed") {
      eta.textContent = t("miniDone");
      stopBtn.disabled = true;
      cancelBtn.disabled = true;
    } else if (stable.status === "stopped" || stable.status === "error") {
      eta.textContent = t("miniStopped");
      stopBtn.disabled = true;
      cancelBtn.disabled = true;
    } else {
      eta.textContent = `${t("miniEta")} ${formatMs(stable.etaMs)}`;
      stopBtn.disabled = false;
      cancelBtn.disabled = false;
    }
  }

  function hideMiniPanelLater() {
    if (!IS_TOP_FRAME) {
      return;
    }
    if (isPinnedModeActive()) {
      hideMiniPanelNow();
      return;
    }
    if (!state.miniPanel) {
      return;
    }
    window.setTimeout(() => {
      if (state.miniPanel) {
        state.miniPanel.style.opacity = "0";
        state.miniPanel.style.pointerEvents = "none";
      }
    }, 1800);
  }

  function hideMiniPanelNow() {
    if (!IS_TOP_FRAME) {
      return;
    }
    if (state.miniPanel && state.miniPanel.isConnected) {
      state.miniPanel.style.opacity = "0";
      state.miniPanel.style.pointerEvents = "none";
    }
  }

  function isPinnedModeActive() {
    if (Boolean(state.floatingPanelPinned)) {
      return true;
    }
    if (!IS_TOP_FRAME) {
      return false;
    }
    if (!(state.floatingPanelEl && state.floatingPanelEl.isConnected)) {
      return false;
    }
    const style = window.getComputedStyle(state.floatingPanelEl);
    return style.pointerEvents !== "none" && Number(style.opacity) > 0.02;
  }

  function ensureMiniPanel() {
    if (!IS_TOP_FRAME) {
      return null;
    }
    if (state.miniPanel && state.miniPanel.isConnected) {
      return state.miniPanel;
    }

    const styleId = "human-typing-mini-style";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        .human-typing-mini {
          position: fixed;
          right: 14px;
          bottom: 14px;
          width: 214px;
          z-index: 2147483646;
          background: rgba(255, 255, 255, 0.97);
          border: 1px solid #cfd8ea;
          border-radius: 12px;
          box-shadow: 0 12px 30px rgba(18, 32, 63, 0.22);
          padding: 10px;
          font-family: "Segoe UI", sans-serif;
          transition: opacity 160ms ease;
          opacity: 0;
          pointer-events: none;
        }
        .human-typing-mini .mini-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 7px;
          font-size: 11.5px;
          color: #34425d;
          font-weight: 600;
        }
        .human-typing-mini .mini-top .mini-close {
          border: 0;
          background: transparent;
          color: #7082a2;
          font-size: 13px;
          cursor: pointer;
          padding: 0 4px;
        }
        .human-typing-mini .mini-track {
          width: 100%;
          height: 7px;
          border-radius: 999px;
          background: #e6edf9;
          overflow: hidden;
        }
        .human-typing-mini .mini-fill {
          height: 100%;
          width: 0%;
          background: linear-gradient(90deg, #1d8a67, #44a8ca);
        }
        .human-typing-mini .mini-eta {
          margin-top: 6px;
          font-size: 11px;
          color: #55627a;
        }
        .human-typing-mini .mini-actions {
          margin-top: 8px;
          display: flex;
          gap: 6px;
        }
        .human-typing-mini .mini-actions button {
          flex: 1;
          border: 1px solid #cfd8ea;
          background: #fff;
          border-radius: 7px;
          padding: 5px 6px;
          font-size: 11px;
          cursor: pointer;
        }
        .human-typing-mini .mini-actions .danger {
          border-color: #e8b7b2;
          color: #8f2a22;
          background: #ffeceb;
        }
      `;
      document.documentElement.appendChild(style);
    }

    const panel = document.createElement("div");
    panel.className = "human-typing-mini";
    panel.innerHTML = `
      <div class="mini-top">
        <span>${escapeHtml(t("miniTitle"))}</span>
        <span>
          <span data-mini="status">0%</span>
          <button data-mini="close" class="mini-close" type="button" title="${escapeHtml(t("miniClose"))}">×</button>
        </span>
      </div>
      <div class="mini-track"><div class="mini-fill" data-mini="fill"></div></div>
      <div class="mini-eta" data-mini="eta">${escapeHtml(t("miniEta"))} --:--</div>
      <div class="mini-actions">
        <button data-mini="stop" type="button">${escapeHtml(t("miniStop"))}</button>
        <button data-mini="cancel" type="button" class="danger">${escapeHtml(t("miniCancel"))}</button>
      </div>
    `;
    installNonFocusMouseDown(panel.querySelector("[data-mini='stop']"));
    installNonFocusMouseDown(panel.querySelector("[data-mini='cancel']"));
    installNonFocusMouseDown(panel.querySelector("[data-mini='close']"));
    panel.querySelector("[data-mini='stop']").addEventListener("click", () => {
      void stopFromFloatingPanel();
    });
    panel.querySelector("[data-mini='cancel']").addEventListener("click", () => {
      void clearFromFloatingPanel();
    });
    panel.querySelector("[data-mini='close']").addEventListener("click", () => {
      hideMiniPanelNow();
    });
    document.documentElement.appendChild(panel);
    state.miniPanel = panel;
    return panel;
  }

  function formatMs(ms) {
    const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function showToast(message, tone) {
    if (!IS_TOP_FRAME) {
      return;
    }
    const toast = ensureToast();
    if (!toast) {
      return;
    }
    toast.textContent = message;
    toast.className = `human-typing-toast ${tone || "neutral"}`;
    toast.style.opacity = "1";
    clearTimeout(showToast.timerId);
    showToast.timerId = setTimeout(() => {
      toast.style.opacity = "0";
    }, 2100);
  }

  function ensureToast() {
    if (!IS_TOP_FRAME) {
      return null;
    }
    if (state.toastEl && state.toastEl.isConnected) {
      return state.toastEl;
    }

    const styleId = "human-typing-toast-style";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        .human-typing-toast {
          position: fixed;
          top: 16px;
          right: 16px;
          z-index: 2147483647;
          padding: 8px 12px;
          border-radius: 10px;
          font-family: "Segoe UI", sans-serif;
          font-size: 12px;
          line-height: 1.4;
          border: 1px solid #cdd8ea;
          background: #f7f9fe;
          color: #2a3652;
          box-shadow: 0 10px 26px rgba(15, 32, 68, 0.22);
          pointer-events: none;
          transition: opacity 160ms ease;
          opacity: 0;
          max-width: 420px;
        }
        .human-typing-toast.success {
          background: #eaf8f2;
          border-color: #9adbbf;
          color: #0b5a42;
        }
        .human-typing-toast.warning {
          background: #fff4e8;
          border-color: #f2cba7;
          color: #7a4617;
        }
        .human-typing-toast.error {
          background: #ffe9e7;
          border-color: #efb3ae;
          color: #872720;
        }
      `;
      document.documentElement.appendChild(style);
    }

    const toast = document.createElement("div");
    toast.className = "human-typing-toast neutral";
    document.documentElement.appendChild(toast);
    state.toastEl = toast;
    return toast;
  }
})();
