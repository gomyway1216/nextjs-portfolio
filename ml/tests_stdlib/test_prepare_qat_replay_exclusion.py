import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


MODULE_PATH = Path(__file__).resolve().parents[1] / "prepare_qat_replay_exclusion.py"
SPEC = importlib.util.spec_from_file_location("prepare_qat_replay_exclusion", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


def position_id(number: int) -> str:
    return f"sha256:{number:064x}"


class PrepareQatReplayExclusionTests(unittest.TestCase):
    def test_builds_disjoint_sorted_union_without_holdout_labels(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            selection = root / "selection.jsonl"
            policy = root / "policy.txt"
            protected = root / "protected.txt"
            selection.write_text(
                json.dumps(
                    {
                        "schema": "shogi-sibling-v1",
                        "position_id": position_id(3),
                        "child_position_id": position_id(4),
                        "cp": 123,
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            policy.write_text(position_id(1) + "\n", encoding="ascii")
            protected.write_text(position_id(2) + "\n", encoding="ascii")

            raw, receipt = MODULE.build_replay_exclusion(
                str(selection), str(policy), str(protected)
            )

            self.assertEqual(
                raw,
                "".join(f"{position_id(index)}\n" for index in range(1, 5)).encode(),
            )
            self.assertEqual(receipt["output"]["count"], 4)
            self.assertEqual(receipt["selection"]["records"], 1)
            self.assertNotIn("cp", json.dumps(receipt))

    def test_rejects_cross_component_overlap(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shared = position_id(5)
            selection = root / "selection.jsonl"
            policy = root / "policy.txt"
            protected = root / "protected.txt"
            selection.write_text(
                json.dumps(
                    {
                        "schema": "shogi-sibling-v1",
                        "position_id": shared,
                        "child_position_id": position_id(6),
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            policy.write_text(shared + "\n", encoding="ascii")
            protected.write_text(position_id(7) + "\n", encoding="ascii")

            with self.assertRaisesRegex(ValueError, "semantic overlap"):
                MODULE.build_replay_exclusion(
                    str(selection), str(policy), str(protected)
                )

    def test_rejects_noncanonical_id_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            selection = root / "selection.jsonl"
            policy = root / "policy.txt"
            protected = root / "protected.txt"
            selection.write_text(
                json.dumps(
                    {
                        "schema": "shogi-sibling-v1",
                        "position_id": position_id(3),
                        "child_position_id": position_id(4),
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            policy.write_text(position_id(2) + "\n" + position_id(1) + "\n")
            protected.write_text(position_id(5) + "\n")

            with self.assertRaisesRegex(ValueError, "sorted and unique"):
                MODULE.build_replay_exclusion(
                    str(selection), str(policy), str(protected)
                )


if __name__ == "__main__":
    unittest.main()
