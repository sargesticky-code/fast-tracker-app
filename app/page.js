import HomepageClient from "@/components/homepage-client";
import { getFeed } from "@/lib/fast-tracker";

export default async function Home() {
  const feed = await getFeed();
  return <HomepageClient initialFeed={feed} nowMs={Date.now()} />;
}
