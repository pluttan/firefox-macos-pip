# macOS External PiP Bridge 0.1.0 beta

Initial beta release of the Firefox macOS External PiP Bridge.

## Downloads

Install the Firefox add-on from AMO:

```text
https://addons.mozilla.org/firefox/addon/macos-external-pip-bridge/
```

Download the companion macOS helper for your Mac:

- Apple Silicon: `macOS.External.PiP.Helper-0.1.0-arm64.zip`
- Intel: `macOS.External.PiP.Helper-0.1.0-x64.zip`

## Install Helper

1. Download and unzip the helper for your Mac.
2. Move `macOS External PiP Helper.app` to `/Applications`.
3. Right-click the app and choose **Open**.
4. Confirm **Open** in the macOS security dialog.
5. Start playback in Firefox and click the extension toolbar button.

This beta helper is free and ad-hoc signed, but not notarized with Apple Developer ID. macOS may show a developer verification warning on first launch.

## Notes

- The helper listens only on `127.0.0.1:41243`.
- No remote server, analytics, advertising, or tracking is used.
- DRM/protected media and some cross-origin players may not work.
- The fallback stream uses `video.captureStream()` and `MediaRecorder`, so it can have a small delay.

## Artifacts

Attach these files:

```text
dist/helper/macOS External PiP Helper-0.1.0-arm64.zip
dist/helper/macOS External PiP Helper-0.1.0-x64.zip
```
