const $ = id => document.getElementById(id);
const $$ = (sel, ctx) => (ctx || document).querySelectorAll(sel);

/* ---------- Utilities ---------- */
function setStatus(el, msg, type = '') {
  el.textContent = msg;
  el.className = `text-sm font-medium ${type === 'err' ? 'text-rose-500 dark:text-rose-400' : type === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`;
}

function escapeHtml(t) {
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}

async function copyTextToClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea'); ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (!ok) throw new Error('复制失败');
    return true;
  }
}

function safeUrl(u) {
  const s = (u || '').trim();
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(s)) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^blob:/i.test(s)) return s;
  return '';
}

function buildApiUrl(baseurl, path) {
  const base = (baseurl || '').trim().replace(/\/+$/, '');
  if (!base) return '';
  const p = path.startsWith('/') ? path : '/' + path;
  if (/\/v1$/i.test(base) && p.startsWith('/v1/')) return base + p.slice(3);
  return base + p;
}

function toast(msg, type = '') {
  const el = $('toast');
  el.textContent = msg;
  el.className = 'toast ' + (type === 'err' ? 'bg-rose-600 text-white' : type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-800');
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 2500);
}

/* ---------- Theme ---------- */
const THEME_KEY = 'mcu-theme-v1';
function applyTheme(mode) {
  document.documentElement.classList.toggle('dark', mode === 'dark');
  $('theme-icon-sun').classList.toggle('hidden', mode !== 'dark');
  $('theme-icon-moon').classList.toggle('hidden', mode === 'dark');
  localStorage.setItem(THEME_KEY, mode);
}
function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const mode = saved || getSystemTheme();
  applyTheme(mode);
}
$('theme-toggle').addEventListener('click', () => {
  const cur = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
  applyTheme(cur);
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
  if (!localStorage.getItem(THEME_KEY)) applyTheme(e.matches ? 'dark' : 'light');
});
initTheme();

/* ---------- Base64 Decode ---------- */
function normalizeToDataUrl(raw) {
  let s = (raw || '').trim();
  if (!s) throw new Error('输入内容不能为空');
  const prefixRe = /^data:[^;,]+;base64,/i;
  while (prefixRe.test(s)) s = s.replace(prefixRe, '');
  s = s.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(s)) throw new Error('包含非法的 Base64 字符');
  const sample = s.slice(0, 64);
  let bin;
  try { bin = atob(sample.padEnd(Math.ceil(sample.length / 4) * 4, '=')); }
  catch (e) { throw new Error('Base64 解码失败：' + e.message); }
  const b = [...bin].map(c => c.charCodeAt(0));
  let mime = 'image/png';
  if (b[0]===0x89 && b[1]===0x50 && b[2]===0x4e && b[3]===0x47) mime = 'image/png';
  else if (b[0]===0xff && b[1]===0xd8 && b[2]===0xff) mime = 'image/jpeg';
  else if (b[0]===0x47 && b[1]===0x49 && b[2]===0x46) mime = 'image/gif';
  else if (b[0]===0x52 && b[1]===0x49 && b[2]===0x46 && b[8]===0x57 && b[9]===0x45 && b[10]===0x42 && b[11]===0x50) mime = 'image/webp';
  return { dataUrl: 'data:' + mime + ';base64,' + s, mime, b64: s };
}

