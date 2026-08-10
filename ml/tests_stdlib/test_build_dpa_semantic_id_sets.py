from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest


ML_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_DIR))

from build_dpa_semantic_id_sets import build_id_sets  # noqa: E402
from build_kingpair_legacy_2m_shards import _semantic_id  # noqa: E402


START = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b -"
CHILD = "lnsgkgsnl/1r5b1/ppppppppp/9/9/7P1/PPPPPPP1P/1B5R1/LNSGKGSNL w -"


class DpaSemanticIdSetsTests(unittest.TestCase):
    def test_emits_sorted_single_lf_sets_and_refuses_overlap(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            legacy = root / "legacy"
            legacy.mkdir()
            identifier = f"sha256:{_semantic_id(START).hex()}"
            (legacy / "legacy-00000-of-00001.jsonl").write_text(
                json.dumps({"cp": 0, "semantic_position_id": identifier, "sfen": START}) + "\n",
                encoding="utf-8",
            )
            (legacy / "manifest.json").write_text(
                json.dumps({"selection": {"selected_rows": 1}}) + "\n",
                encoding="utf-8",
            )
            sealed = root / "sealed.jsonl"
            sealed.write_text(json.dumps({"sfen": CHILD}) + "\n", encoding="utf-8")
            output = root / "output"
            receipt = build_id_sets(legacy, [sealed], output)
            legacy_payload = (output / "legacy2m-position-ids.txt").read_bytes()
            sealed_payload = (output / "sealed-holdout-position-ids.txt").read_bytes()
            self.assertTrue(legacy_payload.endswith(b"\n"))
            self.assertFalse(legacy_payload.endswith(b"\n\n"))
            self.assertNotIn(b"\\n", legacy_payload)
            self.assertEqual(receipt["overlap"], 0)
            self.assertEqual(
                receipt["legacy"]["sha256"], hashlib.sha256(legacy_payload).hexdigest()
            )
            self.assertEqual(
                receipt["sealed"]["sha256"], hashlib.sha256(sealed_payload).hexdigest()
            )
            with self.assertRaisesRegex(Exception, "already exists"):
                build_id_sets(legacy, [sealed], output)


if __name__ == "__main__":
    unittest.main()
