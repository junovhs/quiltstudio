import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { hooks, projects, readDoc, showProject, storeProject, type ProjectMeta } from './store.svelte';
import type { Doc } from './model';

/* Accounts + cloud saving. Projects always save in this browser first; when you're signed
   in, each change is also sent to your account, and signing in on another device brings
   them all down. The newest copy of a project wins. Fabric photos stay on the device. */

const TABLE = 'quiltstudio_projects';
const GONE = 'quiltstudio.deleted';        // projects deleted while signed out, removed on next sign-in
const FIRST = (uid: string) => 'quiltstudio.synced.' + uid;

export type SyncState = 'local' | 'syncing' | 'saved' | 'offline' | 'error';
export const cloud = $state({
  enabled: !!supabase,
  email: null as string | null,
  state: 'local' as SyncState,
  /** project id -> when the cloud copy was last saved */
  remote: {} as Record<string, number>,
  problem: '',
  /** arrived from a password-reset email: ask for a new password */
  recovering: false,
});

let session: Session | null = null;
const uid = () => session?.user.id ?? null;
const readGone = (): string[] => { try { return JSON.parse(localStorage.getItem(GONE) ?? '[]'); } catch { return []; } };
const writeGone = (v: string[]) => { try { localStorage.setItem(GONE, JSON.stringify(v)); } catch {} };

interface Row { id: string; name: string; doc: Doc; thumb: string | null; updated_at: string }

function fail(e: unknown) {
  const msg = (e as { message?: string })?.message ?? String(e);
  cloud.state = navigator.onLine ? 'error' : 'offline';
  cloud.problem = /quiltstudio_projects|relation|schema cache/i.test(msg)
    ? 'Cloud saving isn’t set up yet (the database table is missing).'
    : navigator.onLine ? 'Couldn’t reach your account. Your quilts are still saved on this device.' : 'Offline. Changes will sync when you’re back.';
}

/* ---------- sending ---------- */
const timers = new Map<string, ReturnType<typeof setTimeout>>();
function queue(id: string) {
  if (!uid()) return;
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => { timers.delete(id); void push(id); }, 1200));
}
async function push(id: string) {
  const owner = uid(), meta = projects.list.find(p => p.id === id), doc = readDoc(id);
  if (!supabase || !owner || !meta || !doc) return;
  cloud.state = 'syncing';
  const { error } = await supabase.from(TABLE).upsert({
    user_id: owner, id, name: meta.name, doc, thumb: meta.thumb ?? null, updated_at: new Date(meta.updated).toISOString(),
  });
  if (error) return fail(error);
  cloud.remote[id] = meta.updated;
  if (!timers.size) { cloud.state = 'saved'; cloud.problem = ''; }
}
async function remove(id: string) {
  if (!supabase || !uid()) { writeGone([...new Set([...readGone(), id])]); return; }
  delete cloud.remote[id];
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) { writeGone([...new Set([...readGone(), id])]); fail(error); }
}
hooks.saved = queue;
hooks.deleted = id => void remove(id);

/* ---------- the two-way sync when you sign in ---------- */
let syncing: Promise<void> | null = null;
export function sync() { return (syncing ??= doSync().finally(() => (syncing = null))); }
async function doSync() {
  const owner = uid();
  if (!supabase || !owner) return;
  cloud.state = 'syncing'; cloud.problem = '';
  try {
    const gone = readGone();
    if (gone.length) {
      const { error } = await supabase.from(TABLE).delete().in('id', gone);
      if (!error) writeGone([]);
    }
    const { data, error } = await supabase.from(TABLE).select('id,name,doc,thumb,updated_at');
    if (error) return fail(error);
    const rows = (data ?? []) as Row[];
    const remoteIds = new Set(rows.map(r => r.id));
    let currentChanged = false;
    cloud.remote = {};
    for (const r of rows) {
      const updated = Date.parse(r.updated_at), local = projects.list.find(p => p.id === r.id);
      cloud.remote[r.id] = updated;
      if (local && local.updated >= updated) continue;
      const meta: ProjectMeta = { id: r.id, name: r.name, updated, ...(r.thumb ? { thumb: r.thumb } : {}) };
      storeProject(meta, { ...r.doc, name: r.name });
      if (r.id === projects.current) currentChanged = true;
    }
    // anything newer here (or only here) goes up
    await Promise.all(projects.list.filter(p => !remoteIds.has(p.id) || p.updated > cloud.remote[p.id]).map(p => push(p.id)));
    // first time this account signs in on this device: open its most recent quilt
    const first = !localStorage.getItem(FIRST(owner));
    try { localStorage.setItem(FIRST(owner), '1'); } catch {}
    const newest = rows.toSorted((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0];
    if (first && newest && newest.id !== projects.current) showProject(newest.id);
    else if (currentChanged) showProject(projects.current);
    if (cloud.state === 'syncing') cloud.state = 'saved';
  } catch (e) { fail(e); }
}

/* ---------- account ---------- */
function setSession(s: Session | null) {
  const was = uid();
  session = s;
  cloud.email = s?.user.email ?? null;
  if (!s) { cloud.state = 'local'; cloud.remote = {}; cloud.problem = ''; return; }
  if (s.user.id !== was) void sync();
}
if (supabase) {
  supabase.auth.onAuthStateChange((e, s) => { if (e === 'PASSWORD_RECOVERY') cloud.recovering = true; setTimeout(() => setSession(s)); });  // (keep the auth lock free)
  void supabase.auth.getSession().then(({ data }) => setSession(data.session));
  addEventListener('online', () => { if (uid()) void sync(); });
}

export async function signIn(email: string, password: string) {
  if (!supabase) return 'Accounts aren’t set up on this copy of the app.';
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? (/confirm/i.test(error.message) ? 'Confirm your email first. Check your inbox for the link.' : 'That email and password weren’t accepted.') : null;
}
export async function signUp(email: string, password: string): Promise<{ error?: string; confirm?: boolean }> {
  if (!supabase) return { error: 'Accounts aren’t set up on this copy of the app.' };
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) return { error: /registered|exists/i.test(error.message) ? 'There’s already an account with that email. Sign in instead.' : 'Couldn’t create the account. Check the details and try again.' };
  return { confirm: !data.session };
}
export async function resetPassword(email: string) {
  if (!supabase) return 'Accounts aren’t set up on this copy of the app.';
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  return error ? 'Couldn’t send a reset link right now.' : null;
}
export async function setPassword(password: string) {
  if (!supabase) return 'Accounts aren’t set up.';
  const { error } = await supabase.auth.updateUser({ password });
  if (!error) cloud.recovering = false;
  return error ? 'Couldn’t change the password.' : null;
}
export async function signOut() {
  if (!supabase) return;
  await Promise.all([...timers.keys()].map(id => { clearTimeout(timers.get(id)); timers.delete(id); return push(id); }));
  await supabase.auth.signOut({ scope: 'local' });
}