function findImagesInText(text) {
  if (typeof text !== 'string') return [];
  const results = []; const seen = new Set();
  const push = x => { const k = x.dataUrl || x.url || x.rawBase64; if (!seen.has(k)) { seen.add(k); results.push(x); } };
  let m;
  const dmRe = /data:image\/[a-z]+;base64,[A-Za-z0-9+/=\s]+?(?=["'\s<)]|$)/gi;
  while ((m = dmRe.exec(text)) !== null) { try { const norm = normalizeToDataUrl(m[0]); push({ dataUrl: norm.dataUrl, rawBase64: norm.b64 }); } catch {} }
  const mdRe = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g;
  while ((m = mdRe.exec(text)) !== null) push({ url: m[1] });
  const buRe = /https?:\/\/[^\s"'<>)]+\.(?:png|jpe?g|gif|webp)(?:\?[^\s"'<>)]*)?/gi;
  while ((m = buRe.exec(text)) !== null) push({ url: m[0] });
  const bbRe = /[A-Za-z0-9+/=]{200,}/g;
  while ((m = bbRe.exec(text)) !== null) { try { const norm = normalizeToDataUrl(m[0]); push({ dataUrl: norm.dataUrl, rawBase64: norm.b64 }); } catch {} }
  return results;
}

function extractImages(resp) {
  const results = []; const seen = new Set();
  const push = x => { const k = x.dataUrl || x.url || x.rawBase64; if (!seen.has(k)) { seen.add(k); results.push(x); } };
  if (resp && Array.isArray(resp.data)) {
    for (const item of resp.data) {
      if (item.url) push({ url: item.url });
      if (item.b64_json) { try { const norm = normalizeToDataUrl(item.b64_json); push({ dataUrl: norm.dataUrl, rawBase64: norm.b64 }); } catch {} }
    }
  }
  if (resp && Array.isArray(resp.choices)) {
    for (const c of resp.choices) {
      const msg = c.message || c.delta || {};
      const content = msg.content;
      if (typeof content === 'string') { findImagesInText(content).forEach(push); }
      else if (Array.isArray(content)) {
        for (const part of content) {
          if (part.type === 'image_url' && part.image_url) {
            const u = typeof part.image_url === 'string' ? part.image_url : part.image_url.url;
            if (u) {
              if (u.startsWith('data:')) { try { const norm = normalizeToDataUrl(u); push({ dataUrl: norm.dataUrl, rawBase64: norm.b64 }); } catch {} }
              else push({ url: u });
            }
          }
          if (typeof part.text === 'string') findImagesInText(part.text).forEach(push);
        }
      }
    }
  }
  if (results.length === 0) { try { findImagesInText(JSON.stringify(resp)).forEach(push); } catch {} }
  return results;
}

const b64In = $('b64-input'), b64Preview = $('b64-preview'), b64Img = $('b64-img'), b64Meta = $('b64-meta'), b64Status = $('b64-status'), b64Download = $('b64-download');

$('b64-decode').addEventListener('click', () => {
  setStatus(b64Status, '');
  try {
    const { dataUrl, mime, b64 } = normalizeToDataUrl(b64In.value);
    b64Img.src = dataUrl; b64Download.href = dataUrl;
    b64Download.download = 'image.' + mime.split('/')[1];
    const sizeKB = Math.round(b64.length * 0.75 / 1024);
    b64Meta.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
          <span class="block text-[10px] text-slate-400 dark:text-slate-500 uppercase mb-1">文件类型</span>
          <span class="font-mono text-brand-600 dark:text-brand-400 text-[13px] break-all">${mime}</span>
        </div>
        <div class="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
          <span class="block text-[10px] text-slate-400 dark:text-slate-500 uppercase mb-1">预估体积</span>
          <span class="font-mono text-brand-600 dark:text-brand-400 text-[13px] break-all">${sizeKB} KB</span>
        </div>
      </div>
      <div class="mt-3 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
        <span class="block text-[10px] text-slate-400 dark:text-slate-500 uppercase mb-1">Base64 字符总数</span>
        <span class="font-mono text-slate-700 dark:text-slate-300 text-[13px] break-all">${b64.length}</span>
      </div>`;
    b64Preview.classList.remove('hidden');
    setStatus(b64Status, '解析成功', 'ok');
  } catch (e) {
    b64Preview.classList.add('hidden');
    setStatus(b64Status, e.message, 'err');
  }
});

$('b64-clear').addEventListener('click', () => {
  b64In.value = ''; b64Preview.classList.add('hidden'); setStatus(b64Status, '');
});

$('b64-open').addEventListener('click', () => {
  if (b64Img.src) window.open(b64Img.src, '_blank', 'noopener,noreferrer');
});

/* ---------- Tabs ---------- */
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanels = { decode: $('tab-decode'), generate: $('tab-generate') };
function switchTab(tab) {
  tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
  Object.entries(tabPanels).forEach(([k, panel]) => panel.classList.toggle('active', k === tab));
}
tabBtns.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
switchTab('generate');

/* ---------- Sidebar Collapse ---------- */
const sidebar = $('config-sidebar'), sidebarBackdrop = $('sidebar-backdrop');
let sidebarCollapsed = false;

function isMobile() { return window.matchMedia('(max-width: 1023px)').matches; }

function setSidebarCollapsed(collapsed) {
  sidebarCollapsed = collapsed;
  if (isMobile()) {
    sidebar.classList.toggle('mobile-open', !collapsed);
    sidebarBackdrop.classList.toggle('show', !collapsed);
  } else {
    sidebar.classList.toggle('collapsed', collapsed);
    $('sidebar-toggle-icon').style.transform = collapsed ? 'rotate(180deg)' : '';
    $('sidebar-toggle').title = collapsed ? '展开配置' : '收起配置';
  }
}

function toggleSidebar() {
  if (isMobile()) {
    const open = sidebar.classList.contains('mobile-open');
    sidebar.classList.toggle('mobile-open');
    sidebarBackdrop.classList.toggle('show');
    sidebarCollapsed = open;
  } else {
    setSidebarCollapsed(!sidebarCollapsed);
  }
}

$('sidebar-toggle').addEventListener('click', toggleSidebar);
$('mobile-sidebar-toggle').addEventListener('click', toggleSidebar);
sidebarBackdrop.addEventListener('click', () => { sidebar.classList.remove('mobile-open'); sidebarBackdrop.classList.remove('show'); sidebarCollapsed = true; });

window.matchMedia('(min-width: 1024px)').addEventListener('change', e => {
  if (e.matches) {
    sidebar.classList.remove('mobile-open');
    sidebarBackdrop.classList.remove('show');
    setSidebarCollapsed(sidebarCollapsed);
  }
});

/* ---------- API Profiles ---------- */
const PROFILE_KEY = 'imggen-api-profiles-v1';
const CURRENT_PROFILE_KEY = 'imggen-api-current-v1';
const LEGACY_CFG_KEY = 'imggen-cfg-v1';
const apiProfileSel = $('api-profile'), cfgStatus = $('cfg-status');
const cfgFields = ['baseurl','key','model','reasoning','mode','size','n'];
let apiProfiles = [], activeProfileId = '', cfgSaveTimer = 0;

function readFormCfg() { const o = {}; cfgFields.forEach(k => o[k] = $('cfg-'+k).value.trim()); return o; }
function writeFormCfg(o) { cfgFields.forEach(k => $('cfg-'+k).value = o[k] ?? ''); }
function persistProfiles() { localStorage.setItem(PROFILE_KEY, JSON.stringify(apiProfiles)); }

function renderProfileOptions() {
  apiProfileSel.innerHTML = '';
  apiProfiles.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id; opt.textContent = p.name || 'OpenAI';
    apiProfileSel.appendChild(opt);
  });
}

function saveCurrentProfile(silent = false) {
  if (!activeProfileId) return;
  const idx = apiProfiles.findIndex(p => p.id === activeProfileId);
  if (idx < 0) return;
  apiProfiles[idx] = { ...apiProfiles[idx], ...readFormCfg() };
  persistProfiles();
  localStorage.setItem(CURRENT_PROFILE_KEY, activeProfileId);
  if (!silent) setStatus(cfgStatus, '配置已保存', 'ok');
}

function applyProfile(id) {
  const p = apiProfiles.find(x => x.id === id);
  if (!p) return;
  activeProfileId = id;
  writeFormCfg(p);
  apiProfileSel.value = id;
  localStorage.setItem(CURRENT_PROFILE_KEY, id);
  $('api-delete').disabled = apiProfiles.length <= 1;
  updateModeUI();
}

function loadApiProfiles() {
  try { apiProfiles = JSON.parse(localStorage.getItem(PROFILE_KEY) || '[]'); } catch { apiProfiles = []; }
  if (!Array.isArray(apiProfiles) || apiProfiles.length === 0) {
    let legacy = null;
    try { legacy = JSON.parse(localStorage.getItem(LEGACY_CFG_KEY) || 'null'); } catch {}
    apiProfiles = [{ id:'openai', name:'OpenAI', baseurl:'', key:'', model:'', reasoning:'', mode:'images', size:'1024x1024', n:'1', ...(legacy && typeof legacy === 'object' ? legacy : {}) }];
  } else {
    apiProfiles = apiProfiles.map(p => ({
      id: p.id || ('profile_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
      name: p.name || 'OpenAI', baseurl:'', key:'', model:'', reasoning:'', mode:'images', size:'1024x1024', n:'1', ...p
    }));
  }
  persistProfiles(); renderProfileOptions();
  const savedId = localStorage.getItem(CURRENT_PROFILE_KEY);
  const currentId = apiProfiles.some(p => p.id === savedId) ? savedId : apiProfiles[0].id;
  applyProfile(currentId);
}

async function detectCurrentApi() {
  if (activeAbortCtrl) { userAborted = true; activeAbortCtrl.abort(); setStatus(cfgStatus, '正在中断...', ''); return; }

  const { baseurl, key, model } = readFormCfg();
  if (!baseurl || !key) return setStatus(cfgStatus, '请先填写 Base URL 和 API Key', 'err');

  const debugEl = $('debug-content');
  let log = `[${new Date().toLocaleTimeString()}] 开始连通检测…\nBase URL: ${baseurl}\nModel: ${model || '(未指定)'}\n\n`;
  setStatus(cfgStatus, '正在检测连通性...', '');
  const ctrl = new AbortController();
  activeAbortCtrl = ctrl;
  const timer = setTimeout(() => ctrl.abort(), 8000);
  const headers = { Authorization: 'Bearer ' + key, Accept: 'application/json' };

  try {
    const modelName = (model || '').trim();
    if (modelName) {
      const u1 = buildApiUrl(baseurl, '/v1/models/' + encodeURIComponent(modelName));
      const t0 = Date.now();
      const r1 = await fetch(u1, { headers, signal: ctrl.signal });
      const t1 = await r1.text().catch(() => '');
      const lat = Date.now() - t0;
      log += `GET ${u1}\n→ HTTP ${r1.status} (${lat}ms)\n→ ${t1.slice(0, 300)}\n\n`;

      if (r1.ok) {
        log += `✅ 连通成功：当前模型「${modelName}」可用\n`;
        setStatus(cfgStatus, `连通成功：当前模型「${modelName}」可用`, 'ok');
        debugEl.textContent = log;
        return;
      }
      if (r1.status !== 404 && r1.status !== 405) {
        if (r1.status === 401) throw new Error('API 可达，但 Key 无效或无权限');
        throw new Error(`HTTP ${r1.status} ${r1.statusText}`);
      }
    }

    const u2 = buildApiUrl(baseurl, '/v1/models');
    const t0 = Date.now();
    const r2 = await fetch(u2, { headers, signal: ctrl.signal });
    const t2 = await r2.text().catch(() => '');
    const lat = Date.now() - t0;
    log += `GET ${u2}\n→ HTTP ${r2.status} (${lat}ms)\n→ ${t2.slice(0, 300)}\n\n`;

    if (!r2.ok) {
      if (r2.status === 401) throw new Error('API 可达，但 Key 无效或无权限');
      if (r2.status === 404) throw new Error('API 可达，但 /v1/models 不存在，可能不是 OpenAI 兼容接口');
      throw new Error(`HTTP ${r2.status} ${r2.statusText}`);
    }

    if (modelName) {
      try {
        const json = JSON.parse(t2);
        const found = Array.isArray(json?.data) && json.data.some(x => x.id === modelName);
        log += found ? `✅ 连通成功：当前模型「${modelName}」可用\n` : `✅ 连通成功：接口正常，但未在返回列表中找到「${modelName}」\n`;
        setStatus(cfgStatus, found ? `连通成功：当前模型「${modelName}」可用` : `连通成功：接口正常，但未在返回列表中找到「${modelName}」`, 'ok');
      } catch { log += '✅ 连通成功：接口正常响应\n'; setStatus(cfgStatus, '连通成功：接口正常响应', 'ok'); }
    } else {
      log += '✅ 连通成功：接口正常响应\n';
      setStatus(cfgStatus, '连通成功：接口正常响应', 'ok');
    }
  } catch (e) {
    const isUserAbort = e.name === 'AbortError' && userAborted;
    log += `❌ ${isUserAbort ? '用户中断检测' : (e.name === 'AbortError' ? '检测超时，请检查网络或 Base URL' : '检测失败：' + e.message)}\n`;
    setStatus(cfgStatus, isUserAbort ? '用户中断检测' : (e.name === 'AbortError' ? '检测超时，请检查网络或 Base URL' : `检测失败：${e.message}`), 'err');
  } finally {
    clearTimeout(timer); activeAbortCtrl = null; userAborted = false;
    log += `\n${'─'.repeat(40)}\n`;
    debugEl.textContent = log;
  }
}

async function fetchModelList() {
  const { baseurl, key } = readFormCfg();
  if (!baseurl || !key) return setStatus(cfgStatus, '请先填写 Base URL 和 API Key', 'err');

  const debugEl = $('debug-content');
  let log = `[${new Date().toLocaleTimeString()}] 获取模型列表…\nBase URL: ${baseurl}\n\n`;
  setStatus(cfgStatus, '正在获取模型列表...', '');
  const ctrl = new AbortController();
  activeAbortCtrl = ctrl;
  const timer = setTimeout(() => ctrl.abort(), 15000);

  try {
    const u = buildApiUrl(baseurl, '/v1/models');
    const t0 = Date.now();
    const r = await fetch(u, { headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' }, signal: ctrl.signal });
    const rawText = await r.text().catch(() => '');
    const lat = Date.now() - t0;
    log += `GET ${u}\n→ HTTP ${r.status} (${lat}ms)\n→ ${rawText.slice(0, 500)}\n\n`;

    if (!r.ok) {
      if (r.status === 401) throw new Error('Key 无效或无权限');
      if (r.status === 404) throw new Error('该接口不支持 /v1/models 端点');
      throw new Error(`HTTP ${r.status} ${r.statusText}`);
    }

    let json;
    try { json = JSON.parse(rawText); } catch { throw new Error('响应不是有效的 JSON'); }

    const models = Array.isArray(json?.data) ? json.data.filter(x => x.id).map(x => x.id) : [];
    if (models.length === 0) throw new Error('未在响应中找到模型列表 (data[].id)');

    const datalist = $('model-datalist');
    datalist.innerHTML = models.map(m => `<option value="${escapeHtml(m)}">`).join('');
    log += `✅ 获取成功：${models.length} 个模型\n`;
    setStatus(cfgStatus, `已加载 ${models.length} 个模型`, 'ok');

    if (!models.includes(readFormCfg().model)) {
      log += `提示：当前模型「${readFormCfg().model}」不在列表中\n`;
    }
  } catch (e) {
    const isUserAbort = e.name === 'AbortError' && userAborted;
    log += `❌ ${isUserAbort ? '用户中断' : (e.name === 'AbortError' ? '请求超时' : '获取失败：' + e.message)}\n`;
    setStatus(cfgStatus, isUserAbort ? '用户中断' : (e.name === 'AbortError' ? '请求超时' : `获取失败：${e.message}`), 'err');
  } finally {
    clearTimeout(timer); activeAbortCtrl = null; userAborted = false;
    log += `\n${'─'.repeat(40)}\n`;
    debugEl.textContent = log;
  }
}

cfgFields.forEach(k => {
  const el = $('cfg-' + k);
  el.addEventListener('input', () => { clearTimeout(cfgSaveTimer); cfgSaveTimer = setTimeout(() => saveCurrentProfile(true), 250); });
  el.addEventListener('change', () => saveCurrentProfile(true));
});
apiProfileSel.addEventListener('change', () => { saveCurrentProfile(true); applyProfile(apiProfileSel.value); });
$('api-new').addEventListener('click', () => {
  saveCurrentProfile(true);
  const name = prompt('新配置名称：', `OpenAI-${apiProfiles.length + 1}`);
  if (!name) return;
  const p = { id: 'profile_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name: name.trim() || `OpenAI-${apiProfiles.length + 1}`, ...readFormCfg() };
  apiProfiles.push(p); persistProfiles(); renderProfileOptions(); applyProfile(p.id);
  setStatus(cfgStatus, `已创建「${p.name}」`, 'ok');
});
$('api-delete').addEventListener('click', () => {
  if (apiProfiles.length <= 1) return setStatus(cfgStatus, '至少保留一个 API 配置', 'err');
  const id = apiProfileSel.value; const p = apiProfiles.find(x => x.id === id);
  if (!confirm(`确认删除「${p?.name || id}」？`)) return;
  apiProfiles = apiProfiles.filter(x => x.id !== id); persistProfiles(); renderProfileOptions(); applyProfile(apiProfiles[0].id);
  setStatus(cfgStatus, '已删除配置', 'ok');
});
$('cfg-save').addEventListener('click', () => saveCurrentProfile(false));
$('api-detect').addEventListener('click', detectCurrentApi);
$('api-fetch-models').addEventListener('click', fetchModelList);

/* ---------- Generation / Thread System ---------- */
const chatEl = $('chat'), genStatus = $('gen-status');
const sendBtn = $('gen-send');
const modeSel = $('cfg-mode'), editsCard = $('edits-card');
const dropZone = $('img-drop'), fileInput = $('img-file');
const emptyState = $('img-empty'), activeArea = $('img-active-area');
const inputImg = $('input-img');
const galleryEl = $('img-gallery');
const promptEl = $('gen-prompt');

let imageFiles = [], nextId = 1;
let generating = false, activeAbortCtrl = null, userAborted = false;
let threadSeq = 1, lastThreadId = null, editingThreadId = null;
const threads = new Map();

function updateModeUI() {
  const m = modeSel.value;
  if (m === 'edits') {
    editsCard.classList.remove('hidden');
    promptEl.placeholder = imageFiles.length > 1 ? '描述如何结合参考图进行修改...' : '描述如何修改图片，例如：把天空换成夕阳';
  } else {
    editsCard.classList.add('hidden');
    promptEl.placeholder = '描述你要生成的画面内容...';
  }
}
updateModeUI();
modeSel.addEventListener('change', updateModeUI);

function buildVersionContent(version) {
  const root = document.createElement('div');
  if (version.status === 'loading') {
    root.innerHTML = `<div class="flex items-center gap-3 text-slate-500 dark:text-slate-400 font-medium text-sm py-1">
      <svg class="animate-spin w-4 h-4 text-brand-500" viewBox="0 0 24 24" fill="none">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg><span class="animate-pulse">正在生成图像...</span></div>`;
    return root;
  }
  if (version.status === 'error') {
    root.innerHTML = `<div class="text-rose-600 dark:text-rose-400">
      <div class="font-bold text-xs uppercase tracking-wider mb-1">Error Encountered</div>
      <div class="text-[13px] bg-rose-50 dark:bg-rose-900/40 border border-rose-100 dark:border-rose-800 p-3 rounded-md break-all">${escapeHtml(version.errorMsg || '未知错误')}</div></div>`;
    return root;
  }
  if (version.hits && version.hits.length > 0) {
    const grid = document.createElement('div');
    grid.className = version.hits.length > 1 ? 'grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3' : 'mb-3';
    version.hits.forEach((hit, idx) => {
      const img = document.createElement('img');
      img.src = safeUrl(hit.dataUrl || hit.url) || '';
      img.alt = version.prompt + (version.hits.length > 1 ? ` (${idx + 1})` : '');
      img.className = 'w-full rounded-lg shadow-sm border border-slate-100 dark:border-slate-700 object-contain max-h-[400px] checkerboard';
      grid.appendChild(img);
    });
    root.appendChild(grid);
    const meta = document.createElement('div');
    meta.className = 'text-[11px] sm:text-[12px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-2.5 rounded-md break-all space-y-1';
    if (version.hits.length === 1) {
      const hit = version.hits[0], href = safeUrl(hit.dataUrl || hit.url) || '#';
      meta.innerHTML = `<span class="font-medium text-slate-600 dark:text-slate-300 block sm:inline">资源链接:</span>
        <a href="${href}" target="_blank" rel="noreferrer noopener" class="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1">${hit.dataUrl ? '内嵌 Base64 数据' : '外联链接'}</a>`;
    } else {
      meta.innerHTML = `<span class="font-medium text-slate-600 dark:text-slate-300 block mb-1">共 ${version.hits.length} 张资源:</span>` +
        version.hits.map((hit, i) => {
          const href = safeUrl(hit.dataUrl || hit.url) || '#';
          return `<a href="${href}" target="_blank" rel="noreferrer noopener" class="text-brand-600 dark:text-brand-400 hover:underline block truncate">${i + 1}. ${hit.dataUrl ? '[Base64]' : escapeHtml(hit.url || '')}</a>`;
        }).join('');
    }
    root.appendChild(meta);
    return root;
  }
  const txt = document.createElement('div');
  txt.className = 'text-slate-700 dark:text-slate-300 text-[13px] leading-relaxed whitespace-pre-wrap break-words';
  txt.textContent = version.textOut || '响应中未找到图片，请查看调试面板。';
  root.appendChild(txt);
  return root;
}

function renderThreadContent(thread, index) {
  const version = thread.versions[index];
  thread.assistantBubble.innerHTML = '';
  thread.assistantBubble.appendChild(buildVersionContent(version));
}

function buildToolbarNode(thread) {
  const toolbar = document.createElement('div');
  toolbar.className = 'flex items-center gap-1 pl-1';
  toolbar.innerHTML = `
    <button type="button" class="thread-tool-btn th-prev" title="上一版">‹</button>
    <span class="w-10 text-center text-[12px] font-medium text-slate-600 dark:text-slate-400 th-counter">0/0</span>
    <button type="button" class="thread-tool-btn th-next" title="下一版">›</button>
    <button type="button" class="thread-tool-btn th-copy ml-1" title="复制生成内容">⧉</button>
    <button type="button" class="thread-tool-btn th-regen" title="重新生成当前分支">↻</button>`;
  thread.controls = {
    prev: toolbar.querySelector('.th-prev'), next: toolbar.querySelector('.th-next'),
    counter: toolbar.querySelector('.th-counter'), copy: toolbar.querySelector('.th-copy'), regen: toolbar.querySelector('.th-regen')
  };
  thread.controls.prev.addEventListener('click', () => { if (thread.activeIndex > 0) switchThreadVersion(thread.id, thread.activeIndex - 1); });
  thread.controls.next.addEventListener('click', () => { if (thread.activeIndex < thread.versions.length - 1) switchThreadVersion(thread.id, thread.activeIndex + 1); });
  thread.controls.copy.addEventListener('click', () => copyCurrentVersion(thread.id));
  thread.controls.regen.addEventListener('click', () => regenerateThread(thread.id));
  return toolbar;
}

function updateThreadToolbar(thread) {
  const c = thread.controls; if (!c) return;
  const total = thread.versions.length, idx = thread.activeIndex;
  c.counter.textContent = total > 0 && idx >= 0 ? `${idx + 1}/${total}` : '0/0';
  const hasVersion = total > 0 && idx >= 0, currentVersion = hasVersion ? thread.versions[idx] : null;
  const isLoading = currentVersion?.status === 'loading';
  c.prev.disabled = generating || !hasVersion || idx <= 0;
  c.next.disabled = generating || !hasVersion || idx >= total - 1;
  c.copy.disabled = !hasVersion || isLoading;
  c.regen.disabled = generating || !hasVersion;
}

function refreshAllThreadToolbars() { threads.forEach(updateThreadToolbar); }

function createThreadShell(req) {
  const threadId = 'thread_' + (threadSeq++);
  const thread = { id: threadId, req: { ...req, files: [...req.files] }, el: null, assistantBubble: null, toolbar: null, controls: null, versions: [], activeIndex: -1 };
  const threadEl = document.createElement('div'); threadEl.className = 'flex flex-col gap-2'; thread.el = threadEl;
  const userWrap = renderUserBubble(req, threadId);
  const assistantWrap = document.createElement('div'); assistantWrap.className = 'flex flex-col gap-1.5 items-start';
  const label = document.createElement('div'); label.className = 'text-[11px] font-semibold tracking-wider px-1 text-slate-400 dark:text-slate-500'; label.textContent = 'AI Assistant';
  const assistantBubble = document.createElement('div');
  assistantBubble.className = 'msg-bubble px-4 sm:px-5 py-3 sm:py-3.5 rounded-2xl text-[13px] sm:text-[14px] leading-relaxed max-w-[95%] sm:max-w-[85%] break-words bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 shadow-sm overflow-hidden';
  thread.assistantBubble = assistantBubble;
  thread.toolbar = buildToolbarNode(thread);
  assistantWrap.appendChild(label); assistantWrap.appendChild(assistantBubble); assistantWrap.appendChild(thread.toolbar);
  threadEl.appendChild(userWrap); threadEl.appendChild(assistantWrap);
  chatEl.appendChild(threadEl);
  threads.set(threadId, thread); lastThreadId = threadId;
  chatEl.scrollTo({ top: chatEl.scrollHeight, behavior: 'smooth' });
  return thread;
}

function renderUserBubble(req, threadId) {
  const wrap = document.createElement('div');
  wrap.className = 'flex flex-col items-end gap-1.5 msg-bubble-wrapper';
  const label = document.createElement('div');
  label.className = 'text-[11px] font-semibold tracking-wider px-1 text-slate-400 dark:text-slate-500';
  label.textContent = 'You';
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble px-4 sm:px-5 py-3 sm:py-3.5 rounded-2xl text-[13px] sm:text-[14px] leading-relaxed max-w-[95%] sm:max-w-[85%] break-words bg-brand-600 dark:bg-brand-500 text-white shadow-sm';
  let html = `<div class="whitespace-pre-wrap break-words">${escapeHtml(req.prompt)}</div>`;
  if (req.mode === 'edits' && req.files && req.files.length) html += `<div class="mt-3 text-[11px] opacity-90">参考图：${req.files.length} 张</div>`;
  bubble.innerHTML = html;
  const toolbar = document.createElement('div');
  toolbar.className = 'user-toolbar';
  toolbar.innerHTML = `
    <button type="button" class="thread-tool-btn" title="复制">⧉</button>
    <button type="button" class="thread-tool-btn" title="编辑">✎</button>`;
  toolbar.children[0].addEventListener('click', async () => {
    try { await copyTextToClipboard(req.prompt); toast('已复制', 'ok'); }
    catch (e) { toast('复制失败：' + e.message, 'err'); }
  });
  toolbar.children[1].addEventListener('click', e => {
    e.stopPropagation();
    promptEl.value = req.prompt;
    editingThreadId = threadId || null;
    promptEl.focus();
    toast('已填入输入框，修改后按发送覆盖原对话', 'ok');
  });
  wrap.appendChild(label);
  wrap.appendChild(bubble);
  wrap.appendChild(toolbar);
  return wrap;
}

function switchThreadVersion(threadId, index) {
  const thread = threads.get(threadId); if (!thread) return;
  if (index < 0 || index >= thread.versions.length) return;
  thread.activeIndex = index; renderThreadContent(thread, index); updateThreadToolbar(thread);
}

function getCopyPayloadFromVersion(version) {
  if (version.hits && version.hits.length) {
    return version.hits.map(hit => {
      if (hit.rawBase64) return hit.rawBase64;
      if (hit.dataUrl) { const idx = hit.dataUrl.indexOf(','); return idx >= 0 ? hit.dataUrl.slice(idx + 1) : hit.dataUrl; }
      return hit.url || '';
    }).filter(Boolean).join('\n');
  }
  if (version.textOut) return version.textOut;
  if (version.rawText) return version.rawText;
  return '';
}

async function copyCurrentVersion(threadId) {
  const thread = threads.get(threadId); if (!thread) return;
  const v = thread.versions[thread.activeIndex];
  const payload = getCopyPayloadFromVersion(v);
  if (!payload) { setStatus(genStatus, '没有可复制的内容', 'err'); return; }
  try { await copyTextToClipboard(payload); setStatus(genStatus, v.hits && v.hits.length ? '已复制生成图像内容' : '已复制文本内容', 'ok'); }
  catch (e) { setStatus(genStatus, '复制失败：' + e.message, 'err'); }
}

function setGenBusy(on) {
  generating = on;
  $('gen-send-icon').classList.toggle('hidden', on);
  $('gen-stop-icon').classList.toggle('hidden', !on);
  if (on) {
    sendBtn.classList.add('bg-rose-500', 'hover:bg-rose-600', 'shadow-rose-500/30');
    sendBtn.classList.remove('bg-brand-600', 'hover:bg-brand-700', 'dark:bg-brand-500', 'dark:hover:bg-brand-600', 'shadow-brand-500/30');
    sendBtn.title = '停止生成';
  } else {
    sendBtn.classList.remove('bg-rose-500', 'hover:bg-rose-600', 'shadow-rose-500/30');
    sendBtn.classList.add('bg-brand-600', 'hover:bg-brand-700', 'dark:bg-brand-500', 'dark:hover:bg-brand-600', 'shadow-brand-500/30');
    sendBtn.title = '发送';
  }
  refreshAllThreadToolbars();
}

function readGenerationReq() {
  return {
    baseurl: $('cfg-baseurl').value.trim(), key: $('cfg-key').value.trim(), model: $('cfg-model').value.trim(),
    reasoning: $('cfg-reasoning').value.trim(), mode: $('cfg-mode').value, size: $('cfg-size').value.trim(),
    n: parseInt($('cfg-n').value.trim() || '1', 10) || 1, prompt: promptEl.value.trim(), files: imageFiles.map(x => x.file)
  };
}

/* ---------- History ---------- */
const HISTORY_KEY = 'imggen-history-v2';
const MAX_HISTORY = 50;

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}

function saveHistory(entries) {
  try {
    const trimmed = entries.slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      const half = entries.slice(Math.floor(entries.length / 2));
      localStorage.setItem(HISTORY_KEY, JSON.stringify(half));
      toast('存储空间不足，已清理一半旧记录', 'err');
    }
  }
}

function addHistoryEntry(version, threadReq) {
  const entries = loadHistory();
  const entry = {
    id: version.id,
    timestamp: Date.now(),
    prompt: threadReq.prompt,
    mode: threadReq.mode,
    model: threadReq.model,
    status: version.status,
    hits: version.hits ? version.hits.map(h => ({ dataUrl: h.dataUrl || '', url: h.url || '', rawBase64: h.rawBase64 || '' })) : [],
    textOut: version.textOut || '',
    errorMsg: version.errorMsg || ''
  };
  entries.unshift(entry);
  saveHistory(entries);
  renderHistoryDrawer();
}

function deleteHistoryEntry(id) {
  let entries = loadHistory();
  entries = entries.filter(e => e.id !== id);
  saveHistory(entries);
  renderHistoryDrawer();
}

function deleteAllHistory() {
  if (!confirm('确认清空全部历史记录？此操作不可撤销。')) return;
  saveHistory([]);
  renderHistoryDrawer();
}

function formatTime(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getHistoryThumbnail(entry) {
  if (entry.hits && entry.hits.length > 0) {
    const hit = entry.hits[0];
    const src = safeUrl(hit.dataUrl || hit.url);
    if (src) return src;
  }
  return null;
}

function renderHistoryDrawer() {
  const list = $('history-list');
  const entries = loadHistory();
  if (entries.length === 0) {
    list.innerHTML = '<div class="text-center text-sm text-slate-400 dark:text-slate-500 py-8">暂无历史记录</div>';
    return;
  }
  list.innerHTML = entries.map(e => {
    const thumb = getHistoryThumbnail(e);
    const modeLabel = e.mode === 'edits' ? 'Edits' : e.mode === 'chat' ? 'Chat' : 'Images';
    const modeColor = e.mode === 'edits' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400' : e.mode === 'chat' ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400' : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400';
    const statusIcon = e.status === 'done' ? '✅' : '❌';
    return `<div class="hist-entry bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-3 hover:border-brand-400 dark:hover:border-brand-500 cursor-pointer transition-colors group" data-id="${e.id}">
      <div class="flex gap-3">
        ${thumb ? `<div class="w-14 h-14 shrink-0 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-800"><img src="${thumb}" class="w-full h-full object-cover checkerboard" alt="" /></div>` : `<div class="w-14 h-14 shrink-0 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 text-lg">${statusIcon}</div>`}
        <div class="flex-1 min-w-0">
          <div class="flex items-start justify-between gap-2">
            <span class="text-xs text-slate-800 dark:text-slate-200 line-clamp-2 break-all">${escapeHtml(e.prompt || '(无 Prompt)')}</span>
            <button class="delete-hist-btn shrink-0 w-5 h-5 flex items-center justify-center rounded text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all" data-id="${e.id}" title="删除">&times;</button>
          </div>
          <div class="flex items-center gap-2 mt-1.5">
            <span class="text-[10px] text-slate-400 dark:text-slate-500">${formatTime(e.timestamp)}</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded font-medium ${modeColor}">${modeLabel}</span>
            ${e.hits.length > 0 ? `<span class="text-[10px] text-slate-400 dark:text-slate-500">${e.hits.length} 张</span>` : ''}
            ${e.status === 'error' ? `<span class="text-[10px] text-rose-500 dark:text-rose-400">${escapeHtml(e.errorMsg || '失败')}</span>` : ''}
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.delete-hist-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); deleteHistoryEntry(btn.dataset.id); });
  });
  list.querySelectorAll('.hist-entry').forEach(el => {
    el.addEventListener('click', () => showHistoryDetail(el.dataset.id));
  });
}

