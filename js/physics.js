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
  const { Engine, Bodies, Body, Composite, Events, Query, Vertices, Constraint, Vector } = Matter;

  let engine, world;
  let canvas, ctx;
  let paused = false;
  let gravityWells = [];
  let forceBodies = [];
  let boundaryBreachTimers = {};
  let mouseX = 0, mouseY = 0;
  let dragBody = null;
  let dragOffset = { x: 0, y: 0 };
  let dragStartPos = null;
  let springBodyA = null;
  let decayTimers = {};
  // ── Juice ──
  let shakeIntensity = 0, shakeDuration = 0;
  let dragTrail = [];
  let impactFlashes = [];
  let decayInterval = null;
  let pendingOps = [];

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

      engine = Engine.create({ gravity: { x: 0, y: 0.4, scale: 0.001 } });
      // Clear any initial stale pairs that Matter.js creates internally
      if (engine.pairs) engine.pairs.list = [];
      world = engine.world;

      applyWorldSize('small');
      setupWind();

      startDecayCleanup();

      paused = false;
      Events.on(engine, 'collisionStart', (event) => {
        try {
          event.pairs.forEach(pair => {
            const { bodyA, bodyB } = pair;

            // Velocity-based crushing damage
            const vx = bodyA.velocity.x - bodyB.velocity.x;
            const vy = bodyA.velocity.y - bodyB.velocity.y;
            const speed = Math.sqrt(vx * vx + vy * vy);
            // Pure speed-based impact (mass removed: matter.js boundary masses are enormous)
            const impact = speed * 0.0008;

            // Mover3000 reversal
            [bodyA, bodyB].forEach(b => {
              if (b.label === 'Mover3000' && b._hasCamera) {
                if (bodyA.label === 'Boundary' || bodyB.label === 'Boundary' || bodyA.label === 'Wall' || bodyB.label === 'Wall') {
                  const oldX = b._direction.x;
                  b._direction.x = b._direction.y;
                  b._direction.y = -oldX;
                }
              }
            });

            const applyCrush = (b) => {
              if (b._isIndestructible) return;
              if ((b.label === 'Shape' || b.label === 'Ragdoll' || b.label === 'Immovable') && (!b.isStatic || b.label === 'Immovable') && impact > 0.001) {
                b._damage = (b._damage || 0) + impact;
                if (!b._cracks) b._cracks = [];
                // Crack from near the impact midpoint inward toward the body's center
                // (avoiding giant spanning lines when the other body is a far-away boundary)
                const impX = (bodyA.position.x + bodyB.position.x) / 2;
                const impY = (bodyA.position.y + bodyB.position.y) / 2;
                b._cracks.push({
                  x1: impX + (Math.random() - 0.5) * 8,
                  y1: impY + (Math.random() - 0.5) * 8,
                  x2: b.position.x + (Math.random() - 0.5) * 4,
                  y2: b.position.y + (Math.random() - 0.5) * 4
                });
                if (b._cracks.length > 20) b._cracks = b._cracks.slice(-20);
                impactFlashes.push({ x: (bodyA.position.x + bodyB.position.x) / 2, y: (bodyA.position.y + bodyB.position.y) / 2, radius: 3 + impact * 500, life: 6, maxLife: 6 });
                if (b._damage >= 1) {
                  const bt = bodyA.velocity.y > 0 ? bodyA : bodyB;
                  pendingOps.push({ type: 'shatter', body: b, x: bt.position.x, y: bt.position.y, force: Math.min(impact * 150, 4), dist: 0 });
                  return;
                }
              }
              if ((b.label === 'Shape' || b.label === 'Fragment' || b.label === 'Ragdoll') && !b.isStatic)
                Particles.spawn(b.position.x, b.position.y, 1);
            };

            applyCrush(bodyA);
            applyCrush(bodyB);
          });
        } catch(e) {
          console.warn('Collision handler error:', e.message);
        }
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
    // Boundaries positioned so their AABBs do NOT overlap at corners
    // Floor: spans world width, sits below world
    boundaryBodies = [
      Bodies.rectangle(worldW / 2, worldH + t / 2, worldW + t, t, opts),
      // Left wall: spans only world height, no overlap with floor/ceiling
      Bodies.rectangle(-t / 2, worldH / 2, t, worldH, opts),
      // Right wall: same
      Bodies.rectangle(worldW + t / 2, worldH / 2, t, worldH, opts),
      // Ceiling: spans world width, sits above world
      Bodies.rectangle(worldW / 2, -t / 2, worldW + t, t, opts),
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
      
      // Mover3000 Force
      const movers = Composite.allBodies(world).filter(b => b.label === 'Mover3000');
      const constraints = Composite.allConstraints(world);
      movers.forEach(m => {
        const force = { x: m._direction.x * 0.005 * m.mass, y: m._direction.y * 0.005 * m.mass };
        Body.applyForce(m, m.position, force);
        constraints.forEach(c => {
          if (c.bodyA === m) Body.applyForce(c.bodyB, c.bodyB.position, force);
          else if (c.bodyB === m) Body.applyForce(c.bodyA, c.bodyA.position, force);
        });
      });

      // Motor driving
      constraints.forEach(c => {
        if (c.label === 'Motor' && c.bodyA && c.bodyB) {
          Body.setAngularVelocity(c.bodyA, c._speed);
          Body.setAngularVelocity(c.bodyB, -c._speed);
        }
      });

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
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
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
      // Drag trail
      dragTrail.push({ x: nx, y: ny });
      if (dragTrail.length > 35) dragTrail.shift();
    }
  }
  function endDrag() {
    dragBody = null;
    dragStartPos = null;
    dragTrail = [];
  }
  function isDragging() { return dragBody !== null; }

  // ── Juice ──
  function triggerShake(intensity, frames) {
    shakeIntensity = intensity;
    shakeDuration = frames;
  }

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
    if (body) { body._damage = 0; body._cracks = []; body._spawnTime = performance.now(); Composite.add(world, body); }
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
    parts.forEach(p => p._spawnTime = performance.now());

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
  function spawnForce(x, y, strength, angle) {
    const body = Bodies.circle(x, y, 24, {
      restitution: 0, friction: 0, density: 0.05, label: 'Force', frictionAir: 0
    });
    body._damage = 0; body._cracks = [];
    Composite.add(world, body);
    body._spawnTime = performance.now();

    const handler = Events.on(engine, 'beforeUpdate', () => {
      try {
        // Thrust in configured direction
        Body.applyForce(body, body.position, { 
          x: strength * Math.cos(angle) * body.mass, 
          y: strength * Math.sin(angle) * body.mass 
        });

        // Exhaust particles
        if (Math.random() < 0.4) Particles.spawn(body.position.x - 28 * Math.cos(angle), body.position.y - 28 * Math.sin(angle), 1, { speed: 1.5 });
        // ... (rest of the original handler logic remains the same, but using the passed parameters)

        const allBodies = Composite.allBodies(world);

        // Destroy walls the Force is grinding against
        allBodies.forEach(b => {
          if (b.label === 'Wall') {
            const dx = body.position.x - b.position.x;
            const dy = body.position.y - b.position.y;
            const halfW = Math.max(Math.abs(b.bounds.max.x - b.bounds.min.x) / 2, 12);
            const halfH = Math.max(Math.abs(b.bounds.max.y - b.bounds.min.y) / 2, 12);
          if (Math.abs(dx) < halfW + 24 && Math.abs(dy) < halfH + 24) {
              pendingOps.push({ type: 'shatter', body: b, x: b.position.x, y: b.position.y, force: 0.5, dist: 0 });
            }
          }
        });

        // Breach boundaries — temporarily remove the wall segment the Force is pushing on
        allBodies.forEach(b => {
          if (b.label === 'Boundary' && body.position.x > -50 && body.position.x < worldW + 50 && body.position.y > -50 && body.position.y < worldH + 50) {
            // Only breach vertical walls (left/right), never the floor or ceiling
            if (b.position.y < 0 || b.position.y > worldH) return;
            const dx = body.position.x - b.position.x;
            const dy = body.position.y - b.position.y;
            const halfW = (b.bounds.max.x - b.bounds.min.x) / 2;
            const halfH = (b.bounds.max.y - b.bounds.min.y) / 2;
            const onEdge = (Math.abs(dx) < halfW + 10 && Math.abs(dy) < halfH + 10);
            if (onEdge && !boundaryBreachTimers[b.id]) {
              boundaryBreachTimers[b.id] = { body: b, respawnAt: Date.now() + 2000 };
              pendingOps.push({ type: 'remove', body: b });
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
                pendingOps.push({ type: 'shatter', body: b, x: b.position.x, y: b.position.y, force: 0.5, dist: 0 });
              }
            }
          }
        });
      } catch(e) {
        console.warn('Force handler error:', e.message);
      }
    });
    body._handler = handler;
    forceBodies.push(body);
    return body;
  }

  function spawnMover3000(x, y, angle) {
    const body = Bodies.circle(x, y, 20, {
      label: 'Mover3000', density: 0.01, friction: 0, frictionAir: 0
    });
    body._direction = { x: Math.cos(angle), y: Math.sin(angle) };
    body._hasCamera = false;
    Composite.add(world, body);
    return body;
  }

  function rotateMover(body) {
    const oldX = body._direction.x;
    body._direction.x = -body._direction.y;
    body._direction.y = oldX;
  }

  function toggleMoverCamera(body) {
    body._hasCamera = !body._hasCamera;
  }

  // ── Immovable Object ──
  function spawnImmovable(x, y) {
    const body = Bodies.rectangle(x, y, 80, 80, {
      isStatic: true, restitution: 1, friction: 1, label: 'Immovable', density: 1
    });
    body._damage = 0; body._cracks = [];
    body._spawnTime = performance.now();
    Composite.add(world, body);
    return body;
  }

  function toggleIndestructible(body) {
    body._isIndestructible = !body._isIndestructible;
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
      if (body._isIndestructible) return;

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

    triggerShake(10, 12);
    impactFlashes.push({ x, y, radius: 60, life: 12, maxLife: 12 });
    toShatter.forEach(({ body, dist }) => shatterBody(body, x, y, f, dist));
    addShockwave(x, y, 200);
    Particles.spawn(x, y, 30, { speed: 8 });
    Particles.spawn(x, y, 15, { speed: 5 });
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
    const poly = verts.map(v => [v.x, v.y]);

    // Generate fragment polygons before removing the body
    let fragments = [];
    try {
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

      fragments = [poly];
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
        return Math.abs(area) / 2 > 300;
      });

      if (fragments.length > 8) {
        fragments.sort((a, b) => { let aa = 0, ba = 0;
          for (let i = 0; i < a.length; i++) { const j = (i + 1) % a.length; aa += a[i][0] * a[j][1] - a[j][0] * a[i][1]; }
          for (let i = 0; i < b.length; i++) { const j = (i + 1) % b.length; ba += b[i][0] * b[j][1] - b[j][0] * b[i][1]; }
          return Math.abs(ba) - Math.abs(aa); });
        fragments = fragments.slice(0, 8);
      }
    } catch(e) {
      console.warn('Fracture generation failed:', e.message);
      fragments = [];
    }

    // Now remove the original body (safe even if fragment generation failed)
    Composite.remove(world, body);

    let fragCount = 0;
    for (const fp of fragments) {
      // Clean near-duplicate vertices
      const cleaned = [];
      for (const pt of fp) {
        const prev = cleaned[cleaned.length - 1];
        if (!prev || Math.abs(prev[0] - pt[0]) > 2 || Math.abs(prev[1] - pt[1]) > 2) cleaned.push(pt);
      }
      if (cleaned.length < 3) continue;

      const fv = cleaned.map(p => ({ x: p[0], y: p[1] }));
      const centre = Vertices.centre(fv);
      if (!isFinite(centre.x) || !isFinite(centre.y)) continue;

      try {
        const frag = Bodies.fromVertices(centre.x, centre.y, [fv], {
          restitution: 0.12, friction: 0.6, density: 0.002, label: 'Fragment'
        });
        if (frag && frag.vertices && frag.vertices.length >= 3) {
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
      } catch(e) {
        console.warn('Fragment creation failed:', e.message);
      }
    }
    if (fragCount > 0) triggerShake(2, 4);
    Particles.spawn(pos.x, pos.y, 12, { speed: 6 });
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
      try {
        const allBodies = Composite.allBodies(world);
        allBodies.forEach(body => {
          if (body === well || body.isStatic || body.label === 'Boundary') return;
          const dx = well.position.x - body.position.x;
          const dy = well.position.y - body.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 8 && dist < 350) {
            const norm = dist / 350;
            const falloff = (1 - norm) * (1 - norm);
            let force = (str / (body.mass || 1)) * falloff;
            // Scale cap with mass so heavy bodies (Force) feel real pull
            // while light objects stay protected from being yeeted
            force = Math.min(force, Math.max(0.03, body.mass * 0.003));
            Body.applyForce(body, body.position, {
              x: (dx / dist) * force,
              y: (dy / dist) * force
            });
          }
        });
      } catch(e) {
        console.warn('Gravity well handler error:', e.message);
      }
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
      try {
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
            // Scale cap with mass so the Force can be overwhelmed
            force = Math.min(force, Math.max(0.08, body.mass * 0.008));
            Body.applyForce(body, body.position, {
              x: (dx / dist) * force,
              y: (dy / dist) * force
            });
            if (dist < 28) {
              if (body.label === 'Force') {
                // Trap the Force — pin it static at the singularity
                Body.setStatic(body, true);
                Body.setVelocity(body, { x: 0, y: 0 });
                Body.setPosition(body, { x: well.position.x, y: well.position.y });
                Particles.spawn(body.position.x, body.position.y, 12, { speed: 6 });
              } else {
                if (body._handler) Events.off(engine, 'beforeUpdate', body._handler);
                delete decayTimers[body.id];
                forceBodies = forceBodies.filter(b => b !== body);
                Particles.spawn(body.position.x, body.position.y, 12, { speed: 6 });
                pendingOps.push({ type: 'remove', body });
              }
            }
          }
        });
      } catch(e) {
        console.warn('Black hole handler error:', e.message);
      }
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

  function addWeldConstraint(bodyA, bodyB) {
    const con = Constraint.create({
      bodyA: bodyA,
      pointA: { x: 0, y: 0 },
      bodyB: bodyB,
      pointB: { x: 0, y: 0 },
      stiffness: 1,
      damping: 0,
      label: 'Weld'
    });
    Composite.add(world, con);
    return con;
  }

  function addMotorConstraint(bodyA, bodyB, speed) {
    const con = Constraint.create({
      bodyA: bodyA,
      bodyB: bodyB,
      pointA: { x: 0, y: 0 },
      pointB: { x: 0, y: 0 },
      stiffness: 1,
      damping: 0,
      label: 'Motor',
      _speed: speed || 0.05
    });
    Composite.add(world, con);
    return con;
  }

  function getBodiesInArea(x1, y1, x2, y2) {
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    return Composite.allBodies(world).filter(b => {
      if (b.label === 'Boundary' || b.label === 'GravityWell' || b.label === 'BlackHole') return false;
      return b.position.x >= minX && b.position.x <= maxX && b.position.y >= minY && b.position.y <= maxY;
    });
  }

  function pasteCluster(bodies, x, y) {
    if (bodies.length === 0) return;
    
    // Calculate center of copied bodies
    let cx = 0, cy = 0;
    bodies.forEach(b => { cx += b.position.x; cy += b.position.y; });
    cx /= bodies.length; cy /= bodies.length;

    // Create mappings for new bodies
    const bodyMap = new Map();
    const newBodies = bodies.map(b => {
      let newB;
      const dx = b.position.x - cx, dy = b.position.y - cy;
      const opts = { label: b.label, isStatic: b.isStatic, restitution: b.restitution, friction: b.friction, density: b.density };
      if (b.label === 'Mover3000') newB = spawnMover3000(x + dx, y + dy);
      else if (b.label === 'Immovable') newB = spawnImmovable(x + dx, y + dy);
      else if (b.label === 'Shape') newB = spawnShape(x + dx, y + dy, 'circle', 8); // Simplified
      else return null;
      
      bodyMap.set(b.id, newB);
      return newB;
    }).filter(b => b !== null);

    // Re-create constraints
    const constraints = Composite.allConstraints(world);
    bodies.forEach(b => {
      constraints.forEach(c => {
        if (c.bodyA === b || c.bodyB === b) {
          const other = (c.bodyA === b) ? c.bodyB : c.bodyA;
          if (bodyMap.has(b.id) && bodyMap.has(other.id)) {
            const newA = bodyMap.get(b.id);
            const newB = bodyMap.get(other.id);
            if (c.label === 'Weld') addWeldConstraint(newA, newB);
            else if (c.label === 'Spring') addSpringConstraint(newA, newB, c.stiffness);
          }
        }
      });
    });
  }

  function clearAll() {
    paused = false;
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
    springBodyA = null; gravityWells = []; Particles.clear();
    shakeIntensity = 0; shakeDuration = 0; dragTrail = []; impactFlashes = [];
  }

  function getBodyAt(x, y) {
    const bodies = Composite.allBodies(world);
    const found = Query.point(bodies, { x, y });
    return found.find(b => (b.label === 'Immovable' || (!b.isStatic && b.label !== 'Boundary' && b.label !== 'GravityWell'))) || null;
  }

  function getObjectCount() {
    return Composite.allBodies(world).filter(b => b.label !== 'Boundary').length;
  }

  function setMousePos(x, y) { mouseX = x; mouseY = y; }

  // ── Render ──
  function update() {
    // Manually step the engine (no Runner, more reliable pause/resume)
    if (!paused) {
      try {
        Engine.update(engine, 1000 / 60);
      } catch(e) {
        // Matter.js collision bug — log full details
        console.warn('PHYSICS-v6 Engine update skipped:', e.message);
        console.warn('PHYSICS-v6 STACK:', (e.stack || 'no stack').split('\n').slice(0,6).join('\n'));
        // Temporarily log the world state for debugging
        try {
          const allBodies = Composite.allBodies(world);
          console.warn('World has', allBodies.length, 'bodies:', allBodies.map(b => b.label + ':' + b.id).join(', '));
          allBodies.forEach(b => {
            if (!b.vertices || b.vertices.length < 3) {
              console.warn('  INVALID BODY:', b.id, b.label, 'verts:', b.vertices ? b.vertices.length : 'none');
            }
          });
        } catch(inner) {}
      }
    }

    // Process deferred body ops (shatter, remove) — MUST run after Engine.update
    // to avoid corrupting Matter.js collision resolver with freed body data
    for (const op of pendingOps) {
      try {
        if (op.type === 'shatter') {
          shatterBody(op.body, op.x, op.y, op.force, op.dist);
        } else if (op.type === 'remove') {
          Composite.remove(world, op.body);
        }
      } catch(e) {
        console.warn('Deferred op failed:', e.message);
      }
    }
    pendingOps = [];

    // Filter stale pairs out of the collision cache instead of clearing everything.
    // Bodies removed via pendingOps above leave dangling references in engine.pairs.list
    // which crash the next Engine.update with "Cannot read properties of undefined (reading 'index')".
    // Clearing all pairs every frame kills collision persistence — fast-moving objects lose
    // their contact memory and tunnel through walls on the next step.
    if (engine && engine.pairs && engine.pairs.list.length > 0) {
      const activeIds = new Set();
      Composite.allBodies(world).forEach(b => activeIds.add(b.id));
      engine.pairs.list = engine.pairs.list.filter(
        p => p && p.bodyA && p.bodyB && activeIds.has(p.bodyA.id) && activeIds.has(p.bodyB.id)
      );
    }

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
          newB = Bodies.rectangle(worldW/2, worldH + t/2, worldW + t, t, opts);
        else if (Math.abs(y - (-t/2)) < eps)
          newB = Bodies.rectangle(worldW/2, -t/2, worldW + t, t, opts);
        else if (Math.abs(x - (-t/2)) < eps)
          newB = Bodies.rectangle(-t/2, worldH/2, t, worldH, opts);
        else if (Math.abs(x - (worldW + t/2)) < eps)
          newB = Bodies.rectangle(worldW + t/2, worldH/2, t, worldH, opts);

        if (newB) {
          boundaryBodies = boundaryBodies.map(b => b === entry.body ? newB : b);
          Composite.add(world, newB);
        }
        delete boundaryBreachTimers[id];
      }
    }

    // Safety net: ensure all 4 world boundaries exist each frame
    const allBoundaries = Composite.allBodies(world).filter(b => b.label === 'Boundary');
    const boundaryOpts = { isStatic: true, restitution: 0.3, label: 'Boundary' };
    // Check for floor (y > worldH)
    if (!allBoundaries.some(b => b.position.y > worldH)) {
      Composite.add(world, Bodies.rectangle(worldW / 2, worldH + 30, worldW + 60, 60, boundaryOpts));
    }
    // Check for ceiling (y < 0)
    if (!allBoundaries.some(b => b.position.y < 0)) {
      Composite.add(world, Bodies.rectangle(worldW / 2, -30, worldW + 60, 60, boundaryOpts));
    }
    // Check for left wall (x < 0)
    if (!allBoundaries.some(b => b.position.x < 0)) {
      Composite.add(world, Bodies.rectangle(-30, worldH / 2, 60, worldH, boundaryOpts));
    }
    // Check for right wall (x > worldW)
    if (!allBoundaries.some(b => b.position.x > worldW)) {
      Composite.add(world, Bodies.rectangle(worldW + 30, worldH / 2, 60, worldH, boundaryOpts));
    }

    // Purge all stale breach entries — bodies removed from world are recreated by safety net above
    const worldBodyMap = new Map(Composite.allBodies(world).map(b => [b.id, b]));
    for (const id of Object.keys(boundaryBreachTimers)) {
      if (!worldBodyMap.has(Number(id))) {
        delete boundaryBreachTimers[id];
      }
    }

    // Re-read boundary bodies into the tracker array
    boundaryBodies = Composite.allBodies(world).filter(b => b.label === 'Boundary');

    const bodies = Composite.allBodies(world);

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Mover3000 camera tracking
    bodies.forEach(b => {
      if (b.label === 'Mover3000' && b._hasCamera) {
        camera.x = b.position.x;
        camera.y = b.position.y;
      }
    });

    // ── Camera transform ──
    ctx.save();

    // Screen shake
    if (shakeDuration > 0) {
      const sx = (Math.random() - 0.5) * shakeIntensity;
      const sy = (Math.random() - 0.5) * shakeIntensity;
      ctx.translate(sx, sy);
      shakeDuration--;
    }

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

    // Drag trail
    if (dragTrail.length > 1) {
      for (let i = 1; i < dragTrail.length; i++) {
        const t = i / dragTrail.length;
        ctx.strokeStyle = `rgba(255,255,255,${t * 0.35})`;
        ctx.lineWidth = t * 2;
        ctx.beginPath();
        ctx.moveTo(dragTrail[i-1].x, dragTrail[i-1].y);
        ctx.lineTo(dragTrail[i].x, dragTrail[i].y);
        ctx.stroke();
      }
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
        drawBody(b, b._isIndestructible ? '#888' : (b._damage > 0 ? '#eee' : '#fff'), '#555');
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

    // Spring constraints
    const constraints = Composite.allConstraints(world);
    constraints.forEach(con => {
      if (!con.bodyA || (!con.bodyB && !con.pointB)) return;
      
      const ax = con.bodyA.position.x + (con.pointA ? con.pointA.x : 0);
      const ay = con.bodyA.position.y + (con.pointA ? con.pointA.y : 0);
      
      let bx, by;
      if (con.bodyB) {
        bx = con.bodyB.position.x + (con.pointB ? con.pointB.x : 0);
        by = con.bodyB.position.y + (con.pointB ? con.pointB.y : 0);
      } else {
        bx = con.pointB ? con.pointB.x : 0;
        by = con.pointB ? con.pointB.y : 0;
      }

      ctx.strokeStyle = '#0ff'; // Bright cyan for better visibility
      ctx.lineWidth = 3;        // Thicker line
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      
      // Draw anchor points for better visual cue
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ax, ay, 4, 0, Math.PI * 2); ctx.fill();
      if (con.bodyB) {
        ctx.beginPath(); ctx.arc(bx, by, 4, 0, Math.PI * 2); ctx.fill();
      }
    });

    // Weld constraints
    constraints.forEach(con => {
      if (con.label !== 'Weld' || !con.bodyA || !con.bodyB) return;
      const ax = con.bodyA.position.x + (con.pointA ? con.pointA.x : 0);
      const ay = con.bodyA.position.y + (con.pointA ? con.pointA.y : 0);
      const bx = con.bodyB.position.x + (con.pointB ? con.pointB.x : 0);
      const by = con.bodyB.position.y + (con.pointB ? con.pointB.y : 0);

      ctx.strokeStyle = '#f00'; // Red for weld
      ctx.lineWidth = 4;        // Thick line
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    });

    // Motor constraints
    constraints.forEach(con => {
      if (con.label !== 'Motor' || !con.bodyA || !con.bodyB) return;
      const ax = con.bodyA.position.x + (con.pointA ? con.pointA.x : 0);
      const ay = con.bodyA.position.y + (con.pointA ? con.pointA.y : 0);
      const bx = con.bodyB.position.x + (con.pointB ? con.pointB.x : 0);
      const by = con.bodyB.position.y + (con.pointB ? con.pointB.y : 0);

      ctx.strokeStyle = '#f80'; // Orange for motor
      ctx.lineWidth = 4;        // Thick line
      ctx.beginPath();
      ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.beginPath(); ctx.arc((ax + bx)/2, (ay + by)/2, 6, 0, Math.PI * 2); ctx.stroke();
    });

    // Mover3000 bodies
    bodies.forEach(b => {
      if (b.label === 'Mover3000') {
        drawBody(b, '#fff', '#aaa');
        if (b._hasCamera) {
          ctx.fillStyle = '#f00';
          ctx.beginPath(); ctx.arc(b.position.x, b.position.y, 6, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.stroke();
        }
      }
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

    // Spawn rings
    bodies.forEach(b => {
      if (b._spawnTime && b.label !== 'Boundary' && b.label !== 'GravityWell' && b.label !== 'BlackHole') {
        const elapsed = performance.now() - b._spawnTime;
        if (elapsed < 250) {
          const progress = elapsed / 250;
          const r = 8 + progress * 16;
          ctx.beginPath();
          ctx.arc(b.position.x, b.position.y, r, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,255,255,${(1 - progress) * 0.25})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    });

    // Impact flashes
    for (let i = impactFlashes.length - 1; i >= 0; i--) {
      const f = impactFlashes[i];
      const alpha = (f.life / f.maxLife) * 0.5;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.radius * (1 - f.life / f.maxLife * 0.3), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fill();
      f.life--;
      if (f.life <= 0) impactFlashes.splice(i, 1);
    }

    // Particles (world-space)
    Particles.update();

    // Wall preview — drawn INSIDE camera transform so world coordinates render correctly
    const tool = typeof Tools !== 'undefined' ? Tools.getCurrentTool() : null;
    if (tool === 'wall' && Tools.isCurrentlyDrawing()) {
      const start = Tools.getDrawStart();
      if (start) {
        const s = screenToWorld(start.x, start.y);
        const e = screenToWorld(mouseX, mouseY);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(Math.min(s.x, e.x), Math.min(s.y, e.y), Math.abs(e.x - s.x), Math.abs(e.y - s.y));
        ctx.setLineDash([]);
      }
    }

    // Selection box for Copy tool
    if (tool === 'copy' && typeof Tools.isSelecting === 'function' && Tools.isSelecting()) {
      const start = Tools.getSelectionStart();
      if (start) {
        const s = screenToWorld(start.x, start.y);
        const e = screenToWorld(mouseX, mouseY);
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)'; // Cyan box
        ctx.lineWidth = 2;
        ctx.strokeRect(Math.min(s.x, e.x), Math.min(s.y, e.y), Math.abs(e.x - s.x), Math.abs(e.y - s.y));
      }
    }

    // Mover3000 preview
    if (tool === 'spawn' && Tools.getCurrentShape() === 'mover3000') {
      const angle = parseFloat(document.getElementById('moverAngle').value) || 0;
      const mouseWorld = screenToWorld(mouseX, mouseY);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(mouseWorld.x, mouseWorld.y);
      ctx.lineTo(mouseWorld.x + Math.cos(angle) * 40, mouseWorld.y + Math.sin(angle) * 40);
      ctx.stroke();
      // Arrowhead
      ctx.beginPath();
      ctx.moveTo(mouseWorld.x + Math.cos(angle) * 40, mouseWorld.y + Math.sin(angle) * 40);
      ctx.lineTo(mouseWorld.x + Math.cos(angle) * 32 - Math.sin(angle) * 8, mouseWorld.y + Math.sin(angle) * 32 + Math.cos(angle) * 8);
      ctx.moveTo(mouseWorld.x + Math.cos(angle) * 40, mouseWorld.y + Math.sin(angle) * 40);
      ctx.lineTo(mouseWorld.x + Math.cos(angle) * 32 + Math.sin(angle) * 8, mouseWorld.y + Math.sin(angle) * 32 - Math.cos(angle) * 8);
      ctx.stroke();
    }

    ctx.restore(); // ── End camera transform ──

    // ── HUD (screen-space) ──
    // Update object counter
    const objEl = document.getElementById('objectCounter');
    if (objEl) {
      objEl.textContent = 'OBJECTS: ' + getObjectCount();
    }

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
    paused = !paused;
    return !paused;
  }
  function getWorldW() { return worldW; }
  function getWorldH() { return worldH; }

  const physics = {
    init: init,
    spawnShape: spawnShape,
    spawnRagdoll: spawnRagdoll,
    spawnForce: spawnForce,
    spawnMover3000: spawnMover3000,
    spawnImmovable: spawnImmovable,
    explode: explode,
    drawWall: drawWall,
    addGravityWell: addGravityWell,
    addBlackHole: addBlackHole,
    addSpringConstraint: addSpringConstraint,
    addAnchoredSpring: addAnchoredSpring,
    getSpringBodyA: getSpringBodyA,
    setSpringBodyA: setSpringBodyA,
    clearSpringBodyA: clearSpringBodyA,
    addWeldConstraint: addWeldConstraint,
    addMotorConstraint: addMotorConstraint,
    toggleMoverCamera: toggleMoverCamera,
    rotateMover: rotateMover,
    toggleIndestructible: toggleIndestructible,
    getBodiesInArea: getBodiesInArea,
    pasteCluster: pasteCluster,
    removeBody: removeBody,
    clearAll: clearAll,
    getBodyAt: getBodyAt,
    getObjectCount: getObjectCount,
    update: update,
    getCanvas: getCanvas,
    getCtx: getCtx,
    getEngine: getEngine,
    getWorld: getWorld,
    togglePause: togglePause,
    setMousePos: setMousePos,
    startDrag: startDrag,
    moveDrag: moveDrag,
    endDrag: endDrag,
    isDragging: isDragging,
    screenToWorld: screenToWorld,
    handleZoom: handleZoom,
    panCamera: panCamera,
    resetCamera: resetCamera,
    getCamera: getCamera,
    applyWorldSize: applyWorldSize,
    getWorldSizes: getWorldSizes,
    getWorldSizeKey: getWorldSizeKey,
    getWorldW: getWorldW,
    getWorldH: getWorldH,
    toggleWind: toggleWind,
    isWindEnabled: isWindEnabled,
    setWindStrength: setWindStrength,
    getWindAngle: getWindAngle,
    setWindAngle: setWindAngle,
    addShockwave: addShockwave,
    getFps: getFps
  };
  return physics;
})();
