from __future__ import annotations

from pathlib import Path
import shutil
import sys
import tempfile
import unittest


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import child_board_tune_membership_clarification as CLARIFICATION  # noqa: E402


class TuneMembershipClarificationTest(unittest.TestCase):
    def test_checked_in_clarification_is_exact_and_unopened(self):
        root = ML_DIR.parent
        value = CLARIFICATION.validate(root)
        self.assertEqual(value["schema"], CLARIFICATION.SCHEMA)
        self.assertTrue(
            value["tune_membership"]["v9_tune"]["candidate_subset_only"]
        )
        self.assertEqual(
            value["tune_membership"]["v9_tune"]["new_moves_added"], 0
        )
        self.assertFalse(
            value["protected_state_at_registration"]["tune_opened"]
        )

    def test_byte_change_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target = root / CLARIFICATION.RELATIVE_PATH
            target.parent.mkdir(parents=True)
            shutil.copyfile(
                ML_DIR.parent / CLARIFICATION.RELATIVE_PATH, target
            )
            target.write_bytes(target.read_bytes() + b" ")
            with self.assertRaisesRegex(
                CLARIFICATION.ClarificationError, "identity drift"
            ):
                CLARIFICATION.validate(root)


if __name__ == "__main__":
    unittest.main()
