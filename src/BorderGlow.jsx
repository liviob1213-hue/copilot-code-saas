// BorderGlow — porte para React do componente BorderGlow (Vue Bits).
// Brilho que acompanha o cursor quando ele chega perto das BORDAS do card.
// GSAP suaviza a proximidade e faz a varredura de entrada (prop `animated`).
// IMPORTANTE: as camadas do brilho sao atualizadas DIRETO no DOM (refs), nunca
// via setState — assim o conteudo (chat inteiro) nao re-renderiza a cada frame.
import { useEffect, useRef } from "react";
import gsap from "gsap";

function parseHSL(s) {
  const m = String(s).match(/([\d.]+)\s*([\d.]+)%?\s*([\d.]+)%?/);
  if (!m) return { h: 40, s: 80, l: 80 };
  return { h: parseFloat(m[1]), s: parseFloat(m[2]), l: parseFloat(m[3]) };
}
function buildBoxShadow(glowColor, intensity) {
  const { h, s, l } = parseHSL(glowColor);
  const base = `${h}deg ${s}% ${l}%`;
  const layers = [
    [0, 0, 0, 1, 100, true], [0, 0, 1, 0, 60, true], [0, 0, 3, 0, 50, true],
    [0, 0, 6, 0, 40, true], [0, 0, 15, 0, 30, true], [0, 0, 25, 2, 20, true], [0, 0, 50, 2, 10, true],
    [0, 0, 1, 0, 60, false], [0, 0, 3, 0, 50, false], [0, 0, 6, 0, 40, false],
    [0, 0, 15, 0, 30, false], [0, 0, 25, 2, 20, false], [0, 0, 50, 2, 10, false]
  ];
  return layers.map(([x, y, blur, spread, alpha, inset]) => {
    const a = Math.min(alpha * intensity, 100);
    return `${inset ? "inset " : ""}${x}px ${y}px ${blur}px ${spread}px hsl(${base} / ${a}%)`;
  }).join(", ");
}
const GRADIENT_POSITIONS = ["80% 55%", "69% 34%", "8% 6%", "41% 38%", "86% 85%", "82% 18%", "51% 4%"];
const COLOR_MAP = [0, 1, 2, 0, 1, 2, 1];
function buildMeshGradients(colors) {
  const g = [];
  for (let i = 0; i < 7; i++) {
    const c = colors[Math.min(COLOR_MAP[i], colors.length - 1)];
    g.push(`radial-gradient(at ${GRADIENT_POSITIONS[i]}, ${c} 0px, transparent 50%)`);
  }
  g.push(`linear-gradient(${colors[0]} 0 100%)`);
  return g;
}
const FILL_MASK_STATIC = [
  "linear-gradient(to bottom, black, black)",
  "radial-gradient(ellipse at 50% 50%, black 40%, transparent 65%)",
  "radial-gradient(ellipse at 66% 66%, black 5%, transparent 40%)",
  "radial-gradient(ellipse at 33% 33%, black 5%, transparent 40%)",
  "radial-gradient(ellipse at 66% 33%, black 5%, transparent 40%)",
  "radial-gradient(ellipse at 33% 66%, black 5%, transparent 40%)"
];

