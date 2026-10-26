// Other-format versions of the films (1:1, 4:5, 2:3, 16:9), written by spine/formats.py between
// the markers. Each file exports `default` (no props) and `SECONDS` (the reel's). Root registers
// "<film id>-<ratio>" at the format's size.
import type React from "react";
export type FormatFilm = { id: string; seconds: number; width: number; height: number; component: React.FC };
// @imports
import x, { SECONDS as x_s } from "./film-2026-w44-01-16x9";
import x13, { SECONDS as x13_s } from "./film-2026-w44-13-16x9";

export const FORMATS: FormatFilm[] = [
  // @formats
  { id: "film-2026-w44-01-16x9", seconds: x_s, width: 1920, height: 1080, component: x },
  { id: "film-2026-w44-13-16x9", seconds: x13_s, width: 1920, height: 1080, component: x13 },
];
