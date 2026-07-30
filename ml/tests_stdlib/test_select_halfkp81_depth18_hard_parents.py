import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import random
import sys
import tempfile
import unittest
from unittest import mock


ML_DIR = Path(__file__).resolve().parents[1]
MODULE_PATH = ML_DIR / "select_halfkp81_depth18_hard_parents.py"
SPEC = importlib.util.spec_from_file_location(
    "select_halfkp81_depth18_hard_parents", MODULE_PATH
)
assert SPEC is not None and SPEC.loader is not None
selector = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = selector
SPEC.loader.exec_module(selector)


SMALL_PLAN = selector.SelectionPlan(
    phase_quotas={"opening": 4, "mid": 8, "late": 8},
    role_sizes={"fit": 12, "tune": 4, "sealed": 4},
)
PHASE_PLIES = {"opening": 20, "mid": 60, "late": 100}


def digest(domain, number):
    return hashlib.sha256(f"{domain}:{number}".encode()).hexdigest()


def position_id(sfen):
    canonical = " ".join(sfen.split()[:3])
    return "sha256:" + hashlib.sha256(
        f"sfen-v1\0{canonical}".encode()
    ).hexdigest()


def row(number, phase, side, *, game=None, cp=0, outcome=0.5, rating=4_000, legal=20):
    ply = PHASE_PLIES[phase]
    # A unique board token is enough for semantic-ID contract tests; the
    # selector validates the SFEN envelope/identity, not shogi legality.
    board = f"{number + 1}/9/9/9/9/9/9/9/9"
    sfen = f"{board} {side} - {ply + 1}"
    game_number = number if game is None else game
    value = {
        "schema": selector.INPUT_SCHEMA,
        "split": "train",
        "game_id": "sha256:" + digest("game", game_number),
        "game_sha256": digest("game-file", game_number),
        "position_id": position_id(sfen),
        "sfen": sfen,
        "ply": ply,
        "played_move": "7g7f",
        "ratings": {"sente": rating, "gote": rating + 10},
        "cp": cp,
        "bestmove": "7g7f",
        "depth": 12,
        "outcome": outcome,
    }
    if legal is not None:
        value["legal_move_count"] = legal
    return value


def eligible_rows():
    values = []
    number = 0
    for phase in PHASE_PLIES:
        for side in selector.SIDES:
            for _ in range(12):
                values.append(row(number, phase, side))
                number += 1
    return values


