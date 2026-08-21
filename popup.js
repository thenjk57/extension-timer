/**
 * Popup Script
 * Handles UI interactions, extension list fetching, manager toggles, search, timer triggers, and live countdowns.
 */

let installedExtensions = [];
let countdownInterval = null;

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
    installedExtensions = all
      .filter(ext => ext.type === 'extension' && ext.id !== chrome.runtime.id)
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
    const iconUrl = (ext.icons && ext.icons.length > 0) ? ext.icons[0].url : 'icons/icon48.png';
    const item = document.createElement('div');
    const hasOptions = Boolean(ext.optionsUrl);
    const tooltipText = hasOptions ? `${ext.name} (Click to open Options)` : `${ext.name} (Click to view Details)`;

    item.className = 'manager-item clickable';
    item.innerHTML = `
      <div class="manager-item-left" title="${tooltipText}">
        <img src="${iconUrl}" class="manager-item-icon" alt="" onerror="this.src='icons/icon48.png'">
        <span class="manager-item-name">${ext.name}</span>
        ${hasOptions 
          ? '<span class="options-icon" title="Open Options">⚙️</span>' 
          : '<span class="details-icon" title="Open Details">↗</span>'}
      </div>
      <label class="switch">
        <input type="checkbox" class="toggle-ext-checkbox" data-id="${ext.id}" ${ext.enabled ? 'checked' : ''}>
        <span class="slider"></span>
      </label>
    `;
    listContainer.appendChild(item);
  });

  // Attach click listener with smart fallback
  listContainer.querySelectorAll('.manager-item-left').forEach(el => {
    el.addEventListener('click', (e) => {
      const checkbox = el.closest('.manager-item').querySelector('.toggle-ext-checkbox');
      const extId = checkbox.dataset.id;
      const ext = installedExtensions.find(item => item.id === extId);
      
      if (ext && ext.optionsUrl) {
        // Tier 1: Open extension's dedicated options page
        chrome.tabs.create({ url: ext.optionsUrl });
      } else {
        // Tier 2: Fallback to chrome://extensions/?id=<extId> details page
        chrome.tabs.create({ url: `chrome://extensions/?id=${extId}` });
      }
    });
  });

  // Attach instant toggle event listeners
  listContainer.querySelectorAll('.toggle-ext-checkbox').forEach(chk => {
    chk.addEventListener('change', async (e) => {
      const extId = e.target.dataset.id;
      const enable = e.target.checked;
      try {
        await chrome.management.setEnabled(extId, enable);
        // If disabled manually, cancel any active timer on it
        if (!enable) {
          await chrome.runtime.sendMessage({
            action: 'cancelTimer',
            data: { extensionId: extId, disableNow: false }
          });
        }
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
  const minutes = parseFloat(minutesInput.value);

  if (!extId) {
    showStatus('Please select an extension.', 'error');
    return;
  }

  if (isNaN(minutes) || minutes <= 0) {
    showStatus('Please enter a valid time (> 0 mins).', 'error');
    return;
  }

  const ext = installedExtensions.find(e => e.id === extId);
  const iconUrl = (ext?.icons && ext.icons.length > 0) ? ext.icons[ext.icons.length - 1].url : 'icons/icon48.png';

  showStatus('Starting timer...', '');

  const response = await chrome.runtime.sendMessage({
    action: 'startTimer',
    data: {
      extensionId: extId,
      name: ext?.name || 'Extension',
      durationMinutes: minutes,
      iconUrl
    }
  });

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
    card.innerHTML = `
      <div class="timer-card-header">
        <div class="timer-ext-info">
          <img src="${timer.iconUrl}" class="timer-ext-icon" alt="" onerror="this.src='icons/icon48.png'">
          <span class="timer-ext-name" title="${timer.name}">${timer.name}</span>
        </div>
        <div class="timer-countdown" id="cd-${id}">${formatTime(remainingMs)}</div>
      </div>
      <div class="timer-progress-track">
        <div class="timer-progress-fill" id="fill-${id}" style="width: ${progressPercent}%;"></div>
      </div>
      <div class="timer-actions">
        <button class="btn-sm btn-cancel" data-id="${id}" data-action="keep">Keep Enabled</button>
        <button class="btn-sm btn-stop-now" data-id="${id}" data-action="stop">Turn Off Now</button>
      </div>
    `;

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
  await chrome.runtime.sendMessage({
    action: 'cancelTimer',
    data: { extensionId, disableNow }
  });
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

    Object.keys(activeTimers).forEach(id => {
      const timer = activeTimers[id];
      const remainingMs = timer.expiresAt - now;

      if (remainingMs <= 0) {
        hasExpired = true;
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
function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
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
