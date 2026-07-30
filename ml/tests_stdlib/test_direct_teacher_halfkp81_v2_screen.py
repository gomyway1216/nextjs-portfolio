from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
import shutil
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock


ML_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = ML_DIR.parent
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import direct_teacher_halfkp81_v2_screen as SCREEN  # noqa: E402
import direct_teacher_halfkp81_v2_protocol as PROTOCOL  # noqa: E402
from nnue_fixed_time_gate import ChildResult  # noqa: E402


OPENINGS_PATH = ML_DIR / "protocols" / "direct-teacher-halfkp81-v2-screen-openings.json"


def _fingerprint(seed: int) -> str:
    return hashlib.sha256(f"synthetic-opening-{seed}".encode()).hexdigest()


def _identity(marker: str, *, schema: str | None = None, buckets: int | None = None):
    value = {
        "path": f"/synthetic/{marker}",
        "bytes": len(marker) + 1,
        "sha256": hashlib.sha256(marker.encode()).hexdigest(),
    }
    if schema is not None:
        value["schema"] = schema
    if buckets is not None:
        value["buckets"] = buckets
    return value


def _plan() -> dict:
    fingerprints = [
        _fingerprint(seed)
        for seed in range(
            SCREEN.PAIR_SEED_START,
            SCREEN.PAIR_SEED_START + SCREEN.PAIR_COUNT,
        )
    ]
    identity = {
        "path": "synthetic.bin",
        "bytes": 1,
        "sha256": "a" * 64,
    }
    return {
        "schema": SCREEN.SCREEN_PLAN_SCHEMA,
        "status": SCREEN.PLAN_STATUS,
        "inputs": {},
        "assets": {
            "candidate_weights": {
                **identity,
                "sha256": "b" * 64,
                "buckets": SCREEN.CANDIDATE_BUCKETS,
            },
            "live_weights": {
                **identity,
                "sha256": "c" * 64,
                "buckets": SCREEN.LIVE_BUCKETS,
            },
            "research_wasm": dict(identity),
            "match_harness": dict(identity),
            "controller": dict(identity),
        },
        "data_firewall": {},
        "match": {
            "pairs": SCREEN.PAIR_COUNT,
            "games": SCREEN.GAME_COUNT,
            "games_per_pair": 2,
            "colors": ["candidate-sente", "candidate-gote"],
            "pair_workers": SCREEN.PAIR_WORKERS,
            "milliseconds_per_move": SCREEN.MILLISECONDS_PER_MOVE,
            "maximum_plies": SCREEN.MAXIMUM_PLIES,
            "opening_book": False,
            "external_mate_solver": False,
            "fallback": False,
            "pair_seeds": list(
                range(
                    SCREEN.PAIR_SEED_START,
                    SCREEN.PAIR_SEED_START + SCREEN.PAIR_COUNT,
                )
            ),
            "opening_fingerprints": fingerprints,
            "opening_set_sha256": SCREEN._opening_set_sha256(fingerprints),
        },
        "decision": {},
        "authority": {},
    }


def _validated_plan() -> dict:
    plan = _plan()
    plan["inputs"] = {
        "execution_plan": _identity("execution", schema=PROTOCOL.EXECUTION_PLAN_SCHEMA),
        "trainer_result": _identity("trainer", schema=SCREEN.TRAINER_SCHEMA),
        "static_sanity_result": _identity("static", schema=SCREEN.STATIC_SCHEMA),
        "runtime_sanity": _identity(
            "runtime-sanity", schema=SCREEN.RUNTIME_SANITY_SCHEMA
        ),
        "opening_manifest": _identity(
            "openings", schema=SCREEN.OPENING_MANIFEST_SCHEMA
        ),
    }
    plan["assets"]["research_wasm"]["path"] = SCREEN.RUNTIME_PATH
    plan["assets"]["match_harness"]["path"] = SCREEN.HARNESS_PATH
    plan["assets"]["controller"]["path"] = SCREEN.CONTROLLER_PATH
    plan["data_firewall"] = {
        "dataset_manifest": _identity(
            "dataset", schema=PROTOCOL.DATASET_MANIFEST_SCHEMA
        ),
        "pilot_training_tune_protected_disjoint_verified": True,
        "excluded_parent_overlap": 0,
        "excluded_position_overlap": 0,
        "excluded_child_position_overlap": 0,
        "excluded_semantic_overlap": 0,
        "cross_role_game_parent_position_child_semantic_overlap": 0,
    }
    plan["decision"] = {
        "score_unit": "candidate-halfpoints-win2-draw1-loss0",
        "denominator_halfpoints": SCREEN.DENOMINATOR_HALFPOINTS,
        "minimum_candidate_halfpoints": SCREEN.PASS_HALFPOINTS,
        "futility_stop": (
            "current candidate halfpoints plus every remaining possible "
            "halfpoint is below 62"
        ),
        "technical_faults_maximum": 0,
        "strength_failure_terminal": True,
        "technical_fault_resume_only": True,
        "pass_authorizes_only": "separately-preregistered-expanded-data-stage",
    }
    plan["authority"] = {
        "trainer_complete": True,
        "static_sanity_passed": True,
        "paired56_authorized": True,
        "expanded_stage_authorized": False,
        "live_weight_write_authorized": False,
    }
    return plan


