# Hungrie (Expo)

Hungrie order application / eating app for all campus residents.  
The repo now focuses exclusively on the Expo React Native client; the older Vite/Express stack was removed to keep things lean and mobile-first.

## Structure
- `mobile/` — Expo Router app (NativeWind, Zustand, Appwrite helpers)
- `.gitignore`, `README.md` — root metadata only

## Getting started

```powershell
cd "mobile"
npm install
npm run start        # expo start
```

The Expo entry point is `app/_layout.tsx`. Platform folders (`ios`, `android`) are generated on demand via `npx expo prebuild`.

## Environment

Expo public values live in `mobile/app.json` under `expo.extra`. Set at least:

- `EXPO_PUBLIC_APPWRITE_ENDPOINT`
- `EXPO_PUBLIC_APPWRITE_PROJECT_ID`

Optional keys (Pexels, Sentry, etc.) are documented inside `mobile/README.md`.

## Cleanup summary

- Removed legacy directories (`client`, `server`, `shared`, `docs`, `data`, `migrations`, `scripts`, `public`, root `package.json`, etc.) belonging to the retired stack.
- Kept the Expo project self-contained inside `mobile/` with its own dependencies, scripts, and documentation.

Refer to `mobile/README.md` for feature-level docs and development notes.
