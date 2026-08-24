(function () {
  if (window.NanachiGameShell) return;

  const VISITOR_KEY = "nanachi-portfolio-visitor-id";
  const DEFAULT_TIMEOUT = 15000;
  let currentProjectId = "";

  function launcherOrigin() {
    const local = ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
    return local ? `${location.protocol}//${location.hostname}:5175` : "https://lijiaqi.me";
  }

  function visitorId() {
    let value = localStorage.getItem(VISITOR_KEY);
    if (!value) {
      value = crypto.randomUUID();
      localStorage.setItem(VISITOR_KEY, value);
    }
    return value;
  }

  function emitRequestEvent(eventName, durationMs, success) {
    if (!currentProjectId) return;
    void fetch(`${launcherOrigin()}/api/events`, {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorId: visitorId(), eventName, projectId: currentProjectId, durationMs, success }),
    }).catch(() => undefined);
  }

  async function request(input, options = {}) {
    const startedAt = performance.now();
    const measureRequest = !String(input).includes("/api/events");
    const controller = new AbortController();
    const timeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const { timeoutMs: _ignored, ...fetchOptions } = options;
    try {
      const response = await fetch(input, {
        credentials: "include",
        ...fetchOptions,
        signal: fetchOptions.signal || controller.signal,
      });
      if (measureRequest) emitRequestEvent(response.ok ? "request_complete" : "request_failed", performance.now() - startedAt, response.ok);
      return response;
    } catch (error) {
      if (measureRequest) emitRequestEvent("request_failed", performance.now() - startedAt, false);
      if (error && error.name === "AbortError") throw new Error("请求超时，请稍后重试");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function installStatusUi() {
    if (document.getElementById("nanachi-shell-style")) return;
    const style = document.createElement("style");
    style.id = "nanachi-shell-style";
    style.textContent = `
      .nanachi-shell-offline{position:fixed;z-index:10010;left:50%;top:max(12px,env(safe-area-inset-top));transform:translateX(-50%);max-width:calc(100% - 24px);padding:9px 14px;border-radius:999px;background:#272923;color:#fff;font:700 13px/1.35 system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.28)}
      .nanachi-shell-toast{position:fixed;z-index:10011;left:50%;bottom:max(18px,calc(env(safe-area-inset-bottom) + 12px));transform:translate(-50%,12px);max-width:min(420px,calc(100% - 28px));padding:11px 16px;border-radius:14px;background:#19251f;color:#fff;font:700 14px/1.45 system-ui,sans-serif;box-shadow:0 12px 34px rgba(0,0,0,.28);opacity:0;pointer-events:none;transition:.2s ease}
      .nanachi-shell-toast.show{opacity:1;transform:translate(-50%,0)}
      @media (prefers-reduced-motion:reduce){.nanachi-shell-toast{transition:none}}
    `;
    document.head.appendChild(style);
  }

  let toastTimer = 0;
  function toast(message) {
    installStatusUi();
    let node = document.getElementById("nanachi-shell-toast");
    if (!node) {
      node = document.createElement("div");
      node.id = "nanachi-shell-toast";
      node.className = "nanachi-shell-toast";
      node.setAttribute("role", "status");
      node.setAttribute("aria-live", "polite");
      document.body.appendChild(node);
    }
    node.textContent = String(message || "");
    node.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove("show"), 2600);
  }

  function updateOfflineState() {
    installStatusUi();
    let notice = document.getElementById("nanachi-shell-offline");
    if (!navigator.onLine) {
      if (!notice) {
        notice = document.createElement("div");
        notice.id = "nanachi-shell-offline";
        notice.className = "nanachi-shell-offline";
        notice.setAttribute("role", "status");
        notice.textContent = "网络已断开，已输入的内容会保留";
        document.body.appendChild(notice);
      }
    } else if (notice) {
      notice.remove();
      toast("网络已恢复");
    }
  }

  function record(eventName, projectId, details = {}) {
    if (projectId) currentProjectId = projectId;
    const body = JSON.stringify({ visitorId: visitorId(), eventName, projectId, ...details });
    void request(`${launcherOrigin()}/api/events`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body,
      timeoutMs: 4000,
    }).catch(() => undefined);
  }

  window.NanachiGameShell = { request, toast, record, launcherOrigin, visitorId };
  window.addEventListener("offline", updateOfflineState);
  window.addEventListener("online", updateOfflineState);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", updateOfflineState, { once: true });
  else updateOfflineState();
})();
