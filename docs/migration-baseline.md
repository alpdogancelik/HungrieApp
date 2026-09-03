# Firebase Migration Baseline

Status: Completed and approved
Firebase project: `hungrieapp-a2288`
Environment classification: Development

## Reproducible audit

Run from `functions/` using a temporary service account with only Cloud Datastore Viewer, Firebase Authentication Viewer and Firebase Rules Viewer access:

```bash
npm run audit:migration-baseline -- \
  --project-id=hungrieapp-a2288 \
  --confirm-project=hungrieapp-a2288 \
  --service-account=/absolute/path/outside-this-repository/firebase-read-only.json \
  --output=secure/firebase-migration-audit-run-1.json
```

Repeat with `firebase-migration-audit-run-2.json`. Compare `inventorySha256` and `baselineSha256`, then record both timestamps and fingerprints below. If fingerprints differ, explain the delta using the report timestamps; do not copy affected records into this document.

The utility rejects another project, refuses ambient credentials, restricts output to `secure/`, writes mode `0600`, and emits no document values or identifiers.

## Local catalog baseline

| Metric | Count |
|---|---:|
| Seed files | 9 |
| Restaurants | 9 |
| Category entries | 94 |
| Menu entries | 822 |

These are source-file counts, not live Firestore counts. Duplicate or restaurant-prefixed document IDs may affect live reconciliation and will be reported separately.

## Live baseline

| Metric | Run 1 | Run 2 | Reconciled |
|---|---:|---:|---|
| Auth users | 58 | 58 | Stable |
| Firestore documents | 1,269 | 1,269 | Stable |
| Users | 52 | 52 | Stable |
| Saved addresses | 31 | 31 | Stable |
| Restaurants | 9 | 9 | Stable |
| Restaurant staff records | 9 | 9 | Stable |
| Categories | 94 | 94 | Stable |
| Menu items | 822 | 822 | Stable |
| Orders | 245 | 245 | Stable |
| Active orders | 0 | 0 | Stable |
| Product reviews | 2 | 2 | Stable |
| Order reviews | 0 | 0 | Stable |
| Push tokens | 5 | 5 | Stable |

Run 1 timestamp: `2026-09-02T16:34:14.007Z`
Run 1 inventory SHA-256: `707b0a77e67dbf81a5af19bfac4b65aa3299791de36835d16d38277f34863d27`
Run 1 baseline SHA-256: `93ea6cc9344a7fa6c018a31bdc49783ee593342e7ad743867d077f382422eb4f`
Run 2 timestamp: `2026-09-02T16:36:13.570Z`
Run 2 inventory SHA-256: `707b0a77e67dbf81a5af19bfac4b65aa3299791de36835d16d38277f34863d27`
Run 2 baseline SHA-256: `93ea6cc9344a7fa6c018a31bdc49783ee593342e7ad743867d077f382422eb4f`

Both fingerprints are identical. No data or schema change occurred between the two scans.

## Financial and status reconciliation

The audit normalizes `accepted` to `preparing`, `rejected`/`cancelled` to `canceled`, and `teslim edildi` to `delivered`. Active means `pending`, `preparing`, `ready`, or `out_for_delivery`.

The live report must be reviewed for:

- Order counts by normalized status.
- Aggregate subtotal, delivery fee, service fee, discount, tip and total in integer kuruş.
- Non-numeric money fields.
- Orders where `subtotal + deliveryFee + serviceFee + tip - discount != total` after kuruş conversion.
- Missing user or restaurant relationships.
- Product/order review counts, moderation statuses, averages, duplicate logical keys and missing relationships.
- Missing restaurant ownership, orphaned staff records, duplicate default addresses and catalog rows without valid restaurants.

Do not correct anomalies during Milestone 0. Add each anomaly class and resolution owner to the decision/risk log.

### Recorded results

- Orders by canonical status: 149 canceled and 96 delivered; no active orders.
- Financial totals: subtotal `14,149,000` kuruş, service fee `17,200` kuruş, total `14,166,200` kuruş; delivery fee, discount and tip totals are zero.
- All order money values are numeric and every audited financial equation reconciles exactly after kuruş conversion.
- Two orders reference profiles absent from `users`; three orders reference restaurants absent from the current catalog.
- Both product reviews are published with an average rating of 3.5, but both have at least one unresolved order/restaurant/menu relationship.
- No duplicate product-review or order-review logical keys were found.
- All nine restaurants are active and have owner IDs, but none of those owner IDs match current `users` documents. All nine `restaurantStaff` records reference valid restaurants.
- There are 58 Auth accounts and 52 profile documents, a difference of six that must be classified before profile migration.
- There are 31 saved addresses, 24 marked default, and no owner has multiple defaults.
- No remote favorites are currently recorded.
- Five push tokens exist, all user-scoped APNs/iOS tokens; no restaurant-scoped token documents were discovered.

## Deployment evidence

- Firebase CLI authentication and access to `hungrieapp-a2288` were confirmed.
- Four Cloud Functions were observed active in `us-central1`.
- Local rules/index checksums are recorded in `migration-inventory.md`.
- All nine deployed composite indexes match the local index definitions after excluding Firestore's implicit `__name__` fields.
- Live Auth providers, Auth user totals and recursive Firestore counts were captured twice with identical fingerprints.
- Deployed Firestore rules match the repository checksum.
- The temporary credential was tested against critical Firebase permissions: required reads are granted and no tested Firestore, Authentication or Rules mutation permission is granted.

## Exit checklist

- [x] Run the sanitized live audit twice.
- [x] Explain all count changes between runs; there were none.
- [x] Reconcile live catalog counts with 9 restaurants, 94 category entries and 822 menu entries.
- [x] Confirm live Auth providers and user totals.
- [x] Confirm deployed indexes match the recorded repository version.
- [x] Confirm deployed rules match the recorded repository version.
- [x] Classify and map every discovered collection/subcollection.
- [x] Record every unexplained anomaly in `migration-decisions.md`.
- [x] App owner reviewed and approved the inventory and baseline on 2026-09-02.
