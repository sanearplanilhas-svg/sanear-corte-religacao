// src/components/charts/Donut.tsx
import React from "react";
import { motion, useSpring, useTransform } from "framer-motion";

/**
 * Donut animado (sweep do arco + contagem do número)
 * - svg como block para evitar espaço inline
 */
export default function Donut() {
  const r = 70;
  const circumference = 2 * Math.PI * r;

  const progress = useSpring(0, { stiffness: 90, damping: 20 });
  React.useEffect(() => {
    progress.set(0.72);
  }, [progress]);

  const dashOffset = useTransform(progress, (p) => circumference * (1 - p));
  const count = useTransform(progress, (p) => Math.round(2600 * p));

  return (
    <svg viewBox="0 0 200 200" className="block w-full h-[220px]">
      <circle cx="100" cy="100" r={r} stroke="rgb(15 23 42)" strokeWidth="24" fill="none" />
      <motion.circle
        cx="100"
        cy="100"
        r={r}
        stroke="rgb(244 63 94)"
        strokeWidth="24"
        fill="none"
        strokeDasharray={circumference}
        style={{ strokeDashoffset: dashOffset }}
        strokeLinecap="round"
        transform="rotate(-90 100 100)"
      />
      <motion.text x="100" y="108" textAnchor="middle" className="fill-white text-lg font-semibold">
        {count}
      </motion.text>
    </svg>
  );
}
