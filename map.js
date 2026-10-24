/*
 * The map of Pixel City: a top-down view you can drag, zoom and click.
 *
 * City v3: a city that is a screen. The ground is substrate, the main roads are data buses with a node at every
 * junction, the streets are signal traces, the river is a data stream, the forest is a noise field, gardens are wild
 * colour growth, the coast is the frame border and the sea is the blank margin beyond it. Industry is render plants,
 * texture foundries, palette refineries, compression facilities and signal processing yards.
 *
 * Every district behaves like the pixel it is named after (see look.js): Dither is dithered, Moiré has interference
 * rings, Off-By-One is misregistered by a pixel, Dead Pixel has blocks that no longer light, Null Pointer has missing
 * textures. The residents are pixels too: each drawn in their own colour. Hover over one to see who they are; click
 * to open their census file.
 *
 * The whole city is painted once at 16 pixels per block into an offscreen image and repainted only when something
 * changes (nightfall, a blackout, a site opening). Panning and zooming redraw part of that image. Moving things
 * (people, packets on the buses, the data stream, ships, fans, smoke, rain) are drawn on top every frame. Display only.
 *
 * window.CityMap(canvas, { onSelect, time, personHref }) returns { frame, refresh, zoom, fit, focus,
 * selectDistrict, toggleDistricts, destroy }. time picks the era's map (default: now). personHref(id) gives the
 * link for a resident (default: census.html#/resident/<id>).
 */
