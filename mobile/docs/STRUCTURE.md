# Code structure primer

This repo now uses descriptive file names so you can locate features without chasing anonymous `index.*` files.

## Top-level routes

| Path | File | Notes |
| --- | --- | --- |
| `/` | `app/index.tsx` | Redirects into the tab navigator at `/(tabs)/home`. |
| `/home` | `app/(tabs)/home.tsx` | Customer landing tab (listings, categories, quick actions). |
| `/search` | `app/(tabs)/search.tsx` | Search tab powered by `useAsyncResource`. |
| `/cart` | `app/(tabs)/cart.tsx` | Cart tab with Zustand cart store + asset catalogue references. |
| `/profile` | `app/(tabs)/profile.tsx` | Profile tab with address + account management. |
| `/orders` | `app/orders.tsx` | Order history screen using `useServerResource`. |
| `/courier` | `app/courier.tsx` | Courier dashboard for assigning riders. |
| `/restaurant/console` | `app/restaurant/console.tsx` | Restaurant operator console (menu + visibility controls). |
| `/restaurant/couriers` | `app/restaurant/couriers.tsx` | Internal courier queue. |

## Shared modules

- `constants/mediaCatalog.ts` aggregates icons, emoji, and offer/category metadata. Import from `@/constants/mediaCatalog` instead of a bare folder.
- `src/theme/themeContext.tsx` exposes `ThemeProvider`, `useTheme`, and `getShadow` in one place.
- `src/components/componentRegistry.ts` is the single barrel for commonly reused UI primitives.
- `src/features/address/addressFeature.ts` gathers the address store, hooks, and UI so the tab screens can import from one file.
- `lib/useAsyncResource.ts` is the generic async hook (renamed from the old Appwrite helper). This powers `useHome` and search.

## Naming guidelines

1. **Screens use descriptive filenames** (e.g., `orders.tsx`, `courier.tsx`, `home.tsx`). Nested folders (`restaurant/*`) only keep `_layout.tsx` as an index.
2. **Exports stay colocated** with their feature. Use the registry files above when you need to import multiple helpers.
3. **No hidden dependencies** - Appwrite/Supabase scripts and configs were removed. Firebase + mock data toggle are the only runtime backends.

Use this file as a quick reference when onboarding new engineers or reviewing pull requests.
