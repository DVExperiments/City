/*
 * Pixel City: the map, its construction, its power grid and its pollution.
 *
 * Part of the Pixel Universe's world loop. In this first phase the city only reads upstream:
 *   - the Weather Bureau's climate (a root): temperature, wind, sun, rain
 *   - the Pixel Senate's environmental laws, which take effect at 00:00 UTC the day after they pass
 * Both must load first. Without them the city would compute a different history, so it refuses to run.
 *
 * Conventions: UTC, seeded randomness only (seeds start "city:"), and simulation maths uses only
 * + - * / Math.floor Math.imul. Registers window.PixelUniverse.city.
 */
(function (root) {
  'use strict';

  const VERSION = '0.2.0';
  const MIN = 60000, H = 3600000, DAY = 86400000;
  const EPOCH = Date.UTC(2025, 11, 3);
  const PI = 3.141592653589793, TAU = 6.283185307179586;
  const W = 160, HT = 120;

  // ---------------------------------------------------------------- shared RNG (identical to Glacial's)
  function rng(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  // one well-mixed number per key: hashes of similar keys are similar, so they go through the generator first
  const unit = (s) => rng(hash('city:' + s))();
  const seeded = (s) => rng(hash('city:' + s));

  // ---------------------------------------------------------------- small maths
  const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
  const abs = (x) => (x < 0 ? -x : x);
  const rd1 = (x) => Math.floor(x * 10 + 0.5) / 10;
  const rnd = (x) => Math.floor(x + 0.5);
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const dayOf = (ms) => ms - (ms % DAY);
  const ymd = (ms) => { const d = new Date(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
  const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');
  function bh(x) { const p = x * (PI - x); return (16 * p) / (5 * PI * PI - 4 * p); }
  function sin(x) { x = x - Math.floor(x / TAU) * TAU; return x < PI ? bh(x) : -bh(x - PI); }
  function noise1(key, x, period) {
    const v = x / period, i = Math.floor(v), f = v - i, s = f * f * (3 - 2 * f);
    const a = unit(key + ':' + i), b = unit(key + ':' + (i + 1));
    return (a + (b - a) * s) * 2 - 1;
  }

  // ---------------------------------------------------------------- upstream
  const climate = () => root.PixelUniverse && root.PixelUniverse.climate;
  // the city's clock comes from the Weather Bureau, the universe's one source of truth for it
  const offsetAt = (t) => (climate() && climate().offsetAt ? climate().offsetAt(t) : 0);
  const renewalAt = () => (climate() && climate().renewal ? climate().renewal : RENEWAL_FALLBACK);
  const senate = () => root.PixelUniverse && root.PixelUniverse.senate;
  const ready = () => !!(climate() && senate() && (!senate().ready || senate().ready()));

  // ================================================================ the map
  // Tile types. The map is generated once from fixed seeds and never changes; what changes over time is
  // which reserved sites (power stations, parks, wildlife zones) are built, under construction or empty.
  const T = { SEA: 0, BEACH: 1, GRASS: 2, FOREST: 3, ROAD: 4, STREET: 5, BRIDGE: 6, HOUSE: 7, APARTMENT: 8, SHOP: 9, OFFICE: 10,
    FACTORY: 11, WAREHOUSE: 12, DOCK: 13, PARK: 14, RIVER: 15, PLAZA: 16, SITE: 17, LANDMARK: 18 };
  const TILE_NAMES = ['Sea', 'Beach', 'Open ground', 'Forest', 'Main road', 'Street', 'Bridge', 'Houses', 'Apartments', 'Shops', 'Offices',
    'Factories', 'Warehouses', 'Docks', 'Garden', 'River', 'Plaza', 'Reserved site', 'Landmark'];
  const RESIDENTS = { 7: 6, 8: 34, 9: 2 };
  const JOBS = { 9: 6, 10: 30, 11: 22, 12: 8, 13: 12 };

  const coastX = (y) => 131 + 6 * sin(y / 9) + 3 * noise1('coast', y, 7);
  const inHarbour = (x, y) => y >= 52 && y <= 64 && x >= 116;
  const riverY = (x) => 28 + (x / 118) * 28 + 3 * sin(x / 11) + 1.5 * noise1('river', x, 9);
  const DOWNTOWN = { x: 70, y: 58 };

  function buildMap(profiles) {
    const N = W * HT;
    const tiles = new Uint8Array(N), district = new Int8Array(N).fill(-1), owner = new Int16Array(N).fill(-1);
    const at = (x, y) => y * W + x;
    const isLand = (x, y) => x < coastX(y) && !inHarbour(x, y);
    // terrain
    for (let y = 0; y < HT; y++) for (let x = 0; x < W; x++) {
      const i = at(x, y);
      if (!isLand(x, y)) tiles[i] = T.SEA;
      else if (x >= coastX(y) - 2 || (inHarbour(x + 2, y) && y >= 52 && y <= 64)) tiles[i] = T.BEACH;
      else if (x < 8 + 4 * noise1('forest', y, 11)) tiles[i] = T.FOREST;
      else tiles[i] = T.GRASS;
    }
    // districts: sixteen regions around jittered seeds, named after the Senate's electorates
    const seeds = [];
    const r = seeded('map:districts');
    for (let k = 0; k < 16; k++) {
      const gx = k % 4, gy = Math.floor(k / 4);
      seeds.push({ x: 18 + gx * 29 + (r() - 0.5) * 12, y: 14 + gy * 28 + (r() - 0.5) * 10 });
    }
    for (let y = 0; y < HT; y++) for (let x = 0; x < W; x++) {
      if (tiles[at(x, y)] === T.SEA) continue;
      let best = 0, bd = 1e9;
      for (let k = 0; k < 16; k++) { const dx = x - seeds[k].x, dy = (y - seeds[k].y) * 1.1, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = k; } }
      district[at(x, y)] = best;
    }
    // roads: an arterial grid, local streets between, and a coast road
    const isArterialX = (x) => (x - 6) % 13 === 0, isArterialY = (y) => (y - 4) % 11 === 0;
    for (let y = 0; y < HT; y++) for (let x = 0; x < W; x++) {
      const i = at(x, y);
      if (tiles[i] === T.SEA || tiles[i] === T.BEACH) continue;
      if (isArterialX(x) || isArterialY(y)) tiles[i] = T.ROAD;
      else if (tiles[i] !== T.FOREST && ((x - 6) % 13 === 6 || (y - 4) % 11 === 5)) tiles[i] = T.STREET;
    }
    for (let y = 0; y < HT; y++) {
      const cx = Math.floor(coastX(y)) - 3;
      if (cx > 0 && !inHarbour(cx + 3, y) && tiles[at(cx, y)] !== T.SEA) tiles[at(cx, y)] = T.ROAD;
    }
    // the river, with bridges where the main roads cross
    for (let x = 0; x < W; x++) {
      const ry = Math.floor(riverY(x));
      for (let dy = 0; dy < 2; dy++) {
        const y = ry + dy;
        if (y < 0 || y >= HT || tiles[at(x, y)] === T.SEA) continue;
        tiles[at(x, y)] = isArterialX(x) ? T.BRIDGE : T.RIVER;
      }
    }
    // features: landmarks and reserved sites. Later features never overlap earlier ones.
    const features = [];
    const free = (x, y, w, h) => {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= HT) return false;
        const t = tiles[at(xx, yy)];
        if (owner[at(xx, yy)] >= 0 || t === T.SEA || t === T.RIVER || t === T.BRIDGE || t === T.BEACH) return false;
      }
      return true;
    };
    function place(f) {
      f.id = features.length;
      f.district = district[at(f.x + (f.w >> 1), f.y + (f.h >> 1))];
      for (let yy = f.y; yy < f.y + f.h; yy++) for (let xx = f.x; xx < f.x + f.w; xx++) { owner[at(xx, yy)] = f.id; tiles[at(xx, yy)] = f.kind === 'landmark' ? T.LANDMARK : T.SITE; }
      features.push(f);
      return f;
    }
    function near(x0, y0, w, h, rad, key) {
      const rr = seeded('place:' + key);
      for (let tries = 0; tries < 400; tries++) {
        const x = Math.floor(x0 + (rr() - 0.5) * 2 * rad), y = Math.floor(y0 + (rr() - 0.5) * 2 * rad);
        if (free(x, y, w, h)) return { x, y };
      }
      return null;
    }
    const landmark = (type, name, x, y, w, h, link) => { const p = free(x, y, w, h) ? { x, y } : near(x, y, w, h, 8, type); if (p) place({ kind: 'landmark', type, name, x: p.x, y: p.y, w, h, link }); };
    landmark('senate', 'The Senate House', DOWNTOWN.x - 3, DOWNTOWN.y - 2, 7, 5, 'https://dvexperiments.github.io/Senate/');
    landmark('stadium', 'The Glacial Stadium', 34, 66, 15, 9, 'https://dvexperiments.github.io/Glacial/');
    landmark('bureau', 'Weather Bureau Tower', 24, 16, 3, 3, 'https://dvexperiments.github.io/Weather/');
    landmark('bookmaker', 'The Bookmaker', 50, 70, 4, 3, null);
    landmark('press', 'The Newspaper Office', DOWNTOWN.x + 6, DOWNTOWN.y + 4, 4, 3, null);
    landmark('gas', 'Harbour Gas Station', 112, 66, 4, 3, null);
    { // the port sits on the quay, as close to the berths as the land allows
      let best = null, bd = 1e9;
      for (let y = 48; y <= 66; y++) for (let x = 100; x <= 114; x++) {
        if (!free(x, y, 4, 8)) continue;
        const d = (113 - x) * (113 - x) + (58 - y - 4) * (58 - y - 4);
        if (d < bd) { bd = d; best = { x, y }; }
      }
      if (best) place({ kind: 'landmark', type: 'port', name: 'The Port', x: best.x, y: best.y, w: 4, h: 8, link: null });
    }
    // reserved sites, in the order the Senate's laws would fill them
    const site = (type, name, index, w, h, x0, y0, rad) => { const p = near(x0, y0, w, h, rad, type + ':' + index); if (p) place({ kind: 'site', type, name, index, x: p.x, y: p.y, w, h }); };
    const dn = (x, y) => (profiles[district[at(x, y)]] || { name: 'the city' }).name;
    for (let k = 0; k < 6; k++) site('coal', 'Harbour Coal Plant No. ' + (k + 1), k, 5, 4, 100 + (k % 3) * 7, 74 + Math.floor(k / 3) * 7, 4);
    for (let k = 0; k < 5; k++) { const x = 30 + k * 18, y = 6; site('solar', '', k, 6, 4, x, y, 4); }
    for (let k = 0; k < 5; k++) { const y = 10 + k * 8; site('wind', '', k, 2, 6, Math.floor(coastX(y)) - 9, y, 3); }
    const rp = seeded('map:parks');
    for (let k = 0; k < 20; k++) site('park', '', k, 4, 4, 20 + rp() * 90, 12 + rp() * 96, 6);
    for (let k = 0; k < 10; k++) site('wildlife', '', k, 6, 6, 4 + (k % 2) * 6, 8 + k * 11, 3);
    for (const f of features) if (f.kind === 'site' && !f.name) {
      const d = dn(f.x, f.y);
      f.name = f.type === 'solar' ? d + ' Solar Farm' : f.type === 'wind' ? d + ' Wind Farm' : f.type === 'park' ? d + ' ' + ['Commons', 'Gardens', 'Green', 'Park', 'Reserve'][f.index % 5]
        : 'Western Ranges Wildlife Zone ' + (f.index + 1);
    }
    // land use, block by block, from each district's character and distance from downtown
    const blockR = seeded('map:blocks');
    for (let by = 0; by < HT; by += 4) for (let bx = 0; bx < W; bx += 4) {
      const k = district[at(bx + 1 < W ? bx + 1 : W - 1, by + 1 < HT ? by + 1 : HT - 1)];
      const P = profiles[k] || { env: 0, aes: 0 };
      const dx = bx - DOWNTOWN.x, dy = by - DOWNTOWN.y;
      const d = clamp((abs(dx) + abs(dy)) / 90, 0, 1);
      const harbour = bx > 95 && by > 50;
      const wts = {
        [T.OFFICE]: clamp(0.65 - d * 1.2, 0, 1) * (1 + P.aes * 0.6),
        [T.APARTMENT]: (0.3 - d * 0.2) * (1 + P.aes * 0.5) + 0.04,
        [T.SHOP]: 0.14 - d * 0.06,
        [T.HOUSE]: 0.3 + d * 0.5 - P.aes * 0.15,
        [T.FACTORY]: (P.env < 0 ? -P.env * 0.55 : 0.03) + (harbour ? 0.35 : 0),
        [T.WAREHOUSE]: (P.env < 0 ? -P.env * 0.3 : 0.02) + (harbour ? 0.3 : 0),
        [T.PARK]: P.env > 0 ? P.env * 0.12 : 0.02
      };
      let tot = 0;
      for (const key in wts) tot += wts[key] > 0 ? wts[key] : 0;
      let v = blockR() * tot, choice = T.HOUSE;
      for (const key in wts) { const w = wts[key] > 0 ? wts[key] : 0; v -= w; if (v < 0) { choice = +key; break; } }
      if (harbour && bx >= 104 && by >= 50 && by <= 68 && blockR() < 0.6) choice = T.DOCK;
      for (let y = by; y < by + 4 && y < HT; y++) for (let x = bx; x < bx + 4 && x < W; x++) {
        const i = at(x, y);
        if (tiles[i] === T.GRASS) tiles[i] = choice;
      }
    }
    // a plaza in front of the Senate
    const sen = features.find((f) => f.type === 'senate');
    if (sen) for (let x = sen.x - 1; x < sen.x + sen.w + 1; x++) { const y = sen.y + sen.h; if (y < HT && tiles[at(x, y)] !== T.SEA && owner[at(x, y)] < 0) tiles[at(x, y)] = T.PLAZA; }
    // districts: names, size, people
    const districts = profiles.map((p, k) => ({ id: k, name: p.name, env: p.env, aes: p.aes, tiles: 0, residents: 0, jobs: 0, cx: 0, cy: 0, uses: {} }));
    for (let i = 0; i < N; i++) {
      const k = district[i];
      if (k < 0) continue;
      const D = districts[k];
      D.tiles++; D.cx += i % W; D.cy += Math.floor(i / W);
      D.residents += RESIDENTS[tiles[i]] || 0; D.jobs += JOBS[tiles[i]] || 0;
      D.uses[tiles[i]] = (D.uses[tiles[i]] || 0) + 1;
    }
    for (const D of districts) { D.cx = rnd(D.cx / (D.tiles || 1)); D.cy = rnd(D.cy / (D.tiles || 1)); }
    let residents = 0;
    for (const D of districts) residents += D.residents;
    // berths: the first stretch of open water along the harbour, row by row
    const berths = [];
    for (const yb of [53, 55, 57, 59, 61, 63]) {
      let bx = -1;
      for (let x = 96; x < W; x++) if (tiles[at(x, yb)] === T.SEA && tiles[at(x, yb + 1)] === T.SEA) { bx = x; break; }
      if (bx >= 0) berths.push({ x: bx, y: yb });
    }
    return { W, H: HT, tiles, district, owner, features, districts, residents, berths, mouth: { x: W + 3, y: 58 } };
  }

  // ================================================================ the Renewal
  // From the Renewal (the Weather Bureau's renewal date, 1 November 2026) the city keeps City Standard Time and stands
  // renewed: the same coast, river, districts, roads and reserved sites, with new buildings for the universe's newer
  // institutions, plots for those still to come, and town squares where residents gather. Homes the new buildings
  // replace are gone, so the population is a little smaller. Everything before the Renewal is unchanged.
  const RENEWAL_FALLBACK = Date.UTC(2026, 10, 1);
  const URL_BASE = 'https://dvexperiments.github.io/';
  const NEW_BUILDINGS = [
    // type, name, width, height, near x, near y, link, planned, opens (a planned building opens at this moment)
    ['museum', 'The Museum of the Pixel Universe', 6, 4, 56, 52, URL_BASE + 'Museum/', false],
    ['census', 'The Census Office', 4, 3, 82, 52, URL_BASE + 'City/census.html', false],
    ['radio', 'Pixel FM Studios', 4, 4, 62, 30, URL_BASE + 'PixelFM/', false],
    ['observatory', 'The Universe Observatory', 5, 5, 104, 16, URL_BASE + 'Universe/', false],
    ['bank', 'The Bank of Pixel City', 5, 4, 76, 46, null, true],
    ['jobs', 'The Job Centre', 4, 3, 64, 68, null, true],
    ['school', 'Pixel High School', 8, 5, 38, 40, URL_BASE + 'PixelHigh/', true, Date.UTC(2026, 10, 15, 20, 30)], // 8:30am, 16 November, city time
    ['university', 'Pixel University', 10, 7, 84, 86, null, true]
  ];
  function renew(m) {
    const at = (x, y) => y * m.W + x;
    const ok = new Set([T.HOUSE, T.APARTMENT, T.SHOP, T.OFFICE, T.FACTORY, T.WAREHOUSE, T.GRASS, T.PARK, T.STREET, T.PLAZA]);
    const fits = (x, y, w, h) => {
      if (x < 1 || y < 1 || x + w >= m.W || y + h >= m.H) return false;
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { const i = at(xx, yy); if (m.owner[i] >= 0 || !ok.has(m.tiles[i]) || m.district[i] < 0) return false; }
      return true;
    };
    const spot = (x0, y0, w, h) => { // the nearest free ground, searching outwards
      for (let r = 0; r < 30; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if ((dx < 0 ? -dx : dx) !== r && (dy < 0 ? -dy : dy) !== r) continue;
        if (fits(x0 + dx, y0 + dy, w, h)) return { x: x0 + dx, y: y0 + dy };
      }
      return null;
    };
    for (const [type, name, w, h, x0, y0, link, planned, opens] of NEW_BUILDINGS) {
      const p = spot(x0, y0, w, h);
      if (!p) continue;
      const f = { kind: 'landmark', type, name, x: p.x, y: p.y, w, h, link, planned, opens: opens || null, id: m.features.length };
      f.district = m.district[at(p.x + (w >> 1), p.y + (h >> 1))];
      for (let yy = p.y; yy < p.y + h; yy++) for (let xx = p.x; xx < p.x + w; xx++) { m.owner[at(xx, yy)] = f.id; m.tiles[at(xx, yy)] = T.LANDMARK; }
      m.features.push(f);
    }
    for (const f of m.features) {
      if (f.type === 'bookmaker') f.link = URL_BASE + 'Bookmaker/';
      if (f.type === 'press') { f.link = URL_BASE + 'DailyPixel/'; f.name = 'The Daily Pixel'; }
    }
    // a town square at the heart of each district, where residents meet
    m.squares = [];
    for (const D of m.districts) {
      const p = spot(D.cx - 1, D.cy - 1, 3, 3);
      if (!p) continue;
      for (let yy = p.y; yy < p.y + 3; yy++) for (let xx = p.x; xx < p.x + 3; xx++) m.tiles[at(xx, yy)] = T.PLAZA;
      m.squares.push({ district: D.id, x: p.x, y: p.y, w: 3, h: 3, name: D.name + ' Square' });
    }
    // count the people again
    for (const D of m.districts) { D.tiles = 0; D.residents = 0; D.jobs = 0; D.uses = {}; }
    for (let i = 0; i < m.tiles.length; i++) {
      const k = m.district[i];
      if (k < 0) continue;
      const D = m.districts[k];
      D.tiles++; D.residents += RESIDENTS[m.tiles[i]] || 0; D.jobs += JOBS[m.tiles[i]] || 0;
      D.uses[m.tiles[i]] = (D.uses[m.tiles[i]] || 0) + 1;
    }
    m.residents = 0;
    for (const D of m.districts) m.residents += D.residents;
    m.era = 2;
    return m;
  }

  // ================================================================ construction over time
  const SITE_FOR = { coal: 'policy.coalPlants', solar: 'policy.solarSubsidy', wind: 'policy.windFarms', park: 'policy.parks', wildlife: 'policy.wildlifeZones' };
  const BUILD_DAYS = { coal: 30, solar: 10, wind: 14, park: 5, wildlife: 3 };
  const CLEAR_DAYS = 5;
  const DEFAULTS = { 'policy.coalPlants': 3, 'policy.solarSubsidy': 1, 'policy.windFarms': 0, 'policy.parks': 2, 'policy.wildlifeZones': 0,
    'policy.emissionsCap': 0, 'policy.trafficLimits': 0, 'policy.constructionBudget': 3 };

  /** For each policy, the times its level changed: [{ ms, level }], starting with the default at the epoch. */
  function timelines(to) {
    const out = {};
    for (const k in DEFAULTS) out[k] = [{ ms: EPOCH, level: DEFAULTS[k] }];
    for (const p of senate().policyBetween(EPOCH, to)) for (const k in DEFAULTS) {
      const tl = out[k];
      if (p.levels[k] !== tl[tl.length - 1].level) tl.push({ ms: p.ms, level: p.levels[k] });
    }
    return out;
  }
  const levelAt = (tl, t) => { let v = tl[0].level; for (const e of tl) { if (e.ms > t) break; v = e.level; } return v; };
  /** What a reserved site is at time t: empty, building, operating or clearing. */
  function siteState(f, tl, t) {
    let on = null, off = null;
    for (const e of tl) {
      if (e.ms > t) break;
      if (e.level > f.index && on === null) { on = e.ms; off = null; }
      else if (e.level <= f.index && on !== null) { off = e.ms; on = null; }
    }
    if (on !== null) {
      const since = on === EPOCH ? EPOCH - 400 * DAY : on;
      const done = since + BUILD_DAYS[f.type] * DAY;
      return t < done ? { state: 'building', since, done } : { state: 'operating', since: done };
    }
    if (off !== null && t < off + CLEAR_DAYS * DAY) return { state: 'clearing', since: off, done: off + CLEAR_DAYS * DAY };
    return { state: 'empty' };
  }

  // ================================================================ the power grid
  const MW = { coal: 120, gas: 160, link: 100, solar: 60, wind: 50 };
  const PROFILE = [0.72, 0.68, 0.66, 0.66, 0.68, 0.74, 0.86, 1.0, 1.04, 1.0, 0.97, 0.96, 0.96, 0.95, 0.94, 0.95, 1.0, 1.1, 1.18, 1.2, 1.15, 1.05, 0.92, 0.8];
  function windCurve(v) {
    if (v < 10 || v >= 100) return 0; // too calm, or shut down for safety in a storm
    if (v >= 45) return 1;
    const f = (v - 10) / 35;
    return f * f * (3 - 2 * f);
  }
  /** One hour on the grid. */
  function gridHour(map, t, ops, levels) {
    const x = climate().sample(t), h = (((t + offsetAt(t)) % DAY) + DAY) % DAY / H; // the hour on the city's clock
    const dl = climate().normals(t).dayLength, rise = 12 - dl / 2, f = (h - rise) / dl;
    const sun = f > 0 && f < 1 ? 4 * f * (1 - f) : 0;
    const scale = 250 / (map.residents / 1000 || 1);
    let demand = (map.residents / 1000) * scale * PROFILE[Math.floor(h)];
    if (x.temp < 15) demand += (15 - x.temp) * 4.2;
    if (x.temp > 24) demand += (x.temp - 24) * 5;
    if (!x.isDay) demand += 6; // the stadium's floodlights; a race is always on
    const dom = new Date(t).getUTCDate();
    if (dom === 1 || dom === 2) demand += 14; // Grand Prix crowds
    demand += (levels['policy.constructionBudget'] - 3) * 6;
    demand -= levels['policy.trafficLimits'] * 4; // fewer cars, quieter streets
    const solar = ops.solar * MW.solar * sun * (1 - 0.75 * x.cloud);
    const wind = ops.wind * MW.wind * windCurve(x.wind);
    const coalCap = ops.coal * MW.coal * (1 - 0.1 * levels['policy.emissionsCap']);
    const gasCap = MW.gas;
    let need = demand - solar - wind;
    if (need < 0) need = 0;
    const coal = need < coalCap ? need : coalCap;
    need -= coal;
    // the interconnector to the national grid, then the gas peakers, cover the rest
    const link = need < MW.link ? need : MW.link;
    need -= link;
    const gas = need < gasCap ? need : gasCap;
    need -= gas;
    const shortfall = need;
    return { t, demand: rd1(demand), solar: rd1(solar), wind: rd1(wind), coal: rd1(coal), link: rd1(link), gas: rd1(gas), shortfall: rd1(shortfall),
      capacity: rd1(solar + wind + coalCap + MW.link + gasCap), temp: x.temp, windSpeed: x.wind };
  }
  /** Rolling blackouts: which districts go dark this hour, in a rota that changes each hour. */
  function blackoutDistricts(map, shortfall, t) {
    if (shortfall <= 0) return [];
    const per = 250 / 16;
    const n = clamp(Math.floor(shortfall / per) + 1, 1, 16);
    const order = map.districts.map((d) => d.id).sort((a, b) => unit('rota:' + Math.floor(t / H) + ':' + a) - unit('rota:' + Math.floor(t / H) + ':' + b) || a - b);
    return order.slice(0, n).sort((a, b) => a - b);
  }

  // ================================================================ shipping
  // Container ships call every day and a ferry crosses twice. Coal carriers call as often as the operating coal plants
  // need fuel; gas tankers follow how hard the peakers worked the day before. Storms hold ships outside the harbour.
  const SHIP_A = ['Pixel', 'Kerning', 'Raster', 'Northern', 'Southern', 'Harbour', 'Gamma', 'Vector', 'Halftone', 'Scanline', 'Luminous', 'Steady', 'Patient', 'Measured', 'Quiet'];
  const SHIP_B = ['Endeavour', 'Star', 'Spirit', 'Trader', 'Voyager', 'Pioneer', 'Courier', 'Horizon', 'Drift', 'Promise', 'Monarch', 'Crawler', 'Margin', 'Tide'];
  const PORTS = ['Kerning Bay', 'the Northern Isles', 'Raster Point', 'Port Gamma', 'Halftone Harbour', 'the Southern Reach', 'Vector Sound', 'Scanline Strait'];
  const SHIP_TYPES = {
    container: { label: 'Container ship', berths: [1, 2, 3], stay: [10, 20], unit: 'TEU', amount: [300, 2200] },
    bulk: { label: 'Coal carrier', berths: [4], stay: [18, 30], unit: 't of coal', amount: [25000, 60000] },
    tanker: { label: 'Gas tanker', berths: [5], stay: [8, 14], unit: 't of gas', amount: [8000, 30000] },
    ferry: { label: 'Harbour ferry', berths: [0], stay: [1, 1], unit: 'passengers', amount: [80, 400] }
  };
  /** Holds a sailing until the weather allows: no gusts of 88 km/h or more, and no named storm blowing a gale. */
  function weatherWindow(t) {
    let x = t, held = 0;
    for (let k = 0; k < 16; k++) {
      const w = climate().sample(x);
      if (w.gust < 88 && !(w.storm && w.gust >= 60)) break;
      x += 3 * H; held += 3 * H;
    }
    return { t: x, held };
  }
  
  // ================================================================ days, pollution and events
  const AQI_BANDS = [[50, 'Good'], [100, 'Moderate'], [150, 'Unhealthy for sensitive pixels'], [200, 'Unhealthy'], [300, 'Very unhealthy'], [9999, 'Hazardous']];
  const aqiBand = (v) => { for (const [lim, name] of AQI_BANDS) if (v <= lim) return name; return 'Hazardous'; };

  function createCity() {
    let map = null, tls = null, tlTo = 0;
    const days = new Map(); // day -> summary
    const hist = { day: EPOCH, smog: 20, peak: 0, events: [], prevStates: null, smogAlert: false };
    let renewed = null;
    function ensureMap() { if (!map) map = buildMap(senate().districtProfiles); return map; }
    /** The map in force at time t: the founding map before the Renewal, the renewed city after it. */
    function mapAt(t) {
      if (t < renewalAt()) return ensureMap();
      if (!renewed) renewed = renew(buildMap(senate().districtProfiles));
      return renewed;
    }
    function ensureTimelines(t) {
      if (!tls || t > tlTo) { tls = timelines(dayOf(t) + DAY); tlTo = dayOf(t) + DAY; }
      return tls;
    }
    function opsAt(t) {
      const tl = ensureTimelines(t), m = ensureMap();
      const ops = { coal: 0, solar: 0, wind: 0, park: 0, wildlife: 0 };
      for (const f of m.features) if (f.kind === 'site' && siteState(f, tl[SITE_FOR[f.type]], t).state === 'operating') ops[f.type]++;
      const levels = {};
      for (const k in DEFAULTS) levels[k] = levelAt(tl[k], t);
      return { ops, levels };
    }
    function summarise(d, upTo) {
      const m = mapAt(d);
      const hours = [];
      let peak = 0, energy = { solar: 0, wind: 0, coal: 0, link: 0, gas: 0 }, short = 0, dark = {}, emissions = 0;
      for (let k = 0; k < 24; k++) {
        const t = d + k * H + 30 * MIN;
        if (upTo !== undefined && t > upTo) break;
        const { ops, levels } = opsAt(t);
        const g = gridHour(m, t, ops, levels);
        g.dark = blackoutDistricts(m, g.shortfall, t);
        for (const id of g.dark) dark[id] = (dark[id] || 0) + 1;
        hours.push(g);
        if (g.demand > peak) peak = g.demand;
        for (const s in energy) energy[s] += g[s];
        short += g.shortfall;
        emissions += g.coal * 0.9 + g.gas * 0.45 + (m.residents / 1000) * 0.9 * (1 - levels['policy.trafficLimits'] * 0.15) + levels['policy.constructionBudget'] * 1.5;
      }
      const total = energy.solar + energy.wind + energy.coal + energy.link + energy.gas;
      return { day: d, date: ymd(d), hours, peak: rd1(peak), energy: { solar: rnd(energy.solar), wind: rnd(energy.wind), coal: rnd(energy.coal), link: rnd(energy.link), gas: rnd(energy.gas) },
        clean: total ? rd1((energy.solar + energy.wind) / total * 100) : 0, unserved: rnd(short), blackoutHours: hours.filter((x) => x.shortfall > 0).length,
        dark, emissions: rnd(emissions) };
    }
    function day(d) { if (!days.has(d)) days.set(d, summarise(d)); return days.get(d); }

    const ports = new Map();
    /** Every ship due on day d, with arrival and departure times after any weather holds. */
    function schedule(d) {
      if (ports.has(d)) return ports.get(d);
      const r = seeded('port:' + ymd(d)), calls = [];
      const { ops } = opsAt(d + 6 * H);
      const gasYesterday = d - DAY >= EPOCH ? day(d - DAY).energy.gas : 0;
      const add = (type, k, hour) => {
        const S = SHIP_TYPES[type];
        const a = r(), b = r(), c = r(), e = r(), f = r();
        const due = d + Math.floor((hour !== undefined ? hour : 2 + a * 20) * 60) * MIN;
        const win = weatherWindow(due);
        const stay = (S.stay[0] + b * (S.stay[1] - S.stay[0])) * H;
        const leave = weatherWindow(win.t + stay);
        const id = 'ship-' + ymd(d) + '-' + type + '-' + k;
        const name = type === 'ferry' ? 'Harbour Ferry ' + (k + 1) : SHIP_A[Math.floor(unit('ship-a:' + id) * SHIP_A.length)] + ' ' + SHIP_B[Math.floor(unit('ship-b:' + id) * SHIP_B.length)];
        calls.push({ id, type, label: S.label, name, from: type === 'ferry' ? 'the far shore' : PORTS[Math.floor(unit('ship-from:' + id) * PORTS.length)],
          berth: S.berths[k % S.berths.length], due, arrive: win.t, depart: leave.t, held: win.held + leave.held,
          cargo: Math.floor(S.amount[0] + b * (S.amount[1] - S.amount[0])), unit: S.unit });
      };
      add('ferry', 0, 8); add('ferry', 1, 17);
      const nC = 1 + Math.floor(r() * 2.6);
      for (let k = 0; k < nC; k++) add('container', k);
      const coalRoll = r(), gasRoll = r();
      if (coalRoll < ops.coal * 0.11) add('bulk', 0);
      if (gasRoll < 0.04 + gasYesterday / 4500) add('tanker', 0);
      calls.sort((p, q) => p.arrive - q.arrive);
      ports.set(d, calls);
      return calls;
    }
    /** Ships in sight at time t: sailing in (two hours before arriving), at berth, or sailing out (two hours after leaving). */
    function shipsAt(t) {
      const out = [];
      for (let d = dayOf(t) - 3 * DAY; d <= dayOf(t); d += DAY) {
        if (d < EPOCH) continue;
        for (const c of schedule(d)) {
          if (t < c.arrive - 2 * H || t > c.depart + 2 * H) continue;
          const phase = t < c.arrive ? 'arriving' : t <= c.depart ? 'berthed' : 'departing';
          const p = phase === 'arriving' ? (t - (c.arrive - 2 * H)) / (2 * H) : phase === 'departing' ? (t - c.depart) / (2 * H) : 1;
          out.push(Object.assign({}, c, { phase, progress: rd1(p * 1000) / 1000 }));
        }
      }
      return out;
    }

    function emit(out, t, type, importance, idPart, data, headline) {
      out.push({ id: 'city:' + idPart, time: iso(t), ms: t, source: 'city', type, importance, data, headline });
    }
    const names = (ids) => { const m = ensureMap(), n = ids.map((i) => m.districts[i].name); return n.length <= 2 ? n.join(' and ') : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1]; };
    /** Everything that happened in the city on day d. Daily figures are published at 23:59. */
    function processDay(h, d, out) {
      const m = ensureMap(), te = d + DAY - MIN, x = day(d);
      const tl = ensureTimelines(d + DAY);
      // construction
      for (const f of m.features) {
        if (f.kind !== 'site') continue;
        const a = siteState(f, tl[SITE_FOR[f.type]], d - 1), b = siteState(f, tl[SITE_FOR[f.type]], d + DAY - 1);
        if (a.state === b.state) continue;
        const what = f.type === 'coal' ? 'coal plant' : f.type === 'solar' ? 'solar farm' : f.type === 'wind' ? 'wind farm' : f.type === 'park' ? 'park' : 'wildlife zone';
        if (b.state === 'building') emit(out, b.since, 'city.construction', f.type === 'park' || f.type === 'wildlife' ? 1 : 2, 'site-' + f.id + ':build:' + ymd(d), { site: f.id, type: f.type, name: f.name },
          (f.type === 'wildlife' ? 'Surveyors mark out ' : 'Work begins on ') + f.name);
        else if (b.state === 'operating') emit(out, b.since, 'city.opened', f.type === 'park' ? 2 : 3, 'site-' + f.id + ':open:' + ymd(d), { site: f.id, type: f.type, name: f.name },
          f.type === 'park' ? f.name + ' opens to the public' : f.type === 'wildlife' ? f.name + ' is now protected' : f.name + ' begins generating');
        else if (b.state === 'clearing') emit(out, b.since, 'city.closure', f.type === 'coal' ? 3 : 2, 'site-' + f.id + ':close:' + ymd(d), { site: f.id, type: f.type, name: f.name },
          f.type === 'coal' ? f.name + ' is switched off for the last time' : f.name + ' closes, by order of the Senate');
      }
      // blackouts: one event per run of dark hours
      let run = null;
      const flush = () => {
        if (!run) return;
        const ids = Object.keys(run.dark).map(Number).sort((p, q) => p - q);
        emit(out, run.start, 'city.blackout', run.hours >= 3 || ids.length >= 4 ? 4 : 3, 'blackout:' + ymd(d) + ':' + new Date(run.start).getUTCHours(), { districts: ids, hours: run.hours, shortfall: rnd(run.peak) },
          'Rolling blackouts hit ' + names(ids) + ' for ' + run.hours + ' hour' + (run.hours === 1 ? '' : 's') + ' as demand outstrips supply');
        run = null;
      };
      for (const g of x.hours) {
        if (g.shortfall > 0) {
          if (!run) run = { start: g.t - 30 * MIN, hours: 0, dark: {}, peak: 0 };
          run.hours++;
          for (const id of g.dark) run.dark[id] = 1;
          if (g.shortfall > run.peak) run.peak = g.shortfall;
        } else flush();
      }
      flush();
      // peak demand records
      if (x.peak > h.peak) {
        if (h.peak && d > EPOCH + 30 * DAY) emit(out, te, 'city.record', 3, 'peak:' + ymd(d), { peak: x.peak, previous: h.peak }, 'Record demand: the city draws ' + rnd(x.peak) + ' MW');
        h.peak = x.peak;
      }
      // smog: today's emissions, held in place by still, dry weather
      const w = climate().dayAt(d);
      const keep = w.rain >= 5 ? 0.15 : w.wind >= 25 ? 0.3 : w.wind >= 15 ? 0.5 : w.wind >= 10 ? 0.66 : 0.78;
      h.smog = rd1(h.smog * keep + x.emissions / 160);
      x.aqi = rnd(h.smog);
      x.air = aqiBand(x.aqi);
      if (x.aqi > 150 && !h.smogAlert) { h.smogAlert = true; emit(out, te, 'city.smog', 3, 'smog:' + ymd(d), { aqi: x.aqi }, 'Smog alert: air quality is ' + x.air.toLowerCase() + ' (' + x.aqi + ')'); }
      else if (x.aqi <= 100 && h.smogAlert) { h.smogAlert = false; emit(out, te, 'city.smog.clears', 2, 'smog-clears:' + ymd(d), { aqi: x.aqi }, 'The smog clears'); }
      // the port
      for (const c of schedule(d)) {
        if (c.held >= 6 * H && c.type !== 'ferry') emit(out, c.due, 'port.held', 2, c.id + ':held', { ship: c.name, type: c.type, hours: Math.floor(c.held / H) },
          'The ' + c.label.toLowerCase() + ' ' + c.name + ' is held outside the harbour by the weather');
        if (c.type === 'bulk') emit(out, c.arrive, 'port.coal', 1, c.id + ':arrives', { ship: c.name, cargo: c.cargo }, c.name + ' docks with ' + c.cargo.toLocaleString('en') + ' t of coal for the power plants');
        if (c.type === 'tanker') emit(out, c.arrive, 'port.gas', 1, c.id + ':arrives', { ship: c.name, cargo: c.cargo }, c.name + ' docks with ' + c.cargo.toLocaleString('en') + ' t of gas for the peakers');
      }
      // Grand Prix crowds
      if (new Date(d).getUTCDate() === 1) emit(out, d + 9 * H, 'city.crowds', 2, 'gp:' + ymd(d), {}, 'Crowds pour into the Glacial Stadium for the Grand Prix');
    }

    function ensure(toDay) { ensureTimelines(toDay); while (hist.day < toDay) { processDay(hist, hist.day, hist.events); hist.day += DAY; } }
    function eventsBetween(from, to) {
      if (to < EPOCH || !ready()) return [];
      const today = dayOf(to);
      ensure(today);
      const scratch = JSON.parse(JSON.stringify({ day: hist.day, smog: hist.smog, peak: hist.peak, smogAlert: hist.smogAlert })), partial = [];
      processDay(scratch, today, partial);
      return hist.events.filter((e) => e.ms >= from && e.ms < today).concat(partial.filter((e) => e.ms >= from && e.ms <= to)).sort((a, b) => a.ms - b.ms);
    }
    function historyBetween(from, to) {
      if (!ready()) return [];
      ensure(dayOf(to));
      const out = [];
      for (let d = dayOf(from) > EPOCH ? dayOf(from) : EPOCH; d + DAY <= to; d += DAY) out.push(day(d));
      return out;
    }
    function stateAt(t) {
      if (!ready()) return { time: t, started: false, unavailable: 'The Weather Bureau or the Senate could not be reached' };
      if (t < EPOCH) return { time: t, started: false };
      const m = mapAt(t), d = dayOf(t);
      ensure(d);
      const { ops, levels } = opsAt(t);
      const g = gridHour(m, t, ops, levels);
      const dark = blackoutDistricts(m, g.shortfall, t);
      const tl = ensureTimelines(t);
      const sites = m.features.filter((f) => f.kind === 'site').map((f) => Object.assign({ id: f.id, type: f.type, name: f.name }, siteState(f, tl[SITE_FOR[f.type]], t)));
      const today = summarise(d, t);
      const keep = 0.62, smog = rnd(hist.smog * keep + today.emissions / 160);
      return { time: t, started: true, version: VERSION, grid: g, dark, ops, levels, sites, today, residents: m.residents, aqi: smog, air: aqiBand(smog), ships: shipsAt(t) };
    }
    return {
      version: VERSION, source: 'city', startDate: ymd(EPOCH), epoch: EPOCH, ready,
      // map(): the founding map (unchanged, for sites whose history depends on it). map(t): the map in force at t.
      map: (t) => (!ready() ? null : t === undefined ? ensureMap() : mapAt(t)), T, TILE_NAMES, RESIDENTS, JOBS, MW,
      renewal: renewalAt(), renewalAt, offsetAt,
      /** Whether a building is still a fenced plot at time t (planned, and not yet open). */
      isPlanned: (f, t) => !!(f && f.planned && !(f.opens && t >= f.opens)),
      stateAt, eventsBetween, historyBetween,
      shipsAt: (t) => (ready() && t >= EPOCH ? shipsAt(t) : []),
      portBetween: (from, to) => {
        if (!ready()) return [];
        const out = [];
        for (let d = dayOf(from) > EPOCH ? dayOf(from) : EPOCH; d <= to; d += DAY) for (const c of schedule(d)) if (c.arrive >= from && c.arrive <= to) out.push(c);
        return out;
      },
      SHIP_TYPES,
      siteStateAt: (featureId, t) => { const f = ensureMap().features[featureId]; return siteState(f, ensureTimelines(t)[SITE_FOR[f.type]], t); },
      create: createCity, _internals: { rng, hash, unit }
    };
  }

  root.PixelUniverse = root.PixelUniverse || {};
  root.PixelUniverse.city = createCity();
})(typeof window !== 'undefined' ? window : globalThis);
