/**
 * Physics Playground — Physics Engine (Matter.js wrapper)
 * B&W pixel theme. Manages the Matter.js world, body creation, and rendering.
 */

const Physics = (() => {
  const {
    Engine, Runner, Bodies, Body, Composite, Events,
    Mouse, MouseConstraint, Query
  } = Matter;

  let engine, world, runner;
  let canvas, ctx;
  let gravityWells = [];
  let mouseX = 0, mouseY = 0;

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');

    resize();
    window.addEventListener('resize', resize);

    // Create engine - strong gravity to feel weighty
    engine = Engine.create({
      gravity: { x: 0, y: 2 }
    });
    world = engine.world;

    createBoundaries();

    runner = Runner.create();
    Runner.run(runner, engine);

    // Mouse constraint for dragging shapes
    const mouse = Mouse.create(canvas);
    const mouseConstraint = MouseConstraint.create(engine, {
      mouse,
      constraint: {
        stiffness: 0.2,
        render: { visible: false }
      }
    });
    Composite.add(world, mouseConstraint);

    // Collision → black pixel burst
    Events.on(engine, 'collisionStart', (event) => {
      event.pairs.forEach(pair => {
        const bodies = [pair.bodyA, pair.bodyB];
        bodies.forEach(b => {
          if (b.label === 'Shape' && !b.isStatic) {
            Particles.spawn(b.position.x, b.position.y, 5);
          }
        });
      });
    });

    return physics;
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    // Rebuild boundaries at new size
    rebuildBoundaries();
  }

  let boundaryBodies = [];
  function createBoundaries() {
    const w = canvas.width;
    const h = canvas.height;
    const t = 60;
    const opts = { isStatic: true, restitution: 0.2, label: 'Boundary' };
    boundaryBodies = [
      Bodies.rectangle(w / 2, h + t / 2, w + t * 2, t, opts),
      Bodies.rectangle(-t / 2, h / 2, t, h + t * 2, opts),
      Bodies.rectangle(w + t / 2, h / 2, t, h + t * 2, opts),
    ];
    Composite.add(world, boundaryBodies);
  }

  function rebuildBoundaries() {
    boundaryBodies.forEach(b => Composite.remove(world, b));
    createBoundaries();
  }

  // ── Spawn ──
  function spawnShape(x, y, type = 'circle', size) {
    const s = size || 18 + Math.random() * 22;
    const opts = {
      restitution: 0.2,
      friction: 0.3,
      frictionAir: 0.015,
      density: 0.003,
      label: 'Shape'
    };

    let body;
    switch (type) {
      case 'circle':
        body = Bodies.circle(x, y, s, opts);
        break;
      case 'rect':
        body = Bodies.rectangle(x, y, s * 1.8, s * 1.8, opts);
        break;
      case 'triangle':
        body = Bodies.polygon(x, y, 3, s * 1.4, opts);
        break;
    }

    if (body) {
      Composite.add(world, body);
    }
    return body;
  }

  // ── Explosion ──
  function explode(x, y, force) {
    const f = force || 0.3;
    const radius = 200;
    const bodies = Composite.allBodies(world);
    bodies.forEach(body => {
      if (body.isStatic || body.label === 'Boundary') return;
      const dx = body.position.x - x;
      const dy = body.position.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < radius) {
        const power = (1 - dist / radius) * f;
        Body.applyForce(body, body.position, {
          x: (dx / (dist || 1)) * power,
          y: (dy / (dist || 1)) * power
        });
      }
    });

    // Big black pixel burst
    Particles.spawn(x, y, 60, { speed: 8 });
    Particles.spawn(x, y, 40, { speed: 5 });
  }

  // ── Wall ──
  function drawWall(x1, y1, x2, y2) {
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const w = Math.max(Math.abs(x2 - x1) + 10, 12);
    const h = Math.max(Math.abs(y2 - y1) + 10, 12);

    const wall = Bodies.rectangle(cx, cy, w, h, {
      isStatic: true,
      restitution: 0.2,
      friction: 0.9,
      label: 'Wall'
    });

    Composite.add(world, wall);
    return wall;
  }

  // ── Gravity Well ──
  function addGravityWell(x, y, strength) {
    const str = strength || 6;
    const well = Bodies.circle(x, y, 16, {
      isStatic: true,
      label: 'GravityWell',
      collisionFilter: { group: -1 }
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
          // Linear falloff: strongest at center, 0 at edge
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
    if (body._handler) {
      Events.off(engine, 'beforeUpdate', body._handler);
    }
    Composite.remove(world, body);
  }

  function clearAll() {
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
    const bodies = Composite.allBodies(world);
    return bodies.filter(b => b.label !== 'Boundary').length;
  }

  // ── Mouse tracking for wall preview ──
  function setMousePos(x, y) { mouseX = x; mouseY = y; }

  // ── Render ──
  function update() {
    const bodies = Composite.allBodies(world);

    // Clear to black
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle grid (very faint)
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    const step = 32;
    for (let x = 0; x < canvas.width; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    // 1) Gravity wells
    bodies.forEach(b => {
      if (b.label === 'GravityWell') drawGravityWell(b);
    });

    // 2) Walls
    bodies.forEach(b => {
      if (b.label === 'Wall') drawBody(b, '#333', '#222');
    });

    // 3) Shapes
    bodies.forEach(b => {
      if (b.label === 'Shape' && !b.isStatic) drawBody(b, '#fff', '#555');
    });

    // 4) Wall preview while drawing
    const tool = Tools.getCurrentTool && Tools.getCurrentTool();
    const drawing = Tools.isCurrentlyDrawing && Tools.isCurrentlyDrawing();
    if (tool === 'wall' && drawing) {
      const start = Tools.getDrawStart && Tools.getDrawStart();
      if (start) {
        const x = Math.min(start.x, mouseX);
        const y = Math.min(start.y, mouseY);
        const w = Math.abs(mouseX - start.x);
        const h = Math.abs(mouseY - start.y);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
      }
    }

    // 5) Particles
    Particles.update();

    // Counter
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
    ctx.lineWidth = body.label === 'Wall' ? 1 : 1.5;
    ctx.stroke();
  }

  function drawGravityWell(body) {
    const x = body.position.x;
    const y = body.position.y;
    const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 400);

    // Rings
    for (let i = 3; i >= 0; i--) {
      const r = 18 + i * 10 * pulse;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${0.04 + i * 0.03})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Core glow
    const grad = ctx.createRadialGradient(x, y, 0, x, y, 18);
    grad.addColorStop(0, 'rgba(255,255,255,0.3)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Center pixel
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }

  // ── Accessors ──
  function getCanvas() { return canvas; }
  function getCtx() { return ctx; }
  function getEngine() { return engine; }
  function getWorld() { return world; }

  function togglePause() {
    if (runner.enabled) {
      Runner.stop(runner);
      return false;
    } else {
      Runner.run(runner, engine);
      return true;
    }
  }

  const physics = {
    init, spawnShape, explode, drawWall, addGravityWell,
    removeBody, clearAll, getBodyAt, getObjectCount,
    update, getCanvas, getCtx, getEngine, getWorld,
    togglePause, setMousePos
  };
  return physics;
})();
