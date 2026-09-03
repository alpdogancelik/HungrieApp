# Firebase Migration Inventory

Status: Completed and approved
Firebase project: `hungrieapp-a2288`
Environment classification: Development
Migration authority: `docs/firebase-to-supabase-migration-plan.md`

## Data inventory

| Firestore path | Purpose | Target disposition | Data classification |
|---|---|---|---|
| `users/{userId}` | Customer/operator profile, preferences, favorite restaurant IDs, default-address summary | `profiles`; favorites normalized separately | Personal, sensitive personal, internal |
| `users/{userId}/addresses/{addressId}` | Saved delivery addresses | `addresses` | Sensitive personal |
| `users/{userId}/pushTokens/{tokenId}` | Native notification registrations | `push_tokens` | Credential/token, internal |
| `restaurants/{restaurantId}` | Public catalog data plus ownership and panel metadata | `restaurants`; ownership normalized to `restaurant_members` | Public, personal, internal, financial |
| `restaurants/{restaurantId}/pushTokens/{tokenId}` | Restaurant-panel notification registrations | `push_tokens` | Credential/token, internal |
| `restaurantStaff/{userId}` | Restaurant-panel user-to-restaurant authorization | `restaurant_members` | Authentication identifier, internal |
| `categories/{categoryId}` | Menu categories | `categories` | Public |
| `menus/{menuId}` | Menu items, prices, ratings and visibility | `menu_items` | Public, financial, internal |
| `orders/{orderId}` | Order, item, customer, address, payment and status snapshots | `orders`, `order_items`, `order_status_history` | Personal, sensitive personal, financial, internal |
| `reviews/{reviewId}` | Product reviews and moderation state | `product_reviews` | Public, personal, internal |
| `orderReviews/{reviewId}` | Overall order reviews and item snapshots | `order_reviews` | Public, personal, internal |

The live audit discovered nine populated paths: every path above except `orderReviews` and restaurant push tokens, which currently contain no discoverable documents. No unexpected collection or subcollection was found.

## Representative field shapes

These shapes come from application types, serializers, rules and queries. The live audit records observed types and presence percentages without recording values.

- Profiles: `name`, `email`, `avatar`, `whatsappNumber`, `accountId`, `preferredLanguage`, `favoriteIds`, `address`, `defaultAddress`, address counters and timestamps.
- Addresses: `id`, `label`, `line1`, optional `block`/`room`, `city`, `country`, `isDefault`, `createdAt`.
- Restaurants: public identity and description, images, cuisine, active state, delivery time/fee, minimum-order variants, ratings, opening hours, phone, `ownerId`, owner/panel emails, panel UID, manager emails and locale.
- Restaurant staff: restaurant ID/name, email, enabled/reset state and timestamps.
- Categories: ID, restaurant ID, name, description/icon, active state and ordering.
- Menu items: ID, restaurant/category references, name, description, image aliases, price, visibility/active state, category aliases, nutritional/rating fields, ordering and customization arrays.
- Orders: user/restaurant references, nested item snapshots and customizations, customer and delivery-address snapshots, notes, payment method, subtotal, delivery/service fees, discount, tip, total, status, courier/reminder fields and status-specific timestamps.
- Product reviews: deterministic review key, order/restaurant/menu/user references, name snapshots, rating, comment, moderation status/reply and timestamps. Legacy `itemId` and `menuItemId` both exist.
- Order reviews: deterministic review key, order/restaurant/user references, speed/taste/value ratings, average, comment, item snapshots, moderation status and timestamps.
- Push tokens: token/token ID, platform, provider, owner scope/ID, app and timestamps.

## Runtime dependencies

### Authentication

- The mobile customer and restaurant-panel flows use Firebase email/password authentication.
- Customer registration requires email verification; password reset and account deletion are implemented.
- Restaurant-panel access additionally requires a matching `restaurantStaff/{uid}` document.
- The live audit confirmed email/password as the only configured and used provider. Email sign-in is enabled and passwords are required; phone, anonymous, OAuth, OIDC and SAML providers are disabled or absent.

### Realtime listeners

Seven direct `onSnapshot` registrations were found:

