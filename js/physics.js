/**
 * Physics Playground — Physics Engine (Matter.js wrapper)
 *
 * Spawns rigid shapes (circle, rect, triangle) that crack under
 * explosion damage and shatter into irregular polygonal fragments
 * via poly-decomp polygon splitting.
 *
 * Features: camera zoom/pan, configurable world size, wind force,
 * explosion shockwave, collision particles.
 *
 * Exports: physics object with init, spawnShape, explode, drawWall,
 * addGravityWell, removeBody, clearAll, getBodyAt, getObjectCount,
 * update, togglePause, drag helpers, camera controls, world size,
 * wind toggle, and shockwave access.
 *
 * Dependencies: Matter.js (global), decomp (global/poly-decomp), Particles
 */

const Physics = (() => {
  const { Engine, Runner, Bodies, Body, Composite, Events, Query, Vertices, Constraint, Vector } = Matter;

  let engine, world, runner;
  let canvas, ctx;
  let gravityWells = [];
  let forceBodies = [];
  let boundaryBreachTimers = {};
  let mouseX = 0, mouseY = 0;
  let dragBody = null;
  let dragOffset = { x: 0, y: 0 };
  let dragStartPos = null;
  let springBodyA = null;
  let decayTimers = {};
  let decayInterval = null;

  // ── Camera ──
  const camera = { x: 800, y: 600, zoom: 1 };

  // ── World sizes ──
  const WORLD_SIZES = {
    small:  { w: 1600, h: 1200, label: 'SMALL' },
    medium: { w: 3200, h: 2400, label: 'MEDIUM' },
    large:  { w: 6400, h: 4800, label: 'LARGE' }
  };
  let worldSizeKey = 'small';
  let worldW = 1600, worldH = 1200;

  // ── Wind ──
  let windEnabled = false;
  let windStrength = 0.0004;
  let windAngle = 0; // 0 = right, PI/2 = down

  // ── Shockwaves ──
  let shockwaves = [];
  let shockwaveHandler = null;

  // ── Performance ──
  let frameCount = 0, lastFpsTime = performance.now(), currentFps = 0;

  function init(canvasEl) {
    try {
      canvas = canvasEl;
      ctx = canvas.getContext('2d');
      resize();
      window.addEventListener('resize', resize);

      engine = Engine.create({ gravity: { x: 0, y: 0.4 } });
      world = engine.world;

      applyWorldSize('small');
      setupWind();

      startDecayCleanup();

      runner = Runner.create();
      Runner.run(runner, engine);
      Events.on(engine, 'collisionStart', (event) => {
        event.pairs.forEach(pair => {
          const { bodyA, bodyB } = pair;

          // Velocity-based crushing damage
          const vx = bodyA.velocity.x - bodyB.velocity.x;
          const vy = bodyA.velocity.y - bodyB.velocity.y;
          const speed = Math.sqrt(vx * vx + vy * vy);
          const impact = speed * Math.max(bodyA.mass, bodyB.mass) * 3;

          const applyCrush = (b) => {
            if ((b.label === 'Shape' || b.label === 'Ragdoll') && !b.isStatic && impact > 0.5) {
              b._damage = (b._damage || 0) + impact;
              if (!b._cracks) b._cracks = [];
              // Add a crack from the impact
              b._cracks.push({
                x1: bodyA.position.x, y1: bodyA.position.y,
                x2: b.position.x, y2: b.position.y
              });
              if (b._cracks.length > 20) b._cracks = b._cracks.slice(-20);
              if (b._damage >= 1) {
                // Shatter on heavy impact
                const bt = bodyA.velocity.y > 0 ? bodyA : bodyB;
                shatterBody(b, bt.position.x, bt.position.y, impact, 0);
                return;
              }
            }
            if ((b.label === 'Shape' || b.label === 'Fragment' || b.label === 'Ragdoll') && !b.isStatic)
              Particles.spawn(b.position.x, b.position.y, 1);
          };

          applyCrush(bodyA);
          applyCrush(bodyB);
        });
      });

      return physics;
    } catch(e) {
      console.error('Physics.init failed:', e.message);
      return null;
    }
  }

  // ── World size ──
  function applyWorldSize(key) {
    worldSizeKey = key;
    const s = WORLD_SIZES[key];
    worldW = s.w; worldH = s.h;

    // Center camera on world
    camera.x = worldW / 2;
    camera.y = worldH / 2;
    camera.zoom = Math.min(canvas.width / worldW, canvas.height / worldH) * 0.95;

    if (engine) rebuildBoundaries();
  }

  function getWorldSizes() { return WORLD_SIZES; }
  function getWorldSizeKey() { return worldSizeKey; }

  // ── Boundaries ──
  let boundaryBodies = [];
  function createBoundaries() {
    const t = 60;
    const opts = { isStatic: true, restitution: 0.3, label: 'Boundary' };
    boundaryBodies = [
      Bodies.rectangle(worldW / 2, worldH + t / 2, worldW + t * 2, t, opts),
      Bodies.rectangle(-t / 2, worldH / 2, t, worldH + t * 2, opts),
      Bodies.rectangle(worldW + t / 2, worldH / 2, t, worldH + t * 2, opts),
      Bodies.rectangle(worldW / 2, -t / 2, worldW + t * 2, t, opts),
    ];
    if (world) Composite.add(world, boundaryBodies);
  }
  function rebuildBoundaries() {
    boundaryBodies.forEach(b => { try { Composite.remove(world, b); } catch(e) {} });
    createBoundaries();
  }

  // ── Camera ──
  function screenToWorld(sx, sy) {
    // sx, sy are canvas-relative pixel coordinates
    return {
      x: (sx - canvas.width / 2) / camera.zoom + camera.x,
      y: (sy - canvas.height / 2) / camera.zoom + camera.y
    };
  }

  function handleZoom(delta, sx, sy) {
    const factor = delta > 0 ? 0.9 : 1 / 0.9;
    const newZoom = Math.max(0.08, Math.min(20, camera.zoom * factor));
    // Keep point under mouse stationary
    const wx = (sx - canvas.width / 2) / camera.zoom + camera.x;
    const wy = (sy - canvas.height / 2) / camera.zoom + camera.y;
    camera.zoom = newZoom;
    camera.x = wx - (sx - canvas.width / 2) / camera.zoom;
    camera.y = wy - (sy - canvas.height / 2) / camera.zoom;
  }

  function panCamera(dx, dy) {
    camera.x -= dx / camera.zoom;
    camera.y -= dy / camera.zoom;
  }

  function resetCamera() {
    camera.x = worldW / 2;
    camera.y = worldH / 2;
    camera.zoom = Math.min(canvas.width / worldW, canvas.height / worldH) * 0.95;
  }

  function getCamera() { return camera; }

  // ── Wind ──
  function setupWind() {
    if (shockwaveHandler) Events.off(engine, 'beforeUpdate', shockwaveHandler);
    shockwaveHandler = Events.on(engine, 'beforeUpdate', () => {
      // Wind
      if (windEnabled) {
        const bodies = Composite.allBodies(world);
        const fx = Math.cos(windAngle) * windStrength;
        const fy = Math.sin(windAngle) * windStrength;
        bodies.forEach(b => {
          if (!b.isStatic && b.label !== 'Boundary' && b.label !== 'GravityWell')
            Body.applyForce(b, b.position, { x: fx, y: fy });
        });
      }
      // Shockwave decay
      shockwaves = shockwaves.filter(sw => {
        sw.radius += sw.speed;
        sw.life -= sw.decay;
        return sw.life > 0;
      });
    });
  }

  function toggleWind(on) { windEnabled = on; }
  function isWindEnabled() { return windEnabled; }
  function setWindStrength(s) { windStrength = s; }
  function setWindAngle(a) { windAngle = a; }
  function getWindAngle() { return windAngle; }

  // ── Shockwave ──
  function addShockwave(x, y, maxRadius) {
    shockwaves.push({ x, y, radius: 0, maxRadius: maxRadius || 200, speed: 6, life: 1, decay: 0.015 });
  }

  // ── Resize ──
  function resize() {
    const oldW = canvas.width, oldH = canvas.height;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (engine) rebuildBoundaries();
  }

  // ── Drag + Slingshot ──
  function startDrag(x, y) {
    const p = screenToWorld(x, y);
    const body = getBodyAt(p.x, p.y);
    if (body) {
      dragBody = body;
      dragOffset = { x: body.position.x - p.x, y: body.position.y - p.y };
      dragStartPos = { x: body.position.x, y: body.position.y };
      Body.setStatic(body, false);
      return true;
    }
    return false;
  }
  function moveDrag(x, y) {
    if (dragBody) {
      const p = screenToWorld(x, y);
      let nx = p.x + dragOffset.x;
      let ny = p.y + dragOffset.y;
      nx = Math.max(20, Math.min(worldW - 20, nx));
      ny = Math.max(20, Math.min(worldH - 20, ny));
      Body.setPosition(dragBody, { x: nx, y: ny });
      Body.setVelocity(dragBody, { x: 0, y: 0 });
    }
  }
  function endDrag() {
    if (dragBody && dragStartPos) {
      // Slingshot launch
      const dx = dragStartPos.x - dragBody.position.x;
      const dy = dragStartPos.y - dragBody.position.y;
      const pull = Math.sqrt(dx * dx + dy * dy);
      if (pull > 15) {
        const scale = Math.min(pull / 80, 3);
        Body.setVelocity(dragBody, { x: dx * scale, y: dy * scale });
      }
    }
    dragBody = null;
    dragStartPos = null;
  }
  function isDragging() { return dragBody !== null; }

  // ── Spawn ──
  function spawnShape(x, y, type, size) {
    const s = size || 8;
    const radius = 8 + s * 3.5;
    const opts = { restitution: 0.2, friction: 0.4, density: 0.003, label: 'Shape' };
    let body;
    switch (type) {
      case 'circle':  body = Bodies.circle(x, y, radius, opts); break;
      case 'rect':    body = Bodies.rectangle(x, y, radius * 2, radius * 2, opts); break;
      case 'triangle': body = Bodies.polygon(x, y, 3, radius, opts); break;
    }
    if (body) { body._damage = 0; body._cracks = []; Composite.add(world, body); }
    return body;
  }

  // ── Ragdoll ──
  function spawnRagdoll(x, y, scale) {
    const s = (scale || 8) * 3.5;
    const opts = { restitution: 0.1, friction: 0.6, density: 0.002, label: 'Ragdoll' };
    const parts = [];

    // Head
    const head = Bodies.circle(x, y - s * 1.6, s * 0.4, opts);
    head._damage = 0; head._cracks = [];
    parts.push(head);

    // Torso
    const torso = Bodies.rectangle(x, y, s * 0.7, s * 1.2, opts);
    torso._damage = 0; torso._cracks = [];
    parts.push(torso);

    // Left Arm
    const larm = Bodies.rectangle(x - s * 0.8, y - s * 0.3, s * 0.6, s * 0.25, opts);
    larm._damage = 0; larm._cracks = [];
    parts.push(larm);

    // Right Arm
    const rarm = Bodies.rectangle(x + s * 0.8, y - s * 0.3, s * 0.6, s * 0.25, opts);
    rarm._damage = 0; rarm._cracks = [];
    parts.push(rarm);

    // Left Leg
    const lleg = Bodies.rectangle(x - s * 0.25, y + s * 1.1, s * 0.25, s * 0.7, opts);
    lleg._damage = 0; lleg._cracks = [];
    parts.push(lleg);

    // Right Leg
    const rleg = Bodies.rectangle(x + s * 0.25, y + s * 1.1, s * 0.25, s * 0.7, opts);
    rleg._damage = 0; rleg._cracks = [];
    parts.push(rleg);

    Composite.add(world, parts);

    // Constraints (joints)
    const constraints = [
      { bodyA: head,  bodyB: torso, pointA: { x: 0, y: s * 0.4 },  pointB: { x: 0, y: -s * 0.6 }, stiffness: 0.6 },
      { bodyA: torso, bodyB: larm,  pointA: { x: -s * 0.35, y: -s * 0.3 }, pointB: { x: s * 0.3, y: 0 },  stiffness: 0.4 },
      { bodyA: torso, bodyB: rarm,  pointA: { x: s * 0.35, y: -s * 0.3 },  pointB: { x: -s * 0.3, y: 0 }, stiffness: 0.4 },
      { bodyA: torso, bodyB: lleg,  pointA: { x: -s * 0.15, y: s * 0.6 },  pointB: { x: 0, y: -s * 0.35 }, stiffness: 0.5 },
      { bodyA: torso, bodyB: rleg,  pointA: { x: s * 0.15, y: s * 0.6 },   pointB: { x: 0, y: -s * 0.35 }, stiffness: 0.5 },
    ];

    constraints.forEach(c => {
      const con = Constraint.create({
        bodyA: c.bodyA, bodyB: c.bodyB,
        pointA: c.pointA, pointB: c.pointB,
        stiffness: c.stiffness, damping: 0.1, length: 2
      });
      Composite.add(world, con);
    });

    return parts;
  }

  // ── Unstoppable Force ──
  function spawnForce(x, y) {
    const body = Bodies.circle(x, y, 24, {
      restitution: 0, friction: 0, density: 0.05, label: 'Force', frictionAir: 0
    });
    body._damage = 0; body._cracks = [];
    Composite.add(world, body);

    const handler = Events.on(engine, 'beforeUpdate', () => {
      // Constant thrust to the right
      Body.applyForce(body, body.position, { x: 0.003 * body.mass, y: 0 });

      const allBodies = Composite.allBodies(world);

      // Destroy walls the Force is grinding against
      allBodies.forEach(b => {
        if (b.label === 'Wall') {
          const dx = body.position.x - b.position.x;
          const dy = body.position.y - b.position.y;
          if (Math.abs(dx) < 50 && Math.abs(dy) < 50) {
            shatterBody(b, b.position.x, b.position.y, 0.5, 0);
          }
        }
      });

      // Breach boundaries — temporarily remove the wall segment the Force is pushing on
      allBodies.forEach(b => {
        if (b.label === 'Boundary' && body.position.x > -50 && body.position.x < worldW + 50 && body.position.y > -50 && body.position.y < worldH + 50) {
          const dx = body.position.x - b.position.x;
          const dy = body.position.y - b.position.y;
          const halfW = (b.bounds.max.x - b.bounds.min.x) / 2;
          const halfH = (b.bounds.max.y - b.bounds.min.y) / 2;
          // Check if Force is touching this boundary segment
          const onEdge = (Math.abs(dx) < halfW + 10 && Math.abs(dy) < halfH + 10);
          if (onEdge && !boundaryBreachTimers[b.id]) {
            boundaryBreachTimers[b.id] = { body: b, respawnAt: Date.now() + 2000 };
            Composite.remove(world, b);
          }
        }
      });

      // Damage any Immovable it's crushing into
      allBodies.forEach(b => {
        if (b.label === 'Immovable') {
          const dx = body.position.x - b.position.x;
          const dy = body.position.y - b.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 72) {
            b._damage = (b._damage || 0) + 0.005;
            if (Math.random() < 0.03 && b._cracks) {
              b._cracks.push({
                x1: body.position.x, y1: body.position.y,
                x2: b.position.x, y2: b.position.y
              });
              if (b._cracks.length > 20) b._cracks = b._cracks.slice(-20);
            }
            if (b._damage >= 1) {
              shatterBody(b, b.position.x, b.position.y, 0.5, 0);
            }
          }
        }
      });
    });
    body._handler = handler;
    forceBodies.push(body);
    return body;
  }

  // ── Immovable Object ──
  function spawnImmovable(x, y) {
    const body = Bodies.rectangle(x, y, 80, 80, {
      isStatic: true, restitution: 1, friction: 1, label: 'Immovable', density: 1
    });
    body._damage = 0; body._cracks = [];
    Composite.add(world, body);
    return body;
  }

  // ── Explosion ──
  function explode(x, y, force) {
    const f = force || 0.3;
    const radius = 250;
    const bodies = Composite.allBodies(world);
    const toShatter = [];

    bodies.forEach(body => {
      if (body.label === 'Boundary' || body.label === 'GravityWell') return;
      if (body.isStatic && body.label !== 'Immovable') return;

      const dx = body.position.x - x, dy = body.position.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < radius) {
        const power = (1 - dist / radius) * f;

        if (body.label === 'Force') {
          // Force is immune to damage, still gets pushed around
          Body.applyForce(body, body.position, { x: (dx / (dist || 1)) * power * 2, y: (dy / (dist || 1)) * power * 2 });
        } else if (body.label === 'Shape' || body.label === 'Ragdoll' || body.label === 'Immovable') {
          body._damage = (body._damage || 0) + power * 2.5;
          addCracks(body, x, y, power);
          if (body._damage >= 1) toShatter.push({ body, dist, power, dx, dy });
          else if (body.label !== 'Immovable') Body.applyForce(body, body.position, { x: (dx / (dist || 1)) * power, y: (dy / (dist || 1)) * power });
        } else if (body.label === 'Fragment') {
          body._damage = (body._damage || 0) + power * 3;
          if (body._damage >= 1) toShatter.push({ body, dist, power, dx, dy });
          else Body.applyForce(body, body.position, { x: (dx / (dist || 1)) * power, y: (dy / (dist || 1)) * power });
        } else {
          Body.applyForce(body, body.position, { x: (dx / (dist || 1)) * power, y: (dy / (dist || 1)) * power });
        }
      }
    });

    toShatter.forEach(({ body, dist }) => shatterBody(body, x, y, f, dist));
    addShockwave(x, y, 200);
    Particles.spawn(x, y, 20, { speed: 7 });
    Particles.spawn(x, y, 10, { speed: 4 });
  }

  // ── Cracks ──
  function addCracks(body, explosionX, explosionY, power) {
    if (!body._cracks) body._cracks = [];
    const verts = body.vertices, cx = body.position.x, cy = body.position.y;
    let closestDist = Infinity, closestIdx = 0;
    verts.forEach((v, i) => {
      const d = (v.x - explosionX) ** 2 + (v.y - explosionY) ** 2;
      if (d < closestDist) { closestDist = d; closestIdx = i; }
    });
    for (let i = 0; i < 1 + Math.floor(power * 3); i++) {
      const edgeIdx = (closestIdx + Math.floor(Math.random() * 3 - 1) + verts.length) % verts.length;
      const nextIdx = (edgeIdx + 1) % verts.length;
      const t = Math.random();
      const sx = verts[edgeIdx].x + (verts[nextIdx].x - verts[edgeIdx].x) * t;
      const sy = verts[edgeIdx].y + (verts[nextIdx].y - verts[edgeIdx].y) * t;
      const inward = 0.3 + Math.random() * 0.5;
      body._cracks.push({
        x1: sx, y1: sy,
        x2: cx + (sx - cx) * (1 - inward) + (Math.random() - 0.5) * 8,
        y2: cy + (sy - cy) * (1 - inward) + (Math.random() - 0.5) * 8
      });
    }
    if (body._cracks.length > 20) body._cracks = body._cracks.slice(-20);
  }

  // ── Fracture ──
  function shatterBody(body, explosionX, explosionY, force, dist) {
    const verts = body.vertices, pos = body.position;
    Composite.remove(world, body);
    const poly = verts.map(v => [v.x, v.y]);
    decomp.makeCCW(poly);
    decomp.removeCollinearPoints(poly, 0.1);

    const cuts = [];
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
      const angle = (Math.PI / 2) * i + Math.random() * 0.8;
      const len = 800;
      const cx = explosionX + (Math.random() - 0.5) * 20;
      const cy = explosionY + (Math.random() - 0.5) * 20;
      cuts.push([[cx + Math.cos(angle) * len, cy + Math.sin(angle) * len],
                 [cx - Math.cos(angle) * len, cy - Math.sin(angle) * len]]);
    }

    let fragments = [poly];
    for (const cut of cuts) {
      const next = [];
      for (const frag of fragments) {
        const split = splitPolygon(frag, cut);
        next.push(...split);
      }
      fragments = next;
    }

    fragments = fragments.filter(p => {
      if (p.length < 3) return false;
      let area = 0;
      for (let i = 0; i < p.length; i++) { const j = (i + 1) % p.length; area += p[i][0] * p[j][1] - p[j][0] * p[i][1]; }
      return Math.abs(area) / 2 > 150;
    });

    if (fragments.length > 8) {
      fragments.sort((a, b) => { let aa = 0, ba = 0;
        for (let i = 0; i < a.length; i++) { const j = (i + 1) % a.length; aa += a[i][0] * a[j][1] - a[j][0] * a[i][1]; }
        for (let i = 0; i < b.length; i++) { const j = (i + 1) % b.length; ba += b[i][0] * b[j][1] - b[j][0] * b[i][1]; }
        return Math.abs(ba) - Math.abs(aa); });
      fragments = fragments.slice(0, 8);
    }

    let fragCount = 0;
    for (const fp of fragments) {
      const fv = fp.map(p => ({ x: p[0], y: p[1] }));
      const centre = Vertices.centre(fv);
      try {
        const frag = Bodies.fromVertices(centre.x, centre.y, [fv], {
          restitution: 0.12, friction: 0.6, density: 0.002, label: 'Fragment'
        });
        if (frag) {
          const fdx = centre.x - explosionX, fdy = centre.y - explosionY;
          const fd = Math.sqrt(fdx * fdx + fdy * fdy) || 1;
          const power = (1 - dist / 250) * force * 0.5;
          Body.setVelocity(frag, {
            x: (fdx / fd) * power * (0.6 + Math.random() * 0.8),
            y: (fdy / fd) * power * (0.6 + Math.random() * 0.8) - 1.5
          });
          Body.setAngularVelocity(frag, (Math.random() - 0.5) * 0.15);
          frag._damage = 0;
          Composite.add(world, frag);
          decayTimers[frag.id] = Date.now() + 10000 + Math.random() * 5000;
          if (++fragCount >= 6) break;
        }
      } catch(e) {}
    }
    Particles.spawn(pos.x, pos.y, 8, { speed: 6 });
  }

  function splitPolygon(polygon, cutLine) {
    const n = polygon.length;
    const intersections = [], indices = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (decomp.lineSegmentsIntersect(polygon[i], polygon[j], cutLine[0], cutLine[1])) {
        const pt = decomp.lineIntersect(cutLine, [polygon[i], polygon[j]]);
        if (pt && isFinite(pt[0]) && isFinite(pt[1])) {
          const dup = intersections.some(ex => Math.abs(ex[0] - pt[0]) < 2 && Math.abs(ex[1] - pt[1]) < 2);
          if (!dup) { intersections.push(pt); indices.push(i); }
        }
      }
    }
    if (intersections.length < 2) return [polygon];
    let bestI = 0, bestJ = 1, bestDist = 0;
    for (let a = 0; a < intersections.length; a++)
      for (let b = a + 1; b < intersections.length; b++) {
        const d = (intersections[a][0] - intersections[b][0])**2 + (intersections[a][1] - intersections[b][1])**2;
        if (d > bestDist) { bestDist = d; bestI = a; bestJ = b; }
      }
    let idxA = indices[bestI], idxB = indices[bestJ];
    let ptA = intersections[bestI], ptB = intersections[bestJ];
    if (idxA > idxB) { [idxA, idxB] = [idxB, idxA]; [ptA, ptB] = [ptB, ptA]; }
    const poly1 = [ptA]; for (let i = idxA + 1; i <= idxB; i++) poly1.push(polygon[i]); poly1.push(ptB);
    const poly2 = [ptB]; for (let i = idxB + 1; i < n; i++) poly2.push(polygon[i]); for (let i = 0; i <= idxA; i++) poly2.push(polygon[i]); poly2.push(ptA);
    const result = [];
    for (const p of [poly1, poly2]) {
      const clean = [];
      for (let i = 0; i < p.length; i++) {
        const prev = clean[clean.length - 1];
        if (!prev || Math.abs(prev[0] - p[i][0]) > 1 || Math.abs(prev[1] - p[i][1]) > 1) clean.push(p[i]);
      }
      if (clean.length >= 3) result.push(clean);
    }
    return result;
  }

  // ── Decay cleanup ──
  function startDecayCleanup() {
    if (decayInterval) return;
    decayInterval = setInterval(() => {
      const now = Date.now();
      for (const id of Object.keys(decayTimers)) {
        if (now > decayTimers[id]) {
          const b = Composite.get(world, parseInt(id), 'body');
          if (b) Composite.remove(world, b);
          delete decayTimers[id];
        }
      }
    }, 1000);
  }

  // ── Wall ──
  function drawWall(x1, y1, x2, y2) {
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    const w = Math.max(Math.abs(x2 - x1) + 10, 12);
    const h = Math.max(Math.abs(y2 - y1) + 10, 12);
    const wall = Bodies.rectangle(cx, cy, w, h, { isStatic: true, restitution: 0.2, friction: 0.9, label: 'Wall' });
    Composite.add(world, wall);
    return wall;
  }

  // ── Gravity Well ──
  function addGravityWell(x, y, strength) {
    const str = strength || 12;
    const well = Bodies.circle(x, y, 16, { isStatic: true, label: 'GravityWell', collisionFilter: { group: -1 } });
    Composite.add(world, well);
    const handler = Events.on(engine, 'beforeUpdate', () => {
      const allBodies = Composite.allBodies(world);
      allBodies.forEach(body => {
        if (body === well || body.isStatic || body.label === 'Boundary') return;
        const dx = well.position.x - body.position.x;
        const dy = well.position.y - body.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 8 && dist < 350) {
          // Quadratic falloff + mass normalization + cap to prevent jitter
          const norm = dist / 350;
          const falloff = (1 - norm) * (1 - norm);
          let force = (str / (body.mass || 1)) * falloff;
          force = Math.min(force, 0.03); // hard cap to prevent freakout
          Body.applyForce(body, body.position, {
            x: (dx / dist) * force,
            y: (dy / dist) * force
          });
        }
      });
    });
    well._handler = handler;
    gravityWells.push(well);
    return well;
  }

  // ── Black Hole ──
  function addBlackHole(x, y, strength) {
    const str = strength || 15;
    const well = Bodies.circle(x, y, 24, { isStatic: true, label: 'BlackHole', collisionFilter: { group: -1 } });
    Composite.add(world, well);
    const range = 450;
    const handler = Events.on(engine, 'beforeUpdate', () => {
      const allBodies = Composite.allBodies(world);
      allBodies.forEach(body => {
        if (body === well || body.isStatic || body.label === 'Boundary') return;
        const dx = well.position.x - body.position.x;
        const dy = well.position.y - body.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 5 && dist < range) {
          const norm = dist / range;
          const falloff = (1 - norm) * (1 - norm);
          let force = (str * 2 / (body.mass || 1)) * falloff;
          force = Math.min(force, 0.08);
          Body.applyForce(body, body.position, {
            x: (dx / dist) * force,
            y: (dy / dist) * force
          });
          // Destroy objects that enter the event horizon
          if (dist < 28) {
            if (body._handler) Events.off(engine, 'beforeUpdate', body._handler);
            delete decayTimers[body.id];
            forceBodies = forceBodies.filter(b => b !== body);
            Particles.spawn(body.position.x, body.position.y, 12, { speed: 6 });
            Composite.remove(world, body);
          }
        }
      });
    });
    well._handler = handler;
    gravityWells.push(well);
    return well;
  }

  // ── Spring Tool ──
  function getSpringBodyA() { return springBodyA; }
  function setSpringBodyA(body) { springBodyA = body; }
  function clearSpringBodyA() { springBodyA = null; }

  function addSpringConstraint(bodyA, bodyB, stiffness) {
    const con = Constraint.create({
      bodyA: bodyA,
      pointA: { x: 0, y: 0 },
      bodyB: bodyB,
      pointB: { x: 0, y: 0 },
      stiffness: stiffness || 0.05,
      damping: 0.05,
      length: null // auto-calculated from distance
    });
    Composite.add(world, con);
    return con;
  }

  function addAnchoredSpring(bodyA, worldX, worldY, stiffness) {
    // Create a static point body as anchor
    const anchor = Bodies.circle(worldX, worldY, 4, {
      isStatic: true, label: 'Anchor', collisionFilter: { group: -1 }
    });
    Composite.add(world, anchor);
    const con = Constraint.create({
      bodyA: bodyA,
      pointA: { x: 0, y: 0 },
      bodyB: anchor,
      pointB: { x: 0, y: 0 },
      stiffness: stiffness || 0.05,
      damping: 0.05
    });
    Composite.add(world, con);
    return con;
  }

  function removeBody(body) {
    if (body._handler) Events.off(engine, 'beforeUpdate', body._handler);
    delete decayTimers[body.id];
    forceBodies = forceBodies.filter(b => b !== body);
    Composite.remove(world, body);
  }

  function clearAll() {
    decayTimers = {};
    shockwaves = [];
    forceBodies = [];
    boundaryBreachTimers = {};
    const bodies = Composite.allBodies(world).slice();
    bodies.forEach(b => {
      if (b.label !== 'Boundary') {
        if (b._handler) Events.off(engine, 'beforeUpdate', b._handler);
        Composite.remove(world, b);
      }
    });
    gravityWells = []; Particles.clear();
  }

  function getBodyAt(x, y) {
    const bodies = Composite.allBodies(world);
    const found = Query.point(bodies, { x, y });
    return found.find(b => !b.isStatic && b.label !== 'Boundary' && b.label !== 'GravityWell') || null;
  }

  function getObjectCount() {
    return Composite.allBodies(world).filter(b => b.label !== 'Boundary').length;
  }

  function setMousePos(x, y) { mouseX = x; mouseY = y; }

  // ── Render ──
  function update() {
    // Respawn breached boundaries
    const now = Date.now();
    for (const id of Object.keys(boundaryBreachTimers)) {
      const entry = boundaryBreachTimers[id];
      if (now >= entry.respawnAt) {
        // Recreate that boundary segment
        const t = 60;
        const opts = { isStatic: true, restitution: 0.3, label: 'Boundary' };
        let newB = null;
        // Figure out which edge it was from position
        const x = entry.body.position.x;
        const y = entry.body.position.y;
        // Check proximity to each edge
        const eps = 5;
        if (Math.abs(y - (worldH + t/2)) < eps)
          newB = Bodies.rectangle(worldW/2, worldH + t/2, worldW + t*2, t, opts);
        else if (Math.abs(y - (-t/2)) < eps)
          newB = Bodies.rectangle(worldW/2, -t/2, worldW + t*2, t, opts);
        else if (Math.abs(x - (-t/2)) < eps)
          newB = Bodies.rectangle(-t/2, worldH/2, t, worldH + t*2, opts);
        else if (Math.abs(x - (worldW + t/2)) < eps)
          newB = Bodies.rectangle(worldW + t/2, worldH/2, t, worldH + t*2, opts);

        if (newB) {
          boundaryBodies = boundaryBodies.map(b => b === entry.body ? newB : b);
          Composite.add(world, newB);
        }
        delete boundaryBreachTimers[id];
      }
    }
    const bodies = Composite.allBodies(world);

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ── Camera transform ──
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // Grid (world-space)
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    const gridStep = 32;
    const viewLeft = camera.x - canvas.width / 2 / camera.zoom;
    const viewTop = camera.y - canvas.height / 2 / camera.zoom;
    const viewRight = camera.x + canvas.width / 2 / camera.zoom;
    const viewBottom = camera.y + canvas.height / 2 / camera.zoom;
    const gs = Math.max(gridStep, Math.round(gridStep / camera.zoom));
    for (let x = Math.max(0, Math.floor(viewLeft / gs) * gs); x < Math.min(worldW, viewRight); x += gs) {
      ctx.beginPath(); ctx.moveTo(x, Math.max(0, viewTop)); ctx.lineTo(x, Math.min(worldH, viewBottom)); ctx.stroke();
    }
    for (let y = Math.max(0, Math.floor(viewTop / gs) * gs); y < Math.min(worldH, viewBottom); y += gs) {
      ctx.beginPath(); ctx.moveTo(Math.max(0, viewLeft), y); ctx.lineTo(Math.min(worldW, viewRight), y); ctx.stroke();
    }

    // World boundary indicator (faint outline)
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, worldW, worldH);

    // Gravity wells
    bodies.forEach(b => { if (b.label === 'GravityWell') drawGravityWell(b); });

    // Black holes
    bodies.forEach(b => {
      if (b.label === 'BlackHole') {
        const x = b.position.x, y = b.position.y;
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 300);
        ctx.strokeStyle = `rgba(255,255,255,${0.06 * pulse})`;
        ctx.lineWidth = 1;
        for (let i = 5; i >= 0; i--) {
          const r = 28 + i * 12 * pulse;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        const grad = ctx.createRadialGradient(x, y, 0, x, y, 28);
        grad.addColorStop(0, 'rgba(255,255,255,0.5)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0.15)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.beginPath(); ctx.arc(x, y, 28, 0, Math.PI * 2);
        ctx.fillStyle = grad; ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Spring body A highlight
    if (springBodyA) {
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6 / camera.zoom, 4 / camera.zoom]);
      const verts = springBodyA.vertices;
      ctx.beginPath(); ctx.moveTo(verts[0].x, verts[0].y);
      for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
      ctx.closePath(); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Slingshot pull-back line
    if (dragBody && dragStartPos) {
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4 / camera.zoom, 4 / camera.zoom]);
      ctx.beginPath();
      ctx.moveTo(dragBody.position.x, dragBody.position.y);
      ctx.lineTo(dragStartPos.x, dragStartPos.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Walls
    bodies.forEach(b => { if (b.label === 'Wall') drawBody(b, '#333', '#222'); });

    // Shapes (with cracks)
    bodies.forEach(b => {
      if (b.label === 'Shape') {
        drawBody(b, b._damage > 0 ? '#eee' : '#fff', '#555');
        if (b._cracks && b._cracks.length > 0) {
          ctx.strokeStyle = `rgba(0,0,0,${0.3 + b._damage * 0.5})`;
          ctx.lineWidth = 1;
          b._cracks.forEach(c => { ctx.beginPath(); ctx.moveTo(c.x1, c.y1); ctx.lineTo(c.x2, c.y2); ctx.stroke(); });
        }
      }
    });

    // Ragdolls (with constraints)
    bodies.forEach(b => {
      if (b.label === 'Ragdoll') {
        drawBody(b, b._damage > 0 ? '#eee' : '#fff', '#888');
        if (b._cracks && b._cracks.length > 0) {
          ctx.strokeStyle = `rgba(0,0,0,${0.3 + b._damage * 0.5})`;
          ctx.lineWidth = 1;
          b._cracks.forEach(c => { ctx.beginPath(); ctx.moveTo(c.x1, c.y1); ctx.lineTo(c.x2, c.y2); ctx.stroke(); });
        }
      }
    });

    // Ragdoll constraint lines
    const constraints = Composite.allConstraints(world);
    constraints.forEach(con => {
      if (!con.bodyA || !con.bodyB) return;
      const ax = con.bodyA.position.x + (con.pointA ? con.pointA.x : 0);
      const ay = con.bodyA.position.y + (con.pointA ? con.pointA.y : 0);
      const bx = con.bodyB.position.x + (con.pointB ? con.pointB.x : 0);
      const by = con.bodyB.position.y + (con.pointB ? con.pointB.y : 0);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    });

    // Force bodies
    bodies.forEach(b => {
      if (b.label === 'Force') {
        drawBody(b, '#fff', '#aaa');
        // Draw arrow indicating thrust direction
        const arrowLen = 30;
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(b.position.x + 24, b.position.y);
        ctx.lineTo(b.position.x + 24 + arrowLen, b.position.y);
        ctx.stroke();
        // Arrowhead
        ctx.beginPath();
        ctx.moveTo(b.position.x + 24 + arrowLen, b.position.y);
        ctx.lineTo(b.position.x + 24 + arrowLen - 8, b.position.y - 5);
        ctx.moveTo(b.position.x + 24 + arrowLen, b.position.y);
        ctx.lineTo(b.position.x + 24 + arrowLen - 8, b.position.y + 5);
        ctx.stroke();
      }
    });

    // Immovable bodies
    bodies.forEach(b => {
      if (b.label === 'Immovable') {
        drawBody(b, '#fff', '#fff');
        // Additional inner border
        const verts = b.vertices;
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const cx = b.position.x, cy = b.position.y;
        const w = 60, h = 60;
        ctx.rect(cx - w/2, cy - h/2, w, h);
        ctx.stroke();
        if (b._cracks && b._cracks.length > 0) {
          ctx.strokeStyle = `rgba(0,0,0,${0.3 + b._damage * 0.5})`;
          ctx.lineWidth = 1;
          b._cracks.forEach(c => { ctx.beginPath(); ctx.moveTo(c.x1, c.y1); ctx.lineTo(c.x2, c.y2); ctx.stroke(); });
        }
      }
    });

    // Fragments
    bodies.forEach(b => { if (b.label === 'Fragment') drawBody(b, '#ddd', '#777'); });

    // Shockwaves
    shockwaves.forEach(sw => {
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${sw.life * 0.4})`;
      ctx.lineWidth = Math.max(1, 3 * sw.life);
      ctx.stroke();
    });

    ctx.restore(); // ── End camera transform ──

    // ── HUD (screen-space) ──
    // Wall preview
    const tool = typeof Tools !== 'undefined' ? Tools.getCurrentTool() : null;
    if (tool === 'wall' && Tools.isCurrentlyDrawing()) {
      const start = Tools.getDrawStart();
      if (start) {
        const s = screenToWorld(start.x, start.y);
        const e = screenToWorld(mouseX, mouseY);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1 / camera.zoom;
        ctx.setLineDash([4 / camera.zoom, 4 / camera.zoom]);
        ctx.strokeRect(Math.min(s.x, e.x), Math.min(s.y, e.y), Math.abs(e.x - s.x), Math.abs(e.y - s.y));
        ctx.setLineDash([]);
      }
    }

    Particles.update();
  }

  function drawBody(body, fill, stroke) {
    const verts = body.vertices;
    ctx.beginPath();
    ctx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }

  function drawGravityWell(body) {
    const x = body.position.x, y = body.position.y;
    const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 400);
    for (let i = 3; i >= 0; i--) {
      const r = 18 + i * 10 * pulse;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${0.04 + i * 0.03})`;
      ctx.lineWidth = 1; ctx.stroke();
    }
    const grad = ctx.createRadialGradient(x, y, 0, x, y, 18);
    grad.addColorStop(0, 'rgba(255,255,255,0.3)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fillStyle = grad; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(x - 1, y - 1, 2, 2);
  }

  // ── FPS ──
  function getFps() {
    frameCount++;
    const now = performance.now();
    if (now - lastFpsTime >= 1000) {
      currentFps = Math.round(frameCount * 1000 / (now - lastFpsTime));
      frameCount = 0;
      lastFpsTime = now;
    }
    return currentFps;
  }

  // ── Getters ──
  function getCanvas() { return canvas; }
  function getCtx() { return ctx; }
  function getEngine() { return engine; }
  function getWorld() { return world; }
  function togglePause() {
    if (runner.enabled) { Runner.stop(runner); return false; }
    else {
      // Re-create runner to avoid stale state
      runner = Runner.create();
      Runner.run(runner, engine);
      return true;
    }
  }
  function getWorldW() { return worldW; }
  function getWorldH() { return worldH; }

  const physics = {
    init, spawnShape, spawnRagdoll, spawnForce, spawnImmovable,
    explode, drawWall, addGravityWell, addBlackHole,
    addSpringConstraint, addAnchoredSpring,
    getSpringBodyA, setSpringBodyA, clearSpringBodyA,
    removeBody, clearAll, getBodyAt, getObjectCount,
    update, getCanvas, getCtx, getEngine, getWorld,
    togglePause, setMousePos,
    startDrag, moveDrag, endDrag, isDragging,
    screenToWorld, handleZoom, panCamera, resetCamera, getCamera,
    applyWorldSize, getWorldSizes, getWorldSizeKey,
    getWorldW, getWorldH,
    toggleWind, isWindEnabled, setWindStrength, getWindAngle, setWindAngle,
    addShockwave, getFps
  };
  return physics;
})();
