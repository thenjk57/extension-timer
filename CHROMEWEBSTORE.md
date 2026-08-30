# Chrome Web Store Listing Preparation & Management Guide

This document contains all the metadata, visual asset requirements, API publishing guides, and privacy compliance details required for publishing **Extension Manager — Auto-Disable & Timer** on the Chrome Web Store.

---

## 1. Store Metadata & Copy

### 🏷️ Basic Info
* **Extension Title:** `Extension Manager — Auto-Disable & Timer`
* **Short Name:** `Extension Timer`
* **Current Version:** `0.1.5` (Bump to `1.0.0` for initial Web Store release)
* **Primary Category:** Productivity
* **Language:** English

---

### 📝 Short Summary (Max 132 Characters)
> `Manage Chrome extensions with smart auto-disable timers to free up memory, save battery, and speed up your browser.` (113 chars)

---

### 📄 Detailed Description (Formatted for Web Store)

```markdown
⚡ The Smart Chrome Extension Manager that Automatically Turns Extensions Off

Tired of extensions slowing down your browser, eating RAM, and draining your laptop battery? 
Extension Manager gives you complete control over your installed extensions with one-click toggling, list/grid views, and smart Auto-Off Timers.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ WHY YOU NEED AN AUTO-OFF TIMER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Most extensions are only needed for a few minutes:
• VPNs & Proxies for quick tasks
• Developer & Inspector utilities
• Price trackers & Coupon finders
• Web scrapers & Screenshot tools

Instead of leaving them running in background processes all day, Extension Manager automatically disables them after 5, 15, 30, or 60 minutes.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ KEY FEATURES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✔ One-Click Toggle: Enable or disable any extension instantly.
✔ Auto-Disable Timers: Set a countdown (5m, 15m, 30m, 1h) to auto-turn off extensions.
✔ Dual View Modes: Seamlessly switch between compact List and 2-Column Grid view.
✔ Instant Search: Find and toggle any extension in milliseconds.
✔ Active Countdown Bar: Real-time progress tracker with one-click early cancellation.
✔ Clean, Dark UI: Minimalist, fast, and native-feeling interface.
✔ 100% Private & Secure: No tracking, no external API calls, zero telemetry.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 PERMISSIONS & PRIVACY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• management: Required to inspect, enable, disable, and manage your installed extensions.
• alarms: Wakes up the background worker when your timer expires to turn off the extension.
• storage: Saves your active timers and view preferences locally on your device.
• notifications: Sends a desktop alert when an extension is automatically disabled.

Take back control of your browser memory and keep Chrome blazing fast today!
```

---

## 2. Privacy Policy & Single Purpose Justification

Google Chrome Web Store requires explicit single-purpose declarations and permission justifications during review.

### Single Purpose Description
> `This extension allows users to manage and toggle their installed Chrome extensions with optional auto-disable timers to optimize browser memory and system performance.`

### Permission Justifications
| Permission | Exact Justification for Google Reviewer |
| :--- | :--- |
| **`management`** | Needed to query installed extensions, read their status/options pages, and toggle/enable/disable them according to user action or timer expiration. |
| **`alarms`** | Used to schedule background alarms that trigger the automatic disabling of an extension after the user-selected duration (5m, 15m, 30m, 1h). |
| **`storage`** | Used to store active timer expiry timestamps and view mode preferences (`list` vs `grid`) locally. |
| **`notifications`** | Used to notify the user when an active timer has finished and an extension was automatically turned off. |

---

## 3. Required Store Graphics & Assets

To publish, you must upload the following visual assets in the Chrome Developer Dashboard:

| Asset | Dimensions | Requirements |
| :--- | :--- | :--- |
| **Store Icon** | `128 x 128 px` | PNG format with transparent or solid background. |
| **Screenshots** | `1280 x 800 px` (or `640 x 400 px`) | At least 1 screenshot showing: (1) Main list view with toggle, (2) Grid view, (3) Active timer countdown bar. |
| **Small Promo Tile (Optional)** | `440 x 280 px` | Shown in Chrome Web Store search results. |
| **Marquee Promo Tile (Optional)** | `1400 x 560 px` | Used if featured on the Web Store home page. |

---

## 4. API Publishing via Chrome Web Store API

Google provides the **Chrome Web Store API** for automated programmatic deployment (CI/CD / CLI).

### 4.1 Prerequisites
1. Pay the one-time $5 developer registration fee at [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devpanel).
2. Go to the [Google Cloud Console](https://console.cloud.google.com/).
3. Create a project and enable the **Chrome Web Store API**.
4. Create **OAuth 2.0 Client Credentials** (Desktop App) and obtain:
   * `CLIENT_ID`
   * `CLIENT_SECRET`
   * `REFRESH_TOKEN`

### 4.2 Automated Upload & Publish via `chrome-webstore-upload` CLI
Once you have created the initial item in the dashboard, automated CI/CD can package and publish every release automatically:

```bash
# 1. Package the extension into a zip
zip -r extension.zip . -x "*.git*" "popup_test_verified.png"

# 2. Upload and publish using the API
npx chrome-webstore-upload-cli upload \
  --source extension.zip \
  --extension-id YOUR_ITEM_ID \
  --client-id $CLIENT_ID \
  --client-secret $CLIENT_SECRET \
  --refresh-token $REFRESH_TOKEN \
  --auto-publish
```
