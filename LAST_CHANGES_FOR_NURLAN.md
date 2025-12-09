# Last changes for Nurlan

## Summary
- Added restaurant panel (login/session provider plus menu, hours, orders, and visibility screens).
- Rebuilt the search tab with a routed index and `useSearchScreen` hook to keep filters/results in sync.
- Wired real-time orders to Firestore (`firebaseOrders.ts`) and added `restaurantStaff` auth checks for panel logins.
- Added new fonts/images and static restaurant pages to match the catalog.
- Included Firestore schema CSVs (`orders.csv`, `restaurant_notifications.csv`, `user_notifications.csv`) and firebase config placeholders.

## Firebase instructions
1) Client config
   - Update `mobile/app.json` with your `EXPO_PUBLIC_FIREBASE_*` keys. Remove the debug App Check token for production or provide `EXPO_PUBLIC_FIREBASE_APPCHECK_SITE_KEY`.
   - If backend is offline, set `EXPO_PUBLIC_DISABLE_FIREBASE="true"` or keep `EXPO_PUBLIC_USE_MOCK_DATA="true"` while testing UI.

2) Auth (restaurant panel)
   - Enable Email/Password in Firebase Auth.
   - For each staff account, create `restaurantStaff/{uid}` with for example:
     ```json
     {
       "restaurantId": "rest_ada_pizza",
       "restaurantName": "Ada Pizza"
     }
     ```
   - Login fails if this document is missing.

3) Firestore collections
   - Orders: `orders` collection (used by `src/services/firebaseOrders.ts` and `src/hooks/useOrderRealtime.ts`).
   - Restaurants/menus: `restaurants`, `menus` (seed from `mobile/data/*.json` if needed).
   - Notifications: `user_notifications`, `restaurant_notifications` (schemas in CSVs).
   - Staff: `restaurantStaff` (for panel access). Seed JSON/CSV via console import or your own data.

4) Security rules
   - Current `mobile/firestore.rules` denies everything. For dev, you can temporarily allow authenticated access:
     ```
     rules_version = '2';
     service cloud.firestore {
       match /databases/{database}/documents {
         match /{document=**} {
           allow read, write: if request.auth != null;
         }
       }
     }
     ```
   - For production, replace with role-based rules (staff vs user) and publish via Firebase console before release.

5) Indexes
   - `firestore.indexes.json` is empty; current queries (userId/restaurantId equality and `status in [...]`) do not need composites. If Firestore suggests an index, add it.

6) Run
   - `cd mobile && npm install && npm run start` to launch Expo. Use the mock data toggle if Firebase is not yet configured.

7) Notes
   - Do not commit the service account JSON (e.g., `hungrie-b5458-firebase-adminsdk-*.json`); keep it as a secret locally/CI.
   - Restaurant panel moves orders through `pending -> preparing -> ready -> out_for_delivery`; ensure your rules allow updating `status`.
