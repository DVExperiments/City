# Pixel City

The hub of the Pixel Universe: a top-down city of 83,000 pixels that you can drag, zoom and explore. Its power, construction and air follow the weather and the laws of the Pixel Senate. Part of the Pixel Universe; follows the Pixel Universe Shared Conventions.

Live at `https://dvexperiments.github.io/City/`. Test bench at `/City/test.html`.

## Files

Every file sits at the top level.

| File | What it does |
| --- | --- |
| `universe.js` | The simulation: map, construction, power grid and pollution. No DOM code. |
| `index.html` | The site. |
| `city.css` | Styles, built on Glacial's. |
| `look.js` | How the city looks: each district's colour, physics and industry, and the city's names for its ground. Display only. |
| `map.js` | The pan-and-zoom map, painted as pixel art at 16 pixels per block and repainted only when something changes. Display only. |
| `city.js` | Pages, live updates and routing. |
| `test.html` | Self-checks and a year-by-year report. |

## Dependencies

The city reads the Weather Bureau's climate and the Senate's environmental laws, so both must load first, in this order:

```html
<script src="https://dvexperiments.github.io/Weather/universe.js"></script>
<script src="https://dvexperiments.github.io/Senate/universe.js"></script>
<script src="https://dvexperiments.github.io/City/universe.js"></script>
```

If either fails to load, the city refuses to run (`ready()` returns false) rather than compute a different history.

The Census Office's working lives (`census.js`) also depend on the Pixel Exchange (`https://dvexperiments.github.io/Exchange/universe.js`, loaded after `census.js`): from 1 December 2026, businesses hire and lay off staff as they trade. The businesses are the things pixels use (render plants, palette refineries, charge bars, patch shops and so on). The Senate does not read the city yet; that feedback arrives with the Ecosystem (phase 2).

## The map

160 by 120 blocks, laid out once from fixed seeds and never moved: a coast to the east with a harbour, a river with bridges, forest in the west, an arterial road grid with streets between, and sixteen districts named after the Senate's electorates. Each district's land use follows the character of its voters: industrial districts get factories and warehouses, green ones gardens, modern ones offices and apartments.

Landmarks link to the other sites: the Senate House, the Glacial Stadium (where a race is always on), the Weather Bureau Tower, and the Bookmaker and Newspaper Office, which open later. There are also the Port and the Harbour Gas Station.

46 reserved sites are built, or not, by Senate law: six coal plants, five solar farms, five wind farms, twenty parks and ten wildlife zones. When a law raises a level, work begins the next day and the site opens after a build time (coal 30 days, wind 14, solar 10, parks 5, wildlife zones 3). When a law lowers it, the site is cleared over five days.

## How it's drawn (City v3)

The city is drawn as a digital landscape. Main roads are data buses with a node at every junction, streets are signal traces, the river is a data stream, the forest is a noise field, gardens are colour growth, the coast is the frame border and the sea is the blank margin. Industry is render plants, texture foundries, palette refineries, compression facilities and signal processing yards. Each district behaves like the pixel it is named after. See `CITY_V3.md` for the full visual language.

This is display only: `universe.js`, the map layout and every past result are unchanged.

## The grid

Every hour, demand follows the time of day, heating and cooling with the temperature, the stadium floodlights after dark, Grand Prix crowds, the construction budget and traffic limits. Supply comes in merit order: solar (sun and cloud), wind (no power below 10 km/h, shut down in storms above 100 km/h), coal (limited by the emissions cap), the 100 MW national grid link, then 160 MW of gas peakers. If that isn't enough, rolling blackouts move from district to district each hour.

## The port

Shipping is part of the simulation. Container ships call every day (one to three), and the harbour ferry crosses at 08:00 and 17:00. Coal carriers call as often as the operating coal plants need fuel, and gas tankers follow how hard the gas peakers worked the day before, so the harbour reflects the Senate's energy laws too. Ships sail in over two hours, tie up at one of six berths for half a day or more, and sail out. Gusts of 88 km/h or more, or a named storm blowing a gale, hold ships outside the harbour. The Port page shows the arrivals board and the last 30 days of calls; a fuller freight page will follow.

