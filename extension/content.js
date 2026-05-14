let session = null;
let pendingDirectMedia = null;
let pendingMediaDebug = [];

const RECORDER_MIME_TYPES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm"
];

const RECORDER_TIMESLICE_MS = 250;
const VIDEO_MAX_FRAME_RATE = 24;
const OVERLAY_ID = "__external_pip_source_overlay";
const DIRECT_SYNC_INTERVAL_MS = 1000;
const DIRECT_SYNC_MIN_DELTA_SECONDS = 0.35;

function pickVideo() {
  const videos = Array.from(document.querySelectorAll("video"));
  const candidates = videos
    .map((video) => ({
      video,
      area: video.getBoundingClientRect().width * video.getBoundingClientRect().height,
      playing: !video.paused && !video.ended,
      readyState: video.readyState,
      hasSize: Boolean(video.videoWidth && video.videoHeight)
    }))
    .sort((a, b) => {
      return (
        Number(b.playing) - Number(a.playing) ||
        Number(b.hasSize) - Number(a.hasSize) ||
        b.readyState - a.readyState ||
        b.area - a.area
      );
    });

  return candidates[0]?.video ?? null;
}

function getVideoReport() {
  const videos = Array.from(document.querySelectorAll("video"));
  const report = videos.map((video) => {
    const rect = video.getBoundingClientRect();
    return {
      readyState: video.readyState,
      paused: video.paused,
      ended: video.ended,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      clientWidth: Math.round(rect.width),
      clientHeight: Math.round(rect.height),
      hasCapture: Boolean(video.captureStream || video.mozCaptureStream),
      src: video.currentSrc || video.src || ""
    };
  });

  return {
    ok: true,
    url: location.href,
    isTopFrame: window.top === window,
    videoCount: videos.length,
    visibleVideos: report.filter((video) => video.clientWidth > 0 && video.clientHeight > 0).length,
    playableVideos: report.filter((video) => video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA).length,
    videos: report
  };
}

function captureVideo(video) {
  const capture = video.captureStream || video.mozCaptureStream;
  if (!capture) {
    throw new Error("This Firefox build does not expose video.captureStream().");
  }

  const stream = capture.call(video);
  if (!stream.getVideoTracks().length) {
    throw new Error("captureStream() returned no video track.");
  }

  return stream;
}

async function limitFrameRate(stream) {
  await Promise.all(stream.getVideoTracks().map((track) => {
    if (!track.applyConstraints) {
      return Promise.resolve();
    }

    return track.applyConstraints({ frameRate: { max: VIDEO_MAX_FRAME_RATE } }).catch(() => {});
  }));
}

function pickRecorderMimeType() {
  return RECORDER_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || "";
}

function getVideoAspectRatio(video) {
  if (video.videoWidth && video.videoHeight) {
    return video.videoWidth / video.videoHeight;
  }

  const rect = video.getBoundingClientRect();
  if (rect.width && rect.height) {
    return rect.width / rect.height;
  }

  return 16 / 9;
}

function focusSourceTab() {
  return browser.runtime.sendMessage({ type: "FOCUS_EXTERNAL_PIP_SOURCE" }).catch(() => {});
}

function createSourceOverlay(video) {
  document.getElementById(OVERLAY_ID)?.remove();

  const overlay = document.createElement("button");
  overlay.id = OVERLAY_ID;
  overlay.type = "button";
  overlay.textContent = "Идет трансляция в PiP. Нажмите, чтобы вернуться.";
  Object.assign(overlay.style, {
    position: "absolute",
    zIndex: "2147483647",
    border: "0",
    margin: "0",
    padding: "9px 11px",
    borderRadius: "8px",
    background: "rgba(7, 8, 10, 0.88)",
    color: "#fff",
    font: "600 13px system-ui, sans-serif",
    textAlign: "center",
    cursor: "pointer",
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.24), inset 0 0 0 1px rgba(255, 255, 255, 0.14)"
  });

  function syncPosition() {
    const rect = video.getBoundingClientRect();
    overlay.style.left = `${Math.max(0, rect.left + window.scrollX + 12)}px`;
    overlay.style.top = `${Math.max(0, rect.top + window.scrollY + 12)}px`;
    overlay.style.maxWidth = `${Math.max(180, rect.width - 24)}px`;
  }

  overlay.addEventListener("click", () => {
    stopSession({ focusTab: true });
  });

  document.documentElement.appendChild(overlay);
  syncPosition();

  const syncTimer = window.setInterval(syncPosition, 500);
  window.addEventListener("resize", syncPosition);
  window.addEventListener("scroll", syncPosition, true);

  return {
    element: overlay,
    remove() {
      window.clearInterval(syncTimer);
      window.removeEventListener("resize", syncPosition);
      window.removeEventListener("scroll", syncPosition, true);
      overlay.remove();
    }
  };
}

