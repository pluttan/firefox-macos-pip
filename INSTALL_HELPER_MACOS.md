# Install the macOS Helper

The Firefox extension needs the companion helper app to create the always-on-top macOS PiP window.

This beta helper is free and ad-hoc signed, but it is not notarized with Apple Developer ID. macOS may warn that it cannot verify the developer.

## Install

1. Download the helper zip for your Mac:
   - Apple Silicon: `macOS External PiP Helper-0.1.0-arm64.zip`
   - Intel: `macOS External PiP Helper-0.1.0-x64.zip`
2. Unzip it.
3. Move `macOS External PiP Helper.app` to `/Applications`.
4. Right-click the app and choose **Open**.
5. Confirm **Open** in the macOS security dialog.

After the helper starts, it runs as a small local daemon on your Mac.

The PiP window opens only when the Firefox extension sends a video to it.

## Check That It Is Running

Open the helper app. It does not show a window until the Firefox add-on sends a video to it.

## Stop The Helper

Use Activity Monitor and quit `macOS External PiP Helper`, or run:

```bash
pkill -f "macOS External PiP Helper"
```

## Troubleshooting

If Firefox shows that the helper is not running:

1. Start `macOS External PiP Helper.app`.
2. Refresh the video page.
3. Play the video.
4. Click the extension toolbar button again.

Helper logs are stored locally:

```bash
tail -f "$HOME/Library/Application Support/firefox-macos-pip-helper/helper.log"
```
