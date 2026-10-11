#!/usr/bin/env python3
"""One-shot offline alias research package. NEVER writes to Supabase.

Incorporates ALL versioned Reep CC0 names, exported live provider IDs,
Forebet/BCL/FST stored names, observed league evidence, public club aliases,
and a bounded, transparent direct-page source check. Unknown != matched.
"""
import collections,csv,datetime,glob,json,os,re,subprocess,time,unicodedata,zipfile
from pathlib import Path
from urllib.parse import urljoin,urlparse
import requests
from bs4 import BeautifulSoup

BASE=Path(__file__).resolve().parents[1]
RAW=BASE/'ops/team-alias-export/raw'
OUT=BASE/'ops/team-alias-export/package'
OUT.mkdir(parents=True,exist_ok=True)
TODAY=datetime.datetime.now(datetime.timezone.utc).isoformat()
rows=[];status=[]; seen=set()
def norm(x):
 x=unicodedata.normalize('NFKD',str(x or '')).casefold()
 return ''.join(c for c in x if c.isalnum() and not unicodedata.combining(c))
def jfiles(pattern):
 for path in sorted(glob.glob(str(pattern))):
  try:
   obj=json.loads(Path(path).read_text('utf-8'))
   if isinstance(obj,list):yield path,obj
  except Exception as e:status.append(dict(source='INPUT',url=str(path),result='INVALID_JSON',error=str(e)[:150],row_count=0))
def add(source,name,provider_id='',league='',country='',canonical='',identity='REFERENCE_ONLY',url='',role='',qid='',fixture='',captured='',note=''):
 name=str(name or '').strip()
 if not name:return
 key=(source,str(provider_id),norm(name),str(league),str(canonical))
 if key in seen:return
 seen.add(key)
 rows.append(dict(source=source,team_name=name,normalized_name=norm(name),
   provider_team_id=str(provider_id or ''),league=str(league or ''),country=str(country or ''),
   canonical_team_key=str(canonical or ''),identity_status=identity if canonical else 'REFERENCE_ONLY',
   source_url=str(url or ''),role=str(role or ''),wikidata_qid=str(qid or ''),
   fixture_event_id=str(fixture or ''),captured_at=str(captured or ''),note=str(note or '')))
def log(src,url,result,count=0,err=''):
 status.append(dict(source=src,url=url,result=result,row_count=count,error=str(err)[:220]))
# 1. All original saved CC0 entity + name + QID + optional FS/FM ID. Do not
# label Reep IDs as verified canonical identity or provider-native team IDs.
for path,data in jfiles(BASE/'ops/reep-full-20261011/chunk_*.json'):
 for rec in data:
  if not isinstance(rec,list) or len(rec)<7:continue
  eid,name,country,qid,fs,fm,role=rec[:7]
  add('REEP_CC0',name,eid,'',country,url='https://github.com/withqwerty/reep',
      role=role,qid=qid,note='linked_fs_id='+str(fs or '')+';linked_fotmob_id='+str(fm or ''))
log('REEP_CC0','https://github.com/withqwerty/reep','GIT_SNAPSHOT',sum(x['source']=='REEP_CC0' for x in rows))
# 2. Existing live Supabase references, copied via connected authorized SQL
# to isolated GitHub export branch. Raw reference includes canonical links.
for path,data in jfiles(RAW/'supabase_reference_*.json'):
 for r in data:
  add(r.get('source'),r.get('source_name'),r.get('external_team_id'),
    country=r.get('country'),canonical=r.get('canonical_team_key'),
    identity=r.get('identity_status') or 'REFERENCE_ONLY',qid=r.get('wikidata_qid'),
    role=r.get('name_role'),note=r.get('provenance'))
for pattern in ('flashscore_tail.json','fotmob_*.json','fotmob_tail.json',
                'football_data*.json','openfootball*.json'):
 for path,data in jfiles(RAW/pattern):
  if Path(path).name=='football_data_stored_leagues.json':continue
  for r in data:
   if isinstance(r,dict) and 'external_team_id' in r:
    add(r.get('source'),r.get('source_name'),r.get('external_team_id'),
      country=r.get('country'),canonical=r.get('canonical_team_key'),
      identity=r.get('identity_status') or 'REFERENCE_ONLY',qid=r.get('wikidata_qid'),
      role=r.get('name_role'),note=r.get('provenance'))
