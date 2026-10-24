# City v3: the digital landscape

Pixel City is now drawn as what it is: a place on a screen. This changes how the city looks, not what happens in it. `universe.js`, the map layout, construction, the grid, ships, events and every past result are unchanged, so no new era is needed.

## Files

| File | Change |
| --- | --- |
| `look.js` | New. Each district's accent colour, physics, industry and description, plus the city's display names for its ground. Loaded before `map.js` and `city.js`. |
| `map.js` | Repainted. Same camera, residents, ships and interaction; new ground, infrastructure, buildings, landmarks, sites and moving parts. |
| `city.js` | Land use uses the new names; district cards and pages carry each district's description; the sea is the blank margin; About explains the look. |
| `city.css` | The map is a 4:3 screen showing the whole city, on a dark bezel with a faint neon edge. |
| `index.html` | Loads `look.js`; new favicon. |

## The ground

| Simulation tile | Drawn as | Display name |
| --- | --- | --- |
| Sea | The blank margin: dark, with a faint pitch grid. Nothing has been drawn here. | Blank margin |
| Beach | The frame border: a bright stepped line where the canvas ends, glowing by day and night. The quay is the metal export dock. | Frame border |
| Open ground | Substrate, in the district's physics, with the odd sprite sprouting. | Substrate |
| Forest | The noise field: procedural overgrowth, sprite thickets, and patches nobody has rendered yet. | Noise field |
| Main road | The data bus: bright edges, lane dashes, a node at every junction. Traffic is packets with fading trails. | Data bus |
| Street | A signal trace from junction to junction, with pads where it branches. | Signal trace |
| Bridge | A jumper over the stream. | Bus bridge |
| River | The data stream: bright banks, with packets of light flowing east to the margin. | Data stream |
| Garden | Colour growth: wild, bright blooms on dithered green. | Colour growth |
| Factories | Industry by district: render plants, texture foundries, palette refineries, compression facilities, signal processing yards. | Render plants |
| Warehouses | Caches: identical blocks with status lights. | Caches |
| Docks | Export buffers: blocks waiting to leave the canvas. | Export buffers |

Houses, apartments, shops and offices are redrawn (pixel clusters, memory stacks, kiosks under RGB awnings, processors with pins) but keep their names until the wider move from human to digital civilisation.

Reserved sites: coal plants are furnaces of orange heat; solar farms are photodiode arrays; wind farms are fan arrays that turn with the wind and stop in storms; parks are gardens of colour growth with a coolant pool; wildlife zones are fenced sprite thickets. Construction is a wireframe filling in, with a progress bar; clearing is fragments coming loose. Plots for buildings to come are reserved memory, marked out with a dashed border.

Weather and air: rain falls as bits; smog is noise on the signal, a grey-violet haze with static in it; a district in blackout loses its signal. At night the backlight dims and only what emits its own light keeps shining.

## District physics

| District | Physics |
| --- | --- |
| Hot Pixel | Stuck pixels at full brightness, which flare now and then; glowing cores in buildings. |
| Burn-In | The ghost of a window burned into the ground; every building has an older copy beside it. |
| Gamma | Brightness rises across the district in visible steps; washed-out roofs. |
| Dither | An ordered Bayer dither fading in across the district; buildings shaded in checkers. |
| Chroma | Light split into red, green and blue; every building has colour fringes. |
| Vsync | Scanlines, test waveforms, a refresh sweep every few seconds, and rows that tear sideways. |
| Moiré | Two sets of rings at slightly different centres; where they disagree, a pixel lights. |
| Nibble | Four bits per block; buildings limited to a 16-colour palette. |
| Sub-Pixel | Every surface is red, green and blue stripes. |
| Anti-Alias | Soft tonal rings; every building has a soft halo. |
| Jaggy | Staircase diagonals; corners cut in steps. |
| Off-By-One | The grid is one pixel out, and buildings sit a pixel or two from where they were meant to be. |
| Bezel | Every block in a frame, and frames around the buildings too. |
| Lossless | A crisp grid, checksum dots, pristine white outlines. |
| Dead Pixel | Blocks that no longer light, and stay dark at night; one red pixel in the square. |
| Null Pointer | Missing-texture checkers and boxes with a line through them. |

To give a new district a look, add it to `THEMES` in `look.js`. An unknown name still gets a physics, by index.

## Rules kept

Display only, so the shared conventions hold: nothing in `look.js` or `map.js` is recorded or affects the simulation. Decorative animation (packets, stream flow, flicker, fans) uses `Math.random`, `Math.sin` and the clock freely, as the conventions allow for display code. Reduced motion turns the animation off.
