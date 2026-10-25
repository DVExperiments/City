/*
 * Pixel City Society: who pixels spend their time with, what catches on, and what they think.
 *
 * Every adult pixel belongs to one to three communities (a district's Signal Choir, its Glitch Spotters, its Charge Bar
 * regulars). Communities talk to each other: to the others in their district, to the same kind of community elsewhere,
 * and to the districts next door. Through them, two things spread:
 *
 *   Tastes. Fads in colours, songs and products start in one community and travel, rise and fade. A craze for a colour
 *   gets the Senate debating the city's colours; a song that catches on gets played more on Pixel FM; a craze for a
 *   product sends pixels to that kind of shop.
 *
 *   Opinions. Each community leans towards Brightness, Verdant, Legacy Mode or an independent, and drifts with its
 *   friends and with what happens to it: smog, blackouts, businesses closing on its streets, empty shelves, prices.
 *   The Senate's elections read each district's mood a fortnight before polling day.
 *
 * Two runs, so nothing goes round in a circle within a day:
 *   - the tastes run reads only the city's map and the Weather Bureau (the Exchange, Pixel FM and the Senate read it);
 *   - the opinions run reads the city, the Exchange and the tastes, always the day before (the Senate reads it, with a
 *     fortnight's lag, at elections).
 *
 * Individual pixels: their communities, friends, a rival, what they've taken up and how they lean, from the Census
 * Office's files and their communities. Their friends' leanings move their own.
 *
 * Load after City's universe.js, census.js and the Exchange. Seeds start "society:". Simulation maths uses only
 * + - * / Math.floor Math.imul. Registers window.PixelUniverse.society.
 */
