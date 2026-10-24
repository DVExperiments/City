# The Life Cycle

Pixel City's third era, beginning at **00:00 on 1 December 2026, city time**. Before it, the census is exactly as it was. From it, pixels are **lit** (born) and **go dark** (die), and every working-age pixel has a working life, kept by the Job Centre. All of it lives in `census.js`, so every page that loads the census computes the same city.

## A pixel's life

Lit → childhood → Pixel High (Years 9–13) → work, or study, or home → retirement → going dark.

## Going dark

Each pixel's lifespan is drawn once, from the chance of going dark at each age (0.2% a year for children, rising to 5% at 75–84 and 14% at 85–94), starting from their age on 1 December 2026. So nobody goes dark retroactively. About 585 pixels go dark in a year, at a median age of 80. The census keeps their file and records the day, kindly.

## Being lit: what leads to a new pixel

Each month, every two-adult household has a chance of lighting a new pixel, who arrives about nine months later. The chance is shaped by:

| Factor | Effect |
| --- | --- |
| **Work** | Both adults employed: full chance. One: ×0.8. Neither: ×0.45. Read from the Job Centre's records. |
| **Room at home** | Fewer people than the home holds: full chance. Exactly full: ×0.45. One over: ×0.12. More: none. |
| **Age** | The younger adult: 18–21 ×0.6, 22–29 full, 30–34 ×0.85, 35–39 ×0.55, 40–44 ×0.2, then none. |
| **Children at home** | None: full. One: ×0.75. Two: ×0.4. Three: no more. |
| **The air** | A month with the city's air quality over 150: ×0.8. Over 100: ×0.92. |
| **Green space** | A park in the district: ×1.08. |
| **The season** | September to February: ×1.08. March to August: ×0.95. |

There's a short pause after each new pixel. About 720 pixels are lit in 2027, so the city grows slowly. Young couples who both work are the most likely to light a pixel (about 13% a year, against 9% where neither works), and each child already at home makes another less likely.

New pixels have ids like `p1234-0-b0`: household 0 of home 1234, the first pixel lit into it.

## Working lives

Every resident aged 18 to 66 has a career, from 1 December 2026, of spells of a few years each:

- **Employed:** at one of 2,640 employers. These are the city's shops, offices, factories, warehouses and docks, its institutions (from the Senate to Pixel High) and its power stations, parks and building sites. Each job has a title and a weekly wage in watts, and pixels sometimes land their dream job.
- **Looking for work:** more likely, and for longer, when the city has fewer jobs than workers.
- **Out of the workforce:** studying, keeping house or caring for family.
- **Retired:** at 67, or earlier from 60.

When a power station closes or a building site finishes, its staff are laid off and look for work. A job's future is never checked beyond the moment being asked about, so the model never looks into the city's future. Unemployment starts around 7.5%.

The Job Centre opens on 7 December 2026, and its site reads all of this through `PixelUniverse.labour`. From 1 December, Pixel High's teachers come from the same records.

## API

- `PixelUniverse.census`:
  - `person(id, t)` now includes `goneDark`, `dark`, `lit`, `expecting`, `work` and `career`.
  - `darkAt(id, birth)` gives the moment a pixel goes dark.
  - `recentLife(t, days)` lists the pixels lit and gone dark in the days before `t`.
  - `lifeStart` is the era's start.
- `PixelUniverse.labour`:
  - `labourAt(t)` gives the totals, rate, sectors, districts, headcounts, vacancies and the queue.
  - `jobOf(id, t)` and `careerOf(id, t)` give one pixel's job and working history.
  - `employers()` and `staffOf(employerId, t)` list the employers and one employer's staff.
  - `eventsBetween` gives the opening, monthly reports and layoffs.
