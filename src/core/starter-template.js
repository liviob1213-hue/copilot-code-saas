// [gerado por sync-core.mjs] copia de ../../src/core — NAO edite aqui.
// Edite na extensao (src/core) e rode `npm run sync-core`.
// ============================================================================
//  STARTER "estiloso" — a base fixa de todo projeto de app/site multi-arquivo.
//  A IA escreve SO o app (App.jsx, paginas, componentes de feature, theme.css)
//  por cima deste kit. Assim a base nunca vem quebrada e o resultado sai com
//  acabamento profissional (Tailwind + componentes prontos), como no Lovable —
//  qualquer que seja a IA usada.
//
//  Stack: React 18 + Vite + Tailwind + lucide-react (icones). JSX (sem
//  TypeScript) e build "vite build" (sem tsc), para nenhum erro de tipo de um
//  modelo mais fraco derrubar o deploy na Vercel.
// ============================================================================

export const STARTER_FILES = {
  "package.json": `{
  "name": "app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "clsx": "^2.1.1",
    "lucide-react": "^0.454.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2",
    "tailwind-merge": "^2.5.4"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.2",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.14",
    "vite": "^5.4.9"
  }
}
`,

  "vite.config.js": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()]
});
`,

  "tailwind.config.js": `/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: "var(--card)",
        "card-foreground": "var(--card-foreground)",
        muted: "var(--muted)",
        "muted-foreground": "var(--muted-foreground)",
        border: "var(--border)",
        input: "var(--input)",
        primary: "var(--primary)",
        "primary-foreground": "var(--primary-foreground)",
        accent: "var(--accent)",
        ring: "var(--ring)"
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Archivo", "Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};
`,

  "postcss.config.js": `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
`,

  "index.html": `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800;900&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
    <title>App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`,

  // SPA: manda todas as rotas para o index.html, senao /agenda, /clientes etc.
  // dao 404 na Vercel ao abrir direto pela URL.
  "vercel.json": `{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
`,

  ".gitignore": `node_modules
dist
.env
.DS_Store
`,

  ".env.example": `VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
`,

  "src/main.jsx": `import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
`,

  "src/index.css": `@import "./theme.css";
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  * {
    border-color: var(--border);
  }
  body {
    background-color: var(--background);
    color: var(--foreground);
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
}

/* efeitos visuais do kit (componentes em src/components/fx) */
@keyframes fx-aurora {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(5%, -6%) scale(1.15); }
  66% { transform: translate(-5%, 4%) scale(0.9); }
}
@keyframes fx-shine {
  0% { background-position: 200% center; }
  100% { background-position: -200% center; }
}
@keyframes fx-grad {
  0%, 100% { background-position: 0% center; }
  50% { background-position: 100% center; }
}
@keyframes fx-marquee {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
.fx-shiny {
  background: linear-gradient(110deg, var(--fx-base, #9aa2ad) 40%, var(--fx-hi, #ffffff) 50%, var(--fx-base, #9aa2ad) 60%);
  background-size: 200% auto;
  -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: fx-shine 3.5s linear infinite;
}
.fx-gradient-text {
  background-size: 200% auto;
  -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: fx-grad 5s ease infinite;
}
.fx-spotlight::before {
  content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity 0.3s ease;
  background: radial-gradient(220px circle at var(--fx-x, 50%) var(--fx-y, 50%), var(--fx-glow, rgba(255,255,255,0.2)), transparent 70%);
}
.fx-spotlight:hover::before { opacity: 1; }
.fx-reveal { opacity: 0; transform: translateY(20px); transition: opacity 0.7s ease, transform 0.7s ease; }
.fx-reveal.fx-in { opacity: 1; transform: none; }
`,

  // Paleta PADRAO. A IA pode reescrever este arquivo para dar uma identidade
  // unica ao projeto (barbearia -> escuro + dourado; financas -> azul, etc.).
  "src/theme.css": `:root {
  --background: #f7f8fa;
  --foreground: #0f172a;
  --card: #ffffff;
  --card-foreground: #0f172a;
  --muted: #eef1f6;
  --muted-foreground: #64748b;
  --border: #e5e8ef;
  --input: #e5e8ef;
  --primary: #4f46e5;
  --primary-foreground: #ffffff;
  --accent: #eef2ff;
  --ring: #4f46e5;
  --radius: 0.85rem;
}
`,

  "src/lib/utils.js": `import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
`,

  "src/components/ui/button.jsx": `import { cn } from "../../lib/utils";

const variants = {
  default: "bg-primary text-primary-foreground shadow-sm hover:opacity-90",
  outline: "border border-border bg-card text-foreground hover:bg-muted",
  ghost: "text-foreground hover:bg-muted",
  destructive: "bg-red-600 text-white shadow-sm hover:bg-red-700",
  subtle: "bg-muted text-foreground hover:bg-border"
};

const sizes = {
  default: "h-10 px-4 py-2 text-sm",
  sm: "h-9 px-3 text-sm",
  lg: "h-11 px-6 text-base",
  icon: "h-10 w-10"
};

export function Button({ className, variant = "default", size = "default", ...props }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
        variants[variant] || variants.default,
        sizes[size] || sizes.default,
        className
      )}
      {...props}
    />
  );
}
`,

  "src/components/ui/card.jsx": `import { cn } from "../../lib/utils";