def _pair_log(
    plan: dict,
    pair_index: int,
    first: str = "win",
    second: str = "win",
) -> bytes:
    seed = plan["match"]["pair_seeds"][pair_index]
    fingerprint = plan["match"]["opening_fingerprints"][pair_index]

    def summary(result: str) -> str:
        if result == "win":
            return "WIN NNUE-A(buckets=81) (checkmate, SENTE)"
        if result == "loss":
            return "WIN NNUE-B(buckets=1) (checkmate, GOTE)"
        return "DRAW (repetition)"

    return (
        f"=== match: synthetic (seed base {seed}), fixed-time-ms=1500, "
        "max-plies=512, tt=clear-before-each-game-retain-within-game ===\n"
        f"game 1/2: NNUE=SENTE opening={fingerprint} => {summary(first)} "
        "plies=80 time=1.0s\n"
        f"game 2/2: NNUE=GOTE opening={fingerprint} => {summary(second)} "
        "plies=81 time=1.1s\n"
        "\nresult: NNUE-A(buckets=81) 2 wins / NNUE-B(buckets=1) 0 wins / "
        "0 draws (all 161 moves legal)\n"
    ).encode()


def _screen_pair(
    plan: dict,
    pair_index: int,
    first: str,
    second: str,
) -> SCREEN.ScreenPair:
    seed = plan["match"]["pair_seeds"][pair_index]
    fingerprint = plan["match"]["opening_fingerprints"][pair_index]
    raw = _pair_log(plan, pair_index, first, second)
    return SCREEN.ScreenPair(
        pair_index=pair_index,
        seed=seed,
        opening_fingerprint=fingerprint,
        candidate_sente=first,
        candidate_gote=second,
        legal_moves=161,
        log_bytes=len(raw),
        log_sha256=hashlib.sha256(raw).hexdigest(),
        receipt_sha256=hashlib.sha256(f"receipt-{pair_index}".encode()).hexdigest(),
    )


