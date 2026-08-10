(function () {
  const cloudTable = "public_costing_state";
  const seed = window.COSTING_SEED || {};
  const cloudConfig = window.SUPABASE_CONFIG || {};
  const supabaseClient = window.supabase && cloudConfig.url && cloudConfig.anonKey
    ? window.supabase.createClient(cloudConfig.url, cloudConfig.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      })
    : null;

  const $ = (id) => document.getElementById(id);
  const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const usd4 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 4 });
  const rmb2 = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const GSM_PER_OZ = 33.905747;

  let state = loadState();
  let selectedQuote = null;
  let cloudSaveTimer = null;
  let suppressCloudSave = false;
  let syncingFabricPrice = false;
  let syncingFabricLibraryPrice = false;
  let syncingFabricWeight = false;
  let selectedFabricKey = null;
  let fabricImagePasteBuffer = [];
  let fabricFormDraft = null;
  let imageDialogFabricKey = null;
  let currentLang = "zh";
  let authSession = null;
  let authProfile = null;
  let authRequest = null;
  let otpEmail = "";
  let otpAwaiting = false;
  let approvalRequests = [];
  let loadedCloudDatasets = new Map();
  const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

  // Add or adjust common fabric terms here. The English display name is generated from this dictionary.
  const fabricNameDictionary = [
    ["棉汗布", "Cotton Jersey"], ["汗布", "Jersey"], ["毛圈", "French Terry"],
    ["卫衣布", "Sweatshirt Fleece"], ["摇粒绒", "Polar Fleece"], ["抓绒", "Fleece"],
    ["针织布", "Knit Fabric"], ["罗纹", "Rib Knit"], ["网眼布", "Mesh Fabric"],
    ["牛津布", "Oxford Fabric"], ["梭织布", "Woven Fabric"], ["府绸", "Poplin"],
    ["斜纹布", "Twill"], ["帆布", "Canvas"], ["灯芯绒", "Corduroy"],
    ["牛仔布", "Denim"], ["涤塔夫", "Polyester Taffeta"], ["春亚纺", "Polyester Pongee"],
    ["雪纺", "Chiffon"], ["缎面", "Satin"], ["天丝", "Tencel"],
    ["人棉", "Rayon"], ["粘胶", "Viscose"], ["锦纶", "Nylon"],
    ["涤纶", "Polyester"], ["再生涤纶", "Recycled Polyester"], ["氨纶", "Spandex"],
    ["弹力布", "Stretch Fabric"], ["双面布", "Double Knit"], ["单面布", "Single Jersey"],
    ["仿羊羔绒", "Sherpa Fleece"], ["珊瑚绒", "Coral Fleece"], ["不倒绒", "Velvet Fleece"]
  ];

  const quoteFields = {
    line: $("quoteLine"),
    fabricSelect: $("quoteFabricSelect"),
    fabric: $("fabricName"),
    garment: $("garmentName"),
    base: $("baseStyle"),
    target: $("targetFob"),
    consumption: $("consumptionM"),
    width: $("widthCm"),
    fabricUsd: $("fabricPriceUsd"),
    fabricRmb: $("fabricPriceRmb"),
    trims: $("trimsUsd"),
    cmt: $("cmtUsd"),
    testing: $("testingUsd"),
    logistics: $("logisticsUsd"),
    lining: $("liningUsd"),
    margin: $("marginPct"),
    fx: $("fx"),
    vat: $("vatPct"),
    note: $("quoteNote")
  };

  const fabricFields = {
    id: $("fabricLibId"),
    nameZh: $("fabricLibNameZh"),
    nameEn: $("fabricLibNameEn"),
    composition: $("fabricComposition"),
    weight: $("fabricWeight"),
    weightOz: $("fabricWeightOz"),
    widthCm: $("fabricWidthCm"),
    colorway: $("fabricColorway"),
    process: $("fabricProcess"),
    mill: $("fabricMill"),
    rmbPerKg: $("fabricRmbKg"),
    rmbPerM: $("fabricRmbM"),
    metersPerKg: $("fabricMetersPerKg"),
    match: $("fabricMatch"),
    images: $("fabricImageFiles"),
    supplierQuoteList: $("supplierQuoteList")
  };

  const copy = {
    zh: {
      title: "JA 面料信息填报平台",
      subtitle: "",
      switchLanguage: "English",
      print: "打印",
      exportBackup: "导出备份",
      cloudTitle: "云端数据库同步",
      cloudDefault: "数据按身份和供应商隔离保存到 Supabase。",
      authAnnouncement: "JA 面料信息平台",
      authAnnouncementAccent: "供应商工作台",
      authIndex: "JA / 成员访问",
      authTitle: "登录您的工作空间",
      authHint: "使用邮箱验证码登录。供应商资料需经 JA 管理员审核。",
      email: "邮箱",
      sendOtp: "发送验证码",
      otpSentTo: "验证码已发送至",
      changeEmail: "更换邮箱",
      otpLabel: "邮箱验证码",
      otpPlaceholder: "6 位验证码",
      verifyOtp: "验证并登录",
      resendOtp: "重新发送验证码",
      signedInAs: "当前邮箱",
      identityLabel: "申请身份",
      jaIdentity: "JA 企业",
      supplierIdentity: "供应商",
      supplierLabel: "供应商名称",
      supplierPlaceholder: "请输入公司全称",
      submitAccessRequest: "提交审核",
      logout: "退出登录",
      loginRequired: "请先登录后访问面料库。",
      authLoading: "正在检查登录状态...",
      authWaiting: "身份申请已提交，等待 JA 管理员审核。",
      authRejected: "身份申请未通过。请核对资料后重新提交。",
      authSendSuccess: "验证码已发送，请查收邮箱。",
      authSending: "正在发送验证码...",
      authVerifying: "正在验证...",
      authRequesting: "正在提交身份申请...",
      authRequestSaved: "申请已提交，审核通过后即可进入面料库。",
      authEmailInvalid: "请输入有效的邮箱地址。",
      authOtpInvalid: "请输入邮箱中的验证码。",
      authSupplierRequired: "请填写供应商名称。",
      authExpired: "登录已超过 30 天，请重新验证邮箱。",
      authFailed: "登录失败",
      authReady: "已登录",
      approvalTitle: "身份审核",
      approvalHint: "审核供应商或 JA 企业的访问申请。",
      approvalRefresh: "刷新",
      approvalEmpty: "暂无待审核申请。",
      approvalApprove: "批准",
      approvalReject: "拒绝",
      approvalPending: "待审核",
      approvalFailed: "审核失败",
      sync: "同步",
      quoteMatrix: "报价矩阵",
      fabricData: "面料资料",
      targetRows: "目标 FOB 行",
      savedQuotes: "已保存报价",
      tabCalculator: "报价计算",
      tabTarget: "目标差距",
      tabFabrics: "面料库",
      tabTrims: "辅料明细",
      tabSaved: "保存记录",
      tabBackup: "备份",
      quoteCalc: "单款报价计算",
      reset: "重置",
      quoteLine: "选择报价线",
      quoteFabric: "从面料库选择面料",
      fabric: "面料 / Fabric",
      garment: "成衣 / Garment",
      baseStyle: "基础款 / I.S base style",
      targetFob: "目标 FOB USD",
      consumption: "用量 m/pc",
      width: "面料门幅 cm",
      fabricUsd: "面料单价 USD/m",
      fabricRmb: "面料单价 RMB/m",
      rmbM: "RMB/m",
      optionalRmb: "可选，填后自动换 USD",
      trims: "辅料+包装 USD/pc",
      cmt: "CMT USD/pc",
      testing: "测试 USD/pc",
      logistics: "物流 USD/pc",
      lining: "里布/其他 USD/pc",
      margin: "利润率 %",
      fx: "FX RMB→USD",
      vat: "VAT 退税率 %",
      note: "备注",
      fabricCost: "面料成本",
      directCost: "直接成本",
      gap: "目标差距",
      gapPct: "差距 %",
      maxFabric: "达标最高面料价",
      saveQuote: "保存当前报价",
      searchQuote: "搜索面料、成衣、基础款",
      exportCsv: "导出 CSV",
      style: "款式",
      targetAnalysis: "目标 FOB 差距分析",
      adjustedConsumption: "调整用量",
      maxFabricHeader: "最高面料价",
      newFabric: "新增面料",
      editFabric: "编辑面料",
      back: "返回",
      draft: "暂存",
      clear: "清空",
      fabricId: "面料编号",
      fabricNameZh: "面料名称",
      composition: "成分",
      weight: "克重 GSM",
      weightOz: "克重 oz",
      weightPlaceholder: "例如 260",
      weightOzPlaceholder: "例如 7.67",
      widthCm: "门幅 cm",
      color: "颜色",
      process: "工艺 / 版本",
      imageUpload: "上传图片",
      imageUploadHint: "可一次选择多张图片，也可以直接粘贴图片到这里，保存后会追加到当前面料图片。",
      supplier: "供应商 / Mill",
      supplierQuotesTitle: "供应商报价明细",
      supplierQuotesHint: "可编辑每个供应商的报价，保存后自动选最低 RMB/m。",
      addSupplierQuote: "添加报价",
      supplierQuoteVariant: "工艺 / 版本",
      supplierQuoteNote: "备注",
      removeSupplierQuote: "删除",
      metersPerKg: "每公斤出米数 m/kg",
      metersPlaceholder: "填写门幅、克重后自动计算",
      processPlaceholder: "例如 素色 / 印花",
      match: "匹配款/备注",
      filters: "筛选器",
      clearFilters: "清空筛选",
      filterSupplier: "供应商",
      filterComposition: "成分",
      filterWeight: "克重",
      filterWidth: "门幅",
      filterColor: "颜色",
      filterProcess: "工艺",
      allSuppliers: "全部供应商",
      allCompositions: "全部成分",
      allWeights: "全部克重",
      allWidths: "全部门幅",
      allColors: "全部颜色",
      allProcesses: "全部工艺",
      filterSupplierPlaceholder: "输入供应商",
      filterCompositionPlaceholder: "输入成分",
      filterWeightPlaceholder: "例如 160",
      filterWidthPlaceholder: "例如 150 / 59",
      filterColorPlaceholder: "输入颜色",
      filterProcessPlaceholder: "例如 素色 / 印花",
      fabricWidthLabel: "门幅",
      saveFabric: "保存面料",
      fabricSearch: "搜索编号、名称、成分、供应商",
      id: "编号",
      name: "名称",
      bestSupplier: "最低供应商",
      higherQuotes: "备选报价",
      image: "图片",
      time: "时间",
      actions: "操作",
      addedDate: "添加时间",
      lowest: "最低价",
      viewImages: "查看面料图片",
      noImages: "无图片",
      imageNote: "图片备注",
      imageNotePlaceholder: "输入这张图片的备注",
      deleteImage: "删除图片",
      imageUpdatedSyncing: "图片信息已更新，正在同步到 Supabase...",
      noFabricResults: "没有找到匹配的面料。",
      specs: "规格",
      alternatives: "备选报价",
      noAlternatives: "暂无备选报价",
      quote: "报价",
      edit: "编辑",
      delete: "删除",
      use: "使用",
      trimBuild: "辅料 Build-Up",
      selectTrim: "选择款式辅料块",
      item: "项目",
      unit: "单位",
      group: "组别",
      savedRecords: "保存记录",
      clearSaved: "清空保存记录",
      emptySaved: "暂无保存记录。",
      fullBackup: "完整备份",
      backupCopy: "导出当前工具数据和保存报价，之后可以再导入恢复。",
      downloadBackup: "下载 JSON 备份",
      importBackup: "导入备份",
      importCopy: "选择本工具导出的 JSON。导入会覆盖当前本地数据。",
      resetAllTitle: "恢复初始数据",
      resetAllCopy: "清空当前改动，重新载入初始参考数据。",
      resetAllButton: "恢复初始数据",
      fabricImages: "面料图片",
      close: "关闭",
      cmtShort: "CMT",
      fobShort: "FOB",
      directShort: "Direct",
      gapShort: "Gap",
      styleNo: "Style No.",
      usdNet: "USD/m (net VAT)",
      rmbUnit: "RMB/unit",
      qtyPc: "Qty/pc",
      usdPc: "USD/pc",
      notLinked: "不关联面料库 / 手动输入",
      widthTbd: "门幅TBD",
      priceTbd: "价格TBD",
      imageCaption: "图片",
      cloudSavingFailed: "云端保存失败",
      cloudSaved: "已同步到 Supabase",
      cloudNoConfig: "Supabase 配置未加载：平台暂时无法读取云端数据。",
      cloudLoading: "正在读取 Supabase 数据...",
      cloudLoaded: "已从 Supabase 载入数据",
      justNow: "刚刚",
      syncingNow: "正在同步...",
      syncFailed: "同步失败",
      fabricSavedSyncing: "面料已保存，正在同步到 Supabase...",
      fabricDrafted: "已暂存当前填写内容，未保存到云端。",
      fabricDeletedSyncing: "面料已删除，正在同步到 Supabase...",
      fillFabricRequired: "请填写面料编号。",
      fillFabricIdRequired: "请填写面料编号。",
      confirmClearSaved: "确定清空所有保存报价吗？",
      confirmResetAll: "确定恢复初始数据吗？当前改动和保存记录会被清空。",
      chooseBackup: "请先选择 JSON 备份文件。",
      badBackup: "备份格式不正确",
      confirmImport: "导入会覆盖当前本地数据，确定继续吗？",
      importDone: "导入完成。",
      importFailed: "导入失败",
      confirmDeleteFabric: "确定删除面料 {fabric} 吗？",
      formulaDefault: "FOB = (面料 + 辅料/包装 + CMT + 测试 + 物流 + 里布/其他) × (1 + 利润率)",
      conversionDefault: "每公斤出米数 = 1000 ÷ 门幅(m) ÷ 克重(g/m²)；RMB/m = RMB/kg ÷ 每公斤出米数。",
      conversionLive: "每公斤出米数 {mpk} m/kg；RMB/m = RMB/kg ÷ {mpk}，RMB/kg = RMB/m × {mpk}。",
      directFormula: "Direct = {fabricCost} + 辅料 {trims} + CMT {cmt} + 测试/物流/里布；FOB = Direct × {factor}"
    },
    en: {
      title: "JA Fabric Information Platform",
      subtitle: "",
      switchLanguage: "中文",
      print: "Print",
      exportBackup: "Export Backup",
      cloudTitle: "Cloud Database Sync",
      cloudDefault: "Data is stored in Supabase with access separated by identity and supplier.",
      authAnnouncement: "JA Fabric Information Platform",
      authAnnouncementAccent: "Supplier Workspace",
      authIndex: "JA / MEMBER ACCESS",
      authTitle: "Sign in to your workspace",
      authHint: "Sign in with an email code. Supplier access is reviewed by a JA administrator.",
      email: "Email",
      sendOtp: "Send verification code",
      otpSentTo: "Verification code sent to",
      changeEmail: "Change email",
      otpLabel: "Email verification code",
      otpPlaceholder: "6-digit code",
      verifyOtp: "Verify and sign in",
      resendOtp: "Send a new code",
      signedInAs: "Signed in as",
      identityLabel: "Request access as",
      jaIdentity: "JA Company",
      supplierIdentity: "Supplier",
      supplierLabel: "Supplier name",
      supplierPlaceholder: "Enter the registered company name",
      submitAccessRequest: "Submit for review",
      logout: "Sign out",
      loginRequired: "Please sign in to access the fabric library.",
      authLoading: "Checking sign-in status...",
      authWaiting: "Your access request is waiting for JA administrator review.",
      authRejected: "Your access request was not approved. Check the details and submit again.",
      authSendSuccess: "Verification code sent. Check your email.",
      authSending: "Sending verification code...",
      authVerifying: "Verifying...",
      authRequesting: "Submitting access request...",
      authRequestSaved: "Request submitted. You can enter after a JA administrator approves it.",
      authEmailInvalid: "Enter a valid email address.",
      authOtpInvalid: "Enter the verification code from your email.",
      authSupplierRequired: "Enter the supplier name.",
      authExpired: "Your 30-day sign-in has expired. Verify your email again.",
      authFailed: "Sign-in failed",
      authReady: "Signed in",
      approvalTitle: "Access review",
      approvalHint: "Review supplier and JA company access requests.",
      approvalRefresh: "Refresh",
      approvalEmpty: "No access requests are waiting.",
      approvalApprove: "Approve",
      approvalReject: "Reject",
      approvalPending: "Pending",
      approvalFailed: "Review failed",
      sync: "Sync",
      quoteMatrix: "Quote Matrix",
      fabricData: "Fabric Records",
      targetRows: "Target FOB Rows",
      savedQuotes: "Saved Quotes",
      tabCalculator: "Costing",
      tabTarget: "Target Gap",
      tabFabrics: "Fabric Library",
      tabTrims: "Trims Detail",
      tabSaved: "Saved",
      tabBackup: "Backup",
      quoteCalc: "Single Style Costing",
      reset: "Reset",
      quoteLine: "Select Quote Line",
      quoteFabric: "Select Fabric From Library",
      fabric: "Fabric",
      garment: "Garment",
      baseStyle: "I.S Base Style",
      targetFob: "Target FOB USD",
      consumption: "Consumption m/pc",
      width: "Fabric Width cm",
      fabricUsd: "Fabric Price USD/m",
      fabricRmb: "Fabric Price RMB/m",
      rmbM: "RMB/m",
      optionalRmb: "Optional; auto-converts to USD",
      trims: "Trims + Packing USD/pc",
      cmt: "CMT USD/pc",
      testing: "Testing USD/pc",
      logistics: "Logistics USD/pc",
      lining: "Lining/Other USD/pc",
      margin: "Margin %",
      fx: "FX RMB→USD",
      vat: "VAT Rebate %",
      note: "Notes",
      fabricCost: "Fabric Cost",
      directCost: "Direct Cost",
      gap: "Target Gap",
      gapPct: "Gap %",
      maxFabric: "Max Fabric Price",
      saveQuote: "Save Current Quote",
      searchQuote: "Search fabric, garment, base style",
      exportCsv: "Export CSV",
      style: "Style",
      targetAnalysis: "Target FOB Gap Analysis",
      adjustedConsumption: "Adjusted Consumption",
      maxFabricHeader: "Max Fabric Price",
      newFabric: "Add Fabric",
      editFabric: "Edit Fabric",
      back: "Back",
      draft: "Draft",
      clear: "Clear",
      fabricId: "Fabric ID",
      fabricNameZh: "Fabric Name",
      composition: "Composition",
      weight: "Weight",
      weightOz: "Weight oz",
      weightPlaceholder: "e.g. 260",
      weightOzPlaceholder: "e.g. 7.67",
      widthCm: "Width cm",
      color: "Color",
      process: "Process / Variant",
      imageUpload: "Upload Images",
      imageUploadHint: "Choose one or more images, or paste images here; they will be saved with this fabric.",
      supplier: "Supplier / Mill",
      supplierQuotesTitle: "Supplier Quote Details",
      supplierQuotesHint: "Edit each supplier quote; the lowest RMB/m is used after saving.",
      addSupplierQuote: "Add Quote",
      supplierQuoteVariant: "Process / Variant",
      supplierQuoteNote: "Note",
      removeSupplierQuote: "Remove",
      metersPerKg: "Meters per kg",
      metersPlaceholder: "Auto-calculated from width and GSM",
      processPlaceholder: "e.g. solid / print",
      match: "Match / Notes",
      filters: "Filters",
      clearFilters: "Clear Filters",
      filterSupplier: "Supplier",
      filterComposition: "Composition",
      filterWeight: "Weight",
      filterWidth: "Width",
      filterColor: "Color",
      filterProcess: "Process",
      allSuppliers: "All Suppliers",
      allCompositions: "All Compositions",
      allWeights: "All Weight",
      allWidths: "All Widths",
      allColors: "All Colors",
      allProcesses: "All Processes",
      filterSupplierPlaceholder: "Supplier name",
      filterCompositionPlaceholder: "Composition text",
      filterWeightPlaceholder: "e.g. 160",
      filterWidthPlaceholder: "e.g. 150 / 59",
      filterColorPlaceholder: "Color name",
      filterProcessPlaceholder: "e.g. solid / print",
      fabricWidthLabel: "Width",
      saveFabric: "Save Fabric",
      fabricSearch: "Search ID, name, composition",
      id: "ID",
      name: "Name",
      bestSupplier: "Best Supplier",
      higherQuotes: "Higher Quotes",
      image: "Image",
      time: "Time",
      actions: "Actions",
      addedDate: "Added",
      lowest: "Lowest",
      viewImages: "View Fabric Images",
      noImages: "No Images",
      imageNote: "Image Note",
      imageNotePlaceholder: "Add a note for this image",
      deleteImage: "Delete Image",
      imageUpdatedSyncing: "Image updated. Syncing to Supabase...",
      noFabricResults: "No matching fabrics found.",
      specs: "Specs",
      alternatives: "Alternatives",
      noAlternatives: "No alternatives",
      quote: "Quote",
      edit: "Edit",
      delete: "Delete",
      use: "Use",
      trimBuild: "Trims Build-Up",
      selectTrim: "Select Trim Block",
      item: "Item",
      unit: "Unit",
      group: "Group",
      savedRecords: "Saved Records",
      clearSaved: "Clear Saved Records",
      emptySaved: "No saved records yet.",
      fullBackup: "Full Backup",
      backupCopy: "Export current tool data and saved quotes, then import it later to restore.",
      downloadBackup: "Download JSON Backup",
      importBackup: "Import Backup",
      importCopy: "Choose a JSON exported by this tool. Importing overwrites the current data.",
      resetAllTitle: "Restore Initial Data",
      resetAllCopy: "Clear current changes and reload the initial reference data.",
      resetAllButton: "Restore Initial Data",
      fabricImages: "Fabric Images",
      close: "Close",
      cmtShort: "CMT",
      fobShort: "FOB",
      directShort: "Direct",
      gapShort: "Gap",
      styleNo: "Style No.",
      usdNet: "USD/m (net VAT)",
      rmbUnit: "RMB/unit",
      qtyPc: "Qty/pc",
      usdPc: "USD/pc",
      notLinked: "No library link / Manual input",
      widthTbd: "Width TBD",
      priceTbd: "Price TBD",
      imageCaption: "Image",
      cloudSavingFailed: "Cloud save failed",
      cloudSaved: "Synced to Supabase",
      cloudNoConfig: "Supabase config is not loaded; cloud data is unavailable.",
      cloudLoading: "Reading Supabase data...",
      cloudLoaded: "Loaded from Supabase",
      justNow: "just now",
      syncingNow: "Syncing...",
      syncFailed: "Sync failed",
      fabricSavedSyncing: "Fabric saved. Syncing to Supabase...",
      fabricDrafted: "Draft saved for this page only. Not synced to Supabase.",
      fabricDeletedSyncing: "Fabric deleted. Syncing to Supabase...",
      fillFabricRequired: "Please fill Fabric ID.",
      fillFabricIdRequired: "Please fill Fabric ID.",
      confirmClearSaved: "Clear all saved quotes?",
      confirmResetAll: "Restore initial data? Current changes and saved records will be cleared.",
      chooseBackup: "Please choose a JSON backup file first.",
      badBackup: "Invalid backup format",
      confirmImport: "Importing will overwrite current data. Continue?",
      importDone: "Import complete.",
      importFailed: "Import failed",
      confirmDeleteFabric: "Delete fabric {fabric}?",
      formulaDefault: "FOB = (fabric + trims/packing + CMT + testing + logistics + lining/other) × (1 + margin)",
      conversionDefault: "Meters per kg = 1000 ÷ width(m) ÷ GSM; RMB/m = RMB/kg ÷ meters per kg.",
      conversionLive: "Meters per kg {mpk} m/kg; RMB/m = RMB/kg ÷ {mpk}; RMB/kg = RMB/m × {mpk}.",
      directFormula: "Direct = {fabricCost} + trims {trims} + CMT {cmt} + testing/logistics/lining; FOB = Direct × {factor}"
    }
  };

  function t(key, values = {}) {
    let value = copy[currentLang]?.[key] || copy.zh[key] || key;
    Object.entries(values).forEach(([name, replacement]) => {
      value = value.replaceAll(`{${name}}`, replacement);
    });
    return value;
  }

  function setText(selector, key) {
    const el = document.querySelector(selector);
    if (el) el.textContent = t(key);
  }

  function setPlaceholder(id, key) {
    const el = $(id);
    if (el) el.placeholder = t(key);
  }

  function setLabel(inputId, key) {
    const input = $(inputId);
    const label = input?.closest("label")?.querySelector("span");
    if (label) label.textContent = t(key);
  }

  function setOutputLabel(outputId, key) {
    const label = $(outputId)?.closest("div")?.querySelector("span");
    if (label) label.textContent = t(key);
  }

  function setHeaders(selector, keys) {
    document.querySelectorAll(selector).forEach((th, index) => {
      if (keys[index]) th.textContent = t(keys[index]);
    });
  }

  function applyLanguage() {
    document.documentElement.lang = currentLang === "zh" ? "zh-CN" : "en";
    document.documentElement.classList.toggle("lang-en", currentLang === "en");
    document.title = t("title");
    setText(".topbar h1", "title");
    setText(".topbar p", "subtitle");
    setText("#languageToggle", "switchLanguage");
    setText("#authAnnouncement", "authAnnouncement");
    setText("#authAnnouncementAccent", "authAnnouncementAccent");
    setText("#authIndex", "authIndex");
    setText("#authTitle", "authTitle");
    setText("#authHint", "authHint");
    setText("#emailLabel", "email");
    setText("#sendOtpBtn", "sendOtp");
    setText("#otpSentTo", "otpSentTo");
    setText("#changeEmailBtn", "changeEmail");
    setText("#otpLabel", "otpLabel");
    setText("#verifyOtpBtn", "verifyOtp");
    setText("#resendOtpBtn", "resendOtp");
    setText("#signedInAs", "signedInAs");
    setText("#identityLabel", "identityLabel");
    setText("#supplierIdentityLabel", "supplierLabel");
    setText("#submitAccessRequestBtn", "submitAccessRequest");
    setText("#logoutBtn", "logout");
    const identityType = $("identityType");
    if (identityType) {
      identityType.querySelector('[value="supplier"]').textContent = t("supplierIdentity");
      identityType.querySelector('[value="ja"]').textContent = t("jaIdentity");
    }
    setText("#approvalTitle", "approvalTitle");
    setText("#approvalHint", "approvalHint");
    setText("#refreshApprovalsBtn", "approvalRefresh");
    setText("#approvalEmpty", "approvalEmpty");
    setText("#cloudStatus", "cloudDefault");
    setText("#cloudCard h2", "cloudTitle");
    setText("#syncNowBtn", "sync");
    setText(".metrics .metric span", "fabricData");
    setText('[data-tab="fabrics"]', "tabFabrics");
    setText("#calculatorPanel .section-title h2", "quoteCalc");
    setText("#resetQuoteBtn", "reset");
    setText("#quoteForm .button.primary", "saveQuote");
    setOutputLabel("fabricCostOut", "fabricCost");
    setOutputLabel("directCostOut", "directCost");
    setOutputLabel("fobOut", "fobShort");
    setOutputLabel("gapOut", "gap");
    setOutputLabel("gapPctOut", "gapPct");
    setOutputLabel("maxFabricOut", "maxFabric");
    setText("#calculatorPanel .list-head h2", "quoteMatrix");
    setText("#exportQuoteCsvBtn", "exportCsv");
    setText("#targetPanel .list-head h2", "targetAnalysis");
    setText("#exportTargetCsvBtn", "exportCsv");
    setText("#fabricFormTitle", selectedFabricKey ? "editFabric" : "newFabric");
    setText("#showFabricFormBtn", "newFabric");
    setText("#backFabricBtn", "back");
    setText("#draftFabricBtn", "draft");
    setText("#resetFabricBtn", "clear");
    setText("#fabricForm .button.primary", "saveFabric");
    setText("#supplierQuotesTitle", "supplierQuotesTitle");
    setText("#supplierQuotesHint", "supplierQuotesHint");
    setText("#addSupplierQuoteBtn", "addSupplierQuote");
    setText("#fabricsPanel .list-head h2", "tabFabrics");
    setText("#exportFabricCsvBtn", "exportCsv");
    setText("#trimsPanel .section-title h2", "trimBuild");
    setText("#savedPanel .list-head h2", "savedRecords");
    setText("#exportSavedCsvBtn", "exportCsv");
    setText("#clearSavedBtn", "clearSaved");
    setText("#savedEmpty", "emptySaved");
    setText("#backupPanel .backup-card:nth-child(1) h2", "fullBackup");
    setText("#backupPanel .backup-card:nth-child(1) p", "backupCopy");
    setText("#backupDownloadBtn", "downloadBackup");
    setText("#backupPanel .backup-card:nth-child(2) h2", "importBackup");
    setText("#backupPanel .backup-card:nth-child(2) p", "importCopy");
    setText("#importBackupBtn", "importBackup");
    setText("#backupPanel .backup-card:nth-child(3) h2", "resetAllTitle");
    setText("#backupPanel .backup-card:nth-child(3) p", "resetAllCopy");
    setText("#resetAllBtn", "resetAllButton");
    setText("#fabricImageTitle", "fabricImages");
    document.querySelector(".icon-close")?.setAttribute("aria-label", t("close"));

    [
      ["quoteLine", "quoteLine"], ["quoteFabricSelect", "quoteFabric"], ["fabricName", "fabric"],
      ["garmentName", "garment"], ["baseStyle", "baseStyle"], ["targetFob", "targetFob"],
      ["consumptionM", "consumption"], ["widthCm", "width"], ["fabricPriceUsd", "fabricUsd"],
      ["fabricPriceRmb", "fabricRmb"], ["trimsUsd", "trims"], ["cmtUsd", "cmt"],
      ["testingUsd", "testing"], ["logisticsUsd", "logistics"], ["liningUsd", "lining"],
      ["marginPct", "margin"], ["fx", "fx"], ["vatPct", "vat"], ["quoteNote", "note"], ["fabricLibId", "fabricId"],
      ["fabricLibNameZh", "fabricNameZh"], ["fabricLibNameEn", "fabricNameEn"], ["fabricComposition", "composition"], ["fabricWeight", "weight"],
      ["fabricWeightOz", "weightOz"], ["fabricWidthCm", "widthCm"], ["fabricColorway", "color"], ["fabricProcess", "process"], ["fabricImageFiles", "imageUpload"], ["fabricMill", "supplier"],
      ["fabricMetersPerKg", "metersPerKg"], ["fabricMatch", "match"], ["fabricFilterSupplier", "filterSupplier"], ["fabricFilterComposition", "filterComposition"],
      ["fabricFilterWeight", "filterWeight"], ["fabricFilterWidth", "filterWidth"], ["fabricFilterColor", "filterColor"], ["fabricFilterProcess", "filterProcess"],
      ["trimBlock", "selectTrim"]
    ].forEach(([id, key]) => setLabel(id, key));

    setPlaceholder("fabricPriceRmb", "optionalRmb");
    setPlaceholder("authOtp", "otpPlaceholder");
    setPlaceholder("supplierIdentity", "supplierPlaceholder");
    setPlaceholder("quoteSearch", "searchQuote");
    setPlaceholder("fabricLibId", "fabricId");
    setPlaceholder("fabricLibNameZh", "fabricNameZh");
    setPlaceholder("fabricLibNameEn", "fabricNameEn");
    setPlaceholder("fabricWeight", "weightPlaceholder");
    setPlaceholder("fabricWeightOz", "weightOzPlaceholder");
    setPlaceholder("fabricMetersPerKg", "metersPlaceholder");
    setPlaceholder("fabricSearch", "fabricSearch");
    setPlaceholder("fabricProcess", "processPlaceholder");
    setPlaceholder("fabricFilterSupplier", "filterSupplierPlaceholder");
    setPlaceholder("fabricFilterComposition", "filterCompositionPlaceholder");
    setPlaceholder("fabricFilterWeight", "filterWeightPlaceholder");
    setPlaceholder("fabricFilterWidth", "filterWidthPlaceholder");
    setPlaceholder("fabricFilterColor", "filterColorPlaceholder");
    setPlaceholder("fabricFilterProcess", "filterProcessPlaceholder");
    setText("#fabricImageHint", "imageUploadHint");
    setText("#fabricFiltersTitle", "filters");
    setText("#clearFabricFiltersBtn", "clearFilters");

    setHeaders("#calculatorPanel table thead th", ["id", "fabric", "garment", "baseStyle", "consumption", "fabricUsd", "trims", "cmtShort", "fobShort", "actions"]);
    setHeaders("#targetPanel table thead th", ["style", "styleNo", "targetFob", "adjustedConsumption", "fabricUsd", "fabricCost", "trims", "cmtShort", "directShort", "fobShort", "gapShort", "maxFabricHeader"]);
    setHeaders("#trimsPanel table thead th", ["item", "rmbUnit", "unit", "qtyPc", "usdPc", "group", "note"]);
    setHeaders("#savedPanel table thead th", ["time", "fabric", "garment", "consumption", "fabricUsd", "directShort", "fobShort", "gapShort", "note"]);
    renderApprovalRequests();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function defaultState() {
    return {
      source: seed.source || "",
      warning: seed.warning || "",
      assumptions: clone(seed.assumptions || {}),
      sizeRatio: clone(seed.sizeRatio || {}),
      fabrics: clone(seed.fabrics || []),
      styles: clone(seed.styles || []),
      quoteLines: clone(seed.quoteLines || []),
      targetRows: clone(seed.targetRows || []),
      trims: clone(seed.trims || []),
      actualConsumption277H118D: clone(seed.actualConsumption277H118D || []),
      notes: clone(seed.notes || []),
      savedQuotes: []
    };
  }

  function loadState() {
    return defaultState();
  }

  function saveState() {
    scheduleCloudSave();
  }

  function setCloudStatus(message) {
    const el = $("cloudStatus");
    if (el) el.textContent = message;
  }

  function emptyState() {
    const base = defaultState();
    return { ...base, fabrics: [], quoteLines: [], targetRows: [], trims: [], savedQuotes: [] };
  }

  function scopeRecordId() {
    if (authProfile?.role === "supplier") return `supplier:${encodeURIComponent(authProfile.supplier_name || "")}`;
    return "default";
  }

  function setAccessState() {
    const signedIn = Boolean(authSession);
    const approved = Boolean(authProfile?.active === true && authProfile?.role);
    $("authCard")?.toggleAttribute("hidden", approved);
    $("cloudCard")?.toggleAttribute("hidden", !approved);
    $("appContent")?.toggleAttribute("hidden", !approved);
    $("approvalPanel")?.toggleAttribute("hidden", !(approved && authProfile?.role === "ja"));
    $("logoutBtn")?.toggleAttribute("hidden", !signedIn);
    document.body.classList.toggle("auth-mode", !approved);
    $("emailLoginForm")?.toggleAttribute("hidden", signedIn || otpAwaiting);
    $("otpVerifyForm")?.toggleAttribute("hidden", signedIn || !otpAwaiting);
    const canRequest = signedIn && !authProfile && (!authRequest || authRequest.status === "rejected");
    $("accessRequestForm")?.toggleAttribute("hidden", !canRequest);
    if ($("otpEmail")) $("otpEmail").textContent = otpEmail;
    if ($("requestEmail")) $("requestEmail").textContent = authSession?.user?.email || "";
    const badge = $("identityBadge");
    if (badge) {
      badge.hidden = !approved;
      badge.textContent = authProfile?.role === "supplier"
        ? `${authProfile.supplier_name || t("supplierIdentity")}`
        : t("jaIdentity");
    }
    const supplierField = $("fabricMill");
    if (supplierField) {
      supplierField.readOnly = authProfile?.role === "supplier";
      if (authProfile?.role === "supplier") supplierField.value = authProfile.supplier_name || "";
    }
  }

  function setAuthStatus(message, type = "") {
    const el = $("authStatus");
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("status-error", type === "error");
    el.classList.toggle("status-success", type === "success");
  }

  function setAuthBusy(button, busy) {
    if (button) button.disabled = busy;
  }

  async function sendEmailOtp() {
    if (!supabaseClient) {
      setAuthStatus(t("cloudNoConfig"), "error");
      return;
    }
    const email = $("authEmail")?.value.trim().toLowerCase() || otpEmail;
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setAuthStatus(t("authEmailInvalid"), "error");
      return;
    }
    const button = $("sendOtpBtn");
    setAuthBusy(button, true);
    setAuthStatus(t("authSending"));
    const { error } = await supabaseClient.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true }
    });
    setAuthBusy(button, false);
    if (error) {
      setAuthStatus(`${t("authFailed")}: ${error.message}`, "error");
      return;
    }
    otpEmail = email;
    otpAwaiting = true;
    if ($("authOtp")) $("authOtp").value = "";
    setAccessState();
    setAuthStatus(t("authSendSuccess"), "success");
    $("authOtp")?.focus();
  }

  async function verifyEmailOtp() {
    const token = $("authOtp")?.value.trim() || "";
    if (!otpEmail || !token) {
      setAuthStatus(t("authOtpInvalid"), "error");
      return;
    }
    const button = $("verifyOtpBtn");
    setAuthBusy(button, true);
    setAuthStatus(t("authVerifying"));
    const { data, error } = await supabaseClient.auth.verifyOtp({ email: otpEmail, token, type: "email" });
    setAuthBusy(button, false);
    if (error) {
      setAuthStatus(`${t("authFailed")}: ${error.message}`, "error");
      return;
    }
    otpAwaiting = false;
    await applySession(data.session);
  }

  async function loadUserProfile(user) {
    if (!user || !supabaseClient) return null;
    const { data, error } = await supabaseClient
      .from("user_profiles")
      .select("id, role, supplier_name, display_name, active")
      .eq("id", user.id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function loadAccessRequest(user) {
    if (!user || !supabaseClient) return null;
    const { data, error } = await supabaseClient
      .from("access_requests")
      .select("user_id, email, requested_role, supplier_name, status, created_at, reviewed_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function submitAccessRequest() {
    if (!authSession?.user || !supabaseClient) return;
    const role = $("identityType")?.value === "ja" ? "ja" : "supplier";
    const supplierName = role === "supplier" ? ($("supplierIdentity")?.value.trim() || "") : "";
    if (role === "supplier" && !supplierName) {
      setAuthStatus(t("authSupplierRequired"), "error");
      return;
    }
    const button = $("submitAccessRequestBtn");
    setAuthBusy(button, true);
    setAuthStatus(t("authRequesting"));
    const payload = {
      user_id: authSession.user.id,
      email: authSession.user.email,
      requested_role: role,
      supplier_name: supplierName || null,
      status: "pending",
      reviewed_by: null,
      reviewed_at: null
    };
    const { data, error } = await supabaseClient
      .from("access_requests")
      .upsert(payload, { onConflict: "user_id" })
      .select("user_id, email, requested_role, supplier_name, status, created_at, reviewed_at")
      .single();
    setAuthBusy(button, false);
    if (error) {
      setAuthStatus(`${t("authFailed")}: ${error.message}`, "error");
      return;
    }
    authRequest = data;
    setAccessState();
    setAuthStatus(t("authRequestSaved"), "success");
  }

  function renderApprovalRequests() {
    const list = $("approvalList");
    const empty = $("approvalEmpty");
    if (!list || !empty) return;
    empty.classList.toggle("visible", approvalRequests.length === 0);
    list.innerHTML = approvalRequests.map((request) => {
      const identity = request.requested_role === "ja"
        ? t("jaIdentity")
        : `${t("supplierIdentity")} · ${escapeHtml(request.supplier_name || "")}`;
      const date = new Date(request.created_at).toLocaleString(currentLang === "zh" ? "zh-CN" : "en-US");
      return `<article class="approval-item">
        <div class="approval-meta">
          <strong>${escapeHtml(request.email || request.user_id)}</strong>
          <p>${identity} · ${escapeHtml(date)}</p>
        </div>
        <div class="approval-actions">
          <button class="button mini" type="button" data-review-user="${escapeHtml(request.user_id)}" data-review-decision="rejected">${t("approvalReject")}</button>
          <button class="button primary mini" type="button" data-review-user="${escapeHtml(request.user_id)}" data-review-decision="approved">${t("approvalApprove")}</button>
        </div>
      </article>`;
    }).join("");
  }

  async function loadApprovalRequests() {
    if (!supabaseClient || authProfile?.role !== "ja") return;
    const { data, error } = await supabaseClient
      .from("access_requests")
      .select("user_id, email, requested_role, supplier_name, status, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (error) throw error;
    approvalRequests = data || [];
    renderApprovalRequests();
  }

  async function reviewAccessRequest(userId, decision, button) {
    setAuthBusy(button, true);
    const { error } = await supabaseClient.rpc("review_access_request", {
      request_user_id: userId,
      decision
    });
    setAuthBusy(button, false);
    if (error) {
      setCloudStatus(`${t("approvalFailed")}: ${error.message}`);
      return;
    }
    await loadApprovalRequests();
  }

  function sessionExpired(session) {
    const signedInAt = Date.parse(session?.user?.last_sign_in_at || "");
    return Number.isFinite(signedInAt) && Date.now() - signedInAt > SESSION_MAX_AGE_MS;
  }

  async function applySession(session) {
    if (session?.user && sessionExpired(session)) {
      await supabaseClient.auth.signOut();
      authSession = null;
      authProfile = null;
      authRequest = null;
      state = defaultState();
      setAccessState();
      setAuthStatus(t("authExpired"), "error");
      return;
    }
    authSession = session;
    authProfile = null;
    authRequest = null;
    if (!session?.user) {
      state = defaultState();
      setAuthStatus(t("loginRequired"));
      setAccessState();
      return;
    }
    try {
      authProfile = await loadUserProfile(session.user);
      if (!authProfile || authProfile.active === false) {
        authRequest = await loadAccessRequest(session.user);
        const statusKey = authRequest?.status === "rejected" ? "authRejected" : (authRequest ? "authWaiting" : "loginRequired");
        setAuthStatus(t(statusKey), authRequest?.status === "rejected" ? "error" : "");
        setAccessState();
        return;
      }
      state = authProfile.role === "supplier" ? emptyState() : defaultState();
      setAuthStatus(`${t("authReady")}：${authProfile.display_name || session.user.email || session.user.id}`);
      setAccessState();
      await loadCloudState();
      if (authProfile.role === "ja") await loadApprovalRequests();
    } catch (error) {
      setAuthStatus(`${t("authFailed")}: ${error.message}`, "error");
      setAccessState();
    }
  }

  async function loadAuthState() {
    if (!supabaseClient) {
      setAuthStatus(t("cloudNoConfig"));
      setAccessState();
      return;
    }
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    await applySession(data.session);
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        setTimeout(() => applySession(session).catch((authError) => setAuthStatus(`${t("authFailed")}：${authError.message}`)), 0);
      }
    });
  }

  function scheduleCloudSave() {
    if (!supabaseClient || suppressCloudSave) return;
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = setTimeout(() => {
      saveCloudState().catch((error) => setCloudStatus(`${t("cloudSavingFailed")}：${error.message}`));
    }, 600);
  }

  async function saveCloudState() {
    if (!supabaseClient || !authProfile) return;
    const ownRecordId = scopeRecordId();
    const recordIds = authProfile.role === "ja"
      ? [...new Set(["default", ...loadedCloudDatasets.keys()])]
      : [ownRecordId];
    const payload = recordIds.map((id) => {
      const existing = loadedCloudDatasets.get(id) || {};
      const fabrics = state.fabrics
        .filter((fabric) => (fabric._cloudRecordId || ownRecordId) === id)
        .map((fabric) => {
          const copy = { ...fabric };
          delete copy._cloudRecordId;
          return copy;
        });
      const isDefault = id === "default";
      const data = isDefault ? { ...state, fabrics, savedQuotes: [] } : { ...existing.data, fabrics };
      return {
        id,
        data,
        scope: isDefault ? "ja" : "supplier",
        supplier_name: isDefault ? null : existing.supplier_name || decodeURIComponent(id.replace(/^supplier:/, "")),
        updated_at: new Date().toISOString()
      };
    });
    const { error } = await supabaseClient
      .from(cloudTable)
      .upsert(payload, { onConflict: "id" });
    if (error) throw error;
    setCloudStatus(`${t("cloudSaved")}：${new Date().toLocaleString(currentLang === "zh" ? "zh-CN" : "en-US")}`);
  }

  async function loadCloudState() {
    if (!supabaseClient || !authProfile) {
      setCloudStatus(t("cloudNoConfig"));
      return;
    }
    setCloudStatus(t("cloudLoading"));
    let query = supabaseClient
      .from(cloudTable)
      .select("id, data, updated_at, scope, supplier_name");
    if (authProfile.role !== "ja") query = query.eq("id", scopeRecordId());
    const { data, error } = await query;
    if (error) throw error;

    if (Array.isArray(data) && data.length) {
      suppressCloudSave = true;
      const base = authProfile.role === "supplier" ? emptyState() : defaultState();
      loadedCloudDatasets = new Map(data.map((record) => [record.id, record]));
      const primary = data.find((record) => record.id === scopeRecordId()) || data.find((record) => record.id === "default");
      state = { ...base, ...(primary?.data || {}), savedQuotes: [] };
      state.fabrics = data.flatMap((record) => (record.data?.fabrics || []).map((fabric) => ({ ...fabric, _cloudRecordId: record.id })));
      suppressCloudSave = false;
      init();
      const latest = data.map((record) => record.updated_at).filter(Boolean).sort().at(-1);
      setCloudStatus(`${t("cloudLoaded")}：${latest ? compactDate(latest) : t("justNow")}`);
      return;
    }

    loadedCloudDatasets = new Map();
    await saveCloudState();
  }

  function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function inputNum(input, fallback = 0) {
    return num(input.value, fallback);
  }

  function pct(value) {
    return `${(num(value) * 100).toFixed(1)}%`;
  }

  function text(value) {
    return value == null ? "" : String(value);
  }

  function normalize(value) {
    return text(value).toLowerCase().trim();
  }

  function escapeHtml(value) {
    return text(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function dateStamp() {
    const d = new Date();
    const pad = (v) => String(v).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  }

  function compactDate(value) {
    return new Intl.DateTimeFormat(currentLang === "zh" ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  }

  function dateOnly(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (item) => String(item).padStart(2, "0");
    return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
  }

  function netUsdFromRmb(rmb, assumptions = currentAssumptions()) {
    if (!num(rmb)) return 0;
    return num(rmb) / (1 + num(assumptions.vat)) / num(assumptions.fx, 1);
  }

  function rmbFromNetUsd(usd, assumptions = currentAssumptions()) {
    if (!num(usd)) return 0;
    return num(usd) * (1 + num(assumptions.vat)) * num(assumptions.fx, 1);
  }

  function sortedSupplierQuotes(fabric) {
    const quotes = Array.isArray(fabric.supplierQuotes)
      ? fabric.supplierQuotes.filter((quote) => num(quote.rmbPerM))
      : [];
    if (!quotes.length && num(fabric.rmbPerM)) {
      quotes.push({
        supplier: fabric.bestSupplier || fabric.mill || "手动输入",
        rmbPerKg: fabric.rmbPerKg || "",
        rmbPerM: fabric.rmbPerM,
        source: t("tabFabrics"),
        note: ""
      });
    }
    quotes.sort((a, b) => num(a.rmbPerM) - num(b.rmbPerM));
    return quotes;
  }

  function bestSupplierQuote(fabric) {
    return sortedSupplierQuotes(fabric)[0] || null;
  }

  function bestFabricPrice(fabric) {
    return fabric.rmbPerM || bestSupplierQuote(fabric)?.rmbPerM || "";
  }

  function bestFabricSupplier(fabric) {
    return bestSupplierQuote(fabric)?.supplier || fabric.bestSupplier || fabric.mill || "";
  }

  function quoteLabel(quote) {
    const supplier = text(quote?.supplier);
    const variant = text(quote?.variant);
    if (currentLang === "en") return displayText(variant) || t("quote");
    return variant ? `${supplier}（${variant}）` : supplier;
  }

  function cleanFabricName(value) {
    const name = text(value).trim();
    if (name === "未命名面料" || name.toLowerCase() === "unnamed fabric") return "";
    return name
      .replace(/[（(]\s*(?:素色|印花|再生涤纶|solid|print|recycled polyester)(?:\s*[/／]\s*(?:素色|印花|再生涤纶|solid|print|recycled polyester))*\s*[）)]/gi, "")
      .trim();
  }

  function cleanMatch(value) {
    return text(value).replaceAll("对应", "").replace(/\s+/g, " ").trim();
  }

  function displayText(value) {
    let display = text(value);
    if (currentLang !== "en") return display;
    [
      ["GU 原始面料", "GU Original Fabric"],
      ["原始面料", "Original Fabric"],
      ["再生涤纶", "Recycled Polyester"],
      ["素色", "Solid"],
      ["印花", "Print"],
      ["对应", ""]
    ].forEach(([from, to]) => {
      display = display.replaceAll(from, to);
    });
    return display.replace(/\s+/g, " ").trim();
  }

  function dictionaryFabricName(name) {
    let result = cleanFabricName(name);
    [...fabricNameDictionary].sort((a, b) => b[0].length - a[0].length).forEach(([zh, en]) => {
      result = result.replaceAll(zh, en);
    });
    return result === cleanFabricName(name) && /[\u4e00-\u9fff]/.test(result) ? "" : result;
  }

  function fabricNameZh(fabric) {
    return cleanFabricName(fabric?.nameZh || fabric?.name);
  }

  function fabricNameEn(fabric) {
    return cleanFabricName(fabric?.nameEn || fabric?.nameEnUs || "") || dictionaryFabricName(fabricNameZh(fabric));
  }

  function localizedFabricName(fabric) {
    const zh = fabricNameZh(fabric);
    const en = fabricNameEn(fabric);
    return currentLang === "zh" ? (zh || en) : (en || zh);
  }

  function fabricVariants(fabric) {
    const variants = [];
    const pushVariant = (value) => {
      const variant = text(value).trim();
      if (variant && !variants.includes(variant)) variants.push(variant);
    };

    pushVariant(fabric?.process);
    (fabric?.supplierQuotes || []).forEach((quote) => pushVariant(quote?.variant));
    (fabric?.marketReferenceQuotes || []).forEach((quote) => pushVariant(quote?.variant));
    return variants;
  }

  function fabricDisplayName(fabric) {
    return displayText(localizedFabricName(fabric));
  }

  function supplierWithVariant(supplier, fabric, quote = null) {
    const supplierName = text(supplier).trim();
    if (!supplierName) return "";
    const variant = displayText(quote ? quote.variant : fabric?.process);
    return variant ? `${supplierName}（${variant}）` : supplierName;
  }

  function weightNumber(value) {
    const match = text(value).match(/(\d+(?:\.\d+)?)/);
    return match ? num(match[1]) : 0;
  }

  function gsmFromOz(oz) {
    return num(oz) * GSM_PER_OZ;
  }

  function ozFromGsm(gsm) {
    return num(gsm) / GSM_PER_OZ;
  }

  function formatGsm(gsm) {
    const value = num(gsm);
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  function formatOz(oz) {
    return num(oz).toFixed(2);
  }

  function parseGsm(value) {
    const valueText = text(value);
    const gsmMatch = valueText.match(/(\d+(?:\.\d+)?)\s*(?:gsm|g\/m|g\/m²|g\/m2)/i);
    if (gsmMatch) return num(gsmMatch[1]);
    const ozMatch = valueText.match(/(\d+(?:\.\d+)?)\s*oz/i);
    if (ozMatch) return gsmFromOz(ozMatch[1]);
    return weightNumber(valueText);
  }

  function parseOz(value) {
    const valueText = text(value);
    const ozMatch = valueText.match(/(\d+(?:\.\d+)?)\s*oz/i);
    if (ozMatch) return num(ozMatch[1]);
    const gsm = parseGsm(valueText);
    return gsm ? ozFromGsm(gsm) : 0;
  }

  function fabricWeightGsm(fabric) {
    return num(fabric?.weightGsm) || parseGsm(fabric?.weight);
  }

  function fabricWeightOz(fabric) {
    return num(fabric?.weightOz) || parseOz(fabric?.weight);
  }

  function formatWeightDisplay(weightText, weightOzValue = "") {
    const gsm = parseGsm(weightText);
    const oz = num(weightOzValue) || parseOz(weightText);
    if (!gsm && !oz) return text(weightText).trim();
    if (gsm && oz) return `${formatGsm(gsm)} GSM / ${formatOz(oz)} oz`;
    if (gsm) return `${formatGsm(gsm)} GSM / ${formatOz(ozFromGsm(gsm))} oz`;
    return `${formatGsm(gsmFromOz(oz))} GSM / ${formatOz(oz)} oz`;
  }

  function formatWidthDisplay(widthCm) {
    const cm = num(widthCm);
    if (!cm) return "";
    const inch = cm / 2.54;
    return `${cm.toFixed(1)} cm / ${inch.toFixed(1)} inch`;
  }

  function formatColorName(value) {
    return text(value)
      .trim()
      .replace(/\b([A-Za-z])([A-Za-z]*)\b/g, (_, first, rest) => `${first.toUpperCase()}${rest.toLowerCase()}`);
  }

  function formatCompositionText(value) {
    return text(value)
      .trim()
      .replace(/[A-Za-z]+/g, (word) => {
        if (word.length <= 4 && word === word.toUpperCase()) return word;
        return `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`;
      });
  }

  function fabricSpecCards(fabric) {
    const cards = [];
    const pushCard = (label, value) => {
      const textValue = text(value).trim();
      if (textValue) cards.push({ label, value: textValue });
    };

    pushCard(t("filterWeight"), formatWeightDisplay(fabric.weight, fabric.weightOz));
    pushCard(t("fabricWidthLabel"), formatWidthDisplay(fabric.widthCm));
    pushCard(t("color"), formatColorName(fabric.colorway));
    return cards;
  }

  function uniqueSortedValues(values) {
    const items = new Map();
    values.forEach((value) => {
      const clean = text(value).trim();
      if (clean) items.set(normalize(clean), clean);
    });
    return [...items.values()].sort((a, b) => a.localeCompare(b, currentLang === "zh" ? "zh-CN" : "en-US", { numeric: true, sensitivity: "base" }));
  }

  function splitFilterTokens(value) {
    return text(value)
      .split(/[\/,，、;；]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function matchesFilterValue(haystack, filterValue) {
    const textValue = normalize(haystack);
    const needles = text(filterValue).split("||").map(normalize).filter(Boolean);
    return !needles.length || needles.some((needle) => textValue.includes(needle));
  }

  function compositionFilterOptions() {
    const candidates = [
      { zh: "棉 / Cotton", en: "Cotton", terms: ["cotton", "棉"] },
      { zh: "BCI 棉 / BCI Cotton", en: "BCI Cotton", terms: ["bci cotton", "bci"] },
      { zh: "涤纶 / Polyester", en: "Polyester", terms: ["polyester", "涤纶"] },
      { zh: "再生涤纶 / Recycled Polyester", en: "Recycled Polyester", terms: ["re-polyester", "recycled polyester", "再生涤纶"] },
      { zh: "人棉 / Rayon", en: "Rayon", terms: ["rayon", "人棉"] },
      { zh: "粘胶 / Viscose", en: "Viscose", terms: ["viscose", "粘胶"] },
      { zh: "腈纶 / Acrylic", en: "Acrylic", terms: ["acrylic", "腈纶"] },
      { zh: "氨纶 / Spandex / Elastane / PU", en: "Spandex / Elastane / PU", terms: ["spandex", "elastane", "pu", "氨纶"] },
      { zh: "锦纶 / Nylon", en: "Nylon", terms: ["nylon", "锦纶"] }
    ];
    return candidates
      .filter((option) => state.fabrics.some((fabric) => matchesFilterValue(fabric.composition, option.terms.join("||"))))
      .map((option) => ({ label: currentLang === "zh" ? option.zh : option.en, value: option.terms.join("||") }));
  }

  function setFilterOptions(id, allKey, options) {
    const select = $(id);
    if (!select) return;
    const previous = select.value;
    select.replaceChildren();
    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = t(allKey);
    select.appendChild(allOption);

    options.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.value ?? item;
      option.textContent = item.label ?? item;
      select.appendChild(option);
    });
    select.value = [...select.options].some((option) => option.value === previous) ? previous : "";
  }

  function renderFabricFilterOptions() {
    setFilterOptions("fabricFilterSupplier", "allSuppliers", uniqueSortedValues(state.fabrics.flatMap((fabric) => [
      fabric.mill,
      fabric.bestSupplier,
      ...(fabric.supplierQuotes || []).map((quote) => quote.supplier),
      ...(fabric.marketReferenceQuotes || []).map((quote) => quote.supplier)
    ])));
    setFilterOptions("fabricFilterComposition", "allCompositions", compositionFilterOptions());
    setFilterOptions("fabricFilterWeight", "allWeights", uniqueSortedValues(state.fabrics.map((fabric) => formatWeightDisplay(fabric.weight, fabric.weightOz))));
    setFilterOptions("fabricFilterWidth", "allWidths", uniqueSortedValues(state.fabrics.map((fabric) => formatWidthDisplay(fabric.widthCm))));
    setFilterOptions("fabricFilterColor", "allColors", uniqueSortedValues(state.fabrics.map((fabric) => fabric.colorway)).map((value) => ({ label: formatColorName(value), value })));
    setFilterOptions("fabricFilterProcess", "allProcesses", uniqueSortedValues(state.fabrics.flatMap((fabric) => fabricVariants(fabric).flatMap(splitFilterTokens))).map((value) => ({ label: displayText(value), value })));
  }

  function fabricFilterValue(id) {
    return normalize($(id)?.value || "");
  }

  function fabricMatchesFilters(fabric) {
    const keyword = normalize($("fabricSearch").value);
    const supplierFilter = currentLang === "zh" ? fabricFilterValue("fabricFilterSupplier") : "";
    const compositionFilter = fabricFilterValue("fabricFilterComposition");
    const weightFilter = fabricFilterValue("fabricFilterWeight");
    const widthFilter = fabricFilterValue("fabricFilterWidth");
    const colorFilter = fabricFilterValue("fabricFilterColor");
    const processFilter = fabricFilterValue("fabricFilterProcess");
    const supplierText = normalize([
      fabric.mill,
      fabric.bestSupplier,
      ...(fabric.supplierQuotes || []).map((quote) => quoteLabel(quote)),
      ...(fabric.marketReferenceQuotes || []).map((quote) => quoteLabel(quote))
    ].join(" "));
    const widthText = normalize([
      fabric.widthCm ?? "",
      formatWidthDisplay(fabric.widthCm),
      fabric.widthCm ? `${num(fabric.widthCm).toFixed(1)} cm` : ""
    ].join(" "));
    const processText = normalize(fabricVariants(fabric).join(" / "));

    return (
      (!keyword || fabricSearchText(fabric).includes(keyword)) &&
      (!supplierFilter || matchesFilterValue(supplierText, supplierFilter)) &&
      (!compositionFilter || matchesFilterValue(fabric.composition, compositionFilter)) &&
      (!weightFilter || matchesFilterValue(formatWeightDisplay(fabric.weight, fabric.weightOz), weightFilter) || matchesFilterValue(fabric.weight, weightFilter) || matchesFilterValue(fabric.weightOz, weightFilter)) &&
      (!widthFilter || matchesFilterValue(widthText, widthFilter)) &&
      (!colorFilter || matchesFilterValue(fabric.colorway, colorFilter)) &&
      (!processFilter || matchesFilterValue(processText, processFilter))
    );
  }

  function smartFabricRows() {
    return state.fabrics
      .map((fabric, index) => ({ fabric, order: fabricSortOrder(fabric, index) }))
      .sort((a, b) => {
        if (a.order.group !== b.order.group) return a.order.group - b.order.group;
        if (a.order.value !== b.order.value) return a.order.value - b.order.value;
        return text(a.fabric.id).localeCompare(text(b.fabric.id), "zh-CN", { numeric: true });
      })
      .map((item) => item.fabric);
  }

  function fabricSearchText(fabric) {
    const values = [
      fabric.id,
      fabricNameZh(fabric),
      fabricNameEn(fabric),
      fabric.composition,
      fabric.weight,
      fabric.weightOz,
      fabric.widthCm,
      fabric.colorway,
      fabric.process,
      cleanMatch(fabric.match),
      fabric.style,
      fabric.sampleStatus
    ];
    if (currentLang === "zh") {
      values.push(
        fabric.mill,
        fabric.bestSupplier,
        ...(fabric.supplierQuotes || []).map((quote) => [quoteLabel(quote), quote.rmbPerM, quote.rmbPerKg, quote.note].join(" ")),
        ...(fabric.marketReferenceQuotes || []).map((quote) => [quoteLabel(quote), quote.rmbPerM, quote.rmbPerKg, quote.note].join(" "))
      );
    }
    return normalize(values.join(" "));
  }

  function imageEntrySrc(entry) {
    return typeof entry === "string" ? entry : text(entry?.src || entry?.url);
  }

  function imageEntryNote(entry) {
    return typeof entry === "string" ? "" : text(entry?.note || entry?.caption || entry?.remark);
  }

  function normalizeImageEntry(entry) {
    const src = imageEntrySrc(entry);
    if (!src) return null;
    const note = imageEntryNote(entry);
    return note ? { src, note } : src;
  }

  function fabricImageEntries(fabric) {
    if (!Array.isArray(fabric?.images)) return [];
    return fabric.images.map(normalizeImageEntry).filter(Boolean);
  }

  function fabricImages(fabric) {
    return fabricImageEntries(fabric).map(imageEntrySrc).filter(Boolean);
  }

  function setFabricImageEntries(fabric, entries) {
    fabric.images = entries.map(normalizeImageEntry).filter(Boolean);
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(text(reader.result));
      reader.onerror = () => reject(reader.error || new Error(`Failed to read ${file.name}`));
      reader.readAsDataURL(file);
    });
  }

  async function readFabricImageUploads() {
    const input = fabricFields.images;
    const files = input?.files ? Array.from(input.files).filter((file) => file.type.startsWith("image/")) : [];
    const pasted = fabricImagePasteBuffer.length ? [...fabricImagePasteBuffer] : [];
    if (!files.length && !pasted.length) return [];
    const selected = files.length ? await Promise.all(files.map(fileToDataUrl)) : [];
    return [...pasted, ...selected];
  }

  function fabricKey(fabric) {
    return fabric?.rowKey || fabric?.id || "";
  }

  function fabricSortOrder(fabric, fallbackIndex = 0) {
    const rowMatch = text(fabric?.rowKey).match(/__row(\d+)$/);
    const explicitOrder = Number(fabric?.excelOrder);
    if (rowMatch && Number.isFinite(explicitOrder)) return { group: 0, value: explicitOrder };
    if (rowMatch) return { group: 0, value: Number(rowMatch[1]) };
    const created = Date.parse(fabric?.createdAt || fabric?.addedAt || "");
    if (Number.isFinite(created)) return { group: 1, value: created };
    return { group: 1, value: Number.isFinite(fallbackIndex) && fallbackIndex >= 0 ? fallbackIndex : 999999 };
  }

  function nextFabricOrder() {
    return state.fabrics.reduce((maxOrder, fabric) => Math.max(maxOrder, Number(fabric.excelOrder) || 0), 0) + 1;
  }

  function findFabric(key) {
    return state.fabrics.find((item) => fabricKey(item) === key) || state.fabrics.find((item) => item.id === key);
  }

  function openFabricImages(key) {
    const fabric = findFabric(key);
    const images = fabric ? fabricImageEntries(fabric) : [];
    if (!fabric || !images.length) return;

    imageDialogFabricKey = fabricKey(fabric);
    $("fabricImageTitle").textContent = `${fabric.id} ${fabricDisplayName(fabric)}`.trim();
    $("fabricImageMeta").textContent = [formatCompositionText(fabric.composition), formatWeightDisplay(fabric.weight, fabric.weightOz), formatWidthDisplay(fabric.widthCm), formatColorName(fabric.colorway), displayText(fabric.process)].filter(Boolean).join(" · ");
    $("fabricImageGrid").innerHTML = images.map((entry, index) => {
      const src = imageEntrySrc(entry);
      const note = imageEntryNote(entry);
      return `
      <figure class="image-editor-card" data-image-index="${index}">
        <img src="${escapeHtml(src)}" alt="${escapeHtml(`${fabric.id} ${t("fabricImages")} ${index + 1}`)}" loading="lazy">
        <figcaption>
          <div class="image-caption-row">
            <span>${t("imageCaption")} ${index + 1}</span>
            <button class="button danger mini" data-action="delete-fabric-image" data-image-index="${index}" type="button">${t("deleteImage")}</button>
          </div>
          <label class="image-note-field">
            <span>${t("imageNote")}</span>
            <textarea data-action="update-fabric-image-note" data-image-index="${index}" placeholder="${t("imageNotePlaceholder")}">${escapeHtml(note)}</textarea>
          </label>
        </figcaption>
      </figure>
    `;
    }).join("");
    $("fabricImageDialog").hidden = false;
    document.body.classList.add("modal-open");
  }

  function closeFabricImages() {
    const dialog = $("fabricImageDialog");
    if (!dialog) return;
    dialog.hidden = true;
    $("fabricImageGrid").innerHTML = "";
    imageDialogFabricKey = null;
    document.body.classList.remove("modal-open");
  }

  function updateFabricImageNote(index, note) {
    const fabric = findFabric(imageDialogFabricKey);
    if (!fabric) return;
    const entries = fabricImageEntries(fabric);
    const entry = entries[index];
    if (!entry) return;
    const src = imageEntrySrc(entry);
    const cleanNote = text(note);
    entries[index] = cleanNote ? { src, note: cleanNote } : src;
    setFabricImageEntries(fabric, entries);
    saveState();
    setCloudStatus(t("imageUpdatedSyncing"));
  }

  function deleteFabricImage(index) {
    const fabric = findFabric(imageDialogFabricKey);
    if (!fabric) return;
    const entries = fabricImageEntries(fabric);
    entries.splice(index, 1);
    setFabricImageEntries(fabric, entries);
    saveState();
    renderAll();
    setCloudStatus(t("imageUpdatedSyncing"));
    if (entries.length) {
      openFabricImages(fabricKey(fabric));
    } else {
      closeFabricImages();
    }
  }

  function metersPerKg(widthCm, weightText) {
    const widthM = num(widthCm) / 100;
    const gsm = parseGsm(weightText);
    if (!widthM || !gsm) return 0;
    return 1000 / widthM / gsm;
  }

  function rmbPerMFromKg(rmbPerKg, widthCm, weightText) {
    const mpk = metersPerKg(widthCm, weightText);
    return mpk ? num(rmbPerKg) / mpk : 0;
  }

  function rmbPerKgFromM(rmbPerM, widthCm, weightText) {
    const mpk = metersPerKg(widthCm, weightText);
    return mpk ? num(rmbPerM) * mpk : 0;
  }

  function updateFabricConversion(changedField) {
    const mpk = metersPerKg(fabricFields.widthCm.value, fabricFields.weight.value);
    fabricFields.metersPerKg.value = mpk ? `${mpk.toFixed(4)} m/kg` : "";
    $("fabricConversionHint").textContent = mpk
      ? t("conversionLive", { mpk: mpk.toFixed(4) })
      : t("conversionDefault");

    if (!mpk || syncingFabricLibraryPrice) return;
    syncingFabricLibraryPrice = true;

    if ((changedField === "kg" || changedField === "basis") && fabricFields.rmbPerKg.value !== "") {
      fabricFields.rmbPerM.value = rmbPerMFromKg(fabricFields.rmbPerKg.value, fabricFields.widthCm.value, fabricFields.weight.value).toFixed(2);
    } else if ((changedField === "m" || changedField === "basis") && fabricFields.rmbPerM.value !== "") {
      fabricFields.rmbPerKg.value = rmbPerKgFromM(fabricFields.rmbPerM.value, fabricFields.widthCm.value, fabricFields.weight.value).toFixed(2);
    }

    syncingFabricLibraryPrice = false;
  }

  function editableSupplierQuotes(fabric = {}) {
    const quotes = Array.isArray(fabric.supplierQuotes) ? fabric.supplierQuotes.map((quote) => ({ ...quote })) : [];
    if (!quotes.length && (text(fabric.mill || fabric.bestSupplier) || fabric.rmbPerKg !== "" || fabric.rmbPerM !== "")) {
      quotes.push({
        supplier: fabric.mill || fabric.bestSupplier || "",
        variant: fabric.process || "",
        rmbPerKg: fabric.rmbPerKg ?? "",
        rmbPerM: fabric.rmbPerM ?? "",
        source: currentLang === "zh" ? "手动编辑" : "Manual edit",
        note: ""
      });
    }
    return quotes.length ? quotes : [{ supplier: "", variant: "", rmbPerKg: "", rmbPerM: "", source: "", note: "" }];
  }

  function supplierQuoteRowHtml(quote = {}, index = 0) {
    return `
      <div class="supplier-quote-row" data-quote-index="${index}">
        <label>
          <span>${escapeHtml(t("supplier"))}</span>
          <input data-quote-field="supplier" type="text" value="${escapeHtml(quote.supplier || "")}">
        </label>
        <label>
          <span>${escapeHtml(t("supplierQuoteVariant"))}</span>
          <input data-quote-field="variant" type="text" value="${escapeHtml(quote.variant || "")}">
        </label>
        <label>
          <span>RMB/kg</span>
          <input data-quote-field="rmbPerKg" type="number" step="0.01" min="0" value="${escapeHtml(quote.rmbPerKg ?? "")}">
        </label>
        <label>
          <span>RMB/m</span>
          <input data-quote-field="rmbPerM" type="number" step="0.01" min="0" value="${escapeHtml(quote.rmbPerM ?? "")}">
        </label>
        <label class="supplier-quote-note">
          <span>${escapeHtml(t("supplierQuoteNote"))}</span>
          <input data-quote-field="note" type="text" value="${escapeHtml(quote.note || "")}">
        </label>
        <button class="button ghost supplier-quote-remove" data-action="remove-supplier-quote" type="button">${escapeHtml(t("removeSupplierQuote"))}</button>
      </div>
    `;
  }

  function renderSupplierQuoteEditor(fabric = {}) {
    if (!fabricFields.supplierQuoteList) return;
    fabricFields.supplierQuoteList.innerHTML = editableSupplierQuotes(fabric).map(supplierQuoteRowHtml).join("");
  }

  function readSupplierQuoteEditor(widthCm, weightText) {
    const rows = Array.from(fabricFields.supplierQuoteList?.querySelectorAll(".supplier-quote-row") || []);
    const quotes = rows.map((row) => {
      const value = (field) => row.querySelector(`[data-quote-field="${field}"]`)?.value.trim() || "";
      let kg = value("rmbPerKg") === "" ? "" : num(value("rmbPerKg"));
      let meter = value("rmbPerM") === "" ? "" : num(value("rmbPerM"));
      if (meter === "" && kg !== "") meter = rmbPerMFromKg(kg, widthCm, weightText);
      if (kg === "" && meter !== "") kg = rmbPerKgFromM(meter, widthCm, weightText);
      return {
        supplier: value("supplier"),
        variant: value("variant"),
        rmbPerKg: kg === "" || !Number.isFinite(Number(kg)) ? "" : Number(Number(kg).toFixed(2)),
        rmbPerM: meter === "" || !Number.isFinite(Number(meter)) ? "" : Number(Number(meter).toFixed(2)),
        source: currentLang === "zh" ? "手动编辑" : "Manual edit",
        note: value("note")
      };
    }).filter((quote) => quote.supplier || quote.variant || quote.rmbPerKg !== "" || quote.rmbPerM !== "" || quote.note);

    return quotes.sort((a, b) => {
      const aPrice = a.rmbPerM === "" ? Number.POSITIVE_INFINITY : num(a.rmbPerM);
      const bPrice = b.rmbPerM === "" ? Number.POSITIVE_INFINITY : num(b.rmbPerM);
      return aPrice - bPrice;
    });
  }

  function syncSupplierQuoteRow(row, changedField) {
    if (!row) return;
    const kgInput = row.querySelector('[data-quote-field="rmbPerKg"]');
    const meterInput = row.querySelector('[data-quote-field="rmbPerM"]');
    if (!kgInput || !meterInput) return;
    if (changedField === "rmbPerKg" && kgInput.value !== "") {
      const meter = rmbPerMFromKg(kgInput.value, fabricFields.widthCm.value, fabricFields.weight.value);
      if (meter) meterInput.value = meter.toFixed(2);
    }
    if (changedField === "rmbPerM" && meterInput.value !== "") {
      const kg = rmbPerKgFromM(meterInput.value, fabricFields.widthCm.value, fabricFields.weight.value);
      if (kg) kgInput.value = kg.toFixed(2);
    }
  }

  function refreshSupplierQuoteRowsFromBasis() {
    Array.from(fabricFields.supplierQuoteList?.querySelectorAll(".supplier-quote-row") || []).forEach((row) => {
      const kgInput = row.querySelector('[data-quote-field="rmbPerKg"]');
      const meterInput = row.querySelector('[data-quote-field="rmbPerM"]');
      if (kgInput?.value) syncSupplierQuoteRow(row, "rmbPerKg");
      else if (meterInput?.value) syncSupplierQuoteRow(row, "rmbPerM");
    });
  }

  function syncPrimaryFieldsFromSupplierQuotes(record, quotes) {
    if (!quotes.length) {
      record.supplierQuotes = [];
      return;
    }
    const best = quotes.find((quote) => quote.rmbPerM !== "") || quotes[0];
    record.supplierQuotes = quotes;
    record.rmbPerKg = best.rmbPerKg;
    record.rmbPerM = best.rmbPerM;
    record.bestSupplier = best.supplier;
    record.mill = best.supplier || record.mill;
    fabricFields.mill.value = record.mill || "";
    fabricFields.rmbPerKg.value = record.rmbPerKg ?? "";
    fabricFields.rmbPerM.value = record.rmbPerM ?? "";
  }

  function syncFirstSupplierQuoteFromPrimary() {
    if (!fabricFields.supplierQuoteList) return;
    let row = fabricFields.supplierQuoteList.querySelector(".supplier-quote-row");
    if (!row) {
      fabricFields.supplierQuoteList.insertAdjacentHTML("beforeend", supplierQuoteRowHtml({}, 0));
      row = fabricFields.supplierQuoteList.querySelector(".supplier-quote-row");
    }
    row.querySelector('[data-quote-field="supplier"]').value = fabricFields.mill.value;
    row.querySelector('[data-quote-field="variant"]').value = fabricFields.process.value;
    row.querySelector('[data-quote-field="rmbPerKg"]').value = fabricFields.rmbPerKg.value;
    row.querySelector('[data-quote-field="rmbPerM"]').value = fabricFields.rmbPerM.value;
  }

  function updateFabricWeight(changedField) {
    if (syncingFabricWeight) return;
    syncingFabricWeight = true;
    if (changedField === "gsm") {
      const gsm = inputNum(fabricFields.weight);
      fabricFields.weightOz.value = fabricFields.weight.value === "" || !gsm ? "" : formatOz(ozFromGsm(gsm));
    }
    if (changedField === "oz") {
      const oz = inputNum(fabricFields.weightOz);
      fabricFields.weight.value = fabricFields.weightOz.value === "" || !oz ? "" : formatGsm(gsmFromOz(oz));
    }
    syncingFabricWeight = false;
    updateFabricConversion("basis");
  }

  function clearFabricImageInput() {
    if (fabricFields.images) fabricFields.images.value = "";
    fabricImagePasteBuffer = [];
  }

  async function handleFabricImagePaste(event) {
    const form = $("fabricForm");
    const target = event.target instanceof Element ? event.target : null;
    if (!form || form.hidden || (target && !form.contains(target) && !form.contains(document.activeElement))) return;
    const clipboard = event.clipboardData;
    if (!clipboard?.items?.length) return;
    const files = Array.from(clipboard.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (!files.length) return;
    event.preventDefault();
    const pasted = await Promise.all(files.map(fileToDataUrl));
    fabricImagePasteBuffer.push(...pasted);
  }

  function currentAssumptions() {
    return {
      ...state.assumptions,
      fx: inputNum(quoteFields.fx, state.assumptions.fx),
      vat: inputNum(quoteFields.vat, state.assumptions.vat * 100) / 100,
      margin: inputNum(quoteFields.margin, state.assumptions.margin * 100) / 100
    };
  }

  function trimItemUsd(item, assumptions = currentAssumptions()) {
    return num(item.rmbUnit) * num(item.qty) / (1 + num(assumptions.vat)) / num(assumptions.fx, 1);
  }

  function trimSummary(block, assumptions = currentAssumptions()) {
    const result = { sew: 0, pack: 0, guComputed: 0, miss: 0 };
    (block?.items || []).forEach((item) => {
      const cost = trimItemUsd(item, assumptions);
      if (item.group === "SEW") result.sew += cost;
      if (item.group === "PACK") result.pack += cost;
      if (item.group === "GU") result.guComputed += cost;
      if (item.group === "MISS") result.miss += cost;
    });
    result.guFixed = num(assumptions.guDesignatedUsd, 0.17);
    result.totalForCosting = result.sew + result.pack + result.guFixed;
    return result;
  }

  function trimBlockForStyle(styleText) {
    const key = text(styleText);
    if (key.includes("277H118D")) return state.trims.find((b) => b.styleNo === "277H118D");
    if (key.includes("277FWL-39") || key.toLowerCase().includes("hoodie")) return state.trims.find((b) => b.styleNo === "277FWL-39");
    if (key.includes("277FWL-40") || key.toLowerCase().includes("lounge")) return state.trims.find((b) => b.styleNo === "277FWL-40");
    if (key.includes("277FWL-44") || key.toLowerCase().includes("skirt")) return state.trims.find((b) => b.styleNo === "277FWL-44");
    if (key.includes("277FWL-47") || key.toLowerCase().includes("pant")) return state.trims.find((b) => b.styleNo === "277FWL-47");
    return null;
  }

  function targetForLine(line) {
    const base = text(line.baseStyle).toLowerCase();
    const garment = text(line.garment).toLowerCase();
    if (base.includes("39") || garment.includes("hood")) return 5.5;
    if (base.includes("40") && garment.includes("set")) return 6.8;
    if (base.includes("40")) return 2.8;
    if (base.includes("44") || garment.includes("skirt")) return 3;
    if (base.includes("47") || garment.includes("pant")) return 4;
    return 0;
  }

  function calculateQuote(input) {
    const fabricCost = num(input.consumptionM) * num(input.fabricPriceUsdM);
    const directCost = fabricCost + num(input.trimsUsd) + num(input.cmtUsd) + num(input.testingUsd) + num(input.packingUsd) + num(input.logisticsUsd) + num(input.liningUsd);
    const fob = round2(directCost * (1 + num(input.margin)));
    const gap = fob - num(input.targetFob);
    const gapPct = num(input.targetFob) ? fob / num(input.targetFob) - 1 : 0;
    const maxFabricPrice = num(input.consumptionM)
      ? ((num(input.targetFob) / (1 + num(input.margin))) - (num(input.trimsUsd) + num(input.cmtUsd) + num(input.testingUsd) + num(input.packingUsd) + num(input.logisticsUsd) + num(input.liningUsd))) / num(input.consumptionM)
      : 0;
    return { fabricCost, directCost, fob, gap, gapPct, maxFabricPrice };
  }

  function round2(value) {
    return Math.round((num(value) + Number.EPSILON) * 100) / 100;
  }

  function currentQuoteInput() {
    const assumptions = currentAssumptions();
    return {
      id: selectedQuote?.id || "",
      fabric: quoteFields.fabric.value.trim(),
      garment: quoteFields.garment.value.trim(),
      baseStyle: quoteFields.base.value.trim(),
      targetFob: inputNum(quoteFields.target),
      consumptionM: inputNum(quoteFields.consumption),
      widthCm: inputNum(quoteFields.width),
      fabricPriceUsdM: inputNum(quoteFields.fabricUsd),
      fabricPriceRmbM: inputNum(quoteFields.fabricRmb),
      trimsUsd: inputNum(quoteFields.trims),
      cmtUsd: inputNum(quoteFields.cmt),
      testingUsd: inputNum(quoteFields.testing),
      packingUsd: 0,
      logisticsUsd: inputNum(quoteFields.logistics),
      liningUsd: inputNum(quoteFields.lining),
      margin: assumptions.margin,
      fx: assumptions.fx,
      vat: assumptions.vat,
      note: quoteFields.note.value.trim()
    };
  }

  function fillQuoteForm(line) {
    selectedQuote = line;
    const assumptions = currentAssumptions();
    quoteFields.line.value = line.id;
    quoteFields.fabricSelect.value = "";
    quoteFields.fabric.value = line.fabric || "";
    quoteFields.garment.value = line.garment || "";
    quoteFields.base.value = line.baseStyle || "";
    quoteFields.target.value = targetForLine(line) || "";
    quoteFields.consumption.value = line.consumptionM || "";
    quoteFields.width.value = line.widthCm || "";
    quoteFields.fabricUsd.value = line.fabricPriceUsdM || "";
    quoteFields.fabricRmb.value = line.fabricPriceUsdM ? rmbFromNetUsd(line.fabricPriceUsdM, assumptions).toFixed(2) : "";
    quoteFields.trims.value = line.trimsUsd || 0;
    quoteFields.cmt.value = line.cmtUsd || 0;
    quoteFields.testing.value = line.testingUsd ?? state.assumptions.testingUsd;
    quoteFields.logistics.value = line.logisticsUsd ?? state.assumptions.logisticsUsd;
    quoteFields.lining.value = 0;
    quoteFields.margin.value = (state.assumptions.margin * 100).toFixed(2);
    quoteFields.fx.value = state.assumptions.fx;
    quoteFields.vat.value = (state.assumptions.vat * 100).toFixed(2);
    quoteFields.note.value = "";
    updateQuoteCalculation();
  }

  function updateQuoteCalculation() {
    const input = currentQuoteInput();
    const result = calculateQuote(input);
    $("fabricCostOut").textContent = usd4.format(result.fabricCost);
    $("directCostOut").textContent = usd4.format(result.directCost);
    $("fobOut").textContent = usd2.format(result.fob);
    $("gapOut").textContent = `${result.gap >= 0 ? "+" : ""}${usd2.format(result.gap)}`;
    $("gapOut").className = result.gap <= 0 ? "status-good" : "status-bad";
    $("gapPctOut").textContent = `${result.gapPct >= 0 ? "+" : ""}${pct(result.gapPct)}`;
    $("gapPctOut").className = result.gapPct <= 0 ? "status-good" : "status-bad";
    $("maxFabricOut").textContent = `${usd4.format(result.maxFabricPrice)}/m (${rmb2.format(rmbFromNetUsd(result.maxFabricPrice, input))}/m)`;
    $("formulaOut").textContent = t("directFormula", {
      fabricCost: usd4.format(result.fabricCost),
      trims: usd4.format(input.trimsUsd),
      cmt: usd4.format(input.cmtUsd),
      factor: (1 + input.margin).toFixed(4)
    });
  }

  function renderOptions() {
    quoteFields.line.innerHTML = "";
    state.quoteLines.forEach((line) => {
      const option = document.createElement("option");
      option.value = line.id;
      option.textContent = `${line.id} · ${line.fabric} / ${line.garment}`;
      quoteFields.line.appendChild(option);
    });

    renderQuoteFabricOptions();

    $("trimBlock").innerHTML = "";
    state.trims.forEach((block) => {
      const option = document.createElement("option");
      option.value = block.styleNo;
      option.textContent = `${block.styleNo} · ${block.name}`;
      $("trimBlock").appendChild(option);
    });
  }

  function renderQuoteFabricOptions() {
    const previous = quoteFields.fabricSelect.value;
    quoteFields.fabricSelect.innerHTML = "";

    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = t("notLinked");
    quoteFields.fabricSelect.appendChild(blank);

    smartFabricRows().forEach((fabric) => {
      const option = document.createElement("option");
      option.value = fabricKey(fabric);
      const width = formatWidthDisplay(fabric.widthCm) || t("widthTbd");
      const best = bestSupplierQuote(fabric);
      const supplier = currentLang === "zh" ? supplierWithVariant(best?.supplier || fabric.bestSupplier || fabric.mill, fabric, best) : "";
      const price = bestFabricPrice(fabric) ? `${rmb2.format(bestFabricPrice(fabric))}/m` : t("priceTbd");
      option.textContent = [fabric.id, fabricDisplayName(fabric), width, price, supplier].filter(Boolean).join(" · ");
      quoteFields.fabricSelect.appendChild(option);
    });

    if (state.fabrics.some((fabric) => fabricKey(fabric) === previous)) {
      quoteFields.fabricSelect.value = previous;
    }
  }

  function applyFabricToQuote(key) {
    const fabric = findFabric(key);
    if (!fabric) return;
    const assumptions = currentAssumptions();
    quoteFields.fabric.value = `${fabric.id} ${fabricDisplayName(fabric)}`.trim();
    quoteFields.width.value = fabric.widthCm || "";
    const price = bestFabricPrice(fabric);
    quoteFields.fabricRmb.value = price || "";
    quoteFields.fabricUsd.value = price ? netUsdFromRmb(price, assumptions).toFixed(4) : "";
    updateQuoteCalculation();
  }

  function renderMetrics() {
    $("lineCount").textContent = state.quoteLines.length;
    $("fabricCount").textContent = state.fabrics.length;
    $("targetCount").textContent = state.targetRows.length;
    $("savedCount").textContent = state.savedQuotes.length;
  }

  function renderQuoteRows() {
    const tbody = $("quoteRows");
    const keyword = normalize($("quoteSearch").value);
    const rows = state.quoteLines.filter((line) => normalize([line.fabric, line.garment, line.baseStyle].join(" ")).includes(keyword));
    tbody.innerHTML = "";
    rows.forEach((line) => {
      const input = {
        ...line,
        targetFob: targetForLine(line),
        margin: state.assumptions.margin,
        packingUsd: 0,
        liningUsd: 0
      };
      const calc = calculateQuote(input);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(line.id)}</td>
        <td>${escapeHtml(line.fabric)}</td>
        <td>${escapeHtml(line.garment)}</td>
        <td>${escapeHtml(line.baseStyle)}</td>
        <td class="num">${num(line.consumptionM).toFixed(3)}</td>
        <td class="num">${usd4.format(line.fabricPriceUsdM)}</td>
        <td class="num">${usd4.format(line.trimsUsd)}</td>
        <td class="num">${usd4.format(line.cmtUsd)}</td>
        <td class="num">${usd2.format(calc.fob)}</td>
        <td><div class="row-actions"><button class="button secondary" type="button" data-action="use-line" data-id="${line.id}">${t("use")}</button></div></td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderTargetRows() {
    const tbody = $("targetRows");
    const assumptions = currentAssumptions();
    tbody.innerHTML = "";
    state.targetRows.forEach((row) => {
      const adjustedConsumption = row.useSizeMix ? row.consumptionM * num(assumptions.sizeMixFactor, 1) : row.consumptionM;
      const block = trimBlockForStyle(`${row.style} ${row.guStyleNo}`);
      const trims = block ? trimSummary(block, assumptions).totalForCosting : 0;
      const input = {
        targetFob: row.targetFob,
        consumptionM: adjustedConsumption,
        fabricPriceUsdM: row.fabricPriceUsdM,
        trimsUsd: trims,
        cmtUsd: row.cmtUsd,
        testingUsd: row.testingUsd,
        packingUsd: row.packingUsd,
        logisticsUsd: row.logisticsUsd,
        liningUsd: row.style.includes("277H118D") ? row.liningUsd * num(assumptions.liningUsdM, 0) : num(row.liningUsd),
        margin: assumptions.margin
      };
      const calc = calculateQuote(input);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(row.style)}</td>
        <td>${escapeHtml(row.guStyleNo)}</td>
        <td class="num">${usd2.format(row.targetFob)}</td>
        <td class="num">${adjustedConsumption.toFixed(4)}</td>
        <td class="num">${usd4.format(row.fabricPriceUsdM)}</td>
        <td class="num">${usd4.format(calc.fabricCost)}</td>
        <td class="num">${usd4.format(trims)}</td>
        <td class="num">${usd4.format(row.cmtUsd)}</td>
        <td class="num">${usd4.format(calc.directCost)}</td>
        <td class="num">${usd2.format(calc.fob)}</td>
        <td class="num ${calc.gap <= 0 ? "status-good" : "status-bad"}">${calc.gap >= 0 ? "+" : ""}${usd2.format(calc.gap)}</td>
        <td class="num">${usd4.format(calc.maxFabricPrice)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderFabricRows() {
    const container = $("fabricRows");
    const assumptions = currentAssumptions();
    const rows = smartFabricRows().filter(fabricMatchesFilters);
    container.innerHTML = "";

    if (!rows.length) {
      container.innerHTML = `<p class="empty visible">${t("noFabricResults")}</p>`;
      return;
    }

    rows.forEach((fabric) => {
        const best = bestSupplierQuote(fabric);
        const higherQuotes = sortedSupplierQuotes(fabric).slice(1);
        const bestPrice = bestFabricPrice(fabric);
        const supplier = currentLang === "zh" ? supplierWithVariant(best?.supplier || fabric.bestSupplier || fabric.mill, fabric, best) : "";
        const higherHtml = higherQuotes.length
          ? `<div class="quote-stack">${higherQuotes.map((quote) => `<span class="quote-chip">${escapeHtml(quoteLabel(quote))} ${rmb2.format(quote.rmbPerM)}/m</span>`).join("")}</div>`
          : `<span class="muted-cell">${t("noAlternatives")}</span>`;
        const imageCount = fabricImages(fabric).length;
        const key = escapeHtml(fabricKey(fabric));
        const displayName = escapeHtml(fabricDisplayName(fabric));
        const specCards = fabricSpecCards(fabric);
        const addedDate = dateOnly(fabric.createdAt || fabric.addedAt);
        const specHtml = specCards.length
          ? `<div class="fabric-spec-grid">${specCards.map((item) => `
              <div class="fabric-spec-card">
                <span class="section-kicker">${escapeHtml(item.label)}</span>
                <p class="fabric-composition">${escapeHtml(item.value)}</p>
              </div>
            `).join("")}</div>`
          : "";
        const imageButton = imageCount
          ? `<button class="button secondary image-button" data-action="view-fabric-images" data-id="${key}" type="button">${t("viewImages")}</button>`
          : `<button class="button ghost image-button" type="button" disabled>${t("noImages")}</button>`;
        const card = document.createElement("article");
        card.className = "fabric-card";
        card.innerHTML = `
          <div class="fabric-card-head">
            <div>
              <div class="fabric-id">${escapeHtml(fabric.id)}</div>
              <h3>${displayName}</h3>
            </div>
            ${supplier ? `<div class="supplier-pill"><strong>${escapeHtml(supplier)}</strong><span>${t("lowest")}</span></div>` : ""}
          </div>

          <div class="fabric-price-row">
            <div>
              <span>${t("rmbM")}</span>
              <strong>${bestPrice ? rmb2.format(bestPrice) : "TBD"}</strong>
            </div>
            <div>
              <span>${t("usdNet")}</span>
              <strong>${bestPrice ? usd4.format(netUsdFromRmb(bestPrice, assumptions)) : "TBD"}</strong>
            </div>
          </div>

          <div class="fabric-card-section">
            <span class="section-kicker">${t("composition")}</span>
            <p class="fabric-composition">${escapeHtml(formatCompositionText(fabric.composition) || "-")}</p>
          </div>

          ${specHtml}

          <div class="fabric-card-section">
            <span class="section-kicker">${t("alternatives")}</span>
            ${higherHtml}
          </div>

          <div class="fabric-card-meta">
            ${addedDate ? `<span>${t("addedDate")}：${escapeHtml(addedDate)}</span>` : ""}
            ${cleanMatch(fabric.match) ? `<span>${t("match")}：${escapeHtml(displayText(cleanMatch(fabric.match)))}</span>` : ""}
          </div>

          <div class="fabric-card-actions">
            ${imageButton}
            <button class="button secondary" data-action="edit-fabric" data-id="${key}" type="button">${t("edit")}</button>
            <button class="button ghost" data-action="delete-fabric" data-id="${key}" type="button">${t("delete")}</button>
          </div>
        `;
        container.appendChild(card);
      });
  }

  function readFabricForm() {
    const existing = findFabric(selectedFabricKey) || state.fabrics.find((fabric) => fabric.id === fabricFields.id.value.trim()) || {};
    const existingIndex = state.fabrics.findIndex((fabric) => fabricKey(fabric) === fabricKey(existing));
    const isExistingExcelFabric = fabricKey(existing) && /__row\d+$/.test(text(existing.rowKey));
    const gsmValue = fabricFields.weight.value === "" ? "" : inputNum(fabricFields.weight);
    const ozValue = fabricFields.weightOz.value === "" ? (gsmValue === "" ? "" : ozFromGsm(gsmValue)) : inputNum(fabricFields.weightOz);
    const weightText = gsmValue === "" ? "" : `${formatGsm(gsmValue)} GSM`;
    const widthCm = fabricFields.widthCm.value === "" ? "" : inputNum(fabricFields.widthCm);
    const record = {
      _cloudRecordId: existing._cloudRecordId || (authProfile?.role === "supplier" ? scopeRecordId() : "default"),
      rowKey: existing.rowKey || fabricFields.id.value.trim(),
      id: fabricFields.id.value.trim(),
      name: fabricFields.nameZh.value.trim(),
      nameZh: fabricFields.nameZh.value.trim(),
      nameEn: existing.nameEn || dictionaryFabricName(fabricFields.nameZh.value.trim()),
      composition: fabricFields.composition.value.trim(),
      construction: existing.construction || "",
      weight: weightText,
      weightGsm: gsmValue,
      weightOz: ozValue,
      widthCm,
      colorway: fabricFields.colorway.value.trim(),
      process: fabricFields.process.value.trim(),
      mill: fabricFields.mill.value.trim(),
      rmbPerKg: fabricFields.rmbPerKg.value === "" ? "" : inputNum(fabricFields.rmbPerKg),
      rmbPerM: fabricFields.rmbPerM.value === "" ? "" : inputNum(fabricFields.rmbPerM),
      bestSupplier: existing.bestSupplier || fabricFields.mill.value.trim(),
      supplierQuotes: [],
      marketReferenceQuotes: existing.marketReferenceQuotes || [],
      style: existing.style || "",
      sampleStatus: existing.sampleStatus || "",
      rawPrice: existing.rawPrice || "",
      actualPrice: existing.actualPrice || "",
      factoryKgPrice: existing.factoryKgPrice || "",
      factoryMPrice: existing.factoryMPrice || "",
      match: cleanMatch(fabricFields.match.value)
    };
    const supplierQuotes = readSupplierQuoteEditor(widthCm, weightText);
    if (!supplierQuotes.length && (record.mill || record.rmbPerKg !== "" || record.rmbPerM !== "")) {
      supplierQuotes.push({
        supplier: record.mill,
        variant: record.process,
        rmbPerKg: record.rmbPerKg,
        rmbPerM: record.rmbPerM,
        source: currentLang === "zh" ? "手动编辑" : "Manual edit",
        note: ""
      });
    }
    syncPrimaryFieldsFromSupplierQuotes(record, supplierQuotes);
    if (isExistingExcelFabric) record.excelOrder = existing.excelOrder || nextFabricOrder();
    record.createdAt = existing.createdAt || new Date().toISOString();
    return record;
  }

  function setFabricForm(fabric = {}, options = {}) {
    const clearImages = options.clearImages ?? true;
    selectedFabricKey = Object.prototype.hasOwnProperty.call(options, "selectedKey") ? options.selectedKey : fabricKey(fabric) || null;
    fabricFields.id.value = fabric.id || "";
    fabricFields.nameZh.value = fabricNameZh(fabric);
    if (fabricFields.nameEn) fabricFields.nameEn.value = fabricNameEn(fabric);
    fabricFields.composition.value = fabric.composition || "";
    const gsm = fabricWeightGsm(fabric);
    const oz = fabricWeightOz(fabric);
    fabricFields.weight.value = gsm ? formatGsm(gsm) : "";
    fabricFields.weightOz.value = oz ? formatOz(oz) : "";
    fabricFields.widthCm.value = fabric.widthCm ?? "";
    fabricFields.colorway.value = fabric.colorway || "";
    fabricFields.process.value = fabric.process || "";
    fabricFields.mill.value = authProfile?.role === "supplier" ? (authProfile.supplier_name || "") : (fabric.mill || "");
    fabricFields.rmbPerKg.value = fabric.rmbPerKg ?? "";
    fabricFields.rmbPerM.value = fabric.rmbPerM ?? "";
    fabricFields.match.value = cleanMatch(fabric.match);
    renderSupplierQuoteEditor(fabric);
    if (clearImages) clearFabricImageInput();
    updateFabricConversion("basis");
    $("fabricFormTitle").textContent = selectedFabricKey ? t("editFabric") : t("newFabric");
  }

  function showFabricForm(fabric = {}) {
    fabricFormDraft = null;
    setFabricForm(fabric);
    $("fabricForm").hidden = false;
    $("fabricManager").classList.remove("form-hidden");
    $("fabricLibId").focus();
  }

  function showNewFabricForm() {
    if (fabricFormDraft) {
      fabricImagePasteBuffer = [...fabricFormDraft.pastedImages];
      setFabricForm(fabricFormDraft.record, { clearImages: false, selectedKey: fabricFormDraft.selectedFabricKey });
    } else {
      setFabricForm({});
    }
    $("fabricForm").hidden = false;
    $("fabricManager").classList.remove("form-hidden");
    $("fabricLibId").focus();
  }

  function hideFabricForm() {
    $("fabricForm").hidden = true;
    $("fabricManager").classList.add("form-hidden");
  }

  function resetFabricForm() {
    selectedFabricKey = null;
    fabricFormDraft = null;
    setFabricForm({});
    hideFabricForm();
  }

  function clearFabricForm() {
    selectedFabricKey = null;
    fabricFormDraft = null;
    setFabricForm({});
    $("fabricLibId").focus();
  }

  function backFabricForm() {
    resetFabricForm();
  }

  function draftFabricForm() {
    fabricFormDraft = {
      selectedFabricKey,
      record: readFabricForm(),
      pastedImages: [...fabricImagePasteBuffer]
    };
    hideFabricForm();
    setCloudStatus(t("fabricDrafted"));
  }

  function saveFabricRecord(record) {
    const index = state.fabrics.findIndex((fabric) => fabricKey(fabric) === (selectedFabricKey || record.rowKey));
    if (index >= 0) {
      if (/__row\d+$/.test(text(state.fabrics[index].rowKey))) {
        record.excelOrder = Number(state.fabrics[index].excelOrder) || nextFabricOrder();
      } else {
        delete record.excelOrder;
      }
      record.createdAt = state.fabrics[index].createdAt || record.createdAt || new Date().toISOString();
      state.fabrics[index] = record;
    } else {
      record.rowKey = record.rowKey || record.id;
      delete record.excelOrder;
      record.createdAt = record.createdAt || new Date().toISOString();
      state.fabrics.push(record);
    }
    saveState();
    resetFabricForm();
    renderAll();
    setCloudStatus(t("fabricSavedSyncing"));
  }

  function renderTrimRows() {
    const styleNo = $("trimBlock").value || state.trims[0]?.styleNo;
    const block = state.trims.find((item) => item.styleNo === styleNo) || state.trims[0];
    const assumptions = currentAssumptions();
    const summary = trimSummary(block, assumptions);
    $("trimSewOut").textContent = usd4.format(summary.sew);
    $("trimPackOut").textContent = usd4.format(summary.pack);
    $("trimGuOut").textContent = usd4.format(summary.guFixed);
    $("trimTotalOut").textContent = usd4.format(summary.totalForCosting);

    const tbody = $("trimRows");
    tbody.innerHTML = "";
    (block?.items || []).forEach((item) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(item.item)}</td>
        <td class="num">${num(item.rmbUnit).toFixed(4)}</td>
        <td>${escapeHtml(item.uom)}</td>
        <td class="num">${num(item.qty).toFixed(4)}</td>
        <td class="num">${usd4.format(trimItemUsd(item, assumptions))}</td>
        <td>${escapeHtml(item.group)}</td>
        <td>${escapeHtml(item.notes)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderSavedRows() {
    const tbody = $("savedRows");
    tbody.innerHTML = "";
    state.savedQuotes.forEach((quote) => {
      const calc = quote.result || calculateQuote(quote.input);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${compactDate(quote.createdAt)}</td>
        <td>${escapeHtml(quote.input.fabric)}</td>
        <td>${escapeHtml(quote.input.garment)}</td>
        <td class="num">${num(quote.input.consumptionM).toFixed(4)}</td>
        <td class="num">${usd4.format(quote.input.fabricPriceUsdM)}</td>
        <td class="num">${usd4.format(calc.directCost)}</td>
        <td class="num">${usd2.format(calc.fob)}</td>
        <td class="num ${calc.gap <= 0 ? "status-good" : "status-bad"}">${calc.gap >= 0 ? "+" : ""}${usd2.format(calc.gap)}</td>
        <td>${escapeHtml(quote.input.note)}</td>
      `;
      tbody.appendChild(tr);
    });
    $("savedEmpty").classList.toggle("visible", state.savedQuotes.length === 0);
  }

  function renderAll() {
    const count = $("fabricCount");
    if (count) count.textContent = state.fabrics.length;
    renderFabricFilterOptions();
    renderFabricRows();
  }

  function switchTab(name) {
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
    document.querySelectorAll(".workspace").forEach((panel) => panel.classList.remove("active"));
    $(`${name}Panel`).classList.add("active");
  }

  function toCsv(rows) {
    return rows.map((row) => row.map((cell) => {
      const value = text(cell).replaceAll('"', '""');
      return /[",\n\r]/.test(value) ? `"${value}"` : value;
    }).join(",")).join("\r\n");
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportBackup() {
    download(`GU成本报价工具备份-${dateStamp()}.json`, JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), data: state }, null, 2), "application/json;charset=utf-8");
  }

  function exportRows(filename, rows) {
    download(`${filename}-${dateStamp()}.csv`, "\uFEFF" + toCsv(rows), "text/csv;charset=utf-8");
  }

  function exportQuoteCsv() {
    const rows = [["ID", "Fabric", "Garment", "Base style", "Consumption m", "Width cm", "Fabric USD/m", "Trims", "CMT", "FOB"]];
    state.quoteLines.forEach((line) => {
      const calc = calculateQuote({ ...line, targetFob: targetForLine(line), margin: state.assumptions.margin, packingUsd: 0, liningUsd: 0 });
      rows.push([line.id, line.fabric, line.garment, line.baseStyle, line.consumptionM, line.widthCm, line.fabricPriceUsdM, line.trimsUsd, line.cmtUsd, calc.fob]);
    });
    exportRows("报价矩阵", rows);
  }

  function exportTargetCsv() {
    const rows = [["Style", "Style No.", "Target", "Consumption", "Fabric USD/m", "FOB", "Gap", "Max fabric USD/m"]];
    state.targetRows.forEach((row) => {
      const assumptions = currentAssumptions();
      const adjustedConsumption = row.useSizeMix ? row.consumptionM * num(assumptions.sizeMixFactor, 1) : row.consumptionM;
      const trims = trimSummary(trimBlockForStyle(`${row.style} ${row.guStyleNo}`), assumptions).totalForCosting;
      const input = { targetFob: row.targetFob, consumptionM: adjustedConsumption, fabricPriceUsdM: row.fabricPriceUsdM, trimsUsd: trims, cmtUsd: row.cmtUsd, testingUsd: row.testingUsd, packingUsd: row.packingUsd, logisticsUsd: row.logisticsUsd, liningUsd: row.style.includes("277H118D") ? row.liningUsd * num(assumptions.liningUsdM, 0) : row.liningUsd, margin: assumptions.margin };
      const calc = calculateQuote(input);
      rows.push([row.style, row.guStyleNo, row.targetFob, adjustedConsumption, row.fabricPriceUsdM, calc.fob, calc.gap, calc.maxFabricPrice]);
    });
    exportRows("目标FOB差距", rows);
  }

  function exportFabricCsv() {
    const rows = [["ID", "Name ZH", "Name EN", "Process/Variant", "Composition", "Weight", "Width cm", "Colorway", "Best supplier", "RMB/m", "USD/m (net VAT)", "Higher quotes", "Match"]];
    const assumptions = currentAssumptions();
    smartFabricRows().forEach((fabric) => {
      const best = bestSupplierQuote(fabric);
      const bestPrice = bestFabricPrice(fabric);
      const higher = sortedSupplierQuotes(fabric)
        .slice(1)
        .map((quote) => `${quoteLabel(quote)} ${quote.rmbPerM}/m`)
        .join(" | ");
      rows.push([fabric.id, fabricNameZh(fabric), fabricNameEn(fabric), fabricVariants(fabric).join(" / "), fabric.composition, formatWeightDisplay(fabric.weight, fabric.weightOz), fabric.widthCm, fabric.colorway, currentLang === "zh" ? supplierWithVariant(best?.supplier || fabric.bestSupplier || fabric.mill, fabric, best) : "", bestPrice, bestPrice ? netUsdFromRmb(bestPrice, assumptions) : "", higher, cleanMatch(fabric.match)]);
    });
    exportRows("面料库", rows);
  }

  function exportSavedCsv() {
    const rows = [["Created", "Fabric", "Garment", "Consumption", "Fabric USD/m", "Direct", "FOB", "Gap", "Note"]];
    state.savedQuotes.forEach((quote) => {
      const calc = quote.result || calculateQuote(quote.input);
      rows.push([compactDate(quote.createdAt), quote.input.fabric, quote.input.garment, quote.input.consumptionM, quote.input.fabricPriceUsdM, calc.directCost, calc.fob, calc.gap, quote.input.note]);
    });
    exportRows("保存报价", rows);
  }

  function bindEvents() {
    $("syncNowBtn").addEventListener("click", async () => {
      try {
        setCloudStatus(t("syncingNow"));
        await saveCloudState();
      } catch (error) {
        setCloudStatus(`${t("syncFailed")}：${error.message}`);
      }
    });

    $("languageToggle").addEventListener("click", () => {
      currentLang = currentLang === "zh" ? "en" : "zh";
      renderAll();
      updateQuoteCalculation();
      updateFabricConversion("basis");
      applyLanguage();
    });

    document.querySelector(".tabs").addEventListener("click", (event) => {
      const tab = event.target.closest(".tab");
      if (tab) switchTab(tab.dataset.tab);
    });

    quoteFields.line.addEventListener("change", () => {
      const line = state.quoteLines.find((item) => item.id === quoteFields.line.value);
      if (line) fillQuoteForm(line);
    });

    quoteFields.fabricSelect.addEventListener("change", () => {
      applyFabricToQuote(quoteFields.fabricSelect.value);
    });

    Object.values(quoteFields).forEach((field) => {
      field.addEventListener("input", () => {
        if (syncingFabricPrice) return;

        if (field === quoteFields.fabricRmb && quoteFields.fabricRmb.value !== "") {
          syncingFabricPrice = true;
          quoteFields.fabricUsd.value = netUsdFromRmb(inputNum(quoteFields.fabricRmb), currentAssumptions()).toFixed(4);
          syncingFabricPrice = false;
        }

        if (field === quoteFields.fabricUsd && quoteFields.fabricUsd.value !== "") {
          syncingFabricPrice = true;
          quoteFields.fabricRmb.value = rmbFromNetUsd(inputNum(quoteFields.fabricUsd), currentAssumptions()).toFixed(2);
          syncingFabricPrice = false;
        }

        updateQuoteCalculation();
        renderTargetRows();
        renderFabricRows();
        renderTrimRows();
      });
    });

    $("quoteForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const input = currentQuoteInput();
      const result = calculateQuote(input);
      state.savedQuotes.unshift({ id: `S-${Date.now()}`, createdAt: new Date().toISOString(), input, result });
      saveState();
      renderAll();
      switchTab("saved");
    });

    $("resetQuoteBtn").addEventListener("click", () => fillQuoteForm(state.quoteLines[0]));
    $("showFabricFormBtn").addEventListener("click", showNewFabricForm);
    $("fabricForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const record = readFabricForm();
      if (!record.id) {
        alert(t("fillFabricIdRequired"));
        return;
      }
      const uploadedImages = await readFabricImageUploads();
      const existing = findFabric(selectedFabricKey) || state.fabrics.find((fabric) => fabric.id === record.id) || {};
      const existingImages = fabricImageEntries(existing);
      const seenImages = new Set(existingImages.map(imageEntrySrc));
      const mergedImages = [...existingImages];
      uploadedImages.forEach((src) => {
        if (!src || seenImages.has(src)) return;
        seenImages.add(src);
        mergedImages.push(src);
      });
      if (mergedImages.length) record.images = mergedImages;
      saveFabricRecord(record);
    });
    document.addEventListener("paste", (event) => {
      handleFabricImagePaste(event).catch((error) => console.warn("Fabric paste upload failed", error));
    });
    $("backFabricBtn").addEventListener("click", backFabricForm);
    $("draftFabricBtn").addEventListener("click", draftFabricForm);
    $("resetFabricBtn").addEventListener("click", clearFabricForm);
    $("addSupplierQuoteBtn").addEventListener("click", () => {
      const index = fabricFields.supplierQuoteList.querySelectorAll(".supplier-quote-row").length;
      fabricFields.supplierQuoteList.insertAdjacentHTML("beforeend", supplierQuoteRowHtml({}, index));
    });
    fabricFields.supplierQuoteList.addEventListener("click", (event) => {
      const button = event.target.closest('[data-action="remove-supplier-quote"]');
      if (!button) return;
      button.closest(".supplier-quote-row")?.remove();
      if (!fabricFields.supplierQuoteList.querySelector(".supplier-quote-row")) {
        fabricFields.supplierQuoteList.insertAdjacentHTML("beforeend", supplierQuoteRowHtml({}, 0));
      }
    });
    fabricFields.supplierQuoteList.addEventListener("input", (event) => {
      const input = event.target.closest("[data-quote-field]");
      if (!input) return;
      if (input.dataset.quoteField === "rmbPerKg" || input.dataset.quoteField === "rmbPerM") {
        syncSupplierQuoteRow(input.closest(".supplier-quote-row"), input.dataset.quoteField);
      }
    });
    fabricFields.mill.addEventListener("input", syncFirstSupplierQuoteFromPrimary);
    fabricFields.process.addEventListener("input", syncFirstSupplierQuoteFromPrimary);
    fabricFields.rmbPerKg.addEventListener("input", () => {
      updateFabricConversion("kg");
      syncFirstSupplierQuoteFromPrimary();
    });
    fabricFields.rmbPerM.addEventListener("input", () => {
      updateFabricConversion("m");
      syncFirstSupplierQuoteFromPrimary();
    });
    fabricFields.widthCm.addEventListener("input", () => {
      updateFabricConversion("basis");
      refreshSupplierQuoteRowsFromBasis();
    });
    fabricFields.weight.addEventListener("input", () => {
      updateFabricWeight("gsm");
      refreshSupplierQuoteRowsFromBasis();
    });
    fabricFields.weightOz.addEventListener("input", () => {
      updateFabricWeight("oz");
      refreshSupplierQuoteRowsFromBasis();
    });
    $("quoteSearch").addEventListener("input", renderQuoteRows);
    $("fabricSearch").addEventListener("input", renderFabricRows);
    ["fabricFilterSupplier", "fabricFilterComposition", "fabricFilterWeight", "fabricFilterWidth", "fabricFilterColor", "fabricFilterProcess"].forEach((id) => {
      $(id)?.addEventListener("change", renderFabricRows);
    });
    $("clearFabricFiltersBtn").addEventListener("click", () => {
      ["fabricSearch", "fabricFilterSupplier", "fabricFilterComposition", "fabricFilterWeight", "fabricFilterWidth", "fabricFilterColor", "fabricFilterProcess"].forEach((id) => {
        const field = $(id);
        if (field) field.value = "";
      });
      renderFabricRows();
    });
    $("trimBlock").addEventListener("change", renderTrimRows);
    $("printBtn").addEventListener("click", () => window.print());
    $("exportBackupBtn").addEventListener("click", exportBackup);
    $("backupDownloadBtn").addEventListener("click", exportBackup);
    $("exportQuoteCsvBtn").addEventListener("click", exportQuoteCsv);
    $("exportTargetCsvBtn").addEventListener("click", exportTargetCsv);
    $("exportFabricCsvBtn").addEventListener("click", exportFabricCsv);
    $("exportSavedCsvBtn").addEventListener("click", exportSavedCsv);

    $("clearSavedBtn").addEventListener("click", () => {
      if (!confirm(t("confirmClearSaved"))) return;
      state.savedQuotes = [];
      saveState();
      renderAll();
    });

    $("resetAllBtn").addEventListener("click", () => {
      if (!confirm(t("confirmResetAll"))) return;
      state = defaultState();
      saveState();
      init();
    });

    $("importBackupBtn").addEventListener("click", () => {
      const file = $("backupFile").files[0];
      if (!file) {
        alert(t("chooseBackup"));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const payload = JSON.parse(reader.result);
          const data = payload.data || payload;
          if (!Array.isArray(data.quoteLines) || !Array.isArray(data.fabrics)) throw new Error(t("badBackup"));
          if (!confirm(t("confirmImport"))) return;
          state = { ...defaultState(), ...data, savedQuotes: Array.isArray(data.savedQuotes) ? data.savedQuotes : [] };
          saveState();
          init();
          alert(t("importDone"));
        } catch (error) {
          alert(`${t("importFailed")}：${error.message}`);
        }
      };
      reader.readAsText(file, "utf-8");
    });

    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) return;

      if (button.dataset.action === "use-line") {
        const line = state.quoteLines.find((item) => item.id === button.dataset.id);
        if (line) {
          fillQuoteForm(line);
          switchTab("calculator");
        }
      }

      if (button.dataset.action === "edit-fabric") {
        const fabric = findFabric(button.dataset.id);
        if (fabric) {
          showFabricForm(fabric);
          $("fabricLibNameZh").focus();
        }
      }

      if (button.dataset.action === "view-fabric-images") {
        openFabricImages(button.dataset.id);
      }

      if (button.dataset.action === "delete-fabric") {
        const fabric = findFabric(button.dataset.id);
        if (!fabric) return;
        const fabricLabel = [fabric.id, fabricDisplayName(fabric)].filter(Boolean).join(" / ");
        if (!confirm(t("confirmDeleteFabric", { fabric: fabricLabel }))) return;
        state.fabrics = state.fabrics.filter((item) => fabricKey(item) !== fabricKey(fabric));
        saveState();
        renderAll();
        setCloudStatus(t("fabricDeletedSyncing"));
      }

      if (button.dataset.action === "close-fabric-images") {
        closeFabricImages();
      }

      if (button.dataset.action === "delete-fabric-image") {
        deleteFabricImage(Number(button.dataset.imageIndex));
      }
    });

    document.addEventListener("change", (event) => {
      const field = event.target.closest?.('[data-action="update-fabric-image-note"]');
      if (field) updateFabricImageNote(Number(field.dataset.imageIndex), field.value);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeFabricImages();
    });
  }

  function bindFabricEvents() {
    $("syncNowBtn")?.addEventListener("click", async () => {
      try {
        setCloudStatus(t("syncingNow"));
        await saveCloudState();
      } catch (error) {
        setCloudStatus(`${t("syncFailed")}：${error.message}`);
      }
    });

    $("languageToggle")?.addEventListener("click", () => {
      currentLang = currentLang === "zh" ? "en" : "zh";
      renderAll();
      applyLanguage();
      setAccessState();
      if (!authSession) setAuthStatus(t("loginRequired"));
      if (authSession && !authProfile) {
        const statusKey = authRequest?.status === "rejected" ? "authRejected" : (authRequest ? "authWaiting" : "loginRequired");
        setAuthStatus(t(statusKey), authRequest?.status === "rejected" ? "error" : "");
      }
    });

    $("identityType")?.addEventListener("change", () => {
      const isSupplier = $("identityType").value === "supplier";
      $("supplierIdentityWrap")?.toggleAttribute("hidden", !isSupplier);
      if ($("supplierIdentity")) $("supplierIdentity").required = isSupplier;
    });
    $("emailLoginForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      sendEmailOtp().catch((error) => setAuthStatus(`${t("authFailed")}: ${error.message}`, "error"));
    });
    $("otpVerifyForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      verifyEmailOtp().catch((error) => setAuthStatus(`${t("authFailed")}: ${error.message}`, "error"));
    });
    $("resendOtpBtn")?.addEventListener("click", () => sendEmailOtp().catch((error) => setAuthStatus(`${t("authFailed")}: ${error.message}`, "error")));
    $("changeEmailBtn")?.addEventListener("click", () => {
      otpAwaiting = false;
      otpEmail = "";
      setAccessState();
      setAuthStatus("");
      $("authEmail")?.focus();
    });
    $("accessRequestForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      submitAccessRequest().catch((error) => setAuthStatus(`${t("authFailed")}: ${error.message}`, "error"));
    });
    $("logoutBtn")?.addEventListener("click", async () => {
      if (supabaseClient) await supabaseClient.auth.signOut();
      otpAwaiting = false;
      otpEmail = "";
    });
    $("refreshApprovalsBtn")?.addEventListener("click", () => loadApprovalRequests().catch((error) => setCloudStatus(`${t("approvalFailed")}: ${error.message}`)));
    $("approvalList")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-review-user]");
      if (!button) return;
      reviewAccessRequest(button.dataset.reviewUser, button.dataset.reviewDecision, button)
        .catch((error) => setCloudStatus(`${t("approvalFailed")}: ${error.message}`));
    });

    $("showFabricFormBtn")?.addEventListener("click", showNewFabricForm);
    $("fabricForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const record = readFabricForm();
      if (!record.id) {
        alert(t("fillFabricIdRequired"));
        return;
      }
      const uploadedImages = await readFabricImageUploads();
      const existing = findFabric(selectedFabricKey) || state.fabrics.find((fabric) => fabric.id === record.id) || {};
      const existingImages = fabricImageEntries(existing);
      const seenImages = new Set(existingImages.map(imageEntrySrc));
      const mergedImages = [...existingImages];
      uploadedImages.forEach((src) => {
        if (!src || seenImages.has(src)) return;
        seenImages.add(src);
        mergedImages.push(src);
      });
      if (mergedImages.length) record.images = mergedImages;
      saveFabricRecord(record);
    });

    document.addEventListener("paste", (event) => {
      handleFabricImagePaste(event).catch((error) => console.warn("Fabric paste upload failed", error));
    });
    $("backFabricBtn")?.addEventListener("click", backFabricForm);
    $("draftFabricBtn")?.addEventListener("click", draftFabricForm);
    $("resetFabricBtn")?.addEventListener("click", clearFabricForm);
    $("addSupplierQuoteBtn")?.addEventListener("click", () => {
      const index = fabricFields.supplierQuoteList.querySelectorAll(".supplier-quote-row").length;
      fabricFields.supplierQuoteList.insertAdjacentHTML("beforeend", supplierQuoteRowHtml({}, index));
    });
    fabricFields.supplierQuoteList?.addEventListener("click", (event) => {
      const button = event.target.closest('[data-action="remove-supplier-quote"]');
      if (!button) return;
      button.closest(".supplier-quote-row")?.remove();
      if (!fabricFields.supplierQuoteList.querySelector(".supplier-quote-row")) {
        fabricFields.supplierQuoteList.insertAdjacentHTML("beforeend", supplierQuoteRowHtml({}, 0));
      }
    });
    fabricFields.supplierQuoteList?.addEventListener("input", (event) => {
      const input = event.target.closest("[data-quote-field]");
      if (!input) return;
      if (input.dataset.quoteField === "rmbPerKg" || input.dataset.quoteField === "rmbPerM") {
        syncSupplierQuoteRow(input.closest(".supplier-quote-row"), input.dataset.quoteField);
      }
    });
    fabricFields.mill?.addEventListener("input", syncFirstSupplierQuoteFromPrimary);
    fabricFields.process?.addEventListener("input", syncFirstSupplierQuoteFromPrimary);
    fabricFields.rmbPerKg?.addEventListener("input", () => { updateFabricConversion("kg"); syncFirstSupplierQuoteFromPrimary(); });
    fabricFields.rmbPerM?.addEventListener("input", () => { updateFabricConversion("m"); syncFirstSupplierQuoteFromPrimary(); });
    fabricFields.widthCm?.addEventListener("input", () => { updateFabricConversion("basis"); refreshSupplierQuoteRowsFromBasis(); });
    fabricFields.weight?.addEventListener("input", () => { updateFabricWeight("gsm"); refreshSupplierQuoteRowsFromBasis(); });
    fabricFields.weightOz?.addEventListener("input", () => { updateFabricWeight("oz"); refreshSupplierQuoteRowsFromBasis(); });
    $("fabricSearch")?.addEventListener("input", renderFabricRows);
    ["fabricFilterSupplier", "fabricFilterComposition", "fabricFilterWeight", "fabricFilterWidth", "fabricFilterColor", "fabricFilterProcess"].forEach((id) => {
      $(id)?.addEventListener("change", renderFabricRows);
    });
    $("clearFabricFiltersBtn")?.addEventListener("click", () => {
      ["fabricSearch", "fabricFilterSupplier", "fabricFilterComposition", "fabricFilterWeight", "fabricFilterWidth", "fabricFilterColor", "fabricFilterProcess"].forEach((id) => { if ($(id)) $(id).value = ""; });
      renderFabricRows();
    });
    $("exportFabricCsvBtn")?.addEventListener("click", exportFabricCsv);

    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) return;
      if (button.dataset.action === "edit-fabric") {
        const fabric = findFabric(button.dataset.id);
        if (fabric) { showFabricForm(fabric); $("fabricLibNameZh")?.focus(); }
      }
      if (button.dataset.action === "view-fabric-images") openFabricImages(button.dataset.id);
      if (button.dataset.action === "delete-fabric") {
        const fabric = findFabric(button.dataset.id);
        if (!fabric) return;
        const fabricLabel = [fabric.id, fabricDisplayName(fabric)].filter(Boolean).join(" / ");
        if (!confirm(t("confirmDeleteFabric", { fabric: fabricLabel }))) return;
        state.fabrics = state.fabrics.filter((item) => fabricKey(item) !== fabricKey(fabric));
        saveState();
        renderAll();
        setCloudStatus(t("fabricDeletedSyncing"));
      }
      if (button.dataset.action === "close-fabric-images") closeFabricImages();
      if (button.dataset.action === "delete-fabric-image") deleteFabricImage(Number(button.dataset.imageIndex));
    });
    document.addEventListener("change", (event) => {
      const field = event.target.closest?.('[data-action="update-fabric-image-note"]');
      if (field) updateFabricImageNote(Number(field.dataset.imageIndex), field.value);
    });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeFabricImages(); });
  }

  function init() {
    renderAll();
    applyLanguage();
  }

  bindFabricEvents();
  init();
  setAuthStatus(t("authLoading"));
  loadAuthState().catch((error) => setAuthStatus(`${t("authFailed")}：${error.message}`));
})();

