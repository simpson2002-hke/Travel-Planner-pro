// Universal Worker storage engine for read/write (讀寫) operations.
// Supports:
// 1) Dedicated Web Worker message API (in-memory Map)
// 2) Service Worker message API (in-memory Map)
// 3) Cloudflare Worker Fetch API with persistent D1 storage via env.AI_STORAGE_DB.

const memoryStore = new Map();

const DEFAULT_CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization, x-requested-with',
  'access-control-max-age': '86400',
  'access-control-expose-headers': 'access-control-allow-origin, access-control-allow-methods, access-control-allow-headers, access-control-max-age, cache-control',
  'cache-control': 'no-store',
};

function corsHeaders(request) {
  const requestHeaders = request?.headers?.get('access-control-request-headers');
  return {
    ...DEFAULT_CORS_HEADERS,
    ...(requestHeaders ? { 'access-control-allow-headers': requestHeaders } : {}),
    vary: 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
  };
}

function jsonResponse(body, status, request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders(request) },
  });
}

function ok(id, data) {
  return { id, ok: true, data };
}

function fail(id, error) {
  return { id, ok: false, error };
}

function validateKey(key) {
  return typeof key === 'string' && key.length > 0;
}

function createMemoryAdapter(mapRef) {
  return {
    async set(key, value) {
      mapRef.set(key, value);
      return { key, value };
    },
    async get(key) {
      return { key, value: mapRef.get(key), exists: mapRef.has(key) };
    },
    async delete(key) {
      const deleted = mapRef.delete(key);
      return { key, deleted };
    },
    async has(key) {
      return { key, exists: mapRef.has(key) };
    },
    async keys() {
      return { keys: [...mapRef.keys()] };
    },
    async values() {
      return { values: [...mapRef.values()] };
    },
    async entries() {
      return { entries: [...mapRef.entries()] };
    },
    async clear() {
      mapRef.clear();
      return { cleared: true };
    },
    async bulkSet(entries) {
      for (const [entryKey, entryValue] of entries) {
        mapRef.set(entryKey, entryValue);
      }
      return { count: entries.length };
    },
  };
}

