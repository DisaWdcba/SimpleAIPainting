/* ---------- Bridge.js - WebView2 WebMessage Promise Bridge ---------- */
(function () {
  'use strict';

  const IS_NATIVE = !!(window.chrome && window.chrome.webview && window.chrome.webview.postMessage);
  const DEFAULT_TIMEOUT = 30000;

  class Bridge {
    constructor() {
      this._pending = new Map();
      this._listeners = new Map();
      this._ready = !IS_NATIVE;
      this._readyResolve = null;
      this._readyPromise = IS_NATIVE ? new Promise(resolve => { this._readyResolve = resolve; }) : Promise.resolve();
    }

    get isNative() { return IS_NATIVE; }
    get isReady() { return this._ready; }

    init() {
      document.addEventListener('wheel', function (e) {
        if (e.ctrlKey) e.preventDefault();
      }, { passive: false });

      document.addEventListener('keydown', function (e) {
        if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
          e.preventDefault();
          e.stopPropagation();
        }
      }, true);

      if (!IS_NATIVE) return;

      window.chrome.webview.addEventListener('message', e => {
        try {
          const msg = JSON.parse(e.data);
          this._handleMessage(msg);
        } catch (err) {
          console.error('[Bridge] 消息解析失败:', err);
        }
      });

      window.addEventListener('unload', () => this._cleanup());
    }

    invoke(method, params) {
      if (!IS_NATIVE) {
        return Promise.reject(new BridgeError('BRIDGE_UNAVAILABLE', 'Bridge 不可用（非桌面端）'));
      }

      const id = crypto.randomUUID ? crypto.randomUUID() : 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this._pending.delete(id);
          reject(new BridgeError('TIMEOUT', `请求超时: ${method}`));
        }, DEFAULT_TIMEOUT);

        this._pending.set(id, { resolve, reject, timer, method });

        try {
          const req = { id, method, params: params || {}, version: 1 };
          window.chrome.webview.postMessage(JSON.stringify(req));
        } catch (e) {
          clearTimeout(timer);
          this._pending.delete(id);
          reject(new BridgeError('BRIDGE_UNAVAILABLE', '发送消息失败: ' + e.message));
        }
      });
    }

    on(event, callback) {
      if (!this._listeners.has(event)) this._listeners.set(event, new Set());
      this._listeners.get(event).add(callback);
    }

    off(event, callback) {
      const cbs = this._listeners.get(event);
      if (cbs) cbs.delete(callback);
    }

    waitReady() {
      return this._readyPromise;
    }

    _handleMessage(msg) {
      if (msg.type === 'event') {
        const cbs = this._listeners.get(msg.name);
        if (cbs) cbs.forEach(cb => { try { cb(msg.payload); } catch {} });
        return;
      }

      if (msg.id === 'bridge.ready') {
        this._ready = true;
        if (this._readyResolve) {
          this._readyResolve(msg.result);
          this._readyResolve = null;
        }
        return;
      }

      const id = msg.id;
      if (!id || !this._pending.has(id)) return;

      const { resolve, reject, timer } = this._pending.get(id);
      clearTimeout(timer);
      this._pending.delete(id);

      if (msg.ok) {
        resolve(msg.result);
      } else {
        const err = msg.error || {};
        reject(new BridgeError(err.code || 'UNKNOWN_ERROR', err.message || '未知错误'));
      }
    }

    _cleanup() {
      for (const [id, entry] of this._pending) {
        clearTimeout(entry.timer);
        entry.reject(new BridgeError('BRIDGE_UNAVAILABLE', '页面已卸载'));
      }
      this._pending.clear();
      this._listeners.clear();
    }
  }

  class BridgeError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'BridgeError';
      this.code = code;
    }
  }

  const bridge = new Bridge();
  bridge.init();

  window.__bridge = bridge;
})();
