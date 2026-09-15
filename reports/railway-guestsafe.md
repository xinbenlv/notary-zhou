# Railway access through GuestSafe

On 2026-09-15, the user authorized importing the existing Railway CLI login and
enabled a temporary GuestSafe creation window. The official CLI successfully
refreshed and validated its own login as a one-time migration preparation.
A dedicated importer read only the allowlisted login fields, verified file
ownership and permissions, and sent a bound JSON bundle directly to GuestSafe
standard input. No extra plaintext credential file or credential-bearing log
was created. The original CLI configuration was preserved. The write window
was closed after storage and authenticated project verification succeeded.

Credential name: `RAILWAY_CLI_NOTARY_ZHOU_20260915`. This is an OAuth login bundle,
not a permanent API key or a project-scoped token. It can carry account-level
authority; the local project/service binding is an adapter check, not a Railway
permission restriction. The imported access token expires at 2026-09-15 14:47:53
UTC. Refresh credentials are stored, but the consumer deliberately does not
rotate or persist them. Future expiry requires an explicit renewal/persistence
workflow; do not silently fall back to the original CLI credentials.

## Consumer

`scripts/railway-guestsafe.py` requires the injected `NOTARY_RAILWAY_LOGIN` bundle,
validates schema, binding, credential kind and expiry, and launches the official
CLI with only the access token in `RAILWAY_API_TOKEN`. It suppresses raw CLI
output and exposes selected project/deployment status fields. Normal use does
not require sudo or a creation window. Example from this worktree:

```sh
guestsafe run RAILWAY_CLI_NOTARY_ZHOU_20260915 NOTARY_RAILWAY_LOGIN \
  --scope 'Read Notary Zhou production deployment status' \
  --justification 'Verify the authorized website release' -- \
  python3 scripts/railway-guestsafe.py deployment list \
  --project 7b6fe9b2-ce31-4559-bade-5ad32b56f7f4 \
  --service 833774b6-b5f2-4925-a942-047db1cf954d \
  --environment 38b82bdf-2bcd-419b-8846-e88465007ebb --limit 2 --json
```

Credential values must never be pasted into commands, reports or chat. Storage,
replacement and rotation follow the installed GuestSafe skill. Do not revoke
or delete the original login as an incidental cleanup step.
