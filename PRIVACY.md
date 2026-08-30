# Privacy Policy — Extension Manager (Auto-Disable & Timer)

**Last updated:** 2026-08-30

> **Before publishing:** host this page at a stable public URL, and enter that
> URL in the Chrome Web Store Developer Dashboard under **Privacy practices →
> Privacy policy URL**. The `management` permission is classified as sensitive,
> so review will not pass without it.

---

## Summary

This extension collects nothing, transmits nothing, and contacts no server. All
data it uses stays in your browser profile on your own device.

There is no analytics, no telemetry, no crash reporting, no advertising
identifier, and no third-party service of any kind. The extension makes no
network requests.

## What is stored

One value, under the key `activeTimers`, in `chrome.storage.local`:

| Field | Purpose |
|-------|---------|
| Extension ID and name | Identify which extension a timer belongs to, and label it in the popup and the completion notification |
| Icon URL | Display the extension's icon in the timer card. Restricted to Chrome's internal `chrome://extension-icon/` scheme, so rendering it never causes an outbound request |
| Duration, start time, expiry time | Drive the countdown, the progress bar, and the scheduled auto-disable |

`chrome.storage.local` is local to the device and is not part of Chrome Sync.
The record is deleted as soon as its timer finishes, is cancelled, or its target
extension is disabled or uninstalled.

Nothing else is stored. The extension does not read page content, browsing
history, cookies, form data, credentials, or any personal information.

## What is read but never stored

To populate its list, the extension calls `chrome.management.getAll()`, which
returns the name, ID, icon, and enabled state of your installed extensions. This
is held in the popup's memory only while the popup is open, and is discarded
when it closes. It is never written to disk and never leaves the device.

## Permissions

| Permission | Why it is needed |
|------------|------------------|
| `management` | The core function. Required to list your installed extensions and to enable or disable them. It is used only for extensions you explicitly select. |
| `alarms` | Wakes the extension when a timer expires so the auto-disable actually fires, including after the browser restarts. |
| `storage` | Saves active timers locally so they survive closing the popup or restarting the browser. |
| `notifications` | Shows a single notification telling you which extension was automatically disabled. |

The extension requests no host permissions, so it has no access to any website.

## Data sharing

None. No data is sold, shared, transferred, or disclosed to anyone, for any
purpose. There is no recipient, because no data leaves the device.

## Your control

Removing a timer deletes its record immediately. Uninstalling the extension
removes all stored data, as Chrome clears extension storage on uninstall.

## Changes

Material changes to this policy will be reflected in the "Last updated" date
above and in the extension's Web Store listing.

## Contact

support@webdevnc.com

---

# Appendix — Chrome Web Store dashboard fields

The dashboard requires a separate written justification per permission. Copy
these into **Privacy practices → Permission justification**.

**Single purpose description**

> Manage installed Chrome extensions, with the ability to enable one temporarily
> on a countdown timer that automatically disables it again when the time is up.

**`management`**

> Required for the extension's only purpose. It is used to list the user's
> installed extensions, and to enable or disable a specific extension that the
> user has explicitly selected in the popup, or that a timer the user set has
> just expired on. It is not used to inspect or modify any other extension.

**`alarms`**

> Schedules the auto-disable. When the user starts a timer, an alarm is set for
> its expiry time so the service worker wakes and disables the selected
> extension, including if the browser was restarted in the meantime.

**`storage`**

> Stores active timers locally via chrome.storage.local, so a running countdown
> survives the popup being closed and the browser being restarted. Only timer
> metadata is stored: extension ID, name, icon URL, duration, and expiry.

**`notifications`**

> Displays one notification when a timer expires, naming the extension that was
> automatically disabled, so the change is not silent.

**Remote code**

> No. All code is contained in the extension package. No code is fetched or
> executed from a remote source.

**Data usage disclosures**

> No data collected. Check no categories. The extension makes no network
> requests and transmits no data off the device.
