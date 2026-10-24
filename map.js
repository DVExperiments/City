/*
 * The map of Pixel City: a top-down view you can drag, zoom and click.
 *
 * A city built on a screen. Houses are clusters of lit pixels, towers are little monitors, shop awnings carry the red,
 * green and blue of a subpixel, water and gardens are dithered, and every square has a monument pixel in the colour
 * of the district's namesake. The residents are pixels too: each drawn in their own colour, walking, working and
 * gathering. Hover over one to see who they are; click to open their census file.
 *
 * The whole city is painted once at 16 pixels per block into an offscreen image and repainted only when something
 * changes (nightfall, a blackout, a site opening). Panning and zooming redraw part of that image. Moving things
 * (people, cars, ships, turbines, smoke, rain) are drawn on top every frame. Display only.
 *
 * window.CityMap(canvas, { onSelect, time, personHref }) returns { frame, refresh, zoom, fit, focus,
 * selectDistrict, toggleDistricts, destroy }. time picks the era's map (default: now). personHref(id) gives the
 * link for a resident (default: census.html#/resident/<id>).
 */
(function () {
  const U = window.PixelUniverse;
  const C = U.city;
  const T = C.T;
  const S = 16; // pixels per block in the world image
  const H = 3600000, DAY = 86400000;
  function h32(n) { n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
  const pick = (arr, v) => arr[Math.floor(v * arr.length) % arr.length];
  // the city's colours: muted, so the people and the lights stand out
  const PAL = {
    grass: ['#5B8A4B', '#527F44'], park: ['#5FA052', '#55934A'], forest: ['#2C5532', '#28502E'],
    sea: ['#1C4A6B', '#20537A'], river: ['#246087', '#2A6A93'], sand: ['#D6C694', '#CDBC88'],
    road: '#2D333B', roadEdge: '#252A31', street: '#475059', walk: '#69737D', line: '#E7D27A',
    plazaA: '#D2CAB8', plazaB: '#B9B0A0',
    // a subpixel's three colours, softened, for roofs and awnings
    roofs: ['#C2574A', '#D06A52', '#5E9E64', '#6BAA5D', '#4E7FB8', '#5C8BC4', '#B78A4A', '#8A6FA8', '#9A9EA3'],
    rgb: ['#E5484D', '#3FB566', '#3D7FE0']
  };
  const BOX = ['#C0392B', '#2E86C1', '#D4AC0D', '#27AE60', '#E67E22', '#8E44AD', '#16A085'];
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
    const isRoad = (t) => t === T.ROAD || t === T.STREET || t === T.BRIDGE;
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
      if (depth) px(x + depth, y + depth, w, h, 'rgba(0,0,0,0.3)');
      px(x, y, w, h, c);
      px(x, y, w, 1, 'rgba(255,255,255,0.32)'); px(x, y, 1, h, 'rgba(255,255,255,0.2)');
      px(x, y + h - 1, w, 1, 'rgba(0,0,0,0.28)'); px(x + w - 1, y, 1, h, 'rgba(0,0,0,0.2)');
    }
    function disc(cx, cy, r, c) { for (let y = -r; y <= r; y++) { const w = Math.floor(Math.sqrt(r * r - y * y)); px(cx - w, cy + y, w * 2, 1, c); } }
    function tree(x, y, c) { px(x + 1, y + 2, 5, 5, 'rgba(0,0,0,0.28)'); px(x + 1, y, 3, 5, c); px(x, y + 1, 5, 3, c); px(x + 1, y + 1, 1, 1, 'rgba(255,255,255,0.3)'); }

    function paintTile(x, y) {
      const i = y * map.W + x, t = map.tiles[i], X = x * S, Y = y * S, v = h32(i), v2 = h32(i + 7919), v3 = h32(i + 104729);
      const D = map.districts[map.district[i]] || { env: 0 };
      switch (t) {
        case T.SEA: case T.RIVER: {
          const p = t === T.SEA ? PAL.sea : PAL.river;
          dither(X, Y, S, S, p[0], p[1], x + y);
          if (v < 0.35) px(X + Math.floor(v2 * 10), Y + Math.floor(v3 * 14), 4, 1, 'rgba(255,255,255,0.12)');
          const foam = 'rgba(220,236,244,0.6)';
          if (!isWater(tile(x - 1, y)) && tile(x - 1, y) !== T.BRIDGE) px(X, Y, 2, S, foam);
          if (!isWater(tile(x + 1, y)) && tile(x + 1, y) !== T.BRIDGE) px(X + S - 2, Y, 2, S, foam);
          if (!isWater(tile(x, y - 1)) && tile(x, y - 1) !== T.BRIDGE) px(X, Y, S, 2, foam);
          if (!isWater(tile(x, y + 1)) && tile(x, y + 1) !== T.BRIDGE) px(X, Y + S - 2, S, 2, foam);
          break;
        }
        case T.BEACH:
          if (x >= 108 && y >= 50 && y <= 66) { // the quay: paved, with bollards
            px(X, Y, S, S, '#8A857C'); for (let k = 0; k < S; k += 4) px(X, Y + k, S, 1, 'rgba(0,0,0,0.1)');
            if (isWater(tile(x + 1, y))) { px(X + S - 3, Y, 3, S, '#6F6A63'); px(X + S - 5, Y + 6, 2, 2, '#2B2B2B'); }
            break;
          }
          dither(X, Y, S, S, PAL.sand[0], PAL.sand[1], x * 3 + y);
          break;
        case T.GRASS:
          dither(X, Y, S, S, PAL.grass[0], PAL.grass[1], x + y);
          if (v < 0.2) tree(X + 4 + Math.floor(v2 * 6), Y + 4 + Math.floor(v3 * 6), '#3E7A3E');
          break;
        case T.FOREST:
          dither(X, Y, S, S, PAL.forest[0], PAL.forest[1], x + y);
          for (let k = 0; k < 3; k++) tree(X + 1 + Math.floor(h32(i * 13 + k) * 9), Y + 1 + Math.floor(h32(i * 17 + k) * 9), k % 2 ? '#3D7A45' : '#4A8A50');
          break;
        case T.PARK:
          dither(X, Y, S, S, PAL.park[0], PAL.park[1], x + y);
          tree(X + 2 + Math.floor(v * 8), Y + 2 + Math.floor(v2 * 8), '#3F8A44');
          if (v3 < 0.3) px(X + 3, Y + 12, 3, 2, pick(PAL.rgb, v)); // a flower bed, in a subpixel colour
          break;
        case T.ROAD: case T.BRIDGE: {
          const horiz = isRoad(tile(x - 1, y)) || isRoad(tile(x + 1, y)), vert = isRoad(tile(x, y - 1)) || isRoad(tile(x, y + 1));
          px(X, Y, S, S, t === T.BRIDGE ? '#59544C' : PAL.road);
          if (t === T.BRIDGE) { px(X, Y, S, 2, '#A8A090'); px(X, Y + S - 2, S, 2, '#A8A090'); }
          // scanline markings: short bright dashes, like a line being drawn across the screen
          if (horiz && !vert) { for (let k = 1; k < S; k += 5) px(X + k, Y + 7, 2, 2, PAL.line); px(X, Y, S, 1, PAL.roadEdge); px(X, Y + S - 1, S, 1, PAL.roadEdge); }
          else if (vert && !horiz) { for (let k = 1; k < S; k += 5) px(X + 7, Y + k, 2, 2, PAL.line); px(X, Y, 1, S, PAL.roadEdge); px(X + S - 1, Y, 1, S, PAL.roadEdge); }
          else if (horiz && vert && t !== T.BRIDGE) for (let k = 2; k < S - 2; k += 4) { px(X + k, Y + 1, 2, 2, '#D9DDE0'); px(X + k, Y + S - 3, 2, 2, '#D9DDE0'); px(X + 1, Y + k, 2, 2, '#D9DDE0'); px(X + S - 3, Y + k, 2, 2, '#D9DDE0'); }
          break;
        }
        case T.STREET: {
          px(X, Y, S, S, PAL.street);
          const horiz = isRoad(tile(x - 1, y)) || isRoad(tile(x + 1, y));
          if (horiz) { px(X, Y, S, 3, PAL.walk); px(X, Y + S - 3, S, 3, PAL.walk); } else { px(X, Y, 3, S, PAL.walk); px(X + S - 3, Y, 3, S, PAL.walk); }
          if (D.env > 0.1 && v < 0.5) tree(horiz ? X + 3 + Math.floor(v2 * 8) : X - 1, horiz ? Y - 1 : Y + 3 + Math.floor(v2 * 8), '#3F7A3A');
          if (v3 < 0.12) px(horiz ? X + 8 : X + 1, horiz ? Y + 1 : Y + 8, 1, 1, '#F2E3A0'); // a street lamp
          break;
        }
        case T.PLAZA: {
          // a chessboard of paving, and in each district's square, a monument: one great pixel in the colour of
          // the pixel the district is named after
          for (let yy = 0; yy < S; yy += 4) for (let xx = 0; xx < S; xx += 4) px(X + xx, Y + yy, 4, 4, ((xx + yy) / 4 + x + y) % 2 ? PAL.plazaA : PAL.plazaB);
          const q = squareAt[(x - 1) + ',' + (y - 1)];
          if (q) { const c = PIXEL_COLOR[map.districts[q.district].name] || '#F3F6F7'; px(X + 2, Y + 2, 12, 12, '#7D776B'); bevel(X + 4, Y + 1, 8, 8, c, 2); }
          break;
        }
        case T.HOUSE: {
          // a house is a little cluster of pixels: two or four roof squares, each with its own colour
          dither(X, Y, S, S, '#6E9A58', '#679250', x + y);
          const c1 = pick(PAL.roofs, v), c2 = pick(PAL.roofs, v2);
          const ox = 2 + Math.floor(v3 * 3), oy = 2 + Math.floor(v * 3);
          if (v2 < 0.5) { bevel(X + ox, Y + oy, 5, 5, c1, 1); bevel(X + ox + 5, Y + oy, 5, 5, c2, 1); bevel(X + ox, Y + oy + 5, 5, 5, c2, 1); bevel(X + ox + 5, Y + oy + 5, 5, 5, c1, 1); }
          else { bevel(X + ox, Y + oy, 10, 5, c1, 1); bevel(X + ox, Y + oy + 5, 10, 5, c1, 1); px(X + ox, Y + oy + 5, 10, 1, 'rgba(0,0,0,0.25)'); }
          if (v3 < 0.35) tree(X + 1, Y + 10, '#3F7A3A');
          px(X + ox + 4, Y + oy + 10, 2, 2, '#4A3A30'); // the front door
          break;
        }
        case T.APARTMENT: {
          // a tower, seen from above: a dark frame and a grid of windows, like a small monitor
          px(X, Y, S, S, '#7F878E');
          bevel(X + 1, Y + 1, 14, 14, '#2A3139', 2);
          for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) px(X + 3 + c * 4, Y + 3 + r * 4, 3, 3, h32(i * 9 + r * 3 + c) < 0.15 ? '#C9D7E2' : '#6E8FA6');
          if (v < 0.4) px(X + 11, Y + 2, 2, 2, '#E5484D'); // an aircraft light
          break;
        }
        case T.OFFICE: {
          px(X, Y, S, S, '#AEB4B9');
          bevel(X + 1, Y + 1, 14, 14, pick(['#4D6F93', '#5A7EA6', '#466587'], v), 3);
          for (let k = 3; k < 14; k += 2) px(X + 2, Y + k, 12, 1, 'rgba(200,225,245,0.18)'); // scanlines on the glass
          px(X + 2, Y + 2, 5, 1, 'rgba(255,255,255,0.4)');
          break;
        }
        case T.SHOP: {
          px(X, Y, S, S, '#A59D8A');
          bevel(X + 1, Y + 1, 14, 10, pick(PAL.roofs, v), 2);
          // the awning: red, green and blue stripes, the three subpixels of every pixel in the city
          for (let k = 0; k < 14; k++) px(X + 1 + k, Y + 11, 1, 3, PAL.rgb[k % 3]);
          break;
        }
        case T.FACTORY: {
          px(X, Y, S, S, '#756B61');
          bevel(X + 1, Y + 2, 14, 11, '#8A7F72', 3);
          for (let k = 0; k < 14; k += 4) { px(X + 1 + k, Y + 2, 2, 11, 'rgba(255,255,255,0.12)'); px(X + 3 + k, Y + 2, 2, 11, 'rgba(0,0,0,0.18)'); } // a sawtooth roof
          if (v2 < 0.5) { px(X + 11, Y, 3, 5, '#4E4A45'); px(X + 11, Y, 3, 1, '#2E2A26'); }
          break;
        }
        case T.WAREHOUSE: {
          px(X, Y, S, S, '#8A8173');
          bevel(X + 1, Y + 1, 14, 12, '#A0927E', 2);
          for (let k = 2; k < 14; k += 3) px(X + 1, Y + 1 + k, 14, 1, 'rgba(0,0,0,0.12)');
          px(X + 3, Y + 13, 4, 2, '#2D333B'); px(X + 9, Y + 13, 4, 2, '#2D333B');
          break;
        }
        case T.DOCK:
          px(X, Y, S, S, '#6A655E');
          for (let k = 0; k < 3; k++) for (let j = 0; j < 2; j++) if (h32(i * 31 + k * 3 + j) < 0.75) bevel(X + 1 + j * 7, Y + 1 + k * 5, 6, 4, pick(BOX, h32(i * 37 + k + j * 5)), 0);
          break;
        default:
          px(X, Y, S, S, '#A8996F');
      }
    }
    function asTile(x, y, type) { const i = y * map.W + x, save = map.tiles[i]; map.tiles[i] = type; paintTile(x, y); map.tiles[i] = save; }
    function fillAs(f, type) { for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) asTile(x, y, type); }
    function sign(X, Y, W, text) { // a small dark sign with a pixel pattern for lettering
      px(X, Y, W, 7, '#14212A');
      for (let k = 0; k < Math.min(text.length, Math.floor((W - 4) / 3)); k++) if (text[k] !== ' ') px(X + 2 + k * 3, Y + 2 + (h32(text.charCodeAt(k)) < 0.5 ? 0 : 1), 2, 2, '#F2D024');
    }
    const stillPlanned = (f, t) => (C.isPlanned ? C.isPlanned(f, t) : !!f.planned);
    function paintFeature(f, site, night, t) {
      const X = f.x * S, Y = f.y * S, W = f.w * S, HH = f.h * S;
      if (f.kind === 'landmark') {
        if (stillPlanned(f, t)) {
          // a plot for a building still to come: cleared ground, a hazard fence and a sign
          dither(X, Y, W, HH, '#A6966E', '#9C8C65', f.id);
          for (let k = 0; k < W; k += 6) { px(X + k, Y, 3, 2, '#F2C230'); px(X + k + 3, Y, 3, 2, '#14212A'); px(X + k, Y + HH - 2, 3, 2, '#14212A'); px(X + k + 3, Y + HH - 2, 3, 2, '#F2C230'); }
          for (let k = 0; k < HH; k += 6) { px(X, Y + k, 2, 3, '#F2C230'); px(X + W - 2, Y + k, 2, 3, '#F2C230'); }
          sign(X + 6, Y + 6, Math.min(W - 12, 40), f.name.replace(/^The /, ''));
          for (let k = 0; k < 5; k++) px(X + 10 + Math.floor(h32(f.id * 9 + k) * (W - 24)), Y + 18 + Math.floor(h32(f.id * 5 + k) * (HH - 26)), 6, 4, '#8E8268');
          return;
        }
        switch (f.type) {
          case 'senate':
            px(X, Y, W, HH, '#CFC6B4');
            bevel(X + 4, Y + 10, W - 8, HH - 16, '#ECE6D8', 4);
            for (let k = 0; k < 9; k++) px(X + 8 + k * 11, Y + HH - 14, 4, 8, '#F8F4EA');
            disc(X + W / 2, Y + 30, 16, '#D7CDB6'); disc(X + W / 2, Y + 30, 11, '#E5DCC6'); disc(X + W / 2 - 3, Y + 27, 4, '#F3EEE2');
            px(X + W / 2, Y + 2, 1, 12, '#3B4045'); px(X + W / 2 + 1, Y + 2, 7, 4, '#3FA66A');
            break;
          case 'stadium':
            px(X, Y, W, HH, '#8F969C');
            bevel(X + 4, Y + 4, W - 8, HH - 8, '#5F6B70', 3);
            for (let k = 0; k < (W - 16) / 3; k++) { px(X + 8 + k * 3, Y + 7, 2, 4, pick(PAL.rgb, h32(k))); px(X + 8 + k * 3, Y + HH - 11, 2, 4, pick(PAL.rgb, h32(k + 50))); }
            px(X + 14, Y + 16, W - 28, HH - 32, '#0E171C'); // the screen the race is run across
            for (let k = 0; k < W - 28; k += 2) px(X + 14 + k, Y + 16, 1, HH - 32, 'rgba(255,255,255,0.03)');
            px(X + 18, Y + HH / 2 - 14, W - 40, 1, 'rgba(255,255,255,0.2)'); px(X + 18, Y + HH / 2 + 14, W - 40, 1, 'rgba(255,255,255,0.2)');
            for (let k = 0; k < 8; k++) px(X + W - 26, Y + 22 + k * 4, 2, 2, k % 2 ? '#F2F2F2' : '#14212A');
            for (const [cx, cy] of [[X + 2, Y + 2], [X + W - 8, Y + 2], [X + 2, Y + HH - 8], [X + W - 8, Y + HH - 8]]) { px(cx, cy, 6, 6, '#3B4045'); px(cx + 1, cy + 1, 4, 4, night ? '#FFF2C2' : '#C9CDD0'); }
            break;
          case 'bureau':
            px(X, Y, W, HH, '#CFC6B4');
            bevel(X + 6, Y + 6, W - 12, HH - 12, '#C8D3DA', 6);
            disc(X + W / 2, Y + HH / 2, 9, '#F3F6F7'); disc(X + W / 2, Y + HH / 2, 4, '#7F9BB8');
            px(X + W - 12, Y + 8, 3, 3, '#E8743B');
            break;
          case 'bookmaker':
            px(X, Y, W, HH, '#A9A08C');
            bevel(X + 2, Y + 3, W - 4, HH - 8, '#7A4E3A', 3);
            px(X + 6, Y + 8, W - 12, 12, '#0E171C'); // the odds board
            for (let k = 0; k < 6; k++) px(X + 9 + k * 7, Y + 11, 5, 6, k % 2 ? '#F2D024' : '#9BE22D');
            for (let k = 0; k < W - 4; k += 4) px(X + 2 + k, Y + HH - 5, 2, 3, k % 8 ? '#F2F2F2' : '#2E7D4F');
            break;
          case 'press':
            px(X, Y, W, HH, '#B9BEC2');
            bevel(X + 2, Y + 2, W - 4, HH - 4, '#E6E2D8', 3);
            px(X + 6, Y + 6, W - 12, 7, '#14212A'); // the masthead, in pixels
            for (let k = 0; k < (W - 16) / 3; k++) if (h32(k * 7 + 3) < 0.7) px(X + 8 + k * 3, Y + 8, 2, 3, '#F3F6F7');
            for (let k = 0; k < 4; k++) px(X + 8 + k * 12, Y + 20, 8, 18, '#C9C3B6');
            break;
          case 'museum': {
            px(X, Y, W, HH, '#CFC6B4');
            bevel(X + 4, Y + 6, W - 8, HH - 12, '#E9E3D5', 4);
            for (let k = 0; k < 8; k++) px(X + 10 + k * 10, Y + HH - 12, 4, 8, '#F8F4EA');
            // the collection's emblem on the roof: a great frame holding a single pixel
            const fx = X + W / 2 - 14, fy = Y + 12;
            px(fx, fy, 28, 24, '#B08D4C'); px(fx + 3, fy + 3, 22, 18, '#F3F6F7'); bevel(fx + 10, fy + 8, 8, 8, '#FF5FA2', 0);
            break;
          }
          case 'census': {
            px(X, Y, W, HH, '#B5BAB0');
            bevel(X + 2, Y + 2, W - 4, HH - 4, '#D8D2C2', 3);
            // the files: one small square for every street in the city
            for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) px(X + 6 + c * 6, Y + 8 + r * 7, 4, 4, pick(PAL.roofs, h32(r * 9 + c)));
            px(X + W / 2 - 4, Y + HH - 8, 8, 6, '#4A3A30');
            break;
          }
          case 'radio': {
            px(X, Y, W, HH, '#9AA3A8');
            bevel(X + 3, Y + 6, W - 6, HH - 10, '#2A3139', 3);
            px(X + 8, Y + 14, W - 16, HH - 26, '#0E171C'); // the roof is a speaker
            px(X + W - 14, Y + 2, 3, HH - 8, '#C9CDD0'); // the mast
            for (let k = 0; k < 5; k++) px(X + W - 17, Y + 6 + k * 9, 9, 1, '#C9CDD0');
            break;
          }
          case 'observatory': {
            px(X, Y, W, HH, '#BDB5A3');
            bevel(X + 4, Y + 4, W - 8, HH - 8, '#D8D2C4', 3);
            disc(X + W / 2, Y + HH / 2, 26, '#5C6670'); disc(X + W / 2, Y + HH / 2, 23, '#E6EBEF'); disc(X + W / 2 - 6, Y + HH / 2 - 6, 8, '#F7FAFB');
            px(X + W / 2 - 3, Y + HH / 2 - 24, 6, 24, '#14212A'); // the slit in the dome
            break;
          }
          case 'school': {
            // Pixel High: the main building around a courtyard, a running track round the playing field, and the
            // school's crest, four great pixels in red, green, blue and alpha, on the roof
            dither(X, Y, W, HH, PAL.grass[0], PAL.grass[1], f.id);
            const bw = Math.floor(W * 0.46);
            bevel(X + 4, Y + 4, bw, 16, '#D9CDB6', 3); bevel(X + 4, Y + HH - 20, bw, 16, '#D9CDB6', 3); bevel(X + 4, Y + 4, 16, HH - 8, '#D9CDB6', 3);
            px(X + 22, Y + 22, bw - 20, HH - 44, '#C9C1AE');
            for (let k = 0; k < bw - 10; k += 6) { px(X + 8 + k, Y + 8, 3, 3, '#7FA3BF'); px(X + 8 + k, Y + HH - 16, 3, 3, '#7FA3BF'); }
            const cx = X + 26, cy = Y + 26, cs = 9;
            bevel(cx, cy, cs, cs, '#E5484D', 1); bevel(cx + cs + 1, cy, cs, cs, '#3FB566', 1); bevel(cx, cy + cs + 1, cs, cs, '#3D7FE0', 1); bevel(cx + cs + 1, cy + cs + 1, cs, cs, '#B9C3CA', 1);
            const fx0 = X + bw + 12, fw = W - bw - 16, fy0 = Y + 6, fh = HH - 12;
            px(fx0, fy0, fw, fh, '#B5523B');
            for (let k = 3; k < 10; k += 3) { px(fx0 + k, fy0 + k, fw - 2 * k, 1, 'rgba(255,255,255,0.55)'); px(fx0 + k, fy0 + fh - k - 1, fw - 2 * k, 1, 'rgba(255,255,255,0.55)'); px(fx0 + k, fy0 + k, 1, fh - 2 * k, 'rgba(255,255,255,0.55)'); px(fx0 + fw - k - 1, fy0 + k, 1, fh - 2 * k, 'rgba(255,255,255,0.55)'); }
            dither(fx0 + 11, fy0 + 11, fw - 22, fh - 22, '#5FA052', '#55934A', 3);
            px(fx0 + fw / 2, fy0 + 11, 1, fh - 22, 'rgba(255,255,255,0.6)');
            ['#E5484D', '#3FB566', '#3D7FE0', '#B9C3CA'].forEach((c, k) => { px(X + bw + 4, Y + 10 + k * 16, 1, 10, '#3B4045'); px(X + bw + 5, Y + 10 + k * 16, 5, 4, c); });
            break;
          }
          case 'gas':
            px(X, Y, W, HH, '#8D8F8A');
            disc(X + 14, Y + 20, 11, '#5E615C'); disc(X + 13, Y + 19, 10, '#D2D5D0');
            disc(X + 44, Y + 20, 11, '#5E615C'); disc(X + 43, Y + 19, 10, '#D2D5D0');
            px(X + 24, Y + 18, 10, 2, '#5E615C');
            break;
          case 'port':
            px(X, Y, W, HH, '#6A655E');
            for (let k = 0; k < 10; k++) for (let j = 0; j < 3; j++) if (h32(k * 13 + j) < 0.75) bevel(X + 4 + j * 14, Y + 6 + k * 12, 12, 8, pick(BOX, h32(k * 7 + j * 3)), 0);
            for (let k = 0; k < 3; k++) { const cy = Y + 14 + k * 40; px(X + W - 10, cy, 3, 26, '#F2C230'); px(X + W - 22, cy, 24, 3, '#F2C230'); px(X + W - 22, cy + 22, 24, 3, '#D4A82A'); }
            break;
          default:
            px(X, Y, W, HH, '#B8B0A0'); bevel(X + 3, Y + 3, W - 6, HH - 6, '#D6CFC0', 3);
        }
        return;
      }
      const st = site.state;
      if (st === 'empty') {
        if (f.type === 'wildlife') fillAs(f, T.FOREST);
        else if (f.type === 'coal') { px(X, Y, W, HH, '#8F887C'); for (let k = 0; k < W; k += 4) { px(X + k, Y, 2, 1, '#C9CDD0'); px(X + k, Y + HH - 1, 2, 1, '#C9CDD0'); } }
        else fillAs(f, T.GRASS);
        return;
      }
      if (st === 'building' || st === 'clearing') {
        px(X, Y, W, HH, st === 'building' ? '#B8A574' : '#8A7F6E');
        for (let k = 0; k < W; k += 6) { px(X + k, Y, 3, 3, '#1A1A1A'); px(X + k + 3, Y, 3, 3, '#F2C230'); px(X + k, Y + HH - 3, 3, 3, '#F2C230'); px(X + k + 3, Y + HH - 3, 3, 3, '#1A1A1A'); }
        if (st === 'building') {
          for (let k = 0; k < 4; k++) px(X + 8 + k * 6, Y + 10, 1, HH - 20, 'rgba(60,50,30,0.6)');
          px(X + W / 2, Y + 6, 3, HH - 12, '#F2C230'); px(X + 6, Y + 8, W - 12, 3, '#F2C230'); px(X + 6, Y + 11, 3, 6, '#3B4045');
        } else for (let k = 0; k < 18; k++) px(X + 4 + Math.floor(h32(f.id * 50 + k) * (W - 12)), Y + 6 + Math.floor(h32(f.id * 70 + k) * (HH - 14)), 6, 4, pick(['#6B6153', '#7E7466', '#5A5248'], h32(k)));
        return;
      }
      if (f.type === 'coal') {
        px(X, Y, W, HH, '#5E5A55');
        bevel(X + 4, Y + 24, W - 8, HH - 30, '#77716A', 3);
        disc(X + 18, Y + 14, 8, '#3E3A36'); disc(X + 18, Y + 14, 6, '#8A847C'); disc(X + 42, Y + 14, 8, '#3E3A36'); disc(X + 42, Y + 14, 6, '#8A847C');
        for (let k = 0; k < 6; k++) disc(X + W - 14 + (k % 2) * 4, Y + 30 + Math.floor(k / 2) * 6, 5, '#1E1E1E');
        if (night) for (let k = 0; k < 6; k++) px(X + 10 + k * 10, Y + HH - 8, 2, 2, '#FFB347');
      } else if (f.type === 'solar') {
        px(X, Y, W, HH, '#C9C1A3');
        // solar panels, drawn as what they are: grids of tiny blue pixels
        for (let y = 3; y < HH - 4; y += 9) for (let x = 3; x < W - 4; x += 12) { px(X + x, Y + y, 10, 6, '#1F3B66'); for (let k = 0; k < 10; k += 2) px(X + x + k, Y + y, 1, 6, '#2C4C7E'); px(X + x, Y + y, 10, 1, '#6E97D0'); }
      } else if (f.type === 'wind') fillAs(f, T.GRASS);
      else if (f.type === 'park') {
        dither(X, Y, W, HH, PAL.park[0], PAL.park[1], f.id);
        px(X, Y + HH / 2 - 2, W, 4, '#D9CFA8'); px(X + W / 2 - 2, Y, 4, HH, '#D9CFA8');
        disc(X + W / 2 + 12, Y + HH / 2 + 14, 8, '#3E7FA8'); disc(X + W / 2 + 11, Y + HH / 2 + 13, 3, '#6FA8CF');
        for (let k = 0; k < 9; k++) tree(X + 4 + Math.floor(h32(f.id * 9 + k) * (W - 12)), Y + 4 + Math.floor(h32(f.id * 11 + k) * (HH - 12)), '#2F6E35');
        for (let k = 0; k < 3; k++) px(X + 6 + k * 3, Y + 6, 2, 6, PAL.rgb[k]); // a flower bed in red, green and blue
      } else if (f.type === 'wildlife') {
        fillAs(f, T.FOREST);
        for (let k = 0; k < W; k += 4) { px(X + k, Y, 2, 2, '#D9CFA8'); px(X + k, Y + HH - 2, 2, 2, '#D9CFA8'); }
        for (let k = 0; k < HH; k += 4) { px(X, Y + k, 2, 2, '#D9CFA8'); px(X + W - 2, Y + k, 2, 2, '#D9CFA8'); }
        disc(X + W / 2, Y + HH / 2, 6, '#3E7FA8');
      }
    }
    const LIT = { [T.HOUSE]: 0.4, [T.APARTMENT]: 0.75, [T.SHOP]: 0.6, [T.OFFICE]: 0.6, [T.FACTORY]: 0.3, [T.WAREHOUSE]: 0.2 };
    function paintWorld(state, light) {
      const night = light < 0.5, dark = new Set(state.dark || []);
      for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) if (map.owner[y * map.W + x] < 0) paintTile(x, y);
      for (const f of map.features) paintFeature(f, f.kind === 'site' ? state.sites[siteIndex[f.id]] : null, night, state.time);
      if (light < 1) { g.fillStyle = 'rgba(8,14,32,' + ((1 - light) * 0.68).toFixed(3) + ')'; g.fillRect(0, 0, world.width, world.height); }
      if (night) {
        for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) {
          const i = y * map.W + x, t = map.tiles[i], p = LIT[t];
          if (map.owner[i] >= 0 || dark.has(map.district[i])) continue;
          if (t === T.STREET && h32(i + 3) < 0.25) { px(x * S + 7, y * S + 7, 2, 2, 'rgba(255,236,170,0.8)'); continue; }
          if (t === T.ROAD && (x + y) % 2 === 0) { px(x * S + 1, y * S + 1, 2, 2, 'rgba(255,236,170,0.75)'); continue; }
          if (t === T.APARTMENT) { for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (h32(i * 9 + r * 3 + c + 1) < p) px(x * S + 3 + c * 4, y * S + 3 + r * 4, 3, 3, 'rgba(255,214,120,' + (0.6 + h32(i + r + c) * 0.4).toFixed(2) + ')'); continue; }
          if (!p) continue;
          for (let k = 0; k < 6; k++) if (h32(i * 6 + k) < p) px(x * S + 3 + (k % 3) * 4, y * S + 3 + Math.floor(k / 3) * 6, 2, 2, 'rgba(255,214,120,' + (0.55 + h32(i + k) * 0.45).toFixed(2) + ')');
        }
        // the monuments in the squares glow at night
        for (const q of map.squares || []) { const c = PIXEL_COLOR[map.districts[q.district].name] || '#F3F6F7'; g.globalAlpha = 0.9; px((q.x + 1) * S + 4, (q.y + 1) * S + 1, 8, 8, c); g.globalAlpha = 1; }
      }
      if (dark.size) { g.fillStyle = 'rgba(10,20,45,0.45)'; for (let i = 0; i < map.tiles.length; i++) if (dark.has(map.district[i])) g.fillRect((i % map.W) * S, Math.floor(i / map.W) * S, S, S); }
    }
    function ensureWorld(state, light) {
      const key = Math.round(light * 8) + '|' + (state.dark || []).join(',') + '|' + state.sites.map((s) => s.state[0]).join('') + '|' + map.features.filter((f) => f.planned).map((f) => (stillPlanned(f, state.time) ? 'p' : 'o')).join('');
      if (key !== worldKey) { paintWorld(state, light); worldKey = key; }
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
    function drawShip(s) {
      const { pos, moving } = shipPath(s);
      const z = cam.z, len = shipLen(s), beam = s.type === 'ferry' ? 0.8 : 1.1;
      const x = sx(pos.x - len / 2), y = sy(pos.y - beam / 2), w = len * z, h = beam * z;
      if (x > cw || y > ch || x + w < 0 || y + h < 0) return;
      if (moving && !reduce) { ctx.fillStyle = 'rgba(220,235,245,0.35)'; if (s.phase === 'arriving') ctx.fillRect(x + w, y + h * 0.25, z * 1.4, h * 0.5); else ctx.fillRect(x - z * 1.4, y + h * 0.25, z * 1.4, h * 0.5); }
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + z * 0.12, y + z * 0.12, w, h);
      ctx.fillStyle = { container: '#2B3A55', bulk: '#5A3A2E', tanker: '#7A2E2E', ferry: '#F2F2F2' }[s.type]; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = s.type === 'ferry' ? '#2E86C1' : '#E9EEF0'; ctx.fillRect(x + w - z * 0.9, y + h * 0.15, z * 0.7, h * 0.7);
      if (s.type === 'container') for (let k = 0; k < 7; k++) { ctx.fillStyle = BOX[(k * 3 + s.name.length) % BOX.length]; ctx.fillRect(x + z * (0.3 + k * 0.6), y + h * 0.18, z * 0.5, h * 0.64); }
      else if (s.type === 'bulk') for (let k = 0; k < 4; k++) { ctx.fillStyle = '#1E1E1E'; ctx.fillRect(x + z * (0.4 + k * 0.95), y + h * 0.22, z * 0.75, h * 0.56); }
      else if (s.type === 'tanker') { ctx.fillStyle = '#C9CDD0'; ctx.fillRect(x + z * 0.4, y + h * 0.42, w - z * 1.4, h * 0.16); for (let k = 0; k < 3; k++) { ctx.fillStyle = '#D9D9D9'; ctx.fillRect(x + z * (0.65 + k * 1.05), y + h * 0.22, h * 0.56, h * 0.56); } }
    }
    function frame(state, light, x, t) {
      const now = performance.now(), dt = Math.min(0.1, (now - lastNow) / 1000);
      lastNow = now; lastT = t;
      ensureWorld(state, light);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = cam.z < S;
      ctx.fillStyle = '#0E171C'; ctx.fillRect(0, 0, cw, ch);
      const z = cam.z, vx = cam.x - cw / 2 / z, vy = cam.y - ch / 2 / z;
      ctx.drawImage(world, vx * S, vy * S, (cw / z) * S, (ch / z) * S, 0, 0, cw, ch);
      const dark = new Set(state.dark || []);
      const blink = reduce ? 1 : Math.floor(now / 700) % 2;
      for (const f of map.features) {
        const fx = sx(f.x), fy = sy(f.y);
        if (fx > cw || fy > ch || fx + f.w * z < 0 || fy + f.h * z < 0) continue;
        const site = f.kind === 'site' ? state.sites[siteIndex[f.id]] : null;
        if (f.type === 'wind' && site && site.state === 'operating') {
          const spin = reduce ? 0 : (now / 1000) * (x.wind >= 100 ? 0 : Math.min(x.wind, 60)) * 0.12;
          for (let k = 0; k < 3; k++) {
            const cx = fx + f.w * z / 2, cy = fy + (0.9 + k * 2) * z;
            ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(cx + z * 0.15, cy + z * 0.15, z * 0.14, z * 1.1);
            ctx.fillStyle = '#E9EEF0'; ctx.fillRect(cx - z * 0.07, cy, z * 0.14, z * 1.1);
            ctx.strokeStyle = '#F6F9FA'; ctx.lineWidth = Math.max(1, z * 0.09);
            ctx.beginPath();
            for (let b = 0; b < 3; b++) { const a = spin + k + b * 2.094; ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * z * 0.8, cy + Math.sin(a) * z * 0.8); }
            ctx.stroke();
          }
        } else if (f.type === 'coal' && site && site.state === 'operating' && !reduce) {
          const share = state.grid.coal / Math.max(1, state.ops.coal * C.MW.coal);
          for (let s2 = 0; s2 < 2; s2++) for (let k = 0; k < 7; k++) {
            const p = ((now / 1600 + k / 7 + s2 * 0.37) % 1), a = (1 - p) * 0.5 * share;
            if (a < 0.02) continue;
            const ex = -Math.sin(x.dir * Math.PI / 180) * p * z * 4 * (x.wind / 30), ey = Math.cos(x.dir * Math.PI / 180) * p * z * 4 * (x.wind / 30) - p * z * 2;
            ctx.fillStyle = 'rgba(205,205,200,' + a.toFixed(3) + ')';
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
        } else if (f.type === 'observatory' && light < 0.5 && !reduce) {
          ctx.fillStyle = 'rgba(255,240,180,0.55)';
          for (let k = 0; k < 4; k++) ctx.fillRect(fx + f.w * z / 2 - z * 0.08, fy - (k + 1) * z * 0.9, Math.max(1, z * 0.16), z * 0.5);
        }
      }
      for (const s of state.ships || []) drawShip(s);
      const hour = (((t + (C.offsetAt ? C.offsetAt(t) : 0)) % DAY) + DAY) % DAY / H;
      const busy = [0.15, 0.1, 0.08, 0.08, 0.12, 0.3, 0.7, 1, 1, 0.8, 0.7, 0.7, 0.75, 0.7, 0.7, 0.8, 0.95, 1, 0.9, 0.7, 0.5, 0.4, 0.3, 0.2][Math.floor(hour)];
      const want = reduce ? 0 : Math.round(170 * busy * (1 - (state.levels['policy.trafficLimits'] || 0) * 0.15));
      while (cars.length < want) {
        const vertical = Math.random() < 0.5, line = vertical ? 6 + 13 * Math.floor(Math.random() * 10) : 4 + 11 * Math.floor(Math.random() * 10);
        cars.push({ vertical, line, p: Math.random() * (vertical ? map.H : map.W), v: (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 3), c: pick(['#E5484D', '#F2F2F2', '#F2C230', '#4DA3FF', '#2B2B2B', '#3FB566'], Math.random()) });
      }
      if (cars.length > want) cars.length = want;
      for (const car of cars) {
        car.p += car.v * dt;
        const lim = car.vertical ? map.H : map.W;
        if (car.p < 0) car.p += lim; else if (car.p > lim) car.p -= lim;
        const tx = car.vertical ? car.line : Math.floor(car.p), ty = car.vertical ? Math.floor(car.p) : car.line;
        const tt = tile(tx, ty);
        if (tt !== T.ROAD && tt !== T.BRIDGE) continue;
        const lane = car.v > 0 ? 0.6 : 0.2;
        const cxp = car.vertical ? sx(car.line + lane) : sx(car.p), cyp = car.vertical ? sy(car.p) : sy(car.line + lane);
        if (cxp < -5 || cyp < -5 || cxp > cw + 5 || cyp > ch + 5) continue;
        ctx.fillStyle = light < 0.5 ? '#FFE9A0' : car.c;
        ctx.fillRect(cxp, cyp, Math.max(1.5, car.vertical ? z * 0.22 : z * 0.38), Math.max(1.5, car.vertical ? z * 0.38 : z * 0.22));
      }
      drawPeople(t, light);
      if (x.cloud > 0.35 && !reduce) {
        const east = -Math.sin(x.dir * Math.PI / 180), north = Math.cos(x.dir * Math.PI / 180), drift = (now / 1000) * x.wind * 0.02;
        ctx.fillStyle = 'rgba(10,20,30,' + ((x.cloud - 0.35) * 0.2).toFixed(3) + ')';
        for (let k = 0; k < 9; k++) {
          const wx = ((k * 37.7 + east * drift) % (map.W + 40) + map.W + 40) % (map.W + 40) - 20, wy = ((k * 23.3 - north * drift) % (map.H + 40) + map.H + 40) % (map.H + 40) - 20;
          ctx.fillRect(sx(wx), sy(wy), 22 * z, 12 * z);
        }
      }
      if (x.rain > 0 && !reduce) {
        ctx.fillStyle = x.snow ? 'rgba(240,245,250,0.8)' : 'rgba(170,200,230,0.5)';
        const n = Math.min(420, Math.round(x.rain * 90)), seed = Math.floor(now / 90);
        for (let k = 0; k < n; k++) ctx.fillRect(h32(seed * 977 + k) * cw, h32(seed * 131 + k * 7) * ch, 1, x.snow ? 2 : 6);
      }
      if (state.aqi > 60) { ctx.fillStyle = 'rgba(150,120,80,' + Math.min(0.3, (state.aqi - 60) / 420).toFixed(3) + ')'; ctx.fillRect(0, 0, cw, ch); }
      if (showDistricts && z < 28) {
        ctx.strokeStyle = light < 0.5 ? 'rgba(230,240,245,0.3)' : 'rgba(20,33,42,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const [ax, ay, bx, by] of borders) { if (ax < vx - 1 || ay < vy - 1 || ax > vx + cw / z + 1 || ay > vy + ch / z + 1) continue; ctx.moveTo(sx(ax), sy(ay)); ctx.lineTo(sx(bx), sy(by)); }
        ctx.stroke();
      }
      if (district >= 0) {
        ctx.strokeStyle = 'rgba(255,210,90,0.95)'; ctx.lineWidth = 3;
        ctx.beginPath();
        for (const [ax, ay, bx, by] of dBorders[district]) { ctx.moveTo(sx(ax), sy(ay)); ctx.lineTo(sx(bx), sy(by)); }
        ctx.stroke();
      }
      if (showDistricts && z < 12) {
        ctx.textAlign = 'center';
        ctx.font = '700 ' + Math.max(11, Math.min(15, z * 1.8)) + 'px "Bricolage Grotesque", system-ui, sans-serif';
        for (const d of map.districts) {
          const lx = sx(d.cx + 0.5), ly = sy(d.cy + 0.5);
          if (lx < -60 || lx > cw + 60 || ly < -20 || ly > ch + 20) continue;
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(14,23,28,0.75)'; ctx.strokeText(d.name, lx, ly);
          ctx.fillStyle = d.id === district ? '#FFD25A' : dark.has(d.id) ? '#9DB4D6' : '#F3F6F7'; ctx.fillText(d.name, lx, ly);
        }
      }
      const box = (f, c) => { ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.strokeRect(sx(f.x) - 1, sy(f.y) - 1, f.w * z + 2, f.h * z + 2); };
      if (hover && hover.x !== undefined && hover !== selected && !hoverPerson) box(hover, 'rgba(255,255,255,0.7)');
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
