(function () {
  const PROJECT_ID = "name-battle";
  const RETURN_TO_KEY = `nanachi-${PROJECT_ID}-return-to`;
  const params = new URLSearchParams(window.location.search);
  const incomingReturnTo = params.get("returnTo");


  let sessionId = "";
  let trackingStarted = false;
  let currentUser = null;

  const nativeFetch = window.fetch.bind(window);

  if (incomingReturnTo) {
    localStorage.setItem(RETURN_TO_KEY, incomingReturnTo);
  }
  localStorage.removeItem("nanachi-game-auth-token");
  if (incomingReturnTo || params.has("authToken") || params.has("requireLogin")) {
    params.delete("authToken");
    params.delete("returnTo");
    params.delete("requireLogin");
    const nextUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : "") + window.location.hash;
    window.history.replaceState(window.history.state, "", nextUrl);
  }

  function launcherOrigin() {
    const storedReturnTo = localStorage.getItem(RETURN_TO_KEY) || incomingReturnTo || "";
    if (storedReturnTo) {
      try {
        const target = new URL(storedReturnTo);
        const local = ["localhost", "127.0.0.1", "::1"].includes(target.hostname);
        if (local || target.hostname === "lijiaqi.me") return target.origin;
      } catch {
        // Fall through to the default launcher port.
      }
    }
    const hostname = window.location.hostname;
    const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
    return isLocal ? `${window.location.protocol}//${hostname}:5175` : "https://lijiaqi.me";
  }

  async function requestApi(path, options = {}) {
    const request = window.NanachiGameShell?.request || nativeFetch;
    const response = await request(path, {
      credentials: "include",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.message || payload.error || "Request failed");
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  async function api(path, options = {}) {
    try {
      return await requestApi(path, options);
    } catch (error) {
      const canFallback =
        typeof path === "string" &&
        (path.startsWith("/api/auth/") || path.startsWith("/api/play/")) &&
        (error instanceof TypeError || [404, 502, 503, 504].includes(error.status));
      if (!canFallback) throw error;
      const fallbackOrigin = launcherOrigin();
      if (!fallbackOrigin || fallbackOrigin === window.location.origin) throw error;
      return requestApi(`${fallbackOrigin}${path}`, options);
    }
  }

  async function startTracking() {
    if (trackingStarted) return;
    trackingStarted = true;
    try {
      const me = await api("/api/auth/me");
      if (!me.user) {
        trackingStarted = false;
        return;
      }
      const result = await api("/api/play/start", {
        method: "POST",
        body: JSON.stringify({ projectId: PROJECT_ID }),
      });
      sessionId = result.sessionId || "";
      if (!sessionId) {
        trackingStarted = false;
        return;
      }
      window.setInterval(sendHeartbeat, 30000);
    } catch {
      sessionId = "";
      trackingStarted = false;
    }
  }

  function sendHeartbeat() {
    if (!sessionId) return;
    void api("/api/play/heartbeat", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    }).catch(() => undefined);
  }

  function endTracking() {
    if (!sessionId) return;
    nativeFetch("/api/play/end", {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionId }),
    }).catch(() => undefined);
  }

  function installAuthGate() {
    if (document.getElementById("nanachi-auth-gate")) return;

    const style = document.createElement("style");
    style.textContent = `
      .nanachi-auth-gate{position:fixed;inset:0;z-index:9997;display:none;align-items:center;justify-content:center;padding:22px;background:rgba(4,7,13,.76);backdrop-filter:blur(12px);font-family:inherit}
      .nanachi-auth-gate.show{display:flex}
      .nanachi-auth-panel{position:relative;width:min(400px,100%);border-radius:20px;border:1px solid rgba(116,174,255,.26);background:linear-gradient(145deg,#101826,#17111f);box-shadow:0 30px 90px rgba(0,0,0,.55);padding:22px;color:#f4f7ff}
      .nanachi-auth-close{position:absolute;right:13px;top:13px;width:38px;height:38px;border:1px solid rgba(116,174,255,.34);border-radius:12px;display:grid;place-items:center;background:rgba(9,15,26,.72);color:inherit;font:inherit;font-size:26px;font-weight:900;line-height:1;cursor:pointer}
      .nanachi-auth-head{display:flex;gap:14px;align-items:center;margin-bottom:18px}
      .nanachi-auth-mark{width:58px;height:58px;border-radius:16px;display:grid;place-items:center;background:#111827;box-shadow:0 12px 28px rgba(111,140,255,.25);overflow:hidden}
      .nanachi-auth-mark img{width:100%;height:100%;display:block;object-fit:cover}
      .nanachi-auth-head h2{margin:0 0 5px;font-size:24px;line-height:1.15}
      .nanachi-auth-head p{margin:0;color:#aeb8cb;font-size:14px;line-height:1.55}
      .nanachi-auth-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;padding:5px;border-radius:16px;background:#202838}
      .nanachi-auth-tabs button{border:0;border-radius:12px;min-height:41px;background:transparent;color:#aeb8cb;font:inherit;font-weight:900;cursor:pointer}
      .nanachi-auth-tabs button.active{background:#6f8cff;color:#fff;box-shadow:0 8px 24px rgba(111,140,255,.24)}
      .nanachi-auth-form{display:grid;gap:10px}
      .nanachi-auth-form label{display:grid;gap:6px;color:#aeb8cb;font-size:13px;font-weight:800}
      .nanachi-auth-form input{width:100%;box-sizing:border-box;border:1px solid rgba(116,174,255,.22);border-radius:14px;background:#0b1220;color:#f4f7ff;font:inherit;font-weight:800;padding:13px 14px;outline:none}
      .nanachi-auth-form input::-ms-reveal,.nanachi-auth-form input::-ms-clear{display:none}
      .nanachi-auth-form input:focus{border-color:#6f8cff;box-shadow:0 0 0 4px rgba(111,140,255,.18)}
      .nanachi-auth-password-wrap{position:relative}
      .nanachi-auth-password-wrap input{padding-right:46px}
      .nanachi-auth-password-toggle{position:absolute;right:8px;top:50%;width:32px;height:32px;transform:translateY(-50%);border:0;border-radius:999px;display:grid;place-items:center;background:transparent;color:#aeb8cb;cursor:pointer}
      .nanachi-auth-password-toggle:hover{background:rgba(116,174,255,.12)}
      .nanachi-auth-password-toggle svg{width:18px;height:18px}
      .nanachi-auth-error{min-height:20px;color:#ff8e9d;font-size:13px;font-weight:800}
      .nanachi-auth-submit{border:0;border-radius:15px;min-height:50px;background:#6f8cff;color:#fff;font:inherit;font-size:16px;font-weight:1000;cursor:pointer}
      .nanachi-auth-submit:disabled{opacity:.62;cursor:not-allowed}
      .nanachi-auth-form .nanachi-auth-login-only{display:grid}
      .nanachi-auth-gate[data-mode="register"] .nanachi-auth-form .nanachi-auth-login-only{display:none}
      .nanachi-auth-form .nanachi-auth-register-only{display:none}
      .nanachi-auth-gate[data-mode="register"] .nanachi-auth-form .nanachi-auth-register-only{display:grid}
      .nanachi-auth-sms-row{display:grid;grid-template-columns:1fr 112px;gap:8px}
      .nanachi-auth-send-sms{border:0;border-radius:14px;background:#6f8cff;color:#fff;font:inherit;font-size:13px;font-weight:900;cursor:pointer}
      .nanachi-auth-send-sms:disabled{opacity:.58;cursor:not-allowed}
      .nanachi-auth-note{min-height:20px;color:#8ea1ff;font-size:13px;font-weight:800}
      @media(max-width:560px),(max-height:760px){
        .nanachi-auth-gate{align-items:flex-start;padding:8px;overflow-y:auto}.nanachi-auth-panel{width:100%;max-height:calc(100dvh - 16px);overflow-y:auto;padding:13px 14px;border-radius:16px}.nanachi-auth-close{top:8px;right:8px;width:32px;height:32px;border-radius:10px;font-size:22px}.nanachi-auth-head{gap:9px;margin-bottom:8px;padding-right:28px}.nanachi-auth-mark{width:42px;height:42px;border-radius:13px}.nanachi-auth-head h2{margin-bottom:2px;font-size:19px}.nanachi-auth-head p{font-size:12px;line-height:1.35}.nanachi-auth-tabs{gap:4px;margin-bottom:7px;padding:3px;border-radius:11px}.nanachi-auth-tabs button{min-height:36px;border-radius:9px}
        .nanachi-auth-form{gap:6px}.nanachi-auth-form label{gap:3px;font-size:12px}.nanachi-auth-form input{min-height:40px;padding:8px 10px;font-size:16px;border-radius:11px}.nanachi-auth-password-toggle{width:30px;height:30px}.nanachi-auth-sms-row{grid-template-columns:1fr 100px;gap:6px}.nanachi-auth-send-sms{min-height:40px;border-radius:11px;font-size:12px}.nanachi-auth-submit{min-height:42px;border-radius:11px;font-size:15px}.nanachi-auth-error,.nanachi-auth-note{min-height:0;font-size:11px;line-height:1.25}
      }
    `;
    document.head.appendChild(style);

    const gate = document.createElement("div");
    gate.id = "nanachi-auth-gate";
    gate.className = "nanachi-auth-gate";
    gate.dataset.mode = "login";
    gate.innerHTML = `
      <section class="nanachi-auth-panel" role="dialog" aria-modal="true" aria-labelledby="nanachi-auth-title">
        <button type="button" class="nanachi-auth-close" aria-label="返回游戏" title="返回游戏">×</button>
        <div class="nanachi-auth-head">
          <div class="nanachi-auth-mark"><img src="/static/nanachi-project-logo.png" alt="Compete!" /></div>
          <div>
            <h2 id="nanachi-auth-title">登录 Compete!</h2>
            <p>统一账号登录后，对战记录会同步到游戏厅。</p>
          </div>
        </div>
        <div class="nanachi-auth-tabs">
          <button type="button" class="active" data-auth-mode="login">登录</button>
          <button type="button" data-auth-mode="register">注册</button>
        </div>
        <form class="nanachi-auth-form">
          <label class="nanachi-auth-login-only">用户名 / 手机号<input name="email" type="text" autocomplete="username" /></label>
          <label class="nanachi-auth-register-only">手机号<input name="phone" type="tel" autocomplete="tel" inputmode="tel" /></label>
          <label class="nanachi-auth-register-only">昵称<input name="nickname" type="text" autocomplete="nickname" /></label>
          <label>密码<input name="password" type="password" autocomplete="current-password" required /></label>
          <label class="nanachi-auth-register-only">确认密码<input name="confirmPassword" type="password" autocomplete="new-password" /></label>
          <label class="nanachi-auth-register-only">短信验证码<div class="nanachi-auth-sms-row"><input name="smsCode" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="6 位验证码" /><button class="nanachi-auth-send-sms" type="button">发送验证码</button></div></label>
          <div class="nanachi-auth-note" aria-live="polite"></div>
          <div class="nanachi-auth-error" aria-live="polite"></div>
          <button class="nanachi-auth-submit" type="submit">登录</button>
        </form>
      </section>
    `;
    document.body.appendChild(gate);
    gate.querySelector(".nanachi-auth-close")?.addEventListener("click", hideAuthGate);

    const title = gate.querySelector("#nanachi-auth-title");
    const form = gate.querySelector(".nanachi-auth-form");
    const error = gate.querySelector(".nanachi-auth-error");
    const note = gate.querySelector(".nanachi-auth-note");
    const submit = gate.querySelector(".nanachi-auth-submit");
    const sendSms = gate.querySelector(".nanachi-auth-send-sms");
    const tabs = [...gate.querySelectorAll("[data-auth-mode]")];
    let smsCooldown = 0;
    let smsTimer = null;

    function updateSmsButton() {
      if (!sendSms) return;
      sendSms.disabled = smsCooldown > 0;
      sendSms.textContent = smsCooldown > 0 ? `${smsCooldown}s` : "发送验证码";
    }
    function startSmsCooldown(seconds) {
      smsCooldown = seconds;
      updateSmsButton();
      if (smsTimer) clearInterval(smsTimer);
      smsTimer = setInterval(() => {
        smsCooldown = Math.max(0, smsCooldown - 1);
        updateSmsButton();
        if (smsCooldown <= 0 && smsTimer) {
          clearInterval(smsTimer);
          smsTimer = null;
        }
      }, 1000);
    }

    function passwordEyeIcon(visible) {
      return visible
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 3 18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a17.4 17.4 0 0 1-3.2 4.1"/><path d="M6.6 6.7C3.6 8.8 2 12 2 12s3.5 7 10 7c1.8 0 3.4-.5 4.7-1.2"/></svg>';
    }

    function installPasswordToggles(root) {
      root.querySelectorAll('input[type="password"]').forEach((input) => {
        const wrapper = document.createElement("div");
        wrapper.className = "nanachi-auth-password-wrap";
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);
        const button = document.createElement("button");
        button.className = "nanachi-auth-password-toggle";
        button.type = "button";
        wrapper.appendChild(button);
        let visible = false;
        const sync = () => {
          button.hidden = !input.value;
          input.type = visible ? "text" : "password";
          button.setAttribute("aria-label", visible ? "隐藏密码" : "显示密码");
          button.innerHTML = passwordEyeIcon(visible);
        };
        input.addEventListener("input", sync);
        button.addEventListener("click", () => {
          visible = !visible;
          sync();
          input.focus();
        });
        sync();
      });
    }

    function setMode(mode) {
      gate.dataset.mode = mode;
      tabs.forEach((button) => button.classList.toggle("active", button.dataset.authMode === mode));
      title.textContent = mode === "register" ? "注册 Compete!" : "登录 Compete!";
      submit.textContent = mode === "register" ? "完成注册" : "登录";
      error.textContent = "";
      note.textContent = "";
    }

    installPasswordToggles(form);
    tabs.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.authMode)));
    sendSms.addEventListener("click", async () => {
      error.textContent = "";
      note.textContent = "";
      sendSms.disabled = true;
      sendSms.textContent = "发送中";
      try {
        const data = Object.fromEntries(new FormData(form).entries());
        const result = await api("/api/auth/sms/send", {
          method: "POST",
          body: JSON.stringify({ phone: data.phone }),
        });
        note.textContent = "验证码已发送，请注意查收";
        startSmsCooldown(result.intervalSeconds || 60);
      } catch (err) {
        error.textContent = err instanceof Error ? err.message : "验证码发送失败";
        smsCooldown = 0;
        updateSmsButton();
      }
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const mode = gate.dataset.mode;
      const data = Object.fromEntries(new FormData(form).entries());
      error.textContent = "";
      submit.disabled = true;
      submit.textContent = mode === "register" ? "注册中..." : "登录中...";
      try {
        const result = await api(`/api/auth/${mode}`, {
          method: "POST",
          body: JSON.stringify(data),
        });
        currentUser = result.user || null;
        gate.classList.remove("show");
        window.dispatchEvent(new CustomEvent("nanachi-authenticated", { detail: { user: result.user } }));
        updateGuestLoginHint();
        await startTracking();
      } catch (err) {
        error.textContent = err instanceof Error ? err.message : "登录失败，请稍后重试";
      } finally {
        submit.disabled = false;
        submit.textContent = mode === "register" ? "完成注册" : "登录";
      }
    });
  }

  function showAuthGate() {
    installAuthGate();
    document.getElementById("nanachi-auth-gate")?.classList.add("show");
  }

  function hideAuthGate() {
    document.getElementById("nanachi-auth-gate")?.classList.remove("show");
  }

  function isAuthGateVisible() {
    return Boolean(document.getElementById("nanachi-auth-gate")?.classList.contains("show"));
  }

  function installGuestLoginHint() {
    if (document.getElementById("nanachi-login-hint")) return;
    const style = document.createElement("style");
    style.textContent = `
      .nanachi-login-hint{display:grid;place-items:center;width:38px;height:38px;padding:0;border:1px solid rgba(56,224,255,.55);border-radius:50%;background:rgba(6,22,42,.94);color:#eafcff;font:inherit;box-shadow:0 0 18px rgba(56,224,255,.18);cursor:pointer}
      .nanachi-login-hint svg{width:23px;height:23px;fill:none;stroke:#38e0ff;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.nanachi-login-hint span{display:none}
      .nanachi-login-hint[hidden]{display:none}
    `;
    document.head.appendChild(style);
    const button = document.createElement("button");
    button.id = "nanachi-login-hint";
    button.className = "nanachi-login-hint";
    button.type = "button";
    button.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path></svg><span><strong>游客模式</strong><small>登录后同步进度</small></span>';
    button.setAttribute("aria-label", "登录后同步进度");
    button.title = "登录后同步进度";
    button.addEventListener("click", showAuthGate);
    document.body.appendChild(button);
  }

  function updateGuestLoginHint() {
    const hint = document.getElementById("nanachi-login-hint");
    if (hint) hint.hidden = Boolean(currentUser);
  }
  async function bootstrapAuth() {
    installAuthGate();
    try {
      const me = await api("/api/auth/me");
      if (me.user) {
        currentUser = me.user;
        hideAuthGate();
        window.dispatchEvent(new CustomEvent("nanachi-authenticated", { detail: { user: me.user } }));
        updateGuestLoginHint();
        await startTracking();
        return;
      }
    } catch {
      currentUser = null;
    }
    window.dispatchEvent(new CustomEvent("nanachi-auth-ready", { detail: { user: null } }));
    updateGuestLoginHint();
  }

  function launcherUrl() {
    const saved = localStorage.getItem(RETURN_TO_KEY);
    if (saved) {
      try {
        const target = new URL(saved);
        const local = ["localhost", "127.0.0.1", "::1"].includes(target.hostname);
        if (local || target.hostname === "lijiaqi.me") return target.href;
      } catch {}
    }
    if (document.referrer) {
      try {
        const referrer = new URL(document.referrer);
        if (referrer.origin !== window.location.origin) return referrer.origin;
      } catch {}
    }
    const hostname = window.location.hostname;
    const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
    return isLocal ? "http://127.0.0.1:5175" : `${window.location.protocol}//${hostname}`;
  }

  function installGameCenterBackGuard() {
    if (window.__nanachiGameCenterBackGuard) return;
    window.__nanachiGameCenterBackGuard = true;

    const style = document.createElement("style");
    style.textContent = `
      .nanachi-exit-overlay{position:fixed;inset:0;z-index:9999;display:none;place-items:center;background:rgba(4,7,13,.7);backdrop-filter:blur(10px);padding:20px}
      .nanachi-exit-overlay.show{display:grid}
      .nanachi-exit-dialog{width:min(370px,100%);border-radius:18px;border:1px solid rgba(116,174,255,.24);background:linear-gradient(145deg,#101826,#17111f);box-shadow:0 26px 80px rgba(0,0,0,.48);padding:20px;color:#f4f7ff;font-family:inherit}
      .nanachi-exit-dialog h2{margin:0 0 8px;font-size:22px;line-height:1.2}
      .nanachi-exit-dialog p{margin:0 0 18px;color:#aeb8cb;line-height:1.55;font-size:14px}
      .nanachi-exit-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .nanachi-exit-actions button{border:0;border-radius:14px;min-height:46px;font:inherit;font-weight:900;cursor:pointer}
      .nanachi-exit-cancel{background:#232c3d;color:#dbe5f8}
      .nanachi-exit-ok{background:#6f8cff;color:#ffffff}
    `;
    document.head.appendChild(style);

    const overlay = document.createElement("div");
    overlay.className = "nanachi-exit-overlay";
    overlay.innerHTML = `
      <section class="nanachi-exit-dialog" role="dialog" aria-modal="true" aria-labelledby="nanachi-exit-title">
        <h2 id="nanachi-exit-title">确定回到房间吗？</h2>
        <p>如果您尚未登录，在当前游戏中的进度将不会保存。</p>
        <div class="nanachi-exit-actions">
          <button class="nanachi-exit-cancel" type="button">留在游戏</button>
          <button class="nanachi-exit-ok" type="button">回到房间</button>
        </div>
      </section>
    `;
    document.body.appendChild(overlay);

    let leavingToLauncher = false;
    function hasProjectInternalState(state) {
      return Boolean(state?.yichuiInternal || state?.innerScreen || state?.nameBattleInternal);
    }
    function ensureGuard() {
      if (leavingToLauncher) return;
      const current = window.history.state || {};
      if (current.nanachiExitGuard || hasProjectInternalState(current)) return;
      window.history.replaceState({ ...current, nanachiGameBase: true }, "", window.location.href);
      window.history.pushState({ nanachiExitGuard: true }, "", window.location.href);
    }
    function closeDialog() {
      overlay.classList.remove("show");
      window.setTimeout(ensureGuard, 0);
    }
    function isCoverVisible() {
      const splash = document.getElementById("splash");
      return Boolean(splash && !splash.classList.contains("hide"));
    }
    function leaveToLauncher() {
      leavingToLauncher = true;
      endTracking();
      window.location.href = launcherUrl();
    }

    ensureGuard();
    requestAnimationFrame(ensureGuard);
    window.setTimeout(ensureGuard, 100);
    window.setTimeout(ensureGuard, 500);
    window.addEventListener("popstate", (event) => {
      if (event.state?.nanachiGameBase) {
        if (isAuthGateVisible() || isCoverVisible()) {
          leaveToLauncher();
          return;
        }
        overlay.classList.add("show");
        window.setTimeout(ensureGuard, 0);
      }
    });
    overlay.querySelector(".nanachi-exit-cancel").addEventListener("click", closeDialog);
    overlay.querySelector(".nanachi-exit-ok").addEventListener("click", () => {
      leaveToLauncher();
    });
  }

  function start() {
    window.NanachiGameShell?.record("project_open", PROJECT_ID);
    installGameCenterBackGuard();
    installGuestLoginHint();
    updateGuestLoginHint();    void bootstrapAuth();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") sendHeartbeat();
  });
  window.addEventListener("pagehide", endTracking);
  window.addEventListener("beforeunload", endTracking);
  if (document.body) {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  }
})();
