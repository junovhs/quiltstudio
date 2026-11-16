<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Camera, ImagePlus, X, RotateCcw, Check, Ruler } from '@lucide/svelte';
  import { ui } from '../lib/store.svelte';
  import { parseLength } from '../lib/planning';
  import { detectOutlines, measureQuad, type Point, type Quad, type Calibration } from '../lib/measurement';
  let dialog: HTMLDialogElement;
  let video = $state<HTMLVideoElement>(null!);
  let stream: MediaStream | null = null, timer: ReturnType<typeof setInterval>, generation = 0;
  let busy = $state(false), live = $state(false), error = $state(''), photo = $state('');
  let frameW = $state(640), frameH = $state(480), outlines = $state<Quad[]>([]);
  let stage = $state<'reference' | 'piece' | 'result'>('reference');
  let mode = $state<'ruler' | 'rectangle'>('ruler');
  let reference = $state<Point[]>([]), piece = $state<Point[]>([]);
  let length = $state(''), refHeight = $state(''), dragging = -1;
  let reviewed = $state(false);
  const needed = $derived(mode === 'ruler' ? 2 : 4);
  const active = $derived(stage === 'reference' ? reference : piece);
  const estimate = $derived.by(() => {
    if (reference.length !== needed || piece.length !== 4) return null;
    const w = parseLength(length), h = parseLength(refHeight);
    if (!w || (mode === 'rectangle' && !h)) return null;
    try {
      const calibration: Calibration = mode === 'ruler'
        ? { kind: 'ruler', points: reference as [Point, Point], length: w }
        : { kind: 'rectangle', points: reference as Quad, width: w, height: h! };
      return { ...measureQuad(piece as Quad, calibration), error: '' };
    } catch (e) { return { error: (e as Error).message, w: 0, h: 0, edges: [], uneven: false }; }
  });
  const inches = (v: number) => `${v.toFixed(2)}″`;
  function stop() {
    generation++; clearInterval(timer); stream?.getTracks().forEach(t => t.stop()); stream = null;
    if (video) video.srcObject = null; live = false; busy = false;
  }
  async function start() {
    stop(); error = ''; photo = ''; reference = []; piece = []; outlines = []; reviewed = false;
    if (!navigator.mediaDevices?.getUserMedia) { error = 'Live camera is unavailable here. Use Take or choose photo instead.'; return; }
    const request = generation; busy = true;
    try {
      const result = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1600 }, height: { ideal: 1200 } } });
      if (request !== generation) { result.getTracks().forEach(t => t.stop()); return; }
      stream = result; video.srcObject = result; await video.play();
      if (request !== generation) return;
      live = true;
      timer = setInterval(() => {
        if (!video?.videoWidth || !live) return;
        const cv = frame(video, 480); frameW = cv.width; frameH = cv.height;
        outlines = detectOutlines(cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height));
      }, 450);
    } catch (e) {
      if (request !== generation) return;
      stop();
      error = (e as DOMException).name === 'NotAllowedError' ? 'Camera permission was not granted. You can retry or use Take or choose photo.' : 'The camera could not start. Retry or use Take or choose photo.';
    } finally { if (request === generation) busy = false; }
  }
  function frame(source: HTMLVideoElement | HTMLImageElement, max: number) {
    const w = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
    const h = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
    const scale = Math.min(1, max / Math.max(w, h));
    const cv = document.createElement('canvas'); cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
    cv.getContext('2d')!.drawImage(source, 0, 0, cv.width, cv.height); return cv;
  }
  function useFrame(cv: HTMLCanvasElement) {
    stop(); frameW = cv.width; frameH = cv.height; photo = cv.toDataURL('image/jpeg', .94);
    reference = []; reviewed = false; stage = 'reference'; error = '';
    // Detect on a small image and map suggestions back to the original pixels.
    const small = document.createElement('canvas'), scale = Math.min(1, 480 / Math.max(cv.width, cv.height));
    small.width = Math.round(cv.width * scale); small.height = Math.round(cv.height * scale);
    small.getContext('2d')!.drawImage(cv, 0, 0, small.width, small.height);
    outlines = detectOutlines(small.getContext('2d')!.getImageData(0, 0, small.width, small.height))
      .map(q => q.map(p => ({ x: p.x / scale, y: p.y / scale })) as Quad);
    piece = outlines[0] ? [...outlines[0]] : [];
  }
  function capture() { if (video.videoWidth) useFrame(frame(video, 1800)); }
  async function loadFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement, file = input.files?.[0]; input.value = '';
    if (!file) return;
    stop(); busy = true; error = ''; const request = generation;
    const url = URL.createObjectURL(file), img = new Image();
    try { img.src = url; await img.decode(); if (request === generation) useFrame(frame(img, 1800)); }
    catch { if (request === generation) error = 'This photo could not be opened. Try a JPEG or PNG image.'; }
    finally { URL.revokeObjectURL(url); if (request === generation) busy = false; }
  }
  function sample() {
    const cv = document.createElement('canvas'); cv.width = 600; cv.height = 520;
    const c = cv.getContext('2d')!; c.fillStyle = '#ede7dc'; c.fillRect(0, 0, 600, 520);
    c.fillStyle = '#dfb757'; c.fillRect(80, 60, 280, 65);
    c.strokeStyle = '#382b20'; c.fillStyle = '#382b20'; c.lineWidth = 1; c.font = '15px sans-serif';
    for (let i = 0; i <= 24; i++) { const x = 100 + i * 10; c.beginPath(); c.moveTo(x, 60); c.lineTo(x, i % 4 ? 73 : 87); c.stroke(); if (i % 4 === 0) c.fillText(String(i / 4), x - 4, 108); }
    c.fillStyle = '#315b7c'; c.fillRect(80, 180, 320, 240);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) {
      c.fillStyle = (x + y) % 2 ? '#c56d50' : '#f5dfae';
      c.beginPath(); c.moveTo(80 + x * 80, 180 + y * 80); c.lineTo(160 + x * 80, 180 + y * 80); c.lineTo(80 + x * 80, 260 + y * 80); c.fill();
    }
    c.fillStyle = '#382b20'; c.font = '16px sans-serif'; c.fillText('Example only · block 8 × 6 inches', 80, 465);
    length = '6'; useFrame(cv);
  }
  function pointer(e: PointerEvent) {
    const svg = e.currentTarget as SVGSVGElement, rect = svg.getBoundingClientRect();
    return { x: Math.max(0, Math.min(frameW, (e.clientX - rect.left) / rect.width * frameW)), y: Math.max(0, Math.min(frameH, (e.clientY - rect.top) / rect.height * frameH)) };
  }
  function down(e: PointerEvent) {
    if (!photo || stage === 'result') return;
    const p = pointer(e), rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const near = active.map((q, i) => ({ i, d: Math.hypot(q.x - p.x, q.y - p.y) })).sort((a, b) => a.d - b.d)[0];
    if (near && near.d < 28 * frameW / rect.width) dragging = near.i;
    else if (active.length < (stage === 'reference' ? needed : 4)) { setPoints([...active, p]); dragging = active.length - 1; }
    else return;
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId); reviewed = false;
  }
  function setPoints(points: Point[]) { if (stage === 'reference') reference = points; else piece = points; }
  function move(e: PointerEvent) { if (dragging >= 0) setPoints(active.map((p, i) => i === dragging ? pointer(e) : p)); }
  function adjustKey(e: KeyboardEvent, i: number) {
    const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const d = directions[e.key]; if (!d || stage === 'result') return;
    e.preventDefault(); const amount = e.shiftKey ? 10 : 1;
    setPoints(active.map((p, n) => n !== i ? p : { x: Math.max(0, Math.min(frameW, p.x + d[0] * amount)), y: Math.max(0, Math.min(frameH, p.y + d[1] * amount)) }));
    reviewed = false;
  }
  function accept() {
    if (!estimate || estimate.error || !reviewed) return;
    ui.cameraResult = { w: estimate.w, h: estimate.h }; ui.camera = false; ui.workshop = true;
  }
  function hidden() { if (document.hidden && (live || busy)) { stop(); error = 'Camera paused while the app was away. Tap Open camera to resume.'; } }
  onMount(() => { dialog.showModal(); document.addEventListener('visibilitychange', hidden); });
  onDestroy(() => { stop(); document.removeEventListener('visibilitychange', hidden); });
