import fs from "node:fs";
const homepage = fs.readFileSync("components/homepage-client.js", "utf8");
const styles = fs.readFileSync("app/homepage.css", "utf8");
const expectations = [
  [homepage.includes("adviser-extra-provisional-feed") && homepage.includes("adviser-provisional-feed"), "both bounded public adviser feeds"],
  [homepage.includes('row?.status === "PROVISIONAL_NOT_VERIFIED"'), "provisional is never verified"],
  [homepage.includes("sourceHome") && homepage.includes("canonicalHome"), "source and canonical home/away displayed"],
  [homepage.includes("match?.externalAdvisers"), "retains verified adviser layer"],
  [homepage.includes("Promise.allSettled(ADVISER_FEEDS.map(loadProvisionalAdvisers))"), "independent failure isolation"],
  [homepage.includes("setInterval(refreshAdvisers, 300000)"), "five minute polling limit"],
  [homepage.includes('health: "unavailable"'), "failed feeds are unavailable, not empty"],
  [styles.includes(".ft-adviser-line"), "adviser row provenance styles"],
];
for(const [valid, reason] of expectations) if(!valid) throw new Error("Adviser UI contract failed: "+reason);
process.stdout.write("Phase 1 adviser UI contract passed\\n");
