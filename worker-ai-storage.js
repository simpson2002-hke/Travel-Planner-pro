// Cloudflare Worker entry point for Travel Planner's shared D1-backed data.
// The message handler is retained for the local module-worker client; HTTP uses D1 only.

const memoryStore = new Map();
const ALLOWED_ORIGINS = new Set([
  "https://simpson2002-hke.github.io",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
]);
const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Authorization, X-Requested-With";

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  return {
    ...(origin && ALLOWED_ORIGINS.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
}

function json(body, status, request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(request) },
  });
}

function workerError(error) {
  return error instanceof Error ? error.message : "Unexpected Worker error";
}

function validateKey(key) {
  return typeof key === "string" && key.length > 0;
}

function createMemoryAdapter(map) {
  return {
    async set(key, value) { map.set(key, value); return { key, value }; },
    async get(key) { return { key, value: map.get(key), exists: map.has(key) }; },
    async delete(key) { const deleted = map.delete(key); return { key, deleted }; },
    async has(key) { return { key, exists: map.has(key) }; },
    async keys() { return { keys: [...map.keys()] }; },
    async values() { return { values: [...map.values()] }; },
    async entries() { return { entries: [...map.entries()] }; },
    async clear() { map.clear(); return { cleared: true }; },
    async bulkSet(entries) { entries.forEach(([key, value]) => map.set(key, value)); return { count: entries.length }; },
  };
}

function parseStoredValue(raw) {
  try { return JSON.parse(raw); } catch { return raw; }
}

function createD1Adapter(db) {
  let schemaPromise;
  const ensureSchema = () => schemaPromise ??= db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS ai_storage (storage_key TEXT PRIMARY KEY, storage_value TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_ai_storage_updated_at ON ai_storage(updated_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS trips (id TEXT PRIMARY KEY, title TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_trips_updated_at ON trips(updated_at)"),
  ]);
  return {
    ensureSchema,
    async set(key, value) {
      await ensureSchema();
      const now = new Date().toISOString();
      await db.prepare("INSERT INTO ai_storage (storage_key, storage_value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(storage_key) DO UPDATE SET storage_value=excluded.storage_value, updated_at=excluded.updated_at")
        .bind(key, JSON.stringify(value), now).run();
      return { key, value, updated_at: now };
    },
    async get(key) {
      await ensureSchema();
      const row = await db.prepare("SELECT storage_value FROM ai_storage WHERE storage_key = ?1 LIMIT 1").bind(key).first();
      return row ? { key, value: parseStoredValue(row.storage_value), exists: true } : { key, value: undefined, exists: false };
    },
    async delete(key) { await ensureSchema(); const r = await db.prepare("DELETE FROM ai_storage WHERE storage_key=?1").bind(key).run(); return { key, deleted: Number(r.meta?.changes ?? 0) > 0 }; },
    async has(key) { await ensureSchema(); const row = await db.prepare("SELECT 1 FROM ai_storage WHERE storage_key=?1 LIMIT 1").bind(key).first(); return { key, exists: Boolean(row) }; },
    async keys() { await ensureSchema(); const r = await db.prepare("SELECT storage_key FROM ai_storage ORDER BY storage_key").all(); return { keys: (r.results ?? []).map((x) => x.storage_key) }; },
    async values() { await ensureSchema(); const r = await db.prepare("SELECT storage_value FROM ai_storage ORDER BY storage_key").all(); return { values: (r.results ?? []).map((x) => parseStoredValue(x.storage_value)) }; },
    async entries() { await ensureSchema(); const r = await db.prepare("SELECT storage_key, storage_value FROM ai_storage ORDER BY storage_key").all(); return { entries: (r.results ?? []).map((x) => [x.storage_key, parseStoredValue(x.storage_value)]) }; },
    async clear() { await ensureSchema(); await db.prepare("DELETE FROM ai_storage").run(); return { cleared: true }; },
    async bulkSet(entries) { for (const [key, value] of entries) await this.set(key, value); return { count: entries.length }; },
  };
}

function requireD1(env) {
  if (!env?.AI_STORAGE_DB || typeof env.AI_STORAGE_DB.prepare !== "function") throw new Error("D1 binding not found");
  return createD1Adapter(env.AI_STORAGE_DB);
}

async function executeAction(payload, storage) {
  const { id, action, key, value, entries } = payload ?? {};
  if (["set", "get", "delete", "has"].includes(action) && !validateKey(key)) throw new Error("Invalid key");
  switch (action) {
    case "set": return { id, ok: true, data: await storage.set(key, value) };
    case "get": return { id, ok: true, data: await storage.get(key) };
    case "delete": return { id, ok: true, data: await storage.delete(key) };
    case "has": return { id, ok: true, data: await storage.has(key) };
    case "keys": return { id, ok: true, data: await storage.keys() };
    case "values": return { id, ok: true, data: await storage.values() };
    case "entries": return { id, ok: true, data: await storage.entries() };
    case "clear": return { id, ok: true, data: await storage.clear() };
    case "bulkSet": if (!Array.isArray(entries)) throw new Error("entries must be an array"); return { id, ok: true, data: await storage.bulkSet(entries) };
    default: throw new Error(`Unsupported action: ${String(action)}`);
  }
}

function decodeUrlPayload(encoded) {
  try { const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "="); return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)))); } catch { return null; }
}

