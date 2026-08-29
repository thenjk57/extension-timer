/**
 * Minimalist, Native Extension Manager Script
 */

let installedExtensions = [];
let countdownInterval = null;
let currentViewMode = 'list'; // 'list' | 'grid'

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await initViewMode();
  await loadInstalledExtensions();
  await refreshActiveTimers();
  startCountdownTicker();
});

// Setup event listeners
function setupEventListeners() {
  // Search filter
  document.getElementById('ext-search').addEventListener('input', (e) => {
    renderList(e.target.value.toLowerCase());
  });

  // View mode toggle
  document.getElementById('view-toggle-btn').addEventListener('click', toggleViewMode);
}

// Initialize saved view mode
async function initViewMode() {
  const { viewMode = 'list' } = await chrome.storage.local.get('viewMode');
  currentViewMode = viewMode;
  applyViewModeUI();
}

// Toggle and save view mode
async function toggleViewMode() {
  currentViewMode = currentViewMode === 'list' ? 'grid' : 'list';
  await chrome.storage.local.set({ viewMode: currentViewMode });
  applyViewModeUI();
}

function applyViewModeUI() {
  const container = document.getElementById('extensions-list');
  const btn = document.getElementById('view-toggle-btn');
  const iconList = btn.querySelector('.icon-list');
  const iconGrid = btn.querySelector('.icon-grid');

  if (currentViewMode === 'grid') {
    container.classList.add('grid-view');
    iconList.style.display = 'none';
    iconGrid.style.display = 'block';
    btn.title = 'Switch to List View';
  } else {
    container.classList.remove('grid-view');
    iconList.style.display = 'block';
    iconGrid.style.display = 'none';
    btn.title = 'Switch to Grid View';
  }
}

// Fetch installed extensions
async function loadInstalledExtensions() {
  try {
    const all = await chrome.management.getAll();
    installedExtensions = all
      .filter(ext => ext.type === 'extension' && ext.id !== chrome.runtime.id)
      .sort((a, b) => a.name.localeCompare(b.name));

    document.getElementById('total-count').textContent = installedExtensions.length;
    renderList();
  } catch (err) {
    console.error('Failed to load extensions:', err);
  }
}

