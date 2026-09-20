import MatchDetailClient from "@/components/match-detail-client";
import snapshot from "@/data/app_snapshot.json";

export default function MatchPage() {
  return <MatchDetailClient snapshotMatches={snapshot.matches || []} />;
}
