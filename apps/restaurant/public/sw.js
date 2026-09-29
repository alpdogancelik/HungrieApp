/* Phase 5 FCM worker. It deliberately has no fetch handler or Cache API access. */
importScripts("/firebase-config.js");
importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js");
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));
const qualificationStage=(stage,payload)=>{
  const correlationId=String(payload?.data?.qualificationCorrelationId||"");
  const safeCorrelation=/^[a-zA-Z0-9_-]{1,80}$/.test(correlationId)?correlationId:"";
  return self.clients.matchAll({type:"window",includeUncontrolled:true}).then(clients=>Promise.all(clients.filter(client=>typeof client.postMessage==="function").map(client=>client.postMessage({source:"hungrie-restaurant-notification-qualification-v1",stage,correlationId:safeCorrelation}))));
};
self.addEventListener("push",event=>{let payload;try{payload=event.data?.json();}catch{}event.waitUntil(qualificationStage("browser_push_event",payload));});
firebase.initializeApp(self.HUNGRIE_FIREBASE_CONFIG);
firebase.messaging().onBackgroundMessage(payload=>{
  const orderId=String(payload?.data?.orderId||"");
  return qualificationStage("firebase_background_message",payload).then(()=>self.registration.showNotification(String(payload?.data?.title||"Hungrie Restaurant"),{
    body:String(payload?.data?.body||"A new order update is ready."),tag:String(payload?.data?.eventId||orderId||"restaurant-order"),
    data:{url:orderId?`/orders/detail?orderId=${encodeURIComponent(orderId)}`:"/orders"}
  })).then(()=>qualificationStage("app_background_handler_completed",payload));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(clients=>{
    const url=event.notification?.data?.url||"/orders";
    const existing=clients[0]; if(existing){existing.navigate(url);return existing.focus();}
    return self.clients.openWindow(url);
  }));
});
