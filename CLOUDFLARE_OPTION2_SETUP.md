# Cloudflare Worker + GitHub Actions (Option 2) Setup

This guide links your GitHub repo to Cloudflare Worker deployments using `wrangler` in GitHub Actions.

## What was added
- `wrangler.toml` (Worker config)
- `.github/workflows/deploy-worker.yml` (auto deploy workflow)

## 1) Confirm your default deploy branch
This workflow deploys when pushing to `main`.

If your branch is not `main`, edit `.github/workflows/deploy-worker.yml`:
```yaml
on:
  push:
    branches:
      - your-branch-name
```

## 2) Create a Cloudflare API Token
1. Cloudflare Dashboard → **My Profile** → **API Tokens** → **Create Token**.
2. Use **Edit Cloudflare Workers** template (or custom token).
3. Minimum token permissions:
   - `Account` → `Cloudflare Workers Scripts` → `Edit`
   - `Account` → `Account Settings` → `Read`
4. Scope the token to your Cloudflare account.
5. Copy the token value.

## 3) Find your Cloudflare Account ID
- Dashboard right sidebar shows **Account ID**, or
- Workers & Pages account overview page.

## 4) Add GitHub repository secrets
GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:
- `CLOUDFLARE_API_TOKEN` = (token from step 2)
- `CLOUDFLARE_ACCOUNT_ID` = (account id from step 3)

## 5) Push changes to trigger deploy
Push commits to the configured branch (`main` by default).

The workflow triggers only when these files change:
- `worker-ai-storage.js`
- `wrangler.toml`
- `.github/workflows/deploy-worker.yml`

You can also run it manually from GitHub Actions via **workflow_dispatch**.

## 6) Verify deployment
1. GitHub → **Actions** → open `Deploy Cloudflare Worker` run.
2. Ensure all steps pass.
3. Cloudflare Dashboard → Workers & Pages → verify script updates and test endpoint.

## 7) (Optional) Deploy to a custom domain route
In `wrangler.toml`, uncomment and edit the `routes` example:
```toml
routes = [{ pattern = "api.example.com/worker-ai-storage/*", zone_name = "example.com" }]
```
Then commit and push.

## Troubleshooting
- **Error: authentication failed**
  - Recheck `CLOUDFLARE_API_TOKEN` secret value and token permissions.
- **Error: account id missing/invalid**
  - Recheck `CLOUDFLARE_ACCOUNT_ID` secret value.
- **No workflow run on push**
  - Confirm push branch matches workflow branch.
  - Confirm at least one watched path changed.
- **Need deploy every push regardless of file path**
  - Remove the `paths:` block from workflow trigger.


## 8) Enable persistent cross-device account data (required)
Your app now supports shared cloud storage for accounts/trips **only when two things are configured**:

1. Cloudflare Worker has D1 binding `AI_STORAGE_DB` in `wrangler.toml`.
2. The deployed app points to the correct Worker URL once at build/deploy time.

### 8.1 Configure D1 binding
1. Cloudflare Dashboard → Storage & Databases → D1 → create database.
2. Copy database IDs.
3. In `wrangler.toml`, uncomment and fill:
```toml
[[d1_databases]]
binding = "AI_STORAGE_DB"
database_name = "travel-planner-ai-storage"
database_id = "<your_d1_database_id>"
preview_database_id = "<your_d1_preview_database_id>"
```
4. Commit and push so GitHub Actions redeploys.

> Important: `AI_STORAGE_DB` must be configured in the deployed Worker. If D1 is not bound, storage falls back to temporary in-memory data and cross-device sync will not persist.



### 8.1.1 D1 setup step-by-step (exact clicks)
1. Open Cloudflare dashboard and choose your account.
2. Go to **Storage & Databases** → **D1**.
3. Click **Create database**.
4. Create one database (example: `travel-planner-ai-storage`).
5. (Optional) create another preview database if needed.
6. Open the database and copy the Database ID (and preview database id if used).

### 8.1.2 Update `wrangler.toml`
Uncomment and fill this block using the IDs:
```toml
[[d1_databases]]
binding = "AI_STORAGE_DB"
database_name = "travel-planner-ai-storage"
database_id = "<YOUR_D1_DATABASE_ID>"
preview_database_id = "<YOUR_D1_PREVIEW_DATABASE_ID>"
```

### 8.1.3 Commit and deploy
1. Commit `wrangler.toml`.
2. Push to your deploy branch (`main` in current workflow).
3. Wait for GitHub Action `Deploy Cloudflare Worker` to pass.

