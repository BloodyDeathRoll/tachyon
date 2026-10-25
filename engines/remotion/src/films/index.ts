// Planned films (spine/week.py appends between the markers). Each film file exports
// `default` ({ variant }) and `SECONDS`. Root registers "<id>" (reel) and "<id>-story".
import type React from "react";
import type { Variant } from "../lib";
export type Film = { id: string; seconds: number; component: React.FC<{ variant: Variant }> };
// @imports
export const FILMS: Film[] = [
  // @films
];