</script>

<dialog bind:this={dialog} class="work-dialog camera-dialog" onclose={() => ui.camera = false}>
  <header><div><h1>Measure with camera</h1><p>Bring the piece on your table into your quilt.</p></div><button class="icon" aria-label="Close camera" onclick={() => ui.camera = false}><X /></button></header>
  {#if !photo}
    <div class="capture-area" class:streaming={live}>
      <video bind:this={video} autoplay muted playsinline aria-label="Rear camera preview"></video>
      {#if live}<svg viewBox={`0 0 ${frameW} ${frameH}`} aria-label="Suggested fabric outlines">{#each outlines as q}<polygon points={q.map(p => `${p.x},${p.y}`).join(' ')} />{/each}</svg>
      {:else}<div class="camera-intro"><Camera size={42} /><b>Piece + ruler, in one photo</b><p>Lay both flat on a plain, contrasting surface. Keep the phone directly above them.</p><span class="reference-drawing">▱ &nbsp; 📏</span></div>{/if}
    </div>
    <div class="capture-actions">{#if live}<button class="primary" onclick={capture}><Camera size={18} /> Freeze frame</button>{:else}<button class="primary" disabled={busy} onclick={start}><Camera size={18} /> {busy ? 'Opening…' : 'Open camera'}</button>{/if}
      <label class="photo-button"><ImagePlus size={18} /> Take or choose photo<input type="file" accept="image/*" capture="environment" onchange={loadFile} disabled={busy} /></label>
    </div>
    <button class="ghost sample" onclick={sample}>Try an illustrated example</button>
    <p class="hint">Photos are processed on this device. A ruler or known rectangle supplies the real scale.</p>
  {:else}
    <nav class="measure-steps" aria-label="Measurement steps"><button class:on={stage === 'reference'} onclick={() => stage = 'reference'}>1 · Ruler</button><button class:on={stage === 'piece'} disabled={reference.length !== needed || !parseLength(length) || (mode === 'rectangle' && !parseLength(refHeight))} onclick={() => stage = 'piece'}>2 · Piece</button><button class:on={stage === 'result'} disabled={!estimate || !!estimate.error} onclick={() => stage = 'result'}>3 · Review</button></nav>
    {#if stage === 'reference'}
      <div class="reference-options"><button class:on={mode === 'ruler'} onclick={() => { mode = 'ruler'; reference = []; reviewed = false; }}>Two ruler ticks</button><button class:on={mode === 'rectangle'} onclick={() => { mode = 'rectangle'; reference = []; reviewed = false; }}>Known rectangle</button></div>
      <p class="instruction">{mode === 'ruler' ? 'Tap two ruler tick marks. Enter the distance between them.' : 'Tap the reference corners clockwise: top left, top right, bottom right, bottom left.'}</p>
      <div class="reference-dimensions"><label>{mode === 'ruler' ? 'Distance between ticks' : 'Reference width'}<input aria-label="Reference width or tick distance" type="text" placeholder="e.g. 6 in" bind:value={length} oninput={() => reviewed = false} /></label>{#if mode === 'rectangle'}<label>Reference height<input aria-label="Reference height" type="text" placeholder="e.g. 2 in" bind:value={refHeight} oninput={() => reviewed = false} /></label>{/if}</div>
      <p class="hint">{mode === 'ruler' ? 'Overhead photos only. For an angled photo, use the four corners of a known rectangle on the same surface.' : 'Use the actual outside dimensions of a ruler, template, or rectangle. This corrects perspective on a flat surface.'}</p>
    {:else if stage === 'piece'}<p class="instruction">Check the outside corners. Drag the dots, or reset and tap four corners clockwise from the top left.</p>
    {:else}<p class="instruction">Check the outline against your piece before using these estimates.</p>{/if}
    <div class="photo-frame">
      <img src={photo} alt="Captured piece and measurement reference" />
      <svg viewBox={`0 0 ${frameW} ${frameH}`} role="group" aria-label="Measurement point editor" onpointerdown={down} onpointermove={move} onpointerup={() => dragging = -1} onpointercancel={() => dragging = -1}>
        {#if reference.length > 1}<polyline class="reference" points={[...reference, ...(mode === 'rectangle' && reference.length === 4 ? [reference[0]] : [])].map(p => `${p.x},${p.y}`).join(' ')} />{/if}
        {#if piece.length > 1}<polygon class:muted={stage === 'reference'} points={piece.map(p => `${p.x},${p.y}`).join(' ')} />{/if}
        {#each active as p, i}<g role="button" tabindex="0" aria-label={`Adjust ${stage === 'reference' ? 'reference' : 'piece'} point ${i + 1}`} onkeydown={e => adjustKey(e, i)}><circle cx={p.x} cy={p.y} r={12 * frameW / 500} /><text x={p.x} y={p.y} font-size={14 * frameW / 500}>{i + 1}</text></g>{/each}
      </svg>
    </div>
    {#if stage !== 'result'}
      <div class="point-actions"><span>{active.length} / {stage === 'reference' ? needed : 4} points</span><button class="ghost" onclick={() => { setPoints([]); reviewed = false; }}><RotateCcw size={16} /> Reset points</button>
      {#if stage === 'piece' && outlines.length}<button class="ghost" onclick={() => { const i = outlines.findIndex(q => JSON.stringify(q) === JSON.stringify(piece)); piece = [...outlines[(i + 1) % outlines.length]]; reviewed = false; }}>Next detected outline</button>{/if}</div>
    {/if}
    {#if estimate?.error}<p class="error" role="status">{estimate.error}</p>{/if}
    {#if stage === 'result' && estimate && !estimate.error}
      <div class="measurement-result"><Ruler size={23} /><strong>≈ {inches(estimate.w)} × {inches(estimate.h)}</strong><span>Estimated outer dimensions</span></div>
      <div class="edge-lengths">{#each ['Top', 'Right', 'Bottom', 'Left'] as label, i}<span>{label}<b>{inches(estimate.edges[i])}</b></span>{/each}</div>
      {#if estimate.uneven}<p class="error">Opposite edges differ by more than ⅛″. Check the corners and camera angle. The size above averages opposite edges.</p>{/if}
      <p class="hint">Camera estimates are not verified cutting measurements. Check with your ruler before cutting; you can edit the numbers in the next step.</p>
      <label class="review-check"><input type="checkbox" bind:checked={reviewed} /> I checked the reference and piece outline</label>
    {/if}
    <footer><button onclick={() => { stop(); photo = ''; reference = []; piece = []; reviewed = false; }}>Retake</button>
      {#if stage === 'reference'}<button class="primary" disabled={reference.length !== needed || !parseLength(length) || (mode === 'rectangle' && !parseLength(refHeight))} onclick={() => stage = 'piece'}>Check piece →</button>
      {:else if stage === 'piece'}<button class="primary" disabled={!estimate || !!estimate.error} onclick={() => stage = 'result'}>Review size →</button>
      {:else}<button class="primary" disabled={!reviewed || !estimate || !!estimate.error} onclick={accept}><Check size={18} /> Use measurement</button>{/if}
    </footer>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</dialog>

<style>
  .camera-dialog { max-width: 640px; }
  .capture-area { position: relative; border-radius: 14px; background: var(--sunk); overflow: hidden; margin: 18px 0; min-height: 240px; }
  video { display: none; width: 100%; } .streaming video { display: block; }
  .capture-area svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
  .camera-intro { display: grid; justify-items: center; text-align: center; padding: 24px; gap: 10px; } .camera-intro b { font-size: 20px; } .camera-intro p { max-width: 330px; } .reference-drawing { font-size: 46px; }
  .capture-actions { display: flex; flex-wrap: wrap; gap: 10px; } .capture-actions button, .photo-button { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; flex: 1; }
  .photo-button { border: 1px solid var(--line); border-radius: 10px; cursor: pointer; position: relative; } .photo-button input { position: absolute; inset: 0; opacity: 0; width: 100%; cursor: pointer; }
  .sample { margin-top: 12px; }
  .measure-steps { display: flex; gap: 6px; margin: 16px 0; } .measure-steps button { flex: 1; padding: 10px 3px; }
  .reference-options { display: flex; gap: 6px; } .instruction { margin: 12px 0; font-size: 15px; }
  .reference-dimensions { display: flex; gap: 12px; } .reference-dimensions label { flex: 1; min-width: 0; display: grid; gap: 4px; } .reference-dimensions input { width: 100%; field-sizing: fixed; padding: 8px; font-size: 18px; }
  .photo-frame { position: relative; margin-top: 12px; background: var(--sunk); border-radius: 10px; overflow: hidden; }
  .photo-frame img { display: block; width: 100%; }
  .photo-frame svg { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
  polygon, polyline { fill: #16c79a18; stroke: #05aa7b; stroke-width: 3; vector-effect: non-scaling-stroke; } .reference { stroke: #ee6a37; fill: none; } polygon.muted { opacity: .35; }
  circle { fill: #fff; stroke: #173c32; stroke-width: 2; vector-effect: non-scaling-stroke; cursor: grab; } text { fill: #173c32; text-anchor: middle; dominant-baseline: central; font-weight: 800; pointer-events: none; }
  .point-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin-top: 8px; } .point-actions span { margin-right: auto; } .point-actions button { display: flex; align-items: center; gap: 5px; }
  .measurement-result { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; align-items: center; margin: 16px 0 12px; } .measurement-result strong { font-size: 26px; } .measurement-result span { grid-column: 2; color: var(--muted); }
  .edge-lengths { display: grid; grid-template-columns: repeat(4,1fr); gap: 6px; } .edge-lengths span { display: grid; text-align: center; background: var(--sunk); padding: 8px 2px; border-radius: 8px; font-size: 12px; } .edge-lengths b { font-size: 15px; }
  .review-check { display: flex; align-items: center; gap: 10px; padding: 12px 0; } .review-check input { width: 20px; height: 20px; }
</style>