### 8.1.4 Verify D1 storage is actually used
Use your Worker URL and run the repo verifier first:
```bash
npm run verify:cloudflare -- 'https://travel-planner-ai-storage.simpsonlee71.workers.dev'
```

If you prefer raw `curl`, use:
```bash
curl -sS -X POST 'https://travel-planner-ai-storage.simpsonlee71.workers.dev'   -H 'content-type: text/plain;charset=UTF-8'   --data '{"id":"1","action":"set","key":"d1-check","value":{"ok":true}}'

curl -sS -X POST 'https://travel-planner-ai-storage.simpsonlee71.workers.dev'   -H 'content-type: text/plain;charset=UTF-8'   --data '{"id":"2","action":"get","key":"d1-check"}'
```
You should see `"exists":true` on the second response.

If `curl` fails with a proxy error such as `CONNECT tunnel failed, response 403`, the issue is usually your shell/network proxy rather than the Worker itself. In that case:

```bash
NO_PROXY=.workers.dev,workers.dev curl --noproxy '*' -4 -sS -X POST 'https://travel-planner-ai-storage.simpsonlee71.workers.dev' -H 'content-type: text/plain;charset=UTF-8' --data '{"id":"1","action":"set","key":"d1-check","value":{"ok":true}}'
```

Or use the browser console:

```js
fetch('https://travel-planner-ai-storage.simpsonlee71.workers.dev', {
  method: 'POST',
  headers: { 'content-type': 'text/plain;charset=UTF-8' },
  body: JSON.stringify({ id: '1', action: 'set', key: 'd1-check', value: { ok: true } })
}).then(r => r.json()).then(console.log);
```

### 8.1.5 Common failure fixes
- If deploy fails with `Invalid TOML document`, open `wrangler.toml` and remove any merge markers like:
  - `<<<<<<<`
  - `=======`
  - `>>>>>>>`
- If deploy succeeds but cross-device data still not shared:
  - Ensure `AI_STORAGE_DB` is bound in deployed Worker.
  - Ensure both devices open the same app URL and same Worker endpoint.
  - Ensure browser extensions/privacy mode are not blocking storage/network.

### 8.2 Configure app endpoint once for all devices
The app now uses the deployed Worker endpoint automatically. You do **not** need to open devtools on every device.

For GitHub Pages, set repository variable `CLOUDFLARE_WORKER_ENDPOINT` to your Worker URL:

1. GitHub repo → **Settings** → **Secrets and variables** → **Actions**.
2. Open the **Variables** tab.
3. Add or update:
   - Name: `CLOUDFLARE_WORKER_ENDPOINT`
   - Value: `https://travel-planner-ai-storage.simpsonlee71.workers.dev`
4. Re-run the **Deploy to GitHub Pages** workflow or push a commit.

After the site redeploys, every device that opens the same app URL will automatically use the new Worker endpoint.


### 8.2.2 Cross-device sync checklist (D1)
To sync app data between different devices, all devices must use the same app deployment and the same Worker endpoint backed by the same D1 database:

1. Deploy Worker with `AI_STORAGE_DB` bound to your production D1 database.
2. Deploy the web app with `CLOUDFLARE_WORKER_ENDPOINT` set to that Worker URL.
3. On device A, log in/update trip data and wait up to 15 seconds (auto-sync interval).
4. On device B, open the same deployed app URL and same account; data should appear automatically after load/focus refresh.
5. If data does not appear, run `npm run verify:cloudflare -- '<worker-url>'` and confirm `exists: true` for write/read checks.

### 8.2.1 Optional per-device override
Only use this for temporary troubleshooting. It is no longer the primary setup path:

```js
localStorage.setItem('tp-cloud-worker-endpoint', 'https://YOUR-WORKER.workers.dev');
location.reload();
```

## 8.3 Automatic synchronization behavior
The app now performs automatic sync for shared data in these cases:
- on first app load
- every 15 seconds while the app is open
- when the tab regains focus
- when the tab becomes visible again
- when the browser comes back online
- when another tab on the same device updates local storage

This means the latest shared profiles, trips, admin password, and site settings will refresh automatically on the same or different devices as long as they open the same deployed app, which now supplies the Worker endpoint automatically.


## 9) GitHub Pages app is now preconfigured for your worker URL
The GitHub Pages workflow now injects the Worker endpoint for the whole deployment using repository variable `CLOUDFLARE_WORKER_ENDPOINT` (falling back to the current default if the variable is unset). The current default endpoint is:
- `https://travel-planner-ai-storage.simpsonlee71.workers.dev`

