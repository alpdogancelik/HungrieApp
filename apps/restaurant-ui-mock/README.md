# Mock Restaurant UI

Responsive, fixture-only UI for reviewing the next Hungrie Restaurant experience. It is an Expo Router sibling of the production Restaurant app so approved components can later be moved without translating from a DOM-only framework.

## Run

```bash
npm run web --workspace @hungrie/restaurant-ui-mock
npm run typecheck --workspace @hungrie/restaurant-ui-mock
npm run export:web --workspace @hungrie/restaurant-ui-mock
```

The mock does not import Firebase, Supabase, environment configuration, credentials, or production repositories. All changes are in-memory and reset on reload.

## Route mapping

| Mock route | Production destination | Status |
|---|---|---|
| `/login` | `apps/restaurant/app/login.tsx` | Approved route |
| `/invite` | `apps/restaurant/app/invite.tsx` | Approved route |
| `/pending`, `/suspended` | Existing access-state routes | Approved routes |
| `/access-states` | Auth/access overlay and failure variants | Mock state gallery |
| `/dashboard` | Dashboard | Approved route |
| `/orders`, `/orders/[orderId]` | Live orders and guarded order detail | Approved routes |
| `/history` | Order history | Approved route |
| `/menu` | Category, item, and option management | Approved route |
| `/restaurant` | Restaurant settings | Approved route; opening hours are marked as a concept |
| `/reviews` | Review management | Approved route |
| `/settings` | Web Push and alert settings | Approved route |
| `/security` | Account security | Approved route |
| `/more` | Responsive secondary navigation | New presentation layer |
| `/concepts/earnings` | Future Restaurant Earnings route | Phase 0 fixture-only financial-reporting concept |
| `/concepts/admin-commission` | Future Admin Restaurant-detail section | Phase 0 fixture-only commission-management concept |
| `/concepts/staff` | None | Future concept only |
| `/concepts/incidents` | None | Future concept only |

## Integration rules

- Move visual components and typed view models only after UI approval.
- Replace fixture containers with existing guarded repositories and canonical server results.
- Preserve operation IDs, authorization gates, authoritative reconciliation, notification recovery, and error classification from `apps/restaurant`.
- Do not ship concept routes or opening-hours controls until their product decisions, permissions, database contracts, and tests are separately approved.
- Do not use client-calculated earnings, commission, or incident thresholds as an authority.
- Financial concept fixtures are explicit integer-kuruş and basis-point values shaped like future guarded server responses. They are not reconstructed from menu, modifier, or Restaurant configuration data.
- `/concepts/earnings` and `/concepts/admin-commission` are review surfaces only. They must not be promoted into either production app before the corresponding guarded database contracts and phase approvals exist.
