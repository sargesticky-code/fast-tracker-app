-- Reep sampled CC0, unique QID entity and pre-verified canonical name.
-- Do not overwrite old source identities or global homonyms.
WITH incoming(source,source_name,team_key,reep_id,qid) AS (
 VALUES
('REEP_CC0','St. Louis City Soccer Club','HKJC:stlouiscitysc','reep_t32b07a21','Q66642491'),
('REEP_CC0','Stockport County','HKJC:stockport','reep_t5d169c52','Q18526'),
('REEP_CC0','Stockport County F.C.','HKJC:stockport','reep_t5d169c52','Q18526'),
('REEP_CC0','Stoke City','HKJC:stoke','reep_t55f4d538','Q18736'),
('REEP_CC0','Stoke City F.C.','HKJC:stoke','reep_t55f4d538','Q18736'),
('REEP_CC0','St. Pauli','HKJC:stpauli','reep_t94f02422','Q6463'),
('REEP_CC0','Strasbourg','HKJC:strasbourg','reep_t766ba498','Q126334'),
('REEP_CC0','Stuttgart','HKJC:stuttgart','reep_t88b5bc12','Q4512'),
('REEP_CC0','Sukhothai','HKJC:sukhothai','reep_t5fdf4581','Q6640806'),
('REEP_CC0','Sukhothai F.C.','HKJC:sukhothai','reep_t5fdf4581','Q6640806'),
('REEP_CC0','Sunderland','HKJC:sunderland','reep_tb5c0a8e2','Q18739'),
('REEP_CC0','Sunderland A.F.C.','HKJC:sunderland','reep_tb5c0a8e2','Q18739'),
('REEP_CC0','Sunderland Association Football Club','HKJC:sunderland','reep_tb5c0a8e2','Q18739'),
('REEP_CC0','Suwon FC','HKJC:suwonfc','reep_t28eee8ec','Q3455793'),
('REEP_CC0','SV Elversberg','HKJC:elversberg','reep_tee73c21a','Q692691'),
('REEP_CC0','Swansea City','HKJC:swansea','reep_t0394761b','Q18659'),
('REEP_CC0','Swansea City A.F.C.','HKJC:swansea','reep_t0394761b','Q18659'),
('REEP_CC0','Swindon Town','HKJC:swindon','reep_t5096eaa8','Q19634'),
('REEP_CC0','Swindon Town F.C.','HKJC:swindon','reep_t5096eaa8','Q19634'),
('REEP_CC0','Tampines Rovers','HKJC:tampinesrovers','reep_t49f24bd1','Q1536543'),
('REEP_CC0','Tampines Rovers FC','HKJC:tampinesrovers','reep_t49f24bd1','Q1536543'),
('REEP_CC0','Tegevajaro Miyazaki','HKJC:tegevajaromiyazaki','reep_tc2a6b265','Q11232186'),
('REEP_CC0','Telstar','HKJC:telstar','reep_t6bb4cc05','Q1071713'),
('REEP_CC0','Tepatitlán','HKJC:tepatitlan','reep_teddb38a7','Q24185207'),
('REEP_CC0','Tepatitlán F.C.','HKJC:tepatitlan','reep_teddb38a7','Q24185207'),
('REEP_CC0','Ternana Women','HKJC:ternanawomen','reep_t4b45db89','Q135196550'),
('REEP_CC0','Thun','HKJC:thun','reep_tdc295d22','Q464775'),
('REEP_CC0','Tlaxcala','HKJC:tlaxcala','reep_tfd5f537d','Q24185114'),
('REEP_CC0','Tlaxcala F.C.','HKJC:tlaxcala','reep_tfd5f537d','Q24185114'),
('REEP_CC0','Tochigi City','HKJC:tochigicity','reep_ta3bf794a','Q7811989'),
('REEP_CC0','Tochigi City FC','HKJC:tochigicity','reep_ta3bf794a','Q7811989'),
('REEP_CC0','Tokushima Vortis','HKJC:tokushimavortis','reep_t15414831','Q513145'),
('REEP_CC0','Tokyo Football Club','HKJC:fctokyo','reep_tf2d17d60','Q856619'),
('REEP_CC0','Tokyo Verdy','HKJC:tokyoverdy','reep_te8644ca0','Q620499'),
('REEP_CC0','TOP Oss','HKJC:oss','reep_tbd687e67','Q1149034'),
('REEP_CC0','Torino','HKJC:actorino','reep_t5ce85433','Q2768'),
('REEP_CC0','Torino Calcio','HKJC:actorino','reep_t5ce85433','Q2768'),
('REEP_CC0','Torino FC','HKJC:actorino','reep_t5ce85433','Q2768'),
('REEP_CC0','Toronto FC','HKJC:torontofc','reep_t1039270c','Q327238'),
('REEP_CC0','TPS Turku','HKJC:tpsturku','reep_t61415294','Q223813'),
('REEP_CC0','Tranmere Rovers','HKJC:tranmere','reep_t97135cb4','Q19637'),
('REEP_CC0','Tranmere Rovers F.C.','HKJC:tranmere','reep_t97135cb4','Q19637'),
('REEP_CC0','Troyes','HKJC:troyes','reep_t00a90771','Q2868069'),
('REEP_CC0','TSV Bayer 04 Leverkusen','HKJC:leverkusen','reep_tde1cded4','Q104761'),
('REEP_CC0','UD Almería','HKJC:almeria','reep_t7365d971','Q10407'),
('REEP_CC0','Udinese','HKJC:udinese','reep_t53dcb145','Q2798'),
('REEP_CC0','Udinese Calcio','HKJC:udinese','reep_t53dcb145','Q2798'),
('REEP_CC0','UD Las Palmas','HKJC:laspalmas','reep_taf8bbff3','Q11979'),
('REEP_CC0','Union Berlin','HKJC:unionberlin','reep_t63b1713b','Q141971'),
('REEP_CC0','Unión Deportiva Almería','HKJC:almeria','reep_t7365d971','Q10407'),
('REEP_CC0','Unione Sportiva Lecce','HKJC:lecce','reep_t6f83124c','Q13391'),
('REEP_CC0','Unione Sportiva Sassuolo Calcio','HKJC:sassuolo','reep_t5105195c','Q8603'),
('REEP_CC0','Urawa Red Diamonds','HKJC:urawareds','reep_t27424f4b','Q218883'),
('REEP_CC0','US Boulogne','HKJC:boulognesurmer','reep_td98d5ffb','Q309400'),
('REEP_CC0','US Lecce','HKJC:lecce','reep_t6f83124c','Q13391'),
('REEP_CC0','US Sassuolo Calcio','HKJC:sassuolo','reep_t5105195c','Q8603'),
('REEP_CC0','Uthai Thani','HKJC:uthaithani','reep_t709cd9b1','Q4925132'),
('REEP_CC0','Uthai Thani F.C.','HKJC:uthaithani','reep_t709cd9b1','Q4925132'),
('REEP_CC0','Utrecht','HKJC:utrecht','reep_ta1e9fe18','Q24680'),
('REEP_CC0','Vanraure Hachinohe','HKJC:vanraurehachinohe','reep_t073f59fc','Q11351958'),
('REEP_CC0','Vasco da Gama','HKJC:vascodagama','reep_t2990e863','Q2094623'),
('REEP_CC0','Vegalta Sendai','HKJC:vegaltasendai','reep_t9f69d264','Q1044651'),
('REEP_CC0','Venados','HKJC:venados','reep_td8a6f0e6','Q1570578'),
('REEP_CC0','Venados FC','HKJC:venados','reep_td8a6f0e6','Q1570578'),
('REEP_CC0','Venezia','HKJC:venezia','reep_t1efcd42e','Q501245'),
('REEP_CC0','Venezia F.C.','HKJC:venezia','reep_t1efcd42e','Q501245'),
('REEP_CC0','Ventforet Kofu','HKJC:ventforetkofu','reep_tbc973a53','Q1061696'),
('REEP_CC0','Verein für Bewegungsspiele Stuttgart 1893','HKJC:stuttgart','reep_t88b5bc12','Q4512'),
('REEP_CC0','Verein für Leibesübungen Wolfsburg','HKJC:wolfsburg','reep_te786da6b','Q101859'),
('REEP_CC0','VfB Stuttgart','HKJC:stuttgart','reep_t88b5bc12','Q4512'),
('REEP_CC0','VfB Stuttgart 1893','HKJC:stuttgart','reep_t88b5bc12','Q4512'),
('REEP_CC0','VfL Bochum','HKJC:bochum','reep_t0e165abc','Q105861'),
('REEP_CC0','VfL Osnabrück','HKJC:osnabruck','reep_t1836a624','Q160530'),
('REEP_CC0','Viborg FF','HKJC:viborg','reep_td1cfb6c3','Q837956'),
('REEP_CC0','Viborg Fodsports Forening','HKJC:viborg','reep_td1cfb6c3','Q837956'),
('REEP_CC0','Viking FK','HKJC:viking','reep_t9b15b6f6','Q211177'),
('REEP_CC0','Viking Fotballklubb','HKJC:viking','reep_t9b15b6f6','Q211177'),
('REEP_CC0','Vissel Kobe','HKJC:visselkobe','reep_t90f05d2c','Q844271'),
('REEP_CC0','V-Varen Nagasaki','HKJC:vvarennagasaki','reep_t2cd33fec','Q3029309'),
('REEP_CC0','VVV-Venlo','HKJC:venlo','reep_ta59324cc','Q24689'),
('REEP_CC0','Walsall','HKJC:walsall','reep_tb080a72a','Q19644'),
('REEP_CC0','Walsall F.C.','HKJC:walsall','reep_tb080a72a','Q19644'),
('REEP_CC0','Wanderers','HKJC:montevideowanderers','reep_t4b4705df','Q25443884'),
('REEP_CC0','Watford','HKJC:watford','reep_t2a827671','Q2714'),
('REEP_CC0','Watford F.C.','HKJC:watford','reep_t2a827671','Q2714'),
('REEP_CC0','Wigan Athletic','HKJC:wigan','reep_t27b734ef','Q18750'),
('REEP_CC0','Wigan Athletic F.C.','HKJC:wigan','reep_t27b734ef','Q18750'),
('REEP_CC0','Willem II','HKJC:willemii','reep_t62311e4c','Q332664'),
('REEP_CC0','Wolfsburg','HKJC:wolfsburg','reep_te786da6b','Q101859'),
('REEP_CC0','Yellow-Red Koninklijke Voetbalclub Mechelen','HKJC:kvmechelen','reep_t74584c9a','Q113000'),
('REEP_CC0','Yokohama FC','HKJC:fcyokohama','reep_tc746e352','Q1062259'),
('REEP_CC0','Yokohama F. Marinos','HKJC:yokohamafmarinos','reep_t94e0f75d','Q854932'),
('REEP_CC0','Yokohama Marinos','HKJC:yokohamafmarinos','reep_t94e0f75d','Q854932'),
('REEP_CC0','Yongin FC','HKJC:yonginfc','reep_t013b0d46','Q137510040'),
('REEP_CC0','Zelvia','HKJC:machidazelvia','reep_t049194ad','Q1366905'),
('REEP_CC0','Zürich','HKJC:zurich','reep_t5d809f46','Q206692')
), valid AS (
 SELECT source,source_name,team_key,public.ft_team_name_key(source_name) source_key
 FROM incoming x WHERE EXISTS(SELECT 1 FROM public.team_entities_v2 e WHERE e.team_key=x.team_key)
 AND NOT EXISTS(SELECT 1 FROM public.team_name_master m
  WHERE m.source=x.source AND m.source_key=public.ft_team_name_key(x.source_name))
 AND NOT EXISTS(SELECT 1 FROM public.team_alias_registry_v2 a
  WHERE a.source=x.source AND a.alias_key=public.ft_team_name_key(x.source_name))
), safe AS (
 SELECT v.* FROM valid v WHERE NOT EXISTS(
 SELECT 1 FROM valid w WHERE v.source=w.source AND v.source_key=w.source_key
 AND v.team_key<>w.team_key)
), reg AS (
 INSERT INTO public.team_alias_registry_v2
 (source,alias_key,team_key,alias,status,confidence,evidence_count,distinct_event_count,
 verification_method,first_seen_at,last_seen_at,updated_at)
 SELECT source,source_key,team_key,source_name,'VERIFIED',0.94,1,1,
 'REEP_CC0_UNIQUE_ENTITY_MULTI_SOURCE_SAMPLE_CHECKED',now(),now(),now()
 FROM safe ON CONFLICT(source,alias_key,team_key) DO NOTHING
 RETURNING source,alias_key,team_key,alias,confidence
), mast AS (
 INSERT INTO public.team_name_master
 (source,source_name,source_key,team_key,hkjc_name_en,hkjc_name_zh,
 status,confidence,event_count,first_seen_at,last_seen_at,evidence_sources,updated_at)
 SELECT r.source,r.alias,r.alias_key,r.team_key,e.hkjc_name_en,e.hkjc_name_zh,
 'VERIFIED',r.confidence,1,now(),now(),
 '["REEP_CC0_ENTITY","SAMPLED_CROSS_SOURCE_20261011"]'::jsonb,now()
 FROM reg r JOIN public.team_entities_v2 e USING(team_key)
 ON CONFLICT(source,source_key,team_key) DO NOTHING RETURNING source
)
SELECT (SELECT count(*) FROM reg) aliases_inserted,
 (SELECT count(*) FROM mast) master_inserted;