/* ---------- History Detail Modal ---------- */
function showHistoryDetail(id) {
  const entries = loadHistory();
  const entry = entries.find(e => e.id === id);
  if (!entry) return;

  const body = $('detail-body');
  const modeLabel = entry.mode === 'edits' ? 'Edits' : entry.mode === 'chat' ? 'Chat' : 'Images';
  const modeColor = entry.mode === 'edits' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400' : entry.mode === 'chat' ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400' : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400';

  let imagesHtml = '';
  if (entry.hits && entry.hits.length > 0) {
    imagesHtml = `<div class="space-y-3">
      <h4 class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">生成结果 (${entry.hits.length} 张)</h4>
      ${entry.hits.map((hit, i) => {
        const src = safeUrl(hit.dataUrl || hit.url);
        if (!src) return '';
        return `<div class="bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-2">
          <img src="${src}" class="w-full rounded-lg checkerboard max-h-[480px] object-contain" alt="生成图 ${i + 1}" />
          <div class="flex items-center gap-2 mt-2">
            <span class="text-[11px] text-slate-400 dark:text-slate-500">第 ${i + 1} 张</span>
            <button class="hist-dl-btn text-[11px] px-2 py-1 rounded border border-slate-200 dark:border-slate-600 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/40 transition-colors" data-src="${src}" data-name="generated_${i + 1}.png">下载</button>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }

  body.innerHTML = `
    <div class="bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
      <h4 class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Prompt</h4>
      <p class="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words">${escapeHtml(entry.prompt || '(无 Prompt)')}</p>
    </div>
    <div class="flex flex-wrap gap-3">
      <div class="bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5">
        <span class="text-[10px] text-slate-400 dark:text-slate-500 block mb-0.5">时间</span>
        <span class="text-sm text-slate-700 dark:text-slate-300">${formatTime(entry.timestamp)}</span>
      </div>
      <div class="bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5">
        <span class="text-[10px] text-slate-400 dark:text-slate-500 block mb-0.5">模式</span>
        <span class="text-sm px-1.5 py-0.5 rounded font-medium ${modeColor}">${modeLabel}</span>
      </div>
      <div class="bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5">
        <span class="text-[10px] text-slate-400 dark:text-slate-500 block mb-0.5">模型</span>
        <span class="text-sm font-mono text-slate-700 dark:text-slate-300">${escapeHtml(entry.model || '—')}</span>
      </div>
      <div class="bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5">
        <span class="text-[10px] text-slate-400 dark:text-slate-500 block mb-0.5">状态</span>
        <span class="text-sm ${entry.status === 'done' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}">${entry.status === 'done' ? '成功' : '失败'}</span>
      </div>
    </div>
    ${entry.status === 'error' ? `<div class="bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 rounded-xl p-4"><span class="text-xs font-bold text-rose-600 dark:text-rose-400 block mb-1">错误信息</span><p class="text-sm text-rose-700 dark:text-rose-300">${escapeHtml(entry.errorMsg || '未知错误')}</p></div>` : ''}
    ${imagesHtml}
    ${entry.textOut ? `<div class="bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4"><h4 class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">文本输出</h4><p class="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">${escapeHtml(entry.textOut)}</p></div>` : ''}
  `;

  body.querySelectorAll('.hist-dl-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = btn.dataset.src;
      a.download = btn.dataset.name;
      a.click();
    });
  });

  $('detail-overlay').classList.add('opacity-100', 'pointer-events-auto');
  $('detail-overlay').classList.remove('opacity-0', 'pointer-events-none');
  $('detail-modal').classList.add('opacity-100', 'pointer-events-auto');
  $('detail-modal').classList.remove('opacity-0', 'pointer-events-none');
}

function closeDetailModal() {
  $('detail-overlay').classList.remove('opacity-100', 'pointer-events-auto');
  $('detail-overlay').classList.add('opacity-0', 'pointer-events-none');
  $('detail-modal').classList.remove('opacity-100', 'pointer-events-auto');
  $('detail-modal').classList.add('opacity-0', 'pointer-events-none');
}

/* ---------- Generate logic ---------- */
async function generateIntoThread(thread, req) {
  if (generating) { setStatus(genStatus, '当前已有请求在进行中', 'err'); return; }
  const version = {
    id: 'ver_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    prompt: req.prompt, status: 'loading', rawText: '', resp: null, hits: [], textOut: '', errorMsg: ''
  };
  thread.req = { ...req, files: [...req.files] };
  thread.versions.push(version);
  thread.activeIndex = thread.versions.length - 1;
  renderThreadContent(thread, thread.activeIndex);
  updateThreadToolbar(thread);
  setGenBusy(true);
  setStatus(genStatus, `请求发送中 (1/${req.n})...`, '');

  const ctrl = new AbortController();
  activeAbortCtrl = ctrl;
  const timer = setTimeout(() => ctrl.abort(), 180000);

  const debugEl = $('debug-content');
  let combinedLog = '';
  let allHits = [];
  let allTextOut = [];
  let allErrors = [];
  let firstRawText = '';

  async function doOneRequest(index) {
    let url, fetchOpts;
    if (req.mode === 'edits') {
      url = buildApiUrl(req.baseurl, '/v1/images/edits');
      const fd = new FormData();
      fd.append('model', req.model); fd.append('prompt', req.prompt); fd.append('n', '1');
      if (req.size) fd.append('size', req.size);
      if (req.reasoning) fd.append('reasoning_effort', req.reasoning);
      req.files.forEach((file, idx) => fd.append('image', file, file.name || `image_${idx}.png`));
      fetchOpts = { method: 'POST', headers: { Authorization: 'Bearer ' + req.key, Accept: 'application/json' }, body: fd, signal: ctrl.signal };
    } else {
      url = buildApiUrl(req.baseurl, req.mode === 'chat' ? '/v1/chat/completions' : '/v1/images/generations');
      let body;
      if (req.mode === 'chat') { body = { model: req.model, messages: [{ role: 'user', content: req.prompt }], n: 1 }; }
      else { body = { model: req.model, prompt: req.prompt, n: 1, size: req.size }; }
      if (req.reasoning) body.reasoning_effort = req.reasoning;
      fetchOpts = { method: 'POST', headers: { Authorization: 'Bearer ' + req.key, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal };
    }

    const t0 = Date.now();
    const r = await fetch(url, fetchOpts);
    const rawText = await r.text();
    const lat = Date.now() - t0;

    let resp = null; try { resp = JSON.parse(rawText); } catch { resp = rawText; }

    let subLog = `[${new Date().toLocaleTimeString()}] 子请求 #${index + 1}/${req.n}\n`;
    subLog += `→ ${fetchOpts.method} ${url} (${lat}ms)\n`;
    subLog += `→ HTTP ${r.status} ${r.statusText}\n`;
    subLog += `→ Response:\n${typeof resp === 'string' ? resp : JSON.stringify(resp, null, 2)}\n`;
    subLog += `${'─'.repeat(40)}\n`;

    setStatus(genStatus, `请求发送中 (${index + 1}/${req.n})...`, '');

    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + r.statusText);

    const hits = extractImages(resp);
    let textOut = '';
    if (resp && resp.choices) {
      for (const c of resp.choices) {
        const m = c.message || c.delta || {};
        if (typeof m.content === 'string') textOut += m.content;
      }
    }
    return { rawText, resp, hits, textOut, subLog };
  }

  try {
    const tasks = [];
    for (let i = 0; i < req.n; i++) {
      tasks.push(doOneRequest(i));
    }

    const results = await Promise.allSettled(tasks);

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { rawText, resp, hits, textOut, subLog } = result.value;
        combinedLog += subLog;
        if (!firstRawText) firstRawText = rawText;
        allHits.push(...hits);
        if (textOut) allTextOut.push(textOut);
      } else {
        const errMsg = result.reason ? result.reason.message : '未知错误';
        allErrors.push(errMsg);
        combinedLog += `[${new Date().toLocaleTimeString()}] ❌ 子请求失败：${errMsg}\n${'─'.repeat(40)}\n`;
      }
    }

    combinedLog += `\n总计：${req.n} 次请求，成功 ${results.filter(r => r.status === 'fulfilled').length}，失败 ${allErrors.length}\n`;
    combinedLog += `${'─'.repeat(40)}\n`;
    debugEl.textContent = combinedLog;

    if (allHits.length === 0 && allTextOut.length === 0 && allErrors.length > 0) {
      throw new Error(allErrors.join('; '));
    }

    version.status = 'done';
    version.rawText = firstRawText || allErrors.join('; ');
    version.resp = null;
    version.hits = allHits;
    version.textOut = allTextOut.join('\n');
    renderThreadContent(thread, thread.activeIndex);
    updateThreadToolbar(thread);

    addHistoryEntry(version, thread.req);

    const totalHits = allHits.length;
    setStatus(genStatus, totalHits > 0 ? (totalHits === 1 ? '生成完成' : `生成完成 (${totalHits} 张)`) : (allTextOut.length > 0 ? '生成完成（文本）' : '未识别到内容'), totalHits > 0 || allTextOut.length > 0 ? 'ok' : 'err');
  } catch (e) {
    version.status = 'error';
    if (e.name === 'AbortError') {
      version.errorMsg = userAborted ? '用户中断请求' : '请求超时';
    } else {
      version.errorMsg = e.message;
    }
    renderThreadContent(thread, thread.activeIndex);
    updateThreadToolbar(thread);
    setStatus(genStatus, version.errorMsg, 'err');

    if (combinedLog) combinedLog += `\n最终错误：${version.errorMsg}\n${'─'.repeat(40)}\n`;
    else combinedLog = `[${new Date().toLocaleTimeString()}] ❌ ${version.errorMsg}\n${'─'.repeat(40)}\n`;
    debugEl.textContent = combinedLog;
  } finally {
    clearTimeout(timer); activeAbortCtrl = null; userAborted = false;
    setGenBusy(false);
    updateThreadToolbar(thread);
    chatEl.scrollTo({ top: chatEl.scrollHeight, behavior: 'smooth' });
  }
}

