from __future__ import annotations

import copy
import hashlib
import inspect
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
import uuid


ML_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = ML_DIR.parent
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import build_direct_teacher_halfkp81_v4_fresh_openings as BUILDER  # noqa: E402
import direct_teacher_halfkp81_v4_fresh_screen as SCREEN  # noqa: E402
from nnue_fixed_time_gate import ChildResult  # noqa: E402


MANIFEST_PATH = REPO_ROOT / SCREEN.OPENING_MANIFEST_PATH


def _controller_identity() -> dict:
    path = REPO_ROOT / SCREEN.CONTROLLER_PATH
    raw = path.read_bytes()
    return {
        "path": SCREEN.CONTROLLER_PATH,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


def _manifest() -> dict:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def _plan() -> dict:
    manifest = _manifest()
    selected = manifest["selection"]["pairs_selected"]
    return {
        "schema": SCREEN.PLAN_SCHEMA,
        "status": "formal-v4-pass-bound-fresh-paired56-ready",
        "source_revision": "a" * 40,
        "inputs": {
            "v4_protocol": copy.deepcopy(SCREEN.V4.EXPECTED_PROTOCOL_IDENTITY),
            "v4_static_result": copy.deepcopy(SCREEN.EXPECTED_STATIC_RESULT),
            "fresh_opening_manifest": copy.deepcopy(SCREEN.EXPECTED_OPENING_MANIFEST),
        },
        "assets": {
            "candidate_weights": copy.deepcopy(SCREEN.EXPECTED_CANDIDATE),
            "initializer_weights": copy.deepcopy(SCREEN.EXPECTED_INITIALIZER),
            "research_wasm": copy.deepcopy(SCREEN.EXPECTED_RUNTIME),
            "match_harness": copy.deepcopy(SCREEN.EXPECTED_HARNESS),
            "standalone_match_bundle": copy.deepcopy(SCREEN.EXPECTED_BUNDLE),
            "node_executable": copy.deepcopy(SCREEN.EXPECTED_NODE),
            "controller": _controller_identity(),
        },
        "opponent": {
            "role": "authenticated-deployed-int16-v3-initializer",
            "same_architecture": True,
            "same_bucket_count": True,
            "candidate_buckets": 81,
            "initializer_buckets": 81,
            "old_v2_live_baseline_used": False,
        },
        "match": {
            "family": "direct-teacher-halfkp81-v4-fresh-opening-paired56",
            "namespace": (
                "direct-teacher-halfkp81-v4-robust-adjudication-" "fresh-paired56-v1"
            ),
            "pairs": 28,
            "games": 56,
            "games_per_pair": 2,
            "colors": ["candidate-sente", "candidate-gote"],
            "pair_workers": 12,
            "milliseconds_per_move": 1_500,
            "maximum_plies": 512,
            "opening_book": False,
            "external_mate_solver": False,
            "fallback": False,
            "pair_seeds": [item["seed"] for item in selected],
            "opening_fingerprints": [item["opening_fingerprint"] for item in selected],
            "opening_set_sha256": SCREEN.EXPECTED_OPENING_SET_SHA256,
        },
        "decision": {
            "score_unit": "candidate-halfpoints-win2-draw1-loss0",
            "denominator_halfpoints": 112,
            "minimum_candidate_halfpoints": 62,
            "futility_stop": (
                "allowed-only-when-current-plus-all-remaining-halfpoints-" "is-below-62"
            ),
            "technical_faults_maximum": 0,
            "technical_fault_resume_authorized": False,
            "pass_authorizes_only": ("terminal-v4-paired-result-no-expanded-no-live"),
        },
        "authority": {
            "fresh_v4_paired56_authorized": True,
            "old_v3_paired56_authorized": False,
            "optimizer_creation_authorized": False,
            "additional_training_rows": 0,
            "candidate_mutation_authorized": False,
            "expanded_stage_authorized": False,
            "live_weight_write_authorized": False,
        },
    }


def _pairs(plan: dict, results: list[str]) -> list[SCREEN.ScreenPair]:
    if len(results) % 2:
        raise AssertionError("result fixture must contain complete pairs")
    output: list[SCREEN.ScreenPair] = []
    for pair_index in range(len(results) // 2):
        output.append(
            SCREEN.ScreenPair(
                pair_index=pair_index,
                seed=plan["match"]["pair_seeds"][pair_index],
                opening_fingerprint=plan["match"]["opening_fingerprints"][pair_index],
                candidate_sente=results[pair_index * 2],
                candidate_gote=results[pair_index * 2 + 1],
                legal_moves=100,
                log_bytes=1000,
                log_sha256=f"{pair_index + 1:064x}",
                receipt_sha256=f"{pair_index + 101:064x}",
            )
        )
    return output


class DirectTeacherHalfkp81V4FreshScreenTests(unittest.TestCase):
    def setUp(self) -> None:
        original_file_identity = SCREEN._file_identity

        def portable_file_identity(
            repo_root: str | Path,
            expected: dict,
            label: str,
        ) -> dict:
            if Path(expected["path"]).is_absolute():
                return copy.deepcopy(expected)
            return original_file_identity(repo_root, expected, label)

        self.file_identity_patch = mock.patch.object(
            SCREEN,
            "_file_identity",
            side_effect=portable_file_identity,
        )
        self.file_identity_patch.start()

    def tearDown(self) -> None:
        self.file_identity_patch.stop()

    def test_tracked_manifest_binds_complete_prior_union_and_fresh_28(
        self,
    ) -> None:
        raw = MANIFEST_PATH.read_bytes()
        self.assertEqual(len(raw), 228_133)
        self.assertEqual(
            hashlib.sha256(raw).hexdigest(),
            "8ec8422303f9504306a20ea41aa1755ba8d4a336b6118bfb958d91cda2ed64b9",
        )
        manifest = SCREEN.validate_opening_manifest(
            _manifest(),
            repo_root=REPO_ROOT,
        )
        inventory = manifest["prior_opening_inventory"]
        selected = manifest["selection"]["pairs_selected"]
        self.assertEqual(inventory["union_fingerprints"], 3_302)
        tracked, snapshot = BUILDER.scan_tracked_protocol_openings(REPO_ROOT)
        self.assertEqual(snapshot, SCREEN.EXPECTED_TRACKED_PROTOCOL_SNAPSHOT)
        self.assertTrue(
            tracked.issubset(set(inventory["full_sorted_unique_fingerprints"]))
        )
        self.assertTrue(
            {
                "d9cd96d29a58a23dc88e2ef16f294f06a77384c26700af19aec897aaa74683af",
                "51575307089676c5fc2066af3b02f4681eb9ae0d56d762e0da12c9a546ef3c62",
            }.issubset(set(inventory["full_sorted_unique_fingerprints"]))
        )
        self.assertEqual(len(selected), 28)
        self.assertEqual(selected[0]["seed"], 1_300_001)
        self.assertEqual(selected[-1]["seed"], 1_300_028)
        self.assertFalse(
            set(item["opening_fingerprint"] for item in selected).intersection(
                inventory["full_sorted_unique_fingerprints"]
            )
        )
        self.assertFalse(manifest["authority"]["paired_game_1_authorized"])

    def test_manifest_rejects_prior_overlap_inventory_and_authority_drift(
        self,
    ) -> None:
        mutations = {
            "overlap": lambda value: value["selection"]["pairs_selected"][
                0
            ].__setitem__(
                "opening_fingerprint",
                value["prior_opening_inventory"]["full_sorted_unique_fingerprints"][0],
            ),
            "inventory": lambda value: value["prior_opening_inventory"].__setitem__(
                "union_fingerprints", 3_301
            ),
            "old-v3": lambda value: value["authority"].__setitem__(
                "old_v3_paired56_authorized", True
            ),
            "game-1": lambda value: value["authority"].__setitem__(
                "paired_game_1_authorized", True
            ),
            "expanded": lambda value: value["authority"].__setitem__(
                "expanded_stage_authorized", True
            ),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                changed = _manifest()
                mutate(changed)
                with self.assertRaises(SCREEN.DirectTeacherHalfkp81V4FreshScreenError):
                    SCREEN.validate_opening_manifest(
                        changed,
                        repo_root=REPO_ROOT,
                    )

    def test_builder_extracts_only_opening_fields_and_logs(self) -> None:
        with tempfile.TemporaryDirectory(
            prefix=".v4-opening-builder-",
            dir=Path.home(),
        ) as directory:
            root = Path(directory)
            (root / "receipt.json").write_text(
                json.dumps(
                    {
                        "opening_fingerprint": "1" * 64,
                        "unrelated_sha256": "2" * 64,
                        "opening_fingerprints": ["3" * 64],
                    }
                ),
                encoding="utf-8",
            )
            (root / "pair.log").write_text(
                f"game opening={'4' * 64}\n",
                encoding="utf-8",
            )
            fingerprints, receipt = BUILDER.scan_run_openings(root)
            self.assertEqual(fingerprints, {"1" * 64, "3" * 64, "4" * 64})
            self.assertEqual(receipt["root"], str(root.resolve()))
            self.assertEqual(receipt["files_with_openings"], 2)
            self.assertEqual(receipt["unique_fingerprints"], 3)

    def test_plan_accepts_only_candidate_vs_exact_81_bucket_initializer(
        self,
    ) -> None:
        plan = SCREEN.validate_plan(_plan(), repo_root=str(REPO_ROOT))
        self.assertEqual(
            plan["assets"]["initializer_weights"]["sha256"],
            "2b91060fe98c13d57341bdf0c773094c6489b7e508d6d6afd4051565dfb9b47c",
        )
        self.assertFalse(plan["opponent"]["old_v2_live_baseline_used"])
        mutations = {
            "initializer-sha": lambda value: value["assets"][
                "initializer_weights"
            ].__setitem__("sha256", "0" * 64),
            "initializer-buckets": lambda value: value["assets"][
                "initializer_weights"
            ].__setitem__("buckets", 1),
            "old-live": lambda value: value["opponent"].__setitem__(
                "old_v2_live_baseline_used", True
            ),
            "old-v3": lambda value: value["authority"].__setitem__(
                "old_v3_paired56_authorized", True
            ),
            "expanded": lambda value: value["authority"].__setitem__(
                "expanded_stage_authorized", True
            ),
            "workers": lambda value: value["match"].__setitem__("pair_workers", 13),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                changed = _plan()
                mutate(changed)
                with self.assertRaises(SCREEN.DirectTeacherHalfkp81V4FreshScreenError):
                    SCREEN.validate_plan(changed, repo_root=str(REPO_ROOT))

    def test_exact_62_boundary_passes_without_expanded_or_live_authority(
        self,
    ) -> None:
        plan = _plan()
        results = ["win"] * 31 + ["loss"] * 25
        result = SCREEN.analyze_screen(plan, _pairs(plan, results))
        self.assertEqual(
            result["status"],
            "passed-62-of-112-terminal-v4-paired-result",
        )
        self.assertEqual(result["candidate_halfpoints"], 62)
        self.assertTrue(result["candidate_stronger_in_this_screen"])
        self.assertTrue(result["first_playing_strength_evidence"])
        self.assertFalse(result["authority"]["expanded_stage_authorized"])
        self.assertFalse(result["authority"]["live_weight_write_authorized"])
        self.assertFalse(result["authority"]["old_v3_paired56_authorized"])

    def test_complete_miss_futility_and_fault_all_fail_closed(self) -> None:
        plan = _plan()
        complete = SCREEN.analyze_screen(
            plan,
            _pairs(plan, ["win"] * 30 + ["loss"] * 26),
        )
        self.assertEqual(
            complete["status"],
            "failed-strength-complete-v4-family-closed",
        )
        futility = SCREEN.analyze_screen(
            plan,
            _pairs(plan, ["loss"] * 32),
        )
        self.assertEqual(
            futility["status"],
            "failed-strength-futility-v4-family-closed",
        )
        fault = SCREEN.analyze_screen(
            plan,
            _pairs(plan, ["win", "loss"]),
            technical_faults=1,
        )
        self.assertEqual(
            fault["status"],
            "technical-fault-v4-family-closed-no-strength-conclusion",
        )
        self.assertFalse(fault["strength_conclusion_allowed"])
        self.assertFalse(fault["authority"]["technical_fault_resume_authorized"])
        for result in (complete, futility, fault):
            self.assertFalse(result["authority"]["expanded_stage_authorized"])
            self.assertFalse(result["authority"]["live_weight_write_authorized"])

    def test_subprocess_uses_initializer_not_live_and_both_81_buckets(
        self,
    ) -> None:
        self.assertNotIn("executor", inspect.signature(SCREEN.run_screen).parameters)

        def fake_executor(
            _repo_root: str | Path,
            _plan_value: dict,
            _pair_index: int,
            _seed: int,
        ) -> ChildResult:
            return ChildResult(0, b"forged", b"")

        with self.assertRaises(SCREEN.DirectTeacherHalfkp81V4FreshScreenError):
            SCREEN._run_screen_core(
                repo_root=str(REPO_ROOT),
                plan_path=SCREEN.PLAN_PATH,
                output_dir=SCREEN.RUN_DIRECTORY,
                executor=fake_executor,
                production=True,
            )
        completed = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout=b"pair-output",
            stderr=b"",
        )
        with (
            mock.patch.object(
                SCREEN.subprocess,
                "run",
                return_value=completed,
            ) as run,
            mock.patch.object(
                SCREEN,
                "_authenticate_node_executable",
                return_value=copy.deepcopy(SCREEN.EXPECTED_NODE),
            ),
            mock.patch.dict(os.environ, {"NODE": "/tmp/fake-node"}),
        ):
            child = SCREEN.execute_pair_subprocess(REPO_ROOT, _plan(), 0, 1_300_001)
        self.assertEqual(child.returncode, 0)
        command = run.call_args.args[0]
        self.assertEqual(command[0], SCREEN.NODE_PATH)
        self.assertTrue(command[1].startswith("/dev/fd/"))
        self.assertNotIn("tsx/cjs", command)
        self.assertNotIn("/tmp/fake-node", command)
        vs_index = command.index("--vs")
        self.assertEqual(
            command[vs_index + 1],
            SCREEN.EXPECTED_INITIALIZER["path"],
        )
        self.assertNotIn("live-weights", " ".join(command))
        self.assertEqual(
            command[command.index("--buckets-a") + 1],
            "81",
        )
        self.assertEqual(
            command[command.index("--buckets-b") + 1],
            "81",
        )
        self.assertEqual(run.call_args.kwargs["env"], {"PATH": "/usr/bin:/bin"})
        self.assertEqual(len(run.call_args.kwargs["pass_fds"]), 1)

    def test_zero_move_transcript_and_distinct_faults_cannot_forge_pass(
        self,
    ) -> None:
        plan = _plan()
        forged = _pairs(plan, ["win", "win"])
        forged[0] = SCREEN.ScreenPair(
            **{**forged[0].__dict__, "legal_moves": 0},
        )
        with self.assertRaises(SCREEN.DirectTeacherHalfkp81V4FreshScreenError):
            SCREEN.analyze_screen(plan, forged)

        first = SCREEN._seal_technical_fault(
            plan_sha256="5" * 64,
            pair_index=0,
            seed=1_300_001,
            stage="subprocess",
            error=SCREEN.DirectTeacherHalfkp81V4FreshScreenError("fault"),
            child=ChildResult(2, b"A", b"X"),
        )
        second = SCREEN._seal_technical_fault(
            plan_sha256="5" * 64,
            pair_index=0,
            seed=1_300_001,
            stage="subprocess",
            error=SCREEN.DirectTeacherHalfkp81V4FreshScreenError("fault"),
            child=ChildResult(99, b"B", b"Y"),
        )
        self.assertNotEqual(first["receipt_sha256"], second["receipt_sha256"])
        self.assertNotEqual(
            first["child"]["stdout_sha256"],
            second["child"]["stdout_sha256"],
        )

    def test_faulted_run_consumes_one_shot_directory_and_cannot_resume(
        self,
    ) -> None:
        plan = _plan()
        plan_sha = "5" * 64
        research_root = Path.home() / ".codex" / "shogi-runs"
        research_root.mkdir(parents=True, exist_ok=True)
        output = research_root / f"v4-screen-test-{uuid.uuid4().hex}"

        def fault_executor(
            _repo_root: str | Path,
            _plan_value: dict,
            _pair_index: int,
            _seed: int,
        ) -> ChildResult:
            return ChildResult(2, b"", b"synthetic-fault")

        try:
            with (
                mock.patch.object(
                    SCREEN,
                    "_authenticate_plan",
                    return_value=(plan, plan_sha),
                ),
                mock.patch.object(
                    SCREEN,
                    "_reauthenticate_after_games",
                ),
            ):
                result = SCREEN._run_screen_core(
                    repo_root=str(REPO_ROOT),
                    plan_path=SCREEN.PLAN_PATH,
                    output_dir=str(output),
                    executor=fault_executor,
                    production=False,
                )
                self.assertEqual(
                    result["status"],
                    "technical-fault-v4-family-closed-no-strength-conclusion",
                )
                self.assertTrue((output / "result.json").is_file())
                self.assertTrue((output / "pairs" / "pair-0000.fault.stdout").is_file())
                self.assertTrue((output / "pairs" / "pair-0000.fault.stderr").is_file())
                self.assertTrue((output / "pairs" / "pair-0000.fault.json").is_file())
                self.assertEqual(
                    os.stat(output / "result.json").st_mode & 0o777,
                    0o600,
                )
                with self.assertRaises(SCREEN.DirectTeacherHalfkp81V4FreshScreenError):
                    SCREEN._run_screen_core(
                        repo_root=str(REPO_ROOT),
                        plan_path=SCREEN.PLAN_PATH,
                        output_dir=str(output),
                        executor=fault_executor,
                        production=False,
                    )
        finally:
            shutil.rmtree(output, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