## The air

Daily emissions from coal, gas, traffic and construction build up as smog, which rain clears and still days hold in place. This is a first version of the air-quality model; the Ecosystem will take it over.

## Events

Source `city`: construction starts, openings and closures; blackouts (with districts and hours); record demand; smog alerts and clearances; Grand Prix crowds; coal and gas deliveries; ships held by the weather.

## API

| Function | Returns |
| --- | --- |
| `PixelUniverse.city.map()` | The fixed map: tiles, districts, landmarks and reserved sites |
| `stateAt(time)` | The grid this hour, districts in blackout, every site's state, today so far, policy levels, air quality |
| `eventsBetween(from, to)` | Events in the shared format |
| `historyBetween(from, to)` | Daily summaries: energy by source, clean share, peak, blackout hours by district, emissions, air quality |
| `siteStateAt(featureId, time)` | One reserved site: empty, building, operating or clearing |
| `shipsAt(time)` | Ships in sight: arriving, alongside or departing, with cargo, origin and berth |
| `portBetween(from, to)` | Every ship call arriving in a range |

## Testing

Add `?at=` to watch any moment: `index.html?at=2028-06-20T19:30` for a blackout in the coal-free year, or `?at=2026-07-14T20:00` for a stormy night.

## Next: phase 2

The Ecosystem takes over the air, adds wildlife, and the Senate starts reading yesterday's city (smog and blackouts) in place of its air-quality stub. That closes the world loop.

## Society (society.js, society.html)

Pixel City Society begins with the December Grand Prix (1 December 2026). Every adult pixel belongs to one to three communities, twelve kinds in each district (the Signal Choir of Vsync, the Glitch Spotters of Moiré, the Bezel Gardeners of Bezel, 192 in all). Communities hear from the rest of their district, from the same kind of community elsewhere, and from the districts next door. Two things spread through them, in two separate runs so nothing goes round in a circle within a day:

- **Tastes**: crazes for colours, Pixel FM songs and kinds of shop start in a community that likes new things, spread, peak and wear off. A colour craze gets the Senate debating the city's colours (it drafts more colour bills, shifting hue towards the craze); a song craze gets requested on Pixel FM (it reaches the chart); a shop craze sends a district's pixels to that kind of shop (the Exchange's demand). The tastes run reads only the map and the Weather Bureau.
- **Opinions**: each community leans towards Brightness, Verdant, Legacy Mode or an independent, and moves with its friends and with what happened to its district the day before: smog (towards Verdant), blackouts and good times (Brightness), prices and empty shelves (Legacy Mode), businesses closing (against everyone). Each kind of community feels what it cares about most. A community that changes its allegiance falls out with the biggest neighbour still holding to the old one. **From the May 2027 general election, the Senate's elections follow each district's leanings a fortnight before polling day.**

Each pixel has a social life too: their communities, up to five friends who share one, a rival nearby who leans the other way, the crazes they've taken up, and a leaning their friends can bring round.

`PixelUniverse.society`: `stateAt(t)`, `community(id, t)`, `communitiesAt(t)`, `pixelAt(id, t)`, `eventsBetween` (source `society`: `fad.start`, `fad.everywhere`, `society.turns`, `society.reconciled`), `historyBetween`, and the hooks `productBoost`, `songFad`, `colourFad`, `voteSwing`.

**The loop.** The Senate reads Society; Society reads the city and the Exchange; the city reads the Senate. It is allowed because every link looks back: elections read Society a fortnight late, Society reads the day before, and no run ever reads ahead of the day it is on. Every page that loads the Senate must therefore load, in order: Weather, Senate, City's universe.js, census.js, the Exchange, then society.js.
