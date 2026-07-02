// Live background: a gently drifting light-blue particle network. Clearly visible
// motion, still calm. Paused during the test (body.test-mode) and when the tab is
// hidden; frozen to a single static frame under prefers-reduced-motion.
const canvas = document.getElementById("bg-canvas");
if (canvas && canvas.getContext) {
    const ctx = canvas.getContext("2d");
    const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, dpr = 1;
    let particles = [];

    const spawn = () => {
        const speed = 0.15 + Math.random() * 0.4;
        const ang = Math.random() * Math.PI * 2;
        return {
            x: Math.random() * w, y: Math.random() * h,
            vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
            r: 1.4 + Math.random() * 1.6
        };
    };

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        w = window.innerWidth; h = window.innerHeight;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const target = Math.min(90, Math.max(24, Math.round((w * h) / 17000)));
        while (particles.length < target) particles.push(spawn());
        particles.length = target;
    }

    function draw(move) {
        ctx.clearRect(0, 0, w, h);
        if (move) {
            for (const p of particles) {
                p.x += p.vx; p.y += p.vy;
                if (p.x < -20) p.x = w + 20; else if (p.x > w + 20) p.x = -20;
                if (p.y < -20) p.y = h + 20; else if (p.y > h + 20) p.y = -20;
            }
        }
        const MAX = 130, MAX2 = MAX * MAX;
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const a = particles[i], b = particles[j];
                const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
                if (d2 < MAX2) {
                    const alpha = (0.14 * (1 - Math.sqrt(d2) / MAX)).toFixed(3);
                    ctx.strokeStyle = "rgba(37,99,235," + alpha + ")";
                    ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
                }
            }
        }
        ctx.fillStyle = "rgba(37,99,235,0.5)";
        for (const p of particles) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
    }

    function loop() {
        requestAnimationFrame(loop);
        if (document.hidden || document.body.classList.contains("test-mode")) return;
        draw(true);
    }

    window.addEventListener("resize", resize);
    resize();
    if (reduced) draw(false); else loop();
}
