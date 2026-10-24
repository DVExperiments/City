/*
 * The Pixel City Census Office: every resident of the city, by name.
 *
 * Part of Pixel City. Every home sits in a real building on the city's map (houses, apartment blocks and flats above
 * shops), and the homes hold exactly the city's 82,640 residents. Households move in and out over the years, so the
 * people change while the population does not. Everything is a pure function of time: the same pixel lives at the
 * same address, with the same personality, for every visitor.
 *
 * What residents think is worked out from the city as it is: the air, the blackouts in their district, the parks
 * near them, the coal plants, the weather. The Office polls a weekly panel of 800 adults.
 *
 * A reader of the city: it reads City (the map and its state), and through it the Senate's laws and the weather.
 * Nothing in the city depends on it yet. Future sites (Pixel High, the University, the Job Centre, the Bank) read
 * people from here, so a pixel is the same pixel everywhere.
 *
 * Load after City's universe.js. Seeds start "census:". Simulation maths uses only + - * / Math.floor Math.imul.
 * Registers window.PixelUniverse.census.
 */
(function (root) {
  'use strict';

  const VERSION = '0.1.0';
  const H = 3600000, DAY = 86400000, WEEK = 7 * DAY;
  const YEAR = 31557600000; // 365.25 days
  const EPOCH = Date.UTC(2025, 11, 3);
  const OPENS = Date.UTC(2026, 10, 2);       // the Census Office opens its doors (a Monday)
  const FIRST_PANEL = Date.UTC(2025, 11, 8); // the first Monday after the epoch: the panel has run since the city began
  const PANEL_SIZE = 800;

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
  const seeded = (s) => rng(hash('census:' + s));
  const pick = (r, a) => a[Math.floor(r() * a.length)];
  const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
  const rd2 = (x) => Math.floor(x * 100 + 0.5) / 100;
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const dayOf = (ms) => ms - (((ms % DAY) + DAY) % DAY);
  const ymd = (ms) => { const d = new Date(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
  const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');

  // ---------------------------------------------------------------- upstream
  const U = () => root.PixelUniverse || {};
  const C = () => U().city;
  const ready = () => { const c = C(); return !!(c && (!c.ready || c.ready())); };

  // ---------------------------------------------------------------- names and character
  const FIRST = ['Ada', 'Amber', 'Arlo', 'Ash', 'Bea', 'Bit', 'Blue', 'Bram', 'Cass', 'Cyan', 'Dot', 'Edie', 'Ember', 'Fen', 'Flint', 'Glint', 'Gray', 'Halo', 'Hex', 'Ines',
    'Iris', 'Ivo', 'Jet', 'Juno', 'Kai', 'Kern', 'Lark', 'Lumen', 'Lux', 'Mabel', 'Mag', 'Mauve', 'Mira', 'Moss', 'Ned', 'Nib', 'Nova', 'Oak', 'Ochre', 'Ola',
    'Opal', 'Otto', 'Pax', 'Pica', 'Pip', 'Quill', 'Quin', 'Raster', 'Rho', 'Ruby', 'Rune', 'Sable', 'Sage', 'Serif', 'Slate', 'Sol', 'Sprite', 'Tam', 'Teal', 'Tess',
    'Tint', 'Umber', 'Vela', 'Vim', 'Volt', 'Watt', 'Wren', 'Xan', 'Yara', 'Zinc'];
  const LAST = ['Halftone', 'Gridley', 'Scanlon', 'Bitwell', 'Kerning', 'Overscan', 'Brightwater', 'Dimmock', 'Gamut', 'Pallett', 'Lumley', 'Hueston', 'Framewell', 'Pixelby',
    'Burnside', 'Glowman', 'Shadwell', 'Ditherington', 'Underscan', 'Backlight', 'Dotson', 'Inkwell', 'Matteson', 'Quillon', 'Whitepoint', 'Greystoke', 'Lightfoot', 'Fadewell',
    'Glimmerton', 'Raster', 'Vectorson', 'Picaday', 'Tintwhistle', 'Sharpley', 'Contrastly', 'Huebridge', 'Lowgamma', 'Refreshby', 'Moirefield', 'Nibbleton', 'Chromwell',
    'Bezelton', 'Aliasford', 'Saturn', 'Vsyncroft', 'Jagger', 'Nullard', 'Lossley', 'Burnham', 'Offord', 'Subwell', 'Deadmarsh', 'Gammage', 'Brightley', 'Dimsdale'];
  const STREETS = ['Kerning', 'Raster', 'Lumen', 'Halftone', 'Gamma', 'Pica', 'Serif', 'Vector', 'Glyph', 'Scanline', 'Refresh', 'Phosphor', 'Contrast', 'Bitmap', 'Gradient', 'Dither',
    'Aperture', 'Hue', 'Shutter', 'Pixel', 'Prism', 'Aspect', 'Bezel', 'Frame', 'Isobar', 'Ledger', 'Ember', 'Quartz', 'Signal', 'Tally'];
  const STREET_KIND = ['Street', 'Road', 'Lane', 'Terrace', 'Place', 'Row'];
  const PIXELS = [['hot-pixel', 'Hot Pixel'], ['burn-in', 'Burn-In'], ['gamma', 'Gamma'], ['dither', 'Dither'], ['chroma', 'Chroma'], ['vsync', 'Vsync'], ['moire', 'Moiré'], ['nibble', 'Nibble'],
    ['sub-pixel', 'Sub-Pixel'], ['anti-alias', 'Anti-Alias'], ['jaggy', 'Jaggy'], ['off-by-one', 'Off-By-One'], ['bezel', 'Bezel'], ['lossless', 'Lossless'], ['dead-pixel', 'Dead Pixel'], ['null-pointer', 'Null Pointer']];
  // the five traits of a pixel's character, each 0 to 1
  const TRAITS = [
    ['brightness', 'Brightness', 'Quiet', 'Outgoing'],
    ['sharpness', 'Sharpness', 'Easygoing', 'Meticulous'],
    ['warmth', 'Warmth', 'Cool', 'Warm'],
    ['flicker', 'Flicker', 'Steady', 'Anxious'],
    ['saturation', 'Saturation', 'Conventional', 'Curious']
  ];
  const HOBBIES = ['watching the Daily Crawl from start to finish', 'keeping a rating notebook', 'birdwatching in the wildlife zones', 'collecting coal-carrier timetables', 'competitive dimming',
    'listening to Pixel FM', 'gardening on the balcony', 'reading the Daily Pixel cover to cover', 'night swimming in the harbour', 'repainting the front door', 'amateur forecasting',
    'model power stations', 'chess by post', 'walking the length of Kerning Street', 'learning the names of every senator', 'pressing flowers', 'sitting very still', 'baking', 'choir', 'kite flying on windy days'];
  const HOPES = ['To see a Grand Prix finish from the front row', 'To own a home with a view of the harbour', 'To be brighter, eventually', 'To retire to the Western Ranges', 'To be quoted in the Daily Pixel',
    'To sit in the Senate one day', 'To win big at the Bookmaker, once', 'To see the last coal plant switched off', 'To keep the coal plants open for the next generation', 'To have a song played on Pixel FM',
    'To see a whole year without a blackout', 'For the children to do better than them', 'To learn to sleep as well as Dead Pixel', 'A quiet life', 'To finally visit Dither district', 'To meet Lossless in person',
    'To grow the tallest sunflower in the city', 'To be on time for something', 'To get to the end of the Daily Crawl awake', 'To be the first in the family to go to university'];
  const JOBS = ['body text hue controller', 'kerning inspector', 'senior gradient technician', 'coal plant stoker', 'solar panel polisher', 'harbour pilot', 'stadium groundskeeper', 'weather balloon handler',
    'night-shift bookmaker', 'newsprint folder', 'turbine climber', 'Senate stenographer', 'pixel-edge sharpener', 'traffic light timer', 'lighthouse keeper', 'subpixel alignment officer',
    'colour temperature adjuster', 'anti-glare consultant', 'refresh rate auditor', 'shade allocator', 'museum conservator', 'radio presenter', 'school crossing patrol', 'park keeper'];
  const QUIRKS = ['Has never once been fully charged', 'Keeps a spare pixel in a drawer, just in case', 'Refuses to dim after dark', 'Names every pigeon in the street', 'Has read the Senate standing orders twice',
    'Was nearly a Glacial racer, apparently', 'Insists the old palette was better', 'Times the Daily Crawl with an egg timer', 'Owns four identical grey jumpers', 'Has a strong opinion about the font laws',
    'Writes to the Weather Bureau every week', 'Has been to every Grand Prix since the first', 'Can hum the Pixel FM ident in two keys', 'Once shook hands with a senator and has not washed since',
    'Keeps the curtains closed during smog alerts and open the rest of the time', 'Waves at every coal carrier'];

  function colorFor(r) {
    // a bright, readable colour on a dark screen: HSL to hex with integer maths
    const h = Math.floor(r() * 360), s = 55 + Math.floor(r() * 35), l = 52 + Math.floor(r() * 16);
    const c = (100 - (2 * l - 100 < 0 ? 100 - 2 * l : 2 * l - 100)) * s / 100; // chroma, percent of 255
    const hp = h / 60, hpm = hp - 2 * Math.floor(hp / 2);
    const x = c * (1 - (hpm - 1 < 0 ? 1 - hpm : hpm - 1));
    const m = l - c / 2;
    const seg = Math.floor(hp);
    const rgb = seg === 0 ? [c, x, 0] : seg === 1 ? [x, c, 0] : seg === 2 ? [0, c, x] : seg === 3 ? [0, x, c] : seg === 4 ? [x, 0, c] : [c, 0, x];
    return '#' + rgb.map((v) => { const n = clamp(Math.floor((v + m) * 255 / 100 + 0.5), 0, 255); return (n < 16 ? '0' : '') + n.toString(16); }).join('').toUpperCase();
  }

  // ================================================================ homes: every residential building on the map
  let HOMES = null, BY_DISTRICT = null;
  const renewedMap = () => (C().renewalAt ? C().map(C().renewalAt()) : C().map());
  function homes() {
    if (HOMES) return HOMES;
    // the census counts the renewed city's homes (after the Renewal some homes made way for new buildings)
    const map = renewedMap(), T = C().T, RES = C().RESIDENTS;
    HOMES = []; BY_DISTRICT = map.districts.map(() => []);
    for (let i = 0; i < map.tiles.length; i++) {
      const type = map.tiles[i], k = map.district[i], cap = RES[type];
      if (!cap || k < 0) continue;
      const x = i % map.W, y = Math.floor(i / map.W);
      const r = seeded('building:' + i);
      let sizes;
      if (type === T.HOUSE) sizes = pick(r, [[3, 3], [2, 4], [4, 2], [1, 2, 3], [2, 2, 2], [1, 5], [6]]);
      else if (type === T.SHOP) sizes = r() < 0.6 ? [2] : [1, 1];
      else { sizes = []; let left = cap; while (left > 4) { const s = pick(r, [1, 1, 1, 2, 2, 2, 2, 3, 3, 4]); sizes.push(s); left -= s; } sizes.push(left); }
      const street = STREETS[Math.floor(y / 4) % STREETS.length] + ' ' + STREET_KIND[Math.floor(y / 4 / STREETS.length + x / 40) % STREET_KIND.length];
      const number = x * 2 + 1 + (y % 4 >= 2 ? 1 : 0);
      sizes.forEach((size, u) => {
        const address = type === T.APARTMENT ? 'Flat ' + (u + 1) + ', ' + number + ' ' + street
          : type === T.SHOP ? (sizes.length > 1 ? 'Flat ' + (u + 1) + ' above ' : 'Above ') + number + ' ' + street
          : number + (sizes.length > 1 ? String.fromCharCode(65 + u) : '') + ' ' + street;
        const home = { i: HOMES.length, tile: i, x, y, district: k, kind: type === T.HOUSE ? 'house' : type === T.SHOP ? 'flat above a shop' : 'apartment', size, address };
        HOMES.push(home);
        BY_DISTRICT[k].push(home.i);
      });
    }
    return HOMES;
  }

  // ---------------------------------------------------------------- tenancies: who lives in a home, and since when
  function tenancyLength(hi, k) { const r = seeded('lease:' + hi + ':' + k); const u = r(); return Math.floor((2 + u * u * 22) * YEAR) + Math.floor(r() * 300) * DAY; }
  function tenancyAt(hi, t) {
    let len = tenancyLength(hi, 0);
    let start = EPOCH - Math.floor(seeded('lease0:' + hi)() * len), k = 0;
    while (start + len <= t) { start += len; k++; len = tenancyLength(hi, k); }
    return { k, start, end: start + len };
  }
  /** Every change of household in [from, to): [time, homeIndex, newTenancy]. */
  function movesBetween(from, to) {
    const out = [];
    for (const h of homes()) {
      let len = tenancyLength(h.i, 0), start = EPOCH - Math.floor(seeded('lease0:' + h.i)() * len), k = 0;
      while (start + len < to) { start += len; k++; if (start >= from) out.push([start, h.i, k]); len = tenancyLength(h.i, k); }
    }
    out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return out;
  }

  // ---------------------------------------------------------------- households and people
  const hhCache = new Map();
  function household(hi, k) {
    const key = hi + ':' + k;
    if (hhCache.has(key)) return hhCache.get(key);
    const home = homes()[hi], ten = { k, start: 0, end: 0 };
    { let len = tenancyLength(hi, 0), start = EPOCH - Math.floor(seeded('lease0:' + hi)() * len); for (let j = 0; j < k; j++) { start += len; len = tenancyLength(hi, j + 1); } ten.start = start; ten.end = start + len; }
    const r = seeded('household:' + key);
    const surname = pick(r, LAST);
    const n = home.size, members = [];
    const stay = Math.floor((ten.end - ten.start) / YEAR), cap = 92 - stay;
    const add = (role, age, own) => members.push({ role, ageAtStart: role === 'child' ? age : clamp(age, 19, cap < 19 ? 19 : cap), surname: own ? pick(r, LAST) : surname });
    const form = r();
    let kind;
    if (n === 1) { kind = 'single'; add('adult', 19 + Math.floor(r() * 70)); }
    else if (n === 2) {
      if (form < 0.55) { kind = 'couple'; const a = 22 + Math.floor(r() * 60); add('adult', a); add('adult', clamp(a + Math.floor(r() * 13) - 6, 19, 95)); }
      else if (form < 0.75) { kind = 'parent and child'; const a = 26 + Math.floor(r() * 30); add('adult', a); add('child', Math.floor(r() * (a - 19 < 17 ? a - 19 : 17))); }
      else { kind = 'flatmates'; add('flatmate', 19 + Math.floor(r() * 16)); add('flatmate', 19 + Math.floor(r() * 16), true); }
    } else if (form < 0.8) {
      kind = 'family';
      const a = 27 + Math.floor(r() * 26);
      add('adult', a); add('adult', clamp(a + Math.floor(r() * 9) - 4, 21, 70));
      let left = n - 2;
      if (n >= 4 && r() < 0.18) { add('grandparent', a + 24 + Math.floor(r() * 12)); left--; }
      for (let c = 0; c < left; c++) add('child', Math.floor(r() * (a - 20 < 17 ? a - 20 : 17)));
    } else { kind = 'flatmates'; for (let c = 0; c < n; c++) add('flatmate', 19 + Math.floor(r() * 20), c > 0); }
    const hh = { home: hi, k, start: ten.start, end: ten.end, surname, kind, members: members.map((m, i) => {
      const pr = seeded('person:' + key + ':' + i);
      const birth = ten.start - m.ageAtStart * YEAR - Math.floor(pr() * 365) * DAY;
      return { id: 'p' + hi + '-' + k + '-' + i, role: m.role, surname: m.surname, birth };
    }) };
    if (hhCache.size > 6000) hhCache.clear();
    hhCache.set(key, hh);
    return hh;
  }
  const ageAt = (birth, t) => Math.floor((t - birth) / YEAR);
  const parseId = (id) => { const m = /^p(\d+)-(\d+)-(\d+)$/.exec(id); return m ? { hi: +m[1], k: +m[2], i: +m[3] } : null; };

  /** A resident's identity and character: everything that does not change with the city. */
  function character(id) {
    const p = parseId(id);
    if (!p || !homes()[p.hi]) return null;
    const hh = household(p.hi, p.k), mem = hh.members[p.i];
    if (!mem) return null;
    const home = HOMES[p.hi];
    const r = seeded('character:' + id);
    const traits = {};
    for (const [key] of TRAITS) traits[key] = rd2(r());
    const homePixel = PIXELS.filter((x) => x[1] === renewedMap().districts[home.district].name)[0];
    const fav = homePixel && r() < 0.3 ? homePixel : pick(r, PIXELS);
    const h1 = pick(r, HOBBIES);
    let h2 = pick(r, HOBBIES); if (h2 === h1) h2 = HOBBIES[(HOBBIES.indexOf(h1) + 7) % HOBBIES.length];
    const leanNoise = { B: r() * 0.3, V: r() * 0.3, L: r() * 0.3 };
    return {
      id, first: pick(r, FIRST), surname: mem.surname, name: '', color: colorFor(r), role: mem.role, birth: mem.birth,
      birthday: new Date(mem.birth).getUTCDate() + ' ' + ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][new Date(mem.birth).getUTCMonth()],
      home: home.i, address: home.address, district: home.district, districtName: renewedMap().districts[home.district].name, homeKind: home.kind,
      movedIn: hh.start, movesOut: hh.end, household: hh.members.map((m) => m.id), householdKind: hh.kind,
      traits, favourite: fav[0], favouriteName: fav[1], hobbies: [h1, h2], hope: pick(r, HOPES), dreamJob: pick(r, JOBS), quirk: pick(r, QUIRKS), leanNoise
    };
  }
  function named(c) { c.name = c.first + ' ' + c.surname; return c; }

  // ================================================================ what the city is like, for its residents
  const ctxCache = new Map();
  function cityContext(t) {
    const d = dayOf(t);
    if (ctxCache.has(d)) return ctxCache.get(d);
    // residents judge the city by the day just gone: at midnight the city's own day has barely begun
    const c = C(), st = c.stateAt(d - 1), map = renewedMap();
    const week = c.historyBetween(d - 7 * DAY, d);
    const dark = {};
    for (const day of week) for (const k in day.dark) dark[k] = (dark[k] || 0) + day.dark[k];
    const parks = map.districts.map(() => 0);
    for (const s of st.sites || []) if (s.type === 'park' && s.state === 'operating') parks[map.features[s.id].district]++;
    const W = U().climate;
    let temp = 15, rain = 0;
    if (W) { try { const w = W.dayAt(d - DAY); temp = (w.max + w.min) / 2; rain = w.rain; } catch (e) { /* keep defaults */ } }
    const S = U().senate;
    const profiles = S && S.districtProfiles ? S.districtProfiles : map.districts.map(() => ({ env: 0, aes: 0 }));
    let support = { B: 0.36, V: 0.32, L: 0.32 }; // the Senate's founding baseline, until it publishes its own
    if (S) { try { const ss = S.stateAt(t); if (ss.started && ss.support) support = ss.support; } catch (e) { /* keep the baseline */ } }
    const ctx = { support, aqi: st.aqi || 0, air: st.air || 'Good', dark, parks, coal: st.levels ? st.levels['policy.coalPlants'] : 3, coalOps: st.ops ? st.ops.coal : 0, temp, rain, profiles };
    if (ctxCache.size > 120) ctxCache.clear();
    ctxCache.set(d, ctx);
    return ctx;
  }

  const LEAN_OFFSET = { B: 0.16, V: 0, L: 0.07 }; // calibrated so a typical panel tracks the Senate's support
  const CONCERNS = {
    air: 'The air', power: 'Blackouts', parks: 'Too little green space', coal: 'Jobs at the coal plants', weather: 'The weather', none: 'Nothing in particular'
  };
  /** What a resident thinks of the city at time t. */
  function opinions(c, t) {
    const x = cityContext(t), T = c.traits, age = ageAt(c.birth, t);
    const prof = x.profiles[c.district] || { env: 0, aes: 0 };
    const greenHome = prof.env > 0 ? prof.env : 0, industrialHome = prof.env < 0 ? -prof.env : 0;
    const s = {
      air: clamp((x.aqi - 50) / 100, 0, 1.3) * (0.55 + T.saturation * 0.45 + greenHome * 0.4 + (age > 65 || age < 12 ? 0.25 : 0)),
      power: clamp((x.dark[c.district] || 0) / 6, 0, 1.2) * (0.6 + T.flicker * 0.6),
      parks: clamp((1 - x.parks[c.district]) / 1, 0, 1) * (0.05 + T.saturation * 0.3 + greenHome * 0.25),
      coal: clamp((3 - x.coal) / 3, 0, 1) * (0.3 + industrialHome * 0.8) * (1.2 - T.saturation),
      weather: (x.temp < 10 ? (10 - x.temp) / 8 : x.temp > 24 ? (x.temp - 24) / 6 : 0) * (0.3 + T.flicker * 0.6) + (x.rain > 10 ? 0.25 : 0)
    };
    const ranked = Object.keys(s).sort((a, b) => s[b] - s[a]);
    const top = s[ranked[0]] > 0.18 ? ranked[0] : 'none';
    let worry = 0;
    for (const k in s) worry += s[k];
    const happiness = clamp(0.72 + T.brightness * 0.14 + T.warmth * 0.1 - T.flicker * 0.08 - worry * 0.32, 0, 1);
    const mood = happiness >= 0.6 ? 'content' : happiness >= 0.38 ? 'uneasy' : 'unhappy';
    let lean = null;
    if (age >= 18) {
      // personal reasons, anchored to the parties' standing in the Senate's polls so the census and the Senate agree
      const sp = x.support;
      const sc = {
        V: T.saturation * 0.45 + s.air * 0.3 + s.parks * 0.3 + prof.env * 0.35 + c.leanNoise.V + (sp.V - 0.33) * 3 + LEAN_OFFSET.V,
        B: T.brightness * 0.5 + s.coal * 0.6 + s.power * 0.2 - prof.env * 0.3 + c.leanNoise.B + (sp.B - 0.33) * 3 + LEAN_OFFSET.B,
        L: T.sharpness * 0.5 + (age > 55 ? 0.25 : 0) - prof.aes * 0.3 + (1 - T.saturation) * 0.2 + c.leanNoise.L + (sp.L - 0.33) * 3 + LEAN_OFFSET.L
      };
      const order = Object.keys(sc).sort((a, b) => sc[b] - sc[a]);
      lean = sc[order[0]] - sc[order[1]] < 0.05 ? 'undecided' : order[0];
    }
    return { happiness: rd2(happiness), mood, top, concerns: ranked.filter((k) => s[k] > 0.18), scores: s, lean, quote: quote(c, top, mood, x, t) };
  }

  function quote(c, top, mood, x, t) {
    const r = seeded('quote:' + c.id + ':' + ymd(dayOf(t)));
    const d = c.districtName;
    const L = {
      air: ['You can taste the coal on a Tuesday. I have started doing my breathing on Wednesdays.', 'The air in ' + d + ' is ' + x.air.toLowerCase() + '. I know because the Bureau told me, and because my eyes did.',
        'I used to see the harbour from my window. I am told it is still there.', 'Smog again. I have dimmed myself to save the effort of breathing.'],
      power: ['We lost the lights again this week. I sat in the dark and thought about my rating.', 'Three blackouts in ' + d + ' in seven days. I have started reading by my own light.',
        'I do not mind the dark. I mind not knowing when it is coming.'],
      parks: ['There is a park in another district. I have seen photographs.', d + ' could do with a tree or two. Even a small one. Even a drawing of one.', 'I would like somewhere green to sit that is not my own front step.'],
      coal: ['My cousin works at the coal plant. Or did. It depends which day you ask the Senate.', 'Everyone wants clean air until it is their job being cleaned away.', 'The plants kept this city lit for years. They deserve a thank you, not a closing date.'],
      weather: ['It is cold enough that I can see my own glow.', 'The Bureau said it would probably be fine. It has a very broad idea of fine.', 'Too warm for a pixel. We are not built for this.'],
      none: ['I have no complaints. I find that suspicious.', 'Honestly? It is a good city. Slow, but good.', 'I like it here. I watch the race, I go to bed, I get up. That is enough for me.', 'Nothing to report. Please do not put that in the paper.']
    };
    let line = pick(r, L[top] || L.none);
    if (mood === 'content' && top !== 'none' && r() < 0.5) line += ' But I am fine, really.';
    return line;
  }

  // ================================================================ people at a moment
  function residentsOfHome(hi, t) {
    const ten = tenancyAt(hi, t);
    return household(hi, ten.k);
  }
  /** A full profile at time t. Residents who have moved away are still on file, marked as gone. */
  function person(id, t) {
    const c = character(id);
    if (!c) return null;
    named(c);
    c.age = ageAt(c.birth, t);
    c.present = t >= c.movedIn && t < c.movesOut && t >= c.birth;
    c.born = t >= c.birth;
    c.stage = c.age < 5 ? 'Too young for school' : c.age < 13 ? 'At primary school' : c.age < 18 ? 'Old enough for Pixel High' : c.age < 22 ? 'Old enough for university' : c.age < 67 ? 'Of working age' : 'Retired';
    c.householdMembers = c.household.map((mid) => { const m = named(character(mid)); return { id: mid, name: m.name, role: m.role, age: ageAt(m.birth, t), color: m.color, born: t >= m.birth }; });
    c.sinceFounding = c.movedIn <= EPOCH;
    if (c.present && c.age >= 12) c.thinks = opinions(c, t);
    return c;
  }
  function summary(id, t) {
    const c = named(character(id));
    return { id, name: c.name, color: c.color, age: ageAt(c.birth, t), role: c.role, address: c.address, district: c.district, districtName: c.districtName };
  }

  /** Everyone living in a district at time t, home by home: offset and limit page through it. */
  function residentsOf(district, t, offset, limit) {
    homes();
    const list = BY_DISTRICT[district] || [];
    const out = [];
    let skipped = 0;
    offset = offset || 0; limit = limit || 60;
    for (const hi of list) {
      const hh = residentsOfHome(hi, t);
      for (const m of hh.members) {
        if (t < m.birth) continue;
        if (skipped < offset) { skipped++; continue; }
        out.push(summary(m.id, t));
        if (out.length >= limit) return out;
      }
    }
    return out;
  }

  /** Everyone in the city aged min..max (inclusive) at time t, optionally in one district. For schools and the Job Centre. */
  function cohort(t, min, max, district) {
    homes();
    const out = [];
    const list = district === undefined ? HOMES.map((h) => h.i) : BY_DISTRICT[district];
    for (const hi of list) for (const m of residentsOfHome(hi, t).members) { const a = ageAt(m.birth, t); if (t >= m.birth && a >= min && a <= max) out.push(m.id); }
    return out;
  }

  const nameIndex = { day: null, list: null };
  function search(q, t, limit) {
    q = String(q || '').trim().toLowerCase();
    if (q.length < 2) return [];
    const d = dayOf(t);
    if (nameIndex.day !== d) {
      nameIndex.list = [];
      for (const h of homes()) for (const m of residentsOfHome(h.i, t).members) if (t >= m.birth) nameIndex.list.push([m.id, named(character(m.id)).name.toLowerCase()]);
      nameIndex.day = d;
    }
    const out = [];
    for (const [id, n] of nameIndex.list) { if (n.indexOf(q) >= 0) { out.push(summary(id, t)); if (out.length >= (limit || 50)) break; } }
    return out;
  }

  // ---------------------------------------------------------------- the city in numbers
  const statCache = new Map();
  function stats(t) {
    const d = dayOf(t);
    if (statCache.has(d)) return statCache.get(d);
    const map = renewedMap();
    const ages = [], byD = map.districts.map((x) => ({ id: x.id, name: x.name, residents: 0, homes: 0, ages: [], children: 0, over65: 0 }));
    let households = 0;
    for (const h of homes()) {
      const hh = residentsOfHome(h.i, t);
      households++;
      byD[h.district].homes++;
      for (const m of hh.members) {
        if (t < m.birth) continue;
        const a = ageAt(m.birth, t);
        ages.push(a); byD[h.district].ages.push(a); byD[h.district].residents++;
        if (a < 18) byD[h.district].children++;
        if (a >= 65) byD[h.district].over65++;
      }
    }
    const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
    const bands = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (const a of ages) bands[a >= 90 ? 9 : Math.floor(a / 10)]++;
    const out = {
      population: ages.length, households, medianAge: med(ages), children: ages.filter((a) => a < 18).length, over65: ages.filter((a) => a >= 65).length, ageBands: bands,
      oldest: ages.length ? Math.max.apply(null, ages) : 0,
      districts: byD.map((x) => ({ id: x.id, name: x.name, residents: x.residents, homes: x.homes, medianAge: med(x.ages), children: x.children, over65: x.over65 }))
    };
    if (statCache.size > 20) statCache.clear();
    statCache.set(d, out);
    return out;
  }

  // ================================================================ the weekly panel
  const panelCache = new Map();
  const panelDate = (t) => { const w = Math.floor((t - FIRST_PANEL) / WEEK); return w < 0 ? null : FIRST_PANEL + w * WEEK; };
  /** The panel published on the Monday at or before t: 800 adults, chosen at random, asked how they feel. */
  function panelAt(t) {
    const pd = panelDate(t);
    if (pd === null) return null;
    if (panelCache.has(pd)) return panelCache.get(pd);
    const map = renewedMap(), all = homes();
    const r = seeded('panel:' + ymd(pd));
    const moods = { content: 0, uneasy: 0, unhappy: 0 }, tops = {}, leans = { B: 0, V: 0, L: 0, undecided: 0 }, favs = {};
    const byD = map.districts.map(() => ({ n: 0, happy: 0, tops: {} }));
    const voices = [];
    let n = 0, tries = 0;
    while (n < PANEL_SIZE && tries < PANEL_SIZE * 4) {
      tries++;
      const h = all[Math.floor(r() * all.length)];
      const hh = residentsOfHome(h.i, pd);
      const m = hh.members[Math.floor(r() * hh.members.length)];
      if (ageAt(m.birth, pd) < 18) continue;
      const c = named(character(m.id)), o = opinions(c, pd);
      n++;
      moods[o.mood]++; tops[o.top] = (tops[o.top] || 0) + 1; leans[o.lean] = (leans[o.lean] || 0) + 1; favs[c.favourite] = (favs[c.favourite] || 0) + 1;
      const D = byD[c.district]; D.n++; D.happy += o.happiness; D.tops[o.top] = (D.tops[o.top] || 0) + 1;
      if (voices.length < 4 && r() < 0.03) voices.push({ id: c.id, name: c.name, age: ageAt(c.birth, pd), districtName: c.districtName, color: c.color, quote: o.quote, mood: o.mood });
    }
    const pct = (v) => Math.round((v / n) * 100);
    const topOf = (o) => Object.keys(o).sort((a, b) => o[b] - o[a])[0];
    const p = {
      date: ymd(pd), published: pd, size: n,
      mood: { content: pct(moods.content), uneasy: pct(moods.uneasy), unhappy: pct(moods.unhappy) },
      concerns: Object.keys(tops).sort((a, b) => tops[b] - tops[a]).map((k) => ({ key: k, label: CONCERNS[k], pct: pct(tops[k]) })),
      leans: { B: pct(leans.B), V: pct(leans.V), L: pct(leans.L), undecided: pct(leans.undecided) },
      favourites: Object.keys(favs).sort((a, b) => favs[b] - favs[a]).slice(0, 5).map((k) => ({ id: k, name: PIXELS.filter((x) => x[0] === k)[0][1], pct: pct(favs[k]) })),
      districts: byD.map((D, i) => ({ id: i, name: map.districts[i].name, sample: D.n, happiness: D.n ? rd2(D.happy / D.n) : null, top: D.n ? topOf(D.tops) : null, topLabel: D.n ? CONCERNS[topOf(D.tops)] : null })),
      voices
    };
    if (panelCache.size > 80) panelCache.clear();
    panelCache.set(pd, p);
    return p;
  }
  function panelsBetween(from, to) {
    const out = [];
    for (let pd = panelDate(from) === null ? FIRST_PANEL : panelDate(from); pd < to; pd += WEEK) if (pd >= from || out.length === 0) out.push(panelAt(pd));
    return out.filter(Boolean);
  }

  // ---------------------------------------------------------------- a resident of the day, for the front page
  function residentOfTheDay(t) {
    const d = dayOf(t), r = seeded('featured:' + ymd(d)), all = homes();
    for (let tries = 0; tries < 50; tries++) {
      const h = all[Math.floor(r() * all.length)], hh = residentsOfHome(h.i, d);
      const m = hh.members[Math.floor(r() * hh.members.length)];
      if (ageAt(m.birth, d) >= 16) return m.id;
    }
    return residentsOfHome(0, d).members[0].id;
  }

  // ================================================================ events
  const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
  function eventsBetween(from, to) {
    if (!ready() || to <= OPENS) return [];
    const lo = from > OPENS ? from : OPENS;
    const out = [];
    if (OPENS >= from && OPENS < to) {
      const s = stats(OPENS);
      out.push({ id: 'census:office:opens', time: iso(OPENS), source: 'census', type: 'census.opens', importance: 3, data: { population: s.population, households: s.households },
        headline: 'The Census Office opens and counts ' + s.population.toLocaleString('en') + ' pixels in ' + s.households.toLocaleString('en') + ' homes' });
    }
    // the weekly panel, published at 09:00 UTC on Mondays
    for (let pd = panelDate(lo - 9 * H) === null ? FIRST_PANEL : panelDate(lo - 9 * H); pd + 9 * H < to; pd += WEEK) {
      const at = pd + 9 * H;
      if (at < lo) continue;
      const p = panelAt(pd), top = p.concerns[0];
      const lead = p.mood.content >= 50 ? p.mood.content + '% of pixels are content' : p.mood.unhappy >= 30 ? p.mood.unhappy + '% of pixels are unhappy' : 'Pixels are uneasy';
      out.push({ id: 'census:panel:' + p.date, time: iso(at), source: 'census', type: 'census.panel', importance: top && top.key === 'air' && top.pct >= 40 ? 3 : 2,
        data: { mood: p.mood, concerns: p.concerns.slice(0, 3), leans: p.leans },
        headline: 'Citizens’ panel: ' + lead + (top && top.key !== 'none' ? ', and ' + top.label.toLowerCase() + ' tops the list of complaints' : '') });
    }
    // households moving, one note a day at 23:00 UTC
    const moves = movesBetween(dayOf(lo), to);
    const byDay = {};
    for (const mv of moves) { const d = dayOf(mv[0]); (byDay[d] = byDay[d] || []).push(mv); }
    for (const d in byDay) {
      const at = +d + 23 * H;
      if (at < lo || at >= to) continue;
      const list = byDay[d];
      const first = household(list[0][1], list[0][2]), was = household(list[0][1], list[0][2] - 1);
      const dn = renewedMap().districts[homes()[list[0][1]].district].name;
      out.push({ id: 'census:moves:' + ymd(+d), time: iso(at), source: 'census', type: 'census.moves', importance: 1, data: { households: list.length },
        headline: (list.length < WORDS.length ? WORDS[list.length] : String(list.length)) + ' household' + (list.length === 1 ? '' : 's') + ' moved home today, among them the ' + first.surname + ' family, who replace the ' + was.surname + ' family in ' + dn + ' district' });
    }
    out.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    return out;
  }

  // ================================================================ public API
  root.PixelUniverse = root.PixelUniverse || {};
  root.PixelUniverse.census = {
    version: VERSION, source: 'census', startDate: ymd(OPENS), opens: OPENS, epoch: EPOCH, ready, TRAITS, CONCERNS, PIXELS,
    stateAt(t) {
      if (!ready()) return { time: t, started: false, unavailable: 'Pixel City could not be reached' };
      if (t < EPOCH) return { time: t, started: false };
      const s = stats(t);
      return Object.assign({ time: t, started: true, version: VERSION, panel: panelAt(t), residentOfTheDay: residentOfTheDay(t) }, s);
    },
    eventsBetween, person, summary, residentsOf, cohort, search, stats, panelAt, panelsBetween, residentOfTheDay,
    /** A resident's identity and character only: name, colour, birth, home, traits. Cheap, for sites that need many. */
    character: (id) => { const c = character(id); return c ? named(c) : null; },
    homes: () => (ready() ? homes() : []), householdAt: (homeIndex, t) => residentsOfHome(homeIndex, t), movesBetween, ageAt
  };
})(typeof window !== 'undefined' ? window : globalThis);
