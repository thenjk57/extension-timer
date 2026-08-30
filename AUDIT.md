# Code Audit — Extension Manager (Auto-Disable & Timer)

**Audited:** 2026-08-30
**Commit:** `90bef64` — feat: implement extension manager with auto-disable timer and SEO strategy
**Scope:** `manifest.json`, `background.js`, `popup.js`, `popup.html`, `popup.css`, `README.md`
**Manifest version:** MV3

15 findings: 2 security, 10 functional bugs, 3 store-readiness gaps.

---

## Status — all 15 addressed

| Finding | Status | Commit |
|---------|--------|--------|
| S-1 — HTML injection from extension names | Fixed | `b7d8ec0` |
| S-2 — lost updates on `activeTimers` | Fixed | `d315579` |
| B-1 — `onerror` fallback never runs | Fixed | `b7d8ec0` |
| B-2 — timers orphaned after reload/update | Fixed | `b08a17e` |
| B-3 — relative alarm delay | Fixed | `b08a17e` |
| B-4 — unvalidated duration input | Fixed | `d315579` |
| B-5 — no hours in `formatTime` | Fixed | `0b1ed03` |
| B-6 — ticker spins on stuck expiry | Fixed | `b08a17e` |
| B-7 — undisableable extensions listed | Fixed | `d315579` |
| B-8 — unhandled `sendMessage` rejections | Fixed | `d315579` |
| B-9 — unknown actions never respond | Fixed | `d315579` |
| B-10 — external toggles desync state | Fixed | `d315579` |
| R-1 — no privacy policy | Drafted — see [PRIVACY.md](PRIVACY.md) | `aed1ccd` |
| R-2 — hardcoded install path | Fixed | `aed1ccd` |
| R-3 — no LICENSE | Added — proprietary, WebDevNC | `b5064aa` |

### Carried over

- **`PRIVACY.md` is not publishable as-is.** It contains a `[CONTACT EMAIL]`
  placeholder, and still needs hosting at a stable URL plus that URL entered in
  the Web Store dashboard. Permission justification text is in its appendix.
- **CSP shipped narrower than S-1 proposed.** `manifest.json` declares
  `script-src 'self'; object-src 'self'`. The proposed
  `img-src 'self' chrome://extension-icon/` clause was dropped because a CSP
  value Chrome rejects prevents the extension loading at all, and that could not
  be verified without a browser. The `safeIconUrl` allowlist in `popup.js`
  already closes the hole in JS; the clause was defense in depth. Add it once a
  real load confirms it is accepted.
- **No fix was verified in a browser.** `node --check` passes on both scripts,
  `manifest.json` parses, and `formatTime` passes nine boundary cases. Every
  behavioral check in the fix-order stages below still needs an unpacked load —
  above all the S-1 test: rename a test extension to
  `A" ><img src=x onerror=alert(1)>` and confirm it renders as literal text with
  no CSP violations in the console.
- **The README's install steps conflict with the proprietary LICENSE.** They
  invite anyone to clone and load the extension; the licence grants no such
  right. Fine for internal and client use, worth rewording if the repo is public.

### Branch integration — resolved

The audit targeted `main` (`90bef64`). The UI line **`feat/clean-minimal-ui`**
had branched before it and rebuilt `popup.js` wholesale (28% similar to the
audited file), independently carrying **S-1**, **B-1**, **B-5** and **B-7**.

That branch is now merged (`e124e57`). `popup.js` was resolved by keeping the
new UI in full and re-applying the four fixes to it; `background.js` was
untouched on the branch so all background fixes survive unchanged, and
`popup.html` / `popup.css` came across whole.

Two further defects in the rebuilt code were fixed in the same merge:

- `homepageUrl`, supplied by another extension's manifest, was passed to
  `chrome.tabs.create` behind a `startsWith('http')` test that a scheme such as
  `httpfoo:` satisfies. Now an anchored `https?://` check.
- The drawer's timer chips called `sendMessage` with no rejection handler and
  gave no feedback when a start failed.

`B-4` no longer applies to the shipped UI: the free-text duration field is gone,
replaced by fixed 5/15/30/60 chips, which are still range-checked before use.

---

## Severity legend

