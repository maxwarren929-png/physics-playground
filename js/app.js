/**
 * Physics Playground — Main App
 * Initializes the canvas, physics, tools, and runs the render loop.
 */

(function() {
  const canvas = document.getElementById('canvas');
  let isPaused = false;

  // Init physics
  Physics.init(canvas);

  // ── Mouse events ──
  function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    Tools.onMouseDown(getMousePos(e).x, getMousePos(e).y);
  });

  canvas.addEventListener('mousemove', (e) => {
    Tools.onMouseMove(getMousePos(e).x, getMousePos(e).y);
  });

  canvas.addEventListener('mouseup', (e) => {
    if (e.button !== 0) return;
    Tools.onMouseUp(getMousePos(e).x, getMousePos(e).y);
  });

  // ── Toolbar buttons ──
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      Tools.setTool(btn.dataset.tool);
    });
  });

  // ── Shape options ──
  document.querySelectorAll('.opt-btn[data-shape]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.opt-btn[data-shape]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      Tools.setCurrentShape(btn.dataset.shape);
    });
  });

  // ── Gravity strength slider ──
  const slider = document.getElementById('gravityStrength');
  const sliderVal = document.getElementById('gravityStrengthVal');
  slider.addEventListener('input', () => {
    sliderVal.textContent = parseFloat(slider.value).toFixed(4);
  });

  // ── Clear button ──
  document.getElementById('clearBtn').addEventListener('click', () => {
    Physics.clearAll();
  });

  // ── Pause button ──
  document.getElementById('pauseBtn').addEventListener('click', () => {
    Physics.togglePause();
    isPaused = !isPaused;
    const icon = document.getElementById('pauseIcon');
    const label = document.getElementById('pauseLabel');
    if (isPaused) {
      icon.innerHTML = '<polygon points="5,3 19,12 5,21"/>';
      label.textContent = 'Play';
    } else {
      icon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
      label.textContent = 'Pause';
    }
  });

  // ── Keyboard shortcuts ──
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

  console.log('🎮 Physics Playground loaded!');
  console.log('📌 Tools: Spawn(1), Explode(2), Wall(3), Gravity(4), Erase(5), Pause(Space)');
})();
