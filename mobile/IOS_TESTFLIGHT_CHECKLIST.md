## iOS TestFlight Checklist (Hungrie)

### 1) Expo config (locked)
- `ios.bundleIdentifier`: `com.hungrie.app`
- `android.package`: `com.hungrie.app`
- `ios.buildNumber`: set in `app.json`
- `android.versionCode`: set in `app.json`
- `eas.json`:
  - `cli.version`: `16.32.0`
  - `cli.appVersionSource`: `local`

### 2) Build commands
```bash
npm run build:configure
npm run build:ios
```

### 3) Submit to TestFlight
```bash
npm run submit:ios
```

### 4) Apple side (Push + sound)
Create APNs key once in Apple Developer:
- Keys -> `+` -> Apple Push Notifications service (APNs)
- Save:
  - `.p8` file
  - `Key ID`
  - `Team ID`

Then attach credentials via EAS interactive flow when requested.

### 5) Important notes
- First iOS build generally needs interactive Apple login for credentials/profiles.
- Custom notification sounds require EAS build (Expo Go is not enough).
- iPhone silent mode / DND can suppress audible notifications.

### 6) Launch splash video QA
- Ensure `mobile/assets/splash/hungriesplash.mp4` exists before running `eas build`.
- Cold start (app fully killed): native static splash shows first, then MP4 plays once full-screen, then fades out (200–350ms) into the app.
- Reduce Motion enabled: MP4 is skipped; static mark shows for ~600ms then app continues.
- Failure mode: if MP4 fails to load/play within ~1.2s, the app continues without blocking (no black screen).
