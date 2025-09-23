// src/components/charts/LineChart.tsx
import React from "react";
import { motion } from "framer-motion";

/**
 * Gráfico de linha animado (traçado desenhando + área aparecendo)
 * - svg como block para evitar espaço inline
 */
export default function LineChart() {
  const points =
    "0,160 60,140 120,180 180,120 240,150 300,90 360,170 420,130 480,190 540,110 600,150";

  const pathLength = 800;

  return (
    <svg viewBox="0 0 600 220" className="block w-full h-[220px]">
      <defs>
        <linearGradient id="grad-line" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(244,63,94)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="rgb(244,63,94)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* fundo sutil */}
      <rect x="0" y="0" width="600" height="220" fill="url(#grad-line)" opacity="0.06" />

      {/* área: fade + leve slide */}
      <motion.polygon
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        fill="url(#grad-line)"
        points={`${points} 600,220 0,220`}
      />

      {/* linha: “desenhando” com strokeDashoffset */}
      <motion.polyline
        fill="none"
        stroke="rgb(244 63 94)"
        strokeWidth="3"
        points={points}
        strokeLinejoin="round"
        strokeLinecap="round"
        initial={{ strokeDasharray: pathLength, strokeDashoffset: pathLength }}
        animate={{ strokeDashoffset: 0 }}
        transition={{ duration: 1.2, ease: "easeInOut" }}
      />

      {/* bolinhas nos vértices (aparição em cascata) */}
      {points.split(" ").map((p, i) => {
        const [x, y] = p.split(",").map(Number);
        return (
          <motion.circle
            key={i}
            cx={x}
            cy={y}
            r="3.5"
            fill="rgb(244 63 94)"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15 + i * 0.06, type: "spring", stiffness: 260, damping: 18 }}
          />
        );
      })}
    </svg>
  );
}
