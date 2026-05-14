# Firefox Release Checklist

## One-time AMO setup

1. Create a Mozilla Add-ons developer account.
2. Create API credentials in the AMO developer hub.
3. Export the credentials before signing:

```bash
export WEB_EXT_API_KEY="your-jwt-issuer"
export WEB_EXT_API_SECRET="your-jwt-secret"
```

Alternatively, pass credentials directly:

```bash
npm run firefox:sign:listed -- --api-key="$AMO_JWT_ISSUER" --api-secret="$AMO_JWT_SECRET"
```

## Local validation

```bash
npm install
npm run firefox:lint
npm run firefox:build
```

The unsigned build is written to `dist/firefox/`.

## Listed AMO submission

Use this for public AMO listing and Firefox-managed updates:

```bash
npm run firefox:sign:listed
```

Upload or review the generated submission in the AMO developer hub. Use:

- `amo/review-notes.md` for reviewer notes
- `PRIVACY.md` for the privacy policy
- `README.md` for setup documentation

## Unlisted/self-hosted signing

Use this only if distributing the `.xpi` yourself:

```bash
npm run firefox:sign:unlisted
```

The extension still must be signed by Mozilla for release Firefox installs.

## Before Each Release

1. Update `extension/manifest.json` version.
2. Update `package.json` version if needed.
3. Run `npm run firefox:lint`.
4. Run `npm run firefox:build`.
5. Test the extension against a running helper daemon.
6. Confirm the helper is separately downloadable and the README explains that it must be started first.
