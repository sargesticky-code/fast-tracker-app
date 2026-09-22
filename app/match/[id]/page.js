import snapshot from "@/data/app_snapshot.json";
import LegacyMatchIdRedirect from "@/components/legacy-match-id-redirect";

export function generateStaticParams() {
  return (snapshot.matches || []).map((match) => ({ id: String(match.id) }));
}

export default async function LegacyMatchIdPage({ params }) {
  const { id } = await params;
  return <LegacyMatchIdRedirect id={id} />;
}
