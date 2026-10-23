/*
 * The map of Pixel City: a top-down view you can drag, zoom and click.
 *
 * The whole city is painted once as pixel art at 16 pixels per block into an offscreen image, and repainted only
 * when something changes (nightfall, a blackout, a site opening). Panning and zooming just redraw part of that image,
 * which keeps the map smooth. Moving things (ships, traffic, turbines, smoke, rain) are drawn on top every frame.
 * Display only: traffic, smoke and sparkle are decoration; ships come from the city's simulation.
 */
(function () {
  const C = PixelUniverse.city;
  const T = C.T;
  const S = 16; // pixels per block in the world image
  const H = 3600000;
  function h32(n) { n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
  const pick = (arr, v) => arr[Math.floor(v * arr.length) % arr.length];
  const ROOF = {
    house: ['#B5523B', '#9C4A36', '#6E6E78', '#A0673E', '#C47A4F', '#7B5A4A'],
    apartment: ['#9AA3AD', '#A8ADB2', '#8E979F', '#B3AFA6'],
    office: ['#6F8DAD', '#7F9BB8', '#5F7F9F', '#8AA6C0'],
    shop: ['#D6A84C', '#C9953F', '#B98A52', '#D9B46A'],
    factory: ['#8C7F72', '#857A6E', '#968A7C'],
    warehouse: ['#A0927E', '#978A77', '#AA9D89']
  };
  const BOX = ['#C0392B', '#2E86C1', '#D4AC0D', '#27AE60', '#E67E22', '#8E44AD', '#16A085'];

  window.CityMap = function (canvas, opts) {
    const map = C.map();
    const ctx = canvas.getContext('2d');
    const world = document.createElement('canvas');
    world.width = map.W * S; world.height = map.H * S;
    const g = world.getContext('2d');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let dpr = 1, cw = 0, ch = 0;
    const cam = { x: map.W / 2, y: map.H / 2, z: 6 };
    let worldKey = '', selected = null, hover = null, district = -1, showDistricts = true;
    const siteIndex = {};
    { let k = 0; for (const f of map.features) if (f.kind === 'site') siteIndex[f.id] = k++; }
    const tile = (x, y) => (x < 0 || y < 0 || x >= map.W || y >= map.H ? T.SEA : map.tiles[y * map.W + x]);
    const isWater = (t) => t === T.SEA || t === T.RIVER;
    const isRoad = (t) => t === T.ROAD || t === T.STREET || t === T.BRIDGE;
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
    function shadowed(x, y, w, h, roof, depth) {
      px(x + depth, y + depth, w, h, 'rgba(0,0,0,0.28)');
      px(x, y, w, h, roof);
      px(x, y, w, 1, 'rgba(255,255,255,0.18)');
      px(x, y + h - 1, w, 1, 'rgba(0,0,0,0.18)');
    }
    function asTile(x, y, type) { const i = y * map.W + x, save = map.tiles[i]; map.tiles[i] = type; paintTile(x, y); map.tiles[i] = save; }
    function paintTile(x, y) {
      const i = y * map.W + x, t = map.tiles[i], X = x * S, Y = y * S, v = h32(i), v2 = h32(i + 7919), v3 = h32(i + 104729);
      const D = map.districts[map.district[i]] || { env: 0 };
      switch (t) {
        case T.SEA: case T.RIVER: {
          px(X, Y, S, S, t === T.SEA ? '#1E4A66' : '#2A6787');
          if (v < 0.5) px(X + Math.floor(v2 * 10), Y + Math.floor(v3 * 14), 4, 1, 'rgba(255,255,255,0.08)');
          const foam = 'rgba(214,232,240,0.55)';
          if (!isWater(tile(x - 1, y)) && tile(x - 1, y) !== T.BRIDGE) px(X, Y, 2, S, foam);
          if (!isWater(tile(x + 1, y)) && tile(x + 1, y) !== T.BRIDGE) px(X + S - 2, Y, 2, S, foam);
          if (!isWater(tile(x, y - 1)) && tile(x, y - 1) !== T.BRIDGE) px(X, Y, S, 2, foam);
          if (!isWater(tile(x, y + 1)) && tile(x, y + 1) !== T.BRIDGE) px(X, Y + S - 2, S, 2, foam);
          break;
        }
        case T.BEACH:
          if (x >= 108 && y >= 50 && y <= 66) { // the harbour quay is paved, with bollards along the water
            px(X, Y, S, S, '#8A857C'); px(X, Y + 7, S, 1, 'rgba(0,0,0,0.12)');
            if (isWater(tile(x + 1, y))) { px(X + S - 3, Y, 3, S, '#6F6A63'); px(X + S - 5, Y + 6, 2, 2, '#2B2B2B'); }
            break;
          }
          px(X, Y, S, S, '#D8C99A');
          for (let k = 0; k < 5; k++) px(X + Math.floor(h32(i * 5 + k) * 15), Y + Math.floor(h32(i * 7 + k) * 15), 1, 1, '#C3B27F');
          break;
        case T.GRASS:
          px(X, Y, S, S, '#7BA05B');
          for (let k = 0; k < 4; k++) px(X + Math.floor(h32(i * 3 + k) * 15), Y + Math.floor(h32(i * 11 + k) * 15), 1, 1, '#6A8F4D');
          break;
        case T.FOREST: case T.PARK:
          px(X, Y, S, S, t === T.FOREST ? '#2F5D36' : '#6AA457');
          for (let k = 0; k < (t === T.FOREST ? 4 : 2); k++) {
            const tx = X + 1 + Math.floor(h32(i * 13 + k) * 10), ty = Y + 1 + Math.floor(h32(i * 17 + k) * 10);
            px(tx + 1, ty + 1, 5, 5, 'rgba(0,0,0,0.25)'); px(tx, ty, 5, 5, t === T.FOREST ? '#3C7444' : '#3F8A44'); px(tx, ty, 2, 2, t === T.FOREST ? '#4E8A55' : '#58A85B');
          }
          break;
        case T.ROAD: case T.BRIDGE: {
          const horiz = isRoad(tile(x - 1, y)) || isRoad(tile(x + 1, y)), vert = isRoad(tile(x, y - 1)) || isRoad(tile(x, y + 1));
          px(X, Y, S, S, t === T.BRIDGE ? '#5E5A52' : '#3B4045');
          if (t === T.BRIDGE) { px(X, Y, S, 1, '#A8A090'); px(X, Y + S - 1, S, 1, '#A8A090'); }
          if (horiz && !vert) { for (let k = 0; k < S; k += 6) px(X + k, Y + 7, 3, 1, '#D9C76A'); px(X, Y, S, 1, '#2E3236'); px(X, Y + S - 1, S, 1, '#2E3236'); }
          else if (vert && !horiz) { for (let k = 0; k < S; k += 6) px(X + 7, Y + k, 1, 3, '#D9C76A'); px(X, Y, 1, S, '#2E3236'); px(X + S - 1, Y, 1, S, '#2E3236'); }
          else if (horiz && vert && t !== T.BRIDGE) { for (let k = 2; k < S - 2; k += 3) { px(X + k, Y + 1, 2, 2, '#C9CDD0'); px(X + k, Y + S - 3, 2, 2, '#C9CDD0'); } }
          break;
        }
        case T.STREET: {
          px(X, Y, S, S, '#5A6066');
          const horiz = isRoad(tile(x - 1, y)) || isRoad(tile(x + 1, y));
          if (horiz) { px(X, Y, S, 2, '#8C9196'); px(X, Y + S - 2, S, 2, '#8C9196'); } else { px(X, Y, 2, S, '#8C9196'); px(X + S - 2, Y, 2, S, '#8C9196'); }
          if (D.env > 0.1 && v < 0.55) { const tx = horiz ? X + 4 + Math.floor(v2 * 6) : X; const ty = horiz ? Y : Y + 4 + Math.floor(v2 * 6); px(tx, ty, 4, 4, '#3F7A3A'); px(tx, ty, 2, 2, '#5A9A55'); }
          break;
        }
        case T.PLAZA:
          px(X, Y, S, S, '#CFC6B4');
          for (let k = 0; k < S; k += 4) for (let j = (k / 4) % 2 * 2; j < S; j += 4) px(X + j, Y + k, 2, 2, '#C2B8A4');
          break;
        case T.HOUSE: {
          px(X, Y, S, S, '#82A862');
          const w = 8 + Math.floor(v * 3), h = 7 + Math.floor(v2 * 3), ox = 2 + Math.floor(v3 * (S - w - 4)), oy = 2 + Math.floor(v * (S - h - 4));
          shadowed(X + ox, Y + oy, w, h, pick(ROOF.house, v2), 2);
          px(X + ox, Y + oy + Math.floor(h / 2), w, 1, 'rgba(0,0,0,0.22)');
          if (v3 < 0.4) px(X + 1, Y + S - 5, 4, 4, '#3F7A3A');
          if (v < 0.25) px(X + ox + w - 3, Y + oy + 1, 2, 2, '#5B4A42');
          break;
        }
        case T.APARTMENT: {
          px(X, Y, S, S, '#8F969C');
          shadowed(X + 1, Y + 1, 13, 13, pick(ROOF.apartment, v), 3);
          px(X + 3, Y + 3, 3, 2, '#C7CDD2'); px(X + 9, Y + 8, 2, 3, '#C7CDD2');
          if (v2 < 0.5) px(X + 8, Y + 3, 4, 3, '#6F7880');
          break;
        }
        case T.OFFICE: {
          px(X, Y, S, S, '#B9BEC2');
          shadowed(X + 1, Y + 1, 12, 12, pick(ROOF.office, v), 4);
          for (let k = 3; k < 12; k += 3) { px(X + 1 + k, Y + 1, 1, 12, 'rgba(210,228,240,0.35)'); px(X + 1, Y + 1 + k, 12, 1, 'rgba(210,228,240,0.25)'); }
          if (v2 < 0.3) px(X + 5, Y + 5, 4, 4, '#E5484D');
          break;
        }
        case T.SHOP: {
          px(X, Y, S, S, '#A9A08C');
          shadowed(X + 1, Y + 2, 14, 10, pick(ROOF.shop, v), 2);
          const awn = pick(['#E5484D', '#2E86C1', '#27AE60', '#8E44AD'], v2);
          for (let k = 0; k < 14; k += 2) px(X + 1 + k, Y + 12, 1, 2, k % 4 ? '#F2F2F2' : awn);
          break;
        }
        case T.FACTORY: {
          px(X, Y, S, S, '#7A7066');
          shadowed(X + 1, Y + 2, 14, 11, pick(ROOF.factory, v), 3);
          for (let k = 0; k < 11; k += 3) px(X + 1, Y + 2 + k, 14, 1, 'rgba(0,0,0,0.2)');
          if (v2 < 0.5) { px(X + 11, Y, 3, 5, '#5E5A55'); px(X + 11, Y, 3, 1, '#3E3A36'); }
          break;
        }
        case T.WAREHOUSE: {
          px(X, Y, S, S, '#8E8577');
          shadowed(X + 1, Y + 1, 14, 12, pick(ROOF.warehouse, v), 2);
          px(X + 1, Y + 7, 14, 1, 'rgba(0,0,0,0.2)');
          px(X + 3, Y + 13, 3, 2, '#3B4045'); px(X + 9, Y + 13, 3, 2, '#3B4045');
          break;
        }
        case T.DOCK:
          px(X, Y, S, S, '#6F6A63');
          for (let k = 0; k < 3; k++) for (let j = 0; j < 2; j++) if (h32(i * 31 + k * 3 + j) < 0.7) px(X + 1 + j * 7, Y + 1 + k * 5, 6, 4, pick(BOX, h32(i * 37 + k + j * 5)));
          break;
        default:
          px(X, Y, S, S, '#A8996F');
      }
    }
    // a stepped circle, for domes, tanks and ponds
    function disc(cx, cy, r, c) { for (let y = -r; y <= r; y++) { const w = Math.floor(Math.sqrt(r * r - y * y)); px(cx - w, cy + y, w * 2, 1, c); } }
    function fillAs(f, type) { for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) asTile(x, y, type); }
    function paintFeature(f, site, night) {
      const X = f.x * S, Y = f.y * S, W = f.w * S, HH = f.h * S;
      if (f.kind === 'landmark') {
        if (f.type === 'senate') {
          px(X, Y, W, HH, '#CFC6B4');
          shadowed(X + 4, Y + 10, W - 8, HH - 16, '#ECE6D8', 4);
          for (let k = 0; k < 9; k++) px(X + 8 + k * 11, Y + HH - 14, 4, 8, '#F8F4EA');
          disc(X + W / 2, Y + 30, 16, '#D7CDB6'); disc(X + W / 2, Y + 30, 11, '#E5DCC6'); disc(X + W / 2 - 3, Y + 27, 4, '#F3EEE2');
          px(X + W / 2, Y + 2, 1, 12, '#3B4045'); px(X + W / 2 + 1, Y + 2, 7, 4, '#3FA66A');
        } else if (f.type === 'stadium') {
          px(X, Y, W, HH, '#8F969C');
          shadowed(X + 4, Y + 4, W - 8, HH - 8, '#5F6B70', 3);
          for (let k = 0; k < (W - 16) / 3; k++) { px(X + 8 + k * 3, Y + 7, 2, 4, pick(['#E5484D', '#F2F2F2', '#2E86C1'], h32(k))); px(X + 8 + k * 3, Y + HH - 11, 2, 4, pick(['#E5484D', '#F2F2F2', '#2E86C1'], h32(k + 50))); }
          px(X + 14, Y + 16, W - 28, HH - 32, '#0E171C');
          px(X + 18, Y + HH / 2 - 14, W - 40, 1, 'rgba(255,255,255,0.18)'); px(X + 18, Y + HH / 2 + 14, W - 40, 1, 'rgba(255,255,255,0.18)');
          for (let k = 0; k < 8; k++) px(X + W - 26, Y + 22 + k * 4, 2, 2, k % 2 ? '#F2F2F2' : '#14212A');
          for (const [cx, cy] of [[X + 2, Y + 2], [X + W - 8, Y + 2], [X + 2, Y + HH - 8], [X + W - 8, Y + HH - 8]]) { px(cx, cy, 6, 6, '#3B4045'); px(cx + 1, cy + 1, 4, 4, night ? '#FFF2C2' : '#C9CDD0'); }
        } else if (f.type === 'bureau') {
          px(X, Y, W, HH, '#CFC6B4');
          shadowed(X + 6, Y + 6, W - 12, HH - 12, '#C8D3DA', 6);
          disc(X + W / 2, Y + HH / 2, 9, '#F3F6F7'); disc(X + W / 2, Y + HH / 2, 4, '#7F9BB8');
          px(X + W - 12, Y + 8, 3, 3, '#E8743B');
        } else if (f.type === 'bookmaker') {
          px(X, Y, W, HH, '#A9A08C');
          shadowed(X + 2, Y + 3, W - 4, HH - 8, '#7A4E3A', 3);
          px(X + 6, Y + 8, W - 12, 10, '#E5C15A'); px(X + 8, Y + 11, W - 16, 4, '#7A4E3A');
          for (let k = 0; k < W - 4; k += 4) px(X + 2 + k, Y + HH - 5, 2, 3, k % 8 ? '#F2F2F2' : '#2E7D4F');
        } else if (f.type === 'press') {
          px(X, Y, W, HH, '#B9BEC2');
          shadowed(X + 2, Y + 2, W - 4, HH - 4, '#DAD6CC', 3);
          px(X + 6, Y + 6, W - 12, 6, '#14212A');
          for (let k = 0; k < 4; k++) px(X + 8 + k * 12, Y + 18, 8, 16, '#B5AFA2');
        } else if (f.type === 'gas') {
          px(X, Y, W, HH, '#8D8F8A');
          disc(X + 14, Y + 20, 11, '#5E615C'); disc(X + 13, Y + 19, 10, '#D2D5D0');
          disc(X + 44, Y + 20, 11, '#5E615C'); disc(X + 43, Y + 19, 10, '#D2D5D0');
          px(X + 24, Y + 18, 10, 2, '#5E615C');
        } else if (f.type === 'port') {
          px(X, Y, W, HH, '#6F6A63');
          for (let k = 0; k < 10; k++) for (let j = 0; j < 3; j++) if (h32(k * 13 + j) < 0.75) px(X + 4 + j * 14, Y + 6 + k * 12, 12, 8, pick(BOX, h32(k * 7 + j * 3)));
          for (let k = 0; k < 3; k++) { const cy = Y + 14 + k * 40; px(X + W - 10, cy, 3, 26, '#F2C230'); px(X + W - 22, cy, 24, 3, '#F2C230'); px(X + W - 22, cy + 22, 24, 3, '#D4A82A'); }
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
        shadowed(X + 4, Y + 24, W - 8, HH - 30, '#77716A', 3);
        disc(X + 18, Y + 14, 8, '#3E3A36'); disc(X + 18, Y + 14, 6, '#8A847C'); disc(X + 42, Y + 14, 8, '#3E3A36'); disc(X + 42, Y + 14, 6, '#8A847C');
        for (let k = 0; k < 6; k++) disc(X + W - 14 + (k % 2) * 4, Y + 30 + Math.floor(k / 2) * 6, 5, '#1E1E1E');
        if (night) for (let k = 0; k < 6; k++) px(X + 10 + k * 10, Y + HH - 8, 2, 2, '#FFB347');
      } else if (f.type === 'solar') {
        px(X, Y, W, HH, '#C9C1A3');
        for (let y = 3; y < HH - 4; y += 9) for (let x = 3; x < W - 4; x += 12) { px(X + x, Y + y, 10, 6, '#1F3B66'); px(X + x, Y + y, 10, 1, '#5D86C0'); px(X + x + 5, Y + y, 1, 6, '#2C4C7E'); }
      } else if (f.type === 'wind') {
        fillAs(f, T.GRASS);
      } else if (f.type === 'park') {
        px(X, Y, W, HH, '#63A653');
        px(X, Y + HH / 2 - 2, W, 4, '#D9CFA8'); px(X + W / 2 - 2, Y, 4, HH, '#D9CFA8');
        disc(X + W / 2 + 12, Y + HH / 2 + 14, 8, '#3E7FA8'); disc(X + W / 2 + 11, Y + HH / 2 + 13, 3, '#6FA8CF');
        for (let k = 0; k < 9; k++) { const tx = X + 4 + Math.floor(h32(f.id * 9 + k) * (W - 12)), ty = Y + 4 + Math.floor(h32(f.id * 11 + k) * (HH - 12)); px(tx + 1, ty + 1, 6, 6, 'rgba(0,0,0,0.25)'); px(tx, ty, 6, 6, '#2F6E35'); px(tx, ty, 2, 2, '#4E9A55'); }
        px(X + 6, Y + 6, 10, 8, '#E8743B'); px(X + 8, Y + 8, 6, 4, '#F2C230');
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
      for (const f of map.features) paintFeature(f, f.kind === 'site' ? state.sites[siteIndex[f.id]] : null, night);
      if (light < 1) { g.fillStyle = 'rgba(8,14,30,' + ((1 - light) * 0.66).toFixed(3) + ')'; g.fillRect(0, 0, world.width, world.height); }
      if (night) {
        for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) {
          const i = y * map.W + x, t = map.tiles[i], p = LIT[t];
          if (map.owner[i] >= 0 || dark.has(map.district[i])) continue;
          if (t === T.ROAD && (x + y) % 2 === 0) { px(x * S + 1, y * S + 1, 2, 2, 'rgba(255,236,170,0.7)'); continue; }
          if (!p) continue;
          for (let k = 0; k < 6; k++) if (h32(i * 6 + k) < p) px(x * S + 3 + (k % 3) * 4, y * S + 3 + Math.floor(k / 3) * 6, 2, 2, 'rgba(255,214,120,' + (0.55 + h32(i + k) * 0.45).toFixed(2) + ')');
        }
      }
      if (dark.size) { g.fillStyle = 'rgba(10,20,45,0.4)'; for (let i = 0; i < map.tiles.length; i++) if (dark.has(map.district[i])) g.fillRect((i % map.W) * S, Math.floor(i / map.W) * S, S, S); }
    }
    function ensureWorld(state, light) {
      const key = Math.round(light * 8) + '|' + (state.dark || []).join(',') + '|' + state.sites.map((s) => s.state[0]).join('');
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

    // ================================================================ every frame
    const cars = [];
    let lastNow = performance.now();
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
      else if (s.type === 'tanker') { ctx.fillStyle = '#C9CDD0'; ctx.fillRect(x + z * 0.4, y + h * 0.42, w - z * 1.4, h * 0.16); for (let k = 0; k < 3; k++) { ctx.fillStyle = '#D9D9D9'; ctx.beginPath(); ctx.arc(x + z * (0.9 + k * 1.05), y + h / 2, h * 0.28, 0, 6.3); ctx.fill(); } }
    }
    function frame(state, light, x, t) {
      const now = performance.now(), dt = Math.min(0.1, (now - lastNow) / 1000);
      lastNow = now;
      ensureWorld(state, light);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = cam.z < S;
      ctx.fillStyle = '#0E171C'; ctx.fillRect(0, 0, cw, ch);
      const z = cam.z, vx = cam.x - cw / 2 / z, vy = cam.y - ch / 2 / z;
      ctx.drawImage(world, vx * S, vy * S, (cw / z) * S, (ch / z) * S, 0, 0, cw, ch);
      const dark = new Set(state.dark || []);
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
            ctx.fillStyle = '#C9CDD0'; ctx.fillRect(cx - z * 0.1, cy - z * 0.1, z * 0.2, z * 0.2);
          }
        } else if (f.type === 'coal' && site && site.state === 'operating' && !reduce) {
          const share = state.grid.coal / Math.max(1, state.ops.coal * C.MW.coal);
          for (let s2 = 0; s2 < 2; s2++) for (let k = 0; k < 7; k++) {
            const p = ((now / 1600 + k / 7 + s2 * 0.37) % 1), a = (1 - p) * 0.5 * share;
            if (a < 0.02) continue;
            const ex = -Math.sin(x.dir * Math.PI / 180) * p * z * 4 * (x.wind / 30), ey = Math.cos(x.dir * Math.PI / 180) * p * z * 4 * (x.wind / 30) - p * z * 2;
            ctx.fillStyle = 'rgba(205,205,200,' + a.toFixed(3) + ')';
            const sz = z * (0.5 + p * 1.8);
            ctx.fillRect(fx + (1.1 + s2 * 1.5) * z + ex - sz / 2, fy + 0.9 * z + ey - sz / 2, sz, sz);
          }
        } else if (f.type === 'stadium' && z >= 4) {
          const lap = (t / 86400000) % 1, span = f.w - 3.6;
          ctx.fillStyle = '#FF3B30'; ctx.fillRect(fx + (1.3 + lap * span) * z, fy + (f.h / 2 - 0.6) * z, Math.max(2, z * 0.28), Math.max(2, z * 0.28));
          ctx.fillStyle = '#23B5E8'; ctx.fillRect(fx + (1.3 + Math.max(0, lap - 0.006) * span) * z, fy + (f.h / 2 + 0.4) * z, Math.max(2, z * 0.28), Math.max(2, z * 0.28));
        }
      }
      for (const s of state.ships || []) drawShip(s);
      const hour = (t % 86400000) / H, busy = [0.15, 0.1, 0.08, 0.08, 0.12, 0.3, 0.7, 1, 1, 0.8, 0.7, 0.7, 0.75, 0.7, 0.7, 0.8, 0.95, 1, 0.9, 0.7, 0.5, 0.4, 0.3, 0.2][Math.floor(hour)];
      const want = reduce ? 0 : Math.round(170 * busy * (1 - (state.levels['policy.trafficLimits'] || 0) * 0.15));
      while (cars.length < want) {
        const vertical = Math.random() < 0.5, line = vertical ? 6 + 13 * Math.floor(Math.random() * 10) : 4 + 11 * Math.floor(Math.random() * 10);
        cars.push({ vertical, line, p: Math.random() * (vertical ? map.H : map.W), v: (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 3), c: pick(['#E5484D', '#F2F2F2', '#F2C230', '#4DA3FF', '#2B2B2B', '#27AE60'], Math.random()) });
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
      if (x.cloud > 0.35 && !reduce) {
        const east = -Math.sin(x.dir * Math.PI / 180), north = Math.cos(x.dir * Math.PI / 180), drift = (now / 1000) * x.wind * 0.02;
        ctx.fillStyle = 'rgba(10,20,30,' + ((x.cloud - 0.35) * 0.22).toFixed(3) + ')';
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
      if (hover && hover.x !== undefined && hover !== selected) box(hover, 'rgba(255,255,255,0.7)');
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
        cam.x = dragFrom.cx - dx / cam.z; cam.y = dragFrom.cy - dy / cam.z; clampCam();
        canvas.style.cursor = 'grabbing';
        return;
      }
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
    canvas.addEventListener('pointerleave', () => { hover = null; });
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
      destroy: () => window.removeEventListener('resize', resize)
    };
  };
})();