function payloadFromGetRequest(url) {
  const tunneled = url.searchParams.get("payload");
  if (tunneled) return decodeUrlPayload(tunneled);
  const action = url.searchParams.get("action");
  return action ? { id: url.searchParams.get("id") || crypto.randomUUID(), action, key: url.searchParams.get("key") } : null;
}

async function schemaResponse(request, env) {
  if (!env?.AI_STORAGE_DB) return json({ ok: false, error: "D1 binding not found" }, 503, request);
  const storage = requireD1(env);
  await storage.ensureSchema();
  const db = env.AI_STORAGE_DB;
  const tables = (await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()).results ?? [];
  const data = [];
  for (const table of tables) {
    const name = table.name;
    const columns = (await db.prepare(`PRAGMA table_info('${name.replace(/'/g, "''")}')`).all()).results ?? [];
    data.push({ name, columns: columns.map((column) => ({ name: column.name, type: column.type, notnull: Boolean(column.notnull), primaryKey: Boolean(column.pk) })) });
  }
  return json({ ok: true, data: { status: "healthy", d1: "reachable", tables: data } }, 200, request);
}

async function tripsResponse(request, env, id) {
  const storage = requireD1(env); await storage.ensureSchema(); const db = env.AI_STORAGE_DB;
  if (request.method === "GET") {
    const rows = id ? [await db.prepare("SELECT id, title, payload, updated_at FROM trips WHERE id=?1").bind(id).first()].filter(Boolean) : (await db.prepare("SELECT id, title, payload, updated_at FROM trips ORDER BY updated_at DESC").all()).results ?? [];
    return json({ ok: true, data: rows.map((row) => ({ ...parseStoredValue(row.payload), id: row.id, title: row.title, updated_at: row.updated_at })) }, 200, request);
  }
  if (request.method === "DELETE" && id) { const r = await db.prepare("DELETE FROM trips WHERE id=?1").bind(id).run(); return json({ ok: true, deleted: Number(r.meta?.changes ?? 0) > 0, id }, 200, request); }
  if (!["POST", "PUT", "PATCH"].includes(request.method)) return json({ ok: false, error: "Method not allowed" }, 405, request);
  const payload = await request.json(); const trip = payload?.data ?? payload; const tripId = id ?? trip?.id;
  if (!tripId || typeof tripId !== "string" || !trip?.title || typeof trip.title !== "string") return json({ ok: false, error: "Trip id and title are required" }, 400, request);
  const updatedAt = new Date().toISOString();
  await db.prepare("INSERT INTO trips (id, title, payload, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id) DO UPDATE SET title=excluded.title, payload=excluded.payload, updated_at=excluded.updated_at").bind(tripId, trip.title, JSON.stringify(trip), updatedAt).run();
  return json({ ok: true, id: tripId, updated_at: updatedAt, data: { ...trip, id: tripId, updated_at: updatedAt } }, request.method === "POST" ? 201 : 200, request);
}

async function handleFetch(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  try {
    const url = new URL(request.url); const { pathname } = url;
    if (pathname === "/api/health") {
      if (!env?.AI_STORAGE_DB) return json({ ok: false, error: "D1 binding not found", data: { status: "unhealthy", d1: "missing" } }, 503, request);
      await env.AI_STORAGE_DB.prepare("SELECT 1 AS ok").first();
      return json({ ok: true, data: { status: "healthy", d1: "reachable" } }, 200, request);
    }
    if (pathname === "/api/schema" || pathname === "/api/admin/schema") return schemaResponse(request, env);
    const tripMatch = pathname.match(/^\/api\/trips(?:\/([^/]+))?\/?$/);
    if (tripMatch) return tripsResponse(request, env, tripMatch[1] ? decodeURIComponent(tripMatch[1]) : undefined);
    if (request.method === "GET" || request.method === "HEAD") {
      const payload = payloadFromGetRequest(url);
      if (!payload) return json({ ok: true, data: { status: "ready", storage: env?.AI_STORAGE_DB ? "d1" : "missing-d1" } }, 200, request);
      const result = await executeAction(payload, requireD1(env));
      return json(result, 200, request);
    }
    if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405, request);
    let payload; try { payload = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON body" }, 400, request); }
    const result = await executeAction(payload, requireD1(env));
    return json(result, 200, request);
  } catch (error) {
    const message = workerError(error); const status = message === "D1 binding not found" ? 503 : 500;
    return json({ ok: false, error: message }, status, request);
  }
}

const workerGlobal = typeof self !== "undefined" ? self : globalThis;
if (typeof workerGlobal.addEventListener === "function") workerGlobal.addEventListener("message", async (event) => {
  try { event.source?.postMessage({ ...(await executeAction(event.data, createMemoryAdapter(memoryStore))) }); } catch (error) { event.source?.postMessage({ id: event.data?.id, ok: false, error: workerError(error) }); }
});

export default { fetch: handleFetch };
