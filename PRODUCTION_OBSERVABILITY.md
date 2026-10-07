# Hungrie production observability runbook

This runbook describes source capabilities. It does not assert that hosted alert
policies, recipients, retention, or IAM have been configured. Those checks must
be completed before Production qualification.

## Evidence locations

| Surface | Evidence | Correlation |
|---|---|---|
| Firebase Functions | Google Cloud structured logs and invocation/scheduler status | Function name plus `event`, `operationId`, `orderId`, `deliveryId`, or `eventId` when present |
| Supabase RPC/database | Postgres/PostgREST logs, `private.audit_log`, operation ledgers, and `cron.job_run_details` | Existing operation UUID, order ID, audit ID, or delivery ID |
| Push worker | Supabase Edge Function logs and `private.notification_events` / `private.notification_deliveries` | Event and delivery UUIDs; never the raw token |
| Customer app | Sentry only when explicitly enabled for staging/Production | Release, distribution, environment, safe operation/order ID |
| Restaurant/Admin clients | User-visible recovery plus Vercel/deployment evidence; no remote browser crash collector is proven | Deployment metadata and server operation/audit IDs |

Provider request metrics and logs are operational logging, not business audit
history. `private.audit_log` is the authoritative security/business record and
must not be expanded into a debugging payload store.

## High-signal event names

- `account.delete.orchestration_failure`
- `account.delete.reconciliation_required`
- `account.delete.reconciliation_incomplete`
- `push.web.delivery_failure`
- `push.worker.internal_failure`
- `push.direct.delivery_failure`
- `media.process.internal_failure`
- `media.process.cleanup_failure`
- `security.rate_limit.internal_failure`
- `order.create.unexpected_failure` (Customer Sentry capability when enabled)

Expected isolated business/security outcomes—including invalid media, ordinary
rate limiting, minimum-order rejection, stale version, forbidden access, and
offline client errors—are not paging incidents. They may be aggregated as
security or product-health signals. Alert on terminal/systemic behavior using a
traffic baseline established in hosted qualification; do not invent thresholds
from local tests.

## Incident queries

1. Order creation: start with the Customer operation UUID. Search Customer error
   telemetry (when enabled), Supabase API/Postgres logs for `create_order_v2`,
   `private.customer_order_operations`, and the matching `order.created_v2`
   audit entry. A successful replay returns the existing order.
2. Push: inspect Edge/Functions events, then delivery state and attempts in
   `private.notification_deliveries`. `dead_letter` is terminal; `pending` after
   retries is not. Use delivery/event UUIDs, never push tokens.
3. Account deletion: search the structured account-deletion events and query
   `pending_account_anonymizations`. The hourly reconciler is idempotent and now
   fails its invocation when lookup/finalization remains incomplete.
4. Realtime: compare database `Status-aware order invalidation skipped` warnings,
   Realtime provider health/logs, and the read-only websocket health check.
   Realtime is non-authoritative; clients reconcile over authenticated RPCs.

## Scheduled work

Current database jobs include pending-order expiry, notification dispatch,
notification receipts, repeated Restaurant non-response detection, Restaurant
financial-integrity detection, and abuse-limit cleanup. Firebase schedules also
include Restaurant web-push dispatch and account-anonymization reconciliation.
Use provider job history for last-success/failure evidence. The local
`npm run supabase:health -- production ...` checker covers API reachability,
Realtime reachability, notification backlog/dead letters, and expiry freshness,
but it is not monitoring until a hosted scheduler and alert destination are
verified.

## Privacy rules

Never put bearer/App Check tokens, service-role keys, refresh tokens, push
tokens, passwords, TOTP secrets, recovery codes, emails, phone numbers,
addresses, notes, review/search text, carts, request bodies, or media bytes into
operational events. Use opaque operation/order/audit/delivery IDs. Firebase
Functions operational events accept only an explicit field allowlist. Customer
Sentry strips user, request, breadcrumb payload, extra, message, and exception
text while retaining stack structure and safe tags.

## Hosted qualification checklist

- Generate a non-destructive synthetic Staging failure carrying an operation
  UUID and verify it arrives in the intended log stream with environment and
  release/deployment metadata.
- Verify log-based alert policies for sustained unexpected order failures,
  deletion reconciliation failure, push dead letters/worker failures, cron
  failure/staleness, and Realtime broadcast/availability failure.
- Validate the alert destination and perform a Staging delivery test.
- Confirm Production filters cannot receive development/emulator noise.
- Confirm provider log retention and operator-only IAM without enumerating
  personnel in this repository.
- Verify Sentry DSN, ingestion, release mapping, and private source-map upload if
  Customer crash reporting is approved. Current EAS defaults disable it.
- Decide whether Restaurant and Admin browser crash reporting should reuse the
  approved monitoring provider; do not weaken either CSP to enable it.
