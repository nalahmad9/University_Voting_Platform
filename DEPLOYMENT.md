# Quorum deployment handoff

The repository is prepared for a Vercel frontend and two Render services. The
actual deployment must be performed from Nada's own GitHub, Vercel, Render and
Supabase accounts so repository ownership and deployment history remain hers.

## 1. Supabase production connection

Use the Supabase transaction-pooler connection string as Render's
`DATABASE_URL`. Use the direct database connection only as `DIRECT_URL` for
migrations. Both connection strings must include the URL-encoded database
password and SSL parameters supplied by Supabase.

Apply migrations once from a trusted development machine before opening voting:

```bash
npm run db:push
npm run db:verify
```

## 2. Render services

Create a Render Blueprint from `render.yaml`. Enter every value marked
`sync: false` in Render's secret environment-variable interface. Do not place
those values in the repository.

The Express service uses a persistent disk for per-ballot blind-signing keys.
Without that disk, a service restart would invalidate authorizations issued
before the restart. Production beyond the prototype should replace the disk
with reviewed managed-key infrastructure.

After Render creates both services, verify:

- `https://<express-host>/api/v1/health`
- `https://<express-host>/api/v1/health/database`
- `https://<ai-host>/health`

Set `AI_SERVICE_URL` to the complete HTTPS origin of the AI service if Render
does not resolve the Blueprint reference automatically.

## 3. Vercel frontend

Import the repository into Vercel and set the project root directory to
`apps/web`. The included `vercel.json` runs the monorepo-aware Next.js build.
Add one browser-visible environment variable:

```text
NEXT_PUBLIC_API_URL=https://<express-host>/api/v1
```

Deploy, copy the final Vercel HTTPS origin, and set the Express Render service's
`FRONTEND_URL` to that exact origin. Redeploy Express after changing CORS.

## 4. Final production checks

- Confirm HTTPS is active on all three origins.
- Confirm browser requests from the Vercel origin pass CORS and no other origin
  is accepted.
- Confirm `.env` values are absent from build logs and frontend bundles.
- Run the normal test suites, then point k6 only at an approved staging URL.
- Cast and verify a staging vote, restart Express, and confirm the persistent
  signing key still validates the pending authorization.
- Never run the bot or load simulations against a live election.
