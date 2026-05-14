const { app, BrowserWindow, ipcMain, screen } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { WebSocket, WebSocketServer } = require("ws");

const SIGNALING_PORT = 41243;
const DEFAULT_ASPECT_RATIO = 16 / 9;
const WINDOW_STATE_FILE = "window-state.json";
const POINTER_POLL_MS = 120;
const USER_DATA_DIR_NAME = "firefox-macos-pip-helper";

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.setPath("userData", path.join(app.getPath("appData"), USER_DATA_DIR_NAME));

const nativeConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console)
};

function writeLog(level, args) {
  nativeConsole[level](...args);

  try {
    const line = args.map((arg) => {
      if (arg instanceof Error) {
        return arg.stack || arg.message;
      }

      if (typeof arg === "string") {
        return arg;
      }

      return JSON.stringify(arg);
    }).join(" ");
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.appendFileSync(
      path.join(app.getPath("userData"), "helper.log"),
      `${new Date().toISOString()} ${level.toUpperCase()} ${line}\n`,
      "utf8"
    );
  } catch (_error) {
    // Logging must never break the helper.
  }
}

console.log = (...args) => writeLog("log", args);
console.warn = (...args) => writeLog("warn", args);
console.error = (...args) => writeLog("error", args);

let windowRef = null;
let currentSocket = null;
let signalingServer = null;
let rendererReady = false;
let chunkCount = 0;
let pinned = true;
let pointerPollTimer = null;
let pointerInsideWindow = false;
const pendingRendererMessages = [];

function getWindowStatePath() {
  return path.join(app.getPath("userData"), WINDOW_STATE_FILE);
}

function loadWindowState() {
  try {
    const raw = fs.readFileSync(getWindowStatePath(), "utf8");
    const state = JSON.parse(raw);
    return {
      bounds: Number.isFinite(state.x) && Number.isFinite(state.y) ? { x: state.x, y: state.y } : null,
      pinned: typeof state.pinned === "boolean" ? state.pinned : null
    };
  } catch (_error) {
    // Missing state is fine on first launch.
  }

  return { bounds: null, pinned: null };
}

function isPointInAnyDisplay(x, y) {
  return screen.getAllDisplays().some((display) => {
    const bounds = display.workArea || display.bounds;
    return x >= bounds.x &&
      x <= bounds.x + bounds.width &&
      y >= bounds.y &&
      y <= bounds.y + bounds.height;
  });
}

function normalizeWindowBounds(bounds) {
  if (!bounds || !Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) {
    return null;
  }

  if (isPointInAnyDisplay(bounds.x + 40, bounds.y + 40)) {
    return bounds;
  }

  const primaryBounds = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.round(primaryBounds.x + primaryBounds.width - 560),
    y: Math.round(primaryBounds.y + 48)
  };
}

function saveWindowState() {
  if (!windowRef) {
    return;
  }

  try {
    const { x, y } = windowRef.getBounds();
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(getWindowStatePath(), JSON.stringify({ x, y, pinned }), "utf8");
  } catch (error) {
    console.warn(`Could not save window state: ${error.message}`);
  }
}

function applyPinState() {
  if (!windowRef) {
    return;
  }

  windowRef.setAlwaysOnTop(true, "screen-saver");
  windowRef.setResizable(!pinned);

  if (typeof windowRef.setMovable === "function") {
    windowRef.setMovable(!pinned);
  }

  windowRef.webContents.send("pin-state", { pinned });
}

function updatePointerInsideWindow() {
  if (!windowRef || windowRef.isDestroyed() || !windowRef.isVisible()) {
    return;
  }

  const point = screen.getCursorScreenPoint();
  const bounds = windowRef.getBounds();
  const inside = point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height;

  pointerInsideWindow = inside;
  if (rendererReady) {
    windowRef.webContents.send("pointer-inside-window", { inside });
  }
}

function startPointerPolling() {
  if (pointerPollTimer) {
    return;
  }

  pointerPollTimer = setInterval(updatePointerInsideWindow, POINTER_POLL_MS);
}

function stopPointerPolling() {
  if (!pointerPollTimer) {
    return;
  }

  clearInterval(pointerPollTimer);
  pointerPollTimer = null;
  pointerInsideWindow = false;
}

function revealWindow() {
  if (!windowRef || windowRef.isDestroyed()) {
    return;
  }

  const wasVisible = windowRef.isVisible();
  console.log(`Showing PiP window (visible=${wasVisible})`);

  windowRef.setFocusable(true);
  windowRef.setAlwaysOnTop(true, "screen-saver");
  windowRef.showInactive();
  windowRef.moveTop();
  setTimeout(() => {
    if (windowRef && !windowRef.isDestroyed()) {
      windowRef.setFocusable(false);
    }
  }, 120);
}

