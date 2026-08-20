---
title: Development and deployment
description: Run DevGlobe locally, build the documentation, and understand Azure and GitHub Pages deployments.
---

# Development and deployment

## Local application

```bash
git clone https://github.com/sajeetharan/devglobe.git
cd devglobe
npm install
npm run dev
```

Without Cosmos DB credentials, the application falls back to bundled sample data. Text search works locally; vector and hybrid search require Azure Cosmos DB and Azure OpenAI configuration.

## Documentation

```bash
npm run docs:dev
npm run docs:build
npm run docs:preview
```

`docs:build` runs VitePress and verifies the emitted `/devglobe/` base paths and internal assets. VitePress also fails on unresolved internal Markdown links.

Set `DOCS_BASE=/` for a future custom documentation domain. Set `DOCS_SITE_URL` to its canonical origin so the generated sitemap remains correct.

## Deployment ownership

| Surface | Host | Workflow |
|---|---|---|
| Dynamic application and private APIs | Azure Container Apps | `.github/workflows/deploy.yml` |
| Public read APIs and scheduled tasks | Azure Functions | `.github/workflows/deploy-azure-functions.yml` |
| Static documentation | GitHub Pages | `.github/workflows/docs-pages.yml` |

The Pages workflow builds on pull requests and deploys only pushes to `main`. It does not export or replace the dynamic application.

## Contribution checks

Before opening a pull request:

```bash
npm test
npm run docs:build
npm run build
```

Keep one canonical source for each topic. Product and integration guides belong under `docs-site/`; implementation PRDs remain under `docs/prd/`. Update API and agent documentation when their public contracts change.