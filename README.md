# osionos Calendar

Docker-managed Google Calendar service app for the Track Binocle pipeline.

From the repository root, start it with the complete stack:

```sh
make all
```

Or start only Calendar and its bridge:

```sh
make calendar-up
```

The UI runs at `https://localhost:3003` and the bridge runs at `https://localhost:4200` in the root stack. Google OAuth credentials belong in the ignored `.env.local`/`.env` files or the BaaS Vault secret configured for the bridge. The Compose setup can reuse the Mail app's `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; put Calendar-specific overrides in `apps/calendar/.env.local` when you want a separate OAuth client. The root stack builds stable local images named `track-binocle/calendar:local` and `track-binocle/calendar-bridge:local` unless overridden through Compose image variables.
