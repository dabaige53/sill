import { createClient } from '@supabase/supabase-js';

function reject(status, code) {
  throw Object.assign(new Error(code), {status, code});
}

// Request-scoped cloud client. Local app/MCP remain separate. Never persist server sessions.
// This authenticates a principal; the capability layer still authorizes each operation.
export async function authenticateSupabase(authorization, config, factory = createClient) {
  const url = new URL(config.url);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Invalid Supabase origin');
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey ?? '')) {
    throw new Error('A publishable key is required');
  }
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(authorization ?? '');
  if (!match || match[1].length > 16384) reject(401, 'unauthenticated');
  const token = match[1];
  const client = factory(url.origin, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {headers: {Authorization: `Bearer ${token}`}},
  });
  let result;
  try { result = await client.auth.getClaims(token); }
  catch { reject(503, 'unavailable'); }
  if (result.error) {
    if (result.error.status >= 500 || result.error.name === 'AuthRetryableFetchError') reject(503, 'unavailable');
    reject(401, 'unauthenticated');
  }
  const c = result.data?.claims;
  const audiences = Array.isArray(c?.aud) ? c.aud : [c?.aud];
  if (!c || c.iss !== `${url.origin}/auth/v1` || !audiences.includes(config.audience ?? 'authenticated') ||
      !Number.isFinite(c.exp) || c.exp <= Date.now()/1000 ||
      (c.nbf !== undefined && (!Number.isFinite(c.nbf) || c.nbf > Date.now()/1000)) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.sub ?? '') ||
      c.role !== 'authenticated' || c.is_anonymous === true) reject(401, 'unauthenticated');
  // Do not translate user_metadata or OAuth identity scopes into product permissions.
  const clientId = c.client_id;
  if (clientId !== undefined && (typeof clientId !== 'string' || !clientId)) reject(401, 'unauthenticated');
  if (config.kind === 'web' && clientId !== undefined) reject(403, 'forbidden');
  if (config.kind === 'mcp' && (!clientId || !config.audience || config.audience === 'authenticated')) reject(403, 'forbidden');
  return {client, principal: Object.freeze({userId: c.sub, clientId: clientId ?? null})};
}
