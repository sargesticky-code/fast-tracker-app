-- After flashscore_native_team_identity: run each statement in its own transaction.
-- Applied successfully on production; archive original links without deleting historical facts.
select private.ft_detach_legacy_identity_links('public.api_football_event_map'::regclass);
select private.ft_detach_legacy_identity_links('public.bet365_event_map'::regclass);
select private.ft_detach_legacy_identity_links('public.phase1_h2h_provider_event_map'::regclass);
select private.ft_detach_legacy_identity_links('public.phase1_h2h_provider_meetings'::regclass);
select private.ft_detach_legacy_identity_links('public.phase1_identity_deferred_queue'::regclass);
select private.ft_detach_legacy_identity_links('public.phase1_identity_safety_block'::regclass);
select private.ft_detach_legacy_identity_links('public.phase2_manager_evidence'::regclass);
select private.ft_detach_legacy_identity_links('public.phase2_managers'::regclass);
select private.ft_detach_legacy_identity_links('public.phase2_player_status_evidence'::regclass);
select private.ft_detach_legacy_identity_links('public.phase2_players'::regclass);
select private.ft_detach_legacy_identity_links('public.phase2_match_lineup_evidence'::regclass);
