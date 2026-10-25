import React from "react";
import { Composition } from "remotion";
import { Showreel } from "./Showreel";
import { Favorites } from "./Favorites";

// Engine B (decision 2). 1080×1920, 60 fps, two variants per film: reel (safe box y 285–1248,
// inside the 4:5 feed crop) and story (y 269–1248). Decision 14.
export const FPS = 60;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Showreel" component={Showreel} durationInFrames={30 * FPS} fps={FPS} width={1080} height={1920}
      defaultProps={{ variant: "reel" as const }} />
    <Composition id="ShowreelStory" component={Showreel} durationInFrames={30 * FPS} fps={FPS} width={1080} height={1920}
      defaultProps={{ variant: "story" as const }} />
    <Composition id="Favorites" component={Favorites} durationInFrames={15 * FPS} fps={FPS} width={1080} height={1920}
      defaultProps={{ variant: "reel" as const }} />
    <Composition id="FavoritesStory" component={Favorites} durationInFrames={15 * FPS} fps={FPS} width={1080} height={1920}
      defaultProps={{ variant: "story" as const }} />
  </>
);
