import DashboardClient from "@/components/dashboard-client";
import { getFeed } from "@/lib/fast-tracker";

export const metadata = {
  title: "Fast Tracker 2026 · Internal System",
};

export default async function InternalSystemPage() {
  const feed = await getFeed();
  return <DashboardClient feed={feed} nowMs={Date.now()} />;
}
