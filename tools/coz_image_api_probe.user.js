// ==UserScript==
// @name         CoZ 图片接口负载采集器
// @namespace    https://henan-inventory.vercel.app/
// @version      1.0.0
// @description  在登录后的 CoZ 图片页记录 GetTableDataWithOffset 请求负载和完整响应。
// @match        http://it.justinallen.com:8899/coz/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(() => {
  "use strict";
  const TARGET = "/coz/Home/GetTableDataWithOffset";
  const originalFetch = window.fetch;
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const captures = [];
  const text = (value) => typeof value === "string" ? value : "";
  function relevant(url) { return text(url).includes(TARGET); }
  function save(payload, responseText, status) {
    try {
      const body = typeof payload === "string" ? JSON.parse(payload) : payload;
      const response = typeof responseText === "string" ? JSON.parse(responseText) : responseText;
      const data = response?.table?.Data || response?.Data || [];
      captures.push({ capturedAt: new Date().toISOString(), status, body, response, rowCount: Array.isArray(data) ? data.length : 0 });
      updatePanel();
    } catch (_) { /* Ignore non-JSON traffic. */ }
  }
  if (originalFetch) window.fetch = async function(input, init = {}) {
    const response = await originalFetch.apply(this, arguments);
    const url = typeof input === "string" ? input : input?.url;
    if (relevant(url)) response.clone().text().then((body) => save(init.body, body, response.status));
    return response;
  };
  XMLHttpRequest.prototype.open = function(method, url) { this.__cozImageUrl = url; return originalOpen.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function(body) {
    if (relevant(this.__cozImageUrl)) this.addEventListener("load", () => save(body, this.responseText, this.status), { once: true });
    return originalSend.apply(this, arguments);
  };
  function downloadCapture() {
    const best = [...captures].sort((a, b) => b.rowCount - a.rowCount)[0];
    if (!best) return;
    const blob = new Blob([JSON.stringify(best, null, 2)], { type: "application/json" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "coz-image-api-capture.json"; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
  function updatePanel() {
    const status = document.getElementById("coz-api-probe-status");
    if (!status) return;
    const best = [...captures].sort((a, b) => b.rowCount - a.rowCount)[0];
    status.textContent = best ? `已捕获 ${best.rowCount} 行，状态 ${best.status}` : "等待图片表格请求";
    document.getElementById("coz-api-probe-download").disabled = !best;
  }
  function mount() {
    if (document.getElementById("coz-image-api-probe")) return;
    const panel = document.createElement("aside"); panel.id = "coz-image-api-probe"; panel.innerHTML = `<strong>图片接口采集</strong><small>刷新页面后自动记录完整请求</small><button id="coz-api-probe-download" type="button" disabled>下载接口数据</button><span id="coz-api-probe-status">等待图片表格请求</span>`; document.body.appendChild(panel);
    panel.querySelector("button").addEventListener("click", downloadCapture);
    const style = document.createElement("style"); style.textContent = `#coz-image-api-probe{position:fixed;right:18px;bottom:18px;z-index:2147483647;width:230px;padding:14px;border:1px solid #b8c9c1;border-radius:7px;background:#fff;color:#173f35;box-shadow:0 12px 32px rgba(0,0,0,.2);font:14px/1.45 Arial,"Microsoft YaHei",sans-serif}#coz-image-api-probe strong,#coz-image-api-probe small,#coz-image-api-probe span{display:block}#coz-image-api-probe small{margin:3px 0 10px;color:#66736e}#coz-image-api-probe button{width:100%;height:36px;border:0;border-radius:5px;background:#176b54;color:#fff;font-weight:700;cursor:pointer}#coz-image-api-probe button:disabled{opacity:.45}#coz-image-api-probe span{margin-top:8px;color:#66736e;font-size:12px}`; document.head.appendChild(style);
    updatePanel();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true }); else mount();
})();
