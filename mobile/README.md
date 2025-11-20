# Hungrie Mobile - Expo Router + Appwrite

This app mirrors the `food_ordering-main` architecture: Expo Router, NativeWind, Zustand, and Appwrite helpers, packaged as a pure Expo project.

## Quick start

1. Install dependencies:

```powershell
cd "c:\Users\alpdo\OneDrive\Desktop\Hungrie (3)\Hungrie\mobile"
npm install
```

2. Configure environment values in `app.json -> expo.extra`:

   **Appwrite (required)**
   - `EXPO_PUBLIC_APPWRITE_ENDPOINT`
   - `EXPO_PUBLIC_APPWRITE_PROJECT_ID`
   - `EXPO_PUBLIC_APPWRITE_DATABASE_ID`
   - `EXPO_PUBLIC_APPWRITE_USER_COLLECTION_ID`
   - `EXPO_PUBLIC_APPWRITE_CATEGORIES_COLLECTION_ID`
   - `EXPO_PUBLIC_APPWRITE_MENU_COLLECTION_ID`
   - `EXPO_PUBLIC_APPWRITE_CUSTOMIZATIONS_COLLECTION_ID`
   - `EXPO_PUBLIC_APPWRITE_MENU_CUSTOMIZATIONS_COLLECTION_ID`
   - `EXPO_PUBLIC_APPWRITE_RESTAURANTS_COLLECTION_ID`
   - `EXPO_PUBLIC_APPWRITE_ORDERS_COLLECTION_ID`
   - `EXPO_PUBLIC_APPWRITE_BUCKET_ID`

   **Runtime toggles**
   - `EXPO_PUBLIC_USE_MOCK_DATA` &mdash; keep as `"true"` for local mocks, set to `"false"` to hit the live Appwrite backend once your IDs are ready.
   - `EXPO_PUBLIC_SENTRY_DSN` &mdash; optional; Sentry only initialises when this value exists.

   **Firebase (optional super admin dashboard)**
   - `EXPO_PUBLIC_FIREBASE_API_KEY`
   - `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
   - `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `EXPO_PUBLIC_FIREBASE_APP_ID`
   - `EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID` (optional but required for Analytics)

   **Other services**
   - `EXPO_PUBLIC_API_BASE_URL` (optional Node/Express API for courier/restaurant tooling)
   - `EXPO_PUBLIC_PEXELS_API_KEY` (enables the menu photo search helper)

3. Copy assets from `food_ordering-main` (required):
   - `assets/fonts/*.ttf` -> `mobile/assets/fonts/`
   - `assets/icons/*.png` -> `mobile/assets/icons/`
   - `assets/images/*.png` -> `mobile/assets/images/`

4. Start the app:

```powershell
npm run start
```

Press `a` in the Expo CLI to open Android (if an emulator is running) or scan the QR code with Expo Go.

## Structure

- `app/` - Expo Router groups `(auth)`, `(tabs)`, `restaurant/*`; `_layout.tsx` wires fonts/theme/auth gating.
- `components/` - Reusable UI (inputs, buttons, cards, search/filter, etc.).
- `constants/` - Image/icon references plus seed lists.
- `lib/` - Appwrite SDK helpers, API client fallbacks, hooks, and mock data.
- `src/` - Shared order services, polling hooks, and screens (OrderPending experience).
- `store/` - Zustand stores for auth and cart state.
- `scripts/` - Utility scripts such as `seed-appwrite.mjs`.

## Styling

NativeWind (Tailwind) is enabled. Use the `className` prop on React Native primitives:

```tsx
<View className="p-4 bg-white" />
```

Config lives in `tailwind.config.js`; Babel/Metro are already wired for NativeWind.

## Notes

- The legacy Vite/Supabase stack was removed; `expo-router/entry` is the only entry point.
- `EXPO_PUBLIC_USE_MOCK_DATA` keeps the UI in fully-offline mock mode. Flip it to `"false"` (or remove it) once real Appwrite collections are configured.
- Fonts load in `app/_layout.tsx`; if you have not copied them yet, temporarily comment out `useFonts` while iterating.

## Next steps

- Wire Appwrite collections (IDs referenced in `lib/appwrite.ts`) or adapt the schema to your liking.
- Seed optional content with `scripts/seed-appwrite.mjs` once your backend is reachable.
- Drop production secrets (Appwrite, API base URL, Pexels, Sentry) into `app.json` or runtime env before publishing.

