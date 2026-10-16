# Sill workspace without the top toolbar — 2026-10-14

This is the **latest UI acceptance**, superseding the earlier `cloud-ui-20261014` media. The user's later instruction removes the entire top icon/account row and its layout space. No replacement row was added. Content now begins at the original main padding (40px desktop, 16px phone).

New note and refresh remain in the existing lower-right glass tool menu. The empty welcome also retains its first-note action. Sign-out is in existing Settings → Data and privacy, with a 44px touch target. Card reader/edit controls, keyboard handling, login and existing sessions retain their behavior.

All evidence is **isolated synthetic data**, not production. No email, production database, credentials or deployment was used.

| Evidence | Desktop 1440×1000 | iPhone 12 emulation 390×844 |
| --- | --- | --- |
| Welcome | [PNG](desktop-welcome.png) | [PNG](mobile-welcome.png) |
| Editor | [PNG](desktop-editor.png) | [PNG](mobile-editor.png) |
| Workspace, no top row | [PNG](desktop-cards.png) | [PNG](mobile-cards.png) |
| Complete walkthrough | [MP4](desktop-full.mp4) | [MP4](mobile-full.mp4) |

The desktop recording is 61.92 seconds; the mobile recording is 65.84 seconds. The full recordings show twelve readable stages: welcome/login; invalid email; synthetic send with resend guard; callback failure/recovery; synthetic PKCE login and empty workspace; new note; save; read/Escape back; edit/save; refresh and reload persistence; modal focus/close; logout and cleared cards. [Step coverage](steps.json) records the exact flow. A persistent footer labels mock API/nonproduction, including when a native dialog covers the webpage's step label. MP4s preserve the full captured timeline; transcoding adds only that disclosure and compresses the recordings. There is no audio.

## Validation

- `npm run build:cloud` passes.
- `test:cloud-browser` passes real Chromium → HTTP runtime → pinned SDK → synthetic auth transport → actual isolated SQL, including PKCE, CRUD, uncertain-save replay, revision conflict, synthetic MCP updates visible in web, no localStorage and logout. Actions now use existing dock/settings controls.
- `test:cloud-welcome` passes desktop and explicit 390×844: no top row or placeholder, content at viewport top, welcome/editor, focus, shortened viewport scroll, 24-card scrolling, reader, settings truthfulness, callback recovery, resend suppression, 403/503 handling and late refresh after logout.
- `node tests/cloud-full-walkthrough.mjs` passes both recorded flows; errors/assertions fail the run. It can be rerun after build with the installed Playwright/Chromium/ffmpeg.
- `git diff --check` passes. Remote CI is checked separately on final PR heads.

The iPhone recording is Chromium device emulation, not physical Safari. The 390×450 portion simulates keyboard space by reducing viewport height; it is not a native iOS keyboard recording. It demonstrates reachable editor controls and scrolling. Source connectors and real remote MCP are not connected or represented as connected.

## Delivery and deployment boundary

All files are preserved individually; the duplicate ZIP was removed after byte-for-byte comparison. [SHA-256 manifest](manifest.json). This change stays in draft PR22; remote authorization implementation is separate draft PR26. Neither is deployed or merged. Current production readback remains blocked by the previously reported workers.dev proxy 403 / parent Cloudflare authorization error; no newer production version is claimed.
