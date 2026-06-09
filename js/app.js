/**
 * Physics Playground — Main App
 * Initializes canvas, physics, tools, camera controls, and UI.
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

  // ── Track mouse (screen coords for camera + tools) ──
  canvas.addEventListener('mousemove', (e) => {
    const p = getMousePos(e);
    Tools.onMouseMove(p.x, p.y);

    if (Physics.isDragging()) {
      Physics.moveDrag(p.x, p.y);
    }
  });

  // ── Left click ──
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const p = getMousePos(e);

    if (Tools.getCurrentTool() === 'spawn' && Physics.startDrag(p.x, p.y)) {
      return;
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

  // ── Right-click pan ──
  let panning = false;
  let panStart = { x: 0, y: 0 };
  let camStart = { x: 0, y: 0 };

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 2) return;
    panning = true;
    panStart = { x: e.clientX, y: e.clientY };
    const cam = Physics.getCamera();
    camStart = { x: cam.x, y: cam.y };
    e.preventDefault();
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!panning) return;
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    Physics.panCamera(dx, dy);
    panStart = { x: e.clientX, y: e.clientY };
    camStart = { x: Physics.getCamera().x, y: Physics.getCamera().y };
  });

  canvas.addEventListener('mouseup', (e) => {
    if (e.button === 2) panning = false;
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ── Scroll zoom ──
  canvas.addEventListener('wheel', (e) => {
    const p = getMousePos(e);
    Physics.handleZoom(e.deltaY, p.x, p.y);
    e.preventDefault();
  }, { passive: false });

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

  // ── Shape size slider ──
  const sizeSlider = document.getElementById('shapeSize');
  const sizeVal = document.getElementById('shapeSizeVal');
  if (sizeSlider && sizeVal) {
    sizeSlider.addEventListener('input', () => { sizeVal.textContent = sizeSlider.value; });
  }

  // ── Explosion strength slider ──
  const expSlider = document.getElementById('explosionStrength');
  const expVal = document.getElementById('explosionStrengthVal');
  if (expSlider && expVal) {
    expSlider.addEventListener('input', () => { expVal.textContent = parseFloat(expSlider.value).toFixed(2); });
  }

  // ── Gravity strength slider ──
  const gravSlider = document.getElementById('gravityStrength');
  const gravVal = document.getElementById('gravityStrengthVal');
  if (gravSlider && gravVal) {
    gravSlider.addEventListener('input', () => { gravVal.textContent = parseFloat(gravSlider.value).toFixed(1); });
  }

  // ── World size ──
  const worldBtns = document.querySelectorAll('[data-worldsize]');
  worldBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      worldBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      Physics.applyWorldSize(btn.dataset.worldsize);
    });
  });

  // ── Wind toggle ──
  const windBtn = document.getElementById('windToggle');
  if (windBtn) {
    windBtn.addEventListener('click', () => {
      const on = !Physics.isWindEnabled();
      Physics.toggleWind(on);
      windBtn.textContent = on ? 'WIND:ON' : 'WIND:OFF';
      windBtn.classList.toggle('active', on);
    });
  }

  // ── Reset camera ──
  const resetCamBtn = document.getElementById('resetCamBtn');
  if (resetCamBtn) {
    resetCamBtn.addEventListener('click', () => Physics.resetCamera());
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
    const key = e.key;
    const map = {
      '1': 'spawn', '2': 'explode', '3': 'wall',
      '4': 'gravity', '5': 'erase',
      ' ': 'pause', 'w': 'wind',
      'x': 'worldsize', 'r': 'resetcam'
    };
    if (map[key]) {
      e.preventDefault();
      switch (map[key]) {
        case 'pause': document.getElementById('pauseBtn').click(); break;
        case 'wind': windBtn && windBtn.click(); break;
        case 'resetcam': Physics.resetCamera(); break;
        case 'worldsize': {
          const btns = document.querySelectorAll('[data-worldsize]');
          const active = document.querySelector('[data-worldsize].active');
          let nextIdx = 0;
          btns.forEach((b, i) => { if (b === active) nextIdx = i + 1; });
          if (nextIdx >= btns.length) nextIdx = 0;
          btns[nextIdx].click();
          break;
        }
        default: Tools.setTool(map[key]);
      }
    }
  });

  // ── Render loop ──
  function loop() {
    Physics.update();

    // FPS counter
    const fpsEl = document.getElementById('fpsDisplay');
    if (fpsEl) fpsEl.textContent = `${Physics.getFps()} FPS`;

    requestAnimationFrame(loop);
  }
  loop();

  console.log('■ PHYSICS PLAYGROUND ■');
  console.log('[1] Spawn  [2] Explode  [3] Wall  [4] Gravity  [5] Erase');
  console.log('[Space] Pause  [W] Wind  [X] World size  [R] Reset camera');
  console.log('Scroll to zoom · Right-click drag to pan');
})();
