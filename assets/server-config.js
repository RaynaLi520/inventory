const inventoryHostname = window.location.hostname;
const inventoryServerEnabled = ["inventory.justinallen.com", "172.16.100.198", "localhost", "127.0.0.1"].includes(inventoryHostname);

window.INVENTORY_SERVER_CONFIG = {
  enabled: inventoryServerEnabled,
  apiBase: "/api",
  mediaBase: "/media"
};

if (!inventoryServerEnabled && inventoryHostname.endsWith(".vercel.app")) {
  window.location.replace("/mobile-install.html");
}
