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
curl -sS -X POST 'https://travel-planner-ai-storage.simpsonlee71.workers.dev'   -H 'content-type: application/json'   --data '{"id":"1","action":"set","key":"d1-check","value":{"ok":true}}'

curl -sS -X POST 'https://travel-planner-ai-storage.simpsonlee71.workers.dev'   -H 'content-type: application/json'   --data '{"id":"2","action":"get","key":"d1-check"}'
```
You should see `"exists":true` on the second response.

If `curl` fails with a proxy error such as `CONNECT tunnel failed, response 403`, the issue is usually your shell/network proxy rather than the Worker itself. In that case:

```bash
NO_PROXY=.workers.dev,workers.dev curl --noproxy '*' -4 -sS -X POST 'https://travel-planner-ai-storage.simpsonlee71.workers.dev' -H 'content-type: application/json' --data '{"id":"1","action":"set","key":"d1-check","value":{"ok":true}}'
```

Or use the browser console:

```js
fetch('https://travel-planner-ai-storage.simpsonlee71.workers.dev', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
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

So opening `https://simpson2002-hke.github.io/Travel-Planner-pro/` should automatically attempt cloud sync with no per-device console setup.

### If you ever need to change the worker URL
Preferred method: update GitHub Actions variable `CLOUDFLARE_WORKER_ENDPOINT` and redeploy GitHub Pages once.

Only if you need a temporary device-specific override, run in browser console:

```js
localStorage.setItem('tp-cloud-worker-endpoint', 'https://YOUR-WORKER.workers.dev');
location.reload();
```

## 10) Initialize sync in the current app build (D1 REST fallback mode)

> Important: the app should use the Cloudflare Worker endpoint by default. Direct Cloudflare D1 REST credentials are only a fallback for private/admin troubleshooting because browser builds are public and must not contain API tokens.
>
> The app reads these optional localStorage keys on each device:
> - `tp-cloudflare-account-id`
> - `tp-cloudflare-d1-database-id`
> - `tp-cloudflare-api-token`

### 10.0 Current deployment defaults
The current app build includes the Worker endpoint plus the non-secret Cloudflare account/database IDs, but it intentionally does **not** include a default API token. If direct D1 fallback is needed, enter a freshly generated token through **Admin → Website → Cloud Sync Credentials** and click **Save & Verify** on that browser only.

If an API token was pasted into chat, logs, client code, screenshots, or docs, revoke it immediately and create a new one before testing again.

### 10.1 One-time prerequisites
1. Create/confirm a D1 database in Cloudflare.
2. Create an API token that can query your D1 DB:
   - Account → D1 → Edit (or equivalent D1 read/write permission)
3. Copy these values:
   - Cloudflare Account ID
   - D1 Database ID
   - API Token

### 10.2 Initialize sync on each browser/device
Open your deployed app, then open browser devtools Console and run:

```js
localStorage.setItem('tp-cloudflare-account-id', 'YOUR_ACCOUNT_ID');
localStorage.setItem('tp-cloudflare-d1-database-id', 'YOUR_D1_DATABASE_ID');
localStorage.setItem('tp-cloudflare-api-token', 'YOUR_API_TOKEN');
location.reload();
```

After reload, the app will:
- pull shared keys from cloud on startup,
- push changes when shared data changes,
- auto refresh every 15 seconds,
- and also refresh on focus/visibility/online events.

### 10.3 Verify sync is working (recommended checks)

#### Check A (in-app behavior)
1. Device A: create/update a profile or trip.
2. Wait 15–20 seconds.
3. Device B: open the same app URL and sign in with the same account.
4. Click **Sync** in the header (manual refresh) if needed.
5. Confirm the same change appears.

#### Check B (direct D1 read from browser)
In Console, run this read helper on either device:

```js
(async()=>{
  const accountId = localStorage.getItem('tp-cloudflare-account-id');
  const databaseId = localStorage.getItem('tp-cloudflare-d1-database-id');
  const apiToken = localStorage.getItem('tp-cloudflare-api-token');
  const sql = 'SELECT storage_key, updated_at FROM ai_storage ORDER BY updated_at DESC LIMIT 20';
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${apiToken}`,
    },
    body: JSON.stringify({ sql, params: [] }),
  });

  console.log(await res.json());
})();
```

You should see rows for keys like:
- `tp-profiles`
- `tp-trips`
- `tp-admin-pw`
- `tp-site-settings`

If `updated_at` changes after you edit data, sync is working.

### 10.4 Why sync may look like "cannot be verified"
Common reasons and fixes:
- **Missing localStorage credentials on one device** → set all 3 keys and reload.
- **Wrong Account ID / DB ID / API token** → check first error shown in Sync status and re-enter values.
- **Token was exposed** → revoke it in Cloudflare, create a new least-privilege token, update only GitHub Actions secrets or the private in-app admin fallback, then redeploy.
- **Token lacks D1 permission** → regenerate token with D1 query/write permission.
- **Different app URLs/environments** (staging vs production) → ensure both devices open the same deployment.
- **No visible instant change** → expected; background polling interval is 15 seconds.

## 11) Recover a GitHub Pages site after accidentally renaming the repository

A repository rename changes the default project Pages URL path. For this repo, the expected Pages URL is:

```text
https://simpson2002-hke.github.io/Travel-Planner-pro/
```

If you renamed the repository and then renamed it back, use this checklist:

1. GitHub repository → **Settings** → **Pages**. Confirm the site is deployed from **GitHub Actions**.
2. GitHub repository → **Actions** → run **Deploy to GitHub Pages** manually, or push a commit to `main`.
3. Wait for the workflow to finish, then open the exact URL with the trailing slash: `https://simpson2002-hke.github.io/Travel-Planner-pro/`.
4. If the repository name changes again, either rename it back to `Travel-Planner-pro` or set `VITE_BASE_PATH` in the Pages workflow/repository variables to the new path, for example `/new-repo-name/`.
5. If the old URL still 404s after a successful deploy, clear the browser cache and confirm the repository is public or that GitHub Pages is enabled for private repositories on your plan.

The Vite config now derives the GitHub Pages base path from `GITHUB_REPOSITORY` during GitHub Actions builds, with `VITE_BASE_PATH` available as an explicit override.