class DirectTeacherHalfkp81V2ScreenTests(unittest.TestCase):
    def setUp(self) -> None:
        run_root = Path.home() / ".codex" / "shogi-runs"
        run_root.mkdir(parents=True, exist_ok=True)
        self.run_dir = Path(
            tempfile.mkdtemp(prefix="test-direct-teacher-v2-screen-", dir=run_root)
        )
        self.addCleanup(shutil.rmtree, self.run_dir, True)

    def test_tracked_openings_are_frozen_unique_and_prior_disjoint(self) -> None:
        value = json.loads(OPENINGS_PATH.read_text(encoding="utf-8"))
        captured = SCREEN.validate_opening_manifest(value, repo_root=REPO_ROOT)
        selected = captured["selection"]["pairs_selected"]
        self.assertEqual(
            [pair["seed"] for pair in selected],
            list(
                range(
                    SCREEN.PAIR_SEED_START,
                    SCREEN.PAIR_SEED_START + SCREEN.PAIR_COUNT,
                )
            ),
        )
        self.assertEqual(
            len({pair["opening_fingerprint"] for pair in selected}),
            SCREEN.PAIR_COUNT,
        )
        self.assertEqual(captured["selection"]["prior_inventory_overlap"], 0)
        self.assertFalse(captured["authority"]["paired_play_authorized"])

        drifted = copy.deepcopy(value)
        inventory = json.loads(
            (REPO_ROOT / SCREEN.OPENING_INVENTORY_PATH).read_text(encoding="utf-8")
        )
        drifted["selection"]["pairs_selected"][0]["opening_fingerprint"] = inventory[
            "full_enrolled_sorted_unique_fingerprints"
        ][0]
        drifted["selection"]["opening_set_sha256"] = SCREEN._opening_set_sha256(
            [
                pair["opening_fingerprint"]
                for pair in drifted["selection"]["pairs_selected"]
            ]
        )
        with self.assertRaisesRegex(
            SCREEN.DirectTeacherHalfkp81V2ScreenError,
            "repeat or overlap",
        ):
            SCREEN.validate_opening_manifest(drifted, repo_root=REPO_ROOT)

    def test_threshold_and_futility_are_strength_results_not_faults(self) -> None:
        plan = _plan()
        passing = [
            _screen_pair(
                plan,
                index,
                "win" if index < 3 else "draw",
                "win" if index < 3 else "draw",
            )
            for index in range(SCREEN.PAIR_COUNT)
        ]
        passed = SCREEN.analyze_screen(plan, passing)
        self.assertEqual(passed["candidate_halfpoints"], 62)
        self.assertEqual(passed["status"], "passed-62-of-112-expanded-stage-only")
        self.assertTrue(passed["expanded_stage_authorized"])
        self.assertFalse(passed["live_weight_write_authorized"])

        futile = [_screen_pair(plan, index, "loss", "loss") for index in range(13)]
        rejected = SCREEN.analyze_screen(plan, futile)
        self.assertEqual(rejected["maximum_possible_final_halfpoints"], 60)
        self.assertEqual(
            rejected["status"],
            "failed-strength-futility-pilot-family-closed",
        )
        self.assertTrue(rejected["strength_conclusion_allowed"])
        self.assertFalse(rejected["technical_fault_resume_authorized"])
        self.assertTrue(rejected["pilot_family_closed"])

    def test_screen_plan_fixes_assets_schedule_and_no_live_authority(self) -> None:
        plan = _validated_plan()
        captured = SCREEN.validate_screen_plan(plan)
        self.assertEqual(
            captured["match"]["pair_workers"],
            SCREEN.PAIR_WORKERS,
        )
        self.assertEqual(
            captured["match"]["maximum_plies"],
            SCREEN.MAXIMUM_PLIES,
        )
        self.assertFalse(captured["authority"]["live_weight_write_authorized"])

        drifted = copy.deepcopy(plan)
        drifted["match"]["maximum_plies"] = 511
        with self.assertRaisesRegex(
            SCREEN.DirectTeacherHalfkp81V2ScreenError,
            "match contract differs",
        ):
            SCREEN.validate_screen_plan(drifted)

    def test_pair_subprocess_command_binds_1500ms_512plies_and_both_hashes(
        self,
    ) -> None:
        plan = _plan()
        root = Path(".").resolve()
        completed = mock.Mock(returncode=0, stdout=b"ok", stderr=b"")
        with mock.patch.dict(
            "os.environ",
            {"NODE": "/fixed/node", "PATH": "/fixed/path"},
            clear=True,
        ), mock.patch(
            "direct_teacher_halfkp81_v2_screen.subprocess.run",
            return_value=completed,
        ) as run:
            result = SCREEN.execute_pair_subprocess(
                root,
                plan,
                0,
                SCREEN.PAIR_SEED_START,
            )
        command = run.call_args.args[0]
        self.assertEqual(command[0], "/fixed/node")
        self.assertEqual(
            command[command.index("--ms") + 1],
            str(SCREEN.MILLISECONDS_PER_MOVE),
        )
        self.assertEqual(
            command[command.index("--max-plies") + 1],
            str(SCREEN.MAXIMUM_PLIES),
        )
        self.assertEqual(
            command[command.index("--sha-a") + 1],
            plan["assets"]["candidate_weights"]["sha256"],
        )
        self.assertEqual(
            command[command.index("--sha-b") + 1],
            plan["assets"]["live_weights"]["sha256"],
        )
        self.assertEqual(result, ChildResult(0, b"ok", b""))

    def test_static_receipt_recomputes_all_nine_checks_and_identity_chain(self) -> None:
        protocol_identity = _identity("protocol", schema=PROTOCOL.PROTOCOL_SCHEMA)
        execution_identity = _identity(
            "execution", schema=PROTOCOL.EXECUTION_PLAN_SCHEMA
        )
        dataset_identity = _identity("dataset", schema=PROTOCOL.DATASET_MANIFEST_SCHEMA)
        trainer_identity = _identity("trainer", schema=SCREEN.TRAINER_SCHEMA)
        initializer = _identity("initializer")
        live = _identity("live")
        candidate = _identity(
            "candidate",
            buckets=SCREEN.CANDIDATE_BUCKETS,
        )
        initializer_weights = _identity(
            "initializer-weights",
            buckets=SCREEN.CANDIDATE_BUCKETS,
        )
        trainer = {
            "artifacts": {
                "candidate_weights": candidate,
                "initializer_weights": initializer_weights,
            }
        }
        execution = {
            "inputs": {
                "initializer": {**initializer, "role": "initializer"},
                "live_weights": {**live, "role": "live"},
            }
        }
        observed = {
            "finite_training_and_inference": True,
            "technical_faults_maximum": 0,
            "float_export_roundtrip_mismatches_maximum": 0,
            "wasm_parity_mismatches_maximum": 0,
            "teacher_mae_cp_improvement_minimum": 5,
            "pair_accuracy_delta_minimum": -0.002,
            "quantized_mean_abs_cp_delta_ratio_maximum": 1.05,
            "quantized_max_abs_cp_delta_ratio_maximum": 1.05,
            "research_runtime_search_slowdown_percent_maximum": 5,
        }
        static = {
            "schema": SCREEN.STATIC_SCHEMA,
            "status": SCREEN.STATIC_PASS_STATUS,
            "protocol": protocol_identity,
            "execution_plan": execution_identity,
            "dataset_manifest": dataset_identity,
            "initializer": initializer,
            "live_weights": live,
            "trainer_result": trainer_identity,
            "candidate_weights": candidate,
            "runtime_sanity": _identity(
                "runtime-sanity",
                schema=SCREEN.RUNTIME_SANITY_SCHEMA,
            ),
            "checks": {
                key: {
                    "observed": observed[key],
                    "requirement": requirement,
                    "passed": True,
                }
                for key, requirement in PROTOCOL.EXPECTED_STATIC_SANITY[
                    "checks"
                ].items()
            },
            "all_checks_passed": True,
            "technical_faults": 0,
            "paired56_authorized": True,
            "expanded_stage_authorized": False,
            "live_weight_write_authorized": False,
        }
        captured = SCREEN._validate_static_result(
            static,
            protocol_identity=protocol_identity,
            execution_plan_identity=execution_identity,
            dataset_manifest_identity=dataset_identity,
            execution_plan=execution,
            trainer_result=trainer,
            trainer_identity=trainer_identity,
        )
        self.assertEqual(captured["candidate_weights"], candidate)

        false_pass = copy.deepcopy(static)
        false_pass["checks"]["teacher_mae_cp_improvement_minimum"]["observed"] = 4.999
        with self.assertRaisesRegex(
            SCREEN.DirectTeacherHalfkp81V2ScreenError,
            "did not pass exactly",
        ):
            SCREEN._validate_static_result(
                false_pass,
                protocol_identity=protocol_identity,
                execution_plan_identity=execution_identity,
                dataset_manifest_identity=dataset_identity,
                execution_plan=execution,
                trainer_result=trainer,
                trainer_identity=trainer_identity,
            )

    def test_runner_uses_twelve_workers_and_publishes_create_only_pass(self) -> None:
        plan = _plan()
        lock = threading.Lock()
        active = 0
        peak = 0

        def executor(_root, _plan_value, pair_index, _seed):
            nonlocal active, peak
            with lock:
                active += 1
                peak = max(peak, active)
            try:
                time.sleep(0.01)
                return ChildResult(0, _pair_log(plan, pair_index))
            finally:
                with lock:
                    active -= 1

        with mock.patch.object(
            SCREEN,
            "_authenticate_screen_plan",
            return_value=(plan, "d" * 64),
        ):
            result = SCREEN.run_screen(
                repo_root=str(REPO_ROOT),
                plan_path="unused.json",
                plan_sha256="d" * 64,
                output_dir=str(self.run_dir),
                executor=executor,
            )
            repeated = SCREEN.run_screen(
                repo_root=str(REPO_ROOT),
                plan_path="unused.json",
                plan_sha256="d" * 64,
                output_dir=str(self.run_dir),
                executor=mock.Mock(side_effect=AssertionError("must not replay")),
            )
        self.assertEqual(peak, SCREEN.PAIR_WORKERS)
        self.assertEqual(result["completed_games"], SCREEN.GAME_COUNT)
        self.assertEqual(result["status"], "passed-62-of-112-expanded-stage-only")
        self.assertEqual(repeated, result)
        self.assertTrue((self.run_dir / "result.json").is_file())
        self.assertEqual(
            len(list((self.run_dir / "pairs").glob("pair-*.json"))),
            SCREEN.PAIR_COUNT,
        )

    def test_only_exact_technical_fault_can_resume_same_plan(self) -> None:
        plan = _plan()
        calls: list[int] = []
        fault_once = True

        def executor(_root, _plan_value, pair_index, _seed):
            nonlocal fault_once
            calls.append(pair_index)
            if pair_index == 0 and fault_once:
                fault_once = False
                return ChildResult(1, b"", b"synthetic fault")
            return ChildResult(0, _pair_log(plan, pair_index))

        with mock.patch.object(
            SCREEN,
            "_authenticate_screen_plan",
            return_value=(plan, "e" * 64),
        ):
            fault = SCREEN.run_screen(
                repo_root=str(REPO_ROOT),
                plan_path="unused.json",
                plan_sha256="e" * 64,
                output_dir=str(self.run_dir),
                executor=executor,
            )
            no_resume = SCREEN.run_screen(
                repo_root=str(REPO_ROOT),
                plan_path="unused.json",
                plan_sha256="e" * 64,
                output_dir=str(self.run_dir),
                executor=mock.Mock(side_effect=AssertionError("must not run")),
            )
            resumed = SCREEN.run_screen(
                repo_root=str(REPO_ROOT),
                plan_path="unused.json",
                plan_sha256="e" * 64,
                output_dir=str(self.run_dir),
                resume_technical_fault=True,
                executor=executor,
            )
        self.assertEqual(fault["status"], "technical-fault-no-strength-conclusion")
        self.assertFalse(fault["strength_conclusion_allowed"])
        self.assertTrue(fault["technical_fault_resume_authorized"])
        self.assertEqual(no_resume, fault)
        self.assertEqual(resumed["status"], "passed-62-of-112-expanded-stage-only")
        self.assertEqual(calls.count(0), 2)
        self.assertTrue((self.run_dir / "faults" / "fault-0000.json").is_file())
        self.assertTrue((self.run_dir / "journal" / "attempt-0001.json").is_file())

    def test_strength_terminal_result_refuses_resume(self) -> None:
        plan = _plan()

        def executor(_root, _plan_value, pair_index, _seed):
            return ChildResult(0, _pair_log(plan, pair_index, "loss", "loss"))

        with mock.patch.object(
            SCREEN,
            "_authenticate_screen_plan",
            return_value=(plan, "f" * 64),
        ):
            result = SCREEN.run_screen(
                repo_root=str(REPO_ROOT),
                plan_path="unused.json",
                plan_sha256="f" * 64,
                output_dir=str(self.run_dir),
                executor=executor,
            )
            with self.assertRaisesRegex(
                SCREEN.DirectTeacherHalfkp81V2ScreenError,
                "cannot be resumed",
            ):
                SCREEN.run_screen(
                    repo_root=str(REPO_ROOT),
                    plan_path="unused.json",
                    plan_sha256="f" * 64,
                    output_dir=str(self.run_dir),
                    resume_technical_fault=True,
                    executor=executor,
                )
        self.assertIn("failed-strength", result["status"])
        self.assertTrue(result["pilot_family_closed"])
        self.assertFalse(result["technical_fault_resume_authorized"])


if __name__ == "__main__":
    unittest.main()