| Level | Meaning |
|-------|---------|
| **High** | Exploitable by another installed extension, or breaks the extension's core promise (timer never fires) |
| **Medium** | Reproducible incorrect behavior a normal user will hit |
| **Low** | Edge case, cosmetic, or maintenance risk |
| **Blocker** | Prevents Chrome Web Store publication |

---

# Security

## S-1 — HTML injection from attacker-controlled extension names

**Severity:** High
**Files:** [popup.js:112-121](popup.js:112), [popup.js:218-233](popup.js:218)

### What happens

Both render paths build DOM by string concatenation into `innerHTML`, interpolating values the extension does not control:

```js
// popup.js:112 — renderManagerList()
item.innerHTML = `
  <div class="manager-item-left">
    <img src="${iconUrl}" class="manager-item-icon" alt="" onerror="this.src='icons/icon48.png'">
    <span class="manager-item-name" title="${ext.name}">${ext.name}</span>
  </div>
  ...
```

```js
// popup.js:218 — refreshActiveTimers()
card.innerHTML = `
  ...
  <img src="${timer.iconUrl}" class="timer-ext-icon" alt="" onerror="this.src='icons/icon48.png'">
  <span class="timer-ext-name" title="${timer.name}">${timer.name}</span>
  ...
```

Four injection points: `ext.name` (twice — once inside a `title="..."` attribute, once as text), `iconUrl`, `timer.name`, `timer.iconUrl`.

### Why the values are untrusted

`ext.name` comes from `chrome.management.getAll()` — it is the `name` field of *every other extension installed in the browser*, verbatim from that extension's own manifest. Any extension author picks their own name. A typosquat or a compromised-update extension can publish itself as:

```
"name": "Adblock\" ><img src=x onerror=alert(chrome.runtime.id)>"
```

The `"` closes the `title` attribute, `>` closes the `<span>`, and the payload lands as live markup in the popup's document.

`timer.name` and `timer.iconUrl` come from `chrome.storage.local`, but they were copied there from the same `chrome.management` data at [popup.js:167-178](popup.js:167) — so the taint is stored, and it persists across restarts.

### Actual impact today

Manifest 3's default CSP for extension pages is `script-src 'self'; object-src 'self'`. That blocks inline event handlers, so the injected `onerror=` does **not** execute. This is not currently remote code execution.

That mitigation is the only thing standing between this and full compromise, and it is load-bearing without being declared: `manifest.json` sets no explicit `content_security_policy` key, so the protection is an implicit platform default rather than a stated project decision. Anyone loosening the CSP later — a common step when adding an inline analytics snippet or a WASM dependency — silently converts this into arbitrary script execution in a page that holds the `management` permission. That means the ability to enable or disable every extension in the browser, including disabling the user's security extensions.

Even with CSP intact, two things still work:

1. **UI spoofing.** Injected markup renders. An attacker extension can draw a convincing fake "Turn Off Now" button, overlay the real controls, or push its own row off-screen so the user cannot disable it.
2. **Forced outbound requests.** `iconUrl` is written into `<img src="...">` with no scheme check. `img-src` is not restricted to `self` by the default extension CSP, so a remote URL loads. Every popup open then pings a third-party server, leaking usage timing. This directly contradicts the README's claim: *"100% Local: No tracking, no external API requests, zero telemetry."*

### Fix

Stop building markup from strings. Construct nodes and assign through `textContent`, which never parses HTML:

```js
function buildManagerItem(ext) {
  const item = document.createElement('div');
  item.className = 'manager-item';

  const left = document.createElement('div');
  left.className = 'manager-item-left';

  const img = document.createElement('img');
  img.className = 'manager-item-icon';
  img.alt = '';
  img.src = safeIconUrl(ext.icons?.[0]?.url);
  img.addEventListener('error', () => { img.src = 'icons/icon48.png'; });

  const name = document.createElement('span');
  name.className = 'manager-item-name';
  name.textContent = ext.name;   // no parsing, no injection
  name.title = ext.name;         // property assignment, not attribute interpolation

  left.append(img, name);

  const label = document.createElement('label');
  label.className = 'switch';
  const chk = document.createElement('input');
  chk.type = 'checkbox';
  chk.className = 'toggle-ext-checkbox';
  chk.dataset.id = ext.id;
  chk.checked = ext.enabled;
  const slider = document.createElement('span');
  slider.className = 'slider';
  label.append(chk, slider);

  item.append(left, label);
  return item;
}
```

