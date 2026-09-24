# Restaurant UI Phase 5 — Windows Edge Offline Checklist

Phase 4 baseline: `71e5d7e08189bbe0da3849c48db16ef10cd6a27f`
Source manifest SHA-256: `aa5c6b85cc4b7fec6822066b75d05d24acd8d122f36b08216bb97accb1b2c645`
Artifact manifest SHA-256: `a05006e7aaef23d23de1f0ecc3abd38a2573c94e303d85387db7198934d61f5b`
Static artifact SHA-256: `bf983c377dcaf68e001a577844b753bbc877c451ad31285c19574b291c5e6f89`

## Prepare and serve

1. Copy this complete directory to the approved Windows desktop.
2. Verify hashes in PowerShell:
   `Get-FileHash .\restaurant-phase5-static-export.tar -Algorithm SHA256`
   `Get-FileHash .\artifact-manifest.tsv -Algorithm SHA256`
   `Get-FileHash .\phase5-source-manifest.tsv -Algorithm SHA256`
3. Extract: `tar -xf .\restaurant-phase5-static-export.tar -C .\artifact`
4. Serve without a hosted environment: `py .\serve-offline.py --directory .\artifact --port 4188`. This keeps Expo Router URLs extensionless while resolving them to the exported HTML files.
5. Open `http://127.0.0.1:4188/login` in the current stable Microsoft Edge. Do not append `.html` to route URLs.
6. Keep DevTools closed for viewport screenshots. Use Edge responsive mode only when exact viewport dimensions cannot be achieved by the window.

## Record

- Windows edition/version/build and Edge full version.
- Confirm all three hashes above match exactly.
- English and Turkish at 1024×768 and 1440×900.
- At 100% and 200% zoom: no horizontal page overflow, clipped content, covered actions, translucent sticky surfaces, or scroll traps.
- Keyboard only: skip link, primary navigation, forms, Reviews tabs with Arrow/Home/End, dialog focus containment, Escape/cancel, and focus restoration.
- Check representative login, Dashboard, Orders/detail, Menu/editor, Reviews/report dialog, Alerts, Security, and owner Earnings routes. Authentication may remain at the local configuration/error surface; do not connect to any hosted environment.
- Save PNG screenshots, compute each with `Get-FileHash <file> -Algorithm SHA256`, and enter every result in `edge-evidence-template.md`.

Any change to an application, style, localization, or runtime file invalidates this package and the affected Edge evidence.