export default function BorderGlow({
  children,
  className = "",
  edgeSensitivity = 30,
  glowColor = "347 90 55",
  backgroundColor = "transparent",
  borderRadius = 18,
  glowRadius = 36,
  glowIntensity = 1.0,
  coneSpread = 25,
  animated = false,
  colors = ["#e11d48", "#fb7185", "#f97316"],
  fillOpacity = 0.5
}) {
  const cardRef = useRef(null);
  const borderRef = useRef(null);
  const fillRef = useRef(null);
  const glowRef = useRef(null);
  const vals = useRef({ angle: 45, edge: 0 });
  const hoveredRef = useRef(false);
  const sweepRef = useRef(false);
  const colorSens = edgeSensitivity + 20;

  const center = (el) => { const r = el.getBoundingClientRect(); return [r.width / 2, r.height / 2]; };

  // escreve as camadas direto no DOM (sem re-render)
  const apply = () => {
    const border = borderRef.current, fill = fillRef.current, glow = glowRef.current;
    if (!border || !fill || !glow) return;
    const visible = hoveredRef.current || sweepRef.current;
    const edge = vals.current.edge;
    const bOp = visible ? Math.max(0, (edge * 100 - colorSens) / (100 - colorSens)) : 0;
    const gOp = visible ? Math.max(0, (edge * 100 - edgeSensitivity) / (100 - edgeSensitivity)) : 0;
    const a = `${vals.current.angle.toFixed(3)}deg`;
    const trans = visible ? "opacity 0.25s ease-out" : "opacity 0.75s ease-in-out";

    const borderMask = `conic-gradient(from ${a} at center, black ${coneSpread}%, transparent ${coneSpread + 15}%, transparent ${100 - coneSpread - 15}%, black ${100 - coneSpread}%)`;
    border.style.opacity = bOp;
    border.style.transition = trans;
    border.style.maskImage = borderMask;
    border.style.webkitMaskImage = borderMask;

    const fillMask = [...FILL_MASK_STATIC, `conic-gradient(from ${a} at center, transparent 5%, black 15%, black 85%, transparent 95%)`].join(", ");
    fill.style.opacity = bOp * fillOpacity;
    fill.style.transition = trans;
    fill.style.maskImage = fillMask;
    fill.style.webkitMaskImage = fillMask;

    const glowMask = `conic-gradient(from ${a} at center, black 2.5%, transparent 10%, transparent 90%, black 97.5%)`;
    glow.style.opacity = gOp;
    glow.style.transition = trans;
    glow.style.maskImage = glowMask;
    glow.style.webkitMaskImage = glowMask;
  };

  const onMove = (e) => {
    const el = cardRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const [cx, cy] = center(el);
    const dx = x - cx, dy = y - cy;
    let deg = (dx === 0 && dy === 0) ? 0 : Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (deg < 0) deg += 360;
    vals.current.angle = deg;
    let kx = Infinity, ky = Infinity;
    if (dx !== 0) kx = cx / Math.abs(dx);
    if (dy !== 0) ky = cy / Math.abs(dy);
    const edgeTarget = Math.min(Math.max(1 / Math.min(kx, ky), 0), 1);
    gsap.to(vals.current, { edge: edgeTarget, duration: 0.3, ease: "power2.out", overwrite: "auto", onUpdate: apply });
    apply();
  };
  const onEnter = () => { hoveredRef.current = true; apply(); };
  const onLeave = () => { hoveredRef.current = false; apply(); };

  useEffect(() => {
    apply();
    if (!animated) return;
    sweepRef.current = true;
    vals.current.angle = 110;
    const tl = gsap.timeline({ onUpdate: apply, onComplete: () => { sweepRef.current = false; apply(); } });
    tl.to(vals.current, { edge: 1, duration: 0.5, ease: "power2.out" }, 0)
      .to(vals.current, { angle: 465, duration: 3.75, ease: "power1.inOut" }, 0)
      .to(vals.current, { edge: 0, duration: 1.5, ease: "power2.in" }, 2.5);
    return () => tl.kill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animated]);

  const mesh = buildMeshGradients(colors);
  const borderBg = ["linear-gradient(" + backgroundColor + " 0 100%) padding-box", "linear-gradient(rgb(255 255 255 / 0%) 0% 100%) border-box", ...mesh.map(g => g + " border-box")].join(", ");
  const fillBg = mesh.map(g => g + " padding-box").join(", ");

  return (
    <div
      ref={cardRef}
      onPointerMove={onMove}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      className={className}
      style={{
        position: "relative", isolation: "isolate", borderRadius,
        transform: "translate3d(0,0,0.01px)",
        ...(backgroundColor && backgroundColor !== "transparent" ? { background: backgroundColor } : {})
      }}
    >
      <div ref={borderRef} style={{
        position: "absolute", inset: 0, borderRadius: "inherit", zIndex: -1, border: "1px solid transparent",
        background: borderBg, opacity: 0, pointerEvents: "none"
      }} />
      <div ref={fillRef} style={{
        position: "absolute", inset: 0, borderRadius: "inherit", zIndex: -1, border: "1px solid transparent",
        background: fillBg, opacity: 0, pointerEvents: "none",
        maskComposite: "subtract, add, add, add, add, add",
        WebkitMaskComposite: "source-out, source-over, source-over, source-over, source-over, source-over",
        mixBlendMode: "soft-light"
      }} />
      <span ref={glowRef} style={{
        position: "absolute", inset: -glowRadius, borderRadius: "inherit", zIndex: 1, pointerEvents: "none",
        opacity: 0, mixBlendMode: "plus-lighter"
      }}>
        <span style={{ position: "absolute", inset: glowRadius, borderRadius: "inherit", boxShadow: buildBoxShadow(glowColor, glowIntensity) }} />
      </span>
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
        {children}
      </div>
    </div>
  );
}
