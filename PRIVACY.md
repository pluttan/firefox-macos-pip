# Privacy Policy

macOS External PiP Bridge does not collect analytics, run advertising, track users, or send data to remote servers.

When the user clicks the extension toolbar button, the extension inspects the active tab for HTML5 video elements. To display the selected video in the companion macOS helper, the extension may send the following data to `127.0.0.1:41243` on the same computer:

- the selected page video's direct media URL, when one is available
- limited media request headers needed for playback: `Origin`, `Referer`, and `Range`
- playback state such as current time, pause state, duration, and playback rate
- fallback encoded WebM media chunks from `video.captureStream()` when direct playback is unavailable

The companion helper uses this data only to display the video in a local always-on-top window. The project does not operate a server and does not transmit this data off the device.

The helper writes a local diagnostic log under the user's macOS application support directory. The log records lifecycle and troubleshooting events. Full direct media URLs are not intentionally written to the helper log.
