import React from "react";
import { AbsoluteFill, OffthreadVideo, staticFile } from "remotion";
import { Variant } from "../lib";

/*
  Hand-made cut (uploads/2026-w44-16.mp4), played full frame and muted: the soundtrack is mixed in afterwards.
*/

export const SECONDS = 15.02;

export default ({ variant }: { variant: Variant }) => (
  <AbsoluteFill style={{ background: "#000" }}>
    <OffthreadVideo src={staticFile("uploads/2026-w44-16.mp4")} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
  </AbsoluteFill>
);
