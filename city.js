/* Pixel City's pages. Reads the city, the weather and the Senate; never changes them. Times are city time (UTC). */
(function () {
  const U = window.PixelUniverse || {};
  const C = U.city, W = U.climate, S = U.senate;
  const DAY = 86400000, H = 3600000, MIN = 60000;
  const main = document.getElementById('main');

  const q = new URLSearchParams(location.search);
  const at = q.get('at');
  const parsed = at ? Date.parse(at.length <= 16 ? at + ':00Z' : at) : NaN;
  const offset = isNaN(parsed) ? 0 : parsed - Date.now();
  const now = () => Date.now() + offset;
  const AT = isNaN(parsed) ? '' : '?at=' + encodeURIComponent(at);

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const dayOf = (ms) => ms - (ms % DAY);
  const utc = (o) => new Intl.DateTimeFormat(undefined, Object.assign({ timeZone: 'UTC' }, o));
  const fTime = utc({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), fSec = utc({ hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const fDate = utc({ weekday: 'long', day: 'numeric', month: 'long' }), fShort = utc({ day: 'numeric', month: 'short' }), fYear = utc({ day: 'numeric', month: 'short', year: 'numeric' });
  const link = (route, text) => '<a href="' + AT + '#/' + route + '">' + text + '</a>';
  const fact = (k, v, small) => '<div><dt>' + k + '</dt><dd>' + v + (small ? ' <small>' + small + '</small>' : '') + '</dd></div>';
  const head = (title, lede, kicker) => '<section class="page-head">' + (kicker ? '<p class="kicker">' + kicker + '</p>' : '') + '<h1>' + title + '</h1>' + (lede ? '<p class="lede">' + lede + '</p>' : '') + '</section>';
  const table = (cols, rows) => '<div class="table-wrap"><table class="data"><thead><tr>' + cols.map((c) => '<th' + (c.n ? ' class="n"' : '') + '>' + c.l + '</th>').join('') + '</tr></thead><tbody>' +
    (rows.length ? rows.join('') : '<tr><td class="muted" colspan="' + cols.length + '">Nothing yet.</td></tr>') + '</tbody></table></div>';
  const td = (v, n) => '<td' + (n ? ' class="n"' : '') + '>' + v + '</td>';
  const names = (list) => (list.length <= 2 ? list.join(' and ') : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1]);
  const SRC = { solar: ['Solar', '#F2B33D'], wind: ['Wind', '#7FB8E8'], coal: ['Coal', '#5E5A55'], link: ['National grid', '#9AA9B2'], gas: ['Gas', '#C77D4A'] };
  const KIND = { coal: 'Coal plant', solar: 'Solar farm', wind: 'Wind farm', park: 'Park', wildlife: 'Wildlife zone' };
  const STATE = { empty: 'Empty site', building: 'Under construction', operating: 'Open', clearing: 'Being cleared' };
  const SENATE_URL = 'https://dvexperiments.github.io/Senate/';
  function light(t) {
    const dl = W.normals(t).dayLength, h = (t % DAY) / H, rise = 12 - dl / 2, set = 12 + dl / 2;
    if (h < rise - 0.75 || h > set + 0.75) return 0;
    if (h < rise + 0.75) return (h - rise + 0.75) / 1.5;
    if (h > set - 0.75) return (set + 0.75 - h) / 1.5;
    return 1;
  }
  function mixBar(g) {
    const total = g.solar + g.wind + g.coal + g.link + g.gas || 1;
    return '<div class="compbar" style="height:18px">' + Object.keys(SRC).map((k) => g[k] > 0 ? '<i title="' + SRC[k][0] + '" style="width:' + (g[k] / total * 100) + '%;background:' + SRC[k][1] + '"></i>' : '').join('') + '</div>' +
      '<p class="legend">' + Object.keys(SRC).map((k) => '<span><span class="chip" style="--c:' + SRC[k][1] + '"></span>' + SRC[k][0] + ' ' + Math.round(g[k]) + ' MW</span>').join('') + '</p>';
  }
  function senatorsFor(name) {
    if (!S || !S.ready()) return [];
    const st = S.stateAt(now());
    return st.started ? (st.seats || []).filter((s) => s.district === name && s.senator).map((s) => s.senator) : [];
  }
  const PARTY = { B: ['Brightness', '#E8A33D'], V: ['Verdant', '#3FA66A'], L: ['Legacy Mode', '#8C9AA6'], I: ['Independent', '#B79AE0'] };
  const senLink = (p) => '<span class="px"><span class="chip" style="--c:' + PARTY[p.party][1] + '"></span><a href="' + SENATE_URL + '#/senator/' + p.id + '">' + esc(p.name) + '</a></span>';
  function character(d) {
    return (d.env < -0.2 ? 'Industrial' : d.env > 0.2 ? 'Green' : 'Mixed') + ', ' + (d.aes > 0.25 ? 'modern' : d.aes < -0.25 ? 'traditional' : 'unremarkable');
  }

  const V = {};
  // ================================================================ the map
  V.map = {
    title: '',
    render() {
      return '<section class="page-head" style="padding-bottom:14px"><p class="kicker" id="kicker">\u00a0</p><h1 class="status" id="status">\u00a0</h1></section>' +
        '<figure class="screen mapwrap"><canvas id="citymap" class="citymap" tabindex="0" aria-label="Map of Pixel City. Drag to move, scroll or pinch to zoom, select a building for details."></canvas>' +
        '<div class="mapctl"><button type="button" id="zin" aria-label="Zoom in">+</button><button type="button" id="zout" aria-label="Zoom out">\u2212</button><button type="button" id="zfit">Whole city</button><button type="button" id="zdist" aria-pressed="true">Districts</button></div>' +
        '<figcaption class="screen-bar"><span id="barleft"></span><span class="clock" id="clock"></span></figcaption></figure>' +
        '<div class="live-body"><section><h2 id="selTitle">Select anything on the map</h2><div id="selection" class="muted">Drag to explore, scroll or pinch to zoom, and select a building or district for details.</div></section>' +
        '<aside><h2>The grid right now</h2><div id="grid"></div><dl class="facts" id="gridfacts" style="grid-template-columns:1fr 1fr"></dl></aside></div>' +
        '<div class="two-col"><section><h2>City news</h2><ul class="timeline" id="news"></ul></section><section><h2>Being built</h2><ul class="timeline" id="building"></ul></section></div>';
    },
    mount() {
      if (now() < C.epoch) { document.getElementById('status').textContent = 'Pixel City\u2019s records begin on ' + fYear.format(C.epoch) + '.'; return null; }
      const map = C.map();
      let st = C.stateAt(now()), wx = W.sample(now());
      const view = window.CityMap(document.getElementById('citymap'), { onSelect: (sel) => showSelection(sel) });
      if (window.__cityFocus) { view.focus(window.__cityFocus[0] + 0.5, window.__cityFocus[1] + 0.5, 12); window.__cityFocus = null; }
      document.getElementById('zin').onclick = () => view.zoom(1.6);
      document.getElementById('zout').onclick = () => view.zoom(1 / 1.6);
      document.getElementById('zfit').onclick = () => view.fit();
      document.getElementById('zdist').onclick = (e) => e.target.setAttribute('aria-pressed', String(view.toggleDistricts()));
      let raf = 0;
      const loop = () => { view.frame(st, light(now()), wx, now()); raf = requestAnimationFrame(loop); };
      const set = (id, html) => { const el = document.getElementById(id); if (el && el.innerHTML !== html) el.innerHTML = html; };
      function showSelection(sel) {
        const f = sel.feature;
        let title, html;
        if (f) {
          title = esc(f.name);
          if (f.kind === 'site') {
            const s = C.siteStateAt(f.id, now());
            html = '<p class="lede" style="font-size:1rem">' + KIND[f.type] + ' in ' + link('district/' + f.district, esc(map.districts[f.district].name)) + '. ' + STATE[s.state] +
              (s.state === 'building' ? ', due to open ' + fShort.format(s.done) : s.state === 'operating' && s.since > C.epoch ? ' since ' + fYear.format(s.since) : '') + '.</p>' +
              '<p class="muted">Built or closed according to the Senate\u2019s ' + (f.type === 'coal' ? 'coal plant' : f.type === 'solar' ? 'solar subsidy' : f.type === 'wind' ? 'wind farm' : f.type === 'park' ? 'parks' : 'wildlife zone') + ' laws.</p>';
          } else {
            const notes = { senate: 'Where the Pixel Senate sits.', stadium: 'Home of Glacial, the world\u2019s slowest race. A race is always on.', bureau: 'The Weather Bureau keeps the city\u2019s weather records here.',
              bookmaker: 'Opening soon. Residents will bet on the races here.', press: 'Opening soon. The city\u2019s newspaper will be printed here.', gas: 'Two gas peakers, fired up when the city runs short.', port: 'Containers come and go.' };
            html = '<p class="lede" style="font-size:1rem">' + esc(notes[f.type] || '') + '</p>' + (f.link ? '<p><a href="' + f.link + '">Visit ' + esc(f.name) + '</a></p>' : '');
          }
        } else if (sel.district >= 0) {
          const d = map.districts[sel.district];
          title = esc(d.name);
          html = '<p class="lede" style="font-size:1rem">' + esc(C.TILE_NAMES[sel.tile]) + ' in ' + esc(d.name) + ', a ' + character(d).toLowerCase() + ' district of ' + d.residents.toLocaleString() + ' residents.</p>' +
            (st.dark.indexOf(d.id) >= 0 ? '<p class="miss">The power is off here right now.</p>' : '') + '<p>' + link('district/' + d.id, 'More about ' + esc(d.name)) + '</p>';
        } else { title = 'The sea'; html = '<p class="muted">Nothing here but water.</p>'; }
        set('selTitle', title);
        set('selection', html);
      }
      let n = 0;
      function tick() {
        const t = now();
        st = C.stateAt(t); wx = W.sample(t);
        if (n++ % 15 === 0) view.refresh();
        const g = st.grid;
        set('clock', 'City time ' + fSec.format(t));
        set('barleft', esc(wx.cond) + ', ' + wx.temp.toFixed(1) + '\u00b0C. Air: ' + esc(st.air) + ' (' + st.aqi + ')');
        set('kicker', 'Pixel City, ' + esc(fDate.format(t)) + '. ' + st.residents.toLocaleString() + ' residents.');
        const clean = g.demand ? Math.round((g.solar + g.wind) / (g.solar + g.wind + g.coal + g.link + g.gas || 1) * 100) : 0;
        set('status', st.dark.length ? 'Rolling blackouts in ' + esc(names(st.dark.map((i) => map.districts[i].name))) + ': the city needs ' + Math.round(g.shortfall) + ' MW more than it can supply.'
          : 'The lights are on. The grid is carrying ' + Math.round(g.demand) + ' MW, ' + clean + '% of it clean.');
        set('grid', mixBar(g));
        set('gridfacts', [fact('Demand', Math.round(g.demand) + ' MW'), fact('Spare capacity', Math.max(0, Math.round(g.capacity - g.demand)) + ' MW'),
          fact('Peak today', Math.round(st.today.peak) + ' MW'), fact('Blackout hours today', st.today.blackoutHours)].join(''));
        if (n % 30 === 1) {
          set('news', C.eventsBetween(t - 30 * DAY, t).filter((e) => e.importance >= 2).reverse().slice(0, 16).map((e) => '<li><time>' + esc(fShort.format(e.ms)) + '</time><span>' + esc(e.headline) + '</span></li>').join('') || '<li class="muted">A quiet month.</li>');
          const b = st.sites.filter((s) => s.state === 'building' || s.state === 'clearing');
          set('building', b.length ? b.map((s) => '<li><time>' + (s.state === 'building' ? 'Opens ' : 'Cleared ') + esc(fShort.format(s.done)) + '</time><span>' + esc(s.name) + '</span></li>').join('') : '<li class="muted">No construction under way.</li>');
        }
      }
      tick();
      const timer = setInterval(tick, 1000);
      raf = requestAnimationFrame(loop);
      document.getElementById('citymap').focus({ preventScroll: true });
      return () => { clearInterval(timer); cancelAnimationFrame(raf); view.destroy(); };
    }
  };

  // ================================================================ districts
  function monthStats(t) {
    const days = C.historyBetween(t - 30 * DAY, t), dark = {};
    for (const d of days) for (const k in d.dark) dark[k] = (dark[k] || 0) + d.dark[k];
    return dark;
  }
  V.districts = {
    title: 'Districts',
    render() {
      const map = C.map(), t = now(), dark = monthStats(t), st = C.stateAt(t);
      const rows = map.districts.slice().sort((a, b) => b.residents - a.residents).map((d) => {
        const sens = senatorsFor(d.name);
        const parks = st.sites.filter((s) => s.type === 'park' && s.state === 'operating' && map.features[s.id].district === d.id).length;
        return '<tr>' + td(link('district/' + d.id, '<b>' + esc(d.name) + '</b>')) + td(character(d)) + td(d.residents.toLocaleString(), 1) + td(d.jobs.toLocaleString(), 1) + td(parks, 1) +
          td((dark[d.id] || 0) + ' h', 1) + '<td>' + (sens.length ? sens.map(senLink).join(', ') : '<span class="muted">Not yet elected</span>') + '</td></tr>';
      });
      return head('Districts', 'Sixteen districts, each electing three senators. Their character comes from the people who live there: industrial districts have factories, green ones have gardens.') +
        table([{ l: 'District' }, { l: 'Character' }, { l: 'Residents', n: 1 }, { l: 'Jobs', n: 1 }, { l: 'Parks', n: 1 }, { l: 'Blackouts, last 30 days', n: 1 }, { l: 'Senators' }], rows);
    }
  };
  V.district = {
    title: 'District',
    render(id) {
      const map = C.map(), d = map.districts[+id];
      if (!d) return head('Unknown district', '');
      const t = now(), st = C.stateAt(t), dark = monthStats(t);
      const sens = senatorsFor(d.name);
      const uses = Object.keys(d.uses).map(Number).filter((k) => C.TILE_NAMES[k] && k !== 17 && k !== 18).sort((a, b) => d.uses[b] - d.uses[a]).slice(0, 7)
        .map((k) => '<tr>' + td(esc(C.TILE_NAMES[k])) + td(Math.round(d.uses[k] / d.tiles * 100) + '%', 1) + '</tr>');
      const feats = map.features.filter((f) => f.district === d.id).map((f) => {
        const s = f.kind === 'site' ? C.siteStateAt(f.id, t) : null;
        return '<tr>' + td(esc(f.name)) + td(f.kind === 'site' ? KIND[f.type] : 'Landmark') + td(s ? STATE[s.state] : 'Open') + '</tr>';
      });
      const news = C.eventsBetween(t - 120 * DAY, t).filter((e) => (e.data.districts && e.data.districts.indexOf(d.id) >= 0) || (e.data.site !== undefined && map.features[e.data.site].district === d.id)).reverse().slice(0, 12)
        .map((e) => '<li><time>' + esc(fShort.format(e.ms)) + '</time><span>' + esc(e.headline) + '</span></li>').join('');
      return head(esc(d.name), character(d) + '. ' + d.residents.toLocaleString() + ' residents and ' + d.jobs.toLocaleString() + ' jobs.', 'District') +
        '<dl class="facts">' + fact('Residents', d.residents.toLocaleString()) + fact('Jobs', d.jobs.toLocaleString()) + fact('Area', d.tiles + ' blocks') +
        fact('Power now', st.dark.indexOf(d.id) >= 0 ? '<span class="miss">Off</span>' : 'On') + fact('Blackouts, last 30 days', (dark[d.id] || 0) + ' h') +
        fact('Senators', sens.length ? sens.map(senLink).join('<br>') : 'Not yet elected') + '</dl>' +
        '<p><a href="' + AT + '#/" data-focus="' + d.cx + ',' + d.cy + '">See ' + esc(d.name) + ' on the map</a></p>' +
        '<div class="two-col"><section><h2>Land use</h2>' + table([{ l: 'Use' }, { l: 'Share', n: 1 }], uses) + '</section><section><h2>Landmarks and sites</h2>' +
        table([{ l: 'Name' }, { l: 'Kind' }, { l: 'Status' }], feats) + '</section></div>' +
        '<h2>Recent news</h2><ul class="timeline">' + (news || '<li class="muted">Nothing of note.</li>') + '</ul>';
    },
    mount(id) {
      const a = document.querySelector('[data-focus]');
      if (a) a.addEventListener('click', () => { window.__cityFocus = a.dataset.focus.split(',').map(Number); });
      return null;
    }
  };

  // ================================================================ power
  V.power = {
    title: 'Power',
    render() {
      const t = now(), st = C.stateAt(t), map = C.map();
      const days = C.historyBetween(t - 60 * DAY, t);
      const W2 = 960, Hh = 220, P = 30, n = days.length;
      let chart = '';
      if (n > 1) {
        const max = Math.max(...days.map((d) => d.energy.solar + d.energy.wind + d.energy.coal + d.energy.link + d.energy.gas));
        const bw = (W2 - P) / n;
        chart = '<svg viewBox="0 0 ' + W2 + ' ' + Hh + '" role="img" aria-label="Where the city\u2019s power came from, day by day">';
        days.forEach((d, i) => {
          let y = Hh - 20;
          for (const k of ['coal', 'gas', 'link', 'wind', 'solar']) {
            const h = d.energy[k] / max * (Hh - 40);
            if (h > 0) chart += '<rect x="' + (P + i * bw).toFixed(1) + '" y="' + (y - h).toFixed(1) + '" width="' + (bw - 1).toFixed(1) + '" height="' + h.toFixed(1) + '" fill="' + SRC[k][1] + '"/>';
            y -= h;
          }
          if (d.blackoutHours) chart += '<rect x="' + (P + i * bw).toFixed(1) + '" y="4" width="' + (bw - 1).toFixed(1) + '" height="8" fill="#E5484D"/>';
        });
        chart += '<text x="' + P + '" y="' + (Hh - 4) + '" font-size="11" fill="currentColor" opacity="0.6">' + esc(fShort.format(days[0].day)) + '</text><text x="' + W2 + '" y="' + (Hh - 4) + '" font-size="11" text-anchor="end" fill="currentColor" opacity="0.6">' + esc(fShort.format(days[n - 1].day)) + '</text></svg>';
      }
      const plants = st.sites.filter((s) => s.type === 'coal' || s.type === 'solar' || s.type === 'wind').map((s) => '<tr>' + td(esc(s.name)) + td(KIND[s.type]) + td(STATE[s.state]) +
        td(s.state === 'operating' ? C.MW[s.type] + ' MW' : '\u2013', 1) + '</tr>');
      const year = C.historyBetween(t - 365 * DAY, t);
      const bh = year.reduce((a, d) => a + d.blackoutHours, 0);
      const clean = year.length ? year.reduce((a, d) => a + d.clean, 0) / year.length : 0;
      return head('Power', 'Pixel City burns coal, catches sun and wind, imports from the national grid and, when all else fails, fires up its gas peakers. The Senate decides what gets built. The weather decides how much it makes.') +
        '<h2>Right now</h2>' + mixBar(st.grid) + '<dl class="facts">' + fact('Demand', Math.round(st.grid.demand) + ' MW') + fact('Capacity', Math.round(st.grid.capacity) + ' MW') +
        fact('Clean energy, last year', clean.toFixed(0) + '%') + fact('Blackout hours, last year', bh) + fact('Air quality', st.aqi, esc(st.air)) + fact('Emissions cap', 'Level ' + st.levels['policy.emissionsCap']) + '</dl>' +
        '<h2>The last 60 days</h2><p class="hint">Energy by source each day. Red marks days with blackouts.</p><figure class="chart" style="margin:0">' + chart + '</figure>' +
        '<h2>Generators</h2>' + table([{ l: 'Name' }, { l: 'Kind' }, { l: 'Status' }, { l: 'Capacity', n: 1 }], plants.concat(['<tr><td>Harbour Gas Station</td><td>Gas peakers</td><td>Open</td><td class="n">' + C.MW.gas + ' MW</td></tr>',
          '<tr><td>National grid link</td><td>Interconnector</td><td>Open</td><td class="n">' + C.MW.link + ' MW</td></tr>']));
    }
  };

  V.about = {
    title: 'About',
    render() {
      return head('About Pixel City', 'The hub of the Pixel Universe: home to the Glacial Stadium, the Senate House, the Weather Bureau and, soon, the Bookmaker and the newspaper.') +
        '<div class="prose"><p>Pixel City is computed in your browser from the date, like every part of the Pixel Universe. Nothing is stored, and every visitor sees the same city at the same moment.</p>' +
        '<p>The city follows the weather and the laws of the Pixel Senate. When the Senate commissions a wind farm, work begins the next day and the turbines start turning about a fortnight later. Retire coal too quickly, and on a calm winter evening the lights go out.</p>' +
        '<p>Every building, road and district was laid out once and will not move. What changes is what gets built on the reserved sites, the power on the grid, the traffic and the air.</p>' +
        '<p>All times are city time, which is UTC.</p></div>';
    }
  };

  // ---------------------------------------------------------------- routing
  const ROUTES = { '': 'map', districts: 'districts', district: 'district', power: 'power', about: 'about' };
  const NAV = { district: 'districts' };
  let unmount = null;
  function render() {
    if (unmount) { unmount(); unmount = null; }
    if (!C || !C.ready()) {
      main.innerHTML = head('The city is dark', 'Pixel City needs the Weather Bureau and the Senate to know what has happened, and one of them could not be reached. Please try again shortly.');
      return;
    }
    const h = location.hash.replace(/^#\/?/, '');
    const [name, arg] = h.split('/');
    const key = ROUTES[name || ''] || 'map', view = V[key];
    main.innerHTML = view.render(arg);
    document.title = (view.title ? view.title + ' \u2013 ' : '') + 'Pixel City';
    document.querySelectorAll('.nav a').forEach((a) => (a.dataset.view === (NAV[key] || key) ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    if (view.mount) unmount = view.mount(arg) || null;
    window.scrollTo(0, 0);
  }
  if (AT) {
    document.querySelectorAll('.nav a, .brand').forEach((a) => (a.href = AT + a.getAttribute('href')));
    const b = document.getElementById('travel');
    b.hidden = false;
    b.innerHTML = 'Watching the city from ' + esc(new Date(now()).toISOString().slice(0, 16).replace('T', ' ')) + ' city time onwards. <a href="' + location.pathname + location.hash + '">Return to the present</a>.';
  }
  window.addEventListener('hashchange', render);
  render();
})();
