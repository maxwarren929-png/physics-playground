/**
 * Physics Playground — Physics Engine (Matter.js wrapper)
 * Manages the Matter.js world, body creation, and rendering.
 */

const Physics = (() => {
  // Matter.js aliases
  const {
    Engine, Render, Runner, Bodies, Body, Composite, Events, Vector,
    Constraint, Mouse, MouseConstraint, Query
  } = Matter;

  let engine, world, renderer, runner;
  let canvas, ctx;
  let walls = [];

  // Pastel color palette
  const COLORS = [
    '#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF',
    '#D4BAFF', '#FFBAF2', '#BAFFF5', '#FFC8BA', '#C8FFBA',
    '#BAC8FF', '#FFE0BA', '#BAFFE0', '#E0BAFF', '#FFBAC8'
  ];

  function randomColor() {
    return COLORS[Math.floor(Math.random() * COLORS.length)];
  }

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');

    resize();
    window.addEventListener('resize', resize);

    // Create engine
    engine = Engine.create({
      gravity: { x: 0, y: 1.5 }
    });
    world = engine.world;

    // Create walls (invisible boundaries)
    createBoundaries();

    // Start engine
    runner = Runner.create();
    Runner.run(runner, engine);

    // Mouse constraint for dragging
    const mouse = Mouse.create(canvas);
    const mouseConstraint = MouseConstraint.create(engine, {
      mouse,
      constraint: {
        stiffness: 0.2,
        render: { visible: false }
      }
    });
    Composite.add(world, mouseConstraint);

    // Collision events for particles
    Events.on(engine, 'collisionStart', (event) => {
      event.pairs.forEach(pair => {
        const bodies = [pair.bodyA, pair.bodyB];
        bodies.forEach(b => {
          if (b.label !== 'Particle' && !b.isStatic && b._emitParticles !== false) {
            Particles.spawn(
              b.position.x,
              b.position.y,
              b._color || '#FFB3BA',
              3 + Math.random() * 5
            );
          }
        });
      });
    });

    return physics;
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function createBoundaries() {
    const w = canvas.width;
    const h = canvas.height;
    const thickness = 60;
    const opts = { isStatic: true, restitution: 0.3, label: 'Boundary' };
    Composite.add(world, [
      Bodies.rectangle(w / 2, h + thickness / 2, w + thickness, thickness, opts),
      Bodies.rectangle(-thickness / 2, h / 2, thickness, h + thickness, opts),
      Bodies.rectangle(w + thickness / 2, h / 2, thickness, h + thickness, opts),
    ]);
  }

  function spawnShape(x, y, type = 'circle', size) {
    const s = size || 20 + Math.random() * 25;
    const color = randomColor();
    const opts = {
      restitution: 0.4,
      friction: 0.05,
      frictionAir: 0.01,
      density: 0.002,
      _color: color,
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
      body._color = color;
      body._emitting = true;
      Composite.add(world, body);
    }
    return body;
  }

  function explode(x, y, radius = 150, force = 0.05) {
    const bodies = Composite.allBodies(world);
    bodies.forEach(body => {
      if (body.isStatic || body.label === 'Boundary') return;
      const dx = body.position.x - x;
      const dy = body.position.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < radius) {
        const power = (1 - dist / radius) * force;
        Body.applyForce(body, body.position, {
          x: (dx / (dist || 1)) * power,
          y: (dy / (dist || 1)) * power
        });
      }
    });

    // Big particle burst
    Particles.spawn(x, y, '#FFB3BA', 40, { speed: 6 });
    Particles.spawn(x, y, '#FFDFBA', 35, { speed: 5 });
    Particles.spawn(x, y, '#FFFFBA', 30, { speed: 4 });
  }

  function drawWall(x1, y1, x2, y2) {
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const w = Math.abs(x2 - x1) + 10;
    const h = Math.abs(y2 - y1) + 10;
    const angle = Math.atan2(y2 - y1, x2 - x1);

    const wall = Bodies.rectangle(cx, cy, Math.max(w, 12), Math.max(h, 12), {
      isStatic: true,
      angle: 0,
      restitution: 0.3,
      friction: 0.8,
      _color: '#c8b8a8',
      label: 'Wall'
    });

    Composite.add(world, wall);
    walls.push(wall);
    return wall;
  }

  function addGravityWell(x, y, strength) {
    const well = Bodies.circle(x, y, 20, {
      isStatic: true,
      _color: '#c0a0e0',
      _gravityStrength: strength || 0.0015,
      label: 'GravityWell',
      collisionFilter: { group: -1 }
    });
    Composite.add(world, well);

    // Apply gravity force every tick
    const handler = Events.on(engine, 'beforeUpdate', () => {
      const bodies = Composite.allBodies(world);
      bodies.forEach(body => {
        if (body === well || body.isStatic || body.label === 'Boundary') return;
        const dx = well.position.x - body.position.x;
        const dy = well.position.y - body.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 5 && dist < 400) {
          const force = well._gravityStrength / (dist || 1);
          Body.applyForce(body, body.position, {
            x: (dx / dist) * force,
            y: (dy / dist) * force
          });
        }
      });
    });

    well._handler = handler;
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
    walls = [];
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

  function update() {
    // Custom rendering over Matter.js default
    const bodies = Composite.allBodies(world);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background
    ctx.fillStyle = '#f0ebe3';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw subtle grid
    ctx.strokeStyle = 'rgba(0,0,0,0.03)';
    ctx.lineWidth = 1;
    const step = 40;
    for (let x = 0; x < canvas.width; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    // Draw gravity wells first (behind)
    bodies.forEach(b => {
      if (b.label === 'GravityWell') {
        drawGravityWell(b);
      }
    });

    // Draw walls
    bodies.forEach(b => {
      if (b.label === 'Wall' && b.vertices) {
        drawBody(b, '#d0c0b0', true);
      }
    });

    // Draw shapes
    bodies.forEach(b => {
      if (b.label === 'Shape' && !b.isStatic) {
        drawBody(b, b._color || '#FFB3BA');
      }
    });

    // Particles
    Particles.update();

    // Update counter
    document.getElementById('objectCounter').textContent = `Objects: ${getObjectCount()}`;
  }

  function drawBody(body, color, isStatic) {
    const verts = body.vertices;
    ctx.beginPath();
    ctx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) {
      ctx.lineTo(verts[i].x, verts[i].y);
    }
    ctx.closePath();

    ctx.fillStyle = isStatic ? color : color + 'dd';
    ctx.fill();

    if (!isStatic) {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawGravityWell(body) {
    const x = body.position.x;
    const y = body.position.y;
    const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 300);

    // Outer rings
    for (let i = 3; i >= 0; i--) {
      const r = 24 + i * 12 * pulse;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(160, 140, 220, ${0.15 + i * 0.05})`;
      ctx.lineWidth = 2 - i * 0.3;
      ctx.setLineDash([4, 6]);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Core
    const grad = ctx.createRadialGradient(x, y, 0, x, y, 20);
    grad.addColorStop(0, 'rgba(200, 170, 240, 0.6)');
    grad.addColorStop(0.5, 'rgba(160, 120, 220, 0.4)');
    grad.addColorStop(1, 'rgba(160, 120, 220, 0)');
    ctx.beginPath();
    ctx.arc(x, y, 20, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Center dot
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#b090d0';
    ctx.fill();
  }

  function getCanvas() { return canvas; }
  function getCtx() { return ctx; }
  function getEngine() { return engine; }
  function getWorld() { return world; }
  function togglePause() {
    if (runner.enabled) {
      Runner.stop(runner);
    } else {
      Runner.run(runner, engine);
    }
    return runner.enabled;
  }

  const physics = {
    init, spawnShape, explode, drawWall, addGravityWell,
    removeBody, clearAll, getBodyAt, getObjectCount,
    update, getCanvas, getCtx, getEngine, getWorld,
    togglePause, randomColor
  };
  return physics;
})();
