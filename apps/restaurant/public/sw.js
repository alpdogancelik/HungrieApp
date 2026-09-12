/* Phase 1 scope proof. This worker never intercepts fetch or caches data. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
