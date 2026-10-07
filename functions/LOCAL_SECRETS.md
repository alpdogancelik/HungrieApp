# Local Functions secrets

Production, staging, and development Functions secrets are stored in Firebase Secret Manager. Do not export production secrets for local development.

The Firebase Functions emulator can override `defineSecret` values from the ignored `functions/.secret.local` file. Do not create that file with shell redirection or an editor that may use group/other-readable permissions.

Prepare an environment-format source file outside this repository, restrict it to your user, and install it through the secure writer:

```sh
chmod 600 /absolute/path/to/local-functions-secrets.env
npm --prefix functions run local:secrets -- --source=/absolute/path/to/local-functions-secrets.env
```

The writer accepts only the `defineSecret` names declared by Functions, creates an owner-only temporary file, atomically replaces `.secret.local`, and enforces mode `0600` on POSIX systems. Windows ACLs do not map to POSIX modes; Windows developers must protect the external source and repository with an owner-restricted ACL.

Start the Functions emulator with `npm --prefix functions run serve`, and deploy only through `npm --prefix functions run deploy`. Both commands use a launcher that scopes its POSIX umask to `0077`, secures Firebase CLI's configuration directory to `0700`, and secures existing Firebase CLI application-default credential files and debug logs to `0600` before the CLI runs. This is necessary because Firebase CLI 14.26.0 otherwise creates those files using the caller's default umask.

The project-specific `.env.hungrieapp-a2288` file contains deployment parameters such as `ORDER_AUTOMATION_BACKEND`; those are non-secret configuration. Templates contain placeholders only.
