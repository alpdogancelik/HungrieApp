# Hungrie Mobile - Expo Router + Firebase

This app mirrors the `food_ordering-main` experience with Expo Router, NativeWind, Zustand, and Firebase helpers bundled into a pure Expo project. Mock data paths stay available for developers without backend access.

## Quick start

1. **Install dependencies**
   ```powershell
   cd "c:\Users\alpdo\OneDrive\Desktop\MunchiesOrder (3)\MunchiesOrder\mobile"
   npm install
   ```
2. **Configure runtime values** in `app.json -> expo.extra`:
   - **Firebase** (required for live data) - `EXPO_PUBLIC_FIREBASE_*` keys.
   - **Runtime toggles** - `EXPO_PUBLIC_USE_MOCK_DATA`, `EXPO_PUBLIC_DISABLE_FIREBASE`, `EXPO_PUBLIC_SENTRY_DSN`, and `EXPO_PUBLIC_REQUIRE_AUTH` (flip to `"true"` when you want the auth screens to gate the tab layout).
   - **Other services** - `EXPO_PUBLIC_API_BASE_URL` (optional Node/Express API) and `EXPO_PUBLIC_PEXELS_API_KEY` (image search helper).
3. **Copy assets** from the shared design repo:
   - `assets/fonts/*.ttf` -> `mobile/assets/fonts/`
   - `assets/icons/*.png` -> `mobile/assets/icons/`
   - `assets/images/*.png` -> `mobile/assets/images/`
4. **Start the app**
   ```powershell
   npm run start
   ```
   Press `a` in Expo CLI for Android (when an emulator is running) or scan the QR code with Expo Go.

## Structure

- `app/` - Expo Router groups `(auth)`, `(tabs)`, `order/*`, and `restaurant/*` plus layout guards.
- `components/` - Reusable UI (inputs, cards, lists, cart cells, etc.).
- `constants/mediaCatalog.ts` - Centralised icons, emoji, cooking scenes, categories, and offer data.
- `lib/` - Firebase helpers, async hooks, mock data, and API utilities.
- `src/` - Feature modules (`features/address`, `features/reviews`), theme provider, and domain hooks.
- `store/` - Zustand stores for auth/cart state.
- `data/` - Firestore JSON seeds kept for quick demos.

## Styling

NativeWind (Tailwind) powers styling through the `className` prop on React Native primitives. Configuration lives in `tailwind.config.js`; Babel/Metro are ready to go.

## Notes

- Legacy Appwrite/Supabase helpers were removed; Firebase plus offline mocks power every surface.
- `EXPO_PUBLIC_USE_MOCK_DATA` keeps the UI offline. Flip to `"false"` once your Firebase project is wired.
- Fonts load inside `app/_layout.tsx`. If you have not copied them yet, temporarily comment out `useFonts` while iterating.

## Next steps

- Provide a real `EXPO_PUBLIC_API_BASE_URL` if the courier/restaurant tooling will hit your backend.
- Drop production secrets (Firebase, API base URL, Pexels, Sentry) into `app.json` or a runtime env before publishing.
- Run end-to-end (auth -> restaurant console -> cart) once Firebase + Sentry keys are configured.
