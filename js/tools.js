/**
 * Physics Playground — Tool System
 * Handles mouse interactions for each tool mode.
 */

const Tools = (() => {
  let currentTool = 'spawn';
  let currentShape = 'circle';
  let isDrawing = false;
  let drawStart = null;
  let mouseX = 0, mouseY = 0;
  let gravityMode = 'well'; // 'well' or 'hole'
  let springStiffness = 0.05;

  // ── Spawn ──
  function handleSpawn(sx, sy) {
    const p = Physics.screenToWorld ? Physics.screenToWorld(sx, sy) : { x: sx, y: sy };
    const size = parseInt(document.getElementById('shapeSize').value) || 8;
    switch (currentShape) {
      case 'ragdoll':
        Physics.spawnRagdoll(p.x, p.y, size);
        break;
      case 'force':
        Physics.spawnForce(p.x, p.y);
        break;
      case 'immovable':
        Physics.spawnImmovable(p.x, p.y);
        break;
      default:
        Physics.spawnShape(p.x, p.y, currentShape, size);
        break;
    }
  }

  // ── Explosion ──
  function handleExplode(sx, sy) {
    const p = Physics.screenToWorld ? Physics.screenToWorld(sx, sy) : { x: sx, y: sy };
    const strength = parseFloat(document.getElementById('explosionStrength').value);
    Physics.explode(p.x, p.y, strength);
  }

  // ── Draw Wall ──
  function handleWallStart(sx, sy) {
    isDrawing = true;
    drawStart = { x: sx, y: sy };
  }

  function handleWallEnd(sx, sy) {
    if (!isDrawing || !drawStart) return;
    const s = Physics.screenToWorld ? Physics.screenToWorld(drawStart.x, drawStart.y) : { x: drawStart.x, y: drawStart.y };
    const e = Physics.screenToWorld ? Physics.screenToWorld(sx, sy) : { x: sx, y: sy };
    Physics.drawWall(s.x, s.y, e.x, e.y);
    isDrawing = false;
    drawStart = null;
  }

  // ── Gravity ──
  function handleGravity(sx, sy) {
    const p = Physics.screenToWorld ? Physics.screenToWorld(sx, sy) : { x: sx, y: sy };
    const strength = parseFloat(document.getElementById('gravityStrength').value);
    if (gravityMode === 'hole') {
      Physics.addBlackHole(p.x, p.y, strength);
    } else {
      Physics.addGravityWell(p.x, p.y, strength);
    }
  }

  // ── Erase ──
  function handleErase(sx, sy) {
    const p = Physics.screenToWorld ? Physics.screenToWorld(sx, sy) : { x: sx, y: sy };
    const body = Physics.getBodyAt(p.x, p.y);
    if (body) Physics.removeBody(body);
  }

  // ── Spring ──
  function handleSpring(sx, sy) {
    const p = Physics.screenToWorld ? Physics.screenToWorld(sx, sy) : { x: sx, y: sy };
    const bodyA = Physics.getSpringBodyA();

    if (bodyA) {
      // Second click — check if we hit another body or empty space
      const bodyB = Physics.getBodyAt(p.x, p.y);
      if (bodyB && bodyB !== bodyA) {
        Physics.addSpringConstraint(bodyA, bodyB, springStiffness);
      } else {
        Physics.addAnchoredSpring(bodyA, p.x, p.y, springStiffness);
      }
      Physics.clearSpringBodyA();
    } else {
      // First click — select body A
      const hit = Physics.getBodyAt(p.x, p.y);
      if (hit) {
        Physics.setSpringBodyA(hit);
      }
    }
  }

  // ── Dispatch ──
  function onMouseDown(x, y) {
    switch (currentTool) {
      case 'spawn':   handleSpawn(x, y); break;
      case 'explode': handleExplode(x, y); break;
      case 'wall':    handleWallStart(x, y); break;
      case 'gravity': handleGravity(x, y); break;
      case 'erase':   handleErase(x, y); break;
      case 'spring':  handleSpring(x, y); break;
    }
  }

  function onMouseMove(x, y) {
    mouseX = x;
    mouseY = y;
    Physics.setMousePos(x, y);
  }

  function onMouseUp(x, y) {
    if (currentTool === 'wall') handleWallEnd(x, y);
  }

  // ── Tool switching ──
  function setTool(tool) {
    currentTool = tool;
    isDrawing = false;
    drawStart = null;
    if (tool !== 'spring') Physics.clearSpringBodyA();

    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`[data-tool="${tool}"]`);
    if (btn) btn.classList.add('active');

    document.querySelectorAll('.tool-options-group').forEach(g => g.classList.remove('active'));
    const opt = document.getElementById(`${tool}Options`);
    if (opt) opt.classList.add('active');

    const canvas = Physics.getCanvas();
    if (canvas) {
      const cursors = { spawn: 'crosshair', explode: 'cell', wall: 'copy', gravity: 'grab', erase: 'not-allowed', spring: 'pointer' };
      canvas.style.cursor = cursors[tool] || 'default';
    }
  }

  // ── Accessors ──
  function isCurrentlyDrawing() { return isDrawing; }
  function getDrawStart() { return drawStart; }
  function getCurrentTool() { return currentTool; }
  function getCurrentShape() { return currentShape; }
  function setCurrentShape(shape) { currentShape = shape; }
  function getGravityMode() { return gravityMode; }
  function setGravityMode(mode) { gravityMode = mode; }
  function getSpringStiffness() { return springStiffness; }
  function setSpringStiffness(s) { springStiffness = s; }
  function getMouseX() { return mouseX; }
  function getMouseY() { return mouseY; }

  return {
    onMouseDown, onMouseMove, onMouseUp, setTool,
    isCurrentlyDrawing, getDrawStart, getCurrentTool,
    getCurrentShape, setCurrentShape,
    getGravityMode, setGravityMode,
    getSpringStiffness, setSpringStiffness,
    getMouseX, getMouseY
  };
})();