export function Card({ className, ...props }) {
  return <div className={cn("rounded-xl border border-border bg-card text-card-foreground shadow-sm", className)} {...props} />;
}
export function CardHeader({ className, ...props }) {
  return <div className={cn("flex flex-col gap-1.5 p-5", className)} {...props} />;
}
export function CardTitle({ className, ...props }) {
  return <h3 className={cn("text-lg font-bold leading-tight tracking-tight", className)} {...props} />;
}
export function CardDescription({ className, ...props }) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}
export function CardContent({ className, ...props }) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}
export function CardFooter({ className, ...props }) {
  return <div className={cn("flex items-center gap-2 p-5 pt-0", className)} {...props} />;
}
`,

  "src/components/ui/input.jsx": `import { cn } from "../../lib/utils";

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
`,

  "src/components/ui/textarea.jsx": `import { cn } from "../../lib/utils";

export function Textarea({ className, ...props }) {
  return (
    <textarea
      className={cn(
        "flex min-h-[100px] w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
`,

  "src/components/ui/label.jsx": `import { cn } from "../../lib/utils";

export function Label({ className, ...props }) {
  return <label className={cn("text-sm font-semibold text-foreground", className)} {...props} />;
}
`,

  "src/components/ui/badge.jsx": `import { cn } from "../../lib/utils";

const styles = {
  default: "bg-primary text-primary-foreground",
  outline: "border border-border text-foreground",
  muted: "bg-muted text-muted-foreground",
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-red-100 text-red-700"
};

export function Badge({ className, variant = "default", ...props }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        styles[variant] || styles.default,
        className
      )}
      {...props}
    />
  );
}
`,

  // ---- Efeitos visuais (fx) — autorais, sem dependencia. A IA usa nas paginas
  // para dar acabamento "premium" (fundos animados, texto brilhante, etc.). ----
  "src/components/fx/aurora-background.jsx": `export default function AuroraBackground({ className = "", children }) {
  return (
    <div className={"relative overflow-hidden " + className}>
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-1/4 -top-1/3 h-[60vh] w-[60vh] rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--primary), transparent 60%)", animation: "fx-aurora 14s ease-in-out infinite" }} />
        <div className="absolute right-0 top-1/4 h-[55vh] w-[55vh] rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--ring), transparent 60%)", animation: "fx-aurora 18s ease-in-out infinite reverse" }} />
        <div className="absolute bottom-0 left-1/3 h-[50vh] w-[50vh] rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--accent), transparent 60%)", animation: "fx-aurora 16s ease-in-out infinite" }} />
      </div>
      {children}
    </div>
  );
}
`,

  "src/components/fx/particles.jsx": `import { useEffect, useRef } from "react";

export default function Particles({ className = "", count = 46, color = "rgba(255,255,255,0.55)" }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf, w, h;
    const dots = [];
    const resize = () => { w = canvas.width = canvas.offsetWidth; h = canvas.height = canvas.offsetHeight; };
    resize();
    for (let i = 0; i < count; i++) {
      dots.push({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4 });
    }
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (const d of dots) {
        d.x += d.vx; d.y += d.vy;
        if (d.x < 0 || d.x > w) d.vx *= -1;
        if (d.y < 0 || d.y > h) d.vy *= -1;
        ctx.beginPath(); ctx.arc(d.x, d.y, 1.6, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
      }
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const a = dots[i], b = dots[j];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist < 108) {
            ctx.globalAlpha = 1 - dist / 108; ctx.strokeStyle = color; ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.globalAlpha = 1;
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [count, color]);
  return <canvas ref={ref} className={"absolute inset-0 h-full w-full " + className} />;
}
`,

  "src/components/fx/shiny-text.jsx": `export default function ShinyText({ children, className = "", base = "#9aa2ad", highlight = "#ffffff", speed = 3.5 }) {
  return (
    <span className={"fx-shiny " + className} style={{ "--fx-base": base, "--fx-hi": highlight, animationDuration: speed + "s" }}>
      {children}
    </span>
  );
}
`,

  "src/components/fx/gradient-text.jsx": `export default function GradientText({ children, className = "", from = "var(--primary)", to = "var(--ring)", speed = 5 }) {
  return (
    <span
      className={"fx-gradient-text " + className}
      style={{ backgroundImage: "linear-gradient(90deg, " + from + ", " + to + ", " + from + ")", animationDuration: speed + "s" }}
    >
      {children}
    </span>
  );
}
`,

  "src/components/fx/spotlight-card.jsx": `import { useRef } from "react";

