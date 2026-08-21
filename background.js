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

    // 2. Set Chrome alarm
    const alarmName = `${ALARM_PREFIX}${extensionId}`;
    await chrome.alarms.create(alarmName, {
      delayInMinutes: durationMinutes
    });

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

// Ensure badge on startup/install
chrome.runtime.onStartup.addListener(updateBadge);
chrome.runtime.onInstalled.addListener(updateBadge);
