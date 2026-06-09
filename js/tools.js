/**
 * Physics Playground — Tool System
 * Handles mouse interactions for each tool mode.
 */

const Tools = (() => {
  let currentTool = 'spawn';
  let currentShape = 'circle';
  let isDrawing = false;
  let drawStart = null;

  // ── Spawn ──
  function handleSpawn(x, y) {
    Physics.spawnShape(x, y, currentShape);
  }

  // ── Explosion ──
  function handleExplode(x, y) {
    Physics.explode(x, y, 150, 0.05);
  }

  // ── Draw Wall ──
  function handleWallStart(x, y) {
    isDrawing = true;
    drawStart = { x, y };
  }

  function handleWallMove(x, y) {
    if (!isDrawing || !drawStart) return;
    // Preview while drawing
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
    if (body) {
      Physics.removeBody(body);
    }
  }

  // ── Dispatch ──
  function onMouseDown(x, y) {
    switch (currentTool) {
      case 'spawn': handleSpawn(x, y); break;
      case 'explode': handleExplode(x, y); break;
      case 'wall': handleWallStart(x, y); break;
      case 'gravity': handleGravity(x, y); break;
      case 'erase': handleErase(x, y); break;
    }
  }

  function onMouseMove(x, y) {
    if (currentTool === 'wall' && isDrawing) {
      // We'll draw a preview line in the render loop
    }
  }

  function onMouseUp(x, y) {
    if (currentTool === 'wall') {
      handleWallEnd(x, y);
    }
  }

  function setTool(tool) {
    currentTool = tool;
    // Update UI
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-tool="${tool}"]`).classList.add('active');
    document.querySelectorAll('.tool-options-group').forEach(g => g.classList.remove('active'));
    const optGroup = document.getElementById(`${tool}Options`);
    if (optGroup) optGroup.classList.add('active');
    // Cursor changes
    const canvas = Physics.getCanvas();
    canvas.style.cursor = tool === 'spawn' ? 'crosshair'
      : tool === 'explode' ? 'cell'
      : tool === 'wall' ? 'copy'
      : tool === 'gravity' ? 'grab'
      : tool === 'erase' ? 'not-allowed' : 'default';
  }

  function isCurrentlyDrawing() { return isDrawing; }
  function getDrawStart() { return drawStart; }
  function getCurrentTool() { return currentTool; }
  function getCurrentShape() { return currentShape; }
  function setCurrentShape(shape) { currentShape = shape; }

  return {
    onMouseDown, onMouseMove, onMouseUp, setTool,
    isCurrentlyDrawing, getDrawStart, getCurrentTool,
    getCurrentShape, setCurrentShape
  };
})();
