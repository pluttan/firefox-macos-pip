const mediaByTab = new Map();
const DIRECT_MEDIA_PATTERN = /\.(m3u8|mp4|webm|m4v)(?:[?#]|$)|m3u8/i;
const MEDIA_SEGMENT_PATTERN = /\.(m4s|ts)(?:[?#]|$)/i;
const SUSPICIOUS_MEDIA_PATTERN = /video|stream|playlist|manifest|hls|m3u8|mp4|m4s|\.ts|episode|translations|kodik|cdn|cache|quality|source/i;
const MAX_MEDIA_ITEMS = 30;
const MAX_DEBUG_ITEMS = 80;
const DIRECT_MEDIA_WAIT_MS = 3000;
const DIRECT_MEDIA_POLL_MS = 150;

function rememberMediaRequest(details) {
  if (details.tabId < 0 || !details.url) {
    return;
  }

  const playable = DIRECT_MEDIA_PATTERN.test(details.url);
  const segment = MEDIA_SEGMENT_PATTERN.test(details.url);
  const suspicious = SUSPICIOUS_MEDIA_PATTERN.test(details.url) ||
    ["media", "xmlhttprequest", "object", "other"].includes(details.type);
  if (!playable && !segment && !suspicious) {
    return;
  }

  const items = mediaByTab.get(details.tabId) || [];
  const existing = items.find((item) => item.url === details.url);
  const item = existing || {
    url: details.url,
    method: details.method,
    type: details.type,
    requestHeaders: [],
    playable,
    segment,
    suspicious,
    seenAt: 0
  };

  item.seenAt = Date.now();
  item.playable = item.playable || playable;
  item.segment = item.segment || segment;
  item.suspicious = item.suspicious || suspicious;
  item.type = details.type;
  item.method = details.method;
  item.requestHeaders = (details.requestHeaders || [])
    .filter((header) => /^(origin|referer|range)$/i.test(header.name));

  if (!existing) {
    items.unshift(item);
  }

  mediaByTab.set(details.tabId, items
    .sort((a, b) => b.seenAt - a.seenAt)
    .slice(0, MAX_DEBUG_ITEMS));
}

function getBestDirectMedia(tabId) {
  const items = mediaByTab.get(tabId) || [];
  return items.find((item) => item.playable && /\.m3u8(?:[?#]|$)|m3u8/i.test(item.url)) ||
    items.find((item) => item.playable) ||
    null;
}

function getMediaDebug(tabId) {
  return (mediaByTab.get(tabId) || [])
    .slice(0, MAX_MEDIA_ITEMS)
    .map((item) => ({
      url: item.url,
      type: item.type,
      method: item.method,
      playable: item.playable,
      segment: item.segment,
      suspicious: item.suspicious,
      ageMs: Date.now() - item.seenAt
    }));
}

async function waitForDirectMedia(tabId) {
  const deadline = Date.now() + DIRECT_MEDIA_WAIT_MS;
  let directMedia = getBestDirectMedia(tabId);

  while (!directMedia && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, DIRECT_MEDIA_POLL_MS));
    directMedia = getBestDirectMedia(tabId);
  }

  return directMedia;
}

browser.webRequest.onBeforeSendHeaders.addListener(
  rememberMediaRequest,
  { urls: ["<all_urls>"] },
  ["requestHeaders"]
);

async function sendToFrame(tabId, frameId, message) {
  return browser.tabs.sendMessage(tabId, message, { frameId });
}

async function showErrorInReachableFrame(tabId, reports, message) {
  const frameIds = reports
    .filter((report) => report.ok)
    .sort((a, b) => scoreFrame(b) - scoreFrame(a))
    .map((report) => report.frameId);

  if (!frameIds.includes(0)) {
    frameIds.push(0);
  }

  for (const frameId of frameIds) {
    try {
      await sendToFrame(tabId, frameId, {
        type: "SHOW_EXTERNAL_PIP_ERROR",
        message
      });
      return true;
    } catch (_error) {
      // Try the next reachable frame.
    }
  }

  return false;
}

function scoreFrame(report) {
  if (!report?.ok) {
    return -1;
  }

  return report.playableVideos * 1000 + report.videoCount * 100 + report.visibleVideos * 10 + Number(report.isTopFrame);
}

browser.browserAction.onClicked.addListener(async (tab) => {
  if (typeof tab.id !== "number") {
    return;
  }

  try {
    const frames = await browser.webNavigation.getAllFrames({ tabId: tab.id });
    const reports = await Promise.all(
      frames.map(async (frame) => {
        try {
          const report = await sendToFrame(tab.id, frame.frameId, { type: "PROBE_EXTERNAL_PIP" });
          return { frameId: frame.frameId, url: frame.url, ...report };
        } catch (error) {
          return { frameId: frame.frameId, url: frame.url, ok: false, error: error.message };
        }
      })
    );

    const best = reports
      .filter((report) => scoreFrame(report) >= 0)
      .sort((a, b) => scoreFrame(b) - scoreFrame(a))[0];

    if (!best || !best.videoCount) {
      await showErrorInReachableFrame(
        tab.id,
        reports,
        `No video found. Checked ${frames.length} frame(s). Start playback first, then try again.`
      );
      console.warn("External PiP found no video frames:", reports);
      return;
    }

    const directMedia = await waitForDirectMedia(tab.id);

    if (!directMedia) {
      console.warn("External PiP found no direct media URL. Recent media-like requests:", getMediaDebug(tab.id));
    } else {
      console.log("External PiP direct media candidate:", directMedia.url);
    }

    await sendToFrame(tab.id, best.frameId, {
      type: "START_EXTERNAL_PIP",
      directMedia,
      mediaDebug: getMediaDebug(tab.id)
    });
  } catch (error) {
    console.error("Could not start external PiP:", error);
  }
});

browser.runtime.onMessage.addListener(async (message, sender) => {
  if (message.type === "GET_DIRECT_MEDIA" && sender.tab?.id) {
    return getBestDirectMedia(sender.tab.id);
  }

  if (message.type === "GET_MEDIA_DEBUG" && sender.tab?.id) {
    return getMediaDebug(sender.tab.id);
  }

  if (message.type !== "FOCUS_EXTERNAL_PIP_SOURCE" || !sender.tab?.id) {
    return undefined;
  }

  if (sender.tab.windowId) {
    await browser.windows.update(sender.tab.windowId, { focused: true });
  }

  await browser.tabs.update(sender.tab.id, { active: true });
  return undefined;
});
