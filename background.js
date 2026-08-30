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

/**
 * Serialize every mutation of `activeTimers`.
 *
 * The alarm handler, startTimer and cancelTimer all did read -> mutate -> write
 * while holding a snapshot across an await, so whichever wrote last silently
 * discarded the other's change: a timer started while an alarm was firing
 * vanished from storage but kept its alarm, and a cancel racing a stale write
 * came back as a phantom entry inflating the badge.
 *
 * All callers share one service worker, so a single promise chain is enough.
 * The mutator receives the freshly read object and mutates it in place.
 */
let timerQueue = Promise.resolve();

function withTimers(mutator) {
  const next = timerQueue.then(async () => {
    const { activeTimers = {} } = await chrome.storage.local.get('activeTimers');
    const result = await mutator(activeTimers);
    await chrome.storage.local.set({ activeTimers });
    await updateBadge();
    return result;
  });
  // Keep the chain alive even if one mutation throws.
  timerQueue = next.catch(() => {});
  return next;
}

// Alarm Listener
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;

  // slice, not replace: replace() swaps the first occurrence anywhere in the
  // string rather than anchoring to the prefix.
  const extensionId = alarm.name.slice(ALARM_PREFIX.length);

  // Read the name before the long await below, so the notification still has it
  // if another handler clears the entry meanwhile.
  const { activeTimers = {} } = await chrome.storage.local.get('activeTimers');
  const extName = activeTimers[extensionId]?.name || 'Extension';

  try {
    // Disable the extension
    await chrome.management.setEnabled(extensionId, false);

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
    // Remove from storage, against a fresh read rather than the stale snapshot.
    await withTimers(timers => { delete timers[extensionId]; });
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
  } else {
    // Without this the channel closes and the caller resolves to undefined,
    // which reads as a failed operation with no error reported anywhere.
    sendResponse({ success: false, error: `Unknown action: ${message?.action}` });
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
    const timer = {
      id: extensionId,
      name,
      iconUrl,
      durationMinutes,
      startedAt: now,
      expiresAt
    };
    await withTimers(timers => { timers[extensionId] = timer; });

    return { success: true, timer };
  } catch (err) {
    console.error('Error starting timer:', err);
    return { success: false, error: err.message };
  }
}

// Clear an extension's alarm and its stored timer.
async function dropTimer(extensionId) {
  await chrome.alarms.clear(`${ALARM_PREFIX}${extensionId}`);
  await withTimers(timers => { delete timers[extensionId]; });
}

// Cancel an active timer
async function handleCancelTimer({ extensionId, disableNow = false }) {
  try {
    await dropTimer(extensionId);

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
function reconcileTimers() {
  return withTimers(async (activeTimers) => {
    const now = Date.now();

    for (const [id, timer] of Object.entries(activeTimers)) {
      if (!timer || typeof timer.expiresAt !== 'number') {
        // Malformed record — drop it rather than leaving an unreachable entry.
        delete activeTimers[id];
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
      } else if (!(await chrome.alarms.get(`${ALARM_PREFIX}${id}`))) {
        // Still live, but the alarm was wiped by an update/reload. Restore it.
        await chrome.alarms.create(`${ALARM_PREFIX}${id}`, { when: timer.expiresAt });
      }
    }
  });
}

// Restore timer state and badge on startup/install
chrome.runtime.onStartup.addListener(reconcileTimers);
chrome.runtime.onInstalled.addListener(reconcileTimers);

// A timer only makes sense while its target is installed and enabled. Without
// these, disabling an extension from chrome://extensions left the timer running:
// the badge kept counting it, the popup showed a countdown for something already
// off, and the alarm later fired a misleading "was automatically disabled"
// notification for an action the user took themselves.
chrome.management.onDisabled.addListener(info => dropTimer(info.id));
chrome.management.onUninstalled.addListener(id => dropTimer(id));