(function () {
  const U = window.PixelUniverse;
  const C = U.city;
  const T = C.T;
  const LOOK = window.CityLook || { theme: () => ({ accent: '#9AA9B2', physics: 'lossless', industry: 'render' }) };
  const S = 16; // pixels per block in the world image
  const H = 3600000, DAY = 86400000;
  function h32(n) { n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
  const pick = (arr, v) => arr[Math.floor(v * arr.length) % arr.length];
  const rgbOf = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, k) => { const A = rgbOf(a), B = rgbOf(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join(''); };
  const rgba = (h, a) => { const c = rgbOf(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };
  // the city's colours: a dark substrate, so the light it emits is what you see
  const PAL = {
    void: '#03060D', sub: '#0A111D',
    bus: '#07121A', busEdge: '#1FE38C', busGlow: 'rgba(31,227,140,0.2)', busDash: 'rgba(31,227,140,0.38)', node: '#A6FFD6',
    trace: '#1B9C88', pad: '#3BEACB',
    stream: '#0662B4', streamB: '#0A74CF', streamEdge: '#46DCFF', streamHi: '#C4F7FF',
    margin: '#EAFBFF', marginGlow: '#46D6FF',
    noise: ['#0E5A3B', '#127A4B', '#1AA25B', '#26C96A', '#0A3A2A', '#155E6B'],
    growth: ['#2BFF88', '#FF4FD8', '#FFE14F', '#4FC3FF', '#B46CFF', '#FF8A3D', '#3BFFE6'],
    rgb: ['#FF3355', '#2BFF88', '#3D8BFF'],
    cga: ['#0000AA', '#00AA00', '#00AAAA', '#AA0000', '#AA00AA', '#AA5500', '#AAAAAA', '#5555FF', '#55FF55', '#55FFFF', '#FF5555', '#FF55FF', '#FFFF55', '#FFFFFF'],
    neon: ['#FF3B6B', '#FF8A1F', '#FFD23F', '#2BFF88', '#1FE3D0', '#3DA9FF', '#7A6CFF', '#E04FFF', '#FF5FA2']
  };
  const BOX = ['#FF3B6B', '#3DA9FF', '#FFD23F', '#2BFF88', '#FF8A1F', '#B46CFF', '#1FE3D0'];
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const WAVE = [0, -2, -3, -2, 0, 2, 3, 2];
  const PIXEL_COLOR = { 'Hot Pixel': '#FF3B30', 'Burn-In': '#FF8A1F', 'Gamma': '#FFC6A0', 'Dither': '#F2D024', 'Chroma': '#9BE22D', 'Vsync': '#2FBF5B', 'Moiré': '#20C3AF',
    'Nibble': '#23B5E8', 'Sub-Pixel': '#2F6BFF', 'Anti-Alias': '#8B6CFF', 'Jaggy': '#C43AE0', 'Off-By-One': '#FF5FA2', 'Bezel': '#A47551', 'Lossless': '#F4F4F4', 'Dead Pixel': '#6E7681', 'Null Pointer': '#5A5FD6' };

  window.CityMap = function (canvas, opts) {
    opts = opts || {};
    const map = C.map(opts.time !== undefined ? opts.time : Date.now()) || C.map();
    const personHref = opts.personHref || ((id) => 'census.html#/resident/' + id);
    const ctx = canvas.getContext('2d');
    const world = document.createElement('canvas');
    world.width = map.W * S; world.height = map.H * S;
    const g = world.getContext('2d');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let dpr = 1, cw = 0, ch = 0;
    const cam = { x: map.W / 2, y: map.H / 2, z: 6 };
    let worldKey = '', selected = null, hover = null, district = -1, showDistricts = true, hoverPerson = null;
    const siteIndex = {};
    { let k = 0; for (const f of map.features) if (f.kind === 'site') siteIndex[f.id] = k++; }
    const tile = (x, y) => (x < 0 || y < 0 || x >= map.W || y >= map.H ? T.SEA : map.tiles[y * map.W + x]);
    const isWater = (t) => t === T.SEA || t === T.RIVER;
    const isRoad = (t) => t === T.ROAD || t === T.BRIDGE;
    const isLine = (t) => t === T.ROAD || t === T.STREET || t === T.BRIDGE;
    const squareAt = {};
    for (const q of map.squares || []) squareAt[q.x + ',' + q.y] = q;
    // district borders, as line segments, computed once
    const borders = [], dBorders = map.districts.map(() => []);
    for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) {
      const d = map.district[y * map.W + x];
      if (d < 0) continue;
      const right = x + 1 < map.W ? map.district[y * map.W + x + 1] : -1, down = y + 1 < map.H ? map.district[(y + 1) * map.W + x] : -1, left = x > 0 ? map.district[y * map.W + x - 1] : -1, up = y > 0 ? map.district[(y - 1) * map.W + x] : -1;
      if (right >= 0 && right !== d) borders.push([x + 1, y, x + 1, y + 1]);
      if (down >= 0 && down !== d) borders.push([x, y + 1, x + 1, y + 1]);
      if (right !== d) dBorders[d].push([x + 1, y, x + 1, y + 1]);
      if (left !== d) dBorders[d].push([x, y, x, y + 1]);
      if (down !== d) dBorders[d].push([x, y + 1, x + 1, y + 1]);
      if (up !== d) dBorders[d].push([x, y, x + 1, y]);
    }
    // each district's look: its namesake's colour, its physics, and the shades of substrate it is built on
    const look = map.districts.map((d) => {
      const th = LOOK.theme(d.name, d.id), a = th.accent;
      return { name: d.name, accent: a, physics: th.physics, industry: th.industry,
        sub: mix(PAL.sub, a, 0.07), sub2: mix(PAL.sub, a, 0.13), dot: mix(PAL.sub, a, 0.32), dim: mix(PAL.sub, a, 0.3), faint: rgba(a, 0.11), glow: rgba(a, 0.22),
        light: mix(a, '#FFFFFF', 0.45), ramp: [0, 1, 2, 3, 4, 5, 6].map((k) => mix(PAL.sub, a, 0.03 + k * 0.045)),
        roofs: [a, mix(a, '#FFFFFF', 0.35), mix(a, '#000000', 0.25), pick(PAL.neon, h32(d.id * 7 + 1)), pick(PAL.neon, h32(d.id * 7 + 2)), mix(a, '#3DA9FF', 0.5)],
        x0: 1e9, y0: 1e9, x1: -1, y1: -1, rows: {} };
    });
    for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) {
      const d = map.district[y * map.W + x];
      if (d < 0) continue;
      const L = look[d];
      if (x < L.x0) L.x0 = x; if (y < L.y0) L.y0 = y; if (x > L.x1) L.x1 = x; if (y > L.y1) L.y1 = y;
      (L.rows[y] = L.rows[y] || []).push(x);
    }
    for (const [k, L] of look.entries()) {
      const D = map.districts[k];
      L.cx = D.cx; L.cy = D.cy;
      // Moiré's two ring centres, a few blocks apart; their rings interfere
      L.m1x = (D.cx - 3) * S; L.m1y = (D.cy - 2) * S; L.m2x = (D.cx + 4) * S; L.m2y = (D.cy + 3) * S;
      // the rows where Vsync tears
      L.tears = {};
      for (let y = L.y0; y <= L.y1; y++) if (h32(y * 131 + k) < 0.14) L.tears[y] = 2 + Math.floor(h32(y * 17 + k) * 4);
    }
    const LOOK0 = look[0];
    const boxes = new Int16Array(map.W * map.H * 4).fill(-1); // where each building actually stands, for the night lights

    // ================================================================ painting the city
    function px(x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
    // a dithered fill: two colours in a 2-pixel checker, the oldest trick for more colours than the screen has
    function dither(X, Y, w, h, a, b, seed) {
      px(X, Y, w, h, a);
      g.fillStyle = b;
      for (let y = 0; y < h; y += 2) for (let x = ((y >> 1) + seed) % 2 * 2; x < w; x += 4) g.fillRect(X + x, Y + y, 2, 2);
    }
    // a lit pixel: a square with a bright top-left edge and a dark bottom-right, like a pixel on an old screen
    function bevel(x, y, w, h, c, depth) {
      if (depth) px(x + depth, y + depth, w, h, 'rgba(0,0,0,0.45)');
      px(x, y, w, h, c);
      px(x, y, w, 1, 'rgba(255,255,255,0.38)'); px(x, y, 1, h, 'rgba(255,255,255,0.22)');
      px(x, y + h - 1, w, 1, 'rgba(0,0,0,0.35)'); px(x + w - 1, y, 1, h, 'rgba(0,0,0,0.25)');
    }
    // a dark panel with a neon rim and a faint glow outside it: the city's standard building shell
    function slab(x, y, w, h, body, rim, glow) {
      if (glow !== false) { px(x - 2, y - 2, w + 4, h + 4, rgba(rim, 0.1)); px(x - 1, y - 1, w + 2, h + 2, rgba(rim, 0.22)); }
      px(x, y, w, h, body);
      px(x, y, w, 1, rim); px(x, y, 1, h, rim); px(x, y + h - 1, w, 1, rgba(rim, 0.5)); px(x + w - 1, y, 1, h, rgba(rim, 0.5));
    }
    function disc(cx, cy, r, c) { for (let y = -r; y <= r; y++) { const w = Math.floor(Math.sqrt(r * r - y * y)); px(cx - w, cy + y, w * 2, 1, c); } }
    function ring(cx, cy, r, c) { for (let y = -r; y <= r; y++) { const w = Math.floor(Math.sqrt(r * r - y * y)); px(cx - w, cy + y, 1, 1, c); px(cx + w - 1, cy + y, 1, 1, c); } px(cx - 1, cy - r, 2, 1, c); px(cx - 1, cy + r, 2, 1, c); }
    // digital ecology: a sprite sprouting from the substrate, and a bloom of colour growth
    function sprout(x, y, c) { px(x + 1, y, 1, 3, c); px(x, y + 1, 3, 1, c); }
    function bloom(x, y, c) { px(x + 2, y, 1, 5, c); px(x, y + 2, 5, 1, c); px(x + 1, y + 1, 3, 3, c); px(x + 2, y + 2, 1, 1, '#FFFFFF'); }
    function marquee(X, Y, W, HH, c) { // a dashed selection border: something here is reserved, or being worked on
      for (let k = 0; k < W; k += 6) { px(X + k, Y, 3, 2, c); px(X + k + 3, Y + HH - 2, 3, 2, c); }
      for (let k = 0; k < HH; k += 6) { px(X, Y + k + 3, 2, 3, c); px(X + W - 2, Y + k, 2, 3, c); }
    }
    const lookAt = (i) => look[map.district[i]] || LOOK0;

    // ---------------------------------------------------------------- the substrate: every district's own physics
    function ground(x, y) {
      const i = y * map.W + x, X = x * S, Y = y * S, L = lookAt(i), v = h32(i * 3 + 1), v2 = h32(i * 5 + 2), v3 = h32(i * 11 + 5);
      px(X, Y, S, S, L.sub);
      px(X, Y, 1, 1, L.dot); // the pitch of the screen: one dot per block
      switch (L.physics) {
        case 'hot': // stuck pixels, permanently at full brightness, and the warmth around them
          if (v < 0.09) { px(X + 3, Y + 3, 10, 10, rgba(L.accent, 0.08)); px(X + 5, Y + 5, 6, 6, rgba(L.accent, 0.2)); px(X + 7, Y + 7, 2, 2, '#FFE6DC'); }
          else if (v < 0.3) px(X + Math.floor(v2 * 14), Y + Math.floor(v3 * 14), 1, 1, L.accent);
          break;
        case 'burn': { // the ghost of a window that stayed on screen too long
          const gx = ((x - L.x0) % 13 + 13) % 13, gy = ((y - L.y0) % 9 + 9) % 9, ghost = rgba(L.accent, 0.12);
          if (gy === 0) px(X, Y + 3, S, 2, ghost);
          if (gx === 0) px(X + 3, Y, 2, S, ghost);
          if (gy === 1 && gx > 1 && gx < 10) px(X, Y + 7, S, 3, rgba(L.accent, 0.07));
          if (gy === 3 && gx > 1 && gx < 7 && v < 0.8) px(X + 2, Y + 6, S - 4, 2, ghost);
          break;
        }
        case 'gamma': { // brightness in steps, rising across the district
          const lv = Math.max(0, Math.min(6, Math.floor(((x - L.x0) + (y - L.y0)) / 7)));
          px(X, Y, S, S, L.ramp[lv]); px(X, Y, 1, 1, L.dot);
          if (v < 0.06) for (let k = 0; k < 7; k++) px(X + 1 + k * 2, Y + 12, 2, 2, L.ramp[k]);
          break;
        }
        case 'dither': { // an ordered Bayer dither, fading in across the district
          const lvl = (x - L.x0) / Math.max(1, L.x1 - L.x0) * 9 + 2;
          for (let yy = 0; yy < S; yy += 2) for (let xx = 0; xx < S; xx += 2) if (BAYER[((Y + yy) >> 1) & 3][((X + xx) >> 1) & 3] < lvl) px(X + xx, Y + yy, 2, 2, L.dim);
          break;
        }
        case 'chroma': // white light split into its three colours
          if (v < 0.07) {
            g.globalCompositeOperation = 'lighter';
            disc(X + 6, Y + 6, 4, 'rgba(255,40,60,0.55)'); disc(X + 10, Y + 6, 4, 'rgba(40,255,110,0.55)'); disc(X + 8, Y + 10, 4, 'rgba(60,110,255,0.6)');
            g.globalCompositeOperation = 'source-over';
          } else if (v < 0.2) { px(X + 4, Y + 8, 2, 1, 'rgba(255,51,85,0.5)'); px(X + 6, Y + 8, 2, 1, 'rgba(61,139,255,0.5)'); }
          break;
        case 'vsync': // scanlines, and now and then a waveform on a test monitor
          for (let yy = 1; yy < S; yy += 3) px(X, Y + yy, S, 1, rgba(L.accent, 0.07));
          if (v < 0.05) for (let k = 0; k < 14; k++) px(X + 1 + k, Y + 8 + WAVE[k % 8], 1, 1, L.accent);
          break;
        case 'moire': // two sets of rings, at slightly different centres; where they disagree, a pixel lights
          for (let yy = 0; yy < S; yy += 2) for (let xx = 0; xx < S; xx += 2) {
            const p = X + xx, q = Y + yy;
            const a = Math.floor(((p - L.m1x) * (p - L.m1x) + (q - L.m1y) * (q - L.m1y)) / 1500) & 1, b = Math.floor(((p - L.m2x) * (p - L.m2x) + (q - L.m2y) * (q - L.m2y)) / 1500) & 1;
            if (a ^ b) px(p, q, 2, 2, L.faint);
          }
          break;
        case 'nibble': { // four bits per block, drawn as four cells
          const bits = Math.floor(v * 16);
          for (let b = 0; b < 4; b++) if ((bits >> b) & 1) px(X + 2 + (b & 1) * 7, Y + 2 + (b >> 1) * 7, 5, 5, rgba(L.accent, 0.08));
          break;
        }
        case 'subpixel': // every surface is three stripes
          for (let xx = 0; xx < S; xx++) px(X + xx, Y, 1, S, ['rgba(255,51,85,0.08)', 'rgba(43,255,136,0.06)', 'rgba(61,139,255,0.12)'][(X + xx) % 3]);
          break;
        case 'aa': { // soft: fine tonal rings, with a half-tone between each step
          const dd = Math.abs(x - L.cx) + Math.abs(y - L.cy), lv = Math.max(0, 6 - Math.floor(dd / 4));
          px(X, Y, S, S, L.ramp[lv]);
          if (dd % 4 === 3 && lv > 0) px(X, Y, S, S, rgba(L.accent, 0.03));
          px(X, Y, 1, 1, L.dot);
          break;
        }
        case 'jaggy': // staircase diagonals, in four-pixel steps
          for (let yy = 0; yy < S; yy += 4) for (let xx = 0; xx < S; xx += 4) {
            const cx = (X + xx) >> 2, cy = (Y + yy) >> 2;
            if (((cx - cy) % 12 + 12) % 12 === 0) px(X + xx, Y + yy, 4, 4, rgba(L.accent, 0.16));
            else if ((cx + cy) % 16 === 0) px(X + xx, Y + yy, 4, 4, rgba(L.accent, 0.07));
          }
          break;
        case 'offbyone': // the grid is one pixel out, and so are the registration marks
          px(X + 1, Y + 1, S - 1, 1, rgba(L.accent, 0.13)); px(X + 1, Y + 1, 1, S - 1, rgba(L.accent, 0.13));
          if (v < 0.1) { px(X + 6, Y + 6, 4, 4, 'rgba(70,214,255,0.35)'); px(X + 7, Y + 7, 4, 4, rgba(L.accent, 0.45)); }
          break;
        case 'bezel': // every block in a frame
          px(X + 1, Y + 1, S - 2, 1, rgba(L.accent, 0.3)); px(X + 1, Y + 1, 1, S - 2, rgba(L.accent, 0.22));
          px(X + 1, Y + S - 2, S - 2, 1, 'rgba(0,0,0,0.5)'); px(X + S - 2, Y + 1, 1, S - 2, 'rgba(0,0,0,0.45)');
          if (v < 0.25) { px(X + 4, Y + 4, 8, 8, rgba(L.accent, 0.12)); px(X + 5, Y + 5, 6, 6, L.sub); }
          break;
        case 'lossless': // crisp: a clean grid, and a checksum dot where one is due
          px(X, Y, S, 1, 'rgba(255,255,255,0.07)'); px(X, Y, 1, S, 'rgba(255,255,255,0.07)');
          if (v < 0.18) px(X + 7, Y + 7, 2, 2, 'rgba(255,255,255,0.4)');
          break;
        case 'dead': // blocks that no longer light, and one or two stuck red
          if (v < 0.12) px(X, Y, S, S, '#000000');
          else if (v2 < 0.03) { px(X + 6, Y + 6, 4, 4, 'rgba(255,42,42,0.25)'); px(X + 7, Y + 7, 2, 2, '#FF2A2A'); }
          else if (v2 < 0.25) px(X + Math.floor(v3 * 14), Y + Math.floor(v * 90) % 14, 2, 2, '#000000');
          break;
        case 'null': // a reference to nothing: the missing-texture checker, or a box with a line through it
          if (v < 0.05) { for (let yy = 0; yy < S; yy += 4) for (let xx = 0; xx < S; xx += 4) px(X + xx, Y + yy, 4, 4, ((xx + yy) / 4) % 2 ? '#000000' : L.dim); }
          else if (v < 0.13) { const c = rgba(L.accent, 0.55); px(X + 3, Y + 3, 10, 1, c); px(X + 3, Y + 12, 10, 1, c); px(X + 3, Y + 3, 1, 10, c); px(X + 12, Y + 3, 1, 10, c); for (let k = 0; k < 10; k++) px(X + 3 + k, Y + 12 - k, 1, 1, c); }
          break;
      }
    }

    // ---------------------------------------------------------------- buildings, and what each district's physics does to them
    function roofs(L, v) {
      if (L.physics === 'nibble') return pick(PAL.cga, v);
      if (L.physics === 'lossless') return pick(['#F4F4F4', '#D9DEE3', '#BFC6CC', '#FFFFFF'], v);
      if (L.physics === 'dead') return pick(['#6E7681', '#4E555E', '#8A929B', '#3A3F46'], v);
      if (L.physics === 'gamma') return mix(pick(L.roofs, v), '#FFFFFF', 0.25);
      if (L.physics === 'subpixel') return pick(PAL.rgb.concat(L.roofs), v);
      return pick(L.roofs, v);
    }
    function before(L, bx, by, bw, bh, i) {
      const v = h32(i * 13 + 7);
      if (L.physics === 'burn') { // the older copy of the building, burned in beside it
        const c = rgba(L.accent, 0.28);
        px(bx + 3, by + 3, bw, 1, c); px(bx + 3, by + 3 + bh - 1, bw, 1, c); px(bx + 3, by + 3, 1, bh, c); px(bx + 3 + bw - 1, by + 3, 1, bh, c);
      } else if (L.physics === 'bezel') { px(bx - 2, by - 2, bw + 4, bh + 4, mix(L.accent, '#000000', 0.45)); px(bx - 2, by - 2, bw + 4, 1, L.light); px(bx - 2, by - 2, 1, bh + 4, rgba(L.accent, 0.8)); }
      else if (L.physics === 'aa') { px(bx - 2, by - 2, bw + 4, bh + 4, rgba(L.accent, 0.07)); px(bx - 1, by - 1, bw + 2, bh + 2, rgba(L.accent, 0.16)); }
      else if (L.physics === 'hot' && v < 0.35) { px(bx - 2, by - 2, bw + 4, bh + 4, rgba(L.accent, 0.16)); }
    }
    function after(L, bx, by, bw, bh, i, ox, oy) {
      const v = h32(i * 13 + 7), v2 = h32(i * 29 + 3);
      switch (L.physics) {
        case 'hot': if (v < 0.35) { px(bx + (bw >> 1) - 1, by + (bh >> 1) - 1, 3, 3, '#FFE6DC'); } break;
        case 'chroma': px(bx - 1, by, 1, bh, 'rgba(255,40,70,0.75)'); px(bx + bw, by + 1, 1, bh, 'rgba(40,190,255,0.75)'); break;
        case 'dither': for (let yy = by + (bh >> 1); yy < by + bh; yy += 2) for (let xx = bx + ((yy >> 1) & 1) * 2; xx < bx + bw; xx += 4) px(xx, yy, 2, 2, 'rgba(0,0,0,0.38)'); break;
        case 'subpixel': for (let xx = 0; xx < bw; xx++) px(bx + xx, by, 1, bh, ['rgba(255,51,85,0.14)', 'rgba(43,255,136,0.1)', 'rgba(61,139,255,0.16)'][(bx + xx) % 3]); break;
        case 'jaggy': { const c = lookSub(i); px(bx, by, 3, 1, c); px(bx, by, 1, 3, c); px(bx + bw - 3, by + bh - 1, 3, 1, c); px(bx + bw - 1, by + bh - 3, 1, 3, c); px(bx + 1, by + 1, 1, 1, c); px(bx + bw - 2, by + bh - 2, 1, 1, c); break; }
        case 'offbyone': if (ox || oy) { const c = rgba(L.accent, 0.7); px(bx - ox, by - oy, bw, 1, c); px(bx - ox, by - oy, 1, bh, c); } break;
        case 'lossless': { const c = 'rgba(255,255,255,0.55)'; px(bx, by, bw, 1, c); px(bx, by, 1, bh, c); px(bx, by + bh - 1, bw, 1, c); px(bx + bw - 1, by, 1, bh, c); break; }
        case 'dead': if (v < 0.22) px(bx + (v2 < 0.5 ? 0 : bw >> 1), by, bw >> 1, bh, '#000000'); else if (v < 0.3) px(bx, by, bw, bh, 'rgba(0,0,0,0.75)'); break;
        case 'null': if (v < 0.07) { for (let yy = 0; yy < bh; yy += 3) for (let xx = 0; xx < bw; xx += 3) px(bx + xx, by + yy, 3, 3, ((xx + yy) / 3) % 2 ? '#000000' : '#C04BD0'); } break;
      }
    }
    const lookSub = (i) => lookAt(i).sub;
    function setBox(i, x, y, w, h) { boxes[i * 4] = x; boxes[i * 4 + 1] = y; boxes[i * 4 + 2] = w; boxes[i * 4 + 3] = h; }
    // one building on one block: shell, physics before and after, and a note of where it stands for the night lights
    function building(x, y, t) {
      const i = y * map.W + x, X = x * S, Y = y * S, L = lookAt(i), v = h32(i), v2 = h32(i + 7919), v3 = h32(i + 104729);
      ground(x, y);
      let ox = 0, oy = 0;
      if (L.physics === 'offbyone' && v3 < 0.7) { ox = v < 0.5 ? 1 : 2; oy = v2 < 0.5 ? 1 : 0; }
      const draw = (bx, by, bw, bh, paint) => { bx += ox; by += oy; before(L, bx, by, bw, bh, i); paint(bx, by); after(L, bx, by, bw, bh, i, ox, oy); setBox(i, bx - X, by - Y, bw, bh); };
      switch (t) {
        case T.HOUSE: { // a cluster of lit pixels
          const c1 = roofs(L, v), c2 = roofs(L, v2), o = 2 + Math.floor(v3 * 3), p = 2 + Math.floor(v * 3);
          if (v2 < 0.5) draw(X + o, Y + p, 10, 10, (bx, by) => { bevel(bx, by, 5, 5, c1, 1); bevel(bx + 5, by, 5, 5, c2, 1); bevel(bx, by + 5, 5, 5, c2, 1); bevel(bx + 5, by + 5, 5, 5, c1, 1); });
          else if (v2 < 0.8) draw(X + o, Y + p, 10, 10, (bx, by) => { bevel(bx, by, 10, 5, c1, 1); bevel(bx, by + 5, 10, 5, c1, 1); px(bx, by + 5, 10, 1, 'rgba(0,0,0,0.3)'); });
          else draw(X + o + 2, Y + p + 2, 6, 6, (bx, by) => { bevel(bx, by, 6, 6, c1, 1); px(bx + 2, by + 2, 2, 2, '#FFFFFF'); });
          if (v3 < 0.18 && L.physics !== 'dead') sprout(X + 1, Y + 11, pick(PAL.growth, v));
          break;
        }
        case T.APARTMENT: // a stack: a dark tower with a grid of status lights, like a rack of memory
          draw(X + 2, Y + 2, 12, 12, (bx, by) => {
            slab(bx, by, 12, 12, '#0B1220', L.accent, false);
            for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) px(bx + 2 + c * 3, by + 2 + r * 3, 2, 2, h32(i * 9 + r * 3 + c) < 0.22 ? L.light : L.dim);
            if (v < 0.4) px(bx + 10, by + 1, 1, 1, '#FF3355');
          });
          break;
        case T.OFFICE: // a processor: a chip with pins down every side
          draw(X + 3, Y + 3, 10, 10, (bx, by) => {
            for (let k = 1; k < 10; k += 2) { px(bx + k, by - 2, 1, 2, '#8FA2B4'); px(bx + k, by + 10, 1, 2, '#8FA2B4'); px(bx - 2, by + k, 2, 1, '#8FA2B4'); px(bx + 10, by + k, 2, 1, '#8FA2B4'); }
            bevel(bx, by, 10, 10, '#161E2C', 0);
            px(bx + 2, by + 2, 6, 6, mix(roofs(L, v), '#0B1220', 0.45)); px(bx + 3, by + 3, 4, 4, roofs(L, v));
            for (let k = 2; k < 8; k += 2) px(bx + 2, by + k, 6, 1, 'rgba(200,235,255,0.14)');
          });
          break;
        case T.SHOP: // a kiosk under an awning of red, green and blue: the three subpixels of every pixel in the city
          draw(X + 2, Y + 2, 12, 12, (bx, by) => {
            bevel(bx, by, 12, 9, mix(roofs(L, v), '#0B1220', 0.3), 1);
            for (let k = 0; k < 12; k++) px(bx + k, by + 9, 1, 3, PAL.rgb[k % 3]);
          });
          break;
        case T.FACTORY: { // industry: what kind depends on the district
          const kinds = ['render', 'foundry', 'refinery', 'compression', 'signal'];
          const kind = v3 < 0.72 ? L.industry : pick(kinds, v);
          draw(X + 1, Y + 1, 14, 14, (bx, by) => industry(kind, bx, by, 14, 14, i, L));
          break;
        }
        case T.WAREHOUSE: // a cache: identical blocks, held until they're needed
          draw(X + 1, Y + 2, 14, 12, (bx, by) => {
            slab(bx, by, 14, 12, '#0D1624', mix(L.accent, '#8FA2B4', 0.5), false);
            for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) { px(bx + 2 + c * 4, by + 2 + r * 5, 3, 3, mix(L.accent, '#0B1220', 0.35)); if (h32(i * 7 + r * 3 + c) < 0.5) px(bx + 2 + c * 4, by + 2 + r * 5, 1, 1, L.light); }
          });
          break;
        case T.DOCK: // the export buffer: blocks waiting to leave the canvas
          px(X, Y, S, S, '#0C1622'); px(X, Y, S, 1, 'rgba(70,214,255,0.25)');
          for (let k = 0; k < 3; k++) for (let j = 0; j < 2; j++) if (h32(i * 31 + k * 3 + j) < 0.75) bevel(X + 1 + j * 7, Y + 1 + k * 5, 6, 4, pick(BOX, h32(i * 37 + k + j * 5)), 0);
          setBox(i, 1, 1, 13, 14);
          break;
      }
    }
    function industry(kind, X, Y, W, HH, seed, L) {
      const v = h32(seed * 3 + 11);
      if (kind === 'render') { // a render plant: a great chip, with heat vents and a cooling fan
        slab(X, Y, W, HH, '#120F1C', '#FF8A3D', false);
        for (let k = 0; k < W - 4; k += 3) px(X + 2 + k, Y + 2, 2, 4, k % 6 ? '#FF6A2B' : '#FFB03B');
        ring(X + W - 5, Y + HH - 5, 3, '#8FA2B4'); px(X + W - 6, Y + HH - 6, 2, 2, '#C9D6E2');
        px(X + 2, Y + HH - 5, 5, 3, mix(L.accent, '#120F1C', 0.3));
      } else if (kind === 'foundry') { // a texture foundry: a furnace of glowing tiles
        slab(X, Y, W, HH, '#1A0C08', '#FF5A1F', false);
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) px(X + 2 + c * 4, Y + 2 + r * 4, 3, 3, pick(['#FF3B1F', '#FF8A1F', '#FFC23F', '#B8361A'], h32(seed * 9 + r * 3 + c)));
        if (v < 0.6) { px(X + W - 4, Y - 1, 3, 4, '#3A2A24'); px(X + W - 4, Y - 1, 3, 1, '#FF8A1F'); }
      } else if (kind === 'refinery') { // a palette refinery: raw colour in, separated swatches out
        slab(X, Y, W, HH, '#0E0E1A', '#E04FFF', false);
        const sw = ['#FF3B6B', '#FF8A1F', '#FFD23F', '#2BFF88', '#1FE3D0', '#3DA9FF', '#7A6CFF', '#E04FFF'];
        for (let k = 0; k < 5; k++) px(X + 2 + k * 2, Y + 2, 2, HH - 7, sw[(k + Math.floor(v * 8)) % 8]);
        disc(X + W - 4, Y + HH - 4, 2, '#F4F4F4'); px(X + 2, Y + HH - 4, W - 8, 1, '#8FA2B4');
      } else if (kind === 'compression') { // a compression facility: blocks squeezed into ever-thinner lines
        slab(X, Y, W, HH, '#0B1420', '#46D6FF', false);
        let yy = Y + 2;
        for (let k = 4; k >= 1 && yy < Y + HH - 2; k--) { px(X + 2, yy, W - 4, k, k > 2 ? mix(L.accent, '#46D6FF', 0.5) : '#46D6FF'); yy += k + 1; }
        px(X + W - 4, Y + HH - 4, 2, 2, '#FFFFFF');
      } else { // a signal processing yard: dishes, and a trace of what they're hearing
        px(X, Y, W, HH, '#08141A'); px(X, Y, W, 1, rgba('#2BFF88', 0.5)); px(X, Y + HH - 1, W, 1, rgba('#2BFF88', 0.3));
        for (let k = 0; k < 3; k++) { ring(X + 3 + k * 4, Y + 4, 2, '#8FA2B4'); px(X + 3 + k * 4, Y + 4, 1, 1, '#2BFF88'); }
        for (let k = 0; k < W - 2; k++) px(X + 1 + k, Y + 10 + (WAVE[(k + Math.floor(v * 8)) % 8] >> 1), 1, 1, '#2BFF88');
      }
    }

    // ---------------------------------------------------------------- infrastructure
    function busEdges(X, Y, x, y, edge, glow) {
      if (!isLine(tile(x, y - 1))) { px(X, Y + 2, S, 1, edge); px(X, Y + 1, S, 1, glow); }
      if (!isLine(tile(x, y + 1))) { px(X, Y + S - 3, S, 1, edge); px(X, Y + S - 2, S, 1, glow); }
      if (!isLine(tile(x - 1, y))) { px(X + 2, Y, 1, S, edge); px(X + 1, Y, 1, S, glow); }
      if (!isLine(tile(x + 1, y))) { px(X + S - 3, Y, 1, S, edge); px(X + S - 2, Y, 1, S, glow); }
    }
    // the bright line where the canvas ends: it emits its own light, so it shines by night too
    function frameEdge(x, y, c, glow) {
      const X = x * S, Y = y * S, sea = (dx, dy) => tile(x + dx, y + dy) === T.SEA;
      if (sea(1, 0)) { px(X + S - 5, Y, 5, S, c); px(X + S - 7, Y, 2, S, glow); }
      if (sea(-1, 0)) { px(X, Y, 5, S, c); px(X + 5, Y, 2, S, glow); }
      if (sea(0, 1)) { px(X, Y + S - 5, S, 5, c); px(X, Y + S - 7, S, 2, glow); }
      if (sea(0, -1)) { px(X, Y, S, 5, c); px(X, Y + 5, S, 2, glow); }
    }
    function paintTile(x, y) {
      const i = y * map.W + x, t = map.tiles[i], X = x * S, Y = y * S, v = h32(i), v2 = h32(i + 7919), v3 = h32(i + 104729);
      const L = lookAt(i);
      switch (t) {
        case T.SEA: { // the blank margin: beyond the frame, nothing has been drawn
          px(X, Y, S, S, PAL.void);
          if ((x + y) % 2 === 0) px(X + 8, Y + 8, 1, 1, '#0D1A2C');
          if (v < 0.025) px(X + Math.floor(v2 * 15), Y + Math.floor(v3 * 15), 1, 1, 'rgba(70,214,255,0.55)');
          // the frame's glow spills a little way out over the margin
          const glow = 'rgba(70,214,255,0.22)';
          if (tile(x - 1, y) === T.BEACH) px(X, Y, 3, S, glow);
          if (tile(x, y - 1) === T.BEACH) px(X, Y, S, 3, glow);
          if (tile(x, y + 1) === T.BEACH) px(X, Y + S - 3, S, 3, glow);
          if (tile(x + 1, y) === T.BEACH) px(X + S - 3, Y, 3, S, glow);
          break;
        }
        case T.RIVER: { // the data stream: a channel of moving light, with bright banks
          px(X, Y, S, S, PAL.stream);
          for (let k = 0; k < 4; k++) if (h32(i * 7 + k) < 0.6) px(X + Math.floor(h32(i * 3 + k) * 12), Y + 2 + k * 3, 2 + Math.floor(h32(i + k) * 4), 1, k % 2 ? PAL.streamB : 'rgba(70,214,255,0.4)');
          const bank = (t2) => !isWater(t2) && t2 !== T.BRIDGE;
          if (bank(tile(x, y - 1))) { px(X, Y, S, 2, PAL.streamEdge); px(X, Y + 2, S, 1, 'rgba(196,247,255,0.35)'); }
          if (bank(tile(x, y + 1))) { px(X, Y + S - 2, S, 2, PAL.streamEdge); px(X, Y + S - 3, S, 1, 'rgba(196,247,255,0.35)'); }
          if (bank(tile(x - 1, y))) px(X, Y, 2, S, PAL.streamEdge);
          if (bank(tile(x + 1, y))) px(X + S - 2, Y, 2, S, PAL.streamEdge);
          break;
        }
        case T.BEACH:
          if (x >= 108 && y >= 50 && y <= 66) { // the quay: a metal export dock along the frame
            px(X, Y, S, S, '#131D2A'); for (let k = 0; k < S; k += 4) px(X, Y + k, S, 1, 'rgba(143,162,180,0.12)');
            if (isWater(tile(x + 1, y))) { px(X + S - 3, Y, 3, S, PAL.margin); px(X + S - 6, Y + 6, 2, 2, '#46D6FF'); }
            break;
          }
          { // the frame border: the edge of the canvas, where everything drawn stops
            const sea = (dx, dy) => tile(x + dx, y + dy) === T.SEA;
            const edge = sea(1, 0) || sea(-1, 0) || sea(0, 1) || sea(0, -1);
            px(X, Y, S, S, '#0B1A26');
            for (let k = 0; k < S; k += 4) px(X + ((k + y * 2) % S), Y + k, 2, 2, 'rgba(70,214,255,0.14)'); // the export boundary's hatch
            if (edge) frameEdge(x, y, PAL.margin, PAL.marginGlow);
          }
          break;
        case T.GRASS: // open substrate, where a sprite now and then sprouts
          ground(x, y);
          if (v < 0.07 && L.physics !== 'dead') sprout(X + 4 + Math.floor(v2 * 8), Y + 4 + Math.floor(v3 * 8), pick(PAL.growth, v3));
          break;
        case T.FOREST: { // the noise field: unrendered, procedural overgrowth
          px(X, Y, S, S, '#04120C');
          if (v < 0.1) { // a patch nobody has rendered yet
            for (let yy = 0; yy < S; yy += 4) for (let xx = 0; xx < S; xx += 4) px(X + xx, Y + yy, 4, 4, ((xx + yy) / 4 + x + y) % 2 ? '#141A24' : '#1E2633');
            break;
          }
          for (let yy = 0; yy < S; yy += 2) for (let xx = 0; xx < S; xx += 2) {
            const n = h32(i * 64 + yy * 8 + (xx >> 1));
            if (n < 0.5) px(X + xx, Y + yy, 2, 2, PAL.noise[Math.floor(n * 12) % PAL.noise.length]);
            else if (n > 0.985) px(X + xx, Y + yy, 2, 2, pick(PAL.growth, h32(n * 1e6)));
          }
          if (v2 < 0.3) bloom(X + 2 + Math.floor(v3 * 9), Y + 2 + Math.floor(v * 9), v2 < 0.1 ? pick(PAL.growth, v) : '#2BD46E'); // a sprite thicket
          break;
        }
        case T.PARK: // colour growth: wild, bright, procedural
          ground(x, y);
          dither(X + 1, Y + 1, S - 2, S - 2, mix(L.sub, '#2BFF88', 0.12), mix(L.sub, '#2BFF88', 0.22), x + y);
          bloom(X + 2 + Math.floor(v * 8), Y + 2 + Math.floor(v2 * 8), pick(PAL.growth, v3));
          if (v3 < 0.5) sprout(X + 10, Y + 11, pick(PAL.growth, v));
          break;
        case T.ROAD: case T.BRIDGE: { // the data bus: a lane of signal, bright at its edges, with a node at every junction
          const horiz = isRoad(tile(x - 1, y)) || isRoad(tile(x + 1, y)), vert = isRoad(tile(x, y - 1)) || isRoad(tile(x, y + 1));
          px(X, Y, S, S, PAL.bus);
          busEdges(X, Y, x, y, PAL.busEdge, PAL.busGlow);
          if (t === T.BRIDGE) { // a jumper over the stream, with its pins
            px(X, Y, 1, S, PAL.streamEdge); px(X + S - 1, Y, 1, S, PAL.streamEdge);
            for (let k = 2; k < S; k += 5) { px(X + 3, Y + k, 2, 2, '#8FA2B4'); px(X + S - 5, Y + k, 2, 2, '#8FA2B4'); }
          }
          if (horiz && !vert) for (let k = 1; k < S; k += 6) px(X + k, Y + 7, 3, 2, PAL.busDash);
          else if (vert && !horiz) for (let k = 1; k < S; k += 6) px(X + 7, Y + k, 2, 3, PAL.busDash);
          else if (horiz && vert && t !== T.BRIDGE) { // a node: where buses cross, the signal is switched
            px(X + 3, Y + 3, 10, 10, 'rgba(31,227,140,0.12)'); px(X + 4, Y + 4, 8, 8, 'rgba(31,227,140,0.28)'); px(X + 5, Y + 5, 6, 6, PAL.busEdge); px(X + 6, Y + 6, 4, 4, PAL.node);
            for (const [cx, cy] of [[1, 1], [S - 3, 1], [1, S - 3], [S - 3, S - 3]]) px(X + cx, Y + cy, 2, 2, PAL.busEdge);
          }
          break;
        }
        case T.STREET: { // a signal trace: a thin line from junction to junction, with a pad where it branches
          ground(x, y);
          const n = isLine(tile(x, y - 1)), s = isLine(tile(x, y + 1)), w = isLine(tile(x - 1, y)), e = isLine(tile(x + 1, y));
          const arms = n + s + w + e, c = mix(PAL.trace, L.accent, 0.25);
          if (n) px(X + 7, Y, 2, 9, c); if (s) px(X + 7, Y + 7, 2, 9, c);
          if (w) px(X, Y + 7, 9, 2, c); if (e) px(X + 7, Y + 7, 9, 2, c);
          if (arms >= 3 || arms <= 1) { px(X + 5, Y + 5, 6, 6, c); px(X + 6, Y + 6, 4, 4, PAL.sub); px(X + 7, Y + 7, 2, 2, PAL.pad); }
          if (v3 < 0.1) px(X + 7, Y + 7, 2, 2, '#FFFFFF'); // a test point, lit
          break;
        }
        case T.PLAZA: {
          // a chessboard of light and dark, and in each district's square, a monument: one great pixel in the colour
          // of the pixel the district is named after
          for (let yy = 0; yy < S; yy += 4) for (let xx = 0; xx < S; xx += 4) px(X + xx, Y + yy, 4, 4, ((xx + yy) / 4 + x + y) % 2 ? L.sub2 : mix(L.sub, '#FFFFFF', 0.08));
          const q = squareAt[(x - 1) + ',' + (y - 1)];
          if (q) { const c = PIXEL_COLOR[map.districts[q.district].name] || '#F3F6F7'; px(X - 2, Y - 2, 20, 20, rgba(c, 0.12)); px(X + 1, Y + 1, 14, 14, rgba(c, 0.25)); bevel(X + 4, Y + 3, 8, 8, c, 2); if (look[q.district].physics === 'dead') px(X + 7, Y + 6, 2, 2, '#FF2A2A'); }
          break;
        }
        case T.HOUSE: case T.APARTMENT: case T.OFFICE: case T.SHOP: case T.FACTORY: case T.WAREHOUSE: case T.DOCK:
          building(x, y, t);
          break;
        default:
          ground(x, y);
      }
    }
    function asTile(x, y, type) { const i = y * map.W + x, save = map.tiles[i]; map.tiles[i] = type; paintTile(x, y); map.tiles[i] = save; }
    function fillAs(f, type) { for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) asTile(x, y, type); }
    function groundAs(f) { for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) ground(x, y); }
    function sign(X, Y, W, text) { // a small dark sign with a pixel pattern for lettering
      px(X, Y, W, 7, '#050A12'); px(X, Y, W, 1, 'rgba(242,208,36,0.5)');
      for (let k = 0; k < Math.min(text.length, Math.floor((W - 4) / 3)); k++) if (text[k] !== ' ') px(X + 2 + k * 3, Y + 2 + (h32(text.charCodeAt(k)) < 0.5 ? 0 : 1), 2, 2, '#F2D024');
    }
    const stillPlanned = (f, t) => (C.isPlanned ? C.isPlanned(f, t) : !!f.planned);

    // ---------------------------------------------------------------- landmarks and reserved sites
    function paintFeature(f, site, night, t) {
      const X = f.x * S, Y = f.y * S, W = f.w * S, HH = f.h * S;
      const L = look[f.district] || LOOK0;
      if (f.kind === 'landmark') {
        if (stillPlanned(f, t)) {
          // a plot for a building still to come: reserved memory, marked out, with a sign
          groundAs(f);
          px(X + 2, Y + 2, W - 4, HH - 4, 'rgba(5,10,18,0.75)');
          for (let yy = 8; yy < HH - 8; yy += 8) for (let xx = 8; xx < W - 8; xx += 8) px(X + xx, Y + yy, 1, 1, 'rgba(242,208,36,0.45)');
          marquee(X + 1, Y + 1, W - 2, HH - 2, '#F2C230');
          sign(X + 6, Y + 6, Math.min(W - 12, 40), f.name.replace(/^The /, ''));
          return;
        }
        groundAs(f);
        switch (f.type) {
          case 'senate': { // the chamber: a pale dome over a colonnade of light
            slab(X + 3, Y + 8, W - 6, HH - 12, '#141A2E', '#E6E1FF');
            for (let k = 0; k < 9; k++) { px(X + 8 + k * 11, Y + HH - 14, 4, 8, '#D9D4FF'); px(X + 8 + k * 11, Y + HH - 14, 4, 1, '#FFFFFF'); }
            disc(X + W / 2, Y + 30, 17, 'rgba(230,225,255,0.15)'); disc(X + W / 2, Y + 30, 15, '#2A3358'); disc(X + W / 2, Y + 30, 11, '#5A68A8'); disc(X + W / 2, Y + 30, 6, '#C9D0FF'); disc(X + W / 2 - 3, Y + 27, 2, '#FFFFFF');
            px(X + W / 2, Y + 1, 1, 12, '#C9D0FF'); px(X + W / 2 + 1, Y + 1, 7, 4, '#2BFF88');
            break;
          }
          case 'stadium':
            slab(X + 2, Y + 2, W - 4, HH - 4, '#0E1522', '#46D6FF');
            for (let k = 0; k < (W - 16) / 3; k++) { px(X + 8 + k * 3, Y + 7, 2, 4, pick(PAL.rgb, h32(k))); px(X + 8 + k * 3, Y + HH - 11, 2, 4, pick(PAL.rgb, h32(k + 50))); }
            px(X + 14, Y + 16, W - 28, HH - 32, '#02060B'); // the screen the race is run across
            for (let k = 0; k < W - 28; k += 2) px(X + 14 + k, Y + 16, 1, HH - 32, 'rgba(255,255,255,0.03)');
            px(X + 18, Y + HH / 2 - 14, W - 40, 1, 'rgba(255,255,255,0.25)'); px(X + 18, Y + HH / 2 + 14, W - 40, 1, 'rgba(255,255,255,0.25)');
            for (let k = 0; k < 8; k++) px(X + W - 26, Y + 22 + k * 4, 2, 2, k % 2 ? '#F2F2F2' : '#14212A');
            for (const [cx, cy] of [[X + 2, Y + 2], [X + W - 8, Y + 2], [X + 2, Y + HH - 8], [X + W - 8, Y + HH - 8]]) { px(cx, cy, 6, 6, '#1E2A3A'); px(cx + 1, cy + 1, 4, 4, night ? '#FFFFFF' : '#9FB4C8'); }
            break;
          case 'bureau': // a radar dish, sweeping
            slab(X + 4, Y + 4, W - 8, HH - 8, '#0E1828', '#7FB8E8');
            disc(X + W / 2, Y + HH / 2, 10, 'rgba(127,184,232,0.25)'); ring(X + W / 2, Y + HH / 2, 9, '#C9E4FF'); disc(X + W / 2, Y + HH / 2, 3, '#46D6FF');
            px(X + W - 12, Y + 8, 3, 3, '#FF8A3D');
            break;
          case 'bookmaker':
            slab(X + 2, Y + 3, W - 4, HH - 8, '#1E0E1A', '#FFD23F');
            px(X + 6, Y + 8, W - 12, 12, '#02060B'); // the odds board
            for (let k = 0; k < 6; k++) px(X + 9 + k * 7, Y + 11, 5, 6, k % 2 ? '#FFD23F' : '#2BFF88');
            for (let k = 0; k < W - 4; k += 4) px(X + 2 + k, Y + HH - 5, 2, 3, k % 8 ? '#F2F2F2' : '#2BFF88');
            break;
          case 'press':
            slab(X + 2, Y + 2, W - 4, HH - 4, '#121822', '#F4F4F4');
            px(X + 6, Y + 6, W - 12, 7, '#02060B'); // the masthead, in pixels
            for (let k = 0; k < (W - 16) / 3; k++) if (h32(k * 7 + 3) < 0.7) px(X + 8 + k * 3, Y + 8, 2, 3, '#F3F6F7');
            for (let k = 0; k < 4; k++) { px(X + 8 + k * 12, Y + 20, 8, 18, '#1E2633'); for (let r = 0; r < 5; r++) px(X + 9 + k * 12, Y + 22 + r * 3, 6, 1, 'rgba(244,244,244,0.35)'); }
            break;
          case 'museum': {
            slab(X + 4, Y + 6, W - 8, HH - 12, '#16141E', '#E6D3A0');
            for (let k = 0; k < 8; k++) px(X + 10 + k * 10, Y + HH - 12, 4, 8, '#E6D3A0');
            // the collection's emblem on the roof: a great frame holding a single pixel
            const fx = X + W / 2 - 14, fy = Y + 12;
            px(fx, fy, 28, 24, '#B08D4C'); px(fx + 3, fy + 3, 22, 18, '#05080F'); px(fx + 7, fy + 5, 14, 14, 'rgba(255,95,162,0.2)'); bevel(fx + 10, fy + 8, 8, 8, '#FF5FA2', 0);
            break;
          }
          case 'census': { // the files: one small square for every street in the city
            slab(X + 2, Y + 2, W - 4, HH - 4, '#0E1624', '#9FB4C8');
            for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) px(X + 6 + c * 6, Y + 8 + r * 7, 4, 4, pick(PAL.neon, h32(r * 9 + c)));
            break;
          }
          case 'radio': {
            slab(X + 3, Y + 6, W - 6, HH - 10, '#0B1220', '#9BE22D');
            px(X + 8, Y + 14, W - 16, HH - 26, '#02060B'); // the roof is a speaker
            px(X + W - 14, Y + 2, 3, HH - 8, '#9FB4C8'); // the mast
            for (let k = 0; k < 5; k++) px(X + W - 17, Y + 6 + k * 9, 9, 1, '#9FB4C8');
            break;
          }
          case 'observatory': {
            slab(X + 4, Y + 4, W - 8, HH - 8, '#0E1424', '#B9A6FF');
            disc(X + W / 2, Y + HH / 2, 26, '#2A3358'); disc(X + W / 2, Y + HH / 2, 23, '#46508A'); disc(X + W / 2 - 6, Y + HH / 2 - 6, 8, '#8E9AE0');
            px(X + W / 2 - 3, Y + HH / 2 - 24, 6, 24, '#02060B'); // the slit in the dome
            for (let k = 0; k < 6; k++) px(X + 8 + Math.floor(h32(k * 5) * (W - 16)), Y + 8 + Math.floor(h32(k * 9) * (HH - 16)), 1, 1, '#FFFFFF');
            break;
          }
          case 'school': {
            // Pixel High: the main building around a courtyard, a running track round the playing field, and the
            // school's crest, four great pixels in red, green, blue and alpha, on the roof
            const bw = Math.floor(W * 0.46);
            slab(X + 4, Y + 4, bw, 16, '#141C2C', '#C9D6E2', false); slab(X + 4, Y + HH - 20, bw, 16, '#141C2C', '#C9D6E2', false); slab(X + 4, Y + 4, 16, HH - 8, '#141C2C', '#C9D6E2', false);
            px(X + 22, Y + 22, bw - 20, HH - 44, '#0E1420');
            for (let k = 0; k < bw - 10; k += 6) { px(X + 8 + k, Y + 8, 3, 3, '#46D6FF'); px(X + 8 + k, Y + HH - 16, 3, 3, '#46D6FF'); }
            const cx = X + 26, cy = Y + 26, cs = 9;
            bevel(cx, cy, cs, cs, '#FF3355', 1); bevel(cx + cs + 1, cy, cs, cs, '#2BFF88', 1); bevel(cx, cy + cs + 1, cs, cs, '#3D8BFF', 1); bevel(cx + cs + 1, cy + cs + 1, cs, cs, '#B9C3CA', 1);
            const fx0 = X + bw + 12, fw = W - bw - 16, fy0 = Y + 6, fh = HH - 12;
            px(fx0, fy0, fw, fh, '#1A0E22');
            for (let k = 3; k < 10; k += 3) { const c = 'rgba(255,95,162,0.75)'; px(fx0 + k, fy0 + k, fw - 2 * k, 1, c); px(fx0 + k, fy0 + fh - k - 1, fw - 2 * k, 1, c); px(fx0 + k, fy0 + k, 1, fh - 2 * k, c); px(fx0 + fw - k - 1, fy0 + k, 1, fh - 2 * k, c); }
            dither(fx0 + 11, fy0 + 11, fw - 22, fh - 22, '#0E3A26', '#125A36', 3);
            px(fx0 + fw / 2, fy0 + 11, 1, fh - 22, 'rgba(255,255,255,0.6)');
            ['#FF3355', '#2BFF88', '#3D8BFF', '#B9C3CA'].forEach((c, k) => { px(X + bw + 4, Y + 10 + k * 16, 1, 10, '#9FB4C8'); px(X + bw + 5, Y + 10 + k * 16, 5, 4, c); });
            break;
          }
          case 'bank': { // the Bank of Pixel City: a vault door between gold columns
            slab(X + 2, Y + 3, W - 4, HH - 6, '#14121C', '#F2C230');
            for (let k = 0; k < 6; k++) { px(X + 6 + k * 13, Y + 8, 4, HH - 18, '#B08D2C'); px(X + 6 + k * 13, Y + 8, 4, 1, '#FFE07A'); }
            disc(X + W / 2, Y + HH / 2, 12, '#6E5A1E'); disc(X + W / 2, Y + HH / 2, 10, '#2A2418'); ring(X + W / 2, Y + HH / 2, 8, '#F2C230');
            px(X + W / 2 - 6, Y + HH / 2, 12, 1, '#F2C230'); px(X + W / 2, Y + HH / 2 - 6, 1, 12, '#F2C230'); disc(X + W / 2, Y + HH / 2, 2, '#FFE07A');
            break;
          }
          case 'jobs': {
            // the Job Centre: a plain office, a noticeboard of vacancy cards on the wall, and a rail for the queue
            slab(X + 3, Y + 3, W - 6, HH - 12, '#121A26', '#9FB4C8');
            px(X + 8, Y + 8, W - 16, 18, '#02060B');
            for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) if (h32(r * 8 + c + 77) < 0.8) px(X + 10 + c * 6, Y + 10 + r * 5, 4, 3, pick(['#F2D024', '#F3F6F7', '#9BE22D', '#FF9F7A'], h32(r * 11 + c)));
            for (let k = 0; k < W - 6; k += 4) px(X + 3 + k, Y + HH - 5, 2, 2, '#46D6FF');
            px(X + 3, Y + HH - 4, W - 6, 1, '#4E6A84');
            break;
          }
          case 'gas': // two gas peakers: tanks of stored heat, ringed in warning orange
            px(X + 1, Y + 1, W - 2, HH - 2, '#0C1420');
            ring(X + 14, Y + 20, 11, '#FF8A3D'); disc(X + 13, Y + 19, 9, '#1E2A3A'); disc(X + 13, Y + 19, 5, '#46D6FF');
            ring(X + 44, Y + 20, 11, '#FF8A3D'); disc(X + 43, Y + 19, 9, '#1E2A3A'); disc(X + 43, Y + 19, 5, '#46D6FF');
            px(X + 24, Y + 18, 10, 2, '#9FB4C8');
            break;
          case 'port': // the export terminal: blocks stacked at the edge of the canvas, and the gantries that move them
            px(X, Y, W, HH, '#0C1622');
            for (let k = 0; k < 10; k++) for (let j = 0; j < 3; j++) if (h32(k * 13 + j) < 0.75) bevel(X + 4 + j * 14, Y + 6 + k * 12, 12, 8, pick(BOX, h32(k * 7 + j * 3)), 0);
            for (let k = 0; k < 3; k++) { const cy = Y + 14 + k * 40; px(X + W - 10, cy, 3, 26, '#F2C230'); px(X + W - 22, cy, 24, 3, '#F2C230'); px(X + W - 22, cy + 22, 24, 3, '#D4A82A'); }
            break;
          default:
            slab(X + 3, Y + 3, W - 6, HH - 6, '#121A26', L.accent);
        }
        return;
      }
      const st = site.state;
      if (st === 'empty') {
        if (f.type === 'wildlife') fillAs(f, T.FOREST);
        else if (f.type === 'coal') { groundAs(f); px(X + 1, Y + 1, W - 2, HH - 2, 'rgba(5,10,18,0.6)'); for (let k = 0; k < W; k += 4) { px(X + k, Y, 2, 1, '#4E6A84'); px(X + k, Y + HH - 1, 2, 1, '#4E6A84'); } }
        else fillAs(f, T.GRASS);
        return;
      }
      if (st === 'building' || st === 'clearing') {
        groundAs(f);
        px(X + 1, Y + 1, W - 2, HH - 2, 'rgba(3,6,13,0.7)');
        if (st === 'building') { // being rendered: a wireframe, filling in
          for (let k = 6; k < W - 4; k += 6) px(X + k, Y + 4, 1, HH - 8, 'rgba(70,214,255,0.35)');
          for (let k = 6; k < HH - 4; k += 6) px(X + 4, Y + k, W - 8, 1, 'rgba(70,214,255,0.35)');
          for (let yy = 6; yy < HH / 2; yy += 6) for (let xx = 6; xx < W - 6; xx += 6) if (h32(f.id * 97 + xx * 3 + yy) < 0.7) px(X + xx + 1, Y + yy + 1, 5, 5, 'rgba(70,214,255,0.25)');
          marquee(X, Y, W, HH, '#46D6FF');
          px(X + 4, Y + HH - 6, W - 8, 2, '#0D1A2C'); px(X + 4, Y + HH - 6, Math.floor((W - 8) * (0.25 + h32(f.id) * 0.5)), 2, '#2BFF88'); // a progress bar
        } else { // being deallocated: fragments, coming loose
          for (let k = 0; k < 18; k++) px(X + 4 + Math.floor(h32(f.id * 50 + k) * (W - 12)), Y + 6 + Math.floor(h32(f.id * 70 + k) * (HH - 14)), 4 + (k % 3) * 2, 3, pick(['#3A2A34', '#5A3A44', '#2A2E3A', '#FF3B6B'], h32(k)));
          marquee(X, Y, W, HH, '#FF3B6B');
        }
        return;
      }
      if (f.type === 'coal') { // a coal plant: a furnace that renders heat, and the stacks it breathes through
        groundAs(f);
        slab(X + 2, Y + 22, W - 4, HH - 26, '#1A0E0A', '#FF6A2B');
        for (let k = 0; k < (W - 12) / 5; k++) px(X + 6 + k * 5, Y + 27, 3, HH - 36, k % 2 ? '#B8361A' : '#FF6A2B');
        disc(X + 18, Y + 14, 9, 'rgba(255,106,43,0.18)'); disc(X + 18, Y + 14, 7, '#2A1A14'); disc(X + 18, Y + 14, 4, '#FF8A3D');
        disc(X + 42, Y + 14, 9, 'rgba(255,106,43,0.18)'); disc(X + 42, Y + 14, 7, '#2A1A14'); disc(X + 42, Y + 14, 4, '#FF8A3D');
        for (let k = 0; k < 6; k++) disc(X + W - 14 + (k % 2) * 4, Y + 30 + Math.floor(k / 2) * 6, 4, '#05070A'); // the coal: pure black pixels
        if (night) for (let k = 0; k < 6; k++) px(X + 10 + k * 10, Y + HH - 8, 2, 2, '#FFC23F');
      } else if (f.type === 'solar') { // photodiode arrays: grids of tiny blue cells, catching what light there is
        groundAs(f);
        for (let y = 3; y < HH - 4; y += 9) for (let x = 3; x < W - 4; x += 12) { px(X + x, Y + y, 10, 6, '#0E2A5C'); for (let k = 0; k < 10; k += 2) px(X + x + k, Y + y, 1, 6, '#1B4A9A'); px(X + x, Y + y, 10, 1, '#7FD0FF'); }
      } else if (f.type === 'wind') { // a fan array: housings for the fans, which turn with the wind (drawn every frame)
        groundAs(f);
        px(X + 2, Y + 2, W - 4, HH - 4, 'rgba(5,10,18,0.8)');
        for (let k = 0; k < 3; k++) { const cx = X + W / 2, cy = Y + (1 + k * 2) * S; ring(cx, cy, 12, '#4E6A84'); ring(cx, cy, 10, '#1E2A3A'); disc(cx, cy, 2, '#9FB4C8'); }
      } else if (f.type === 'park') { // a garden of colour growth, with a coolant pool and traces for paths
        groundAs(f);
        dither(X + 1, Y + 1, W - 2, HH - 2, mix(L.sub, '#2BFF88', 0.12), mix(L.sub, '#2BFF88', 0.2), f.id);
        px(X, Y + HH / 2 - 1, W, 2, mix(PAL.trace, '#FFFFFF', 0.2)); px(X + W / 2 - 1, Y, 2, HH, mix(PAL.trace, '#FFFFFF', 0.2));
        disc(X + W / 2 + 12, Y + HH / 2 + 14, 8, PAL.streamEdge); disc(X + W / 2 + 12, Y + HH / 2 + 14, 6, PAL.stream); disc(X + W / 2 + 10, Y + HH / 2 + 12, 2, PAL.streamHi);
        for (let k = 0; k < 11; k++) bloom(X + 4 + Math.floor(h32(f.id * 9 + k) * (W - 12)), Y + 4 + Math.floor(h32(f.id * 11 + k) * (HH - 12)), pick(PAL.growth, h32(f.id * 13 + k)));
        for (let k = 0; k < 3; k++) px(X + 6 + k * 3, Y + 6, 2, 6, PAL.rgb[k]); // a bed of red, green and blue
      } else if (f.type === 'wildlife') { // a sprite thicket: unrendered, fenced off, left to grow
        fillAs(f, T.FOREST);
        for (let k = 0; k < W; k += 4) { px(X + k, Y, 2, 2, '#46D6FF'); px(X + k, Y + HH - 2, 2, 2, '#46D6FF'); }
        for (let k = 0; k < HH; k += 4) { px(X, Y + k, 2, 2, '#46D6FF'); px(X + W - 2, Y + k, 2, 2, '#46D6FF'); }
        disc(X + W / 2, Y + HH / 2, 7, PAL.streamEdge); disc(X + W / 2, Y + HH / 2, 5, PAL.stream);
        for (let k = 0; k < 6; k++) bloom(X + 6 + Math.floor(h32(f.id * 19 + k) * (W - 16)), Y + 6 + Math.floor(h32(f.id * 23 + k) * (HH - 16)), pick(PAL.growth, h32(f.id + k)));
      }
    }

    // Vsync tears: a row of the district slips sideways and is drawn again
    function tear() {
      for (const L of look) {
        if (L.physics !== 'vsync') continue;
        for (const y in L.tears) {
          const xs = L.rows[y]; if (!xs) continue;
          const shift = L.tears[y], Y = +y * S + 5;
          for (const x of xs) { if (map.owner[+y * map.W + x] >= 0) continue; g.drawImage(world, x * S, Y, S, 5, x * S + shift, Y, S, 5); }
          px(xs[0] * S, Y, (xs[xs.length - 1] - xs[0] + 1) * S, 1, rgba(L.accent, 0.5));
        }
      }
    }

    const LIT = { [T.HOUSE]: 0.45, [T.APARTMENT]: 0.75, [T.SHOP]: 0.6, [T.OFFICE]: 0.6, [T.FACTORY]: 0.35, [T.WAREHOUSE]: 0.25 };
    function paintWorld(state, light) {
      const night = light < 0.5, dark = new Set(state.dark || []);
      for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) if (map.owner[y * map.W + x] < 0) paintTile(x, y);
      for (const f of map.features) paintFeature(f, f.kind === 'site' ? state.sites[siteIndex[f.id]] : null, night, state.time);
      tear();
      // night on a screen is the backlight dimming; what emits its own light keeps shining
      if (light < 1) { g.fillStyle = 'rgba(1,3,10,' + ((1 - light) * 0.5).toFixed(3) + ')'; g.fillRect(0, 0, world.width, world.height); }
      if (night) {
        for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) {
          const i = y * map.W + x, t = map.tiles[i], p = LIT[t];
          if (map.owner[i] >= 0 || dark.has(map.district[i])) continue;
          const X = x * S, Y = y * S;
          if (t === T.ROAD || t === T.BRIDGE) { busEdges(X, Y, x, y, 'rgba(31,227,140,0.65)', 'rgba(31,227,140,0.12)'); continue; }
          if (t === T.RIVER) { px(X, Y + 7, S, 2, 'rgba(70,214,255,0.25)'); continue; }
          if (t === T.BEACH && !(x >= 108 && y >= 50 && y <= 66)) { frameEdge(x, y, 'rgba(234,251,255,0.9)', 'rgba(70,214,255,0.8)'); continue; }
          if (t === T.STREET && h32(i + 3) < 0.3) { px(X + 7, Y + 7, 2, 2, PAL.pad); continue; }
          if (!p || boxes[i * 4] < 0) continue;
          const L = lookAt(i), bx = X + boxes[i * 4], by = Y + boxes[i * 4 + 1], bw = boxes[i * 4 + 2], bh = boxes[i * 4 + 3];
          if (L.physics === 'dead' && h32(i * 13 + 7) < 0.3) continue; // dead blocks stay dark
          for (let k = 0; k < 6; k++) if (h32(i * 6 + k) < p) px(bx + 1 + Math.floor(h32(i * 17 + k) * (bw - 3)), by + 1 + Math.floor(h32(i * 19 + k) * (bh - 3)), 2, 2, h32(i + k) < 0.7 ? L.light : '#FFFFFF');
        }
        // the monuments in the squares glow at night
        for (const q of map.squares || []) { const c = PIXEL_COLOR[map.districts[q.district].name] || '#F3F6F7'; px((q.x + 1) * S, (q.y + 1) * S - 3, 16, 16, rgba(c, 0.25)); px((q.x + 1) * S + 4, (q.y + 1) * S + 3, 8, 8, c); if (look[q.district].physics === 'dead') px((q.x + 1) * S + 7, (q.y + 1) * S + 6, 2, 2, '#FF2A2A'); }
      }
      // a district in blackout has lost its signal
      if (dark.size) {
        for (let i = 0; i < map.tiles.length; i++) if (dark.has(map.district[i])) {
          const X = (i % map.W) * S, Y = Math.floor(i / map.W) * S;
          px(X, Y, S, S, 'rgba(0,0,4,0.62)');
          if (h32(i * 7 + 1) < 0.2) px(X + Math.floor(h32(i) * 14), Y + Math.floor(h32(i + 1) * 14), 2, 1, 'rgba(160,170,190,0.25)');
        }
      }
    }
    function ensureWorld(state, light) {
      const key = Math.round(light * 8) + '|' + (state.dark || []).join(',') + '|' + state.sites.map((s) => s.state[0]).join('') + '|' + map.features.filter((f) => f.planned).map((f) => (stillPlanned(f, state.time) ? 'p' : 'o')).join('');
      if (key !== worldKey) { paintWorld(state, light); worldKey = key; }
    }

    // the moving parts that belong to the ground: river tiles for the data stream, and the hot pixels that flicker
    const streamTiles = [], hotSpots = [];
    for (let i = 0; i < map.tiles.length; i++) {
      if (map.tiles[i] === T.RIVER) streamTiles.push(i);
      const L = look[map.district[i]];
      if (L && L.physics === 'hot' && map.owner[i] < 0 && map.tiles[i] === T.GRASS && h32(i * 3 + 1) < 0.09) hotSpots.push(i);
    }

    // ================================================================ the camera
    function resize() {
      const r = canvas.getBoundingClientRect();
      cw = Math.max(200, r.width); ch = Math.max(200, r.height);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
      clampCam();
    }
    function fit() { cam.z = cw / map.W; cam.x = map.W / 2; cam.y = map.H / 2; clampCam(); }
    function clampCam() {
      cam.z = Math.max(cw / map.W, Math.min(48, cam.z));
      const hw = cw / 2 / cam.z, hh = ch / 2 / cam.z;
      cam.x = map.W <= 2 * hw ? map.W / 2 : Math.max(hw, Math.min(map.W - hw, cam.x));
      cam.y = map.H <= 2 * hh ? map.H / 2 : Math.max(hh, Math.min(map.H - hh, cam.y));
    }
    const sx = (x) => (x - cam.x) * cam.z + cw / 2, sy = (y) => (y - cam.y) * cam.z + ch / 2;
    const tileAt = (pxX, pxY) => ({ x: Math.floor((pxX - cw / 2) / cam.z + cam.x), y: Math.floor((pxY - ch / 2) / cam.z + cam.y) });

    // ================================================================ the residents
    const L = U.life, K = U.census;
    const colours = new Map();
    const colourOf = (id) => { let c = colours.get(id); if (!c) { try { c = K.summary(id, Date.now()).color; } catch (e) { c = '#F3F6F7'; } colours.set(id, c); if (colours.size > 30000) colours.clear(); } return c; };
    let shown = [];
    function drawPeople(t, light) {
      shown = [];
      if (!L || !L.ready()) return;
      const z = cam.z, vx = cam.x - cw / 2 / z, vy = cam.y - ch / 2 / z;
      let people;
      try { people = L.peopleAt(t, { x0: vx - 1, y0: vy - 1, x1: vx + cw / z + 1, y1: vy + ch / z + 1 }); } catch (e) { return; }
      const size = Math.max(1.6, Math.min(z * 0.32, 7));
      const step = performance.now() / 160;
      for (const p of people) {
        const jitter = ((p.id.charCodeAt(p.id.length - 1) * 7 + p.id.length * 3) % 10) / 10;
        // standing still, people shift their weight; walking, they bob
        const dx = p.moving ? 0 : (reduce ? 0 : Math.sin(step / 3 + jitter * 6) * 0.04) + (jitter - 0.5) * 0.35, dy = p.moving && !reduce ? Math.sin(step + jitter * 6) * 0.03 : (((jitter * 13) % 1) - 0.5) * 0.35;
        const X = sx(p.x + dx) - size / 2, Y = sy(p.y + dy) - size / 2;
        if (z >= 6) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(X + size * 0.25, Y + size * 0.3, size, size); }
        ctx.fillStyle = colourOf(p.id);
        ctx.fillRect(X, Y, size, size);
        if (light < 0.5 && z >= 8) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(X, Y, size, Math.max(1, size * 0.25)); }
        shown.push({ p, x: X + size / 2, y: Y + size / 2 });
      }
      if (hoverPerson) {
        const h = shown.filter((s) => s.p.id === hoverPerson.id)[0];
        if (h) { ctx.strokeStyle = '#FFD25A'; ctx.lineWidth = 2; ctx.strokeRect(h.x - size / 2 - 3, h.y - size / 2 - 3, size + 6, size + 6); hoverPerson.x = h.x; hoverPerson.y = h.y; hoverPerson.label = h.p.label; placeTip(); }
        else hideTip();
      }
    }
    // the tooltip: who they are and what they're doing
    const tip = document.createElement('div');
    tip.setAttribute('role', 'tooltip');
    tip.style.cssText = 'position:absolute;z-index:5;pointer-events:none;display:none;max-width:240px;background:#0E171C;color:#E1E9EC;border:1px solid #2C3A42;border-radius:6px;padding:7px 10px;font:500 13px/1.35 var(--body,"IBM Plex Sans",system-ui,sans-serif);box-shadow:0 6px 18px rgba(0,0,0,.35)';
    const host = canvas.parentElement;
    if (host && getComputedStyle(host).position === 'static') host.style.position = 'relative';
    if (host) host.appendChild(tip);
    function placeTip() {
      if (!hoverPerson || !host) return;
      const s = hoverPerson.info;
      tip.innerHTML = '<b style="display:flex;align-items:center;gap:6px;font-size:14px"><span style="width:9px;height:9px;background:' + s.color + ';display:inline-block"></span>' + escapeHtml(s.name) + '</b>' +
        '<span style="color:#A9B8C0">' + s.age + ', ' + escapeHtml(s.districtName) + '</span><br>' + escapeHtml(hoverPerson.label) + '.<br><span style="color:#8496A0;font-size:12px">Click for their census file</span>';
      tip.style.display = 'block';
      const r = canvas.getBoundingClientRect(), hr = host.getBoundingClientRect();
      let left = r.left - hr.left + hoverPerson.x + 14, top = r.top - hr.top + hoverPerson.y + 14;
      if (left + 250 > hr.width) left = r.left - hr.left + hoverPerson.x - 250;
      if (top + 100 > hr.height) top = r.top - hr.top + hoverPerson.y - 96;
      tip.style.left = left + 'px'; tip.style.top = top + 'px';
    }
    function hideTip() { tip.style.display = 'none'; hoverPerson = null; }
    const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    function personAt(p) {
      let best = null, bd = 64;
      for (const s of shown) { const d = (s.x - p.x) * (s.x - p.x) + (s.y - p.y) * (s.y - p.y); if (d < bd) { bd = d; best = s; } }
      return best;
    }

    // ================================================================ every frame
    const cars = [];
    let lastNow = performance.now(), lastT = Date.now();
    function shipPath(s) {
      const b = map.berths[s.berth % map.berths.length] || map.berths[0];
      const lane = (s.berth - 2.5) * 0.9;
      const berth = { x: b.x + 2.6, y: b.y + 0.5 }, mouth = { x: map.mouth.x, y: map.mouth.y + lane }, entry = { x: b.x + 9, y: map.mouth.y + lane };
      const p = s.phase === 'berthed' ? 1 : s.phase === 'arriving' ? s.progress : 1 - s.progress;
      const lerp = (a, c, k) => ({ x: a.x + (c.x - a.x) * k, y: a.y + (c.y - a.y) * k });
      return { pos: p < 0.7 ? lerp(mouth, entry, p / 0.7) : lerp(entry, berth, (p - 0.7) / 0.3), moving: s.phase !== 'berthed' };
    }
    const shipLen = (s) => (s.type === 'ferry' ? 2.2 : s.type === 'tanker' ? 4.2 : s.type === 'bulk' ? 4.8 : 5.2);
    // ships are packets of freight crossing the blank margin: a dark hull, a neon rim, their cargo in blocks
    function drawShip(s) {
      const { pos, moving } = shipPath(s);
      const z = cam.z, len = shipLen(s), beam = s.type === 'ferry' ? 0.8 : 1.1;
      const x = sx(pos.x - len / 2), y = sy(pos.y - beam / 2), w = len * z, h = beam * z;
      if (x > cw || y > ch || x + w < 0 || y + h < 0) return;
      const rim = { container: '#46D6FF', bulk: '#FF8A3D', tanker: '#FF3B6B', ferry: '#F4F4F4' }[s.type];
      if (moving && !reduce) { // the wake: a trail of fading pixels
        for (let k = 1; k <= 3; k++) {
          ctx.fillStyle = rgba(rim, (0.3 / k).toFixed(2));
          const tw = z * 0.5, off = (k - 1) * tw * 1.2;
          if (s.phase === 'arriving') ctx.fillRect(x + w + off, y + h * 0.3, tw, h * 0.4); else ctx.fillRect(x - off - tw, y + h * 0.3, tw, h * 0.4);
        }
      }
      ctx.fillStyle = rgba(rim, 0.18); ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
      ctx.fillStyle = { container: '#0E1A30', bulk: '#1E120C', tanker: '#220A14', ferry: '#DDE7EE' }[s.type]; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = rim; ctx.fillRect(x, y, w, Math.max(1, z * 0.08)); ctx.fillRect(x, y + h - Math.max(1, z * 0.08), w, Math.max(1, z * 0.08));
      ctx.fillStyle = s.type === 'ferry' ? '#3D8BFF' : '#E9EEF0'; ctx.fillRect(x + w - z * 0.9, y + h * 0.2, z * 0.7, h * 0.6);
      if (s.type === 'container') for (let k = 0; k < 7; k++) { ctx.fillStyle = BOX[(k * 3 + s.name.length) % BOX.length]; ctx.fillRect(x + z * (0.3 + k * 0.6), y + h * 0.22, z * 0.5, h * 0.56); }
      else if (s.type === 'bulk') for (let k = 0; k < 4; k++) { ctx.fillStyle = '#000000'; ctx.fillRect(x + z * (0.4 + k * 0.95), y + h * 0.22, z * 0.75, h * 0.56); }
      else if (s.type === 'tanker') { ctx.fillStyle = '#9FB4C8'; ctx.fillRect(x + z * 0.4, y + h * 0.45, w - z * 1.4, h * 0.1); for (let k = 0; k < 3; k++) { ctx.fillStyle = '#C9D6E2'; ctx.fillRect(x + z * (0.65 + k * 1.05), y + h * 0.25, h * 0.5, h * 0.5); } }
    }
    // a faint scanline over the whole screen, made once
    const scan = (() => { const c = document.createElement('canvas'); c.width = 1; c.height = 3; const k = c.getContext('2d'); k.fillStyle = 'rgba(0,0,0,0.16)'; k.fillRect(0, 2, 1, 1); return ctx.createPattern(c, 'repeat'); })();
    function frame(state, light, x, t) {
      const now = performance.now(), dt = Math.min(0.1, (now - lastNow) / 1000);
      lastNow = now; lastT = t;
      ensureWorld(state, light);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = cam.z < S;
      ctx.fillStyle = PAL.void; ctx.fillRect(0, 0, cw, ch);
      const z = cam.z, vx = cam.x - cw / 2 / z, vy = cam.y - ch / 2 / z;
      ctx.drawImage(world, vx * S, vy * S, (cw / z) * S, (ch / z) * S, 0, 0, cw, ch);
      const dark = new Set(state.dark || []);
      const blink = reduce ? 1 : Math.floor(now / 700) % 2;
      const inView = (bx, by, m) => bx > vx - m && by > vy - m && bx < vx + cw / z + m && by < vy + ch / z + m;

      // the data stream flows east to the margin: packets of light along each channel
      if (!reduce && z >= 2.5) {
        const flow = now / 1000 * 2.2; // blocks per second
        for (const i of streamTiles) {
          const bx = i % map.W, by = Math.floor(i / map.W);
          if (!inView(bx, by, 1) || dark.has(map.district[i])) continue;
          for (let lane = 0; lane < 2; lane++) {
            const period = lane ? 5 : 3.5, ph = ((bx + by * 0.3 - flow * (lane ? 0.7 : 1)) % period + period) % period;
            if (ph < 1) { ctx.fillStyle = lane ? 'rgba(196,247,255,0.75)' : 'rgba(70,214,255,0.9)'; ctx.fillRect(sx(bx + 1 - ph), sy(by + 0.3 + lane * 0.35), Math.max(2, z * 0.35), Math.max(1, z * 0.1)); }
          }
        }
      }
      // Vsync's refresh: a sweep that crosses the district from top to bottom every few seconds
      if (!reduce) for (const L of look) {
        if (L.physics !== 'vsync') continue;
        const row = L.y0 + Math.floor(((now / 4200) % 1) * (L.y1 - L.y0 + 1)), xs = L.rows[row];
        if (!xs || !inView(xs[0], row, 40)) continue;
        ctx.fillStyle = rgba(L.accent, 0.4);
        ctx.fillRect(sx(xs[0]), sy(row + ((now / 4200 * (L.y1 - L.y0 + 1)) % 1)), (xs[xs.length - 1] - xs[0] + 1) * z, Math.max(1, z * 0.12));
      }
      // Hot Pixel's stuck pixels flare now and then
      if (!reduce && z >= 3) {
        const beat = Math.floor(now / 180);
        for (const i of hotSpots) {
          const bx = i % map.W, by = Math.floor(i / map.W);
          if (!inView(bx, by, 1) || h32(i * 31 + beat) > 0.08) continue;
          ctx.fillStyle = 'rgba(255,90,70,0.45)'; ctx.fillRect(sx(bx + 0.2), sy(by + 0.2), z * 0.6, z * 0.6);
          ctx.fillStyle = '#FFF1EC'; ctx.fillRect(sx(bx + 0.42), sy(by + 0.42), Math.max(1, z * 0.16), Math.max(1, z * 0.16));
        }
      }

      for (const f of map.features) {
        const fx = sx(f.x), fy = sy(f.y);
        if (fx > cw || fy > ch || fx + f.w * z < 0 || fy + f.h * z < 0) continue;
        const site = f.kind === 'site' ? state.sites[siteIndex[f.id]] : null;
        if (f.type === 'wind' && site && site.state === 'operating') {
          // the fan array: four blades in each housing, turning with the wind (stopped in a storm)
          const spin = reduce ? 0 : (now / 1000) * (x.wind >= 100 ? 0 : Math.min(x.wind, 60)) * 0.12;
          ctx.strokeStyle = '#C4F7FF'; ctx.lineWidth = Math.max(1, z * 0.12);
          ctx.beginPath();
          for (let k = 0; k < 3; k++) {
            const cx = fx + f.w * z / 2, cy = fy + (1 + k * 2) * z;
            for (let b = 0; b < 4; b++) { const a = spin + k + b * 1.5708; ctx.moveTo(cx + Math.cos(a) * z * 0.15, cy + Math.sin(a) * z * 0.15); ctx.lineTo(cx + Math.cos(a + 0.35) * z * 0.58, cy + Math.sin(a + 0.35) * z * 0.58); }
          }
          ctx.stroke();
        } else if (f.type === 'coal' && site && site.state === 'operating' && !reduce) {
          const share = state.grid.coal / Math.max(1, state.ops.coal * C.MW.coal);
          for (let s2 = 0; s2 < 2; s2++) for (let k = 0; k < 7; k++) {
            const p = ((now / 1600 + k / 7 + s2 * 0.37) % 1), a = (1 - p) * 0.5 * share;
            if (a < 0.02) continue;
            const ex = -Math.sin(x.dir * Math.PI / 180) * p * z * 4 * (x.wind / 30), ey = Math.cos(x.dir * Math.PI / 180) * p * z * 4 * (x.wind / 30) - p * z * 2;
            ctx.fillStyle = p < 0.15 ? 'rgba(255,138,61,' + a.toFixed(3) + ')' : 'rgba(150,140,150,' + a.toFixed(3) + ')';
            const sz = Math.round(z * (0.5 + p * 1.8));
            ctx.fillRect(Math.round(fx + (1.1 + s2 * 1.5) * z + ex - sz / 2), Math.round(fy + 0.9 * z + ey - sz / 2), sz, sz);
          }
        } else if (f.type === 'stadium' && z >= 4) {
          const lap = (t / DAY) % 1, span = f.w - 3.6;
          ctx.fillStyle = '#FF3B30'; ctx.fillRect(fx + (1.3 + lap * span) * z, fy + (f.h / 2 - 0.6) * z, Math.max(2, z * 0.28), Math.max(2, z * 0.28));
          ctx.fillStyle = '#23B5E8'; ctx.fillRect(fx + (1.3 + Math.max(0, lap - 0.006) * span) * z, fy + (f.h / 2 + 0.4) * z, Math.max(2, z * 0.28), Math.max(2, z * 0.28));
        } else if (f.type === 'radio') {
          // the studio's roof is a live equalizer, and the mast light blinks
          const bars = 6, bw = (f.w - 1.2) * z / bars;
          for (let k = 0; k < bars; k++) {
            const lvl = reduce ? 0.5 : 0.3 + 0.7 * Math.abs(Math.sin(now / (260 + k * 70) + k));
            ctx.fillStyle = k < 4 ? '#9BE22D' : '#F2D024';
            const hgt = lvl * (f.h - 2.2) * z;
            ctx.fillRect(fx + 0.6 * z + k * bw + 1, fy + (f.h - 1.0) * z - hgt, Math.max(1, bw - 2), hgt);
          }
          if (blink) { ctx.fillStyle = '#FF3B30'; ctx.fillRect(fx + (f.w - 0.8) * z, fy + 0.1 * z, Math.max(2, z * 0.22), Math.max(2, z * 0.22)); }
        } else if (f.type === 'bureau' && !reduce && z >= 3) { // the radar sweeps
          const a = now / 900, cx = fx + f.w * z / 2, cy = fy + f.h * z / 2;
          ctx.strokeStyle = 'rgba(70,214,255,0.8)'; ctx.lineWidth = Math.max(1, z * 0.08);
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * z * 0.55, cy + Math.sin(a) * z * 0.55); ctx.stroke();
        } else if (f.type === 'observatory' && light < 0.5 && !reduce) {
          ctx.fillStyle = 'rgba(185,166,255,0.55)';
          for (let k = 0; k < 4; k++) ctx.fillRect(fx + f.w * z / 2 - z * 0.08, fy - (k + 1) * z * 0.9, Math.max(1, z * 0.16), z * 0.5);
        }
      }
      for (const s of state.ships || []) drawShip(s);
      // packets on the data buses: as many as the city's traffic, each with a short fading trail
      const hour = (((t + (C.offsetAt ? C.offsetAt(t) : 0)) % DAY) + DAY) % DAY / H;
      const busy = [0.15, 0.1, 0.08, 0.08, 0.12, 0.3, 0.7, 1, 1, 0.8, 0.7, 0.7, 0.75, 0.7, 0.7, 0.8, 0.95, 1, 0.9, 0.7, 0.5, 0.4, 0.3, 0.2][Math.floor(hour)];
      const want = reduce ? 0 : Math.round(170 * busy * (1 - (state.levels['policy.trafficLimits'] || 0) * 0.15));
      while (cars.length < want) {
        const vertical = Math.random() < 0.5, line = vertical ? 6 + 13 * Math.floor(Math.random() * 10) : 4 + 11 * Math.floor(Math.random() * 10);
        cars.push({ vertical, line, p: Math.random() * (vertical ? map.H : map.W), v: (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 3), c: pick(['#2BFF88', '#A6FFD6', '#46D6FF', '#FFD23F', '#FF5FA2', '#F4F4F4'], Math.random()) });
      }
      if (cars.length > want) cars.length = want;
      for (const car of cars) {
        car.p += car.v * dt;
        const lim = car.vertical ? map.H : map.W;
        if (car.p < 0) car.p += lim; else if (car.p > lim) car.p -= lim;
        const tx = car.vertical ? car.line : Math.floor(car.p), ty = car.vertical ? Math.floor(car.p) : car.line;
        const tt = tile(tx, ty);
        if (tt !== T.ROAD && tt !== T.BRIDGE) continue;
        if (dark.has(map.district[ty * map.W + tx])) continue; // no signal, no packets
        const lane = car.v > 0 ? 0.58 : 0.26;
        const cxp = car.vertical ? sx(car.line + lane) : sx(car.p), cyp = car.vertical ? sy(car.p) : sy(car.line + lane);
        if (cxp < -5 || cyp < -5 || cxp > cw + 5 || cyp > ch + 5) continue;
        const pw = Math.max(1.5, car.vertical ? z * 0.16 : z * 0.3), ph = Math.max(1.5, car.vertical ? z * 0.3 : z * 0.16), dir = car.v > 0 ? -1 : 1;
        for (let k = 3; k >= 1; k--) {
          ctx.fillStyle = rgba(car.c, (0.32 / k).toFixed(2));
          ctx.fillRect(cxp + (car.vertical ? 0 : dir * k * pw * 0.9), cyp + (car.vertical ? dir * k * ph * 0.9 : 0), pw, ph);
        }
        ctx.fillStyle = car.c;
        ctx.fillRect(cxp, cyp, pw, ph);
      }
      drawPeople(t, light);
      // glitches (City): drawn while they last
      if (C.glitchesAt) for (const g of C.glitchesAt(t)) {
        const L = look[g.district]; if (!L) continue;
        const beat = Math.floor(now / 110);
        for (const y in L.rows) {
          const yy = +y; if (yy < vy - 1 || yy > vy + ch / z + 1) continue;
          for (const xx of L.rows[y]) {
            if (xx < vx - 1 || xx > vx + cw / z + 1) continue;
            const i = yy * map.W + xx, v = h32(i * 7 + beat);
            if (g.type === 'corruption') { // textures come apart: noise and missing-texture checkers, flickering
              if (v < 0.12 * g.severity) { ctx.fillStyle = v < 0.04 ? '#FF00D4' : v < 0.08 ? '#000000' : pick(PAL.neon, h32(i + beat)); const q = z / 2; ctx.fillRect(sx(xx) + (v * 97 % 1 < 0.5 ? 0 : q), sy(yy) + (v * 53 % 1 < 0.5 ? 0 : q), q, q); }
            } else if (g.type === 'bleed') { // the district's colour runs across everything, and a little past the border
              if (v < 0.5) { ctx.fillStyle = rgba(L.accent, 0.12 + 0.1 * g.severity * v); ctx.fillRect(sx(xx - (v < 0.1 ? 1 : 0)), sy(yy), z * (v < 0.1 ? 2 : 1), z); }
            } else if (g.type === 'stuck') { // frozen: a still, slightly blue frame with tear lines through it
              ctx.fillStyle = 'rgba(70,120,255,0.12)'; ctx.fillRect(sx(xx), sy(yy), z, z);
              if (yy % 5 === 0) { ctx.fillStyle = 'rgba(200,230,255,0.35)'; ctx.fillRect(sx(xx), sy(yy) + z * 0.4, z, Math.max(1, z * 0.08)); }
            } else if (g.type === 'refresh') { // no signal: static over the dark
              if (v < 0.25) { ctx.fillStyle = v < 0.12 ? 'rgba(220,225,235,0.25)' : 'rgba(0,0,0,0.4)'; ctx.fillRect(sx(xx) + (v * 4 % 1) * z, sy(yy), Math.max(1, z * 0.3), Math.max(1, z * 0.15)); }
            } else if (g.type === 'leak' && v < 0.06) { ctx.fillStyle = 'rgba(70,214,255,0.6)'; ctx.fillRect(sx(xx), sy(yy), z * 0.5, z * 0.5); }
          }
        }
        if (g.type === 'refresh' && z < 20) { ctx.textAlign = 'center'; ctx.font = '800 ' + Math.max(12, z * 1.6) + 'px "Bricolage Grotesque", system-ui, sans-serif'; ctx.fillStyle = 'rgba(243,246,247,0.85)'; ctx.fillText('NO SIGNAL', sx(map.districts[g.district].cx + 0.5), sy(map.districts[g.district].cy + 2.5)); }
      }
      if (x.cloud > 0.35 && !reduce) {
        const east = -Math.sin(x.dir * Math.PI / 180), north = Math.cos(x.dir * Math.PI / 180), drift = (now / 1000) * x.wind * 0.02;
        ctx.fillStyle = 'rgba(2,6,14,' + ((x.cloud - 0.35) * 0.22).toFixed(3) + ')';
        for (let k = 0; k < 9; k++) {
          const wx = ((k * 37.7 + east * drift) % (map.W + 40) + map.W + 40) % (map.W + 40) - 20, wy = ((k * 23.3 - north * drift) % (map.H + 40) + map.H + 40) % (map.H + 40) - 20;
          ctx.fillRect(sx(wx), sy(wy), 22 * z, 12 * z);
        }
      }
      if (x.rain > 0 && !reduce) { // rain falls as bits
        ctx.fillStyle = x.snow ? 'rgba(240,248,255,0.85)' : 'rgba(70,214,255,0.5)';
        const n = Math.min(420, Math.round(x.rain * 90)), seed = Math.floor(now / 90);
        for (let k = 0; k < n; k++) ctx.fillRect(Math.floor(h32(seed * 977 + k) * cw), Math.floor(h32(seed * 131 + k * 7) * ch), x.snow ? 2 : 1, x.snow ? 2 : 6);
      }
      // smog is noise on the signal: a grey-violet haze, with static in it
      if (state.aqi > 60) {
        const a = Math.min(0.3, (state.aqi - 60) / 420);
        ctx.fillStyle = 'rgba(70,55,80,' + a.toFixed(3) + ')'; ctx.fillRect(0, 0, cw, ch);
        if (!reduce) {
          const n = Math.round(a * 2400), seed = Math.floor(now / 110);
          for (let k = 0; k < n; k++) { ctx.fillStyle = h32(seed * 7 + k) < 0.5 ? 'rgba(200,190,210,0.22)' : 'rgba(0,0,0,0.3)'; ctx.fillRect(Math.floor(h32(seed * 977 + k) * cw), Math.floor(h32(seed * 313 + k * 3) * ch), 2, 2); }
        }
      }
      ctx.fillStyle = scan; ctx.fillRect(0, 0, cw, ch);
      if (showDistricts && z < 28) {
        ctx.strokeStyle = 'rgba(140,220,255,0.22)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        for (const [ax, ay, bx, by] of borders) { if (ax < vx - 1 || ay < vy - 1 || ax > vx + cw / z + 1 || ay > vy + ch / z + 1) continue; ctx.moveTo(sx(ax), sy(ay)); ctx.lineTo(sx(bx), sy(by)); }
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (district >= 0) {
        ctx.strokeStyle = look[district].accent; ctx.lineWidth = 3;
        ctx.beginPath();
        for (const [ax, ay, bx, by] of dBorders[district]) { ctx.moveTo(sx(ax), sy(ay)); ctx.lineTo(sx(bx), sy(by)); }
        ctx.stroke();
      }
      if (showDistricts && z < 12) {
        ctx.textAlign = 'center';
        const fs = Math.max(11, Math.min(15, z * 1.8));
        ctx.font = '700 ' + fs + 'px "Bricolage Grotesque", system-ui, sans-serif';
        for (const d of map.districts) {
          const lx = sx(d.cx + 0.5), ly = sy(d.cy + 0.5);
          if (lx < -60 || lx > cw + 60 || ly < -20 || ly > ch + 20) continue;
          // each name sits on a small dark plate, marked with its namesake's colour
          const tw = ctx.measureText(d.name).width, a = look[d.id].accent;
          ctx.fillStyle = 'rgba(3,6,13,0.72)'; ctx.fillRect(lx - tw / 2 - 12, ly - fs + 1, tw + 18, fs + 6);
          ctx.fillStyle = a; ctx.fillRect(lx - tw / 2 - 9, ly - fs / 2 - 1, 5, 5);
          ctx.fillStyle = d.id === district ? a : dark.has(d.id) ? '#6E7F96' : '#F3F6F7'; ctx.fillText(d.name, lx + 3, ly);
        }
      }
      const box = (f, c) => { ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.strokeRect(sx(f.x) - 1, sy(f.y) - 1, f.w * z + 2, f.h * z + 2); };
      if (hover && hover.x !== undefined && hover !== selected && !hoverPerson) box(hover, 'rgba(196,247,255,0.8)');
      if (selected) box(selected, '#FFD25A');
    }

    // ================================================================ interaction
    const pointers = new Map();
    let dragFrom = null, moved = 0, pinch = null, lastState = null;
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    function featureAt(x, y) { if (x < 0 || y < 0 || x >= map.W || y >= map.H) return null; const o = map.owner[y * map.W + x]; return o >= 0 ? map.features[o] : null; }
    function shipAt(p) {
      if (!lastState) return null;
      for (const s of lastState.ships || []) {
        const { pos: sp } = shipPath(s);
        if (Math.abs(sx(sp.x) - p.x) < shipLen(s) * cam.z / 2 + 4 && Math.abs(sy(sp.y) - p.y) < cam.z * 0.8 + 4) return { ship: s };
      }
      return null;
    }
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      const p = pos(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) { dragFrom = { x: p.x, y: p.y, cx: cam.x, cy: cam.y }; moved = 0; }
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z }; }
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = pos(e);
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
      if (pinch && pointers.size === 2) { const [a, b] = [...pointers.values()]; cam.z = pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d; clampCam(); moved = 99; return; }
      if (dragFrom && pointers.size === 1) {
        const dx = p.x - dragFrom.x, dy = p.y - dragFrom.y;
        moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
        if (moved > 4) { cam.x = dragFrom.cx - dx / cam.z; cam.y = dragFrom.cy - dy / cam.z; clampCam(); canvas.style.cursor = 'grabbing'; hideTip(); return; }
      }
      // a resident under the pointer comes first, then a ship, then a building
      const person = e.pointerType === 'mouse' ? personAt(p) : null;
      if (person) {
        if (!hoverPerson || hoverPerson.id !== person.p.id) { try { hoverPerson = { id: person.p.id, info: K.summary(person.p.id, lastT), x: person.x, y: person.y, label: person.p.label }; placeTip(); } catch (err) { hideTip(); } }
        canvas.style.cursor = 'pointer';
        hover = null;
        return;
      }
      hideTip();
      const tl = tileAt(p.x, p.y);
      hover = shipAt(p) || featureAt(tl.x, tl.y);
      canvas.style.cursor = hover ? 'pointer' : 'grab';
    });
    const end = (e) => {
      const wasClick = pointers.size === 1 && moved < 5, p = pos(e);
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) { dragFrom = null; canvas.style.cursor = 'grab'; if (wasClick && e.type === 'pointerup') select(p); }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', () => { hover = null; hideTip(); });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); const p = pos(e); zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    canvas.addEventListener('dblclick', (e) => { const p = pos(e); zoomAt(p.x, p.y, 2); });
    canvas.addEventListener('keydown', (e) => {
      const step = 40 / cam.z;
      if (e.key === 'ArrowLeft') cam.x -= step; else if (e.key === 'ArrowRight') cam.x += step;
      else if (e.key === 'ArrowUp') cam.y -= step; else if (e.key === 'ArrowDown') cam.y += step;
      else if (e.key === '+' || e.key === '=') zoomAt(cw / 2, ch / 2, 1.4); else if (e.key === '-') zoomAt(cw / 2, ch / 2, 1 / 1.4);
      else return;
      e.preventDefault(); clampCam();
    });
    function zoomAt(pxX, pxY, k) {
      const before = { x: (pxX - cw / 2) / cam.z + cam.x, y: (pxY - ch / 2) / cam.z + cam.y };
      cam.z *= k; clampCam();
      cam.x = before.x - (pxX - cw / 2) / cam.z; cam.y = before.y - (pxY - ch / 2) / cam.z; clampCam();
    }
    function select(p) {
      // on touch, a tap near a resident shows who they are; a second tap opens their file
      const person = personAt(p);
      if (person) {
        if (hoverPerson && hoverPerson.id === person.p.id) { location.href = personHref(person.p.id); return; }
        try { hoverPerson = { id: person.p.id, info: K.summary(person.p.id, lastT), x: person.x, y: person.y, label: person.p.label }; placeTip(); } catch (err) { /* no file */ }
        return;
      }
      const ship = shipAt(p);
      if (ship) { selected = null; district = -1; if (opts.onSelect) opts.onSelect({ ship: ship.ship }); return; }
      const tl = tileAt(p.x, p.y);
      if (tl.x < 0 || tl.y < 0 || tl.x >= map.W || tl.y >= map.H) return;
      const i = tl.y * map.W + tl.x;
      selected = featureAt(tl.x, tl.y);
      district = selected ? -1 : map.district[i];
      if (opts.onSelect) opts.onSelect({ x: tl.x, y: tl.y, tile: map.tiles[i], district: map.district[i], feature: selected });
    }

    resize();
    fit();
    window.addEventListener('resize', resize);
    return {
      frame: (state, light, x, t) => { lastState = state; frame(state, light, x, t); },
      refresh: () => { worldKey = ''; },
      zoom: (k) => zoomAt(cw / 2, ch / 2, k), fit,
      focus: (x, y, z) => { cam.x = x; cam.y = y; if (z) cam.z = z; clampCam(); },
      selectDistrict: (id) => { district = id; selected = null; },
      toggleDistricts: () => { showDistricts = !showDistricts; return showDistricts; },
      destroy: () => { window.removeEventListener('resize', resize); if (tip.parentNode) tip.parentNode.removeChild(tip); },
      map
    };
  };
})();
