# ■ PHYSICS PLAYGROUND

A monochrome physics sandbox. Spawn rigid shapes, watch them crack under explosions, then shatter into irregular polygonal fragments. Pure black & white.

**[Try it live →](https://maxwarren929-png.github.io/physics-playground/)**

---

## TOOLS

| Key | Tool | Action |
|---|---|---|
| `1` | **SPAWN** | Click to place a shape. Circle, Square, Triangle, Ragdoll, Force, or Immovable. Drag to launch. |
| `2` | **EXPLODE** | Click anywhere. Shapes near the blast crack; close enough and they shatter. |
| `3` | **WALL** | Click & drag to draw a static wall. Bouncy, immovable. |
| `4` | **GRAVITY** | Click to place a gravity well (or black hole). |
| `5` | **ERASE** | Click a shape, fragment, or wall to remove it. |
| `6` | **SPRING** | Click a body → click another body (or empty space) to connect with a stretchy constraint. |
| `Space` | **PAUSE** | Freeze / resume all physics. |
| `W` | **WIND** | Toggle a constant directional wind force. |
| `X` | **WORLD SIZE** | Cycle through Small / Medium / Large. |
| `R` | **RESET CAM** | Reset zoom and pan to fit the world. |
| Scroll | **ZOOM** | Zoom in / out centered on the cursor. |
| RClick | **PAN** | Right-click drag to pan the view. |
| `C` | **CLEAR** | Remove all objects from the world. |

### Shape selector
When Spawn is active, choose between **Circle** `○`, **Square** `□`, or **Triangle** `△`.

### Size slider
Controls how big spawned shapes are. Range 3–16. Larger shapes shatter into more fragments.

---

## FRACTURE SYSTEM

Shapes don't just disappear — they **crack**, then **shatter**.

### Stage 1: Cracking
Each explosion applies damage to every shape in its radius. Damaged shapes show **crack lines** radiating inward from the impact point. The fill dims from white to gray. More hits = more cracks.

### Stage 2: Shattering
When damage reaches 100%, the shape **fractures into irregular polygonal fragments** via poly-decomp (see below).

### Fragment behavior
- Labeled `Fragment`, decay after 10–15 seconds
- Can be shattered again by another explosion
- Max 6 fragments per shatter, 20 cracks visual cap

---

## CAMERA

Zoom and pan to explore the full world.

| Action | Input |
|---|---|
| **Zoom** | Scroll wheel — zooms centered on your cursor position |
| **Pan** | Right-click and drag |
| **Reset view** | `R` key or RESET button — auto-fits the current world size |

Zoom range: 0.08× – 20×.
The grid adapts its step size when zoomed out to avoid visual clutter.

---

## WORLD SIZES

Three world sizes, switchable on the fly:

| Size | Dimensions | Volume |
|---|---|---|
| **Small** | 1600 × 1200 | default (fits one screen) |
| **Medium** | 3200 × 2400 | 4× area |
| **Large** | 6400 × 4800 | 16× area |

Switch with the S/M/L buttons or press `X` to cycle.
Changing world size resets the camera to fit the new bounds. All existing objects are preserved.

---

## WIND FORCE

Toggle a constant directional force with `W` or the WIND button.
- All non-static, non-boundary bodies feel the wind
- Works with gravity wells — objects get pulled AND blown
- Wind strength is subtle by default; adjusts with the physics

---

## EXPLOSION SHOCKWAVE

Every explosion emits an expanding white ring that fades as it grows.
- Radius: expands outward at a fixed speed
- Life: fades over ~1 second
- Purely visual — no collision or force

---

## PHYSICS

| Property | Value |
|---|---|
| Gravity | `y: 0.4` (default) |
| Shape density | `0.003` |
| Shape restitution | `0.2` |
| Shape friction | `0.4` |
| Fragment density | `0.002` |
| Fragment restitution | `0.12` |
| Fragment friction | `0.6` |
| Explosion radius | `250px` (from blast center) |
| Boundary walls | All 4 edges (60px thick) |

### Walls
User-drawn walls are fully static with restitution `0.2` and friction `0.9`. They never move.

### Gravity Wells
Static attractors that pull objects within a 350px radius. Adjustable pull strength (0.1–30, default 12). Animated pulsating glow.

---

## SLIDERS

| Slider | Range | Default | Controls |
|---|---|---|---|
| **Size** | 3–16 | 8 | Size of spawned shapes |
| **Power** | 0.05–1.0 | 0.30 | Explosion blast strength |
| **Pull** | 0.1–30 | 12.0 | Gravity well attraction force |

## VIEW CONTROLS

| Control | Location | Action |
|---|---|---|
| **World Size** | Bottom bar (S/M/L) or `X` | Change boundary size on the fly |
| **Wind** | Bottom bar or `W` | Toggle directional wind force |
| **Reset Camera** | Bottom bar or `R` | Auto-fit view to current world |
| **Zoom** | Scroll wheel | Zoom centered on cursor |
| **Pan** | Right-click drag | Move the camera |

---

## VISUAL STYLE

- Black background (`#000`)
- White shape fills (`#fff`), gray strokes (`#555`)
- Damaged shapes: slightly dimmer (`#eee`) with dark crack lines
- Fragments: light gray (`#ddd`) with darker stroke (`#777`)
- Grid: faint `rgba(255,255,255,0.03)` lines at 32px intervals
- Collision particles: single white pixels at contact points
- Gravity wells: animated concentric circles with radial gradient
- Dragged shapes: translucent white overlay
- Wall preview: dashed outline while dragging

No colors, no pastels. Pure monochrome pixel aesthetic.

---

## PROJECT STRUCTURE

```
physics-playground/
├── index.html          # Entry point — toolbar, canvas, script loading
├── css/
│   └── style.css       # All styles (monospace, black & white)
├── js/
│   ├── physics.js      # Physics engine wrapper + fracture system
│   ├── particles.js    # Collision particles
│   ├── tools.js        # Tool dispatch (spawn, explode, wall, etc.)
│   └── app.js          # Init, mouse handlers, render loop, keyboard
├── lib/
│   ├── matter.min.js   # Matter.js v0.18.0 (local, no CDN)
│   └── poly-decomp.js  # Polygon decomposition for fracture
├── favicon.png
└── README.md
```

---

## POLY-DECOMP

The fracture system uses **poly-decomp.js** (schteppe), a polygon decomposition library for splitting 2D polygons into fragments. The build in `lib/` has been extended to export:

| Function | Purpose |
|---|---|
| `decomp(lineSegmentsIntersect)` | Check if two line segments intersect |
| `decomp.lineIntersect(line1, line2)` | Find intersection point of two infinite lines |
| `decomp.makeCCW(polygon)` | Ensure counter-clockwise winding |
| `decomp.removeCollinearPoints(polygon)` | Remove collinear vertices |
| `decomp.quickDecomp(polygon)` | Fast concave→convex decomposition |
| `decomp.decomp(polygon)` | Optimal (slow) concave→convex decomposition |


---

## RAGDOLL

Select **Ragdoll** under Spawn and click to drop a stick figure. Six connected parts (head, torso, arms, legs) held together by constraints. They flop, fall, and can be blown apart by explosions.

Each body part cracks and shatters independently. Constraint joints are drawn as faint white lines.

---

## UNSTOPPABLE FORCE vs IMMOVABLE OBJECT

Two special bodies that demonstrate the classic physics paradox.

### Force (→ Force)
- **Indestructible** — immune to explosion damage
- Constantly accelerates to the right with unlimited thrust
- Passes through everything except the Immovable
- Rendered with a thrust arrow indicator

### Immovable (⎕ Immovable)
- **Cannot be moved** — static, infinite mass
- CAN be damaged by explosions AND by the Force pushing against it
- Cracks appear as the Force grinds into it
- When damage reaches 100%, it shatters into fragments

**Try it:** Spawn both, place the Immovable in front of the Force, and watch the paradox play out.

---

## SLINGSHOT LAUNCH

Drag any movable body away from its original position and release — it **slingshots back** toward where it started. The further you pull, the harder it launches.

A dashed pull-back line shows the trajectory while dragging. Works with any regular shape, ragdoll part, or fragment.

---

## BLACK HOLE

Select **Hole** under the Gravity tool. A super-powered gravity well that **destroys objects** on contact.

- 2× pull force, 450px range (vs 350px for regular wells)
- Objects entering the event horizon are vaporized with particles
- Rendered with pulsating rings and bright center

---

## SPRING TOOL (6)

Click a body → click another body (or empty space) to connect them with a stretchy constraint.

- **Body → Body**: Spring connecting two objects
- **Body → Space**: Anchors the body to a fixed point
- Stiffness slider: 0.01 (stretchy) → 0.50 (rigid)
- Selected body gets a dashed highlight outline
- Constraints draw as white lines

Use springs for pendulums, bridges, wrecking balls, or floppy ragdolls.

---

## VELOCITY CRUSHING

Falling heavy objects **crush** whatever's below them. Collision speed × mass translates into real damage. Drop a large square on a ragdoll and watch it crack and shatter on impact.

---

## DEVELOPMENT

```bash
git clone https://github.com/maxwarren929-png/physics-playground.git
cd physics-playground

# Open directly (CORS-free for local files):
open index.html

# Or with a local server:
npx serve .
```

No build step, no bundler, no dependencies. Just vanilla JS loaded via `<script>` tags.

### Adding features
- **New tool**: Add a case in `tools.js` `onMouseDown` + a button in `index.html` + an options group
- **New shape**: Make it via `Bodies.*` in `spawnShape` in `physics.js`
- **Physics tweaks**: Gravity, density, friction all in the `Engine.create` and body `opts` in `physics.js`

---

## KEYBOARD SHORTCUTS

| `1` | Spawn tool |
| `2` | Explode tool |
| `3` | Wall tool |
| `4` | Gravity well tool |
| `5` | Erase tool |
| `6` | Spring tool |
| `Space` | Pause / resume |
| `W` | Toggle wind |
| `X` | Cycle world size |
| `R` | Reset camera |
| Scroll | Zoom in / out |
| RClick drag | Pan the view |
| Click while Spawn active | If on a shape → drag, else → spawn |

---

## BUILT WITH

- **[Matter.js](https://brm.io/matter-js/)** v0.18.0 — 2D rigid body physics
- **[poly-decomp.js](https://github.com/schteppe/poly-decomp.js)** — Polygon decomposition
- Vanilla HTML / CSS / JS — no frameworks, no bundlers

## LICENSE

MIT
