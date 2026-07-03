<div align="center">

# Firefox macOS External PiP

**Native always-on-top Picture-in-Picture for Firefox on macOS**


</div>

Firefox extension paired with an Electron helper app that streams page video into an always-on-top window on macOS — no screen recording required. Prefers direct media URLs for zero-overhead playback, falls back to `captureStream()` + `MediaRecorder` over a local WebSocket for universal compatibility.

## ■ Features

- ❖ **Direct media playback** — sniffs `.m3u8`/`.mp4`/`.webm`/`.m4v` URLs from `webRequest`, replays them natively in the helper; HLS streams go through `hls.js`
- ❖ **Fallback streaming** — captures the source `<video>` via `captureStream()` and pumps `MediaRecorder` WebM chunks over a local WebSocket (`ws://127.0.0.1:41243/signaling`) into a `MediaSource` buffer
- ❖ **Playback sync** — mirrors play/pause, seek, current time and playback rate between the source tab and the PiP window
- ❖ **Always-on-top window** — frameless, draggable, resizable PiP surface that locks the source video aspect ratio and persists its position across launches
- ❖ **Iframe support** — probes every frame and scores candidates to find the best playable `<video>`
- ❖ **Playback controls** — icon buttons for play/pause, volume with a slider, pin/unpin, close, plus a seek/timeline bar; an overlay on the source page returns you to the tab
- ❖ **AMO-ready** — includes metadata, privacy policy, and reviewer notes for Firefox Add-ons submission

## ■ Stack

<div align="center">

| Component | Technology |
|-----------|------------|
| Extension | WebExtensions API (Manifest v2) |
| Helper | Electron, ws (WebSocket), hls.js |
| Build | web-ext, electron-builder |
| Platforms | Firefox 142+, macOS (arm64 + x64) |

</div>

## ■ How It Works

```
1. The extension intercepts network requests via webRequest and sniffs for direct media URLs (.m3u8, .mp4, .webm, .m4v).
2. When PiP is triggered, the extension probes every iframe and scores candidates to find the best playable <video> element.
3. If a direct URL was captured, the Electron helper plays it natively (HLS via hls.js); otherwise captureStream() + MediaRecorder streams WebM chunks over a local WebSocket (ws://127.0.0.1:41243/signaling) into a MediaSource buffer.
4. The helper opens a frameless, always-on-top window with playback controls; play/pause, seek, current time, and playback rate are mirrored back to the source tab in real time.
```

## ■ Screenshots

<div align="center">

![Screenshot](screenshots/main.png)

*Main PiP window with playback controls floating above other applications*

</div>

## ■ Usage

```bash
# Install deps and run the Electron helper app
cd helper && npm install && npm start

# Build the extension (web-ext)
npm install
npm run firefox:build

# Lint, build the extension, and pack the macOS helper in one step
npm run release:local
```

Load the extension via `about:debugging#/runtime/this-firefox` > Load Temporary Add-on > select `extension/manifest.json`.

## ■ License

MIT © [pluttan](https://github.com/pluttan)
