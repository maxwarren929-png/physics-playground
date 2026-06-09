/**
 * Physics Playground — Main App
 * Initializes canvas, physics, tools, and runs the render loop.
 */

(function() {
  const canvas = document.getElementById('canvas');
  let isPaused = false;

  const physicsReady = Physics.init(canvas);
  if (!physicsReady) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#f44';
      ctx.font = '14px monospace';
      ctx.fillText('Physics engine failed to load. Check console.', 20, 30);
    }
    return;
  }

  // ── Mouse helpers ──
  function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  // Track mouse position always (for wall preview)
  canvas.addEventListener('mousemove', (e) => {
    const p = getMousePos(e);
    Tools.onMouseMove(p.x, p.y);

    // Handle shape dragging
    if (Physics.isDragging()) {
      Physics.moveDrag(p.x, p.y);
    }
  });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const p = getMousePos(e);

    // Try to start dragging a shape first
    if (Tools.getCurrentTool() === 'spawn' && Physics.startDrag(p.x, p.y)) {
      return; // Dragging, don't spawn
    }

    Tools.onMouseDown(p.x, p.y);
  });

  canvas.addEventListener('mouseup', (e) => {
    if (e.button !== 0) return;
    const p = getMousePos(e);

    if (Physics.isDragging()) {
      Physics.endDrag();
      return;
    }

    Tools.onMouseUp(p.x, p.y);
  });

  // ── Toolbar buttons ──
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => Tools.setTool(btn.dataset.tool));
  });

  // ── Shape options ──
  document.querySelectorAll('.opt-btn[data-shape]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.opt-btn[data-shape]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      Tools.setCurrentShape(btn.dataset.shape);
    });
  });

  // ── Explosion strength slider ──
  const expSlider = document.getElementById('explosionStrength');
  const expVal = document.getElementById('explosionStrengthVal');
  if (expSlider && expVal) {
    expSlider.addEventListener('input', () => {
      expVal.textContent = parseFloat(expSlider.value).toFixed(2);
    });
  }

  // ── Gravity strength slider ──
  const gravSlider = document.getElementById('gravityStrength');
  const gravVal = document.getElementById('gravityStrengthVal');
  if (gravSlider && gravVal) {
    gravSlider.addEventListener('input', () => {
      gravVal.textContent = parseFloat(gravSlider.value).toFixed(1);
    });
  }

  // ── Clear ──
  document.getElementById('clearBtn').addEventListener('click', () => Physics.clearAll());

  // ── Pause ──
  document.getElementById('pauseBtn').addEventListener('click', () => {
    const running = Physics.togglePause();
    isPaused = !running;
    const icon = document.getElementById('pauseIcon');
    const label = document.getElementById('pauseLabel');
    if (isPaused) {
      icon.innerHTML = '<polygon points="5,3 19,12 5,21"/>';
      label.textContent = '>PLAY';
    } else {
      icon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
      label.textContent = 'PAUSE';
    }
  });

  // ── Keyboard ──
  document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    const map = {
      '1': 'spawn', '2': 'explode', '3': 'wall',
      '4': 'gravity', '5': 'erase',
      ' ': 'pause'
    };
    if (map[key]) {
      e.preventDefault();
      if (map[key] === 'pause') {
        document.getElementById('pauseBtn').click();
      } else {
        Tools.setTool(map[key]);
      }
    }
  });

  // ── Render loop ──
  function loop() {
    Physics.update();
    requestAnimationFrame(loop);
  }
  loop();

  console.log('■ PHYSICS PLAYGROUND ■');
  console.log('[1] Spawn  [2] Explode  [3] Wall  [4] Gravity  [5] Erase  [Space] Pause');
  console.log('Drag shapes with the Spawn tool');
})();
