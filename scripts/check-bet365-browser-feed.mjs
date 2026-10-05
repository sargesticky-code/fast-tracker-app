import { bet365BrowserLive, bet365DecimalOdds, resolveBet365Fixture, completeHdaBoard } from "../lib/bet365-browser-feed.js";

const sample=[{
  id:"12345",fixtureId:"92809252",sportId:"1",event:"Liverpool v Manchester City",league:"England Premier League",
  time:"62:14",score:"1-1",period:"SecondHalf",
  markets:[{id:"1777",name:"Fulltime Result",su:"0",odds:[
    {id:"1",na:"Liverpool",od:"2/1",or:"0",su:"0"},
    {id:"2",na:"Draw",od:"11/5",or:"1",su:"0"},
    {id:"3",na:"Manchester City",od:"13/10",or:"2",su:"0"}
  ]},{id:"1780",name:"Total Corners",su:"0",odds:[
    {id:"4",na:"Over ",ha:"8",od:"6/4",or:"0",su:"0"},
    {id:"5",na:"Exactly ",ha:"8",od:"15/4",or:"1",su:"0"},
    {id:"6",na:"Under ",ha:"8",od:"11/10",or:"2",su:"0"}
  ]}]
}];

const out=bet365BrowserLive(sample,"2026-10-05T10:00:00Z");
if(out.fixtures.length!==1)throw new Error("fixture parse failed");
const x=out.fixtures[0];
if(x.home!=="Liverpool"||x.away!=="Manchester City"||x.minute!==62||x.homeScore!==1)throw new Error("live parse failed");
if(bet365DecimalOdds("2/1")!==3||bet365DecimalOdds("11/5")!==3.2||bet365DecimalOdds("F^D")!==null)throw new Error("odds decoding fail-closed failed");
const hda=completeHdaBoard(out.quotes);
if(!hda||hda.H.decimalPrice!==3||hda.D.decimalPrice!==3.2||hda.A.decimalPrice!==2.3)throw new Error("HDA board failed");
const corners=out.quotes.filter(q=>q.marketKey==="CORNERS");
if(corners.filter(q=>q.selectionKey==="OVER"||q.selectionKey==="UNDER").length!==2)throw new Error("corners normalization failed");
if(corners.find(q=>q.selectionName?.trim()==="Exactly")?.selectionKey!==null)throw new Error("unsupported exact-corners must not be promoted");

const resolved=resolveBet365Fixture(x,[{hkjc_event_id:"FB123",kickoff_hkt:"2026-10-05T09:00:00Z",home_en:"Liverpool",away_en:"Manchester City"}],"2026-10-05T10:00:00Z");
if(resolved.status!=="VERIFIED"||resolved.canonicalMatchId!=="FB123")throw new Error("strict fixture match failed");
const ambiguous=resolveBet365Fixture(x,[
  {hkjc_event_id:"FB123",kickoff_hkt:"2026-10-05T09:00:00Z",home_en:"Liverpool",away_en:"Manchester City"},
  {hkjc_event_id:"FB124",kickoff_hkt:"2026-10-05T09:30:00Z",home_en:"Liverpool",away_en:"Manchester City"}
],"2026-10-05T10:00:00Z");
if(ambiguous.status!=="AMBIGUOUS"||ambiguous.canonicalMatchId!==null)throw new Error("ambiguous fixture must fail closed");

const unknown=bet365BrowserLive([{id:"x",event:"A v B",league:"L",time:"bad",score:"",period:"FirstHalf",markets:[{id:"m",name:"Match Result",odds:[{na:"A",od:"ENCODED"}]}]}],"2026-10-05T10:00:00Z");
if(unknown.fixtures[0].minute!==null||unknown.fixtures[0].homeScore!==null)throw new Error("unknown-not-zero failed");
if(unknown.quotes[0].decimalPrice!==null)throw new Error("encoded odds must remain unknown");

console.log("bet365 browser-feed contract ok");
