# Extension Timer — Project Instructions

Chrome MV3 extension. Lists installed extensions and enables one temporarily on
a countdown that auto-disables it. No build step, no dependencies, no tests —
plain JS loaded unpacked.

**Owner:** WebDevNC. Proprietary, all rights reserved — see `LICENSE`.

## Layout

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest. Permissions: `management`, `alarms`, `storage`, `notifications`. No host permissions. Explicit CSP. |
| `background.js` | Service worker. Alarms, auto-disable, notifications, all `activeTimers` state. |
| `popup.js` | Popup UI. Extension list, toggles, timer start/cancel, live countdown. |
| `popup.html` / `popup.css` | Popup markup and styles. |
| `AUDIT.md` | Code audit — 15 findings, status table, fix order. Read before touching `background.js` or `popup.js`. |
| `PRIVACY.md` | Privacy policy draft + Web Store dashboard field text. Not publishable until the `[CONTACT EMAIL]` placeholder is filled and it is hosted. |

## Invariants — do not regress these

Each cost a fix; `AUDIT.md` has the full reasoning.

- **Never build DOM from `innerHTML` with extension data.** `ext.name` and icon
  URLs come from other installed extensions' manifests, so they are
  attacker-controlled. Use `createElement` + `textContent`, and route every icon
  URL through `safeIconUrl()`, which allowlists the
  `chrome://extension-icon/` scheme.
- **No inline event handlers.** The CSP blocks them silently — an
  `onerror="..."` attribute never runs. Attach with `addEventListener`.
- **All `activeTimers` mutations go through `withTimers()`** in `background.js`.
  Reading, mutating and writing outside that queue loses updates.
- **Alarms use absolute `when: expiresAt`,** never a relative delay. Chrome
  clears alarms on update/reload; `reconcileTimers()` recreates them from the
  stored timestamp on `onStartup`/`onInstalled`.
- **`chrome.runtime.sendMessage` rejects** when the service worker is evicted.
  Every call site needs a `try`/`catch` that tells the user.
- **Filter `mayDisable`** before showing an extension as a timer target.

## Working on this

- Verify in a real browser. There is no test suite. `node --check` on the two
  scripts catches only syntax.
- Load unpacked at `chrome://extensions`, then check the service worker console
  separately from the popup console — they are different contexts.
- After changing anything in `background.js`, confirm alarms survive a reload:
  arm a timer, reload the extension, then run `await chrome.alarms.getAll()` in
  the service worker console.
- Bumping `version` in `manifest.json` is required for every Web Store upload.

## Branch state (2026-08-30)

`main` carries the audit fixes. `feat/clean-minimal-ui` is the active UI line and
rebuilt `popup.js` from an older base — it independently reintroduces the
injection sink, the dead `onerror`, minutes-only `formatTime`, and the missing
`mayDisable` filter. Re-apply the popup fixes onto the rebuilt code when merging
it; do not resolve that conflict wholesale in either direction. `background.js`
is untouched there and merges cleanly.
