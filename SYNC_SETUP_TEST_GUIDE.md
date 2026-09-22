# Shared Sync Setup and Testing Guide

## Production configuration

1. Deploy `worker-ai-storage.js` with the `AI_STORAGE_DB` D1 binding declared in `wrangler.toml`.
2. In GitHub repository **Settings → Secrets and variables → Actions**, set `CLOUDFLARE_WORKER_ENDPOINT` to one absolute HTTPS URL, for example `https://sync.example.com/`. All devices must receive this same build-time value.
3. Redeploy GitHub Pages and open `https://simpson2002-hke.github.io/Travel-Planner-pro/`.
4. Do **not** put Cloudflare account IDs, D1 database IDs, API tokens, or database credentials in the browser. The Worker uses its own D1 binding.

The current fallback Worker URL is `https://travel-planner-ai-storage.simpsonlee71.workers.dev`. If it only works through a VPN, configure a custom Worker domain that points to the same Worker and the same `AI_STORAGE_DB` binding, then deploy Pages with that custom-domain URL. CORS cannot repair an ISP/DNS/TLS block on `workers.dev`.

## In-app checks without a VPN

1. Open the published app and press F12 → **Network**.
2. In **Admin → Cloud Sync Credentials**, run **Run CORS Self-Test**.
3. Confirm the diagnostics name the API URL, report HTTP 200, show the allowed origin, and say D1 is reachable. The test sends a header that causes the browser to issue an OPTIONS preflight before `GET /api/health`.
4. Run **Run D1 Schema Test**. It calls `GET /api/schema` through the Worker; it never calls D1 from the browser.
5. Save a trip on device A, then use **Sync now** or wait up to 15 seconds. Refresh device B and confirm the trip appears.

## Local checks

```bash
npx tsc --noEmit
npm run build
curl -i 'https://travel-planner-ai-storage.simpsonlee71.workers.dev/api/health'
curl -i -X OPTIONS 'https://travel-planner-ai-storage.simpsonlee71.workers.dev/api/health' \
  -H 'Origin: https://simpson2002-hke.github.io' \
  -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: content-type, authorization'
```

The OPTIONS response must be HTTP 204 (or 200) and include the allowed GitHub Pages origin, `GET, POST, PUT, PATCH, DELETE, OPTIONS`, `Content-Type, Authorization, X-Requested-With`, and `Vary: Origin`.

## Cloudflare Dashboard checks

- **Workers & Pages → Worker → Settings → Bindings:** `AI_STORAGE_DB` is bound to the production D1 database.
- **Workers & Pages → Worker → Domains & Routes:** custom domain, if used, points directly to this Worker and has active SSL.
- **Zero Trust → Access → Applications:** if Access protects the Worker/domain, exempt `/api/health`, `/api/schema`, and OPTIONS preflight from cookie-only authentication, or provide an Access-compatible policy. Do not publish arbitrary D1 query routes.
