delete from private.team_alias_reference short where short.source='OPENFOOTBALL_CLUBS_CC0'
and short.external_team_id like 'CLUB:eng:%'
and exists (select 1 from private.team_alias_reference canonical
 where canonical.source=short.source and canonical.source_key=short.source_key
 and canonical.external_team_id=replace(short.external_team_id,'CLUB:eng:','CLUB:europe/england/eng.clubs.txt:'));