import hashlib,importlib.util,json,pathlib,sqlite3,unittest,subprocess
ROOT=pathlib.Path(__file__).resolve().parents[1]
def module(name,path):
 s=importlib.util.spec_from_file_location(name,ROOT/path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
class InformationProtection(unittest.TestCase):
 def test_immutable_d1_history_and_idempotent_migration(self):
  c=sqlite3.connect(':memory:');sql=(ROOT/'backend/cloudflare/schema.sql').read_text();c.executescript(sql);c.executescript(sql)
  for table,fields,row in [('fabric_snapshots','id,security_id,ticker,observed_at,payload',('1','SEC:1/X/T','T','2026-09-12T00:00:00Z','{}')),('fabric_changes','id,security_id,ticker,detected_at,payload',('1','SEC:1/X/T','T','2026-09-12T00:00:00Z','{}')),('fabric_events','id,security_id,published_at,detected_at,payload',('1','SEC:1/X/T','2026-09-11T00:00:00Z','2026-09-12T00:00:00Z','{}'))]:
   c.execute(f'INSERT INTO {table}({fields}) VALUES(?,?,?,?,?)',row)
   for action in [f"UPDATE {table} SET payload='changed' WHERE id='1'",f"DELETE FROM {table} WHERE id='1'"]:
    with self.assertRaises(sqlite3.IntegrityError): c.execute(action)
  self.assertNotIn('recovery_tracker',[r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")])
 def test_preparation_rejects_tracker_workflow_and_path_escape(self):
  m=module('prepare','scripts/prepare_information_improvement.py')
  for p in ['data/recovery-os.json','.github/workflows/deploy.yml','information-../../data/recovery-os.json','information-\\secret']:
   with self.assertRaises(ValueError):m.validate_paths('+++ b/'+p+'\n')
  self.assertEqual(m.validate_paths('+++ b/information-ui.js\n'),['information-ui.js'])
 def test_discovery_never_activates_a_candidate(self):
  m=module('discovery','scripts/discover_information_sources.py');result=m.discover()
  self.assertGreater(len(result['candidates']),15)
  self.assertTrue(all(not c['activationAllowed'] and c['status']=='REVIEW_REQUIRED' for c in result['candidates']))
 def test_canonical_tracker_is_the_original_file(self):
  committed=subprocess.check_output(['git','show','HEAD:data/recovery-os.json'],cwd=ROOT);self.assertEqual(hashlib.sha256((ROOT/'data/recovery-os.json').read_bytes()).hexdigest(),hashlib.sha256(committed).hexdigest())
 def test_adapter_registry_contains_real_mapping_or_explicit_unimplemented_state(self):
  d=json.loads((ROOT/'data/information/providers.json').read_text())
  for p in d['sources']:
   for key in ['operator','categories','coverage','auth','refresh','rateLimit','license','fieldMappings','timestampConvention','expectedFailures','qualityTests','fallback']:self.assertTrue(p.get(key),p['id']+' '+key)