// Render Extension List
function renderList(query = '') {
  const container = document.getElementById('extensions-list');
  container.innerHTML = '';

  const filtered = installedExtensions.filter(e => e.name.toLowerCase().includes(query));

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state">No extensions found</div>`;
    return;
  }

  filtered.forEach(ext => {
    const iconUrl = (ext.icons && ext.icons.length > 0) ? ext.icons[0].url : 'icons/icon48.png';
    const hasOptions = Boolean(ext.optionsUrl);
    const hasHomepage = Boolean(ext.homepageUrl && ext.homepageUrl.startsWith('http'));

    const row = document.createElement('div');
    row.className = 'ext-row';
    row.id = `row-${ext.id}`;

    row.innerHTML = `
      <div class="ext-main-bar" data-id="${ext.id}">
        <div class="ext-info">
          <img src="${iconUrl}" class="ext-icon" alt="" onerror="this.src='icons/icon48.png'">
          <div class="ext-name-group">
            <span class="ext-name" title="${ext.name}">${ext.name}</span>
            <span class="ext-status-label">${ext.enabled ? 'Enabled' : 'Disabled'}</span>
          </div>
        </div>

        <div class="ext-row-actions">
          <label class="switch" title="Toggle extension">
            <input type="checkbox" class="toggle-checkbox" data-id="${ext.id}" ${ext.enabled ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </div>
      </div>

      <!-- Expandable drawer with clean links -->
      <div class="ext-drawer" id="drawer-${ext.id}">
        <p class="ext-desc">${ext.description || 'No description provided.'}</p>
        
        <!-- Timer inline presets -->
        <div class="drawer-timer-presets">
          <span style="font-size: 11px; color: var(--text-muted); margin-right: 2px;">Set Timer:</span>
          <button class="timer-chip" data-id="${ext.id}" data-min="5">5m</button>
          <button class="timer-chip" data-id="${ext.id}" data-min="15">15m</button>
          <button class="timer-chip" data-id="${ext.id}" data-min="30">30m</button>
          <button class="timer-chip" data-id="${ext.id}" data-min="60">1h</button>
        </div>

        <!-- Links Row -->
        <div class="drawer-links-row">
          ${hasOptions ? `
            <button class="drawer-link btn-options" data-id="${ext.id}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              Options
            </button>
          ` : ''}

          ${hasHomepage ? `
            <button class="drawer-link btn-homepage" data-url="${ext.homepageUrl}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
              Homepage
            </button>
          ` : ''}

          <button class="drawer-link btn-store" data-id="${ext.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            Store Page
          </button>

          <button class="drawer-link btn-uninstall" data-id="${ext.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            Remove
          </button>
        </div>
      </div>
    `;

    container.appendChild(row);
  });

  // Toggle switch listeners
  container.querySelectorAll('.toggle-checkbox').forEach(chk => {
    chk.addEventListener('change', async (e) => {
      e.stopPropagation();
      const extId = e.target.dataset.id;
      const enable = e.target.checked;
      try {
        await chrome.management.setEnabled(extId, enable);
        if (!enable) {
          await chrome.runtime.sendMessage({ action: 'cancelTimer', data: { extensionId: extId, disableNow: false } });
        }
        await loadInstalledExtensions();
        await refreshActiveTimers();
      } catch (err) {
        console.error('Toggle error:', err);
        e.target.checked = !enable;
      }
    });
  });

  // Row expand on click
  container.querySelectorAll('.ext-main-bar').forEach(bar => {
    bar.addEventListener('click', (e) => {
      if (e.target.closest('.switch')) return;
      const row = bar.closest('.ext-row');
      const isOpen = row.classList.contains('is-open');
      
      container.querySelectorAll('.ext-row').forEach(r => r.classList.remove('is-open'));
      if (!isOpen) row.classList.add('is-open');
    });
  });

  // Drawer action listeners
  container.querySelectorAll('.timer-chip').forEach(btn => {
    btn.addEventListener('click', async () => {
      const extId = btn.dataset.id;
      const min = parseFloat(btn.dataset.min);
      const ext = installedExtensions.find(e => e.id === extId);
      const iconUrl = (ext?.icons && ext.icons.length > 0) ? ext.icons[0].url : 'icons/icon48.png';

      const res = await chrome.runtime.sendMessage({
        action: 'startTimer',
        data: { extensionId: extId, name: ext.name, durationMinutes: min, iconUrl }
      });

      if (res && res.success) {
        showToast(`Auto-off timer set for ${min}m`);
        await loadInstalledExtensions();
        await refreshActiveTimers();
      }
    });
  });

  container.querySelectorAll('.btn-options').forEach(btn => {
    btn.addEventListener('click', () => {
      const ext = installedExtensions.find(e => e.id === btn.dataset.id);
      if (ext?.optionsUrl) chrome.tabs.create({ url: ext.optionsUrl });
    });
  });

  container.querySelectorAll('.btn-homepage').forEach(btn => {
    btn.addEventListener('click', () => {
      chrome.tabs.create({ url: btn.dataset.url });
    });
  });

  container.querySelectorAll('.btn-store').forEach(btn => {
    btn.addEventListener('click', () => {
      chrome.tabs.create({ url: `https://chromewebstore.google.com/detail/${btn.dataset.id}` });
    });
  });

  container.querySelectorAll('.btn-uninstall').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await chrome.management.uninstall(btn.dataset.id, { showConfirmDialog: true });
        await loadInstalledExtensions();
        await refreshActiveTimers();
      } catch (err) {
        console.error('Uninstall canceled or failed:', err);
      }
    });
  });
}

// Active Timers management
async function refreshActiveTimers() {
  const { activeTimers = {} } = await chrome.storage.local.get('activeTimers');
  const bar = document.getElementById('active-timers-bar');
  const list = document.getElementById('active-timers-list');
  const keys = Object.keys(activeTimers);

  if (keys.length === 0) {
    bar.style.display = 'none';
    return;
  }

  bar.style.display = 'block';
  list.innerHTML = '';
  const now = Date.now();

  keys.forEach(id => {
    const timer = activeTimers[id];
    const remainingMs = Math.max(0, timer.expiresAt - now);

    const item = document.createElement('div');
    item.className = 'timer-item';
    item.id = `active-timer-${id}`;
    item.innerHTML = `
      <div class="timer-item-left">
        <img src="${timer.iconUrl}" class="timer-item-icon" alt="" onerror="this.src='icons/icon48.png'">
        <span class="timer-item-name">${timer.name}</span>
      </div>
      <div class="timer-item-right">
        <span class="timer-time-left" id="time-left-${id}">${formatTime(remainingMs)}</span>
        <button class="timer-btn-stop" data-id="${id}" title="Turn off now">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    `;

    list.appendChild(item);
  });

  list.querySelectorAll('.timer-btn-stop').forEach(btn => {
    btn.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ action: 'cancelTimer', data: { extensionId: btn.dataset.id, disableNow: true } });
      showToast('Extension turned off');
      await loadInstalledExtensions();
      await refreshActiveTimers();
    });
  });
}

// Live timer tick
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
        const el = document.getElementById(`time-left-${id}`);
        if (el) el.textContent = formatTime(remainingMs);
      }
    });

    if (hasExpired) {
      await refreshActiveTimers();
      await loadInstalledExtensions();
    }
  }, 1000);
}

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function showToast(msg) {
  const toast = document.getElementById('status-toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2400);
}
