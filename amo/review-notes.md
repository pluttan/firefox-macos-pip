Reviewer notes for AMO
======================

This add-on requires a separate local macOS helper app. The helper listens only on `127.0.0.1:41243` and is not bundled into the Firefox extension.

User flow:

1. The user starts the macOS helper app.
2. The user opens a page with an HTML5 `<video>`.
3. The user clicks the toolbar button.
4. The extension probes frames in the active tab, chooses the best video element, and connects to `ws://127.0.0.1:41243/signaling`.
5. If the page exposed a direct playable media URL, the extension sends that URL and limited request headers (`Origin`, `Referer`, `Range`) to the local helper.
6. If no direct URL is available, the extension uses `video.captureStream()` and `MediaRecorder` to send WebM chunks to the local helper over the same localhost WebSocket.

Why broad permissions are requested:

- `<all_urls>` and the all-frames content script are used to detect videos inside embedded players and iframes.
- `webRequest` is used to identify direct media candidates such as HLS playlists and MP4/WebM URLs.
- `webNavigation` is used to enumerate frames so the toolbar click can target the frame that actually contains the video.
- `tabs` is used to return focus to the source tab when the helper window is closed.
- `ws://127.0.0.1:41243/*` is used only for the local helper control/media channel.

Data handling:

- No data is sent to remote servers by the extension.
- On explicit toolbar click, browsing activity and website content related to the selected video may be sent to the local macOS helper.
- The helper log avoids storing full direct media URLs; it logs only high-level lifecycle events and media source origins.
- The helper and extension do not include analytics, advertising, or tracking code.

Known limits:

- DRM/protected media may fail.
- Some cross-origin or MSE players may not expose a direct media URL or capturable stream.
- The helper must be installed separately because Firefox extensions cannot create a native always-on-top macOS window by themselves.
