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
    const hasOptions = Boolean(ext.optionsUrl);
    
    // Detect target websites from permissions/hostPermissions
    const hostPermissions = (ext.hostPermissions || []).concat(ext.permissions || []);
    let targetSiteUrl = '';
    let targetSiteName = '';

    for (const p of hostPermissions) {
      if (typeof p === 'string') {
        if (p.includes('youtube.com')) {
          targetSiteUrl = 'https://www.youtube.com';
          targetSiteName = 'YouTube';
          break;
        } else if (p.includes('netflix.com')) {
          targetSiteUrl = 'https://www.netflix.com';
          targetSiteName = 'Netflix';
          break;
        } else if (p.includes('google.com')) {
          targetSiteUrl = 'https://www.google.com';
          targetSiteName = 'Google';
          break;
        } else if (p.startsWith('http://') || p.startsWith('https://')) {
          try {
            const cleanHost = p.replace('*://', 'https://').replace('/*', '');
            targetSiteUrl = cleanHost;
            targetSiteName = new URL(cleanHost).hostname.replace('www.', '');
            break;
          } catch (e) {}
        }
      }
    }

    if (!targetSiteUrl && ext.homepageUrl && ext.homepageUrl.startsWith('http')) {
      targetSiteUrl = ext.homepageUrl;
      targetSiteName = 'Homepage';
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'manager-item-wrapper';
    wrapper.id = `wrapper-${ext.id}`;

    wrapper.innerHTML = `
      <div class="manager-item clickable" data-id="${ext.id}">
        <div class="manager-item-left" title="Click to view details & quick actions">
          <img src="${iconUrl}" class="manager-item-icon" alt="" onerror="this.src='icons/icon48.png'">
          <span class="manager-item-name">${ext.name}</span>
          <span class="expand-chevron" id="chevron-${ext.id}">▾</span>
        </div>
        <label class="switch">
          <input type="checkbox" class="toggle-ext-checkbox" data-id="${ext.id}" ${ext.enabled ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      </div>

      <!-- In-Popup Expandable Drawer -->
      <div class="manager-drawer" id="drawer-${ext.id}">
        <div class="drawer-content">
          <p class="drawer-desc">${ext.description || 'No description provided.'}</p>
          
          <div class="drawer-meta">
            <span class="meta-pill">v${ext.version}</span>
            ${ext.installType ? `<span class="meta-pill">${ext.installType}</span>` : ''}
          </div>

          <div class="drawer-actions">
            <!-- Quick Timer Presets -->
            <button class="drawer-btn btn-quick-timer" data-id="${ext.id}" data-min="15">
              ⏱️ 15m Timer
            </button>
            <button class="drawer-btn btn-quick-timer" data-id="${ext.id}" data-min="30">
              ⏱️ 30m Timer
            </button>

            <!-- Options Page if available -->
            ${hasOptions ? `
              <button class="drawer-btn btn-options" data-id="${ext.id}">
                ⚙️ Options
              </button>
            ` : ''}

            <!-- Launch Target Website if detected -->
            ${targetSiteUrl ? `
              <button class="drawer-btn btn-launch-site" data-url="${targetSiteUrl}">
                🌐 Open ${targetSiteName}
              </button>
            ` : ''}

            <!-- Web Store Link -->
            <button class="drawer-btn btn-store" data-id="${ext.id}">
              🛍️ Store Page
            </button>
          </div>
        </div>
      </div>
    `;
    listContainer.appendChild(wrapper);
  });

  // Attach drawer toggle on row click (excluding switch)
  listContainer.querySelectorAll('.manager-item-left').forEach(el => {
    el.addEventListener('click', () => {
      const parent = el.closest('.manager-item-wrapper');
      const extId = parent.id.replace('wrapper-', '');
      const drawer = document.getElementById(`drawer-${extId}`);
      const chevron = document.getElementById(`chevron-${extId}`);
      
      const isOpen = drawer.classList.contains('open');
      // Close all other open drawers
      listContainer.querySelectorAll('.manager-drawer').forEach(d => d.classList.remove('open'));
      listContainer.querySelectorAll('.expand-chevron').forEach(c => c.textContent = '▾');
      
      if (!isOpen) {
        drawer.classList.add('open');
        chevron.textContent = '▴';
        setTimeout(() => {
          parent.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
      }
    });
  });

  // Attach Drawer action button listeners
  listContainer.querySelectorAll('.btn-quick-timer').forEach(btn => {
    btn.addEventListener('click', async () => {
      const extId = btn.dataset.id;
      const min = parseFloat(btn.dataset.min);
      const ext = installedExtensions.find(e => e.id === extId);
      const iconUrl = (ext?.icons && ext.icons.length > 0) ? ext.icons[0].url : 'icons/icon48.png';

      showStatus(`Setting ${min}m timer...`, '');
      const res = await chrome.runtime.sendMessage({
        action: 'startTimer',
        data: {
          extensionId: extId,
          name: ext?.name || 'Extension',
          durationMinutes: min,
          iconUrl
        }
      });
      if (res && res.success) {
        showStatus(`Timer started for ${min}m!`, 'success');
        await loadInstalledExtensions();
        await refreshActiveTimers();
      }
    });
  });

  listContainer.querySelectorAll('.btn-options').forEach(btn => {
    btn.addEventListener('click', () => {
      const ext = installedExtensions.find(e => e.id === btn.dataset.id);
      if (ext?.optionsUrl) chrome.tabs.create({ url: ext.optionsUrl });
    });
  });

  listContainer.querySelectorAll('.btn-launch-site').forEach(btn => {
    btn.addEventListener('click', () => {
      chrome.tabs.create({ url: btn.dataset.url });
    });
  });

  listContainer.querySelectorAll('.btn-store').forEach(btn => {
    btn.addEventListener('click', () => {
      chrome.tabs.create({ url: `https://chromewebstore.google.com/detail/${btn.dataset.id}` });
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