- Restaurant list and individual restaurant updates in `mobile/lib/api.ts`.
- General order subscription in `mobile/lib/firebaseAuth.ts`.
- Order detail, customer orders, restaurant orders and reminder/order workflow listeners in `mobile/src/services/firebaseOrders.ts`.

UI and feature modules still import Firebase directly; repository extraction remains Milestone 4.

### Cloud Functions and notifications

Four functions are present locally and were observed as active in `us-central1` through the authenticated Firebase CLI:

| Function | Trigger | Responsibility |
|---|---|---|
| `notifyRestaurantOnNewOrder` | Firestore order creation | Sends restaurant APNs/FCM notification |
| `notifyRestaurantOnPendingTransition` | Firestore order update | Notifies when an order moves into pending |
| `notifyUserOnOrderStatusTransition` | Firestore order update | Sends customer-visible status notification |
| `cancelExpiredPendingOrders` | Every minute, `Asia/Famagusta` | Cancels pending orders after the five-minute approval SLA |

Native tokens are stored beneath users and restaurants. Android uses Firebase Admin Messaging; iOS calls APNs directly. Invalid tokens are deleted by trusted function code.

### App Check and Storage

- A Storage bucket name is configured, but no Firebase Storage SDK operations were found in application or function source.
- The client sets an App Check debug-token global when configured, but no `initializeAppCheck` call was found. Console-side enforcement remains a live verification item.

## Rules and indexes

- Firestore rules: `mobile/firestore.rules`, SHA-256 `d6cb6e05b017a1c5d0162f0a6cd3e60c2ff6486a62c69bb280fbf11cb0b7ae96`.
- Firestore indexes: `mobile/firestore.indexes.json`, SHA-256 `6ae5c9d2e52c20b102a4a35e5bde47ae53f4c8ecbbb1e617b954107085a95147`. The authenticated Firebase CLI reported nine deployed composite indexes; after removing Firestore's implicit `__name__` fields, they match all nine local definitions.
- Functions source: `functions/index.js`, SHA-256 `d8897f61d8b2e6eb42dbd07e98d8ba546a48eeb2df6374ab403188de08384d60`.
- Composite indexes cover restaurant/status/date and user/date order queries plus review restaurant/item/user/status/date queries.
- Current rules expose active and inactive restaurants, menus, categories and product reviews publicly. This behavior must not be copied blindly; the Supabase plan permits anonymous access only to active catalog records and published reviews.
- Restaurant token writes authorize only `ownerId`, while restaurant access elsewhere also recognizes staff and owner/manager emails. This inconsistency is recorded as a migration risk.

The read-only Firebase Rules API confirmed that the deployed Firestore rules match the local SHA-256 exactly.

## External and operational scripts

- `functions/scripts/cleanupPushTokens.js`: dry-run by default; audits/deduplicates user and restaurant tokens.
- `functions/scripts/provisionRestaurantPanelAccounts.js`: creates Firebase Auth panel accounts and `restaurantStaff` documents when explicitly run with write confirmation.
- `functions/scripts/syncFirestoreFromJsonAdmin.js`: backs up and synchronizes restaurant catalog data; can prune only with explicit flags.
- `mobile/scripts/sync-firestore-from-json.mjs`: client-SDK catalog synchronization utility.

No additional backend directory, scheduled-job service, payment gateway, or server API was found in this repository. Firebase Console and organizational infrastructure must be checked for services maintained outside this checkout.

## Privacy handling

- Tracked documents may contain collection names, field names, aggregate counts, checksums and anomaly counts.
- They must not contain document IDs tied to people, emails, phone/WhatsApp numbers, exact addresses, passwords, service-account material, APNs/FCM tokens or Firebase ID tokens.
- The sanitized machine report is written under `secure/` with file mode `0600`; the directory is excluded by Git.
- Temporary credentials must live outside the repository and be revoked immediately after the two baseline runs and any approved exports.

The live audit classified all 170 observed field paths: 56 public, 44 internal, 43 personal, 38 sensitive-personal, 9 credential/token and 9 financial classifications. Fields can carry multiple classifications, so these figures intentionally overlap.
