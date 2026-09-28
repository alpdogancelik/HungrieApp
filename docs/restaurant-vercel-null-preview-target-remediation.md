# Vercel null Preview target remediation

## Root cause

Vercel's direct deployment API returned `target: null` for immutable deployment `dpl_8CM3s16BZRwK9Ls1eMMJCVKmWyYt`. The earlier qualification runner required the literal string `preview`. The completed read-only inspection proved that project ID, project name, team, protection mode, Preview Toolbar state, automation-bypass representation, deployment ID, project binding, hostname, and `READY` state all match the reviewed immutable Preview contract. Its evidence manifest is `850a3ca589c061cc9127902e2eb42bc980e1f4d56406a3c3216e1edc54bab838`.

The correction does not treat `null` as Preview generally. A null target is accepted only when all exact immutable identity, scope, protection, readiness, and hostname assertions pass and the protected completed inspection is independently verified byte-for-byte. Literal `preview` remains accepted for the same exact identity. Production, unknown targets, explicit non-Preview environment markers, wrong or missing identity fields, unsafe protection state, and malformed responses fail closed.

## Fresh qualification binding

- Qualification: `restaurant-vercel-browser-notification-qualification-20260928g`
- Evidence path: `secure/restaurant-vercel-browser-notification-qualification/restaurant-vercel-browser-notification-qualification-20260928g`
- Existing immutable deployment: `dpl_8CM3s16BZRwK9Ls1eMMJCVKmWyYt`
- Existing Preview origin: `https://hungrie-restaurant-web-staging-eval-20260927a-h9m8zpwol.vercel.app`
- Vercel inspection: `restaurant-vercel-project-protection-inspection-20260928a`
- Firebase inspection: `restaurant-vercel-firebase-domain-inspection-20260928b`

Qualification F is now included in the consumed-qualification binding and remains immutable and ineligible for replay. Authority preparation for G verifies both completed inspections, every previously protected prerequisite, the committed executable hashes, complete source manifest, and unused authority/evidence paths.

## Regression coverage

The full preflight path replays the sanitized provider inspection and persists `REVIEWED_NULL_PREVIEW` before proceeding. Tests also cover literal Preview, Production, unknown targets, wrong deployment ID, hostname, project, team, scope, non-READY state, explicit Production evidence, missing identity fields, malformed provider objects, altered inspection evidence, failure persistence, and consumed qualification-F rejection.

No hosted request or mutation was performed during this correction. A fresh comprehensive owner authorization is required before qualification G can create its one short-lived bypass or begin browser and notification work.
