/**
 * Popup Script
 * Handles UI interactions, extension list fetching, manager toggles, search, timer triggers, and live countdowns.
 */

let installedExtensions = [];
let countdownInterval = null;
// Extension IDs whose expiry the ticker has already reacted to.
const expiryHandled = new Set();

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadInstalledExtensions();
  await refreshActiveTimers();
  startCountdownTicker();
});

// Setup DOM event listeners
function setupEventListeners() {
  // Preset buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('custom-minutes').value = btn.dataset.minutes;
    });
  });

  // Custom minutes input change
  document.getElementById('custom-minutes').addEventListener('input', (e) => {
    const val = e.target.value;
    document.querySelectorAll('.preset-btn').forEach(b => {
      if (b.dataset.minutes === val) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });
  });

  // Start button
  document.getElementById('start-btn').addEventListener('click', handleStart);

  // Search filter
  document.getElementById('ext-search').addEventListener('input', (e) => {
    renderManagerList(e.target.value.toLowerCase());
  });
}

// Fetch all installed extensions
async function loadInstalledExtensions() {
  const select = document.getElementById('extension-select');
  try {
    const all = await chrome.management.getAll();
    // Filter out our own extension and themes
    // mayDisable is false for policy-forced and Chrome component extensions.
    // Offering them as timer targets only produces a raw Chrome exception on
    // click and inflates the installed count with things we cannot manage.
    installedExtensions = all
      .filter(ext => ext.type === 'extension' && ext.id !== chrome.runtime.id && ext.mayDisable)
      .sort((a, b) => a.name.localeCompare(b.name));

    document.getElementById('total-ext-count').textContent = installedExtensions.length;

    // Populate dropdown
    select.innerHTML = '';
    if (installedExtensions.length === 0) {
      const opt = document.createElement('option');
      opt.text = 'No other extensions found';
      opt.disabled = true;
      select.appendChild(opt);
      document.getElementById('start-btn').disabled = true;
      return;
    }

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.text = '-- Select an extension --';
    defaultOpt.disabled = true;
    defaultOpt.selected = true;
    select.appendChild(defaultOpt);

    installedExtensions.forEach(ext => {
      const opt = document.createElement('option');
      opt.value = ext.id;
      const status = ext.enabled ? '🟢 Enabled' : '⚪ Disabled';
      opt.text = `${ext.name} (${status})`;
      select.appendChild(opt);
    });

    // Populate the full manager list
    renderManagerList();
  } catch (err) {
    console.error('Error fetching extensions:', err);
    select.innerHTML = '<option disabled>Failed to load extensions</option>';
  }
}

// Render Manager List with toggles
function renderManagerList(filterText = '') {
  const listContainer = document.getElementById('all-extensions-list');
  listContainer.innerHTML = '';

  const filtered = installedExtensions.filter(ext => 
    ext.name.toLowerCase().includes(filterText)
  );

  if (filtered.length === 0) {
    listContainer.innerHTML = '<div style="font-size: 11px; color: var(--text-secondary); text-align: center; padding: 10px;">No matching extensions</div>';
    return;
  }

  filtered.forEach(ext => {
    const item = document.createElement('div');
    item.className = 'manager-item';

    const left = document.createElement('div');
    left.className = 'manager-item-left';

    const icon = buildIcon('manager-item-icon', ext.icons?.[0]?.url);

    const name = document.createElement('span');
    name.className = 'manager-item-name';
    name.textContent = ext.name;
    name.title = ext.name;

    left.append(icon, name);

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
    listContainer.appendChild(item);
  });

  // Attach instant toggle event listeners
  listContainer.querySelectorAll('.toggle-ext-checkbox').forEach(chk => {
    chk.addEventListener('change', async (e) => {
      const extId = e.target.dataset.id;
      const enable = e.target.checked;
      try {
        await chrome.management.setEnabled(extId, enable);
        // No cancelTimer message needed: the background's management.onDisabled
        // listener drops the timer, however the extension was disabled. Sending
        // one here also meant a failed message reverted a toggle that had
        // already succeeded.
        await loadInstalledExtensions();
        await refreshActiveTimers();
      } catch (err) {
        console.error('Toggle failed:', err);
        e.target.checked = !enable; // revert
      }
    });
  });
}

