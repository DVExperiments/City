# The Renewal

Pixel City's second era. It begins at **00:00 UTC on 1 November 2026**, the November Grand Prix. Everything before that moment is unchanged: the Museum's archive confirms every month from December 2025 to September 2026 is intact.

## What changes at the Renewal

**City Standard Time.** The city keeps UTC+12 all year, so its sun follows New Zealand: noon in the city is noon in Auckland (1pm during daylight saving). The Weather Bureau's sun moves with it, so the weather and the city agree. At the moment of the Renewal the city's clock jumps from midnight to noon. Races, laws and the Daily Pixel still turn over at 00:00 UTC, which is now noon, city time.

- `PixelUniverse.climate.offsetAt(t)` is the universe's one source of truth for the city's clock: 0 before the Renewal, 12 hours after it. `climate.renewal` is the date.
- City, its pages, the hub, the universe bar and Pixel FM's presenters all read it.

**The renewed city.** The same coast, river, districts, roads, power stations and reserved sites, with:

- **New buildings:** the Museum, the Census Office, Pixel FM Studios and the Universe Observatory (the hub), each linking to its site. The Bookmaker and the Daily Pixel's offices now link to theirs too.
- **Plots for sites still to come:** Pixel High, Pixel University, the Job Centre and the Bank of Pixel City, fenced and signed.
- **A square in every district,** with a monument pixel in the colour of the district's namesake, where residents meet.

The new buildings replace some homes, so the population is 81,010 rather than 82,640. The power stations and sites are the same, so the grid, construction and events carry on as before; only the time of day, and a slightly smaller population's emissions, differ.

**Life in the city.** `life.js` gives every resident a daily routine on the city's clock: commuting, working (some outdoors, on the docks or in the streets), lunch in the squares, school and play, evenings out, weekend outings, early runners, late walkers, and the stadium on Grand Prix days. Rain and storms keep people in. One resident in six is drawn on the map. Routines are a pure function of time, so everyone sees the same pixel in the same place.

**The new map.** `map.js` draws the city as a city on a screen:

- **Buildings:** houses are clusters of lit pixels, towers are little monitors, offices are glass with scanlines, and shop awnings carry a subpixel's red, green and blue.
- **Ground and water:** grass, water and sand are dithered.
- **People:** each resident is drawn in their census colour. Hover over one to see who they are and what they're doing; click to open their census file. On touch screens, tap once to see, twice to open.

## For other sites

- `PixelUniverse.city.map()` with no time still returns the founding map. The Bookmaker's regulars depend on it, so it must never change.
- `PixelUniverse.city.map(t)` returns the map in force at time `t`. New code should always pass a time.
- The census describes the renewed city's homes. Its panel history before the Renewal is reconstructed on those homes.

## Moving the date

If the Renewal needs to start later, change `RENEWAL` in the Weather Bureau's `universe.js` and the fallback date in City's `universe.js` (`RENEWAL_FALLBACK`), and the date in the universe bar (`RENEWAL` in Universe's `nav.js`). Publish before the date passes: once it has, moving it would rewrite history.
