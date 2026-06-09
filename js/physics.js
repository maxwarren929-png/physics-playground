/**
 * Physics Playground — Physics Engine (Matter.js wrapper)
 * Rigid shapes that crack then shatter into irregular fragments.
 */

const Physics = (() => {
  const {
    Engine, Runner, Bodies, Body, Composite, Events, Query
  } = Matter;

  let engine, world, runner;
  let canvas, ctx;
  let gravityWells = [];
  let mouseX = 0, mouseY = 0;
  let dragBody = null;
  let dragOffset = { x: 0, y: 0 };
  let decayTimers = {}; // body.id -> expiry timestamp
  let decayInterval = null;

  function init(canvasEl) {
    try {
      canvas = canvasEl;
      ctx = canvas.getContext('2d');

      resize();
      window.addEventListener('resize', resize);

      engine = Engine.create({
        gravity: { x: 0, y: 0.08 }
      });
      world = engine.world;

      createBoundaries();
      startDecayCleanup();

      runner = Runner.create();
      Runner.run(runner, engine);

      Events.on(engine, 'collisionStart', (event) => {
        event.pairs.forEach(pair => {
          [pair.bodyA, pair.bodyB].forEach(b => {
            if ((b.label === 'Shape' || b.label === 'Fragment') && !b.isStatic) {
              Particles.spawn(b.position.x, b.position.y, 1);
            }
          });
        });
      });

      return physics;
    } catch(e) {
      console.error('Physics.init failed:', e.message);
      return null;
    }
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (engine) rebuildBoundaries();
  }

  let boundaryBodies = [];
  function createBoundaries() {
    const w = canvas.width, h = canvas.height, t = 60;
    const opts = { isStatic: true, restitution: 0.3, label: 'Boundary' };
    boundaryBodies = [
      Bodies.rectangle(w / 2, h + t / 2, w + t * 2, t, opts),
      Bodies.rectangle(-t / 2, h / 2, t, h + t * 2, opts),
      Bodies.rectangle(w + t / 2, h / 2, t, h + t * 2, opts),
      Bodies.rectangle(w / 2, -t / 2, w + t * 2, t, opts),
    ];
    Composite.add(world, boundaryBodies);
  }

  function rebuildBoundaries() {
    boundaryBodies.forEach(b => Composite.remove(world, b));
    createBoundaries();
  }

  // ── Drag ──
  function startDrag(x, y) {
    const body = getBodyAt(x, y);
    if (body) {
      dragBody = body;
      dragOffset = { x: body.position.x - x, y: body.position.y - y };
      Body.setStatic(body, false);
      return true;
    }
    return false;
  }
  function moveDrag(x, y) {
    if (dragBody) {
      Body.setPosition(dragBody, { x: x + dragOffset.x, y: y + dragOffset.y });
      Body.setVelocity(dragBody, { x: 0, y: 0 });
    }
  }
  function endDrag() { dragBody = null; }
  function isDragging() { return dragBody !== null; }

  // ── Spawn rigid shape ──
  function spawnShape(x, y, type, size) {
    const s = size || 8;
    const radius = 8 + s * 3.5;

    const opts = {
      restitution: 0.2,
      friction: 0.4,
      density: 0.003,
      label: 'Shape'
    };

    let body;
    switch (type) {
      case 'circle':
        body = Bodies.circle(x, y, radius, opts);
        break;
      case 'rect':
        body = Bodies.rectangle(x, y, radius * 2, radius * 2, opts);
        break;
      case 'triangle':
        body = Bodies.polygon(x, y, 3, radius, opts);
        break;
    }

    if (body) {
      body._damage = 0;
      body._cracks = [];
      Composite.add(world, body);
    }
    return body;
  }

  // ── Explosion ──
  function explode(x, y, force) {
    const f = force || 0.3;
    const radius = 250;
    const bodies = Composite.allBodies(world);
    const toShatter = [];

    bodies.forEach(body => {
      if (body.isStatic || body.label === 'Boundary') return;
      const dx = body.position.x - x;
      const dy = body.position.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < radius) {
        const power = (1 - dist / radius) * f;

        if (body.label === 'Shape') {
          // Damage accumulates. One strong blast or multiple hits will shatter it.
          body._damage = (body._damage || 0) + power * 2.5;
          addCracks(body, x, y, power);

          if (body._damage >= 1) {
            toShatter.push({ body, dist, power, dx, dy });
          } else {
            Body.applyForce(body, body.position, {
              x: (dx / (dist || 1)) * power,
              y: (dy / (dist || 1)) * power
            });
          }
        } else if (body.label === 'Fragment') {
          // Fragments can also be shattered further
          body._damage = (body._damage || 0) + power * 3;
          if (body._damage >= 1) {
            toShatter.push({ body, dist, power, dx, dy });
          } else {
            Body.applyForce(body, body.position, {
              x: (dx / (dist || 1)) * power,
              y: (dy / (dist || 1)) * power
            });
          }
        } else {
          Body.applyForce(body, body.position, {
            x: (dx / (dist || 1)) * power,
            y: (dy / (dist || 1)) * power
          });
        }
      }
    });

    toShatter.forEach(({ body, dist, power }) => {
      shatterBody(body, x, y, f, dist);
    });

    Particles.spawn(x, y, 25, { speed: 7 });
    Particles.spawn(x, y, 12, { speed: 4 });
  }

  // ── Add crack lines to a damaged body ──
  function addCracks(body, explosionX, explosionY, power) {
    if (!body._cracks) body._cracks = [];

    const verts = body.vertices;
    const cx = body.position.x;
    const cy = body.position.y;

    // Find the vertex closest to the explosion — that's where cracks start
    let closestDist = Infinity;
    let closestIdx = 0;
    verts.forEach((v, i) => {
      const d = (v.x - explosionX) ** 2 + (v.y - explosionY) ** 2;
      if (d < closestDist) { closestDist = d; closestIdx = i; }
    });

    // Create cracks from nearby edge points inward toward center
    const crackCount = 1 + Math.floor(power * 3);
    for (let i = 0; i < crackCount; i++) {
      // Pick a starting point on the body edge near the impact
      const edgeIdx = (closestIdx + Math.floor(Math.random() * 3 - 1) + verts.length) % verts.length;
      const nextIdx = (edgeIdx + 1) % verts.length;

      // Random point between edgeIdx and nextIdx
      const t = Math.random();
      const sx = verts[edgeIdx].x + (verts[nextIdx].x - verts[edgeIdx].x) * t;
      const sy = verts[edgeIdx].y + (verts[nextIdx].y - verts[edgeIdx].y) * t;

      // Crack goes inward — end at a random interior point
      const inward = 0.3 + Math.random() * 0.5; // how deep
      const ex = cx + (sx - cx) * (1 - inward) + (Math.random() - 0.5) * 8;
      const ey = cy + (sy - cy) * (1 - inward) + (Math.random() - 0.5) * 8;

      body._cracks.push({ x1: sx, y1: sy, x2: ex, y2: ey });
    }

    // Cap cracks
    if (body._cracks.length > 20) {
      body._cracks = body._cracks.slice(-20);
    }
  }

  // ── Shatter a body into irregular fragments ──
  function shatterBody(body, explosionX, explosionY, force, dist) {
    const pos = body.position;
    const verts = body.vertices;
    const bounds = body.bounds;
    const w = bounds.max.x - bounds.min.x;
    const h = bounds.max.y - bounds.min.y;

    Composite.remove(world, body);

    // Build perimeter samples (original vertices + interpolated points along edges)
    const perim = [];
    for (let i = 0; i < verts.length; i++) {
      const v1 = verts[i];
      const v2 = verts[(i + 1) % verts.length];
      perim.push({ x: v1.x, y: v1.y });
      const steps = 1 + Math.floor(Math.random() * 2); // 1-2 extra points per edge
      for (let s = 1; s <= steps; s++) {
        const t = s / (steps + 1);
        perim.push({
          x: v1.x + (v2.x - v1.x) * t,
          y: v1.y + (v2.y - v1.y) * t
        });
      }
    }

    // Interior point — offset from center toward the explosion
    const edx = pos.x - explosionX;
    const edy = pos.y - explosionY;
    const ed = Math.sqrt(edx * edx + edy * edy) || 1;
    const shift = Math.min(w, h) * 0.1;
    const interiorX = pos.x + (edx / ed) * shift;
    const interiorY = pos.y + (edy / ed) * shift;

    const maxFragments = 12;
    let fragCount = 0;

    for (let i = 0; i < perim.length && fragCount < maxFragments; i++) {
      const p1 = perim[i];
      const p2 = perim[(i + 1) % perim.length];

      // Skip tiny slivers
      const area = Math.abs(
        (interiorX * (p1.y - p2.y) + p1.x * (p2.y - interiorY) + p2.x * (interiorY - p1.y)) / 2
      );
      if (area < 200) continue;

      const triVerts = [
        { x: interiorX, y: interiorY },
        { x: p1.x, y: p1.y },
        { x: p2.x, y: p2.y }
      ];

      const centroidX = (interiorX + p1.x + p2.x) / 3;
      const centroidY = (interiorY + p1.y + p2.y) / 3;

      try {
        const frag = Bodies.fromVertices(centroidX, centroidY, [triVerts], {
          restitution: 0.12,
          friction: 0.6,
          density: 0.002,
          label: 'Fragment'
        });

        if (frag) {
          // Explosion velocity
          const fdx = centroidX - explosionX;
          const fdy = centroidY - explosionY;
          const fd = Math.sqrt(fdx * fdx + fdy * fdy) || 1;
          const power = (1 - dist / 250) * force * 0.45;
          Body.setVelocity(frag, {
            x: (fdx / fd) * power * (0.6 + Math.random() * 0.8),
            y: (fdy / fd) * power * (0.6 + Math.random() * 0.8) - 1.5
          });
          Body.setAngularVelocity(frag, (Math.random() - 0.5) * 0.2);

          frag._damage = 0;
          Composite.add(world, frag);

          // Live longer than the old shards (10-15 seconds)
          decayTimers[frag.id] = Date.now() + 10000 + Math.random() * 5000;
          fragCount++;
        }
      } catch(e) {
        // Skip fragment if fromVertices fails
      }
    }

    // Also spawn some visual particles at the shatter point
    Particles.spawn(pos.x, pos.y, 8, { speed: 6 });
  }

  // ── Periodic cleanup ──
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
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const w = Math.max(Math.abs(x2 - x1) + 10, 12);
    const h = Math.max(Math.abs(y2 - y1) + 10, 12);
    const wall = Bodies.rectangle(cx, cy, w, h, {
      isStatic: true, restitution: 0.2, friction: 0.9, label: 'Wall'
    });
    Composite.add(world, wall);
    return wall;
  }

  // ── Gravity Well ──
  function addGravityWell(x, y, strength) {
    const str = strength || 12;
    const well = Bodies.circle(x, y, 16, {
      isStatic: true, label: 'GravityWell', collisionFilter: { group: -1 }
    });
    Composite.add(world, well);

    const handler = Events.on(engine, 'beforeUpdate', () => {
      const bodies = Composite.allBodies(world);
      bodies.forEach(body => {
        if (body === well || body.isStatic || body.label === 'Boundary') return;
        const dx = well.position.x - body.position.x;
        const dy = well.position.y - body.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 5 && dist < 350) {
          const falloff = 1 - dist / 350;
          Body.applyForce(body, body.position, {
            x: (dx / dist) * str * falloff,
            y: (dy / dist) * str * falloff
          });
        }
      });
    });

    well._handler = handler;
    gravityWells.push(well);
    return well;
  }

  function removeBody(body) {
    if (body._handler) Events.off(engine, 'beforeUpdate', body._handler);
    delete decayTimers[body.id];
    Composite.remove(world, body);
  }

  function clearAll() {
    decayTimers = {};
    const bodies = Composite.allBodies(world).slice();
    bodies.forEach(b => {
      if (b.label !== 'Boundary') {
        if (b._handler) Events.off(engine, 'beforeUpdate', b._handler);
        Composite.remove(world, b);
      }
    });
    gravityWells = [];
    Particles.clear();
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
    const bodies = Composite.allBodies(world);

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    const step = 32;
    for (let x = 0; x < canvas.width; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    // Gravity wells
    bodies.forEach(b => { if (b.label === 'GravityWell') drawGravityWell(b); });

    // Walls
    bodies.forEach(b => { if (b.label === 'Wall') drawBody(b, '#333', '#222'); });

    // Shapes (with cracks if damaged)
    bodies.forEach(b => {
      if (b.label === 'Shape') {
        const isDragged = b === dragBody;
        drawBody(b, b._damage > 0 ? '#eee' : '#fff', '#555');

        // Draw cracks
        if (b._cracks && b._cracks.length > 0) {
          ctx.strokeStyle = `rgba(0,0,0,${0.3 + b._damage * 0.5})`;
          ctx.lineWidth = 1;
          b._cracks.forEach(c => {
            ctx.beginPath();
            ctx.moveTo(c.x1, c.y1);
            ctx.lineTo(c.x2, c.y2);
            ctx.stroke();
          });
        }

        // Drag highlight
        if (isDragged) {
          drawBody(b, 'rgba(255,255,255,0.3)', 'transparent');
        }
      }
    });

    // Fragments (irregular broken pieces)
    bodies.forEach(b => {
      if (b.label === 'Fragment') {
        drawBody(b, '#ddd', '#777');
      }
    });

    // Wall preview
    const tool = typeof Tools !== 'undefined' ? Tools.getCurrentTool() : null;
    if (tool === 'wall' && Tools.isCurrentlyDrawing()) {
      const start = Tools.getDrawStart();
      if (start) {
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(
          Math.min(start.x, mouseX), Math.min(start.y, mouseY),
          Math.abs(mouseX - start.x), Math.abs(mouseY - start.y)
        );
        ctx.setLineDash([]);
      }
    }

    Particles.update();

    const el = document.getElementById('objectCounter');
    if (el) el.textContent = `OBJECTS: ${getObjectCount()}`;
  }

  function drawBody(body, fill, stroke) {
    const verts = body.vertices;
    ctx.beginPath();
    ctx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) {
      ctx.lineTo(verts[i].x, verts[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke && stroke !== 'transparent') {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawGravityWell(body) {
    const x = body.position.x, y = body.position.y;
    const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 400);
    for (let i = 3; i >= 0; i--) {
      const r = 18 + i * 10 * pulse;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${0.04 + i * 0.03})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    const grad = ctx.createRadialGradient(x, y, 0, x, y, 18);
    grad.addColorStop(0, 'rgba(255,255,255,0.3)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }

  function getCanvas() { return canvas; }
  function getCtx() { return ctx; }
  function getEngine() { return engine; }
  function getWorld() { return world; }

  function togglePause() {
    if (runner.enabled) { Runner.stop(runner); return false; }
    else { Runner.run(runner, engine); return true; }
  }

  const physics = {
    init, spawnShape, explode, drawWall, addGravityWell,
    removeBody, clearAll, getBodyAt, getObjectCount,
    update, getCanvas, getCtx, getEngine, getWorld,
    togglePause, setMousePos,
    startDrag, moveDrag, endDrag, isDragging
  };
  return physics;
})();
