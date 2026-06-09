/**
 * Physics Playground — Physics Engine (Matter.js wrapper)
 * Rigid shapes that fracture on explosion.
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
      body._shapeType = type;
      Composite.add(world, body);
    }
    return body;
  }

  // ── Explosion ──
  function explode(x, y, force) {
    const f = force || 0.3;
    const radius = 250;
    const bodies = Composite.allBodies(world);
    const toFracture = [];

    bodies.forEach(body => {
      if (body.isStatic || body.label === 'Boundary') return;
      const dx = body.position.x - x;
      const dy = body.position.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < radius) {
        const power = (1 - dist / radius) * f;

        // Fracture shapes/fragments if blast is strong enough
        if ((body.label === 'Shape' || body.label === 'Fragment') && power > 0.1) {
          toFracture.push({ body, dist, power, dx, dy });
        } else {
          Body.applyForce(body, body.position, {
            x: (dx / (dist || 1)) * power,
            y: (dy / (dist || 1)) * power
          });
        }
      }
    });

    // Fracture collected bodies (split into chunks)
    toFracture.forEach(({ body, dist, power, dx, dy }) => {
      fractureBody(body, x, y, force, dist);
    });

    Particles.spawn(x, y, 25, { speed: 7 });
    Particles.spawn(x, y, 12, { speed: 4 });
  }

  // ── Fracture a shape into chunks ──
  function fractureBody(body, explosionX, explosionY, force, dist) {
    const pos = body.position;
    const type = body._shapeType || 'rect';
    const size = Math.max(
      body.bounds.max.x - body.bounds.min.x,
      body.bounds.max.y - body.bounds.min.y
    );

    Composite.remove(world, body);

    const count = 2 + Math.floor(Math.random() * 2); // 2-3 chunks
    const pieceScale = 0.35 + Math.random() * 0.15; // 35-50% of original size
    const pieceR = size * pieceScale * 0.5;

    for (let i = 0; i < count; i++) {
      // Distribute pieces around the body perimeter
      const angle = (Math.PI * 2 / count) * i + Math.random() * 0.5;
      const offset = size * 0.25; // offset from center so they appear at edges
      const px = pos.x + Math.cos(angle) * offset + (Math.random() - 0.5) * 4;
      const py = pos.y + Math.sin(angle) * offset + (Math.random() - 0.5) * 4;

      const opts = {
        restitution: 0.15,
        friction: 0.5,
        density: 0.003,
        label: 'Fragment'
      };

      let piece;
      switch (type) {
        case 'circle':
          piece = Bodies.circle(px, py, pieceR * (0.7 + Math.random() * 0.3), opts);
          break;
        case 'rect':
          piece = Bodies.rectangle(
            px, py,
            size * pieceScale * (0.7 + Math.random() * 0.3),
            size * pieceScale * (0.7 + Math.random() * 0.3),
            opts
          );
          break;
        case 'triangle':
          piece = Bodies.polygon(px, py, 3, pieceR * (0.7 + Math.random() * 0.3), opts);
          break;
      }

      if (piece) {
        piece._shapeType = type;
        // Explosion velocity
        const ddx = px - explosionX;
        const ddy = py - explosionY;
        const d = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
        const power = (1 - dist / 250) * force * 0.5;
        Body.setVelocity(piece, {
          x: (ddx / d) * power * (0.6 + Math.random() * 0.8),
          y: (ddy / d) * power * (0.6 + Math.random() * 0.8) - 1.5
        });
        Body.setAngularVelocity(piece, (Math.random() - 0.5) * 0.15);

        Composite.add(world, piece);

        // Fragments decay after 5-9 seconds
        decayTimers[piece.id] = Date.now() + 5000 + Math.random() * 4000;
      }
    }
  }

  // Periodic decay cleanup (removes expired fragments)
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

    // Shapes (intact)
    bodies.forEach(b => {
      if (b.label === 'Shape') {
        drawBody(b, b === dragBody ? '#aaa' : '#fff', '#555');
      }
    });

    // Fragments (broken-off pieces)
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
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
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