And gate the icon scheme so a remote URL can never reach `src`:

```js
function safeIconUrl(url) {
  return (typeof url === 'string' && url.startsWith('chrome://extension-icon/'))
    ? url
    : 'icons/icon48.png';
}
```

Apply the same treatment to the timer card in `refreshActiveTimers()`.

### Hardening (do alongside)

Declare the CSP explicitly in `manifest.json` so the protection is intentional and survives future edits:

```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self'; img-src 'self' chrome://extension-icon/"
}
```

The `img-src` clause closes the outbound-request leak at the platform level, independent of the JS fix.

---

## S-2 — Lost updates from concurrent read-modify-write on `activeTimers`

**Severity:** Medium
**Files:** [background.js:24-45](background.js:24), [background.js:82-91](background.js:82), [background.js:107-109](background.js:107)

### What happens

Three code paths each perform an unsynchronized `get` → mutate → `set` on the same storage key:

```js
// onAlarm — background.js:24 and :44
const { activeTimers = {} } = await chrome.storage.local.get('activeTimers');
// ... await chrome.management.setEnabled(...) — a long await in between ...
delete activeTimers[extensionId];
await chrome.storage.local.set({ activeTimers });
```

```js
// handleStartTimer — background.js:82
const { activeTimers = {} } = await chrome.storage.local.get('activeTimers');
activeTimers[extensionId] = { ... };
await chrome.storage.local.set({ activeTimers });
```

```js
// handleCancelTimer — background.js:107
const { activeTimers = {} } = await chrome.storage.local.get('activeTimers');
delete activeTimers[extensionId];
await chrome.storage.local.set({ activeTimers });
```

Each handler holds a stale in-memory snapshot across one or more `await` points, then writes the whole object back. The alarm handler's window is the widest: it reads at line 24, then awaits `chrome.management.setEnabled` — which can block on a user-facing confirmation — before writing at line 45.

### Reproduction

1. Timer A is 2 seconds from expiry. `activeTimers = { A: {...} }`.
2. Alarm A fires. Handler reads `{ A }` into memory, begins `setEnabled(A, false)`.
3. While that await is pending, the user clicks "Enable with Auto-Off Timer" for extension B. `handleStartTimer` reads `{ A }`, adds B, writes `{ A, B }`.
4. Alarm A's `setEnabled` resolves. Its snapshot is still `{ A }`. It deletes A and writes `{}`.
5. **Timer B is gone from storage.** Its alarm is still registered, so in N minutes extension B is disabled with no UI having shown it, and the notification falls back to the generic label `"Extension"` because `timerData` is `undefined` at [background.js:30](background.js:30).

The reverse ordering resurrects a dead timer: a cancel that writes `{}` followed by a stale alarm write of `{ A }` leaves a phantom entry with no backing alarm, inflating the badge permanently.

### Fix

Serialize every mutation through a single promise chain in the service worker. All three call sites share one worker context, so a module-level chain is sufficient — no cross-context locking needed:

```js
let queue = Promise.resolve();

function withTimers(mutator) {
  const next = queue.then(async () => {
    const { activeTimers = {} } = await chrome.storage.local.get('activeTimers');
    const result = await mutator(activeTimers);
    await chrome.storage.local.set({ activeTimers });
    await updateBadge();
    return result;
  });
  // keep the chain alive even if one mutation throws
  queue = next.catch(() => {});
  return next;
}
```

Then re-read inside the critical section rather than across an external await. In `onAlarm`, read the timer name *before* calling `setEnabled`, and do the delete inside `withTimers`:

```js
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;
  const extensionId = alarm.name.slice(ALARM_PREFIX.length);

  const { activeTimers = {} } = await chrome.storage.local.get('activeTimers');
  const extName = activeTimers[extensionId]?.name || 'Extension';

  try {
    await chrome.management.setEnabled(extensionId, false);
    chrome.notifications.create(`notif_${extensionId}_${Date.now()}`, { ... });
  } catch (err) {
    console.error(`Failed to disable extension ${extensionId}:`, err);
  } finally {
    await withTimers(t => { delete t[extensionId]; });
  }
});
```

