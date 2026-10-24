/*
 * Life in Pixel City: where the residents are, and what they are doing, at any moment.
 *
 * Every resident has a routine for each day on the city's clock, worked out from who they are (the census: age,
 * household, character), where things are (the renewed map: homes, workplaces, squares, parks, the stadium) and
 * the weather. Workers commute, some work outdoors, many go out for lunch; children go to school and play after;
 * the retired walk in the parks; evenings and weekends bring people to the squares, the parks, the beach and, on
 * Grand Prix days, the stadium. Rain keeps people in.
 *
 * The map shows one resident in every few, so the streets stay readable: enough to see the city's rhythm.
 * Routines are a pure function of time: everyone watching sees the same pixel in the same place.
 * Load after City's universe.js and census.js. Seeds start "life:". Registers window.PixelUniverse.life.
 */
(function (root) {
  'use strict';

  const MIN = 60000, H = 3600000, DAY = 86400000;
  const SHOWN = 0.16;          // the share of residents drawn on the map
  const SPEED = 0.22 / 1000;   // walking pace, in blocks per millisecond (about 13 blocks a minute)

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
  const seeded = (s) => rng(hash('life:' + s));
  const U = () => root.PixelUniverse || {};
  const ok = (x) => !!(x && (!x.ready || x.ready()));
  const ready = () => ok(U().city) && ok(U().census);

  // ---------------------------------------------------------------- the city's places, worked out once
  let P = null;
  function places() {
    if (P) return P;
    const C = U().city, K = U().census, m = C.map(C.renewalAt ? C.renewalAt() : undefined), T = C.T;
    const at = (x, y) => y * m.W + x;
    const isWalk = (t) => t === T.ROAD || t === T.STREET || t === T.BRIDGE || t === T.PLAZA;
    // walkways: the rows and columns that are mostly road, which people follow across the city
    const rows = [], cols = [];
    for (let y = 0; y < m.H; y++) { let n = 0, land = 0; for (let x = 0; x < m.W; x++) { const t = m.tiles[at(x, y)]; if (t !== T.SEA) land++; if (isWalk(t)) n++; } if (land && n / land > 0.45) rows.push(y); }
    for (let x = 0; x < m.W; x++) { let n = 0, land = 0; for (let y = 0; y < m.H; y++) { const t = m.tiles[at(x, y)]; if (t !== T.SEA) land++; if (isWalk(t)) n++; } if (land && n / land > 0.45) cols.push(x); }
    const jobs = m.districts.map(() => []), shops = m.districts.map(() => []), allJobs = [];
    const JOB = { [T.OFFICE]: 'at the offices on ', [T.SHOP]: 'at a shop on ', [T.FACTORY]: 'at the factory on ', [T.WAREHOUSE]: 'at a warehouse on ', [T.DOCK]: 'on the docks' };
    for (let i = 0; i < m.tiles.length; i++) {
      const t = m.tiles[i], k = m.district[i];
      if (k < 0 || !JOB[t] || m.owner[i] >= 0) continue;
      const p = { x: i % m.W, y: Math.floor(i / m.W), kind: t };
      jobs[k].push(p); allJobs.push(p);
      if (t === T.SHOP) shops[k].push(p);
    }
    const landmark = (type) => m.features.filter((f) => f.type === type)[0];
    const homes = K.homes();
    P = { m, T, at, rows, cols, jobs, shops, allJobs, JOB, landmark, homes, squares: m.squares || [], beach: [] };
    P.streets = {};
    for (const h of homes) if (!P.streets[h.y]) P.streets[h.y] = h.address.replace(/^(Flat \d+, |Flat \d+ above |Above )?\d+[A-F]? /, '');
    for (let y = 0; y < m.H; y += 3) for (let x = m.W - 1; x > 0; x--) if (m.tiles[at(x, y)] === T.BEACH && !(x >= 108 && y >= 50 && y <= 66)) { P.beach.push({ x, y }); break; }
    return P;
  }
  const nearest = (list, v) => { let b = list[0], bd = 1e9; for (const q of list) { const d = q > v ? q - v : v - q; if (d < bd) { bd = d; b = q; } } return b; };
  const streetName = (p) => P.streets[p.y] || 'the high street';

  // ---------------------------------------------------------------- a route through the streets
  function route(a, b, lane) {
    const ra = nearest(P.rows, a.y) + 0.5 + lane, cb = nearest(P.cols, b.x) + 0.5 + lane;
    const pts = [a, { x: a.x, y: ra }, { x: cb, y: ra }, { x: cb, y: b.y }, b];
    let len = 0;
    const seg = [];
    for (let i = 1; i < pts.length; i++) { const d = Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y); seg.push(d); len += d; }
    return { pts, seg, len };
  }
  function along(r, f) {
    let d = f * r.len;
    for (let i = 0; i < r.seg.length; i++) {
      if (d <= r.seg[i] || i === r.seg.length - 1) {
        const k = r.seg[i] ? d / r.seg[i] : 0, a = r.pts[i], b = r.pts[i + 1];
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      }
      d -= r.seg[i];
    }
    return r.pts[r.pts.length - 1];
  }

  // ---------------------------------------------------------------- a day in the life
  const plans = new Map();
  function cityDayOf(t) { const C = U().city, off = C.offsetAt ? C.offsetAt(t) : 0; return { start: (t + off) - (((t + off) % DAY) + DAY) % DAY - off, off }; }
  function weekday(dayStart, off) { return new Date(dayStart + off).getUTCDay(); }

  function planDay(dayStart, off) {
    const C = U().city, K = U().census, W = U().climate;
    places();
    const out = [];
    const dow = weekday(dayStart, off), weekend = dow === 0 || dow === 6;
    const gp = (() => { const d = new Date(dayStart + 13 * H).getUTCDate(); return d === 1 || d === 2; })();
    const wet = (t) => { try { const x = W.sample(t); return x.rain > 1.5 || (x.storm && x.gust > 50); } catch (e) { return false; } };
    const parks = [];
    try { const st = C.stateAt(dayStart + 12 * H); for (const s of st.sites) if (s.state === 'operating' && (s.type === 'park' || s.type === 'wildlife')) { const f = P.m.features[s.id]; parks.push({ x: f.x, y: f.y, w: f.w, h: f.h, name: s.name, district: f.district }); } } catch (e) { /* no parks today */ }
    const stadium = P.landmark('stadium'), museum = P.landmark('museum'), bookmaker = P.landmark('bookmaker');
    // Pixel High, once it has opened: the school's own calendar decides the school days, if the school is loaded
    const high = P.landmark('school'), SCH = U().school;
    const highOpen = !!(high && (!C.isPlanned || !C.isPlanned(high, dayStart + 12 * H)));
    const highToday = highOpen && (SCH && SCH.ready() ? SCH.inSession(dayStart + 10 * H) : !weekend);
    const highIn = high && { x: high.x + 0.6, y: high.y + 0.6, w: high.w * 0.45, h: high.h - 1.2 };
    const highField = high && { x: high.x + high.w * 0.58, y: high.y + 0.9, w: high.w * 0.36, h: high.h - 1.8 };
    const H0 = dayStart; // city midnight, as a moment
    const dateKey = new Date(H0 + off).toISOString().slice(0, 10);
    const inside = (pl, r) => ({ x: pl.x + 0.6 + r() * (pl.w - 1.2), y: pl.y + 0.6 + r() * (pl.h - 1.2) });

    for (const home of P.homes) {
      const hh = K.householdAt(home.i, H0 + 12 * H);
      hh.members.forEach((mem, mi) => {
        if (H0 < mem.birth) return;
        if (seeded('shown:' + mem.id)() >= SHOWN) return; // decided first: it's cheap, and most residents aren't drawn
        const age = Math.floor((H0 - mem.birth) / 31557600000);
        if (age < 4) return; // the very young stay with a grown-up
        const r = seeded(mem.id + ':' + dateKey);
        const door = { x: home.x + 0.3 + (mi % 3) * 0.2, y: home.y + 0.85 };
        const lane = (seeded('lane:' + mem.id)() - 0.5) * 0.5;
        const visits = []; // { leave, place: {x,y}, stay, label, outside, travel }
        const add = (leave, place, stay, label, outside, travel) => visits.push({ leave, place, stay, label, outside, travel });
        const pr = seeded('person:' + mem.id); // fixed for life: workplace, habits
        const homeD = home.district;
        const job = (() => { const local = P.jobs[homeD]; const list = local.length && pr() < 0.55 ? local : P.allJobs; return list[Math.floor(pr() * list.length)]; })();
        const square = P.squares.filter((q) => q.district === homeD)[0] || P.squares[Math.floor(pr() * P.squares.length)];
        const sociable = pr(), early = pr();
        const outdoorJob = job && (job.kind === P.T.DOCK || pr() < 0.08);
        const leisure = () => {
          const opts = [];
          if (square) opts.push([square, 'Meeting friends in ' + square.name, 3]);
          const park = parks.filter((p) => p.district === homeD)[0] || parks[Math.floor(r() * (parks.length || 1))];
          if (park) opts.push([park, 'Walking in ' + park.name, 3]);
          if (P.beach.length) { const b = P.beach[Math.floor(r() * P.beach.length)]; opts.push([{ x: b.x - 1, y: b.y, w: 2, h: 2 }, 'At the beach', weekend ? 2 : 0.5]); }
          if (museum) opts.push([{ x: museum.x - 1, y: museum.y + museum.h, w: museum.w + 2, h: 2.2 }, 'Visiting the Museum', 0.35]);
          if (bookmaker) opts.push([{ x: bookmaker.x - 1, y: bookmaker.y + bookmaker.h, w: bookmaker.w + 2, h: 2.2 }, 'Studying the odds outside the Bookmaker', age >= 18 ? 0.3 : 0]);
          let tot = 0; for (const o of opts) tot += o[2];
          let v = r() * tot;
          for (const o of opts) { v -= o[2]; if (v < 0) return o; }
          return opts[0];
        };
        const at = (h) => H0 + Math.floor(h * 60) * MIN;
        if (gp && stadium && sociable > 0.55 && !wet(at(13))) {
          add(at(11 + r() * 2), inside({ x: stadium.x - 1, y: stadium.y + stadium.h, w: stadium.w + 2, h: 1.5 }, r), (2 + r() * 3) * H, 'At the Glacial Stadium for the Grand Prix', true, 'Going to the Grand Prix');
        }
        if (age >= 13 && age <= 17 && highOpen && highToday) {
          // Pixel High: in by 8:45, out on the field at lunch, home after the last bell
          add(at(8.1 + r() * 0.5), inside(highIn, r), (12.5 - 8.6) * H, 'In class at Pixel High', false, 'Walking to Pixel High');
          if (r() < 0.5) add(at(12.5), inside(highField, r), 0.7 * H, 'At lunch on the Pixel High field', true, 'Out to the field'); // the rest eat in the hall
          add(at(13.25), inside(highIn, r), 2 * H, 'In class at Pixel High', false, 'Back to class');
          if (square && r() < 0.4 && !wet(at(15.6))) add(at(15.4 + r() * 0.5), inside(square, r), (0.5 + r()) * H, 'Hanging out in ' + square.name, true, 'Off to meet friends');
        } else if (age < 18) {
          if (!weekend && age >= 5) {
            const school = P.jobs[homeD][Math.floor(pr() * P.jobs[homeD].length)] || job;
            add(at(8 + r() * 0.5), { x: school.x + 0.5, y: school.y + 0.5 }, (6 + r()) * H, 'At school', false, 'Walking to school');
            if (square && r() < 0.5 && !wet(at(15.5))) add(at(15 + r()), inside(square, r), (0.6 + r()) * H, 'Playing in ' + square.name, true, 'Off to play');
          } else if (r() < 0.6) { const [pl, label] = leisure(); if (!wet(at(11))) add(at(10 + r() * 5), inside(pl, r), (1 + r() * 2) * H, label, true, 'Heading out'); }
        } else if (age < 67 && (!weekend || outdoorJob && r() < 0.3) && job) {
          const start = 7 + early * 2 + r() * 0.4, end = 16 + early * 1.5 + r() * 1.2;
          const work = outdoorJob ? { x: job.x + 0.2 + r() * 0.6, y: job.y + 0.2 + r() * 0.6 } : { x: job.x + 0.5, y: job.y + 0.5 };
          const where = job.kind === P.T.DOCK ? 'Working on the docks' : outdoorJob ? 'Working outdoors on ' + streetName(job) : 'At work ' + P.JOB[job.kind] + streetName(job);
          if (r() < 0.3 && square && !wet(at(12.5))) {
            add(at(start), work, (12 - start) * H, where, outdoorJob, 'On the way to work');
            add(at(12 + r() * 0.5), inside(square, r), (0.4 + r() * 0.4) * H, 'Out for lunch in ' + square.name, true, 'Going out for lunch');
            add(at(13.2), work, (end - 13.2) * H, where, outdoorJob, 'Back to work');
          } else add(at(start), work, (end - start) * H, where, outdoorJob, 'On the way to work');
          if (sociable > 0.6 && !wet(at(18.5))) { const [pl, label] = leisure(); add(at(end + 0.6 + r()), inside(pl, r), (1 + r() * 2) * H, label, true, 'Going out for the evening'); }
        } else {
          // the retired, weekends and days off
          const outings = weekend ? 1 + Math.floor(sociable * 2.5) : 1 + Math.floor(sociable * 1.6);
          let h = 9 + r() * 2;
          for (let k = 0; k < outings && h < 19; k++) {
            if (wet(at(h))) { h += 2; continue; }
            const shop = P.shops[homeD][Math.floor(r() * (P.shops[homeD].length || 1))];
            if (shop && r() < 0.35) add(at(h), { x: shop.x + 0.5, y: shop.y + 1.05 }, (0.2 + r() * 0.3) * H, 'Running errands', true, 'Popping to the shops');
            else { const [pl, label] = leisure(); add(at(h), inside(pl, r), (0.8 + r() * 1.8) * H, label, true, 'Heading out'); }
            h += 2.5 + r() * 2;
          }
        }
        // early runners and late walkers keep the streets from ever quite emptying
        if (age >= 16 && age < 70 && early > 0.9 && !wet(at(6.2))) { const [pl] = leisure(); add(at(5.8 + r() * 0.6), inside(pl, r), (0.3 + r() * 0.3) * H, 'Out for a morning run', true, 'Running'); }
        if (age >= 18 && sociable > 0.88 && !wet(at(22.5))) { const [pl] = leisure(); add(at(21.8 + r() * 0.9), inside(pl, r), (0.3 + r() * 0.5) * H, 'Out for a late walk', true, 'Walking'); }
        if (!visits.length) return;
        visits.sort((a, b) => a.leave - b.leave);
        // turn the visits into legs (walking) and stays, going home in between when there's time
        const legs = [];
        let pos = door, free = H0;
        for (let k = 0; k < visits.length; k++) {
          const v = visits[k];
          const leave = v.leave > free ? v.leave : free;
          const rt = route(pos, v.place, lane), dur = Math.floor(rt.len / SPEED);
          legs.push({ t0: leave, t1: leave + dur, route: rt, label: v.travel, moving: true });
          const stayEnd = leave + dur + Math.floor(v.stay);
          legs.push({ t0: leave + dur, t1: stayEnd, at: v.place, label: v.label, moving: false, outside: v.outside });
          pos = v.place; free = stayEnd;
          const next = visits[k + 1];
          const home = route(pos, door, lane), homeDur = Math.floor(home.len / SPEED);
          if (!next || next.leave - free > homeDur * 2 + 20 * MIN) { legs.push({ t0: free, t1: free + homeDur, route: home, label: 'Heading home', moving: true }); pos = door; free = free + homeDur; }
        }
        out.push({ id: mem.id, legs });
      });
    }
    return out;
  }

  function planFor(t) {
    const { start, off } = cityDayOf(t);
    if (!plans.has(start)) {
      plans.set(start, planDay(start, off));
      if (plans.size > 3) plans.delete(plans.keys().next().value);
    }
    return plans.get(start);
  }

  /**
   * Everyone visible at time t: [{ id, x, y, moving, label }], in blocks. Residents indoors are not listed.
   * Pass a box { x0, y0, x1, y1 } to list only those inside it.
   */
  function peopleAt(t, box) {
    if (!ready()) return [];
    const out = [];
    const list = planFor(t).concat(t - cityDayOf(t).start < 3 * H ? planFor(t - 4 * H) : []);
    for (const p of list) {
      for (const leg of p.legs) {
        if (t < leg.t0 || t >= leg.t1) continue;
        let x, y;
        if (leg.moving) { const q = along(leg.route, (t - leg.t0) / (leg.t1 - leg.t0 || 1)); x = q.x; y = q.y; }
        else { if (!leg.outside) break; x = leg.at.x; y = leg.at.y; }
        if (box && (x < box.x0 || y < box.y0 || x > box.x1 || y > box.y1)) break;
        out.push({ id: p.id, x, y, moving: leg.moving, label: leg.label });
        break;
      }
    }
    return out;
  }

  root.PixelUniverse = root.PixelUniverse || {};
  root.PixelUniverse.life = { version: '0.1.0', source: 'life', ready, peopleAt, planFor, shownShare: SHOWN };
})(typeof window !== 'undefined' ? window : globalThis);
