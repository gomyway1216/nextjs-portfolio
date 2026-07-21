import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


MODULE_PATH = Path(__file__).resolve().parents[1] / "enrich_wdl_outcomes.py"
SPEC = importlib.util.spec_from_file_location("enrich_wdl_outcomes", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


def game_id(number: int) -> str:
    return f"sha256:{number:064x}"


def csa(*statements: str) -> bytes:
    return ("\n".join(("V2.2", "N+black", "N-white", "PI", "+", *statements)) + "\n").encode()


class EnrichWdlOutcomesTests(unittest.TestCase):
    def make_raw_lock(self, root: Path, games):
        objects = root / "objects"
        objects.mkdir(parents=True)
        index = []
        identities = []
        for number, raw in enumerate(games, start=1):
            digest = hashlib.sha256(raw).hexdigest()
            object_path = objects / digest
            object_path.write_bytes(raw)
            identity = {
                "digest": digest,
                "dataset_game_id": MODULE.dataset_game_id_from_sha256(digest),
                "raw_index_game_id": game_id(number),
                "raw": raw,
            }
            identities.append(identity)
            index.append(
                {
                    "bytes": len(raw),
                    "game_id": identity["raw_index_game_id"],
                    "object": str(object_path.relative_to(root)),
                    "sha256": digest,
                    "url": f"https://example.invalid/{number}.csa",
                }
            )
        manifest = root / "manifest.json"
        manifest.write_text(json.dumps({"csa_index": index}) + "\n", encoding="utf-8")
        return manifest, identities

    def teacher_row(self, identity, side: str, split="train"):
        return {
            "schema": "shogi-floodgate-scratch-warm-teacher-v1",
            "split": split,
            "game_id": identity["dataset_game_id"],
            "game_sha256": identity["digest"],
            "position_id": f"position-{side}-{split}",
            "sfen": f"lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL {side} - 1",
            "ply": 20,
            "played_move": "7g7f",
            "cp": 0,
        }

    def run_enrichment(self, root: Path, manifest: Path, rows):
        source = root / "teacher.jsonl"
        source.write_text(
            "".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8"
        )
        output = root / "teacher-wdl.jsonl"
        evidence = root / "teacher-wdl.manifest.json"
        result = MODULE.enrich_dataset(
            str(source), str(manifest), str(root), str(output), str(evidence)
        )
        decoded = [json.loads(line) for line in output.read_text().splitlines()]
        return result, decoded, output, evidence

    def test_streams_black_white_and_draw_with_perspective_flip(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest, games = self.make_raw_lock(
                root,
                [
                    csa("+7776FU", "%TORYO"),
                    csa("+7776FU", "-3334FU", "%SENNICHITE"),
                    csa("+7776FU", "-3334FU", "%KACHI"),
                    csa("+7776FU", "-3334FU", "%TIME_UP"),
                ],
            )
            rows = [
                self.teacher_row(games[0], "b", "train"),
                self.teacher_row(games[0], "w", "train"),
                self.teacher_row(games[1], "b", "val"),
                self.teacher_row(games[2], "b", "test"),
                self.teacher_row(games[3], "w", "test"),
            ]
            result, decoded, output, evidence = self.run_enrichment(
                root, manifest, rows
            )

            self.assertEqual(
                [row["outcome"] for row in decoded], [1.0, 0.0, 0.5, 1.0, 1.0]
            )
            self.assertEqual(
                [(row["split"], row["game_id"]) for row in decoded],
                [(row["split"], row["game_id"]) for row in rows],
            )
            self.assertEqual(result["counts"]["unique_games"], 4)
            self.assertEqual(result["counts"]["row_outcomes"], {"draw": 1, "loss": 1, "win": 3})
            self.assertEqual(result["counts"]["terminal_games"]["KACHI"], 1)
            self.assertEqual(result["output"]["sha256"], hashlib.sha256(output.read_bytes()).hexdigest())
            self.assertEqual(json.loads(evidence.read_text())["output"], result["output"])

    def test_real_first_large_scratch_game_identity_derivation(self):
        digest = "6662b439d2a75f59193953e6abd8af4f88424fd0dc65e492236729826a917b01"
        self.assertEqual(
            MODULE.dataset_game_id_from_sha256(digest),
            "sha256:dd025c1817f0b993dabac0e6a61cbdbfd4c2528a1c46fbd900819c0dc4561399",
        )

    def test_fails_closed_on_missing_join_collision_and_existing_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest, games = self.make_raw_lock(root, [csa("+7776FU", "%TORYO")])
            missing = dict(self.teacher_row(games[0], "b"))
            missing["game_sha256"] = "f" * 64
            with self.assertRaisesRegex(ValueError, "absent from csa_index"):
                self.run_enrichment(root, manifest, [missing])

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest, games = self.make_raw_lock(root, [csa("+7776FU", "%TORYO")])
            parsed = json.loads(manifest.read_text())
            parsed["csa_index"].append(dict(parsed["csa_index"][0]))
            manifest.write_text(json.dumps(parsed) + "\n")
            with self.assertRaisesRegex(ValueError, "ambiguous/colliding"):
                self.run_enrichment(root, manifest, [self.teacher_row(games[0], "b")])

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest, games = self.make_raw_lock(root, [csa("+7776FU", "%TORYO")])
            source = root / "teacher.jsonl"
            source.write_text(json.dumps(self.teacher_row(games[0], "b")) + "\n")
            output = root / "teacher-wdl.jsonl"
            output.write_text("do not replace\n")
            with self.assertRaisesRegex(ValueError, "refusing to overwrite"):
                MODULE.enrich_dataset(
                    str(source),
                    str(manifest),
                    str(root),
                    str(output),
                    str(root / "evidence.json"),
                )
            self.assertEqual(output.read_text(), "do not replace\n")

    def test_rejects_tampered_object_and_ambiguous_row_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest, games = self.make_raw_lock(root, [csa("+7776FU", "%TORYO")])
            (root / "objects" / games[0]["digest"]).write_bytes(b"tampered")
            with self.assertRaisesRegex(ValueError, "identity mismatch"):
                self.run_enrichment(root, manifest, [self.teacher_row(games[0], "b")])

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest, games = self.make_raw_lock(root, [csa("+7776FU", "%TORYO")])
            row = self.teacher_row(games[0], "b")
            row["side_to_move"] = "w"
            with self.assertRaisesRegex(ValueError, "differs from SFEN"):
                self.run_enrichment(root, manifest, [row])

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest, games = self.make_raw_lock(root, [csa("+7776FU", "%TORYO")])
            row = self.teacher_row(games[0], "b")
            row["schema"] = "shogi-sibling-v1"
            with self.assertRaisesRegex(ValueError, "scratch-warm-teacher"):
                self.run_enrichment(root, manifest, [row])


if __name__ == "__main__":
    unittest.main()
