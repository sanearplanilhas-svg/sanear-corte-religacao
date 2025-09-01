import React from "react";
import { motion } from "framer-motion";

/**
 * Barras animadas (crescimento vertical + hover)
 */
export default function Bars() {
  const vals = [12, 24, 18, 30, 26, 34, 38];

  return (
    <div className="flex items-end gap-2 h-40 w-full">
      {vals.map((v, i) => (
        <motion.div
          key={i}
          className="flex-1 rounded-t-lg bg-rose-600/80"
          initial={{ height: 0, opacity: 0.5 }}
          animate={{ height: v * 3, opacity: 1 }}
          whileHover={{ scaleY: 1.06 }}
          transition={{ duration: 0.6, delay: i * 0.05, ease: "easeOut" }}
          style={{ transformOrigin: "bottom" }}
        />
      ))}
    </div>
  );
}
