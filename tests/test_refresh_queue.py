import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from refresh_queue import universe, collect


class QueueTests(unittest.TestCase):
    def test_full_scope_and_fairness(self):
        prepared=[{'ticker':'AAPL','lastAttemptAt':'2026-09-30'},
                  {'ticker':'MSFT','lastAttemptAt':'2026-09-29'}]
        result=universe(prepared,{'NVDA':{}},
                        {'columns':['name','ticker'],'rows':[['Fund','QQQ'],['Bad','../../x']]})
        self.assertEqual(result,['NVDA','QQQ','MSFT','AAPL'])

    def test_one_failure_does_not_discard_other_issuers(self):
        saved=[]
        def build(t):
            if t=='BAD':raise ValueError('broken')
            return {'ticker':t}
        report=collect(['A','BAD','C'],build,saved.append,10,workers=1)
        self.assertEqual([r['ticker'] for r in saved],['A','C'])
        self.assertEqual(report['completedCount'],2)
        self.assertFalse(report['complete'])
        self.assertEqual(report['errors'],[{'ticker':'BAD','error':'ValueError'}])

    def test_budget_retains_completed_progress(self):
        clock=[0];saved=[]
        def build(t):
            clock[0]=100
            return {'ticker':t}
        report=collect(['A','B','C'],build,saved.append,10,workers=1,clock=lambda:clock[0])
        self.assertEqual(report['completedCount'],1)
        self.assertEqual(report['deferredCount'],2)
        self.assertEqual(saved,[{'ticker':'A'}])

if __name__=='__main__':unittest.main()
