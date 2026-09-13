# Phase 5 Restaurant desktop pilot test checklist

**Target:** Staging Restaurant app at `https://hungrie-restaurant--staging.expo.app`

**Result rule:** Mark a test passed only after observing the expected result. Record the device and browser details below. Do not place passwords, tokens, Customer addresses, or other private data in this document.

## Device record

Run the desktop tests on all four supported combinations.

| ID | Device model | OS and version | Browser and version | PWA installed | Notification permission | Tester | Date | Result |
|---|---|---|---|---|---|---|---|---|
| W-C |  | Windows  | Chrome  | Yes / No | Granted / Denied / Revoked |  |  |  |
| W-E |  | Windows  | Edge  | Yes / No | Granted / Denied / Revoked |  |  |  |
| M-C |  | macOS  | Chrome  | Yes / No | Granted / Denied / Revoked |  |  |  |
| M-E |  | macOS  | Edge  | Yes / No | Granted / Denied / Revoked |  |  |  |

iPhone/iPad results may be recorded as additional evidence, but they do not replace the four desktop combinations required by the Phase 5 gate.

## 1. Login, navigation, and presentation

Run these tests with both the pilot **owner** and **manager** accounts.

| ID | Action | Expected result | Owner | Manager |
|---|---|---|---|---|
| NAV-01 | Sign in, then open Dashboard, Live orders, History, Menu, Restaurant, Reviews, Alerts, and Security. | Every route opens and remains on the selected page; the app does not jump back to Dashboard. | Pass | Pass |
| NAV-02 | Refresh the browser directly on `/orders`, `/menu`, and one `/orders/detail?orderId=<id>` page. | The same route reloads after access verification; there is no 404 or redirect loop. | Retest static detail URL | Retest static detail URL |
| NAV-03 | Change EN to TR and back to EN. Navigate and refresh. | Labels change language and the app remains usable. | Pass | Pass |
| NAV-04 | Open an order and History. | Readable fields, item names, options, totals, and states appear; raw API JSON is absent. | Pass | Pass |
| NAV-05 | Open a long menu form and reach its final controls. | The full page scrolls vertically without horizontal page overflow. | Pass | Pass |
| NAV-06 | Sign out, press Back, and try a copied private route URL. | No private Restaurant or order data is visible; sign-in is required. | Pass | Pass |

## 2. Owner and manager operations

Use only Staging test records. Return the Restaurant to its original state after the test.

| ID | Action | Expected result | Owner | Manager |
|---|---|---|---|---|
| CAP-01 | Change a Restaurant detail, save it, refresh, then restore it. | The saved value appears after refresh and restoration succeeds. | Pass | Pass |
| CAP-02 | Turn order acceptance on, refresh, then turn it off. | The setting persists; it can be enabled only while the account, Restaurant, connection, and initial order sync are healthy. | Pass | Pass |
| CAP-03 | Create a temporary category and item with a valid JPEG/PNG/WebP image. | The image uploads inside this Restaurant's folder and the item appears after refresh. | Pass | Pass |
| CAP-04 | Add ingredients, a removable ingredient, a required option group, selection limits, and a paid option. | Valid settings save and reload unchanged. | Pass | Pass |
| CAP-05 | Try a negative price or inconsistent minimum/maximum selection count. | Save is blocked with a safe validation message; no invalid item is created. | Pass | Pass |
| CAP-06 | Reorder categories/items with the move controls and refresh. | The new order persists. | Pass | Pass |
| CAP-07 | Select multiple items and change availability. | All selected items change together; refresh shows the same state. | Pass | Pass |
| CAP-08 | Try to alter a record belonging to another Restaurant through the guarded API test. | The operation is denied and the other Restaurant is unchanged. | Pass (automated) | Pass (authenticated Staging probe) |

## 3. Connected order workflow

Keep the Live orders screen staffed while order acceptance is enabled. Create each order through the Staging Customer flow.

| ID | Action | Expected result | Result |
|---|---|---|---|
| ORD-01 | Create a new order while Live orders is open and online. | The order appears without manual refresh, with one prominent foreground alert and sound after audio has been enabled by user interaction. | Pass (pilot report, 2026-09-14) |
| ORD-02 | Open the order, confirm `pending -> preparing`, then complete the supported delivery transitions. | Each transition succeeds once, displays the authoritative state, and appears correctly in History. | Pass (pilot report, 2026-09-14) |
| ORD-03 | Reject a pending order with an allowed reason and internal note. | The order is cancelled once with the selected reason; it leaves Live orders and appears in History. | Pass (pilot report, 2026-09-14) |
| ORD-04 | Open the same pending order in two browser sessions before either responds, then submit Preparing from both without refreshing the second session. | One transition succeeds; the other displays the current order and an order-changed message. Neither browser loses the Restaurant shell. | Pass (pilot retest, 2026-09-14; earlier partial result resolved) |
| ORD-05 | Leave a pending order unanswered until its five-minute server deadline passes, then try to accept it. | Late acceptance is rejected and the order becomes cancelled for deadline expiry. | Pass (pilot report, 2026-09-14) |
| ORD-06 | Create one order while Realtime, polling, focus reconciliation, and push can all observe it. | The order appears once and remains one order; duplicate triggers do not duplicate its state or transition. | Pass (pilot report, 2026-09-14) |