function parseStoredValue(raw) {
  if (raw == null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}


function createD1Adapter(db) {
  let schemaReady = false;

  async function ensureSchema() {
    if (schemaReady) return;
    await db
      .prepare(
        'CREATE TABLE IF NOT EXISTS ai_storage (storage_key TEXT PRIMARY KEY, storage_value TEXT NOT NULL, updated_at TEXT NOT NULL);'
      )
      .run();
    await db
      .prepare('CREATE INDEX IF NOT EXISTS idx_ai_storage_updated_at ON ai_storage(updated_at);')
      .run();

    schemaReady = true;
  }

  return {
    async set(key, value) {
      await ensureSchema();
      const now = new Date().toISOString();
      await db
        .prepare(
          `INSERT INTO ai_storage (storage_key, storage_value, updated_at)
           VALUES (?1, ?2, ?3)
           ON CONFLICT(storage_key) DO UPDATE
           SET storage_value=excluded.storage_value, updated_at=excluded.updated_at`
        )
        .bind(key, JSON.stringify(value), now)
        .run();

      return { key, value };
    },
    async get(key) {
      await ensureSchema();
      const row = await db
        .prepare('SELECT storage_value FROM ai_storage WHERE storage_key = ?1 LIMIT 1')
        .bind(key)
        .first();

      if (!row) return { key, value: undefined, exists: false };
      return { key, value: parseStoredValue(row.storage_value), exists: true };
    },
    async delete(key) {
      await ensureSchema();
      const result = await db.prepare('DELETE FROM ai_storage WHERE storage_key = ?1').bind(key).run();
      return { key, deleted: Number(result.meta?.changes ?? 0) > 0 };
    },
    async has(key) {
      await ensureSchema();
      const row = await db
        .prepare('SELECT 1 AS exists_value FROM ai_storage WHERE storage_key = ?1 LIMIT 1')
        .bind(key)
        .first();
      return { key, exists: Boolean(row) };
    },
    async keys() {
      await ensureSchema();
      const rows = await db.prepare('SELECT storage_key FROM ai_storage ORDER BY storage_key ASC').all();
      return { keys: (rows.results ?? []).map((item) => item.storage_key) };
    },
    async values() {
      await ensureSchema();
      const rows = await db.prepare('SELECT storage_value FROM ai_storage ORDER BY storage_key ASC').all();
      return { values: (rows.results ?? []).map((item) => parseStoredValue(item.storage_value)) };
    },
    async entries() {
      await ensureSchema();
      const rows = await db
        .prepare('SELECT storage_key, storage_value FROM ai_storage ORDER BY storage_key ASC')
        .all();
      return {
        entries: (rows.results ?? []).map((item) => [item.storage_key, parseStoredValue(item.storage_value)]),
      };
    },
    async clear() {
      await ensureSchema();
      await db.prepare('DELETE FROM ai_storage').run();
      return { cleared: true };
    },
    async bulkSet(entries) {
      await ensureSchema();
      if (entries.length === 0) return { count: 0 };

      const now = new Date().toISOString();
      const statements = entries.map(([entryKey, entryValue]) =>
        db
          .prepare(
            `INSERT INTO ai_storage (storage_key, storage_value, updated_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(storage_key) DO UPDATE
             SET storage_value=excluded.storage_value, updated_at=excluded.updated_at`
          )
          .bind(entryKey, JSON.stringify(entryValue), now)
      );

      await db.batch(statements);
      return { count: entries.length };
    },
  };
}

function pickStorage(env) {
  const bindingSource = env ?? globalThis;

  if (bindingSource?.AI_STORAGE_DB && typeof bindingSource.AI_STORAGE_DB.prepare === 'function') {
    return createD1Adapter(bindingSource.AI_STORAGE_DB);
  }
  return createMemoryAdapter(memoryStore);
}

async function executeAction(payload, storage) {
  const { id, action, key, value, entries } = payload ?? {};

  switch (action) {
    case 'set': {
      if (!validateKey(key)) throw new Error('Invalid key');
      return ok(id, await storage.set(key, value));
    }
    case 'get': {
      if (!validateKey(key)) throw new Error('Invalid key');
      return ok(id, await storage.get(key));
    }
    case 'delete': {
      if (!validateKey(key)) throw new Error('Invalid key');
      return ok(id, await storage.delete(key));
    }
    case 'has': {
      if (!validateKey(key)) throw new Error('Invalid key');
      return ok(id, await storage.has(key));
    }
    case 'keys':
      return ok(id, await storage.keys());
    case 'values':
      return ok(id, await storage.values());
    case 'entries':
      return ok(id, await storage.entries());
    case 'clear':
      return ok(id, await storage.clear());
    case 'bulkSet': {
      if (!Array.isArray(entries)) throw new Error('entries must be an array');
      for (const [entryKey] of entries) {
        if (!validateKey(entryKey)) throw new Error(`Invalid key in entries: ${entryKey}`);
      }
      return ok(id, await storage.bulkSet(entries));
    }
    default:
      throw new Error(`Unsupported action: ${String(action)}`);
  }
}

async function toResult(payload, storage) {
  try {
    return await executeAction(payload, storage);
  } catch (error) {
    const id = payload?.id;
    return fail(id, error instanceof Error ? error.message : 'Unknown worker error');
  }
}

function postMessageResponse(event, responsePayload) {
  if (event?.source && typeof event.source.postMessage === 'function') {
    event.source.postMessage(responsePayload);
    return;
  }
  if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
    self.postMessage(responsePayload);
  }
}

const localStorageAdapter = createMemoryAdapter(memoryStore);
const workerGlobal = typeof self !== 'undefined' ? self : globalThis;

if (typeof workerGlobal.addEventListener === 'function') {
  workerGlobal.addEventListener('message', async (event) => {
    const responsePayload = await toResult(event.data, localStorageAdapter);
    postMessageResponse(event, responsePayload);
  });
}

function payloadFromGetRequest(request) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const key = url.searchParams.get('key');
  const id = url.searchParams.get('id') || crypto.randomUUID();

  if (!action) return null;
  return { id, action, key };
}

async function handleFetch(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  if (request.method === 'HEAD') {
    return jsonResponse({ ok: true, data: { status: 'ready' } }, 200, request);
  }

  let payload;
  if (request.method === 'GET') {
    payload = payloadFromGetRequest(request);
    if (!payload) {
      return jsonResponse({ ok: true, data: { status: 'ready' } }, 200, request);
    }
    if (payload.action !== 'get' && payload.action !== 'has' && payload.action !== 'keys' && payload.action !== 'values' && payload.action !== 'entries') {
      return jsonResponse({ ok: false, error: 'GET only supports read-only actions.' }, 405, request);
    }
  } else if (request.method === 'POST') {
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400, request);
    }
  } else {
    return jsonResponse({ ok: false, error: 'Use POST with JSON body, or GET with ?action=get&key=...' }, 405, request);
  }

  const storage = pickStorage(env);
  const responsePayload = await toResult(payload, storage);
  return jsonResponse(responsePayload, responsePayload.ok ? 200 : 400, request);
}

if (typeof workerGlobal.addEventListener === 'function') {
  workerGlobal.addEventListener('fetch', (event) => {
    event.respondWith(handleFetch(event.request));
  });
}

export default {
  fetch(request, env) {
    return handleFetch(request, env);
  },
};
