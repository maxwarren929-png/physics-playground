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
  function handleSpawn(x, y) {
    const size = parseInt(document.getElementById('shapeSize').value) || 8;
    Physics.spawnShape(x, y, currentShape, size);
  }

  // ── Explosion ──
  function handleExplode(x, y) {
    const strength = parseFloat(document.getElementById('explosionStrength').value);
    Physics.explode(x, y, strength);
  }

  // ── Draw Wall ──
  function handleWallStart(x, y) {
    isDrawing = true;
    drawStart = { x, y };
  }

  function handleWallEnd(x, y) {
    if (!isDrawing || !drawStart) return;
    Physics.drawWall(drawStart.x, drawStart.y, x, y);
    isDrawing = false;
    drawStart = null;
  }

  // ── Gravity Well ──
  function handleGravity(x, y) {
    const strength = parseFloat(document.getElementById('gravityStrength').value);
    Physics.addGravityWell(x, y, strength);
  }

  // ── Erase ──
  function handleErase(x, y) {
    const body = Physics.getBodyAt(x, y);
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
