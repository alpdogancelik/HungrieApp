# Functions Setup

## 1) Install dependencies

```bash
cd functions
npm install
```

## 2) Firebase project selection

```bash
firebase login
firebase use <your-project-id>
```

Use the same Firebase project as the mobile app (`EXPO_PUBLIC_FIREBASE_PROJECT_ID`).

## 3) Deploy

```bash
cd functions
npm run deploy
```

This deploys:
- `notifyRestaurantOnNewOrder` (triggered on `orders/{orderId}` create)
- `notifyRestaurantOnPendingTransition` (triggered when an existing order status changes to `pending`)
- `notifyUserOnOrderStatusTransition` (triggered when an existing order status changes to a user-visible status)

## Notes

- The functions send direct native push notifications to tokens stored at:
  - `restaurants/{restaurantId}/pushTokens/{tokenId}`
  - `users/{userId}/pushTokens/{tokenId}`
- Android delivery uses Firebase Admin Messaging with native FCM tokens.
- iOS delivery uses APNs directly. Configure these function environment variables before deploy:
  - `APNS_KEY_ID`
  - `APNS_TEAM_ID`
  - `APNS_PRIVATE_KEY`
  - `APNS_BUNDLE_ID`
  - `APNS_USE_SANDBOX` (`true` for development/sandbox builds, otherwise omit or set `false`)
- Invalid APNs/FCM tokens are removed automatically.
