/* -------------------- utilities -------------------- */
function setStatus(el, msg, type = '') {
  if (!el) return;
  el.textContent = msg;
  el.className = `text-xs font-medium empty:hidden break-all ${type === 'err' ? 'text-rose-500' : type === 'ok' ? 'text-emerald-600' : 'text-slate-500'}`;
}
function uid() {
  return (crypto && crypto.randomUUID && crypto.randomUUID()) || ('h_' + Date.now() + '_' + Math.random().toString(16).slice(2));
}
function fmtTime(ts) {
  try {
    return new Date(ts).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return String(ts);
  }
}
function escapeText(s) {
  return (s ?? '').toString();
}
function escapeHtml(s) {
  return escapeText(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function isHttpUrl(s) {
  return /^https?:\/\//i.test(s || '');
}
function isDataUrl(s) {
  return /^data:/i.test(s || '');
}
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}
async function normalizeImageSourceToDataUrl(src) {
  if (!src) return null;
  if (isDataUrl(src)) return src;
  if (!isHttpUrl(src)) return null;
  try {
    const r = await fetch(src, { mode: 'cors' });
    if (!r.ok) return null;
    return await blobToDataUrl(await r.blob());
  } catch {
    return null;
  }
}

/* -------------------- tab switching -------------------- */
function activateTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.remove('bg-white', 'text-slate-800', 'shadow-sm', 'active');
    b.classList.add('text-slate-500');
  });
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  const btn = document.querySelector(`.tab-btn[data-tab="${name}"]`);
  if (btn) {
    btn.classList.add('bg-white', 'text-slate-800', 'shadow-sm', 'active');
    btn.classList.remove('text-slate-500');
  }
  const panel = document.getElementById('tab-' + name);
  if (panel) panel.classList.add('active');
  document.body.classList.toggle('generate-locked', name === 'generate');
  document.getElementById('app-main')?.classList.toggle('generate-locked-main', name === 'generate');
  if (name === 'history') renderHistoryTab();
}
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => activateTab(btn.dataset.tab));
});
activateTab(document.querySelector('.tab-btn.active')?.dataset.tab || 'decode');

/* -------------------- Base64 decode -------------------- */
function normalizeToDataUrl(raw) {
  let s = (raw || '').trim();
  if (!s) throw new Error('输入内容不能为空');
  const prefixRe = /^data:[^;,]+;base64,/i;
  while (prefixRe.test(s)) s = s.replace(prefixRe, '');
  s = s.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(s)) throw new Error('包含非法的 Base64 字符');
  let bin;
  try {
    const head = s.slice(0, 32);
    bin = atob(head.padEnd(Math.ceil(head.length / 4) * 4, '='));
  } catch (e) {
    throw new Error('Base64 解码失败：' + e.message);
  }
  const b = [...bin].map(c => c.charCodeAt(0));
  let mime = 'image/png';
  if (b[0]===0x89 && b[1]===0x50 && b[2]===0x4e && b[3]===0x47) mime = 'image/png';
  else if (b[0]===0xff && b[1]===0xd8 && b[2]===0xff) mime = 'image/jpeg';
  else if (b[0]===0x47 && b[1]===0x49 && b[2]===0x46) mime = 'image/gif';
  else if (b[0]===0x52 && b[1]===0x49 && b[2]===0x46 && b[8]===0x57 && b[9]===0x45 && b[10]===0x42 && b[11]===0x50) mime = 'image/webp';
  return { dataUrl: 'data:' + mime + ';base64,' + s, mime, b64: s };
}

const b64In = document.getElementById('b64-input');
const b64Preview = document.getElementById('b64-preview');
const b64Img = document.getElementById('b64-img');
const b64Meta = document.getElementById('b64-meta');
const b64Status = document.getElementById('b64-status');
const b64Download = document.getElementById('b64-download');

