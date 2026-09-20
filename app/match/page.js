import MatchDetailClient from "@/components/match-detail-client";
import snapshot from "@/data/app_snapshot.json";
import { sanitizeFallbackMatch } from "@/lib/fast-tracker";

export default function MatchPage() {
  return <MatchDetailClient snapshotMatches={(snapshot.matches || []).map(sanitizeFallbackMatch)} />;
}
