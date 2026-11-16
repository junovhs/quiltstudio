<script lang="ts">
  import { onMount } from 'svelte';
  import { X, ImagePlus, ArrowRight, RefreshCw } from '@lucide/svelte';
  import { app, ui, edit, newProject } from '../lib/store.svelte';
  import { draftReference } from '../lib/reference';
  import { parseLength } from '../lib/planning';
  import { thumbnail } from '../lib/render';
  import { blankDoc, type Doc } from '../lib/model';
  let dialog: HTMLDialogElement, original: HTMLCanvasElement | null = null;
  let photo = $state(''), name = $state('Reference image'), cols = $state(6), rows = $state(6), colors = $state(5), width = $state('48'), triangles = $state(true);
  let left = $state(0), right = $state(0), top = $state(0), bottom = $state(0);
  let error = $state(''), busy = $state(false), preview = $state(''), draft = $state.raw<Doc | null>(null), cropped = '', version = 0;
  let reviewed = $state(false);
  const gridCols = $derived(Math.max(1, Math.min(24, Math.floor(cols || 1))));
  const gridRows = $derived(Math.max(1, Math.min(24, Math.floor(rows || 1))));
  onMount(() => dialog.showModal());
  function changed() { version++; draft = null; preview = ''; reviewed = false; }
  function acceptImage(canvas: HTMLCanvasElement, label: string) { version++; original = canvas; photo = canvas.toDataURL('image/jpeg', .85); name = label; left = right = top = bottom = 0; changed(); error = ''; }
  async function loadFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement, file = input.files?.[0]; input.value = ''; if (!file) return;
    busy = true; error = ''; const url = URL.createObjectURL(file);
    try {
      const img = new Image(); img.src = url; await img.decode();
      const scale = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight)), cv = document.createElement('canvas');
      cv.width = Math.round(img.naturalWidth * scale); cv.height = Math.round(img.naturalHeight * scale); cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height); acceptImage(cv, file.name);
    } catch { error = 'Could not open that image. Try a JPEG or PNG photo of your sketch or design.'; }
    finally { URL.revokeObjectURL(url); busy = false; }
  }
  function example() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 600; const c = cv.getContext('2d')!;
    const palette = ['#24556b', '#e5b965', '#e8ddc6', '#b75843'];
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) { c.fillStyle = palette[(x + y) % 4]; c.fillRect(x * 100, y * 100, 100, 100); if ((x + y) % 2) { c.fillStyle = palette[(x + y + 2) % 4]; c.beginPath(); c.moveTo(x * 100, y * 100); c.lineTo((x + 1) * 100, y * 100); c.lineTo(x * 100, (y + 1) * 100); c.fill(); } }
    acceptImage(cv, 'Illustrated reference');
  }
  async function build() {
    if (!original) return; busy = true; error = ''; reviewed = false; const generation = ++version;
    try {
      const w = parseLength(width); if (!w) throw new Error('Enter a quilt width, such as 4 ft or 120 cm.');
      const canvas = document.createElement('canvas'), ow = original.width, oh = original.height;
      const sx = ow * left / 100, sy = oh * top / 100, sw = ow * (100 - left - right) / 100, sh = oh * (100 - top - bottom) / 100;
      canvas.width = Math.max(1, Math.round(sw)); canvas.height = Math.max(1, Math.round(sh)); canvas.getContext('2d')!.drawImage(original, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      const next = draftReference(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height), cols, rows, w, colors, triangles);
      const image = await thumbnail(next, {}, 600); if (generation !== version) return;
      cropped = canvas.toDataURL('image/jpeg', .85); draft = next; preview = image;
    } catch (e) { error = (e as Error).message; }
    finally { busy = false; }
  }
  function useDraft() { if (!draft || !reviewed) return; const doc = structuredClone(draft); doc.reference = { image: cropped, name, opacity: .35, visible: false }; newProject(doc, name.replace(/\.[^.]+$/, '') + ' quilt'); ui.reference = false; ui.notice = 'Your editable draft is ready. Select a piece to refine its shape or colours. Set Size when you are ready.'; }
  function keepReference() { edit(() => { app.doc.reference = { image: photo, name, opacity: .35, visible: true }; }); ui.reference = false; }
  function startTracing() {
    const w = parseLength(width); if (!w) { error = 'Enter a quilt width first.'; return; }
    const doc = draft ? structuredClone(draft) : blankDoc(), root = doc.blocks[doc.root];
    root.cols = Array(gridCols).fill(w / gridCols); root.rows = Array(gridRows).fill(w / gridCols);
    root.cells = Array.from({ length: gridCols * gridRows }, (_, i) => ({ x: i % gridCols, y: Math.floor(i / gridCols), cs: 1, rs: 1, c: { k: 'empty' as const } }));
    doc.settings.lockQuilt = false; doc.settings.anchor = null; doc.reference = { image: draft ? cropped : photo, name, opacity: .55, visible: true };
    newProject(doc, 'Tracing ' + name.replace(/\.[^.]+$/, '')); ui.reference = false; app.tool = 'paint'; ui.notice = 'Trace with squares and triangles from the shape palette. Toggle Reference to check your design without the picture.';
  }
