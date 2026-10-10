import fs from "node:fs";

const detail = fs.readFileSync("components/match-detail-client.js", "utf8");
const feed = fs.readFileSync("supabase/functions/app-phase1-feed/index.ts", "utf8");
const liveFeed = fs.readFileSync("supabase/functions/app-live-feed/index.ts", "utf8");
const story = fs.readFileSync("supabase/functions/app-match-story/index.ts", "utf8");
const analysis = fs.readFileSync("supabase/functions/app-match-analysis/index.ts", "utf8");
const deepDetail = fs.readFileSync("supabase/functions/app-match-detail/index.ts", "utf8");

const checks = [
  [detail.includes("&lang=en&style=professional"), "match detail must request the English story"],
  [feed.includes('.eq("language", "en")'), "Phase 1 feed must prefer English cached story summaries"],
  [story.includes("const deterministic = fallbackStory("), "story endpoint must build deterministic output on cache miss"],
  [story.includes('mode:"DETERMINISTIC_FALLBACK"'), "story endpoint must preserve deterministic fallback mode"],
  [story.includes('ft_upsert_match_interpretation_generic') && story.includes('language,') && story.includes('style,'), "story cache write must persist the requested language/style"],
  [story.includes('db.rpc("ft_upsert_match_interpretation_generic"'), "story endpoint must write generated English stories to cache"],
  [story.includes('headline: language==="en" ? \`\${home} vs \${away}: evidence-based match analysis\`'), "English deterministic story must not reuse source-language headline"],
  [story.includes('watchNext: language==="en" ? englishCaveats'), "English deterministic story must use structured English caveats"],
  [story.includes('commentary.filter((row:any) => /^en(?:-|$)/i.test'), "English deterministic story must not copy non-English commentary text"],
  [story.includes('const englishOuLabel=(row:any)'), "English match script must derive O/U labels from structured selections"],
  [story.includes('const language = "en";'), "story endpoint must force English public output"],
  [analysis.includes("englishPublicPayload"), "analysis endpoint must normalize public output to English"],
  [deepDetail.includes("Head-to-head data read failed"), "detail endpoint public H2H labels must be English"],
  [deepDetail.includes("englishDetailPayload"), "detail endpoint must sanitize public payload to English"],
  [feed.includes("leagueZh: r.tournament ?? null") && feed.includes("homeZh: r.home_en ?? null") && feed.includes("awayZh: r.away_en ?? null"), "summary feed compatibility fields must mirror English public identity"],
  [feed.includes("leagueZh: displayAuthority?.tournament ?? r.tournament ?? null") && feed.includes("homeZh: r.home_en") && feed.includes("awayZh: r.away_en"), "full feed compatibility fields must mirror English public identity"],
  [liveFeed.includes("homeZh: r.home_en") && liveFeed.includes("awayZh: r.away_en"), "live feed compatibility identity fields must remain English-only"],
];

const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error("English story contract failed:");
  for (const message of failed) console.error("- " + message);
  process.exit(1);
}
console.log("English story cache/fallback contract passed");
