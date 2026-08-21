# Extension Manager — Auto-Disable & Timer

> A fast, modern Chrome Extension Manager that solves memory bloat by letting you enable extensions on temporary auto-off timers.

![Extension Manager Banner](icons/icon128.png)

## ⚡ The Problem
Users install dozens of extensions (VPNs, developer tools, scrapers, coupon finders) that continuously run in background processes, hogging RAM, battery, and CPU. Existing extension managers let you toggle them, but you constantly forget to turn them back off.

## ✨ The Solution
**Extension Manager with Auto-Timer** gives you:
1. **Full Extension Management:** Search and toggle any installed extension on/off in 1 click.
2. **Auto-Disable Timers (USP):** Enable an extension temporarily for 5m, 15m, 30m, 1h, or custom duration. It turns off automatically when done.
3. **Live Progress Tracking:** Active countdowns and visual progress bars in the popup.
4. **RAM & CPU Optimizer:** Eliminates idle background extensions from draining browser resources.

---

## 🛠️ Installation (Developer Mode)

1. Clone or download this repository.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (top-right corner).
4. Click **Load unpacked** (top-left corner).
5. Select this folder: `/Volumes/Disk/Projects/Extension Timer`.
6. Pin the extension to your toolbar and start managing!

---

## 🔒 Privacy & Permissions
- **`management`**: Required by Chrome to view, enable, and disable installed extensions.
- **`alarms`**: Used to wake up the service worker when the auto-off timer expires.
- **`storage`**: Saves your active timers locally on your device.
- **`notifications`**: Alerts you when an extension has been automatically disabled.
- **100% Local**: No tracking, no external API requests, zero telemetry.
