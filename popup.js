/**
 * Minimalist, Native Extension Manager Script
 */

let installedExtensions = [];
let countdownInterval = null;
let currentViewMode = 'list'; // 'list' | 'grid'
// Extension IDs whose expiry the ticker has already reacted to.
const expiryHandled = new Set();

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

  // Live reactivity across tabs/popups and extension state changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.activeTimers) {
      refreshActiveTimers();
    }
  });

  chrome.management.onEnabled.addListener(() => loadInstalledExtensions());
  chrome.management.onDisabled.addListener(() => loadInstalledExtensions());
  chrome.management.onUninstalled.addListener(() => loadInstalledExtensions());
  chrome.management.onInstalled.addListener(() => loadInstalledExtensions());
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
    // mayDisable is false for policy-forced and Chrome component extensions.
    // Offering them here only produces a raw Chrome exception on click and
    // inflates the installed count with things we cannot manage.
    installedExtensions = all
      .filter(ext => ext.type === 'extension' && ext.id !== chrome.runtime.id && ext.mayDisable)
      .sort((a, b) => a.name.localeCompare(b.name));

    document.getElementById('total-count').textContent = installedExtensions.length;
    renderList();
  } catch (err) {
    console.error('Failed to load extensions:', err);
  }
}

/* ------------------------------------------------------------------ *
 * Rendering
 *
 * Extension names, descriptions and icon URLs come from other installed
 * extensions' own manifests, so they are attacker-controlled: any extension
 * picks its own. They are only ever assigned through textContent / .title /
 * .src, never concatenated into innerHTML, and icon URLs are additionally
 * restricted by scheme. Only the static SVG markup below is set as HTML.
 * ------------------------------------------------------------------ */

const DEFAULT_ICON = 'icons/icon48.png';

const SVG_OPTIONS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>';
const SVG_HOMEPAGE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>';
const SVG_STORE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>';
const SVG_UNINSTALL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
const SVG_STOP = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

// Chrome hands back chrome://extension-icon/ URLs. Anything else would let a
// crafted manifest point <img src> at a remote host, turning every popup open
// into an outbound request that leaks usage timing.
function safeIconUrl(url) {
  return (typeof url === 'string' && url.startsWith('chrome://extension-icon/'))
    ? url
    : DEFAULT_ICON;
}