## 4. Recovery and connectivity

| ID | Action | Expected result | Result |
|---|---|---|---|
| REC-01 | Disconnect the Restaurant device from the network, create an order, then reconnect. | The UI shows the disconnected state, prevents unsafe readiness, and fetches the missed order after reconnection. | Retest required: first attempt showed only a generic service error; global offline warning added. |
| REC-02 | Put the tab in the background, create an order, then focus it. | The order is reconciled when the tab regains focus. |  |
| REC-03 | Put the computer to sleep, create an order from another device, then wake it. | The connection recovers and the missed order appears. |  |
| REC-04 | Temporarily block or interrupt the private Realtime connection while leaving HTTP available. | The bounded polling path recovers the order and Realtime reconnects later. |  |
| REC-05 | Suspend the pilot Restaurant account while its app is open, then attempt a read and mutation. | Normal access and mutations are denied promptly and the suspended/support state appears. Restore the test account afterward. |  |
| REC-06 | Suspend the Restaurant entity while an order is open. | Restaurant staff cannot mutate it, new checkout is denied, and Admin support handling remains available. Restore the test Restaurant afterward. |  |

## 5. Notifications

Run this section for W-C, W-E, M-C, and M-E. “Closed page” means all Hungrie Restaurant tabs/windows are closed while the browser and operating system are still permitted to receive background notifications. Record a fully quit browser separately because operating-system behavior can differ.

| ID | Action | Expected result | W-C | W-E | M-C | M-E |
|---|---|---|---|---|---|---|
| PUSH-01 | Install/open the PWA, choose **Enable notifications**, and allow the browser prompt. | The Alerts page reports that FCM Web Push is registered, with no simultaneous registration error. |  |  |  |  |
| PUSH-02 | Select **Test notification** while the app is foregrounded. | One visible notification and audible alert are produced. |  |  |  |  |
| PUSH-03 | Create an order while the Restaurant tab is foregrounded. | The order appears and a foreground alert is produced. |  |  |  |  |
| PUSH-04 | Create an order while the tab is backgrounded. | An operating-system notification appears; selecting it opens the authenticated order route and current data is fetched. |  |  |  |  |
| PUSH-05 | Close all Restaurant pages, then create an order. | A generic new-order notification appears without Customer PII; selecting it reopens the app and fetches the order after authentication. |  |  |  |  |
| PUSH-06 | Deny notification permission in a fresh browser profile. | The app explains that notifications are unavailable and continues to require the staffed connected screen. |  |  |  |  |
| PUSH-07 | Revoke previously granted permission and reload. | The UI no longer claims registration is healthy; Live orders still recover through the connected app. |  |  |  |  |
| PUSH-08 | Trigger the same order through foreground/Realtime and FCM close together. | Only one user-facing alert is produced within the deduplication window. |  |  |  |  |

## 6. PWA cache and privacy

Run once in Chrome and once in Edge on each operating system.

| ID | Action | Expected result | Result |
|---|---|---|---|
| CACHE-01 | In browser developer tools, inspect the service worker and Cache Storage after visiting private routes. | The worker is active, but Cache Storage contains no access context, API response, order, Customer, or token-bearing request. |  |
| CACHE-02 | Inspect network responses for authenticated HTML/API requests and reload a private route. | Private responses are not served from a shared/public cache and use the expected no-store/private behavior. |  |
| CACHE-03 | Sign out, go offline, and revisit previously opened private URLs. | Previously viewed order or Customer data is not available from the service worker/cache. |  |
| CACHE-04 | Select a notification after the session has expired or after sign-out. | The app requires authentication before fetching order details; the notification itself contains no private order data. |  |

## 7. Completion record

Phase 5 can be accepted when:

- Every applicable row above is marked passed on the required desktop combinations.
- Both owner and manager workflows pass.
- Any failure has been fixed and retested.
- The actual device, OS, browser, PWA, permission, sleep/recovery, and staffed-screen results are recorded.
- The app owner explicitly accepts the Phase 5 Staging pilot evidence.

Record final outcome:

- Tester(s):
- Test date(s):
- Failed test IDs and resolution references:
- Staffed connected-screen readiness: Pass / Fail
- App-owner decision: Accepted / Not accepted
