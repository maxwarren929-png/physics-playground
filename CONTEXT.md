# PHYSICS PLAYGROUND — CONTEXT

## What is this?
A monochrome 2D physics sandbox for browser. Spawn rigid shapes, crack them with explosions, and watch them shatter into irregular polygonal fragments. Built for GitHub Pages.

## Tech Stack
- **Matter.js** v0.18.0 — 2D rigid body physics (served locally, no CDN)
- **poly-decomp.js** — Polygon splitting for fracture (schteppe, patched)
- Vanilla HTML/CSS/JS — no frameworks, no bundlers

## Key Architecture Decisions

### Why Matter.js v0.18.0 (not 0.19+)?
v0.19.0 from CDN caused `Cannot read properties of undefined (reading 'events')` in `MouseConstraint.create`. v0.18.0 works reliably with manual drag handling.

### Why manual drag (not MouseConstraint)?
`MouseConstraint.create(engine, ...)` crashes in v0.18.0 — tries to access `engine.render.canvas` which doesn't exist in our setup. Replaced with `startDrag/moveDrag/endDrag` using `Body.setPosition` and `Query.point`.

### Why poly-decomp for fracture?
There's no off-the-shelf Matter.js fracture library. `voronoi-breakable` exists but is a 2-star POC with hardcoded box sizes. The cut-shapes-demo shows polygon splitting via poly-decomp's `lineSegmentsIntersect` and `lineIntersect`. We adapted that approach: generate random cut lines, split body polygons sequentially, create fragments via `Bodies.fromVertices`.

### poly-decomp patch
The original poly-decomp.js UMD wrapper passes `f.exports` as the `module` parameter (should be `f`). Fixed by using `exports.X = fn` instead of `module.exports = {X: fn}`. Also added `lineSegmentsIntersect` and `lineIntersect` to the exports (they were internal functions).

### Gravity
Engine gravity is `y: 0.4`. Particle (screen-space) gravity is `vy += 0.08` per frame (≈4.8 units/sec² at 60fps).

## Visual Rules
- Black background, white shapes, gray strokes
- No colors, no pastels — strict B&W
- Damaged shapes: dimmer fill + dark crack lines
- Fragments: lighter fill + dimmer stroke (distinguishable from intact shapes)
- Font: monospace everywhere

## Physics Constants
- Shape density: 0.003, friction: 0.4, restitution: 0.2
- Fragment density: 0.002, friction: 0.6, restitution: 0.12
- Explosion radius: 250px
- Gravity wells: 350px range with linear falloff
- Boundary walls: 60px thick on all 4 edges

## Fracture Flow
1. Explosion applies damage to nearby shapes
2. Damage >= 100% → shatter
3. Body removed, 2-3 random cut lines generated
4. poly-decomp splits polygon along each cut line
5. Each result polygon → `Bodies.fromVertices` → Fragment body
6. Explosion velocity applied to each fragment
7. Fragments decay after 10-15 seconds

## File Roles
- `index.html` — DOM structure, toolbar, script loading order
- `css/style.css` — All styling
- `js/physics.js` — Engine init, body spawn, explosion, crack visual, fracture, render
- `js/particles.js` — Collision/explosion particle effects
- `js/tools.js` — Tool dispatch, mouse interaction per tool
- `js/app.js` — Init order, event binding, render loop
- `lib/matter.min.js` — Physics engine (v0.18.0)
- `lib/poly-decomp.js` — Polygon decomposition (patched)
- `favicon.png` — Prevents 404

## Git
- Remote: https://github.com/maxwarren929-png/physics-playground.git
- Pages: https://maxwarren929-png.github.io/physics-playground/
- Protocol: HTTPS (gh CLI authenticated)
