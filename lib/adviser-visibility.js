// Pure UI facet predicate. This never verifies, matches, publishes or promotes
// a source prediction. The upstream API controls verified identities; the
// independent provisional feed retains its own NOT VERIFIED status.
export const ADVISER_KEYS=Object.freeze({
 "adviser-betclan":"BETCLAN",
 "adviser-sportytrader":"SPORTYTRADER",
 "adviser-primatips":"PRIMATIPS",
 "adviser-statarea":"STATAREA"
});
export function matchAdviserFacet(match,feature) {
 const provider=ADVISER_KEYS[feature];
 if(!provider)return false;
 return Boolean(
  match?.evidence?.externalAdvisers?.some(a=>a?.provider===provider&&a?.identityStatus==="VERIFIED") ||
  match?.externalProvisional?.some(a=>a?.provider===provider&&a?.status==="PROVISIONAL_NOT_VERIFIED")
 );
}
