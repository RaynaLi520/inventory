(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const panels = { login: $("loginForm"), register: $("registerForm"), forgot: $("forgotForm"), change: $("changePasswordForm") };
  const copy = {
    login: ["登录库存平台", "使用公司账号继续", "Sign in to inventory", "Continue with your company account"],
    register: ["注册账号", "提交后由管理员审核", "Create your account", "An administrator will approve access"],
    forgot: ["申请重置密码", "管理员将处理你的申请", "Reset password", "An administrator will handle your request"],
    change: ["设置新密码", "首次登录需要完成此步骤", "Set a new password", "Required before your first access"]
  };
  let language = localStorage.getItem("ja-garment-language") || "zh";
  let theme = localStorage.getItem("ja-garment-theme") || "light";

  function renderIcons() { if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } }); }
  function showAlert(message, success = false) { const alert = $("authAlert"); alert.textContent = message; alert.classList.toggle("success", success); alert.hidden = !message; }
  function setBusy(form, busy) { form.querySelectorAll("button,input").forEach((element) => { element.disabled = busy; }); }
  function normalizeIdentifier(value) {
    return String(value || "").normalize("NFKC").replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").trim().toLowerCase();
  }
  function nextUrl() { const value = new URLSearchParams(location.search).get("next") || "/"; return value.startsWith("/") && !value.startsWith("//") ? value : "/"; }
  function showPanel(name) {
    Object.entries(panels).forEach(([key, panel]) => { panel.hidden = key !== name; });
    const values = copy[name];
    $("authTitle").textContent = language === "zh" ? values[0] : values[2];
    $("authSubtitle").textContent = language === "zh" ? values[1] : values[3];
    showAlert("");
    history.replaceState(null, "", name === "login" ? `${location.pathname}${location.search}` : `#${name}`);
  }
  function applyLanguage() {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    document.querySelectorAll("[data-zh][data-en]").forEach((element) => { element.textContent = element.dataset[language]; });
    $("authLanguage").querySelector("span").textContent = language === "zh" ? "English" : "中文";
    const active = Object.entries(panels).find(([, panel]) => !panel.hidden)?.[0] || "login";
    const values = copy[active];
    $("authTitle").textContent = language === "zh" ? values[0] : values[2];
    $("authSubtitle").textContent = language === "zh" ? values[1] : values[3];
  }
  function applyTheme() {
    document.documentElement.dataset.theme = theme;
    const button = $("authTheme");
    button.innerHTML = `<i data-lucide="${theme === "dark" ? "sun" : "moon"}"></i><span>${language === "zh" ? (theme === "dark" ? "浅色" : "深色") : (theme === "dark" ? "Light" : "Dark")}</span>`;
    button.title = language === "zh" ? "切换深浅色" : "Toggle light/dark mode";
    renderIcons();
  }
  async function api(path, body) {
    const response = await fetch(`/api/auth/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(payload.error || `HTTP ${response.status}`); error.code = payload.code; throw error; }
    return payload;
  }
  async function resumeSession() {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (!response.ok) return;
      const { user } = await response.json();
      if (user?.mustChangePassword) showPanel("change");
      else if (user) location.replace(nextUrl());
    } catch (_) { /* The form remains usable when the API is temporarily unavailable. */ }
  }
  async function submit(form, action) {
    showAlert(""); setBusy(form, true);
    try { await action(new FormData(form)); }
    catch (error) { showAlert(error.message); }
    finally { setBusy(form, false); renderIcons(); }
  }
  $("loginForm").addEventListener("submit", (event) => { event.preventDefault(); submit(event.currentTarget, async (data) => {
    try {
      const payload = await api("login", { identifier: normalizeIdentifier(data.get("identifier")), password: data.get("password") });
      if (payload.user?.mustChangePassword) { $("currentPassword").value = String(data.get("password")); showPanel("change"); return; }
      location.replace(nextUrl());
    } catch (error) {
      if (error.code === "PASSWORD_CHANGE_REQUIRED") { $("currentPassword").value = String(data.get("password")); showPanel("change"); return; }
      throw error;
    }
  }); });
  $("registerForm").addEventListener("submit", (event) => { event.preventDefault(); submit(event.currentTarget, async (data) => {
    if (data.get("password") !== data.get("confirmPassword")) throw new Error(language === "zh" ? "两次输入的密码不一致" : "Passwords do not match");
    const result = await api("register", Object.fromEntries(data));
    showPanel("login"); showAlert(result.message, true);
  }); });
  $("forgotForm").addEventListener("submit", (event) => { event.preventDefault(); submit(event.currentTarget, async (data) => {
    const result = await api("request-password-reset", { identifier: normalizeIdentifier(data.get("identifier")) }); showAlert(result.message, true);
  }); });
  $("changePasswordForm").addEventListener("submit", (event) => { event.preventDefault(); submit(event.currentTarget, async (data) => {
    if (data.get("newPassword") !== data.get("confirmPassword")) throw new Error(language === "zh" ? "两次输入的新密码不一致" : "Passwords do not match");
    await api("change-password", { currentPassword: data.get("currentPassword"), newPassword: data.get("newPassword") }); location.replace(nextUrl());
  }); });
  document.querySelectorAll("[data-show-panel]").forEach((button) => button.addEventListener("click", () => showPanel(button.dataset.showPanel)));
  document.querySelectorAll("[data-password-toggle]").forEach((button) => button.addEventListener("click", () => { const input = $(button.dataset.passwordToggle); input.type = input.type === "password" ? "text" : "password"; button.innerHTML = `<i data-lucide="${input.type === "password" ? "eye" : "eye-off"}"></i>`; renderIcons(); }));
  $("authLanguage").addEventListener("click", () => { language = language === "zh" ? "en" : "zh"; localStorage.setItem("ja-garment-language", language); applyLanguage(); });
  $("authTheme").addEventListener("click", () => { theme = theme === "dark" ? "light" : "dark"; localStorage.setItem("ja-garment-theme", theme); applyTheme(); });
  const initial = location.hash === "#change-password" ? "change" : location.hash === "#register" ? "register" : location.hash === "#forgot" ? "forgot" : "login";
  showPanel(initial); applyLanguage(); applyTheme(); renderIcons();
  resumeSession();
})();
