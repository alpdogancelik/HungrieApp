# Restaurant notification-click focus contract review

Qualification `restaurant-vercel-notification-click-qualification-20260929af` remains an immutable terminal `FAIL` under its historical verifier. It is used only to establish why the verifier needed correction. Its evidence does not contain the prospective Service Worker event and `WindowClient` operation records required by the corrected contract, so a fresh physical click is required. No rebuild or deployment is required.

## Root cause

The AF verifier treated `document.hasFocus()` as mandatory proof that a Service Worker notification click focused the application. That probe reports focus for the document's browsing context; it is not the Service Worker `WindowClient.focused` state and is not the fulfillment result of `WindowClient.focus()` or `clients.openWindow()`. AF reached the exact expected origin and order-detail URL, was visible, and had Chrome frontmost, but failed only because the document probe was false. The probe was therefore an unsupported proxy for the Phase 6 requirement.

The first prospective attempt, AG, is also immutable and terminal `FAIL`. Its immutable, Owner, service-worker, and token-registration gates passed, but an ephemeral runner integration used the checkpointed Firebase Admin loader as flat exports instead of its documented `{ app, messaging }` result. It stopped before the authorized FCM send and before asking for a physical click. The bypass was independently removed.

AH is immutable and terminal `FAIL`. Its one background send delivered and its prospective observer recorded fulfilled `navigate()` and `focus()` operations plus the exact visible destination. It failed because the verifier additionally required the returned `WindowClient.focused` snapshot to be true. The Service Workers focus algorithm resolves only when the newly created `WindowClient` focus state is true and otherwise rejects, so the fulfilled promise is the direct normative evidence. The snapshot remains diagnostic because later focus changes can make it false.

AI is immutable and terminal `FAIL`. It passed immutable verification but stopped before token registration, sending, or click because its ephemeral runner relied on CDP's optional inline request body for the registration token. AJ observes only the exact registration RPC body inside the isolated page, retains the token only in memory, and persists no raw token or credential.

## Production flow

`apps/restaurant/public/sw.js` listens for `notificationclick`, closes the notification, obtains the canonical URL from `event.notification.data.url`, and calls `clients.matchAll({type:"window", includeUncontrolled:true})`. For an existing client it initiates `navigate(url)` and returns `focus()`; otherwise it returns `clients.openWindow(url)`. The returned promise chain is passed to `event.waitUntil()`. The current handler does not await the `navigate()` promise independently, so prospective qualification must observe both the navigation call/result and the resulting client URL in addition to the awaited focus/open operation.

## Corrected prospective PASS contract

A PASS requires a real physical OS/browser notification click, a correlated real `notificationclick` event, notification closure, successful completion of the production handler, and no synthetic event or manual/automated qualifying navigation after the send. The evidence must show either:

- an existing `WindowClient` received the exact canonical `navigate()` target and both `navigate()` and `focus()` fulfilled; or
- `clients.openWindow()` fulfilled for the exact canonical target.

The resulting client and page must use the reviewed Preview origin, `/orders/detail`, and the exact order ID; the `WindowClient` and document must be visible; and no unexpected origin may occur. `document.hasFocus()` remains diagnostic evidence and may be false. Historical AF evidence remains unchanged.