function createWindow() {
  if (windowRef) {
    revealWindow();
    applyPinState();
    return windowRef;
  }

  const windowState = loadWindowState();
  if (windowState.pinned !== null) {
    pinned = windowState.pinned;
  }

  windowRef = new BrowserWindow({
    width: 520,
    height: 292,
    ...(normalizeWindowBounds(windowState.bounds) || {}),
    minWidth: 260,
    minHeight: 146,
    title: "External PiP",
    frame: false,
    resizable: true,
    focusable: true,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: "#050506",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });
  console.log("Created PiP window");

  windowRef.setFocusable(false);
  applyPinState();

  if (process.platform === "darwin") {
    windowRef.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  windowRef.loadFile(path.join(__dirname, "../public/index.html"));
  windowRef.webContents.on("console-message", (_event, level, message) => {
    console.log(`[renderer:${level}] ${message}`);
  });
  windowRef.webContents.once("did-finish-load", () => {
    rendererReady = true;
    windowRef?.webContents.send("pin-state", { pinned });
    updatePointerInsideWindow();
    while (pendingRendererMessages.length) {
      windowRef?.webContents.send("signal-from-extension", pendingRendererMessages.shift());
    }
  });

  windowRef.on("move", saveWindowState);
  windowRef.on("resize", saveWindowState);
  windowRef.on("close", saveWindowState);
  windowRef.on("show", startPointerPolling);
  windowRef.on("hide", stopPointerPolling);
  windowRef.on("closed", () => {
    stopPointerPolling();
    windowRef = null;
    rendererReady = false;
    currentSocket?.close();
  });

  startPointerPolling();
  return windowRef;
}

function applyAspectRatio(aspectRatio) {
  if (!windowRef || !Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return;
  }

  const width = 520;
  const height = Math.round(width / aspectRatio);
  windowRef.setAspectRatio(aspectRatio);
  windowRef.setMinimumSize(260, Math.round(260 / aspectRatio));
  windowRef.setContentSize(width, height);
  revealWindow();
}

function sendToRenderer(message) {
  if (!windowRef && !["direct-media-start", "media-start", "media-chunk"].includes(message.type)) {
    console.log(`Dropping renderer message without window: ${message.type}`);
    return;
  }

  if (!windowRef) {
    createWindow();
  }

  if (rendererReady && windowRef) {
    windowRef.webContents.send("signal-from-extension", message);
    return;
  }

  pendingRendererMessages.push(message);
}

function startSignalingServer() {
  signalingServer = new WebSocketServer({
    host: "127.0.0.1",
    port: SIGNALING_PORT,
    path: "/signaling"
  });

  signalingServer.on("connection", (socket) => {
    currentSocket?.close();
    currentSocket = socket;
    chunkCount = 0;
    console.log("Extension connected");

    socket.on("message", (rawMessage, isBinary) => {
      if (isBinary) {
        const chunk = Buffer.isBuffer(rawMessage) ? rawMessage : Buffer.from(rawMessage);
        chunkCount += 1;
        if (chunkCount === 1 || chunkCount % 20 === 0) {
          console.log(`Received media chunk #${chunkCount}: ${chunk.byteLength} bytes`);
        }

        sendToRenderer({
          type: "media-chunk",
          chunk: chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength)
        });
        return;
      }

      try {
        const message = JSON.parse(rawMessage.toString());
        const detail = message.mimeType ? ` (${message.mimeType})` : "";
        if (!["media-sync", "playback-state"].includes(message.type) || message.reason !== "timer") {
          console.log(`Received control message: ${message.type}${detail}`);
        }
        if (["direct-media-start", "media-start"].includes(message.type)) {
          createWindow();
          applyAspectRatio(message.aspectRatio || DEFAULT_ASPECT_RATIO);
        }
        sendToRenderer(message);
      } catch (error) {
        console.error("Invalid signaling message:", error);
      }
    });

    socket.on("close", () => {
      if (currentSocket === socket) {
        currentSocket = null;
        console.log("Extension disconnected");
        saveWindowState();
        windowRef?.close();
      }
    });

    socket.on("error", (error) => {
      console.error("Extension socket error:", error);
    });
  });

  signalingServer.on("listening", () => {
    console.log(`External PiP helper listening on ws://127.0.0.1:${SIGNALING_PORT}/signaling`);
  });
}

ipcMain.on("signal-to-extension", (_event, message) => {
  console.log(`Sending control message: ${message.type}`);
  if (currentSocket?.readyState === WebSocket.OPEN) {
    currentSocket.send(JSON.stringify(message));
  }
});

ipcMain.on("window-action", (_event, action) => {
  if (action === "close") {
    if (currentSocket?.readyState === WebSocket.OPEN) {
      currentSocket.send(JSON.stringify({ type: "return-to-tab" }));
      setTimeout(() => {
        currentSocket?.close();
        windowRef?.close();
      }, 80);
    } else {
      currentSocket?.close();
      windowRef?.close();
    }
  }

  if (action === "pin") {
    pinned = !pinned;
    applyPinState();
    saveWindowState();
  }
});

app.whenReady().then(() => {
  if (process.platform === "darwin") {
    app.dock?.hide();
  }

  startSignalingServer();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  stopPointerPolling();
  signalingServer?.close();
  currentSocket?.close();
});
