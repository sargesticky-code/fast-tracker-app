import fs from "node:fs";

const detail = fs.readFileSync("components/match-detail-client.js", "utf8");
const feed = fs.readFileSync("supabase/functions/app-phase1-feed/index.ts", "utf8");
const story = fs.readFileSync("supabase/functions/app-match-story/index.ts", "utf8");

const checks = [
  [detail.includes("&lang=en&style=professional"), "match detail must request the English story"],
  [feed.includes('.eq("language", "en")'), "Phase 1 feed must prefer English cached story summaries"],
  [story.includes("const deterministic = fallbackStory("), "story endpoint must build deterministic output on cache miss"],
  [story.includes('mode:"DETERMINISTIC_FALLBACK"'), "story endpoint must preserve deterministic fallback mode"],
  [story.includes('match_interpretations").upsert({') && story.includes('language,') && story.includes('style,'), "story cache write must persist the requested language/style"],
  [story.includes('.upsert({'), "story endpoint must write generated English stories to cache"],
  [story.includes('headline: language==="en" ? \`\${home} vs \${away}: evidence-based match analysis\`'), "English deterministic story must not reuse source-language headline"],
  [story.includes('watchNext: language==="en" ? englishCaveats'), "English deterministic story must use structured English caveats"],
  [story.includes('commentary.filter((row:any) => /^en(?:-|$)/i.test'), "English deterministic story must not copy non-English commentary text"],
  [story.includes('const englishOuLabel=(row:any)'), "English match script must derive O/U labels from structured selections"],
];

const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error("English story contract failed:");
  for (const message of failed) console.error("- " + message);
  process.exit(1);
}
console.log("English story cache/fallback contract passed");


// Public runtime is English-only even when callers omit lang.
assert.ok(storySource.includes('const language = "en";'), "story endpoint must force English public output");
assert.ok(!analysisSource.match(/[\u3400-\u9fff]/), "analysis public source must not contain CJK output literals");
assert.ok(!detailSource.match(/[\u3400-\u9fff]/), "detail public source must not contain CJK output literals");