Note the secondary fix embedded above: `alarm.name.replace(ALARM_PREFIX, '')` at [background.js:23](background.js:23) replaces the *first occurrence anywhere*, not a prefix. Extension IDs are `[a-p]{32}` and cannot contain `ext_timer_`, so this is safe today — but `slice(ALARM_PREFIX.length)` states the intent and cannot rot if the prefix scheme changes.

---

# Functional bugs

## B-1 — `onerror` fallback never runs

**Severity:** Medium
**Files:** [popup.js:114](popup.js:114), [popup.js:221](popup.js:221)

```js
<img src="${iconUrl}" class="manager-item-icon" alt="" onerror="this.src='icons/icon48.png'">
```

Inline event handler attributes are blocked by MV3's default `script-src 'self'` CSP, exactly as inline `<script>` is. The handler is parsed into the DOM and silently never fires. Every extension with a missing or unresolvable icon shows a broken-image placeholder instead of the intended default, and the console fills with CSP violation reports.

**Fix:** attach with `addEventListener('error', ...)` — covered by the node-construction rewrite in **S-1**.

---

## B-2 — Timers orphaned after extension reload or update

**Severity:** High — this breaks the extension's central promise
**File:** [background.js:124-125](background.js:124)

```js
chrome.runtime.onStartup.addListener(updateBadge);
chrome.runtime.onInstalled.addListener(updateBadge);
```

Both events do nothing but repaint the badge. Nothing reconciles storage against the alarm registry.

Chrome clears an extension's registered alarms when the extension is updated or reloaded. `chrome.storage.local` survives both. So after any update — including every Web Store auto-update pushed to users — `activeTimers` still lists live timers whose alarms no longer exist.

### Consequences

- The badge shows a permanent nonzero count.
- The target extension is **never auto-disabled**. The user believes it will turn off; it stays on indefinitely, burning the RAM the extension exists to save.
- The popup renders the timer card with a countdown that ticks to `00:00` and then sits there. The ticker's `hasExpired` branch at [popup.js:270](popup.js:270) fires forever because nothing ever removes the entry — see **B-6**.
- The only escape is manually clicking "Keep Enabled" or "Turn Off Now" on each stale card.

### Fix

Reconcile on both lifecycle events. Overdue timers act immediately; live ones get their alarm recreated:

```js
async function reconcileTimers() {
  const { activeTimers = {} } = await chrome.storage.local.get('activeTimers');
  const now = Date.now();
  let dirty = false;

  for (const [id, timer] of Object.entries(activeTimers)) {
    if (timer.expiresAt <= now) {
      // Missed its window while we were not running — honor it now.
      try {
        await chrome.management.setEnabled(id, false);
      } catch (err) {
        console.error(`Failed to disable overdue extension ${id}:`, err);
      }
      delete activeTimers[id];
      dirty = true;
    } else if (!(await chrome.alarms.get(`${ALARM_PREFIX}${id}`))) {
      // Alarm was wiped by the update/reload; restore it.
      await chrome.alarms.create(`${ALARM_PREFIX}${id}`, { when: timer.expiresAt });
    }
  }

  if (dirty) await chrome.storage.local.set({ activeTimers });
  await updateBadge();
}

chrome.runtime.onStartup.addListener(reconcileTimers);
chrome.runtime.onInstalled.addListener(reconcileTimers);
```

Depends on **B-3** — restoring the alarm requires an absolute timestamp.

---

## B-3 — Alarm scheduled with a relative delay instead of an absolute time

**Severity:** Medium (blocks the fix for B-2)
**File:** [background.js:77-79](background.js:77)

```js
await chrome.alarms.create(alarmName, {
  delayInMinutes: durationMinutes
});
```

`delayInMinutes` is relative to the moment of the call. Once that moment passes it is unrecoverable — there is no way to reconstruct the correct remaining delay after a restart without recomputing from `expiresAt` anyway.

The storage record already holds the right value at [background.js:89](background.js:89): `expiresAt`. The alarm and the record should agree on the same clock.

**Fix:**

```js
await chrome.alarms.create(alarmName, { when: expiresAt });
```

Single source of truth, and it makes **B-2**'s reconciliation a direct re-issue rather than an arithmetic guess.

