# Qualification F Vercel preflight forensic report

## Disposition

Qualification `restaurant-vercel-browser-notification-qualification-20260928f` is terminal `ABORTED`, consumed, and ineligible for reuse. Its authority, source manifest, progress record, terminal record, and evidence manifest remain unchanged.

The confirmed root-cause category is **insufficient persisted evidence**. The runner combined five project assertions and threw before writing its planned preflight snapshot. The preserved records therefore establish which combined assertion failed, but do not establish which individual provider field differed or what value the provider returned. Inferring project drift, protection drift, or a Vercel response-shape change from that generic error would be speculative.

## Exact failed assertion

The temporary qualification runner evaluated this expression after its first read-only Vercel project inspection:

```js
p.id === "prj_PrVORzWTAxmAHL0SqNcA9WXJppS4" &&
p.name === "hungrie-restaurant-web-staging-eval-20260927a" &&
p.accountId === "team_799flI3SHCD8C2AXbbQ6NlBX" &&
p.ssoProtection?.deploymentType === "all_except_custom_domains" &&
p.enablePreviewFeedback === false
```

It emitted `Vercel project identity or protection differs.` when the expression was false. Because the subsequent `preflight.json` write was never reached, the actual values of `id`, `name`, `accountId`, `ssoProtection.deploymentType`, and `enablePreviewFeedback` are **not persisted and unavailable**. The later deployment assertion was not reached.

The preserved terminal and progress records contain only the generic error, `prerequisites: NOT_EXECUTED`, no account or notification results, and terminal `ABORTED`. Their byte identities are protected by the new inspection operator before authority preparation and execution.

## Minimal read-only resolution

The dedicated operator `scripts/inspect-restaurant-vercel-project-protection.mjs` is limited to:

1. one authenticated `GET /v9/projects/prj_PrVORzWTAxmAHL0SqNcA9WXJppS4`;
2. one authenticated `GET /v13/deployments/dpl_8CM3s16BZRwK9Ls1eMMJCVKmWyYt`;
3. Vercel scope `nurlan-ildirimli-s-projects`;
4. zero retries and zero mutations.

It persists allowlisted field values and response-shape metadata only. It never persists raw provider bodies, tokens, bypass values, environment values, or unrelated configuration. Its field-level assertions distinguish:

- `PASS_REVIEWED_STATE`;
- `REAL_WRONG_PROJECT_OR_SCOPE`;
- `REAL_PROTECTION_STATE_DRIFT`;
- `REAL_DEPLOYMENT_IDENTITY_DRIFT`;
- `PROVIDER_SCHEMA_OR_CANONICALIZATION_CHANGE`;
- `INSPECTION_READ_FAILED`.

The inspection is separately authorized and terminal. It cannot create or revoke a Vercel bypass, start a browser, access accounts, invoke Firebase/FCM, deploy, change aliases or domains, or start another qualification.

## Hosted activity in this work package

No hosted request or mutation was performed. A new browser/notification authorization is premature until the minimal inspection identifies the actual provider state or response contract.
