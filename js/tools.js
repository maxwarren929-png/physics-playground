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

  // ── Spawn ──
  function handleSpawn(sx, sy) {
    const p = Physics.screenToWorld ? Physics.screenToWorld(sx, sy) : { x: sx, y: sy };
    const size = parseInt(document.getElementById('shapeSize').value) || 8;
    Physics.spawnShape(p.x, p.y, currentShape, size);
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

  // ── Gravity Well ──
  function handleGravity(sx, sy) {
    const p = Physics.screenToWorld ? Physics.screenToWorld(sx, sy) : { x: sx, y: sy };
    const strength = parseFloat(document.getElementById('gravityStrength').value);
    Physics.addGravityWell(p.x, p.y, strength);
  }

  // ── Erase ──
  function handleErase(sx, sy) {
    const p = Physics.screenToWorld ? Physics.screenToWorld(sx, sy) : { x: sx, y: sy };
    const body = Physics.getBodyAt(p.x, p.y);
    if (body) Physics.removeBody(body);
  }

  // ── Dispatch ──
  function onMouseDown(x, y) {
    switch (currentTool) {
      case 'spawn':   handleSpawn(x, y); break;
      case 'explode': handleExplode(x, y); break;
      case 'wall':    handleWallStart(x, y); break;
      case 'gravity': handleGravity(x, y); break;
      case 'erase':   handleErase(x, y); break;
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
    // Cancel any wall draw in progress
    isDrawing = false;
    drawStart = null;

    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`[data-tool="${tool}"]`);
    if (btn) btn.classList.add('active');

    document.querySelectorAll('.tool-options-group').forEach(g => g.classList.remove('active'));
    const opt = document.getElementById(`${tool}Options`);
    if (opt) opt.classList.add('active');

    const canvas = Physics.getCanvas();
    if (canvas) {
      const cursors = { spawn: 'crosshair', explode: 'cell', wall: 'copy', gravity: 'grab', erase: 'not-allowed' };
      canvas.style.cursor = cursors[tool] || 'default';
    }
  }

  // ── Accessors ──
  function isCurrentlyDrawing() { return isDrawing; }
  function getDrawStart() { return drawStart; }
  function getCurrentTool() { return currentTool; }
  function getCurrentShape() { return currentShape; }
  function setCurrentShape(shape) { currentShape = shape; }
  function getMouseX() { return mouseX; }
  function getMouseY() { return mouseY; }

  return {
    onMouseDown, onMouseMove, onMouseUp, setTool,
    isCurrentlyDrawing, getDrawStart, getCurrentTool,
    getCurrentShape, setCurrentShape,
    getMouseX, getMouseY
  };
})();