---

## B-4 — Duration input accepts values the platform silently rewrites

**Severity:** Medium
**Files:** [popup.js:154](popup.js:154), [popup.js:161-164](popup.js:161), [popup.html:68](popup.html:68)

```js
const minutes = parseFloat(minutesInput.value);
...
if (isNaN(minutes) || minutes <= 0) {
  showStatus('Please enter a valid time (> 0 mins).', 'error');
  return;
}
```

The HTML declares `min="1" max="1440"`, but those attributes are only enforced by native form validation — this input is not inside a `<form>` and no `checkValidity()` call exists, so they are decorative. The JS accepts any positive float.

Two distinct failures:

**Sub-minute values.** `0.5` passes validation. Chrome clamps `alarms.create` delays below its minimum (30 seconds for unpacked, historically 1 minute for packed releases). The UI confirms *"Auto-off timer set for 0.5 min(s)!"*, the card counts down from `00:30`, hits zero, and the extension stays enabled until the clamped alarm actually fires. The countdown and reality diverge with no explanation to the user.

**Out-of-range values.** `99999` is accepted — a 69-day timer, well past anything the UI implies. `12.7` produces an `expiresAt` that never lines up with a whole-second countdown tick.

**Fix:** validate and normalize in JS, matching the declared HTML bounds:

```js
const raw = parseFloat(minutesInput.value);
const minutes = Math.round(raw);

if (!Number.isFinite(raw) || minutes < 1 || minutes > 1440) {
  showStatus('Enter a duration between 1 and 1440 minutes.', 'error');
  return;
}
```

---

## B-5 — `formatTime` has no hours component

**Severity:** Low
**File:** [popup.js:292-297](popup.js:292)

```js
function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
```

Minutes are never rolled into hours. The shipped **1h** preset at [popup.html:61](popup.html:61) renders as `60:00`. The documented `max="1440"` renders as `1440:00`. A two-digit-padded `MM:SS` display reading `1440:00` is not parseable at a glance.

**Fix:**

```js
function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  const mm = String(min).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return hrs > 0 ? `${hrs}:${mm}:${ss}` : `${mm}:${ss}`;
}
```

---

## B-6 — Countdown ticker spins at 1 Hz when a timer cannot be cleared

**Severity:** Medium
**File:** [popup.js:261-288](popup.js:261)

```js
if (remainingMs <= 0) {
  hasExpired = true;
}
...
if (hasExpired) {
  await refreshActiveTimers();
  await loadInstalledExtensions();
}
```

`hasExpired` is derived fresh from storage on every tick. It stays true for as long as the expired entry remains in storage. The refresh does not remove it — only the background alarm handler does.

So whenever removal fails or never happens — the orphaned-timer state from **B-2**, or a `setEnabled` failure on a policy-locked extension — the popup executes `chrome.management.getAll()` plus two full DOM re-renders every second, indefinitely, for as long as the popup is open. Toggle state and scroll position reset on each pass, making the list unusable.

**Fix:** latch per extension ID so the recovery attempt runs once:

```js
const expiryHandled = new Set();
...
if (remainingMs <= 0) {
  if (!expiryHandled.has(id)) {
    expiryHandled.add(id);
    hasExpired = true;
  }
}
```

Clear an ID from the set when it disappears from `activeTimers`, so a re-armed timer on the same extension can latch again.

---

## B-7 — Extensions that cannot be disabled are offered as targets

**Severity:** Medium
**File:** [popup.js:54-56](popup.js:54)

```js
installedExtensions = all
  .filter(ext => ext.type === 'extension' && ext.id !== chrome.runtime.id)
  .sort((a, b) => a.name.localeCompare(b.name));
```

`chrome.management.ExtensionInfo` carries a `mayDisable` boolean. It is `false` for enterprise-policy-forced extensions and for Chrome component extensions. Those entries pass this filter and appear in both the dropdown and the toggle list.

- Flipping their toggle throws. [popup.js:143](popup.js:143) reverts the checkbox, so the switch visibly snaps back with no explanation.
- Starting a timer on one fails inside `handleStartTimer`, and [popup.js:186](popup.js:186) surfaces the raw Chrome exception text to the user.
- They inflate the `total-ext-count` figure at [popup.js:58](popup.js:58), which claims to count manageable extensions.

