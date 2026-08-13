// ==UserScript==
// @name         CoZ Inventory Bridge
// @namespace    https://henan-inventory.vercel.app/
// @version      1.2.0
// @description  Sync the signed-in CoZ inventory view to the JA inventory platform.
// @match        http://it.justinallen.com:8899/coz/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
  "use strict";

  const TARGET_ORIGIN = "https://henan-inventory.vercel.app";
  const ENDPOINT = "/coz/Home/GetTableDataWithOffset";
  const INTERVAL_MS = 60_000;
  const BRIDGE_TOKEN = [...crypto.getRandomValues(new Uint8Array(18))].map((value) => value.toString(16).padStart(2, "0")).join("");
  const TARGET_URL = `${TARGET_ORIGIN}/?coz-sync=1&bridge=${BRIDGE_TOKEN}`;
  const REQUEST_PAYLOAD = {
    bindingInfos: [
      "ab691941-4e74-402c-884c-60e396eeab41", "3f90d5ab-de62-477f-80aa-59296cec7743",
      "f836d893-b3e0-4b76-9bca-b67aa62b73b1", "ef91c458-52f8-4f17-aef4-7bc46f61cb22",
      "0427161e-1511-4740-a83c-5bb836d430ce", "f41a3c26-6ade-40f9-a3b0-3257170dc0bb",
      "9e6b4a5b-59cd-4c01-8284-06dae1a8f10d", "694b0b7e-27de-436e-b820-6b88f2cabcde",
      "21f6740e-b127-42a0-9efd-cac2b2b6a445", "73601d87-c7c5-4813-8c56-7faa6d681dfa",
      "6cc3dcc2-c84b-42c8-ac82-3cfa3f3f3852", "09330c99-90b9-4445-8aca-0d7b4b19d4a3",
      "0bd883c3-d172-408d-89d8-5fb0296e2dd5", "3f5188ec-0be3-4ad2-a350-7eb3877e1a7c",
      "5e52e85c-1558-4d82-81cd-56d8f629ccac", "b5575836-9911-4ebe-bac4-018e77388975",
      "ff47daa9-e386-49ed-8889-d0c0a66385e9", "81a45f62-685e-4551-b085-e6020b3f5f93",
      "a7388dd2-6d68-4f8f-9c73-a776a3740c4f", "2b7d4821-3df4-478a-9544-41571904ab13",
      "cac9b4a2-d87f-4b65-9208-a5e01d0d52d1", "c8d91e00-d72e-47ea-9e41-42eaefd2033d",
      "401402f5-e301-4be9-8ecf-486a6fceaed1", "2d37ac90-ddba-49af-a6d1-551483ebb72e",
      "5e186837-d8e8-4f3b-914c-03fd4820a779", "37bed482-9bf7-409e-9f98-a2ba9d7d055e",
      "d2331586-2510-47d4-a286-a07692cba47d", "e56630e7-2c0d-49bd-bcda-05480ca526e0",
      "a0b2ca7f-648a-4fdb-8f20-530a06aec82a", "21cc2a6c-db6a-467c-998b-3c2b9c3ce10e"
    ],
    currentRowInfo: {
      currentTable: "SKU库存展示",
      viewname: "库存查询页面表格1",
      listviewLocation: "库存查询页面|表格1",
      viewConditionFormulaValues: { "=L2": 1, "=Y2": null, "=AP2": null, "=AH2": null }
    },
    demandRowCount: 0,
    currentDataLength: 0,
    needRowVersion: true,
    editorDataInfos: null,
    sortCommandID: null,
    orderByInfo: null,
    offsetConditionInfo: { targetPage: 1, pageLimitRowCount: 0 },
    columnFilterQueries: null,
    totalRowBindingInfos: ["54688e62-97a9-4e3d-ae4f-d1936dca60db"],
    pageName: "库存查询页面"
  };

  let inventoryWindow = null;
  let timer = null;
  let syncing = false;
  let lastSnapshot = null;
  const imageDataCache = new Map();

  function clean(value) {
    return value == null ? "" : String(value).replaceAll("\t", "").trim();
  }

  function number(value) {
    if (value == null || value === "") return 0;
    const parsed = Number(String(value).replaceAll(",", "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function excelDate(value) {
    const serial = number(value);
    if (!serial) return null;
    return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).toISOString().slice(0, 10);
  }

  function normalizeSize(value) {
    const size = clean(value) || "F";
    return /^(?:free(?:\s*size|\s*尺码)?|均码|one\s*size|os)$/i.test(size) ? "F" : size;
  }

  function normalizedImageName(skc, extension = "jpg", date = new Date()) {
    const safeSkc = clean(skc).toUpperCase().replace(/[^A-Z0-9+_-]+/g, "-").replace(/^-+|-+$/g, "") || "SKC";
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}`;
    return `${safeSkc}_${stamp}.${extension === "jpeg" ? "jpg" : extension}`;
  }

  function imageKey(value) {
    return clean(value).match(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/i)?.[0].toLowerCase() || "";
  }

  function pageImageSources() {
    const sources = new Map();
    document.querySelectorAll("img").forEach((image) => {
      const candidates = [image.currentSrc, image.src, image.dataset.src, image.dataset.original, image.getAttribute("data-lazy-src")];
      candidates.filter(Boolean).forEach((source) => {
        let decoded = source;
        try { decoded = decodeURIComponent(source); } catch (_) { /* Keep the original URL. */ }
        const key = imageKey(decoded);
        if (key && !sources.has(key)) sources.set(key, source);
      });
    });
    return sources;
  }

  async function thumbnailDataUrl(source) {
    const response = await fetch(source, { credentials: "include" });
    if (!response.ok) throw new Error(`图片读取失败（${response.status}）`);
    const objectUrl = URL.createObjectURL(await response.blob());
    try {
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("图片无法解码"));
        element.src = objectUrl;
      });
      const scale = Math.min(1, 144 / image.naturalWidth, 180 / image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      context.fillStyle = "#f4f5f2";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.68);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function attachPageImages(snapshot) {
    const sources = pageImageSources();
    const pending = new Map();
    snapshot.inventory.forEach((item) => {
      const key = imageKey(item.imagePath);
      if (key && sources.has(key) && !imageDataCache.get(key)) pending.set(key, sources.get(key));
    });
    const entries = [...pending.entries()];
    for (let index = 0; index < entries.length; index += 4) {
      await Promise.all(entries.slice(index, index + 4).map(async ([key, source]) => {
        try { imageDataCache.set(key, await thumbnailDataUrl(source)); }
        catch (_) { imageDataCache.set(key, ""); }
      }));
    }
    const syncTime = new Date();
    snapshot.inventory.forEach((item) => {
      item.imageUrl = imageDataCache.get(imageKey(item.imagePath)) || "";
      item.imageName = normalizedImageName(item.styleNo || item.sku, "jpg", syncTime);
      item.imageSourceName = item.imagePath || "";
    });
    snapshot.imageCount = new Set(snapshot.inventory.filter((item) => item.imageUrl).map((item) => item.imagePath)).size;
    return snapshot;
  }

  function rowSku(row) {
    try {
      const query = typeof row.Query === "string" ? JSON.parse(row.Query) : row.Query;
      if (clean(query?.SKU)) return clean(query.SKU);
    } catch (_) { /* Fall back to the bound SKU column. */ }
    return clean(row.C24);
  }

  function firstValue(rows, key) {
    const row = rows.find((item) => item[key] != null && item[key] !== "");
    return row ? row[key] : null;
  }

  function normalizeResponse(response) {
    const table = response?.table || response;
    if (!Array.isArray(table?.Data)) throw new Error("接口没有返回库存表格数据");
    if (table.AllRowLoaded === false) throw new Error("接口只返回了部分库存，请重新加载后再试");

    const grouped = new Map();
    table.Data.forEach((row) => {
      if (clean(row.C1).toLowerCase() !== "coz") return;
      const sku = rowSku(row);
      if (!sku) return;
      if (!grouped.has(sku)) grouped.set(sku, []);
      grouped.get(sku).push(row);
    });

    const inventory = [...grouped.entries()].map(([sku, rows]) => {
      const stocked = number(firstValue(rows, "C15"));
      const reservedRaw = firstValue(rows, "C16");
      const reserved = number(reservedRaw);
      const styleNo = clean(firstValue(rows, "C3")) || clean(firstValue(rows, "C2"));
      const styleNote = clean(firstValue(rows, "C28"));
      const customerName = clean(firstValue(rows, "C29"));
      return {
        sku,
        brand: "CoZ",
        category: "成衣",
        styleNo,
        productName: customerName || styleNote || styleNo,
        color: clean(firstValue(rows, "C4")),
        size: normalizeSize(firstValue(rows, "C5")),
        stockedQuantity: stocked,
        reservedQuantity: reserved,
        availableQuantity: Math.max(0, stocked - reserved),
        reservedReported: reservedRaw != null && reservedRaw !== "",
        retailPrice: number(firstValue(rows, "C23")),
        upc: clean(firstValue(rows, "C25")),
        primaryFabric: clean(firstValue(rows, "C26")),
        imagePath: clean(firstValue(rows, "C22")),
        sourceUpdatedAt: excelDate(firstValue(rows, "C27")),
        styleNote,
        sourceRowCount: rows.length
      };
    }).sort((a, b) => a.styleNo.localeCompare(b.styleNo) || a.color.localeCompare(b.color) || a.size.localeCompare(b.size));

    if (!inventory.length) throw new Error("返回数据中没有找到 CoZ 品牌库存");
    return {
      brand: "CoZ",
      syncedAt: new Date().toISOString(),
      allRowsLoaded: table.AllRowLoaded !== false,
      sourceRowCount: table.Data.length,
      skuCount: inventory.length,
      stockedQuantity: inventory.reduce((sum, item) => sum + item.stockedQuantity, 0),
      inventory
    };
  }

  function setStatus(message, kind = "idle") {
    const status = document.getElementById("coz-bridge-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.kind = kind;
  }

  function deliver(snapshot) {
    if (!inventoryWindow || inventoryWindow.closed) return false;
    inventoryWindow.postMessage({ type: "COZ_INVENTORY_SNAPSHOT", version: 1, bridgeToken: BRIDGE_TOKEN, snapshot }, TARGET_ORIGIN);
    return true;
  }

  async function syncNow() {
    if (syncing) return;
    syncing = true;
    setStatus("正在读取 CoZ 库存...", "working");
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(REQUEST_PAYLOAD)
      });
      if (!response.ok) throw new Error(`接口请求失败（${response.status}）`);
      lastSnapshot = normalizeResponse(await response.json());
      setStatus("正在处理商品图片...", "working");
      await attachPageImages(lastSnapshot);
      if (!deliver(lastSnapshot)) throw new Error("库存平台页面已关闭，请重新点击开始同步");
      const imageText = lastSnapshot.imageCount ? ` · ${lastSnapshot.imageCount} 张图片` : "";
      setStatus(`已同步 ${lastSnapshot.skuCount} 个 SKU${imageText} · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`, "success");
    } catch (error) {
      setStatus(error?.message || "同步失败，请刷新页面后重试", "error");
    } finally {
      syncing = false;
    }
  }

  function stopSync() {
    clearInterval(timer);
    timer = null;
    document.getElementById("coz-bridge-toggle").textContent = "开始同步";
    setStatus("同步已暂停");
  }

  function startSync() {
    inventoryWindow = window.open(TARGET_URL, "coz_inventory_platform");
    if (!inventoryWindow) {
      setStatus("浏览器阻止了库存平台窗口，请允许此网站弹出窗口", "error");
      return;
    }
    clearInterval(timer);
    timer = setInterval(syncNow, INTERVAL_MS);
    document.getElementById("coz-bridge-toggle").textContent = "暂停同步";
    setStatus("正在连接库存平台...", "working");
    setTimeout(syncNow, 1200);
  }

  function toggleSync() {
    if (timer) stopSync();
    else startSync();
  }

  function mountPanel() {
    if (document.getElementById("coz-inventory-bridge")) return;
    const panel = document.createElement("aside");
    panel.id = "coz-inventory-bridge";
    panel.innerHTML = `
      <strong>CoZ → 库存平台</strong>
      <span id="coz-bridge-status">每 60 秒同步一次</span>
      <button id="coz-bridge-toggle" type="button">开始同步</button>`;
    document.body.appendChild(panel);

    const style = document.createElement("style");
    style.textContent = `
      #coz-inventory-bridge{position:fixed;right:20px;bottom:20px;z-index:2147483646;width:220px;padding:14px;border:1px solid #b7c8c1;border-radius:7px;color:#173f35;background:#fff;box-shadow:0 10px 30px rgba(0,0,0,.18);font:14px/1.45 "Microsoft YaHei UI",sans-serif}
      #coz-inventory-bridge strong{display:block;margin-bottom:5px;font-size:15px}
      #coz-inventory-bridge span{display:block;min-height:40px;color:#66736e;font-size:13px}
      #coz-inventory-bridge span[data-kind="success"]{color:#176b54}
      #coz-inventory-bridge span[data-kind="error"]{color:#b8473f}
      #coz-inventory-bridge button{width:100%;height:38px;border:0;border-radius:5px;color:#fff;background:#176b54;font:700 14px "Microsoft YaHei UI",sans-serif;cursor:pointer}
      #coz-inventory-bridge button:hover{background:#124d3e}`;
    document.head.appendChild(style);
    document.getElementById("coz-bridge-toggle").addEventListener("click", toggleSync);
  }

  window.addEventListener("message", (event) => {
    if (event.origin !== TARGET_ORIGIN || event.source !== inventoryWindow) return;
    if (event.data?.type !== "COZ_INVENTORY_READY" || event.data.bridgeToken !== BRIDGE_TOKEN) return;
    if (lastSnapshot) deliver(lastSnapshot);
    else if (timer) syncNow();
  });

  mountPanel();
})();
