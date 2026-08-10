(() => {
  "use strict";

  const STORAGE_KEY = "ja-garment-inventory-v1";
  const CATEGORY_STORAGE_KEY = "ja-garment-categories-v1";
  const STOCK_HISTORY_KEY = "ja-garment-stock-history-v1";
  const sizeOrder = ["XS", "S", "M", "L", "XL", "XXL", "F"];
  const defaultCategoryCodes = { "上装": "TOP", "下装": "BTM", "连衣裙": "DRS", "外套": "OUT", "配饰": "ACC" };
  const categoryCodes = loadCategoryCodes();
  const viewMeta = {
    overview: ["库存中台 / 今日", "经营概览"],
    inventory: ["商品中心 / SKU", "成衣库存"],
    movements: ["库存中心 / 流水", "出入库流水"],
    channels: ["全渠道 / 配额", "销售渠道"]
  };
  const translationPairs = [
    ["库存中台 / 今日", "Inventory desk / Today"], ["经营概览", "Overview"], ["商品中心 / SKU", "Products / SKU"], ["成衣库存", "Inventory"], ["库存中心 / 流水", "Stock center / Ledger"], ["出入库流水", "Movements"], ["全渠道 / 配额", "Omnichannel / Allocation"], ["销售渠道", "Channels"],
    ["数据已保存到本机", "Saved locally"], ["CoZ 实时库存", "CoZ live inventory"], ["CoZ 暂未提供", "Not provided by CoZ"], ["接口未提供出入库流水", "Movement data is not provided"], ["品牌管理员", "Brand admin"], ["库存提醒", "Stock alerts"], ["导出库存", "Export stock"], ["快速出入库", "Quick movement"], ["扫描 SKU", "Scan SKU"], ["切换语言", "Switch language"], ["切换主题", "Switch theme"], ["深色", "Dark mode"], ["浅色", "Light mode"],
    ["星期一", "Monday"], ["星期二", "Tuesday"], ["星期三", "Wednesday"], ["星期四", "Thursday"], ["星期五", "Friday"], ["星期六", "Saturday"], ["星期日", "Sunday"],
    ["2026年8月", "August 2026"], ["线上与门店共用一套 SKU 库存，低库存款式请优先补货或调整渠道配额。", "Online and store channels share one SKU pool; prioritize replenishment or reallocate stock for low-stock styles."], [" 个 SKU 需要处理", " SKUs need action"],
    ["可售库存", "Sellable stock"], ["今日售出", "Sold today"], ["低库存 SKU", "Low-stock SKUs"], ["在途库存", "In transit"], ["较上周", "vs last week"], ["需处理", "Needs action"], ["低于安全库存", "Below safety stock"], ["3 个采购单 · 最早 8/12 到货", "3 purchase orders · earliest arrival Aug 12"], ["线上 24 · 门店 12", "Online 24 · Store 12"], ["4.8%", "4.8%"],
    ["个 SKU · 实时可售", "SKUs · sellable now"], ["件", "pcs"], ["件可售库存", "sellable pcs"], ["重点款库存", "Priority stock"], ["全部 SKU", "All SKUs"], ["渠道库存", "Channel stock"], ["最近动态", "Recent activity"], ["库存总览", "Stock overview"], ["库存正常", "Healthy"], ["低库存", "Low stock"], ["LIVE STOCK", "LIVE STOCK"], ["ALLOCATION", "ALLOCATION"],
    ["品牌小程序", "Brand mini-program"], ["天猫旗舰店", "Tmall flagship"], ["静安门店", "Jing'an store"], ["机动库存", "Buffer stock"], ["渠道可售", "Channel sellable"], ["今日订单", "Orders today"], ["同步正常", "Sync healthy"], ["微信自营商城", "WeChat direct store"], ["平台电商", "Marketplace"], ["线下直营", "Offline retail"], ["2 分钟前同步", "Synced 2 min ago"],
    ["搜索款式、SKU、颜色", "Search style, SKU, color"], ["搜索单号或 SKU", "Search order or SKU"], ["全部品类", "All categories"], ["全部状态", "All statuses"], ["按品类筛选", "Filter by category"], ["按库存状态筛选", "Filter by stock status"], ["新增 SKU", "New SKU"], ["SKU CATALOG", "SKU CATALOG"], ["成衣库存明细", "Inventory detail"], ["款式 / SKU", "Style / SKU"], ["颜色", "Color"], ["尺码库存带", "Size curve"], ["仓库", "Warehouse"], ["门店", "Store"], ["占用", "Reserved"], ["可售", "Sellable"], ["状态", "Status"], ["调整库存", "Adjust stock"],
    ["库存流水", "Stock ledger"], ["STOCK LEDGER", "STOCK LEDGER"], ["类型", "Type"], ["库位", "Location"], ["数量", "Quantity"], ["操作人", "Operator"], ["备注", "Note"], ["入库", "Inbound"], ["出库", "Outbound"], ["盘点调整", "Adjustment"], ["上海总仓", "Shanghai warehouse"], ["静安门店", "Jing'an store"], ["快速出入库", "Quick movement"], ["确认入库", "Confirm inbound"], ["确认出库", "Confirm outbound"], ["取消", "Cancel"], ["SKU", "SKU"], ["扫描 SKU", "Scan SKU"], ["选择或扫描 SKU 后调整库存", "Select or scan a SKU to adjust stock"], ["备注", "Note"],
    ["销售渠道与库存配额", "Sales channels and allocation"], ["OMNICHANNEL", "OMNICHANNEL"], ["每个渠道共享实物库存，通过配额控制超卖风险。", "Channels share physical stock; allocations prevent overselling."], ["连接渠道", "Connect channel"], ["库存同步规则", "Stock sync rules"], ["POLICY", "POLICY"], ["保存规则", "Save rules"], ["安全库存保护", "Safety stock protection"], ["可售数量达到安全库存时停止线上销售", "Stop online sales when sellable stock reaches safety level"], ["订单自动占用", "Auto-reserve orders"], ["订单创建后立即占用库存，取消后自动释放", "Reserve on order creation and release on cancellation"], ["门店库存线上可见", "Show store stock online"], ["允许消费者查询附近门店库存", "Let customers check nearby store stock"],
    ["确认", "Confirm"], ["例如：采购单 PO-20260809", "e.g. purchase order PO-20260809"], ["上海总仓", "Shanghai warehouse"], ["静安门店", "Jing'an store"], ["品牌", "Brand"], ["品类", "Category"], ["添加品类", "Add category"], ["品类名称", "Category name"], ["SKU 缩写", "SKU abbreviation"], ["保存品类", "Save category"], ["商品图片", "Product image"], ["款号", "Style no."], ["颜色代码", "Color code"], ["尺码", "Size"], ["安全库存", "Safety stock"], ["新增成衣 SKU", "New garment SKU"], ["SKU 编码预览", "SKU code preview"], ["品牌-季节-品类-款号-颜色-尺码", "Brand-season-category-style-color-size"], ["创建 SKU", "Create SKU"], ["例如：轻量针织开衫", "e.g. lightweight knit cardigan"], ["例如：JA2608", "e.g. JA2608"], ["例如：BLK", "e.g. BLK"]
  ];
  const zhToEn = new Map(translationPairs);
  const enToZh = new Map(translationPairs.map(([zh, en]) => [en, zh]));

  const seedState = {
    products: [
      {
        id: "P001", name: "经典拉链卫衣", category: "上装", style: "JA2601", baseSku: "JA-FW26-TOP-JA2601-INK", color: "墨黑", colorHex: "#252827", safety: 5,
        image: "assets/fabric-images/APLS26088-2-67-1.jpg", sizes: { XS: 12, S: 8, M: 4, L: 2, XL: 0 }, warehouse: 20, store: 6, reserved: 3
      },
      {
        id: "P002", name: "弧线阔腿裤", category: "下装", style: "JA2602", baseSku: "JA-FW26-BTM-JA2602-GRY", color: "石灰", colorHex: "#9b9d98", safety: 5,
        image: "assets/fabric-images/APLS24080-1-63-1.jpg", sizes: { XS: 22, S: 18, M: 14, L: 9, XL: 4 }, warehouse: 52, store: 15, reserved: 8
      },
      {
        id: "P003", name: "云感针织开衫", category: "外套", style: "JA2603", baseSku: "JA-FW26-OUT-JA2603-IVY", color: "象牙白", colorHex: "#e6e2d7", safety: 4,
        image: "assets/fabric-images/KN-0001-9-1.jpg", sizes: { XS: 7, S: 16, M: 21, L: 13, XL: 6 }, warehouse: 45, store: 18, reserved: 5
      },
      {
        id: "P004", name: "印花长袖连衣裙", category: "连衣裙", style: "JA2604", baseSku: "JA-FW26-DRS-JA2604-PRT", color: "墨花", colorHex: "#d8d5cb", safety: 4,
        image: "assets/fabric-images/FAB-2ZM81-55-1.jpg", sizes: { XS: 6, S: 9, M: 12, L: 5, XL: 1 }, warehouse: 25, store: 8, reserved: 4
      },
      {
        id: "P005", name: "轻暖抓绒套头衫", category: "上装", style: "JA2605", baseSku: "JA-FW26-TOP-JA2605-OAT", color: "燕麦", colorHex: "#c7bda9", safety: 6,
        image: "assets/fabric-images/KN-0015-23-1.jpg", sizes: { XS: 18, S: 27, M: 31, L: 22, XL: 11 }, warehouse: 85, store: 24, reserved: 12
      },
      {
        id: "P006", name: "双面针织直筒裙", category: "下装", style: "JA2606", baseSku: "JA-FW26-BTM-JA2606-NVY", color: "深海蓝", colorHex: "#273746", safety: 5,
        image: "assets/fabric-images/FAB-EG7MG-51-1.jpg", sizes: { XS: 8, S: 12, M: 15, L: 10, XL: 7 }, warehouse: 39, store: 13, reserved: 6
      },
      {
        id: "P007", name: "罗纹短袖上衣", category: "上装", style: "JA2607", baseSku: "JA-SS26-TOP-JA2607-MOS", color: "苔绿", colorHex: "#667460", safety: 5,
        image: "assets/fabric-images/KN-0056-44-1.jpg", sizes: { XS: 11, S: 19, M: 24, L: 17, XL: 9 }, warehouse: 62, store: 18, reserved: 7
      },
      {
        id: "P008", name: "抽绳休闲长裤", category: "下装", style: "JA2608", baseSku: "JA-SS26-BTM-JA2608-SND", color: "浅卡其", colorHex: "#b7a98e", safety: 5,
        image: "assets/fabric-images/1501-31-1.jpg", sizes: { XS: 15, S: 21, M: 20, L: 13, XL: 8 }, warehouse: 58, store: 19, reserved: 9
      }
    ],
    movements: [
      { id: `IN-${compactDateKey()}-004`, time: `${localDateKey()} 10:42`, type: "inbound", sku: "JA-FW26-TOP-JA2605-OAT-M", location: "上海总仓", qty: 24, operator: "Rayna Li", note: "PO-260731 到货" },
      { id: `OUT-${compactDateKey()}-018`, time: `${localDateKey()} 10:16`, type: "outbound", sku: "JA-FW26-BTM-JA2602-GRY-S", location: "上海总仓", qty: 3, operator: "系统", note: "天猫订单合并出库" },
      { id: `OUT-${compactDateKey()}-017`, time: `${localDateKey()} 09:48`, type: "outbound", sku: "JA-FW26-DRS-JA2604-PRT-M", location: "静安门店", qty: 1, operator: "Lin", note: "门店零售" },
      { id: `ADJ-${compactDateKey()}-003`, time: `${localDateKey()} 09:25`, type: "adjustment", sku: "JA-FW26-TOP-JA2601-INK-L", location: "静安门店", qty: -1, operator: "Lin", note: "盘点差异" },
      { id: "IN-260808-011", time: "2026-08-08 16:20", type: "inbound", sku: "JA-FW26-OUT-JA2603-IVY-S", location: "上海总仓", qty: 12, operator: "Rayna Li", note: "返单补货" },
      { id: "OUT-260808-041", time: "2026-08-08 15:56", type: "outbound", sku: "JA-SS26-TOP-JA2607-MOS-M", location: "上海总仓", qty: 5, operator: "系统", note: "小程序订单出库" }
    ]
  };

  let state = loadState();
  let stockHistory = loadStockHistory();
  let activeView = "overview";
  let toastTimer = null;
  let currentLang = localStorage.getItem("ja-garment-language") || "zh";

  function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function compactDateKey(date = new Date()) {
    return localDateKey(date).slice(2).replaceAll("-", "");
  }

  function localTimestamp(date = new Date()) {
    const time = [date.getHours(), date.getMinutes()].map((part) => String(part).padStart(2, "0")).join(":");
    return `${localDateKey(date)} ${time}`;
  }

  function $(id) { return document.getElementById(id); }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function normalizeSizeLabel(value) {
    const size = String(value || "F").trim();
    return /^(?:free(?:\s*size|\s*尺码)?|均码|one\s*size|os)$/i.test(size) ? "F" : size;
  }
  function resolveColorAppearance(value) {
    const color = String(value || "").trim().toLowerCase();
    const rules = [
      [/黑|墨|炭|black|charcoal/, "#303432"],
      [/藏青|海军|深海|navy/, "#344b61"],
      [/蓝|blue|denim/, "#6f97b2"],
      [/粉|pink|rose/, "#d99aa9"],
      [/红|莓|red|raspberry|burgundy/, "#b96067"],
      [/紫|purple|lavender|lilac/, "#8c789e"],
      [/绿|苔|green|olive|moss/, "#78917b"],
      [/黄|yellow|gold/, "#d2ad45"],
      [/橙|orange|coral/, "#cc805f"],
      [/咖|棕|褐|brown|coffee|chocolate/, "#94735f"],
      [/米|燕麦|卡其|beige|oat|khaki|sand/, "#c8b99e"],
      [/灰|银|石灰|gray|grey|silver/, "#969c99"],
      [/白|象牙|乳白|white|ivory|cream/, "#f4f3ed"]
    ];
    const base = rules.find(([pattern]) => pattern.test(color))?.[1] || "#8a918d";
    const stripe = /条纹|白条|间条|stripe|striped|gingham|check|格纹|格子/.test(color);
    const accent = /白|white|ivory|cream/.test(color) && base !== "#f4f3ed" ? "#f4f3ed" : "#eef2ef";
    return { hex: base, accent, pattern: stripe ? "stripe" : "" };
  }
  function colorSwatch(product) {
    const resolved = resolveColorAppearance(product.color);
    const validHex = (value) => /^#[0-9a-f]{6}$/i.test(String(value || ""));
    const useResolved = state.source?.type === "coz";
    const base = useResolved || !validHex(product.colorHex) ? resolved.hex : product.colorHex;
    const accent = validHex(product.colorAccent) ? product.colorAccent : resolved.accent;
    const pattern = product.colorPattern || resolved.pattern;
    return `<span class="swatch${pattern === "stripe" ? " swatch-stripe" : ""}" style="--swatch-base:${base};--swatch-accent:${accent}" aria-hidden="true"></span>`;
  }
  function safeImageUrl(value) {
    const raw = String(value || "");
    if (/^data:image\/(?:jpeg|png|webp);base64,/i.test(raw)) return raw;
    try {
      const url = new URL(raw);
      return url.protocol === "https:" ? url.href : "";
    } catch (_) { return ""; }
  }
  function upgradeCozState(saved) {
    if (saved?.source?.type !== "coz") return saved;
    saved.products.forEach((product) => {
      const appearance = resolveColorAppearance(product.color);
      product.colorHex = appearance.hex;
      product.colorAccent = appearance.accent;
      product.colorPattern = appearance.pattern;
      product.image = safeImageUrl(product.image || product.imageUrl);
      const sizes = {};
      Object.entries(product.sizes || {}).forEach(([size, qty]) => {
        const label = normalizeSizeLabel(size);
        sizes[label] = Number(sizes[label] || 0) + Number(qty || 0);
      });
      product.sizes = sizes;
      if (product.skuBySize) {
        product.skuBySize = Object.fromEntries(Object.entries(product.skuBySize).map(([size, sku]) => [normalizeSizeLabel(size), sku]));
      }
    });
    return saved;
  }
  function loadCategoryCodes() {
    try {
      const saved = JSON.parse(localStorage.getItem(CATEGORY_STORAGE_KEY));
      if (saved && typeof saved === "object" && !Array.isArray(saved)) return { ...defaultCategoryCodes, ...saved };
    } catch (_) { /* Use the packaged categories if local data is invalid. */ }
    return { ...defaultCategoryCodes };
  }
  function saveCategoryCodes() { localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(categoryCodes)); }
  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved?.products?.length && Array.isArray(saved.movements)) return upgradeCozState(saved);
    } catch (_) { /* Use the packaged inventory sample if local data is invalid. */ }
    return clone(seedState);
  }
  function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function loadStockHistory() {
    try {
      const history = JSON.parse(localStorage.getItem(STOCK_HISTORY_KEY));
      if (!Array.isArray(history)) return [];
      return history.filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry?.day) && Number.isFinite(Number(entry.available)))
        .map((entry) => ({ day: entry.day, available: Number(entry.available), syncedAt: entry.syncedAt || `${entry.day}T23:59:59` }))
        .sort((a, b) => a.day.localeCompare(b.day));
    } catch (_) { return []; }
  }
  function recordStockSnapshot(available, syncedAt = new Date()) {
    const date = syncedAt instanceof Date ? syncedAt : new Date(syncedAt);
    if (Number.isNaN(date.getTime())) return;
    const day = localDateKey(date);
    const entry = { day, available: Number(available || 0), syncedAt: date.toISOString() };
    const existing = stockHistory.findIndex((item) => item.day === day);
    if (existing >= 0) stockHistory[existing] = entry;
    else stockHistory.push(entry);
    const cutoff = new Date(date);
    cutoff.setDate(cutoff.getDate() - 45);
    stockHistory = stockHistory.filter((item) => item.day >= localDateKey(cutoff)).sort((a, b) => a.day.localeCompare(b.day));
    try { localStorage.setItem(STOCK_HISTORY_KEY, JSON.stringify(stockHistory)); }
    catch (_) { /* Inventory rendering must continue if browser storage is full. */ }
  }
  function weeklyStockTrend(currentAvailable, now = new Date()) {
    const previousWeek = new Date(now);
    previousWeek.setDate(previousWeek.getDate() - 7);
    const baseline = stockHistory.find((entry) => entry.day === localDateKey(previousWeek));
    if (!baseline) return { kind: "pending" };
    if (baseline.available === 0) return currentAvailable === 0 ? { kind: "flat", percent: 0 } : { kind: "up", percent: null };
    const percent = (currentAvailable - baseline.available) / baseline.available * 100;
    return { kind: Math.abs(percent) < .05 ? "flat" : percent > 0 ? "up" : "down", percent };
  }
  function orderedSizes(product) {
    const availableSizes = Object.keys(product.sizes || {});
    return [...sizeOrder.filter((size) => availableSizes.includes(size)), ...availableSizes.filter((size) => !sizeOrder.includes(size)).sort()];
  }
  function skuForSize(product, size) { return product.skuBySize?.[size] || `${product.baseSku}-${size}`; }
  function totalStock(product) { return Object.values(product.sizes).reduce((sum, qty) => sum + Number(qty || 0), 0); }
  function availableStock(product) { return Math.max(0, totalStock(product) - Number(product.reserved || 0)); }
  function isLow(product) { return Object.values(product.sizes).some((qty) => Number(qty) <= Number(product.safety)); }
  function lowSkuCount() { return state.products.reduce((sum, product) => sum + Object.values(product.sizes).filter((qty) => Number(qty) <= Number(product.safety)).length, 0); }
  function totalAvailable() { return state.products.reduce((sum, product) => sum + availableStock(product), 0); }
  function formatNumber(value) { return new Intl.NumberFormat("zh-CN").format(value); }
  function refreshIcons() { if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 1.7 } }); }

  function applyLanguage() {
    const map = currentLang === "en" ? zhToEn : enToZh;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach((node) => {
      if (node.parentElement?.closest("script, style")) return;
      const raw = node.nodeValue;
      const trimmed = raw.trim();
      if (!trimmed) return;
      if (map.has(trimmed)) {
        node.nodeValue = raw.replace(trimmed, map.get(trimmed));
        return;
      }
      let translated = raw;
      translationPairs.forEach(([zh, en]) => {
        translated = translated.replaceAll(currentLang === "en" ? zh : en, currentLang === "en" ? en : zh);
      });
      node.nodeValue = translated;
    });
    const languageButton = $("languageToggle");
    const themeButton = $("themeToggle");
    if (languageButton) {
      languageButton.innerHTML = `<i data-lucide="languages"></i><span>${currentLang === "zh" ? "English" : "中文"}</span>`;
      languageButton.title = currentLang === "zh" ? "切换语言" : "Switch language";
    }
    if (themeButton) themeButton.title = currentLang === "zh" ? "切换主题" : "Switch theme";
    document.documentElement.lang = currentLang === "zh" ? "zh-CN" : "en";
    document.title = currentLang === "zh" ? "JA 成衣库存中台" : "JA Garment Inventory";
    refreshIcons();
  }

  function applyTheme() {
    const dark = localStorage.getItem("ja-garment-theme") === "dark";
    document.body.classList.toggle("dark-theme", dark);
    const themeButton = $("themeToggle");
    if (themeButton) themeButton.innerHTML = `<i data-lucide="${dark ? "sun" : "moon"}"></i><span>${dark ? "浅色" : "深色"}</span>`;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#101b18" : "#173f35");
    refreshIcons();
    applyLanguage();
  }

  function renderSizeBand(product) {
    return `<div class="size-band">${orderedSizes(product).map((size) => {
      const qty = Number(product.sizes[size] || 0);
      const cls = qty === 0 ? "empty" : qty <= product.safety ? "low" : "";
      return `<div class="size-stock ${cls}" title="${size} 码：${qty} 件"><div><span>${size}</span><strong>${qty}</strong></div></div>`;
    }).join("")}</div>`;
  }

  function productCell(product) {
    const missingImageTitle = product.imagePath ? "已获取图片记录，等待商品图片源同步" : "CoZ 暂未提供商品图片";
    const image = product.image
      ? `<button class="product-image-button" type="button" data-image-preview data-image-src="${escapeHtml(product.image)}" data-image-name="${escapeHtml(product.name)}" data-image-sku="${escapeHtml(product.baseSku)}" title="双击查看大图" aria-label="查看 ${escapeHtml(product.name)} 大图"><img class="product-thumb" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)} 商品图片"></button>`
      : `<span class="product-image-placeholder" title="${missingImageTitle}"><i data-lucide="image-off"></i></span>`;
    return `<div class="product-cell">${image}<div><strong>${escapeHtml(product.name)}</strong><code>${escapeHtml(product.baseSku)}</code></div></div>`;
  }

  function statusBadge(product) {
    return isLow(product) ? '<span class="status low">低库存</span>' : '<span class="status healthy">库存正常</span>';
  }

  function renderWeeklyTrend(available) {
    const trend = weeklyStockTrend(available);
    const node = $("metricAvailableTrend");
    if (trend.kind === "pending") {
      node.innerHTML = `<span class="trend pending"><i data-lucide="history"></i>${currentLang === "zh" ? "暂无上周数据" : "No prior-week data"}</span>`;
      return;
    }
    const direction = trend.kind === "up" ? "trending-up" : trend.kind === "down" ? "trending-down" : "minus";
    const value = trend.percent == null
      ? (currentLang === "zh" ? "新增库存" : "New stock")
      : `${trend.percent > 0 ? "+" : ""}${trend.percent.toFixed(1)}%`;
    node.innerHTML = `<span class="trend ${trend.kind}"><i data-lucide="${direction}"></i>${value}</span> ${currentLang === "zh" ? "较上周" : "vs last week"}`;
  }

  function lowStockDescription() {
    const affected = state.products.filter(isLow);
    const names = [...new Set(affected.map((product) => String(product.name || product.style || product.baseSku).trim()).filter(Boolean))];
    if (!names.length) return currentLang === "zh" ? "当前所有 SKU 均高于安全库存。" : "All SKUs are above safety stock.";
    const listed = names.slice(0, 2).join(currentLang === "zh" ? "、" : ", ");
    const more = names.length > 2 ? (currentLang === "zh" ? "等款式" : " and other styles") : "";
    return currentLang === "zh"
      ? `${listed}${more}的部分尺码已达到或低于安全库存。`
      : `${listed}${more}: some sizes are at or below safety stock.`;
  }

  function renderOverview() {
    const available = totalAvailable();
    const lowCount = lowSkuCount();
    const isCoz = state.source?.type === "coz";
    $("metricAvailable").textContent = formatNumber(available);
    renderWeeklyTrend(available);
    $("metricLow").textContent = lowCount;
    $("metricSold").textContent = isCoz ? "--" : "36";
    $("metricSoldDetail").textContent = isCoz ? "CoZ 暂未提供" : "线上 24 · 门店 12";
    $("metricTransit").textContent = isCoz ? "--" : "280";
    $("metricTransitDetail").textContent = isCoz ? "CoZ 暂未提供" : "3 个采购单 · 最早 8/12 到货";
    $("navLowCount").textContent = lowCount;
    $("attentionCount").textContent = lowCount;
    $("attentionDescription").textContent = lowStockDescription();
    $("attentionBand").hidden = lowCount === 0;

    const focusProducts = [...state.products].sort((a, b) => Number(isLow(b)) - Number(isLow(a)) || availableStock(a) - availableStock(b)).slice(0, 5);
    $("overviewRows").innerHTML = focusProducts.map((product) => `
      <tr>
        <td>${productCell(product)}</td>
        <td>${renderSizeBand(product)}</td>
        <td class="num"><span class="stock-number">${availableStock(product)}</span></td>
        <td>${statusBadge(product)}</td>
      </tr>`).join("");

    const channels = isCoz ? [
      { name: "CoZ 实时库存", value: available, color: "#176b54" }
    ] : [
      { name: "品牌小程序", value: Math.round(available * .42), color: "#176b54" },
      { name: "天猫旗舰店", value: Math.round(available * .31), color: "#386a82" },
      { name: "静安门店", value: Math.round(available * .19), color: "#bd7914" },
      { name: "机动库存", value: Math.max(0, available - Math.round(available * .92)), color: "#89938f" }
    ];
    $("channelTotal").textContent = formatNumber(available);
    $("channelBars").innerHTML = channels.map((channel) => `
      <div><div class="bar-label"><span>${channel.name}</span><span>${formatNumber(channel.value)} 件</span></div><div class="bar-track"><i style="width:${Math.max(4, channel.value / available * 100)}%;--bar:${channel.color}"></i></div></div>`).join("");

    $("activityList").innerHTML = state.movements.length ? state.movements.slice(0, 4).map((movement) => `
      <div class="activity"><span class="activity-icon ${movement.type}"><i data-lucide="${movement.type === "inbound" ? "package-plus" : movement.type === "outbound" ? "package-minus" : "clipboard-check"}"></i></span><div><p>${movement.type === "inbound" ? "入库" : movement.type === "outbound" ? "出库" : "盘点调整"} <strong>${Math.abs(movement.qty)} 件</strong> · ${escapeHtml(shortSku(movement.sku))}</p><small>${escapeHtml(movement.location)} · ${escapeHtml(movement.time.slice(5))}</small></div></div>`).join("")
      : '<div class="activity-empty"><i data-lucide="history"></i><span>接口未提供出入库流水</span></div>';
  }

  function getFilteredProducts() {
    const term = $("inventorySearch").value.trim().toLowerCase();
    const category = $("categoryFilter").value;
    const status = $("statusFilter").value;
    return state.products.filter((product) => {
      const matchesTerm = !term || [product.name, product.style, product.baseSku, product.color].some((value) => String(value).toLowerCase().includes(term));
      const matchesCategory = !category || product.category === category;
      const matchesStatus = !status || (status === "low" ? isLow(product) : !isLow(product));
      return matchesTerm && matchesCategory && matchesStatus;
    });
  }

  function renderInventory() {
    const products = getFilteredProducts();
    const isCoz = state.source?.type === "coz";
    $("resultCount").textContent = products.reduce((sum, product) => sum + Object.keys(product.sizes).length, 0);
    $("resultAvailable").textContent = formatNumber(products.reduce((sum, product) => sum + availableStock(product), 0));
    $("inventoryRows").innerHTML = products.map((product) => `
      <tr>
        <td>${productCell(product)}</td>
        <td class="color-cell">${colorSwatch(product)}${escapeHtml(product.color)}</td>
        <td>${renderSizeBand(product)}</td>
        <td class="num">${isCoz ? "--" : formatNumber(product.warehouse)}</td>
        <td class="num">${isCoz ? "--" : formatNumber(product.store)}</td>
        <td class="num">${isCoz && !product.reservedReported ? "--" : formatNumber(product.reserved)}</td>
        <td class="num"><span class="stock-number">${formatNumber(availableStock(product))}</span></td>
        <td>${statusBadge(product)}</td>
        <td><button class="row-action" data-move-product="${product.id}" type="button" title="调整库存"><i data-lucide="arrow-left-right"></i></button></td>
      </tr>`).join("");
    $("inventoryEmpty").hidden = products.length > 0;
  }

  function shortSku(sku) {
    const parts = String(sku).split("-");
    return parts.length > 3 ? parts.slice(-3).join("-") : sku;
  }

  function movementLabel(type) { return type === "inbound" ? "入库" : type === "outbound" ? "出库" : "盘点调整"; }
  function renderMovements() {
    const term = $("movementSearch").value.trim().toLowerCase();
    const rows = state.movements.filter((movement) => !term || [movement.id, movement.sku, movement.note].some((value) => String(value).toLowerCase().includes(term)));
    $("movementRows").innerHTML = rows.map((movement) => `
      <tr>
        <td class="ledger-id"><strong>${escapeHtml(movement.id)}</strong><small>${escapeHtml(movement.time)}</small></td>
        <td><span class="movement-type ${movement.type}">${movementLabel(movement.type)}</span></td>
        <td><code>${escapeHtml(movement.sku)}</code></td>
        <td>${escapeHtml(movement.location)}</td>
        <td class="num qty ${movement.type}">${movement.qty > 0 ? "+" : ""}${movement.qty}</td>
        <td>${escapeHtml(movement.operator)}</td>
        <td>${escapeHtml(movement.note || "-")}</td>
      </tr>`).join("");
    const todayRows = state.movements.filter((movement) => movement.time.startsWith(localDateKey()));
    $("todayInbound").textContent = todayRows.filter((movement) => movement.type === "inbound").reduce((sum, movement) => sum + Math.abs(movement.qty), 0);
    $("todayOutbound").textContent = todayRows.filter((movement) => movement.type === "outbound").reduce((sum, movement) => sum + Math.abs(movement.qty), 0);
  }

  function renderChannels() {
    const available = totalAvailable();
    if (state.source?.type === "coz") {
      const syncedAt = new Date(state.source.syncedAt).toLocaleString(currentLang === "zh" ? "zh-CN" : "en", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
      $("channelCards").innerHTML = `
        <article class="channel-card" style="--channel-color:#176b54">
          <div class="channel-card-head"><span class="channel-logo">CoZ</span><span class="connection">同步正常</span></div>
          <h3>CoZ 实时库存</h3><p>${escapeHtml(syncedAt)} · ${formatNumber(state.source.skuCount)} SKU</p>
          <div class="channel-stats"><div><span>可售库存</span><strong>${formatNumber(available)}</strong></div><div><span>库存来源</span><strong>API</strong></div></div>
        </article>`;
      return;
    }
    const channels = [
      { code: "微", name: "品牌小程序", sub: "微信自营商城", color: "#176b54", stock: Math.round(available * .42), orders: 14 },
      { code: "TM", name: "天猫旗舰店", sub: "平台电商", color: "#c94743", stock: Math.round(available * .31), orders: 10 },
      { code: "JA", name: "静安门店", sub: "线下直营", color: "#bd7914", stock: Math.round(available * .19), orders: 12 }
    ];
    $("channelCards").innerHTML = channels.map((channel) => `
      <article class="channel-card" style="--channel-color:${channel.color}">
        <div class="channel-card-head"><span class="channel-logo">${channel.code}</span><span class="connection">同步正常</span></div>
        <h3>${channel.name}</h3><p>${channel.sub} · 2 分钟前同步</p>
        <div class="channel-stats"><div><span>渠道可售</span><strong>${formatNumber(channel.stock)}</strong></div><div><span>今日订单</span><strong>${channel.orders}</strong></div></div>
      </article>`).join("");
  }

  function renderCategoryOptions() {
    const selected = $("categoryFilter").value;
    const categories = [...new Set(state.products.map((product) => product.category))];
    $("categoryFilter").innerHTML = '<option value="">全部品类</option>' + categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("");
    $("categoryFilter").value = selected;
  }

  function renderSkuCategoryOptions(selectedCategory) {
    state.products.forEach((product) => {
      if (product.category && !categoryCodes[product.category]) categoryCodes[product.category] = "CAT";
    });
    const select = $("skuCategory");
    const selected = selectedCategory || select.value;
    select.innerHTML = Object.entries(categoryCodes).map(([name, code]) => `<option value="${escapeHtml(name)}">${escapeHtml(name)} · ${escapeHtml(code)}</option>`).join("");
    if ([...select.options].some((option) => option.value === selected)) select.value = selected;
  }

  function renderSyncState() {
    const node = document.querySelector(".sync-state");
    if (!node) return;
    if (state.source?.type !== "coz") {
      node.innerHTML = "<span></span> 数据已保存到本机";
      return;
    }
    const syncedAt = new Date(state.source.syncedAt).toLocaleTimeString(currentLang === "zh" ? "zh-CN" : "en", { hour: "2-digit", minute: "2-digit" });
    node.innerHTML = `<span></span> ${currentLang === "zh" ? "CoZ 实时库存" : "CoZ live inventory"} · ${escapeHtml(syncedAt)}`;
    node.title = `${formatNumber(state.source.skuCount)} SKU`;
  }

  function renderMovementSkuOptions() {
    const current = $("movementSku").value;
    $("movementSku").innerHTML = state.products.flatMap((product) => orderedSizes(product).map((size) => `<option value="${product.id}|${size}">${escapeHtml(skuForSize(product, size))} · ${escapeHtml(product.name)}</option>`)).join("");
    if ([...$("movementSku").options].some((option) => option.value === current)) $("movementSku").value = current;
  }

  function renderAll() {
    renderCategoryOptions();
    renderSkuCategoryOptions();
    renderMovementSkuOptions();
    renderOverview();
    renderInventory();
    renderMovements();
    renderChannels();
    renderSyncState();
    refreshIcons();
    applyLanguage();
  }

  function switchView(view) {
    if (!viewMeta[view]) return;
    activeView = view;
    document.querySelectorAll(".view").forEach((node) => node.classList.toggle("active", node.id === `${view}View`));
    document.querySelectorAll("[data-view]").forEach((node) => node.classList.toggle("active", node.dataset.view === view));
    $("pageEyebrow").textContent = viewMeta[view][0];
    $("pageTitle").textContent = viewMeta[view][1];
    applyLanguage();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openMovementModal(productId, size) {
    renderMovementSkuOptions();
    if (productId) {
      const product = state.products.find((item) => item.id === productId);
      const preferredSize = size || orderedSizes(product)[0] || "M";
      $("movementSku").value = `${productId}|${preferredSize}`;
    }
    $("movementModal").hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(() => $("movementSku").focus(), 20);
  }

  function closeMovementModal() {
    $("movementModal").hidden = true;
    document.body.style.overflow = "";
  }

  function openSkuModal() {
    renderSkuCategoryOptions();
    $("skuModal").hidden = false;
    document.body.style.overflow = "hidden";
    updateSkuPreview();
    setTimeout(() => $("skuName").focus(), 20);
  }

  function closeSkuModal() {
    $("skuModal").hidden = true;
    closeCategoryCreator();
    document.body.style.overflow = "";
  }

  function openCategoryCreator() {
    $("categoryCreator").hidden = false;
    $("addCategoryBtn").setAttribute("aria-expanded", "true");
    setTimeout(() => $("newCategoryName").focus(), 20);
  }

  function closeCategoryCreator() {
    $("categoryCreator").hidden = true;
    $("addCategoryBtn").setAttribute("aria-expanded", "false");
    $("newCategoryName").value = "";
    $("newCategoryCode").value = "";
  }

  function addCategory() {
    const name = $("newCategoryName").value.trim();
    const code = $("newCategoryCode").value.trim().toUpperCase();
    if (!name) {
      showToast("请输入品类名称");
      $("newCategoryName").focus();
      return;
    }
    if (!/^[A-Z0-9]{2,5}$/.test(code)) {
      showToast("SKU 缩写需为 2 至 5 位英文或数字");
      $("newCategoryCode").focus();
      return;
    }
    const existingName = Object.keys(categoryCodes).find((category) => category.toLowerCase() === name.toLowerCase());
    const existingCode = Object.entries(categoryCodes).find(([, categoryCode]) => categoryCode === code);
    if (existingName) {
      renderSkuCategoryOptions(existingName);
      closeCategoryCreator();
      updateSkuPreview();
      showToast(`品类“${existingName}”已存在并已选中`);
      return;
    }
    if (existingCode) {
      showToast(`SKU 缩写 ${code} 已用于“${existingCode[0]}”`);
      $("newCategoryCode").focus();
      return;
    }
    categoryCodes[name] = code;
    saveCategoryCodes();
    renderSkuCategoryOptions(name);
    closeCategoryCreator();
    updateSkuPreview();
    showToast(`品类“${name}”已添加并选中`);
  }

  function openImageModal(button) {
    $("imageModalPreview").src = button.dataset.imageSrc;
    $("imageModalPreview").alt = `${button.dataset.imageName} 商品图片`;
    $("imageModalName").textContent = button.dataset.imageName;
    $("imageModalSku").textContent = button.dataset.imageSku;
    $("imageModal").hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(() => $("imageModal").querySelector("[data-close-image]").focus(), 20);
  }

  function closeImageModal() {
    $("imageModal").hidden = true;
    $("imageModalPreview").removeAttribute("src");
    document.body.style.overflow = "";
  }

  function setMovementType(type) {
    $("movementType").value = type;
    document.querySelectorAll(".segmented button").forEach((button) => button.classList.toggle("active", button.dataset.type === type));
    $("movementForm").querySelector('[type="submit"]').textContent = type === "inbound" ? "确认入库" : "确认出库";
    applyLanguage();
  }

  function submitMovement(event) {
    event.preventDefault();
    const [productId, size] = $("movementSku").value.split("|");
    const product = state.products.find((item) => item.id === productId);
    const type = $("movementType").value;
    const locationKey = $("movementLocation").value;
    const location = locationKey === "warehouse" ? "上海总仓" : "静安门店";
    const qty = Math.max(1, Number($("movementQty").value || 1));
    if (!product) return;
    if (type === "outbound" && (Number(product.sizes[size]) < qty || Number(product[locationKey]) < qty)) {
      showToast(`${location}的 ${size} 码库存不足，请调整数量`);
      return;
    }
    const direction = type === "inbound" ? 1 : -1;
    product.sizes[size] = Number(product.sizes[size]) + qty * direction;
    product[locationKey] = Number(product[locationKey]) + qty * direction;
    const now = new Date();
    const stamp = localTimestamp(now);
    const sequence = String(state.movements.length + 1).padStart(3, "0");
    state.movements.unshift({
      id: `${type === "inbound" ? "IN" : "OUT"}-${compactDateKey()}-${sequence}`,
      time: stamp,
      type,
      sku: skuForSize(product, size),
      location,
      qty: qty * direction,
      operator: "Rayna Li",
      note: $("movementNote").value.trim() || "快速库存调整"
    });
    recordStockSnapshot(totalAvailable(), now);
    saveState();
    closeMovementModal();
    $("movementForm").reset();
    setMovementType("inbound");
    renderAll();
    showToast(`${product.name} ${size} 码已${type === "inbound" ? "入库" : "出库"} ${qty} 件`);
  }

  function updateSkuPreview() {
    const category = categoryCodes[$("skuCategory").value] || "TOP";
    const style = $("skuStyle").value.trim().toUpperCase() || "JA2608";
    const color = $("skuColor").value.trim().toUpperCase() || "BLK";
    const size = $("skuSize").value;
    $("skuPreview").textContent = `JA-FW26-${category}-${style}-${color}-${size}`;
  }

  function submitSku(event) {
    event.preventDefault();
    const category = $("skuCategory").value;
    const style = $("skuStyle").value.trim().toUpperCase();
    const colorCode = $("skuColor").value.trim().toUpperCase();
    const size = $("skuSize").value;
    const baseSku = `JA-FW26-${categoryCodes[category] || "TOP"}-${style}-${colorCode}`;
    if (state.products.some((product) => `${product.baseSku}-${size}` === `${baseSku}-${size}`)) {
      showToast("这个 SKU 已存在，请检查款号、颜色和尺码");
      return;
    }
    state.products.unshift({
      id: `P${Date.now()}`,
      name: $("skuName").value.trim(), category, style, baseSku,
      color: colorCode, colorHex: "#78817d", safety: Number($("skuSafety").value || 0),
      image: "assets/fabric-images/APLS26081-61-1.jpg", sizes: { [size]: 0 }, warehouse: 0, store: 0, reserved: 0
    });
    saveState();
    closeSkuModal();
    $("skuForm").reset();
    renderSkuCategoryOptions();
    renderAll();
    showToast(`SKU ${baseSku}-${size} 已创建`);
  }

  function exportInventory() {
    const headers = ["SKU", "款式", "品类", "颜色", "尺码", "库存", "安全库存", "状态"];
    const rows = state.products.flatMap((product) => Object.entries(product.sizes).map(([size, qty]) => [
      skuForSize(product, size), product.name, product.category, product.color, size, qty, product.safety, qty <= product.safety ? "低库存" : "正常"
    ]));
    const csv = "\ufeff" + [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `JA成衣库存_${localDateKey()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("库存 CSV 已导出");
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    $("toast").querySelector("span").textContent = message;
    $("toast").classList.add("visible");
    toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 2800);
  }

  function stateFromCozSnapshot(snapshot) {
    const groups = new Map();
    snapshot.inventory.forEach((item) => {
      const style = String(item.styleNo || item.sku || "").trim();
      const color = String(item.color || "未设置颜色").trim();
      const size = normalizeSizeLabel(item.size);
      if (!style || !item.sku) return;
      const key = `${style}\u0000${color}`;
      if (!groups.has(key)) {
        const appearance = resolveColorAppearance(color);
        groups.set(key, {
          name: item.productName || item.styleNote || style,
          category: item.category || "成衣",
          style,
          baseSku: style,
          color,
          colorHex: appearance.hex,
          colorAccent: appearance.accent,
          colorPattern: appearance.pattern,
          safety: 0,
          image: safeImageUrl(item.imageUrl),
          imagePath: item.imagePath || "",
          sizes: {},
          skuBySize: {},
          warehouse: 0,
          store: 0,
          reserved: 0,
          reservedReported: false,
          sourceUpdatedAt: item.sourceUpdatedAt || null
        });
      }
      const product = groups.get(key);
      if (!product.image) product.image = safeImageUrl(item.imageUrl);
      if (!product.imagePath && item.imagePath) product.imagePath = item.imagePath;
      product.sizes[size] = Number(product.sizes[size] || 0) + Number(item.stockedQuantity || 0);
      if (!product.skuBySize[size]) product.skuBySize[size] = String(item.sku);
      product.warehouse += Number(item.stockedQuantity || 0);
      product.reserved += Number(item.reservedQuantity || 0);
      product.reservedReported ||= Boolean(item.reservedReported);
      if (item.productName && product.name === style) product.name = item.productName;
      if (item.sourceUpdatedAt && (!product.sourceUpdatedAt || item.sourceUpdatedAt > product.sourceUpdatedAt)) product.sourceUpdatedAt = item.sourceUpdatedAt;
    });

    const products = [...groups.values()]
      .sort((a, b) => a.style.localeCompare(b.style) || a.color.localeCompare(b.color))
      .map((product, index) => ({ id: `COZ-${String(index + 1).padStart(4, "0")}`, ...product }));
    if (!products.length) throw new Error("CoZ 同步数据中没有有效 SKU");
    return {
      products,
      movements: [],
      source: {
        type: "coz",
        brand: "CoZ",
        syncedAt: snapshot.syncedAt,
        skuCount: snapshot.skuCount,
        stockedQuantity: snapshot.stockedQuantity,
        imageCount: snapshot.imageCount || 0,
        sourceRowCount: snapshot.sourceRowCount,
        allRowsLoaded: snapshot.allRowsLoaded
      }
    };
  }

  function receiveCozSnapshot(event) {
    const message = event.data;
    const bridgeToken = new URLSearchParams(window.location.search).get("bridge") || "";
    if (!bridgeToken || event.source !== window.opener) return;
    if (message?.type !== "COZ_INVENTORY_SNAPSHOT" || message.version !== 1 || message.bridgeToken !== bridgeToken) return;
    const snapshot = message.snapshot;
    if (snapshot?.brand !== "CoZ" || !Array.isArray(snapshot.inventory) || snapshot.inventory.length > 50000) return;
    try {
      state = stateFromCozSnapshot(snapshot);
      recordStockSnapshot(totalAvailable(), snapshot.syncedAt || new Date());
      saveState();
      renderAll();
      showToast(`CoZ 库存已同步：${formatNumber(state.source.skuCount)} 个 SKU`);
    } catch (error) {
      showToast(error?.message || "CoZ 库存数据无法读取");
    }
  }

  function initCozBridge() {
    window.addEventListener("message", receiveCozSnapshot);
    const params = new URLSearchParams(window.location.search);
    const bridgeToken = params.get("bridge") || "";
    if (params.get("coz-sync") !== "1" || !bridgeToken || !window.opener) return;
    setTimeout(() => window.opener?.postMessage({ type: "COZ_INVENTORY_READY", version: 1, bridgeToken }, "*"), 350);
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      const viewButton = event.target.closest("[data-view]");
      if (viewButton) switchView(viewButton.dataset.view);
      const jumpButton = event.target.closest("[data-jump]");
      if (jumpButton) switchView(jumpButton.dataset.jump);
      const moveButton = event.target.closest("[data-move-product]");
      if (moveButton) openMovementModal(moveButton.dataset.moveProduct);
      if (event.target.closest("[data-close-modal]")) closeMovementModal();
      if (event.target.closest("[data-close-sku]")) closeSkuModal();
      if (event.target.closest("[data-close-image]")) closeImageModal();
    });
    document.addEventListener("dblclick", (event) => {
      const imageButton = event.target.closest("[data-image-preview]");
      if (imageButton) openImageModal(imageButton);
    });
    let lastTouchTarget = null;
    let lastTouchAt = 0;
    document.addEventListener("pointerup", (event) => {
      if (event.pointerType !== "touch") return;
      const imageButton = event.target.closest("[data-image-preview]");
      if (!imageButton) return;
      const now = Date.now();
      if (lastTouchTarget === imageButton && now - lastTouchAt < 360) openImageModal(imageButton);
      lastTouchTarget = imageButton;
      lastTouchAt = now;
    });
    document.addEventListener("keydown", (event) => {
      const imageButton = event.target.closest?.("[data-image-preview]");
      if (imageButton && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        openImageModal(imageButton);
      }
    });
    $("quickMoveBtn").addEventListener("click", () => openMovementModal());
    $("mobileMoveBtn").addEventListener("click", () => openMovementModal());
    $("scanBtn").addEventListener("click", () => { openMovementModal(); showToast("请选择或扫描 SKU 后调整库存"); });
    $("addSkuBtn").addEventListener("click", openSkuModal);
    $("addCategoryBtn").addEventListener("click", openCategoryCreator);
    $("cancelCategoryBtn").addEventListener("click", closeCategoryCreator);
    $("saveCategoryBtn").addEventListener("click", addCategory);
    ["newCategoryName", "newCategoryCode"].forEach((id) => $(id).addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addCategory();
      }
    }));
    $("movementForm").addEventListener("submit", submitMovement);
    $("skuForm").addEventListener("submit", submitSku);
    $("exportBtn").addEventListener("click", exportInventory);
    $("inventorySearch").addEventListener("input", () => { renderInventory(); refreshIcons(); applyLanguage(); });
    $("categoryFilter").addEventListener("change", () => { renderInventory(); refreshIcons(); applyLanguage(); });
    $("statusFilter").addEventListener("change", () => { renderInventory(); refreshIcons(); applyLanguage(); });
    $("movementSearch").addEventListener("input", renderMovements);
    document.querySelectorAll(".segmented button").forEach((button) => button.addEventListener("click", () => setMovementType(button.dataset.type)));
    ["skuCategory", "skuStyle", "skuColor", "skuSize"].forEach((id) => $(id).addEventListener("input", updateSkuPreview));
    $("saveRulesBtn").addEventListener("click", () => showToast("库存同步规则已保存"));
    $("languageToggle").addEventListener("click", () => {
      currentLang = currentLang === "zh" ? "en" : "zh";
      localStorage.setItem("ja-garment-language", currentLang);
      renderAll();
      switchView(activeView);
    });
    $("themeToggle").addEventListener("click", () => {
      localStorage.setItem("ja-garment-theme", document.body.classList.contains("dark-theme") ? "light" : "dark");
      applyTheme();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (!$("movementModal").hidden) closeMovementModal();
      if (!$("skuModal").hidden) closeSkuModal();
      if (!$("imageModal").hidden) closeImageModal();
    });
  }

  function initDate() {
    const now = new Date();
    $("dateDay").textContent = String(now.getDate()).padStart(2, "0");
    $("dateWeek").textContent = new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(now);
    $("dateFull").textContent = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(now);
  }

  initDate();
  if (state.source?.type === "coz" && localDateKey(new Date(state.source.syncedAt)) === localDateKey()) recordStockSnapshot(totalAvailable(), state.source.syncedAt);
  initCozBridge();
  bindEvents();
  applyTheme();
  renderAll();
  switchView(activeView);
})();
