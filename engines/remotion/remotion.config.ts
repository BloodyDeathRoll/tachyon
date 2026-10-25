import { Config } from "@remotion/cli/config";
// Same output profile as engine A (spine/publisher/spec_check.py): H.264 yuv420p, high CRF quality; audio is muxed by spec_check.fix / publish.
Config.setVideoImageFormat("png");
Config.setPixelFormat("yuv420p");
Config.setCodec("h264");
Config.setCrf(18);
Config.setOverwriteOutput(true);
