// ==UserScript==
// @name         CoZ 一键采集当前图片
// @namespace    https://henan-inventory.vercel.app/
// @version      1.0.0
// @description  从当前 CoZ 页面已请求资源中下载商品图片并生成 ZIP 与映射清单。
// @match        http://it.justinallen.com:8899/coz/*
// @grant        none
// @require      https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js
// ==/UserScript==

(() => {
  "use strict";
  const id = "coz-one-click-capture";
  const safeName = (value) => decodeURIComponent(String(value || "")).split("/").pop().split("?")[0];
  function imageUrls() {
    const urls = new Map();
    const add = (value) => {
      const raw = String(value || "");
      if (!/\/Upload\//i.test(raw) || !/\.(?:jpe?g|png|webp)(?:[?#]|$)/i.test(raw)) return;
      const absolute = new URL(raw, location.href).href;
      urls.set(absolute, safeName(absolute));
    };
    document.querySelectorAll("img, [imagename]").forEach((node) => { add(node.currentSrc || node.src); add(node.getAttribute("imagename")); });
    performance.getEntriesByType("resource").forEach((entry) => add(entry.name));
    const html = document.documentElement?.outerHTML || "";
    for (const match of html.matchAll(/(?:https?:\/\/[^"'\s]+)?\/Upload\/([^"'?#\s]+)/gi)) add(match[0]);
    return [...urls.entries()].map(([url, name]) => ({ url, name }));
  }
  async function capture() {
    const status = document.getElementById(`${id}-status`); const button = document.getElementById(`${id}-button`); button.disabled = true;
    try {
      const list = imageUrls(); if (!list.length) throw new Error("当前页面还没有检测到 CoZ 商品图片，请先滚动加载");
      const zip = new JSZip(); const rows = ["style,color,file"];
      for (const [index, item] of list.entries()) {
        const response = await fetch(item.url, { credentials: "include" }); if (!response.ok) continue;
        const blob = await response.blob(); const file = `${String(index + 1).padStart(4, "0")}_${item.name}`; zip.file(file, blob); rows.push(`,,"${file.replaceAll('"', '""')}"`); status.textContent = `正在采集 ${index + 1}/${list.length}`;
      }
      zip.file("mapping.csv", `\uFEFF${rows.join("\r\n")}`); const output = await zip.generateAsync({ type: "blob" }); const link = document.createElement("a"); link.href = URL.createObjectURL(output); link.download = "coz-images-and-mapping.zip"; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); status.textContent = `完成：已打包 ${rows.length - 1} 张，请解压后上传`;
    } catch (error) { status.textContent = error.message; } finally { button.disabled = false; }
  }
  if (document.getElementById(id)) return; const panel = document.createElement("aside"); panel.id = id; panel.innerHTML = `<strong>CoZ 图片采集</strong><small>先滚动加载更多，再一键打包</small><button id="${id}-button" type="button">一键下载图片包</button><span id="${id}-status">等待操作</span>`; document.body.appendChild(panel); panel.querySelector("button").addEventListener("click", capture); const style = document.createElement("style"); style.textContent = `#${id}{position:fixed;right:18px;bottom:18px;z-index:2147483646;width:230px;padding:14px;border:1px solid #b8c9c1;border-radius:7px;background:#fff;color:#173f35;box-shadow:0 12px 32px rgba(0,0,0,.2);font:14px/1.45 Arial,"Microsoft YaHei",sans-serif}#${id} strong,#${id} small,#${id} span{display:block}#${id} small{margin:3px 0 10px;color:#66736e}#${id} button{width:100%;height:36px;border:0;border-radius:5px;background:#176b54;color:#fff;font-weight:700;cursor:pointer}#${id} button:disabled{opacity:.5}#${id} span{margin-top:8px;color:#66736e;font-size:12px}`; document.head.appendChild(style);
})();
