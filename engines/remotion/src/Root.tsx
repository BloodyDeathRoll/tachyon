import React from "react";
import { Composition } from "remotion";
import { Showreel, SHOWREEL_SECONDS } from "./Showreel";
import { Favorites, FAVORITES_SECONDS } from "./Favorites";
import { FILMS } from "./films";
import { FORMATS } from "./films/formats";
import { FILM_DEFAULTS, FilmProps, HiggsFilm, filmSeconds } from "./higgs/HiggsFilm";

// Engine B (decision 2). 1080×1920, 60 fps, two variants per film: reel (safe box y 285–1248,
// inside the 4:5 feed crop) and story (y 269–1248). Decision 14.
export const FPS = 60;

// higgs-hook: one composition per format, everything else from --props (spine/higgs.py)
const higgsLength = ({ props }: { props: FilmProps }) => ({ durationInFrames: Math.round(filmSeconds(props) * FPS) });

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Showreel" component={Showreel} durationInFrames={SHOWREEL_SECONDS * FPS} fps={FPS} width={1080} height={1920}
      defaultProps={{ variant: "reel" as const }} />
    <Composition id="ShowreelStory" component={Showreel} durationInFrames={SHOWREEL_SECONDS * FPS} fps={FPS} width={1080} height={1920}
      defaultProps={{ variant: "story" as const }} />
    <Composition id="Favorites" component={Favorites} durationInFrames={FAVORITES_SECONDS * FPS} fps={FPS} width={1080} height={1920}
      defaultProps={{ variant: "reel" as const }} />
    <Composition id="FavoritesStory" component={Favorites} durationInFrames={FAVORITES_SECONDS * FPS} fps={FPS} width={1080} height={1920}
      defaultProps={{ variant: "story" as const }} />
    {FILMS.map((f) => (
      <React.Fragment key={f.id}>
        <Composition id={f.id} component={f.component} durationInFrames={Math.round(f.seconds * FPS)} fps={FPS} width={1080} height={1920}
          defaultProps={{ variant: "reel" as const }} />
        <Composition id={`${f.id}-story`} component={f.component} durationInFrames={Math.round(f.seconds * FPS)} fps={FPS} width={1080} height={1920}
          defaultProps={{ variant: "story" as const }} />
      </React.Fragment>
    ))}
    <Composition id="HiggsFilm" component={HiggsFilm} durationInFrames={Math.round(filmSeconds(FILM_DEFAULTS) * FPS)} fps={FPS} width={1080} height={1920}
      defaultProps={FILM_DEFAULTS} calculateMetadata={higgsLength} />
    <Composition id="HiggsFilm-story" component={HiggsFilm} durationInFrames={Math.round(filmSeconds(FILM_DEFAULTS) * FPS)} fps={FPS} width={1080} height={1920}
      defaultProps={{ ...FILM_DEFAULTS, variant: "story" as const }} calculateMetadata={higgsLength} />
    <Composition id="HiggsFilm-16x9" component={HiggsFilm} durationInFrames={Math.round(filmSeconds(FILM_DEFAULTS) * FPS)} fps={FPS} width={1920} height={1080}
      defaultProps={{ ...FILM_DEFAULTS, lock: 1.8 }} calculateMetadata={higgsLength} />
    {FORMATS.map((f) => (
      <Composition key={f.id} id={f.id} component={f.component} durationInFrames={Math.round(f.seconds * FPS)} fps={FPS}
        width={f.width} height={f.height} />
    ))}
  </>
);