export default function SpotlightCard({ children, className = "", glow = "rgba(130,130,255,0.22)" }) {
  const ref = useRef(null);
  const onMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--fx-x", (e.clientX - r.left) + "px");
    el.style.setProperty("--fx-y", (e.clientY - r.top) + "px");
  };
  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      className={"fx-spotlight relative overflow-hidden rounded-2xl border border-border bg-card " + className}
      style={{ "--fx-glow": glow }}
    >
      {children}
    </div>
  );
}
`,

  "src/components/fx/reveal.jsx": `import { useEffect, useRef } from "react";

export default function Reveal({ children, className = "", delay = 0 }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { el.classList.add("fx-in"); io.unobserve(el); } });
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={"fx-reveal " + className} style={{ transitionDelay: delay + "ms" }}>
      {children}
    </div>
  );
}
`,

  // ---- Blocos visuais "premium" (autorais) para tirar o ar de pagina amadora:
  // moldura de navegador, mockup de dashboard, avaliacao, nuvem de logos, glow. ----
  "src/components/fx/browser-frame.jsx": `export default function BrowserFrame({ children, className = "", label = "" }) {
  return (
    <div className={"overflow-hidden rounded-xl border border-border bg-card shadow-2xl " + className}>
      <div className="flex items-center gap-2 border-b border-border bg-muted px-3 py-2">
        <span className="h-3 w-3 rounded-full" style={{ background: "#ff5f57" }} />
        <span className="h-3 w-3 rounded-full" style={{ background: "#febc2e" }} />
        <span className="h-3 w-3 rounded-full" style={{ background: "#28c840" }} />
        {label ? <span className="ml-2 truncate text-xs text-muted-foreground">{label}</span> : null}
      </div>
      <div className="bg-background">{children}</div>
    </div>
  );
}
`,

  "src/components/fx/glow-spot.jsx": `export default function GlowSpot({ className = "", color = "var(--primary)", size = 520 }) {
  return (
    <div
      className={"pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl " + className}
      style={{ width: size, height: size, background: "radial-gradient(circle, " + color + ", transparent 65%)", opacity: 0.35 }}
    />
  );
}
`,

  "src/components/fx/star-rating.jsx": `import { Star } from "lucide-react";

