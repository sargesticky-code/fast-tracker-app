-- Run after the migration inside BEGIN / ROLLBACK; includes synthetic test rows.
do $verify$
declare before_counts jsonb; after_counts jsonb; sample public.adviser_source_observations;
begin
 if (select count(*) from public.team_entities_v2)<100 then raise exception 'NATIVE_ENTITY_BACKFILL_EMPTY'; end if;
 if exists(select 1 from public.team_entities_v2 where team_key not like 'FS_TEAM:%') then raise exception 'LEGACY_ENTITY_SURVIVED'; end if;
 if exists(select 1 from public.team_identity_current where team_key not like 'FS_TEAM:%') then raise exception 'LEGACY_IDENTITY_SURVIVED'; end if;
 if (select count(*) from private.ft_identity_retired_rows where relation_name='public.team_entities_v2')<>1255 then raise exception 'LEGACY_ARCHIVE_COUNT_WRONG'; end if;
 if (select count(*) from public.football_alias_supertable where source='BCL' and resolution_status='VERIFIED')<30 then raise exception 'BETCLAN_ALIAS_BACKFILL_EMPTY'; end if;
 select jsonb_build_array((select count(*) from public.team_entities_v2),(select count(*) from public.football_alias_supertable),(select count(*) from public.team_identity_current)) into before_counts;
 perform private.ft_refresh_flashscore_native_identity();
 select jsonb_build_array((select count(*) from public.team_entities_v2),(select count(*) from public.football_alias_supertable),(select count(*) from public.team_identity_current)) into after_counts;
 if before_counts<>after_counts then raise exception 'REPLAY_NOT_IDEMPOTENT: % <> %',before_counts,after_counts; end if;
 begin
 insert into public.team_entities_v2(team_key,name_key,canonical_name_en,status) values('HKJC:test','badlegacytest','Bad Legacy Test','ACTIVE');
 raise exception 'LEGACY_WRITE_ACCEPTED';
 exception when check_violation then null; end;
 insert into public.team_entities_v2(team_key,name_key,canonical_name_en,status) values
 ('FS_TEAM:TEST0001','identityqacollision','Identity QA Collision','ACTIVE'),('FS_TEAM:TEST0002','identityqacollision','Identity QA Collision','ACTIVE');
 perform public.ft_refresh_team_name_master();
 if exists(select 1 from public.team_identity_current where source_key='identityqacollision') then raise exception 'AMBIGUOUS_NAME_EXPOSED'; end if;
 select * into sample from public.adviser_source_observations where provider='BETCLAN' and identity_status='VERIFIED' limit 1;
 insert into public.adviser_source_observations select (jsonb_populate_record(null::public.adviser_source_observations,
 to_jsonb(sample)||jsonb_build_object('source_event_id','99999999999','source_home',sample.source_away,'source_away',sample.source_home))).*;
 if exists(select 1 from private.ft_native_team_alias_evidence where source='BCL' and source_event_id='99999999999') then raise exception 'REVERSED_ORIENTATION_LEARNED'; end if;
end $verify$;

do $alias_resolution$
declare a public.adviser_source_observations; hid text; ids text[];
begin
 select * into a from public.adviser_prediction_current where provider='BETCLAN' limit 1;
 if a.source_event_id is null then raise exception 'NO_CURRENT_ADVISER_TEST_FIXTURE'; end if;
 select 'FS_TEAM:'||home_external_id into hid from private.ft_native_flashscore_events where 'FS:'||external_event_id=a.canonical_event_id;
 insert into public.football_alias_supertable(source,alias_key,competition_key,provider_name,source_competition,verified_team_key,resolution_status,confidence,resolution_method)
 values('BCL','qanativealias',public.ft_team_name_key(a.source_competition),'QA Native Alias',a.source_competition,hid,'VERIFIED',1,'TRANSACTIONAL_TEST_ONLY');
 select array_agg(match_id) into ids from public.ft_adviser_exact_candidates('BETCLAN','QA Native Alias',a.source_away,a.source_competition,a.source_kickoff);
 if ids is distinct from array[a.canonical_event_id] then raise exception 'NATIVE_ALIAS_CANDIDATE_FAILED: %',ids; end if;
 if exists(select 1 from public.ft_adviser_exact_candidates('BETCLAN',a.source_away,'QA Native Alias',a.source_competition,a.source_kickoff)) then raise exception 'REVERSED_ALIAS_PUBLISHED'; end if;
 if exists(select 1 from public.ft_adviser_exact_candidates('BETCLAN','QA Native Alias',a.source_away,a.source_competition,null)) then raise exception 'UNKNOWN_KICKOFF_PUBLISHED'; end if;
 if (public.ft_alias_super_lookup('BCL','QA Native Alias',a.source_competition,'wrong-provider-id')->>'status')<>'UNMATCHED' then raise exception 'PROVIDER_ID_IGNORED'; end if;
end $alias_resolution$;
