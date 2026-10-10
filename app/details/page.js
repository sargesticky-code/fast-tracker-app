import LineupPanel from "@/components/lineup-panel";
import MatchDetailClient from "@/components/match-detail-client";
import { getFeed } from "@/lib/fast-tracker";

// Provide real Flashscore identity and HDA from SSR before the optional
// detail, live, model and lineup requests. No match-specific search parameter
// is used at build time, so the legacy static export stays compatible.
export default async function DetailsPage() {
  const feed = await getFeed();
  return (
    <>
      <MatchDetailClient initialFeed={feed} />
      <LineupPanel initialFeed={feed} />
    </>
  );
}
