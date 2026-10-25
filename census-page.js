/*
 * The Census Office's public rooms. Rendering only: reads PixelUniverse.census. Uses city.css, so it looks like
 * the rest of Pixel City. Supports ?at=YYYY-MM-DDTHH:MM like the city's own pages.
 *
 * Routes: #/  ·  #/district/<id>[/<page>]  ·  #/resident/<id>  ·  #/search/<name>
 */
(function () {
  'use strict';
  const U = window.PixelUniverse || {};
  const K = U.census, C = U.city;
  const main = document.getElementById('main');
  const DAY = 86400000;
  const q = new URLSearchParams(location.search);
  const at = q.get('at');
  const parsed = at ? Date.parse(at.length <= 16 ? at + ':00Z' : at) : NaN;
  const offset = isNaN(parsed) ? 0 : parsed - Date.now();
  const now = () => Date.now() + offset;
  const AT = isNaN(parsed) ? '' : '?at=' + encodeURIComponent(at);

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const link = (route, text) => '<a href="' + AT + '#/' + route + '">' + text + '</a>';
  const num = (n) => n.toLocaleString('en');
  const fYear = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
  const fShort = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', day: 'numeric', month: 'short' });
  const fact = (k, v, small) => '<div><dt>' + k + '</dt><dd>' + v + (small ? ' <small>' + small + '</small>' : '') + '</dd></div>';
  const head = (title, lede, kicker) => '<section class="page-head">' + (kicker ? '<p class="kicker">' + kicker + '</p>' : '') + '<h1>' + title + '</h1>' + (lede ? '<p class="lede">' + lede + '</p>' : '') + '</section>';
  const PARTY = { B: ['Brightness', '#E8A33D'], V: ['Verdant', '#3FA66A'], L: ['Legacy Mode', '#8C9AA6'], undecided: ['Undecided', '#C3CED3'] };
  const MOOD = { content: 'var(--content)', uneasy: 'var(--uneasy)', unhappy: 'var(--unhappy)' };
  const ROLE = { adult: 'Adult', child: 'Child', flatmate: 'Flatmate', grandparent: 'Grandparent' };
  const HOUSEHOLD = { single: 'Lives alone', couple: 'Lives with a partner', 'parent and child': 'A parent with a child', flatmates: 'Shares with flatmates', family: 'A family home' };
  const searchForm = (value) => '<form class="census-search" id="census-search" role="search"><label class="skip" for="census-q">Find a resident</label><input id="census-q" name="q" type="search" placeholder="Find a resident by name" value="' + esc(value || '') + '" autocomplete="off"><button type="submit">Find</button></form>';

  const tile = (p) => '<li><a class="tile" href="' + AT + '#/resident/' + p.id + '"><span class="swatch" style="--c:' + p.color + ';--d:-' + ((p.id.length * 37) % 9) / 10 + 's"><i></i></span>' +
    '<span class="tile-name">' + esc(p.name) + '</span><span class="tile-meta">' + p.age + ', ' + esc(p.districtName) + '</span></a></li>';
  const compbar = (parts) => '<div class="compbar" role="img" aria-label="' + parts.map((x) => x[0] + ' ' + x[1] + '%').join(', ') + '">' + parts.map((x) => '<i style="width:' + x[1] + '%;background:' + x[2] + '" title="' + x[0] + ' ' + x[1] + '%"></i>').join('') + '</div>';
  const key = (parts) => '<p class="key">' + parts.map((x) => '<span style="--c:' + x[2] + '">' + x[0] + ' ' + x[1] + '%</span>').join('') + '</p>';
  const rowBar = (label, pct, color) => '<div class="trait"><dt>' + label + '</dt><dd><span class="bar" style="--v:' + pct / 100 + ';--c:' + color + '"></span></dd><span class="pct">' + pct + '%</span></div>';

  // ---------------------------------------------------------------- overview
  function moodLine(p) {
    const top = p.concerns.filter((c) => c.key !== 'none')[0];
    const lead = p.mood.content >= 60 ? 'Most are content' : p.mood.unhappy >= 25 ? 'A good many are unhappy' : p.mood.content >= 40 ? 'They are split between content and uneasy' : 'Most are uneasy';
    return lead + (top ? '. Their biggest complaint this week is ' + esc(top.label.toLowerCase()) + '.' : ', and they have no particular complaint.');
  }
  function trendSvg(panels) {
    const W = 900, H = 200, L = 34, B = 26, T = 10, n = panels.length;
    if (n < 2) return '';
    const X = (i) => L + (i / (n - 1)) * (W - L - 10), Y = (v) => T + (1 - v / 100) * (H - T - B);
    let grid = '';
    for (const v of [0, 25, 50, 75, 100]) grid += '<line class="grid" x1="' + L + '" x2="' + (W - 10) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text x="0" y="' + (Y(v) + 4) + '">' + v + '%</text>';
    const months = [];
    panels.forEach((p, i) => { if (p.date.slice(8) <= '07') months.push('<text x="' + (X(i) - 10) + '" y="' + (H - 6) + '">' + fShort.format(Date.parse(p.date)).replace(/^\d+\s/, '') + '</text>'); });
    const path = (k) => panels.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.mood[k]).toFixed(1)).join('');
    return '<svg class="trend" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Share of content and unhappy pixels each week since the city began">' + grid + months.join('') +
      '<path class="line sad" d="' + path('unhappy') + '"/><path class="line" d="' + path('content') + '"/></svg>';
  }
  function overview() {
    const t = now(), st = K.stateAt(t);
    if (!st.started) return head('The census has not begun', 'Pixel City has no residents yet.', 'The Census Office');
    const p = st.panel, map = C.map();
    const f = K.person(st.residentOfTheDay, t);
    let h = head(num(st.population) + ' pixels live in Pixel City.', moodLine(p) + ' The Census Office knows every one of them by name.', 'The Census Office');
    h = h.replace('</section>', searchForm() + '</section>');

    // resident of the day
    h += '<h2>Resident of the day</h2><div class="featured">' + profileHead(f, true) + '</div>';

    // the panel
    const moods = [['Content', p.mood.content, MOOD.content], ['Uneasy', p.mood.uneasy, MOOD.uneasy], ['Unhappy', p.mood.unhappy, MOOD.unhappy]];
    const leans = ['B', 'V', 'L', 'undecided'].map((k) => [PARTY[k][0], p.leans[k], PARTY[k][1]]);
    h += '<h2>This week’s citizens’ panel</h2><p class="hint">' + num(p.size) + ' adult residents, chosen at random, asked on ' + fYear.format(p.published) + '. A new panel every Monday.</p>';
    h += '<div class="panel-grid"><div><h3 class="strong">How they feel</h3>' + compbar(moods) + key(moods) +
      '<h3 class="strong">What bothers them most</h3><dl class="rows">' + p.concerns.slice(0, 5).map((c) => rowBar(esc(c.label), c.pct, c.key === 'none' ? 'var(--muted)' : 'var(--ink)')).join('') + '</dl></div>' +
      '<div><h3 class="strong">Which way they lean</h3>' + compbar(leans) + key(leans) +
      '<h3 class="strong">Their favourite Glacial pixels</h3><dl class="rows">' + p.favourites.map((x) => rowBar(esc(x.name), x.pct, 'var(--link)')).join('') + '</dl></div></div>';
    if (p.voices.length) h += '<h2>Overheard</h2><ul class="voices">' + p.voices.map((v) => '<li><blockquote>' + esc(v.quote) + '</blockquote><cite>' + link('resident/' + v.id, esc(v.name)) + ', ' + v.age + ', ' + esc(v.districtName) + '</cite></li>').join('') + '</ul>';

    // the mood over time
    const panels = K.panelsBetween(K.epoch, t);
    h += '<h2>The city’s mood since it began</h2><p class="hint">Share of the panel content (green) and unhappy (red), week by week.</p>' + trendSvg(panels);

    // districts
    const byId = {};
    p.districts.forEach((d) => (byId[d.id] = d));
    const rows = st.districts.slice().sort((a, b) => b.residents - a.residents).map((d) => {
      const pd = byId[d.id];
      return '<tr><td>' + link('district/' + d.id, '<b>' + esc(d.name) + '</b>') + '</td><td class="n">' + num(d.residents) + '</td><td class="n">' + num(d.homes) + '</td><td class="n">' + d.medianAge + '</td><td class="n">' + num(d.children) + '</td><td class="n">' + num(d.over65) + '</td>' +
        '<td class="n">' + (pd && pd.happiness !== null ? Math.round(pd.happiness * 100) + '%' : '') + '</td><td>' + (pd && pd.topLabel ? esc(pd.topLabel) : '') + '</td></tr>';
    });
    h += '<h2>The districts</h2><div class="table-wrap"><table class="data"><thead><tr><th>District</th><th class="n">Residents</th><th class="n">Homes</th><th class="n">Median age</th><th class="n">Under 18</th><th class="n">65 and over</th><th class="n">Happiness</th><th>Top complaint</th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';

    // the life cycle: the newest pixels, and those who have gone dark
    if (t >= K.lifeStart) {
      const life = K.recentLife(t, 14);
      const row = (id, verb) => { const x = K.person(id, t); return '<li>' + link('resident/' + id, esc(x.name)) + ' ' + verb + '<small class="muted">' + esc(x.districtName) + ', ' + fShort.format(verb === 'went dark' ? x.dark : x.birth) + (verb === 'went dark' ? ', aged ' + Math.floor((x.dark - x.birth) / 31557600000) : '') + '</small></li>'; };
      h += '<div class="two-col"><div><h2>New pixels</h2><p class="hint">Lit in the last two weeks: ' + life.lit.length + '.</p><ul class="list-plain">' + (life.lit.slice(0, 8).map((id) => row(id, 'was lit')).join('') || '<li class="muted">None in the last fortnight.</li>') + '</ul></div>' +
        '<div><h2>Gone dark</h2><p class="hint">In the last two weeks: ' + life.dark.length + '.</p><ul class="list-plain">' + (life.dark.slice(0, 8).map((id) => row(id, 'went dark')).join('') || '<li class="muted">Nobody, this fortnight.</li>') + '</ul></div></div>';
    }
    // ages
    const max = Math.max.apply(null, st.ageBands);
    h += '<div class="two-col"><div><h2>Ages</h2><p class="hint">Median age ' + st.medianAge + '. The oldest resident is ' + st.oldest + '.</p><div class="ages" role="img" aria-label="Residents by age, in decades">' +
      st.ageBands.map((v) => '<div style="height:' + (v / max) * 100 + '%" title="' + num(v) + '"></div>').join('') + '</div><div class="age-labels">' + ['0s', '10s', '20s', '30s', '40s', '50s', '60s', '70s', '80s', '90+'].map((x) => '<span>' + x + '</span>').join('') + '</div></div>';
    // recent arrivals
    const moves = K.movesBetween(t - 3 * DAY, t).slice(-8).reverse();
    h += '<div><h2>New arrivals</h2><ul class="list-plain">' + (moves.length ? moves.map((mv) => {
      const hh = K.householdAt(mv[1], mv[0] + 1), first = K.summary(hh.members[0].id, t);
      const nm = hh.members.length === 1 ? link('resident/' + first.id, esc(first.name)) : 'The ' + link('resident/' + first.id, esc(hh.surname)) + ' household';
      return '<li>' + nm + ' moved into ' + esc(first.address) + '<small class="muted">' + esc(first.districtName) + ', ' + fShort.format(mv[0]) + '</small></li>';
    }).join('') : '<li class="muted">Nobody has moved in the last three days.</li>') + '</ul></div></div>';
    return h;
  }

  // ---------------------------------------------------------------- a resident
  function profileHead(p, compact) {
    const hh = p.householdMembers.filter((m) => m.id !== p.id && m.born);
    const living = p.present ? (p.householdKind === 'single' ? 'lives alone' : 'lives with ' + (hh.length === 1 ? '1 other' : hh.length + ' others')) : 'used to live';
    const lede = p.age + ', ' + living + ' in ' + (p.homeKind === 'house' ? 'a house' : p.homeKind === 'apartment' ? 'a flat' : 'a flat above a shop') + ' in ' + esc(p.districtName) + ' district.';
    const name = compact ? link('resident/' + p.id, esc(p.name)) : esc(p.name);
    let h = '<div class="profile-head"><div class="big-swatch' + (p.present ? '' : ' gone') + '" style="--c:' + p.color + '"><i></i></div><div><h1>' + name + '</h1><p class="lede">' + lede + '</p>';
    if (p.thinks) h += '<p class="says">' + esc(p.thinks.quote) + '</p>';
    return h + '</div></div>';
  }
  function resident(id) {
    const t = now(), p = K.person(id, t);
    if (!p) return head('No such resident', 'The Census Office has no file under that number. ' + link('', 'Back to the census') + '.');
    document.title = p.name + ' – Census – Pixel City';
    let h = profileHead(p);
    if (!p.born) h += '<p class="banner">Not yet lit.</p>';
    else if (p.goneDark) h += '<p class="banner">' + esc(p.name) + ' went dark on ' + fYear.format(p.dark) + ', aged ' + Math.floor((p.dark - p.birth) / 31557600000) + '. The Census Office keeps the file.</p>';
    else if (!p.present) h += '<p class="banner">' + esc(p.name) + ' and their household left Pixel City on ' + fYear.format(p.movesOut) + '. The Census Office keeps the file.</p>';
    if (p.expecting && p.present) h += '<p class="banner">The household is expecting a new pixel.</p>';
    h += '<dl class="facts">' + fact('Age', p.age) + fact('Birthday', esc(p.birthday)) + fact('Address', esc(p.address)) +
      fact(p.lit ? 'Lit on' : 'Living here since', p.lit ? fYear.format(p.birth) : p.sinceFounding ? 'The city’s founding' : fYear.format(p.movedIn)) + fact('Household', HOUSEHOLD[p.householdKind]) + fact('Stage of life', esc(p.stage)) + '</dl>';
    h += '<div class="profile-grid"><div><h2>Character</h2><dl>' + K.TRAITS.map(([k, label, lo, hi]) => '<div class="trait"><dt>' + label + '</dt><dd><span class="bar" style="--v:' + p.traits[k] + ';--c:' + p.color + '"></span></dd></div>' +
      '<p class="axis-labels"><span>' + lo + '</span><span>' + hi + '</span></p>').join('') + '</dl>' +
      '<h2>Hopes and habits</h2><dl class="facts" style="grid-template-columns:1fr">' + fact('Hopes', esc(p.hope)) + fact('Dream job', esc(p.dreamJob.charAt(0).toUpperCase() + p.dreamJob.slice(1))) +
      fact('Spends free time', esc(p.hobbies[0].charAt(0).toUpperCase() + p.hobbies[0].slice(1)) + ', and ' + esc(p.hobbies[1])) + fact('Favourite Glacial pixel', '<a href="https://dvexperiments.github.io/Glacial/#pixel/' + p.favourite + '">' + esc(p.favouriteName) + '</a>') + fact('Known for', esc(p.quirk)) + '</dl></div>';
    h += '<div>';
    if (p.thinks) {
      const o = p.thinks;
      h += '<h2>What ' + esc(p.first) + ' thinks</h2><dl class="facts" style="grid-template-columns:1fr 1fr">' + fact('Mood', '<span class="mood ' + o.mood + '">' + o.mood.charAt(0).toUpperCase() + o.mood.slice(1) + '</span>') +
        fact('Happiness', Math.round(o.happiness * 100) + '%') + fact('Worried about', o.concerns.length ? esc(o.concerns.map((c, i) => (i ? K.CONCERNS[c].toLowerCase() : K.CONCERNS[c])).join(', ')) : 'Nothing much') +
        (o.lean ? fact('Leans', '<span class="px"><span class="chip" style="--c:' + PARTY[o.lean][1] + '"></span>' + PARTY[o.lean][0] + '</span>') : fact('Leans', '<span class="muted">Too young to vote</span>')) + '</dl>';
    } else if (p.present) h += '<h2>What ' + esc(p.first) + ' thinks</h2><p class="muted">Too young to be asked.</p>';
    if (p.work) {
      const w = p.work, JC = 'https://dvexperiments.github.io/JobCentre/' + AT + '#/worker/' + p.id;
      const now = w.status === 'employed' ? 'Works as a ' + esc(w.title) + ' at ' + esc(w.employerName) + (w.dream ? ', their dream job' : '') : w.status === 'looking' ? 'Looking for work since ' + fYear.format(w.from) : w.status === 'retired' ? 'Retired' : esc(w.reason || 'Not working');
      h += '<h2>Work</h2><p>' + now + '.' + (w.status === 'employed' ? ' ' + w.wage.toLocaleString('en') + ' W a week.' : '') + ' <a href="' + JC + '">Their Job Centre record</a></p>';
    }
    // basic needs, and any student loan (from 1 September 2027)
    { const LB = window.PixelUniverse && window.PixelUniverse.labour;
      const wb = LB && LB.wellbeingOf && p.present ? LB.wellbeingOf(p.id, t) : null, loan = LB && LB.loanOf ? LB.loanOf(p.id, t) : null;
      if (wb) {
        const bar = (k, label) => '<div><dt>' + label + '</dt><dd>' + Math.round(wb[k] * 100) + '<small> of 100</small></dd></div>';
        h += '<h2>How life is going</h2><dl class="facts">' + bar('wellbeing', 'Wellbeing') + bar('housing', 'Housing') + bar('charge', 'Charge') + bar('health', 'Health') + bar('security', 'Security') + bar('leisure', 'Leisure') + '</dl>' +
          '<p class="hint">Their district\u2019s needs (Pixel City Society), adjusted for their own pay, work, age and debts. A pixel who is unhappy at work may leave, and may retrain.</p>';
      }
      const mort = LB && LB.mortgageOf ? LB.mortgageOf(p.id) : null;
      if (mort && t >= mort.from) h += '<p>Mortgage on their home: ' + mort.amount.toLocaleString('en') + ' W at ' + mort.rate + '% from the Bank of Pixel City, until ' + fYear.format(mort.until) + '.</p>';
      if (loan) h += '<p>Student loan: ' + loan.amount.toLocaleString('en') + ' W at ' + loan.rate + '%, repaid from ' + fYear.format(loan.from) + ' to ' + fYear.format(loan.until) + '. <a href="https://dvexperiments.github.io/Bank/' + AT + '">The Bank</a></p>';
    }
    h += '<h2>Household</h2><ul class="list-plain">' + p.householdMembers.filter((m) => m.born).map((m) => '<li><span class="chip" style="--c:' + m.color + '"></span>' + (m.id === p.id ? '<b>' + esc(m.name) + '</b>' : link('resident/' + m.id, esc(m.name))) + '<small class="muted">' + ROLE[m.role] + ', ' + m.age + (m.goneDark ? ', gone dark' : m.lit ? ', lit in the new era' : '') + '</small></li>').join('') + '</ul>';
    h += '<p class="hint" style="margin-top:16px">' + link('district/' + p.district, 'More residents of ' + esc(p.districtName)) + '</p></div></div>';
    return h;
  }

  // ---------------------------------------------------------------- a district
  const PAGE = 48;
  function district(id, page) {
    const t = now(), d = C.map().districts[+id];
    if (!d) return head('Unknown district', link('', 'Back to the census') + '.');
    document.title = d.name + ' – Census – Pixel City';
    const st = K.stats(t), ds = st.districts[+id], p = K.panelAt(t), pd = p.districts[+id];
    page = Math.max(0, +page || 0);
    const people = K.residentsOf(+id, t, page * PAGE, PAGE);
    let h = head(esc(d.name) + ' district', num(ds.residents) + ' residents in ' + num(ds.homes) + ' homes. ' + (pd && pd.topLabel ? 'Its biggest complaint this week: ' + esc(pd.topLabel.toLowerCase()) + '.' : ''), link('', 'The Census Office'));
    h += '<dl class="facts">' + fact('Residents', num(ds.residents)) + fact('Homes', num(ds.homes)) + fact('Median age', ds.medianAge) + fact('Under 18', num(ds.children)) + fact('65 and over', num(ds.over65)) +
      fact('Happiness', pd && pd.happiness !== null ? Math.round(pd.happiness * 100) + '%' : '<span class="muted">Not enough answers</span>', pd ? 'panel of ' + pd.sample : '') + '</dl>';
    h += '<h2>Residents</h2><p class="hint">Street by street, ' + (page * PAGE + 1) + ' to ' + (page * PAGE + people.length) + ' of ' + num(ds.residents) + '.</p><ul class="tiles">' + people.map(tile).join('') + '</ul>';
    h += '<p class="pager"><span>' + (page > 0 ? link('district/' + id + '/' + (page - 1), 'Previous ' + PAGE) : '') + '</span><span>' + ((page + 1) * PAGE < ds.residents ? link('district/' + id + '/' + (page + 1), 'Next ' + PAGE) : '') + '</span></p>';
    return h;
  }

  // ---------------------------------------------------------------- search
  function search(name) {
    const t = now(), found = K.search(name, t, 96);
    document.title = 'Search – Census – Pixel City';
    let h = head(found.length ? found.length + (found.length === 96 ? '+' : '') + ' residents found' : 'Nobody by that name', 'Searching for “' + esc(name) + '”.', link('', 'The Census Office'));
    h = h.replace('</section>', searchForm(name) + '</section>');
    if (found.length) h += '<ul class="tiles">' + found.map(tile).join('') + '</ul>';
    else h += '<p class="hint">Try part of a first name or a surname, such as Halftone or Ruby.</p>';
    return h;
  }

  // ---------------------------------------------------------------- routing
  function render() {
    if (!K || !C || !C.ready() || !K.ready()) {
      main.innerHTML = head('The Census Office is closed', 'The census needs Pixel City, the Weather Bureau and the Senate, and one of them could not be reached. Please try again shortly.', 'The Census Office');
      return;
    }
    const h = location.hash.replace(/^#\/?/, '');
    const [name, a, b] = h.split('/');
    document.title = 'Census – Pixel City';
    main.innerHTML = name === 'resident' ? resident(a) : name === 'district' ? district(a, b) : name === 'search' ? search(decodeURIComponent(a || '')) : overview();
    const form = document.getElementById('census-search');
    if (form) form.addEventListener('submit', (e) => { e.preventDefault(); const v = document.getElementById('census-q').value.trim(); if (v) location.hash = '#/search/' + encodeURIComponent(v); });
    window.scrollTo(0, 0);
  }
  if (AT) {
    // keep the time-travel setting on links to the city's own pages: ./#/power → ./?at=…#/power
    document.querySelectorAll('.nav a, .brand, .foot a').forEach((x) => {
      const href = x.getAttribute('href');
      if (/^https?:/.test(href)) return;
      const i = href.indexOf('#');
      x.setAttribute('href', (i < 0 ? href : href.slice(0, i)) + AT + (i < 0 ? '' : href.slice(i)));
    });
    const banner = document.getElementById('travel');
    banner.hidden = false;
    banner.innerHTML = 'Reading the census as it stood at ' + esc(new Date(now()).toISOString().slice(0, 16).replace('T', ' ')) + ' city time. <a href="' + location.pathname + location.hash + '">Return to the present</a>.';
  }
  window.addEventListener('hashchange', render);
  // let the page paint, then count
  setTimeout(render, 30);
})();
