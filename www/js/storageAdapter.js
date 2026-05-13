/* ---------- StorageAdapter - Unified Storage (SQLite via Bridge / IndexedDB fallback) ---------- */
(function () {
  'use strict';

  const HISTORY_DB = 'imggen-history-db-v1';
  const HISTORY_STORE = 'entries';
  const HISTORY_KEY = 'imggen-history-v2';
  const MAX_HISTORY = 50;

  let _dbPromise = null;
  let _legacyMigrated = false;

  /* ========== IDB Helpers ========== */
  function loadFallback() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
  }
  function saveFallback(entries) {
    const trimmed = entries.slice(0, MAX_HISTORY);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed)); } catch {}
  }
  function sortEntries(entries) {
    return (entries || []).slice().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }

  function openIDB() {
    if (!window.indexedDB) return Promise.reject(new Error('IndexedDB 不可用'));
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(HISTORY_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(HISTORY_STORE)) {
          const store = db.createObjectStore(HISTORY_STORE, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('mode', 'mode', { unique: false });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('model', 'model', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { _dbPromise = null; reject(req.error); };
      req.onblocked = () => { _dbPromise = null; reject(new Error('IndexedDB 被阻塞')); };
    });
    return _dbPromise;
  }
  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('事务中止'));
    });
  }
  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /* ========== Native Bridge Helpers ========== */
  function isNative() {
    return !!(window.__bridge && window.__bridge.isNative);
  }

  function nativeOk() {
    return window.__bridge && window.__bridge.isReady;
  }

  /* ========== Public API ========== */
  const StorageAdapter = {
    get isNative() { return isNative(); },

    async waitReady() {
      if (isNative() && window.__bridge) {
        await window.__bridge.waitReady();
      }
    },

    async saveHistory(record, imageUrls) {
      if (isNative() && nativeOk()) {
        const result = await window.__bridge.invoke('history.save', {
          ...record,
          imageUrls: imageUrls || []
        });
        return result;
      }

      const entry = {
        id: record.id || 'h_' + Date.now().toString(36),
        timestamp: record.timestamp || Date.now(),
        prompt: record.prompt || '',
        mode: record.mode || 'images',
        model: record.model || '',
        status: record.status || 'done',
        size: record.size || '',
        aspect: record.aspect || '',
        quality: record.quality || '',
        style: record.style || '',
        reasoning: record.reasoning || '',
        negative: record.negative || '',
        n: record.n || 1,
        hits: (imageUrls || []).map((url, i) => ({
          dataUrl: typeof url === 'object' ? (url.dataUrl || url.url) : url,
          url: typeof url === 'object' ? (url.url || url.dataUrl) : url,
          rawBase64: ''
        })),
        textOut: record.textOut || '',
        errorMsg: record.errorMsg || ''
      };

      try {
        const db = await openIDB();
        const tx = db.transaction(HISTORY_STORE, 'readwrite');
        tx.objectStore(HISTORY_STORE).put(entry);
        await txDone(tx);

        const all = await loadAllIDB();
        if (all.length > MAX_HISTORY) {
          const keep = all.slice(0, MAX_HISTORY);
          const tx2 = db.transaction(HISTORY_STORE, 'readwrite');
          const store2 = tx2.objectStore(HISTORY_STORE);
          await reqToPromise(store2.clear());
          for (const e of keep) store2.put(e);
          await txDone(tx2);
        }
      } catch {
        const all = loadFallback();
        all.unshift(entry);
        saveFallback(all.slice(0, MAX_HISTORY));
      }

      return { historyId: entry.id, savedCount: 0, failedCount: 0 };
    },

    async queryHistory(filter = {}) {
      if (isNative() && nativeOk()) {
        return window.__bridge.invoke('history.query', filter);
      }

      try {
        await migrateLegacy();
        const db = await openIDB();
        const tx = db.transaction(HISTORY_STORE, 'readonly');
        const rows = await reqToPromise(tx.objectStore(HISTORY_STORE).getAll());
        const entries = sortEntries(rows || []);

        let filtered = entries;
        if (filter.keyword) {
          const q = filter.keyword.toLowerCase();
          filtered = entries.filter(e => {
            const hay = [e.prompt, e.model, e.errorMsg, e.mode, e.status, e.textOut, e.size, e.quality, e.style, e.negative, e.aspect, e.reasoning].join(' ').toLowerCase();
            return hay.includes(q);
          });
        }
        if (filter.mode) filtered = filtered.filter(e => e.mode === filter.mode);
        if (filter.status) filtered = filtered.filter(e => e.status === filter.status);

        const page = filter.page || 1;
        const pageSize = filter.pageSize || 50;
        const start = (page - 1) * pageSize;
        const items = filtered.slice(start, start + pageSize).map(e => ({
          id: e.id,
          timestamp: e.timestamp,
          prompt: e.prompt,
          model: e.model,
          status: e.status,
          imageCount: (e.hits || []).length,
          thumbUrl: (e.hits && e.hits[0]) ? (e.hits[0].dataUrl || e.hits[0].url || '') : '',
          fullUrl: '',
          isFavorite: e.isFavorite || false,
          mode: e.mode
        }));

        return { total: filtered.length, items, hasMore: start + pageSize < filtered.length };
      } catch {
        const entries = loadFallback();
        return { total: entries.length, items: entries.map(e => ({ ...e, imageCount: 0, thumbUrl: '', fullUrl: '', isFavorite: false })), hasMore: false };
      }
    },

    async getHistoryById(id) {
      if (isNative() && nativeOk()) {
        return window.__bridge.invoke('history.getById', { id });
      }

      try {
        const db = await openIDB();
        const tx = db.transaction(HISTORY_STORE, 'readonly');
        return await reqToPromise(tx.objectStore(HISTORY_STORE).get(id));
      } catch {
        const entries = loadFallback();
        return entries.find(e => e.id === id) || null;
      }
    },

    async deleteHistory(id) {
      if (isNative() && nativeOk()) {
        return window.__bridge.invoke('history.delete', { id });
      }

      try {
        const db = await openIDB();
        const tx = db.transaction(HISTORY_STORE, 'readwrite');
        tx.objectStore(HISTORY_STORE).delete(id);
        await txDone(tx);
      } catch {
        const all = loadFallback().filter(e => e.id !== id);
        saveFallback(all);
      }
      return { ok: true };
    },

    async deleteAllHistory() {
      try {
        const db = await openIDB();
        const tx = db.transaction(HISTORY_STORE, 'readwrite');
        tx.objectStore(HISTORY_STORE).clear();
        await txDone(tx);
      } catch {
        saveFallback([]);
      }
    },

    async exportImages(ids, targetDir) {
      if (isNative() && nativeOk()) {
        return window.__bridge.invoke('image.export', { ids, targetDir });
      }
      throw new Error('批量导出仅支持桌面端');
    },

    async getSettings(key) {
      if (isNative() && nativeOk()) {
        return window.__bridge.invoke('settings.get', { key: key || 'all' });
      }
      return {};
    },

    async setSettings(settings) {
      if (isNative() && nativeOk()) {
        return window.__bridge.invoke('settings.set', settings);
      }
      return { ok: false };
    },

    async pickFolder() {
      if (isNative() && nativeOk()) {
        return window.__bridge.invoke('dialog.pickFolder', {});
      }
      return { path: null };
    },

    async showInExplorer(filePath) {
      if (isNative() && nativeOk()) {
        return window.__bridge.invoke('file.showInExplorer', { path: filePath });
      }
      return { ok: false };
    }
  };

  async function migrateLegacy() {
    if (_legacyMigrated) return;
    _legacyMigrated = true;
    const legacy = loadFallback();
    if (!Array.isArray(legacy) || legacy.length === 0) return;
    try {
      const db = await openIDB();
      const tx = db.transaction(HISTORY_STORE, 'readwrite');
      for (const item of legacy) { if (item && item.id) tx.objectStore(HISTORY_STORE).put(item); }
      await txDone(tx);
      localStorage.removeItem(HISTORY_KEY);
    } catch {}
  }

  async function loadAllIDB() {
    const db = await openIDB();
    const tx = db.transaction(HISTORY_STORE, 'readonly');
    return await reqToPromise(tx.objectStore(HISTORY_STORE).getAll());
  }

  window.StorageAdapter = StorageAdapter;
})();
