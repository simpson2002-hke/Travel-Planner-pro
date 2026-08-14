import dns from 'node:dns/promises';

const DEFAULT_ENDPOINT = 'https://travel-planner-ai-storage.simpsonlee71.workers.dev';
const endpoint = (process.argv[2] || process.env.CLOUDFLARE_WORKER_ENDPOINT || DEFAULT_ENDPOINT).trim();
const key = `d1-check-${Date.now()}`;

function printJson(label, value) {
  console.log(`\n${label}`);
  console.log(JSON.stringify(value, null, 2));
}

async function post(action, extra = {}) {
  const url = new URL(endpoint);
  url.searchParams.set('_tpv', String(Date.now()));
  url.searchParams.set('_', String(Date.now()));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'text/plain;charset=UTF-8',
      'cache-control': 'no-cache',
      'pragma': 'no-cache',
    },
    body: JSON.stringify({ id: action, action, ...extra }),
    signal: AbortSignal.timeout(15_000),
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Worker returned non-JSON response (${response.status}): ${text.slice(0, 300)}`);
  }

  if (!response.ok || json?.ok !== true) {
    throw new Error(`Worker request failed (${response.status}): ${JSON.stringify(json)}`);
  }

  return { status: response.status, json };
}

function printNetworkHelp(error) {
  const proxyVars = [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
    'NO_PROXY',
    'no_proxy',
  ].filter((name) => process.env[name]);

  console.error('\nVerification could not reach the Cloudflare Worker.');
  console.error(`Endpoint: ${endpoint}`);
  console.error(`Error: ${error?.message || error}`);

  if (proxyVars.length > 0) {
    console.error('\nDetected proxy-related environment variables:');
    for (const name of proxyVars) {
      console.error(`- ${name}=${process.env[name]}`);
    }
    console.error('\nA CONNECT-blocking proxy commonly causes curl failures such as `response 403` for `workers.dev`.');
    console.error('If you are running locally, try one of these options:');
    console.error(`1. Bypass the proxy for Cloudflare: NO_PROXY=.workers.dev,workers.dev curl --noproxy '*' -4 -X POST '${endpoint}' -H 'content-type: text/plain;charset=UTF-8' --data '{"id":"set","action":"set","key":"${key}","value":{"ok":true}}'`);
    console.error(`2. Run this verifier from a normal network connection: npm run verify:cloudflare -- '${endpoint}'`);
  }

  console.error('\nBrowser fallback:');
  console.error(`Open ${endpoint} in a browser-enabled environment and run:`);
  console.error(`fetch('${endpoint}?_=' + Date.now(), { method: 'POST', cache: 'no-store', headers: { 'content-type': 'text/plain;charset=UTF-8', 'cache-control': 'no-cache', 'pragma': 'no-cache' }, body: JSON.stringify({ id: 'set', action: 'set', key: '${key}', value: { ok: true } }) }).then(r => r.json()).then(console.log)`);
}

async function main() {
  console.log(`Verifying Cloudflare Worker D1 storage endpoint: ${endpoint}`);
  console.log(`Using test key: ${key}`);

  const records = await dns.lookup(new URL(endpoint).hostname, { all: true });
  printJson('Resolved DNS records', records);

  const setResult = await post('set', { key, value: { ok: true } });
  printJson('Set response', setResult);

  const getResult = await post('get', { key });
  printJson('Get response', getResult);

  const data = getResult.json?.data;
  if (data?.exists !== true || data?.value?.ok !== true) {
    throw new Error(`Storage verification failed: expected exists=true and value.ok=true, received ${JSON.stringify(data)}`);
  }

  console.log('\nCloudflare Worker storage verification passed.');
}

main().catch((error) => {
  printNetworkHelp(error);
  process.exitCode = 1;
});
