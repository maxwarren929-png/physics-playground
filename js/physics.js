/**
 * Physics Playground — Physics Engine (Matter.js wrapper)
 * B&W pixel theme. Destructible pixel shapes.
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

  const PIXEL = 6; // each pixel is 6×6 px

  function init(canvasEl) {
    try {
      canvas = canvasEl;
      ctx = canvas.getContext('2d');

      resize();
      window.addEventListener('resize', resize);

      engine = Engine.create({
        gravity: { x: 0, y: 0.4 }
      });
      world = engine.world;

      createBoundaries();

      runner = Runner.create();
      Runner.run(runner, engine);

      Events.on(engine, 'collisionStart', (event) => {
        event.pairs.forEach(pair => {
          [pair.bodyA, pair.bodyB].forEach(b => {
            if (b.label === 'Pixel' && !b.isStatic) {
              Particles.spawn(b.position.x, b.position.y, 3);
            }
          });
        });
      });

      return physics;
    } catch(e) {
      console.error('Physics.init failed:', e.message, e.stack);
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

  // ── Spawn pixel shape ──
  function spawnShape(x, y, type, gridSize) {
    const gs = gridSize || 8;
    const half = (gs * PIXEL) / 2;
    const bodies = [];

    for (let row = 0; row < gs; row++) {
      for (let col = 0; col < gs; col++) {
        const px = x - half + col * PIXEL + PIXEL / 2;
        const py = y - half + row * PIXEL + PIXEL / 2;

        if (!pixelInside(col, row, gs, type)) continue;

        const body = Bodies.rectangle(px, py, PIXEL - 0.5, PIXEL - 0.5, {
          restitution: 0.1,
          friction: 0.5,
          density: 0.003,
          label: 'Pixel'
        });
        Composite.add(world, body);
        bodies.push(body);
      }
    }
    return bodies;
  }

  function pixelInside(col, row, gs, type) {
    const nc = (col + 0.5) / gs; // 0..1 normalized col
    const nr = (row + 0.5) / gs; // 0..1 normalized row

    switch (type) {
      case 'rect':
        return true;
      case 'circle': {
        const cx = (nc - 0.5) * 2;
        const cy = (nr - 0.5) * 2;
        return (cx * cx + cy * cy) < 1;
      }
      case 'triangle':
        // Upright isosceles triangle (apex at top center)
        return nc >= (1 - nr) / 2 && nc <= (1 + nr) / 2;
      default:
        return true;
    }
  }

  // ── Explosion ──
  function explode(x, y, force) {
    const f = force || 0.3;
    const radius = 250;
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

    Particles.spawn(x, y, 80, { speed: 8 });
    Particles.spawn(x, y, 50, { speed: 5 });
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
    const str = strength || 6;
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
    return Composite.allBodies(world).filter(b => b.label !== 'Boundary').length;
  }

  function setMousePos(x, y) { mouseX = x; mouseY = y; }

  // ── Render ──
  function update() {
    const bodies = Composite.allBodies(world);

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Faint grid
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

    // Pixel shapes & dragged body highlight
    bodies.forEach(b => {
      if (b.label === 'Pixel') {
        const isDragged = b === dragBody;
        drawBody(b, isDragged ? '#aaa' : '#fff', '#555');
      }
    });

    // Wall preview
    const tool = typeof Tools !== 'undefined' ? Tools.getCurrentTool() : null;
    const drawing = typeof Tools !== 'undefined' ? Tools.isCurrentlyDrawing() : false;
    if (tool === 'wall' && drawing) {
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

    // Particles
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
    const x = body.position.x;
    const y = body.position.y;
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
