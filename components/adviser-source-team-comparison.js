import { reviewAdviserSourceTeams } from "@/lib/adviser-source-team-review";

export default function SourceTeamComparison({candidate,flashscoreHome,flashscoreAway}){
  const result=reviewAdviserSourceTeams(candidate,flashscoreHome,flashscoreAway);
  return <div className="ft-source-team-compare"
    data-testid={"adviser-source-teams-"+candidate.provider.toLowerCase()}
    data-name-check={result.code}>
    <div className="ft-source-team-pair">
      <b>Flashscore</b>
      <span><em>Home</em> {flashscoreHome||"Unknown"} <em>Away</em> {flashscoreAway||"Unknown"}</span>
    </div>
    <div className="ft-source-team-pair">
      <b>{({PRIMATIPS:"PrimaTips",STATAREA:"Statarea",BETCLAN:"BetClan",SPORTYTRADER:"SportyTrader",FOREBET:"Forebet"})[candidate.provider]||candidate.provider}</b>
      <span><em>Home</em> {candidate.sourceHome||"Unknown"} <em>Away</em> {candidate.sourceAway||"Unknown"}</span>
    </div>
    {candidate.identityStatus==="VERIFIED" &&
      <small data-testid="verified-provider-fixture-identity">Verified provider fixture · team-name check is display-only</small>}
    <span className={"ft-source-name-result ft-source-name-"+result.code}
      data-testid="adviser-team-name-review">{result.label}</span>
  </div>;
}