**Fix:**

```js
.filter(ext => ext.type === 'extension' && ext.id !== chrome.runtime.id && ext.mayDisable)
```

If surfacing them is preferred over hiding them, render the row with a disabled toggle and a "Managed by your organization" tooltip — but never as a selectable timer target.

---

## B-8 — Unhandled `sendMessage` rejections freeze the UI

**Severity:** Medium
**Files:** [popup.js:171](popup.js:171), [popup.js:249](popup.js:249), [popup.js:134](popup.js:134)

```js
showStatus('Starting timer...', '');

const response = await chrome.runtime.sendMessage({ action: 'startTimer', data: { ... } });
```

No `try`/`catch`. `chrome.runtime.sendMessage` returns a promise that **rejects** — it does not resolve to a falsy value — when the service worker is unavailable, still spinning up, or terminates mid-request. MV3 service workers are aggressively evicted, so a cold-start race is routine, not exotic.

On rejection the `await` throws, `handleStart` aborts, and the status message is left frozen on `"Starting timer..."` forever. The user has no signal that anything failed and no reason not to click again. `cancelTimer` at line 249 and the toggle handler's cancel call at line 134 have the same gap.

**Fix:**

```js
let response;
try {
  response = await chrome.runtime.sendMessage({ action: 'startTimer', data: { ... } });
} catch (err) {
  console.error('startTimer message failed:', err);
  showStatus('Background service unavailable — try again.', 'error');
  return;
}
```

Wrap all three call sites.

---

## B-9 — Unknown message actions never send a response

**Severity:** Low
**File:** [background.js:52-63](background.js:52)

```js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startTimer') { ... return true; }
  else if (message.action === 'cancelTimer') { ... return true; }
  else if (message.action === 'getActiveTimers') { ... return true; }
});
```

No terminal `else`. An unrecognized `message.action` falls through, the listener returns `undefined`, the channel closes, and the caller's promise resolves to `undefined`.

Harmless with today's three actions, all of which match. It becomes a silent debugging trap the moment a fourth action is added and a name is typo'd — the caller sees `undefined` and reads it as a failed operation with no error anywhere.

**Fix:**

```js
  } else {
    sendResponse({ success: false, error: `Unknown action: ${message.action}` });
  }
```

While in this listener: no `sender` validation is present. That is currently fine — `manifest.json` declares no `externally_connectable`, so web pages and other extensions cannot reach `onMessage`, and there are no content scripts. Worth noting so the omission is not mistaken for an oversight, and so that adding `externally_connectable` later is understood to require a sender check here.

---

## B-10 — External enable/disable desyncs timer state

**Severity:** Low
**File:** `background.js` — no listener registered

The extension only learns about state changes it initiated. `chrome.management.onEnabled`, `onDisabled`, and `onUninstalled` are never subscribed.

When a user disables an extension directly from `chrome://extensions` while a timer is running:

- The timer entry and its alarm both persist.
- The badge keeps counting it.
- The popup renders a countdown for an already-disabled extension.
- The alarm eventually fires and calls `setEnabled(id, false)` on something already disabled — a no-op, but it emits a misleading *"was automatically disabled"* notification for an action the user took themselves minutes earlier.

Uninstalling the target is worse: the entry is unreachable, and the alarm fires against a nonexistent ID, hitting the `catch` at [background.js:40](background.js:40) on every occurrence.

**Fix:**

```js
async function dropTimer(extensionId) {
  await chrome.alarms.clear(`${ALARM_PREFIX}${extensionId}`);
  await withTimers(t => { delete t[extensionId]; });
}

chrome.management.onDisabled.addListener(info => dropTimer(info.id));
chrome.management.onUninstalled.addListener(id => dropTimer(id));
```

`onEnabled` needs no handler — enabling an extension that has no timer is not a state this extension tracks.

---

# Store readiness

## R-1 — No privacy policy

**Severity:** Blocker for Chrome Web Store

The `management` permission is classified as sensitive. Chrome Web Store review requires a published, publicly reachable privacy policy URL for any extension requesting it, plus a justification for each permission in the developer dashboard. Neither exists in the repository.

