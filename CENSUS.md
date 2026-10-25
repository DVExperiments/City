# The Census Office

Every resident of Pixel City, by name. Part of the City repo: `census.js` is the module, `census.html` is its page.

## How it fits

- **Inside the city.** The census lives in City's repo and reads City's map and state, so its people are the city's people. Every resident has an address in a real building on the map, and the homes hold exactly City's 82,640 residents.
- **Its own page.** `census.html` uses City's header, nav and stylesheet, so it reads as another City tab (Map, Districts, Power, Port, Census, About). When the universe gets one shared navigation bar, the Census is simply a tab in it at `dvexperiments.github.io/City/census.html`.
- **The source of people for other sites.** Pixel High, the University, the Job Centre and the Bank should read residents from here rather than inventing their own, so a pixel is the same pixel everywhere. Load City's `universe.js` and then `census.js`.

## The people

- **Homes.** Houses hold 6 residents (split into homes of 1 to 6), apartment blocks 34 (flats of 1 to 4), and flats above shops 2. 35,484 homes in all, each with a street address.
- **Households.** Each home is lived in by a sequence of households. A household stays between 2 and 24 years, then leaves the city and a new one arrives: about 20 a day before the Pixel Calendar, and about 140 a day after it, since tenancies are counted in Pixel Years. Households are singles, couples, a parent and child, families (sometimes with a grandparent) or flatmates.
- **Residents.** A name, birthday, colour, five traits (brightness, sharpness, warmth, flicker, saturation), a favourite Glacial pixel, two hobbies, a hope, a dream job and a quirk. Ages run on the life clock: in real years until 1 December 2026, and from then a year every Pixel Year (each calendar month). From then the file shows a pixel birthday, the day of the Pixel Year on which their age goes up (`pixelBirthday`).
- **Opinions.** Worked out at any moment from the city as it was the day before: the air quality, blackouts in their district over the last week, parks in their district, the coal plant law, and the weather, weighted by personality and district character. From that come a mood (content, uneasy, unhappy), a ranked list of concerns, a quote, and a party leaning anchored to the Senate's own polling.
- **The citizens' panel.** Every Monday, 800 adults chosen at random. It has run since the city began, so its history reaches back to December 2025.

The Office opens on **2 November 2026**; its events start then.

## API (`window.PixelUniverse.census`)

| Member | Returns |
| --- | --- |
| `stateAt(t)` | Population, households, ages, district figures, this week's panel, the resident of the day |
| `person(id, t)` | A full profile, with opinions if they live here and are 12 or over. People who have moved away stay on file. |
| `summary(id, t)` | Name, colour, age, address and district: cheap, for lists |
| `residentsOf(district, t, offset, limit)` | A district's residents, home by home |
| `cohort(t, minAge, maxAge, district?)` | The ids of everyone of those ages: Pixel High's intake is `cohort(t, 13, 17)` |
| `search(name, t, limit)` | Residents whose names contain the text |
| `panelAt(t)`, `panelsBetween(from, to)` | The weekly panel |
| `householdAt(homeIndex, t)`, `homes()`, `movesBetween(from, to)` | Homes and who lives in them |
| `ageAt(birth, t)`, `lifeClock` | Age on the life clock, for any site that shows one; `lifeClock.toLife`, `fromLife` and `later(t, span)` |
| `eventsBetween(from, to)` | `census.opens`, `census.panel` (Mondays, 09:00 UTC) and `census.moves` (daily) |

Resident ids look like `p1234-2-0`: home 1234, its third household, first member. They never change.

## Page routes

`census.html#/` (overview) · `#/district/<id>` · `#/resident/<id>` · `#/search/<name>`. Add `?at=2026-07-20T12:00` to read the census at another moment, as on the city's own pages.

## Not yet

Residents don't yet affect the city or the Senate: the census is a reader. If they should one day (complaints feeding the Senate's concern, say), the census would join the world loop with a one-day lag, as the conventions require.