// Trigger start timer
async function handleStart() {
  const select = document.getElementById('extension-select');
  const extId = select.value;
  const minutesInput = document.getElementById('custom-minutes');
  const raw = parseFloat(minutesInput.value);
  // The min/max attributes on the input are decorative -- it is not inside a
  // form and nothing calls checkValidity() -- so enforce the same bounds here.
  // Round too: Chrome clamps sub-minute alarm delays, so a fractional value
  // produced a countdown that disagreed with when the extension actually shut
  // off.
  const minutes = Math.round(raw);

  if (!extId) {
    showStatus('Please select an extension.', 'error');
    return;
  }

  if (!Number.isFinite(raw) || minutes < 1 || minutes > 1440) {
    showStatus('Enter a duration between 1 and 1440 minutes.', 'error');
    return;
  }

  const ext = installedExtensions.find(e => e.id === extId);
  // Sanitize before it reaches storage, so a hostile URL is never persisted.
  const iconUrl = safeIconUrl(ext?.icons?.[ext.icons.length - 1]?.url);

  showStatus('Starting timer...', '');

  let response;
  try {
    response = await chrome.runtime.sendMessage({
      action: 'startTimer',
      data: {
        extensionId: extId,
        name: ext?.name || 'Extension',
        durationMinutes: minutes,
        iconUrl
      }
    });
  } catch (err) {
    // sendMessage rejects (it does not resolve falsy) when the service worker
    // is evicted or still starting, which is routine under MV3. Unhandled, the
    // status stayed frozen on "Starting timer..." with no signal to the user.
    console.error('startTimer message failed:', err);
    showStatus('Background service unavailable — try again.', 'error');
    return;
  }

  if (response && response.success) {
    showStatus(`Auto-off timer set for ${minutes} min(s)!`, 'success');
    await loadInstalledExtensions();
    await refreshActiveTimers();
  } else {
    showStatus(`Failed: ${response?.error || 'Unknown error'}`, 'error');
  }
}

