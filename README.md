# ■ PHYSICS PLAYGROUND

A monochrome physics sandbox. Spawn rigid shapes, watch them crack under explosions, then shatter into irregular polygonal fragments. Pure black & white.

**[Try it live →](https://maxwarren929-png.github.io/physics-playground/)**

---

## TOOLS

| Key | Tool | Action |
|---|---|---|
| `1` | **SPAWN** | Click to place a shape. Circles, squares, triangles. Drag to move existing shapes. |
| `2` | **EXPLODE** | Click anywhere. Shapes near the blast crack; close enough and they shatter. |
| `3` | **WALL** | Click & drag to draw a static wall. Bouncy, immovable. |
| `4` | **GRAVITY** | Click to place a gravitational attractor. Pulses visually. |
| `5` | **ERASE** | Click a shape, fragment, or wall to remove it. |
| `Space` | **PAUSE** | Freeze / resume all physics. |
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

Damage is proportional to:
- **Explosion Power** slider (higher = more damage)
- **Distance** from blast center (closer = more damage)

### Stage 2: Shattering
When a shape's accumulated damage reaches 100%, it **fractures into irregular polygonal fragments**. The fracture is computed in real-time using **poly-decomp**:

1. The body's vertices are extracted as a polygon
2. **2–3 random cut lines** are generated through the body (angled, passing near the explosion point)
3. `decomp.lineSegmentsIntersect` finds where each cut line crosses the body's edges
4. `decomp.lineIntersect` computes exact intersection points
5. The polygon is split by walking the perimeter and inserting intersection points
6. Each fragment is created via `Bodies.fromVertices()` — irregular convex polygons of varying shapes

The result: fragments look like **actual broken chunks**, not perfect mini-shapes.

### Fragment behavior
- Fragments are labeled `Fragment` (vs `Shape` for intact bodies)
- They decay and disappear after **10–15 seconds**
- Fragments can be **shattered again** by another explosion
- Fragments collide with everything: walls, shapes, other fragments
- Max **6 fragments** per shatter (performance cap)

### Limits
- Shapes stop cracking at **20 cracks** (visual cap)
- 6 fragments max per shatter
- Fragments expire after 10–15 seconds

---

## PHYSICS

| Property | Value |
|---|---|
| Gravity | `y: 0.08` (very weak — floaty) |
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

| Key | Action |
|---|---|
| `1` | Spawn tool |
| `2` | Explode tool |
| `3` | Wall tool |
| `4` | Gravity well tool |
| `5` | Erase tool |
| `Space` | Pause / resume |
| Click while Spawn active | If clicking on an existing shape → drag it. Otherwise → spawn a new shape. |

---

## BUILT WITH

- **[Matter.js](https://brm.io/matter-js/)** v0.18.0 — 2D rigid body physics
- **[poly-decomp.js](https://github.com/schteppe/poly-decomp.js)** — Polygon decomposition
- Vanilla HTML / CSS / JS — no frameworks, no bundlers

## LICENSE

MIT
