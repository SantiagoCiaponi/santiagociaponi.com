// Año dinámico
document.getElementById("year").textContent = "2003–" + new Date().getFullYear();

// 🌟 Starfield minimalista
const canvas = document.getElementById("stars");
const ctx = canvas.getContext("2d");
let W, H, stars = [];
const STAR_COUNT = 180;

// Actualizar contenido de la marquesina con mood Boca + Mouche
(function () {
  const mq = document.querySelector("marquee");
  if (mq) {
    mq.innerHTML =
      "BIENVENIDOS, XENEIZES 💙💛 MODO BOMBONERA ACTIVADO 💥 PABLO MOUCHE 7 TE SALUDA" +
      "&nbsp;&nbsp;|&nbsp;&nbsp; CLICK EN CUALQUIER LADO = FUEGO ARTIFICIAL" +
      "&nbsp;&nbsp;|&nbsp;&nbsp; VERSIÓN ESPECIAL AZUL Y ORO ANTIRIVER";
  }
})();

function resize() {
  W = canvas.width = innerWidth;
  H = canvas.height = innerHeight;
  stars = Array.from({ length: STAR_COUNT }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    r: Math.random() * 1.6 + 0.2,
    a: Math.random(), // alpha
    v: Math.random() * 0.02 + 0.005,
  }));
}

function drawStars() {
  ctx.clearRect(0, 0, W, H);
  for (const s of stars) {
    s.a += s.v * (Math.random() > 0.5 ? 1 : -1);
    s.a = Math.min(1, Math.max(0.1, s.a));
    ctx.beginPath();
    ctx.fillStyle = `rgba(255,255,255,${s.a})`;
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  requestAnimationFrame(drawStars);
}

addEventListener("resize", resize);
resize();
drawStars();

// ⚡ Modo Turbo: acelera animaciones
const turbo = document.getElementById("turbo");
turbo.addEventListener("change", (e) => {
  document.documentElement.style.setProperty("--speed", e.target.checked ? "10s" : "24s");
});

// 🎨 Paletas predefinidas (modo Boca)
const themes = [
  // Boca clásico
  { bg1: "#00133a", bg2: "#002a6b", bg3: "#041e5b", neon: "#ffd100", hot: "#0033a0", gold: "#ffd100", acid: "#ffef70", panel: "#00122acc" },
  // Boca noche
  { bg1: "#000b26", bg2: "#001c4a", bg3: "#0033a0", neon: "#ffda33", hot: "#00246b", gold: "#ffda33", acid: "#ffe680", panel: "#02122acc" },
  // Boca retro
  { bg1: "#001033", bg2: "#002860", bg3: "#003b86", neon: "#ffd54a", hot: "#0a2e7a", gold: "#ffd54a", acid: "#ffe27a", panel: "#041a3acc" },
];

document.getElementById("paleta").addEventListener("click", () => {
  const pick = themes[Math.floor(Math.random() * themes.length)];
  Object.entries(pick).forEach(([key, value]) => {
    document.documentElement.style.setProperty(`--${key}`, value);
  });
});

// 💫 Cursor cometa
let cometEnabled = true;
const cometaChk = document.getElementById("cometa");
cometaChk.addEventListener("change", (e) => (cometEnabled = e.target.checked));

addEventListener("mousemove", (e) => {
  if (!cometEnabled) return;
  const dot = document.createElement("div");
  dot.className = "trail";
  dot.style.left = e.clientX - 5 + "px";
  dot.style.top = e.clientY - 5 + "px";
  document.body.appendChild(dot);
  setTimeout(() => dot.remove(), 700);
});

// 🌧️ Lluvia de emojis
const emojiList = ["💙", "💛", "⚽", "🔥", "🏆", "🧤", "🎺", "🕶️", "🏟️", "🥇", "🎉"];
let rainInterval = null;

function spawnEmoji() {
  const em = document.createElement("div");
  em.className = "emoji";
  em.textContent = emojiList[(Math.random() * emojiList.length) | 0];
  em.style.left = Math.random() * 100 + "vw";
  em.style.setProperty("--fallDur", Math.random() * 5 + 6 + "s");
  document.body.appendChild(em);
  setTimeout(() => em.remove(), 12000);
}

document.getElementById("emojiRain").addEventListener("change", (e) => {
  if (e.target.checked) {
    spawnEmoji();
    rainInterval = setInterval(spawnEmoji, 350);
  } else {
    clearInterval(rainInterval);
    rainInterval = null;
  }
});

// 🎇 Fuegos artificiales (click/tap)
function firework(x, y) {
  const colors = ["#ff3bd4", "#00ffd1", "#fffb82", "#9dff00", "#7dd3fc", "#a78bfa", "#ff4d4d"];
  const base = document.createElement("div");
  base.className = "burst";
  base.style.left = x + "px";
  base.style.top = y + "px";
  base.style.color = colors[(Math.random() * colors.length) | 0];
  document.body.appendChild(base);

  const particles = 22;
  for (let i = 0; i < particles; i++) {
    const p = document.createElement("div");
    p.className = "particle";
    p.style.color = colors[(Math.random() * colors.length) | 0];
    base.appendChild(p);
    const angle = (Math.PI * 2 / particles) * i;
    const dist = 60 + Math.random() * 70;
    const px = Math.cos(angle) * dist, py = Math.sin(angle) * dist;
    p.animate(
      [
        { transform: "translate(0,0)", opacity: 1 },
        { transform: `translate(${px}px, ${py}px)`, opacity: 0 },
      ],
      { duration: 900 + Math.random() * 500, easing: "cubic-bezier(.2,.7,.2,1)", fill: "forwards" }
    );
  }
  setTimeout(() => base.remove(), 1400);
}

addEventListener("click", (e) => {
  if (e.target.closest(".btn,.switch,input,textarea")) return;
  firework(e.clientX, e.clientY);
});

document.getElementById("boom").addEventListener("click", () => {
  const x = innerWidth * 0.5 + (Math.random() * 200 - 100);
  const y = innerHeight * 0.35 + (Math.random() * 120 - 60);
  firework(x, y);
});