function showToast(message) {
  const existing = document.getElementById("__external_pip_toast");
  existing?.remove();

  const toast = document.createElement("div");
  toast.id = "__external_pip_toast";
  toast.textContent = message;
  Object.assign(toast.style, {
    position: "fixed",
    right: "16px",
    bottom: "16px",
    zIndex: "2147483647",
    padding: "10px 12px",
    maxWidth: "min(520px, calc(100vw - 32px))",
    borderRadius: "8px",
    background: "rgba(20, 20, 22, 0.92)",
    color: "#fff",
    font: "13px system-ui, sans-serif",
    lineHeight: "1.35",
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.28)"
  });

  document.documentElement.appendChild(toast);
  window.setTimeout(() => toast.remove(), 5200);
}

function stopSession(options = {}) {
  if (!session) {
    return;
  }

  session.recorder?.state !== "inactive" && session.recorder?.stop();
  session.ws?.close();
  session.stream?.getTracks().forEach((track) => track.stop());
  session.removeSourceListeners?.();
  window.clearInterval(session.syncTimer);
  if (session.sourceVideo) {
    session.sourceVideo.muted = session.restoreMuted;
    session.sourceVideo.style.visibility = session.restoreVisibility;
  }
  session.overlay?.remove();
  session = null;

  if (options.focusTab) {
    focusSourceTab();
  }
}

function sendPlaybackState(reason = "playback") {
  if (!session?.sourceVideo || session.ws.readyState !== WebSocket.OPEN) {
    return;
  }

  session.ws.send(JSON.stringify({
    type: "playback-state",
    reason,
    ...getSourceMediaState()
  }));
}

function getSourceMediaState() {
  if (!session?.sourceVideo) {
    return null;
  }

  return {
    paused: session.sourceVideo.paused,
    currentTime: Number.isFinite(session.sourceVideo.currentTime) ? session.sourceVideo.currentTime : 0,
    duration: Number.isFinite(session.sourceVideo.duration) ? session.sourceVideo.duration : 0,
    playbackRate: session.sourceVideo.playbackRate || 1
  };
}

function sendMediaSync(reason = "timer", force = false) {
  if (!session?.sourceVideo || session.transport !== "direct-media") {
    return;
  }

  const state = getSourceMediaState();
  if (!state) {
    return;
  }

  if (!force && Math.abs(state.currentTime - session.lastSyncedTime) < DIRECT_SYNC_MIN_DELTA_SECONDS) {
    return;
  }

  session.lastSyncedTime = state.currentTime;
  sendJson({
    type: "media-sync",
    reason,
    ...state
  });
}

function sendSourceProgress() {
  if (!session?.sourceVideo) {
    return;
  }

  if (session.transport === "direct-media") {
    sendMediaSync("timer");
    return;
  }

  if (session.transport === "media-recorder") {
    sendPlaybackState("timer");
  }
}

function attachSourceMediaListeners(video) {
  const listeners = [
    ["play", () => {
      if (session?.transport === "direct-media") {
        sendMediaSync("play", true);
      } else {
        sendPlaybackState("play");
      }
    }],
    ["pause", () => {
      if (session?.transport === "direct-media") {
        sendMediaSync("pause", true);
      } else {
        sendPlaybackState("pause");
      }
    }],
    ["seeking", () => sendMediaSync("seeking", true)],
    ["seeked", () => sendMediaSync("seeked", true)],
    ["ratechange", () => sendMediaSync("ratechange", true)]
  ];

  for (const [eventName, listener] of listeners) {
    video.addEventListener(eventName, listener);
  }

  return () => {
    for (const [eventName, listener] of listeners) {
      video.removeEventListener(eventName, listener);
    }
  };
}

async function togglePlayback() {
  if (!session?.sourceVideo) {
    return;
  }

  if (session.sourceVideo.paused) {
    await session.sourceVideo.play();
  } else {
    session.sourceVideo.pause();
  }
}

function seekSourceTo(currentTime) {
  if (!session?.sourceVideo || !Number.isFinite(currentTime)) {
    return;
  }

  const duration = Number.isFinite(session.sourceVideo.duration) ? session.sourceVideo.duration : 0;
  const nextTime = duration > 0 ? Math.min(Math.max(currentTime, 0), duration) : Math.max(currentTime, 0);
  session.sourceVideo.currentTime = nextTime;

  if (session.transport === "direct-media") {
    sendMediaSync("seek-to", true);
  } else {
    sendPlaybackState("seek-to");
  }
}

function sendJson(message) {
  if (session?.ws.readyState === WebSocket.OPEN) {
    session.ws.send(JSON.stringify(message));
  }
}

