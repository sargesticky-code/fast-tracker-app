import { Suspense } from "react";
import FlashscoreRawMatch from "@/components/flashscore-raw-match";

export default function DetailsPage() {
  return <Suspense fallback={<main className="ft-home"><p>Loading raw fixture…</p></main>}><FlashscoreRawMatch /></Suspense>;
}
