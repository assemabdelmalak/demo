# Super City (POC)

An open-world superhero game that runs in the browser. You start with almost no powers and level up into a flying, fireball-throwing, building-smashing hero.

Built with [three.js](https://threejs.org/) (vendored in `lib/`). There is no build step and nothing to install.

## Run it

ES modules need a web server, so opening `index.html` as a file won't work. From this folder:

```bash
npx http-server -c-1 .     # or: python3 -m http.server 8000
```

Then open the printed URL. To play on a phone, open the same URL from a device on your network (e.g. `http://<your-ip>:8080`) and turn it to landscape.

URL options for testing:

- `?level=5` starts at level 5 with every power unlocked.
- `?touch` forces the touch controls on a desktop browser.

## What's in the POC

| Feature | Details |
|---|---|
| Open city | 8×8 grid of procedurally generated blocks: about 125 buildings, roads, sidewalks, a park, trees and street furniture |
| Traffic | Cars drive on the right, turn at intersections and brake for you and for other cars |
| Citizens | Pedestrians walk the sidewalks, panic during fights, get knocked over, and you can talk to them (**E**) |
| Climbing | Run into any wall to climb it. You mantle onto the roof at the top; jump to wall-kick off |
| Destruction | Lamp posts, hydrants, bins, benches, crates and explosive barrels. Cars wreck and explode. Buildings take damage and collapse into rubble |
| Enemies | Four gang hideouts (red beacons), threat levels 1–4, with melee thugs, gunners and a boss at Iron Fortress. Clearing a zone liberates it; gangs come back later |
| Progression | XP from enemies, zones, destruction and meeting citizens |

### Powers by level

| Level | Power | Key |
|---|---|---|
| 1 | Punch combo (3-hit, soft lock-on) and climbing | LMB / J |
| 2 | 💪 Super strength: smash buildings, super jump, lift & throw cars | E |
| 3 | 🔥 Fireball (explosive, aim with the crosshair) | Q / RMB |
| 4 | ⚡ Chain lightning (jumps between up to 5 enemies) | R |
| 5 | 🦸 Flight (Space to rise, C to descend, Shift for boost) | F or double-jump |

Each level also raises max HP, damage, speed and climb speed.

## Controls

**Keyboard and mouse:** WASD to move, mouse to look (click to capture), Shift to sprint, Space to jump, E for talk/lift/throw.

**Touch:** put your left thumb anywhere to get a floating thumbstick (push to the edge to sprint). Drag on the right side to look around. The on-screen buttons are punch, jump and your unlocked powers, and a context button appears to talk, lift or throw.

**Gamepad:** left stick moves, right stick looks. A = jump, X = punch, B = interact, Y = fireball, RB = lightning, LB = fly, LT = descend, RT/L3 = sprint.

## Code map

```
index.html / style.css   HUD, touch controls, start menu
src/main.js              Game loop, camera, damage/explosion helpers
src/world.js             City generation, building collision, destruction/collapse
src/player.js            Movement, climbing, flight, combat, lift/throw
src/input.js             Keyboard/mouse, floating thumbstick + buttons, gamepad
src/enemies.js           Gang zones, enemy AI, boss
src/traffic.js           Car AI on the road grid
src/peds.js              Pedestrians: walk, panic, talk, knockdown
src/powers.js            Fireballs, enemy bolts, chain lightning
src/props.js             Physics props (knock, break, lift, throw, explode)
src/fx.js                Instanced particles, shockwaves, lightning, flashes
src/hud.js               Bars, minimap, toasts, speech bubbles, floating XP
src/progression.js       XP curve, levels, power unlocks
```

## Ideas for next steps

- Character model with real animations (glTF + skeletal animation)
- Missions and story, plus random street crimes to stop
- Sound effects and music
- Larger streamed city, interiors, day/night cycle
- Proper physics engine (e.g. Rapier) for ragdolls and building fracture
- More powers: ice, telekinesis, speed dash, laser eyes. Add a skill tree instead of fixed unlocks
- Save/load progress
