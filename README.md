<div align="center">

# 🌐 DevGlobe — Developer Discovery for Humans and AI Agents

**The global open-source developer discovery platform — search, compare, and connect with the people behind the code**

[![Live Demo](https://img.shields.io/badge/Live-Demo-blue?style=for-the-badge&logo=microsoftazure)](https://devglobe.dev)
[![Documentation](https://img.shields.io/badge/Documentation-GitHub%20Pages-2ea44f?style=for-the-badge&logo=github)](https://sajeetharan.github.io/devglobe/)
[![VS Code](https://img.shields.io/badge/VS%20Code-Install-007ACC?style=for-the-badge&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=devglobedev.devglobe-developer-discovery)
[![GitHub Stars](https://img.shields.io/github/stars/sajeetharan/devglobe?style=for-the-badge&logo=github)](https://github.com/sajeetharan/devglobe/stargazers)
[![License](https://img.shields.io/github/license/sajeetharan/devglobe?style=for-the-badge)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=for-the-badge)](CONTRIBUTING.md)

<img src="assets/img/devglobe.gif" alt="DevGlobe Demo" width="800" />

*26,000+ developers · ranked by stars, commits, repo reach & StackOverflow reputation · searchable by skill, location & language*

</div>

DevGlobe is an interactive global developer network built for engineering teams, open-source communities, and the emerging ecosystem of AI agents. It combines a 3D developer map with Azure Cosmos DB vector and hybrid search to surface relevant expertise from real contribution signals rather than popularity alone. The long-term vision is a consent-aware discovery layer where AI agents can find the right human collaborators.

The dynamic application is hosted on [Azure Container Apps](https://www.devglobe.dev). Product, API, MCP, Agent Skill, and agent-readiness documentation is published separately on [GitHub Pages](https://sajeetharan.github.io/devglobe/).

> [!IMPORTANT]
> **Connect an AI agent to DevGlobe:** MCP-compatible agents can use the hosted endpoint at `https://www.devglobe.dev/mcp` to search public developer profiles without credentials. Verified agents can also request developer-approved introductions. See the [MCP setup guide](docs/mcp-server.md).
>
> **Use DevGlobe in VS Code:** Install [DevGlobe.dev Developer Discovery](https://marketplace.visualstudio.com/items?itemName=devglobedev.devglobe-developer-discovery) to search profiles, share identity cards, and copy MCP configuration from the Command Palette.

## 🎬 Watch the DevGlobe Demo

<div align="center">
   <a href="https://www.youtube.com/watch?v=eXJWHis-skA">
      <img src="https://i.ytimg.com/vi/eXJWHis-skA/maxresdefault.jpg" alt="Watch the DevGlobe developer discovery platform demo on YouTube" width="800" />
   </a>
   <br />
   <strong><a href="https://www.youtube.com/watch?v=eXJWHis-skA">DevGlobe: Where Developers and AI Agents Connect</a></strong>
</div>

---

## ✨ Features

- **Interactive 3D Globe** — Explore developers pinned to their real-world locations using Three.js
- **AI-Powered Search** — Hybrid + vector search via Azure Cosmos DB (e.g. "AI & deep learning", "full stack JS dev")
- **Composite Scoring** — Each developer scored 0–100 across 6 dimensions
- **Leaderboard** — Filter by country, language, or sort by score/stars/commits
- **Developer Profiles** — Click any pin to see detailed stats, top repos, and contribution breakdown
- **Remote MCP Access** — Agents can discover developers and request consent-gated introductions through hosted tools
- **VS Code Extension** — Search developers, open profiles, share identity cards, and configure MCP from the editor
- **Mobile Responsive** — Bottom-sheet filters and full-width search on smaller screens

## 🚀 Quick Start

### Option 1: Zero-config (sample data, no database needed)

```bash
git clone https://github.com/sajeetharan/devglobe.git
cd devglobe
npm install
npm run dev
# Open http://localhost:3000
```

The app automatically falls back to the bundled sample data (20 developers) when no Cosmos DB credentials are configured. **No API keys, no emulator, no setup** — just clone and run.

> Text search works fully offline. Vector/hybrid search requires Azure OpenAI (see Option 3).

---

### Option 2: Cosmos DB Emulator (full database experience locally)

For contributors working on the API layer or data pipeline:

1. **Install the Cosmos DB Emulator** — [Download here](https://learn.microsoft.com/en-us/azure/cosmos-db/how-to-develop-emulator) (Windows, macOS via Docker, or Linux Docker)

2. **Start the emulator** and wait for it to be ready at `https://localhost:8081`

3. **Seed sample data into the emulator:**
   ```bash
   npm run seed-emulator
   ```

4. **Create `.env.local`** (the seed script prints this for you):
   ```env
   COSMOS_ENDPOINT=https://localhost:8081
   COSMOS_KEY=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==
   ```

5. **Run the app:**
   ```bash
   npm run dev
   ```

> The emulator key above is Microsoft's [well-known emulator key](https://learn.microsoft.com/en-us/azure/cosmos-db/emulator#authentication) — it is intentionally public and only works locally.

---

### Option 3: Full Azure backend (vector + hybrid search)

For the complete experience including AI-powered search:

```env
# .env.local
COSMOS_ENDPOINT=https://your-account.documents.azure.com:443/
COSMOS_KEY=your-cosmos-key
AZURE_OPENAI_ENDPOINT=https://your-openai.openai.azure.com/
AZURE_OPENAI_KEY=your-openai-key
EMBEDDING_DEPLOYMENT=text-embedding-3-small
AZURE_OPENAI_CHAT_DEPLOYMENT=gpt-4o-mini
```

`AZURE_OPENAI_CHAT_DEPLOYMENT` enables generated fun facts on identity cards. Cards use factual profile copy when the chat deployment is unavailable.

Production serves the Next.js application from Azure Container Apps, high-volume public API reads from Azure Functions, and the developer snapshot from Azure Blob Storage. See [docs/azure-backend.md](docs/azure-backend.md) for the resource layout, environment switches, and deployment checks.

```bash
npm run dev
```

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Three.js (react-globe.gl), Next.js 15 |
| Search | Azure Cosmos DB (vector + hybrid search) |
| API | Next.js API Routes |
| Hosting | Azure Container Apps and Azure Functions |
| Data Pipeline | Node.js scripts (GitHub GraphQL, StackOverflow API, geocoding) |

## 📊 Scoring Formula (0–100)

| Dimension | Weight | Source |
|-----------|--------|--------|
| GitHub Stars | 20% | Total stars across repos |
| GitHub Commits | 20% | Yearly commit activity |
| Repo Reach | 15% | Forks + watchers |
| SO Reputation | 25% | StackOverflow reputation |
| SO Engagement | 15% | Answer acceptance × count |
| Community | 5% | Followers + badges |

All dimensions are log-normalized to prevent outlier domination.

## 🔧 Building the Full Dataset

Requires API keys — copy `.env.example` to `.env` and fill in your tokens.

```bash
npm run fetch-github          # Fetch top devs from GitHub GraphQL
npm run fetch-stackoverflow   # Enrich with StackOverflow reputation
npm run geocode               # Convert locations to lat/lng
npm run build-data            # Run full pipeline
npm run upload-cosmos         # Upload to Azure Cosmos DB
```

### Developer credentials

Verified community credentials are stored explicitly on each developer document. Do not infer them from stars, followers, or profile text.

```json
{
   "login": "example",
   "specialTags": ["github-star", "microsoft-mvp", "aws-community-builder"]
}
```

Supported IDs: `github-star`, `microsoft-mvp`, `google-developer-expert`, `docker-captain`, `cncf-ambassador`, `aws-hero`, and `aws-community-builder`. The legacy `docker-champion` ID remains supported. The upload script preserves this field from source JSON, and the list, detail, and search APIs project it from Cosmos DB.

Populate exact GitHub-login matches from the official GitHub Stars, Google Developer Experts, and CNCF Ambassadors rosters:

```bash
npm run populate-special-tags             # Dry run
npm run populate-special-tags -- --apply  # Patch verified matches in Cosmos DB
```

The command preserves existing tags and is idempotent. Other credentials require an official profile that explicitly identifies the developer's GitHub account; do not populate them by matching display names.

## 📁 Project Structure

```
├── index.html                  # Entry HTML
├── src/
│   ├── main.jsx                # App bootstrap + Vercel Analytics
│   ├── App.jsx                 # Root component, data loading
│   ├── components/
│   │   ├── Globe.jsx           # 3D globe (react-globe.gl)
│   │   ├── Leaderboard.jsx     # Ranked sidebar with filters
│   │   ├── SearchBar.jsx       # Hybrid/vector search input
│   │   ├── DetailPanel.jsx     # Developer detail card
│   │   ├── Header.jsx          # Top bar with branding
│   │   └── LoadingOverlay.jsx  # Loading state
│   └── utils/
│       ├── scoring.js          # Composite scoring algorithm
│       └── format.js           # Number formatting helpers
├── api/
│   ├── developers.js           # List all developers
│   ├── developer.js            # Single developer lookup
│   └── search.js               # Cosmos DB vector/hybrid search
├── scripts/                    # Data pipeline scripts
├── styles/main.css             # Dark theme styles
└── data/
    └── developers-sample.json  # Sample data for local dev
```

## 🌍 Deploy to Azure Container Apps

Pushes to `main` build the standalone Next.js image in Azure Container Registry and deploy it to Azure Container Apps through GitHub Actions OIDC. The deployment identity requires Contributor access scoped to the application resource group and these repository variables: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID`.

Required environment variables:

| Variable | Purpose |
|----------|---------|
| `COSMOS_ENDPOINT` | Azure Cosmos DB endpoint |
| `COSMOS_KEY` | Azure Cosmos DB key |
| `COSMOS_DATABASE` | Database name |
| `COSMOS_CONTAINER` | Container name |
| `COSMOS_ACTIVITY_CONTAINER` | Rolling GitHub activity container (`activities`) |
| `COSMOS_CONTACTS_CONTAINER` | Private lifecycle-email contact container (`developer-contacts`) |
| `ACTIVITY_INGEST_SECRET` | Bearer secret for the activity collector endpoint |
| `RESEND_API_KEY` | Optional Resend API key for claim and approval emails |
| `EMAIL_FROM` | Sender on a domain verified by Resend |
| `COSMOS_WATCHLIST_CONTAINER` | Optional private watchlist container name (default: `watchlists`) |
| `COSMOS_IMPACT_HISTORY_CONTAINER` | Optional impact snapshot container name (default: `impact-history`) |
| `CRON_SECRET` | Bearer token shared by protected cron endpoints and Azure Timer Functions |
| `EMAIL_PREFERENCE_SECRET` | HMAC secret for weekly-email unsubscribe links; defaults to `SESSION_SECRET` |

Lifecycle emails are transactional and best-effort. Claims use the verified primary email authorized through GitHub OAuth; self-nominations collect an explicitly consented notification address. Addresses are stored only in the private `developer-contacts` container and are never projected by public APIs or copied into developer documents. Create the container before deployment:

```bash
npm run setup-contacts-container
```

See the [lifecycle email PRD](docs/prd/lifecycle-email-notifications.md).

Verified users can explicitly opt in to a Monday weekly digest from the user menu. The digest includes current global and country rankings, rank movement since the previous digest, current DevGlobe features, and an Explore DevGlobe link. The Azure Functions app invokes `/api/cron/weekly-digest` at 13:00 UTC each Monday; only verified contacts with `productUpdatesEnabled: true` are eligible. Each message uses a per-user, per-week idempotency key and includes one-click unsubscribe headers and a signed unsubscribe link.

Generate a manual-review activation queue and weekly social spotlight from public, unclaimed profiles:

```bash
npm run activation-campaign -- --limit=100 --output=data/activation-campaign.json
```

The command is read-only against Cosmos DB and never sends messages or retrieves private contact details. Review each draft before contacting a developer through an appropriate public channel.

### Live developer activity

The Activity tab is anonymous and shows a rolling 24-hour feed for indexed developers. Create its dedicated Cosmos container before deployment:

```bash
npm run setup-activity-container
```

Deploy `functions/activity-ingest` as an Azure Timer Function and configure these application settings:

```env
ACTIVITY_INGEST_URL=https://your-site.example/api/activities/ingest
ACTIVITY_INGEST_SECRET=the-same-secret-configured-on-the-site
```

The timer invokes the collector every minute, matching GitHub's advertised polling interval. GitHub's public Events API is best-effort and may delay or omit events; the 15-second browser refresh does not guarantee GitHub source delivery within that interval. A valid `GITHUB_TOKEN` is required for full three-page collection; anonymous fallback inspects one page only. The Cosmos activity container uses a 48-hour TTL while the API exposes only the latest 24 hours.

### Impact history capture

Deploy the `functions` directory to an Azure Function App and configure these application settings for the 15-minute impact-history timer:

```env
IMPACT_HISTORY_URL=https://www.devglobe.dev/api/cron/impact-history
CRON_SECRET=the-same-secret-configured-on-the-container-app
```

The timer resumes the current UTC day's capture in RU-bounded batches. Keep `IMPACT_HISTORY_CONCURRENCY` and `IMPACT_HISTORY_BATCH_SIZE` on the Container App because the Next.js endpoint performs the Cosmos work.

### Email verification reminders

The Azure Functions app invokes the protected reminder endpoint daily at 14:00 UTC. The application sends reminders only to unverified contacts who consented to transactional email and have not received a reminder in the previous 72 hours; verified contacts stop receiving reminders immediately.

Configure these application settings on the Azure Function App:

```env
EMAIL_VERIFICATION_REMINDERS_URL=https://www.devglobe.dev/api/cron/email-verification-reminders
WEEKLY_DIGEST_URL=https://www.devglobe.dev/api/cron/weekly-digest
CRON_SECRET=the-same-secret-configured-on-the-container-app
```

Deploy the complete `functions` directory so each timer and its `function.json` are included.

## 🤝 Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and areas where help is needed.

## 🤖 MCP Server

DevGlobe exposes a hosted Streamable HTTP MCP endpoint for public developer discovery and consent-gated agent introductions:

```text
https://www.devglobe.dev/mcp
```

Public search and profile lookup work anonymously. Introduction requests and status polling require an issued agent credential. A local stdio connector remains available for clients that do not support remote MCP:

```bash
npm run mcp
```

See [docs/mcp-server.md](docs/mcp-server.md) for credential provisioning, Cosmos DB setup, client configuration, and the consent lifecycle. [docs/agent-readiness.md](docs/agent-readiness.md) documents machine-readable discovery, WebMCP, and the external DNS-AID deployment steps.

## 📄 License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">

**[⭐ Star this repo](https://github.com/sajeetharan/devglobe)** if you find it useful!

Built with ❤️ by [@sajeetharan](https://github.com/sajeetharan)

</div>
