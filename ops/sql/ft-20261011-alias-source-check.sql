alter table private.team_alias_reference drop constraint if exists team_alias_reference_source_check;
alter table private.team_alias_reference add constraint team_alias_reference_source_check check(source in ('REEP_CC0','FLASHSCORE_TEAM_ID','FOTMOB_TEAM_ID','FOREBET_REFERENCE','FOOTBALL_DATA_CSV','OPENFOOTBALL_CC0','OPENFOOTBALL_CLUBS_CC0'));
