import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/* Same Supabase project and browser setup as noceremony. Only the public URL and the
   publishable key ever reach the browser; a secret / service-role key is refused. */
const jwtRole = (key: string): string | null => {
  const payload = key.split('.')[1];
  if (!payload) return null;
  try {
    const b64 = payload.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const v = JSON.parse(atob(b64)) as { role?: unknown };
    return typeof v.role === 'string' ? v.role : null;
  } catch { return null; }
};

function config(): { url: string; key: string } | null {
  const url = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim();
  const key = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  if (!url || !key) return null;
  const u = new URL(url);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) {
    throw new Error('VITE_SUPABASE_URL must use HTTPS outside local development.');
  }
  if (/service[_-]?role/i.test(key) || key.startsWith('sb_secret_') || jwtRole(key) === 'service_role') {
    throw new Error('Use a browser publishable key, never a Supabase secret key.');
  }
  return { url: u.href.replace(/\/$/, ''), key };
}

const c = config();
export const supabase: SupabaseClient | null = c
  ? createClient(c.url, c.key, { auth: { autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', persistSession: true } })
  : null;
