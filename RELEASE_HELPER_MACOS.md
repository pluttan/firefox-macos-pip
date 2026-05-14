# macOS Helper Release Checklist

This project can produce free ad-hoc signed helper builds. Because they are not signed with Apple Developer ID and not notarized, macOS Gatekeeper shows a warning on first launch. Users should right-click the app and choose **Open**.

## Build

```bash
cd helper
npm install
npm run check
npm run pack:mac
```

Artifacts are written to:

```text
dist/helper/
```

Publish both architecture-specific zip files:

```text
dist/helper/macOS External PiP Helper-0.1.0-arm64.zip
dist/helper/macOS External PiP Helper-0.1.0-x64.zip
```

## Manual Smoke Test

1. Unzip the helper artifact.
2. Move the app to `/Applications`.
3. Right-click the app and choose **Open**.
4. Open Firefox, play an HTML5 video, and click the extension toolbar button.

## Release Notes Template

```markdown
macOS External PiP Helper 0.1.0 beta

Companion helper for the Firefox macOS External PiP Bridge extension.

Install:
1. Download and unzip the helper.
2. Move the app to /Applications.
3. Right-click the app and choose Open.
4. Start the Firefox extension on a page with an HTML5 video.

This beta build is free and ad-hoc signed, but not notarized. macOS may show a developer verification warning on first launch.
```
