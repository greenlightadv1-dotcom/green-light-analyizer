"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Route/panel transition (CLAUDE.md §2.2): fade + slight translate, never
 * abrupt. Wrap page bodies in this so navigation feels continuous.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.995 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
