const video = document.getElementById("pip-video");
const closeButton = document.getElementById("close");
const pinButton = document.getElementById("pin");
const playPauseButton = document.getElementById("play-pause");
const volumeButton = document.getElementById("volume");
const volumeSlider = document.getElementById("volume-slider");
const seekBar = document.getElementById("seek-bar");
const chrome = document.querySelector(".chrome");
const timeline = document.querySelector(".timeline");
const volumeControl = document.querySelector(".volume-control");
const shell = document.querySelector(".shell");

let mediaSource = null;
let sourceBuffer = null;
let objectUrl = null;
let chunkQueue = [];
let hls = null;
let currentTransport = null;
let desiredPaused = true;
let lastKnownDuration = 0;
let isScrubbing = false;
let volumeHideTimer = null;
let lastPointerInside = false;
let controlsHoldUntil = 0;
let controlsHoldTimer = null;

const TARGET_LIVE_DELAY_SECONDS = 0.2;
const SEEK_TO_LIVE_THRESHOLD_SECONDS = 1.2;
const DIRECT_SYNC_SEEK_THRESHOLD_SECONDS = 0.8;
const DIRECT_SYNC_FORCE_SEEK_THRESHOLD_SECONDS = 0.2;
const MAX_QUEUED_CHUNKS = 8;

function setStatus(message) {
  console.log(`status: ${message}`);
}

function setPlaybackState(paused) {
  playPauseButton.classList.toggle("is-paused", paused);
}

function applyPlaybackState(paused) {
  desiredPaused = Boolean(paused);
  setPlaybackState(paused);

  if (paused && !video.paused) {
    video.pause();
    return;
  }

  if (paused || !video.paused) {
    return;
  }

  video.play().catch((error) => {
    console.warn("Playback sync failed:", error);
  });
}

function showControls() {
  document.body.classList.add("controls-visible");
}

function hideControls() {
  if (Date.now() < controlsHoldUntil || volumeControl.classList.contains("is-open") || isScrubbing) {
    return;
  }

  document.body.classList.remove("controls-visible");
}

function holdControls(duration = 1200) {
  controlsHoldUntil = Date.now() + duration;
  showControls();
  window.clearTimeout(controlsHoldTimer);
  controlsHoldTimer = window.setTimeout(() => {
    if (!lastPointerInside) {
      hideControls();
    }
  }, duration + 20);
}

function setRangeProgress(input) {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const value = Number(input.value || 0);
  const progress = max > min ? ((value - min) / (max - min)) * 100 : 0;
  input.style.setProperty("--range-progress", `${Math.min(Math.max(progress, 0), 100)}%`);
}

function updateTimeline(currentTime, duration) {
  if (Number.isFinite(duration) && duration > 0) {
    lastKnownDuration = duration;
  }

  seekBar.disabled = !(lastKnownDuration > 0);
  if (isScrubbing || !(lastKnownDuration > 0) || !Number.isFinite(currentTime)) {
    setRangeProgress(seekBar);
    return;
  }

  seekBar.value = String(Math.round((Math.max(0, currentTime) / lastKnownDuration) * Number(seekBar.max)));
  setRangeProgress(seekBar);
}

function applyVolume(value) {
  const volume = Math.min(Math.max(Number(value), 0), 1);
  video.volume = Number.isFinite(volume) ? volume : 1;
  volumeSlider.value = String(video.volume);
  setRangeProgress(volumeSlider);
  volumeButton.classList.toggle("is-muted", video.volume === 0);
}

function showVolumePanel() {
  holdControls();
  volumeControl.classList.add("is-open");
  window.clearTimeout(volumeHideTimer);
}

function hideVolumePanelSoon(delay = 450) {
  window.clearTimeout(volumeHideTimer);
  volumeHideTimer = window.setTimeout(() => {
    volumeControl.classList.remove("is-open");
    if (!lastPointerInside) {
      hideControls();
    }
  }, delay);
}

function resetMediaPipeline() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
  }

  mediaSource = null;
  sourceBuffer = null;
  objectUrl = null;
  chunkQueue = [];
  hls?.destroy();
  hls = null;
  currentTransport = null;
  desiredPaused = true;
  lastKnownDuration = 0;
  updateTimeline(0, 0);
  video.srcObject = null;
  video.removeAttribute("src");
  video.load();
}

function describeMediaSource(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.origin;
  } catch (_error) {
    return "unparseable media URL";
  }
}

