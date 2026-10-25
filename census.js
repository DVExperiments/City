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

  const VERSION = '0.3.0';
  const MIN = 60000, H = 3600000, DAY = 86400000, WEEK = 7 * DAY;
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
  // Working lives depend on the Exchange (which businesses are trading, and how many staff they keep), so from the
  // start of working lives it is a hard dependency. Its register of businesses (employers()) does not depend on it.
  const COM = () => U().commerce;
  const fullReady = () => ready() && !!(COM() && COM().ready()) && !!U().society;

  // ---------------------------------------------------------------- the life clock (the Pixel Calendar)
  // From 1 December 2026 lives run on the Pixel Calendar: a pixel ages a year every Pixel Year (one calendar month).
  // Every length of a life (ages, lifespans, tenancies, careers, courses, loan terms, the months in which a household
  // might light a new pixel) is measured on the Weather Bureau's life clock, which before the adoption is the ordinary
  // clock, so the census's history is exactly as it was. Spells and dates handed to other sites stay real moments.
  // The Weather Bureau comes first in every page's chain (City needs it), so the clock is always here.
  const PX = () => U().climate.pixel;
  const ADOPTED = Date.UTC(2026, 11, 1);
  const toL = (t) => (t < ADOPTED ? t : PX().toLife(t));
  const fromL = (l) => (l < ADOPTED ? l : PX().fromLife(l));
  /** The real moment `span` of life-clock time after t. */
  const later = (t, span) => fromL(toL(t) + span);

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
  const JOBS = ['body text hue controller', 'kerning inspector', 'senior gradient technician', 'coal plant stoker', 'solar panel polisher', 'margin pilot', 'stadium groundskeeper', 'weather balloon handler',
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
  // tenancies are measured on the life clock: households come and go twelve times as often under the Pixel Calendar
  function tenancyAt(hi, t) {
    const lt = toL(t);
    let len = tenancyLength(hi, 0);
    let start = EPOCH - Math.floor(seeded('lease0:' + hi)() * len), k = 0;
    while (start + len <= lt) { start += len; k++; len = tenancyLength(hi, k); }
    return { k, start: fromL(start), end: fromL(start + len) };
  }
  /** Every change of household in [from, to): [time, homeIndex, newTenancy]. */
  function movesBetween(from, to) {
    const out = [];
    for (const h of homes()) {
      const lf = toL(from), lt = toL(to);
      let len = tenancyLength(h.i, 0), start = EPOCH - Math.floor(seeded('lease0:' + h.i)() * len), k = 0;
      while (start + len < lt) { start += len; k++; if (start >= lf) out.push([fromL(start), h.i, k]); len = tenancyLength(h.i, k); }
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
    { let len = tenancyLength(hi, 0), start = EPOCH - Math.floor(seeded('lease0:' + hi)() * len); for (let j = 0; j < k; j++) { start += len; len = tenancyLength(hi, j + 1); } ten.start = start; ten.end = start + len; } // on the life clock
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
      const birth = fromL(ten.start - m.ageAtStart * YEAR - Math.floor(pr() * 365) * DAY);
      return { id: 'p' + hi + '-' + k + '-' + i, role: m.role, surname: m.surname, birth };
    }) };
    hh.start = fromL(ten.start); hh.end = fromL(ten.end);
    if (hhCache.size > 6000) hhCache.clear();
    hhCache.set(key, hh);
    return hh;
  }
  /** Age in whole years on the life clock: under the Pixel Calendar, a year older every Pixel Year. */
  const ageAt = (birth, t) => Math.floor((toL(t) - toL(birth)) / YEAR);
  /** The day of the Pixel Year (0 to 359) on which a pixel's age goes up, and it as words. */
  const PMONTHS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth'];
  function pixelBirthday(birth) {
    const off = (((toL(birth) - ADOPTED) % YEAR) + YEAR) % YEAR, doy = Math.floor((off * 360) / YEAR);
    return { dayOfYear: doy, month: Math.floor(doy / 30) + 1, day: (doy % 30) + 1, text: 'Day ' + ((doy % 30) + 1) + ' of the ' + PMONTHS[Math.floor(doy / 30)] + ' Month' };
  }

  // ================================================================ the Life Cycle
  // From 00:00 on 1 December 2026, city time, pixels are lit (born) and go dark (die). Before then the census is
  // exactly as it was. A pixel's lifespan is drawn once, from the chance of going dark at each age; a household's
  // new pixels come from a monthly chance shaped by work, room at home, age, children, the air, parks and the season.
  const LIFE_START = Date.UTC(2026, 10, 30, 12); // city midnight, 1 December 2026
  const MONTH = YEAR / 12;
  /** The start of month n of the Life Cycle on the life clock: a pixel month (about two and a half days) under the Pixel Calendar. */
  const lifeMonth = (n) => fromL(LIFE_START + Math.floor(n * MONTH));
  const GESTATION = 280 * DAY;
  // the chance of going dark within a year, by age
  const Q = [];
  for (let a = 0; a <= 115; a++) Q.push(a < 1 ? 0.004 : a < 15 ? 0.0002 : a < 25 ? 0.0005 : a < 35 ? 0.0008 : a < 45 ? 0.0015 : a < 55 ? 0.003 : a < 65 ? 0.007 : a < 75 ? 0.018 : a < 85 ? 0.05 : a < 95 ? 0.14 : a < 105 ? 0.32 : 0.6);
  const darkCache = new Map();
  /** When a pixel goes dark: a moment after the Life Cycle begins, drawn from their age then. */
  function darkAt(id, birth) {
    if (darkCache.has(id)) return darkCache.get(id);
    const from = birth > LIFE_START ? birth : LIFE_START;
    const a0 = Math.floor((toL(from) - toL(birth)) / YEAR);
    const u = seeded('dark:' + id)(), f = seeded('dark-day:' + id)();
    let s = 1, x = a0;
    while (x < 115) { s *= 1 - Q[x]; if (s < u) break; x++; }
    const when = later(from, Math.floor((x - a0 + f) * YEAR));
    if (darkCache.size > 200000) darkCache.clear();
    darkCache.set(id, when);
    return when;
  }
  const alive = (m, t) => t >= m.birth && t < darkAt(m.id, m.birth);

  // what the city was like, month by month, for the decision to light a new pixel
  const monthCache = new Map();
  function monthConditions(n) {
    if (monthCache.has(n)) return monthCache.get(n);
    const t = lifeMonth(n);
    const out = { aqi: 60, parks: null };
    try {
      const st = C().stateAt(t - DAY), map = renewedMap();
      out.aqi = st.aqi;
      out.parks = map.districts.map(() => 0);
      for (const x of st.sites || []) if (x.type === 'park' && x.state === 'operating') out.parks[map.features[x.id].district]++;
    } catch (e) { /* neutral conditions */ }
    monthCache.set(n, out);
    return out;
  }
  const litCache = new Map();
  /** The pixels lit into household (hi, k), up to time t: [{ id, birth, conceived, role, surname }] */
  function litUntil(hi, k, t) {
    const key = hi + ':' + k;
    let rec = litCache.get(key);
    const hh = household(hi, k);
    if (!rec) { rec = { n: null, list: [], expecting: null }; litCache.set(key, rec); if (litCache.size > 60000) { litCache.clear(); litCache.set(key, rec); } }
    const adults = hh.members.filter((m) => m.role === 'adult');
    if (adults.length !== 2) return rec.list;
    const hs = toL(hh.start), first = Math.ceil(((hs > LIFE_START - GESTATION ? hs : LIFE_START - GESTATION) - LIFE_START) / MONTH);
    if (rec.n === null) rec.n = first;
    const home = HOMES[hi];
    while (true) {
      const mt = lifeMonth(rec.n);
      if (mt > t || mt >= hh.end) break;
      const n = rec.n++;
      if (rec.expecting && mt < rec.expecting) continue;
      if (!adults.every((a) => alive(a, mt))) continue;
      const u = seeded('lit:' + key + ':' + n)();
      if (u >= 0.07) continue; // the most any month can offer; most months are decided here
      const younger = Math.min(ageAt(adults[0].birth, mt), ageAt(adults[1].birth, mt));
      if (younger < 18 || younger > 44) continue;
      const kids = hh.members.filter((m) => m.role === 'child' && alive(m, mt) && ageAt(m.birth, mt) < 18).length + rec.list.filter((b) => alive(b, mt)).length;
      if (kids >= 3) continue;
      const size = hh.members.filter((m) => alive(m, mt)).length + rec.list.filter((b) => alive(b, mt)).length;
      const room = size < home.size ? 1 : size === home.size ? 0.45 : size === home.size + 1 ? 0.12 : 0;
      const age = younger < 22 ? 0.6 : younger < 30 ? 1 : younger < 35 ? 0.85 : younger < 40 ? 0.55 : 0.2;
      const kidsF = kids === 0 ? 1 : kids === 1 ? 0.75 : 0.4;
      let work = 0.85; // before the Job Centre's records begin
      if (mt >= LIFE_START) { const w = adults.filter((a) => careerAt(a.id, a.birth, home.district, mt).status === 'employed').length; work = w === 2 ? 1 : w === 1 ? 0.8 : 0.45; }
      const cond = n >= 0 ? monthConditions(n) : { aqi: 60, parks: null };
      const air = cond.aqi > 150 ? 0.8 : cond.aqi > 100 ? 0.92 : 1;
      const green = cond.parks && cond.parks[home.district] > 0 ? 1.08 : 1;
      const mon = mt < ADOPTED ? new Date(mt + 12 * H).getUTCMonth() : PX().time(mt).month - 1; // the pixel month, under the Pixel Calendar
      const season = mon >= 8 || mon <= 1 ? 1.08 : 0.95;
      const p = 0.052 * room * age * kidsF * work * air * green * season;
      if (u >= p) continue;
      const conceived = later(mt, Math.floor(seeded('lit-day:' + key + ':' + n)() * 28) * DAY);
      const birth = later(conceived, GESTATION + Math.floor((seeded('lit-due:' + key + ':' + n)() - 0.5) * 20) * DAY);
      if (birth >= hh.end) break; // they will have moved away by then
      rec.list.push({ id: 'p' + hi + '-' + k + '-b' + rec.list.length, birth, conceived, role: 'child', surname: hh.surname });
      rec.expecting = later(birth, 90 * DAY); // a little while before the next
    }
    return rec.list;
  }
  /** All pixels lit into a household, as far as has been worked out: for looking up a lit pixel by id. */
  const litIn = (hi, k) => (litCache.get(hi + ':' + k) || { list: [] }).list;
  /** Who lives in household (hi, k) at time t: the household as it arrived, less those gone dark, plus those lit since. */
  function membersAt(hi, k, t) {
    const hh = household(hi, k);
    if (t < LIFE_START) return hh.members;
    const out = hh.members.filter((m) => t < darkAt(m.id, m.birth));
    for (const b of litUntil(hi, k, t)) if (t >= b.birth && t < darkAt(b.id, b.birth)) out.push(b);
    return out;
  }

  const parseId = (id) => {
    let m = /^p(\d+)-(\d+)-(\d+)$/.exec(id);
    if (m) return { hi: +m[1], k: +m[2], i: +m[3] };
    m = /^p(\d+)-(\d+)-b(\d+)$/.exec(id); // a pixel lit in the Life Cycle era
    return m ? { hi: +m[1], k: +m[2], b: +m[3] } : null;
  };
  function memberOf(p) {
    if (p.b === undefined) return household(p.hi, p.k).members[p.i];
    // a lit pixel: work out the household's new pixels just far enough to find this one
    const hh = household(p.hi, p.k);
    for (let l = LIFE_START + YEAR, end = toL(hh.end) + YEAR; !litIn(p.hi, p.k)[p.b] && l < end; l += YEAR) litUntil(p.hi, p.k, fromL(l));
    return litIn(p.hi, p.k)[p.b];
  }

  /** A resident's identity and character: everything that does not change with the city. */
  function character(id) {
    const p = parseId(id);
    if (!p || !homes()[p.hi]) return null;
    const hh = household(p.hi, p.k), mem = memberOf(p);
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
      pixelBirthday: pixelBirthday(mem.birth).text,
      birthday: new Date(mem.birth).getUTCDate() + ' ' + ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][new Date(mem.birth).getUTCMonth()],
      home: home.i, address: home.address, district: home.district, districtName: renewedMap().districts[home.district].name, homeKind: home.kind,
      movedIn: p.b !== undefined ? mem.birth : hh.start, movesOut: hh.end, household: hh.members.map((m) => m.id), householdKind: hh.kind, lit: p.b !== undefined,
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


  // ================================================================ working lives (the Job Centre's records)
  // Every resident aged 18 to 66 has a career on the city's clock, from the Life Cycle's start: spells of a few years
  // with one employer, sometimes a spell looking for work, sometimes a spell out of the workforce. Employers are the
  // city's shops, offices, factories, warehouses and docks, its institutions, and its power stations and parks. When a
  // site closes, its staff are laid off and look for work. How hard it is to find work depends on how many jobs there
  // are for the city's workforce.
  const JOB_CENTRE_OPENS = Date.UTC(2026, 11, 6, 20, 30); // 8:30am, Monday 7 December, city time
  const SECTOR = {
    office: { label: 'Offices', wage: 640, titles: ['body text hue controller', 'kerning inspector', 'senior gradient technician', 'subpixel alignment officer', 'refresh rate auditor', 'colour temperature adjuster', 'anti-glare consultant', 'shade allocator', 'font licensing clerk', 'accounts clerk (watts)'] },
    shop: { label: 'Shops', wage: 430, titles: ['counter pixel', 'till operator', 'display arranger', 'charge pourer', 'palette mixer', 'cache stacker'] },
    factory: { label: 'Industry', wage: 540, titles: ['palette refiner', 'texture caster', 'render operator', 'codec compressor', 'line supervisor'] },
    warehouse: { label: 'Caches and haulage', wage: 480, titles: ['packet picker', 'dispatch clerk', 'byte lifter', 'night watch'] },
    port: { label: 'The export buffer', wage: 580, titles: ['buffer handler', 'export crane operator', 'margin pilot', 'line handler'] },
    energy: { label: 'Power', wage: 660, titles: ['coal plant stoker', 'boiler engineer', 'control room operator', 'solar panel polisher', 'turbine climber', 'inverter technician'] },
    parks: { label: 'Parks and wildlife', wage: 470, titles: ['park keeper', 'gardener', 'ranger'] },
    building: { label: 'Construction', wage: 560, titles: ['construction worker', 'site foreman', 'crane operator'] },
    public: { label: 'Public institutions', wage: 600, titles: ['clerk'] },
    school: { label: 'Education', wage: 620, titles: ['teacher'] }
  };
  const INSTITUTIONS = {
    senate: [30, ['Senate stenographer', 'clerk of the chamber', 'usher', 'Hansard reporter']],
    stadium: [70, ['stadium groundskeeper', 'race steward', 'floodlight technician', 'race commentator', 'ticket seller']],
    bureau: [35, ['forecaster', 'weather balloon handler', 'climate data clerk']],
    bookmaker: [20, ['bookmaker', 'odds compiler', 'cashier']],
    press: [55, ['reporter', 'sub-editor', 'newsprint folder', 'printer']],
    museum: [25, ['museum conservator', 'gallery guide', 'archivist']],
    census: [35, ['census enumerator', 'records clerk', 'statistician']],
    radio: [18, ['radio presenter', 'producer', 'sound engineer']],
    observatory: [12, ['astronomer', 'telescope polisher']],
    jobs: [25, ['job coach', 'case officer']],
    school: [265, ['teacher']],
    port: [60, ['harbour master', 'port clerk', 'customs officer']],
    gas: [20, ['gas plant operator']]
  };
  const SITE_JOBS = { coal: 110, solar: 12, wind: 10, park: 4, wildlife: 3 };
  const BIZ_A = ['Halftone', 'Gridley', 'Kerning', 'Lumen', 'Raster', 'Gamut', 'Pica', 'Serif', 'Vector', 'Glyph', 'Phosphor', 'Contrast', 'Aperture', 'Prism', 'Bitwell', 'Dotson', 'Inkwell', 'Scanlon'];
  // what the city's businesses make and sell: the things pixels use, need and want (the Exchange trades them)
  const BIZ_B = { office: ['Typesetting', 'Colour Consultants', 'Gradient Partners', 'Alignment Bureau', 'Refresh Services', 'Font Licensing', 'Calibration Services', 'Brightness Advisory'],
    shop: ['Refresh Pantry', 'Cache & Carry', 'Palette Shop', 'Charge Bar', 'Patch Shop', 'Shader Parlour', 'Signal Kiosk'], factory: ['Texture Foundry', 'Palette Refinery', 'Render Plant', 'Compression Works'],
    warehouse: ['Cache', 'Packet Haulage', 'Data Distribution'], port: ['Buffer Handlers'] };

  let EMP = null;
  function employers() {
    if (EMP) return EMP;
    const C0 = C(), m = renewedMap(), T = C0.T, JOBS = C0.JOBS;
    const kindOf = { [T.OFFICE]: 'office', [T.SHOP]: 'shop', [T.FACTORY]: 'factory', [T.WAREHOUSE]: 'warehouse', [T.DOCK]: 'port' };
    EMP = [];
    for (let i = 0; i < m.tiles.length; i++) {
      const kind = kindOf[m.tiles[i]], d = m.district[i];
      if (!kind || d < 0 || m.owner[i] >= 0) continue;
      const r = seeded('employer:' + i), x = i % m.W, y = Math.floor(i / m.W);
      EMP.push({ id: 'b' + i, kind: 'business', sector: kind, district: d, x, y, capacity: JOBS[m.tiles[i]],
        name: pick(r, BIZ_A) + ' ' + pick(r, BIZ_B[kind]), titles: SECTOR[kind].titles });
    }
    for (const f of m.features) {
      if (f.kind === 'landmark' && INSTITUTIONS[f.type]) {
        const [cap, titles] = INSTITUTIONS[f.type];
        EMP.push({ id: 'i' + f.id, kind: 'institution', sector: f.type === 'school' ? 'school' : f.type === 'port' ? 'port' : f.type === 'gas' ? 'energy' : 'public', district: f.district, x: f.x, y: f.y, capacity: cap, name: f.name, titles, feature: f });
      } else if (f.kind === 'site') {
        EMP.push({ id: 's' + f.id, kind: 'site', sector: f.type === 'park' || f.type === 'wildlife' ? 'parks' : 'energy', district: f.district, x: f.x, y: f.y, capacity: SITE_JOBS[f.type], name: f.name, titles: SECTOR[f.type === 'park' || f.type === 'wildlife' ? 'parks' : 'energy'].titles.filter((t) => f.type === 'coal' ? /coal|boiler|control/.test(t) : f.type === 'solar' ? /solar|inverter/.test(t) : f.type === 'wind' ? /turbine/.test(t) : true), feature: f });
        EMP.push({ id: 'c' + f.id, kind: 'construction', sector: 'building', district: f.district, x: f.x, y: f.y, capacity: 35, name: 'Construction of ' + f.name, titles: SECTOR.building.titles, feature: f });
      }
    }
    EMP.byId = {};
    for (const e of EMP) EMP.byId[e.id] = e;
    return EMP;
  }
  function operating(e, t) {
    if (e.kind === 'business') return t < LIFE_START || COM().openAt(e.id, t);
    const C0 = C();
    if (e.kind === 'institution') { if (e.feature.type === 'jobs' && t < JOB_CENTRE_OPENS) return false; return !(C0.isPlanned && C0.isPlanned(e.feature, t)); }
    const st = C0.siteStateAt(e.feature.id, t).state;
    return e.kind === 'site' ? st === 'operating' : st === 'building';
  }
  // the employers open in a given month, as cumulative capacity, city-wide and by district, for choosing among them
  const openCache = new Map();
  function openIn(n) {
    if (openCache.has(n)) return openCache.get(n);
    const t = LIFE_START + Math.floor(n * MONTH) + DAY;
    const all = { list: [], cum: [], total: 0 }, by = renewedMap().districts.map(() => ({ list: [], cum: [], total: 0 }));
    // a business hires in proportion to the staff it wants: a busy one more than its premises' usual share, a quiet one less
    const want = t >= LIFE_START ? COM().staffAt(t) : null;
    for (const e of employers()) {
      if (!operating(e, t)) continue;
      const w = want && e.kind === 'business' ? Math.max(1, Math.min(e.capacity * 1.25, (want[e.id] || 0) / 0.8)) : e.capacity;
      for (const bucket of [all, by[e.district]]) { bucket.total += w; bucket.list.push(e); bucket.cum.push(bucket.total); }
    }
    const out = { all, by, jobs: all.total };
    if (openCache.size > 120) openCache.clear();
    openCache.set(n, out);
    return out;
  }
  const choose = (bucket, u) => { const v = u * bucket.total; let lo = 0, hi = bucket.list.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (bucket.cum[mid] > v) hi = mid; else lo = mid + 1; } return bucket.list[lo]; };
  // the city's workforce, counted once when the records begin
  let WORKFORCE = null;
  function workforce() {
    if (WORKFORCE !== null) return WORKFORCE;
    // adults only, so the households as they arrived will do: new pixels are years from working age, and counting them
    // here would ask whether their parents work, which needs this very number
    let n = 0;
    for (const h of homes()) for (const m of household(h.i, tenancyAt(h.i, LIFE_START).k).members) { const a = ageAt(m.birth, LIFE_START); if (a >= 18 && a <= 66) n += a < 22 ? 0.5 : a < 60 ? 0.87 : 0.6; }
    WORKFORCE = n;
    return n;
  }
  const monthIndex = (t) => Math.floor((t - LIFE_START) / MONTH);
  const careerCache = new Map(), dreamOf = new Map();
  const dream = (id) => { if (!dreamOf.has(id)) { const c = character(id); dreamOf.set(id, c ? c.dreamJob : null); if (dreamOf.size > 150000) dreamOf.clear(); } return dreamOf.get(id); };
  /**
   * A resident's working life up to time t: spells of { from, to, status, employer, title, wage, reason }.
   * status: 'employed', 'looking' (for work), 'away' (out of the workforce), 'retired', 'young'.
   * A job at a power station or a building site is checked for a closure only up to t, never beyond: the future
   * of the city isn't known yet. The check resumes when a later moment is asked about.
   */
  // ---------------------------------------------------------------- Pixel University (from 1 March 2027)
  // School leavers often go, adults sometimes, and pixels out of work most of all. A degree takes three years, a diploma
  // one (older students take diplomas). What they read follows their dream job. Graduates move up: in a trade their
  // faculty knows, they take a senior role; anywhere else, a senior version of the job. Either way they're paid more.
  // Under the Pixel Calendar the University's year is a Pixel Year: it opens on 1 March 2027 (the first day of Year 16),
  // and from then each year begins on the first day of the third pixel month and graduates on the first day of the
  // twelfth. Applications open a Pixel Year before it opens.
  const UNI_OPENS = Date.UTC(2027, 2, 1), UNI_APPLY = Date.UTC(2027, 1, 1), UNI_YEAR0 = 16;
  const uniStart = (y) => (y <= UNI_YEAR0 ? UNI_OPENS : PX().moment(y, 60));
  const uniGrad = (y) => PX().moment(y, 330);
  function uniNextStart(S) { let y = S < UNI_OPENS ? UNI_YEAR0 : PX().time(S).year; while (uniStart(y) < S) y++; return y; }
  function uniLastStart(t) { let y = PX().time(t).year; while (y > UNI_YEAR0 && uniStart(y) > t) y--; return uniStart(y); }
  function uniLastGrad(t) { let y = PX().time(t).year; while (y >= UNI_YEAR0 && uniGrad(y) > t) y--; return y >= UNI_YEAR0 ? uniGrad(y) : null; }
  const FACULTIES = [
    { id: 'rendering', name: 'School of Rendering', course: 'Rendering Engineering', sector: 'factory', roles: ['render line manager', 'chief texture engineer', 'plant director'] },
    { id: 'colour', name: 'Faculty of Colour', course: 'Palette Science and Colour Theory', sector: 'shop', roles: ['head of palette', 'colour director', 'chief colourist'] },
    { id: 'signal', name: 'Department of Signal and Compression', course: 'Signal Theory', sector: 'warehouse', roles: ['logistics director', 'compression architect', 'head of dispatch'] },
    { id: 'economics', name: 'School of Brightness Economics', course: 'Brightness Economics', sector: 'office', roles: ['chief economist', 'senior analyst', 'partner'] },
    { id: 'governance', name: 'School of Governance', course: 'Governance and the Pixel State', sector: 'office', roles: ['policy adviser', 'Senate researcher', 'head of public affairs'] },
    { id: 'arts', name: 'Faculty of the Arts', course: 'Dithering, Typesetting and Music for Pixels', sector: null, roles: ['art director', 'composer in residence', 'head of typography'] },
    { id: 'philosophy', name: 'Department of Philosophy', course: 'Philosophy of the Refresh', sector: null, roles: ['resident philosopher', 'ethics adviser'] }
  ];
  function chooseFaculty(id, ru) {
    // a pixel reads what their dream points at, more often than not
    const want = dream(id), w = FACULTIES.map((f) => (f.sector && SECTOR[f.sector] && SECTOR[f.sector].titles.indexOf(want) >= 0 ? 4 : 1) * (f.id === 'governance' || f.id === 'philosophy' ? 0.6 : 1));
    let tot = 0; for (const x of w) tot += x; let u = ru() * tot;
    for (let i = 0; i < w.length; i++) { u -= w[i]; if (u < 0) return FACULTIES[i]; }
    return FACULTIES[0];
  }
  // ---------------------------------------------------------------- wellbeing and choices (from 1 September 2027)
  // A pixel's needs are their district's (Pixel City Society: housing, charge, health, security, leisure), adjusted for
  // their own life: pay against their trade, being out of work, studying, a student loan to repay, age. Each month a
  // working pixel weighs up their job (pay, their dream, their wellbeing); an unhappy one may quit. A pixel who quits
  // may retrain at Pixel University, usually towards their dream, on a loan from the Bank at its rate on the day.
  const WELL_START = Date.UTC(2027, 8, 1);
  function wellbeingOf(id, birth, district, t, sp, c) {
    const S = U().society, base = S && S.needsAt ? S.needsAt(district, t) : null;
    if (!base) return null;
    const n = { housing: base.housing, charge: base.charge, health: base.health, security: base.security, leisure: base.leisure };
    if (sp && sp.status === 'employed') { const e = employers().byId[sp.employer]; n.housing += ((sp.wage || 0) / (e ? SECTOR[e.sector].wage : 500) - 1) * 0.8; }
    else if (sp && sp.status === 'looking') n.housing -= 0.25;
    else if (sp && sp.status === 'studying') n.housing -= 0.1;
    if (c && c.loan && t >= c.loan.from && t < c.loan.until) n.housing -= 0.08;
    if (c && c.mortgage && t >= c.mortgage.from && t < c.mortgage.until) n.housing -= 0.05; // repayments, instead of rent
    if (ageAt(birth, t) >= 65) n.health -= 0.1 * (1 - n.health);
    for (const k in n) n[k] = n[k] < 0 ? 0 : n[k] > 1 ? 1 : n[k];
    n.wellbeing = 0.25 * n.housing + 0.2 * n.charge + 0.2 * n.health + 0.15 * n.security + 0.2 * n.leisure;
    return n;
  }
  // A household that moves into a house from 1 September 2027 often buys it with a mortgage from the Bank, at the Bank's
  // rate on the day plus 1.8%, over 25 years. The Bank's book is kept district by district; these are its borrowers.
  function mortgageOf(ch) {
    if (!ch || ch.homeKind !== 'house' || !(ch.movedIn >= WELL_START)) return null;
    const key = 'mortgage:' + ch.home + ':' + ch.movedIn;
    if (hash(key) / 4294967296 >= 0.6) return null;
    let rate = 4; try { const h = U().bank && U().bank.historyBetween(ch.movedIn - 2 * DAY, ch.movedIn); if (h && h.length) rate = h[h.length - 1].rate; } catch (e) { /* the Bank's books aren't here */ }
    return { amount: Math.round((30000 + (hash(key + ':a') % 40000)) / 100) * 100, rate: Math.round((rate + 1.8) * 100) / 100, from: ch.movedIn, until: later(ch.movedIn, 25 * YEAR) }; // 25 Pixel Years
  }
  function quitAt(id, birth, district, sp, c, from, to) { // the first month an unhappy pixel walks out, if any
    const e = employers().byId[sp.employer]; if (!e) return null;
    for (let lm = toL(sp.from) + 30 * DAY; ; lm += 30 * DAY) { // once a pixel month
      const m = fromL(lm);
      if (m > to) break;
      if (m <= from || m < WELL_START) continue;
      const wb = wellbeingOf(id, birth, district, m, sp, c); if (!wb) continue;
      const sat = 0.5 + ((sp.wage || 0) / SECTOR[e.sector].wage - 1) * 1.5 + (sp.dream ? 0.15 : 0) + (wb.wellbeing - 0.75);
      const p = sat < 0.55 ? Math.min(0.1, (0.55 - sat) * 0.4) : 0;
      if (p > 0 && seeded('quit:' + id + ':' + Math.floor(m / DAY))() < p) return m;
    }
    return null;
  }
  function careerUntil(id, birth, district, t) {
    let c = careerCache.get(id);
    if (!c) {
      c = { spells: [], next: null, k: 0 };
      const r = seeded('career0:' + id);
      const len0 = Math.floor((1 + r() * r() * 6) * YEAR);
      c.next = LIFE_START - Math.floor(r() * len0); // already some way into their first spell
      careerCache.set(id, c);
      if (careerCache.size > 120000) { careerCache.clear(); careerCache.set(id, c); }
    }
    const retireAt = later(birth, 67 * YEAR);
    while (true) {
      // finish checking an open job at a site, as far as t
      const last = c.spells[c.spells.length - 1];
      if (last && last.pending) {
        const e = employers().byId[last.employer], upTo = Math.min(last.planned, t);
        let x = last.checked, closedAt = null;
        if (e.kind === 'business') closedAt = COM().closeOf(e.id, last.gen, upTo); // the Exchange knows when a business fails
        else {
          for (; x + 7 * DAY <= upTo; x += 7 * DAY) if (!operating(e, x + 7 * DAY)) break;
          if (x + 7 * DAY <= upTo) { let y = x; while (y < x + 7 * DAY && operating(e, y + DAY)) y += DAY; closedAt = y + DAY; } // closed this week: find the day
          else { let y = x; while (y + DAY <= upTo && operating(e, y + DAY)) y += DAY; if (y + DAY <= upTo) closedAt = y + DAY; } // or in the days since the last full week, so the answer at t doesn't depend on what was asked before
        }
        if (e.kind === 'business') { // an unhappy pixel may walk out before anything else happens
          const q = quitAt(id, birth, district, last, c, last.checked, closedAt !== null ? closedAt : upTo);
          if (q !== null) { last.to = q; last.reason = 'Left: unhappy with the job'; delete last.pending; c.unhappy = q; c.next = q; continue; }
        }
        if (closedAt !== null) {
          last.to = closedAt; last.reason = e.kind === 'business' ? 'Laid off when ' + last.name + ' closed' : e.kind === 'site' ? 'Laid off when ' + e.name + ' closed' : 'The building was finished';
          delete last.pending;
          const r = seeded('laidoff:' + id + ':' + c.k);
          const look = later(last.to, Math.floor((2 + r() * 6) * MONTH));
          c.spells.push({ from: last.to, to: look, status: 'looking', reason: 'Laid off' });
          c.next = look;
        } else if (last.planned <= t) { delete last.pending; c.next = last.planned; }
        else { last.checked = e.kind === 'business' ? upTo : x; return c.spells; } // still open: we can't know more until t moves on
      }
      if (c.next > t || c.k >= 200) break;
      const S = c.next, k = c.k++;
      const r = seeded('career:' + id + ':' + k);
      const age = (toL(S) - toL(birth)) / YEAR;
      if (S >= retireAt) { c.spells.push({ from: S, to: Infinity, status: 'retired' }); c.next = Infinity; break; }
      if (age < 18) { const adult = later(birth, 18 * YEAR); c.spells.push({ from: S, to: adult, status: 'young' }); c.next = adult; continue; }
      if (S >= UNI_APPLY && !c.degree && age < 60) { // applications open a Pixel Year before the first year, in March 2027 // Pixel University: its own seed, so nothing else in a life is drawn differently
        const ru = seeded('uni:' + id + ':' + k), prev = c.spells[c.spells.length - 1];
        const unhappy = c.unhappy && toL(S) - toL(c.unhappy) < 60 * DAY && age < 50; // walked out recently: time to retrain?
        const chance = unhappy ? 0.5 : age < 25 ? 0.3 : prev && prev.status === 'looking' ? 0.14 : 0.025;
        if (ru() < chance) {
          // everyone starts together at the start of the University's Pixel Year, and finishes on graduation day
          const fac = chooseFaculty(id, ru), years = age < 25 ? 3 : 1, y0 = uniNextStart(S), start = uniStart(y0);
          const end = uniGrad(y0 + years - 1);
          if (end < retireAt) {
            if (start > S) c.spells.push({ from: S, to: start, status: 'away', reason: 'Waiting to start at Pixel University' });
            const studying = { from: start, to: end, status: 'studying', faculty: fac.id, course: fac.course, award: years === 3 ? 'degree' : 'diploma', reason: 'Studying ' + fac.course + ' at Pixel University' };
            if (S >= WELL_START) { // fees on a loan from the Bank, at its rate on the day, repaid over five years from graduation
              let rate = 4; try { const h = U().bank && U().bank.historyBetween(S - 2 * DAY, S); if (h && h.length) rate = h[h.length - 1].rate; } catch (e2) { /* the Bank's books aren't here */ }
              c.loan = { amount: years * 4000, rate: Math.round((rate + 1.5) * 100) / 100, from: end, until: later(end, 5 * YEAR) }; // five Pixel Years
              studying.reason += ', on a loan of ' + (years * 4000).toLocaleString('en') + ' W at ' + c.loan.rate + '%';
              if (unhappy) studying.reason += ', after leaving a job they didn\u2019t like';
            }
            c.spells.push(studying);
            c.unhappy = 0;
            c.degree = { faculty: fac.id, course: fac.course, award: years === 3 ? 'degree' : 'diploma', started: start, graduated: end };
            c.next = end;
            continue;
          }
        }
      }
      const len = Math.floor((1 + r() * r() * 6) * YEAR);
      const part = age < 22 ? 0.5 : age < 60 ? 0.87 : 0.6;
      if (r() >= part) {
        const why = age < 22 ? 'Studying' : age >= 60 ? 'Retired early' : r() < 0.5 ? 'Keeping house' : 'Caring for family';
        const end = Math.min(later(S, Math.floor(len * 0.6)), retireAt);
        if (why === 'Retired early') { c.spells.push({ from: S, to: Infinity, status: 'retired', reason: why }); c.next = Infinity; break; }
        c.spells.push({ from: S, to: end, status: 'away', reason: why });
        c.next = end;
        continue;
      }
      if (c.unhappy && toL(S) - toL(c.unhappy) < 60 * DAY) { // walked out, didn't retrain: a spell looking for something better
        c.unhappy = 0;
        const end = later(S, Math.floor((1 + r() * 2) * MONTH));
        c.spells.push({ from: S, to: end, status: 'looking', reason: 'Looking for something better' });
        c.next = end;
        continue;
      }
      const open = openIn(monthIndex(S > LIFE_START ? S : LIFE_START));
      const scarce = 1 - open.jobs / (workforce() * 1.02);
      if (r() < (scarce > 0.03 ? scarce : 0.03)) {
        const end = later(S, Math.floor((1 + r() * 6) * MONTH * (scarce > 0.15 ? 1.6 : 1)));
        c.spells.push({ from: S, to: end, status: 'looking', reason: 'Between jobs' });
        c.next = end;
        continue;
      }
      const local = open.by[district];
      const e = local.total && r() < 0.6 ? choose(local, r()) : choose(open.all, r());
      // a business that has closed since the month began isn't hiring: back to looking
      const occ = e.kind === 'business' ? COM().occupantAt(e.id, S) : null;
      if (e.kind === 'business' && !occ) {
        const end = later(S, Math.floor((0.5 + r() * 2) * MONTH));
        c.spells.push({ from: S, to: end, status: 'looking', reason: 'Between jobs' });
        c.next = end;
        continue;
      }
      const want = dream(id);
      let title = e.titles.indexOf(want) >= 0 && r() < 0.5 ? want : pick(r, e.titles);
      let wage = Math.round(SECTOR[e.sector].wage * (0.85 + r() * 0.3) * (1 + Math.min(0.4, (age - 22) * 0.01)) / 10) * 10;
      if (c.degree && S >= c.degree.graduated) { // a graduate moves up
        const fac = FACULTIES.find((f) => f.id === c.degree.faculty);
        title = fac.sector === e.sector ? fac.roles[hash('role:' + id + ':' + k) % fac.roles.length] : 'senior ' + title;
        wage = Math.round(wage * (c.degree.award === 'degree' ? 1.3 : 1.15) / 10) * 10;
      }
      const planned = Math.min(later(S, len), retireAt);
      const spell = { from: S, to: planned, status: 'employed', employer: e.id, title, wage, dream: title === want };
      if (occ) { spell.name = occ.name; spell.gen = occ.generation; }
      c.spells.push(spell);
      if (e.kind === 'site' || e.kind === 'construction' || occ) { spell.pending = true; spell.planned = planned; spell.checked = S > LIFE_START ? S : LIFE_START; c.next = Infinity; continue; }
      c.next = planned;
    }
    return c.spells;
  }
  /** What a resident is doing for a living at time t. */
  function careerAt(id, birth, district, t) {
    if (t < LIFE_START) return { status: 'unknown' };
    const age = ageAt(birth, t);
    if (age < 18) return { status: 'young' };
    for (const sp of careerUntil(id, birth, district, t)) if (t >= sp.from && t < sp.to) return Object.assign({}, sp, sp.employer ? { employerName: sp.name || employers().byId[sp.employer].name, sector: employers().byId[sp.employer].sector } : {});
    return { status: age >= 67 ? 'retired' : 'looking' };
  }
  function jobOf(id, t) {
    const c = character(id);
    if (!c) return null;
    return careerAt(id, c.birth, c.district, t);
  }
  const labourCache = new Map();
  /** The labour market at time t: totals, by sector and district, employers' headcounts, vacancies and the queue. */
  const uniCache = new Map();
  function universityAt(t) {
    if (t < UNI_OPENS) return { open: false, opens: UNI_OPENS, faculties: FACULTIES.map((f) => ({ id: f.id, name: f.name, course: f.course, roles: f.roles })) };
    const yearStart = uniLastStart(t), lastGrad = uniLastGrad(t);
    const d = Math.floor(t / DAY) + ':' + yearStart + ':' + lastGrad; // a Pixel Year can turn within a day
    if (uniCache.has(d)) return uniCache.get(d);
    const map = renewedMap();
    const fac = {}; for (const f of FACULTIES) fac[f.id] = { id: f.id, name: f.name, course: f.course, roles: f.roles, students: 0, degree: 0, diploma: 0, graduates: 0, newThisYear: 0 };
    const out = { open: true, loans: 0, loanBook: 0, students: 0, graduates: 0, graduatesWorking: 0, graduatesThisYear: 0, startedThisYear: 0, byDistrict: map.districts.map((x) => ({ id: x.id, name: x.name, students: 0, graduates: 0 })), sampleStudents: [], sampleGraduates: [] };
    for (const h of homes()) for (const m of residentsOfHome(h.i, t).members) {
      if (ageAt(m.birth, t) < 18) continue;
      const spells = careerUntil(m.id, m.birth, h.district, t), c = careerCache.get(m.id);
      if (!c || !c.degree) continue;
      if (c.loan && t < c.loan.until) { out.loans++; out.loanBook += t < c.loan.from ? c.loan.amount : c.loan.amount * (toL(c.loan.until) - toL(t)) / (toL(c.loan.until) - toL(c.loan.from)); }
      const now = spells.find((sp) => sp.from <= t && t < sp.to), g = c.degree, F = fac[g.faculty];
      const started = g.started;
      if (started > t) continue;
      if (started === yearStart) { out.startedThisYear++; F.newThisYear++; }
      if (now && now.status === 'studying') { out.students++; F.students++; F[g.award]++; out.byDistrict[h.district].students++; if (out.sampleStudents.length < 400) out.sampleStudents.push({ id: m.id, faculty: g.faculty, award: g.award, until: g.graduated }); }
      else if (g.graduated <= t) {
        out.graduates++; F.graduates++; out.byDistrict[h.district].graduates++;
        if (g.graduated === lastGrad) out.graduatesThisYear++;
        if (now && now.status === 'employed') { out.graduatesWorking++; if (out.sampleGraduates.length < 400) out.sampleGraduates.push({ id: m.id, faculty: g.faculty, award: g.award, graduated: g.graduated, title: now.title, employer: now.name || (employers().byId[now.employer] || {}).name }); }
      }
    }
    out.faculties = FACULTIES.map((f) => fac[f.id]);
    uniCache.set(d, out); if (uniCache.size > 6) uniCache.delete(uniCache.keys().next().value);
    return out;
  }
  /** The University's calendar: it opens; each Pixel Year a new year begins (the third pixel month) and graduates (the twelfth). */
  function universityEvents(from, to) {
    const out = [];
    if (to < UNI_OPENS - DAY) return out;
    for (let y = UNI_YEAR0; y <= PX().time(to).year; y++) {
      const begins = uniStart(y), term = y === UNI_YEAR0 ? begins - 3.5 * H : begins, grad = uniGrad(y); // the opening at 8:30am city time
      if (term >= from && term < to) {
        const u = universityAt(begins + H);
        out.push({ id: 'university:term:Y' + y, time: iso(term), ms: term, source: 'university', type: y === UNI_YEAR0 ? 'university.opens' : 'university.term', importance: y === UNI_YEAR0 ? 4 : 2, data: { started: u.startedThisYear, pixelYear: y },
          headline: y === UNI_YEAR0 ? 'Pixel University opens its doors, and ' + u.startedThisYear.toLocaleString('en') + ' pixels begin their studies' : 'Year ' + y + ' begins at Pixel University: ' + u.startedThisYear.toLocaleString('en') + ' pixels start courses' });
      }
      if (grad >= from && grad < to) {
        const u = universityAt(grad);
        out.push({ id: 'university:graduation:Y' + y, time: iso(grad), ms: grad, source: 'university', type: 'university.graduation', importance: 3, data: { graduates: u.graduatesThisYear, pixelYear: y },
          headline: 'Graduation day at Pixel University: ' + u.graduatesThisYear.toLocaleString('en') + ' pixels collect their degrees and diplomas' });
      }
    }
    return out;
  }
  function labourAt(t) {
    if (t < LIFE_START) return null;
    const d = Math.floor((t - LIFE_START) / DAY);
    if (labourCache.has(d)) return labourCache.get(d);
    const map = renewedMap();
    const out = { employed: 0, looking: 0, away: 0, retired: 0, dream: 0, bySector: {}, byDistrict: map.districts.map((x) => ({ id: x.id, name: x.name, employed: 0, looking: 0 })), head: {}, queue: [] };
    for (const h of homes()) for (const m of residentsOfHome(h.i, t).members) {
      if (ageAt(m.birth, t) < 18) continue;
      const j = careerAt(m.id, m.birth, h.district, t);
      if (j.status === 'employed') {
        out.employed++; out.head[j.employer] = (out.head[j.employer] || 0) + 1;
        out.bySector[j.sector] = (out.bySector[j.sector] || 0) + 1; out.byDistrict[h.district].employed++;
        if (j.dream) out.dream++;
      } else if (j.status === 'looking') { out.looking++; out.byDistrict[h.district].looking++; out.queue.push({ id: m.id, since: j.from, reason: j.reason }); }
      else if (j.status === 'retired') out.retired++; else if (j.status === 'studying') out.studying = (out.studying || 0) + 1; else out.away++;
    }
    out.rate = out.employed + out.looking ? Math.round(out.looking / (out.employed + out.looking) * 1000) / 10 : 0;
    out.queue.sort((a, b) => a.since - b.since);
    const open = openIn(monthIndex(t));
    out.jobs = open.jobs;
    out.vacancies = open.all.list.filter((e) => operating(e, t)).map((e) => ({ id: e.id, name: e.name, sector: e.sector, district: e.district, capacity: e.capacity, staff: out.head[e.id] || 0 }))
      .filter((v) => v.capacity - v.staff >= (v.capacity >= 20 ? 3 : 1)).map((v) => Object.assign(v, { open: v.capacity - v.staff }))
      .sort((a, b) => b.open - a.open);
    if (labourCache.size > 8) labourCache.clear();
    labourCache.set(d, out);
    return out;
  }

  // ================================================================ people at a moment
  // Migration (Pixel City Society, from 1 March 2027): when pixels leave a district, homes stand empty. Which homes is
  // drawn afresh for each household, so when the district fills again it is with new arrivals.
  function vacantAt(hi, k, t) {
    const S = U().society; if (!S || !S.populationAt || t < LIFE_START) return false;
    const home = homes()[hi], p = S.populationAt(home.district, t);
    return p < 1 && seeded('migration:' + hi + ':' + k)() < 1 - p;
  }
  function residentsOfHome(hi, t) {
    const ten = tenancyAt(hi, t), hh = household(hi, ten.k);
    if (vacantAt(hi, ten.k, t)) return Object.assign({}, hh, { members: [], vacant: true });
    return t < LIFE_START ? hh : Object.assign({}, hh, { members: membersAt(hi, ten.k, t) });
  }
  /** A full profile at time t. Residents who have moved away are still on file, marked as gone. */
  function person(id, t) {
    const c = character(id);
    if (!c) return null;
    named(c);
    c.age = ageAt(c.birth, t);
    c.dark = darkAt(c.id, c.birth);
    c.goneDark = t >= LIFE_START && t >= c.dark;
    c.present = t >= c.movedIn && t < c.movesOut && t >= c.birth && !c.goneDark;
    c.born = t >= c.birth;
    const pid = parseId(id), hhNow = household(pid.hi, pid.k);
    if (t >= LIFE_START) {
      const now = membersAt(pid.hi, pid.k, Math.min(t, hhNow.end - 1));
      c.household = hhNow.members.map((m) => m.id).concat(litIn(pid.hi, pid.k).filter((b) => b.birth <= t).map((b) => b.id));
      c.expecting = litUntil(pid.hi, pid.k, t).some((b) => b.conceived <= t && t < b.birth);
      c.livingWith = now.map((m) => m.id);
    }
    if (c.present && ageAt(c.birth, t) >= 18 && t >= LIFE_START) {
      c.work = careerAt(c.id, c.birth, c.district, t);
      c.career = careerUntil(c.id, c.birth, c.district, t).filter((sp) => sp.from <= t && sp.status !== 'young').map((sp) => Object.assign({}, sp, sp.employer ? { employerName: sp.name || employers().byId[sp.employer].name } : {}));
    }
    c.stage = c.age < 5 ? 'Too young for school' : c.age < 13 ? 'At primary school' : c.age < 18 ? 'Old enough for Pixel High' : c.age < 22 ? 'Old enough for university' : c.age < 67 ? 'Of working age' : 'Retired';
    c.householdMembers = c.household.map((mid) => { const m = named(character(mid)); const gone = t >= LIFE_START && t >= darkAt(mid, m.birth); return { id: mid, name: m.name, role: m.role, age: ageAt(m.birth, gone ? darkAt(mid, m.birth) : t), color: m.color, born: t >= m.birth, goneDark: gone, lit: m.lit }; });
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
      if (!m || ageAt(m.birth, pd) < 18) continue; // an empty home, between tenants
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
    for (const e of lifeEvents(lo, to)) out.push(e);
    out.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    return out;
  }

  /** The day's pixels lit and gone dark, as one note each, at 9pm city time. */
  function lifeEvents(from, to) {
    const out = [];
    const startDay = Math.max(LIFE_START, from - ((from - LIFE_START) % DAY + DAY) % DAY);
    for (let d = startDay; d < to; d += DAY) {
      const at = d + 21 * H;
      if (at < from || at >= to || d < LIFE_START) continue;
      const lit = [], dark = [];
      for (const h of homes()) {
        const k = tenancyAt(h.i, d + 12 * H).k, hh = household(h.i, k);
        for (const b of litUntil(h.i, k, d + DAY)) if (b.birth >= d && b.birth < d + DAY) lit.push([b, h]);
        for (const m of hh.members.concat(litIn(h.i, k))) { const x = darkAt(m.id, m.birth); if (x >= d && x < d + DAY && m.birth < x) dark.push([m, h]); }
      }
      const word = (n) => (n < WORDS.length ? WORDS[n] : String(n));
      if (lit.length) {
        const [b, h] = lit[0], c = named(character(b.id));
        out.push({ id: 'census:lit:' + ymd(d + 12 * H), time: iso(at), source: 'census', type: 'life.lit', importance: 1, data: { count: lit.length },
          headline: word(lit.length) + ' new pixel' + (lit.length === 1 ? ' was' : 's were') + ' lit in Pixel City today, among them ' + c.name + ', to the ' + c.surname + ' family of ' + c.districtName + ' district' });
      }
      if (dark.length) {
        const [m, h] = dark.sort((a, b) => b[0].birth < a[0].birth ? 1 : -1)[0], c = named(character(m.id));
        out.push({ id: 'census:dark:' + ymd(d + 12 * H), time: iso(at + MIN), source: 'census', type: 'life.dark', importance: 1, data: { count: dark.length },
          headline: (dark.length === 1 ? c.name + ', ' + ageAt(m.birth, d) + ', of ' + c.districtName + ' district, went dark today. ' : word(dark.length) + ' residents went dark today, among them ' + c.name + ', ' + ageAt(m.birth, d) + ', of ' + c.districtName + '. ') +
            'They were known for this: ' + c.quirk.charAt(0).toLowerCase() + c.quirk.slice(1) });
      }
    }
    return out;
  }

  /** The Job Centre's news: its opening, layoffs when sites close, and a report on the first of each month. */
  function labourEvents(from, to) {
    const out = [];
    if (to <= LIFE_START) return out;
    const emit = (ms, type, importance, idPart, data, headline) => { if (ms >= from && ms < to) out.push({ id: 'jobs:' + idPart, time: iso(ms), source: 'jobs', type, importance, data, headline }); };
    if (JOB_CENTRE_OPENS >= from && JOB_CENTRE_OPENS < to) { const L = labourAt(JOB_CENTRE_OPENS); emit(JOB_CENTRE_OPENS, 'jobs.opens', 3, 'opens', { queue: L.looking }, 'The Job Centre opens its doors, and ' + L.looking.toLocaleString('en') + ' pixels are already looking for work'); }
    // the first of each month, 9am city time
    for (let y = new Date(Math.max(from, LIFE_START) + 12 * H).getUTCFullYear(), mo = new Date(Math.max(from, LIFE_START) + 12 * H).getUTCMonth(); ; mo++) {
      const at = Date.UTC(y, mo, 1, 9) - 12 * H;
      if (at >= to) break;
      if (at < from || at < LIFE_START) continue;
      const L = labourAt(at), prev = at - 31 * DAY >= LIFE_START ? labourAt(at - 31 * DAY) : null;
      const delta = prev ? Math.round((L.rate - prev.rate) * 10) / 10 : null;
      emit(at, 'jobs.report', 2, 'report:' + ymd(at + 12 * H), { rate: L.rate, employed: L.employed, looking: L.looking },
        'Unemployment in Pixel City ' + (delta === null ? 'stands at ' : delta > 0.05 ? 'rises to ' : delta < -0.05 ? 'falls to ' : 'holds at ') + L.rate + '%; ' + L.dream.toLocaleString('en') + ' pixels are doing their dream job');
    }
    // layoffs: a power station closing or a building site finishing
    for (const e of employers()) {
      if (e.kind !== 'site') continue;
      for (let d = Math.max(from, LIFE_START) - ((Math.max(from, LIFE_START) - LIFE_START) % DAY); d < to; d += DAY) {
        if (operating(e, d) && !operating(e, d + DAY)) {
          let x = d; while (operating(e, x + H)) x += H;
          const n = labourAt(x - H).head[e.id] || 0;
          if (n) emit(x + H, 'jobs.layoffs', n >= 50 ? 3 : 2, 'layoffs:' + e.id + ':' + ymd(x), { employer: e.name, workers: n }, e.name + ' closes, and ' + (n === 1 ? 'its only worker joins' : n + ' workers join') + ' the queue at the Job Centre');
        }
      }
    }
    out.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    return out;
  }

  // ================================================================ public API
  root.PixelUniverse = root.PixelUniverse || {};
  root.PixelUniverse.labour = {
    version: VERSION, source: 'jobs', startDate: ymd(LIFE_START + 12 * H), start: LIFE_START, opens: JOB_CENTRE_OPENS, ready: fullReady, registryReady: ready, SECTOR,
    wellbeingOf: (id, t) => { if (!fullReady()) return null; const c = character(id); if (!c) return null; const sp = careerUntil(id, c.birth, c.district, t).find((x) => x.from <= t && t < x.to); const cc = Object.assign({}, careerCache.get(id) || {}, { mortgage: mortgageOf(c) }); return wellbeingOf(id, c.birth, c.district, t, sp, cc); },
    mortgageOf: (id) => { const c = character(id); return c ? mortgageOf(c) : null; },
    loanOf: (id, t) => { const c = careerCache.get(id); return c && c.loan && toL(c.loan.from) - 3 * YEAR <= toL(t) ? Object.assign({}, c.loan) : null; },
    universityAt: (t) => (fullReady() ? universityAt(t) : null), universityEventsBetween: (from, to) => (fullReady() ? universityEvents(from, to) : []), universityOpens: UNI_OPENS, FACULTIES,
    employers: () => (ready() ? employers() : []), operating,
    /** What a resident does for a living at t: { status: 'employed' | 'looking' | 'away' | 'retired' | 'young', employer, employerName, title, wage, from, to, dream, reason } */
    jobOf, careerOf: (id, t) => { const c = character(id); return c ? careerUntil(id, c.birth, c.district, t).filter((sp) => sp.from <= t && sp.status !== 'young').map((sp) => Object.assign({}, sp, sp.employer ? { employerName: sp.name || employers().byId[sp.employer].name } : {})) : []; },
    careerAt, labourAt, eventsBetween: (from, to) => (ready() ? labourEvents(from, to) : []),
    /** The ids of everyone employed by one employer at t (for an institution's staff list). */
    staffOf: (employerId, t) => { const out = []; for (const h of homes()) for (const m of residentsOfHome(h.i, t).members) { if (ageAt(m.birth, t) < 18) continue; const j = careerAt(m.id, m.birth, h.district, t); if (j.status === 'employed' && j.employer === employerId) out.push(m.id); } return out; }
  };
  root.PixelUniverse.census = {
    version: VERSION, source: 'census', startDate: ymd(OPENS), opens: OPENS, epoch: EPOCH, ready: fullReady, TRAITS, CONCERNS, PIXELS,
    stateAt(t) {
      if (!ready()) return { time: t, started: false, unavailable: 'Pixel City could not be reached' };
      if (t < EPOCH) return { time: t, started: false };
      const s = stats(t);
      return Object.assign({ time: t, started: true, version: VERSION, panel: panelAt(t), residentOfTheDay: residentOfTheDay(t) }, s);
    },
    eventsBetween, person, summary, residentsOf, cohort, search, stats, panelAt, panelsBetween, residentOfTheDay,
    /** A resident's identity and character only: name, colour, birth, home, traits. Cheap, for sites that need many. */
    character: (id) => { const c = character(id); return c ? named(c) : null; },
    homes: () => (ready() ? homes() : []), householdAt: (homeIndex, t) => residentsOfHome(homeIndex, t), movesBetween, ageAt, pixelBirthday,
    /** The life clock: toLife/fromLife from the Weather Bureau, and `later(t, span)`. Ages are measured on it. */
    lifeClock: { toLife: toL, fromLife: fromL, later, YEAR },
    lifeStart: LIFE_START, darkAt, litBetween: (from, to) => lifeEvents(from, to),
    /** Pixels lit and gone dark in the days before t: { lit: [ids], dark: [ids] }, newest first. */
    recentLife(t, days) {
      const from = t - days * DAY, lit = [], dark = [];
      if (t < LIFE_START) return { lit, dark };
      for (const h of homes()) {
        const k = tenancyAt(h.i, t).k, hh = household(h.i, k);
        for (const b of litUntil(h.i, k, t)) if (b.birth >= from && b.birth <= t) lit.push([b.birth, b.id]);
        for (const m of hh.members.concat(litIn(h.i, k))) { const x = darkAt(m.id, m.birth); if (x >= from && x <= t && x >= LIFE_START) dark.push([x, m.id]); }
      }
      const sort = (a) => a.sort((x, y) => y[0] - x[0]).map((x) => x[1]);
      return { lit: sort(lit), dark: sort(dark) };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
