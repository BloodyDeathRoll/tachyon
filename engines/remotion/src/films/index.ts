// Planned films (spine/week.py appends between the markers). Each film file exports
// `default` ({ variant }) and `SECONDS`. Root registers "<id>" (reel) and "<id>-story".
import type React from "react";
import type { Variant } from "../lib";
export type Film = { id: string; seconds: number; component: React.FC<{ variant: Variant }> };
import film_2026_w44_01, { SECONDS as film_2026_w44_01_s } from "./film-2026-w44-01";
import film_2026_w44_02, { SECONDS as film_2026_w44_02_s } from "./film-2026-w44-02";
import film_2026_w44_03, { SECONDS as film_2026_w44_03_s } from "./film-2026-w44-03";
import film_2026_w44_04, { SECONDS as film_2026_w44_04_s } from "./film-2026-w44-04";
import film_2026_w44_05, { SECONDS as film_2026_w44_05_s } from "./film-2026-w44-05";
import film_2026_w44_06, { SECONDS as film_2026_w44_06_s } from "./film-2026-w44-06";
import film_2026_w44_07, { SECONDS as film_2026_w44_07_s } from "./film-2026-w44-07";
import film_2026_w44_08, { SECONDS as film_2026_w44_08_s } from "./film-2026-w44-08";
import film_2026_w44_09, { SECONDS as film_2026_w44_09_s } from "./film-2026-w44-09";
import film_2026_w44_10, { SECONDS as film_2026_w44_10_s } from "./film-2026-w44-10";
import film_2026_w44_11, { SECONDS as film_2026_w44_11_s } from "./film-2026-w44-11";
import film_2026_w44_12, { SECONDS as film_2026_w44_12_s } from "./film-2026-w44-12";
import film_2026_w44_13, { SECONDS as film_2026_w44_13_s } from "./film-2026-w44-13";
import film_2026_w44_14, { SECONDS as film_2026_w44_14_s } from "./film-2026-w44-14";
import film_2026_w44_16, { SECONDS as film_2026_w44_16_s } from "./film-2026-w44-16";
// @imports
export const FILMS: Film[] = [
  { id: "film-2026-w44-01", seconds: film_2026_w44_01_s, component: film_2026_w44_01 },
  { id: "film-2026-w44-02", seconds: film_2026_w44_02_s, component: film_2026_w44_02 },
  { id: "film-2026-w44-03", seconds: film_2026_w44_03_s, component: film_2026_w44_03 },
  { id: "film-2026-w44-04", seconds: film_2026_w44_04_s, component: film_2026_w44_04 },
  { id: "film-2026-w44-05", seconds: film_2026_w44_05_s, component: film_2026_w44_05 },
  { id: "film-2026-w44-06", seconds: film_2026_w44_06_s, component: film_2026_w44_06 },
  { id: "film-2026-w44-07", seconds: film_2026_w44_07_s, component: film_2026_w44_07 },
  { id: "film-2026-w44-08", seconds: film_2026_w44_08_s, component: film_2026_w44_08 },
  { id: "film-2026-w44-09", seconds: film_2026_w44_09_s, component: film_2026_w44_09 },
  { id: "film-2026-w44-10", seconds: film_2026_w44_10_s, component: film_2026_w44_10 },
  { id: "film-2026-w44-11", seconds: film_2026_w44_11_s, component: film_2026_w44_11 },
  { id: "film-2026-w44-12", seconds: film_2026_w44_12_s, component: film_2026_w44_12 },
  { id: "film-2026-w44-13", seconds: film_2026_w44_13_s, component: film_2026_w44_13 },
  { id: "film-2026-w44-14", seconds: film_2026_w44_14_s, component: film_2026_w44_14 },
  { id: "film-2026-w44-16", seconds: film_2026_w44_16_s, component: film_2026_w44_16 },
  // @films
];
