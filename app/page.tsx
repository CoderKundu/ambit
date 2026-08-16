import fs from "node:fs";
import path from "node:path";
import Ambit from "../components/Ambit";
import type { Track } from "../lib/moods";

/**
 * The dataset is read at build time and inlined into the static output. There is
 * no runtime fetch, no API and no database: the deployed site is files on a CDN.
 *
 * That is deliberate. The API this project originally depended on was withdrawn
 * mid-build; anything in the live request path can do the same. Baking the data
 * in means the demo cannot break while nobody is watching.
 */
export default function Page() {
  const file = path.join(process.cwd(), "public", "tracks.json");
  const tracks: Track[] = JSON.parse(fs.readFileSync(file, "utf8"));
  return <Ambit tracks={tracks} />;
}
