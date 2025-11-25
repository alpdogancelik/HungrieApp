# Changelog

## 2025-11-25
### App screens
- Search tab rebuilt with theme-aware controls, recent-search persistence, derived categories with counts, stronger relevance/ETA parsing, richer cards (ratings, prices, restaurant meta), refreshed empty/offline states, and a horizontal restaurant carousel.
- Restaurant detail page redesigned with per-restaurant palettes, meta badges for rating/reviews/delivery/fees, defaulted descriptions and vibe tags, accent-tinted menu cards, and hero overlay/back/cart controls.
- Home header now personalizes with stored emoji preference, layered Godzilla artwork, and a personalized search shortcut; legacy category chips removed for a leaner flow.

### Components and UX
- Menu cards now format prices, show description/ETA chips, accent-colored CTAs, and updated rating display; restaurant cards align icon colors with the new primary.
- Search hook gains category derivation, restaurant-aware results, relevance scoring, and race-condition guardrails.

### Data and assets
- Migrated restaurant logos to .jpg and added Lavish/Munchies/Root logo/seed files; sample data normalized to ASCII and logo-first imagery with remote menu photos disabled.
- Asset resolver prefers bundled logos and updates avatar/background colors; emoji set expanded alongside close icon wiring.

### Theme and tokens
- Locked app to the light palette (FE8C00 scheme), refreshed Tailwind tokens to match, and simplified theme hydration to stay in light mode.
