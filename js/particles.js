/**
 * Physics Playground — Particle Effects System
 * Lightweight burst particles for collisions and explosions.
 */

const Particles = (() => {
  let particles = [];

  function spawn(x, y, color, count = 10, opts = {}) {
    const speed = opts.speed || 3;
    const size = opts.size || 4;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      const life = 30 + Math.random() * 40;
      particles.push({
        x, y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life,
        maxLife: life,
        size: size * (0.3 + Math.random() * 0.7),
        color: adjustBrightness(color, 20 + Math.random() * 40)
      });
    }
  }

  function adjustBrightness(hex, amount) {
    const num = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + amount));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
    const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
    return `rgb(${r},${g},${b})`;
  }

  function update() {
    const ctx = Physics.getCtx();
    if (!ctx) return;

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.97;
      p.vy += 0.05; // gravity
      p.life--;

      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function clear() {
    particles = [];
  }

  function getCount() { return particles.length; }

  return { spawn, update, clear, getCount };
})();