async function startNewGeneration() {
  if (generating) { setStatus(genStatus, '当前已有请求在进行中', 'err'); return; }
  const req = readGenerationReq();
  if (!req.baseurl || !req.key || !req.model || !req.prompt) { setStatus(genStatus, '请填写完整的接口配置与 Prompt', 'err'); return; }
  if (req.mode === 'edits' && req.files.length === 0) { setStatus(genStatus, '请先上传参考图片', 'err'); return; }

  if (editingThreadId) {
    const thread = threads.get(editingThreadId);
    if (thread) {
      thread.req.prompt = req.prompt;
      thread.req.files = req.files;
      const userBubble = thread.el.querySelector('.msg-bubble');
      if (userBubble) {
        let html = `<div class="whitespace-pre-wrap break-words">${escapeHtml(req.prompt)}</div>`;
        if (req.mode === 'edits' && req.files.length) html += `<div class="mt-3 text-[11px] opacity-90">参考图：${req.files.length} 张</div>`;
        userBubble.innerHTML = html;
      }
      const tid = editingThreadId;
      editingThreadId = null;
      await generateIntoThread(thread, thread.req);
      return;
    }
    editingThreadId = null;
  }

  const thread = createThreadShell(req);
  await generateIntoThread(thread, req);
}

async function regenerateThread(threadId) {
  if (generating) { setStatus(genStatus, '当前已有请求在进行中', 'err'); return; }
  const thread = threads.get(threadId); if (!thread) return;
  const req = thread.req;
  if (!req) { setStatus(genStatus, '找不到可重新生成的请求', 'err'); return; }
  await generateIntoThread(thread, req);
}