// Only ever open http(s) links. homepageUrl comes from another extension's
// manifest, so it must not be handed to tabs.create unchecked.
function safeHomepageUrl(url) {
  return (typeof url === 'string' && /^https?:\/\//i.test(url)) ? url : null;
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

// Element helper. `html` is only ever a static SVG constant from above.
function el(tag, className, { text, title, html, dataset } = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (title !== undefined) node.title = title;
  if (html !== undefined) node.innerHTML = html;
  if (dataset) Object.assign(node.dataset, dataset);
  return node;
}

function buildDrawerLink(className, svg, label, dataset) {
  const btn = el('button', `drawer-link ${className}`, { dataset });
  btn.appendChild(el('span', null, { html: svg }).firstChild);
  btn.appendChild(document.createTextNode(` ${label}`));
  return btn;
}

// Render Extension List
function renderList(query = '') {
  const container = document.getElementById('extensions-list');
  container.innerHTML = '';

  const filtered = installedExtensions.filter(e => e.name.toLowerCase().includes(query));

  if (filtered.length === 0) {
    container.appendChild(el('div', 'empty-state', { text: 'No extensions found' }));
    return;
  }

  filtered.forEach(ext => {
    const homepageUrl = safeHomepageUrl(ext.homepageUrl);

    const row = el('div', 'ext-row');
    row.id = `row-${ext.id}`;

    // --- main bar ---
    const bar = el('div', 'ext-main-bar', { dataset: { id: ext.id } });

    const info = el('div', 'ext-info');
    info.appendChild(buildIcon('ext-icon', ext.icons?.[0]?.url));

    const nameGroup = el('div', 'ext-name-group');
    nameGroup.appendChild(el('span', 'ext-name', { text: ext.name, title: ext.name }));
    nameGroup.appendChild(el('span', 'ext-status-label', {
      text: ext.enabled ? 'Enabled' : 'Disabled'
    }));
    info.appendChild(nameGroup);

    const actions = el('div', 'ext-row-actions');
    const label = el('label', 'switch', { title: 'Toggle extension' });
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'toggle-checkbox';
    chk.dataset.id = ext.id;
    chk.checked = ext.enabled;
    label.append(chk, el('span', 'slider'));
    actions.appendChild(label);

    bar.append(info, actions);

    // --- drawer ---
    const drawer = el('div', 'ext-drawer');
    drawer.id = `drawer-${ext.id}`;
    drawer.appendChild(el('p', 'ext-desc', {
      text: ext.description || 'No description provided.'
    }));

    const presets = el('div', 'drawer-timer-presets');
    const presetLabel = el('span', null, { text: 'Set Timer:' });
    presetLabel.style.cssText = 'font-size: 11px; color: var(--text-muted); margin-right: 2px;';
    presets.appendChild(presetLabel);
    [5, 15, 30, 60].forEach(min => {
      presets.appendChild(el('button', 'timer-chip', {
        text: min === 60 ? '1h' : `${min}m`,
        dataset: { id: ext.id, min: String(min) }
      }));
    });
    drawer.appendChild(presets);

    const links = el('div', 'drawer-links-row');
    if (ext.optionsUrl) {
      links.appendChild(buildDrawerLink('btn-options', SVG_OPTIONS, 'Options', { id: ext.id }));
    }
    if (homepageUrl) {
      links.appendChild(buildDrawerLink('btn-homepage', SVG_HOMEPAGE, 'Homepage', { url: homepageUrl }));
    }
    links.appendChild(buildDrawerLink('btn-store', SVG_STORE, 'Store Page', { id: ext.id }));
    links.appendChild(buildDrawerLink('btn-uninstall', SVG_UNINSTALL, 'Remove', { id: ext.id }));
    drawer.appendChild(links);

    row.append(bar, drawer);
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
        // No cancelTimer message needed: the background's management.onDisabled
        // listener drops the timer however the extension was disabled. Sending
        // one here also meant a failed message reverted a toggle that had
        // already succeeded.
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
      const min = parseInt(btn.dataset.min, 10);
      const ext = installedExtensions.find(e => e.id === extId);
      if (!ext || !Number.isInteger(min) || min < 1 || min > 1440) return;

      let res;
      try {
        res = await chrome.runtime.sendMessage({
          action: 'startTimer',
          // Sanitize before it reaches storage, so a hostile URL is never persisted.
          data: {
            extensionId: extId,
            name: ext.name,
            durationMinutes: min,
            iconUrl: safeIconUrl(ext.icons?.[0]?.url)
          }
        });
      } catch (err) {
        // sendMessage rejects (it does not resolve falsy) when the service
        // worker is evicted or still starting, which is routine under MV3.
        console.error('startTimer message failed:', err);
        showToast('Background service unavailable — try again');
        return;
      }

      if (res && res.success) {
        showToast(`Auto-off timer set for ${min}m`);
        await loadInstalledExtensions();
        await refreshActiveTimers();
      } else {
        showToast(`Failed: ${res?.error || 'Unknown error'}`);
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

    const item = el('div', 'timer-item');
    item.id = `active-timer-${id}`;

    const left = el('div', 'timer-item-left');
    left.appendChild(buildIcon('timer-item-icon', timer.iconUrl));
    left.appendChild(el('span', 'timer-item-name', { text: timer.name }));

    const right = el('div', 'timer-item-right');
    const timeLeft = el('span', 'timer-time-left', { text: formatTime(remainingMs) });
    timeLeft.id = `time-left-${id}`;

    const stopBtn = el('button', 'timer-btn-stop', {
      title: 'Turn off now',
      html: SVG_STOP,
      dataset: { id }
    });

    right.append(timeLeft, stopBtn);
    item.append(left, right);
    list.appendChild(item);
  });

  list.querySelectorAll('.timer-btn-stop').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await chrome.runtime.sendMessage({
          action: 'cancelTimer',
          data: { extensionId: btn.dataset.id, disableNow: true }
        });
      } catch (err) {
        console.error('cancelTimer message failed:', err);
        showToast('Background service unavailable — try again');
        return;
      }
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
        const timeEl = document.getElementById(`time-left-${id}`);
        if (timeEl) timeEl.textContent = formatTime(remainingMs);
      }
    });

    if (hasExpired) {
      await refreshActiveTimers();
      await loadInstalledExtensions();
    }
  }, 1000);
}

// Minutes roll into hours past 60. Without this the 1h preset read "60:00" and
// the 1440 maximum read "1440:00", which a two-digit MM:SS field gives no way
// to parse.
function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  const mm = String(min).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return hrs > 0 ? `${hrs}:${mm}:${ss}` : `${mm}:${ss}`;
}

function showToast(msg) {
  const toast = document.getElementById('status-toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2400);
}
