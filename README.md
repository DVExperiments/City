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
| `map.js` | The pan-and-zoom map. Display only. |
| `city.js` | Pages, live updates and routing. |
| `test.html` | Self-checks and a year-by-year report. |

## Dependencies

The city reads the Weather Bureau's climate and the Senate's environmental laws, so both must load first, in this order:

```html
<script src="https://dvexperiments.github.io/Weather/universe.js"></script>
<script src="https://dvexperiments.github.io/Senate/universe.js"></script>
<script src="https://dvexperiments.github.io/City/universe.js"></script>
```

If either fails to load, the city refuses to run (`ready()` returns false) rather than compute a different history. The Senate does not read the city yet; that feedback arrives with the Ecosystem (phase 2).

## The map

160 by 120 blocks, laid out once from fixed seeds and never moved: a coast to the east with a harbour, a river with bridges, forest in the west, an arterial road grid with streets between, and sixteen districts named after the Senate's electorates. Each district's land use follows the character of its voters: industrial districts get factories and warehouses, green ones gardens, modern ones offices and apartments.

Landmarks link to the other sites: the Senate House, the Glacial Stadium (where a race is always on), the Weather Bureau Tower, and the Bookmaker and Newspaper Office, which open later. There are also the Port and the Harbour Gas Station.

46 reserved sites are built, or not, by Senate law: six coal plants, five solar farms, five wind farms, twenty parks and ten wildlife zones. When a law raises a level, work begins the next day and the site opens after a build time (coal 30 days, wind 14, solar 10, parks 5, wildlife zones 3). When a law lowers it, the site is cleared over five days.

## The grid

Every hour, demand follows the time of day, heating and cooling with the temperature, the stadium floodlights after dark, Grand Prix crowds, the construction budget and traffic limits. Supply comes in merit order: solar (sun and cloud), wind (no power below 10 km/h, shut down in storms above 100 km/h), coal (limited by the emissions cap), the 100 MW national grid link, then 160 MW of gas peakers. If that isn't enough, rolling blackouts move from district to district each hour.

## The air

Daily emissions from coal, gas, traffic and construction build up as smog, which rain clears and still days hold in place. This is a first version of the air-quality model; the Ecosystem will take it over.

## Events

Source `city`: construction starts, openings and closures; blackouts (with districts and hours); record demand; smog alerts and clearances; Grand Prix crowds.

## API

| Function | Returns |
| --- | --- |
| `PixelUniverse.city.map()` | The fixed map: tiles, districts, landmarks and reserved sites |
| `stateAt(time)` | The grid this hour, districts in blackout, every site's state, today so far, policy levels, air quality |
| `eventsBetween(from, to)` | Events in the shared format |
| `historyBetween(from, to)` | Daily summaries: energy by source, clean share, peak, blackout hours by district, emissions, air quality |
| `siteStateAt(featureId, time)` | One reserved site: empty, building, operating or clearing |

## Testing

Add `?at=` to watch any moment: `index.html?at=2028-06-20T19:30` for a blackout in the coal-free year, or `?at=2026-07-14T20:00` for a stormy night.

## Next: phase 2

The Ecosystem takes over the air, adds wildlife, and the Senate starts reading yesterday's city (smog and blackouts) in place of its air-quality stub. That closes the world loop.
