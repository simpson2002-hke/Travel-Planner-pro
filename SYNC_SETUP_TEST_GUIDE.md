# Cloud Sync Setup + Testing Guide (Step-by-Step)

This guide explains how to set up cloud sync for Travel Planner Pro and verify it works across devices.

---

## 1) Prerequisites

You need:

1. A deployed web app URL (same URL must be used on all devices).
2. A deployed Cloudflare Worker endpoint on a publicly reachable custom domain (for example: `https://sync.example.com`).
3. (Optional fallback) Cloudflare D1 credentials:
   - Account ID
   - D1 Database ID
   - API Token

> Recommended mode: Worker endpoint only. D1 fields are optional fallback.

---

## 2) Configure Sync Once for Every Device

1. In Cloudflare, attach a custom Worker domain to the **existing** Worker. It must retain the existing `AI_STORAGE_DB` binding.
2. In GitHub → **Settings → Secrets and variables → Actions → Variables**, set `CLOUDFLARE_WORKER_ENDPOINT` to that custom-domain URL.
3. Redeploy GitHub Pages so the URL is embedded in the app build.
4. Open the app on each device and use **Admin → Cloud Sync Credentials → Verify Deployment**.
5. Optional: enter D1 Account ID / Database ID / API Token only for private diagnostics.

Expected result:
- If the deployment Worker endpoint is reachable, you should see a success message.
- If worker fails but D1 is correctly configured, D1 verification should pass.

The Worker Access URL is intentionally read-only in the app. A browser-local endpoint would allow different devices to write to different Workers/D1 databases, which looks like each device has its own data.

---

## 3) How Sync Works (Automatic + Manual)

### Automatic sync triggers
- On initial app load
- Every 15 seconds
- When tab regains focus
- When browser comes online
- When tab becomes visible
- When cloud config keys change in local storage

### Manual sync controls
- **Sync now** button in header
- **Retry Sync** button in admin sync panel (when sync readiness is pending)

---

## 4) Cross-Device Verification (Real-world test)

Use two devices or two separate browsers/profiles.

1. On Device A, sign in and create/update a trip.
2. Wait up to 15 seconds (or press **Sync now**).
3. On Device B, open the same app URL and same account context.
4. Bring tab to front (focus) to trigger immediate refresh.
5. Confirm the trip/profile/settings updates appear on Device B.

If data does not appear:
- Confirm both devices use the exact same app deployment URL.
- Confirm both devices have loaded the same, newly deployed app build. The deployment Worker URL displayed in Admin must be identical.
- Click **Sync now** on both devices.
- Re-open Admin sync panel and **Verify Deployment**.

---

## 5) Local Technical Validation (for developers)

Run these commands from repository root.

### 5.1 TypeScript check
```bash
npx tsc --noEmit
```

### 5.2 Build check
```bash
npm run build
```

### 5.3 Worker endpoint probe (network dependent)
```bash
npm run verify:cloudflare -- 'https://your-worker.workers.dev'
```

If 5.3 fails with proxy/network errors, test from a non-proxy network or run browser-based fetch validation.

---

## 6) Browser Console Probe (Optional)

If you need a direct endpoint sanity check:

```js
fetch('https://your-worker.workers.dev', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ id: 'health', action: 'get', key: 'tp-sync-healthcheck' })
}).then(r => r.json()).then(console.log)
```

Expected:
- JSON response with `ok: true`.

---

## 7) Common Issues and Fixes

### “Failed to fetch” during sync
- Re-check worker endpoint URL.
- Ensure HTTPS endpoint is reachable from browser.
- Confirm CORS is allowed by Worker response.
- If using corporate proxy/VPN, test on a standard network.

### Worker verifies but data still not shared
- Devices might be on different app URLs.
- Worker might point to different D1 database per environment.
- Browser privacy modes/extensions may block storage/network events.

### D1 fallback fails
- Re-check Account ID, D1 DB ID, and API token scopes.
- Ensure token has D1 read/write permissions.

---

## 8) Recommended Operating Mode

For production users:
1. Configure the Worker endpoint once in GitHub Actions and verify the deployment in Admin.
2. Keep D1 credentials blank on normal user devices.
3. Let auto-sync handle updates; use manual buttons only for immediate refresh/troubleshooting.

## workers.dev works on VPN but fails without VPN

If the app shows `Worker verification failed ... Failed to fetch` only when the VPN is off, but the same Worker works through a VPN, the most likely cause is not a D1 schema problem. It usually means the local network, ISP, DNS resolver, browser extension, or security product cannot reach the `workers.dev` hostname from that location.

Recommended fix while keeping one shared trip server:

1. Keep the existing Cloudflare Worker and its existing `AI_STORAGE_DB` D1 binding. Do **not** create a second Worker or a second D1 database.
2. Add a Cloudflare custom domain or Worker route that points to the same Worker script.
3. Set the custom-domain URL in GitHub Actions variable `CLOUDFLARE_WORKER_ENDPOINT` and redeploy the app.
4. Open **Admin → Website → Cloud Sync Credentials** and click **Verify Deployment**.
5. Run **CORS Self-Test** and **D1 Schema Test** from the affected non-VPN network.

The Worker access URL may be different, but it must route to the same Worker and D1 binding. That keeps all devices on one shared data store while avoiding networks that block `workers.dev`.