export default function StarRating({ value = 5, label = "", className = "" }) {
  return (
    <div className={"flex items-center gap-2 " + className}>
      <div className="flex">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} size={16} className={i < value ? "fill-current text-amber-400" : "text-muted-foreground"} />
        ))}
      </div>
      {label ? <span className="text-sm text-muted-foreground">{label}</span> : null}
    </div>
  );
}
`,

  "src/components/fx/logo-marquee.jsx": `export default function LogoMarquee({ items = ["ACME", "NOVA", "PULSE", "ORBIT", "VERTEX", "LUMEN"], className = "" }) {
  const row = items.concat(items);
  return (
    <div className={"relative overflow-hidden " + className}>
      <div className="flex w-max gap-12 pr-12" style={{ animation: "fx-marquee 22s linear infinite" }}>
        {row.map((it, i) => (
          <span key={i} className="text-lg font-semibold tracking-wide text-muted-foreground">{it}</span>
        ))}
      </div>
    </div>
  );
}
`,

  "src/components/fx/dashboard-mock.jsx": `export default function DashboardMock({ className = "" }) {
  const bars = [42, 68, 55, 80, 61, 92, 74];
  const kpis = [["Receita", "R$ 48,2k", "+12%"], ["Clientes", "1.284", "+8%"], ["Conversao", "6,4%", "+2,1%"]];
  return (
    <div className={"grid gap-3 p-4 sm:grid-cols-3 " + className}>
      {kpis.map((k, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">{k[0]}</p>
          <p className="mt-1 text-lg font-bold text-foreground">{k[1]}</p>
          <p className="text-xs text-emerald-500">{k[2]}</p>
        </div>
      ))}
      <div className="rounded-lg border border-border bg-card p-3 sm:col-span-2">
        <p className="mb-2 text-xs text-muted-foreground">Vendas por dia</p>
        <div className="flex h-24 items-end gap-2">
          {bars.map((h, i) => (
            <div key={i} className="flex-1 rounded-t" style={{ height: h + "%", background: "var(--primary)", opacity: 0.85 }} />
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="mb-2 text-xs text-muted-foreground">Meta</p>
        <div className="mx-auto mt-1 grid h-20 w-20 place-items-center rounded-full" style={{ background: "conic-gradient(var(--primary) 72%, var(--muted) 0)" }}>
          <div className="grid h-14 w-14 place-items-center rounded-full bg-card text-sm font-bold text-foreground">72%</div>
        </div>
      </div>
    </div>
  );
}
`,

  // ---- Blocos de loja / marca forte (estilo landing "bold": barra de promo,
  // contador animado, card de produto). ----
  "src/components/fx/announcement-bar.jsx": `export default function AnnouncementBar({ items = ["ENCOMENDA RAPIDA PARA TODO O BRASIL", "PARCELE NO CARTAO", "MONTAGEM PROPRIA"], className = "" }) {
  const row = items.concat(items);
  return (
    <div className={"w-full overflow-hidden bg-primary text-primary-foreground " + className}>
      <div className="flex w-max items-center py-2 text-xs font-semibold uppercase tracking-wider" style={{ animation: "fx-marquee 28s linear infinite" }}>
        {row.map((it, i) => (
          <span key={i} className="flex items-center">
            <span className="px-6">{it}</span>
            <span className="opacity-40">&bull;</span>
          </span>
        ))}
      </div>
    </div>
  );
}
`,

  "src/components/fx/stat-counter.jsx": `import { useEffect, useRef, useState } from "react";

export default function StatCounter({ to = 100, prefix = "", suffix = "", duration = 1600, className = "" }) {
  const [n, setN] = useState(0);
  const ref = useRef(null);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting && !done.current) {
          done.current = true;
          const start = performance.now();
          const step = (now) => {
            const p = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            setN(Math.round(eased * to));
            if (p < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      });
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [to, duration]);
  return <span ref={ref} className={className}>{prefix}{n}{suffix}</span>;
}
`,

  "src/components/fx/product-card.jsx": `export default function ProductCard({ title = "", subtitle = "", specs = [], price = "", oldPrice = "", installment = "", badge = "", cta = "Ver detalhes", onClick, media = null, className = "" }) {
  return (
    <div className={"group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition hover:border-primary " + className}>
      <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-muted">
        {media}
        {badge ? <span className="absolute left-3 top-3 rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">{badge}</span> : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        {subtitle ? <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{subtitle}</p> : null}
        <h3 className="text-base font-bold leading-tight text-foreground">{title}</h3>
        {specs.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {specs.map((s, i) => (
              <li key={i} className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">{s}</li>
            ))}
          </ul>
        ) : null}
        <div className="mt-auto pt-2">
          {oldPrice ? <p className="text-xs text-muted-foreground line-through">{oldPrice}</p> : null}
          <p className="text-lg font-extrabold text-foreground">{price}</p>
          {installment ? <p className="text-xs text-muted-foreground">{installment}</p> : null}
        </div>
        <button onClick={onClick} className="mt-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90">{cta}</button>
      </div>
    </div>
  );
}
`
};

// Arquivos do kit que a IA NAO pode sobrescrever (a base tem que ficar intacta).
// theme.css e App.jsx ficam de fora: a IA personaliza a paleta e escreve as rotas.
const PROTEGIDOS = [
  "package.json",
  "vite.config.js",
  "tailwind.config.js",
  "postcss.config.js",
  "vercel.json",
  "index.html",
  "src/main.jsx",
  "src/index.css",
  "src/lib/utils.js",
  "src/components/ui/button.jsx",
  "src/components/ui/card.jsx",
  "src/components/ui/input.jsx",
  "src/components/ui/textarea.jsx",
  "src/components/ui/label.jsx",
  "src/components/ui/badge.jsx",
  "src/components/fx/aurora-background.jsx",
  "src/components/fx/particles.jsx",
  "src/components/fx/shiny-text.jsx",
  "src/components/fx/gradient-text.jsx",
  "src/components/fx/spotlight-card.jsx",
  "src/components/fx/reveal.jsx",
  "src/components/fx/browser-frame.jsx",
  "src/components/fx/glow-spot.jsx",
  "src/components/fx/star-rating.jsx",
  "src/components/fx/logo-marquee.jsx",
  "src/components/fx/dashboard-mock.jsx",
  "src/components/fx/announcement-bar.jsx",
  "src/components/fx/stat-counter.jsx",
  "src/components/fx/product-card.jsx"
];

/**
 * Junta o kit fixo com os arquivos que a IA gerou:
 * - a IA pode adicionar/sobrescrever App.jsx, paginas, componentes e theme.css;
 * - os arquivos de base (config + componentes ui) vem SEMPRE do kit.
 */
export function mergeStarter(aiFiles) {
  const merged = { ...STARTER_FILES, ...(aiFiles || {}) };
  for (const p of PROTEGIDOS) merged[p] = STARTER_FILES[p];
  return merged;
}
