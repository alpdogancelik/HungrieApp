/* Phase 5 FCM worker. It deliberately has no fetch handler or Cache API access. */
importScripts("/firebase-config.js");
importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js");
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));
firebase.initializeApp(self.HUNGRIE_FIREBASE_CONFIG);
firebase.messaging().onBackgroundMessage(payload=>{
  const orderId=String(payload?.data?.orderId||"");
  return self.registration.showNotification("Hungrie Restaurant",{
    body:"A new order update is ready.",tag:String(payload?.data?.eventId||orderId||"restaurant-order"),
    data:{url:orderId?`/orders/${encodeURIComponent(orderId)}`:"/orders"}
  });
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(clients=>{
    const url=event.notification?.data?.url||"/orders";
    const existing=clients[0]; if(existing){existing.navigate(url);return existing.focus();}
    return self.clients.openWindow(url);
  }));
});
