const defaultBaseUrl = String(process.env.PLM_BASE_URL || "http://172.16.100.225").replace(/\/$/, "");
const defaultTimeoutMs = Number(process.env.PLM_SYNC_TIMEOUT_MS || 30000);
const defaultRootUrl = String(process.env.PLM_ROOT_URL || "C243138").trim();
const defaultScopeName = String(process.env.PLM_SCOPE_NAME || "CoZ").trim().toLowerCase();

function cookiesFrom(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  return values.flatMap((value) => String(value).split(/,(?=\s*[A-Za-z0-9_-]+=)/))
    .map((value) => value.split(";", 1)[0].trim()).filter(Boolean).join("; ");
}

async function requestJson(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`Centric PLM returned HTTP ${response.status}`);
    return { response, payload: await response.json() };
  } finally {
    clearTimeout(timeout);
  }
}

async function createPlmClient({ baseUrl, username, password, timeoutMs }) {
  if (!username || !password) throw new Error("PLM_USERNAME and PLM_PASSWORD are required");
  const loginUrl = new URL("/csi-requesthandler/RequestHandler", baseUrl);
  loginUrl.search = new URLSearchParams({ Module: "DataSource", Operation: "SimpleLogin", OutputJSON: "2" });
  const login = await requestJson(loginUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Accept: "application/json" },
    body: new URLSearchParams({ LoginID: username, Password: password })
  }, timeoutMs);
  if (login.payload?.Status !== "Successful") throw new Error(`Centric PLM login failed: ${login.payload?.Error || "unknown error"}`);
  const cookie = cookiesFrom(login.response);
  if (!cookie) throw new Error("Centric PLM login did not return a session cookie");

  const cache = new Map();
  async function getNode(plmUrl) {
    if (cache.has(plmUrl)) return cache.get(plmUrl);
    const url = new URL("/csi-requesthandler/RequestHandler", baseUrl);
    url.search = new URLSearchParams({
      "Fmt.Version": "2", "Crew.Scope": "Result", "Fmt.Crew": "Name",
      "Fmt.AC.Rights": "Current", "Fmt.Attr.Info": "Mid", "Qry.URL": plmUrl,
      Module: "Search", Operation: "QueryByURL", OutputJSON: "2"
    });
    const { payload } = await requestJson(url, { headers: { Accept: "application/json", Cookie: cookie } }, timeoutMs);
    if (payload?.Status !== "Successful") throw new Error(`Centric PLM query failed for ${plmUrl}: ${payload?.Error || "unknown error"}`);
    const node = Array.isArray(payload?.NODES?.ResultNode) ? payload.NODES.ResultNode[0] : payload?.NODES?.ResultNode;
    if (!node) throw new Error(`Centric PLM returned no node for ${plmUrl}`);
    cache.set(plmUrl, node);
    return node;
  }
  return { getNode };
}

function nodeName(node) {
  return String(node?.$Name || node?.["Node Name"] || "").trim();
}

function isCozStyle(node) {
  const sourceStyle = String(node?.C8_Style_CozCode || nodeName(node) || "").trim().toUpperCase();
  return /^COZ(?:SS|AW)\d{2}-/.test(sourceStyle);
}

async function discoverCozStyleUrls(client, rootUrl = defaultRootUrl, scopeName = defaultScopeName) {
  const root = await client.getNode(rootUrl);
  const styleUrls = [];
  const seen = new Set();
  const seasonIds = Array.isArray(root?.Hierarchy) ? root.Hierarchy : [];
  for (const seasonId of seasonIds) {
    const season = await client.getNode(seasonId);
    for (const categoryId of Array.isArray(season?.Hierarchy) ? season.Hierarchy : []) {
      const category = await client.getNode(categoryId);
      if (nodeName(category).toLowerCase() !== scopeName) continue;
      for (const collectionId of Array.isArray(category?.Hierarchy) ? category.Hierarchy : []) {
        const collection = await client.getNode(collectionId);
        for (const styleId of Array.isArray(collection?.Hierarchy) ? collection.Hierarchy : []) {
          if (seen.has(styleId)) continue;
          const style = await client.getNode(styleId);
          if (style?.$Type === "Style" && style.Active !== false && isCozStyle(style)) {
            seen.add(styleId);
            styleUrls.push(String(styleId));
          }
        }
      }
    }
  }
  return styleUrls;
}

export async function fetchPlmSnapshot(options = {}) {
  const baseUrl = String(options.baseUrl || defaultBaseUrl).replace(/\/$/, "");
  const username = String(options.username ?? process.env.PLM_USERNAME ?? "").trim();
  const password = String(options.password ?? process.env.PLM_PASSWORD ?? "");
  const configuredStyleUrls = Array.isArray(options.styleUrls)
    ? options.styleUrls
    : String(process.env.PLM_STYLE_URLS || "").split(",");
  const selectedStyleUrls = configuredStyleUrls.map((value) => String(value).trim()).filter(Boolean);
  const timeoutMs = Number(options.timeoutMs || defaultTimeoutMs);

  const client = await createPlmClient({ baseUrl, username, password, timeoutMs });
  const resolvedStyleUrls = selectedStyleUrls.length
    ? selectedStyleUrls
    : await discoverCozStyleUrls(client, options.rootUrl || defaultRootUrl, options.scopeName || defaultScopeName);
  if (!resolvedStyleUrls.length) throw new Error("PLM discovery found no active CoZ styles in the configured scope");
  const styles = [];
  for (const plmStyleId of resolvedStyleUrls) {
    const node = await client.getNode(plmStyleId);
    if (node.$Type !== "Style") throw new Error(`${plmStyleId} is ${node.$Type || "not a style"}`);
    const sizes = [];
    for (const sizeId of node.ProductSizes || []) sizes.push((await client.getNode(sizeId)).$Name);
    const colorways = [];
    for (const plmColorwayId of node.ProductColors || []) {
      const colorway = await client.getNode(plmColorwayId);
      colorways.push({
        plmColorwayId,
        colorName: String(colorway.$Name || "").trim(),
        sourceColorCode: String(colorway.Code || "").trim(),
        modifiedAt: Number(colorway.$PT || 0) || null
      });
    }
    styles.push({
      plmStyleId,
      spu: String(node.C8_Style_CozCode || node.C8_Style_Code || node.$Name || "").trim(),
      jaStyleNo: String(node.Code || "").trim(),
      productName: String(node.C8_Style_EnglishName || node.$Name || "").trim(),
      sizes: sizes.filter(Boolean),
      colorways: colorways.filter((colorway) => colorway.colorName),
      modifiedAt: Number(node.$PT || 0) || null
    });
  }
  return { styles };
}
