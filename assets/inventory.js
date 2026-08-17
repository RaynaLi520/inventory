(() => {
  "use strict";

  const STORAGE_KEY = "ja-garment-inventory-v1";
  const CATEGORY_STORAGE_KEY = "ja-garment-categories-v1";
  const ITEM_TYPE_STORAGE_KEY = "coz-spu-item-types-v1";
  const SPU_YEAR_STORAGE_KEY = "coz-spu-years-v1";
  const FABRIC_TYPE_STORAGE_KEY = "coz-spu-fabric-types-v1";
  const COLOR_MAPPING_STORAGE_KEY = "coz-color-mappings-v1";
  const BUNDLE_SEASON_STORAGE_KEY = "coz-bundle-seasons-v1";
  const BUNDLE_COLOR_STORAGE_KEY = "coz-bundle-colors-v1";
  const STOCK_HISTORY_KEY = "ja-garment-stock-history-v1";
  const STOCK_LOCATION_STORAGE_KEY = "ja-garment-stock-locations-v1";
  const hasSavedLocalState = localStorage.getItem(STORAGE_KEY) !== null;
  const CLOUD_TABLE = "inventory_platform_state";
  const CLOUD_RECORD_ID = "default";
  const serverConfig = window.INVENTORY_SERVER_CONFIG || {};
  const localApiEnabled = Boolean(serverConfig.enabled && serverConfig.apiBase);
  const authRequired = serverConfig.authRequired !== false;
  const apiBase = String(serverConfig.apiBase || "/api").replace(/\/$/, "");
  const cloudConfig = window.SUPABASE_CONFIG || {};
  const supabaseClient = !localApiEnabled && window.supabase && cloudConfig.url && cloudConfig.anonKey
    ? window.supabase.createClient(cloudConfig.url, cloudConfig.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      })
    : null;
  const cloudBackendAvailable = localApiEnabled || Boolean(supabaseClient);
  const sizeOrder = ["XS", "S", "M", "L", "XL", "XXL", "F"];
  const LOW_STOCK_SKU_THRESHOLD = 5;
  const defaultCategoryCodes = { "上装": "TOP", "下装": "BTM", "连衣裙": "DRS", "外套": "OUT", "配饰": "ACC" };
  const categoryCodes = loadCategoryCodes();
  const defaultItemTypeCodes = {
    Shirt: "ST", Pant: "PT", Short: "SO", Dress: "DR", Cami: "CM", Tank: "TK",
    Top: "TP", Tee: "TE", Accessories: "ACC", "PJ Set": "SET", Skirt: "SK", Robe: "RB", Blazer: "BZ"
  };
  const itemTypeLabels = {
    Shirt: ["衬衫", "Shirt"], Pant: ["长裤", "Pants"], Short: ["短裤", "Shorts"], Dress: ["连衣裙", "Dress"],
    Cami: ["吊带", "Camisole"], Tank: ["背心", "Tank top"], Top: ["上装", "Top"], Tee: ["T恤", "T-shirt"],
    Accessories: ["配饰", "Accessories"], "PJ Set": ["家居套装", "PJ set"], Skirt: ["半裙", "Skirt"],
    Robe: ["睡袍", "Robe"], Blazer: ["西装外套", "Blazer"], "成衣": ["成衣", "Garment"]
  };
  const itemTypeCodes = loadItemTypeCodes();
  const spuYears = loadSpuYears();
  const fabricTypeCodes = loadFabricTypeCodes();
  const defaultColorMappings = Object.fromEntries(`蓝色|BL,米色|BG,灰色|GY,米灰条|GS,杏色|AP,咖色|CF,黑色|BK,灰绿|GG,粉色|PK,绿色|GR,黄色|YL,酒红|WR,白色|WT,藏青|NV,紫竖条|PS,蓝竖条|BS,白色印花|WP,粉条爱心|PH,咖条爱心|CH,橙色|OR,紫色|PP,紫灰|PG,浅蓝|LB,蓝白条纹|BW1,粉红条纹|PR1,卡其蓝条纹|CL1,淡蓝色|LB1,藏青格|ZQ1,Berry/浆果色|BR1,Navy/藏青|NV1,咖色格|CS1,浆果色|JG,藏青彩条纹|ZC,浆果红彩条纹|JC,灰褐色|HH,Andesite Brown/灰褐色|HH1,摩卡棕|MB,粉蜡黄|PY,Cream/奶白|MW,Black/黑色|BK1,Light Blue/浅蓝色|LB2,Taupe/浅灰褐|HH2,深红粉条|CRN,绿白条|GWB,蓝红条|BRB,Cherry Red/樱桃红|CR,树莓红白条|RWS,浅紫罗兰白条|LVWS,Lime Green/青柠绿|LG,绿色条纹|GS1,Blue/蓝色|BL1,Brown/咖色|BW,White/白色|WT1,黄色狗印花|YDP,蓝樱桃印花|BCP,蓝色条纹|BL2,Pink and Red and Stripe/粉红条纹|PRS,浅杏橙条|LAOS,粉白格|PWC,紫色条纹|PL1,Rust brown/铁锈棕|RBR,粉色条纹|PKS,黄色条纹|YLS,白底小熊|WBR`.split(",").map((entry) => entry.split("|")));
  const colorMappings = loadColorMappings();
  const bundleSeasons = loadStringOptions(BUNDLE_SEASON_STORAGE_KEY, ["SS26", "AW26"]);
  const bundleColors = loadStringOptions(BUNDLE_COLOR_STORAGE_KEY, []);
  const defaultStockLocations = [
    { id: "warehouse", name: "上海总仓", type: "warehouse" },
    { id: "store", name: "静安门店", type: "store" }
  ];
  const stockLocations = loadStockLocations();
  let imageCatalog = Array.isArray(window.COZ_IMAGE_CATALOG) ? [...window.COZ_IMAGE_CATALOG] : [];
  const PRODUCT_ID_VERSION = 2;
  const viewMeta = {
    overview: ["库存中台 / 今日", "经营概览"],
    inventory: ["商品中心 / SKU", "成衣库存"],
    bundles: ["商品中心 / 套装", "套装组合"],
    movements: ["库存中心 / 流水", "出入库流水"],
    channels: ["全渠道 / 配额", "销售渠道"]
  };
  const translationPairs = [
    ["操作", "Actions"], ["编辑库存流水", "Edit stock movement"], ["库存管理员", "Inventory manager"], ["只读库存", "Read-only inventory"], ["库存（只读）", "Inventory (read-only)"], ["库存已锁定，请在“出入库流水”中由授权人员调整。", "Inventory is locked. Authorized staff must adjust it in Stock movements."],
    ["库存中台 / 今日", "Inventory desk / Today"], ["经营概览", "Overview"], ["商品中心 / SKU", "Products / SKU"], ["成衣库存", "Inventory"], ["库存中心 / 流水", "Stock center / Ledger"], ["出入库流水", "Movements"], ["全渠道 / 配额", "Omnichannel / Allocation"], ["销售渠道", "Channels"],
    ["套装组合", "Bundles"], ["套装库存与组成", "Bundle inventory and components"], ["新建套装", "New bundle"], ["保存套装", "Save bundle"], ["虚拟套装", "Virtual bundle"], ["销售组合促销", "Promotional combination"], ["固定 SET 套装", "Fixed SET bundle"], ["套装 SKU 编码预览", "Bundle SKU preview"], ["套装名称", "Bundle name"], ["组合类型", "Bundle type"], ["季节", "Season"], ["添加季节", "Add season"], ["新季节", "New season"], ["添加颜色", "Add color"], ["新颜色", "New color"], ["固定 SET SKU", "Fixed SET SKU"], ["固定套装库存", "Fixed bundle stock"], ["套装组成", "Bundle components"], ["组成", "Components"], ["颜色 / 尺码", "Color / Size"], ["组件 1", "Component 1"], ["组件 2", "Component 2"], ["组件 3（可选）", "Component 3 (optional)"], ["输入款号、名称或颜色检索", "Search style, name, or color"], ["搜索套装、SKU、组件或颜色", "Search bundle, SKU, component, or color"], ["清除组件", "Clear component"], ["组合短码 1", "Bundle code 1"], ["组合短码 2", "Bundle code 2"], ["组合短码 3（可选）", "Bundle code 3 (optional)"], ["还没有套装", "No bundles yet"], ["个套装", "bundles"], ["套", "sets"], ["单件库存可组成虚拟套装，固定 SET 可独立管理。", "Use individual inventory in virtual bundles; manage fixed SET stock independently."], ["新建虚拟套装后，系统会按组件库存实时计算可售套数。", "Create a virtual bundle to calculate sellable sets from component stock in real time."], ["最多 3 个组件；第三项可用于头花等配件。", "Up to 3 components; use the third for a hair accessory."], ["虚拟 / 促销：组件短码用 + 连接；固定套装：使用完整 SET SKU。", "Virtual / promotion: join component codes with +; fixed bundles use the full SET SKU."], ["不可售", "Unavailable"], ["删除套装", "Delete bundle"],
    ["数据已保存到本机", "Saved locally"], ["CoZ 实时库存", "CoZ live inventory"], ["CoZ 暂未提供", "Not provided by CoZ"], ["接口未提供出入库流水", "Movement data is not provided"], ["品牌管理员", "Brand admin"], ["库存提醒", "Stock alerts"], ["导出库存", "Export stock"], ["快速出入库", "Quick movement"], ["扫描 SKU", "Scan SKU"], ["安装应用", "Install app"], ["安装", "Install"], ["切换语言", "Switch language"], ["切换主题", "Switch theme"], ["深色", "Dark mode"], ["浅色", "Light mode"],
    ["星期一", "Monday"], ["星期二", "Tuesday"], ["星期三", "Wednesday"], ["星期四", "Thursday"], ["星期五", "Friday"], ["星期六", "Saturday"], ["星期日", "Sunday"],
    ["2026年8月", "August 2026"], ["线上与门店共用一套 SKU 库存，低库存款式请优先补货或调整渠道配额。", "Online and store channels share one SKU pool; prioritize replenishment or reallocate stock for low-stock styles."], [" 个 SKU 需要处理", " SKUs need action"],
    ["可售库存", "Sellable stock"], ["今日售出", "Sold today"], ["低库存 SKU", "Low-stock SKUs"], ["在途库存", "In transit"], ["较上周", "vs last week"], ["需处理", "Needs action"], ["库存小于等于 5", "Stock at or below 5"], ["3 个采购单 · 最早 8/12 到货", "3 purchase orders · earliest arrival Aug 12"], ["线上 24 · 门店 12", "Online 24 · Store 12"], ["4.8%", "4.8%"],
    ["个 SKU · 实时可售", "SKUs · sellable now"], ["件", "pcs"], ["件可售库存", "sellable pcs"], ["重点款库存", "Priority stock"], ["全部 SKU", "All SKUs"], ["渠道库存", "Channel stock"], ["最近动态", "Recent activity"], ["库存总览", "Stock overview"], ["库存正常", "Healthy"], ["低库存", "Low stock"], ["低库存（≤5）", "Low stock (≤5)"], ["LIVE STOCK", "LIVE STOCK"], ["ALLOCATION", "ALLOCATION"],
    ["品牌小程序", "Brand mini-program"], ["天猫旗舰店", "Tmall flagship"], ["静安门店", "Jing'an store"], ["机动库存", "Buffer stock"], ["渠道可售", "Channel sellable"], ["今日订单", "Orders today"], ["同步正常", "Sync healthy"], ["微信自营商城", "WeChat direct store"], ["平台电商", "Marketplace"], ["线下直营", "Offline retail"], ["2 分钟前同步", "Synced 2 min ago"],
    ["搜索款式、SKU、颜色", "Search style, SKU, color"], ["搜索单号或 SKU", "Search order or SKU"], ["全部品类", "All categories"], ["全部状态", "All statuses"], ["按品类筛选", "Filter by category"], ["按库存状态筛选", "Filter by stock status"], ["新增 SPU", "New SPU"], ["SKU CATALOG", "SKU CATALOG"], ["成衣库存明细", "Inventory detail"], ["款式 / SKU", "Style / SKU"], ["颜色", "Color"], ["尺码库存带", "Size curve"], ["仓库", "Warehouse"], ["门店", "Store"], ["占用", "Reserved"], ["可售", "Sellable"], ["状态", "Status"], ["调整库存", "Adjust stock"],
    ["回收站", "Recycle bin"], ["库存回收站", "Inventory recycle bin"], ["款式回收站", "Style recycle bin"], ["套装回收站", "Bundle recycle bin"], ["套装回收站为空", "Bundle recycle bin is empty"], ["删除款式", "Delete style"], ["恢复", "Restore"], ["彻底删除", "Delete permanently"], ["删除时间", "Deleted at"], ["回收站为空", "Recycle bin is empty"], ["删除的款式会保留在这里。", "Deleted styles remain here."], ["删除的套装会保留在这里。", "Deleted bundles remain here."], ["删除的款式不会在下一次 CoZ 同步时重新出现。恢复后会重新参与库存和套装计算。", "Deleted styles stay excluded from future CoZ syncs. Restored styles rejoin inventory and bundle calculations."],
    ["库存流水", "Stock ledger"], ["STOCK LEDGER", "STOCK LEDGER"], ["类型", "Type"], ["库位", "Location"], ["数量", "Quantity"], ["操作人", "Operator"], ["备注", "Note"], ["入库", "Inbound"], ["出库", "Outbound"], ["盘点调整", "Adjustment"], ["上海总仓", "Shanghai warehouse"], ["静安门店", "Jing'an store"], ["快速出入库", "Quick movement"], ["确认入库", "Confirm inbound"], ["确认出库", "Confirm outbound"], ["取消", "Cancel"], ["SKU", "SKU"], ["扫描 SKU", "Scan SKU"], ["选择或扫描 SKU 后调整库存", "Select or scan a SKU to adjust stock"], ["输入 SKU、款号或商品名称", "Enter SKU, style, or product name"], ["添加库位", "Add location"], ["修改现有库位", "Edit location"], ["库位名称", "Location name"], ["库位类型", "Location type"], ["保存库位", "Save location"], ["仓库", "Warehouse"], ["门店", "Store"], ["备注", "Note"],
    ["销售渠道与库存配额", "Sales channels and allocation"], ["OMNICHANNEL", "OMNICHANNEL"], ["每个渠道共享实物库存，通过配额控制超卖风险。", "Channels share physical stock; allocations prevent overselling."], ["连接渠道", "Connect channel"], ["库存同步规则", "Stock sync rules"], ["POLICY", "POLICY"], ["保存规则", "Save rules"], ["安全库存保护", "Safety stock protection"], ["可售数量达到安全库存时停止线上销售", "Stop online sales when sellable stock reaches safety level"], ["订单自动占用", "Auto-reserve orders"], ["订单创建后立即占用库存，取消后自动释放", "Reserve on order creation and release on cancellation"], ["门店库存线上可见", "Show store stock online"], ["允许消费者查询附近门店库存", "Let customers check nearby store stock"],
    ["确认", "Confirm"], ["例如：采购单 PO-20260809", "e.g. purchase order PO-20260809"], ["上海总仓", "Shanghai warehouse"], ["静安门店", "Jing'an store"], ["品牌", "Brand"], ["品类", "Category"], ["款式名称", "Style name"], ["商品类型", "Item type"], ["添加类型", "Add type"], ["类型名称", "Type name"], ["类型缩写", "Type code"], ["商品图片", "Product image"], ["创建日期", "Creation date"], ["年份", "Year"], ["添加年份", "Add year"], ["新年份", "New year"], ["季节", "Season"], ["面料类型", "Fabric type"], ["添加面料类型", "Add fabric type"], ["面料类型名称", "Fabric type name"], ["面料类型代码", "Fabric type code"], ["SS · 春夏", "SS · Spring/Summer"], ["AW · 秋冬", "AW · Autumn/Winter"], ["三位序号", "3-digit sequence"], ["原始款号（选填）", "Original style no. (optional)"], ["图片链接（可选）", "Image URL (optional)"], ["SKU 变体", "SKU variants"], ["一个 SPU 可同时生成多个尺码 SKU。", "Create multiple size SKUs under one SPU."], ["颜色代码", "Color code"], ["生成", "Create"], ["启用", "Enabled"], ["尺码", "Size"], ["初始库存", "Opening stock"], ["CoZ 库存", "CoZ stock"], ["CoZ 原始 SKU", "Original CoZ SKU"], ["品牌 SKU", "Brand SKU"], ["库存与原始 SKU 由 CoZ 同步，品牌 SKU 可编辑。", "Stock and original SKUs are synced from CoZ. Brand SKUs can be edited."], ["未同步", "Not synced"], ["SKU 编码", "SKU code"], ["安全库存", "Safety stock"], ["新增成衣 SPU", "New garment SPU"], ["编辑 SPU 和 SKU", "Edit SPU and SKU"], ["SPU 编码预览", "SPU code preview"], ["COZ + 季节 + 年份后两位 + 面料首字母 + 商品类型缩写 + 三位序号", "COZ + season + 2-digit year + fabric initial + item type code + 3-digit sequence"], ["创建 SPU 和 SKU", "Create SPU and SKUs"], ["保存修改", "Save changes"]
  ];
  const zhToEn = new Map(translationPairs);
  const enToZh = new Map(translationPairs.map(([zh, en]) => [en, zh]));

  const seedState = {
    bundles: [],
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
  let cloudStatus = cloudBackendAvailable ? "connecting" : "local";
  let cloudUpdatedAt = null;
  let cloudReady = false;
  let cloudDirty = false;
  let cloudSaveTimer = null;
  let cloudRetryTimer = null;
  let cloudRetryAttempt = 0;
  let cloudLastError = "";
  let cloudPersisting = false;
  let cloudRevision = 0;
  let cloudChannel = null;
  let cloudPollTimer = null;
  let deferredInstallPrompt = null;
  let pendingSkuImage = "";
  let pendingSkuImageName = "";
  let skuImageRemoved = false;
  let currentSession = authRequired ? {
    id: "",
    username: "",
    displayName: "库存用户",
    role: "viewer",
    roleLabel: "只读人员",
    permissions: { manageMovements: false, manageCatalog: false, manageUsers: false }
  } : {
    id: "direct-access",
    username: "direct-access",
    displayName: "内网用户",
    role: "direct_access",
    roleLabel: "直接访问",
    permissions: { manageMovements: true, manageCatalog: true, manageUsers: false }
  };

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
    if (localApiEnabled && /^\/media\/[A-Za-z0-9%+_.-]+$/i.test(raw)) return raw;
    try {
      const url = new URL(raw);
      return url.protocol === "https:" ? url.href : "";
    } catch (_) { return ""; }
  }
  function itemTypeLabel(value) {
    const labels = itemTypeLabels[value];
    return labels ? labels[currentLang === "zh" ? 0 : 1] : String(value || "");
  }
  function itemTypeCatalogLabel(value) {
    const labels = itemTypeLabels[value];
    const english = labels?.[1] || String(value || "");
    const chinese = labels?.[0] || String(value || "");
    return `${english} · ${chinese} · ${itemTypeCodes[value] || "--"}`;
  }
  function sourceColorKey(source, color) {
    return JSON.stringify([
      String(source || "").trim().toLowerCase(),
      String(color || "").trim().toLowerCase()
    ]);
  }
  function migrateProductSourceKey(value) {
    const key = String(value || "");
    if (!key) return "";
    if (key.includes("\u0000")) {
      const separator = key.indexOf("\u0000");
      return sourceColorKey(key.slice(0, separator), key.slice(separator + 1));
    }
    try {
      const parts = JSON.parse(key);
      if (Array.isArray(parts) && parts.length === 2) return sourceColorKey(parts[0], parts[1]);
    } catch (_) { /* Preserve unknown keys from older local versions. */ }
    return key.toLowerCase();
  }
  function productSourceKey(product) {
    return sourceColorKey(
      product?.sourceBaseSku || product?.style || product?.originalStyle || product?.baseSku,
      product?.color
    );
  }
  function stableProductToken(value) {
    const normalized = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (normalized) return normalized;
    let hash = 2166136261;
    for (const char of String(value || "")) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return `C${(hash >>> 0).toString(36).toUpperCase()}`;
  }
  function stableProductId(product) {
    const style = product?.sourceBaseSku || product?.style || product?.originalStyle || product?.baseSku || product?.id || "PRODUCT";
    const color = product?.colorCode || colorMappings[product?.color] || product?.color || "COLOR";
    return `COZ-${stableProductToken(style)}-${stableProductToken(color)}`;
  }
  function productMatchesReference(product, source, color = "") {
    const sourceKey = String(source || "").trim().toLowerCase();
    if (!sourceKey) return false;
    const sourceMatches = [product?.sourceBaseSku, product?.style, product?.originalStyle, product?.baseSku].some((value) => String(value || "").trim().toLowerCase() === sourceKey);
    const colorKey = String(color || "").trim().toLowerCase();
    return sourceMatches && (!colorKey || String(product?.color || "").trim().toLowerCase() === colorKey);
  }
  function normalizeProductReferences(target) {
    if (!target || !Array.isArray(target.products)) return false;
    const products = target.products;
    const originalIds = new Map(products.map((product) => [product, String(product?.id || "").trim()]));
    const usedIds = new Set();
    let changed = Number(target.productIdVersion || 0) < PRODUCT_ID_VERSION;
    products.forEach((product) => {
      const originalId = originalIds.get(product);
      if (originalId && !usedIds.has(originalId)) {
        usedIds.add(originalId);
        return;
      }
      let nextId = stableProductId(product);
      let suffix = 2;
      while (usedIds.has(nextId)) nextId = `${stableProductId(product)}-${suffix++}`;
      product.id = nextId;
      usedIds.add(nextId);
      changed = true;
    });
    const bundles = Array.isArray(target.bundles) ? target.bundles : [];
    bundles.forEach((bundle) => {
      bundle.components = (bundle.components || []).map((originalId, index) => {
        const source = bundle.componentSourceSkus?.[index] || bundle.componentSkus?.[index] || "";
        const color = bundle.componentColors?.[index] || "";
        const match = products.find((product) => productMatchesReference(product, source, color))
          || products.find((product) => originalIds.get(product) === String(originalId || ""));
        const nextId = match?.id || originalId;
        if (nextId !== originalId) changed = true;
        return nextId;
      });
    });
    target.productIdVersion = PRODUCT_ID_VERSION;
    return changed;
  }
  function imageTimestamp(date = new Date()) {
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}`;
  }
  function normalizedImageName(skc, extension = "jpg", date = new Date()) {
    const safeSkc = String(skc || "SKC").trim().toUpperCase().replace(/[^A-Z0-9+_-]+/g, "-").replace(/^-+|-+$/g, "") || "SKC";
    const safeExtension = String(extension || "jpg").toLowerCase().replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "") || "jpg";
    return `${safeSkc}_${imageTimestamp(date)}.${safeExtension}`;
  }
  function applyImageCatalog(saved) {
    if (!imageCatalog.length || !Array.isArray(saved?.products)) return;
    const byKey = new Map(imageCatalog.map((entry) => [sourceColorKey(entry.style, entry.color), entry]));
    saved.products.forEach((product) => {
      const entry = byKey.get(productSourceKey(product));
      if (!entry) return;
      product.imageSourceName ||= entry.sourceName;
      product.imageName ||= entry.imageName;
      if (!product.image && entry.status === "available") product.image = safeImageUrl(entry.imageUrl);
      product.imageSyncStatus ||= product.image ? "available" : "pending-source-download";
    });
  }
  function upgradeCozState(saved) {
    if (!saved || !Array.isArray(saved.products)) return saved;
    saved.trashProducts = Array.isArray(saved.trashProducts)
      ? saved.trashProducts.map((product) => ({ ...product, deletedSourceKey: productSourceKey(product) }))
      : [];
    saved.trashBundles = Array.isArray(saved.trashBundles) ? saved.trashBundles : [];
    saved.deletedBundleIds = Array.isArray(saved.deletedBundleIds) ? [...new Set(saved.deletedBundleIds)] : [];
    saved.deletedProductKeys = Array.isArray(saved.deletedProductKeys)
      ? [...new Set(saved.deletedProductKeys.map(migrateProductSourceKey).filter(Boolean))]
      : [];
    applyImageCatalog(saved);
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
      if (product.reservedBySize) {
        product.reservedBySize = Object.fromEntries(Object.entries(product.reservedBySize).map(([size, qty]) => [normalizeSizeLabel(size), Number(qty || 0)]));
      }
      if (product.skuBySize) {
        product.skuBySize = Object.fromEntries(Object.entries(product.skuBySize).map(([size, sku]) => [normalizeSizeLabel(size), sku]));
      }
      if (product.sourceSkuBySize) {
        product.sourceSkuBySize = Object.fromEntries(Object.entries(product.sourceSkuBySize).map(([size, sku]) => [normalizeSizeLabel(size), sku]));
      }
      if (product.localSizes) {
        product.localSizes = Object.fromEntries(Object.entries(product.localSizes).map(([size, qty]) => [normalizeSizeLabel(size), Number(qty || 0)]));
      }
      const skuValues = Object.values(product.skuBySize || {}).filter(Boolean).map(String);
      if (!product.sourceSkuBySize && skuValues.length && skuValues.every((sku) => /^\d+$/.test(sku))) {
        product.sourceSkuBySize = { ...product.skuBySize };
        product.skuBySize = {};
      }
      if (product.sourceOrigin !== "manual" || product.sourceBaseSku) {
        product.sourceOrigin = "coz";
        product.sourceBaseSku ||= product.style || product.baseSku;
      }
      if ((product.sourceBaseSku || product.style) === "COZAW25-KACC053" && product.color === "Light Blue/浅蓝色" && product.sizes?.F != null) {
        product.sourceSkuBySize ||= {};
        product.sourceSkuBySize.F ||= "72500774932618";
      }
    });
    normalizeProductReferences(saved);
    return saved;
  }
  function loadCategoryCodes() {
    try {
      const saved = JSON.parse(localStorage.getItem(CATEGORY_STORAGE_KEY));
      if (saved && typeof saved === "object" && !Array.isArray(saved)) return { ...defaultCategoryCodes, ...saved };
    } catch (_) { /* Use the packaged categories if local data is invalid. */ }
    return { ...defaultCategoryCodes };
  }
  function loadItemTypeCodes() {
    try {
      const saved = JSON.parse(localStorage.getItem(ITEM_TYPE_STORAGE_KEY));
      if (saved && typeof saved === "object" && !Array.isArray(saved)) return { ...defaultItemTypeCodes, ...saved };
    } catch (_) { /* Use the packaged CoZ item type mapping if local data is invalid. */ }
    return { ...defaultItemTypeCodes };
  }
  function saveItemTypeCodes() {
    localStorage.setItem(ITEM_TYPE_STORAGE_KEY, JSON.stringify(itemTypeCodes));
    queueCloudSave();
  }
  function loadSpuYears() {
    try {
      const saved = JSON.parse(localStorage.getItem(SPU_YEAR_STORAGE_KEY));
      if (Array.isArray(saved)) return [...new Set(saved.map(Number).filter((year) => year >= 2000 && year <= 2099))].sort();
    } catch (_) { /* Use the packaged year options. */ }
    return [2025, 2026, 2027];
  }
  function loadFabricTypeCodes() {
    try {
      const saved = JSON.parse(localStorage.getItem(FABRIC_TYPE_STORAGE_KEY));
      if (saved && typeof saved === "object" && !Array.isArray(saved)) return { Woven: "W", Knit: "K", ...saved };
    } catch (_) { /* Use the packaged fabric type mapping. */ }
    return { Woven: "W", Knit: "K" };
  }
  function loadColorMappings() {
    try {
      const saved = JSON.parse(localStorage.getItem(COLOR_MAPPING_STORAGE_KEY));
      if (saved && typeof saved === "object" && !Array.isArray(saved)) return { ...saved, ...defaultColorMappings };
    } catch (_) { /* Use the packaged color mappings if local data is invalid. */ }
    return { ...defaultColorMappings };
  }
  function saveColorMappings() {
    localStorage.setItem(COLOR_MAPPING_STORAGE_KEY, JSON.stringify(colorMappings));
    queueCloudSave();
  }
  function loadStringOptions(storageKey, defaults) {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (Array.isArray(saved)) return [...new Set([...defaults, ...saved].map((value) => String(value || "").trim()).filter(Boolean))];
    } catch (_) { /* Use the packaged options if local data is invalid. */ }
    return [...defaults];
  }
  function normalizeStockLocations(locations) {
    const source = Array.isArray(locations) ? locations : [];
    const normalized = source.map((location) => ({
      id: String(location?.id || "").trim(),
      name: String(location?.name || "").trim(),
      type: location?.type === "store" ? "store" : "warehouse"
    })).filter((location) => location.id && location.name);
    const byId = new Map(normalized.map((location) => [location.id, location]));
    defaultStockLocations.forEach((location) => {
      if (!byId.has(location.id)) byId.set(location.id, { ...location });
    });
    return [...byId.values()];
  }
  function loadStockLocations() {
    try {
      return normalizeStockLocations(JSON.parse(localStorage.getItem(STOCK_LOCATION_STORAGE_KEY)));
    } catch (_) {
      return normalizeStockLocations([]);
    }
  }
  function saveStockLocations() {
    localStorage.setItem(STOCK_LOCATION_STORAGE_KEY, JSON.stringify(stockLocations));
    queueCloudSave();
  }
  function saveSpuOptions() {
    localStorage.setItem(SPU_YEAR_STORAGE_KEY, JSON.stringify(spuYears));
    localStorage.setItem(FABRIC_TYPE_STORAGE_KEY, JSON.stringify(fabricTypeCodes));
    queueCloudSave();
  }
  function saveBundleOptions() {
    localStorage.setItem(BUNDLE_SEASON_STORAGE_KEY, JSON.stringify(bundleSeasons));
    localStorage.setItem(BUNDLE_COLOR_STORAGE_KEY, JSON.stringify(bundleColors));
    queueCloudSave();
  }
  function saveCategoryCodes() {
    localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(categoryCodes));
    queueCloudSave();
  }
  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved?.products?.length && Array.isArray(saved.movements)) {
        const upgraded = upgradeCozState(saved);
        const merged = { ...upgraded, bundles: mergeBundleSeed(upgraded.bundles, upgraded.deletedBundleIds) };
        normalizeProductReferences(merged);
        return merged;
      }
    } catch (_) { /* Use the packaged inventory sample if local data is invalid. */ }
    return { ...clone(seedState), trashProducts: [], trashBundles: [], deletedProductKeys: [], deletedBundleIds: [] };
  }
  function mergeBundleSeed(existingBundles, deletedBundleIds = []) {
    const imported = Array.isArray(window.BUNDLE_SEED) ? window.BUNDLE_SEED : [];
    const existing = Array.isArray(existingBundles) ? existingBundles : [];
    const deleted = new Set((Array.isArray(deletedBundleIds) ? deletedBundleIds : []).map(String));
    const custom = existing.filter((bundle) => !String(bundle.id || "").startsWith("IMPORT-"));
    const savedImports = new Map(existing
      .filter((bundle) => String(bundle.id || "").startsWith("IMPORT-"))
      .map((bundle) => [bundle.id, bundle]));
    return [...custom, ...imported.filter((bundle) => !deleted.has(String(bundle.id))).map((bundle) => {
      const saved = savedImports.get(bundle.id);
      if (!saved) return clone(bundle);
      if (saved.updatedAt) return clone(saved);
      return clone({ ...bundle, components: Array.isArray(saved.components) ? saved.components : bundle.components });
    })];
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (_) { /* Cloud persistence remains available if images exceed localStorage quota. */ }
    queueCloudSave();
  }
  function normalizeStockHistory(history) {
    if (!Array.isArray(history)) return [];
    return history.filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry?.day) && Number.isFinite(Number(entry.available)))
      .map((entry) => ({ day: entry.day, available: Number(entry.available), syncedAt: entry.syncedAt || `${entry.day}T23:59:59` }))
      .sort((a, b) => a.day.localeCompare(b.day));
  }
  function bundleTail(sku) {
    const value = String(sku || "").replace(/[^A-Za-z0-9]/g, "");
    const match = value.match(/([A-Za-z])(\d+)$/);
    return match ? `${match[1].toUpperCase()}${match[2]}` : value.slice(-8).toUpperCase();
  }
  function bundleColorCode(value) {
    const raw = String(value || "COLOR").trim();
    return /^[a-z0-9]+$/i.test(raw) ? raw.toUpperCase() : raw;
  }
  function bundleSku(bundle) {
    if (bundle.importedSku && !bundle.updatedAt) return bundle.importedSku;
    if (bundle.type === "fixed" && bundle.fixedSku) return bundle.fixedSku;
    const tails = (bundle.components || []).map((_, index) => {
      const part = bundlePartRecords(bundle).find((record) => record.index === index)?.product;
      return String(bundle.componentCodes?.[index] || bundleTail(part?.baseSku)).trim().toUpperCase();
    }).filter(Boolean);
    const color = bundleColorCode(bundle.colorCode || bundle.color);
    const size = bundle.size || "F";
    return `${tails.join("+") || "BUNDLE"}-${color}-${size}`;
  }
  function bundlePartRecords(bundle) {
    return (bundle.components || []).map((id, index) => {
      const sku = bundle.componentSkus?.[index];
      const color = bundle.componentColors?.[index];
      const product = state.products.find((item) => item.id === id)
        || state.products.find((item) => [item.baseSku, item.sourceBaseSku, item.style, item.originalStyle].includes(bundle.componentSourceSkus?.[index]) && (!color || item.color === color))
        || state.products.find((item) => item.baseSku === (sku || id) && (!color || item.color === color));
      return product ? { product, index } : null;
    }).filter(Boolean);
  }
  function bundleParts(bundle) {
    return bundlePartRecords(bundle).map(({ product }) => product);
  }
  function bundleComponentSize(product, bundleSize, configuredSize = "") {
    if (configuredSize && product.sizes?.[configuredSize] != null) return configuredSize;
    if (bundleSize && product.sizes?.[bundleSize] != null) return bundleSize;
    if (product.sizes?.F != null) return "F";
    return "";
  }
  function componentAvailable(product, size, configuredSize = "") {
    if (!product) return 0;
    if (size) {
      const componentSize = bundleComponentSize(product, size, configuredSize);
      if (!componentSize) return 0;
      const reserved = product.reservedBySize
        ? Number(product.reservedBySize[componentSize] || 0)
        : Math.min(Number(product.sizes[componentSize] || 0), Number(product.reserved || 0));
      return Math.max(0, Number(product.sizes[componentSize]) - reserved);
    }
    return availableStock(product);
  }
  function bundleAvailable(bundle) {
    if (bundle.type === "fixed") return Math.max(0, Number(bundle.fixedStock || 0));
    const parts = bundleParts(bundle);
    if (!parts.length || parts.length !== (bundle.components || []).length) return 0;
    return Math.max(0, Math.min(...parts.map((product, index) => componentAvailable(product, bundle.size, bundle.componentSizes?.[index]))));
  }
  function bundleTypeLabel(type) {
    return type === "fixed" ? "固定 SET 套装" : type === "promo" ? "销售组合促销" : "虚拟套装";
  }
  function loadStockHistory() {
    try {
      const history = JSON.parse(localStorage.getItem(STOCK_HISTORY_KEY));
      return normalizeStockHistory(history);
    } catch (_) { return []; }
  }

  function cloudDocument() {
    return {
      version: 1,
      state,
      categoryCodes: { ...categoryCodes },
      itemTypeCodes: { ...itemTypeCodes },
      spuYears: [...spuYears],
      fabricTypeCodes: { ...fabricTypeCodes },
      colorMappings: { ...colorMappings },
      bundleSeasons: [...bundleSeasons],
      bundleColors: [...bundleColors],
      stockLocations: clone(stockLocations),
      imageCatalog: clone(imageCatalog),
      stockHistory
    };
  }

  function sameCloudTimestamp(left, right) {
    if (!left || !right) return false;
    const leftTime = new Date(left).getTime();
    const rightTime = new Date(right).getTime();
    return Number.isFinite(leftTime) && Number.isFinite(rightTime) ? leftTime === rightTime : left === right;
  }

  function persistLocalCache() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (_) { /* Large product images can exceed browser storage; Supabase remains authoritative. */ }
    localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(categoryCodes));
    localStorage.setItem(ITEM_TYPE_STORAGE_KEY, JSON.stringify(itemTypeCodes));
    localStorage.setItem(SPU_YEAR_STORAGE_KEY, JSON.stringify(spuYears));
    localStorage.setItem(FABRIC_TYPE_STORAGE_KEY, JSON.stringify(fabricTypeCodes));
    localStorage.setItem(COLOR_MAPPING_STORAGE_KEY, JSON.stringify(colorMappings));
    localStorage.setItem(BUNDLE_SEASON_STORAGE_KEY, JSON.stringify(bundleSeasons));
    localStorage.setItem(BUNDLE_COLOR_STORAGE_KEY, JSON.stringify(bundleColors));
    localStorage.setItem(STOCK_LOCATION_STORAGE_KEY, JSON.stringify(stockLocations));
    localStorage.setItem(STOCK_HISTORY_KEY, JSON.stringify(stockHistory));
  }

  function queueCloudSave() {
    cloudRevision += 1;
    cloudDirty = true;
    if (!cloudBackendAvailable || !cloudReady) {
      return;
    }
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = setTimeout(() => persistCloudState(), 450);
  }

  function resetCloudRetry() {
    clearTimeout(cloudRetryTimer);
    cloudRetryTimer = null;
    cloudRetryAttempt = 0;
    cloudLastError = "";
  }

  function scheduleCloudRetry(mode, error) {
    clearTimeout(cloudRetryTimer);
    cloudRetryAttempt += 1;
    cloudLastError = String(error?.message || error?.details || error?.code || "Network request failed");
    const delay = Math.min(30000, 2000 * (2 ** Math.min(cloudRetryAttempt - 1, 4)));
    cloudRetryTimer = setTimeout(async () => {
      cloudRetryTimer = null;
      if (!navigator.onLine) {
        scheduleCloudRetry(mode, error);
        return;
      }
      if (mode === "load" && !cloudReady) await initCloudState();
      else await persistCloudState();
      if (cloudReady) subscribeToCloudState();
    }, delay);
  }

  async function persistCloudState() {
    if (!cloudBackendAvailable || !cloudReady || cloudPersisting) return;
    cloudPersisting = true;
    const revision = cloudRevision;
    const updatedAt = new Date().toISOString();
    cloudStatus = "syncing";
    renderSyncState();
    try {
      if (localApiEnabled) {
        const response = await fetch(`${apiBase}/state`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: cloudDocument() })
        });
        if (!response.ok) {
          const error = new Error(`Inventory API save failed (HTTP ${response.status})`);
          error.status = response.status;
          throw error;
        }
        const result = await response.json();
        cloudUpdatedAt = result.updated_at || updatedAt;
      } else {
        const { error } = await supabaseClient
          .from(CLOUD_TABLE)
          .upsert({ id: CLOUD_RECORD_ID, data: cloudDocument(), updated_at: updatedAt }, { onConflict: "id" });
        if (error) throw error;
        cloudUpdatedAt = updatedAt;
      }
      cloudStatus = "synced";
      cloudDirty = false;
      resetCloudRetry();
      renderSyncState();
    } catch (error) {
      if (localApiEnabled && authRequired && error.status === 401) {
        location.replace(`/login.html?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`);
        return;
      }
      if (localApiEnabled && error.status === 403) {
        cloudDirty = false;
        cloudStatus = "synced";
        showToast("当前账号没有库存操作权限，未保存的库存变化已撤销");
        try {
          const response = await fetch(`${apiBase}/state`, { cache: "no-store" });
          const remote = response.ok ? await response.json() : null;
          if (remote?.data && applyCloudDocument(remote.data)) {
            cloudUpdatedAt = remote.updated_at;
            renderAll();
          }
        } catch (_) { /* The normal polling loop will reload authoritative state. */ }
        renderSyncState();
        return;
      }
      cloudStatus = "error";
      console.error(`${localApiEnabled ? "Inventory API" : "Supabase"} inventory save failed`, error);
      scheduleCloudRetry("save", error);
      renderSyncState();
    } finally {
      cloudPersisting = false;
    }
    if (revision !== cloudRevision && cloudStatus === "synced") queueCloudSave();
  }

  function applyCloudDocument(document) {
    if (!document?.state?.products?.length || !Array.isArray(document.state.movements)) return false;
    const needsProductIdMigration = Number(document.state.productIdVersion || 0) < PRODUCT_ID_VERSION;
    if (Array.isArray(document.imageCatalog)) imageCatalog = clone(document.imageCatalog);
    state = upgradeCozState(clone(document.state));
    Object.keys(categoryCodes).forEach((key) => delete categoryCodes[key]);
    Object.assign(categoryCodes, defaultCategoryCodes, document.categoryCodes || {});
    Object.keys(itemTypeCodes).forEach((key) => delete itemTypeCodes[key]);
    Object.assign(itemTypeCodes, defaultItemTypeCodes, document.itemTypeCodes || {});
    spuYears.splice(0, spuYears.length, ...[...new Set([2025, 2026, 2027, ...(document.spuYears || [])].map(Number).filter((year) => Number.isInteger(year) && year >= 2000 && year <= 2099))].sort());
    Object.keys(fabricTypeCodes).forEach((key) => delete fabricTypeCodes[key]);
    Object.assign(fabricTypeCodes, { Woven: "W", Knit: "K" }, document.fabricTypeCodes || {});
    Object.keys(colorMappings).forEach((key) => delete colorMappings[key]);
    Object.assign(colorMappings, document.colorMappings || {}, defaultColorMappings);
    state.bundles = mergeBundleSeed(state.bundles, state.deletedBundleIds);
    const productReferencesChanged = normalizeProductReferences(state);
    bundleSeasons.splice(0, bundleSeasons.length, ...[...new Set(["SS26", "AW26", ...(document.bundleSeasons || []), ...(state.bundles || []).map((bundle) => bundle.season)].map((value) => String(value || "").trim().toUpperCase()).filter(Boolean))]);
    bundleColors.splice(0, bundleColors.length, ...[...new Set([...(document.bundleColors || []), ...(state.bundles || []).map((bundle) => bundle.color)].map((value) => String(value || "").trim()).filter(Boolean))]);
    stockLocations.splice(0, stockLocations.length, ...normalizeStockLocations(document.stockLocations));
    stockHistory = normalizeStockHistory(document.stockHistory);
    if ((needsProductIdMigration || productReferencesChanged) && cloudReady) {
      cloudDirty = true;
      queueCloudSave();
    }
    persistLocalCache();
    return true;
  }

  async function initCloudState() {
    if (!cloudBackendAvailable) {
      cloudStatus = "local";
      renderSyncState();
      return;
    }
    cloudStatus = "connecting";
    renderSyncState();
    let data;
    try {
      if (localApiEnabled) {
        const response = await fetch(`${apiBase}/state`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Inventory API load failed (HTTP ${response.status})`);
        data = await response.json();
      } else {
        const result = await supabaseClient
          .from(CLOUD_TABLE)
          .select("data,updated_at")
          .eq("id", CLOUD_RECORD_ID)
          .maybeSingle();
        if (result.error) throw result.error;
        data = result.data;
      }
    } catch (error) {
      cloudStatus = "error";
      console.error(`${localApiEnabled ? "Inventory API" : "Supabase"} inventory load failed`, error);
      scheduleCloudRetry("load", error);
      renderSyncState();
      return;
    }
    resetCloudRetry();
    cloudReady = true;
    if (cloudDirty || (!data && hasSavedLocalState)) {
      await persistCloudState();
      return;
    }
    if (!data) {
      cloudStatus = "ready";
      renderSyncState();
      return;
    }
    if (applyCloudDocument(data.data)) {
      cloudUpdatedAt = data.updated_at;
      cloudStatus = "synced";
      renderAll();
    } else {
      await persistCloudState();
    }
  }

  function subscribeToCloudState() {
    if (!cloudReady) return;
    if (localApiEnabled) {
      if (cloudPollTimer) return;
      cloudPollTimer = setInterval(async () => {
        if (cloudDirty || cloudPersisting || document.hidden) return;
        try {
          const response = await fetch(`${apiBase}/state`, { cache: "no-store" });
          if (!response.ok) throw new Error(`Inventory API poll failed (HTTP ${response.status})`);
          const remote = await response.json();
          if (!remote?.data) return;
          if (sameCloudTimestamp(remote.updated_at, cloudUpdatedAt)) {
            resetCloudRetry();
            if (cloudStatus !== "synced") {
              cloudStatus = "synced";
              renderSyncState();
            }
            return;
          }
          if (!applyCloudDocument(remote.data)) return;
          cloudUpdatedAt = remote.updated_at;
          cloudStatus = "synced";
          resetCloudRetry();
          renderAll();
        } catch (error) {
          cloudStatus = "error";
          cloudLastError = String(error?.message || error);
          renderSyncState();
        }
      }, 3000);
      return;
    }
    if (!supabaseClient || cloudChannel) return;
    cloudChannel = supabaseClient
      .channel("inventory-platform-state")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: CLOUD_TABLE,
        filter: `id=eq.${CLOUD_RECORD_ID}`
      }, (payload) => {
        const remote = payload.new;
        if (!remote?.data || sameCloudTimestamp(remote.updated_at, cloudUpdatedAt) || cloudDirty || cloudStatus === "syncing") return;
        if (!applyCloudDocument(remote.data)) return;
        cloudUpdatedAt = remote.updated_at;
        cloudStatus = "synced";
        renderAll();
      })
      .subscribe();
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
    queueCloudSave();
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
  function skuForSize(product, size) { return product.skuBySize?.[size] || product.sourceSkuBySize?.[size] || `${product.baseSku}-${size}`; }
  function isCozProduct(product) {
    return product?.sourceOrigin === "coz" || Boolean(product?.sourceBaseSku) || (state.source?.type === "coz" && !product?.sourceOrigin);
  }
  function totalStock(product) { return Object.values(product.sizes).reduce((sum, qty) => sum + Number(qty || 0), 0); }
  function availableStock(product) { return Math.max(0, totalStock(product) - Number(product.reserved || 0)); }
  function isLowSkuQuantity(quantity) { return Number(quantity) <= LOW_STOCK_SKU_THRESHOLD; }
  function isLow(product) { return Object.values(product.sizes).some(isLowSkuQuantity); }
  function stockStatus(available) {
    const quantity = Number(available || 0);
    if (quantity <= 0) return { label: "不可售", className: "unavailable" };
    if (quantity <= 5) return { label: "低库存", className: "low" };
    return { label: "库存正常", className: "healthy" };
  }
  function productStockStatus(product) { return stockStatus(availableStock(product)); }
  function lowSkuCount() { return state.products.reduce((sum, product) => sum + Object.values(product.sizes).filter(isLowSkuQuantity).length, 0); }
  function totalAvailable() { return state.products.reduce((sum, product) => sum + availableStock(product), 0); }
  function formatNumber(value) { return new Intl.NumberFormat("zh-CN").format(value); }
  function refreshIcons() { if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 1.7 } }); }
  function canManageMovements() { return Boolean(currentSession.permissions?.manageMovements); }
  function canManageCatalog() { return Boolean(currentSession.permissions?.manageCatalog); }
  function canManageUsers() { return Boolean(currentSession.permissions?.manageUsers); }

  function renderSession() {
    const displayName = currentSession.displayName || currentSession.username || "库存用户";
    const initials = displayName.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "--";
    $("profileAvatar").textContent = initials;
    $("profileName").textContent = displayName;
    $("profileRole").textContent = currentSession.roleLabel || "只读人员";
    $("profileButton").hidden = !authRequired;
    document.body.classList.toggle("can-manage-movements", canManageMovements());
    document.body.classList.toggle("can-manage-catalog", canManageCatalog());
    ["quickMoveBtn", "mobileMoveBtn", "scanBtn"].forEach((id) => { $(id).hidden = !canManageMovements(); });
    ["addSkuBtn", "openTrashBtn", "addBundleBtn", "openBundleTrashBtn"].forEach((id) => { $(id).hidden = !canManageCatalog(); });
  }

  async function initSession() {
    if (!localApiEnabled || !authRequired) {
      renderSession();
      return true;
    }
    try {
      const response = await fetch(`${apiBase}/auth/session`, { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        if (payload.code === "PASSWORD_CHANGE_REQUIRED") location.replace("/login.html#change-password");
        else location.replace(`/login.html?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`);
        return false;
      }
      const session = (await response.json()).user;
      currentSession = {
        id: String(session.id || ""),
        username: String(session.username || ""),
        email: String(session.email || ""),
        displayName: String(session.displayName || session.username || "库存用户"),
        role: String(session.role || "viewer"),
        roleLabel: String(session.roleLabel || "只读人员"),
        permissions: {
          manageMovements: Boolean(session.permissions?.manageMovements),
          manageCatalog: Boolean(session.permissions?.manageCatalog),
          manageUsers: Boolean(session.permissions?.manageUsers)
        }
      };
    } catch (error) {
      console.error("Inventory session load failed", error);
      location.replace(`/login.html?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`);
      return false;
    }
    renderSession();
    return true;
  }

  async function authApi(path, options = {}) {
    const response = await fetch(`${apiBase}/auth/${path}`, {
      cache: "no-store",
      ...options,
      headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }
    });
    const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (!response.ok) {
      if (authRequired && response.status === 401) location.replace(`/login.html?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`);
      const error = new Error(payload.error || `HTTP ${response.status}`);
      error.code = payload.code;
      throw error;
    }
    return payload;
  }

  function openAccountModal() {
    const displayName = currentSession.displayName || currentSession.username;
    $("accountAvatar").textContent = $("profileAvatar").textContent;
    $("accountName").textContent = displayName;
    $("accountIdentity").textContent = [currentSession.username, currentSession.email].filter(Boolean).join(" · ");
    $("accountRole").textContent = currentSession.roleLabel;
    $("userAdminSection").hidden = !canManageUsers();
    $("accountModal").hidden = false;
    if (canManageUsers()) loadUsers();
    refreshIcons();
  }

  function closeAccountModal() { $("accountModal").hidden = true; }

  async function loadUsers() {
    const list = $("userList");
    list.innerHTML = `<div class="user-list-loading">正在读取账号...</div>`;
    try {
      const { users } = await authApi("admin/users");
      list.innerHTML = users.map((user) => {
        const self = user.id === currentSession.id;
        const statusLabel = user.status === "active" ? "已启用" : user.status === "pending" ? "待批准" : "已停用";
        return `<article class="user-row" data-user-id="${escapeHtml(user.id)}">
          <div class="user-identity"><strong>${escapeHtml(user.displayName)}</strong><span>${escapeHtml(user.username)} · ${escapeHtml(user.email)}</span><small><i class="user-status ${escapeHtml(user.status)}"></i>${statusLabel}${user.resetRequests ? ` · <b>${user.resetRequests} 个重置申请</b>` : ""}${self ? " · 当前账号" : ""}</small></div>
          <label><span>角色</span><select data-user-role ${self ? "disabled" : ""}><option value="viewer" ${user.role === "viewer" ? "selected" : ""}>只读人员</option><option value="inventory_manager" ${user.role === "inventory_manager" ? "selected" : ""}>库存管理员</option><option value="product_editor" ${user.role === "product_editor" ? "selected" : ""}>商品编辑</option><option value="admin" ${user.role === "admin" ? "selected" : ""}>管理员</option></select></label>
          <label><span>状态</span><select data-user-status ${self ? "disabled" : ""}><option value="pending" ${user.status === "pending" ? "selected" : ""}>待批准</option><option value="active" ${user.status === "active" ? "selected" : ""}>已启用</option><option value="disabled" ${user.status === "disabled" ? "selected" : ""}>已停用</option></select></label>
          <div class="user-actions"><button class="button secondary" data-save-user type="button" ${self ? "disabled" : ""}>保存</button><button class="button secondary" data-reset-user type="button">重置密码</button></div>
        </article>`;
      }).join("") || `<div class="user-list-loading">暂无账号</div>`;
    } catch (error) {
      list.innerHTML = `<div class="user-list-loading error">${escapeHtml(error.message)}</div>`;
    }
  }

  async function saveUserAccess(row) {
    const button = row.querySelector("[data-save-user]");
    button.disabled = true;
    try {
      await authApi(`admin/users/${encodeURIComponent(row.dataset.userId)}`, { method: "PATCH", body: JSON.stringify({ role: row.querySelector("[data-user-role]").value, status: row.querySelector("[data-user-status]").value }) });
      showToast("账号权限已更新");
      await loadUsers();
    } catch (error) { showToast(error.message); }
    finally { button.disabled = false; }
  }

  async function resetUserPassword(row) {
    const button = row.querySelector("[data-reset-user]");
    button.disabled = true;
    try {
      const result = await authApi(`admin/users/${encodeURIComponent(row.dataset.userId)}/reset-password`, { method: "POST", body: "{}" });
      $("temporaryPasswordValue").textContent = result.temporaryPassword;
      $("temporaryPasswordModal").hidden = false;
      await loadUsers();
      refreshIcons();
    } catch (error) { showToast(error.message); }
    finally { button.disabled = false; }
  }

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
    if ($("bundleSearch")) $("bundleSearch").placeholder = currentLang === "zh" ? "搜索套装、SKU、组件或颜色" : "Search bundle, SKU, component, or color";
    if ($("movementSkuSearch")) $("movementSkuSearch").placeholder = currentLang === "zh" ? "输入 SKU、款号或商品名称" : "Enter SKU, style, or product name";
    if ($("skuYear") && $("skuFabric")) renderSpuOptionSelectors($("skuYear").value, $("skuFabric").value);
    if ($("bundleSeason") && $("bundleColor")) renderBundleOptionSelectors($("bundleSeason").value, $("bundleColor").value);
    [1, 2, 3].forEach((index) => {
      const search = $(`bundleComponentSearch${index}`);
      if (search) search.placeholder = currentLang === "zh" ? "输入款号、名称或颜色检索" : "Search style, name, or color";
      const clear = document.querySelector(`[data-clear-component="${index}"]`);
      if (clear) clear.title = currentLang === "zh" ? "清除组件" : "Clear component";
    });
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
      const cls = qty === 0 ? "empty" : isLowSkuQuantity(qty) ? "low" : "";
      return `<div class="size-stock ${cls}" title="${size} 码：${qty} 件"><div><span>${size}</span><strong>${qty}</strong></div></div>`;
    }).join("")}</div>`;
  }

  function productCell(product) {
    const missingImageTitle = product.imageName || product.imagePath ? `图片记录：${product.imageName || product.imagePath}，等待源文件同步` : "CoZ 暂未提供商品图片";
    const image = product.image
      ? `<button class="product-image-button" type="button" data-image-preview data-image-src="${escapeHtml(product.image)}" data-image-name="${escapeHtml(product.name)}" data-image-sku="${escapeHtml(product.baseSku)}" title="双击查看大图" aria-label="查看 ${escapeHtml(product.name)} 大图"><img class="product-thumb" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)} 商品图片"></button>`
      : `<span class="product-image-placeholder" title="${missingImageTitle}"><i data-lucide="image-off"></i></span>`;
    return `<div class="product-cell">${image}<div><strong>${escapeHtml(product.name)}</strong><code>${escapeHtml(product.baseSku)}</code></div></div>`;
  }

  function statusBadge(product) {
    const status = productStockStatus(product);
    return `<span class="status ${status.className}">${status.label}</span>`;
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
    if (!names.length) return currentLang === "zh" ? "当前所有 SKU 库存均高于 5 件。" : "All SKUs have more than 5 units in stock.";
    const listed = names.slice(0, 2).join(currentLang === "zh" ? "、" : ", ");
    const more = names.length > 2 ? (currentLang === "zh" ? "等款式" : " and other styles") : "";
    return currentLang === "zh"
      ? `${listed}${more}的部分尺码库存小于等于 5 件。`
      : `${listed}${more}: some size SKUs have 5 units or fewer.`;
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
    const term = $("inventorySearch").value.trim();
    const category = $("categoryFilter").value;
    const status = $("statusFilter").value;
    return state.products.filter((product) => {
      const matchesTerm = matchesProductSearch(product, term);
      const matchesCategory = !category || product.category === category;
      const matchesStatus = !status || productStockStatus(product).className === status;
      return matchesTerm && matchesCategory && matchesStatus;
    });
  }

  function renderInventory() {
    const products = getFilteredProducts();
    $("resultCount").textContent = products.reduce((sum, product) => sum + Object.keys(product.sizes).length, 0);
    $("resultAvailable").textContent = formatNumber(products.reduce((sum, product) => sum + availableStock(product), 0));
    $("inventoryRows").innerHTML = products.map((product) => {
      const cozProduct = isCozProduct(product);
      return `
      <tr>
        <td>${productCell(product)}</td>
        <td class="color-cell">${colorSwatch(product)}${escapeHtml(product.color)}</td>
        <td>${renderSizeBand(product)}</td>
        <td class="num" title="${cozProduct ? "CoZ 总库存" : "仓库库存"}">${formatNumber(product.warehouse)}</td>
        <td class="num">${cozProduct ? "--" : formatNumber(product.store)}</td>
        <td class="num">${cozProduct && !product.reservedReported ? "--" : formatNumber(product.reserved)}</td>
        <td class="num"><span class="stock-number">${formatNumber(availableStock(product))}</span></td>
        <td>${statusBadge(product)}</td>
        <td><div class="row-actions">${canManageCatalog() ? `<button class="row-action" data-edit-product="${product.id}" type="button" title="编辑 SPU 和 SKU" aria-label="编辑 SPU 和 SKU"><i data-lucide="pencil"></i></button>` : ""}${canManageMovements() ? `<button class="row-action" data-move-product="${product.id}" type="button" title="调整库存" aria-label="调整库存"><i data-lucide="arrow-left-right"></i></button>` : ""}${canManageCatalog() ? `<button class="row-action danger" data-trash-product="${product.id}" type="button" title="删除款式" aria-label="删除款式"><i data-lucide="trash-2"></i></button>` : ""}</div></td>
      </tr>`;
    }).join("");
    $("inventoryEmpty").hidden = products.length > 0;
  }

  function matchesProductSearch(product, query = "") {
    const terms = String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return true;
    const visible = [product.name, product.baseSku, product.sourceBaseSku, product.style, product.originalStyle, product.color,
      ...Object.values(product.skuBySize || {})].join(" ").toLowerCase();
    const rawSourceSkus = Object.values(product.sourceSkuBySize || {}).join(" ").toLowerCase();
    return terms.every((term) => visible.includes(term) || (/^\d{8,}$/.test(term) && rawSourceSkus.includes(term)));
  }
  function inventorySearchMatches(query = "") {
    return state.products.filter((product) => {
      return matchesProductSearch(product, query);
    }).slice(0, 30);
  }
  function renderInventorySearchResults(query = "") {
    const results = $("inventorySearchResults");
    const matches = inventorySearchMatches(query);
    results.innerHTML = matches.length
      ? matches.map((product, index) => `<button class="inventory-search-result${index === 0 ? " active" : ""}" type="button" role="option" data-inventory-search-id="${escapeHtml(product.id)}"><strong>${escapeHtml(product.baseSku)}</strong><span>${escapeHtml(product.name)} · ${escapeHtml(product.color)} · ${escapeHtml(orderedSizes(product).join("/"))}</span></button>`).join("")
      : `<div class="component-result-empty">${currentLang === "zh" ? "没有匹配的商品" : "No matching products"}</div>`;
    results.hidden = false;
    $("inventorySearch").setAttribute("aria-expanded", "true");
  }
  function closeInventorySearchResults() {
    $("inventorySearchResults").hidden = true;
    $("inventorySearch").setAttribute("aria-expanded", "false");
  }
  function selectInventorySearchProduct(productId) {
    const product = state.products.find((item) => item.id === productId);
    if (!product) return;
    $("inventorySearch").value = product.baseSku;
    closeInventorySearchResults();
    renderInventory();
  }

  function bundleComponentLabel(product) {
    return `${product.baseSku} · ${product.name} · ${product.color} · ${orderedSizes(product).join("/")}`;
  }

  function renderBundleComponentOptions() {
    [1, 2, 3].forEach((index) => clearBundleComponent(index, false));
  }

  function matchingBundleComponents(query) {
    const terms = String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    return state.products.filter((product) => {
      const searchable = [product.baseSku, product.sourceBaseSku, product.style, product.originalStyle, product.name, product.color, ...orderedSizes(product), ...Object.values(product.skuBySize || {}), ...Object.values(product.sourceSkuBySize || {})].join(" ").toLowerCase();
      return terms.every((term) => searchable.includes(term));
    }).slice(0, 40);
  }

  function renderBundleComponentResults(index, query = "") {
    const results = $(`bundleComponentResults${index}`);
    const matches = matchingBundleComponents(query);
    results.innerHTML = matches.length
      ? matches.map((product, resultIndex) => `<button class="component-result${resultIndex === 0 ? " active" : ""}" type="button" role="option" data-component-index="${index}" data-component-id="${escapeHtml(product.id)}"><strong>${escapeHtml(product.baseSku)}</strong><span>${escapeHtml(product.name)} · ${escapeHtml(product.color)} · ${escapeHtml(orderedSizes(product).join("/"))}</span></button>`).join("")
      : `<div class="component-result-empty">${currentLang === "zh" ? "没有匹配的组件" : "No matching components"}</div>`;
    results.hidden = false;
    $(`bundleComponentSearch${index}`).setAttribute("aria-expanded", "true");
  }

  function closeBundleComponentResults(index) {
    const results = $(`bundleComponentResults${index}`);
    results.hidden = true;
    $(`bundleComponentSearch${index}`).setAttribute("aria-expanded", "false");
  }

  function selectBundleComponent(index, productId) {
    const product = state.products.find((item) => item.id === productId);
    if (!product) return;
    $(`bundleComponent${index}`).value = product.id;
    $(`bundleComponentSearch${index}`).value = bundleComponentLabel(product);
    document.querySelector(`[data-component-picker="${index}"]`).classList.add("has-value");
    closeBundleComponentResults(index);
    updateBundleComponentCode(index);
  }

  function clearBundleComponent(index, updatePreview = true) {
    $(`bundleComponent${index}`).value = "";
    $(`bundleComponentSearch${index}`).value = "";
    document.querySelector(`[data-component-picker="${index}"]`).classList.remove("has-value");
    closeBundleComponentResults(index);
    if (updatePreview) updateBundleComponentCode(index);
  }

  function handleBundleComponentKeydown(index, event) {
    const results = $(`bundleComponentResults${index}`);
    if (event.key === "Escape") {
      closeBundleComponentResults(index);
      return;
    }
    if (results.hidden && ["ArrowDown", "Enter"].includes(event.key)) renderBundleComponentResults(index, event.currentTarget.value);
    const options = [...results.querySelectorAll(".component-result")];
    const current = options.findIndex((option) => option.classList.contains("active"));
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = event.key === "ArrowDown" ? Math.min(options.length - 1, current + 1) : Math.max(0, current - 1);
      options.forEach((option, optionIndex) => option.classList.toggle("active", optionIndex === next));
      options[next]?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter") {
      const active = results.querySelector(".component-result.active") || options[0];
      if (active) {
        event.preventDefault();
        selectBundleComponent(index, active.dataset.componentId);
      }
    }
  }

  function renderBundleOptionSelectors(selectedSeason, selectedColor) {
    const knownSeasons = [...new Set([...bundleSeasons, ...(state.bundles || []).map((bundle) => bundle.season)].filter(Boolean))];
    const knownColors = [...new Set([...bundleColors, ...(state.bundles || []).map((bundle) => bundle.color), ...state.products.map((product) => product.color)].map((value) => String(value || "").trim()).filter(Boolean))];
    $("bundleSeason").innerHTML = knownSeasons.map((season) => `<option value="${escapeHtml(season)}">${escapeHtml(season)}</option>`).join("");
    $("bundleColor").innerHTML = `<option value="">${currentLang === "zh" ? "请选择颜色" : "Select color"}</option>${knownColors.map((color) => `<option value="${escapeHtml(color)}">${escapeHtml(color)}</option>`).join("")}`;
    if (selectedSeason && knownSeasons.includes(selectedSeason)) $("bundleSeason").value = selectedSeason;
    if (selectedColor && knownColors.includes(selectedColor)) $("bundleColor").value = selectedColor;
  }

  function renderBundleSkuPreview() {
    const componentEntries = [1, 2, 3].map((index) => ({
      id: $(`bundleComponent${index}`).value,
      code: $(`bundleCode${index}`).value
    })).filter((entry) => entry.id);
    const editingBundle = (state.bundles || []).find((bundle) => bundle.id === $("editingBundleId").value);
    const selectedColor = $("bundleColor").value;
    const draft = {
      type: $("bundleType").value,
      season: $("bundleSeason").value,
      color: selectedColor,
      colorCode: editingBundle?.color === selectedColor
        ? editingBundle.colorCode
        : colorMappings[selectedColor],
      size: $("bundleSize").value,
      fixedSku: $("bundleFixedSku").value,
      components: componentEntries.map((entry) => entry.id),
      componentCodes: componentEntries.map((entry) => entry.code)
    };
    $("bundleSkuPreview").textContent = bundleSku(draft);
  }

  function updateBundleComponentCode(componentIndex) {
    const productId = $(`bundleComponent${componentIndex}`).value;
    const codeInput = $(`bundleCode${componentIndex}`);
    const previousAutoCode = codeInput.dataset.autoCode || "";
    const product = state.products.find((item) => item.id === productId);
    const nextAutoCode = product ? bundleTail(product.baseSku) : "";
    if (!codeInput.value || codeInput.value === previousAutoCode) codeInput.value = nextAutoCode;
    codeInput.dataset.autoCode = nextAutoCode;
    renderBundleSkuPreview();
  }

  function bundleSearchText(bundle) {
    const records = bundlePartRecords(bundle);
    return [bundle.name, bundleSku(bundle), bundle.color, bundle.size, bundle.season,
      ...(bundle.componentCodes || []), ...(bundle.componentSkus || []), ...(bundle.componentSourceSkus || []),
      ...records.flatMap(({ product }) => [product.name, product.baseSku, product.sourceBaseSku])].join(" ").toLowerCase();
  }
  function matchesBundleSearch(bundle, query = "") {
    const terms = String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return true;
    const searchable = bundleSearchText(bundle);
    return terms.every((term) => searchable.includes(term));
  }
  function bundleSearchMatches(query = "") {
    return (state.bundles || []).filter((bundle) => matchesBundleSearch(bundle, query)).slice(0, 30);
  }
  function renderBundleSearchResults(query = "") {
    const results = $("bundleSearchResults");
    const matches = bundleSearchMatches(query);
    results.innerHTML = matches.length
      ? matches.map((bundle, index) => `<button class="inventory-search-result${index === 0 ? " active" : ""}" type="button" role="option" data-bundle-search-id="${escapeHtml(bundle.id)}"><strong>${escapeHtml(bundleSku(bundle))}</strong><span>${escapeHtml(bundle.name)} · ${escapeHtml(bundle.color || "-")} / ${escapeHtml(bundle.size || "-")}</span></button>`).join("")
      : `<div class="component-result-empty">${currentLang === "zh" ? "没有匹配的套装" : "No matching bundles"}</div>`;
    results.hidden = false;
    $("bundleSearch").setAttribute("aria-expanded", "true");
  }
  function closeBundleSearchResults() {
    $("bundleSearchResults").hidden = true;
    $("bundleSearch").setAttribute("aria-expanded", "false");
  }
  function selectBundleSearchResult(bundleId) {
    const bundle = (state.bundles || []).find((item) => item.id === bundleId);
    if (!bundle) return;
    $("bundleSearch").value = bundleSku(bundle);
    closeBundleSearchResults();
    renderBundleRows();
  }

  function renderBundleRows() {
    const allBundles = Array.isArray(state.bundles) ? state.bundles : [];
    const term = String($("bundleSearch").value || "").trim().toLowerCase();
    const type = $("bundleTypeFilter").value;
    const size = $("bundleSizeFilter").value;
    const status = $("bundleStatusFilter").value;
    const bundles = allBundles.filter((bundle) => {
      const available = bundleAvailable(bundle);
      return matchesBundleSearch(bundle, term)
        && (!type || bundle.type === type)
        && (!size || bundle.size === size)
        && (!status
          || (status === "healthy" && available > 5)
          || (status === "low" && available > 0 && available <= 5)
          || (status === "unavailable" && available <= 0));
    });
    $("bundleCount").textContent = bundles.length;
    $("bundleAvailable").textContent = formatNumber(bundles.reduce((sum, bundle) => sum + bundleAvailable(bundle), 0));
    $("bundleRows").innerHTML = bundles.map((bundle) => {
      const partRecords = bundlePartRecords(bundle);
      const parts = partRecords.map(({ product }) => product);
      const available = bundleAvailable(bundle);
      const sku = bundleSku(bundle);
      const inventoryStatus = stockStatus(available);
      return `<tr>
        <td><strong>${escapeHtml(bundle.name)}</strong><code class="bundle-code">${escapeHtml(sku)}</code></td>
        <td><span class="bundle-type ${escapeHtml(bundle.type)}">${escapeHtml(bundleTypeLabel(bundle.type))}</span></td>
        <td><div class="bundle-parts">${partRecords.map(({ product, index }) => `<span class="bundle-part">${escapeHtml(product.name)}<code>${escapeHtml(bundle.componentCodes?.[index] || bundleTail(product.baseSku))}</code></span>`).join("") || "<span>-</span>"}</div></td>
        <td>${escapeHtml(bundle.color || "跟随组件")} / ${escapeHtml(bundle.size || "跟随组件")}</td>
        <td class="num"><span class="stock-number">${formatNumber(available)}</span></td>
        <td><span class="status ${inventoryStatus.className}">${inventoryStatus.label}</span></td>
        <td><div class="row-actions">${canManageCatalog() ? `<button class="row-action" type="button" data-edit-bundle="${escapeHtml(bundle.id)}" title="编辑套装" aria-label="编辑套装"><i data-lucide="pencil"></i></button><button class="row-action danger" type="button" data-delete-bundle="${escapeHtml(bundle.id)}" title="删除套装" aria-label="删除套装"><i data-lucide="trash-2"></i></button>` : ""}</div></td>
      </tr>`;
    }).join("");
    $("bundleEmpty").hidden = bundles.length > 0;
    if (!bundles.length) {
      const filtered = Boolean(term || type || size || status);
      $("bundleEmpty").querySelector("strong").textContent = filtered ? "没有匹配的套装" : "还没有套装";
      $("bundleEmpty").querySelector("p").textContent = filtered ? "请调整搜索词或筛选条件。" : "新建虚拟套装后，系统会按组件库存实时计算可售套数。";
    }
  }

  function renderBundleFilters() {
    const selections = {
      type: $("bundleTypeFilter").value,
      size: $("bundleSizeFilter").value,
      status: $("bundleStatusFilter").value
    };
    const sizes = [...new Set((state.bundles || []).map((bundle) => bundle.size).filter(Boolean))]
      .sort((a, b) => sizeOrder.indexOf(a) - sizeOrder.indexOf(b));
    $("bundleTypeFilter").innerHTML = `<option value="">${currentLang === "zh" ? "全部类型" : "All types"}</option>`
      + ["virtual", "promo", "fixed"].map((type) => `<option value="${type}">${escapeHtml(bundleTypeLabel(type))}</option>`).join("");
    $("bundleSizeFilter").innerHTML = `<option value="">${currentLang === "zh" ? "全部尺码" : "All sizes"}</option>`
      + sizes.map((size) => `<option value="${escapeHtml(size)}">${escapeHtml(size)}</option>`).join("");
    $("bundleStatusFilter").innerHTML = `<option value="">${currentLang === "zh" ? "全部状态" : "All statuses"}</option><option value="healthy">${currentLang === "zh" ? "库存正常" : "Healthy"}</option><option value="low">${currentLang === "zh" ? "低库存（≤5）" : "Low stock (≤5)"}</option><option value="unavailable">${currentLang === "zh" ? "不可售" : "Unavailable"}</option>`;
    $("bundleTypeFilter").value = selections.type;
    $("bundleSizeFilter").value = selections.size;
    $("bundleStatusFilter").value = selections.status;
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
        <td class="movement-admin-column"><div class="row-actions"><button class="row-action" type="button" data-edit-movement="${escapeHtml(movement.id)}" title="编辑流水" aria-label="编辑流水"><i data-lucide="pencil"></i></button><button class="row-action danger" type="button" data-delete-movement="${escapeHtml(movement.id)}" title="删除流水" aria-label="删除流水"><i data-lucide="trash-2"></i></button></div></td>
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
    $("categoryFilter").innerHTML = `<option value="">${currentLang === "zh" ? "全部品类" : "All categories"}</option>` + categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(itemTypeLabel(category))}</option>`).join("");
    $("categoryFilter").value = selected;
  }

  function renderSkuCategoryOptions(selectedCategory) {
    const select = $("skuCategory");
    const selected = selectedCategory || select.value;
    select.innerHTML = Object.keys(itemTypeCodes).map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(itemTypeCatalogLabel(name))}</option>`).join("");
    if ([...select.options].some((option) => option.value === selected)) select.value = selected;
  }

  function renderSpuOptionSelectors(selectedYear, selectedFabric) {
    $("skuYear").innerHTML = spuYears.map((year) => `<option value="${year}">${year}</option>`).join("");
    $("skuFabric").innerHTML = Object.entries(fabricTypeCodes).map(([name, code]) => {
      const label = currentLang === "zh"
        ? (name === "Woven" ? "Woven · 梭织" : name === "Knit" ? "Knit · 针织" : `${name} · ${code}`)
        : `${name} · ${code}`;
      return `<option value="${escapeHtml(code)}">${escapeHtml(label)}</option>`;
    }).join("");
    if (selectedYear && [...$("skuYear").options].some((option) => option.value === String(selectedYear))) $("skuYear").value = String(selectedYear);
    if (selectedFabric && [...$("skuFabric").options].some((option) => option.value === selectedFabric)) $("skuFabric").value = selectedFabric;
  }

  function matchingColors(query = "") {
    const term = String(query).trim().toLowerCase();
    return Object.entries(colorMappings).filter(([color, code]) => !term || `${color} ${code}`.toLowerCase().includes(term)).slice(0, 40);
  }
  function renderColorResults(query = "") {
    const results = $("skuColorResults");
    const matches = matchingColors(query);
    results.innerHTML = matches.length
      ? matches.map(([color, code], index) => `<button class="color-result${index === 0 ? " active" : ""}" type="button" role="option" data-color-name="${escapeHtml(color)}" data-color-code="${escapeHtml(code)}"><span>${escapeHtml(color)}</span><code>${escapeHtml(code)}</code></button>`).join("")
      : `<div class="color-result-empty">${currentLang === "zh" ? "没有匹配颜色，可点击“添加颜色”创建" : "No matching color. Use Add color to create one."}</div>`;
    results.hidden = false;
    $("skuColor").setAttribute("aria-expanded", "true");
  }
  function closeColorResults() {
    $("skuColorResults").hidden = true;
    $("skuColor").setAttribute("aria-expanded", "false");
  }
  function selectMappedColor(color, code) {
    $("skuColor").value = color;
    $("skuColorCode").value = code;
    renderColorCodeNotice([]);
    closeColorResults();
    updateGeneratedSkuCodes();
  }
  function parsedSkuColorCode(product, sku, size) {
    const prefix = `${String(product?.baseSku || "")}-`;
    const suffix = `-${size}`;
    const value = String(sku || "");
    return value.startsWith(prefix) && value.endsWith(suffix) && value.length > prefix.length + suffix.length
      ? value.slice(prefix.length, -suffix.length).trim().toUpperCase()
      : "";
  }
  function colorCodeCandidates(productOrColor) {
    const color = String(typeof productOrColor === "string" ? productOrColor : productOrColor?.color || "").trim();
    if (!color) return [];
    const candidates = new Set();
    const add = (value) => {
      const code = String(value || "").trim().toUpperCase();
      if (/^[A-Z0-9]{1,5}$/.test(code)) candidates.add(code);
    };
    add(colorMappings[color]);
    state.products.filter((product) => String(product.color || "").trim().toLowerCase() === color.toLowerCase()).forEach((product) => {
      add(product.colorCode);
      Object.entries(product.skuBySize || {}).forEach(([size, sku]) => add(parsedSkuColorCode(product, sku, size)));
    });
    if (typeof productOrColor === "object") {
      add(productOrColor.colorCode);
      Object.entries(productOrColor.skuBySize || {}).forEach(([size, sku]) => add(parsedSkuColorCode(productOrColor, sku, size)));
    }
    return [...candidates].sort();
  }
  function renderColorCodeNotice(candidates, color = $("skuColor").value.trim()) {
    const notice = $("colorCodeNotice");
    if (!candidates.length) {
      notice.hidden = true;
      notice.textContent = "";
      return;
    }
    notice.hidden = false;
    notice.classList.toggle("conflict", candidates.length > 1);
    notice.textContent = candidates.length > 1
      ? `颜色“${color}”存在多个颜色代码：${candidates.join("、")}。系统暂不填写，请确认后手动选择。`
      : `已根据颜色“${color}”自动使用颜色代码 ${candidates[0]}。`;
  }
  function applyColorCodeCandidates(productOrColor) {
    const candidates = colorCodeCandidates(productOrColor);
    $("skuColorCode").value = candidates.length === 1 ? candidates[0] : "";
    renderColorCodeNotice(candidates);
    updateGeneratedSkuCodes();
    return candidates;
  }
  function applyExactColorMapping() {
    const value = $("skuColor").value.trim().toLowerCase();
    const entry = Object.entries(colorMappings).find(([color]) => color.toLowerCase() === value);
    if (entry) applyColorCodeCandidates(entry[0]);
    else {
      $("skuColorCode").value = "";
      renderColorCodeNotice([]);
      updateGeneratedSkuCodes();
    }
  }
  function openSkuColorCreator() {
    $("skuColorCreator").hidden = false;
    $("addSkuColorBtn").setAttribute("aria-expanded", "true");
    closeColorResults();
    $("newSkuColor").value = $("skuColor").value.trim();
    setTimeout(() => $("newSkuColor").focus(), 20);
  }
  function closeSkuColorCreator() {
    $("skuColorCreator").hidden = true;
    $("addSkuColorBtn").setAttribute("aria-expanded", "false");
    $("newSkuColor").value = "";
    $("newSkuColorCode").value = "";
  }
  function addSkuColorMapping() {
    const color = $("newSkuColor").value.trim();
    const code = $("newSkuColorCode").value.trim().toUpperCase();
    if (!color || !/^[A-Z0-9]{1,5}$/.test(code)) {
      showToast("请输入颜色名称和 1 至 5 位英文或数字代码");
      return;
    }
    const sameColor = Object.keys(colorMappings).find((value) => value.toLowerCase() === color.toLowerCase());
    const sameCode = Object.entries(colorMappings).find(([, value]) => value === code);
    if (sameColor && colorMappings[sameColor] !== code) {
      showToast(`${sameColor} 已对应 ${colorMappings[sameColor]}`);
      return;
    }
    if (sameCode && sameCode[0].toLowerCase() !== color.toLowerCase()) {
      showToast(`颜色代码 ${code} 已对应 ${sameCode[0]}`);
      return;
    }
    colorMappings[color] = code;
    saveColorMappings();
    selectMappedColor(color, code);
    closeSkuColorCreator();
    showToast(`颜色 ${color} · ${code} 已添加`);
  }

  function renderSyncState() {
    const node = document.querySelector(".sync-state");
    if (!node) return;
    node.dataset.status = cloudStatus;
    const labels = currentLang === "zh"
      ? localApiEnabled
        ? { connecting: "正在连接服务器", syncing: "正在同步服务器", synced: "服务器已同步", ready: "服务器已连接，等待库存", error: "服务器同步暂时失败，正在重试", local: "数据已保存到本机" }
        : { connecting: "正在连接云端", syncing: "正在同步云端", synced: "云端已同步", ready: "云端已连接，等待库存", error: "云端同步暂时失败，正在重试", local: "数据已保存到本机" }
      : localApiEnabled
        ? { connecting: "Connecting to server", syncing: "Syncing to server", synced: "Server synced", ready: "Server connected, waiting for inventory", error: "Server sync temporarily failed; retrying", local: "Saved locally" }
        : { connecting: "Connecting to cloud", syncing: "Syncing to cloud", synced: "Cloud synced", ready: "Cloud connected, waiting for inventory", error: "Cloud sync temporarily failed; retrying", local: "Saved locally" };
    let detail = "";
    if (cloudStatus === "synced" && cloudUpdatedAt) {
      const time = new Date(cloudUpdatedAt).toLocaleTimeString(currentLang === "zh" ? "zh-CN" : "en", { hour: "2-digit", minute: "2-digit" });
      detail = ` · ${escapeHtml(time)}`;
    }
    node.innerHTML = `<span></span> ${labels[cloudStatus] || labels.local}${detail}`;
    node.title = cloudStatus === "error" && cloudLastError
      ? cloudLastError
      : state.source?.type === "coz"
      ? `${currentLang === "zh" ? "CoZ 实时库存" : "CoZ live inventory"} · ${formatNumber(state.source.skuCount)} SKU`
      : labels[cloudStatus] || labels.local;
  }

  function movementSkuEntries() {
    const products = state.products.flatMap((product) => orderedSizes(product).map((size) => {
      const sku = skuForSize(product, size);
      const sourceSku = product.sourceSkuBySize?.[size] || "";
      return {
        value: `product|${product.id}|${size}`,
        label: sku,
        meta: `${product.name} · ${product.color} · ${size}`,
        searchable: [sku, product.baseSku, product.sourceBaseSku, product.style, product.originalStyle, product.name, product.color, size].join(" ").toLowerCase(),
        sourceSku: String(sourceSku).toLowerCase()
      };
    }));
    const bundles = (state.bundles || []).map((bundle) => ({
      value: `bundle|${bundle.id}|${bundle.size || "F"}`,
      label: bundleSku(bundle),
      meta: `[套装] ${bundle.name} · ${bundle.color || "-"} / ${bundle.size || "-"}`,
      searchable: bundleSearchText(bundle),
      sourceSku: ""
    }));
    return [...products, ...bundles];
  }
  function matchingMovementSkus(query = "") {
    const terms = String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    return movementSkuEntries().filter((entry) => terms.every((term) => entry.searchable.includes(term) || (/^\d{8,}$/.test(term) && entry.sourceSku.includes(term)))).slice(0, 40);
  }
  function renderMovementSkuResults(query = "") {
    const results = $("movementSkuResults");
    const matches = matchingMovementSkus(query);
    results.innerHTML = matches.length
      ? matches.map((entry, index) => `<button class="inventory-search-result${index === 0 ? " active" : ""}" type="button" role="option" data-movement-sku-value="${escapeHtml(entry.value)}"><strong>${escapeHtml(entry.label)}</strong><span>${escapeHtml(entry.meta)}</span></button>`).join("")
      : `<div class="component-result-empty">${currentLang === "zh" ? "没有匹配的 SKU" : "No matching SKUs"}</div>`;
    results.hidden = false;
    $("movementSkuSearch").setAttribute("aria-expanded", "true");
  }
  function closeMovementSkuResults() {
    $("movementSkuResults").hidden = true;
    $("movementSkuSearch").setAttribute("aria-expanded", "false");
  }
  function selectMovementSku(value) {
    const entry = movementSkuEntries().find((item) => item.value === value);
    if (!entry) return;
    $("movementSku").value = entry.value;
    $("movementSkuSearch").value = `${entry.label} · ${entry.meta}`;
    closeMovementSkuResults();
  }
  function locationById(id) {
    return stockLocations.find((location) => location.id === id) || stockLocations[0];
  }
  function renderMovementLocationOptions() {
    const current = $("movementLocation").value;
    $("movementLocation").innerHTML = stockLocations.map((location) => `<option value="${escapeHtml(location.id)}">${escapeHtml(location.name)}</option>`).join("");
    if (stockLocations.some((location) => location.id === current)) $("movementLocation").value = current;
  }
  function ensureLocationStock(record, fixedBundle = false) {
    if (!record.locationStock || typeof record.locationStock !== "object") {
      record.locationStock = fixedBundle
        ? { warehouse: Number(record.fixedStock || 0), store: 0 }
        : { warehouse: Number(record.warehouse || 0), store: Number(record.store || 0) };
    }
    return record.locationStock;
  }
  function locationStockValue(record, locationId, fixedBundle = false) {
    if (record.locationStock && Number.isFinite(Number(record.locationStock[locationId]))) return Number(record.locationStock[locationId]);
    if (locationId === "warehouse") return Number(fixedBundle ? record.fixedStock : record.warehouse || 0);
    if (locationId === "store") return Number(fixedBundle ? 0 : record.store || 0);
    return 0;
  }
  function recalculateLocationTotals(record, fixedBundle = false) {
    const locationStock = ensureLocationStock(record, fixedBundle);
    if (fixedBundle) {
      record.fixedStock = stockLocations.reduce((sum, location) => sum + Number(locationStock[location.id] || 0), 0);
      return;
    }
    record.warehouse = stockLocations.filter((location) => location.type === "warehouse").reduce((sum, location) => sum + Number(locationStock[location.id] || 0), 0);
    record.store = stockLocations.filter((location) => location.type === "store").reduce((sum, location) => sum + Number(locationStock[location.id] || 0), 0);
  }
  function adjustLocationStock(record, locationId, quantity, fixedBundle = false) {
    const locationStock = ensureLocationStock(record, fixedBundle);
    locationStock[locationId] = Math.max(0, Number(locationStock[locationId] || 0) + Number(quantity || 0));
    recalculateLocationTotals(record, fixedBundle);
  }
  function openLocationEditor(mode) {
    if (!canManageMovements()) return;
    const editing = mode === "edit" ? locationById($("movementLocation").value) : null;
    $("locationEditorId").value = editing?.id || "";
    $("locationEditorTitle").textContent = editing ? "修改现有库位" : "添加库位";
    $("newLocationName").value = editing?.name || "";
    $("newLocationType").value = editing?.type || "warehouse";
    $("newLocationType").disabled = Boolean(editing && ["warehouse", "store"].includes(editing.id));
    $("locationEditor").hidden = false;
    setTimeout(() => $("newLocationName").focus(), 20);
  }
  function closeLocationEditor() {
    $("locationEditor").hidden = true;
    $("locationEditorId").value = "";
  }
  function saveLocation() {
    if (!canManageMovements()) {
      showToast("当前账号没有库存操作权限");
      return;
    }
    const id = $("locationEditorId").value;
    const name = $("newLocationName").value.trim();
    if (!name) {
      showToast("请输入库位名称");
      return;
    }
    const duplicate = stockLocations.find((location) => location.id !== id && location.name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
      showToast("该库位名称已存在");
      return;
    }
    let selectedId = id;
    if (id) {
      const location = locationById(id);
      const previousType = location.type;
      location.name = name;
      if (!["warehouse", "store"].includes(id)) location.type = $("newLocationType").value;
      if (location.type !== previousType) {
        state.products.filter((product) => product.locationStock).forEach((product) => recalculateLocationTotals(product));
        (state.bundles || []).filter((bundle) => bundle.type === "fixed" && bundle.locationStock).forEach((bundle) => recalculateLocationTotals(bundle, true));
      }
    } else {
      selectedId = `location-${Date.now().toString(36)}`;
      stockLocations.push({ id: selectedId, name, type: $("newLocationType").value });
    }
    saveStockLocations();
    saveState();
    renderMovementLocationOptions();
    $("movementLocation").value = selectedId;
    closeLocationEditor();
    applyLanguage();
    showToast(id ? "库位已修改" : "库位已添加");
  }

  function renderAll() {
    renderSession();
    renderCategoryOptions();
    renderSkuCategoryOptions();
    renderBundleFilters();
    renderMovementLocationOptions();
    renderOverview();
    renderInventory();
    renderTrash();
    renderBundleRows();
    renderMovements();
    renderChannels();
    renderSyncState();
    refreshIcons();
    applyLanguage();
  }

  function renderTrash() {
    const products = state.trashProducts || [];
    const bundles = state.trashBundles || [];
    $("trashCount").textContent = products.length;
    $("bundleTrashCount").textContent = bundles.length;
    $("trashRows").innerHTML = products.map((product) => `<tr>
      <td>${productCell(product)}</td>
      <td class="color-cell">${colorSwatch(product)}${escapeHtml(product.color)}</td>
      <td>${escapeHtml(product.deletedAt ? new Date(product.deletedAt).toLocaleString("zh-CN", { hour12: false }) : "--")}</td>
      <td><div class="trash-actions"><button class="button secondary" type="button" data-restore-product="${escapeHtml(product.id)}"><i data-lucide="archive-restore"></i>恢复</button><button class="button danger" type="button" data-purge-product="${escapeHtml(product.id)}"><i data-lucide="trash-2"></i>彻底删除</button></div></td>
    </tr>`).join("");
    $("trashEmpty").hidden = products.length > 0;
    $("trashRows").closest(".table-wrap").hidden = products.length === 0;
    $("bundleTrashRows").innerHTML = bundles.map((bundle) => `<tr>
      <td><strong>${escapeHtml(bundle.name)}</strong><code class="bundle-code">${escapeHtml(bundleSku(bundle))}</code></td>
      <td>${escapeHtml(bundle.color || "跟随组件")} / ${escapeHtml(bundle.size || "跟随组件")}</td>
      <td>${escapeHtml(bundle.deletedAt ? new Date(bundle.deletedAt).toLocaleString("zh-CN", { hour12: false }) : "--")}</td>
      <td><div class="trash-actions"><button class="button secondary" type="button" data-restore-bundle="${escapeHtml(bundle.id)}"><i data-lucide="archive-restore"></i>恢复</button><button class="button danger" type="button" data-purge-bundle="${escapeHtml(bundle.id)}"><i data-lucide="trash-2"></i>彻底删除</button></div></td>
    </tr>`).join("");
    $("bundleTrashEmpty").hidden = bundles.length > 0;
    $("bundleTrashRows").closest(".table-wrap").hidden = bundles.length === 0;
  }

  function trashProduct(id) {
    const product = state.products.find((item) => item.id === id);
    if (!product) return;
    const linkedBundles = (state.bundles || []).filter((bundle) => (bundle.components || []).includes(id));
    const detail = linkedBundles.length ? `\n该款被 ${linkedBundles.length} 个套装引用，删除后这些套装将暂时不可售。` : "";
    if (!window.confirm(`确认删除款式 ${product.baseSku} · ${product.color}？${detail}\n删除后可在回收站恢复。`)) return;
    state.products = state.products.filter((item) => item.id !== id);
    state.deletedProductKeys = [...new Set([...(state.deletedProductKeys || []), productSourceKey(product)])];
    state.trashProducts = [{ ...clone(product), deletedAt: new Date().toISOString(), deletedSourceKey: productSourceKey(product) }, ...(state.trashProducts || []).filter((item) => item.id !== id)];
    saveState();
    renderAll();
    showToast(`款式 ${product.baseSku} 已移入回收站`);
  }

  function restoreProduct(id) {
    const product = (state.trashProducts || []).find((item) => item.id === id);
    if (!product) return;
    if (state.products.some((item) => item.id === id || productSourceKey(item) === productSourceKey(product))) {
      showToast("现有库存中已存在同款同色，无法直接恢复");
      return;
    }
    const restored = clone(product);
    delete restored.deletedAt;
    delete restored.deletedSourceKey;
    state.products.unshift(restored);
    state.trashProducts = state.trashProducts.filter((item) => item.id !== id);
    state.deletedProductKeys = (state.deletedProductKeys || []).filter((key) => key !== productSourceKey(restored));
    saveState();
    renderAll();
    showToast(`款式 ${restored.baseSku} 已恢复`);
  }

  function purgeProduct(id) {
    const product = (state.trashProducts || []).find((item) => item.id === id);
    if (!product || !window.confirm(`彻底删除 ${product.baseSku} · ${product.color}？此操作无法恢复。`)) return;
    state.trashProducts = state.trashProducts.filter((item) => item.id !== id);
    saveState();
    renderAll();
    showToast(`款式 ${product.baseSku} 已彻底删除`);
  }

  function openTrashModal() {
    renderTrash();
    $("trashModal").hidden = false;
    document.body.style.overflow = "hidden";
  }
  function openBundleTrashModal() {
    openTrashModal();
    setTimeout(() => $("bundleTrashSection").scrollIntoView({ block: "start", behavior: "smooth" }), 20);
  }
  function closeTrashModal() {
    $("trashModal").hidden = true;
    document.body.style.overflow = "";
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
    if (!canManageMovements()) {
      showToast("当前账号只有库存查看权限");
      return;
    }
    $("editingMovementId").value = "";
    $("movementModalTitle").textContent = "快速出入库";
    $("movementForm").querySelector('[type="submit"]').textContent = "确认入库";
    $("movementForm").reset();
    setMovementType("inbound");
    renderMovementLocationOptions();
    if (productId) {
      const product = state.products.find((item) => item.id === productId);
      const preferredSize = size || orderedSizes(product)[0] || "M";
      selectMovementSku(`product|${productId}|${preferredSize}`);
    } else {
      $("movementSku").value = "";
      $("movementSkuSearch").value = "";
    }
    $("movementModal").hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(() => {
      $("movementSkuSearch").focus();
      renderMovementSkuResults($("movementSkuSearch").value);
    }, 20);
  }

  function closeMovementModal() {
    $("movementModal").hidden = true;
    $("editingMovementId").value = "";
    closeMovementSkuResults();
    closeLocationEditor();
    document.body.style.overflow = "";
  }

  function renderSkuVariantRows(product = null) {
    const cozProduct = Boolean(product && isCozProduct(product));
    const sizes = [...new Set([...sizeOrder, ...Object.keys(product?.sizes || {}), ...Object.keys(product?.localSizes || {})])];
    $("variantStockHeading").textContent = "库存（只读）";
    $("variantSourceNote").hidden = !cozProduct;
    $("skuVariantRows").innerHTML = sizes.map((size) => {
      const sourceSynced = Boolean(cozProduct && product?.sourceSkuBySize?.[size]);
      const localSize = Boolean(cozProduct && product?.localSizes?.[size] != null && !sourceSynced);
      const checked = product ? sourceSynced || localSize || (!cozProduct && product.sizes?.[size] != null) : ["S", "M", "L"].includes(size);
      const stock = Number(localSize ? product.localSizes?.[size] : product?.sizes?.[size] || 0);
      const existingSku = product?.skuBySize?.[size];
      const colorCode = String($("skuColorCode").value || "").trim().toUpperCase();
      const generatedCodes = colorCodeCandidates(product);
      const isGeneratedSku = existingSku && generatedCodes.some((code) => existingSku === `${product.baseSku}-${code}-${size}`);
      const sku = existingSku && (!isGeneratedSku || generatedCodes.length <= 1)
        ? existingSku
        : (cozProduct && !colorCode ? "" : `${spuCodeFromForm()}-${colorCode || "COLOR"}-${size}`);
      const sourceSku = product?.sourceSkuBySize?.[size] || (cozProduct ? "本地新增" : "--");
      return `<div class="sku-variant-row" data-variant-size="${escapeHtml(size)}" ${cozProduct ? 'data-coz-product="true"' : ""} ${sourceSynced ? 'data-source-synced="true"' : ""}><input class="variant-enabled" type="checkbox" aria-label="启用 ${escapeHtml(size)} 码 SKU" ${checked ? "checked" : ""} ${sourceSynced ? "disabled" : ""}><span class="variant-size">${escapeHtml(size)}</span><input class="variant-stock" type="number" min="0" value="${stock}" aria-label="${escapeHtml(size)} 码库存（只读）" aria-readonly="true" disabled><input class="variant-source-sku" value="${escapeHtml(sourceSku)}" aria-label="${escapeHtml(size)} 码 CoZ 原始 SKU" disabled><input class="variant-sku" value="${escapeHtml(sku)}" ${existingSku && !isGeneratedSku ? 'data-manual="true"' : ""} aria-label="${escapeHtml(size)} 码品牌 SKU"></div>`;
    }).join("");
  }

  function updateGeneratedSkuCodes() {
    const colorCode = String($("skuColorCode").value || "").trim().toUpperCase();
    document.querySelectorAll("#skuVariantRows .sku-variant-row").forEach((row) => {
      const input = row.querySelector(".variant-sku");
      if (input.dataset.manual === "true") return;
      input.value = row.dataset.cozProduct === "true" && !colorCode
        ? ""
        : `${spuCodeFromForm()}-${colorCode || "COLOR"}-${row.dataset.variantSize}`;
    });
  }

  function inferColorCode(product) {
    const candidates = colorCodeCandidates(product);
    return candidates.length === 1 ? candidates[0] : "";
  }

  function setPendingSkuImage(value) {
    pendingSkuImage = safeImageUrl(value);
    if (pendingSkuImage) skuImageRemoved = false;
    const preview = $("skuImagePreview");
    const placeholder = $("skuImageDropzone").querySelector(".image-upload-placeholder");
    preview.src = pendingSkuImage || "";
    preview.hidden = !pendingSkuImage;
    placeholder.hidden = Boolean(pendingSkuImage);
    $("skuImageDropzone").classList.toggle("has-image", Boolean(pendingSkuImage));
    $("clearSkuImageBtn").hidden = !pendingSkuImage;
  }

  function skuForImageName(product = null) {
    const baseSku = String(product?.baseSku || $("skuPreview")?.textContent || $("skuStyle")?.value || "SKC").trim();
    const colorCode = String(product ? inferColorCode(product) : $("skuColorCode")?.value || "").trim().toUpperCase();
    return colorCode ? `${baseSku}-${colorCode}` : baseSku;
  }

  function compressProductImage(file) {
    return new Promise((resolve, reject) => {
      if (!file?.type?.startsWith("image/")) {
        reject(new Error("请选择 PNG、JPG 或 WebP 图片"));
        return;
      }
      if (file.size > 15 * 1024 * 1024) {
        reject(new Error("图片不能超过 15MB"));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("无法读取图片"));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("图片格式无法识别"));
        image.onload = () => {
          const maxEdge = 1200;
          const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context = canvas.getContext("2d");
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", .82));
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function useSkuImageFile(file) {
    try {
      const dataUrl = await compressProductImage(file);
      const extension = file?.type?.split("/")[1] || "jpg";
      const product = state.products.find((item) => item.id === $("editingProductId").value);
      pendingSkuImageName = normalizedImageName(skuForImageName(product), extension);
      $("skuImageUrl").value = "";
      if (localApiEnabled) {
        const response = await fetch(`${apiBase}/images`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl, fileName: pendingSkuImageName })
        });
        if (!response.ok) throw new Error(`图片上传失败（HTTP ${response.status}）`);
        const result = await response.json();
        pendingSkuImageName = result.fileName || pendingSkuImageName;
        setPendingSkuImage(result.url);
      } else {
        setPendingSkuImage(dataUrl);
      }
      showToast(`图片已重命名为 ${pendingSkuImageName}`);
    } catch (error) {
      showToast(error.message || "图片添加失败");
    }
  }

  function openSkuModal(productId = "") {
    $("skuForm").reset();
    skuImageRemoved = false;
    pendingSkuImageName = "";
    setPendingSkuImage("");
    $("editingProductId").value = productId;
    renderSkuCategoryOptions();
    renderSpuOptionSelectors(new Date().getFullYear(), "W");
    $("skuCreatedDate").value = localDateKey();
    $("skuColorCode").value = "";
    const product = state.products.find((item) => item.id === productId);
    if (product) {
      const match = String(product.baseSku).match(/^COZ(SS|AW)(\d{2})-([A-Z])([A-Z]+?)(\d{3})$/);
      const meta = product.spuMeta || {};
      const year = meta.year || (match ? Number(`20${match[2]}`) : new Date().getFullYear());
      if (!spuYears.includes(Number(year))) spuYears.push(Number(year));
      const fabric = meta.fabricType || match?.[3] || "W";
      renderSpuOptionSelectors(year, fabric);
      const itemType = meta.itemType || Object.entries(itemTypeCodes).find(([, code]) => code === match?.[4])?.[0] || product.category;
      if ([...$("skuCategory").options].some((option) => option.value === itemType)) $("skuCategory").value = itemType;
      $("skuName").value = product.name || "";
      $("skuCreatedDate").value = meta.createdDate || localDateKey();
      $("skuSeason").value = meta.season || match?.[1] || "SS";
      $("skuSequence").value = String(meta.sequence || match?.[5] || "001").padStart(3, "0");
      $("skuStyle").value = product.originalStyle || product.style || "";
      $("skuImageUrl").value = /^https:/i.test(product.image || "") ? product.image : "";
      setPendingSkuImage(product.image || "");
      $("skuColor").value = product.color || "";
      const colorCandidates = colorCodeCandidates(product);
      $("skuColorCode").value = colorCandidates.length === 1 ? colorCandidates[0] : "";
      renderColorCodeNotice(colorCandidates, product.color);
      pendingSkuImageName = product.imageName || "";
      $("skuSafety").value = Number(product.safety || 0);
      $("skuModalTitle").textContent = "编辑 SPU 和 SKU";
      $("skuSubmitButton").textContent = "保存修改";
      renderSkuVariantRows(product);
    } else {
      renderColorCodeNotice([]);
      updateNextSpuSequence();
      $("skuModalTitle").textContent = "新增成衣 SPU";
      $("skuSubmitButton").textContent = "创建 SPU 和 SKU";
      renderSkuVariantRows();
    }
    $("skuModal").hidden = false;
    document.body.style.overflow = "hidden";
    updateSkuPreview();
    applyLanguage();
    setTimeout(() => $("skuName").focus(), 20);
  }

  function openBundleModal(bundleId = "") {
    const bundle = (state.bundles || []).find((item) => item.id === bundleId);
    $("bundleForm").reset();
    $("editingBundleId").value = bundle?.id || "";
    $("bundleModalTitle").textContent = bundle ? "编辑套装" : "新建套装";
    $("bundleSubmitButton").textContent = bundle ? "保存修改" : "保存套装";
    renderBundleOptionSelectors(bundle?.season || "SS26", bundle?.color || "");
    renderBundleComponentOptions();
    ["bundleCode1", "bundleCode2", "bundleCode3"].forEach((id) => { if ($(id)) $(id).value = ""; });

    if (bundle) {
      $("bundleName").value = bundle.name || "";
      $("bundleType").value = bundle.type || "virtual";
      $("bundleSeason").value = bundle.season || $("bundleSeason").value;
      $("bundleColor").value = bundle.color || "";
      $("bundleSize").value = bundle.size || "";
      $("bundleFixedSku").value = bundle.fixedSku || "";
      $("bundleFixedStock").value = Math.max(0, Number(bundle.fixedStock || 0));
      const recordsByIndex = new Map(bundlePartRecords(bundle).map((record) => [record.index, record.product]));
      [1, 2, 3].forEach((componentNumber) => {
        const componentIndex = componentNumber - 1;
        const product = recordsByIndex.get(componentIndex);
        if (product) selectBundleComponent(componentNumber, product.id);
        $("bundleCode" + componentNumber).value = bundle.componentCodes?.[componentIndex] || (product ? bundleTail(product.baseSku) : "");
      });
    }
    updateBundleTypeFields();
    renderBundleSkuPreview();
    $("bundleModal").hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(() => $("bundleName").focus(), 20);
  }

  function closeBundleModal() {
    $("bundleModal").hidden = true;
    closeBundleSeasonCreator();
    closeBundleColorCreator();
    [1, 2, 3].forEach(closeBundleComponentResults);
    document.body.style.overflow = "";
  }

  function updateBundleTypeFields() {
    const fixed = $("bundleType").value === "fixed";
    $("fixedSkuField").hidden = !fixed;
    $("fixedStockField").hidden = !fixed;
    renderBundleSkuPreview();
  }

  function submitBundle(event) {
    event.preventDefault();
    const editingId = $("editingBundleId").value;
    const editingBundle = (state.bundles || []).find((item) => item.id === editingId);
    const type = $("bundleType").value;
    const componentEntries = [1, 2, 3].map((index) => ({
      id: $(`bundleComponent${index}`).value,
      code: $(`bundleCode${index}`).value
    })).filter((entry) => entry.id);
    const components = componentEntries.map((entry) => entry.id);
    if (type !== "fixed" && (!$("bundleComponent1").value || !$("bundleComponent2").value)) {
      showToast("请选择组件 1 和组件 2");
      return;
    }
    if (new Set(components).size !== components.length) {
      showToast("同一个单品不能在套装中重复选择");
      return;
    }
    if (type !== "fixed" && (!$("bundleColor").value.trim() || !$("bundleSize").value)) {
      showToast("虚拟套装需要填写颜色并选择尺码");
      return;
    }
    if (type === "fixed" && !$("bundleFixedSku").value.trim()) {
      showToast("请输入固定 SET SKU，例如 COZSS26-WSET068");
      return;
    }
    const componentProducts = components.map((id) => state.products.find((product) => product.id === id)).filter(Boolean);
    const componentCodes = componentEntries.map((entry, index) => entry.code.trim().toUpperCase() || bundleTail(componentProducts[index]?.baseSku));
    const now = new Date().toISOString();
    const bundle = {
      ...(editingBundle || {}),
      id: editingBundle?.id || `B${Date.now()}`,
      name: $("bundleName").value.trim(),
      type,
      season: $("bundleSeason").value.trim().toUpperCase() || "SS26",
      color: $("bundleColor").value.trim(),
      colorCode: editingBundle?.color === $("bundleColor").value.trim()
        ? String(editingBundle.colorCode || "").trim().toUpperCase()
        : String(colorMappings[$("bundleColor").value.trim()] || "").trim().toUpperCase(),
      size: $("bundleSize").value,
      fixedSku: $("bundleFixedSku").value.trim().toUpperCase(),
      fixedStock: Math.max(0, Number($("bundleFixedStock").value || 0)),
      components,
      componentSkus: componentProducts.map((product) => product.baseSku),
      componentSourceSkus: componentProducts.map((product) => product.sourceBaseSku || product.style || product.originalStyle || product.baseSku),
      componentColors: componentProducts.map((product) => product.color),
      componentSizes: componentProducts.map((product) => bundleComponentSize(product, $("bundleSize").value)),
      componentCodes,
      createdAt: editingBundle?.createdAt || now,
      updatedAt: now
    };
    if (type === "fixed" && editingBundle?.locationStock) {
      bundle.locationStock = bundle.fixedStock === Number(editingBundle.fixedStock || 0)
        ? { ...editingBundle.locationStock }
        : Object.fromEntries(stockLocations.map((location) => [location.id, location.id === "warehouse" ? bundle.fixedStock : 0]));
      recalculateLocationTotals(bundle, true);
    } else if (type !== "fixed") {
      delete bundle.locationStock;
    }
    if (!bundle.name) {
      showToast("请输入套装名称");
      return;
    }
    if ((state.bundles || []).some((item) => item.id !== editingId && bundleSku(item) === bundleSku(bundle))) {
      showToast(`套装 SKU ${bundleSku(bundle)} 已存在`);
      return;
    }
    state.bundles = editingBundle
      ? state.bundles.map((item) => item.id === editingId ? bundle : item)
      : [...(state.bundles || []), bundle];
    saveState();
    closeBundleModal();
    renderAll();
    showToast(`套装 ${bundleSku(bundle)} 已${editingBundle ? "更新" : "创建"}`);
  }

  function deleteBundle(id) {
    const bundle = (state.bundles || []).find((item) => item.id === id);
    if (!bundle) return;
    const confirmation = currentLang === "zh"
      ? `确认删除套装 ${bundleSku(bundle)}？\n删除后可在回收站恢复。`
      : `Delete bundle ${bundleSku(bundle)}? You can restore it from the recycle bin.`;
    if (!window.confirm(confirmation)) return;
    state.bundles = state.bundles.filter((item) => item.id !== id);
    state.trashBundles = [{ ...clone(bundle), deletedAt: new Date().toISOString() }, ...(state.trashBundles || []).filter((item) => item.id !== id)];
    state.deletedBundleIds = [...new Set([...(state.deletedBundleIds || []), id])];
    saveState();
    renderAll();
    showToast(`套装 ${bundleSku(bundle)} 已移入回收站`);
  }

  function restoreBundle(id) {
    const bundle = (state.trashBundles || []).find((item) => item.id === id);
    if (!bundle) return;
    if ((state.bundles || []).some((item) => item.id === id || bundleSku(item) === bundleSku(bundle))) {
      showToast("现有套装中已存在相同 SKU，无法直接恢复");
      return;
    }
    const restored = clone(bundle);
    delete restored.deletedAt;
    state.bundles = [restored, ...(state.bundles || [])];
    state.trashBundles = state.trashBundles.filter((item) => item.id !== id);
    state.deletedBundleIds = (state.deletedBundleIds || []).filter((bundleId) => bundleId !== id);
    saveState();
    renderAll();
    showToast(`套装 ${bundleSku(restored)} 已恢复`);
  }

  function purgeBundle(id) {
    const bundle = (state.trashBundles || []).find((item) => item.id === id);
    if (!bundle || !window.confirm(`彻底删除套装 ${bundleSku(bundle)}？此操作无法恢复。`)) return;
    state.trashBundles = state.trashBundles.filter((item) => item.id !== id);
    state.deletedBundleIds = [...new Set([...(state.deletedBundleIds || []), id])];
    saveState();
    renderAll();
    showToast(`套装 ${bundleSku(bundle)} 已彻底删除`);
  }

  function closeSkuModal() {
    $("skuModal").hidden = true;
    closeCategoryCreator();
    closeYearCreator();
    closeFabricCreator();
    closeSkuColorCreator();
    closeColorResults();
    setPendingSkuImage("");
    pendingSkuImageName = "";
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

  function openYearCreator() {
    $("yearCreator").hidden = false;
    $("addYearBtn").setAttribute("aria-expanded", "true");
    setTimeout(() => $("newYear").focus(), 20);
  }
  function closeYearCreator() {
    $("yearCreator").hidden = true;
    $("addYearBtn").setAttribute("aria-expanded", "false");
    $("newYear").value = "";
  }
  function addYear() {
    const year = Number($("newYear").value);
    if (!Number.isInteger(year) || year < 2000 || year > 2099) {
      showToast("年份需为 2000 至 2099");
      return;
    }
    if (!spuYears.includes(year)) spuYears.push(year);
    spuYears.sort();
    saveSpuOptions();
    renderSpuOptionSelectors(year, $("skuFabric").value);
    closeYearCreator();
    updateNextSpuSequence();
    showToast(`年份 ${year} 已添加`);
  }
  function openFabricCreator() {
    $("fabricCreator").hidden = false;
    $("addFabricBtn").setAttribute("aria-expanded", "true");
    setTimeout(() => $("newFabricName").focus(), 20);
  }
  function closeFabricCreator() {
    $("fabricCreator").hidden = true;
    $("addFabricBtn").setAttribute("aria-expanded", "false");
    $("newFabricName").value = "";
    $("newFabricCode").value = "";
  }
  function addFabricType() {
    const name = $("newFabricName").value.trim();
    const code = $("newFabricCode").value.trim().toUpperCase();
    if (!name || !/^[A-Z]$/.test(code)) {
      showToast("请输入面料名称和 1 位英文字母代码");
      return;
    }
    const duplicate = Object.entries(fabricTypeCodes).find(([existingName, existingCode]) => existingName.toLowerCase() === name.toLowerCase() || existingCode === code);
    if (duplicate && duplicate[0].toLowerCase() !== name.toLowerCase()) {
      showToast(`面料代码 ${code} 已用于 ${duplicate[0]}`);
      return;
    }
    fabricTypeCodes[name] = code;
    saveSpuOptions();
    renderSpuOptionSelectors($("skuYear").value, code);
    closeFabricCreator();
    updateNextSpuSequence();
    showToast(`面料类型 ${name} 已添加`);
  }

  function openBundleSeasonCreator() {
    $("bundleSeasonCreator").hidden = false;
    $("addBundleSeasonBtn").setAttribute("aria-expanded", "true");
    setTimeout(() => $("newBundleSeason").focus(), 20);
  }
  function closeBundleSeasonCreator() {
    $("bundleSeasonCreator").hidden = true;
    $("addBundleSeasonBtn").setAttribute("aria-expanded", "false");
    $("newBundleSeason").value = "";
  }
  function addBundleSeason() {
    const season = $("newBundleSeason").value.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,8}$/.test(season)) {
      showToast("季节需为 2 至 8 位英文或数字，例如 SS27");
      return;
    }
    if (!bundleSeasons.includes(season)) bundleSeasons.push(season);
    saveBundleOptions();
    renderBundleOptionSelectors(season, $("bundleColor").value);
    closeBundleSeasonCreator();
    renderBundleSkuPreview();
    showToast(`季节 ${season} 已添加`);
  }
  function openBundleColorCreator() {
    $("bundleColorCreator").hidden = false;
    $("addBundleColorBtn").setAttribute("aria-expanded", "true");
    setTimeout(() => $("newBundleColor").focus(), 20);
  }
  function closeBundleColorCreator() {
    $("bundleColorCreator").hidden = true;
    $("addBundleColorBtn").setAttribute("aria-expanded", "false");
    $("newBundleColor").value = "";
  }
  function addBundleColor() {
    const color = $("newBundleColor").value.trim();
    if (!color) {
      showToast("请输入颜色名称");
      return;
    }
    const existing = bundleColors.find((value) => value.toLowerCase() === color.toLowerCase());
    const selected = existing || color;
    if (!existing) bundleColors.push(color);
    saveBundleOptions();
    renderBundleOptionSelectors($("bundleSeason").value, selected);
    closeBundleColorCreator();
    renderBundleSkuPreview();
    showToast(`颜色 ${selected} 已添加`);
  }

  function addCategory() {
    const name = $("newCategoryName").value.trim();
    const code = $("newCategoryCode").value.trim().toUpperCase();
    if (!name) {
      showToast("请输入商品类型名称");
      $("newCategoryName").focus();
      return;
    }
    if (!/^[A-Z0-9]{1,4}$/.test(code)) {
      showToast("类型缩写需为 1 至 4 位英文或数字");
      $("newCategoryCode").focus();
      return;
    }
    const existingName = Object.keys(itemTypeCodes).find((itemType) => itemType.toLowerCase() === name.toLowerCase());
    const existingCode = Object.entries(itemTypeCodes).find(([, itemTypeCode]) => itemTypeCode === code);
    if (existingName) {
      renderSkuCategoryOptions(existingName);
      closeCategoryCreator();
      updateSkuPreview();
      showToast(`商品类型“${existingName}”已存在并已选中`);
      return;
    }
    if (existingCode) {
      showToast(`类型缩写 ${code} 已用于“${existingCode[0]}”`);
      $("newCategoryCode").focus();
      return;
    }
    itemTypeCodes[name] = code;
    saveItemTypeCodes();
    renderSkuCategoryOptions(name);
    closeCategoryCreator();
    updateSkuPreview();
    showToast(`商品类型“${name}”已添加并选中`);
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

  function movementLocationId(movement) {
    if (movement.locationId && stockLocations.some((location) => location.id === movement.locationId)) return movement.locationId;
    return stockLocations.find((location) => location.name === movement.location)?.id || stockLocations[0]?.id || "warehouse";
  }

  function movementTargetFromValue(value) {
    const [kind, targetId, size = ""] = String(value || "").split("|");
    if (kind === "product") {
      const record = state.products.find((product) => product.id === targetId);
      return record ? { kind, targetId, size, record, sku: skuForSize(record, size), label: `${record.name} ${size} 码` } : null;
    }
    if (kind === "bundle") {
      const record = (state.bundles || []).find((bundle) => bundle.id === targetId);
      return record ? { kind, targetId, size: record.size || size || "F", record, sku: bundleSku(record), label: record.name } : null;
    }
    return null;
  }

  function resolveMovementTarget(movement) {
    if (movement.targetKind && movement.targetId) {
      const stored = movementTargetFromValue(`${movement.targetKind}|${movement.targetId}|${movement.targetSize || ""}`);
      if (stored) return stored;
    }
    for (const product of state.products) {
      for (const size of orderedSizes(product)) {
        if ([skuForSize(product, size), product.skuBySize?.[size], product.sourceSkuBySize?.[size]].filter(Boolean).includes(movement.sku)) {
          return movementTargetFromValue(`product|${product.id}|${size}`);
        }
      }
    }
    const bundle = (state.bundles || []).find((item) => bundleSku(item) === movement.sku || item.importedSku === movement.sku || item.fixedSku === movement.sku);
    return bundle ? movementTargetFromValue(`bundle|${bundle.id}|${bundle.size || "F"}`) : null;
  }

  function applyMovementEffect(target, signedQuantity, locationId) {
    const quantity = Number(signedQuantity || 0);
    const location = locationById(locationId);
    if (!target || !quantity || !location) return "流水关联的商品、数量或库位无效";
    if (target.kind === "product") {
      if (target.record.sizes?.[target.size] == null) return `商品已没有 ${target.size} 尺码`;
      if (Number(target.record.sizes[target.size] || 0) + quantity < 0 || locationStockValue(target.record, locationId) + quantity < 0) {
        return `${location.name}的 ${target.size} 码库存不足`;
      }
      target.record.sizes[target.size] = Number(target.record.sizes[target.size] || 0) + quantity;
      adjustLocationStock(target.record, locationId, quantity);
      return "";
    }

    const bundle = target.record;
    if (bundle.type === "fixed") {
      if (locationStockValue(bundle, locationId, true) + quantity < 0) return `${location.name}的 ${bundle.name} 库存不足`;
      adjustLocationStock(bundle, locationId, quantity, true);
      return "";
    }
    if (quantity > 0) {
      bundlePartRecords(bundle).forEach(({ product, index }) => {
        const targetSize = bundleComponentSize(product, bundle.size, bundle.componentSizes?.[index]);
        if (!targetSize) return;
        product.sizes[targetSize] = Number(product.sizes[targetSize] || 0) + quantity;
        adjustLocationStock(product, locationId, quantity);
      });
      return "";
    }
    const parts = bundlePartRecords(bundle);
    if (!parts.length || parts.length !== (bundle.components || []).length) return "套装组件不完整，无法调整库存";
    for (const { product, index } of parts) {
      const targetSize = bundleComponentSize(product, bundle.size, bundle.componentSizes?.[index]);
      if (!targetSize || Number(product.sizes?.[targetSize] || 0) + quantity < 0 || locationStockValue(product, locationId) + quantity < 0) {
        return `${location.name}的 ${product.name} 库存不足`;
      }
    }
    parts.forEach(({ product, index }) => {
      const targetSize = bundleComponentSize(product, bundle.size, bundle.componentSizes?.[index]);
      product.sizes[targetSize] = Number(product.sizes[targetSize] || 0) + quantity;
      adjustLocationStock(product, locationId, quantity);
    });
    return "";
  }

  function nextMovementId(type) {
    const prefix = `${type === "inbound" ? "IN" : "OUT"}-${compactDateKey()}-`;
    const highest = state.movements.reduce((max, movement) => {
      const match = String(movement.id || "").match(new RegExp(`^${prefix}(\\d+)$`));
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `${prefix}${String(highest + 1).padStart(3, "0")}`;
  }

  function openMovementEditor(movementId) {
    if (!canManageMovements()) return;
    const movement = state.movements.find((item) => item.id === movementId);
    const target = movement && resolveMovementTarget(movement);
    if (!movement || !target) {
      showToast("这条历史流水无法关联到现有 SKU，暂不能编辑");
      return;
    }
    $("movementForm").reset();
    renderMovementLocationOptions();
    $("editingMovementId").value = movement.id;
    $("movementModalTitle").textContent = "编辑库存流水";
    selectMovementSku(`${target.kind}|${target.targetId}|${target.size || ""}`);
    $("movementLocation").value = movementLocationId(movement);
    $("movementQty").value = Math.max(1, Math.abs(Number(movement.qty || 1)));
    $("movementNote").value = movement.note || "";
    setMovementType(movement.type === "outbound" ? "outbound" : "inbound");
    $("movementForm").querySelector('[type="submit"]').textContent = "保存修改";
    $("movementModal").hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(() => $("movementQty").focus(), 20);
  }

  function deleteMovement(movementId) {
    if (!canManageMovements()) return;
    const movement = state.movements.find((item) => item.id === movementId);
    if (!movement || !window.confirm(`确认删除流水 ${movement.id}？系统会同时撤销这条流水造成的库存变化。`)) return;
    const before = clone(state);
    const target = resolveMovementTarget(movement);
    const error = applyMovementEffect(target, -Number(movement.qty || 0), movementLocationId(movement));
    if (error) {
      state = before;
      showToast(`${error}，无法撤销这条流水`);
      return;
    }
    state.movements = state.movements.filter((item) => item.id !== movementId);
    const now = new Date();
    recordStockSnapshot(totalAvailable(), now);
    saveState();
    renderAll();
    showToast(`流水 ${movement.id} 已删除，库存已同步回退`);
  }

  function submitMovement(event) {
    event.preventDefault();
    if (!canManageMovements()) {
      showToast("当前账号没有库存操作权限");
      return;
    }
    if (!$("movementSku").value) {
      showToast("请从推荐结果中选择 SKU");
      renderMovementSkuResults($("movementSkuSearch").value);
      return;
    }
    const target = movementTargetFromValue($("movementSku").value);
    const type = $("movementType").value;
    const quantity = Math.max(1, Number($("movementQty").value || 1));
    const signedQuantity = type === "inbound" ? quantity : -quantity;
    const locationId = $("movementLocation").value;
    const location = locationById(locationId);
    if (!target || !location) return;
    if (type === "inbound" && target.kind === "bundle" && target.record.type !== "fixed") {
      showToast("虚拟套装没有独立入库，请给组成单品入库");
      return;
    }

    const editingId = $("editingMovementId").value;
    const existing = state.movements.find((movement) => movement.id === editingId);
    const before = clone(state);
    if (existing) {
      const oldTarget = resolveMovementTarget(existing);
      const reverseError = applyMovementEffect(oldTarget, -Number(existing.qty || 0), movementLocationId(existing));
      if (reverseError) {
        state = before;
        showToast(`${reverseError}，无法修改这条流水`);
        return;
      }
    }
    const applyError = applyMovementEffect(target, signedQuantity, locationId);
    if (applyError) {
      state = before;
      showToast(`${applyError}，请调整数量`);
      return;
    }

    const now = new Date();
    const movement = {
      id: existing?.id || nextMovementId(type),
      time: existing?.time || localTimestamp(now),
      updatedAt: existing ? now.toISOString() : undefined,
      type,
      sku: target.sku,
      location: location.name,
      locationId,
      qty: signedQuantity,
      operator: currentSession.displayName || currentSession.username,
      note: $("movementNote").value.trim() || (target.kind === "bundle" ? `${bundleTypeLabel(target.record.type)}${type === "outbound" ? "销售" : "入库"}` : "快速库存调整"),
      targetKind: target.kind,
      targetId: target.targetId,
      targetSize: target.size || ""
    };
    if (existing) Object.assign(existing, movement);
    else state.movements.unshift(movement);
    recordStockSnapshot(totalAvailable(), now);
    saveState();
    closeMovementModal();
    $("movementForm").reset();
    setMovementType("inbound");
    renderAll();
    showToast(existing ? `流水 ${movement.id} 已修改` : `${target.label} 已${type === "inbound" ? "入库" : "出库"} ${quantity}${target.kind === "bundle" ? " 套" : " 件"}`);
  }

  function spuCodeFromForm() {
    const season = $("skuSeason").value || "SS";
    const year = String($("skuYear").value || new Date().getFullYear()).slice(-2);
    const fabric = $("skuFabric").value || "W";
    const itemType = itemTypeCodes[$("skuCategory").value] || "ST";
    const sequence = String(Math.max(1, Number($("skuSequence").value || 1))).padStart(3, "0").slice(-3);
    return `COZ${season}${year}-${fabric}${itemType}${sequence}`;
  }

  function updateNextSpuSequence() {
    const seasonYear = `COZ${$("skuSeason").value || "SS"}${String($("skuYear").value || new Date().getFullYear()).slice(-2)}-`;
    const sequences = state.products.map((product) => String(product.baseSku || ""))
      .filter((spu) => spu.startsWith(seasonYear) && /\d{3}$/.test(spu))
      .map((spu) => Number(spu.slice(-3)))
      .filter(Number.isFinite);
    $("skuSequence").value = String(Math.min(999, Math.max(0, ...sequences) + 1)).padStart(3, "0");
    updateSkuPreview();
  }

  function updateSkuPreview() {
    const sequence = String($("skuSequence").value || "").replace(/\D/g, "").slice(0, 3);
    if ($("skuSequence").value !== sequence) $("skuSequence").value = sequence;
    $("skuPreview").textContent = spuCodeFromForm();
    updateGeneratedSkuCodes();
  }

  function submitSku(event) {
    event.preventDefault();
    const editingId = $("editingProductId").value;
    const editingProduct = state.products.find((product) => product.id === editingId);
    const itemType = $("skuCategory").value;
    const originalStyle = $("skuStyle").value.trim();
    const color = $("skuColor").value.trim();
    const matchingManualProduct = !editingProduct && originalStyle ? state.products.find((product) =>
      !isCozProduct(product)
      && String(product.originalStyle || product.style || "").trim().toLowerCase() === originalStyle.toLowerCase()
      && String(product.color || "").trim().toLowerCase() === color.toLowerCase()
    ) : null;
    const baseSku = matchingManualProduct?.baseSku || spuCodeFromForm();
    const sequence = Number($("skuSequence").value);
    if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999) {
      showToast("三位序号需为 001 至 999");
      $("skuSequence").focus();
      return;
    }
    if (!matchingManualProduct && state.products.some((product) => product.id !== editingId && product.baseSku === baseSku && String(product.color || "").trim().toLowerCase() === color.toLowerCase())) {
      showToast("这个 SPU 编码已存在，请调整三位序号");
      return;
    }
    const colorCode = $("skuColorCode").value.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,5}$/.test(colorCode)) {
      showToast("颜色代码需为 1 至 5 位英文字母或数字");
      $("skuColorCode").focus();
      return;
    }
    const variants = [...document.querySelectorAll("#skuVariantRows .sku-variant-row")].filter((row) => row.querySelector(".variant-enabled").checked).map((row) => ({
      size: row.dataset.variantSize,
      stock: Math.max(0, Number(row.querySelector(".variant-stock").value || 0)),
      sourceSynced: row.dataset.sourceSynced === "true",
      sku: matchingManualProduct && row.querySelector(".variant-sku").dataset.manual !== "true"
        ? `${matchingManualProduct.baseSku}-${colorCode}-${row.dataset.variantSize}`
        : row.querySelector(".variant-sku").value.trim().toUpperCase()
    }));
    if (!variants.length) {
      showToast("请至少选择一个尺码 SKU");
      return;
    }
    const cozEdit = Boolean(editingProduct && isCozProduct(editingProduct));
    if (!cozEdit && variants.some((variant) => !variant.sku)) {
      showToast("每个已选尺码都需要 SKU 编码");
      return;
    }
    if (new Set(variants.map((variant) => variant.sku).filter(Boolean)).size !== variants.filter((variant) => variant.sku).length) {
      showToast("同一款式中不能有重复 SKU 编码");
      return;
    }
    const occupiedSkus = new Set(state.products.filter((product) => product.id !== editingId && product.id !== matchingManualProduct?.id).flatMap((product) => [
      ...Object.values(product.skuBySize || {}),
      ...Object.values(product.sourceSkuBySize || {})
    ]).filter(Boolean));
    const duplicateSku = variants.find((variant) => occupiedSkus.has(variant.sku));
    if (duplicateSku) {
      showToast(`SKU ${duplicateSku.sku} 已存在`);
      return;
    }
    const image = pendingSkuImage || safeImageUrl($("skuImageUrl").value);
    const appearance = resolveColorAppearance(color);
    const sizes = Object.fromEntries(variants.map((variant) => [variant.size, variant.stock]));
    const skuBySize = Object.fromEntries(variants.filter((variant) => variant.sku).map((variant) => [variant.size, variant.sku]));
    const commonProductData = {
      name: $("skuName").value.trim(), category: itemType, style: originalStyle, originalStyle, baseSku,
      spuMeta: {
        createdDate: $("skuCreatedDate").value,
        year: Number($("skuYear").value),
        season: $("skuSeason").value,
        fabricType: $("skuFabric").value,
        itemType,
        itemTypeCode: itemTypeCodes[itemType],
        sequence
      },
      color, colorCode, colorHex: appearance.hex, colorAccent: appearance.accent, colorPattern: appearance.pattern,
      safety: Number($("skuSafety").value || 0), image: image || (!skuImageRemoved ? editingProduct?.image : "") || "",
      imageName: image ? (pendingSkuImageName || editingProduct?.imageName || normalizedImageName(`${baseSku}-${colorCode}`, "jpg")) : "",
      imageUpdatedAt: image ? new Date().toISOString() : null,
      imageSyncStatus: image ? "available" : (editingProduct?.imageSyncStatus || "missing")
    };
    const productData = {
      id: editingId || `P${Date.now()}`,
      ...commonProductData,
      sourceOrigin: "manual",
      sizes, skuBySize,
      warehouse: Object.values(sizes).reduce((sum, qty) => sum + qty, 0), store: 0,
      reserved: Math.min(Object.values(sizes).reduce((sum, qty) => sum + qty, 0), Number(editingProduct?.reserved || 0))
    };
    if (editingProduct) {
      const previousBaseSku = editingProduct.baseSku;
      const cozProduct = isCozProduct(editingProduct);
      const sourceBaseSku = editingProduct.sourceBaseSku || editingProduct.style || previousBaseSku;
      const sharedProducts = state.products.filter((product) => product.id !== editingId && (
        cozProduct
          ? isCozProduct(product) && (product.sourceBaseSku || product.style || product.baseSku) === sourceBaseSku
          : product.baseSku === previousBaseSku
      ));
      sharedProducts.forEach((product) => {
        product.name = commonProductData.name;
        product.category = commonProductData.category;
        product.style = commonProductData.style;
        product.originalStyle = commonProductData.originalStyle;
        product.baseSku = baseSku;
        product.spuMeta = clone(commonProductData.spuMeta);
        product.sourceBaseSku ||= sourceBaseSku;
        if (cozProduct) product.sourceOrigin = "coz";
        Object.entries(product.skuBySize || {}).forEach(([size, sku]) => {
          if (String(sku).startsWith(`${previousBaseSku}-`)) product.skuBySize[size] = `${baseSku}-${String(sku).slice(previousBaseSku.length + 1)}`;
        });
      });
      if (cozProduct) {
        const localSizes = Object.fromEntries(variants.filter((variant) => !variant.sourceSynced).map((variant) => [variant.size, variant.stock]));
        const sourceSizes = Object.fromEntries(Object.entries(editingProduct.sizes || {}).filter(([size]) => editingProduct.sourceSkuBySize?.[size]));
        const combinedSizes = { ...sourceSizes, ...localSizes };
        Object.assign(editingProduct, commonProductData, {
          id: editingProduct.id,
          sourceOrigin: "coz",
          sourceBaseSku,
          sourceSkuBySize: { ...(editingProduct.sourceSkuBySize || {}) },
          sizes: combinedSizes,
          localSizes,
          reservedBySize: editingProduct.reservedBySize ? { ...editingProduct.reservedBySize } : undefined,
          skuBySize,
          warehouse: Object.values(combinedSizes).reduce((sum, qty) => sum + Number(qty || 0), 0),
          store: editingProduct.store,
          reserved: editingProduct.reserved,
          reservedReported: editingProduct.reservedReported
        });
      } else {
        Object.assign(editingProduct, productData);
      }
      (state.bundles || []).forEach((bundle) => {
        bundle.componentSkus = (bundle.componentSkus || []).map((sku) => sku === previousBaseSku ? baseSku : sku);
      });
    } else if (matchingManualProduct) {
      const addedVariants = variants.filter((variant) => matchingManualProduct.sizes?.[variant.size] == null);
      if (!addedVariants.length) {
        showToast(`SPU ${matchingManualProduct.baseSku} 已包含所选尺码，请直接编辑该 SPU`);
        return;
      }
      const mergedSizes = { ...matchingManualProduct.sizes, ...Object.fromEntries(addedVariants.map((variant) => [variant.size, variant.stock])) };
      const mergedSkuBySize = { ...(matchingManualProduct.skuBySize || {}), ...Object.fromEntries(addedVariants.filter((variant) => variant.sku).map((variant) => [variant.size, variant.sku])) };
      Object.assign(matchingManualProduct, commonProductData, {
        baseSku: matchingManualProduct.baseSku,
        sourceOrigin: "manual",
        sizes: mergedSizes,
        skuBySize: mergedSkuBySize,
        warehouse: Object.values(mergedSizes).reduce((sum, qty) => sum + Number(qty || 0), 0),
        store: Number(matchingManualProduct.store || 0),
        reserved: Math.min(Object.values(mergedSizes).reduce((sum, qty) => sum + Number(qty || 0), 0), Number(matchingManualProduct.reserved || 0))
      });
    } else {
      state.products.unshift(productData);
    }
    saveState();
    closeSkuModal();
    $("skuForm").reset();
    renderSkuCategoryOptions();
    renderAll();
    showToast(editingProduct ? `SPU ${baseSku} 和 SKU 已更新` : matchingManualProduct ? `新尺码已合并到 SPU ${baseSku}` : `SPU ${baseSku} 与 ${variants.length} 个 SKU 已创建`);
  }

  function exportInventory() {
    const headers = ["品牌 SKU", "CoZ 原始 SKU", "品牌 SPU", "CoZ 原始款号", "款式", "品类", "颜色", "尺码", "库存", "安全库存", "状态"];
    const rows = state.products.flatMap((product) => Object.entries(product.sizes).map(([size, qty]) => [
      product.skuBySize?.[size] || "", product.sourceSkuBySize?.[size] || "", product.baseSku, product.sourceBaseSku || "", product.name, itemTypeLabels[product.category]?.[0] || product.category, product.color, size, qty, product.safety, isLowSkuQuantity(qty) ? "低库存" : "正常"
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
    const currentProducts = state.products || [];
    const trashProducts = state.trashProducts || [];
    const deletedSourceKeys = new Set([...(state.deletedProductKeys || []), ...trashProducts.map((product) => product.deletedSourceKey || productSourceKey(product))].map(migrateProductSourceKey).filter(Boolean));
    const manualProducts = currentProducts.filter((product) => product.sourceOrigin === "manual" && !product.sourceBaseSku);
    const mappings = currentProducts.filter((product) => product.sourceBaseSku || isCozProduct(product));
    const mappingBySource = new Map(mappings.map((product) => [sourceColorKey(product.sourceBaseSku || product.style || product.baseSku, product.color), product]));
    const groups = new Map();
    snapshot.inventory.forEach((item) => {
      const style = String(item.styleNo || item.sku || "").trim();
      const color = String(item.color || "未设置颜色").trim();
      const size = normalizeSizeLabel(item.size);
      if (!style || !item.sku) return;
      const key = sourceColorKey(style, color);
      if (!groups.has(key)) {
        const appearance = resolveColorAppearance(color);
        groups.set(key, {
          name: item.productName || item.styleNote || style,
          category: item.category || "成衣",
          style,
          baseSku: style,
          sourceBaseSku: style,
          sourceOrigin: "coz",
          color,
          colorHex: appearance.hex,
          colorAccent: appearance.accent,
          colorPattern: appearance.pattern,
          safety: 0,
          image: safeImageUrl(item.imageUrl),
          imagePath: item.imagePath || "",
          imageName: item.imageUrl ? normalizedImageName(`${style}-${colorMappings[color] || "COLOR"}`, "jpg") : (item.imageName || ""),
          imageSourceName: item.imageSourceName || item.imagePath || "",
          imageSyncStatus: item.imageUrl ? "available" : "pending-source-download",
          sizes: {},
          reservedBySize: {},
          skuBySize: {},
          sourceSkuBySize: {},
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
      if (!product.imageName && item.imageName) product.imageName = item.imageName;
      if (!product.imageSourceName && (item.imageSourceName || item.imagePath)) product.imageSourceName = item.imageSourceName || item.imagePath;
      if (item.imageUrl) product.imageSyncStatus = "available";
      product.sizes[size] = Number(product.sizes[size] || 0) + Number(item.stockedQuantity || 0);
      product.reservedBySize[size] = Number(product.reservedBySize[size] || 0) + Number(item.reservedQuantity || 0);
      if (!product.sourceSkuBySize[size]) product.sourceSkuBySize[size] = String(item.sku);
      product.warehouse += Number(item.stockedQuantity || 0);
      product.reserved += Number(item.reservedQuantity || 0);
      product.reservedReported ||= Boolean(item.reservedReported);
      if (item.productName && product.name === style) product.name = item.productName;
      if (item.sourceUpdatedAt && (!product.sourceUpdatedAt || item.sourceUpdatedAt > product.sourceUpdatedAt)) product.sourceUpdatedAt = item.sourceUpdatedAt;
    });

    const syncedProducts = [...groups.entries()]
      .filter(([key]) => !deletedSourceKeys.has(key))
      .map(([key, product]) => {
        const mapping = mappingBySource.get(key);
        if (!mapping) return product;
        const localSizes = { ...(mapping.localSizes || {}) };
        return {
          ...product,
          id: mapping.id,
          name: mapping.name || product.name,
          category: mapping.category || product.category,
          originalStyle: mapping.originalStyle || mapping.style || product.style,
          baseSku: mapping.baseSku || product.baseSku,
          spuMeta: mapping.spuMeta ? clone(mapping.spuMeta) : undefined,
          colorCode: colorMappings[product.color] || mapping.colorCode || "",
          colorHex: mapping.colorHex || product.colorHex,
          colorAccent: mapping.colorAccent || product.colorAccent,
          colorPattern: mapping.colorPattern || product.colorPattern,
          safety: Number(mapping.safety || 0),
          image: mapping.image || product.image,
          imageName: mapping.imageName || product.imageName || "",
          imageSourceName: mapping.imageSourceName || product.imageSourceName || "",
          imageUpdatedAt: mapping.imageUpdatedAt || product.imageUpdatedAt || null,
          imageSyncStatus: mapping.imageSyncStatus || product.imageSyncStatus || "missing",
          skuBySize: { ...(mapping.skuBySize || {}) },
          localSizes,
          sizes: { ...product.sizes, ...localSizes },
          warehouse: product.warehouse + Object.values(localSizes).reduce((sum, qty) => sum + Number(qty || 0), 0),
          sourceOrigin: "coz",
          sourceBaseSku: product.sourceBaseSku
        };
      })
      .sort((a, b) => a.style.localeCompare(b.style) || a.color.localeCompare(b.color))
      .map((product, index) => ({ id: product.id || `COZ-${String(index + 1).padStart(4, "0")}`, ...product }));
    if (!syncedProducts.length) throw new Error("CoZ 同步数据中没有有效 SKU");
    return {
      products: [...manualProducts, ...syncedProducts],
      trashProducts,
      deletedProductKeys: [...deletedSourceKeys],
      movements: [],
      bundles: mergeBundleSeed(state?.bundles, state?.deletedBundleIds),
      trashBundles: state?.trashBundles || [],
      deletedBundleIds: state?.deletedBundleIds || [],
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
      state.bundles = (state.bundles || []).map((bundle) => ({
        ...bundle,
        components: (bundle.components || []).map((id, index) => {
          const previousSku = bundle.componentSkus?.[index];
          const previousColor = bundle.componentColors?.[index];
          return state.products.find((product) => product.id === id)
            ?.id || state.products.find((product) => product.baseSku === previousSku && (!previousColor || product.color === previousColor))?.id || id;
        })
      }));
      normalizeProductReferences(state);
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

  function isStandaloneApp() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function isIosDevice() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function updateInstallButton() {
    const button = $("installAppBtn");
    if (!button) return;
    button.hidden = isStandaloneApp() || (!deferredInstallPrompt && !isIosDevice());
  }

  async function installPwa() {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      updateInstallButton();
      return;
    }
    showToast(currentLang === "zh"
      ? "请在 Safari 的分享菜单中选择“添加到主屏幕”"
      : "In Safari, choose Add to Home Screen from the Share menu");
  }

  function initPwaInstallation() {
    $("installAppBtn")?.addEventListener("click", installPwa);
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      updateInstallButton();
    });
    window.addEventListener("appinstalled", () => {
      deferredInstallPrompt = null;
      updateInstallButton();
    });
    window.matchMedia("(display-mode: standalone)").addEventListener?.("change", updateInstallButton);
    updateInstallButton();
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.register("/service-worker.js", { scope: "/" })
        .catch((error) => console.error("Service worker registration failed", error));
    }
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      const viewButton = event.target.closest("[data-view]");
      if (viewButton) switchView(viewButton.dataset.view);
      const jumpButton = event.target.closest("[data-jump]");
      if (jumpButton) switchView(jumpButton.dataset.jump);
      const moveButton = event.target.closest("[data-move-product]");
      if (moveButton) openMovementModal(moveButton.dataset.moveProduct);
      const editButton = event.target.closest("[data-edit-product]");
      if (editButton) openSkuModal(editButton.dataset.editProduct);
      const trashButton = event.target.closest("[data-trash-product]");
      if (trashButton) trashProduct(trashButton.dataset.trashProduct);
      const restoreButton = event.target.closest("[data-restore-product]");
      if (restoreButton) restoreProduct(restoreButton.dataset.restoreProduct);
      const purgeButton = event.target.closest("[data-purge-product]");
      if (purgeButton) purgeProduct(purgeButton.dataset.purgeProduct);
      const restoreBundleButton = event.target.closest("[data-restore-bundle]");
      if (restoreBundleButton) restoreBundle(restoreBundleButton.dataset.restoreBundle);
      const purgeBundleButton = event.target.closest("[data-purge-bundle]");
      if (purgeBundleButton) purgeBundle(purgeBundleButton.dataset.purgeBundle);
      const editBundleButton = event.target.closest("[data-edit-bundle]");
      if (editBundleButton) openBundleModal(editBundleButton.dataset.editBundle);
      const deleteBundleButton = event.target.closest("[data-delete-bundle]");
      if (deleteBundleButton) deleteBundle(deleteBundleButton.dataset.deleteBundle);
      const componentResult = event.target.closest("[data-component-id]");
      if (componentResult) selectBundleComponent(Number(componentResult.dataset.componentIndex), componentResult.dataset.componentId);
      const inventorySearchResult = event.target.closest("[data-inventory-search-id]");
      if (inventorySearchResult) selectInventorySearchProduct(inventorySearchResult.dataset.inventorySearchId);
      const bundleSearchResult = event.target.closest("[data-bundle-search-id]");
      if (bundleSearchResult) selectBundleSearchResult(bundleSearchResult.dataset.bundleSearchId);
      const movementSkuResult = event.target.closest("[data-movement-sku-value]");
      if (movementSkuResult) selectMovementSku(movementSkuResult.dataset.movementSkuValue);
      const editMovementButton = event.target.closest("[data-edit-movement]");
      if (editMovementButton) openMovementEditor(editMovementButton.dataset.editMovement);
      const deleteMovementButton = event.target.closest("[data-delete-movement]");
      if (deleteMovementButton) deleteMovement(deleteMovementButton.dataset.deleteMovement);
      const clearComponentButton = event.target.closest("[data-clear-component]");
      if (clearComponentButton) clearBundleComponent(Number(clearComponentButton.dataset.clearComponent));
      const componentPicker = event.target.closest("[data-component-picker]");
      if (!componentPicker) [1, 2, 3].forEach(closeBundleComponentResults);
      if (!event.target.closest(".inventory-search-combobox")) closeInventorySearchResults();
      if (!event.target.closest(".bundle-search-combobox")) closeBundleSearchResults();
      if (!event.target.closest(".movement-sku-combobox")) closeMovementSkuResults();
      const colorResult = event.target.closest("[data-color-name]");
      if (colorResult) selectMappedColor(colorResult.dataset.colorName, colorResult.dataset.colorCode);
      if (!event.target.closest(".color-combobox")) closeColorResults();
      if (event.target.closest("[data-close-modal]")) closeMovementModal();
      if (event.target.closest("[data-close-sku]")) closeSkuModal();
      if (event.target.closest("[data-close-bundle]")) closeBundleModal();
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
    $("profileButton").addEventListener("click", openAccountModal);
    document.querySelectorAll("[data-close-account]").forEach((node) => node.addEventListener("click", closeAccountModal));
    document.querySelectorAll("[data-close-temporary-password]").forEach((node) => node.addEventListener("click", () => { $("temporaryPasswordModal").hidden = true; $("temporaryPasswordValue").textContent = ""; }));
    $("refreshUsersBtn").addEventListener("click", loadUsers);
    $("userList").addEventListener("click", (event) => {
      const row = event.target.closest("[data-user-id]");
      if (!row) return;
      if (event.target.closest("[data-save-user]")) saveUserAccess(row);
      if (event.target.closest("[data-reset-user]")) resetUserPassword(row);
    });
    $("logoutBtn").addEventListener("click", async () => {
      try { await authApi("logout", { method: "POST", body: "{}" }); } catch (_) { /* Redirect even if the session already expired. */ }
      location.replace("/login.html");
    });
    $("ownPasswordForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      if (data.get("newPassword") !== data.get("confirmPassword")) { showToast("两次输入的新密码不一致"); return; }
      const button = form.querySelector("button[type=submit]");
      button.disabled = true;
      try {
        await authApi("change-password", { method: "POST", body: JSON.stringify({ currentPassword: data.get("currentPassword"), newPassword: data.get("newPassword") }) });
        form.reset();
        showToast("密码已修改");
      } catch (error) { showToast(error.message); }
      finally { button.disabled = false; }
    });
    $("copyTemporaryPasswordBtn").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText($("temporaryPasswordValue").textContent); showToast("临时密码已复制"); }
      catch (_) { showToast("无法自动复制，请手动选择临时密码"); }
    });
    $("mobileMoveBtn").addEventListener("click", () => openMovementModal());
    $("scanBtn").addEventListener("click", () => { openMovementModal(); showToast("请选择或扫描 SKU 后调整库存"); });
    $("addSkuBtn").addEventListener("click", () => openSkuModal());
    $("openTrashBtn").addEventListener("click", openTrashModal);
    $("openBundleTrashBtn").addEventListener("click", openBundleTrashModal);
    document.querySelectorAll("[data-close-trash]").forEach((node) => node.addEventListener("click", closeTrashModal));
    $("addBundleBtn").addEventListener("click", () => openBundleModal());
    $("addCategoryBtn").addEventListener("click", openCategoryCreator);
    $("cancelCategoryBtn").addEventListener("click", closeCategoryCreator);
    $("saveCategoryBtn").addEventListener("click", addCategory);
    $("addYearBtn").addEventListener("click", openYearCreator);
    $("cancelYearBtn").addEventListener("click", closeYearCreator);
    $("saveYearBtn").addEventListener("click", addYear);
    $("addFabricBtn").addEventListener("click", openFabricCreator);
    $("cancelFabricBtn").addEventListener("click", closeFabricCreator);
    $("saveFabricBtn").addEventListener("click", addFabricType);
    $("addSkuColorBtn").addEventListener("click", openSkuColorCreator);
    $("cancelSkuColorBtn").addEventListener("click", closeSkuColorCreator);
    $("saveSkuColorBtn").addEventListener("click", addSkuColorMapping);
    $("addBundleSeasonBtn").addEventListener("click", openBundleSeasonCreator);
    $("cancelBundleSeasonBtn").addEventListener("click", closeBundleSeasonCreator);
    $("saveBundleSeasonBtn").addEventListener("click", addBundleSeason);
    $("addBundleColorBtn").addEventListener("click", openBundleColorCreator);
    $("cancelBundleColorBtn").addEventListener("click", closeBundleColorCreator);
    $("saveBundleColorBtn").addEventListener("click", addBundleColor);
    $("addLocationBtn").addEventListener("click", () => openLocationEditor("add"));
    $("editLocationBtn").addEventListener("click", () => openLocationEditor("edit"));
    $("cancelLocationBtn").addEventListener("click", closeLocationEditor);
    $("saveLocationBtn").addEventListener("click", saveLocation);
    $("skuImageDropzone").addEventListener("click", () => $("skuImageFile").click());
    $("skuImageFile").addEventListener("change", (event) => useSkuImageFile(event.target.files?.[0]));
    $("clearSkuImageBtn").addEventListener("click", () => {
      skuImageRemoved = true;
      $("skuImageUrl").value = "";
      setPendingSkuImage("");
    });
    ["dragenter", "dragover"].forEach((eventName) => $("skuImageDropzone").addEventListener(eventName, (event) => {
      event.preventDefault();
      $("skuImageDropzone").classList.add("dragging");
    }));
    ["dragleave", "drop"].forEach((eventName) => $("skuImageDropzone").addEventListener(eventName, (event) => {
      event.preventDefault();
      $("skuImageDropzone").classList.remove("dragging");
    }));
    $("skuImageDropzone").addEventListener("drop", (event) => useSkuImageFile(event.dataTransfer.files?.[0]));
    $("skuImageUrl").addEventListener("input", () => {
      const value = safeImageUrl($("skuImageUrl").value);
      if (value) setPendingSkuImage(value);
    });
    $("skuModal").addEventListener("paste", (event) => {
      const file = [...(event.clipboardData?.items || [])].find((item) => item.type.startsWith("image/"))?.getAsFile();
      if (file) {
        event.preventDefault();
        useSkuImageFile(file);
      }
    });
    ["newCategoryName", "newCategoryCode"].forEach((id) => $(id).addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addCategory();
      }
    }));
    $("newYear").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); addYear(); } });
    ["newFabricName", "newFabricCode"].forEach((id) => $(id).addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); addFabricType(); } }));
    ["newSkuColor", "newSkuColorCode"].forEach((id) => $(id).addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); addSkuColorMapping(); } }));
    $("newBundleSeason").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); addBundleSeason(); } });
    $("newBundleColor").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); addBundleColor(); } });
    $("newLocationName").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); saveLocation(); } });
    $("movementForm").addEventListener("submit", submitMovement);
    $("skuForm").addEventListener("submit", submitSku);
    $("bundleForm").addEventListener("submit", submitBundle);
    $("exportBtn").addEventListener("click", exportInventory);
    $("inventorySearch").addEventListener("focus", () => renderInventorySearchResults($("inventorySearch").value));
    $("inventorySearch").addEventListener("input", () => { renderInventory(); renderInventorySearchResults($("inventorySearch").value); refreshIcons(); applyLanguage(); });
    $("inventorySearch").addEventListener("keydown", (event) => {
      let options = [...$("inventorySearchResults").querySelectorAll(".inventory-search-result")];
      let current = options.findIndex((option) => option.classList.contains("active"));
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if ($("inventorySearchResults").hidden) {
          renderInventorySearchResults($("inventorySearch").value);
          options = [...$("inventorySearchResults").querySelectorAll(".inventory-search-result")];
          current = options.findIndex((option) => option.classList.contains("active"));
        }
        const next = event.key === "ArrowDown" ? Math.min(options.length - 1, current + 1) : Math.max(0, current - 1);
        options.forEach((option, index) => option.classList.toggle("active", index === next));
        options[next]?.scrollIntoView({ block: "nearest" });
      } else if (event.key === "Enter" && !$("inventorySearchResults").hidden && options.length) {
        event.preventDefault();
        const option = options[Math.max(0, current)];
        selectInventorySearchProduct(option.dataset.inventorySearchId);
      } else if (event.key === "Escape") closeInventorySearchResults();
    });
    $("categoryFilter").addEventListener("change", () => { renderInventory(); refreshIcons(); applyLanguage(); });
    $("statusFilter").addEventListener("change", () => { renderInventory(); refreshIcons(); applyLanguage(); });
    $("bundleSearch").addEventListener("focus", () => renderBundleSearchResults($("bundleSearch").value));
    $("bundleSearch").addEventListener("input", () => { renderBundleRows(); renderBundleSearchResults($("bundleSearch").value); refreshIcons(); applyLanguage(); });
    $("bundleSearch").addEventListener("keydown", (event) => {
      let options = [...$("bundleSearchResults").querySelectorAll(".inventory-search-result")];
      let current = options.findIndex((option) => option.classList.contains("active"));
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if ($("bundleSearchResults").hidden) {
          renderBundleSearchResults($("bundleSearch").value);
          options = [...$("bundleSearchResults").querySelectorAll(".inventory-search-result")];
          current = options.findIndex((option) => option.classList.contains("active"));
        }
        const next = event.key === "ArrowDown" ? Math.min(options.length - 1, current + 1) : Math.max(0, current - 1);
        options.forEach((option, index) => option.classList.toggle("active", index === next));
        options[next]?.scrollIntoView({ block: "nearest" });
      } else if (event.key === "Enter" && !$("bundleSearchResults").hidden && options.length) {
        event.preventDefault();
        selectBundleSearchResult(options[Math.max(0, current)].dataset.bundleSearchId);
      } else if (event.key === "Escape") closeBundleSearchResults();
    });
    ["bundleTypeFilter", "bundleSizeFilter", "bundleStatusFilter"].forEach((id) => $(id).addEventListener("change", () => { renderBundleRows(); refreshIcons(); applyLanguage(); }));
    $("movementSkuSearch").addEventListener("focus", () => renderMovementSkuResults($("movementSkuSearch").value));
    $("movementSkuSearch").addEventListener("input", () => {
      $("movementSku").value = "";
      renderMovementSkuResults($("movementSkuSearch").value);
    });
    $("movementSkuSearch").addEventListener("keydown", (event) => {
      let options = [...$("movementSkuResults").querySelectorAll(".inventory-search-result")];
      let current = options.findIndex((option) => option.classList.contains("active"));
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if ($("movementSkuResults").hidden) {
          renderMovementSkuResults($("movementSkuSearch").value);
          options = [...$("movementSkuResults").querySelectorAll(".inventory-search-result")];
          current = options.findIndex((option) => option.classList.contains("active"));
        }
        const next = event.key === "ArrowDown" ? Math.min(options.length - 1, current + 1) : Math.max(0, current - 1);
        options.forEach((option, index) => option.classList.toggle("active", index === next));
        options[next]?.scrollIntoView({ block: "nearest" });
      } else if (event.key === "Enter" && !$("movementSkuResults").hidden && options.length) {
        event.preventDefault();
        selectMovementSku(options[Math.max(0, current)].dataset.movementSkuValue);
      } else if (event.key === "Escape") closeMovementSkuResults();
    });
    $("movementSearch").addEventListener("input", renderMovements);
    document.querySelectorAll(".segmented button").forEach((button) => button.addEventListener("click", () => setMovementType(button.dataset.type)));
    ["skuSeason", "skuYear", "skuFabric", "skuCategory"].forEach((id) => $(id).addEventListener("change", updateNextSpuSequence));
    $("skuSequence").addEventListener("input", updateSkuPreview);
    $("skuColorCode").addEventListener("input", updateGeneratedSkuCodes);
    $("skuColor").addEventListener("focus", () => renderColorResults($("skuColor").value));
    $("skuColor").addEventListener("input", () => { renderColorResults($("skuColor").value); applyExactColorMapping(); });
    $("skuColor").addEventListener("change", () => applyColorCodeCandidates($("skuColor").value.trim()));
    $("skuColor").addEventListener("keydown", (event) => {
      const options = [...$("skuColorResults").querySelectorAll(".color-result")];
      const current = options.findIndex((option) => option.classList.contains("active"));
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if ($("skuColorResults").hidden) renderColorResults($("skuColor").value);
        const next = event.key === "ArrowDown" ? Math.min(options.length - 1, current + 1) : Math.max(0, current - 1);
        options.forEach((option, index) => option.classList.toggle("active", index === next));
        options[next]?.scrollIntoView({ block: "nearest" });
      } else if (event.key === "Enter" && !$("skuColorResults").hidden && options.length) {
        event.preventDefault();
        const option = options[Math.max(0, current)];
        selectMappedColor(option.dataset.colorName, option.dataset.colorCode);
      } else if (event.key === "Escape") closeColorResults();
    });
    $("skuVariantRows").addEventListener("input", (event) => { if (event.target.classList.contains("variant-sku")) event.target.dataset.manual = "true"; });
    ["bundleSeason", "bundleColor", "bundleSize", "bundleFixedSku", "bundleCode1", "bundleCode2", "bundleCode3"].forEach((id) => $(id).addEventListener("input", renderBundleSkuPreview));
    [1, 2, 3].forEach((index) => {
      const search = $(`bundleComponentSearch${index}`);
      search.addEventListener("focus", () => {
        [1, 2, 3].filter((otherIndex) => otherIndex !== index).forEach(closeBundleComponentResults);
        renderBundleComponentResults(index, search.value);
      });
      search.addEventListener("input", () => {
        if ($(`bundleComponent${index}`).value) {
          $(`bundleComponent${index}`).value = "";
          document.querySelector(`[data-component-picker="${index}"]`).classList.remove("has-value");
          updateBundleComponentCode(index);
        }
        renderBundleComponentResults(index, search.value);
      });
      search.addEventListener("keydown", (event) => handleBundleComponentKeydown(index, event));
    });
    $("bundleType").addEventListener("change", updateBundleTypeFields);
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
      if (!$("bundleModal").hidden) closeBundleModal();
      if (!$("trashModal").hidden) closeTrashModal();
      if (!$("imageModal").hidden) closeImageModal();
    });
  }

  function initDate() {
    const now = new Date();
    $("dateDay").textContent = String(now.getDate()).padStart(2, "0");
    $("dateWeek").textContent = new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(now);
    $("dateFull").textContent = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(now);
  }

  async function initialize() {
    initDate();
    initPwaInstallation();
    bindEvents();
    applyTheme();
    if (!await initSession()) return;
    renderAll();
    switchView(activeView);
    await initCloudState();
    subscribeToCloudState();
    if (state.source?.type === "coz" && localDateKey(new Date(state.source.syncedAt)) === localDateKey()) {
      recordStockSnapshot(totalAvailable(), state.source.syncedAt);
    }
    initCozBridge();
    window.addEventListener("online", async () => {
      if (cloudStatus !== "error") return;
      await initCloudState();
      subscribeToCloudState();
    });
  }

  initialize();
})();