function startDirectMediaTransport(directMedia) {
  if (!directMedia?.url) {
    return false;
  }

  session.transport = "direct-media";
  session.lastSyncedTime = Number.isFinite(session.sourceVideo.currentTime) ? session.sourceVideo.currentTime : 0;
  sendJson({
    type: "direct-media-start",
    url: directMedia.url,
    requestHeaders: directMedia.requestHeaders || [],
    aspectRatio: session.aspectRatio,
    paused: session.sourceVideo.paused,
    currentTime: Number.isFinite(session.sourceVideo.currentTime) ? session.sourceVideo.currentTime : 0,
    duration: Number.isFinite(session.sourceVideo.duration) ? session.sourceVideo.duration : 0,
    playbackRate: session.sourceVideo.playbackRate || 1
  });
  showToast("Trying direct media playback in PiP.");
  return true;
}

async function startMediaRecorderFallback(reason) {
  if (!session || session.transport === "media-recorder" || session.fallbackStarting) {
    return;
  }

  session.fallbackStarting = true;
  session.transport = "media-recorder";

  try {
    session.stream = captureVideo(session.sourceVideo);
    await limitFrameRate(session.stream);

    const mimeType = pickRecorderMimeType();
    const recorder = new MediaRecorder(session.stream, mimeType ? { mimeType } : undefined);
    session.recorder = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0 && session?.ws.readyState === WebSocket.OPEN) {
        session.ws.send(event.data);
      }
    };

    recorder.onerror = (event) => {
      console.error("MediaRecorder failed:", event.error);
      showToast(event.error?.message || "MediaRecorder failed.");
      stopSession();
    };

    sendJson({
      type: "media-start",
      transport: "media-recorder",
      mimeType: recorder.mimeType || mimeType || "video/webm",
      aspectRatio: session.aspectRatio,
      paused: session.sourceVideo.paused,
      currentTime: Number.isFinite(session.sourceVideo.currentTime) ? session.sourceVideo.currentTime : 0,
      duration: Number.isFinite(session.sourceVideo.duration) ? session.sourceVideo.duration : 0
    });
    recorder.start(RECORDER_TIMESLICE_MS);
    showToast(`Direct media fallback: ${reason}. Streaming encoded video.`);
  } catch (error) {
    console.error("MediaRecorder fallback failed:", error);
    showToast(error.message || "MediaRecorder fallback failed.");
    stopSession();
  } finally {
    if (session) {
      session.fallbackStarting = false;
    }
  }
}

async function startSession() {
  stopSession();

  const video = pickVideo();
  if (!video) {
    throw new Error("No playable <video> element found on this page.");
  }

  const ws = new WebSocket("ws://127.0.0.1:41243/signaling");
  session = {
    ws,
    stream: null,
    sourceVideo: video,
    restoreMuted: video.muted,
    restoreVisibility: video.style.visibility,
    overlay: createSourceOverlay(video),
    aspectRatio: getVideoAspectRatio(video),
    transport: null,
    recorder: null,
    fallbackStarting: false,
    removeSourceListeners: null,
    syncTimer: 0,
    lastSyncedTime: 0
  };
  session.removeSourceListeners = attachSourceMediaListeners(video);
  session.syncTimer = window.setInterval(sendSourceProgress, DIRECT_SYNC_INTERVAL_MS);

  video.muted = true;
  video.style.visibility = "hidden";

  ws.onopen = () => {
    if (startDirectMediaTransport(pendingDirectMedia)) {
      return;
    }

    if (pendingMediaDebug.length) {
      console.warn("External PiP media debug candidates:", pendingMediaDebug);
    }
    startMediaRecorderFallback("direct media URL not found");
  };

  ws.onmessage = async (event) => {
    const message = JSON.parse(event.data);

    if (message.type === "return-to-tab") {
      stopSession({ focusTab: true });
    }

    if (message.type === "toggle-playback") {
      togglePlayback().catch((error) => {
        console.error("Playback toggle failed:", error);
        showToast(error.message);
      });
    }

    if (message.type === "seek-to") {
      seekSourceTo(message.currentTime);
    }

    if (message.type === "direct-media-failed") {
      startMediaRecorderFallback(message.reason || "direct media failed");
    }
  };

  ws.onerror = () => {
    showToast("PiP helper is not running on 127.0.0.1:41243. Start the helper daemon first.");
  };

  ws.onclose = () => {
    if (session?.ws === ws) {
      stopSession();
    }
  };
}

browser.runtime.onMessage.addListener((message) => {
  if (message.type === "PROBE_EXTERNAL_PIP") {
    return Promise.resolve(getVideoReport());
  }

  if (message.type === "SHOW_EXTERNAL_PIP_ERROR") {
    showToast(message.message);
    return Promise.resolve();
  }

  if (message.type === "START_EXTERNAL_PIP") {
    pendingDirectMedia = message.directMedia;
    pendingMediaDebug = message.mediaDebug || [];
    return startSession()
      .catch((error) => {
        console.error("External PiP failed:", error);
        showToast(error.message);
        stopSession();
      });
  }

  return undefined;
});
