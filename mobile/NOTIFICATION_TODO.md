# Hungrie Order Status Notifications TODO

## Implemented in app code
- [x] Added OS-level local notification flow for order status updates.
- [x] Added order watcher (`src/features/notifications/orderStatusWatcher.ts`) that listens to Firestore `orders` for signed-in user.
- [x] Sends notification for status transitions:
  - `preparing` => approved
  - `ready`
  - `out_for_delivery`
  - `delivered`
  - `canceled` => rejected
- [x] Added custom notification sound routing to use `hungrie.wav`.
- [x] Added notification response handler: tapping notification opens `/order/pending?orderId=...`.
- [x] Wired watcher startup in root layout for authenticated users.

## App config / build setup
- [x] Added `expo-notifications` plugin config in `app.json`.
- [x] Registered custom sounds:
  - `assets/hungrie.wav`
  - `assets/hungrie.mp3`
- [x] Configured Android order-status channel with high importance and custom sound.

## Remaining production checklist (required for full background reliability)
- [ ] Build native binaries after plugin change:
  - Android: `eas build -p android --profile production`
  - iOS: `eas build -p ios --profile production`
- [ ] Install fresh build on physical device (Expo Go is not enough for full push behavior).
- [ ] Verify notification permissions granted in device settings.
- [ ] Verify custom sound playback on both Android and iOS lock-screen notifications.

## Server-side push (recommended for app-killed reliability)
- [ ] Persist Expo push token in backend (replace placeholder in `src/features/notifications/push.ts`).
- [ ] Trigger push from backend when restaurant changes order status.
- [ ] Include payload fields:
  - `type: "order_status"`
  - `orderId`
  - `status`
- [ ] Send custom sound field in push payload:
  - iOS: `sound: "hungrie.wav"`
  - Android: `channelId: "order-status"`
- [ ] Add retry + dead-letter handling for failed push attempts.
- [ ] Add observability: per-order push delivery logs.

## Firestore/Data model checks
- [ ] Ensure `orders.userId` always equals Firebase Auth UID.
- [ ] Ensure restaurant-side status transitions are normalized (`accepted -> preparing`, `rejected -> canceled`).
- [ ] Add audit field `statusUpdatedAt` on each transition for better ordering.

## QA scenarios
- [ ] Place order -> keep app foreground -> status changes produce banner with sound.
- [ ] Place order -> app background -> status changes produce lock-screen notification with sound.
- [ ] Tap notification -> app opens order pending screen for that order.
- [ ] Reopen app -> no duplicate notification flood for unchanged statuses.
- [ ] Canceled flow shows rejection wording and negative tone.
- [ ] Delivered flow shows completion wording and positive tone.
