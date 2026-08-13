// ==UserScript==
// @name         JA CoZ 手动批量图片上传
// @namespace    https://henan-inventory.vercel.app/
// @version      1.0.0
// @description  选择 CoZ 图片和 mapping.csv，批量上传并关联库存 SKU。
// @match        https://henan-inventory.vercel.app/*
// @grant        none
// ==/UserScript==

(() => {
  "use strict";
  const SUPABASE_CONFIG_URL = `${location.origin}/assets/supabase-config.js`;
  const panelId = "coz-manual-image-uploader";
  const clean = (value) => String(value ?? "").replace(/^\uFEFF/, "").trim();
  const key = (value) => clean(value).toLowerCase();
  const safe = (value) => clean(value).toUpperCase().replace(/[^A-Z0-9+_-]+/g, "-").replace(/^-+|-+$/g, "") || "SKC";
  const mime = (file) => ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" }[file.name.slice(file.name.lastIndexOf(".")).toLowerCase()] || "");
  const stamp = (index) => new Date(Date.now() + index * 1000).toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  let configPromise;

  function csvLine(line) {
    const cells = [];
    let value = "", quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"' && line[i + 1] === '"') { value += '"'; i += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) { cells.push(clean(value)); value = ""; }
      else value += char;
    }
    cells.push(clean(value));
    return cells;
  }

  function parseCsv(text) {
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) throw new Error("mapping.csv 需要表头和至少一行数据");
    const header = csvLine(lines[0]).map(key);
    const styleIndex = header.indexOf("style");
    const colorIndex = header.indexOf("color");
    const fileIndex = header.indexOf("file");
    if (styleIndex < 0 || colorIndex < 0 || fileIndex < 0) throw new Error("CSV 表头必须是 style,color,file");
    return lines.slice(1).map((line, index) => {
      const cells = csvLine(line);
      return { line: index + 2, style: cells[styleIndex], color: cells[colorIndex], file: cells[fileIndex] };
    }).filter((row) => row.style && row.color && row.file);
  }

  async function config() {
    if (!configPromise) configPromise = fetch(SUPABASE_CONFIG_URL).then((r) => r.text()).then((text) => ({
      url: text.match(/url:\s*["']([^"']+)/)?.[1]?.replace(/\/$/, ""),
      anonKey: text.match(/anonKey:\s*["']([^"']+)/)?.[1]
    }));
    return configPromise;
  }

  async function api(url, options = {}, auth) {
    const response = await fetch(url, { ...options, headers: { apikey: auth, Authorization: `Bearer ${auth}`, ...(options.headers || {}) } });
    const text = await response.text();
    if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 180)}`);
    return text ? JSON.parse(text) : null;
  }

  function setStatus(message, kind = "") {
    const node = document.getElementById("coz-image-upload-status");
    if (node) { node.textContent = message; node.dataset.kind = kind; }
  }

  async function upload() {
    const imageInput = document.getElementById("coz-image-upload-files");
    const csvInput = document.getElementById("coz-image-upload-csv");
    const button = document.getElementById("coz-image-upload-start");
    const images = [...(imageInput.files || [])];
    const csvFile = csvInput.files?.[0];
    if (!images.length || !csvFile) { setStatus("请先选择图片和 mapping.csv", "error"); return; }
    button.disabled = true;
    try {
      const cfg = await config();
      if (!cfg.url || !cfg.anonKey) throw new Error("Supabase 配置未加载");
      const mappings = parseCsv(await csvFile.text());
      const imageByName = new Map(images.map((file) => [key(file.name), file]));
      const records = await api(`${cfg.url}/rest/v1/inventory_platform_state?id=eq.default&select=data`, {}, cfg.anonKey);
      if (!records?.[0]?.data) throw new Error("找不到库存云端数据");
      const document = records[0].data;
      const products = document.state?.products || [];
      const colorMappings = document.colorMappings || {};
      const result = { uploaded: [], skipped: [], failed: [] };
      for (const [index, row] of mappings.entries()) {
        const file = imageByName.get(key(row.file));
        if (!file || !mime(file)) { result.failed.push({ ...row, reason: "找不到图片或格式不支持" }); continue; }
        const matches = products.filter((product) => [product.style, product.sourceBaseSku, product.baseSku, product.originalStyle].map(key).includes(key(row.style)) && key(product.color) === key(row.color));
        if (!matches.length) { result.skipped.push({ ...row, reason: "没有匹配的款号+颜色" }); continue; }
        const code = safe(matches[0].colorCode || colorMappings[row.color] || "COLOR");
        const ext = file.name.toLowerCase().endsWith(".jpeg") ? ".jpg" : file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
        const objectName = `${safe(row.style)}-${code}_${stamp(index)}${ext}`;
        try {
          await api(`${cfg.url}/storage/v1/object/product-images/${encodeURIComponent(objectName)}`, { method: "POST", body: await file.arrayBuffer(), headers: { "Content-Type": mime(file), "x-upsert": "true" } }, cfg.anonKey);
          const imageUrl = `${cfg.url}/storage/v1/object/public/product-images/${encodeURIComponent(objectName)}`;
          matches.forEach((product) => { product.image = imageUrl; product.imageName = objectName; product.imageUpdatedAt = new Date().toISOString(); product.imageSyncStatus = "available"; });
          document.imageCatalog = Array.isArray(document.imageCatalog) ? document.imageCatalog : [];
          document.imageCatalog.push({ style: row.style, color: row.color, sourceName: row.file, imageName: objectName, imageUrl, status: "available" });
          result.uploaded.push({ ...row, objectName, matchedProducts: matches.length });
          setStatus(`已上传 ${result.uploaded.length}/${mappings.length} 张`, "working");
        } catch (error) { result.failed.push({ ...row, reason: error.message }); }
      }
      await api(`${cfg.url}/rest/v1/inventory_platform_state?id=eq.default`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ data: document, updated_at: new Date().toISOString() }) }, cfg.anonKey);
      setStatus(`完成：成功 ${result.uploaded.length}，跳过 ${result.skipped.length}，失败 ${result.failed.length}`, result.failed.length ? "error" : "success");
      console.log("CoZ image upload result", result);
    } catch (error) { setStatus(error.message || "批量上传失败", "error"); }
    finally { button.disabled = false; }
  }

  function mount() {
    if (document.getElementById(panelId)) return;
    const panel = document.createElement("aside");
    panel.id = panelId;
    panel.innerHTML = `<strong>CoZ 图片批量上传</strong><small>按款号 + 颜色匹配库存</small><label>图片（可多选）<input id="coz-image-upload-files" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><label>映射表 CSV<input id="coz-image-upload-csv" type="file" accept=".csv,text/csv"></label><button id="coz-image-upload-start" type="button">开始上传</button><span id="coz-image-upload-status">等待选择文件</span>`;
    document.body.appendChild(panel);
    document.getElementById("coz-image-upload-start").addEventListener("click", upload);
    const style = document.createElement("style");
    style.textContent = `#${panelId}{position:fixed;right:18px;bottom:18px;z-index:2147483646;width:260px;padding:15px;border:1px solid #b8c9c1;border-radius:7px;background:#fff;color:#173f35;box-shadow:0 12px 32px rgba(0,0,0,.2);font:14px/1.45 Arial,"Microsoft YaHei",sans-serif}#${panelId} strong,#${panelId} small,#${panelId} label,#${panelId} span{display:block}#${panelId} small{margin:3px 0 10px;color:#66736e}#${panelId} label{margin:8px 0;font-weight:600}#${panelId} input{display:block;width:100%;margin-top:4px;font-size:12px}#${panelId} button{width:100%;height:36px;margin-top:7px;border:0;border-radius:5px;background:#176b54;color:#fff;font-weight:700;cursor:pointer}#${panelId} button:disabled{opacity:.55;cursor:wait}#${panelId} span{min-height:22px;margin-top:9px;color:#66736e;font-size:12px}#${panelId} span[data-kind=success]{color:#176b54}#${panelId} span[data-kind=error]{color:#b8473f}`;
    document.head.appendChild(style);
  }
  mount();
})();
