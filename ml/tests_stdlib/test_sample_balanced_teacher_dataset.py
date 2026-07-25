import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


MODULE_PATH = Path(__file__).resolve().parents[1] / "sample_balanced_teacher_dataset.py"
SPEC = importlib.util.spec_from_file_location(
    "sample_balanced_teacher_dataset", MODULE_PATH
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


def row(number: int, side: str, split: str = "train") -> dict[str, object]:
    return {
        "schema": "shogi-floodgate-scratch-warm-teacher-v1",
        "split": split,
        "game_id": f"sha256:{number + 1000:064x}",
        "game_sha256": f"{number + 2000:064x}",
        "position_id": f"sha256:{number:064x}",
        "sfen": (
            "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/"
            f"PPPPPPPPP/1B5R1/LNSGKGSNL {side} - 1"
        ),
        "ply": number,
        "played_move": "7g7f",
        "ratings": {"sente": 3000, "gote": 3000},
        "cp": number,
        "bestmove": "7g7f",
        "depth": 12,
    }


def write_rows(path: Path, rows) -> str:
    raw = "".join(
        json.dumps(item, separators=(",", ":"), sort_keys=True) + "\n"
        for item in rows
    ).encode()
    path.write_bytes(raw)
    return hashlib.sha256(raw).hexdigest()


class BalancedTeacherDatasetTests(unittest.TestCase):
    def run_sample(self, root: Path, source: Path, digest: str, suffix: str):
        output = root / f"sample-{suffix}.jsonl"
        manifest = root / f"sample-{suffix}.manifest.json"
        result = MODULE.sample_balanced_teacher_dataset(
            str(source),
            str(output),
            str(manifest),
            expected_input_sha256=digest,
            expected_split="train",
            per_side=2,
            seed="balanced-pure-v1",
        )
        return result, output, manifest

    def test_selects_exact_equal_sides_deterministically(self):
        rows = [row(i, "b") for i in range(1, 6)] + [
            row(i, "w") for i in range(6, 12)
        ]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first_source = root / "first.jsonl"
            second_source = root / "second.jsonl"
            first_sha = write_rows(first_source, rows)
            second_sha = write_rows(second_source, reversed(rows))

            first, first_output, first_manifest = self.run_sample(
                root, first_source, first_sha, "first"
            )
            second, second_output, _ = self.run_sample(
                root, second_source, second_sha, "second"
            )

            self.assertEqual(first_output.read_bytes(), second_output.read_bytes())
            decoded = [
                json.loads(line) for line in first_output.read_text().splitlines()
            ]
            sides = [item["sfen"].split()[1] for item in decoded]
            self.assertEqual(sides.count("b"), 2)
            self.assertEqual(sides.count("w"), 2)
            self.assertEqual(first["input"]["available_by_side"], {"b": 5, "w": 6})
            self.assertEqual(first["output"]["selected_by_side"], {"b": 2, "w": 2})
            self.assertEqual(
                json.loads(first_manifest.read_text())["output"]["sha256"],
                first["output"]["sha256"],
            )
            self.assertEqual(first["output"]["sha256"], second["output"]["sha256"])

    def test_fails_closed_on_identity_shortage_duplicate_and_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.jsonl"
            digest = write_rows(source, [row(1, "b"), row(2, "b"), row(3, "w")])
            with self.assertRaisesRegex(ValueError, "side w has 1 rows"):
                self.run_sample(root, source, digest, "short")
            self.assertFalse((root / "sample-short.jsonl").exists())

            with self.assertRaisesRegex(ValueError, "input identity mismatch"):
                self.run_sample(root, source, "f" * 64, "identity")

            duplicate = root / "duplicate.jsonl"
            duplicate_digest = write_rows(
                duplicate, [row(1, "b"), row(1, "b"), row(2, "w"), row(3, "w")]
            )
            with self.assertRaisesRegex(ValueError, "duplicate position_id"):
                self.run_sample(root, duplicate, duplicate_digest, "duplicate")

            enough = root / "enough.jsonl"
            enough_digest = write_rows(
                enough,
                [row(1, "b"), row(2, "b"), row(3, "w"), row(4, "w")],
            )
            (root / "sample-existing.jsonl").write_text("preserve\n")
            with self.assertRaisesRegex(ValueError, "refusing to overwrite"):
                self.run_sample(root, enough, enough_digest, "existing")
            self.assertEqual(
                (root / "sample-existing.jsonl").read_text(), "preserve\n"
            )


if __name__ == "__main__":
    unittest.main()