### Production access URL: use a custom Worker domain

`*.workers.dev` is a shared Cloudflare hostname. Some ISPs, enterprise DNS resolvers,
and content filters block that hostname or its DNS answers. If the app works through a
VPN but fails on ordinary Wi-Fi/mobile networks, that is a network reachability problem
rather than a username/password or D1 problem. CORS headers cannot repair a DNS, TLS,
or hostname block.

For production, add a hostname you control in **Cloudflare → Workers & Pages →
travel-planner-ai-storage → Settings → Domains & Routes** (for example,
`sync.example.com`) and point it to this *same* Worker and D1 binding. Confirm that
the hostname has an active Cloudflare Universal SSL certificate and does not redirect
to another host. Then set these GitHub repository variables before redeploying Pages:

- `CLOUDFLARE_WORKER_ENDPOINT=https://sync.example.com/`

The URL is embedded in new builds and is the only backend the app uses. Do not use a
different Worker/database for the custom hostname, or accounts and trips will split
across two storage backends.

The browser transport intentionally uses a safelisted `Content-Type` and URL cache
busting rather than request `Cache-Control`/`Pragma` headers. This keeps normal writes
as a simple CORS request, avoiding an unnecessary `OPTIONS` preflight that restrictive
networks commonly block. The Worker must still return CORS headers on **every**
response, including `OPTIONS`, errors, and health checks.

#### Required action for the current VPN-only failure

The Worker overview showing **one `workers.dev` domain**, one `AI_STORAGE_DB` binding,
and zero Worker errors means the D1 binding is present and requests that *reach* the
Worker are succeeding. It does **not** prove that affected users can resolve or connect
to `workers.dev`. Because the failure disappears behind a VPN, create and deploy a
custom domain now; it is not an optional per-device workaround in this situation.

1. In Cloudflare, add a zone you control (for example `example.com`) and ensure its
   nameservers are active in Cloudflare.
2. In **Workers & Pages → travel-planner-ai-storage → Domains**, select **Add a custom
   domain** and enter an unused hostname such as `sync.example.com`. Do not add a
   redirect; it must be a direct Worker custom domain.
3. Wait until the domain status is **Active** and Universal SSL is active. From an
   affected network, open `https://sync.example.com/`: it must return the Worker JSON
   health response, without a certificate warning.
4. In GitHub **Settings → Secrets and variables → Actions → Variables**, set
   `CLOUDFLARE_WORKER_ENDPOINT` to `https://sync.example.com/`, optionally set
   `CLOUDFLARE_WORKER_ENDPOINT_ALIASES` to the old `workers.dev` URL, and rerun
   **Deploy to GitHub Pages**. Existing browser builds do not receive the new URL until
   Pages redeploys and users reload the app.
5. Confirm Cloudflare Workers metrics increment when an affected device opens the app.
   If they do not, the network is still blocking the new hostname; choose a different
   domain/DNS provider path rather than changing D1 credentials or CORS headers.

The deployment API token described above is **not used at runtime**: the Worker reaches
D1 through its `AI_STORAGE_DB` binding. The token permissions shown in the dashboard
therefore cannot cause a browser `Failed to fetch` after deployment. Do not place an
API token in the browser, repository variables exposed to Vite, or the in-app settings.

So opening `https://simpson2002-hke.github.io/Travel-Planner-pro/` should automatically attempt cloud sync with no per-device console setup.

### If you ever need to change the worker URL
Preferred method: update GitHub Actions variable `CLOUDFLARE_WORKER_ENDPOINT` and redeploy GitHub Pages once.

Only if you need a temporary device-specific override, run in browser console:

```js
localStorage.setItem('tp-cloud-worker-endpoint', 'https://YOUR-WORKER.workers.dev');
location.reload();
```

## 10) Security and diagnostics

The browser never calls the Cloudflare D1 REST API and must never receive an account API token. The deployed Worker is the only component that accesses the `AI_STORAGE_DB` binding.

Use **Admin → Cloud Sync Credentials → Run CORS Self-Test** to call `GET /api/health` (with a browser preflight), and **Run D1 Schema Test** to call `GET /api/schema`. These tests report the URL, HTTP status, CORS headers, D1 health, and a response preview.

For production, keep `GET /api/health` and `GET /api/schema` limited to health information. Do not add a route that proxies arbitrary SQL or exposes D1 credentials. Verify any Cloudflare Access policy permits `OPTIONS` to reach the Worker before authentication; browsers cannot attach normal session credentials to preflight requests.
