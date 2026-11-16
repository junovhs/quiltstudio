import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('first installation precaches the current hashed build before taking control', async () => {
  const handlers: Record<string, (event: any) => void> = {}, saved: string[] = []; let activated = false;
  runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url),'utf8'), {
    self: { addEventListener: (name: string, fn: any) => handlers[name]=fn, skipWaiting: async () => {activated=true;} },
    caches: { open: async () => ({ addAll: async (urls: string[]) => saved.push(...urls), put: async (url: string) => saved.push(url) }) },
    fetch: async () => new Response('<script src="/assets/app-hash.js"></script><link href="/assets/app-hash.css">'),
  });
  let work: Promise<void> = Promise.resolve(); handlers.install({waitUntil: (p: Promise<void>)=>work=p}); await work;
  assert.ok(saved.includes('/assets/app-hash.js')); assert.ok(saved.includes('/assets/app-hash.css')); assert.ok(saved.includes('/')); assert.equal(activated,true);
});
test('failed offline asset installation never activates an incomplete shell', async () => {
  const handlers: Record<string, (event: any) => void> = {}; let activated=false;
  runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url),'utf8'), {
    self: {addEventListener:(name:string,fn:any)=>handlers[name]=fn,skipWaiting:async()=>{activated=true;}},
    caches:{open:async()=>({addAll:async()=>{throw new Error('offline');},put:async()=>{}})},
    fetch:async()=>new Response('<script src="/assets/app.js"></script>'),
  });
  let work:Promise<void>=Promise.resolve();handlers.install({waitUntil:(p:Promise<void>)=>work=p});await assert.rejects(work,/offline/);assert.equal(activated,false);
});
