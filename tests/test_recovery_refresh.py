import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from refresh_recovery import recovery_symbols
class RecoveryScopeTests(unittest.TestCase):
    def test_includes_tracked_and_queue_without_unrelated_or_unsafe_symbols(self):
        state={'stocks':[{'ticker':'stz'},{'ticker':'BRK.B'}], 'researchQueue':[{'ticker':'STZ'},{'ticker':'ADBE'},{'ticker':'../../bad'},{}], 'archived':[{'ticker':'OLD'}]}
        before=repr(state)
        self.assertEqual(recovery_symbols(state),['ADBE','BRK.B','STZ'])
        self.assertEqual(repr(state),before)
    def test_empty_tracker_does_not_expand_to_entire_universe(self):
        self.assertEqual(recovery_symbols({}),[])
if __name__=='__main__':unittest.main()
