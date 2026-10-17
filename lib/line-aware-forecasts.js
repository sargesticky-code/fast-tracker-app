// Source probabilities belong to an EXACT O/U threshold.
// Do not reinterpret Forebet O/U 2.5 as 3.5/4.5, or corners 9.5 as 10.5.
// These controls may name market lines not yet present in the source feed:
// missing lines remain unknown and never acquire synthetic probabilities.
export const GOAL_LINES = Object.freeze([1.5, 2.5, 3.5, 4.5]);
export const CORNER_LINES = Object.freeze([8.5, 9.5, 10.5, 11.5]);

export function verifiedSourceMarket(source, kind) {
  const allowed=kind==="goals"?GOAL_LINES:kind==="corners"?CORNER_LINES:null;
  const line=source?.line;
  if(!allowed || typeof line!=="number" || !allowed.includes(line))return null;
  const {over,under}=source;
  if(typeof over!=="number"||typeof under!=="number"
    ||!Number.isFinite(over)||!Number.isFinite(under)
    ||over<0||over>1||under<0||under>1
    ||over+under<0.98||over+under>1.02)return null;
  if(source?.pick!=="Over" && source?.pick!=="Under")return null;
  return {
    line,over,under,pick:source.pick,
    predictedScore:typeof source.predictedScore==="string"?source.predictedScore:null,
    avg:kind==="corners" && typeof source.avgCorners==="number"
      &&Number.isFinite(source.avgCorners)&&source.avgCorners>=0&&source.avgCorners<=30
      ?source.avgCorners:null,
    source:"FOREBET",semantics:"SOURCE_MARKET_EXACT_LINE"
  };
}

export function exactLineForecast(sourceMarket, requestedLine) {
  if(!sourceMarket || typeof requestedLine!=="number"
    ||sourceMarket.line!==requestedLine
    ||sourceMarket.semantics!=="SOURCE_MARKET_EXACT_LINE")return null;
  return sourceMarket;
}