function decodeB64Input() {
  setStatus(b64Status, '');
  try {
    const { dataUrl, mime, b64 } = normalizeToDataUrl(b64In.value);
    b64Img.src = dataUrl;
    b64Download.href = dataUrl;
    b64Download.download = 'image.' + mime.split('/')[1];
    const sizeKB = Math.round(b64.length * 0.75 / 1024);
    b64Meta.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
          <span class="block text-[10px] text-slate-400 uppercase mb-1">文件类型</span>
          <span class="font-mono text-brand-600 text-[13px] break-all">${mime}</span>
        </div>
        <div class="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
          <span class="block text-[10px] text-slate-400 uppercase mb-1">预估体积</span>
          <span class="font-mono text-brand-600 text-[13px] break-all">${sizeKB} KB</span>
        </div>
      </div>
      <div class="mt-3 bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
        <span class="block text-[10px] text-slate-400 uppercase mb-1">Base64 字符总数</span>
        <span class="font-mono text-slate-700 text-[13px] break-all">${b64.length}</span>
      </div>`;
    b64Preview.classList.remove('hidden');
    setStatus(b64Status, '解析成功', 'ok');
  } catch (e) {
    b64Preview.classList.add('hidden');
    setStatus(b64Status, e.message, 'err');
  }
}
document.getElementById('b64-decode').addEventListener('click', decodeB64Input);
document.getElementById('b64-clear').addEventListener('click', () => {
  b64In.value = '';
  b64Preview.classList.add('hidden');
  setStatus(b64Status, '');
});
document.getElementById('b64-open').addEventListener('click', () => {
  if (b64Img.src) window.open(b64Img.src, '_blank');
});
async function openAnyImageInDecoder(src) {
  let dataUrl = await normalizeImageSourceToDataUrl(src);
  if (!dataUrl && isDataUrl(src)) dataUrl = src;
  if (!dataUrl) {
    if (isHttpUrl(src)) window.open(src, '_blank');
    return;
  }
  activateTab('decode');
  b64In.value = dataUrl;
  decodeB64Input();
  b64Preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* -------------------- config persistence -------------------- */
const CFG_KEY = 'imggen-cfg-v2';
const HISTORY_KEY = 'imggen-history-v3';
const CFG_COLLAPSED_KEY = 'imggen-cfg-collapsed-v1';
const APP_DB_NAME = 'viewer-next-db';
const APP_DB_VERSION = 1;
const STORE_HISTORY = 'history';
const STORE_PROFILES = 'profiles';
const STORE_META = 'meta';
const DEFAULT_PROFILE_ID = 'default';
const cfgIds = [
  'cfg-baseurl','cfg-key','cfg-model-preset','cfg-model','cfg-mode','cfg-size-preset','cfg-size','cfg-n','cfg-batch-mode',
  'cfg-quality','cfg-format','cfg-background','cfg-moderation','cfg-compression','cfg-clear-on-submit','cfg-persist-prompt','cfg-timeout'
];
const LAST_PROMPT_KEY = 'imggen-last-prompt-v1';
const profileSelectEl = document.getElementById('cfg-profile-select');
const profileNameEl = document.getElementById('cfg-profile-name');
const profileStatusEl = document.getElementById('cfg-profile-status');
const healthSummaryEl = document.getElementById('cfg-health-summary');
const healthListEl = document.getElementById('cfg-health-list');
const appState = {
  db: null,
  profiles: [],
  currentProfileId: DEFAULT_PROFILE_ID,
  historyRecords: [],
};
const MAX_HISTORY = 30;

function captureCfg() {
  const o = {};
  cfgIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    o[id] = el.type === 'checkbox' ? el.checked : el.value;
  });
  return o;
}

function applyCfg(saved) {
  cfgIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el || saved?.[id] == null) return;
    if (el.type === 'checkbox') el.checked = !!saved[id];
    else el.value = saved[id];
  });
}

function openAppDb() {
  if (appState.db) return Promise.resolve(appState.db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(APP_DB_NAME, APP_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_HISTORY)) db.createObjectStore(STORE_HISTORY, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_PROFILES)) db.createObjectStore(STORE_PROFILES, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META, { keyPath: 'key' });
    };
    req.onsuccess = () => {
      appState.db = req.result;
      resolve(appState.db);
    };
    req.onerror = () => reject(req.error);
  });
}

async function idbStore(mode, storeName, runner) {
  const db = await openAppDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let result;
    try {
      result = runner(store);
    } catch (error) {
      reject(error);
      return;
    }
    tx.oncomplete = () => resolve(result?.result ?? result);
    tx.onerror = () => reject(tx.error || result?.error);
    tx.onabort = () => reject(tx.error || result?.error);
  });
}

async function idbPut(storeName, value) {
  return idbStore('readwrite', storeName, store => store.put(value));
}

async function idbDelete(storeName, key) {
  return idbStore('readwrite', storeName, store => store.delete(key));
}

async function idbClear(storeName) {
  return idbStore('readwrite', storeName, store => store.clear());
}

async function idbGet(storeName, key) {
  const db = await openAppDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAll(storeName) {
  const db = await openAppDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function normalizeProfile(profile) {
  return {
    id: profile?.id || uid(),
    name: profile?.name || '未命名接口',
    updatedAt: profile?.updatedAt || Date.now(),
    config: { ...captureCfg(), ...(profile?.config || {}) },
  };
}

async function migrateLegacyStorageIfNeeded() {
  const migrated = await idbGet(STORE_META, 'legacy-migrated');
  if (migrated?.value) return;

  let legacyCfg = null;
  let legacyHistory = [];
  try { legacyCfg = JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); } catch {}
  try { legacyHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch {}

  const defaultProfile = normalizeProfile({
    id: DEFAULT_PROFILE_ID,
    name: '默认配置',
    config: legacyCfg || captureCfg(),
  });
  await idbPut(STORE_PROFILES, defaultProfile);

  const trimmedHistory = Array.isArray(legacyHistory) ? legacyHistory.slice(-MAX_HISTORY) : [];
  for (const record of trimmedHistory) await idbPut(STORE_HISTORY, record);

  await idbPut(STORE_META, { key: 'activeProfileId', value: DEFAULT_PROFILE_ID });
  await idbPut(STORE_META, { key: 'legacy-migrated', value: true, ts: Date.now() });
}

async function loadProfilesFromDb() {
  const profiles = (await idbGetAll(STORE_PROFILES)).map(normalizeProfile);
  if (!profiles.find(p => p.id === DEFAULT_PROFILE_ID)) {
    const defaultProfile = normalizeProfile({ id: DEFAULT_PROFILE_ID, name: '默认配置', config: captureCfg() });
    await idbPut(STORE_PROFILES, defaultProfile);
    profiles.push(defaultProfile);
  }
  profiles.sort((a, b) => {
    if (a.id === DEFAULT_PROFILE_ID) return -1;
    if (b.id === DEFAULT_PROFILE_ID) return 1;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
  appState.profiles = profiles;
  return profiles;
}

function renderProfileOptions() {
  profileSelectEl.innerHTML = '';
  appState.profiles.forEach(profile => {
    const opt = document.createElement('option');
    opt.value = profile.id;
    opt.textContent = profile.name;
    profileSelectEl.appendChild(opt);
  });
  profileSelectEl.value = appState.currentProfileId;
  const current = appState.profiles.find(p => p.id === appState.currentProfileId) || appState.profiles[0];
  profileNameEl.value = current?.name || '';
}

function getCurrentProfile() {
  return appState.profiles.find(p => p.id === appState.currentProfileId) || null;
}

async function persistProfile(profile, notice = '配置已保存到当前档案') {
  const normalized = normalizeProfile(profile);
  await idbPut(STORE_PROFILES, normalized);
  const idx = appState.profiles.findIndex(item => item.id === normalized.id);
  if (idx >= 0) appState.profiles[idx] = normalized;
  else appState.profiles.push(normalized);
  await idbPut(STORE_META, { key: 'activeProfileId', value: normalized.id });
  appState.currentProfileId = normalized.id;
  renderProfileOptions();
  if (notice) {
    setStatus(profileStatusEl, notice, 'ok');
    setTimeout(() => setStatus(profileStatusEl, ''), 1800);
  }
}

async function saveCfg(notice = '配置已保存到当前档案') {
  const current = getCurrentProfile() || normalizeProfile({ id: DEFAULT_PROFILE_ID, name: '默认配置' });
  const nextName = (profileNameEl.value || current.name || '未命名接口').trim() || '未命名接口';
  const next = {
    ...current,
    name: nextName,
    updatedAt: Date.now(),
    config: captureCfg(),
  };
  await persistProfile(next, notice);
}

async function switchProfile(profileId) {
  const target = appState.profiles.find(item => item.id === profileId);
  if (!target) return;
  appState.currentProfileId = target.id;
  applyCfg(target.config);
  profileNameEl.value = target.name || '';
  await idbPut(STORE_META, { key: 'activeProfileId', value: target.id });
  modelSync.syncFromInput();
  sizeSync.syncFromInput();
  document.getElementById('cfg-baseurl').dispatchEvent(new Event('input'));
  document.getElementById('cfg-model').dispatchEvent(new Event('input'));
  document.getElementById('cfg-size').dispatchEvent(new Event('input'));
  document.getElementById('cfg-mode').dispatchEvent(new Event('change'));
  renderProfileOptions();
  setStatus(profileStatusEl, `已切换到档案：${target.name}`, 'ok');
  setTimeout(() => setStatus(profileStatusEl, ''), 1800);
}

async function createProfileFromCurrent() {
  const base = (profileNameEl.value || '').trim();
  const serial = appState.profiles.filter(item => item.id !== DEFAULT_PROFILE_ID).length + 1;
  const name = base || `接口 ${serial}`;
  const profile = normalizeProfile({
    id: uid(),
    name,
    updatedAt: Date.now(),
    config: captureCfg(),
  });
  appState.profiles.push(profile);
  await persistProfile(profile, `已创建档案：${name}`);
}

async function deleteCurrentProfile() {
  if (appState.currentProfileId === DEFAULT_PROFILE_ID) {
    setStatus(profileStatusEl, '默认配置不能删除', 'err');
    return;
  }
  const current = getCurrentProfile();
  if (!current) return;
  if (!confirm(`删除档案“${current.name}”？`)) return;
  await idbDelete(STORE_PROFILES, current.id);
  appState.profiles = appState.profiles.filter(item => item.id !== current.id);
  await switchProfile(DEFAULT_PROFILE_ID);
  setStatus(profileStatusEl, `已删除档案：${current.name}`, 'ok');
  setTimeout(() => setStatus(profileStatusEl, ''), 1800);
}

profileSelectEl.addEventListener('change', () => {
  switchProfile(profileSelectEl.value).catch(err => setStatus(profileStatusEl, err.message, 'err'));
});
document.getElementById('cfg-profile-new').addEventListener('click', () => {
  createProfileFromCurrent().catch(err => setStatus(profileStatusEl, err.message, 'err'));
});
document.getElementById('cfg-profile-save').addEventListener('click', () => {
  saveCfg().catch(err => setStatus(profileStatusEl, err.message, 'err'));
});
document.getElementById('cfg-profile-delete').addEventListener('click', () => {
  deleteCurrentProfile().catch(err => setStatus(profileStatusEl, err.message, 'err'));
});
(() => {
  const keyInput = document.getElementById('cfg-key');
  const btn = document.getElementById('cfg-key-toggle');
  const showIcon = document.getElementById('cfg-key-eye-show');
  const hideIcon = document.getElementById('cfg-key-eye-hide');
  if (!keyInput || !btn) return;
  btn.addEventListener('click', () => {
    const visible = keyInput.type === 'text';
    keyInput.type = visible ? 'password' : 'text';
    showIcon?.classList.toggle('hidden', !visible);
    hideIcon?.classList.toggle('hidden', visible);
  });
})();

(() => {
  const fmt = document.getElementById('cfg-format');
  const row = document.getElementById('compression-row');
  const input = document.getElementById('cfg-compression');
  const label = document.getElementById('compression-label');
  if (!fmt || !row || !input || !label) return;
  const sync = () => {
    row.classList.toggle('hidden', !(fmt.value === 'jpeg' || fmt.value === 'webp'));
    label.textContent = input.value;
  };
  fmt.addEventListener('change', sync);
  input.addEventListener('input', sync);
  sync();
})();

function getGenerationOptions() {
  return {
    quality: document.getElementById('cfg-quality')?.value || 'auto',
    format: document.getElementById('cfg-format')?.value || 'png',
    background: document.getElementById('cfg-background')?.value || 'auto',
    moderation: document.getElementById('cfg-moderation')?.value || 'auto',
    compression: Math.max(0, Math.min(100, parseInt(document.getElementById('cfg-compression')?.value, 10) || 80)),
    clearOnSubmit: !!document.getElementById('cfg-clear-on-submit')?.checked,
    persistPrompt: document.getElementById('cfg-persist-prompt')?.checked !== false,
    timeout: Math.max(10, Math.min(3600, parseInt(document.getElementById('cfg-timeout')?.value, 10) || 600)),
  };
}

function applyExtraGenerationParams(target, isFormData, opts) {
  const add = (key, value) => {
    if (value == null || value === '' || value === 'auto') return;
    if (isFormData) target.append(key, String(value));
    else target[key] = value;
  };
  add('quality', opts.quality);
  add('background', opts.background);
  add('moderation', opts.moderation);
  add('output_format', opts.format);
  if (opts.format === 'jpeg' || opts.format === 'webp') add('output_compression', opts.compression);
}

function wireSelectInput(selectId, inputId) {
  const select = document.getElementById(selectId);
  const input = document.getElementById(inputId);
  const syncVisibility = () => {
    input.classList.toggle('hidden', select.value !== '__custom__');
  };
  const syncFromSelect = () => {
    syncVisibility();
    if (select.value !== '__custom__') input.value = select.value;
  };
  const syncFromInput = () => {
    const v = (input.value || '').trim();
    const known = Array.from(select.options).map(o => o.value).filter(vv => vv !== '__custom__');
    select.value = known.includes(v) ? v : '__custom__';
    syncVisibility();
  };
  select.addEventListener('change', syncFromSelect);
  input.addEventListener('input', syncFromInput);
  syncFromSelect();
  syncFromInput();
  return { syncFromSelect, syncFromInput, syncVisibility };
}
const modelSync = wireSelectInput('cfg-model-preset', 'cfg-model');
const sizeSync = wireSelectInput('cfg-size-preset', 'cfg-size');

/* -------------------- model fetch -------------------- */
function extractModelIds(json) {
  let arr = null;
  if (Array.isArray(json)) arr = json;
  else if (Array.isArray(json.data)) arr = json.data;
  else if (Array.isArray(json.models)) arr = json.models;
  else return [];
  return arr.map(m => {
    if (typeof m === 'string') return m;
    return m.id || m.model || m.name || m.model_name || null;
  }).filter(Boolean);
}
function populateModelPreset(models) {
  const preset = document.getElementById('cfg-model-preset');
  const input = document.getElementById('cfg-model');
  const cur = input.value.trim();
  preset.innerHTML = '';
  for (const m of models) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    preset.appendChild(opt);
  }
  const customOpt = document.createElement('option');
  customOpt.value = '__custom__';
  customOpt.textContent = '自定义…';
  preset.appendChild(customOpt);
  if (!models.includes(cur)) preset.value = '__custom__';
  else preset.value = cur;
  modelSync.syncFromSelect();
  modelSync.syncFromInput();
}
async function fetchModelList() {
  const baseurl = document.getElementById('cfg-baseurl').value.trim().replace(/\/+$/, '');
  const key = document.getElementById('cfg-key').value.trim();
  const statusEl = document.getElementById('cfg-model-fetch-status');
  if (!baseurl || !key) {
    setStatus(statusEl, '请先填写 Base URL 和 API Key', 'err');
    return;
  }
  setStatus(statusEl, '正在获取模型列表…', '');
  try {
    const r = await fetch(baseurl + '/v1/models', {
      headers: { 'Authorization': 'Bearer ' + key, 'Accept': 'application/json' }
    });
    const text = await r.text();
    if (!r.ok) {
      let detail = '';
      try {
        const j = JSON.parse(text);
        detail = (j.error && j.error.message) || j.message || text.slice(0, 120);
      } catch {
        detail = text.slice(0, 120);
      }
      throw new Error(`HTTP ${r.status} ${detail}`);
    }
    const json = JSON.parse(text);
    const all = extractModelIds(json);
    const filtered = all.filter(id => /image|seedream/i.test(id));
    if (!filtered.length) {
      setStatus(statusEl, `已返回 ${all.length} 个模型，但没有匹配 image / seedream 的绘图模型`, 'err');
      return;
    }
    populateModelPreset(filtered);
    setStatus(statusEl, `已加载 ${filtered.length} 个绘图模型（从 ${all.length} 个中过滤）`, 'ok');
    setTimeout(() => setStatus(statusEl, ''), 3500);
  } catch (e) {
    setStatus(statusEl, '获取失败：' + e.message, 'err');
  }
}
document.getElementById('cfg-model-fetch').addEventListener('click', fetchModelList);

/* -------------------- health check -------------------- */
function renderHealthChecks(items = []) {
  healthListEl.innerHTML = '';
  if (!items.length) {
    healthSummaryEl.textContent = '';
    return;
  }
  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'health-item';
    const main = document.createElement('div');
    main.className = 'health-item-main';
    const title = document.createElement('div');
    title.className = 'health-item-title';
    title.textContent = item.title;
    const meta = document.createElement('div');
    meta.className = 'health-item-meta';
    meta.textContent = item.detail || '';
    main.appendChild(title);
    main.appendChild(meta);
    const pill = document.createElement('span');
    pill.className = `health-pill ${item.status || 'pending'}`;
    pill.textContent = item.label || '待检测';
    row.appendChild(main);
    row.appendChild(pill);
    healthListEl.appendChild(row);
  });
}

async function runHealthCheck() {
  const baseurl = document.getElementById('cfg-baseurl').value.trim().replace(/\/+$/, '');
  const key = document.getElementById('cfg-key').value.trim();
  const mode = document.getElementById('cfg-mode').value;
  if (!baseurl) {
    setStatus(document.getElementById('cfg-status'), '请先填写 Base URL', 'err');
    return;
  }

  const modeEndpointMap = {
    responses: { id: 'mode', title: '当前模式 · /v1/responses', path: '/v1/responses', method: 'OPTIONS' },
    images: { id: 'mode', title: '当前模式 · /v1/images/generations', path: '/v1/images/generations', method: 'OPTIONS' },
    edits: { id: 'mode', title: '当前模式 · /v1/images/edits', path: '/v1/images/edits', method: 'OPTIONS' },
    chat: { id: 'mode', title: '当前模式 · /v1/chat/completions', path: '/v1/chat/completions', method: 'OPTIONS' },
  };
  const selectedModeCheck = modeEndpointMap[mode] || modeEndpointMap.images;

  const checks = [
    { id: 'root', title: '站点根地址', url: baseurl, headers: {} },
    { id: 'models', title: '/v1/models', url: baseurl + '/v1/models', headers: key ? { Authorization: 'Bearer ' + key, Accept: 'application/json' } : { Accept: 'application/json' } },
    { id: selectedModeCheck.id, title: selectedModeCheck.title, url: baseurl + selectedModeCheck.path, method: selectedModeCheck.method, headers: key ? { Authorization: 'Bearer ' + key, Accept: 'application/json' } : { Accept: 'application/json' } },
  ];

  renderHealthChecks(checks.map(item => ({ ...item, status: 'pending', label: '检测中', detail: item.url })));
  healthSummaryEl.textContent = `正在检测站点联通性与关键接口（当前模式：${mode}）...`;

  const results = [];
  for (const item of checks) {
    const startedAt = performance.now();
    try {
      const response = await fetch(item.url, {
        method: item.method || 'GET',
        headers: item.headers,
      });
      const ms = Math.round(performance.now() - startedAt);
      const ok = response.ok || response.status === 401 || response.status === 405;
      results.push({
        ...item,
        status: ok ? 'ok' : 'err',
        label: ok ? '可达' : '异常',
        detail: `${item.url} · HTTP ${response.status} ${response.statusText || ''} · ${ms} ms`,
      });
    } catch (error) {
      results.push({
        ...item,
        status: 'err',
        label: '失败',
        detail: `${item.url} · ${error.message}`,
      });
    }
    renderHealthChecks(results.concat(checks.slice(results.length).map(rest => ({
      ...rest,
      status: 'pending',
      label: '等待中',
      detail: rest.url,
    }))));
  }

  const okCount = results.filter(item => item.status === 'ok').length;
  healthSummaryEl.textContent = `检测完成：${okCount}/${results.length} 项可达`;
}

document.getElementById('cfg-health-check').addEventListener('click', () => {
  runHealthCheck().catch(err => {
    healthSummaryEl.textContent = '检测失败';
    setStatus(document.getElementById('cfg-status'), err.message, 'err');
  });
});

/* -------------------- pro-lock & size gate -------------------- */
function getBaseOrigin(baseurl) {
  try { return new URL(baseurl).origin; } catch { return ''; }
}
function isMicuApi(baseurl) {
  return getBaseOrigin(baseurl) === 'https://micuapi.ai';
}
function isGptImage2Family(model) {
  return /^gpt-image-2(-pro)?$/i.test((model || '').trim());
}
(() => {
  const baseurlEl = document.getElementById('cfg-baseurl');
  const sizePreset = document.getElementById('cfg-size-preset');
  const sizeInput = document.getElementById('cfg-size');
  const modelPreset = document.getElementById('cfg-model-preset');
  const modelInput = document.getElementById('cfg-model');
  const modeSel = document.getElementById('cfg-mode');
  const nInput = document.getElementById('cfg-n');
  const statusEl = document.getElementById('cfg-status');
  const PRO = 'gpt-image-2-pro';
  const NONPRO = 'gpt-image-2';
  let hintTimer = null;

  const hint = (msg, type = '') => {
    setStatus(statusEl, msg, type);
    if (hintTimer) clearTimeout(hintTimer);
    if (msg) hintTimer = setTimeout(() => setStatus(statusEl, ''), 4500);
  };

  const maxEdge = () => {
    const m = /^(\d+)x(\d+)$/i.exec((sizeInput.value || '').trim());
    return m ? Math.max(+m[1], +m[2]) : 0;
  };
  const tier = () => {
    const e = maxEdge();
    if (e === 0) return 'unknown';
    if (e < 1024) return 'small';
    if (e < 1600) return '1k';
    if (e < 3000) return '2k';
    return '4k';
  };

  const unlockAll = () => {
    Array.from(modelPreset.options).forEach(o => o.disabled = false);
    Array.from(sizePreset.options).forEach(o => o.disabled = false);
    nInput.removeAttribute('readonly');
    nInput.classList.remove('bg-slate-100', 'cursor-not-allowed', 'opacity-60');
  };

  const lockProGate = () => {
    unlockAll();
    if (!isMicuApi(baseurlEl.value.trim())) return;
    if (!isGptImage2Family(modelInput.value)) return;

    const t = tier();
    const needPro = t === '2k' || t === '4k';
    Array.from(modelPreset.options).forEach(o => {
      if (o.value === NONPRO) o.disabled = needPro;
    });
    if (needPro && modelInput.value !== PRO) {
      modelPreset.value = PRO;
      modelInput.value = PRO;
      hint(`已自动切到 ${PRO}（${t.toUpperCase()} 仅 micuapi.ai 支持）`, 'ok');
    }
  };

  const lockN = () => {
    if (!isMicuApi(baseurlEl.value.trim()) || !isGptImage2Family(modelInput.value)) {
      nInput.removeAttribute('readonly');
      nInput.classList.remove('bg-slate-100', 'cursor-not-allowed', 'opacity-60');
      return;
    }
    const t = tier();
    if (t === '2k' || t === '4k') {
      if ((parseInt(nInput.value, 10) || 1) > 1) {
        nInput.value = '1';
        hint(`${t.toUpperCase()} 强制 N=1`, 'ok');
      }
      nInput.setAttribute('readonly', 'readonly');
      nInput.classList.add('bg-slate-100', 'cursor-not-allowed', 'opacity-60');
    } else {
      nInput.removeAttribute('readonly');
      nInput.classList.remove('bg-slate-100', 'cursor-not-allowed', 'opacity-60');
    }
  };

  const lockSizeForMode = () => {
    if (!isMicuApi(baseurlEl.value.trim()) || !isGptImage2Family(modelInput.value)) {
      Array.from(sizePreset.options).forEach(o => o.disabled = false);
      return;
    }
    const isEdits = modeSel.value === 'edits';
    Array.from(sizePreset.querySelectorAll('option')).forEach(o => {
      const m = /^(\d+)x(\d+)$/i.exec(o.value);
      if (!m) {
        o.disabled = false;
        return;
      }
      const maxE = Math.max(+m[1], +m[2]);
      o.disabled = isEdits && maxE >= 1600;
    });
    if (isEdits) {
      const m = /^(\d+)x(\d+)$/i.exec((sizeInput.value || '').trim());
      if (m && Math.max(+m[1], +m[2]) >= 1600) {
        sizeInput.value = '1024x1024';
        sizePreset.value = '1024x1024';
        sizeSync.syncFromSelect();
        hint('图生图仅支持 1K，已切回 1024×1024', 'err');
      }
    }
  };

  baseurlEl.addEventListener('input', () => { lockProGate(); lockN(); lockSizeForMode(); });
  sizePreset.addEventListener('change', () => { lockProGate(); lockN(); lockSizeForMode(); });
  sizeInput.addEventListener('input', () => { lockProGate(); lockN(); lockSizeForMode(); });
  modeSel.addEventListener('change', () => { lockProGate(); lockN(); lockSizeForMode(); updateModeUI(); });
  modelPreset.addEventListener('change', () => { lockProGate(); lockN(); });
  modelInput.addEventListener('input', () => { lockProGate(); lockN(); });
  nInput.addEventListener('input', () => {
    if (!isMicuApi(baseurlEl.value.trim()) || !isGptImage2Family(modelInput.value)) return;
    const t = tier();
    if ((t === '2k' || t === '4k') && (parseInt(nInput.value, 10) || 1) > 1) {
      nInput.value = '1';
      hint(`${t.toUpperCase()} 强制单次 1 张`, 'err');
    }
  });

  lockProGate();
  lockN();
  lockSizeForMode();
})();

const cfgToggleBtn = document.getElementById('cfg-toggle');
const settingsOpenGenerateBtn = document.getElementById('settings-open-generate');
function setConfigCollapsed(collapsed) {
  localStorage.setItem(CFG_COLLAPSED_KEY, collapsed ? '1' : '0');
}
cfgToggleBtn.addEventListener('click', () => {
  setConfigCollapsed(false);
  activateTab('settings');
});
settingsOpenGenerateBtn?.addEventListener('click', () => {
  activateTab('generate');
});

/* -------------------- generation UI / image input -------------------- */
const modeSel = document.getElementById('cfg-mode');
const editsCard = document.getElementById('edits-card');
const dropZone = document.getElementById('img-drop');
const fileInput = document.getElementById('img-file');
const imgGrid = document.getElementById('img-grid');
const imgEditor = document.getElementById('img-editor');
const editImg = document.getElementById('edit-img');
const maskCanvas = document.getElementById('mask-canvas');
const editorTitle = document.getElementById('editor-title');
const brushSizeInput = document.getElementById('brush-size');
const brushSizeLabel = document.getElementById('brush-size-label');
const promptEl = document.getElementById('gen-prompt');
const chatEl = document.getElementById('chat');
const composerAttachments = document.getElementById('composer-attachments');
const attachCountEl = document.getElementById('attach-count');
const attachBtn = document.getElementById('attach-btn');
const attachClearBtn = document.getElementById('attach-clear');

const images = [];
let editingIdx = -1;
let maskCtx = null;
let currentTool = 'brush';
let brushSize = 32;
let drawing = false;
let lastPoint = null;
let dragSrcIdx = null;

function updateModeUI() {
  const m = modeSel.value;
  const showUpload = (m === 'edits' || m === 'responses');
  editsCard.classList.toggle('hidden', !showUpload && editingIdx < 0);
  composerAttachments?.classList.toggle('hidden', !showUpload);
  dropZone?.classList.toggle('hidden', !showUpload);
  promptEl.placeholder = showUpload
    ? '描述你要生成或编辑的内容（支持上传参考图 / 粘贴图片）...'
    : '描述你要生成的画面内容...';
}
modeSel.addEventListener('change', updateModeUI);
updateModeUI();

function syncModeFromImages() {
  if (images.length && modeSel.value === 'images') {
    modeSel.value = 'edits';
    modeSel.dispatchEvent(new Event('change'));
  } else if (!images.length && modeSel.value === 'edits') {
    modeSel.value = 'images';
    modeSel.dispatchEvent(new Event('change'));
  }
}

function canvasHasStrokes(canvas) {
  if (!canvas) return false;
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
  return false;
}

const COMPRESS_THRESHOLD_BYTES = 1.5 * 1024 * 1024;
const MAX_EDGE = 2048;
function pngHasAlpha(file) {
  return file.type === 'image/png' || /\.png$/i.test(file.name || '');
}
async function compressIfNeeded(file) {
  if (file.size <= COMPRESS_THRESHOLD_BYTES) {
    const dims = await new Promise((res) => {
      const img = new Image();
      img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => res(null);
      img.src = URL.createObjectURL(file);
    });
    if (!dims || (dims.w <= MAX_EDGE && dims.h <= MAX_EDGE)) {
      return { file, originalSize: file.size, compressed: false };
    }
  }
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
      const tw = Math.round(w * scale), th = Math.round(h * scale);
      const canvas = document.createElement('canvas');
      canvas.width = tw; canvas.height = th;
      canvas.getContext('2d').drawImage(img, 0, 0, tw, th);
      const keepPng = pngHasAlpha(file);
      const outType = keepPng ? 'image/png' : 'image/jpeg';
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (!blob || blob.size >= file.size) {
          resolve({ file, originalSize: file.size, compressed: false });
          return;
        }
        const ext = keepPng ? 'png' : 'jpg';
        const newName = (file.name || 'image').replace(/\.[^.]+$/, '') + '.compressed.' + ext;
        resolve({ file: new File([blob], newName, { type: outType }), originalSize: file.size, compressed: true });
      }, outType, keepPng ? undefined : 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ file, originalSize: file.size, compressed: false }); };
    img.src = url;
  });
}
async function addFiles(fileList) {
  const candidates = Array.from(fileList).filter(f => f && f.type && f.type.startsWith('image/'));
  if (!candidates.length) return;
  setStatus(null, `处理 ${candidates.length} 张图...`, '');
  const results = await Promise.all(candidates.map(compressIfNeeded));
  for (const { file, originalSize, compressed } of results) {
    images.push({ file, objectUrl: URL.createObjectURL(file), naturalWidth: 0, naturalHeight: 0, mask: null, originalSize, compressed });
  }
  syncModeFromImages();
  setStatus(null, '', '');
  renderGrid();
}
function removeImageAt(i) {
  const img = images[i];
  if (img && img.objectUrl) URL.revokeObjectURL(img.objectUrl);
  images.splice(i, 1);
  if (editingIdx === i) closeEditor();
  else if (editingIdx > i) editingIdx--;
  syncModeFromImages();
  renderGrid();
}
function moveImage(from, to) {
  if (from === to || from < 0 || to < 0 || from >= images.length || to >= images.length) return;
  const moved = images.splice(from, 1)[0];
  images.splice(to, 0, moved);
  if (editingIdx === from) editingIdx = to;
  else if (from < editingIdx && to >= editingIdx) editingIdx--;
  else if (from > editingIdx && to <= editingIdx) editingIdx++;
  renderGrid();
}
let batchToggleUserTouched = false;
document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'cfg-batch-mode') batchToggleUserTouched = true;
});

function renderGrid() {
  imgGrid.innerHTML = '';
  const batchToggle = document.getElementById('batch-toggle');
  const batchCb = document.getElementById('cfg-batch-mode');
  if (attachCountEl) attachCountEl.textContent = images.length ? `(${images.length})` : '';

  const showBatch = modeSel.value === 'edits' && images.length >= 2;
  if (showBatch) {
    batchToggle.classList.remove('hidden');
    ['batch-count-hint', 'batch-count-hint2', 'batch-count-hint3'].forEach(id => {
      document.getElementById(id).textContent = images.length;
    });
    if (batchCb && !batchToggleUserTouched) batchCb.checked = true;
  } else {
    batchToggle.classList.add('hidden');
    if (batchCb) batchCb.checked = false;
    batchToggleUserTouched = false;
  }

  if (!images.length) {
    imgGrid.classList.add('hidden');
    if (composerAttachments && (modeSel.value === 'edits' || modeSel.value === 'responses')) {
      composerAttachments.classList.remove('hidden');
    }
    return;
  }
  imgGrid.classList.remove('hidden');
  composerAttachments?.classList.remove('hidden');

  images.forEach((img, i) => {
    const tile = document.createElement('div');
    tile.className = 'img-tile relative group rounded-xl overflow-hidden ring-1 ring-slate-200 bg-slate-100 aspect-square cursor-move';
    tile.draggable = true;
    tile.dataset.idx = i;

    const thumb = document.createElement('img');
    thumb.src = img.objectUrl;
    thumb.className = 'w-full h-full object-cover block pointer-events-none';
    tile.appendChild(thumb);

    const idx = document.createElement('div');
    idx.className = 'absolute top-1.5 left-1.5 bg-white/90 text-slate-700 text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm pointer-events-none';
    idx.textContent = '#' + (i + 1);
    tile.appendChild(idx);

    if (img.compressed) {
      const cz = document.createElement('div');
      cz.className = 'absolute bottom-1.5 left-1.5 bg-emerald-600/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm pointer-events-none';
      const orig = (img.originalSize / 1024 / 1024).toFixed(1);
      const now = (img.file.size / 1024).toFixed(0);
      cz.textContent = `${orig}MB→${now}KB`;
      tile.appendChild(cz);
    }
    if (canvasHasStrokes(img.mask)) {
      const masked = document.createElement('div');
      masked.className = 'absolute top-1.5 right-1.5 bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm pointer-events-none';
      masked.textContent = '✎';
      tile.appendChild(masked);
    }

    const overlay = document.createElement('div');
    overlay.className = 'absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/45 opacity-0 group-hover:opacity-100 transition';

    const arrows = document.createElement('div');
    arrows.className = 'flex gap-1';

    const leftBtn = document.createElement('button');
    leftBtn.className = 'w-6 h-6 flex items-center justify-center text-white bg-white/15 hover:bg-white/30 rounded font-bold text-sm disabled:opacity-30 disabled:cursor-not-allowed';
    leftBtn.textContent = '←';
    leftBtn.disabled = i === 0;
    leftBtn.addEventListener('click', (e) => { e.stopPropagation(); moveImage(i, i - 1); });
    arrows.appendChild(leftBtn);

    const rightBtn = document.createElement('button');
    rightBtn.className = 'w-6 h-6 flex items-center justify-center text-white bg-white/15 hover:bg-white/30 rounded font-bold text-sm disabled:opacity-30 disabled:cursor-not-allowed';
    rightBtn.textContent = '→';
    rightBtn.disabled = i === images.length - 1;
    rightBtn.addEventListener('click', (e) => { e.stopPropagation(); moveImage(i, i + 1); });
    arrows.appendChild(rightBtn);

    overlay.appendChild(arrows);

    const editBtn = document.createElement('button');
    editBtn.className = 'text-[11px] font-semibold text-white bg-brand-600 hover:bg-brand-700 px-2.5 py-1 rounded shadow';
    editBtn.textContent = canvasHasStrokes(img.mask) ? '改涂抹' : '涂抹';
    editBtn.addEventListener('click', (e) => { e.stopPropagation(); openEditor(i); });
    overlay.appendChild(editBtn);

    const rmBtn = document.createElement('button');
    rmBtn.className = 'text-[11px] font-semibold text-white bg-rose-600/90 hover:bg-rose-600 px-2.5 py-1 rounded shadow';
    rmBtn.textContent = '移除';
    rmBtn.addEventListener('click', (e) => { e.stopPropagation(); removeImageAt(i); });
    overlay.appendChild(rmBtn);

    tile.appendChild(overlay);

    tile.addEventListener('dragstart', (e) => {
      dragSrcIdx = i;
      tile.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(i)); } catch {}
    });
    tile.addEventListener('dragend', () => {
      tile.classList.remove('dragging');
      document.querySelectorAll('.img-tile.drop-target').forEach(t => t.classList.remove('drop-target'));
      dragSrcIdx = null;
    });
    tile.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (dragSrcIdx !== null && dragSrcIdx !== i) {
        e.dataTransfer.dropEffect = 'move';
        tile.classList.add('drop-target');
      }
    });
    tile.addEventListener('dragleave', () => tile.classList.remove('drop-target'));
    tile.addEventListener('drop', (e) => {
      e.preventDefault();
      tile.classList.remove('drop-target');
      if (dragSrcIdx === null || dragSrcIdx === i) return;
      moveImage(dragSrcIdx, i);
    });

    imgGrid.appendChild(tile);
  });
}

function openEditor(i) {
  if (editingIdx >= 0 && editingIdx !== i) persistCurrentMask();
  editingIdx = i;
  editorTitle.textContent = '编辑第 ' + (i + 1) + ' 张（可选）';
  imgEditor.classList.remove('hidden');
  editsCard.classList.remove('hidden');
  editImg.onload = () => {
    images[i].naturalWidth = editImg.naturalWidth;
    images[i].naturalHeight = editImg.naturalHeight;
    requestAnimationFrame(() => setupEditorMask(i));
  };
  editImg.src = images[i].objectUrl;
  imgEditor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function setupEditorMask(i) {
  const w = editImg.clientWidth, h = editImg.clientHeight;
  if (w === 0 || h === 0) { requestAnimationFrame(() => setupEditorMask(i)); return; }
  maskCanvas.width = w;
  maskCanvas.height = h;
  maskCanvas.style.width = w + 'px';
  maskCanvas.style.height = h + 'px';
  maskCtx = maskCanvas.getContext('2d');
  maskCtx.lineCap = 'round';
  maskCtx.lineJoin = 'round';
  maskCtx.clearRect(0, 0, w, h);
  if (images[i].mask) maskCtx.drawImage(images[i].mask, 0, 0, w, h);
}
function persistCurrentMask() {
  if (editingIdx < 0) return;
  const img = images[editingIdx];
  if (!img || !img.naturalWidth || !maskCtx) return;
  const out = document.createElement('canvas');
  out.width = img.naturalWidth;
  out.height = img.naturalHeight;
  out.getContext('2d').drawImage(maskCanvas, 0, 0, out.width, out.height);
  img.mask = canvasHasStrokes(out) ? out : null;
}
function closeEditor() {
  persistCurrentMask();
  editingIdx = -1;
  imgEditor.classList.add('hidden');
  updateModeUI();
  renderGrid();
}
document.getElementById('editor-close').addEventListener('click', closeEditor);
document.getElementById('mask-clear').addEventListener('click', () => {
  if (maskCtx) maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  if (editingIdx >= 0 && images[editingIdx]) images[editingIdx].mask = null;
});

dropZone.addEventListener('click', () => fileInput.click());
attachBtn?.addEventListener('click', () => {
  if (modeSel.value !== 'edits' && modeSel.value !== 'responses') {
    modeSel.value = 'edits';
    modeSel.dispatchEvent(new Event('change'));
  }
  fileInput.click();
});
function clearAttachedImages() {
  images.splice(0).forEach(im => { try { URL.revokeObjectURL(im.objectUrl); } catch {} });
  editingIdx = -1;
  imgEditor.classList.add('hidden');
  syncModeFromImages();
  renderGrid();
}
attachClearBtn?.addEventListener('click', clearAttachedImages);
fileInput.addEventListener('change', (e) => {
  if (e.target.files) addFiles(e.target.files);
  fileInput.value = '';
});
['dragenter', 'dragover'].forEach(ev => dropZone.addEventListener(ev, (e) => {
  e.preventDefault();
  dropZone.classList.add('border-brand-500', 'bg-brand-50/60');
}));
['dragleave', 'drop'].forEach(ev => dropZone.addEventListener(ev, (e) => {
  e.preventDefault();
  dropZone.classList.remove('border-brand-500', 'bg-brand-50/60');
}));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
});

function handleImagePaste(items) {
  const picked = [];
  for (const item of items) {
    if (item.type && item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) picked.push(f);
    }
  }
  if (!picked.length) return false;
  if (modeSel.value !== 'edits' && modeSel.value !== 'responses') {
    modeSel.value = 'responses';
    modeSel.dispatchEvent(new Event('change'));
  }
  addFiles(picked);
  setStatus(null, `已粘贴 ${picked.length} 张图`, 'ok');
  setTimeout(() => setStatus(null, ''), 2500);
  return true;
}
document.addEventListener('paste', (e) => {
  const active = document.getElementById('tab-generate').classList.contains('active');
  if (!active) return;
  if (e.defaultPrevented) return;
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  if (handleImagePaste(items)) e.preventDefault();
});
promptEl.addEventListener('paste', (e) => {
  if (e.defaultPrevented) return;
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  let hasImage = false;
  for (const item of items) if (item.type && item.type.startsWith('image/')) { hasImage = true; break; }
  if (!hasImage) return;
  if (handleImagePaste(items)) e.preventDefault();
});

function getPos(e) {
  const rect = maskCanvas.getBoundingClientRect();
  const p = e.touches ? e.touches[0] : e;
  return { x: p.clientX - rect.left, y: p.clientY - rect.top };
}
function drawStroke(x, y) {
  if (!maskCtx) return;
  maskCtx.globalCompositeOperation = currentTool === 'eraser' ? 'destination-out' : 'source-over';
  maskCtx.fillStyle = 'rgba(239, 68, 68, 0.55)';
  maskCtx.beginPath();
  maskCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
  maskCtx.fill();
}
function drawLine(x0, y0, x1, y1) {
  if (!maskCtx) return;
  maskCtx.globalCompositeOperation = currentTool === 'eraser' ? 'destination-out' : 'source-over';
  maskCtx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
  maskCtx.lineWidth = brushSize;
  maskCtx.beginPath();
  maskCtx.moveTo(x0, y0);
  maskCtx.lineTo(x1, y1);
  maskCtx.stroke();
}
function startDraw(e) { if (!maskCtx) return; e.preventDefault(); drawing = true; lastPoint = getPos(e); drawStroke(lastPoint.x, lastPoint.y); }
function moveDraw(e) { if (!drawing) return; e.preventDefault(); const p = getPos(e); drawLine(lastPoint.x, lastPoint.y, p.x, p.y); drawStroke(p.x, p.y); lastPoint = p; }
function endDraw() { drawing = false; lastPoint = null; }
maskCanvas.addEventListener('mousedown', startDraw);
window.addEventListener('mousemove', moveDraw);
window.addEventListener('mouseup', endDraw);
maskCanvas.addEventListener('touchstart', startDraw, { passive: false });
maskCanvas.addEventListener('touchmove', moveDraw, { passive: false });
maskCanvas.addEventListener('touchend', endDraw);
function setTool(t) {
  currentTool = t;
  document.querySelectorAll('.tool-btn').forEach(btn => {
    const active = btn.dataset.tool === t;
    btn.classList.toggle('bg-white', active);
    btn.classList.toggle('text-slate-700', active);
    btn.classList.toggle('shadow-sm', active);
    btn.classList.toggle('text-slate-500', !active);
  });
}
document.getElementById('tool-brush').addEventListener('click', () => setTool('brush'));
document.getElementById('tool-eraser').addEventListener('click', () => setTool('eraser'));
brushSizeInput.addEventListener('input', (e) => {
  brushSize = parseInt(e.target.value, 10);
  brushSizeLabel.textContent = brushSize;
});
setTool('brush');

/* -------------------- history records -------------------- */
function loadHistoryRecords() {
  return appState.historyRecords.slice();
}

async function saveHistoryRecords(records) {
  const arr = Array.isArray(records) ? records.slice(-MAX_HISTORY) : [];
  appState.historyRecords = arr;
  await idbClear(STORE_HISTORY);
  for (const record of arr) await idbPut(STORE_HISTORY, record);
  refreshHistoryHeader();
}

async function createHistoryRecord(meta) {
  const arr = loadHistoryRecords();
  const rec = {
    id: uid(),
    ts: Date.now(),
    status: 'pending',
    inputThumbs: [],
    outputThumbs: [],
    error: '',
    raw: '',
    ...meta
  };
  arr.push(rec);
  await saveHistoryRecords(arr);
  renderHistoryTab();
  return rec.id;
}

async function updateHistoryRecord(id, patch) {
  const arr = loadHistoryRecords();
  const idx = arr.findIndex(r => r.id === id);
  if (idx < 0) return;
  arr[idx] = { ...arr[idx], ...patch };
  await saveHistoryRecords(arr);
  renderHistoryTab();
}

async function deleteHistoryRecord(id) {
  const arr = loadHistoryRecords().filter(r => r.id !== id);
  await saveHistoryRecords(arr);
  renderHistoryTab();
}

async function clearHistoryStore() {
  appState.historyRecords = [];
  await idbClear(STORE_HISTORY);
  refreshHistoryHeader();
  renderHistoryTab();
}

function refreshHistoryHeader() {
  const tag = document.getElementById('history-tag');
  const n = loadHistoryRecords().length;
  tag.textContent = n ? `· 历史 ${n} 条` : '· 历史空';
}
async function collectThumbsFromFiles(files, maxCount = 12) {
  const arr = [];
  for (const f of (files || []).slice(0, maxCount)) {
    try {
      arr.push(await shrinkToThumb(f, 128, 0.62));
    } catch {}
  }
  return arr;
}
async function collectThumbsFromHits(hits, maxCount = 8) {
  const arr = [];
  for (const hit of (hits || []).slice(0, maxCount)) {
    const src = hit?.dataUrl || hit?.url || '';
    if (!src) continue;
    try {
      arr.push(await shrinkToThumb(src, 768, 0.75));
    } catch {
      arr.push(src);
    }
  }
  return arr;
}
function isHistoryTabActive() {
  return document.getElementById('tab-history').classList.contains('active');
}
async function shrinkToThumb(src, maxEdge = 256, q = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      const scale = Math.min(1, maxEdge / Math.max(w, h));
      const tw = Math.max(1, Math.round(w * scale));
      const th = Math.max(1, Math.round(h * scale));
      const c = document.createElement('canvas');
      c.width = tw; c.height = th;
      try {
        c.getContext('2d').drawImage(img, 0, 0, tw, th);
        resolve(c.toDataURL('image/jpeg', q));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = reject;
    if (src instanceof File || src instanceof Blob) img.src = URL.createObjectURL(src);
    else img.src = src;
  });
}

/* -------------------- history tab rendering -------------------- */
const historySearch = document.getElementById('history-search');
const historySummary = document.getElementById('history-summary');
const historyList = document.getElementById('history-list');

function thumbButton(src, label) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'relative aspect-square rounded-xl overflow-hidden ring-1 ring-slate-200 bg-slate-50 hover:ring-brand-300 hover:shadow-sm transition';
  const img = document.createElement('img');
  img.src = src;
  img.className = 'w-full h-full object-cover block';
  btn.appendChild(img);
  const tag = document.createElement('span');
  tag.className = 'absolute top-1.5 left-1.5 bg-black/55 text-white text-[10px] font-mono px-1.5 py-0.5 rounded';
  tag.textContent = label;
  btn.appendChild(tag);
  btn.addEventListener('click', () => openAnyImageInDecoder(src));
  return btn;
}
function renderHistoryTab() {
  const query = (historySearch?.value || '').trim().toLowerCase();
  const records = loadHistoryRecords().slice().reverse();
  const filtered = records.filter(r => {
    if (!query) return true;
    const hay = [
      r.mode, r.model, r.size, r.prompt, r.error, r.status,
      ...(r.inputThumbs || []),
      ...(r.outputThumbs || [])
    ].join(' ').toLowerCase();
    return hay.includes(query);
  });

  historyList.innerHTML = '';
  if (!records.length) {
    historySummary.textContent = '暂无历史记录。';
    historyList.innerHTML = `<div class="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-2xl p-6">当前没有历史记录。生成完成后会自动写入这里。点击历史图片会打开 Base64 解析器预览。</div>`;
    return;
  }

  const doneCount = records.filter(r => r.status === 'done').length;
  const errCount = records.filter(r => r.status === 'error').length;
  historySummary.textContent = `共 ${records.length} 条记录 · 成功 ${doneCount} · 失败 ${errCount} · 当前显示 ${filtered.length} 条`;

  if (!filtered.length) {
    historyList.innerHTML = `<div class="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-2xl p-6">没有匹配到结果。</div>`;
    return;
  }

  for (const rec of filtered) {
    const card = document.createElement('div');
    card.className = 'rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm';

    const top = document.createElement('div');
    top.className = 'flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2';

    const left = document.createElement('div');
    left.className = 'flex flex-wrap items-center gap-2';

    const modeBadge = document.createElement('span');
    modeBadge.className = 'text-[10px] font-semibold px-2 py-1 rounded-full bg-brand-50 text-brand-700 border border-brand-100';
    modeBadge.textContent = (rec.mode || 'unknown').toUpperCase();
    left.appendChild(modeBadge);

    const statusBadge = document.createElement('span');
    const statusClass = rec.status === 'done'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
      : rec.status === 'error'
        ? 'bg-rose-50 text-rose-700 border-rose-100'
        : 'bg-amber-50 text-amber-700 border-amber-100';
    statusBadge.className = `text-[10px] font-semibold px-2 py-1 rounded-full border ${statusClass}`;
    statusBadge.textContent = rec.status || 'pending';
    left.appendChild(statusBadge);

    if (rec.model) {
      const modelBadge = document.createElement('span');
      modelBadge.className = 'text-[10px] font-semibold px-2 py-1 rounded-full bg-slate-50 text-slate-600 border border-slate-200 font-mono';
      modelBadge.textContent = rec.model;
      left.appendChild(modelBadge);
    }

    if (rec.size) {
      const sizeBadge = document.createElement('span');
      sizeBadge.className = 'text-[10px] font-semibold px-2 py-1 rounded-full bg-slate-50 text-slate-600 border border-slate-200 font-mono';
      sizeBadge.textContent = rec.size;
      left.appendChild(sizeBadge);
    }

    const time = document.createElement('div');
    time.className = 'text-xs text-slate-400';
    time.textContent = fmtTime(rec.ts);
    top.appendChild(left);
    top.appendChild(time);
    card.appendChild(top);

    const prompt = document.createElement('div');
    prompt.className = 'mt-3 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap break-words';
    prompt.textContent = rec.prompt || '(无 prompt)';
    card.appendChild(prompt);

    if (rec.inputThumbs && rec.inputThumbs.length) {
      const sec = document.createElement('div');
      sec.className = 'mt-4';
      const label = document.createElement('div');
      label.className = 'text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2';
      label.textContent = '输入图片';
      sec.appendChild(label);
      const grid = document.createElement('div');
      grid.className = 'grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-6 gap-2';
      rec.inputThumbs.forEach((src, idx) => grid.appendChild(thumbButton(src, `I${idx + 1}`)));
      sec.appendChild(grid);
      card.appendChild(sec);
    }

    if (rec.outputThumbs && rec.outputThumbs.length) {
      const sec = document.createElement('div');
      sec.className = 'mt-4';
      const label = document.createElement('div');
      label.className = 'text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2';
      label.textContent = '输出图片（点击可用 Base64 解析器查看）';
      sec.appendChild(label);
      const grid = document.createElement('div');
      grid.className = 'grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2';
      rec.outputThumbs.forEach((src, idx) => grid.appendChild(thumbButton(src, `O${idx + 1}`)));
      sec.appendChild(grid);
      card.appendChild(sec);
    }

    if (rec.error) {
      const err = document.createElement('div');
      err.className = 'mt-4 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl p-3 break-all';
      err.textContent = rec.error;
      card.appendChild(err);
    }

    const footer = document.createElement('div');
    footer.className = 'mt-4 flex flex-wrap items-center gap-2';

    const openFirst = document.createElement('button');
    openFirst.className = 'px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600';
    openFirst.textContent = '查看首图';
    openFirst.disabled = !(rec.outputThumbs && rec.outputThumbs.length) && !(rec.inputThumbs && rec.inputThumbs.length);
    openFirst.addEventListener('click', () => {
      const src = (rec.outputThumbs && rec.outputThumbs[0]) || (rec.inputThumbs && rec.inputThumbs[0]);
      if (src) openAnyImageInDecoder(src);
    });
    footer.appendChild(openFirst);

    if (rec.prompt) {
      const copyPrompt = document.createElement('button');
      copyPrompt.className = 'px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600';
      copyPrompt.textContent = '复制 prompt';
      copyPrompt.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(rec.prompt); copyPrompt.textContent = '已复制'; setTimeout(() => copyPrompt.textContent = '复制 prompt', 1200); } catch {}
      });
      footer.appendChild(copyPrompt);
    }

    const del = document.createElement('button');
    del.className = 'px-3 py-1.5 text-xs rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600';
    del.textContent = '删除记录';
    del.addEventListener('click', async () => {
      if (!confirm('删除这条历史记录？')) return;
      await deleteHistoryRecord(rec.id);
    });
    footer.appendChild(del);

    card.appendChild(footer);
    historyList.appendChild(card);
  }
}
historySearch.addEventListener('input', renderHistoryTab);
document.getElementById('history-refresh').addEventListener('click', renderHistoryTab);
document.getElementById('history-clear').addEventListener('click', async () => {
  if (!confirm('清空全部历史记录？')) return;
  await clearHistoryStore();
});

/* -------------------- helper for generation output -------------------- */
function findImageInText(text) {
  if (typeof text !== 'string') return null;
  const im = text.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (im) {
    const u = im[1];
    if (u.startsWith('data:')) { try { return { dataUrl: normalizeToDataUrl(u).dataUrl }; } catch {} }
    else if (u.startsWith('http')) return { url: u };
  }
  const dm = text.match(/(?:data:image\/[a-z]+;base64,)+([A-Za-z0-9+/=\s]+?)(?=["'\s<)]|$)/i);
  if (dm) { try { return { dataUrl: normalizeToDataUrl(dm[0]).dataUrl }; } catch {} }
  const md = text.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/);
  if (md) return { url: md[1] };
  const bu = text.match(/https?:\/\/[^\s"'<>)]+\.(?:png|jpe?g|gif|webp)(?:\?[^\s"'<>)]*)?/i);
  if (bu) return { url: bu[0] };
  const bb = text.match(/[A-Za-z0-9+/=]{200,}/);
  if (bb) { try { return { dataUrl: normalizeToDataUrl(bb[0]).dataUrl }; } catch {} }
  return null;
}
function extractImage(resp) {
  if (resp && Array.isArray(resp.output)) {
    for (const item of resp.output) {
      if (item && item.type === 'image_generation_call') {
        const r = item.result || item.output || item.image || item.b64_json;
        if (typeof r === 'string') {
          try { return { dataUrl: normalizeToDataUrl(r).dataUrl }; } catch {}
        } else if (r && typeof r === 'object') {
          const u = r.url || r.image_url || r.b64_json || r.image || r.src || r.result;
          if (typeof u === 'string') {
            if (u.startsWith('data:')) { try { return { dataUrl: normalizeToDataUrl(u).dataUrl }; } catch {} }
            if (u.startsWith('http')) return { url: u };
            try { return { dataUrl: normalizeToDataUrl(u).dataUrl }; } catch {}
          }
        }
      }
      if (item && item.type === 'message' && Array.isArray(item.content)) {
        for (const part of item.content) {
          if (part && (part.type === 'output_image' || part.type === 'image')) {
            const u = part.image_url || part.url || part.b64_json || part.image || part.src;
            if (typeof u === 'string') {
              if (u.startsWith('data:')) { try { return { dataUrl: normalizeToDataUrl(u).dataUrl }; } catch {} }
              else if (u.startsWith('http')) return { url: u };
              else { try { return { dataUrl: normalizeToDataUrl(u).dataUrl }; } catch {} }
            }
          }
          if (part && typeof part.text === 'string') {
            const hit = findImageInText(part.text);
            if (hit) return hit;
          }
        }
      }
    }
  }
  if (resp && Array.isArray(resp.data)) {
    for (const item of resp.data) {
      if (item.url) return { url: item.url };
      if (item.b64_json) { try { return { dataUrl: normalizeToDataUrl(item.b64_json).dataUrl }; } catch {} }
    }
  }
  if (resp && Array.isArray(resp.choices)) {
    for (const c of resp.choices) {
      const msg = c.message || c.delta || {};
      const sideChannels = [];
      if (Array.isArray(msg.images)) sideChannels.push(...msg.images);
      if (msg.image) sideChannels.push(msg.image);
      if (Array.isArray(msg.attachments)) sideChannels.push(...msg.attachments);
      for (const item of sideChannels) {
        if (typeof item === 'string') {
          if (item.startsWith('data:')) { try { return { dataUrl: normalizeToDataUrl(item).dataUrl }; } catch {} }
          else if (item.startsWith('http')) return { url: item };
        } else if (item && typeof item === 'object') {
          const u = item.url || item.image_url || item.b64_json || item.image || item.src;
          if (typeof u === 'string') {
            if (u.startsWith('data:')) { try { return { dataUrl: normalizeToDataUrl(u).dataUrl }; } catch {} }
            else if (u.startsWith('http')) return { url: u };
            else { try { return { dataUrl: normalizeToDataUrl(u).dataUrl }; } catch {} }
          }
        }
      }
      const content = msg.content;
      if (typeof content === 'string') {
        const hit = findImageInText(content);
        if (hit) return hit;
      } else if (Array.isArray(content)) {
        for (const part of content) {
          if (part.type === 'image_url' && part.image_url) {
            const u = typeof part.image_url === 'string' ? part.image_url : part.image_url.url;
            if (u) {
              if (u.startsWith('data:')) { try { return { dataUrl: normalizeToDataUrl(u).dataUrl }; } catch {} }
              else return { url: u };
            }
          }
          if (typeof part.text === 'string') {
            const hit = findImageInText(part.text);
            if (hit) return hit;
          }
        }
      }
    }
  }
  return findImageInText(JSON.stringify(resp));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}
function canvasToDataUrl(canvas, type) {
  type = type || 'image/png';
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.readAsDataURL(blob);
    }, type);
  });
}
async function buildMaskedComposite(img) {
  const htmlImg = await new Promise((res, rej) => {
    const x = new Image();
    x.onload = () => res(x);
    x.onerror = rej;
    x.src = img.objectUrl;
  });
  const out = document.createElement('canvas');
  out.width = img.naturalWidth || htmlImg.naturalWidth;
  out.height = img.naturalHeight || htmlImg.naturalHeight;
  const ctx = out.getContext('2d');
  ctx.drawImage(htmlImg, 0, 0, out.width, out.height);
  ctx.drawImage(img.mask, 0, 0, out.width, out.height);
  return canvasToDataUrl(out);
}
function buildHeader(prompt, imgs, sizeSuffix = '') {
  const anyMasked = imgs.some(im => canvasHasStrokes(im.mask));
  if (!imgs.length) return prompt;
  if (anyMasked) {
    return `Attached are ${imgs.length} reference image(s). For any image followed by a red-overlay duplicate, treat the red overlay as instruction only. Modify ONLY the red region; pixels outside must remain unchanged.\n\nInstruction:\n${prompt}${sizeSuffix}`;
  }
  return `Attached are ${imgs.length} reference image(s). Use them as visual context. Do not collage unless explicitly requested.\n\nInstruction:\n${prompt}${sizeSuffix}`;
}

/* -------------------- clear current session -------------------- */
document.getElementById('gen-clear').addEventListener('click', () => {
  if (!confirm('清空当前会话？（不会删除历史记录）')) return;
  chatEl.innerHTML = '';
  setStatus(null, '');
  promptEl.value = '';
  images.splice(0).forEach(im => { try { URL.revokeObjectURL(im.objectUrl); } catch {} });
  editingIdx = -1;
  imgEditor.classList.add('hidden');
  renderGrid();
});

/* -------------------- enter to send -------------------- */
promptEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.getElementById('gen-send').click();
  }
});

/* -------------------- current chat UI -------------------- */
function addMsg(role, node, opts = {}) {
  const isUser = role === 'user';
  const wrap = document.createElement('div');
  wrap.className = `flex flex-col gap-1.5 mb-6 ${opts.instant ? '' : 'animate-fade-in'} w-full ${isUser ? 'items-end msg-user' : 'items-start msg-bot'}`;

  const label = document.createElement('div');
  label.className = `msg-label text-[11px] font-semibold tracking-wider px-1 ${isUser ? 'text-brand-500' : 'text-slate-400'}`;
  label.textContent = isUser ? 'You' : 'AI Assistant';
  wrap.appendChild(label);

  const isMultilineUserText = isUser && typeof node === 'string' && /[\r\n]/.test(node);
  const userBubbleKind = !isUser ? '' : typeof node === 'string' ? (isMultilineUserText ? 'msg-user-multiline' : 'msg-user-single') : 'msg-user-rich';
  const bubble = document.createElement('div');
  bubble.className = `msg-bubble text-[13px] sm:text-[14px] ${isUser ? userBubbleKind : 'px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl max-w-[95%] sm:max-w-[85%] leading-relaxed'} break-words shadow-sm overflow-hidden`;
  if (typeof node === 'string') {
    if (isUser) {
      const text = document.createElement('span');
      text.className = isMultilineUserText ? 'msg-user-multiline-inner' : 'msg-user-single-inner';
      text.textContent = node;
      bubble.appendChild(text);
    } else {
      bubble.textContent = node;
    }
  } else {
    bubble.appendChild(node);
  }
  wrap.appendChild(bubble);

  chatEl.appendChild(wrap);
  if (!opts.noScroll) chatEl.scrollTo({ top: chatEl.scrollHeight, behavior: opts.instant ? 'auto' : 'smooth' });
  return bubble;
}

function appendRawResponseDetails(target, rawText, notices = []) {
  if (!target) return null;
  const payload = [notices.filter(Boolean).join('\n'), rawText].filter(Boolean).join('\n\n').trim();
  if (!payload) return null;

  const details = document.createElement('details');
  details.className = 'assistant-raw-details mt-3 w-full';

  const summary = document.createElement('summary');
  summary.className = 'assistant-raw-summary';
  summary.innerHTML = `<span>请求原始响应</span><svg class="assistant-raw-arrow" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M7 4l6 6-6 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
  details.appendChild(summary);

  const pre = document.createElement('pre');
  pre.className = 'assistant-raw-pre';
  pre.textContent = payload;
  details.appendChild(pre);

  target.appendChild(details);
  return details;
}

function makeDownloadBtn(link, idx) {
  const ext = (() => {
    if (link.startsWith('data:')) {
      const m = link.match(/^data:image\/(\w+)/);
      return m ? (m[1] === 'jpeg' ? 'jpg' : m[1]) : 'png';
    }
    const m = link.match(/\.(png|jpe?g|webp|gif)(?:\?|$)/i);
    return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'png';
  })();
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ml-1 px-1.5 py-0.5 text-[10px] text-brand-600 hover:text-white hover:bg-brand-600 bg-white border border-brand-200 rounded transition-colors';
  btn.textContent = '下载';
  const trigger = (href, filename, revoke) => {
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (revoke) setTimeout(() => URL.revokeObjectURL(href), 1500);
  };
  btn.addEventListener('click', async () => {
    const filename = `micu-${Date.now()}-${(idx || 0) + 1}.${ext}`;
    if (link.startsWith('data:')) {
      trigger(link, filename);
      btn.textContent = '已下载';
      setTimeout(() => { btn.textContent = '下载'; }, 1600);
      return;
    }
    btn.disabled = true;
    btn.textContent = '下载中...';
    try {
      const response = await fetch(link, { mode: 'cors', cache: 'no-store', credentials: 'omit' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const blob = await response.blob();
      trigger(URL.createObjectURL(blob), filename, true);
      btn.textContent = '已下载';
    } catch (error) {
      btn.textContent = '右键另存';
      btn.title = `跨域下载失败：${error.message}。请在图片上右键另存。`;
    } finally {
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = '下载';
      }, 3000);
    }
  });
  return btn;
}

function estimateRequestPayloadMB(mode, n) {
  let totalBytes = 0;
  if (mode === 'edits' || mode === 'responses') {
    for (const im of images) totalBytes += im.file?.size || 0;
  }
  const batchMode = mode === 'edits' && images.length >= 2 && document.getElementById('cfg-batch-mode')?.checked;
  const multiplier = batchMode ? 1 : Math.max(1, n || 1);
  return totalBytes * 1.33 * multiplier / 1024 / 1024;
}

/* -------------------- send logic -------------------- */
document.getElementById('gen-send').addEventListener('click', async () => {
  const baseurl = document.getElementById('cfg-baseurl').value.trim().replace(/\/+$/, '');
  const key = document.getElementById('cfg-key').value.trim();
  const model = document.getElementById('cfg-model').value.trim();
  const mode = document.getElementById('cfg-mode').value;
  const size = document.getElementById('cfg-size').value.trim();
  const n = parseInt(document.getElementById('cfg-n').value, 10) || 1;
  const prompt = document.getElementById('gen-prompt').value.trim();
  const genOpts = getGenerationOptions();
  const sizeMatch = /^(\d+)x(\d+)$/i.exec(size);
  const sizeDirective = sizeMatch
    ? `Output the full image at exactly ${sizeMatch[1]}x${sizeMatch[2]} pixels.`
    : 'Output the full image, same dimensions as the input if applicable.';
  const sizeSuffix = sizeMatch ? ` At exactly ${sizeMatch[1]}x${sizeMatch[2]} pixels.` : '';

  if (!baseurl || !key || !model || !prompt) {
    setStatus(null, '请填写完整的接口配置与 Prompt', 'err');
    return;
  }
  if (mode === 'edits' && images.length === 0) {
    setStatus(null, '请先上传至少一张参考图片', 'err');
    return;
  }

  if (mode === 'edits' && isMicuApi(baseurl) && isGptImage2Family(model) && !/pro/i.test(model) && sizeMatch && Math.max(+sizeMatch[1], +sizeMatch[2]) >= 1600) {
    setStatus(null, '当前米醋接口的图生图仅建议 1K，请把 size 改到 ≤1536，或切到文生图 / Responses', 'err');
    return;
  }

  if (mode === 'edits' && editingIdx >= 0) persistCurrentMask();

  if (genOpts.persistPrompt && prompt) {
    try { localStorage.setItem(LAST_PROMPT_KEY, prompt); } catch {}
  }
  const promptInput = document.getElementById('gen-prompt');
  if (genOpts.clearOnSubmit) promptInput.value = '';
  await saveCfg('');

  const userFiles = (mode === 'edits' || mode === 'responses') ? images.map(i => i.file) : [];
  const inputThumbs = await collectThumbsFromFiles(userFiles);
  const historyId = await createHistoryRecord({
    mode,
    model,
    size,
    prompt,
    inputThumbs,
    status: 'pending',
  });

  if (mode === 'edits' || mode === 'responses') {
    const wrap = document.createElement('div');
    const strip = document.createElement('div');
    strip.className = 'msg-user-attachments flex flex-wrap gap-1.5 mb-2';
    images.forEach((im) => {
      const box = document.createElement('div');
      box.className = 'relative';
      const t = document.createElement('img');
      t.src = im.objectUrl;
      t.className = 'w-16 h-16 object-cover rounded-md ring-1 ring-white/25 block';
      box.appendChild(t);
      if (canvasHasStrokes(im.mask)) {
        const dot = document.createElement('span');
        dot.className = 'absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full ring-2 ring-white';
        dot.title = '已涂抹';
        box.appendChild(dot);
      }
      strip.appendChild(box);
    });
    if (strip.childElementCount) wrap.appendChild(strip);
    const t = document.createElement('div');
    t.textContent = prompt;
    wrap.appendChild(t);
    addMsg('user', wrap);
  } else {
    addMsg('user', prompt);
  }

  const loader = document.createElement('div');
  loader.className = 'flex items-center gap-3 text-slate-500 font-medium text-sm py-1';
  loader.innerHTML = `<svg class="animate-spin w-4 h-4 text-brand-500" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> <span class="animate-pulse">正在生成图像...</span>`;
  const botBubble = addMsg('bot', loader);
  setStatus(null, '请求发送中...', '');

  const jsonHeaders = { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'Accept': 'application/json' };
  const multipartHeaders = { 'Authorization': 'Bearer ' + key, 'Accept': 'application/json' };

  const tryEndpoint = async (ep) => {
    let body, headers;
    if (ep.multipart) {
      body = ep.body;
      headers = multipartHeaders;
    } else {
      body = JSON.stringify(ep.body);
      headers = jsonHeaders;
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), genOpts.timeout * 1000);
    try {
      const r = await fetch(ep.url, { method: 'POST', headers, body, signal: ac.signal });
      const text = await r.text();
      return { r, text };
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error(`请求超时（${genOpts.timeout}s）。可以在接口配置里调大请求超时。`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };

  const fileToPngBlob = async (fileOrBlob) => {
    if (!(fileOrBlob instanceof Blob)) throw new Error('不是 Blob');
    if (fileOrBlob.type === 'image/png') return fileOrBlob;
    return new Blob([await fileOrBlob.arrayBuffer()], { type: 'image/png' });
  };

  const buildAlphaMaskBlob = async (im) => {
    if (!im || !canvasHasStrokes(im.mask)) return null;
    const w = im.naturalWidth || im.mask.width;
    const h = im.naturalHeight || im.mask.height;
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ctx = out.getContext('2d');
    ctx.fillStyle = 'rgb(255,255,255)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(im.mask, 0, 0, w, h);
    return await new Promise((resolve) => out.toBlob((b) => resolve(b), 'image/png'));
  };

  const buildEditsForm = async (im, p, sz, useMask, useModel) => {
    const fd = new FormData();
    fd.append('model', useModel || model);
    fd.append('prompt', p);
    if (sz) fd.append('size', sz);
    fd.append('response_format', 'b64_json');
    applyExtraGenerationParams(fd, true, genOpts);
    fd.append('image', await fileToPngBlob(im.file), im.file.name || 'image.png');
    if (useMask) {
      const mb = await buildAlphaMaskBlob(im);
      if (mb) fd.append('mask', mb, 'mask.png');
    }
    return fd;
  };

  const buildResponsesBody = async () => {
    const tool = { type: 'image_generation' };
    if (sizeMatch) tool.size = size;
    const body = { model, tools: [tool] };
    applyExtraGenerationParams(tool, false, genOpts);

    if (!images.length) {
      body.input = prompt;
      return body;
    }

    const header = buildHeader(prompt, images, sizeSuffix);
    const content = [{ type: 'input_text', text: header }];
    for (const im of images) {
      const dataUrl = await fileToDataUrl(im.file);
      content.push({ type: 'input_image', image_url: dataUrl });
      if (canvasHasStrokes(im.mask)) {
        const maskedUrl = await buildMaskedComposite(im);
        content.push({ type: 'input_image', image_url: maskedUrl });
      }
    }
    body.input = [{ role: 'user', content }];
    return body;
  };

  const buildChatContent = async () => {
    const header = buildHeader(prompt, images, sizeSuffix);
    const content = [{ type: 'text', text: header }];
    for (const im of images) {
      const dataUrl = await fileToDataUrl(im.file);
      content.push({ type: 'image_url', image_url: { url: dataUrl } });
      if (canvasHasStrokes(im.mask)) {
        const maskedUrl = await buildMaskedComposite(im);
        content.push({ type: 'image_url', image_url: { url: maskedUrl } });
      }
    }
    return content;
  };

  const batchMode = mode === 'edits' && images.length >= 2 && document.getElementById('cfg-batch-mode')?.checked;
  if (batchMode) {
    const batch = images.slice();
    const total = batch.length;
    botBubble.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3';
    const meta = document.createElement('div');
    meta.className = 'text-[11px] text-slate-500 bg-slate-50 border border-slate-100 p-2.5 rounded-md break-all space-y-2';
    const cells = batch.map((_, idx) => {
      const cell = document.createElement('div');
      cell.className = 'relative aspect-square rounded-lg ring-1 ring-slate-200 bg-slate-100 overflow-hidden checkerboard flex items-center justify-center text-[11px] text-slate-400';
      cell.textContent = '等待中';
      const tag = document.createElement('span');
      tag.className = 'absolute top-1.5 left-1.5 bg-black/55 text-white text-[10px] font-mono px-1.5 py-0.5 rounded';
      tag.textContent = `${idx + 1}/${total}`;
      cell.appendChild(tag);
      grid.appendChild(cell);
      return cell;
    });
    botBubble.appendChild(grid);
    botBubble.appendChild(meta);

    let done = 0;
    let failed = 0;
    const cellHits = new Array(total).fill(null);
    const cellErrors = new Array(total).fill('');
    const updateProgress = () => setStatus(null, `批处理中 ${done + failed}/${total}` + (failed ? ` · 失败 ${failed}` : ''), failed ? 'err' : '');

    const buildSingleEndpoints = async (im, useModel) => {
      const effModel = useModel || model;
      const masked = canvasHasStrokes(im.mask);
      const fd = await buildEditsForm(im, prompt, size, masked, effModel);
      const dataUrl = await fileToDataUrl(im.file);
      const header = masked
        ? `You are given two attached images: the FIRST is the original; the SECOND is the same image with a semi-transparent red overlay marking the ONLY region you may modify. Modify ONLY pixels inside the red region. ${sizeDirective}\n\nInstruction:\n${prompt}`
        : `Edit the attached image as described. ${sizeDirective}\n\nInstruction:\n${prompt}`;
      const chatContent = [{ type: 'text', text: header }, { type: 'image_url', image_url: { url: dataUrl } }];
      if (masked) {
        const maskedUrl = await buildMaskedComposite(im);
        chatContent.push({ type: 'image_url', image_url: { url: maskedUrl } });
      }
      const editsEp = { url: baseurl + '/v1/images/edits', body: fd, multipart: true };
      const chatEp = { url: baseurl + '/v1/chat/completions', body: { model: effModel, messages: [{ role: 'user', content: chatContent }] } };
      const bypass = /pro/i.test(effModel) && !!sizeMatch && Math.max(+sizeMatch[1], +sizeMatch[2]) >= 1600;
      return { primary: bypass ? chatEp : editsEp, fallback: bypass ? null : chatEp };
    };

    const renderBatchHit = (idx, hit) => {
      const link = hit.dataUrl || hit.url || '';
      const cell = cells[idx];
      cell.innerHTML = '';
      const a = document.createElement('a');
      a.href = link;
      a.target = '_blank';
      a.rel = 'noopener';
      const img = document.createElement('img');
      img.src = link;
      img.className = 'w-full h-full object-contain block';
      a.appendChild(img);
      cell.appendChild(a);
      const tag = document.createElement('span');
      tag.className = 'absolute top-1.5 left-1.5 bg-black/55 text-white text-[10px] font-mono px-1.5 py-0.5 rounded';
      tag.textContent = `${idx + 1}/${total}`;
      cell.appendChild(tag);
    };

    const renderBatchError = (idx, msg, retryModel) => {
      const cell = cells[idx];
      cell.innerHTML = '';
      const err = document.createElement('div');
      err.className = 'p-2 text-center text-[11px] text-rose-600 break-words';
      err.textContent = msg;
      cell.appendChild(err);
      if (retryModel) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'absolute bottom-1.5 left-1.5 right-1.5 text-[10px] font-semibold px-2 py-1 rounded bg-white/95 text-brand-600 border border-brand-200';
        btn.textContent = `用 ${retryModel} 重试`;
        btn.addEventListener('click', async () => {
          failed = Math.max(0, failed - 1);
          await runOne(batch[idx], idx, retryModel);
        });
        cell.appendChild(btn);
      }
    };

    const runOne = async (im, idx, useModel) => {
      cells[idx].textContent = '生成中...';
      try {
        const endpoints = await buildSingleEndpoints(im, useModel);
        let probe = await probeWithRetry(endpoints.primary);
        if (!probe.r.ok && endpoints.fallback && [0, 404, 405, 501, 503].includes(probe.r.status)) {
          probe = await probeWithRetry(endpoints.fallback);
        }
        if (!probe.r.ok) {
          if (probe.r.status === 0) {
            throw new Error(probe.r.statusText || '网络层失败');
          }
          let detail = '';
          try {
            const j = JSON.parse(probe.text);
            detail = (j.error && j.error.message) || j.message || JSON.stringify(j).slice(0, 240);
          } catch {
            detail = (probe.text || '').slice(0, 240);
          }
          throw new Error(`HTTP ${probe.r.status}` + (detail ? ` ${detail}` : ''));
        }
        let resp;
        try { resp = JSON.parse(probe.text); } catch { resp = probe.text; }
        const hit = extractImage(resp);
        if (!hit) throw new Error('响应中未找到图片');
        cellHits[idx] = hit;
        done++;
        renderBatchHit(idx, hit);
      } catch (error) {
        cellErrors[idx] = error.message;
        failed++;
        renderBatchError(idx, error.message, /pro/i.test(useModel || model) ? 'gpt-image-2' : null);
      } finally {
        updateProgress();
      }
    };

    const canRetry = [0, 429, 502, 503, 504];
    const probeWithRetry = async (ep) => {
      let p = await tryEndpoint(ep).catch((e) => ({ r: { ok: false, status: 0, statusText: e.message }, text: '' }));
      if (!p.r.ok && canRetry.includes(p.r.status) && /pro/i.test(model)) {
        await new Promise(r => setTimeout(r, 4000));
        p = await tryEndpoint(ep).catch((e) => ({ r: { ok: false, status: 0, statusText: e.message }, text: '' }));
      }
      return p;
    };

    updateProgress();
    const concurrency = /pro/i.test(model) ? 1 : Math.min(5, total);
    let cursor = 0;
    const worker = async () => {
      while (cursor < total) {
        const idx = cursor++;
        await runOne(batch[idx], idx);
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));

    const okHits = cellHits.filter(Boolean);
    meta.innerHTML = '';
    const summary = document.createElement('div');
    summary.textContent = failed ? `批处理 ${done}/${total} 成功 · ${failed} 失败` : `批处理完成 ${done}/${total}`;
    meta.appendChild(summary);
    cellHits.forEach((hit, idx) => {
      const row = document.createElement('div');
      row.className = 'border-l-2 border-brand-200 pl-2.5 py-0.5';
      if (hit) {
        const link = hit.dataUrl || hit.url || '';
        row.innerHTML = `<span class="font-medium text-slate-600">#${idx + 1} 链接：</span><a href="${link}" target="_blank" rel="noopener" class="text-brand-600 hover:underline">${link.startsWith('data:') ? `Base64（${(link.length / 1024).toFixed(0)} KB）` : link}</a>`;
        row.appendChild(makeDownloadBtn(link, idx));
      } else {
        row.textContent = `#${idx + 1} 失败：${cellErrors[idx] || '未知错误'}`;
      }
      meta.appendChild(row);
    });
    appendRawResponseDetails(botBubble, JSON.stringify({ batch: true, total, done, failed, errors: cellErrors.filter(Boolean) }, null, 2));
    setStatus(null, summary.textContent, failed ? 'err' : 'ok');
    await updateHistoryRecord(historyId, {
      status: failed && !okHits.length ? 'error' : 'done',
      outputThumbs: await collectThumbsFromHits(okHits),
      raw: JSON.stringify({ batch: true, total, done, failed, errors: cellErrors.filter(Boolean) }, null, 2),
      error: failed && !okHits.length ? cellErrors.filter(Boolean).join('\n') : '',
    });
    chatEl.scrollTo({ top: chatEl.scrollHeight, behavior: 'smooth' });
    return;
  }

  let primary = null;
  let fallback = null;

  if (mode === 'responses') {
    const body = await buildResponsesBody();
    primary = { url: baseurl + '/v1/responses', body };

    if (!images.length) {
      const fallbackBody = { model, prompt, n: 1, size, response_format: 'b64_json' };
      applyExtraGenerationParams(fallbackBody, false, genOpts);
      fallback = { url: baseurl + '/v1/images/generations', body: fallbackBody };
    } else if (images.length === 1) {
      const im = images[0];
      const masked = canvasHasStrokes(im.mask);
      const fd = await buildEditsForm(im, prompt, size, masked, model);
      fallback = { url: baseurl + '/v1/images/edits', body: fd, multipart: true };
    } else {
      const chatContent = await buildChatContent();
      fallback = { url: baseurl + '/v1/chat/completions', body: { model, messages: [{ role: 'user', content: chatContent }] } };
    }
  } else if (mode === 'images') {
    const genBody = { model, prompt, n: 1, size, response_format: 'b64_json' };
    applyExtraGenerationParams(genBody, false, genOpts);
    primary = { url: baseurl + '/v1/images/generations', body: genBody };
  } else if (mode === 'edits') {
    if (images.length === 1) {
      const im = images[0];
      const masked = canvasHasStrokes(im.mask);
      const fd = await buildEditsForm(im, prompt, size, masked, model);
      const dataUrl = await fileToDataUrl(im.file);
      const header = masked
        ? `You are given two attached images: the FIRST is the original; the SECOND is the same image with a semi-transparent red overlay marking the ONLY region you may modify. Modify ONLY pixels inside the red region. ${sizeDirective}\n\nInstruction:\n${prompt}`
        : `Edit the attached image as described. ${sizeDirective}\n\nInstruction:\n${prompt}`;
      const chatContent = [{ type: 'text', text: header }, { type: 'image_url', image_url: { url: dataUrl } }];
      if (masked) {
        const maskedUrl = await buildMaskedComposite(im);
        chatContent.push({ type: 'image_url', image_url: { url: maskedUrl } });
      }
      const editsEp = { url: baseurl + '/v1/images/edits', body: fd, multipart: true };
      const chatEp = { url: baseurl + '/v1/chat/completions', body: { model, messages: [{ role: 'user', content: chatContent }] } };
      const bypassEdits = /pro/i.test(model) && !!sizeMatch && Math.max(+sizeMatch[1], +sizeMatch[2]) >= 1600;
      primary = bypassEdits ? chatEp : editsEp;
      fallback = bypassEdits ? null : chatEp;
    } else {
      const chatContent = await buildChatContent();
      primary = { url: baseurl + '/v1/chat/completions', body: { model, messages: [{ role: 'user', content: chatContent }] } };
    }
  } else {
    primary = { url: baseurl + '/v1/chat/completions', body: { model, messages: [{ role: 'user', content: prompt }] } };
  }

  let rawText = '';
  let usedFallback = false;

  try {
    const probeWithRetry = async (ep) => {
      let p = await tryEndpoint(ep).catch((e) => ({ r: { ok: false, status: 0, statusText: e.message }, text: '' }));
      const canRetry = [0, 429, 502, 503, 504];
      if (!p.r.ok && canRetry.includes(p.r.status) && /pro/i.test(model)) {
        await new Promise(r => setTimeout(r, 3500));
        p = await tryEndpoint(ep).catch((e) => ({ r: { ok: false, status: 0, statusText: e.message }, text: '' }));
      }
      if (!p.r.ok && canRetry.includes(p.r.status) && /pro/i.test(model)) {
        await new Promise(r => setTimeout(r, 7000));
        p = await tryEndpoint(ep).catch((e) => ({ r: { ok: false, status: 0, statusText: e.message }, text: '' }));
      }
      return p;
    };

    let probe = await probeWithRetry(primary);
    if (!probe.r.ok && fallback && [0, 404, 405, 501, 503].includes(probe.r.status)) {
      usedFallback = true;
      probe = await probeWithRetry(fallback);
    }
    rawText = probe.text;

    const chosen = usedFallback ? fallback : primary;
    const allResps = [probe];

    const repeatable = !(chosen && chosen.multipart);
    const wantMore = mode !== 'chat' && n > 1 && probe.r.ok && repeatable;
    if (wantMore) {
      const extra = await Promise.all(Array.from({ length: n - 1 }, () =>
        tryEndpoint(chosen).catch((err) => ({ r: { ok: false, status: 0, statusText: err.message || 'fetch failed' }, text: '' }))
      ));
      allResps.push(...extra);
    }

    let firstResp;
    try { firstResp = JSON.parse(probe.text); } catch { firstResp = probe.text; }

    const notices = [];
    if (usedFallback) notices.push('[主路径失败，已自动切换到次选路径]');
    if (allResps.length > 1) notices.push(`[N=${n}：已发起 ${allResps.length} 次请求]`);

    if (!probe.r.ok) {
      if (probe.r.status === 0) {
        throw new Error(probe.r.statusText || '网络层失败');
      }
      let detail = '';
      try {
        const j = JSON.parse(probe.text);
        detail = (j.error && j.error.message) || j.message || JSON.stringify(j).slice(0, 400);
      } catch {
        detail = (probe.text || '').slice(0, 400);
      }
      throw new Error('HTTP ' + probe.r.status + (probe.r.statusText ? ' ' + probe.r.statusText : '') + (detail ? '\n→ ' + detail : ''));
    }

    const hits = [];
    let textFallback = '';
    for (const res of allResps) {
      if (!res.r.ok) continue;
      let resp;
      try { resp = JSON.parse(res.text); } catch { resp = res.text; }
      const hit = extractImage(resp);
      if (hit) hits.push(hit);
      else if (!textFallback) {
        if (resp && resp.choices) {
          for (const c of resp.choices) {
            const m = c.message || c.delta || {};
            if (typeof m.content === 'string') textFallback += m.content;
          }
        }
        if (!textFallback && resp && Array.isArray(resp.output)) {
          for (const item of resp.output) {
            if (item && Array.isArray(item.content)) {
              for (const part of item.content) {
                if (part && typeof part.text === 'string') textFallback += part.text;
              }
            }
          }
          if (!textFallback && typeof resp.output_text === 'string') textFallback = resp.output_text;
        }
      }
    }

    botBubble.innerHTML = '';

    if (hits.length) {
      const isMulti = hits.length > 1;
      const container = isMulti ? document.createElement('div') : botBubble;
      if (isMulti) container.className = 'grid grid-cols-2 gap-2 mb-3';

      hits.forEach((hit, idx) => {
        const wrap = document.createElement('div');
        wrap.className = isMulti ? 'relative' : 'relative mb-3';
        const img = document.createElement('img');
        img.src = hit.dataUrl || hit.url;
        img.className = 'max-w-full rounded-lg shadow-sm border border-slate-100 object-contain checkerboard ' + (isMulti ? 'w-full max-h-[260px]' : 'max-h-[400px]');
        wrap.appendChild(img);
        const sizeChip = document.createElement('span');
        sizeChip.className = 'absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[10px] font-mono px-1.5 py-0.5 rounded pointer-events-none';
        sizeChip.textContent = '...';
        wrap.appendChild(sizeChip);
        img.addEventListener('load', () => {
          sizeChip.textContent = `${img.naturalWidth}×${img.naturalHeight}`;
        }, { once: true });
        if (isMulti) {
          const tag = document.createElement('span');
          tag.className = 'absolute top-1.5 left-1.5 bg-black/55 text-white text-[10px] font-mono px-1.5 py-0.5 rounded';
          tag.textContent = `${idx + 1}/${hits.length}`;
          wrap.appendChild(tag);
        }
        container.appendChild(wrap);
      });
      if (isMulti) botBubble.appendChild(container);

      const meta = document.createElement('div');
      meta.className = 'text-[11px] text-slate-500 bg-slate-50 border border-slate-100 p-2.5 rounded-md break-all space-y-1';

      hits.forEach((hit, idx) => {
        const link = hit.url || hit.dataUrl || '';
        const isData = link.startsWith('data:');
        const linkLabel = isData ? `Base64（${(link.length / 1024).toFixed(0)} KB）` : link;
        const row = document.createElement('div');
        row.className = 'border-l-2 border-brand-200 pl-2.5 py-0.5';
        row.innerHTML = `<span class="font-medium text-slate-600">${isMulti ? `#${idx + 1} ` : ''}链接：</span><a href="${link}" target="_blank" rel="noopener" class="text-brand-600 hover:underline">${linkLabel}</a>`;
        const copyBtn = document.createElement('button');
        copyBtn.className = 'ml-1 px-1.5 py-0.5 text-[10px] text-slate-500 hover:text-brand-600 bg-white border border-slate-200 rounded';
        copyBtn.textContent = '复制';
        copyBtn.addEventListener('click', () => navigator.clipboard.writeText(link).then(() => {
          copyBtn.textContent = '已复制';
          setTimeout(() => copyBtn.textContent = '复制', 1200);
        }));
        row.appendChild(copyBtn);
        row.appendChild(makeDownloadBtn(link, idx));
        meta.appendChild(row);
      });
      botBubble.appendChild(meta);
      appendRawResponseDetails(botBubble, typeof firstResp === 'string' ? firstResp : JSON.stringify(firstResp, null, 2), notices);

      setStatus(null, `生成完成 ${hits.length} 张` + (usedFallback ? '（已切换次选路径）' : ''), 'ok');
      await updateHistoryRecord(historyId, {
        status: 'done',
        outputThumbs: await collectThumbsFromHits(hits),
        raw: rawText,
        error: ''
      });
    } else {
      botBubble.textContent = textFallback || '响应中未找到图片';
      appendRawResponseDetails(botBubble, typeof firstResp === 'string' ? firstResp : JSON.stringify(firstResp, null, 2), notices);
      setStatus(null, '未识别到图片内容', 'err');
      await updateHistoryRecord(historyId, {
        status: 'done',
        outputThumbs: [],
        raw: rawText,
        error: '',
      });
    }
  } catch (e) {
    const netFail = /Failed to fetch|NetworkError|Load failed|ERR_|TypeError/i.test(e.message);
    let host = '该 API';
    try { host = new URL(baseurl).hostname; } catch {}
    const payloadMB = estimateRequestPayloadMB(mode, n);
    const bodyHint = payloadMB >= 4
      ? `<br><strong class="text-amber-700">这次请求体估算约 ${payloadMB.toFixed(1)}MB</strong>，部分代理 / serverless 网关会在 4-6MB 附近直接断开。建议开启批处理、减少参考图，或降低输入图尺寸。`
      : '';
    const hint = netFail
      ? `<div class="mt-2 text-[12px] text-slate-500 bg-slate-50 border border-slate-200 p-2.5 rounded-md leading-relaxed"><strong class="text-slate-700">这是浏览器网络层失败，不是接口返回的错误</strong>，可能是代理 / 防火墙 / 请求体过大。请检查 <code class="text-rose-500">${escapeHtml(host)}</code> 是否可达。${bodyHint}</div>`
      : '';
    botBubble.innerHTML = `<div class="text-rose-600"><span class="font-bold text-xs uppercase tracking-wider">Error</span><div class="text-[13px] bg-rose-50 border border-rose-100 p-3 rounded-md break-all mt-1">${escapeHtml(e.message)}</div>${hint}</div>`;
    appendRawResponseDetails(botBubble, rawText || String(e));
    setStatus(null, '请求失败', 'err');
    await updateHistoryRecord(historyId, { status: 'error', error: e.message, raw: rawText });
  }

  chatEl.scrollTo({ top: chatEl.scrollHeight, behavior: 'smooth' });
  if (genOpts.clearOnSubmit) clearAttachedImages();
});

/* -------------------- init -------------------- */
async function initApp() {
  try {
    await openAppDb();
    await migrateLegacyStorageIfNeeded();
    await loadProfilesFromDb();
    const activeMeta = await idbGet(STORE_META, 'activeProfileId');
    appState.currentProfileId = activeMeta?.value || DEFAULT_PROFILE_ID;
    if (!appState.profiles.find(item => item.id === appState.currentProfileId)) {
      appState.currentProfileId = DEFAULT_PROFILE_ID;
    }
    renderProfileOptions();
    await switchProfile(appState.currentProfileId);
    appState.historyRecords = (await idbGetAll(STORE_HISTORY))
      .sort((a, b) => (a.ts || 0) - (b.ts || 0))
      .slice(-MAX_HISTORY);
  } catch (error) {
    setStatus(document.getElementById('cfg-status'), `初始化 IndexedDB 失败：${error.message}`, 'err');
  }

  const params = new URLSearchParams(location.search);
  const aliases = {
    baseurl: 'cfg-baseurl',
    apiKey: 'cfg-key',
    key: 'cfg-key',
    model: 'cfg-model',
    mode: 'cfg-mode',
    size: 'cfg-size',
    n: 'cfg-n',
    quality: 'cfg-quality',
    format: 'cfg-format',
    background: 'cfg-background',
    moderation: 'cfg-moderation',
    compression: 'cfg-compression',
  };
  Object.entries(aliases).forEach(([param, id]) => {
    if (!params.has(param)) return;
    const el = document.getElementById(id);
    if (el) el.value = params.get(param);
  });
  if (params.has('prompt')) promptEl.value = params.get('prompt');
  if (!promptEl.value && getGenerationOptions().persistPrompt) {
    try { promptEl.value = localStorage.getItem(LAST_PROMPT_KEY) || ''; } catch {}
  }

  modelSync.syncFromInput();
  sizeSync.syncFromInput();
  document.getElementById('cfg-baseurl').dispatchEvent(new Event('input'));
  document.getElementById('cfg-model').dispatchEvent(new Event('input'));
  document.getElementById('cfg-size').dispatchEvent(new Event('input'));
  document.getElementById('cfg-format').dispatchEvent(new Event('change'));
  document.getElementById('cfg-compression').dispatchEvent(new Event('input'));
  document.getElementById('cfg-mode').dispatchEvent(new Event('change'));
  setConfigCollapsed(false);
  refreshHistoryHeader();
  renderHistoryTab();
}

initApp();
