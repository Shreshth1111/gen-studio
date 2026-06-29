"use client";
import { useEffect, useState } from "react";

/** Central motion guardrails.
 *  - `reduced`: user asked for reduced motion → freeze heavy animation.
 *  - `active`:  tab is visible → pause loops when backgrounded (saves CPU).
 *  `animate` is the convenience flag: animate only when allowed AND visible. */
export function useMotionPrefs() {
  const [reduced, setReduced] = useState(false);
  const [active, setActive] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updReduced = () => setReduced(mq.matches);
    updReduced();
    mq.addEventListener("change", updReduced);

    const updVisible = () => setActive(!document.hidden);
    document.addEventListener("visibilitychange", updVisible);

    return () => {
      mq.removeEventListener("change", updReduced);
      document.removeEventListener("visibilitychange", updVisible);
    };
  }, []);

  return { reduced, active, animate: !reduced && active };
}
