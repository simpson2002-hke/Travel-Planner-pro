# Cloud Sync Setup + Testing Guide (Step-by-Step)

This guide explains how to set up cloud sync for Travel Planner Pro and verify it works across devices.

---

## 1) Prerequisites

You need:

1. A deployed web app URL (same URL must be used on all devices).
2. A deployed Cloudflare Worker endpoint (for example: `https://your-worker.workers.dev`).
3. (Optional fallback) Cloudflare D1 credentials:
   - Account ID
   - D1 Database ID
   - API Token

> Recommended mode: Worker endpoint only. D1 fields are optional fallback.

---

## 2) Configure Sync in the App (No Devtools Required)

1. Open the app.
2. Go to **Admin**.
3. Open the cloud sync section (**Cloud Sync Credentials**).
4. Enter **Cloudflare Worker Endpoint**.
5. Optional: enter D1 Account ID / Database ID / API Token for fallback mode.
6. Click **Save & Verify**.

Expected result:
- If worker endpoint is reachable, you should see a success message.
- If worker fails but D1 is correctly configured, D1 verification should pass.

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
- Confirm worker endpoint value is identical on both devices.
- Click **Sync now** on both devices.
- Re-open Admin sync panel and **Save & Verify**.

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
1. Configure and verify Worker endpoint once in Admin.
2. Keep D1 credentials blank on normal user devices.
3. Let auto-sync handle updates; use manual buttons only for immediate refresh/troubleshooting.

## workers.dev works on VPN but fails without VPN

If the app shows `Worker verification failed ... Failed to fetch` only when the VPN is off, but the same Worker works through a VPN, the most likely cause is not a D1 schema problem. It usually means the local network, ISP, DNS resolver, browser extension, or security product cannot reach the `workers.dev` hostname from that location.

Recommended fix while keeping one shared trip server:

1. Keep the existing Cloudflare Worker and its existing `AI_STORAGE_DB` D1 binding. Do **not** create a second Worker or a second D1 database.
2. Add a Cloudflare custom domain or Worker route that points to the same Worker script.
3. Open **Admin → Website → Cloud Sync Credentials**.
4. Enter the custom domain URL in **Worker Access URL** and click **Save & Verify**.
5. Run **CORS Self-Test** and **D1 Schema Test** from the affected non-VPN network.

The Worker access URL may be different, but it must route to the same Worker and D1 binding. That keeps all devices on one shared data store while avoiding networks that block `workers.dev`.
