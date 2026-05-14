# Firefox macOS External PiP

MVP for sending a Firefox page video into a native macOS always-on-top window without screen recording.

This project is released under the MIT License.

Landing page: https://pluttan.github.io/firefox-macos-pip/

## Plan

1. Firefox extension finds the best `<video>` element on the current tab.
2. The background script watches media requests and prefers a directly playable media URL (`.m3u8`, `.mp4`, etc.).
3. The extension opens a local control channel on the same Mac and sends the direct media URL to the helper.
4. The helper plays direct media itself, so Firefox does not need to decode, capture, encode, and send frames in this mode.
5. If direct media cannot be found or cannot play, the extension lazily falls back to `video.captureStream()` + `MediaRecorder` WebM chunks over the same local WebSocket.
6. The source page video is hidden and gets a small "streaming to PiP" return button while the helper plays the synced audio/video stream.

## Run

Install and start the helper:

```bash
cd /Volumes/pr/pets/firefox-macos-pip/helper
npm install
npm start
```

The helper acts like a local daemon: it keeps the WebSocket server running in the background and only opens the PiP window when the extension starts a stream.
In the beta build, users start the helper manually before using the extension.

For user-facing helper install instructions, see `INSTALL_HELPER_MACOS.md`.

Build a free unsigned helper zip for distribution:

```bash
cd /Volumes/pr/pets/firefox-macos-pip/helper
npm run pack:mac
```

The helper artifact is written to `dist/helper/`.
Use `GITHUB_RELEASE_0.1.0.md` as the first GitHub Release body.

Load the extension in Firefox:

1. Open `about:debugging#/runtime/this-firefox`.
2. Click `Load Temporary Add-on...`.
3. Select `/Volumes/pr/pets/firefox-macos-pip/extension/manifest.json`.
4. Open a page with a normal HTML5 video.
5. Click the extension toolbar button.

After changing files in `extension/`, reload the temporary add-on from `about:debugging`.

## Firefox release

Firefox publication files live in:

- `amo/metadata.json` for AMO listing metadata.
- `amo/review-notes.md` for reviewer notes.
- `PRIVACY.md` for the privacy policy.
- `RELEASE_FIREFOX.md` for build and signing commands.
- `RELEASE_HELPER_MACOS.md` for the companion macOS helper build.

Validate and build the Firefox extension:

```bash
npm install
npm run firefox:lint
npm run firefox:build
```

## Debug

Helper log:

```bash
tail -f "$HOME/Library/Application Support/firefox-macos-pip-helper/helper.log"
```

## Controls

- Icon buttons control the original page player, return to the source tab, pin/unpin the PiP window, and close the stream.
- The whole PiP surface is draggable except the buttons.
- The PiP window keeps the source video's aspect ratio while resizing.

## Current Limits

- This is not true system `AVPictureInPictureController` yet. It is a native always-on-top helper window.
- Direct media depends on the page exposing a playable media URL through normal network requests.
- The fallback path needs the page video to expose `captureStream()` successfully.
- Iframe players are supported by probing all frames and starting in the frame that contains the best `<video>` candidate.
- DRM, protected video paths, and some MSE/cross-origin players may fail or produce no tracks.
- Native Messaging is not used yet because it is bad for realtime media. WebSocket carries control messages and fallback encoded media chunks, so fallback mode can have a small delay.
