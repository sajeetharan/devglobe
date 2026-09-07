# DevGlobe social posting

DevGlobe creates two X post drafts per day at 14:00 and 22:00 UTC. Drafts are stored in Cosmos DB and are never published until an operator approves them. On each cron run, the oldest approved due draft is published before the next run completes.

## Setup

1. Create an X developer project and app with Read and Write permissions.
2. Generate user-context API key/secret and access token/secret for the official DevGlobe account.
3. Configure `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, and `X_ACCESS_SECRET` in `.env.local` and in Vercel. Never commit their values.
4. Run `npm run setup-social-posts-container` once.
5. Deploy the application so the Vercel cron schedule is active.

## Review workflow

```powershell
npm run social-posts -- list pending
npm run social-posts -- approve 2026-08-18-early reviewer-name
npm run social-posts -- reject 2026-08-18-late "Reason for rejection"
```

An approved draft publishes on the next cron run. To publish it immediately after approval:

```powershell
npm run social-posts -- publish 2026-08-18-early
```

Failed drafts are not retried automatically because a network failure can leave the remote publish result uncertain. Verify the official account first, then approve the failed draft again if it was not posted.

## Multi-channel developer campaigns

Generate review-only campaign assets for LinkedIn, X, Reddit, Discord, and GitHub Discussions:

```powershell
npm run activation-campaign -- --limit=5 --output=artifacts/community-campaign.json
```

The artifact contains channel-specific copy and `/share/<login>` links with bounded `utm_source`, `utm_medium`, `utm_campaign=developer_spotlight`, and public-login `utm_content` values. Review every developer story before posting. This command does not publish, authenticate to a social network, or modify developer records.

Publish a small weekly cohort to LinkedIn and GitHub Discussions first. Review **Campaign to Value Conversion** in the product adoption dashboard after seven days before expanding to other channels. Do not compare channels with fewer than three privacy cohorts.

## Top 50 India campaign

Preview the current score-ranked India profiles and their public GitHub X handles without writing data:

```powershell
npm run social-posts:india
```

The command refuses to create a partial campaign when any profile lacks a verified public X handle. Evidence-backed overrides live in `data/india-social-x-handles.json`; each entry must include the developer-controlled source URL that publishes the handle.

When an operator explicitly accepts a partial campaign, `--allow-partial` skips unresolved profiles while preserving their original country ranks:

```powershell
npm run social-posts:india -- --write --allow-partial
```

After all 50 handles are verified, create idempotent pending drafts:

```powershell
npm run social-posts:india -- --write
npm run social-posts -- list pending
```

Each approved campaign post mentions one developer and attaches their generated DevGlobe README profile card. The publisher fetches only DevGlobe `/api/profile-card/*.svg` media, rasterizes it to PNG for X, and uploads accessible alt text. Draft creation does not approve or publish posts.