// Other-format versions of the films (1:1, 4:5, 2:3, 16:9), written by spine/formats.py between
// the markers. Each file exports `default` (no props) and `SECONDS` (the reel's). Root registers
// "<film id>-<ratio>" at the format's size.
import type React from "react";
export type FormatFilm = { id: string; seconds: number; width: number; height: number; component: React.FC };
// @imports

export const FORMATS: FormatFilm[] = [
  // @formats
];