function startDirectMediaPipeline(message) {
  resetMediaPipeline();
  currentTransport = "direct-media";
  desiredPaused = Boolean(message.paused);
  console.log(`direct-media-start: ${describeMediaSource(message.url)}`);
  const targetTime = Number.isFinite(message.currentTime) ? message.currentTime : 0;
  const targetDuration = Number.isFinite(message.duration) ? message.duration : 0;
  const targetRate = message.playbackRate || 1;
  updateTimeline(targetTime, targetDuration);

  function syncInitialPosition() {
    if (targetTime > 0 && Number.isFinite(video.duration) && targetTime < video.duration - 1) {
      video.currentTime = targetTime;
    } else if (targetTime > 0 && !Number.isFinite(video.duration)) {
      video.currentTime = targetTime;
    }
    video.playbackRate = targetRate;
  }

  video.addEventListener("error", () => {
    const reason = video.error ? `video error ${video.error.code}` : "video error";
    window.pipBridge.sendSignal({ type: "direct-media-failed", reason });
  }, { once: true });

  video.addEventListener("loadedmetadata", syncInitialPosition, { once: true });
  video.addEventListener("canplay", syncInitialPosition, { once: true });

  if (/\.m3u8(?:[?#]|$)|m3u8/i.test(message.url)) {
    if (window.Hls?.isSupported()) {
      hls = new window.Hls({
        enableWorker: true,
        lowLatencyMode: true,
        xhrSetup(xhr) {
          for (const header of message.requestHeaders || []) {
            try {
              xhr.setRequestHeader(header.name, header.value);
            } catch (_error) {
              // Some headers are forbidden in renderer XHR.
            }
          }
        }
      });
      hls.on(window.Hls.Events.ERROR, (_event, data) => {
        console.warn(`hls error: ${data.type} ${data.details}`);
        if (data.fatal) {
          window.pipBridge.sendSignal({ type: "direct-media-failed", reason: data.details || data.type });
        }
      });
      hls.on(window.Hls.Events.MANIFEST_PARSED, syncInitialPosition);
      hls.loadSource(message.url);
      hls.attachMedia(video);
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = message.url;
    } else {
      window.pipBridge.sendSignal({ type: "direct-media-failed", reason: "HLS is not supported" });
      return;
    }
  } else {
    video.src = message.url;
  }

  if (message.paused) {
    video.pause();
  } else {
    video.play().catch((error) => {
      console.warn("Direct media autoplay failed:", error);
    });
  }
}

function applyMediaSync(message) {
  if (currentTransport !== "direct-media") {
    return;
  }

  if (Number.isFinite(message.playbackRate) && video.playbackRate !== message.playbackRate) {
    video.playbackRate = message.playbackRate;
  }

  if (Number.isFinite(message.currentTime) && video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    const drift = Math.abs(video.currentTime - message.currentTime);
    const forceSeek = ["seeking", "seeked", "ratechange"].includes(message.reason);
    const threshold = forceSeek ? DIRECT_SYNC_FORCE_SEEK_THRESHOLD_SECONDS : DIRECT_SYNC_SEEK_THRESHOLD_SECONDS;

    if (drift > threshold) {
      video.currentTime = message.currentTime;
    }
  }

  updateTimeline(message.currentTime, message.duration);
  applyPlaybackState(message.paused);
}

function appendNextChunk() {
  if (!sourceBuffer || sourceBuffer.updating || !chunkQueue.length) {
    return;
  }

  try {
    const chunk = chunkQueue.shift();
    sourceBuffer.appendBuffer(chunk);
    if (!desiredPaused) {
      video.play().catch((error) => {
        console.warn("Playback retry failed:", error);
      });
    }
  } catch (error) {
    console.error("appendBuffer failed:", error);
    setStatus(error.message);
  }
}

function getBufferedEnd() {
  if (!video.buffered.length) {
    return null;
  }

  return video.buffered.end(video.buffered.length - 1);
}

function keepNearLiveEdge() {
  const bufferedEnd = getBufferedEnd();
  if (bufferedEnd === null || Number.isNaN(video.currentTime)) {
    return;
  }

  const lag = bufferedEnd - video.currentTime;
  if (lag > SEEK_TO_LIVE_THRESHOLD_SECONDS) {
    video.currentTime = Math.max(0, bufferedEnd - TARGET_LIVE_DELAY_SECONDS);
  }
}

function startMediaPipeline(message) {
  resetMediaPipeline();
  currentTransport = "media-recorder";
  desiredPaused = Boolean(message.paused);
  updateTimeline(message.currentTime, message.duration);
  console.log(`media-start: ${message.mimeType}`);

  if (!MediaSource.isTypeSupported(message.mimeType)) {
    setStatus(`Unsupported stream type: ${message.mimeType}`);
    return;
  }

  mediaSource = new MediaSource();
  objectUrl = URL.createObjectURL(mediaSource);
  video.src = objectUrl;
  if (!desiredPaused) {
    video.play().catch((error) => {
      console.warn("Autoplay failed:", error);
    });
  }

  mediaSource.addEventListener("sourceopen", () => {
    sourceBuffer = mediaSource.addSourceBuffer(message.mimeType);
    sourceBuffer.mode = "sequence";
    sourceBuffer.addEventListener("updateend", () => {
      keepNearLiveEdge();
      appendNextChunk();
    });
    sourceBuffer.addEventListener("error", () => {
      setStatus("SourceBuffer error");
    });
    setStatus("Receiving encoded video from Firefox");
    appendNextChunk();
  }, { once: true });
}

function appendMediaChunk(chunk) {
  if (!(chunk instanceof ArrayBuffer)) {
    chunk = new Uint8Array(chunk).buffer;
  }

  if (chunkQueue.length >= MAX_QUEUED_CHUNKS) {
    chunkQueue = chunkQueue.slice(-Math.floor(MAX_QUEUED_CHUNKS / 2));
  }

  if (!sourceBuffer) {
    chunkQueue.push(chunk);
    return;
  }

  chunkQueue.push(chunk);
  appendNextChunk();
}

window.pipBridge.onSignal(async (message) => {
  try {
    if (message.type === "direct-media-start") {
      setPlaybackState(message.paused);
      startDirectMediaPipeline(message);
      return;
    }

    if (message.type === "media-start") {
      setPlaybackState(message.paused);
      startMediaPipeline(message);
      return;
    }

    if (message.type === "playback-state") {
      updateTimeline(message.currentTime, message.duration);
      applyPlaybackState(message.paused);
      return;
    }

    if (message.type === "media-sync") {
      applyMediaSync(message);
      return;
    }

    if (message.type === "media-chunk") {
      appendMediaChunk(message.chunk);
      return;
    }

    if (message.type === "disconnected") {
      resetMediaPipeline();
      setStatus("Firefox stream disconnected");
    }
  } catch (error) {
    console.error("Signaling failed:", error);
    setStatus(error.message);
  }
});

window.pipBridge.onPinState(({ pinned }) => {
  pinButton.classList.toggle("active", pinned);
  document.body.classList.toggle("is-pinned", pinned);
  pinButton.title = pinned ? "Unpin window" : "Pin window";
  pinButton.setAttribute("aria-label", pinButton.title);
});

window.pipBridge.onPointerInsideWindow(({ inside }) => {
  lastPointerInside = inside;
  if (inside || Date.now() < controlsHoldUntil || volumeControl.classList.contains("is-open") || isScrubbing) {
    showControls();
  } else {
    volumeControl.classList.remove("is-open");
    hideControls();
  }
});

closeButton.addEventListener("click", () => {
  holdControls();
  window.pipBridge.windowAction("close");
});

pinButton.addEventListener("click", () => {
  holdControls();
  window.pipBridge.windowAction("pin");
});

playPauseButton.addEventListener("click", () => {
  holdControls();
  window.pipBridge.sendSignal({ type: "toggle-playback" });
});

volumeSlider.addEventListener("input", () => {
  showVolumePanel();
  applyVolume(volumeSlider.value);
});

volumeButton.addEventListener("click", showVolumePanel);
volumeButton.addEventListener("pointerdown", showVolumePanel);
volumeSlider.addEventListener("click", showVolumePanel);
volumeSlider.addEventListener("pointerdown", showVolumePanel);
volumeSlider.addEventListener("pointerup", () => hideVolumePanelSoon(900));
volumeSlider.addEventListener("blur", () => hideVolumePanelSoon(120));
volumeControl.addEventListener("pointerenter", showVolumePanel);
volumeControl.addEventListener("pointerleave", () => hideVolumePanelSoon());

seekBar.addEventListener("input", () => {
  holdControls();
  isScrubbing = true;
  setRangeProgress(seekBar);
});

seekBar.addEventListener("change", () => {
  if (lastKnownDuration > 0) {
    const nextTime = (Number(seekBar.value) / Number(seekBar.max)) * lastKnownDuration;
    if (currentTransport === "direct-media" && video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      video.currentTime = nextTime;
    }
    window.pipBridge.sendSignal({ type: "seek-to", currentTime: nextTime });
  }
  isScrubbing = false;
  holdControls(900);
});

video.addEventListener("timeupdate", () => {
  if (currentTransport === "direct-media") {
    updateTimeline(video.currentTime, video.duration);
  }
});

video.addEventListener("durationchange", () => {
  if (currentTransport === "direct-media") {
    updateTimeline(video.currentTime, video.duration);
  }
});

document.addEventListener("mouseenter", showControls);
document.addEventListener("mouseover", showControls);
document.addEventListener("mousemove", showControls);
document.addEventListener("pointermove", showControls);
document.addEventListener("pointerdown", () => holdControls());
document.addEventListener("click", () => holdControls());
document.addEventListener("mouseleave", hideControls);
document.body.addEventListener("mouseenter", showControls);
document.body.addEventListener("mouseleave", hideControls);
shell.addEventListener("mouseenter", showControls);
shell.addEventListener("mouseleave", hideControls);
window.addEventListener("mousemove", showControls);

applyVolume(volumeSlider.value);
updateTimeline(0, 0);