// Refresh active timers from storage
async function refreshActiveTimers() {
  const { activeTimers = {} } = await chrome.storage.local.get('activeTimers');
  const keys = Object.keys(activeTimers);
  const container = document.getElementById('active-timers-list');
  const section = document.getElementById('active-timers-section');
  const countBadge = document.getElementById('active-count');

  if (keys.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'flex';
  countBadge.textContent = keys.length;
  container.innerHTML = '';

  const now = Date.now();

  keys.forEach(id => {
    const timer = activeTimers[id];
    const totalMs = timer.durationMinutes * 60 * 1000;
    const remainingMs = Math.max(0, timer.expiresAt - now);
    const progressPercent = Math.min(100, Math.max(0, (remainingMs / totalMs) * 100));

    const card = document.createElement('div');
    card.className = 'timer-card';
    card.id = `timer-${id}`;

    const header = document.createElement('div');
    header.className = 'timer-card-header';

    const info = document.createElement('div');
    info.className = 'timer-ext-info';

    const icon = buildIcon('timer-ext-icon', timer.iconUrl);

    const name = document.createElement('span');
    name.className = 'timer-ext-name';
    name.textContent = timer.name;
    name.title = timer.name;

    info.append(icon, name);

    const countdown = document.createElement('div');
    countdown.className = 'timer-countdown';
    countdown.id = `cd-${id}`;
    countdown.textContent = formatTime(remainingMs);

    header.append(info, countdown);

    const track = document.createElement('div');
    track.className = 'timer-progress-track';

    const fill = document.createElement('div');
    fill.className = 'timer-progress-fill';
    fill.id = `fill-${id}`;
    fill.style.width = `${progressPercent}%`;

    track.appendChild(fill);

    const actions = document.createElement('div');
    actions.className = 'timer-actions';

    const keepBtn = document.createElement('button');
    keepBtn.className = 'btn-sm btn-cancel';
    keepBtn.dataset.id = id;
    keepBtn.dataset.action = 'keep';
    keepBtn.textContent = 'Keep Enabled';

    const stopBtn = document.createElement('button');
    stopBtn.className = 'btn-sm btn-stop-now';
    stopBtn.dataset.id = id;
    stopBtn.dataset.action = 'stop';
    stopBtn.textContent = 'Turn Off Now';

    actions.append(keepBtn, stopBtn);
    card.append(header, track, actions);

    container.appendChild(card);
  });

  // Attach button listeners
  container.querySelectorAll('.btn-cancel').forEach(b => {
    b.addEventListener('click', () => cancelTimer(b.dataset.id, false));
  });
  container.querySelectorAll('.btn-stop-now').forEach(b => {
    b.addEventListener('click', () => cancelTimer(b.dataset.id, true));
  });
}

// Cancel / stop timer
async function cancelTimer(extensionId, disableNow) {
  try {
    await chrome.runtime.sendMessage({
      action: 'cancelTimer',
      data: { extensionId, disableNow }
    });
  } catch (err) {
    console.error('cancelTimer message failed:', err);
    showStatus('Background service unavailable — try again.', 'error');
    return;
  }
  await loadInstalledExtensions();
  await refreshActiveTimers();
}

// Countdown timer loop for live ticking
function startCountdownTicker() {
  if (countdownInterval) clearInterval(countdownInterval);

  countdownInterval = setInterval(async () => {
    const { activeTimers = {} } = await chrome.storage.local.get('activeTimers');
    const now = Date.now();
    let hasExpired = false;

    // Forget IDs the background has since cleared, so a re-armed timer on the
    // same extension can latch again.
    for (const id of expiryHandled) {
      if (!activeTimers[id]) expiryHandled.delete(id);
    }

    Object.keys(activeTimers).forEach(id => {
      const timer = activeTimers[id];
      const remainingMs = timer.expiresAt - now;

      if (remainingMs <= 0) {
        // Refresh once per expiry. Without this latch, a timer the background
        // fails to clear re-renders the whole popup every second, forever.
        if (!expiryHandled.has(id)) {
          expiryHandled.add(id);
          hasExpired = true;
        }
      } else {
        const cdElem = document.getElementById(`cd-${id}`);
        const fillElem = document.getElementById(`fill-${id}`);
        if (cdElem) cdElem.textContent = formatTime(remainingMs);
        if (fillElem) {
          const totalMs = timer.durationMinutes * 60 * 1000;
          const percent = Math.min(100, Math.max(0, (remainingMs / totalMs) * 100));
          fillElem.style.width = `${percent}%`;
        }
      }
    });

    if (hasExpired) {
      await refreshActiveTimers();
      await loadInstalledExtensions();
    }
  }, 1000);
}

// Helpers

const DEFAULT_ICON = 'icons/icon48.png';

/**
 * Extension names and icon URLs come from other installed extensions via
 * chrome.management, so they are attacker-controlled: any extension picks its
 * own manifest `name`. Names are therefore only ever assigned through
 * textContent / .title, never parsed as markup.
 *
 * Icon URLs are additionally restricted by scheme. Chrome hands back
 * chrome://extension-icon/ URLs; anything else would let a crafted manifest
 * point <img src> at a remote host, turning every popup open into an outbound
 * request that leaks usage timing.
 */
function safeIconUrl(url) {
  return (typeof url === 'string' && url.startsWith('chrome://extension-icon/'))
    ? url
    : DEFAULT_ICON;
}

// Build an <img> with a working error fallback. An inline onerror= attribute
// is silently blocked by the extension CSP, so the handler is attached here.
function buildIcon(className, url) {
  const img = document.createElement('img');
  img.className = className;
  img.alt = '';
  img.addEventListener('error', () => {
    if (!img.src.endsWith(DEFAULT_ICON)) img.src = DEFAULT_ICON;
  });
  img.src = safeIconUrl(url);
  return img;
}

// Minutes roll into hours past 60. Without this the shipped 1h preset read
// "60:00" and the 1440 maximum read "1440:00", which a two-digit MM:SS field
// gives no way to parse.
function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  const mm = String(min).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return hrs > 0 ? `${hrs}:${mm}:${ss}` : `${mm}:${ss}`;
}

function showStatus(text, type) {
  const el = document.getElementById('status-msg');
  el.textContent = text;
  el.className = `status-msg ${type}`;
  if (type === 'success') {
    setTimeout(() => {
      if (el.textContent === text) el.textContent = '';
    }, 3000);
  }
}
