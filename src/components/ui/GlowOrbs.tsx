"use client";

import { motion } from "framer-motion";

/**
 * Liquid Glow Orbs (CLAUDE.md §2.2)
 *
 * Large, soft, blurred radial-gradient blobs in brand green and navy, sitting
 * behind every glass panel and drifting slowly to give the ambient depth the
 * Liquid Glass language depends on. Purely decorative -> aria-hidden.
 */
type Orb = {
  className: string;
  color: string;
  drift: { x: number[]; y: number[] };
  duration: number;
};

const ORBS: Orb[] = [
  {
    className: "h-[520px] w-[520px] -top-40 -left-32",
    color: "rgba(98, 232, 35, 0.22)",
    drift: { x: [0, 60, -20, 0], y: [0, 40, 80, 0] },
    duration: 26,
  },
  {
    className: "h-[620px] w-[620px] top-1/3 -right-52",
    color: "rgba(41, 62, 97, 0.75)",
    drift: { x: [0, -70, 20, 0], y: [0, 50, -40, 0] },
    duration: 32,
  },
  {
    className: "h-[440px] w-[440px] -bottom-40 left-1/4",
    color: "rgba(98, 232, 35, 0.12)",
    drift: { x: [0, 40, -50, 0], y: [0, -30, 20, 0] },
    duration: 38,
  },
];

export function GlowOrbs() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {ORBS.map((orb, i) => (
        <motion.div
          key={i}
          className={`absolute rounded-full blur-3xl ${orb.className}`}
          style={{
            background: `radial-gradient(circle at 50% 50%, ${orb.color} 0%, transparent 70%)`,
          }}
          animate={{ x: orb.drift.x, y: orb.drift.y }}
          transition={{
            duration: orb.duration,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