(function (root) {
  'use strict';

  const VERSION = '1.2.0';
  const MIN = 60000, H = 3600000, DAY = 86400000, WEEK = 7 * DAY;
  const START = Date.UTC(2026, 11, 1); // the December Grand Prix: Society begins with freight
  const VOTES_FROM = Date.UTC(2027, 4, 1); // elections read Society from the May 2027 general election
  const POLL_LAG = 14 * DAY;
  const MIG_START = Date.UTC(2027, 2, 1);
  const WELL_START = Date.UTC(2027, 8, 1); // from 1 September 2027, basic needs move moods, migration and working lives // from 1 March 2027 pixels move in and out of the city // the Senate's elections read the mood a fortnight before polling day

  function rng(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const seeded = (s) => rng(hash('society:' + s));
  const unit = (s) => hash('society:' + s) / 4294967296;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const rd = (x, k) => Math.floor(x * k + 0.5) / k;
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const ymd = (ms) => { const d = new Date(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
  const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');
  const dayStart = (k) => START + k * DAY;
  const daysTo = (t) => Math.floor((t - START) / DAY); // whole days complete by t

  const U = () => root.PixelUniverse || {};
  const City = () => U().city, Wx = () => U().climate, Com = () => U().commerce, Fr = () => U().freight, Cen = () => U().census;
  // existence only: the Senate checks this from its own ready(), so it must not ask anyone else whether they're ready
  const ready = () => !!(City() && Wx());
  const opinionsReady = () => ready() && !!(Com() && Cen());

  // ---------------------------------------------------------------- communities
  // What pixels do together. Each has a taste for novelty, for warm or cool colours, a favourite kind of shop, and a
  // tilt in politics (Brightness, Verdant, Legacy Mode).
  const INTERESTS = [
    { name: 'Signal Choir', novelty: 0.7, warmth: 0.2, shop: 'Signal Kiosk', tilt: { B: 0.02, V: 0, L: 0.01 } },
    { name: 'Palette Guild', novelty: 0.9, warmth: 0.5, shop: 'Palette Shop', tilt: { B: 0.01, V: 0.02, L: -0.02 } },
    { name: 'Refresh Rate Club', novelty: 0.4, warmth: -0.4, shop: 'Charge Bar', tilt: { B: 0.03, V: -0.01, L: 0 } },
    { name: 'Dither Circle', novelty: 0.5, warmth: 0.6, shop: 'Shader Parlour', tilt: { B: 0, V: 0, L: 0.03 } },
    { name: 'Night Mode Walkers', novelty: 0.3, warmth: -0.7, shop: 'Charge Bar', tilt: { B: -0.01, V: 0.03, L: 0.01 } },
    { name: 'Glitch Spotters', novelty: 0.8, warmth: -0.2, shop: 'Patch Shop', tilt: { B: 0, V: 0.01, L: -0.01 } },
    { name: 'Shader Society', novelty: 0.85, warmth: 0.3, shop: 'Shader Parlour', tilt: { B: 0.02, V: 0.01, L: -0.02 } },
    { name: 'Font Collectors', novelty: 0.2, warmth: 0.1, shop: 'Refresh Pantry', tilt: { B: -0.01, V: 0, L: 0.04 } },
    { name: 'Race-watchers', novelty: 0.5, warmth: 0.4, shop: 'Signal Kiosk', tilt: { B: 0.02, V: -0.01, L: 0.02 } },
    { name: 'Compression Hobbyists', novelty: 0.6, warmth: -0.5, shop: 'Cache & Carry', tilt: { B: 0.03, V: -0.02, L: 0 } },
    { name: 'Bezel Gardeners', novelty: 0.3, warmth: 0.7, shop: 'Palette Shop', tilt: { B: -0.02, V: 0.04, L: 0.01 } },
    { name: 'Charge Bar regulars', novelty: 0.55, warmth: 0, shop: 'Charge Bar', tilt: { B: 0.01, V: 0, L: 0.01 } }
  ];
  const NI = INTERESTS.length;
  const SHOPS = ['Refresh Pantry', 'Cache & Carry', 'Palette Shop', 'Charge Bar', 'Patch Shop', 'Shader Parlour', 'Signal Kiosk'];
  const COLOURS = [
    ['Signal Cyan', '#46D6FF', -0.8], ['Ember Orange', '#FF8A3D', 0.8], ['Phosphor Green', '#2BFF88', -0.3], ['Overflow Magenta', '#E04FFF', 0.3], ['Gamma Peach', '#FFC6A0', 0.6],
    ['Ultra Violet', '#7A6CFF', -0.5], ['Hot Red', '#FF3B30', 0.9], ['Lossless White', '#F4F4F4', -0.1], ['Dither Yellow', '#F2D024', 0.7], ['Moiré Teal', '#20C3AF', -0.6],
    ['Bezel Brown', '#A47551', 0.5], ['Null Indigo', '#5A5FD6', -0.7], ['Off-By-One Pink', '#FF5FA2', 0.4], ['Dead Grey', '#6E7681', 0]
  ];
  const PARTIES = { B: { env: -0.6, aes: 0.4, base: 0.36 }, V: { env: 0.7, aes: 0.35, base: 0.32 }, L: { env: 0.1, aes: -0.8, base: 0.32 } };
  const PIDS = ['B', 'V', 'L', 'I'];
  // Pixel FM's catalogue: twelve new songs a week from 19 October 2026, forty at launch (its universe.js)
  const FM_OPENS = Date.UTC(2026, 9, 19), FM_PER_WEEK = 12, FM_LAUNCH = 40;

  let COMM = null;
  function communities() {
    if (COMM) return COMM;
    const m = City().map(Date.UTC(2026, 10, 2));
    const D = m.districts.length, list = [];
    for (let d = 0; d < D; d++) {
      const r = seeded('mix:' + d), w = INTERESTS.map(() => 0.4 + r());
      let tot = 0; for (const x of w) tot += x;
      const adults = m.districts[d].residents * 0.78;
      for (let k = 0; k < NI; k++) list.push({ i: list.length, d, k, name: INTERESTS[k].name + ' of ' + m.districts[d].name, district: m.districts[d].name, interest: INTERESTS[k].name,
        size: Math.floor(adults * 1.8 * w[k] / tot), share: w[k] / tot, novelty: clamp(INTERESTS[k].novelty + (r() - 0.5) * 0.3, 0.05, 1) });
    }
    // neighbouring districts: the city's sixteen sit roughly in a four by four grid, west to east, north to south
    const cx = m.districts.map((x) => x.cx), cy = m.districts.map((x) => x.cy), near = [];
    for (let a = 0; a < D; a++) { near.push([]); for (let b = 0; b < D; b++) if (a !== b) { const dx = cx[a] - cx[b], dy = cy[a] - cy[b]; if (dx * dx + dy * dy < 40 * 40) near[a].push(b); } }
    let pop = 0; for (const c of list) pop += c.size;
    COMM = { list, D, near, pop, districts: m.districts.map((x) => ({ name: x.name, env: x.env, aes: x.aes, residents: x.residents })), byDistrict: [] };
    for (let d = 0; d < D; d++) COMM.byDistrict.push(list.filter((c) => c.d === d));
    return COMM;
  }
  // what a community hears from its friends: the rest of its district, the same kind of community elsewhere, and the
  // districts next door. v is a value per community; returns the weighted average each community hears.
  function heard(v) {
    const C = communities(), N = C.list.length, D = C.D;
    const dAvg = new Float64Array(D), dW = new Float64Array(D), kAvg = new Float64Array(NI), kW = new Float64Array(NI);
    for (const c of C.list) { dAvg[c.d] += v[c.i] * c.size; dW[c.d] += c.size; kAvg[c.k] += v[c.i] * c.size; kW[c.k] += c.size; }
    for (let d = 0; d < D; d++) dAvg[d] = dW[d] ? dAvg[d] / dW[d] : 0;
    for (let k = 0; k < NI; k++) kAvg[k] = kW[k] ? kAvg[k] / kW[k] : 0;
    const out = new Float64Array(N);
    for (const c of C.list) {
      let nb = 0; const ns = C.near[c.d]; for (const b of ns) nb += dAvg[b]; nb = ns.length ? nb / ns.length : dAvg[c.d];
      out[c.i] = 0.5 * dAvg[c.d] + 0.3 * kAvg[c.k] + 0.2 * nb;
    }
    return out;
  }

  // ================================================================ the tastes run
  // Reads the map (communities) and the Weather Bureau (sunshine). Nothing else, so the Exchange, Pixel FM and the
  // Senate can all read it.
  let TR = null;
  const wxCache = new Map();
  function wxDay(k) {
    const c = Math.floor(k / 30);
    if (!wxCache.has(c)) { const o = {}; for (const d of Wx().historyBetween(dayStart(c * 30), dayStart(c * 30 + 30))) o[d.day] = d; wxCache.set(c, o); if (wxCache.size > 30) wxCache.delete(wxCache.keys().next().value); }
    return wxCache.get(c)[dayStart(k)] || {};
  }
  function initTastes() { TR = { k: 0, fads: [], ended: [], days: [], events: [], n: 0 }; }
  function fmRecent(day) { // songs released in the three weeks before day
    const w = Math.floor((day - FM_OPENS) / WEEK), out = [];
    for (let x = w - 2 < 0 ? 0 : w - 2; x <= w; x++) for (let k = 0; k < (x === 0 ? FM_LAUNCH : FM_PER_WEEK); k++) out.push('w' + x + '-' + k);
    return out;
  }
  const strengthOf = (f) => { const C = communities(); let s = 0; for (const c of C.list) s += f.a[c.i] * c.size; return s / C.pop; };
  function tasteDay() {
    const C = communities(), k = TR.k, day = dayStart(k), r = seeded('tastes:' + k), wx = wxDay(k), N = C.list.length;
    const at = day + DAY;
    const emit = (type, importance, idPart, data, headline, sec) => TR.events.push({ id: 'society:' + idPart, time: iso(at + sec * 1000), ms: at + sec * 1000, source: 'society', type, importance, data, headline });
    // a new craze, now and then, starting in a community that likes new things
    const CAT = [['colour', 1 / 16], ['song', 1 / 7], ['product', 1 / 12]];
    for (const [cat, p] of CAT) {
      const roll = r(), pickC = r(), pickI = r(), vir = r(), fat = r();
      if (roll >= p || TR.fads.filter((f) => f.cat === cat).length >= 3) continue;
      let tot = 0; for (const c of C.list) tot += c.size * c.novelty * c.novelty;
      let v = pickC * tot, origin = C.list[0];
      for (const c of C.list) { v -= c.size * c.novelty * c.novelty; if (v < 0) { origin = c; break; } }
      const I = INTERESTS[origin.k];
      let item;
      if (cat === 'colour') { // warm colours on bright days, the community's own taste the rest of the time
        const sunny = (wx.sunshine || 5) > 8 ? 0.4 : (wx.sunshine || 5) < 3 ? -0.4 : 0;
        const ws = COLOURS.map((c) => { const fit = 1.4 - Math.abs(c[2] - (I.warmth + sunny) / 1.4); return fit > 0.05 ? fit : 0.05; });
        let wt = 0; for (const x of ws) wt += x; let u = pickI * wt; item = 0;
        for (let j = 0; j < ws.length; j++) { u -= ws[j]; if (u < 0) { item = j; break; } }
        if (TR.fads.some((f) => f.cat === 'colour' && f.item === item)) continue;
      } else if (cat === 'song') {
        if (day < FM_OPENS) continue;
        const recent = fmRecent(day); item = recent[Math.floor(pickI * recent.length)];
        if (TR.fads.some((f) => f.cat === 'song' && f.item === item)) continue;
      } else {
        item = pickI < 0.5 ? I.shop : SHOPS[Math.floor(pickI * 2 * SHOPS.length) % SHOPS.length];
        if (TR.fads.some((f) => f.cat === 'product' && f.item === item)) continue;
      }
      const f = { id: 'fad' + (TR.n++), cat, item, origin: origin.i, born: k, beta: 0.06 + vir * 0.12, fatigue: 0.0009 + fat * 0.0015, a: new Float64Array(N), peak: 0, peaked: false };
      f.a[origin.i] = 0.2;
      TR.fads.push(f);
      const what = cat === 'colour' ? 'a craze for ' + COLOURS[item][0] : cat === 'song' ? 'a song on Pixel FM catching on' : 'a craze for the ' + item.toLowerCase() + 's';
      emit('fad.start', 1, f.id + ':start', { fad: f.id, category: cat, item: cat === 'colour' ? COLOURS[item][0] : item, community: origin.name }, 'The ' + origin.name + ' start ' + what, 1);
    }
    // crazes spread through communities, peak and wear off
    for (const f of TR.fads) {
      const h = heard(f.a), age = k - f.born, gamma = 0.004 + f.fatigue * age;
      for (const c of C.list) {
        const a = f.a[c.i];
        f.a[c.i] = clamp(a + f.beta * (0.6 * h[c.i] + 0.4 * a) * (1 - a) * (0.4 + 0.6 * c.novelty) - gamma * a, 0, 1);
      }
      const s = strengthOf(f);
      if (s > f.peak) f.peak = s;
      const label = f.cat === 'colour' ? COLOURS[f.item][0] : f.cat === 'song' ? 'the song' : f.item.toLowerCase() + 's';
      if (!f.peaked && s >= 0.12) {
        f.peaked = true;
        emit('fad.everywhere', 3, f.id + ':everywhere', { fad: f.id, category: f.cat, item: f.cat === 'colour' ? COLOURS[f.item][0] : f.item, share: rd(s * 100, 1) },
          f.cat === 'colour' ? COLOURS[f.item][0] + ' is everywhere: ' + Math.round(s * 100) + '% of Pixel City has taken it up' : f.cat === 'song' ? 'Pixel City can\u2019t stop humming one song: ' + Math.round(s * 100) + '% of pixels know every note'
            : 'The craze for ' + label + ' has reached ' + Math.round(s * 100) + '% of Pixel City', 2);
      }
    }
    // a craze that has worn off is over
    TR.fads = TR.fads.filter((f) => { const s = strengthOf(f); if (k - f.born > 12 && s < 0.004) { TR.ended.push({ id: f.id, cat: f.cat, item: f.item, born: f.born, ended: k, peak: rd(f.peak * 100, 10), origin: f.origin }); return false; } return true; });
    // the day's record: each craze's strength, by community and city-wide
    TR.days.push({ k, fads: TR.fads.map((f) => ({ id: f.id, cat: f.cat, item: f.item, origin: f.origin, born: f.born, strength: strengthOf(f), a: Float32Array.from(f.a) })) });
    TR.k = k + 1;
  }
  function tastesTo(k) { if (!TR) initTastes(); while (TR.k < k) tasteDay(); }
  /** The crazes on day k (trading day starting dayStart(k)), as recorded. */
  function tasteRecord(k) { if (k < 0) return null; tastesTo(k + 1); return TR.days[k]; }

  // what the tastes mean for the rest of the universe
  /** How much more a district's pixels want from a kind of shop today, from any craze for it: 1 is no craze. */
  function productBoost(district, shop, t) {
    if (!ready() || t < START) return 1;
    const rec = tasteRecord(daysTo(t)); if (!rec) return 1;
    let b = 1;
    for (const f of rec.fads) if (f.cat === 'product' && f.item === shop) { const C = communities(); let s = 0, w = 0; for (const c of C.byDistrict[district] || []) { s += f.a[c.i] * c.size; w += c.size; } b += 0.6 * (w ? s / w : 0); }
    return b;
  }
  /** The song catching on at t, if any: { song, strength } (Pixel FM plays it more). */
  function songFad(t) {
    if (!ready() || t < START) return null;
    const rec = tasteRecord(daysTo(t) - 1); if (!rec) return null;
    let best = null; for (const f of rec.fads) if (f.cat === 'song' && (!best || f.strength > best.strength)) best = f;
    return best && best.strength > 0.01 ? { song: best.item, strength: best.strength } : null;
  }
  /** The colour craze at t, if any: { name, hex, warmth, strength, hueSign } (the Senate debates the city's colours). */
  function colourFad(t) {
    if (!ready() || t < START) return null;
    const rec = tasteRecord(daysTo(t) - 1); if (!rec) return null;
    let best = null; for (const f of rec.fads) if (f.cat === 'colour' && (!best || f.strength > best.strength)) best = f;
    if (!best || best.strength < 0.03) return null;
    const c = COLOURS[best.item];
    return { name: c[0], hex: c[1], warmth: c[2], strength: best.strength, hueSign: c[2] >= 0 ? -1 : 1 };
  }

  // ================================================================ the opinions run
  // Reads the day before: the city's air and blackouts, the Exchange (businesses closing on a district's streets, the
  // shopping basket, confidence), freight (the shelves) and the tastes. The Senate reads it a fortnight late.
  let OP = null;
  function initOpinions() {
    const C = communities(), N = C.list.length;
    const lean = new Float64Array(N * 4), mood = new Float64Array(N);
    for (const c of C.list) {
      const D = C.districts[c.d], I = INTERESTS[c.k], r = seeded('lean:' + c.i);
      let tot = 0; const w = [];
      for (const p of ['B', 'V', 'L']) { const P = PARTIES[p], dist = Math.abs(D.env - P.env) + Math.abs(D.aes - P.aes); const x = P.base / (0.6 + dist) + I.tilt[p] * 3 + (r() - 0.5) * 0.06; w.push(x > 0.02 ? x : 0.02); }
      w.push(0.04 + r() * 0.05);
      for (const x of w) tot += x;
      for (let j = 0; j < 4; j++) lean[c.i * 4 + j] = w[j] / tot;
      mood[c.i] = 0.6 + (r() - 0.5) * 0.1;
    }
    OP = { k: 0, lean, mood, base: lean.slice(), days: [], events: [], rival: {}, top: {}, turned: {}, pop: new Float64Array(C.D).fill(1), needs: new Float64Array(C.D * 5).fill(0.7), staff0: null, exodus: {}, full: {}, month: { left: new Float64Array(C.D), came: new Float64Array(C.D) } };
  }
  const cityChunk = new Map(), exChunk = new Map();
  function worldYesterday(k) { // what happened on trading day k-1, as each district felt it
    const C = communities(), d0 = dayStart(k - 1), c = Math.floor((k - 1) / 30);
    // one day at a time, never ahead: the city's future depends on the Senate, which reads this run
    const ch = City().historyBetween(d0, d0 + DAY)[0] || {};
    const to = dayStart(k) + 12 * H; // the close of day k-1 has been posted
    const ex = Com().historyBetween(d0, to).slice(-1)[0] || {};
    const fr = Fr() ? Fr().historyBetween(d0, to).slice(-1)[0] : null;
    const jobsLost = new Float64Array(C.D);
    for (const e of Com().eventsBetween(dayStart(k - 1), to)) if (e.type === 'business.closed') { const d = C.districts.findIndex((x) => x.name === e.data.district); if (d >= 0) jobsLost[d] += e.data.jobs || 0; }
    const glitch = new Float64Array(C.D);
    if (City().glitchesBetween) for (const g of City().glitchesBetween(d0, d0 + DAY)) glitch[g.district] += clamp(((g.end < d0 + DAY ? g.end : d0 + DAY) - (g.start > d0 ? g.start : d0)) / DAY, 0, 1) * g.severity / 3;
    return { aqi: ch.aqi || 40, dark: ch.dark || {}, cpi: ex.cpi || 100, conf: ex.confidence || 100, shelves: fr ? fr.shelves : null, jobsLost, staffD: ex.staffD || null, rentD: ex.rentD || null, glitch };
  }
  function opinionDay() {
    const C = communities(), k = OP.k, N = C.list.length, r = seeded('opinions:' + k);
    const at = dayStart(k) + DAY;
    const emit = (type, importance, idPart, data, headline, sec) => OP.events.push({ id: 'society:' + idPart, time: iso(at + sec * 1000), ms: at + sec * 1000, source: 'society', type, importance, data, headline });
    const w = k > 0 ? worldYesterday(k) : { aqi: 40, dark: {}, cpi: 100, conf: 100, shelves: null, jobsLost: new Float64Array(C.D), staffD: null, glitch: new Float64Array(C.D) };
    const tr = tasteRecord(k);
    const wellbeing = (d) => { const n = OP.needs; return 0.25 * n[d * 5] + 0.2 * n[d * 5 + 1] + 0.2 * n[d * 5 + 2] + 0.15 * n[d * 5 + 3] + 0.2 * n[d * 5 + 4]; };
    const wellOn = dayStart(k) >= WELL_START;
    // what each district has been through yesterday, as pressure towards each party
    const push = [], hardship = new Float64Array(C.D);
    for (let d = 0; d < C.D; d++) {
      const smog = clamp((w.aqi - 80) / 120, 0, 1), dark = clamp((w.dark[d] || 0) / 6, 0, 1);
      const lost = clamp(w.jobsLost[d] / (C.districts[d].residents * 0.004), 0, 1), shelf = w.shelves ? clamp(1 - w.shelves[d] / 1.5, 0, 1) : 0;
      const prices = clamp((w.cpi - 102) / 25, 0, 1), boom = clamp((w.conf - 100) / 12, 0, 1);
      // Verdant for clean air; Brightness for the lights and for good times; Legacy Mode when prices bite and the
      // shelves are empty; and, when jobs go, a turn against all of them
      push.push({ V: smog * 0.9, B: dark * 0.8 + boom * 0.4, L: prices * 0.7 + shelf * 0.5 + lost * 0.3, I: lost * 0.6 + shelf * 0.2 });
      hardship[d] = clamp(smog * 0.4 + dark * 0.5 + lost * 0.8 + shelf * 0.4 + prices * 0.3 + w.glitch[d] * 0.6, 0, 1);
    }
    // friends pull each other's views together, and the day's events push them
    const heardLean = []; for (let j = 0; j < 4; j++) { const v = new Float64Array(N); for (let i = 0; i < N; i++) v[i] = OP.lean[i * 4 + j]; heardLean.push(heard(v)); }
    const joy = new Float64Array(N); if (tr) for (const f of tr.fads) for (let i = 0; i < N; i++) joy[i] += f.a[i];
    const lean2 = OP.lean.slice(), mood2 = OP.mood.slice();
    for (const c of C.list) {
      const P = push[c.d], base = c.i * 4; let tot = 0;
      for (let j = 0; j < 4; j++) {
        const p = PIDS[j];
        let x = OP.lean[base + j];
        x += 0.03 * (heardLean[j][c.i] - x);                       // friends
        x += 0.006 * P[p] * (1 + 12 * (p === 'I' ? 0 : INTERESTS[c.k].tilt[p])); // what happened, felt more by those who care
        x += 0.01 * (OP.base[base + j] - x);                        // old loyalties
        x += (r() - 0.5) * 0.002;
        lean2[base + j] = x > 0.005 ? x : 0.005; tot += lean2[base + j];
      }
      for (let j = 0; j < 4; j++) lean2[base + j] /= tot;
      mood2[c.i] = clamp(OP.mood[c.i] + (0.68 - 0.45 * hardship[c.d] + 0.25 * clamp(joy[c.i], 0, 0.6) + (wellOn ? 0.3 * (wellbeing(c.d) - 0.6) : 0) - OP.mood[c.i]) * 0.08, 0, 1);
    }
    OP.lean = lean2; OP.mood = mood2;
    // allegiances: when a community turns to another party, it falls out with the biggest community in its district that
    // still holds to the old one; they make up when they agree again
    const PNAME = { B: 'Brightness', V: 'Verdant', L: 'Legacy Mode', I: 'the independents' };
    for (const c of C.list) {
      const top = argmax(OP.lean, c.i), was = OP.top[c.i];
      if (was === undefined) { OP.top[c.i] = top; continue; }
      if (top === was || OP.lean[c.i * 4 + top] < OP.lean[c.i * 4 + was] + 0.03) continue; // a clear change of heart, not a wobble
      OP.top[c.i] = top;
      if (k - (OP.turned[c.i] || -999) < 30) continue; // wavering back and forth isn't news
      OP.turned[c.i] = k;
      let foe = null; for (const o of C.byDistrict[c.d]) if (o !== c && OP.top[o.i] === was && (!foe || o.size > foe.size)) foe = o;
      emit('society.turns', 2, 'turn:' + c.i + ':' + ymd(dayStart(k)), { community: c.name, from: PIDS[was], to: PIDS[top], rival: foe ? foe.name : null },
        'The ' + c.name + ' have turned to ' + PNAME[PIDS[top]] + (foe ? ', and the ' + foe.name + ' are no longer speaking to them' : ''), 3);
      if (foe) OP.rival[Math.min(c.i, foe.i) + ':' + Math.max(c.i, foe.i)] = k;
    }
    for (const key of Object.keys(OP.rival)) {
      const [a1, b1] = key.split(':').map(Number);
      if (OP.top[a1] === OP.top[b1] && k - OP.rival[key] > 14) { delete OP.rival[key]; emit('society.reconciled', 1, 'mend:' + key + ':' + ymd(dayStart(k)), { a: C.list[a1].name, b: C.list[b1].name }, 'The ' + C.list[a1].name + ' and the ' + C.list[b1].name + ' are on speaking terms again', 4); }
    }
    // basic needs, district by district: housing (rent against jobs), charge (the shelves), health (smog), security
    // (blackouts and glitches, remembered for a week or so), leisure (parks, crazes, Grand Prix days). Smoothed over a week.
    if (k > 0) {
      const parks = new Float64Array(C.D);
      try { const t0 = dayStart(k - 1) + 12 * H, cs = City().stateAt(t0), fd = {}; for (const f of City().map(t0).features) if (f.kind === 'site') fd[f.id] = f.district; for (const site of cs.sites || []) if (site.type === 'park' && site.state === 'operating' && fd[site.id] !== undefined) parks[fd[site.id]]++; } catch (e) { /* no parks today */ }
      const n2 = OP.needs.slice();
      for (let d = 0; d < C.D; d++) {
        let joy = 0, wsum = 0; if (tr) for (const c of C.byDistrict[d]) { let a = 0; for (const f of tr.fads) a += f.a[c.i]; joy += a * c.size; wsum += c.size; }
        joy = wsum ? joy / wsum : 0;
        const jobR = w.staffD && OP.staff0 && OP.staff0[d] > 0 ? w.staffD[d] / OP.staff0[d] : 1, rent = w.rentD ? w.rentD[d] : 1;
        const now = [clamp(0.75 - 0.5 * (rent - 1) + 0.6 * (jobR - 1), 0, 1), w.shelves ? clamp(w.shelves[d] / 1.5, 0, 1) : 1, 1 - clamp((w.aqi - 50) / 150, 0, 1),
          1 - clamp((w.dark[d] || 0) / 6 + w.glitch[d], 0, 1), clamp(0.45 + 0.08 * parks[d] + 0.8 * joy, 0, 1)];
        for (let j = 0; j < 5; j++) n2[d * 5 + j] += (now[j] - n2[d * 5 + j]) / (j === 3 ? 10 : 7);
      }
      OP.needs = n2;
    }
    // migration: arrivals fill empty homes, pulled by jobs and good times; departures are pushed by smog, blackouts,
    // lost jobs, a sour mood and glitches. The city can't hold more pixels than it has homes.
    if (dayStart(k) >= MIG_START && w.staffD) {
      if (!OP.staff0) OP.staff0 = w.staffD.slice();
      const p2 = OP.pop.slice(), mon = OP.month;
      for (let d = 0; d < C.D; d++) {
        let m = 0, wsum = 0; for (const c of C.byDistrict[d]) { m += OP.mood[c.i] * c.size; wsum += c.size; } m = wsum ? m / wsum : 0.65;
        const jobR = OP.staff0[d] > 0 ? w.staffD[d] / OP.staff0[d] : 1, smog = clamp((w.aqi - 80) / 120, 0, 1), dark = clamp((w.dark[d] || 0) / 6, 0, 1);
        const leave = 0.00012 + 0.0006 * smog + 0.0005 * dark + 0.0008 * clamp(1 - jobR, 0, 1) + 0.0006 * clamp(0.6 - m, 0, 1) + 0.0004 * w.glitch[d] + (wellOn ? 0.0008 * clamp(0.55 - wellbeing(d), 0, 1) : 0); // a hard life is a reason to go
        const cheap = w.rentD ? clamp(1 - w.rentD[d], 0, 0.5) : 0; // cheap rents draw new residents to a district others left
        const pull = clamp(jobR, 0, 1.3), come = (1 - p2[d]) * 0.004 * (pull * pull + 1.5 * cheap) * (w.conf / 100) + 0.00012;
        const was = p2[d];
        p2[d] = clamp(p2[d] + come - leave, 0.5, 1);
        const res = C.districts[d].residents;
        mon.left[d] += leave * was * res; mon.came[d] += (p2[d] - was + leave * was) * res;
        if (p2[d] < 0.9 && !OP.exodus[d]) { OP.exodus[d] = 1; emit('society.exodus', 3, 'exodus:' + d + ':' + ymd(dayStart(k)), { district: C.districts[d].name, population: rd(p2[d] * 100, 1) }, 'A tenth of ' + C.districts[d].name + ' has moved away, and its senators are worried', 5); }
        if (p2[d] > 0.97) OP.exodus[d] = 0;
        if (was > 0.995 && jobR > 1.06 && k - (OP.full[d] || -999) > 120) { OP.full[d] = k; emit('society.full', 2, 'full:' + d + ':' + ymd(dayStart(k)), { district: C.districts[d].name }, C.districts[d].name + ' is full: pixels are arriving for the work, and there is nowhere left to live', 6); }
      }
      OP.pop = p2;
      if (new Date(dayStart(k + 1)).getUTCDate() === 1) { // the month's moves
        let left = 0, came = 0; for (let d = 0; d < C.D; d++) { left += mon.left[d]; came += mon.came[d]; }
        let worst = 0; for (let d = 1; d < C.D; d++) if (mon.came[d] - mon.left[d] < mon.came[worst] - mon.left[worst]) worst = d;
        const net = came - left;
        emit('society.migration', Math.abs(net) > 600 ? 3 : 2, 'migration:' + ymd(dayStart(k + 1)), { arrived: Math.round(came), left: Math.round(left), worst: C.districts[worst].name },
          Math.round(left).toLocaleString('en') + ' pixels left Pixel City last month and ' + Math.round(came).toLocaleString('en') + ' arrived' + (net < -200 ? '; ' + C.districts[worst].name + ' lost the most' : net > 200 ? '; the city is filling up' : ''), 7);
        OP.month = { left: new Float64Array(C.D), came: new Float64Array(C.D) };
      }
    }
    // the day's record
    const poll = new Float32Array(C.D * 4), dmood = new Float32Array(C.D), wsum = new Float64Array(C.D);
    for (const c of C.list) { for (let j = 0; j < 4; j++) poll[c.d * 4 + j] += OP.lean[c.i * 4 + j] * c.size; dmood[c.d] += OP.mood[c.i] * c.size; wsum[c.d] += c.size; }
    for (let d = 0; d < C.D; d++) { for (let j = 0; j < 4; j++) poll[d * 4 + j] /= wsum[d]; dmood[d] /= wsum[d]; }
    OP.days.push({ k, needs: Float32Array.from(OP.needs), pop: Float32Array.from(OP.pop), poll, mood: dmood, lean: Float32Array.from(OP.lean), cmood: Float32Array.from(OP.mood), hardship: Float32Array.from(hardship) });
    if (OP.days.length === 1) OP.basePoll = poll;
    OP.k = k + 1;
  }
  const argmax = (lean, i) => { let b = 0; for (let j = 1; j < 4; j++) if (lean[i * 4 + j] > lean[i * 4 + b]) b = j; return b; };
  function opinionsTo(k) { if (!OP) initOpinions(); while (OP.k < k) opinionDay(); }
  function opinionRecord(k) { if (k < 0) return null; opinionsTo(k + 1); return OP.days[k]; }

  /**
   * For the Senate's elections: how much more (or less) a party's candidates draw in a district than when Society
   * began, from the district's mood a fortnight before polling day. 1 means no change.
   */
  function voteSwing(districtName, party, day) {
    if (!opinionsReady() || day < VOTES_FROM) return 1;
    const C = communities(), d = C.districts.findIndex((x) => x.name === districtName); if (d < 0) return 1;
    const rec = opinionRecord(daysTo(day - POLL_LAG)); if (!rec || !OP.basePoll) return 1;
    const j = PIDS.indexOf(party); if (j < 0) return 1;
    const ratio = rec.poll[d * 4 + j] / OP.basePoll[d * 4 + j];
    return clamp(1 + 1.6 * (ratio - 1), 0.45, 2);
  }

  const NEEDS = ['housing', 'charge', 'health', 'security', 'leisure'];
  /** A district's basic needs, as of the close before t: each 0 (unmet) to 1 (well met), and overall wellbeing. */
  function needsAt(d, t) {
    if (!opinionsReady() || t < START + 2 * DAY) return null;
    const rec = opinionRecord(daysTo(t) - 1); if (!rec || !rec.needs) return null;
    const o = {}; NEEDS.forEach((n, j) => (o[n] = rec.needs[d * 5 + j]));
    o.wellbeing = 0.25 * o.housing + 0.2 * o.charge + 0.2 * o.health + 0.15 * o.security + 0.2 * o.leisure;
    return o;
  }
  /** The share of a district's homes that are lived in, as of the close before t: 1 is a full district. */
  function populationAt(d, t) {
    if (!opinionsReady() || t < MIG_START + DAY) return 1;
    const rec = opinionRecord(daysTo(t) - 1); return rec && rec.pop ? rec.pop[d] : 1;
  }
  /**
   * For the Senate's elections: how much a sitting senator's local standing is worth, from whether their district has
   * grown or emptied and how happy it is, a fortnight before polling day. 1 is no effect.
   */
  function incumbentFactor(districtName, day) {
    if (!opinionsReady() || day < VOTES_FROM) return 1;
    const C = communities(), d = C.districts.findIndex((x) => x.name === districtName); if (d < 0) return 1;
    const rec = opinionRecord(daysTo(day - POLL_LAG)); if (!rec) return 1;
    return clamp(1 + 1.0 * ((rec.pop ? rec.pop[d] : 1) - 1) + 0.6 * (rec.mood[d] - 0.65), 0.82, 1.18);
  }

  // ================================================================ reading Society
  function fadView(f, C, k) {
    const c = COLOURS[f.item] || null;
    return { id: f.id, category: f.cat, item: f.cat === 'colour' ? c[0] : f.item, hex: f.cat === 'colour' ? c[1] : null, origin: C.list[f.origin].name, since: ymd(dayStart(f.born)), days: k - f.born, share: rd(f.strength * 100, 10),
      districts: C.districts.map((D, d) => { let s = 0, w = 0; for (const x of C.byDistrict[d]) { s += f.a[x.i] * x.size; w += x.size; } return rd(s / w * 100, 1); }) };
  }
  /** Society at t, as of the last close: crazes now, the mood and leanings in each district, and the communities. */
  function stateAt(t) {
    if (!ready() || t < START + DAY) return { started: false, startDate: ymd(START) };
    const C = communities(), k = daysTo(t) - 1, tr = tasteRecord(k);
    const out = { started: true, asOf: iso(dayStart(k) + DAY), fads: tr.fads.filter((f) => f.strength > 0.002).map((f) => fadView(f, C, k)).sort((a, b) => b.share - a.share), past: TR.ended.filter((f) => f.ended <= k).slice(-12).reverse().map((f) => ({ id: f.id, category: f.cat, item: f.cat === 'colour' ? COLOURS[f.item][0] : f.item, hex: f.cat === 'colour' ? COLOURS[f.item][1] : null, peak: f.peak, from: ymd(dayStart(f.born)), to: ymd(dayStart(f.ended)), origin: C.list[f.origin].name })) };
    if (opinionsReady()) {
      const op = opinionRecord(k);
      const poll = (d) => { const o = {}; PIDS.forEach((p, j) => (o[p] = rd(op.poll[d * 4 + j] * 100, 10))); return o; };
      out.districts = C.districts.map((D, d) => ({ id: d, name: D.name, needs: (() => { const n = needsAt(d, t); if (!n) return null; const o = {}; for (const key in n) o[key] = rd(n[key] * 100, 1); return o; })(), population: Math.round((op.pop ? op.pop[d] : 1) * D.residents), homesLivedIn: rd((op.pop ? op.pop[d] : 1) * 100, 10), mood: rd(op.mood[d] * 100, 1), hardship: rd(op.hardship[d] * 100, 1), poll: poll(d), base: (() => { const o = {}; PIDS.forEach((p, j) => (o[p] = rd(OP.basePoll[d * 4 + j] * 100, 10))); return o; })() }));
      let tot = 0; const city = { B: 0, V: 0, L: 0, I: 0 }; let m = 0;
      for (let d = 0; d < C.D; d++) { const w = C.districts[d].residents; tot += w; m += op.mood[d] * w; PIDS.forEach((p, j) => (city[p] += op.poll[d * 4 + j] * w)); }
      PIDS.forEach((p) => (city[p] = rd(city[p] / tot * 100, 10)));
      out.city = { mood: rd(m / tot * 100, 1), poll: city };
      out.rivalries = Object.keys(OP.rival).filter((key) => OP.rival[key] <= k).map((key) => { const [a, b] = key.split(':').map(Number); return { a: C.list[a].name, b: C.list[b].name, district: C.list[a].district, since: ymd(dayStart(OP.rival[key])) }; });
    }
    return out;
  }
  /** One community at t: members, what it has taken up, how it leans, its mood. */
  function community(i, t) {
    if (!ready() || t < START + DAY) return null;
    const C = communities(), c = C.list[i]; if (!c) return null;
    const k = daysTo(t) - 1, tr = tasteRecord(k);
    const out = { id: c.i, name: c.name, district: c.district, districtId: c.d, interest: c.interest, members: c.size, novelty: rd(c.novelty * 100, 1), shop: INTERESTS[c.k].shop,
      fads: tr.fads.map((f) => ({ item: f.cat === 'colour' ? COLOURS[f.item][0] : f.item, category: f.cat, hex: f.cat === 'colour' ? COLOURS[f.item][1] : null, share: rd(f.a[c.i] * 100, 1) })).filter((f) => f.share >= 1) };
    if (opinionsReady()) { const op = opinionRecord(k); out.lean = {}; PIDS.forEach((p, j) => (out.lean[p] = rd(op.lean[c.i * 4 + j] * 100, 1))); out.mood = rd(op.cmood[c.i] * 100, 1); }
    return out;
  }
  function communitiesAt(t) { if (!ready()) return []; return communities().list.map((c) => ({ id: c.i, name: c.name, district: c.district, interest: c.interest, members: c.size })); }

  // ---------------------------------------------------------------- one pixel's social life
  // Memberships come from who they are; friends are pixels in the same district who share a community; the rival is
  // someone nearby who leans the other way. Their friends' leanings move theirs: three friends for Verdant will bring a
  // waverer round.
  function membershipsOf(id, district) {
    const C = communities(), cs = C.byDistrict[district] || [], n = 1 + Math.floor(unit('n:' + id) * 2.6), out = [];
    for (let j = 0; j < 12 && out.length < n; j++) {
      let u = unit('m:' + id + ':' + j), pickc = cs[0];
      for (const c of cs) { u -= c.share; if (u < 0) { pickc = c; break; } }
      if (out.indexOf(pickc) < 0) out.push(pickc);
    }
    return out;
  }
  function personalLean(id, district, mem, t, op) {
    const v = [0, 0, 0, 0];
    for (const c of mem) for (let j = 0; j < 4; j++) v[j] += op.lean[c.i * 4 + j] / mem.length;
    for (let j = 0; j < 4; j++) v[j] += (unit('pl:' + id + ':' + j) - 0.5) * 0.25;
    return v;
  }
  function pixelAt(id, t) {
    if (!ready() || !Cen()) return null;
    const K = Cen(), me = K.character(id); if (!me) return null;
    const C = communities(), mem = membershipsOf(id, me.district), k = t >= START + DAY ? daysTo(t) - 1 : -1;
    const out = { id, name: me.name, district: C.districts[me.district] ? C.districts[me.district].name : me.district, communities: mem.map((c) => ({ id: c.i, name: c.name })), friends: [], rival: null, fads: [], lean: null, swayedBy: null };
    if (k < 0) return out;
    // friends: neighbours in the district who share one of their communities
    const pool = K.residentsOf(me.district, t, Math.floor(unit('fo:' + id) * 200), 400) || [];
    const ids = pool.map((p) => (typeof p === 'string' ? p : p.id)).filter((x) => x && x !== id);
    const mine = new Set(mem.map((c) => c.i));
    for (const fid of ids) { if (out.friends.length >= 5) break; if (unit('f:' + [id, fid].sort().join(':')) < 0.35 && membershipsOf(fid, me.district).some((c) => mine.has(c.i))) out.friends.push(fid); }
    const tr = tasteRecord(k);
    for (const f of tr.fads) { let a = 0; for (const c of mem) a += f.a[c.i] / mem.length; if (unit('took:' + id + ':' + f.id) < a) out.fads.push({ item: f.cat === 'colour' ? COLOURS[f.item][0] : f.item, category: f.cat, hex: f.cat === 'colour' ? COLOURS[f.item][1] : null }); }
    if (opinionsReady()) {
      const op = opinionRecord(k), mineV = personalLean(id, me.district, mem, t, op);
      // friends pull: a fifth of the way towards what they think
      const fv = [0, 0, 0, 0];
      for (const fid of out.friends) { const fc = K.character(fid); if (!fc) continue; const v = personalLean(fid, fc.district, membershipsOf(fid, fc.district), t, op); for (let j = 0; j < 4; j++) fv[j] += v[j] / out.friends.length; }
      const final = mineV.map((x, j) => (out.friends.length ? x * 0.8 + fv[j] * 0.2 : x));
      let b = 0; for (let j = 1; j < 4; j++) if (final[j] > final[b]) b = j;
      let b0 = 0; for (let j = 1; j < 4; j++) if (mineV[j] > mineV[b0]) b0 = j;
      out.lean = PIDS[b]; if (b !== b0) out.swayedBy = 'friends';
      // a rival: someone nearby who leans the other way and shares none of their communities
      for (const rid of ids.slice().reverse()) {
        if (out.friends.indexOf(rid) >= 0) continue;
        const rc = K.character(rid); if (!rc) continue;
        const rm = membershipsOf(rid, rc.district); if (rm.some((c) => mine.has(c.i))) continue;
        const rv = personalLean(rid, rc.district, rm, t, op); let rb = 0; for (let j = 1; j < 4; j++) if (rv[j] > rv[rb]) rb = j;
        if (rb !== b && unit('r:' + id + ':' + rid) < 0.5) { out.rival = rid; break; }
      }
    }
    return out;
  }

  function eventsBetween(from, to) {
    if (!ready() || to < START) return [];
    const k = daysTo(to); tastesTo(k); const out = TR.events.filter((e) => e.ms >= from && e.ms < to);
    if (opinionsReady()) { opinionsTo(k); for (const e of OP.events) if (e.ms >= from && e.ms < to) out.push(e); }
    return out.sort((a, b) => a.ms - b.ms).map((e) => ({ id: e.id, time: e.time, source: e.source, type: e.type, importance: e.importance, data: e.data, headline: e.headline }));
  }
  function historyBetween(from, to) {
    if (!ready()) return [];
    const k = daysTo(to); tastesTo(k); if (opinionsReady()) opinionsTo(k);
    const out = [];
    for (let j = 0; j < k; j++) {
      const day = dayStart(j); if (day + DAY <= from) continue;
      const rec = { day, date: ymd(day), fads: TR.days[j].fads.map((f) => ({ id: f.id, category: f.cat, strength: rd(f.strength * 100, 10) })) };
      if (OP && OP.days[j]) { const op = OP.days[j], C = communities(); let tot = 0, m = 0; const city = { B: 0, V: 0, L: 0, I: 0 }; for (let d = 0; d < C.D; d++) { const w = C.districts[d].residents; tot += w; m += op.mood[d] * w; PIDS.forEach((p, i) => (city[p] += op.poll[d * 4 + i] * w)); } PIDS.forEach((p) => (city[p] = rd(city[p] / tot * 100, 10))); rec.mood = rd(m / tot * 100, 1); rec.poll = city; }
      out.push(rec);
    }
    return out;
  }

  root.PixelUniverse = root.PixelUniverse || {};
  root.PixelUniverse.society = {
    version: VERSION, source: 'society', startDate: ymd(START), start: START, votesFrom: ymd(VOTES_FROM), ready, opinionsReady,
    stateAt, community, communitiesAt, pixelAt, eventsBetween, historyBetween,
    productBoost, songFad, colourFad, voteSwing, populationAt, needsAt, NEEDS, wellbeingStart: ymd(WELL_START), incumbentFactor, migrationStart: ymd(MIG_START), INTERESTS: INTERESTS.map((x) => x.name), COLOURS: COLOURS.map((c) => ({ name: c[0], hex: c[1] }))
  };
})(typeof window !== 'undefined' ? window : globalThis);
