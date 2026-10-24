/*
 * How Pixel City looks: each district's identity, and the city's own names for its ground.
 *
 * Display only. Nothing here touches the simulation in universe.js, so it can change without rewriting history.
 * Loaded before map.js and city.js. Registers window.CityLook.
 *
 * Every district is named after one of the sixteen Glacial pixels, and every district behaves like its name. Its
 * "physics" decides how its ground is drawn and what happens to the buildings on it; its "industry" decides what its
 * render plants, refineries and foundries look like; its accent is the colour of its namesake.
 */
(function () {
  const THEMES = {
    'Hot Pixel': {
      accent: '#FF3B30', physics: 'hot', industry: 'foundry',
      blurb: 'A few pixels in Hot Pixel are stuck at full brightness and have been since the epoch. The district runs warm, and the texture foundries like it that way.'
    },
    'Burn-In': {
      accent: '#FF8A1F', physics: 'burn', industry: 'foundry',
      blurb: 'Something was displayed over Burn-In for too long. Its outline is still faintly visible on the ground, and every building here shows a second, older copy of itself.'
    },
    'Gamma': {
      accent: '#FFC6A0', physics: 'gamma', industry: 'refinery',
      blurb: 'Brightness in Gamma does not rise evenly. The district climbs from shadow to glare in visible steps, which residents describe as the correct curve.'
    },
    'Dither': {
      accent: '#F2D024', physics: 'dither', industry: 'refinery',
      blurb: 'Dither has more colours than it can show, so it alternates the two it has. From a distance its colour growth looks smooth. Up close it is checkered.'
    },
    'Chroma': {
      accent: '#9BE22D', physics: 'chroma', industry: 'refinery',
      blurb: 'Light separates on its way into Chroma. Every edge arrives with a red fringe on one side and a blue one on the other.'
    },
    'Vsync': {
      accent: '#2FBF5B', physics: 'vsync', industry: 'signal',
      blurb: 'Vsync waits for the refresh before anything moves. A sweep crosses the district every few seconds. When it is late, the ground tears along a line and carries on.'
    },
    'Moiré': {
      accent: '#20C3AF', physics: 'moire', industry: 'signal',
      blurb: 'Two grids were laid over Moiré at slightly different spacings. Neither will be removed. The rings they make are now a protected feature.'
    },
    'Nibble': {
      accent: '#23B5E8', physics: 'nibble', industry: 'compression',
      blurb: 'Everything in Nibble is stored four bits at a time: sixteen colours, square blocks, no exceptions. The port\u2019s caches are kept here.'
    },
    'Sub-Pixel': {
      accent: '#2F6BFF', physics: 'subpixel', industry: 'refinery',
      blurb: 'Look closely at Sub-Pixel and every surface is three thin stripes, red, green and blue. Step back and they agree to be one colour.'
    },
    'Anti-Alias': {
      accent: '#8B6CFF', physics: 'aa', industry: 'render',
      blurb: 'Edges in Anti-Alias are softened with in-between tones, so nothing here is quite sharp. The stadium is here, and its races look smooth.'
    },
    'Jaggy': {
      accent: '#C43AE0', physics: 'jaggy', industry: 'render',
      blurb: 'Jaggy refuses to soften its edges. Every diagonal is a staircase and every corner is cut in steps. The Senate House sits here, squarely.'
    },
    'Off-By-One': {
      accent: '#FF5FA2', physics: 'offbyone', industry: 'signal',
      blurb: 'Everything in Off-By-One was placed one pixel from where it was meant to go. The error is consistent, which makes it a standard.'
    },
    'Bezel': {
      accent: '#A47551', physics: 'bezel', industry: 'render',
      blurb: 'The frame of the city. Every block in Bezel is mounted in a border, and the borders are mounted in borders.'
    },
    'Lossless': {
      accent: '#F4F4F4', physics: 'lossless', industry: 'compression',
      blurb: 'Nothing in Lossless has ever been compressed. Every block is exactly as it was drawn, which takes up a great deal of space. The compression facilities here are for export only.'
    },
    'Dead Pixel': {
      accent: '#6E7681', physics: 'dead', industry: 'compression',
      blurb: 'Some blocks in Dead Pixel stopped emitting light and were never replaced. One pixel in the square stays red. Nobody has established why.'
    },
    'Null Pointer': {
      accent: '#5A5FD6', physics: 'null', industry: 'render',
      blurb: 'Parts of Null Pointer refer to things that do not exist. Where a texture should be, there is sometimes a box with a line through it.'
    }
  };
  const FALLBACK = ['hot', 'burn', 'gamma', 'dither', 'chroma', 'vsync', 'moire', 'nibble', 'subpixel', 'aa', 'jaggy', 'offbyone', 'bezel', 'lossless', 'dead', 'null'];

  // The city's own names for its ground, by tile type (the same order as PixelUniverse.city.TILE_NAMES). The
  // simulation keeps its original names; these are what the pages show. Homes, shops and offices keep theirs for now.
  const TILE_NAMES = ['Blank margin', 'Frame border', 'Substrate', 'Noise field', 'Data bus', 'Signal trace', 'Bus bridge', 'Houses', 'Apartments', 'Shops', 'Offices',
    'Render plants', 'Caches', 'Export buffers', 'Colour growth', 'Data stream', 'Plaza', 'Reserved site', 'Landmark'];

  const INDUSTRY = { render: 'render plants', foundry: 'texture foundries', refinery: 'palette refineries', compression: 'compression facilities', signal: 'signal processing yards' };

  window.CityLook = {
    themes: THEMES,
    /** A district's look by name; unknown names get a physics by index so a new district still looks like something. */
    theme(name, index) {
      return THEMES[name] || { accent: '#9AA9B2', physics: FALLBACK[(index || 0) % 16], industry: 'render', blurb: '' };
    },
    tileName: (k, fallback) => TILE_NAMES[k] || fallback || '',
    industryName: (name) => INDUSTRY[(THEMES[name] || {}).industry] || 'render plants',
    TILE_NAMES
  };
})();
