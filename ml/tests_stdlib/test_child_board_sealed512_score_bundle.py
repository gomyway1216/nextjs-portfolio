from __future__ import annotations

import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
import sys
import tempfile
import unittest


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

try:
    import torch  # noqa: F401
    import child_board_sealed512_score_bundle as BUNDLE
except ModuleNotFoundError:
    BUNDLE = None


@unittest.skipIf(BUNDLE is None, "PyTorch is unavailable")
class ChildBoardSealed512ScoreBundleTest(unittest.TestCase):
    def _groups(self):
        examples = (
            SimpleNamespace(move="2g2f", teacher_cp=100.0),
            SimpleNamespace(move="7g7f", teacher_cp=0.0),
        )
        return [SimpleNamespace(parent_id="parent-a", examples=examples)]

    def test_bundle_has_real_four_role_completeness_and_fixed_order(self):
        groups = self._groups()
        predictions = {
            role: {
                ("parent-a", "2g2f"): float(index + 1),
                ("parent-a", "7g7f"): float(index),
            }
            for index, role in enumerate(BUNDLE.ROLE_ORDER)
        }
        raw, rows = BUNDLE.build_score_bundle(groups, predictions)
        self.assertEqual(rows, 2)
        parsed = [json.loads(line) for line in raw.splitlines()]
        self.assertEqual([row["move"] for row in parsed], ["2g2f", "7g7f"])
        self.assertTrue(
            all(set(row["scores"]) == set(BUNDLE.ROLE_ORDER) for row in parsed)
        )
        self.assertEqual(
            hashlib.sha256(raw).hexdigest(),
            hashlib.sha256(
                BUNDLE.build_score_bundle(groups, predictions)[0]
            ).hexdigest(),
        )

    def test_missing_real_artifact_score_is_rejected(self):
        predictions = {
            role: {
                ("parent-a", "2g2f"): 1.0,
                ("parent-a", "7g7f"): 0.0,
            }
            for role in BUNDLE.ROLE_ORDER
        }
        del predictions["frozen_student"][("parent-a", "7g7f")]
        with self.assertRaisesRegex(BUNDLE.BundleError, "missing frozen_student"):
            BUNDLE.build_score_bundle(self._groups(), predictions)

    def test_immutable_publication_rejects_different_existing_bytes(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "artifact.json"
            BUNDLE._atomic_create(path, b"first\n")
            BUNDLE._atomic_create(path, b"first\n")
            with self.assertRaisesRegex(BUNDLE.BundleError, "immutable output differs"):
                BUNDLE._atomic_create(path, b"second\n")


if __name__ == "__main__":
    unittest.main()