</script>
<dialog bind:this={dialog} class="work-dialog reference-dialog" onclose={() => ui.reference = false}>
  <header><div><h1>Bring your idea into the quilt</h1><p>A sketch, an AI image, or a design you want to explore.</p></div><button class="icon" aria-label="Close reference" onclick={() => ui.reference = false}><X /></button></header>
  {#if !photo}
    <div class="empty"><ImagePlus size={54} /><h3>Start with a picture</h3><p>Crop to the quilt, line up a grid, then review an editable draft of squares and triangles.</p><label class="primary upload">Choose image<input type="file" accept="image/*" onchange={loadFile} disabled={busy} /></label><button onclick={example}>Try an illustrated reference</button></div>
  {:else}
    <div class="reference-layout">
      <section><h3>1 · Line up your idea</h3><div class="source"><img src={photo} alt="Your reference design" /><div class="crop-grid" style:left={`${left}%`} style:right={`${right}%`} style:top={`${top}%`} style:bottom={`${bottom}%`} style:grid-template-columns={`repeat(${gridCols},1fr)`} style:grid-template-rows={`repeat(${gridRows},1fr)`}>{#each Array(gridCols * gridRows) as _}<i></i>{/each}</div></div>
        <details><summary>Crop edges</summary><div class="crop-controls"><label>Left <input type="range" min="0" max="40" bind:value={left} oninput={changed} /></label><label>Right <input type="range" min="0" max="40" bind:value={right} oninput={changed} /></label><label>Top <input type="range" min="0" max="40" bind:value={top} oninput={changed} /></label><label>Bottom <input type="range" min="0" max="40" bind:value={bottom} oninput={changed} /></label></div></details>
        <div class="grid-options"><label>Columns<input aria-label="Reference columns" type="number" min="1" max="24" bind:value={cols} oninput={changed} /></label><label>Rows<input aria-label="Reference rows" type="number" min="1" max="24" bind:value={rows} oninput={changed} /></label><label>Colours<input aria-label="Reference colours" type="number" min="2" max="10" bind:value={colors} oninput={changed} /></label><label>Quilt width<input aria-label="Reference quilt width" type="text" bind:value={width} oninput={changed} /></label></div>
        <label class="check"><input type="checkbox" bind:checked={triangles} onchange={changed} /> Include half-square triangles</label><p class="hint">Square grid cells keep triangle pieces sewable. Adjust the grid to match the main lines in your picture. Complex shapes will need editing.</p>
        <button class="primary" onclick={build} disabled={busy}><RefreshCw size={17} /> {busy ? 'Building draft…' : 'Build editable draft'}</button>
      </section>
      <section><h3>2 · Review the pieces</h3>{#if preview && draft}<img class="draft" src={preview} alt="Editable quilt draft preview" /><div class="colours">{#each draft.fabrics as f}<span style:background={f.color} title={f.name}></span>{/each}</div><p class="hint">This is an interpretation of the picture. Compare colours and diagonals, then refine individual pieces in the editor.</p><label class="check"><input type="checkbox" bind:checked={reviewed} /> I reviewed this draft</label><button class="primary" onclick={useDraft} disabled={!reviewed}>Create this quilt <ArrowRight size={18} /></button>{:else}<div class="draft-placeholder">Your structured draft will appear here.</div>{/if}</section>
    </div>
    <footer><label class="upload"><ImagePlus size={17} /> Another image<input type="file" accept="image/*" onchange={loadFile} disabled={busy} /></label><button onclick={keepReference}>Attach to current quilt</button><button onclick={startTracing}>Start a tracing quilt</button></footer>
    <p class="hint">The reference is saved with your quilt and included in .quilt exports. Drafting happens on this device.</p>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</dialog>
<style>
  .reference-dialog { max-width: 980px; width: min(96vw,980px); }
  .empty { display: grid; justify-items: center; text-align: center; gap: 18px; padding: 35px 15px; } .empty p { max-width: 420px; color: var(--muted); }
  .upload { position: relative; display: inline-flex; align-items: center; gap: 7px; padding: 12px; cursor: pointer; border: 1px solid var(--line); border-radius: 9px; } .upload input { position: absolute; inset: 0; opacity: 0; width: 100%; cursor: pointer; }
  .reference-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; margin-top: 22px; } h3 { margin-bottom: 12px; } .source { position: relative; overflow: hidden; background: #ccc; } .source img { display: block; width: 100%; max-height: 400px; object-fit: contain; } .crop-grid { position: absolute; display: grid; border: 3px solid #ff5b38; box-shadow: 0 0 0 300px #0004; pointer-events: none; } .crop-grid i { border: 1px solid #ffffffaa; }
  .grid-options { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 12px 0; } .grid-options label { display: grid; gap: 5px; font-size: 13px; } .grid-options input { width: 100%; field-sizing: fixed; font-size: 17px; padding: 9px; }
  details { margin-top: 12px; } summary { cursor: pointer; padding: 8px 0; } .crop-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } .crop-controls label { display: grid; font-size: 12px; }
  .check { display: flex; gap: 9px; align-items: center; padding: 12px 0; font-size: 14px; } .check input { width: 20px; height: 20px; }
  .primary { margin-top: 12px; } .draft { display: block; width: 100%; object-fit: contain; max-height: 400px; border-radius: 8px; } .colours { display: flex; gap: 8px; margin: 14px 0; } .colours span { width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--line); } .draft-placeholder { background: var(--sunk); border: 1px dashed var(--line); border-radius: 12px; padding: 60px 20px; text-align: center; color: var(--muted); }
  .source { width: 100%; max-width: 400px; margin: auto; } .source img { max-height: none; height: auto; }
  @media(width < 700px) { .reference-layout { grid-template-columns: 1fr; } footer { flex-wrap: wrap; } }
</style>
