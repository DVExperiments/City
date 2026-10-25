/* Pixel City Society's pages. Reads Society, the census and Pixel FM (for song titles); never changes anything. */
(function () {
  const U = window.PixelUniverse || {};
  const S = U.society, K = U.census, R = U.radio, W = U.climate;
  const DAY = 86400000;
  const main = document.getElementById('main');
  const q = new URLSearchParams(location.search);
  const at = q.get('at'), parsed = at ? Date.parse(at.length <= 16 ? at + ':00Z' : at) : NaN;
  const offset = isNaN(parsed) ? 0 : parsed - Date.now();
  const now = () => Date.now() + offset;
  const AT = isNaN(parsed) ? '' : '?at=' + encodeURIComponent(at);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (n) => Math.round(n).toLocaleString('en');
  const cityMs = (ms) => ms + (W && W.offsetAt ? W.offsetAt(ms) : 0);
  const fDate = new Intl.DateTimeFormat('en-NZ', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const fShort = new Intl.DateTimeFormat('en-NZ', { timeZone: 'UTC', day: 'numeric', month: 'short' });
  const day = (s) => fShort.format(Date.parse(s + 'T12:00:00Z'));
  const link = (route, text) => '<a href="' + AT + '#/' + route + '">' + text + '</a>';
  const head = (title, lede, kicker) => '<section class="page-head">' + (kicker ? '<p class="kicker">' + kicker + '</p>' : '') + '<h1>' + title + '</h1>' + (lede ? '<p class="lede">' + lede + '</p>' : '') + '</section>';
  const td = (v, n, cls) => '<td class="' + (n ? 'n ' : '') + (cls || '') + '">' + v + '</td>';
  const table = (cols, rows) => '<div class="table-wrap"><table class="data"><thead><tr>' + cols.map((c) => '<th' + (c.n ? ' class="n"' : '') + '>' + c.l + '</th>').join('') + '</tr></thead><tbody>' + (rows.length ? rows.join('') : '<tr><td class="muted" colspan="' + cols.length + '">Nothing yet.</td></tr>') + '</tbody></table></div>';
  const PARTY = { B: ['Brightness', '#E8A33D'], V: ['Verdant', '#3FA66A'], L: ['Legacy Mode', '#8C9AA6'], I: ['Independent', '#B79AE0'] };
  const songTitle = (id) => { try { const m = R && R.songMeta(id); return m ? '\u201c' + m.title + '\u201d by ' + m.artist : 'a song on Pixel FM'; } catch (e) { return 'a song on Pixel FM'; } };
  const fadName = (f) => (f.category === 'song' ? songTitle(f.item) : f.category === 'product' ? f.item + 's' : f.item);
  const swatch = (f) => '<span class="sw sw-' + f.category + '"' + (f.hex ? ' style="--c:' + f.hex + '"' : '') + '></span>';
  const news = (list) => '<ul class="timeline">' + (list.length ? list.map((e) => '<li><time>' + esc(fShort.format(Date.parse(e.time) - 1)) + '</time><span>' + esc(e.headline) + '</span></li>').join('') : '<li class="muted">Nothing much has happened.</li>') + '</ul>';
  const stack = (p) => '<span class="stack">' + ['B', 'V', 'L', 'I'].map((k) => '<i title="' + PARTY[k][0] + ' ' + p[k] + '%" style="width:' + p[k] + '%;background:' + PARTY[k][1] + '"></i>').join('') + '</span>';
  const delta = (a, b) => { const d = a - b; return Math.abs(d) < 0.5 ? '' : ' <small class="' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? '+' : '\u2212') + Math.abs(d).toFixed(1) + '</small>'; };
  const nameOf = (id) => { const c = K && K.character(id); return c ? c.name : id; };
  const pixel = (id) => link('pixel/' + id, esc(nameOf(id)));

  const V = {};
  V.home = {
    render() {
      const t = now(), st = S.stateAt(t);
      if (!st.started) return head('Society', 'Pixel City Society begins with the December Grand Prix, on ' + esc(day(S.startDate)) + '. From then, every pixel belongs to communities, and crazes and opinions spread through them.');
      const top = st.fads[0], c = st.city;
      const status = top && top.share >= 8 ? (top.category === 'song' ? 'Pixel City is humming ' + fadName(top) + '.' : top.category === 'colour' ? 'Pixel City has gone ' + top.item + '.' : 'Pixel City can\u2019t get enough of its ' + top.item.toLowerCase() + 's.')
        : c && c.mood < 58 ? 'Pixel City is in a sour mood.' : c && c.mood > 72 ? 'Pixel City is in good spirits.' : 'Pixel City is going about its business.';
      const fads = st.fads.slice(0, 9).map((f) => '<li class="fad">' + swatch(f) + '<div><b>' + esc(fadName(f)) + '</b><span class="muted">' + { colour: 'Colour', song: 'Song', product: 'Shops' }[f.category] + ', started by the ' + esc(f.origin) + ', ' + f.days + ' day' + (f.days === 1 ? '' : 's') + ' ago</span>' +
        '<span class="spread" aria-label="By district">' + f.districts.map((v) => '<i style="opacity:' + Math.min(1, 0.08 + v / 40).toFixed(2) + '"></i>').join('') + '</span></div><span class="share">' + f.share.toFixed(1) + '%</span></li>').join('');
      let h = '<section class="page-head"><p class="kicker">Pixel City Society, at the close of ' + esc(fDate.format(cityMs(Date.parse(st.asOf)))) + '.</p><h1 class="status">' + esc(status) + '</h1></section>' +
        '<h2>What\u2019s catching on</h2><p class="hint">How many pixels have taken each one up. The squares are the sixteen districts, west to east.</p><ul class="fads">' + (fads || '<li class="muted">No crazes at the moment.</li>') + '</ul>';
      if (c) {
        const rows = st.districts.slice().sort((a, b) => a.mood - b.mood).map((d) => '<tr>' + td(esc(d.name)) + td(num(d.population) + (d.homesLivedIn < 99.5 ? ' <small class="down">' + d.homesLivedIn.toFixed(0) + '% of homes</small>' : ''), 1) + td(d.mood.toFixed(0), 1, d.mood < 55 ? 'warn' : '') + td(d.needs ? '<span title="Housing ' + d.needs.housing + ', charge ' + d.needs.charge + ', health ' + d.needs.health + ', security ' + d.needs.security + ', leisure ' + d.needs.leisure + '">' + d.needs.wellbeing.toFixed(0) + '</span>' : '\u2013', 1, d.needs && d.needs.wellbeing < 60 ? 'warn' : '') + td(stack(d.poll)) +
          ['B', 'V', 'L', 'I'].map((k) => td(d.poll[k].toFixed(0) + delta(d.poll[k], d.base[k]), 1)).join('') + '</tr>');
        h += '<dl class="facts">' + '<div><dt>Mood</dt><dd>' + c.mood.toFixed(0) + '</dd></div>' + ['B', 'V', 'L', 'I'].map((k) => '<div><dt><span class="chip" style="--c:' + PARTY[k][1] + '"></span>' + PARTY[k][0] + '</dt><dd>' + c.poll[k].toFixed(1) + '%</dd></div>').join('') + '</dl>' +
          '<h2>How the districts lean</h2><p class="hint">From every community, weighted by its members. Changes are since Society began. From 1 March 2027, pixels arrive for work and leave over smog, blackouts, lost jobs and glitches; a district can\u2019t hold more than it has homes. From the May 2027 general election, the Senate\u2019s elections follow these leanings, and a sitting senator fares better in a district that is growing and happy, as they stood a fortnight before polling day.</p>' +
          table([{ l: 'District' }, { l: 'Pixels', n: 1 }, { l: 'Mood', n: 1 }, { l: 'Wellbeing', n: 1 }, { l: '' }, { l: 'Brightness', n: 1 }, { l: 'Verdant', n: 1 }, { l: 'Legacy', n: 1 }, { l: 'Indep.', n: 1 }], rows);
      }
      h += '<div class="two-col"><section><h2>Around the communities</h2>' + news(S.eventsBetween(t - 45 * DAY, t).filter((e) => e.importance >= 2).reverse().slice(0, 16)) + '</section><section><h2>Not speaking</h2>' +
        (st.rivalries && st.rivalries.length ? '<ul class="timeline">' + st.rivalries.map((r) => '<li><time>' + esc(day(r.since)) + '</time><span>The ' + esc(r.a) + ' and the ' + esc(r.b) + '</span></li>').join('') + '</ul>' : '<p class="muted">Everyone is on speaking terms.</p>') +
        '<h2>Crazes that have passed</h2>' + (st.past.length ? '<ul class="timeline">' + st.past.map((f) => '<li><time>' + esc(day(f.from)) + '</time><span>' + swatch(f) + esc(fadName(f)) + ', peaking at ' + f.peak.toFixed(0) + '%</span></li>').join('') + '</ul>' : '<p class="muted">None yet.</p>') +
        '<p>' + link('communities', 'Every community') + '</p></section></div>';
      return h;
    }
  };
  V.communities = {
    render() {
      const list = S.communitiesAt(now()), by = {};
      for (const c of list) (by[c.district] = by[c.district] || []).push(c);
      return head('Communities', num(list.length) + ' communities across sixteen districts. Most pixels belong to one, two or three.') +
        Object.keys(by).map((d) => '<h2>' + esc(d) + '</h2><p class="clist">' + by[d].sort((a, b) => b.members - a.members).map((c) => link('community/' + c.id, esc(c.interest)) + ' <small>' + num(c.members) + '</small>').join(', ') + '</p>').join('');
    }
  };
  V.community = {
    render(id) {
      const c = S.community(+id, now());
      if (!c) return head('No such community', '');
      return head(esc(c.name), num(c.members) + ' members. ' + (c.novelty > 70 ? 'Always first with something new.' : c.novelty < 35 ? 'Slow to take things up, and slow to let them go.' : 'Takes things up in its own time.') + ' Their shop of choice is the ' + esc(c.shop.toLowerCase()) + '.', 'Community, ' + esc(c.district)) +
        (c.lean ? '<dl class="facts"><div><dt>Mood</dt><dd>' + c.mood.toFixed(0) + '</dd></div>' + ['B', 'V', 'L', 'I'].map((k) => '<div><dt><span class="chip" style="--c:' + PARTY[k][1] + '"></span>' + PARTY[k][0] + '</dt><dd>' + c.lean[k].toFixed(0) + '%</dd></div>').join('') + '</dl>' : '') +
        '<h2>What they\u2019ve taken up</h2>' + (c.fads.length ? '<ul class="fads">' + c.fads.map((f) => '<li class="fad">' + swatch(f) + '<div><b>' + esc(fadName(f)) + '</b></div><span class="share">' + f.share.toFixed(0) + '%</span></li>').join('') + '</ul>' : '<p class="muted">Nothing at the moment.</p>');
    }
  };
  V.pixel = {
    render(id) {
      const p = S.pixelAt(id, now());
      if (!p) return head('No such pixel', 'The Census Office has no file under that id.');
      const party = p.lean ? '<span class="chip" style="--c:' + PARTY[p.lean][1] + '"></span>' + PARTY[p.lean][0] + (p.swayedBy ? ', brought round by their friends' : '') : '\u2013';
      return head(esc(p.name), 'Lives in ' + esc(p.district) + '. <a href="census.html' + AT + '#/resident/' + esc(id) + '">Census file</a>', 'A pixel\u2019s social life') +
        '<dl class="facts"><div><dt>Leans towards</dt><dd>' + party + '</dd></div><div><dt>Friends</dt><dd>' + p.friends.length + '</dd></div><div><dt>Crazes taken up</dt><dd>' + p.fads.length + '</dd></div></dl>' +
        '<div class="two-col"><section><h2>Belongs to</h2><ul class="timeline">' + p.communities.map((c) => '<li><span>' + link('community/' + c.id, esc(c.name)) + '</span></li>').join('') + '</ul>' +
        '<h2>Friends</h2>' + (p.friends.length ? '<ul class="timeline">' + p.friends.map((f) => '<li><span>' + pixel(f) + '</span></li>').join('') + '</ul>' : '<p class="muted">Keeps to themselves.</p>') +
        '<h2>Not speaking to</h2>' + (p.rival ? '<p>' + pixel(p.rival) + '</p>' : '<p class="muted">Nobody, for now.</p>') + '</section>' +
        '<section><h2>Has taken up</h2>' + (p.fads.length ? '<ul class="fads">' + p.fads.map((f) => '<li class="fad">' + swatch(f) + '<div><b>' + esc(fadName(f)) + '</b></div></li>').join('') + '</ul>' : '<p class="muted">Not one for crazes.</p>') + '</section></div>';
    }
  };

  const ROUTES = { '': 'home', communities: 'communities', community: 'community', pixel: 'pixel' };
  function render() {
    if (!S || !S.ready() || !K || !K.ready()) { main.innerHTML = head('Society is quiet', 'Society needs the Weather Bureau, the Senate, the city, the Census Office and the Exchange, and one of them could not be reached. Please try again shortly.'); return; }
    const h = location.hash.replace(/^#\/?/, ''), cut = h.indexOf('/'), name = cut < 0 ? h : h.slice(0, cut), arg = cut < 0 ? '' : h.slice(cut + 1);
    const view = V[ROUTES[name] || 'home'];
    main.innerHTML = view.render(arg);
    window.scrollTo(0, 0);
  }
  if (AT) { const b = document.getElementById('travel'); if (b) { b.hidden = false; b.innerHTML = 'Watching Society at ' + esc(at) + '. <a href="' + location.pathname + location.hash + '">Return to the present</a>.'; } }
  window.addEventListener('hashchange', render);
  render();
})();