# 3. Saved canonical/Forebet/BCL/FST/Flashscore/FotMob name registry.
for path,data in jfiles(RAW/'master_*.json'):
 for r in data:
  add(r.get('source'),r.get('source_name'),canonical=r.get('team_key'),
      identity=r.get('status'),role='MASTER_VERIFIED',
      note='master_confidence='+str(r.get('confidence','')))
# 4. Real leagues for provider IDs observed in saved events.
for path,data in jfiles(RAW/'observed_team_leagues_*.json'):
 for r in data:
  add(r.get('source_key'),r.get('team_name'),r.get('provider_team_id'),
      league=r.get('leagues'),role='MATCH_OBSERVED',note='LIVE_SOURCE_SHADOW_SNAPSHOT')
for path,data in jfiles(RAW/'forebet_stored_matches.json'):
 for r in data:
  for side in ('home','away'):
   add('FOREBET',r.get('forebet_'+side+'_team'),
       league=r.get('canonical_league'),fixture=r.get('match_id'),
       role='MATCH_OBSERVED',note='stored forebet provenance')
for path,data in jfiles(RAW/'football_data_stored_leagues.json'):
 for r in data:
  add('FOOTBALL_DATA_CSV',r.get('team'),league=r.get('league_code'),
      role='MATCH_OBSERVED',note='from stored 22-league 2026-27 CSVs')

