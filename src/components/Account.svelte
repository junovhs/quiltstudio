<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { X, LoaderCircle, Cloud, LogOut } from '@lucide/svelte';
  import { cloud, signIn, signUp, resetPassword, setPassword, signOut } from '../lib/cloud.svelte';
  import { ui, projects } from '../lib/store.svelte';

  type Mode = 'in' | 'up' | 'forgot';
  let mode = $state<Mode>('in');
  let busy = $state(false), error = $state(''), note = $state('');
  const close = () => { ui.account = false; error = ''; note = ''; };
  const go = (m: Mode) => { mode = m; error = ''; note = ''; };
  const open = $derived(ui.account || cloud.recovering);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget as HTMLFormElement);
    const email = String(f.get('email') ?? '').trim(), password = String(f.get('password') ?? '');
    busy = true; error = ''; note = '';
    try {
      if (cloud.recovering) {
        if (password !== f.get('confirm')) error = 'The passwords don’t match.';
        else { const r = await setPassword(password); if (r) error = r; else note = 'Password changed.'; }
      } else if (mode === 'in') {
        const r = await signIn(email, password);
        if (r) error = r; else close();
      } else if (mode === 'up') {
        if (password !== f.get('confirm')) error = 'The passwords don’t match.';
        else {
          const r = await signUp(email, password);
          if (r.error) error = r.error;
          else if (r.confirm) note = 'Almost there: open the link we just emailed you, then sign in here.';
          else close();
        }
      } else {
        const r = await resetPassword(email);
        if (r) error = r; else note = 'If that account exists, a reset link is on its way.';
      }
    } finally { busy = false; }
  }
  const synced = $derived(projects.list.filter(p => cloud.remote[p.id]).length);
</script>

<svelte:window onkeydown={e => e.key === 'Escape' && open && !cloud.recovering && close()} />

{#if open}
  <div class="back" transition:fade={{ duration: 180 }} onclick={e => e.target === e.currentTarget && !cloud.recovering && close()} role="presentation">
    <div class="card" role="dialog" aria-modal="true" aria-label="Account" transition:scale={{ start: 0.92, duration: 320, easing: backOut }}>
      <header>
        <h2>
          {#if cloud.recovering}New password
          {:else if cloud.email}Your account
          {:else if mode === 'up'}Create an account
          {:else if mode === 'forgot'}Reset password
          {:else}Sign in{/if}
        </h2>
        {#if !cloud.recovering}<button class="icon" onclick={close} title="Close"><X size={18} /></button>{/if}
      </header>

      {#if error}<p class="msg bad" role="alert">{error}</p>{/if}
      {#if note}<p class="msg ok" role="status">{note}</p>{/if}

      {#if !cloud.enabled}
        <p class="copy">Accounts aren’t set up on this copy of the app. Your quilts still save on this device.</p>
      {:else if cloud.email && !cloud.recovering}
        <p class="who"><Cloud size={18} /> {cloud.email}</p>
        <p class="copy">{synced} of {projects.list.length} quilts saved to your account. Sign in on another device to see them there.</p>
        {#if cloud.problem}<p class="msg bad">{cloud.problem}</p>{/if}
        <button class="out" onclick={async () => { busy = true; await signOut(); busy = false; close(); }} disabled={busy}>
          <LogOut size={16} /> Sign out
        </button>
      {:else}
        <form onsubmit={submit}>
          {#if cloud.recovering}
            <label><span>New password</span><input name="password" type="password" autocomplete="new-password" minlength="8" required /></label>
            <label><span>Again</span><input name="confirm" type="password" autocomplete="new-password" minlength="8" required /></label>
          {:else}
            <label><span>Email</span><input name="email" type="email" autocomplete="email" required /></label>
            {#if mode !== 'forgot'}
              <label><span>Password</span><input name="password" type="password" autocomplete={mode === 'up' ? 'new-password' : 'current-password'} minlength="8" required /></label>
            {/if}
            {#if mode === 'up'}
              <label><span>Password again</span><input name="confirm" type="password" autocomplete="new-password" minlength="8" required /></label>
            {/if}
          {/if}
          <button class="go" disabled={busy}>
            {#if busy}<LoaderCircle size={16} class="spin" />{/if}
            {cloud.recovering ? 'Save password' : mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Send reset link'}
          </button>
        </form>
        {#if !cloud.recovering}
          <div class="links">
            {#if mode !== 'in'}<button class="link" onclick={() => go('in')}>I have an account</button>{/if}
            {#if mode !== 'up'}<button class="link" onclick={() => go('up')}>Create an account</button>{/if}
            {#if mode === 'in'}<button class="link" onclick={() => go('forgot')}>Forgot password?</button>{/if}
          </div>
          <p class="fine">Your quilts save on this device either way. An account keeps them safe and on all your devices.</p>
        {/if}
      {/if}
    </div>
  </div>
{/if}

<style>
  .back { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 16px; background: oklch(25% 0.03 50 / 35%); backdrop-filter: blur(3px); }
  .card { width: min(380px, 100%); display: grid; gap: 14px; padding: 18px 20px 20px; border-radius: 20px; background: var(--panel); box-shadow: 0 24px 70px oklch(25% 0.04 50 / 30%); }
  header { display: flex; align-items: center; justify-content: space-between; }
  h2 { font-size: 20px; font-weight: 800; letter-spacing: -.02em; }
  form { display: grid; gap: 10px; }
  label { display: grid; gap: 4px; span { font-size: 12px; font-weight: 700; color: var(--muted); } }
  input { width: 100%; padding: 9px 11px; border: 1px solid var(--line); border-radius: 10px; background: var(--sunk); outline: none;
    &:focus { border-color: var(--accent); background: var(--panel); } }
  .go { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 4px; padding: 10px; border: 0; border-radius: 12px; background: var(--accent); color: white; font-weight: 700; }
  .links { display: flex; flex-wrap: wrap; gap: 4px 14px; }
  .link { border: 0; background: none; padding: 2px 0; color: var(--accent); font-weight: 600; &:hover { text-decoration: underline; } }
  .msg { padding: 8px 11px; border-radius: 10px; font-weight: 600; &.bad { background: oklch(60% 0.18 25 / 14%); color: oklch(52% 0.18 25); } &.ok { background: oklch(65% 0.13 150 / 15%); color: oklch(48% 0.12 150); } }
  .who { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 15px; word-break: break-all; }
  .copy, .fine { color: var(--muted); } .fine { font-size: 12px; }
  .out { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 9px; border-radius: 12px; font-weight: 700; }
  .card :global(.spin) { animation: spin 1s linear infinite; }
  @keyframes spin { to { rotate: 360deg; } }
</style>
