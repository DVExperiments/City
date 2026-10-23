/*
 * The map of Pixel City: a top-down view you can drag, zoom and click.
 * Display only. Traffic, smoke, sparkle and cloud shadows are decoration.
 */
(function () {
  const C = PixelUniverse.city;
  const T = C.T;
  const H = 3600000;
  const COL = {
    [T.SEA]: '#1E4A66', [T.BEACH]: '#D8C99A', [T.GRASS]: '#7BA05B', [T.FOREST]: '#2F5D36', [T.ROAD]: '#3B4045', [T.STREET]: '#5A6066',
    [T.BRIDGE]: '#6E6A60', [T.HOUSE]: '#C98B6B', [T.APARTMENT]: '#9AA3AD', [T.SHOP]: '#D6A84C', [T.OFFICE]: '#7F9BB8', [T.FACTORY]: '#8C7F72',
    [T.WAREHOUSE]: '#A0927E', [T.DOCK]: '#6F6A63', [T.PARK]: '#5E9E4E', [T.RIVER]: '#2E6C8E', [T.PLAZA]: '#CFC6B4', [T.SITE]: '#A8996F', [T.LANDMARK]: '#BDB6A6'
  };
  const LIT = { [T.HOUSE]: 0.35, [T.APARTMENT]: 0.6, [T.SHOP]: 0.5, [T.OFFICE]: 0.55, [T.FACTORY]: 0.25, [T.WAREHOUSE]: 0.15 };
  const PARTY = { B: '#E8A33D', V: '#3FA66A', L: '#8C9AA6', I: '#B79AE0' };
  function h32(n) { n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
    return 'rgb(' + f((n >> 16) & 255) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')';
  }

  window.CityMap = function (canvas, opts) {
    const map = C.map();
    const ctx = canvas.getContext('2d');
    const base = document.createElement('canvas'), bctx = base.getContext('2d');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    let cw = 0, ch = 0;
    const cam = { x: map.W / 2, y: map.H / 2, z: 6 };
    let world = null, dirty = true, selected = null, hover = null, showDistricts = true;
    // district borders, computed once
    const borders = [];
    for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) {
      const d = map.district[y * map.W + x];
      if (d < 0) continue;
      if (x + 1 < map.W && map.district[y * map.W + x + 1] >= 0 && map.district[y * map.W + x + 1] !== d) borders.push([x + 1, y, x + 1, y + 1]);
      if (y + 1 < map.H && map.district[(y + 1) * map.W + x] >= 0 && map.district[(y + 1) * map.W + x] !== d) borders.push([x, y + 1, x + 1, y + 1]);
    }
    const cars = [];

    function resize() {
      const r = canvas.getBoundingClientRect();
      cw = Math.max(200, r.width); ch = Math.max(200, r.height);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
      base.width = canvas.width; base.height = canvas.height;
      if (!world) fit();
      dirty = true;
    }
    function fit() { cam.z = Math.max(3, cw / map.W); cam.x = map.W / 2; cam.y = map.H / 2; clampCam(); }
    function clampCam() {
      cam.z = Math.max(cw / map.W, Math.min(44, cam.z));
      const hw = cw / 2 / cam.z, hh = ch / 2 / cam.z;
      cam.x = map.W <= 2 * hw ? map.W / 2 : Math.max(hw, Math.min(map.W - hw, cam.x));
      cam.y = map.H <= 2 * hh ? map.H / 2 : Math.max(hh, Math.min(map.H - hh, cam.y));
    }
    const sx = (x) => (x - cam.x) * cam.z + cw / 2, sy = (y) => (y - cam.y) * cam.z + ch / 2;
    const tileAt = (px, py) => ({ x: Math.floor((px - cw / 2) / cam.z + cam.x), y: Math.floor((py - ch / 2) / cam.z + cam.y) });

    // ---------------------------------------------------------------- the static layer
    function drawFeature(g, f, site, x0, y0, z, night) {
      const w = f.w * z, h = f.h * z;
      const r = (x, y, ww, hh, c) => { g.fillStyle = c; g.fillRect(x0 + x * z, y0 + y * z, ww * z, hh * z); };
      if (f.kind === 'landmark') {
        if (f.type === 'senate') {
          r(0, 0, f.w, f.h, '#E7E1D3'); r(0.4, 1.2, f.w - 0.8, 0.4, '#C9C0AC');
          for (let k = 0; k < 6; k++) r(0.7 + k * 1.0, 1.8, 0.35, f.h - 2.4, '#F6F2E8');
          r(f.w / 2 - 1.2, 0.2, 2.4, 1, '#B8AF9A');
        } else if (f.type === 'stadium') {
          r(0, 0, f.w, f.h, '#5F6B70'); r(0.8, 0.8, f.w - 1.6, f.h - 1.6, '#0E171C');
          r(1.6, f.h / 2 - 1.1, f.w - 3.2, 0.12, 'rgba(255,255,255,0.15)'); r(1.6, f.h / 2 + 1, f.w - 3.2, 0.12, 'rgba(255,255,255,0.15)');
          r(f.w - 1.9, f.h / 2 - 1.4, 0.3, 2.8, '#E9EEF0');
          if (night) { r(0, 0, 0.6, 0.6, '#FFF2C2'); r(f.w - 0.6, 0, 0.6, 0.6, '#FFF2C2'); r(0, f.h - 0.6, 0.6, 0.6, '#FFF2C2'); r(f.w - 0.6, f.h - 0.6, 0.6, 0.6, '#FFF2C2'); }
        } else if (f.type === 'bureau') {
          r(0, 0, f.w, f.h, '#C8D3DA'); r(0.8, 0.8, 1.4, 1.4, '#7F9BB8'); r(1.3, 1.3, 0.4, 0.4, '#E8743B');
        } else if (f.type === 'bookmaker') {
          r(0, 0, f.w, f.h, '#7A4E3A'); r(0.4, 0.4, f.w - 0.8, 0.8, '#E5C15A'); r(0.6, 1.6, f.w - 1.2, 0.9, '#3A2A22');
        } else if (f.type === 'press') {
          r(0, 0, f.w, f.h, '#DAD6CC'); r(0.3, 0.3, f.w - 0.6, 0.6, '#14212A');
        } else if (f.type === 'gas') {
          r(0, 0, f.w, f.h, '#8D8F8A'); r(0.4, 0.5, 1.2, 1.2, '#C6C9C4'); r(2.2, 0.5, 1.2, 1.2, '#C6C9C4');
        } else if (f.type === 'port') {
          r(0, 0, f.w, f.h, '#6F6A63');
          for (let k = 0; k < 3; k++) r(0.5 + k * 1.2, 1 + k * 2.2, 0.8, 1.5, ['#C0392B', '#2E86C1', '#D4AC0D'][k]);
        }
        return;
      }
      const st = site.state;
      if (st === 'empty') {
        // an unbuilt site looks like the land around it: forest, open ground, or a fenced industrial lot
        r(0, 0, f.w, f.h, f.type === 'wildlife' ? COL[T.FOREST] : f.type === 'coal' ? '#8F887C' : COL[T.GRASS]);
        if (f.type === 'park' || f.type === 'solar') for (let k = 0; k < 6; k++) r((k * 0.77) % (f.w - 0.4), (k * 1.29) % (f.h - 0.4), 0.4, 0.4, '#6E9450');
        if (f.type === 'wildlife') for (let k = 0; k < 10; k++) r((k * 0.61) % f.w, (k * 1.37) % f.h, 0.5, 0.5, '#244A2B');
        return;
      }
      if (st === 'building' || st === 'clearing') {
        r(0, 0, f.w, f.h, st === 'building' ? '#B8A574' : '#8A7F6E');
        for (let k = 0; k < f.w + f.h; k++) r(Math.min(k, f.w - 0.3), 0, 0.3, 0.3, k % 2 ? '#1A1A1A' : '#F2C230');
        if (st === 'building') { r(0.5, 0.6, 0.25, f.h - 1, '#F2C230'); r(0.5, 0.6, f.w - 1, 0.2, '#F2C230'); }
        else for (let k = 0; k < 8; k++) r(0.3 + (k * 0.73) % (f.w - 0.6), 0.5 + (k * 1.31) % (f.h - 0.8), 0.6, 0.4, '#6B6153');
        return;
      }
      if (f.type === 'coal') {
        r(0, 0, f.w, f.h, '#5E5A55'); r(0.5, 1.5, f.w - 1, f.h - 2, '#77716A');
        r(1, 0.3, 0.6, 1.4, '#8A847C'); r(2.4, 0.3, 0.6, 1.4, '#8A847C');
        if (night) r(0.6, f.h - 0.8, 0.3, 0.3, '#FFB347');
      } else if (f.type === 'solar') {
        r(0, 0, f.w, f.h, '#C9C1A3');
        for (let yy = 0.3; yy < f.h - 0.4; yy += 1) for (let xx = 0.3; xx < f.w - 0.4; xx += 1.4) r(xx, yy, 1.2, 0.7, '#22406A');
      } else if (f.type === 'wind') {
        r(0, 0, f.w, f.h, COL[T.GRASS]);
      } else if (f.type === 'park') {
        r(0, 0, f.w, f.h, '#5FA552'); r(1.2, 1.2, 1.6, 1.2, '#3E7FA8'); r(0, 1.8, f.w, 0.3, '#D9CFA8');
        for (let k = 0; k < 5; k++) r((k * 0.83) % (f.w - 0.6), (k * 1.17 + 0.2) % (f.h - 0.6), 0.6, 0.6, '#2F6E35');
      } else if (f.type === 'wildlife') {
        r(0, 0, f.w, f.h, '#2C6036');
        for (let k = 0; k < 14; k++) r((k * 0.61) % f.w, (k * 1.37) % f.h, 0.5, 0.5, '#1E4425');
        g.strokeStyle = '#D9CFA8'; g.lineWidth = Math.max(1, z * 0.08); g.strokeRect(x0 + 1, y0 + 1, w - 2, h - 2);
      }
    }
    function renderBase(state, light) {
      const g = bctx;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = COL[T.SEA]; g.fillRect(0, 0, cw, ch);
      const z = cam.z;
      const x0 = Math.max(0, Math.floor(cam.x - cw / 2 / z) - 1), x1 = Math.min(map.W, Math.ceil(cam.x + cw / 2 / z) + 1);
      const y0 = Math.max(0, Math.floor(cam.y - ch / 2 / z) - 1), y1 = Math.min(map.H, Math.ceil(cam.y + ch / 2 / z) + 1);
      const night = light < 0.5, dark = new Set(state.dark || []);
      const detail = z >= 7;
      const zz = Math.ceil(z) + 0.5;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = y * map.W + x, t = map.tiles[i];
        if (map.owner[i] >= 0) continue;
        const px = sx(x), py = sy(y);
        const v = h32(i);
        g.fillStyle = detail && (t >= T.HOUSE && t <= T.DOCK) ? shade(COL[t], 0.88 + v * 0.24) : COL[t];
        g.fillRect(px, py, zz, zz);
        if (!detail) continue;
        if (t >= T.HOUSE && t <= T.WAREHOUSE) {
          g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(px, py + z * 0.8, z, z * 0.2);
          if (t === T.HOUSE) { g.fillStyle = 'rgba(120,40,30,0.35)'; g.fillRect(px + z * 0.15, py + z * 0.15, z * 0.7, z * 0.35); }
        } else if (t === T.FOREST || t === T.PARK) {
          g.fillStyle = t === T.FOREST ? '#244A2B' : '#3F7A3A'; g.fillRect(px + z * (0.15 + v * 0.4), py + z * (0.2 + h32(i + 7) * 0.4), z * 0.4, z * 0.4);
        } else if ((t === T.ROAD || t === T.BRIDGE) && z >= 12) {
          g.fillStyle = 'rgba(240,220,120,0.5)'; g.fillRect(px + z * 0.47, py + z * 0.47, z * 0.06, z * 0.06);
        }
      }
      for (const f of map.features) {
        if (f.x + f.w < x0 || f.x > x1 || f.y + f.h < y0 || f.y > y1) continue;
        const site = f.kind === 'site' ? state.sites[f.siteIndex] : null;
        drawFeature(g, f, site, sx(f.x), sy(f.y), z, night);
      }
      // night falls: darken, then light the windows (except where the power is off)
      if (light < 1) {
        g.fillStyle = 'rgba(8,14,26,' + ((1 - light) * 0.68).toFixed(3) + ')';
        g.fillRect(0, 0, cw, ch);
      }
      if (night) {
        const ws = Math.max(1, z * 0.18);
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          const i = y * map.W + x, t = map.tiles[i], p = LIT[t];
          if (!p || dark.has(map.district[i])) continue;
          const v = h32(i * 3 + 1);
          if (v > p) continue;
          g.fillStyle = 'rgba(255,214,120,' + (0.55 + v) .toFixed(2) + ')';
          if (z < 6) g.fillRect(sx(x) + z * 0.3, sy(y) + z * 0.3, Math.max(1, z * 0.35), Math.max(1, z * 0.35));
          else { g.fillRect(sx(x) + z * 0.2, sy(y) + z * 0.25, ws, ws); if (h32(i + 99) < 0.6) g.fillRect(sx(x) + z * 0.6, sy(y) + z * 0.55, ws, ws); }
        }
        // street lights along main roads
        if (z >= 5) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          const i = y * map.W + x;
          if (map.tiles[i] !== T.ROAD || (x + y) % 3 || dark.has(map.district[i])) continue;
          g.fillStyle = 'rgba(255,236,170,0.55)'; g.fillRect(sx(x) + z * 0.45, sy(y) + z * 0.45, Math.max(1, z * 0.1), Math.max(1, z * 0.1));
        }
      }
      // districts in blackout get a cold tint, so you can see the outage from above
      if (dark.size) {
        g.fillStyle = 'rgba(10,20,40,0.35)';
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * map.W + x; if (dark.has(map.district[i])) g.fillRect(sx(x), sy(y), zz, zz); }
      }
      if (showDistricts && z < 26) {
        g.strokeStyle = night ? 'rgba(230,240,245,0.35)' : 'rgba(20,33,42,0.45)';
        g.lineWidth = 1.2;
        g.beginPath();
        for (const [ax, ay, bx, by] of borders) { if (ax < x0 || ax > x1 || ay < y0 || ay > y1) continue; g.moveTo(sx(ax), sy(ay)); g.lineTo(sx(bx), sy(by)); }
        g.stroke();
        if (z < 14) {
          g.textAlign = 'center';
          g.font = '700 ' + Math.max(11, Math.min(16, z * 2)) + 'px "Bricolage Grotesque", system-ui, sans-serif';
          for (const d of map.districts) {
            const lx = sx(d.cx + 0.5), ly = sy(d.cy + 0.5);
            if (lx < -60 || lx > cw + 60 || ly < -20 || ly > ch + 20) continue;
            g.lineWidth = 3; g.strokeStyle = 'rgba(14,23,28,0.7)'; g.strokeText(d.name, lx, ly);
            g.fillStyle = dark.has(d.id) ? '#9DB4D6' : '#F3F6F7'; g.fillText(d.name, lx, ly);
          }
        }
      }
      dirty = false;
    }

    // ---------------------------------------------------------------- the moving layer
    let lastNow = performance.now();
    function frame(state, light, x, t) {
      const now = performance.now(), dt = Math.min(0.1, (now - lastNow) / 1000);
      lastNow = now;
      if (dirty) renderBase(state, light);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(base, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const z = cam.z;
      const dark = new Set(state.dark || []);
      // wind turbines, chimney smoke and the race at the stadium
      for (const f of map.features) {
        const fx = sx(f.x), fy = sy(f.y);
        if (fx > cw || fy > ch || fx + f.w * z < 0 || fy + f.h * z < 0) continue;
        const site = f.kind === 'site' ? state.sites[f.siteIndex] : null;
        if (f.type === 'wind' && site && site.state === 'operating') {
          const spin = reduce ? 0 : (now / 1000) * (x.wind >= 100 ? 0 : Math.min(x.wind, 60)) * 0.12;
          for (let k = 0; k < 3; k++) {
            const cx = fx + f.w * z / 2, cy = fy + (0.8 + k * 2) * z;
            ctx.fillStyle = '#E9EEF0'; ctx.fillRect(cx - z * 0.06, cy, z * 0.12, z * 1.2);
            ctx.strokeStyle = '#F6F9FA'; ctx.lineWidth = Math.max(1, z * 0.08);
            ctx.beginPath();
            for (let b = 0; b < 3; b++) { const a = spin + k + b * 2.094; ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * z * 0.75, cy + Math.sin(a) * z * 0.75); }
            ctx.stroke();
          }
        } else if (f.type === 'coal' && site && site.state === 'operating' && !reduce) {
          const share = state.grid.coal / Math.max(1, state.ops.coal * C.MW.coal);
          for (let s = 0; s < 2; s++) for (let k = 0; k < 6; k++) {
            const p = ((now / 1400 + k / 6 + s * 0.37) % 1);
            const a = (1 - p) * 0.45 * share;
            if (a < 0.02) continue;
            const ex = (Math.sin(x.dir * Math.PI / 180) * -1) * p * z * 4 * (x.wind / 30);
            ctx.fillStyle = 'rgba(200,200,195,' + a.toFixed(3) + ')';
            const sz = z * (0.5 + p * 1.6);
            ctx.fillRect(fx + (1.3 + s * 1.4) * z + ex - sz / 2, fy + 0.3 * z - p * z * 3 - sz / 2, sz, sz);
          }
        } else if (f.type === 'stadium' && z >= 5) {
          const lap = (t / 86400000) % 1, lane = [0.4, 0.62];
          ctx.fillStyle = '#FF3B30'; ctx.fillRect(fx + (1.6 + lap * (f.w - 3.4)) * z, fy + f.h * lane[0] * z, Math.max(2, z * 0.25), Math.max(2, z * 0.25));
          ctx.fillStyle = '#23B5E8'; ctx.fillRect(fx + (1.6 + Math.max(0, lap - 0.004) * (f.w - 3.4)) * z, fy + f.h * lane[1] * z, Math.max(2, z * 0.25), Math.max(2, z * 0.25));
        }
      }
      // traffic: a few pixels driving the main roads, fewer at night
      const hour = (t % 86400000) / H, busy = [0.15, 0.1, 0.08, 0.08, 0.12, 0.3, 0.7, 1, 1, 0.8, 0.7, 0.7, 0.75, 0.7, 0.7, 0.8, 0.95, 1, 0.9, 0.7, 0.5, 0.4, 0.3, 0.2][Math.floor(hour)];
      const want = reduce ? 0 : Math.round(140 * busy * (1 - (state.levels['policy.trafficLimits'] || 0) * 0.15));
      while (cars.length < want) {
        const vertical = Math.random() < 0.5, line = vertical ? 6 + 13 * Math.floor(Math.random() * 10) : 4 + 11 * Math.floor(Math.random() * 10);
        cars.push({ vertical, line, p: Math.random() * (vertical ? map.H : map.W), v: (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 3), c: ['#E5484D', '#F2F2F2', '#F2C230', '#4DA3FF', '#2B2B2B'][Math.floor(Math.random() * 5)] });
      }
      if (cars.length > want) cars.length = want;
      const cs = Math.max(1.5, z * 0.3);
      for (const car of cars) {
        car.p += car.v * dt;
        const lim = car.vertical ? map.H : map.W;
        if (car.p < 0) car.p += lim; else if (car.p > lim) car.p -= lim;
        const tx = car.vertical ? car.line : Math.floor(car.p), ty = car.vertical ? Math.floor(car.p) : car.line;
        if (tx < 0 || ty < 0 || tx >= map.W || ty >= map.H) continue;
        const tt = map.tiles[ty * map.W + tx];
        if (tt !== T.ROAD && tt !== T.BRIDGE) continue;
        const px = car.vertical ? sx(car.line + (car.v > 0 ? 0.62 : 0.2)) : sx(car.p), py = car.vertical ? sy(car.p) : sy(car.line + (car.v > 0 ? 0.62 : 0.2));
        if (px < -5 || py < -5 || px > cw + 5 || py > ch + 5) continue;
        ctx.fillStyle = light < 0.5 ? (dark.has(map.district[ty * map.W + tx]) ? '#FFE9A0' : '#FFE9A0') : car.c;
        ctx.fillRect(px, py, cs, cs);
      }
      // weather: drifting cloud shadows, rain and smog
      if (x.cloud > 0.35 && !reduce) {
        const east = -Math.sin(x.dir * Math.PI / 180), north = Math.cos(x.dir * Math.PI / 180);
        const drift = (now / 1000) * x.wind * 0.02;
        ctx.fillStyle = 'rgba(10,20,30,' + ((x.cloud - 0.35) * 0.22).toFixed(3) + ')';
        for (let k = 0; k < 9; k++) {
          const wx = ((k * 37.7 + east * drift) % (map.W + 40) + map.W + 40) % (map.W + 40) - 20, wy = ((k * 23.3 - north * drift) % (map.H + 40) + map.H + 40) % (map.H + 40) - 20;
          ctx.fillRect(sx(wx), sy(wy), 22 * z, 12 * z);
        }
      }
      if (x.rain > 0 && !reduce) {
        ctx.fillStyle = x.snow ? 'rgba(240,245,250,0.8)' : 'rgba(170,200,230,0.5)';
        const n = Math.min(400, Math.round(x.rain * 90)), seed = Math.floor(now / 90);
        for (let k = 0; k < n; k++) { const a = h32(seed * 977 + k), b = h32(seed * 131 + k * 7); ctx.fillRect(a * cw, b * ch, 1, x.snow ? 2 : 6); }
      }
      if (state.aqi > 60) {
        ctx.fillStyle = 'rgba(150,120,80,' + Math.min(0.32, (state.aqi - 60) / 400).toFixed(3) + ')';
        ctx.fillRect(0, 0, cw, ch);
      }
      // selection
      const box = (f, c) => { ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.strokeRect(sx(f.x) - 1, sy(f.y) - 1, f.w * z + 2, f.h * z + 2); };
      if (hover) box(hover, 'rgba(255,255,255,0.7)');
      if (selected) box(selected, '#FFD25A');
    }

    // ---------------------------------------------------------------- interaction
    const pointers = new Map();
    let dragFrom = null, moved = 0, pinch = null;
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (pointers.size === 1) { dragFrom = { x: e.offsetX, y: e.offsetY, cx: cam.x, cy: cam.y }; moved = 0; }
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z }; }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        cam.z = pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d; clampCam(); dirty = true; moved = 99; return;
      }
      if (dragFrom && pointers.size === 1) {
        const dx = e.offsetX - dragFrom.x, dy = e.offsetY - dragFrom.y;
        moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
        cam.x = dragFrom.cx - dx / cam.z; cam.y = dragFrom.cy - dy / cam.z; clampCam(); dirty = true;
        canvas.style.cursor = 'grabbing';
        return;
      }
      const tile = tileAt(e.offsetX, e.offsetY);
      const f = featureAt(tile.x, tile.y);
      hover = f; canvas.style.cursor = f ? 'pointer' : 'grab';
    });
    const end = (e) => {
      const wasClick = pointers.size === 1 && moved < 5;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) {
        dragFrom = null; canvas.style.cursor = 'grab';
        if (wasClick && e.type === 'pointerup') select(tileAt(e.offsetX, e.offsetY));
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', () => { hover = null; });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
    canvas.addEventListener('dblclick', (e) => zoomAt(e.offsetX, e.offsetY, 2));
    canvas.addEventListener('keydown', (e) => {
      const step = 40 / cam.z;
      if (e.key === 'ArrowLeft') cam.x -= step; else if (e.key === 'ArrowRight') cam.x += step;
      else if (e.key === 'ArrowUp') cam.y -= step; else if (e.key === 'ArrowDown') cam.y += step;
      else if (e.key === '+' || e.key === '=') zoomAt(cw / 2, ch / 2, 1.4); else if (e.key === '-') zoomAt(cw / 2, ch / 2, 1 / 1.4);
      else return;
      e.preventDefault(); clampCam(); dirty = true;
    });
    function zoomAt(px, py, k) {
      const before = { x: (px - cw / 2) / cam.z + cam.x, y: (py - ch / 2) / cam.z + cam.y };
      cam.z *= k; clampCam();
      cam.x = before.x - (px - cw / 2) / cam.z; cam.y = before.y - (py - ch / 2) / cam.z; clampCam();
      dirty = true;
    }
    function featureAt(x, y) {
      if (x < 0 || y < 0 || x >= map.W || y >= map.H) return null;
      const o = map.owner[y * map.W + x];
      return o >= 0 ? map.features[o] : null;
    }
    function select(tile) {
      if (tile.x < 0 || tile.y < 0 || tile.x >= map.W || tile.y >= map.H) return;
      const i = tile.y * map.W + tile.x;
      selected = featureAt(tile.x, tile.y);
      if (opts.onSelect) opts.onSelect({ x: tile.x, y: tile.y, tile: map.tiles[i], district: map.district[i], feature: selected });
    }

    map.features.forEach((f) => { if (f.kind === 'site') f.siteIndex = map.features.filter((g) => g.kind === 'site' && g.id < f.id).length; });
    resize();
    window.addEventListener('resize', resize);
    world = true;
    return {
      frame, refresh: () => { dirty = true; },
      zoom: (k) => zoomAt(cw / 2, ch / 2, k), fit: () => { fit(); dirty = true; },
      focus: (x, y, z) => { cam.x = x; cam.y = y; if (z) cam.z = z; clampCam(); dirty = true; },
      toggleDistricts: () => { showDistricts = !showDistricts; dirty = true; return showDistricts; },
      destroy: () => window.removeEventListener('resize', resize),
      PARTY
    };
  };
})();
