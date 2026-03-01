const ROUTED_MESSAGE_TYPES = new Set([
  "START_TYPING",
  "PREVIEW_TARGET",
  "CLEAR_TARGET_PREVIEW",
  "SET_FLOATING_PANEL",
  "EMERGENCY_STOP",
  "EMERGENCY_CLEAR",
  "GET_TYPING_STATUS",
  "ACTIVATE_DOCS_SURFACE"
]);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "TYPING_PROGRESS") {
    const tabId = Number(_sender && _sender.tab && _sender.tab.id);
    const frameId = Number(_sender && _sender.frameId);
    if (Number.isInteger(tabId) && tabId >= 0 && Number.isInteger(frameId) && frameId > 0) {
      void sendMessageToFrame(tabId, 0, {
        type: "TYPING_PROGRESS_SYNC",
        payload: message.payload || {}
      });
    }
    sendResponse({ ok: true });
    return;
  }

  if (!message || (message.type !== "ROUTE_TAB_MESSAGE" && message.type !== "ROUTE_FRAME_MESSAGE")) {
    return;
  }
  const tabId = message.type === "ROUTE_TAB_MESSAGE" ? Number(message.tabId) : Number(_sender && _sender.tab && _sender.tab.id);
  const payload = message.payload;
  if (!Number.isInteger(tabId) || tabId < 0 || !payload || typeof payload.type !== "string") {
    sendResponse({
      ok: false,
      error: "Invalid routing message."
    });
    return;
  }
  if (!ROUTED_MESSAGE_TYPES.has(payload.type)) {
    sendResponse({
      ok: false,
      error: `Unsupported routed message type: ${payload.type}`
    });
    return;
  }

  void routeTabMessage(tabId, payload)
    .then((response) => {
      sendResponse(response);
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error && error.message ? error.message : "Failed to route message."
      });
    });
  return true;
});

chrome.commands.onCommand.addListener((command) => {
  let type = null;
  if (command === "emergency-stop") {
    type = "EMERGENCY_STOP";
  } else if (command === "emergency-clear") {
    type = "EMERGENCY_CLEAR";
  }
  if (!type) {
    return;
  }

  chrome.tabs.query(
    {
      active: true,
      lastFocusedWindow: true
    },
    (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab || typeof tab.id !== "number") {
        return;
      }
      void routeTabMessage(tab.id, { type });
    }
  );
});

async function routeTabMessage(tabId, payload) {
  const frameInfos = await getAllFrameInfos(tabId);
  const orderedFrames = orderFramesForType(frameInfos, payload.type);
  let fallbackStatusResponse = null;
  let fallbackFailureResponse = null;

  for (const frameInfo of orderedFrames) {
    const frameId = Number(frameInfo.frameId);
    if (!Number.isInteger(frameId) || frameId < 0) {
      continue;
    }
    const result = await sendMessageToFrame(tabId, frameId, payload);
    if (!result.ok) {
      continue;
    }
    const response = result.response;
    if (!response) {
      continue;
    }
    if (response.ignored) {
      continue;
    }

    if (payload.type === "GET_TYPING_STATUS") {
      if (response.ok && response.payload && response.payload.status === "running") {
        return response;
      }
      if (!fallbackStatusResponse && response.ok) {
        fallbackStatusResponse = response;
      }
      continue;
    }

    if (
      payload.type === "START_TYPING" ||
      payload.type === "PREVIEW_TARGET" ||
      payload.type === "CLEAR_TARGET_PREVIEW"
    ) {
      if (response.ok) {
        return response;
      }
      if (!fallbackFailureResponse) {
        fallbackFailureResponse = response;
      }
      continue;
    }

    if (
      payload.type === "EMERGENCY_STOP" ||
      payload.type === "EMERGENCY_CLEAR" ||
      payload.type === "SET_FLOATING_PANEL"
    ) {
      if (response.ok) {
        return response;
      }
      if (!fallbackFailureResponse) {
        fallbackFailureResponse = response;
      }
      continue;
    }

    return response;
  }

  if (fallbackStatusResponse) {
    return fallbackStatusResponse;
  }
  if (fallbackFailureResponse) {
    return fallbackFailureResponse;
  }

  if (payload.type === "GET_TYPING_STATUS") {
    return {
      ok: true,
      payload: {
        status: "idle",
        progress: 0,
        elapsedMs: 0,
        estimatedDurationMs: 0,
        etaMs: 0,
        sessionId: null
      }
    };
  }

  return {
    ok: false,
    error: "No eligible content frame responded."
  };
}

function getAllFrameInfos(tabId) {
  return new Promise((resolve) => {
    if (!chrome.webNavigation || !chrome.webNavigation.getAllFrames) {
      resolve([{ frameId: 0, parentFrameId: -1 }]);
      return;
    }
    chrome.webNavigation.getAllFrames({ tabId }, (frames) => {
      const error = chrome.runtime.lastError;
      if (error || !Array.isArray(frames) || frames.length === 0) {
        resolve([{ frameId: 0, parentFrameId: -1 }]);
        return;
      }
      resolve(frames);
    });
  });
}

function orderFramesForType(frameInfos, type) {
  const unique = new Map();
  for (const frame of frameInfos || []) {
    if (!frame || !Number.isInteger(frame.frameId)) {
      continue;
    }
    unique.set(frame.frameId, frame);
  }
  if (!unique.has(0)) {
    unique.set(0, { frameId: 0, parentFrameId: -1 });
  }
  const frames = Array.from(unique.values());
  const depthMap = buildDepthMap(frames);

  const prioritizeNested = type === "START_TYPING" || type === "PREVIEW_TARGET" || type === "CLEAR_TARGET_PREVIEW";
  frames.sort((a, b) => {
    if (prioritizeNested) {
      const depthDiff = (depthMap.get(b.frameId) || 0) - (depthMap.get(a.frameId) || 0);
      if (depthDiff !== 0) {
        return depthDiff;
      }
    }
    const aTop = a.frameId === 0 ? 1 : 0;
    const bTop = b.frameId === 0 ? 1 : 0;
    if (aTop !== bTop) {
      return bTop - aTop;
    }
    return a.frameId - b.frameId;
  });
  return frames;
}

function buildDepthMap(frames) {
  const parentById = new Map();
  for (const frame of frames) {
    parentById.set(frame.frameId, Number.isInteger(frame.parentFrameId) ? frame.parentFrameId : -1);
  }
  const depthMap = new Map();
  for (const frame of frames) {
    let id = frame.frameId;
    let depth = 0;
    const seen = new Set();
    while (id !== 0 && parentById.has(id) && !seen.has(id)) {
      seen.add(id);
      id = parentById.get(id);
      depth += 1;
      if (!Number.isInteger(id) || id < 0) {
        break;
      }
    }
    depthMap.set(frame.frameId, depth);
  }
  return depthMap;
}

function sendMessageToFrame(tabId, frameId, payload) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, payload, { frameId }, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        resolve({
          ok: false,
          error: error.message
        });
        return;
      }
      resolve({
        ok: true,
        response
      });
    });
  });
}
