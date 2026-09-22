# Quorum

Quorum is organized as a single monorepo containing the public and authenticated web application, the core election API, the AI-support service, shared contracts, and Supabase database assets.

## Repository layout

- `apps/web` — Next.js-compatible React frontend built with Vinext.
- `apps/express-api` — Express and TypeScript API for authentication, elections, nominations, voting, receipts, and administration.
- `apps/ai-service` — FastAPI service for manifesto processing and privacy-preserving anomaly analysis.
- `packages/shared` — Shared TypeScript domain types and API contracts.
- `supabase` — Local Supabase configuration, SQL migrations, and development seeds.

## Local configuration

Copy each `.env.example` to `.env` in the same application directory and add local secrets there. Never commit `.env` files or server-side Supabase credentials.

## Common commands

```bash
npm run dev:web
npm run dev:api
npm run build
npm run db:validate
npm run db:push:dry-run
npm run db:push
npm run db:verify
```

`db:validate` executes the latest migration inside a database transaction and
rolls it back. It verifies the SQL without leaving schema changes behind.

## Database privacy boundary

The live schema follows the five entities in the approved ERD: `students`,
`ballots`, `candidates`, `voter_logs`, and `vote_hashes`. `voter_logs` records
that a student received voting authorization; `vote_hashes` records the
anonymous choice and token digest. There is no column or foreign key connecting
the two. Anonymous votes never store a student, session, JWT, raw network
identifier, raw vote token, or blind signature.

Run the Python service from `apps/ai-service` with:

```bash
python -m uvicorn app.main:app --reload --port 8000
```
