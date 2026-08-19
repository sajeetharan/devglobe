# Azure Backend

DevGlobe runs the Next.js application on Azure Container Apps, with Azure Functions handling high-volume public reads and scheduled work.

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

Azure Blob Storage serves `developers.json` directly to browsers. Azure Container Apps serves the frontend, OAuth, private account mutations, nominations, cards, share metadata, and MCP endpoint.

## Azure resources

The deployment uses these resources in `devglobe-rg`:

- Container App: `devglobe-web`
- Container Apps environment: `devglobe-env`
- Container registry: `devglobewebacr`
- Function App: `devglobe-public-api`
- Storage account: `devglobeactivityfn`
- Static website endpoint: `https://devglobeactivityfn.z13.web.core.windows.net/`

The Container App and Function App require their existing Cosmos, GitHub, and Azure OpenAI application settings. Never place secrets in public frontend variables or image build arguments.

## Frontend configuration

The Container Apps deployment workflow supplies these public values while building the Next.js image:

```env
NEXT_PUBLIC_API_URL=https://devglobe-public-api.azurewebsites.net
NEXT_PUBLIC_DEVELOPER_SNAPSHOT_URL=https://devglobeactivityfn.z13.web.core.windows.net/developers.json
```

The browser calls Azure Functions and Blob Storage directly. Their CORS rules must allow the production application origin.

## Custom domain

The `www.devglobe.dev` CNAME targets the Container App ingress hostname. The `asuid.www` TXT record proves ownership to Azure, and the Container Apps environment manages the TLS certificate. Azure does not host the `devglobe.dev` DNS zone, so DNS changes remain external to the resource group.

## Deployment

Pushes to `main` build the standalone Next.js image in Azure Container Registry and update the Container App through `.github/workflows/deploy.yml`. GitHub Actions authenticates with Azure through OIDC.

Changes under `functions/` deploy separately through `.github/workflows/deploy-azure-functions.yml`. For manual Function deployment, install production dependencies and deploy the contents of `functions/`; the ZIP root must contain `host.json`, not a wrapping `functions` directory.

```powershell
Set-Location functions
npm install --omit=dev
func azure functionapp publish devglobe-public-api --javascript
```

For a CLI-only deployment, create a ZIP containing the contents of `functions/`, including production `node_modules`, and use `az functionapp deploy --type zip`.

## Validation

Confirm all of the following after deployment:

- `/api/developers/count` returns the production count and the expected CORS origin.
- `/api/developer?id=sajeetharan` returns the public profile.
- `/api/search?q=typescript&mode=text` returns bounded results.
- Blob `developers.json` returns `Content-Encoding: gzip` and a long-lived cache header.
- The activity timer writes directly to the activity container.