class HardParentSelectorTests(unittest.TestCase):
    def test_formal_contract_constants(self):
        self.assertEqual(selector.SOURCE_ROWS, 800_000)
        self.assertEqual(
            selector.SOURCE_SHA256,
            "c83241eb95f3568fe75a95d903e348591af49daf07d23db1db266e9be14a633d",
        )
        self.assertEqual(sum(selector.FORMAL_PHASE_QUOTAS.values()), 8_192)
        self.assertEqual(
            selector.FORMAL_ROLE_SIZES,
            {"fit": 6_144, "tune": 1_024, "sealed": 1_024},
        )

    def test_deterministic_exact_phase_side_and_role_side_quotas(self):
        rows = eligible_rows()
        first, _, _ = selector.select_hard_parents(
            rows, overlap_ids=set(), require_legal_move_count=True, plan=SMALL_PLAN
        )
        shuffled = copy.deepcopy(rows)
        random.Random(731).shuffle(shuffled)
        second, _, _ = selector.select_hard_parents(
            shuffled, overlap_ids=set(), require_legal_move_count=True, plan=SMALL_PLAN
        )
        self.assertEqual(first, second)

        phase_side = {
            phase: {side: 0 for side in selector.SIDES}
            for phase in SMALL_PLAN.phase_quotas
        }
        role_side = {
            role: {side: 0 for side in selector.SIDES}
            for role in SMALL_PLAN.role_sizes
        }
        games = set()
        role_games = {role: set() for role in SMALL_PLAN.role_sizes}
        for selected in first:
            phase_side[selected["phase"]][selected["side_to_move"]] += 1
            role_side[selected["role"]][selected["side_to_move"]] += 1
            self.assertNotIn(selected["game_id"], games)
            games.add(selected["game_id"])
            role_games[selected["role"]].add(selected["game_id"])
            self.assertEqual(selected["source_game_id"], selected["game_id"])
            self.assertEqual(selected["recorded_move"], "7g7f")
            self.assertEqual(
                selected["old_depth12_signals_usage"],
                "selection_only_never_teacher_target",
            )
            self.assertNotIn("teacher_target", selected)
        self.assertEqual(
            phase_side,
            {
                phase: {side: quota // 2 for side in selector.SIDES}
                for phase, quota in SMALL_PLAN.phase_quotas.items()
            },
        )
        self.assertEqual(
            role_side,
            {
                role: {side: size // 2 for side in selector.SIDES}
                for role, size in SMALL_PLAN.role_sizes.items()
            },
        )
        self.assertFalse(role_games["fit"] & role_games["tune"])
        self.assertFalse(role_games["fit"] & role_games["sealed"])
        self.assertFalse(role_games["tune"] & role_games["sealed"])

    def test_exclusions_and_hardness_contract(self):
        rows = eligible_rows()
        overlap = rows[0]["position_id"]
        rows.extend(
            [
                row(100, "opening", "b", cp=1_001),
                row(101, "opening", "b", legal=1),
                row(102, "opening", "b", cp=20),
            ]
        )
        rows[-1]["mate"] = 3
        selected, rejected, _ = selector.select_hard_parents(
            rows,
            overlap_ids={overlap},
            require_legal_move_count=True,
            plan=SMALL_PLAN,
        )
        selected_ids = {value["position_id"] for value in selected}
        for excluded in (overlap, *(value["position_id"] for value in rows[-3:])):
            self.assertNotIn(excluded, selected_ids)
        self.assertEqual(rejected["semantic_overlap"], 1)
        self.assertEqual(rejected["cp_out_of_range"], 1)
        self.assertEqual(rejected["forced_move"], 1)
        self.assertEqual(rejected["mate_score"], 1)

        high_surprise = row(
            200, "opening", "b", cp=900, outcome=0, rating=3_000
        )
        low_surprise = row(
            201, "opening", "b", cp=0, outcome=0.5, rating=4_000
        )
        high_candidate = selector._candidate_from_record(
            high_surprise,
            line_number=1,
            overlap_ids=set(),
            require_legal_move_count=True,
        )[0]
        low_candidate = selector._candidate_from_record(
            low_surprise,
            line_number=2,
            overlap_ids=set(),
            require_legal_move_count=True,
        )[0]
        self.assertLess(
            selector._hardness_key(high_candidate),
            selector._hardness_key(low_candidate),
        )

        equal_surprise_high_rating = row(
            202, "opening", "b", cp=0, outcome=0.5, rating=5_000
        )
        rated_candidate = selector._candidate_from_record(
            equal_surprise_high_rating,
            line_number=3,
            overlap_ids=set(),
            require_legal_move_count=True,
        )[0]
        self.assertLess(
            selector._hardness_key(rated_candidate),
            selector._hardness_key(low_candidate),
        )

    def test_position_id_depth_and_legal_count_fail_closed(self):
        rows = eligible_rows()
        rows[0]["position_id"] = "sha256:" + "0" * 64
        with self.assertRaisesRegex(selector.SelectionError, "semantic SFEN"):
            selector.select_hard_parents(
                rows,
                overlap_ids=set(),
                require_legal_move_count=True,
                plan=SMALL_PLAN,
            )

        rows = eligible_rows()
        rows[0]["depth"] = 6
        with self.assertRaisesRegex(selector.SelectionError, "depth-12"):
            selector.select_hard_parents(
                rows,
                overlap_ids=set(),
                require_legal_move_count=True,
                plan=SMALL_PLAN,
            )

        rows = eligible_rows()
        del rows[0]["legal_move_count"]
        with self.assertRaisesRegex(selector.SelectionError, "move count is required"):
            selector.select_hard_parents(
                rows,
                overlap_ids=set(),
                require_legal_move_count=True,
                plan=SMALL_PLAN,
            )

    def test_duplicate_game_selection_and_insufficiency_fail_closed(self):
        rows = eligible_rows()
        rows.append(copy.deepcopy(rows[0]))
        rows[-1]["sfen"] = rows[-1]["sfen"].replace(
            "/9/9/9/9/9/9/9/9", "/8k/9/9/9/9/9/9/9/9"
        )
        rows[-1]["position_id"] = position_id(rows[-1]["sfen"])
        # Duplicate game rows are valid source data, but only one may be selected.
        selected, _, _ = selector.select_hard_parents(
            rows, overlap_ids=set(), require_legal_move_count=True, plan=SMALL_PLAN
        )
        self.assertEqual(len({value["game_id"] for value in selected}), len(selected))

        insufficient = [
            row(number, "opening", "b")
            for number in range(SMALL_PLAN.phase_quotas["opening"] // 2)
        ]
        with self.assertRaisesRegex(selector.SelectionError, "insufficient eligible"):
            selector.select_hard_parents(
                insufficient,
                overlap_ids=set(),
                require_legal_move_count=True,
                plan=SMALL_PLAN,
            )

    def test_duplicate_position_fails_closed(self):
        rows = eligible_rows()
        rows.append(copy.deepcopy(rows[0]))
        with self.assertRaisesRegex(selector.SelectionError, "duplicate position_id"):
            selector.select_hard_parents(
                rows,
                overlap_ids=set(),
                require_legal_move_count=True,
                plan=SMALL_PLAN,
            )

    def test_complete_overlap_and_legal_manifest_bindings_fail_closed(self):
        with self.assertRaisesRegex(
            selector.SelectionError, "complete overlap-ID input is required"
        ):
            selector._load_overlap_ids([])

        enriched_identity = {
            "path": "/tmp/enriched.jsonl",
            "bytes": 123,
            "sha256": "1" * 64,
            "rows": selector.SOURCE_ROWS,
        }
        manifest = {
            "schema": selector.LEGAL_MANIFEST_SCHEMA,
            "status": selector.LEGAL_MANIFEST_STATUS,
            "tool": None,
            "rules_closure": [],
            "input": {
                "path": selector.SOURCE_PATH,
                "bytes": selector.SOURCE_BYTES,
                "sha256": selector.SOURCE_SHA256,
                "rows": selector.SOURCE_ROWS,
                "row_schema": selector.INPUT_SCHEMA,
                "held_read_only_descriptor": True,
                "stable_double_read": True,
            },
            "output": {
                "file": "enriched.jsonl",
                "bytes": enriched_identity["bytes"],
                "sha256": enriched_identity["sha256"],
                "rows": enriched_identity["rows"],
                "row_schema": selector.INPUT_SCHEMA,
                "added_field": "legal_move_count",
                "input_order_preserved": True,
            },
            "accounting": {
                "side_to_move_b": 402_090,
                "side_to_move_w": 397_910,
                "legal_move_count_at_most_one": 100,
                "legal_move_count_zero": 40,
                "legal_move_count_one": 60,
            },
            "validation": {
                "canonical_jsonl": True,
                "canonical_sfen_roundtrip": True,
                "ply_matches_move_number_minus_one": True,
                "position_id_matches_semantic_sfen": True,
                "recorded_moves_legal": True,
                "duplicate_position_ids": 0,
                "rules_authority": "ml/shogi-sfen.ts#rulesCompleteLegalMoves",
                "source_jsonl_contract": "fixed-schema-compact-canonical-v1",
            },
            "publication": "create-only-temp-fsync-hardlink-manifest-last-v1",
        }
        repo_root = MODULE_PATH.resolve().parent.parent
        closure = [
            {
                "path": str((repo_root / relative_path).resolve()),
                "relative_path": relative_path,
                **expected,
                "held_read_only_descriptor": True,
                "stable_double_read": True,
            }
            for relative_path, expected in (
                selector.LEGAL_RULES_CLOSURE_EXPECTATIONS.items()
            )
        ]
        manifest["tool"] = closure[0]
        manifest["rules_closure"] = closure
        raw = selector._canonical_json(manifest)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "legal-manifest.json"
            path.write_bytes(raw)
            identity = selector._verify_legal_manifest(
                path,
                raw,
                expected_bytes=len(raw),
                expected_sha256=hashlib.sha256(raw).hexdigest(),
                input_identity=enriched_identity,
            )
            self.assertEqual(identity["sha256"], hashlib.sha256(raw).hexdigest())
            changed = json.loads(raw)
            changed["input"]["sha256"] = "0" * 64
            changed_raw = selector._canonical_json(changed)
            with self.assertRaisesRegex(selector.SelectionError, "exact 800k source"):
                selector._verify_legal_manifest(
                    path,
                    changed_raw,
                    expected_bytes=len(changed_raw),
                    expected_sha256=hashlib.sha256(changed_raw).hexdigest(),
                    input_identity=enriched_identity,
                )
            changed = json.loads(raw)
            del changed["status"]
            changed_raw = selector._canonical_json(changed)
            with self.assertRaisesRegex(selector.SelectionError, "fields differ"):
                selector._verify_legal_manifest(
                    path,
                    changed_raw,
                    expected_bytes=len(changed_raw),
                    expected_sha256=hashlib.sha256(changed_raw).hexdigest(),
                    input_identity=enriched_identity,
                )
            for label, mutate in {
                "fabricated-tool": lambda value: value["tool"].__setitem__(
                    "sha256", "0" * 64
                ),
                "stale-rules-source": lambda value: value["rules_closure"][
                    2
                ].__setitem__("sha256", "0" * 64),
                "missing-rules-source": lambda value: value["rules_closure"].pop(),
                "self-asserted-held": lambda value: value["rules_closure"][
                    1
                ].__setitem__("stable_double_read", False),
            }.items():
                with self.subTest(label=label):
                    changed = json.loads(raw)
                    mutate(changed)
                    changed_raw = selector._canonical_json(changed)
                    with self.assertRaisesRegex(
                        selector.SelectionError,
                        "tool identity|rules closure",
                    ):
                        selector._verify_legal_manifest(
                            path,
                            changed_raw,
                            expected_bytes=len(changed_raw),
                            expected_sha256=hashlib.sha256(changed_raw).hexdigest(),
                            input_identity=enriched_identity,
                        )

    def test_partial_overlap_inventory_without_completion_manifest_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            overlap_path = root / "overlap.jsonl"
            overlap_path.write_bytes(
                selector._canonical_json({"position_id": "sha256:" + "1" * 64})
            )
            overlap_ids, overlap_identity = selector._load_overlap_ids(
                [overlap_path]
            )
            self.assertEqual(len(overlap_ids), 1)

            incomplete = selector._canonical_json(
                {
                    "schema": selector.OVERLAP_MANIFEST_SCHEMA,
                    "status": selector.OVERLAP_MANIFEST_STATUS,
                    "output": overlap_identity,
                }
            )
            manifest_path = root / "manifest.json"
            manifest_path.write_bytes(incomplete)
            with self.assertRaisesRegex(
                selector.SelectionError, "preregistered identity"
            ):
                selector._verify_overlap_manifest(
                    manifest_path,
                    incomplete,
                    expected_bytes=len(incomplete),
                    expected_sha256=hashlib.sha256(incomplete).hexdigest(),
                    overlap_identity=overlap_identity,
                )

    def test_create_only_publication_is_manifest_last_and_identity_verified(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "selection.jsonl"
            manifest = root / "selection.manifest.json"
            output_raw = b'{"position_id":"sha256:' + b"1" * 64 + b'"}\n'
            manifest_raw = b'{"schema":"test"}\n'
            real_link = os.link
            publication_order = []

            def observe_link(source, destination, **kwargs):
                publication_order.append(Path(destination))
                return real_link(source, destination, **kwargs)

            with mock.patch.object(selector.os, "link", side_effect=observe_link):
                published_output, published_manifest = (
                    selector._publish_output_then_manifest(
                        output, output_raw, manifest, manifest_raw
                    )
                )

            self.assertEqual(publication_order, [output, manifest])
            self.assertEqual(output.read_bytes(), output_raw)
            self.assertEqual(manifest.read_bytes(), manifest_raw)
            output_stat = os.stat(output, follow_symlinks=False)
            manifest_stat = os.stat(manifest, follow_symlinks=False)
            self.assertEqual(
                (published_output.device, published_output.inode),
                (output_stat.st_dev, output_stat.st_ino),
            )
            self.assertEqual(
                (published_manifest.device, published_manifest.inode),
                (manifest_stat.st_dev, manifest_stat.st_ino),
            )
            selector._verify_published_file(
                published_output, output_raw, "output JSONL"
            )
            selector._verify_published_file(
                published_manifest, manifest_raw, "output manifest"
            )

    def test_publication_rejects_existing_files_and_destination_symlinks(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "selection.jsonl"
            manifest = root / "selection.manifest.json"
            output.write_bytes(b"existing\n")
            with self.assertRaisesRegex(
                selector.SelectionError, "destination already exists"
            ):
                selector._publish_output_then_manifest(
                    output, b"new\n", manifest, b"manifest\n"
                )
            self.assertEqual(output.read_bytes(), b"existing\n")
            self.assertFalse(manifest.exists())

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "selection.jsonl"
            manifest = root / "selection.manifest.json"
            symlink_target = root / "missing-target"
            manifest.symlink_to(symlink_target)
            with self.assertRaisesRegex(
                selector.SelectionError, "destination already exists or is a symlink"
            ):
                selector._publish_output_then_manifest(
                    output, b"new\n", manifest, b"manifest\n"
                )
            self.assertFalse(output.exists())
            self.assertTrue(manifest.is_symlink())

    def test_manifest_publication_race_rolls_back_published_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "selection.jsonl"
            manifest = root / "selection.manifest.json"
            real_link = os.link

            def race_manifest(source, destination, **kwargs):
                if Path(destination) == manifest:
                    raise FileExistsError("simulated manifest publication race")
                return real_link(source, destination, **kwargs)

            with mock.patch.object(selector.os, "link", side_effect=race_manifest):
                with self.assertRaisesRegex(
                    selector.SelectionError, "destination appeared"
                ):
                    selector._publish_output_then_manifest(
                        output, b"new\n", manifest, b"manifest\n"
                    )

            self.assertFalse(os.path.lexists(output))
            self.assertFalse(os.path.lexists(manifest))

    def test_rollback_refuses_to_delete_replaced_destination(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "selection.jsonl"
            published = selector._publish_create_only(
                output, b"published\n", "output JSONL"
            )
            output.unlink()
            output.write_bytes(b"replacement\n")

            with self.assertRaisesRegex(
                selector.SelectionError, "replaced destination"
            ):
                selector._rollback_published_file(published, "output JSONL")
            self.assertEqual(output.read_bytes(), b"replacement\n")


if __name__ == "__main__":
    unittest.main()
