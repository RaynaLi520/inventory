(() => {
  "use strict";

  const STORAGE_KEY = "ja-garment-inventory-v1";
  const sizeOrder = ["XS", "S", "M", "L", "XL", "XXL"];
  const categoryCodes = { "上装": "TOP", "下装": "BTM", "连衣裙": "DRS", "外套": "OUT", "配饰": "ACC" };
  const viewMeta = {
    overview: ["库存中台 / 今日", "经营概览"],
    inventory: ["商品中心 / SKU", "成衣库存"],
    movements: ["库存中心 / 流水", "出入库流水"],
    channels: ["全渠道 / 配额", "销售渠道"]
  };

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
  let activeView = "overview";
  let toastTimer = null;

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
  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved?.products?.length && Array.isArray(saved.movements)) return saved;
    } catch (_) { /* Use the packaged inventory sample if local data is invalid. */ }
    return clone(seedState);
  }
  function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function totalStock(product) { return Object.values(product.sizes).reduce((sum, qty) => sum + Number(qty || 0), 0); }
  function availableStock(product) { return Math.max(0, totalStock(product) - Number(product.reserved || 0)); }
  function isLow(product) { return Object.values(product.sizes).some((qty) => Number(qty) <= Number(product.safety)); }
  function lowSkuCount() { return state.products.reduce((sum, product) => sum + Object.values(product.sizes).filter((qty) => Number(qty) <= Number(product.safety)).length, 0); }
  function totalAvailable() { return state.products.reduce((sum, product) => sum + availableStock(product), 0); }
  function formatNumber(value) { return new Intl.NumberFormat("zh-CN").format(value); }
  function refreshIcons() { if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 1.7 } }); }

  function renderSizeBand(product) {
    return `<div class="size-band">${sizeOrder.filter((size) => size in product.sizes).map((size) => {
      const qty = Number(product.sizes[size] || 0);
      const cls = qty === 0 ? "empty" : qty <= product.safety ? "low" : "";
      return `<div class="size-stock ${cls}" title="${size} 码：${qty} 件"><div><span>${size}</span><strong>${qty}</strong></div></div>`;
    }).join("")}</div>`;
  }

  function productCell(product) {
    return `<div class="product-cell"><img class="product-thumb" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)} 面料"><div><strong>${escapeHtml(product.name)}</strong><code>${escapeHtml(product.baseSku)}</code></div></div>`;
  }

  function statusBadge(product) {
    return isLow(product) ? '<span class="status low">低库存</span>' : '<span class="status healthy">库存正常</span>';
  }

  function renderOverview() {
    const available = totalAvailable();
    const lowCount = lowSkuCount();
    $("metricAvailable").textContent = formatNumber(available);
    $("metricLow").textContent = lowCount;
    $("navLowCount").textContent = lowCount;
    $("attentionCount").textContent = lowCount;
    $("attentionBand").hidden = lowCount === 0;

    const focusProducts = [...state.products].sort((a, b) => Number(isLow(b)) - Number(isLow(a)) || availableStock(a) - availableStock(b)).slice(0, 5);
    $("overviewRows").innerHTML = focusProducts.map((product) => `
      <tr>
        <td>${productCell(product)}</td>
        <td>${renderSizeBand(product)}</td>
        <td class="num"><span class="stock-number">${availableStock(product)}</span></td>
        <td>${statusBadge(product)}</td>
      </tr>`).join("");

    const channels = [
      { name: "品牌小程序", value: Math.round(available * .42), color: "#176b54" },
      { name: "天猫旗舰店", value: Math.round(available * .31), color: "#386a82" },
      { name: "静安门店", value: Math.round(available * .19), color: "#bd7914" },
      { name: "机动库存", value: Math.max(0, available - Math.round(available * .92)), color: "#89938f" }
    ];
    $("channelTotal").textContent = formatNumber(available);
    $("channelBars").innerHTML = channels.map((channel) => `
      <div><div class="bar-label"><span>${channel.name}</span><span>${formatNumber(channel.value)} 件</span></div><div class="bar-track"><i style="width:${Math.max(4, channel.value / available * 100)}%;--bar:${channel.color}"></i></div></div>`).join("");

    $("activityList").innerHTML = state.movements.slice(0, 4).map((movement) => `
      <div class="activity"><span class="activity-icon ${movement.type}"><i data-lucide="${movement.type === "inbound" ? "package-plus" : movement.type === "outbound" ? "package-minus" : "clipboard-check"}"></i></span><div><p>${movement.type === "inbound" ? "入库" : movement.type === "outbound" ? "出库" : "盘点调整"} <strong>${Math.abs(movement.qty)} 件</strong> · ${escapeHtml(shortSku(movement.sku))}</p><small>${escapeHtml(movement.location)} · ${escapeHtml(movement.time.slice(5))}</small></div></div>`).join("");
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
    $("resultCount").textContent = products.reduce((sum, product) => sum + Object.keys(product.sizes).length, 0);
    $("resultAvailable").textContent = formatNumber(products.reduce((sum, product) => sum + availableStock(product), 0));
    $("inventoryRows").innerHTML = products.map((product) => `
      <tr>
        <td>${productCell(product)}</td>
        <td class="color-cell"><span class="swatch" style="background:${escapeHtml(product.colorHex)}"></span>${escapeHtml(product.color)}</td>
        <td>${renderSizeBand(product)}</td>
        <td class="num">${formatNumber(product.warehouse)}</td>
        <td class="num">${formatNumber(product.store)}</td>
        <td class="num">${formatNumber(product.reserved)}</td>
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

  function renderMovementSkuOptions() {
    const current = $("movementSku").value;
    $("movementSku").innerHTML = state.products.flatMap((product) => sizeOrder.filter((size) => size in product.sizes).map((size) => `<option value="${product.id}|${size}">${escapeHtml(product.baseSku)}-${size} · ${escapeHtml(product.name)}</option>`)).join("");
    if ([...$("movementSku").options].some((option) => option.value === current)) $("movementSku").value = current;
  }

  function renderAll() {
    renderCategoryOptions();
    renderMovementSkuOptions();
    renderOverview();
    renderInventory();
    renderMovements();
    renderChannels();
    refreshIcons();
  }

  function switchView(view) {
    if (!viewMeta[view]) return;
    activeView = view;
    document.querySelectorAll(".view").forEach((node) => node.classList.toggle("active", node.id === `${view}View`));
    document.querySelectorAll("[data-view]").forEach((node) => node.classList.toggle("active", node.dataset.view === view));
    $("pageEyebrow").textContent = viewMeta[view][0];
    $("pageTitle").textContent = viewMeta[view][1];
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openMovementModal(productId, size) {
    renderMovementSkuOptions();
    if (productId) {
      const product = state.products.find((item) => item.id === productId);
      const preferredSize = size || sizeOrder.find((item) => item in product.sizes) || "M";
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
    $("skuModal").hidden = false;
    document.body.style.overflow = "hidden";
    updateSkuPreview();
    setTimeout(() => $("skuName").focus(), 20);
  }

  function closeSkuModal() {
    $("skuModal").hidden = true;
    document.body.style.overflow = "";
  }

  function setMovementType(type) {
    $("movementType").value = type;
    document.querySelectorAll(".segmented button").forEach((button) => button.classList.toggle("active", button.dataset.type === type));
    $("movementForm").querySelector('[type="submit"]').textContent = type === "inbound" ? "确认入库" : "确认出库";
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
      sku: `${product.baseSku}-${size}`,
      location,
      qty: qty * direction,
      operator: "Rayna Li",
      note: $("movementNote").value.trim() || "快速库存调整"
    });
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
    renderAll();
    showToast(`SKU ${baseSku}-${size} 已创建`);
  }

  function exportInventory() {
    const headers = ["SKU", "款式", "品类", "颜色", "尺码", "库存", "安全库存", "状态"];
    const rows = state.products.flatMap((product) => Object.entries(product.sizes).map(([size, qty]) => [
      `${product.baseSku}-${size}`, product.name, product.category, product.color, size, qty, product.safety, qty <= product.safety ? "低库存" : "正常"
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
    });
    $("quickMoveBtn").addEventListener("click", () => openMovementModal());
    $("mobileMoveBtn").addEventListener("click", () => openMovementModal());
    $("scanBtn").addEventListener("click", () => { openMovementModal(); showToast("请选择或扫描 SKU 后调整库存"); });
    $("addSkuBtn").addEventListener("click", openSkuModal);
    $("movementForm").addEventListener("submit", submitMovement);
    $("skuForm").addEventListener("submit", submitSku);
    $("exportBtn").addEventListener("click", exportInventory);
    $("inventorySearch").addEventListener("input", () => { renderInventory(); refreshIcons(); });
    $("categoryFilter").addEventListener("change", () => { renderInventory(); refreshIcons(); });
    $("statusFilter").addEventListener("change", () => { renderInventory(); refreshIcons(); });
    $("movementSearch").addEventListener("input", renderMovements);
    document.querySelectorAll(".segmented button").forEach((button) => button.addEventListener("click", () => setMovementType(button.dataset.type)));
    ["skuCategory", "skuStyle", "skuColor", "skuSize"].forEach((id) => $(id).addEventListener("input", updateSkuPreview));
    $("saveRulesBtn").addEventListener("click", () => showToast("库存同步规则已保存"));
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (!$("movementModal").hidden) closeMovementModal();
      if (!$("skuModal").hidden) closeSkuModal();
    });
  }

  function initDate() {
    const now = new Date();
    $("dateDay").textContent = String(now.getDate()).padStart(2, "0");
    $("dateWeek").textContent = new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(now);
    $("dateFull").textContent = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(now);
  }

  initDate();
  bindEvents();
  renderAll();
  switchView(activeView);
})();
