// ==UserScript==
// @name         CoZ 当前图片清单导出
// @namespace    https://henan-inventory.vercel.app/
// @version      1.2.0
// @description  导出当前 CoZ 图片页已加载的图片文件名，生成 mapping.csv 模板。
// @match        http://it.justinallen.com:8899/coz/*
// @grant        none
// ==/UserScript==

(() => {
  "use strict";
  const id = "coz-image-manifest-exporter";
  function sourceNameFromUrl(value) {
    const raw = String(value || "");
    if (!raw || /GeneratedResources|Resources\/Images/i.test(raw)) return "";
    try {
      const decoded = decodeURIComponent(raw);
      const match = decoded.match(/(?:^|\/)(?:Upload\/)?([^/?#]+\.(?:jpe?g|png|webp))(?:[?#]|$)/i);
      return match ? match[1] : "";
    } catch (_) { return ""; }
  }
  const sourceImages = () => {
    const names = [];
    document.querySelectorAll("img").forEach((image) => {
      names.push(sourceNameFromUrl(image.currentSrc || image.src));
      ["data-src", "data-original", "data-lazy-src"].forEach((attribute) => names.push(sourceNameFromUrl(image.getAttribute(attribute))));
    });
    document.querySelectorAll("[imagename], [forguncyimage], [style*='background-image']").forEach((element) => {
      names.push(sourceNameFromUrl(element.getAttribute("imagename")));
      names.push(sourceNameFromUrl(element.getAttribute("data-src")));
      const background = element.style.backgroundImage || element.getAttribute("style") || "";
      const match = background.match(/url\(["']?([^"')]+)["']?\)/i);
      names.push(sourceNameFromUrl(match?.[1]));
    });
    performance.getEntriesByType("resource").forEach((entry) => names.push(sourceNameFromUrl(entry.name)));
    const html = document.documentElement?.outerHTML || "";
    for (const match of html.matchAll(/(?:https?:\/\/[^"'\s]+)?\/Upload\/([^"'?#\s]+)/gi)) names.push(sourceNameFromUrl(match[0]));
    return names.filter(Boolean);
  };
  function exportCsv() {
    const names = [...new Set(sourceImages())];
    const csv = ["style,color,file", ...names.map((name) => `,,"${name.replaceAll('"', '""')}"`)].join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "mapping.csv"; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    const status = document.getElementById(`${id}-status`); status.textContent = `已导出 ${names.length} 张图片文件名`; 
  }
  if (document.getElementById(id)) return;
  const panel = document.createElement("aside"); panel.id = id; panel.innerHTML = `<strong>CoZ 图片清单</strong><small>先滚动页面加载更多图片</small><button type="button">导出 mapping.csv</button><span id="${id}-status">当前已加载 0 张</span>`; document.body.appendChild(panel);
  const refresh = () => { const count = new Set(sourceImages()).size; document.getElementById(`${id}-status`).textContent = `当前已加载 ${count} 张`; };
  panel.querySelector("button").addEventListener("click", exportCsv); refresh(); setInterval(refresh, 1500);
  const style = document.createElement("style"); style.textContent = `#${id}{position:fixed;right:18px;bottom:18px;z-index:2147483646;width:220px;padding:14px;border:1px solid #b8c9c1;border-radius:7px;background:#fff;color:#173f35;box-shadow:0 12px 32px rgba(0,0,0,.2);font:14px/1.45 Arial,"Microsoft YaHei",sans-serif}#${id} strong,#${id} small,#${id} span{display:block}#${id} small{margin:3px 0 10px;color:#66736e}#${id} button{width:100%;height:36px;border:0;border-radius:5px;background:#176b54;color:#fff;font-weight:700;cursor:pointer}#${id} span{margin-top:8px;color:#66736e;font-size:12px}`; document.head.appendChild(style);
})();