# 5. All alias groups from CC0 openfootball/clubs (as opposed to just 2
# national files in the existing DB); no new Supabase background procedure.
CLUBS=Path('/tmp/ft_alias_openfootball_clubs')
if not CLUBS.exists():
 try:
  subprocess.run(['git','clone','--quiet','--depth','1',
      'https://github.com/openfootball/clubs.git',str(CLUBS)],
      timeout=110,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 except Exception as e:log('OPENFOOTBALL_CLUBS','https://github.com/openfootball/clubs','UNAVAILABLE',err=e)
if CLUBS.exists():
 n0=len(rows)
 for path in sorted(CLUBS.rglob('*.clubs.txt')):
  if any(x in path.name for x in ('.history.','.props.','.lang.')):continue
  root=None;rel=path.relative_to(CLUBS).as_posix()
  for line in path.read_text('utf-8',errors='replace').splitlines():
   txt=line.strip()
   if not txt or txt.startswith('#'):continue
   if txt.startswith('='):root=None;continue
   if line[:1].isspace() and txt.startswith('|'):
    if root:
     for part in txt[1:].split('|'):
      name=re.sub(r'\[[a-z]{2,3}\]$','',part.split('#')[0]).strip()
      if 2<=len(name)<=140:
       add('OPENFOOTBALL_CLUBS_CC0',name,rel+':'+norm(root),
           league=rel,country=rel.split('/')[0],role='CLUB_ALIAS',
           url='https://github.com/openfootball/clubs',note='club_root='+root)
    continue
   if line[:1].isspace():continue
   base=re.sub(r'^ii\)\s*','',txt).split('#')[0].split(',')[0].strip()
   if 2<=len(base)<=140 and '://' not in base:
    root=base;add('OPENFOOTBALL_CLUBS_CC0',base,rel+':'+norm(root),
        league=rel,country=rel.split('/')[0],role='CLUB_ROOT',
        url='https://github.com/openfootball/clubs')
   else:root=None
 log('OPENFOOTBALL_CLUBS','https://github.com/openfootball/clubs',
     'GITHUB_FULL_CLUB_FILES',len(rows)-n0)

HEADERS={'User-Agent':'Mozilla/5.0 (compatible; personal offline team name catalog/1.0)'}
session=requests.Session();session.headers.update(HEADERS)
def get(url,max_bytes=2500000):
 try:
  x=session.get(url,timeout=(8,22),allow_redirects=True)
  if x.status_code!=200:return None,'HTTP_'+str(x.status_code)
  if len(x.content)>max_bytes:return None,'TOO_LARGE'
  body=x.text
  if any(z in body[:5000].lower() for z in ('just a moment','access denied','verify you are human','captcha')):
   return None,'ACCESS_CHALLENGE'
  return body,'HTTP_200'
 except requests.RequestException as e:return None,type(e).__name__+':'+str(e)[:75]

# 6. Public advisor pages: one-time read; does not attempt to solve any site
# restriction. Save team candidates with exact source URLs when parseable.
site_pages={
 'FOREBET': ['https://www.forebet.com/index.php/en/football-predictions/predictions-1x2'],
 'BETCLAN':['https://www.betclan.com/todays-football-predictions/',
            'https://www.betclan.com/tomorrows-football-predictions/'],
 'SPORTYTRADER':['https://www.sportytrader.com/en/betting-tips/football/']
}
betclan_links={}
for source,urls in site_pages.items():
 for url in urls:
  body,result=get(url);n0=len(rows)
  if body is None:log(source,url,result);continue
  soup=BeautifulSoup(body,'html.parser')
  if source=='BETCLAN':
   for a in soup.select('a[href]'):
    href=urljoin(url,a.get('href') or '')
    u=urlparse(href)
    if u.hostname not in ('www.betclan.com','betclan.com'):continue
    m=re.search(r'/predictionsdetails/football/(\d+)/',u.path)
    if m:betclan_links[m.group(1)]=href
  elif source=='SPORTYTRADER':
   for a in soup.select('a[href]'):
    href=urljoin(url,a.get('href') or '')
    if urlparse(href).hostname not in ('www.sportytrader.com','sportytrader.com'):continue
    text=a.get_text(' ',strip=True)[:160]
    # Only explicit two-club labels; do not guess from article slug.
    m=re.search(r'(.{3,70}?)\s+(?:vs\.?|v\.)\s+(.{3,70})',text,re.I)
    if m:
     for team in (m.group(1),m.group(2)):
      add('SPORTYTRADER',team.strip(' -:|'),fixture=href,role='ARTICLE_LABEL',
          url=href,captured=TODAY,note='UNVERIFIED_WEBSITE_LABEL')
  else:
   # Official Forebet may decline cloud traffic (403). Preserve real status.
   for node in soup.select('.homeTeam, .awayTeam'):
    team=node.get_text(' ',strip=True)
    if team:add('FOREBET',team,role='PUBLIC_HTML',url=url,captured=TODAY)
  log(source,url,result,len(rows)-n0)
  time.sleep(.5)

# Bounded one-time BetClan detail pull to capture actual team names,
# article/event IDs and league if visible. One URL per event; no repeats.
limit=int(os.getenv('BETCLAN_MAX_DETAILS','260'))
for index,(eid,url) in enumerate(sorted(betclan_links.items())[:max(0,limit)]):
 body,result=get(url)
 if body is not None:
  soup=BeautifulSoup(body,'html.parser')
  names=[x.strip() for x in (soup.select_one('.teamstop').stripped_strings
          if soup.select_one('.teamstop') else [])]
  names=[x for x in names if x.lower() not in ('vs','v','versus') and len(x)>1]
  league=(soup.select_one('.leaguename') or soup.select_one('.leagueName') or soup.select_one('.league'))
  l=league.get_text(' ',strip=True)[:120] if league else ''
  if len(names)>=2 and norm(names[0])!=norm(names[-1]):
   for name in (names[0],names[-1]):
    add('BETCLAN',name,league=l,fixture=eid,role='ARTICLE_TEAM',url=url,
        captured=TODAY,note='article_id_not_team_id')
 # Store observed failures so next chat knows what is real, not make up aliases.
 if index%60==0:log('BETCLAN_DETAIL_BATCH',url,result,index+1)
 time.sleep(.7)
log('BETCLAN_DETAIL_TOTAL','https://www.betclan.com/',f'LISTED_{len(betclan_links)}',min(len(betclan_links),limit))

# 7. Use already published official football-data.co.uk league CSVs ONCE,
# never write a recurring provider scraper to production.
FD_LEAGUES=['E0','E1','E2','E3','SC0','SC1','SC2','SC3',
            'D1','D2','I1','I2','SP1','SP2','F1','F2','N1','B1','P1','T1','G1','EC']
for div in FD_LEAGUES:
 url=f'https://www.football-data.co.uk/mmz4281/2627/{div}.csv'
 body,res=get(url,1500000)
 n0=len(rows)
 if body is not None and 'HomeTeam' in body[:3500] and 'AwayTeam' in body[:3500]:
  try:
   import io
   reader=csv.DictReader(io.StringIO(body.lstrip('\ufeff')))
   for r in reader:
    for field in ('HomeTeam','AwayTeam'):
     if r.get(field):add('FOOTBALL_DATA_CSV',r[field],league=div,
            role='OFFICIAL_CSV',url=url,captured=TODAY)
  except Exception as e:res='CSV_PARSE_ERROR:'+str(e)[:100]
 else:
  res='NOT_VALID_CSV:'+res
 log('FOOTBALL_DATA_CSV',url,res,len(rows)-n0)
 time.sleep(.35)

# 8. Source-centric, reconciliation-friendly CSVs. No destructive or
# automatically verified matching. Keys use known canonical IDs first.
def write_csv(name,data,fields):
 with (OUT/name).open('w',newline='',encoding='utf-8-sig') as f:
  writer=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore')
  writer.writeheader();writer.writerows(data)
COLS=['source','team_name','normalized_name','provider_team_id','league','country',
      'canonical_team_key','identity_status','source_url','role',
      'wikidata_qid','fixture_event_id','captured_at','note']
rows.sort(key=lambda x:(x['source'],x['normalized_name'],x['provider_team_id'],x['league']))
write_csv('01_ALL_SOURCE_NAMES_LONG.csv',rows,COLS)
# Group by confirmed canonical, otherwise keep source ID separate; never
# force homonyms to share identity. Each source has name1/name2 and id1/id2.
groups={}
def group_key(r):
 if r['canonical_team_key']:return 'CANONICAL:'+r['canonical_team_key']
 if r['provider_team_id']:return 'UNMATCHED:'+r['source']+':'+r['provider_team_id']
 return 'UNMATCHED:'+r['source']+':'+r['normalized_name']+':'+r['league']
for r in rows:
 k=group_key(r)
 g=groups.setdefault(k,dict(group_key=k,canonical_team_key=r['canonical_team_key'],
    display_team_name=r['team_name'],country=r['country'],leagues=set(),source_count=set(),aliases=0,
    matching_decision='KEEP_CANONICAL' if r['canonical_team_key'] else 'REVIEW',
    reviewed_canonical_team_key='',review_note=''))
 if r['league']:g['leagues'].update(r['league'].split(' | '))
 g['aliases']+=1;g['source_count'].add(r['source'])
 src={'FLASHSCORE':'flashscore','FLASHSCORE_TEAM_ID':'flashscore',
  'FOTMOB':'fotmob','FOTMOB_TEAM_ID':'fotmob','FOREBET':'forebet',
  'BCL':'betclan','BETCLAN':'betclan','FST':'sportytrader',
  'SPORTYTRADER':'sportytrader','FOOTBALL_DATA':'football_data',
  'FOOTBALL_DATA_CSV':'football_data','REEP_CC0':'reep',
  'OPENFOOTBALL_CLUBS_CC0':'openfootball','OPENFOOTBALL_CC0':'openfootball',
  'CANONICAL_EN':'canonical'}.get(r['source'],'other')
 names=g.setdefault('_'+src+'_name_set',[])
 if r['team_name'] not in names and len(names)<3:names.append(r['team_name'])
 ids=g.setdefault('_'+src+'_id_set',[])
 if r['provider_team_id'] and r['provider_team_id'] not in ids and len(ids)<3:ids.append(r['provider_team_id'])
wide=[]
for g in groups.values():
 v={k:x for k,x in g.items() if not k.startswith('_')}
 v['leagues']=' | '.join(sorted(x for x in v['leagues'] if x))
 v['source_count']=len(v['source_count'])
 for src in ('canonical','flashscore','fotmob','forebet','betclan','sportytrader',
             'football_data','reep','openfootball','other'):
  v[src+'_names']=' | '.join(g.get('_'+src+'_name_set',[]))
  v[src+'_ids']=' | '.join(g.get('_'+src+'_id_set',[]))
 wide.append(v)
basecols=['group_key','canonical_team_key','display_team_name','country','leagues',
          'aliases','source_count','matching_decision','reviewed_canonical_team_key','review_note']
widecols=basecols+[q+s for q in ('canonical','flashscore','fotmob','forebet','betclan','sportytrader',
                                'football_data','reep','openfootball','other') for s in ('_names','_ids')]
wide.sort(key=lambda x:(x['canonical_team_key']=='' ,x['display_team_name'].casefold()))
write_csv('02_WIDE_MATCHING_MASTER_EDIT_ME.csv',wide,widecols)
candidates=collections.defaultdict(lambda:collections.defaultdict(set))
for r in rows:
 if r['normalized_name']:candidates[r['normalized_name']][r['source']].add(r['team_name'])
suggestions=[]
for key,sources in candidates.items():
 if len(sources)>=2:
  suggestions.append(dict(normalized_name=key,source_count=len(sources),
       sources=' | '.join(sorted(sources)),example_names=' | '.join(
        next(iter(sorted(val))) for val in sources.values())))
write_csv('03_SAME_NAME_CROSS_SOURCE_CANDIDATES.csv',suggestions,
          ['normalized_name','source_count','sources','example_names'])
write_csv('04_SOURCE_AVAILABILITY.csv',status,['source','url','result','row_count','error'])
counts=collections.Counter(r['source'] for r in rows)
write_csv('05_SOURCE_COUNTS.csv',
          [dict(source=s,records=n) for s,n in sorted(counts.items())],['source','records'])
write_csv('06_READY_FOR_SUPABASE_IMPORT_AFTER_REVIEW.csv',[],[
    'source','source_name','provider_team_id','canonical_team_key',
    'country','league','verification_status','evidence','reviewer_note'])
meta=dict(generated_utc=TODAY,total_long_rows=len(rows),
          match_groups=len(wide),same_name_candidates=len(suggestions),
          source_counts=dict(counts),status=status,
          data_policy='SOURCE RECORDS ONLY, UNKNOWN NOT VERIFIED; NO SUPABASE WRITE')
(OUT/'MANIFEST.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'README_FIRST_請先閱讀.md').write_text('''# 球隊 ID / Alias 一次性離線匹配資料包
此 ZIP 包含 Reep CC0 全量、原有 Supabase 各來源名稱／ID／聯賽、可取得嘅公開網頁名稱與 OpenFootball 球會別名。
**檔案中的來源紀錄不等於已配對**；未有可靠 canonical_team_key 時保持空白。
02_WIDE_MATCHING_MASTER_EDIT_ME.csv = 另一個 ChatGPT 主要編輯檔。
01_ALL_SOURCE_NAMES_LONG.csv = 全部原始來源名稱及出處。
03_SAME_NAME_CROSS_SOURCE_CANDIDATES.csv = 可作匹配候選，未驗證。
04_SOURCE_AVAILABILITY.csv = 真實來源抓取結果，403 或不完整都會明列。
06_READY_FOR_SUPABASE_IMPORT_AFTER_REVIEW.csv = 審核完成後才填寫的匯入範本。
有些來源如 Forebet 遭到 403；本包仍包含舊有已保存 Forebet 名稱，**不能聲稱今日已完整下載 Forebet 全站**。
BetClan/ SportyTrader Article ID 與隊伍 ID 不同，不能混淆。
請勿將 CC0 球隊組 ID 或 DIV: league name 當成供應商官方 ID。
本工具沒有啟動 Supabase 任務／刪除資料，沒有繞過驗證碼或網站存取限制。
''',encoding='utf-8')
(OUT/'PROMPT_FOR_NEXT_ADVANCED_CHATGPT.md').write_text('''你係 Fast Tracker 足球 Team Identity 專案嘅離線匹配審核員。你已收到包含各來源名稱、IDs、聯賽、出處及待匹配主表嘅 ZIP。

目標：只做一次大規模球隊身份配對，輸出可匯入 Supabase 嘅審核檔案。唔需要新網絡爬蟲／新排程／API 呼叫，亦唔改動原有 match prediction / odds。

1. 解壓後先讀 MANIFEST.json 同 04_SOURCE_AVAILABILITY.csv，根據真實下載狀態評估 coverage；唔好幻想 403 網站已全量下載。
2. 以 01_ALL_SOURCE_NAMES_LONG.csv 為完整來源紀錄、02_WIDE_MATCHING_MASTER_EDIT_ME.csv 為可編輯主表。任何現有 canonical ID 一律保留，除非有充分證據證明錯誤。
3. 首先鎖定來源正式 team ID：Flashscore/FotMob Provider Team ID、Reep entity/QID、同 OpenFootball 所屬球會群組；用 league、country、fixture event evidence 再比對 Forebet、BetClan、SportyTrader、Football-Data 同其他來源名稱。BCL／FST 名稱主要係已保存嘅 source master，唔一定有真 team ID。
4. 優先一次性批量匹配：可靠完全一致 ID／多來源一致名稱先核實，然後按聯賽、國家和別名群組擴展；有跨聯賽同名、女子隊／青年隊、不同國家、名稱短縮混淆，標記 AMBIGUOUS 待審，絕不可硬合併。唔好將來源 Article/Fixture ID 當 Team ID。
5. 更新 02 的 matching_decision、reviewed_canonical_team_key 及 reviewer_note，輸出 updated wide CSV。另產出 reviewed 06 CSV，僅包含 VERIFIED／可靠來源 ID 與 canonical team_key 配對、source, source_name, provider_team_id, league, country, evidence。
6. 生成 JSON QA：各來源匯入數、已匹配數、歧義數、未匹配數、相同 Provider ID 多 canonical 衝突數、無對應 league 數、抽樣至少 50 隊、來源時間與證據。
7. 產生 idempotent SQL（使用原有 private.team_alias_reference / public.team_alias_registry_v2 / public.team_name_master 模式），只追加或更新經審核嘅連結；禁止更新 canonical match identity、existing odds、prediction、cron。同時產生 rollback SQL。
8. 最終輸出 ZIP：edited master, approved imports, QA, SQL, source report；未得用戶同意唔好直接執行 SQL。
重點：一次性做完匹配，Supabase 之後只需要查表，不需要每小時做 fuzzy matching。
''',encoding='utf-8')
zipfile_path=BASE/'ops/team-alias-export/FT_ALL_PROVIDER_TEAM_ALIAS_OFFLINE.zip'
with zipfile.ZipFile(zipfile_path,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=8) as z:
 for path in OUT.rglob('*'):
  if path.is_file():z.write(path,'FT_TEAM_ALIAS_MATCHING/'+path.name)
 # Preserve audit proof directly in ZIP, including complete original Reep JSON
 # chunks and DB-export source rows, not just transformed/edited workbook rows.
 for path in sorted((BASE/'ops/reep-full-20261011').glob('chunk_*.json')):
  z.write(path,'SOURCE_RAW/REEP_CC0/'+path.name)
 for path in sorted(RAW.glob('*.json')):
  z.write(path,'SOURCE_RAW/SUPABASE_EXPORTED/'+path.name)
print('ALIAS_ZIP_READY',json.dumps(dict(zip=str(zipfile_path),bytes=zipfile_path.stat().st_size,
 total_rows=len(rows),match_groups=len(wide),per_source=dict(counts)),ensure_ascii=False))
