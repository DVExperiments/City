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
  // the city's clock: UTC until the Renewal, City Standard Time (UTC+12) after it. Display times go through cityMs.
  const cityMs = (ms) => ms + (C.offsetAt ? C.offsetAt(ms) : 0);
  function light(t) {
    const dl = W.normals(t).dayLength, h = ((cityMs(t) % DAY) + DAY) % DAY / H, rise = 12 - dl / 2, set = 12 + dl / 2;
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
  const LOOK = window.CityLook;
  const tileName = (k) => (LOOK ? LOOK.tileName(k, C.TILE_NAMES[k]) : C.TILE_NAMES[k]);
  const blurb = (d) => (LOOK ? LOOK.theme(d.name, d.id).blurb : '');
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
        '<div class="live-body"><section><h2 id="selTitle">Select anything on the map</h2><div id="selection" class="muted">Drag to explore, scroll or pinch to zoom. Select a district, a building or a ship for details.</div></section>' +
        '<aside><h2>The grid right now</h2><div id="grid"></div><dl class="facts" id="gridfacts" style="grid-template-columns:1fr 1fr"></dl></aside></div>' +
        '<div class="two-col"><section><h2>City news</h2><ul class="timeline" id="news"></ul></section><section><h2>Being built</h2><ul class="timeline" id="building"></ul></section></div>';
    },
    mount() {
      if (now() < C.epoch) { document.getElementById('status').textContent = 'Pixel City\u2019s records begin on ' + fYear.format(C.epoch) + '.'; return null; }
      const map = C.map(now());
      let st = C.stateAt(now()), wx = W.sample(now());
      const view = window.CityMap(document.getElementById('citymap'), { onSelect: (sel) => showSelection(sel), time: now(), personHref: (id) => 'census.html' + AT + '#/resident/' + id });
      if (window.__cityFocus) { view.focus(window.__cityFocus[0] + 0.5, window.__cityFocus[1] + 0.5, 12); window.__cityFocus = null; }
      document.getElementById('zin').onclick = () => view.zoom(1.6);
      document.getElementById('zout').onclick = () => view.zoom(1 / 1.6);
      document.getElementById('zfit').onclick = () => view.fit();
      document.getElementById('zdist').onclick = (e) => e.target.setAttribute('aria-pressed', String(view.toggleDistricts()));
      let raf = 0;
      const loop = () => { view.frame(st, light(now()), wx, now()); raf = requestAnimationFrame(loop); };
      const set = (id, html) => { const el = document.getElementById(id); if (el && el.innerHTML !== html) el.innerHTML = html; };
      const cta = (href, text, internal) => '<p><a class="cta" href="' + (internal ? AT + '#/' + href : href) + '">' + text + ' <span aria-hidden="true">\u2192</span></a></p>';
      const fmtT = (ms) => fTime.format(cityMs(ms)) + (dayOf(cityMs(ms)) !== dayOf(cityMs(now())) ? ', ' + fShort.format(cityMs(ms)) : '');
      function districtCard(d) {
        const sens = senatorsFor(d.name), dk = monthStats(now());
        const parks = st.sites.filter((x) => x.type === 'park' && x.state === 'operating' && map.features[x.id].district === d.id).length;
        const here = map.features.filter((f) => f.district === d.id && (f.kind === 'landmark' || (st.sites[map.features.filter((g) => g.kind === 'site' && g.id < f.id).length] || {}).state === 'operating'));
        return '<p class="lede" style="font-size:1rem">A ' + character(d).toLowerCase() + ' district.</p>' + (blurb(d) ? '<p>' + esc(blurb(d)) + '</p>' : '') +
          '<dl class="facts" style="grid-template-columns:1fr 1fr 1fr">' + fact('Residents', d.residents.toLocaleString()) + fact('Jobs', d.jobs.toLocaleString()) +
          fact('Power', st.dark.indexOf(d.id) >= 0 ? '<span class="miss">Off</span>' : 'On') + fact('Blackouts', (dk[d.id] || 0) + ' h', 'last 30 days') + fact('Parks open', parks) + fact('Area', d.tiles + ' blocks') + '</dl>' +
          '<p style="margin-top:14px"><b>Senators:</b> ' + (sens.length ? sens.map(senLink).join(', ') : '<span class="muted">not yet elected</span>') + '</p>' +
          (here.length ? '<p><b>Here:</b> ' + here.map((f) => esc(f.name)).join(', ') + '</p>' : '') + cta('district/' + d.id, 'More about ' + esc(d.name), true);
      }
      function landmarkCard(f) {
        const t = now(), wxNow = W.sample(t);
        if (f.type === 'senate') {
          const ss = S.stateAt(t);
          const day = dayOf(t), sits = S.calendar.isSitting(day) && t < day + 23.5 * H && !S.calendar.adjourned(day);
          const line = !ss.started ? 'The founding election is on ' + fYear.format(Date.UTC(2026, 10, 28)) + '.' : ss.dissolved ? 'The Senate is dissolved until the snap election on ' + esc(ss.snapElection) + '.' :
            'Brightness ' + ss.composition.B + ', Verdant ' + ss.composition.V + ', Legacy Mode ' + ss.composition.L + (ss.composition.I ? ', independents ' + ss.composition.I : '') + '.' +
            (ss.majorityLeader ? ' Majority Leader: Senator ' + esc(ss.majorityLeader.name) + '.' : '') + (sits ? (t >= day + 19 * H ? ' The Senate is sitting now.' : ' Sits at ' + fTime.format(cityMs(day + 19 * H)) + ' city time.') : '');
          return '<p class="lede" style="font-size:1rem">Where the Pixel Senate sits. ' + line + '</p>' + cta(f.link, 'Visit the Senate');
        }
        if (f.type === 'stadium') {
          const gp = new Date(t).getUTCDate() <= 2;
          return '<p class="lede" style="font-size:1rem">Home of Glacial, the world\u2019s slowest race. ' + (gp ? 'It is Grand Prix weekend, and the stands are packed.' : 'Today\u2019s Daily Crawl started at ' + fTime.format(cityMs(dayOf(t))) + ' city time and will finish around the same time tomorrow.') +
            ' Conditions: ' + esc(wxNow.cond.toLowerCase()) + ', ' + Math.round(wxNow.temp) + '\u00b0C.</p>' + cta(f.link, 'Watch the race on Glacial');
        }
        if (f.type === 'bureau') {
          const fc = W.forecastAt(t), d0 = fc && fc.days.find((d) => d.day === dayOf(t));
          return '<p class="lede" style="font-size:1rem">The Weather Bureau keeps the city\u2019s records. Right now: ' + esc(wxNow.cond.toLowerCase()) + ', ' + wxNow.temp.toFixed(1) + '\u00b0C, wind ' + wxNow.wind + ' km/h ' + wxNow.compass + '.' +
            (d0 ? ' Today\u2019s forecast: ' + esc(d0.text) : '') + '</p>' + cta(f.link, 'Visit the Weather Bureau');
        }
        if (f.type === 'port') {
          const ships = st.ships.filter((x) => x.phase === 'berthed').length;
          return '<p class="lede" style="font-size:1rem">' + (ships ? ships + ' ship' + (ships === 1 ? ' is' : 's are') + ' alongside.' : 'The berths are empty for now.') + ' Coal, gas and containers come through here.</p>' + cta('port', 'See the arrivals board', true);
        }
        if (f.type === 'gas') return '<p class="lede" style="font-size:1rem">Two gas peakers, fired up when the city runs short. Output now: ' + Math.round(st.grid.gas) + ' MW of ' + C.MW.gas + '.</p>' + cta('power', 'See the power grid', true);
        if (f.type === 'bookmaker') return '<p class="lede" style="font-size:1rem">Odds on every race at the Glacial Stadium. City residents bet here, and their bets move the prices.</p>' + cta(f.link, 'See today\u2019s odds');
        if (f.type === 'press') return '<p class="lede" style="font-size:1rem">Where the Daily Pixel is written and printed. A new edition every day at 00:00 UTC.</p>' + cta(f.link, 'Read today\u2019s paper');
        if (f.type === 'museum') return '<p class="lede" style="font-size:1rem">The history of the Pixel Universe: its champions, its records, its laws, and an archive of every month since the first Daily Crawl.</p>' + cta(f.link, 'Visit the Museum');
        if (f.type === 'census') return '<p class="lede" style="font-size:1rem">The Census Office keeps a file on every resident of Pixel City: ' + st.residents.toLocaleString() + ' of them, by name.</p>' + cta(f.link, 'Visit the Census Office');
        if (f.type === 'radio') return '<p class="lede" style="font-size:1rem">Home of Pixel FM, 88.8. Music for pixels, and anyone near one, around the clock.</p>' + cta(f.link, 'Listen live');
        if (f.type === 'observatory') return '<p class="lede" style="font-size:1rem">From up here you can see the whole Pixel Universe at once: the race, the city, the Senate, the weather and the news.</p>' + cta(f.link, 'Look through the telescope');
        if (C.isPlanned ? C.isPlanned(f, t) : f.planned) return '<p class="lede" style="font-size:1rem">' + esc(f.name) + ' is coming soon. The ground has been cleared and the fence is up.</p>';
        if (f.type === 'jobs') {
          const L = window.PixelUniverse.labour, lm = L && L.ready() && t >= L.start ? L.labourAt(t) : null;
          return '<p class="lede" style="font-size:1rem">Where Pixel City looks for work. ' + (lm ? lm.looking.toLocaleString() + ' pixels are looking for work, and ' + lm.vacancies.length.toLocaleString() + ' employers are hiring. Unemployment: ' + lm.rate + '%.' : '') + '</p>' + cta(f.link, 'Visit the Job Centre');
        }
        if (f.type === 'school') {
          const sc = window.PixelUniverse.school, ss = sc && sc.ready() ? sc.stateAt(t) : null;
          return '<p class="lede" style="font-size:1rem">The city’s secondary school. ' + (ss && ss.started ? ss.roll.toLocaleString() + ' students in Years 9 to 13. ' + (ss.closed ? 'Closed today for the storm.' : ss.inSession ? 'Lessons are on.' : ss.term ? 'No lessons right now.' : 'The school is on holiday.') : 'Every resident in Years 9 to 13 is enrolled.') + '</p>' + cta(f.link, 'Visit Pixel High');
        }
        return '';
      }
      function showSelection(sel) {
        let title, html;
        if (sel.ship) {
          const sh = sel.ship;
          title = esc(sh.name);
          html = '<p class="lede" style="font-size:1rem">' + esc(sh.label) + ' from ' + esc(sh.from) + ', carrying ' + sh.cargo.toLocaleString() + ' ' + esc(sh.unit) + '. ' +
            (sh.phase === 'arriving' ? 'Coming in to berth ' + sh.berth + ', due alongside at ' + fmtT(sh.arrive) + '.' : sh.phase === 'berthed' ? 'Alongside at berth ' + sh.berth + ' since ' + fmtT(sh.arrive) + '; sails at ' + fmtT(sh.depart) + '.' : 'Heading out to sea.') +
            (sh.held >= 3 * H ? ' Held by the weather for ' + Math.round(sh.held / H) + ' hours.' : '') + '</p>' + cta('port', 'See the arrivals board', true);
          view.selectDistrict(-1);
        } else if (sel.feature) {
          const f = sel.feature;
          title = esc(f.name);
          if (f.kind === 'site') {
            const x = C.siteStateAt(f.id, now());
            const out = x.state === 'operating' && (f.type === 'solar' || f.type === 'wind' || f.type === 'coal') ? Math.round(st.grid[f.type] / Math.max(1, st.ops[f.type])) : null;
            html = '<p class="lede" style="font-size:1rem">' + KIND[f.type] + ' in ' + link('district/' + f.district, esc(map.districts[f.district].name)) + '. ' + STATE[x.state] +
              (x.state === 'building' ? ', due to open ' + fShort.format(x.done) : x.state === 'operating' && x.since > C.epoch ? ' since ' + fYear.format(x.since) : '') + '.' +
              (out !== null ? ' Generating ' + out + ' MW right now.' : '') + '</p>' +
              '<p class="muted">Built or closed by the Senate\u2019s ' + (f.type === 'coal' ? 'coal plant' : f.type === 'solar' ? 'solar subsidy' : f.type === 'wind' ? 'wind farm' : f.type === 'park' ? 'parks' : 'wildlife zone') + ' laws.</p>' +
              (f.type === 'park' || f.type === 'wildlife' ? '' : cta('power', 'See the power grid', true));
          } else html = landmarkCard(f);
        } else if (sel.district >= 0) {
          const d = map.districts[sel.district];
          title = esc(d.name);
          html = districtCard(d);
        } else { title = 'The blank margin'; html = '<p class="muted">Beyond the frame border, nothing has been drawn. Ships cross it on their way in and out of the port.</p>'; }
        set('selTitle', title);
        set('selection', html);
      }
      let n = 0;
      function tick() {
        const t = now();
        st = C.stateAt(t); wx = W.sample(t);
        n++;
        const g = st.grid;
        set('clock', 'City time ' + fSec.format(cityMs(t)));
        set('barleft', esc(wx.cond) + ', ' + wx.temp.toFixed(1) + '\u00b0C. Air: ' + esc(st.air) + ' (' + st.aqi + ')');
        set('kicker', 'Pixel City, ' + esc(fDate.format(cityMs(t))) + '. ' + st.residents.toLocaleString() + ' residents.');
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
      const t = now(), map = C.map(t), dark = monthStats(t), st = C.stateAt(t);
      const rows = map.districts.slice().sort((a, b) => b.residents - a.residents).map((d) => {
        const sens = senatorsFor(d.name);
        const parks = st.sites.filter((s) => s.type === 'park' && s.state === 'operating' && map.features[s.id].district === d.id).length;
        return '<tr>' + td(link('district/' + d.id, '<b>' + esc(d.name) + '</b>')) + td(character(d)) + td(d.residents.toLocaleString(), 1) + td(d.jobs.toLocaleString(), 1) + td(parks, 1) +
          td((dark[d.id] || 0) + ' h', 1) + '<td>' + (sens.length ? sens.map(senLink).join(', ') : '<span class="muted">Not yet elected</span>') + '</td></tr>';
      });
      return head('Districts', 'Sixteen districts, each electing three senators. Their character comes from the people who live there: industrial districts have render plants and foundries, green ones have colour growth. Each one also behaves like the pixel it is named after.') +
        table([{ l: 'District' }, { l: 'Character' }, { l: 'Residents', n: 1 }, { l: 'Jobs', n: 1 }, { l: 'Parks', n: 1 }, { l: 'Blackouts, last 30 days', n: 1 }, { l: 'Senators' }], rows);
    }
  };
  V.district = {
    title: 'District',
    render(id) {
      const map = C.map(now()), d = map.districts[+id];
      if (!d) return head('Unknown district', '');
      const t = now(), st = C.stateAt(t), dark = monthStats(t);
      const sens = senatorsFor(d.name);
      const uses = Object.keys(d.uses).map(Number).filter((k) => C.TILE_NAMES[k] && k !== 17 && k !== 18).sort((a, b) => d.uses[b] - d.uses[a]).slice(0, 7)
        .map((k) => '<tr>' + td(esc(tileName(k))) + td(Math.round(d.uses[k] / d.tiles * 100) + '%', 1) + '</tr>');
      const feats = map.features.filter((f) => f.district === d.id).map((f) => {
        const s = f.kind === 'site' ? C.siteStateAt(f.id, t) : null;
        return '<tr>' + td(esc(f.name)) + td(f.kind === 'site' ? KIND[f.type] : 'Landmark') + td(s ? STATE[s.state] : 'Open') + '</tr>';
      });
      const news = C.eventsBetween(t - 120 * DAY, t).filter((e) => (e.data.districts && e.data.districts.indexOf(d.id) >= 0) || (e.data.site !== undefined && map.features[e.data.site].district === d.id)).reverse().slice(0, 12)
        .map((e) => '<li><time>' + esc(fShort.format(e.ms)) + '</time><span>' + esc(e.headline) + '</span></li>').join('');
      return head(esc(d.name), character(d) + '. ' + d.residents.toLocaleString() + ' residents and ' + d.jobs.toLocaleString() + ' jobs.', 'District') +
        (blurb(d) ? '<p class="prose" style="max-width:40em">' + esc(blurb(d)) + '</p>' : '') +
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
      const t = now(), st = C.stateAt(t), map = C.map(t);
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

  // ================================================================ the port
  V.port = {
    title: 'Port',
    render() {
      const t = now(), d = dayOf(t);
      const status = (c) => (t < c.arrive - 2 * H ? (c.held >= 3 * H && t >= c.due ? '<span class="miss">Held by weather</span>' : 'Due') : t < c.arrive ? 'Coming in' : t <= c.depart ? '<b>Alongside</b>' : t <= c.depart + 2 * H ? 'Sailing' : 'Sailed');
      const row = (c) => '<tr>' + td('<b>' + esc(c.name) + '</b>') + td(esc(c.label)) + td(esc(c.from)) + td(c.cargo.toLocaleString() + ' ' + esc(c.unit)) +
        td(fTime.format(cityMs(c.arrive)) + (dayOf(c.arrive) !== d ? ' <small>' + esc(fShort.format(cityMs(c.arrive))) + '</small>' : '') + (c.held >= 3 * H ? ' <small>(+' + Math.round(c.held / H) + ' h)</small>' : '')) +
        td(fTime.format(cityMs(c.depart)) + (dayOf(c.depart) !== d ? ' <small>' + esc(fShort.format(cityMs(c.depart))) + '</small>' : '')) + td(String(c.berth)) + td(status(c)) + '</tr>';
      const board = C.portBetween(d - DAY, d + DAY - 1).filter((c) => c.depart + 2 * H >= t - 6 * H).sort((a, b) => a.arrive - b.arrive);
      const month = C.portBetween(t - 30 * DAY, t).filter((c) => c.arrive <= t);
      const tot = {};
      for (const c of month) { const o = (tot[c.type] = tot[c.type] || { n: 0, cargo: 0, held: 0 }); o.n++; o.cargo += c.cargo; if (c.held >= 6 * H) o.held++; }
      const T2 = C.SHIP_TYPES;
      const sums = Object.keys(T2).filter((k) => tot[k]).map((k) => '<tr>' + td(esc(T2[k].label)) + td(tot[k].n, 1) + td(tot[k].cargo.toLocaleString() + ' ' + esc(T2[k].unit), 1) + td(tot[k].held, 1) + '</tr>');
      const held = C.eventsBetween(t - 60 * DAY, t).filter((e) => e.type === 'port.held').reverse().slice(0, 8).map((e) => '<li><time>' + esc(fShort.format(e.ms)) + '</time><span>' + esc(e.headline) + '</span></li>').join('');
      return head('The Port', 'Container ships call every day and the harbour ferry crosses twice. Coal carriers come as often as the power plants need fuel, and gas tankers when the peakers have been working hard. Storms keep ships outside the harbour.') +
        '<h2>Arrivals and departures</h2><p class="hint">Yesterday, today and tomorrow, in city time.</p>' +
        table([{ l: 'Ship' }, { l: 'Type' }, { l: 'From' }, { l: 'Cargo' }, { l: 'Arrives' }, { l: 'Departs' }, { l: 'Berth' }, { l: 'Status' }], board.map(row)) +
        '<div class="two-col"><section><h2>The last 30 days</h2>' + table([{ l: 'Ships' }, { l: 'Calls', n: 1 }, { l: 'Cargo', n: 1 }, { l: 'Held by weather', n: 1 }], sums) + '</section>' +
        '<section><h2>Weather holds</h2><ul class="timeline">' + (held || '<li class="muted">No ship has been held in the last 60 days.</li>') + '</ul></section></div>' +
        '<p class="banner">Coming later: a freight page showing what the city imports and exports, and where its supplies come from.</p>';
    }
  };

  V.about = {
    title: 'About',
    render() {
      return head('About Pixel City', 'The hub of the Pixel Universe: home to the Glacial Stadium, the Senate House, the Weather Bureau and, soon, the Bookmaker and the newspaper.') +
        '<div class="prose"><p>Pixel City is computed in your browser from the date, like every part of the Pixel Universe. Nothing is stored, and every visitor sees the same city at the same moment.</p>' +
        '<p>The city follows the weather and the laws of the Pixel Senate. When the Senate commissions a wind farm, work begins the next day and the turbines start turning about a fortnight later. Retire coal too quickly, and on a calm winter evening the lights go out.</p>' +
        '<p>Every building, road and district was laid out once and will not move. What changes is what gets built on the reserved sites, the power on the grid, the traffic and the air.</p>' +
        '<p>The city is drawn as what it is: a place on a screen. The main roads are data buses and the streets are signal traces. The river is a data stream, the western forest is a noise field, and the gardens are colour growth. The coast is the frame border, and the sea beyond it is the blank margin, where nothing has been drawn. Each district behaves like the pixel it is named after: Dither is dithered, Moir\u00e9 has interference rings, and parts of Null Pointer refer to textures that do not exist.</p>' +
        '<p>All times are city time, which is UTC.</p></div>';
    }
  };

  // ---------------------------------------------------------------- routing
  const ROUTES = { '': 'map', districts: 'districts', district: 'district', power: 'power', port: 'port', about: 'about' };
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
    // keep the time-travel setting on the city's own pages; leave links to other sites alone
    document.querySelectorAll('.nav a, .brand').forEach((a) => {
      const href = a.getAttribute('href');
      if (/^https?:/.test(href)) return;
      const i = href.indexOf('#');
      a.setAttribute('href', (i < 0 ? href : href.slice(0, i)) + AT + (i < 0 ? '' : href.slice(i)));
    });
    const b = document.getElementById('travel');
    b.hidden = false;
    b.innerHTML = 'Watching the city from ' + esc(new Date(now()).toISOString().slice(0, 16).replace('T', ' ')) + ' city time onwards. <a href="' + location.pathname + location.hash + '">Return to the present</a>.';
  }
  window.addEventListener('hashchange', render);
  render();
})();
