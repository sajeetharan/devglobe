# Azure Backend

DevGlobe uses Vercel for the Next.js frontend and Azure for high-volume public reads and scheduled ingestion.

## Traffic split

Azure Functions serves:

- `GET /api/developers`
- `GET /api/developers/count`
- `GET /api/developer`
- `GET /api/search`
- `GET /api/activities`
- `GET /api/activities/live`
- GitHub activity ingestion every five minutes
- Hourly generation of the compressed developer snapshot

Azure Blob Storage serves `developers.json` directly to browsers. Vercel remains responsible for OAuth, private account mutations, nominations, cards, share metadata, and the frontend.

## Azure resources

The current deployment reuses these Consumption resources in `devglobe-rg`:

- Function App: `devglobe-public-api`
- Storage account: `devglobeactivityfn`
- Static website endpoint: `https://devglobeactivityfn.z13.web.core.windows.net/`

The Function App requires the existing Cosmos, GitHub, and Azure OpenAI application settings. Never place those values in public frontend variables.

## Frontend configuration

Configure Production and Preview environments in Vercel:

```env
NEXT_PUBLIC_API_URL=https://devglobe-public-api.azurewebsites.net
NEXT_PUBLIC_DEVELOPER_SNAPSHOT_URL=https://devglobeactivityfn.z13.web.core.windows.net/developers.json
```

The browser calls Azure directly. Do not configure a Vercel rewrite or proxy because proxied responses still consume Vercel transfer and invocation allowances.

## Custom domain

After adding DNS at the current `devglobe.dev` DNS provider, bind `api.devglobe.dev` to the Function App and update `NEXT_PUBLIC_API_URL`. Azure does not currently host the `devglobe.dev` DNS zone, so this step is external to the resource group.

## Deployment

Install production dependencies and deploy the contents of `functions/` to the Function App. The ZIP root must contain `host.json`, not a wrapping `functions` directory.

```powershell
Set-Location functions
npm install --omit=dev
func azure functionapp publish devglobe-public-api --javascript
```

For a CLI-only deployment, create a ZIP containing the contents of `functions/`, including production `node_modules`, and use `az functionapp deploy --type zip`.

## Validation

Confirm all of the following before setting the Vercel frontend variables:

- `/api/developers/count` returns the production count and the expected CORS origin.
- `/api/developer?id=sajeetharan` returns the public profile.
- `/api/search?q=typescript&mode=text` returns bounded results.
- Blob `developers.json` returns `Content-Encoding: gzip` and a long-lived cache header.
- The activity timer writes directly to the activity container without calling Vercel.