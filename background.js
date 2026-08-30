/**
 * Background Service Worker
 * Handles alarm triggers, automatic disabling of extensions, notifications, and timer state management.
 */

const ALARM_PREFIX = 'ext_timer_';

// Synchronize badge and state
async function updateBadge() {
  const { activeTimers = {} } = await chrome.storage.local.get('activeTimers');
  const count = Object.keys(activeTimers).length;
  if (count > 0) {
    chrome.action.setBadgeText({ text: `${count}` });
    chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Alarm Listener
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith(ALARM_PREFIX)) {
    const extensionId = alarm.name.replace(ALARM_PREFIX, '');
    const { activeTimers = {} } = await chrome.storage.local.get('activeTimers');
    const timerData = activeTimers[extensionId];

    try {
      // Disable the extension
      await chrome.management.setEnabled(extensionId, false);
      const extName = timerData?.name || 'Extension';

      // Send notification
      chrome.notifications.create(`notif_${extensionId}_${Date.now()}`, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: '⏳ Extension Timer Finished',
        message: `"${extName}" was automatically disabled.`,
        priority: 2
      });
    } catch (err) {
      console.error(`Failed to disable extension ${extensionId}:`, err);
    } finally {
      // Remove from storage
      delete activeTimers[extensionId];
      await chrome.storage.local.set({ activeTimers });
      await updateBadge();
    }
  }
});

// Listen for messages from popup or other contexts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startTimer') {
    handleStartTimer(message.data).then(sendResponse);
    return true; // async response
  } else if (message.action === 'cancelTimer') {
    handleCancelTimer(message.data).then(sendResponse);
    return true; // async response
  } else if (message.action === 'getActiveTimers') {
    chrome.storage.local.get('activeTimers').then(res => sendResponse(res.activeTimers || {}));
    return true;
  }
});

// Start a timer for an extension
async function handleStartTimer({ extensionId, name, durationMinutes, iconUrl }) {
  try {
    // 1. Enable extension if disabled
    await chrome.management.setEnabled(extensionId, true);

    const now = Date.now();
    const durationMs = durationMinutes * 60 * 1000;
    const expiresAt = now + durationMs;

    // 2. Set Chrome alarm.
    // Use an absolute `when` rather than a relative delay so the alarm and the
    // stored record share one clock, and so the alarm can be recreated verbatim
    // if Chrome wipes it on update/reload (see reconcileTimers).
    const alarmName = `${ALARM_PREFIX}${extensionId}`;
    await chrome.alarms.create(alarmName, { when: expiresAt });

    // 3. Save to activeTimers storage
    const { activeTimers = {} } = await chrome.storage.local.get('activeTimers');
    activeTimers[extensionId] = {
      id: extensionId,
      name,
      iconUrl,
      durationMinutes,
      startedAt: now,
      expiresAt
    };
    await chrome.storage.local.set({ activeTimers });
    await updateBadge();

    return { success: true, timer: activeTimers[extensionId] };
  } catch (err) {
    console.error('Error starting timer:', err);
    return { success: false, error: err.message };
  }
}

// Cancel an active timer
async function handleCancelTimer({ extensionId, disableNow = false }) {
  try {
    const alarmName = `${ALARM_PREFIX}${extensionId}`;
    await chrome.alarms.clear(alarmName);

    const { activeTimers = {} } = await chrome.storage.local.get('activeTimers');
    delete activeTimers[extensionId];
    await chrome.storage.local.set({ activeTimers });
    await updateBadge();

    if (disableNow) {
      await chrome.management.setEnabled(extensionId, false);
    }

    return { success: true };
  } catch (err) {
    console.error('Error canceling timer:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Reconcile stored timers against Chrome's alarm registry.
 *
 * Chrome clears an extension's alarms on update/reload, but chrome.storage
 * survives. Without this, every auto-update leaves timers that count down in the
 * UI, keep the badge lit, and never actually disable anything.
 *
 * Overdue timers are honored immediately; live ones get their alarm restored.
 */
async function reconcileTimers() {
  const { activeTimers = {} } = await chrome.storage.local.get('activeTimers');
  const now = Date.now();
  let dirty = false;

  for (const [id, timer] of Object.entries(activeTimers)) {
    if (!timer || typeof timer.expiresAt !== 'number') {
      // Malformed record — drop it rather than leaving an unreachable entry.
      delete activeTimers[id];
      dirty = true;
      continue;
    }

    if (timer.expiresAt <= now) {
      // Expired while we were not running.
      await chrome.alarms.clear(`${ALARM_PREFIX}${id}`);
      try {
        await chrome.management.setEnabled(id, false);
      } catch (err) {
        console.error(`Failed to disable overdue extension ${id}:`, err);
      }
      delete activeTimers[id];
      dirty = true;
    } else if (!(await chrome.alarms.get(`${ALARM_PREFIX}${id}`))) {
      // Still live, but the alarm was wiped by an update/reload. Restore it.
      await chrome.alarms.create(`${ALARM_PREFIX}${id}`, { when: timer.expiresAt });
    }
  }

  if (dirty) await chrome.storage.local.set({ activeTimers });
  await updateBadge();
}

// Restore timer state and badge on startup/install
chrome.runtime.onStartup.addListener(reconcileTimers);
chrome.runtime.onInstalled.addListener(reconcileTimers);
