/**
 * Physics Playground — Pixel Particle Effects
 * Tiny black squares for collisions and explosions.
 */

const Particles = (() => {
  let particles = [];

  function spawn(x, y, count = 10, opts = {}) {
    const speed = opts.speed || 4;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      const life = 25 + Math.random() * 35;
      particles.push({
        x, y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life,
        maxLife: life,
        size: 1 + (Math.random() * 2) | 0  // 1–3 px
      });
    }
  }

  function update() {
    const ctx = Physics.getCtx();
    if (!ctx) return;

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.95;
      p.vy += 0.015; // particle gravity (matches weak engine gravity)
      p.life--;

      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      const alpha = (p.life / p.maxLife) * 0.9;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#fff';
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function clear() { particles = []; }
  function getCount() { return particles.length; }

  return { spawn, update, clear, getCount };
})();
