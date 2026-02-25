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

## Notes

- The function sends Expo push notifications to tokens stored at:
  - `restaurants/{restaurantId}/pushTokens/{tokenId}`
- Invalid tokens (`DeviceNotRegistered`, `InvalidCredentials`) are removed automatically.