/* ---------- Image Files ---------- */
function addFiles(fileList) {
  let added = 0;
  for (const f of fileList) {
    if (!f.type || !f.type.startsWith('image/')) continue;
    if (imageFiles.length >= 9) { setStatus(genStatus, '最多支持 9 张参考图', 'err'); break; }
    const url = URL.createObjectURL(f);
    imageFiles.push({ id: nextId++, file: f, url }); added++;
  }
  if (added > 0) { renderImages(); setStatus(genStatus, `已添加 ${added} 张图片`, 'ok'); setTimeout(() => setStatus(genStatus, ''), 2000); }
}

function removeImage(id) {
  const idx = imageFiles.findIndex(x => x.id === id);
  if (idx === -1) return;
  URL.revokeObjectURL(imageFiles[idx].url); imageFiles.splice(idx, 1); renderImages();
}

function renderImages() {
  if (imageFiles.length === 0) {
    emptyState.classList.remove('hidden'); activeArea.classList.add('hidden');
    galleryEl.classList.add('hidden'); galleryEl.innerHTML = '';
    inputImg.removeAttribute('src');
    updateModeUI(); return;
  }
  emptyState.classList.add('hidden'); galleryEl.classList.remove('hidden');
  galleryEl.innerHTML = '';
  imageFiles.forEach(img => {
    const div = document.createElement('div');
    div.className = 'relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 aspect-square';
    div.innerHTML = `<img src="${img.url}" class="w-full h-full object-cover pointer-events-none select-none" draggable="false" />
      <button type="button" class="delete-img-btn absolute top-1.5 right-1.5 w-6 h-6 bg-white/90 dark:bg-slate-700/90 hover:bg-rose-50 dark:hover:bg-rose-900/60 text-slate-500 dark:text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 rounded-full flex items-center justify-center shadow-sm border border-slate-200 dark:border-slate-600 opacity-0 group-hover:opacity-100" data-id="${img.id}" title="移除">&times;</button>
      <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent text-white text-[10px] truncate px-2 py-1.5">${escapeHtml(img.file.name || 'image')}</div>`;
    div.querySelector('.delete-img-btn').addEventListener('click', e => { e.stopPropagation(); removeImage(img.id); });
    galleryEl.appendChild(div);
  });

  if (imageFiles.length < 9) {
    const addCard = document.createElement('div');
    addCard.className = 'rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 aspect-square flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-brand-400 dark:hover:border-brand-500 hover:bg-brand-50/50 dark:hover:bg-brand-900/20 transition-colors';
    addCard.innerHTML = `<svg class="w-8 h-8 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg><span class="text-[10px] text-slate-400 dark:text-slate-500">添加图片</span>`;
    addCard.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
    galleryEl.appendChild(addCard);
  }
  if (imageFiles.length === 1) {
    activeArea.classList.remove('hidden');
    inputImg.src = imageFiles[0].url;
  } else {
    activeArea.classList.add('hidden');
  }
  updateModeUI();
}