The README already contains the substance at lines 30-35 — permission-by-permission justification and the "100% Local" statement. That needs to be a hosted page with a stable URL, entered into the dashboard's Privacy tab. Note that the "no external API requests" claim must remain true once **S-1**'s `img-src` fix lands; it is not strictly true before it.

## R-2 — README hardcodes a machine-specific install path

**Severity:** Low
**File:** [README.md:25](README.md:25)

> 5. Select this folder: `/Volumes/Disk/Projects/Extension Timer`.

Meaningless to anyone else, and it leaks the local directory layout. Replace with "Select the folder you cloned this repository into."

## R-3 — No LICENSE file

**Severity:** Low

A public repository with no license grants no rights to anyone. Contributors have no basis to submit, and users have no basis to fork. Add an explicit license file.

---

# Recommended fix order

Ordered by dependency first, then by severity. Each stage is independently shippable and testable.

### Stage 1 — Restore the core function

| # | Finding | Why first |
|---|---------|-----------|
| 1 | **B-3** — switch to `alarms.create({ when: expiresAt })` | Two-line change. Strict prerequisite for B-2 — reconciliation needs an absolute timestamp. |
| 2 | **B-2** — reconcile timers on `onStartup` / `onInstalled` | The extension's headline feature silently stops working after every auto-update. Highest user-visible severity in the report. |
| 3 | **B-6** — latch expired-timer handling in the ticker | Directly downstream of B-2's failure mode. Fixing B-2 removes most triggers, but the latch is what stops the 1 Hz spin when `setEnabled` fails for any other reason. |

**Verify:** start a 10-minute timer, reload the extension from `chrome://extensions`, confirm the alarm is re-registered (`chrome.alarms.getAll()` in the service worker console) and the countdown stays truthful. Then start a 2-minute timer, close the browser for 5 minutes, reopen, and confirm the target is disabled on startup.

---

### Stage 2 — Close the injection surface

| # | Finding | Why here |
|---|---------|----------|
| 4 | **S-1** — replace `innerHTML` with node construction + `textContent`, add `safeIconUrl` | Largest single change; touches both render paths. Do it as one focused commit while the render code is not otherwise in flux. |
| 5 | **B-1** — `addEventListener('error', ...)` for the icon fallback | Free — the S-1 rewrite has to attach the handler anyway. |
| 6 | **S-1 hardening** — declare `content_security_policy` with `img-src 'self' chrome://extension-icon/` in `manifest.json` | Manifest-only. Makes the platform mitigation explicit and closes the outbound-request leak independently of the JS. |

**Verify:** temporarily rename a test extension to `A" ><img src=x onerror=alert(1)>` in an unpacked manifest, load it, open the popup. The literal string must render as visible text in the row, with no extra DOM nodes and no CSP violations in the console.

---

### Stage 3 — Correctness and resilience

| # | Finding | Notes |
|---|---------|-------|
| 7 | **S-2** — serialize `activeTimers` mutations through a promise chain | Restructures all three handlers. Land after Stage 1 so it rebases onto the final shape of `onAlarm` rather than the current one. |
| 8 | **B-8** — wrap the three `sendMessage` calls in `try`/`catch` | Independent, three small edits. |
| 9 | **B-7** — filter on `mayDisable` | One-line filter change. |
| 10 | **B-4** — validate and round the duration input | Self-contained. |
| 11 | **B-10** — add `management.onDisabled` / `onUninstalled` listeners | Uses the `withTimers` helper from S-2, so it follows it. |

**Verify:** with two timers armed, cancel one from the popup at the moment the other expires, and confirm both storage and badge end consistent. Confirm a policy-locked extension no longer appears in the dropdown.

---

### Stage 4 — Polish

| # | Finding |
|---|---------|
| 12 | **B-5** — hours in `formatTime` |
| 13 | **B-9** — respond to unknown message actions |

---

### Stage 5 — Publication

| # | Finding |
|---|---------|
| 14 | **R-1** — publish privacy policy, add URL to the dashboard, write permission justifications |
| 15 | **R-2** — generic install path in README |
| 16 | **R-3** — add LICENSE |

R-1 gates the store submission and should start early in parallel — hosting and dashboard review are not code work and have their own latency. The claims it makes are only accurate once Stage 2 ships, so publish it after Stage 2 lands.
