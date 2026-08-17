"use strict";

const VERSION = "ja-inventory-direct-access-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request, { cache: "no-store" }));
});

self.addEventListener("message", (event) => {
  if (event.data === "VERSION") event.source?.postMessage({ type: "VERSION", value: VERSION });
});