/* ---------- Send / Stop button ---------- */
$('gen-clear').addEventListener('click', () => {
  chatEl.innerHTML = ''; threads.clear(); lastThreadId = null; editingThreadId = null;
  setStatus(genStatus, ''); setGenBusy(false);
});

sendBtn.addEventListener('click', () => {
  if (generating) {
    if (activeAbortCtrl) {
      userAborted = true;
      activeAbortCtrl.abort();
      setStatus(genStatus, '正在中断请求...', '');
    }
  } else {
    startNewGeneration();
  }
});

promptEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); startNewGeneration(); }
});

/* ---------- Image events ---------- */
dropZone.addEventListener('click', e => { if (e.target.closest('#img-active-area') || e.target.closest('#img-gallery') || e.target.closest('#img-actions')) return; fileInput.click(); });
fileInput.addEventListener('change', e => { if (e.target.files && e.target.files.length) { addFiles(e.target.files); fileInput.value = ''; } });
['dragenter','dragover'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.add('border-brand-500','dark:border-brand-400','bg-brand-50/60','dark:bg-brand-900/30'); }));
['dragleave','drop'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.remove('border-brand-500','dark:border-brand-400','bg-brand-50/60','dark:bg-brand-900/30'); }));
dropZone.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files; if (f && f.length) addFiles(f); });

