# Contributing to DevGlobe

Thank you for your interest in contributing to DevGlobe! This project visualizes the world's top developers on an interactive 3D globe, combining GitHub and StackOverflow data.

By participating in this project, you're expected to uphold our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Quick Setup

```bash
git clone https://github.com/YOUR_USERNAME/dev-globe-viz.git
cd dev-globe-viz
npm install
npm run dev
# Open http://localhost:3000
```

The app runs with sample data out of the box — no API keys needed for development.

## Project Structure

```
├── index.html              # Main page
├── styles/main.css         # Dark theme UI styles
├── src/
│   ├── app.js              # Entry point, data loading
│   ├── globe.js            # 3D globe (globe.gl + Three.js)
│   ├── detail-panel.js     # Developer detail view with D3 charts
│   ├── leaderboard.js      # Ranked sidebar with search/filter
│   └── scoring.js          # Composite scoring algorithm
├── scripts/
│   ├── fetch-all-devs.js   # GitHub data fetcher (REST + GraphQL)
│   ├── enrich-and-upload.js# SO enrichment + geocoding + Cosmos DB
│   └── build-dataset.js    # Pipeline orchestrator
├── api/
│   └── developers.js       # Developer API endpoint
└── data/
    └── developers-sample.json  # Sample data for local dev
```

## How to Contribute

### 1. Find an Issue
- Look for issues labeled [`good first issue`](../../labels/good%20first%20issue) or [`help wanted`](../../labels/help%20wanted)
- Comment on the issue to let others know you're working on it

### 2. Fork & Branch
```bash
git checkout -b feature/your-feature-name
```

### 3. Make Changes
- Keep changes focused — one feature/fix per PR
- Test locally with `npm run dev`
- Follow existing code style (vanilla JS, no frameworks)

### 4. Commit Message Guidelines

Use clear, semantic commit messages so history stays easy to scan:

| Prefix | When to use it | Example |
|---|---|---|
| `feat:` | Adding a new feature | `feat: add country-level leaderboard filter` |
| `fix:` | Fixing a bug | `fix: correct geocoding for ambiguous city names` |
| `docs:` | Documentation changes | `docs: expand contributing guide` |
| `refactor:` | Code change with no behavior change | `refactor: simplify scoring module` |
| `chore:` | Tooling, deps, config | `chore: bump globe.gl version` |

### 5. Submit a PR
Before opening a PR, make sure:

- [ ] Your branch is up to date with `main`
- [ ] The app runs locally without errors (`npm run dev`)
- [ ] Changes are focused on a single feature/fix
- [ ] Commit messages follow the convention above
- [ ] You didn't commit `.env` or any secrets

Then:
- Write a clear description of what changed and why
- Include a screenshot if it's a UI change
- Reference the issue number (e.g. "Fixes #12")

## Areas We Need Help

### 🌍 Data & Coverage
- Add more countries and cities to the search queries
- Improve geocoding accuracy for ambiguous locations
- Add new data sources (DEV.to, npm downloads, GitLab)

### 🎨 Frontend & Visualization
- Light/dark theme toggle
- Country-level leaderboards and filtering
- Language heatmap overlay on the globe
- Mobile responsive layout
- Accessibility improvements (keyboard nav, screen readers)

### 📊 Scoring & Analytics
- Improve the composite scoring algorithm
- Add time-range filters (activity in last year, last 5 years)
- Contribution trend charts
- Compare developers side-by-side

### 🔧 Infrastructure
- Caching layer to reduce API calls
- Incremental data updates (don't re-fetch everything)
- CI/CD pipeline for automated data refresh
- API rate limit handling improvements

### 📝 Documentation
- Add JSDoc comments to modules
- Write architecture decision records
- Create video walkthrough

## Code Style

- **Vanilla JavaScript** — no frameworks, keep it simple
- **Module pattern** — each file is an IIFE returning a public API
- **CSS custom properties** — use `var(--accent-blue)` etc from `styles/main.css`
- **D3.js** for charts, **globe.gl** for the 3D globe
- Use `const` by default, `let` when reassignment is needed

## Running the Full Data Pipeline

Requires API keys (see `.env.example`):

```bash
cp .env.example .env
# Add your keys to .env
npm run build-data
```

## Questions?

Open a [Discussion](../../discussions) or file an [Issue](../../issues). We're happy to help!