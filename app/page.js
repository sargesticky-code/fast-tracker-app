import DashboardClient from "@/components/dashboard-client";
import { getFeed } from "@/lib/fast-tracker";

export default async function Home() {
  const feed = await getFeed();
  return <DashboardClient feed={feed} nowMs={Date.now()} />;
}