$('img-remove').addEventListener('click', e => { e.stopPropagation(); imageFiles.forEach(i => URL.revokeObjectURL(i.url)); imageFiles = []; renderImages(); });

document.addEventListener('paste', e => {
  const items = e.clipboardData && e.clipboardData.items; if (!items) return;
  const files = []; for (const item of items) { if (item.type && item.type.startsWith('image/')) { const f = item.getAsFile(); if (f) files.push(f); } }
  if (files.length) {
    e.preventDefault();
    if (modeSel.value !== 'edits') {
      modeSel.value = 'edits';
      saveCurrentProfile(true);
      updateModeUI();
    }
    addFiles(files);
    toast('图片已粘贴到参考图区域', 'ok');
  }
});

/* ---------- Debug Panel ---------- */
$('debug-toggle').addEventListener('click', () => {
  $('debug-panel').classList.toggle('hidden');
});
$('debug-clear').addEventListener('click', () => {
  $('debug-content').textContent = '等待操作…';
});

/* ---------- History Drawer ---------- */
function openHistoryDrawer() {
  $('history-drawer').classList.add('open');
  $('history-overlay').classList.add('open');
  renderHistoryDrawer();
}
function closeHistoryDrawer() {
  $('history-drawer').classList.remove('open');
  $('history-overlay').classList.remove('open');
}
$('history-toggle').addEventListener('click', () => {
  $('history-drawer').classList.contains('open') ? closeHistoryDrawer() : openHistoryDrawer();
});
$('history-close').addEventListener('click', closeHistoryDrawer);
$('history-overlay').addEventListener('click', closeHistoryDrawer);
$('history-clear-all').addEventListener('click', deleteAllHistory);

$('detail-close').addEventListener('click', closeDetailModal);
$('detail-overlay').addEventListener('click', closeDetailModal);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!$('detail-modal').classList.contains('pointer-events-none')) closeDetailModal();
    else if ($('history-drawer').classList.contains('open')) closeHistoryDrawer();
  }
});

/* ---------- Init ---------- */
setGenBusy(false);
loadApiProfiles();
renderHistoryDrawer();

window.addEventListener('beforeunload', () => {
  imageFiles.forEach(i => URL.revokeObjectURL(i.url));
});
