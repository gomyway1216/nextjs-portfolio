import copy
import hashlib
import io
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest import mock


ML_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = ML_DIR.parent
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))
if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import build_formal_paired_ab_v2_worker_benchmark_registry_candidate as builder  # noqa: E402
import formal_paired_ab_local_launcher as legacy  # noqa: E402
import formal_paired_ab_v2_wasm_contract as contract  # noqa: E402
import formal_paired_ab_v2_worker_benchmark_bridge as benchmark  # noqa: E402
import run_formal_paired_ab_v2_worker_benchmark as runner  # noqa: E402
from test_formal_paired_ab_v2_wasm_contract import openings_manifest  # noqa: E402


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", "utf-8")


def identity(root, relative, schema=None):
    raw = (root / relative).read_bytes()
    value = {
        "path": relative,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }
    if schema is not None:
        value["schema"] = schema
    return value


def preflight_receipt(manifest, marker):
    body = {
        "schema": contract.FORMAL_WASM_OPENINGS_PREFLIGHT_SCHEMA,
        "status": "PASS",
        "manifest_sha256": contract._domain_digest(
            "shogi-formal-paired-ab-v2-wasm-openings-manifest-v2", manifest
        ),
        "pairs": contract.PAIR_COUNT,
        "games": contract.GAME_COUNT,
        "source_games": contract.PAIR_COUNT,
        "semantic_final_positions": contract.PAIR_COUNT,
        "source_game_ids_sha256": f"{marker:064x}",
        "semantic_final_position_ids_sha256": f"{marker + 1:064x}",
    }
    return {
        **body,
        "receipt_sha256": contract._domain_digest(
            "shogi-formal-paired-ab-v2-wasm-openings-preflight-v1", body
        ),
    }


class BenchmarkFixture:
    def __init__(self, temporary):
        self.root = Path(temporary, "repo")
        self.root.mkdir(mode=0o700)
        self.revision = "1" * 40
        for relative in (
            legacy.FRESH_SIBLING_PLAN_PATH,
            legacy.ORIGINAL_V1_REGISTRY_PATH,
            legacy.FORMAL_AB_V2_AMENDMENT_PATH,
            legacy.FORMAL_AB_V2_REGISTRY_PATH,
            *benchmark._IMPLEMENTATION_PATHS.values(),
        ):
            source = REPO_ROOT / relative
            target = self.root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
        blocked_source = REPO_ROOT / benchmark.BENCHMARK_REGISTRY_PATH
        blocked_target = self.root / benchmark.BENCHMARK_REGISTRY_PATH
        blocked_target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(blocked_source, blocked_target)

        candidate_path = "private/candidate.bin"
        stable_path = "private/stable.bin"
        (self.root / candidate_path).parent.mkdir(parents=True, exist_ok=True)
        (self.root / candidate_path).write_bytes(b"c" * contract.NNUE_BYTES)
        (self.root / stable_path).write_bytes(b"s" * contract.NNUE_BYTES)
        assets = {
            "candidate_weights": identity(self.root, candidate_path),
            "stable_weights": identity(self.root, stable_path),
        }
        for name, relative in contract.MATCH_ASSET_PATHS.items():
            assets[name] = identity(self.root, relative)
        self.binding = {
            "schema": contract.FORMAL_WASM_MATCH_BINDING_SCHEMA,
            "engine_protocol": "production-browser-wasm-v20",
            "opening_protocol": "SFEN+USI",
            "result_protocol": "candidate-perspective-win-draw-loss",
            "assets": assets,
            "search_contract": copy.deepcopy(contract.SEARCH_CONTRACT),
            "pair_worker_policy": copy.deepcopy(contract.PAIR_WORKER_POLICY),
            "safety": copy.deepcopy(contract.SAFETY_CONTRACT),
        }
        binding_path = "ml/protocols/worker-benchmark-match-binding.json"
        write_json(self.root / binding_path, self.binding)
        self.binding_identity = identity(
            self.root, binding_path, contract.FORMAL_WASM_MATCH_BINDING_SCHEMA
        )

        self.benchmark_manifest = openings_manifest()
        benchmark_openings_path = (
            "ml/protocols/worker-benchmark-dedicated-openings.json"
        )
        write_json(self.root / benchmark_openings_path, self.benchmark_manifest)
        self.benchmark_openings_identity = identity(
            self.root,
            benchmark_openings_path,
            contract.FORMAL_WASM_OPENINGS_MANIFEST_SCHEMA,
        )
        benchmark_preflight_path = (
            "ml/protocols/worker-benchmark-dedicated-openings-preflight.json"
        )
        write_json(
            self.root / benchmark_preflight_path,
            preflight_receipt(self.benchmark_manifest, 900),
        )
        self.benchmark_preflight_identity = identity(
            self.root,
            benchmark_preflight_path,
            contract.FORMAL_WASM_OPENINGS_PREFLIGHT_SCHEMA,
        )
        self.benchmark_id = "sha256:" + "2" * 64
        self.enrollment = {
            "schema": benchmark.BENCHMARK_ENROLLMENT_SCHEMA,
            "benchmark_id": self.benchmark_id,
            "source_revision": self.revision,
            "match_binding": self.binding_identity,
            "dedicated_openings_manifest": self.benchmark_openings_identity,
            "openings_preflight_receipt": self.benchmark_preflight_identity,
            "sealed_formal_openings_read": False,
            "formal_pair_journals_created": 0,
            "formal_games_started": 0,
            "live_weight_write": False,
        }

    def ready_registry(self):
        return builder.build_formal_paired_ab_v2_worker_benchmark_registry_candidate(
            _repo_root=self.root,
            _enrollment=self.enrollment,
            _git_head=lambda _root: self.revision,
        )

    def capture_ready(self):
        registry = self.ready_registry()
        write_json(self.root / benchmark.BENCHMARK_REGISTRY_PATH, registry)
        return benchmark.capture_ready_worker_benchmark_registry(
            self.root,
            benchmark.BENCHMARK_REGISTRY_PATH,
            expected_revision=self.revision,
        )


def synthetic_round(_workers, _round_index):
    return {
        "schema": benchmark.BENCHMARK_ROUND_RESULT_SCHEMA,
        "pairs": benchmark.BENCHMARK_PAIRS_PER_ROUND,
        "games": benchmark.BENCHMARK_GAMES_PER_ROUND,
        "peak_pair_workers_observed": _workers,
        "technical_fault_count": 0,
        "transcript_sha256s": [
            f"{index:064x}"
            for index in range(1, benchmark.BENCHMARK_GAMES_PER_ROUND + 1)
        ],
    }


def write_formal_ready_fixture(fixture, captured, receipt, suffix):
    receipt_path = f"ml/protocols/{suffix}-worker-benchmark-receipt.json"
    write_json(fixture.root / receipt_path, receipt)
    receipt_identity = identity(
        fixture.root, receipt_path, benchmark.BOUND_BENCHMARK_RECEIPT_SCHEMA
    )
    formal_manifest = openings_manifest()
    formal_manifest["source_manifest_sha256"] = "f" * 64
    openings_path = f"ml/protocols/{suffix}-formal-openings.json"
    write_json(fixture.root / openings_path, formal_manifest)
    openings_identity = identity(
        fixture.root,
        openings_path,
        contract.FORMAL_WASM_OPENINGS_MANIFEST_SCHEMA,
    )
    preflight_path = f"ml/protocols/{suffix}-formal-preflight.json"
    write_json(
        fixture.root / preflight_path,
        preflight_receipt(formal_manifest, 980),
    )
    preflight_identity = identity(
        fixture.root,
        preflight_path,
        contract.FORMAL_WASM_OPENINGS_PREFLIGHT_SCHEMA,
    )
    experiment_id = "sha256:" + "5" * 64
    run_id = "sha256:" + "6" * 64
    ledger_path = f"ml/protocols/{suffix}-formal-attempt-ledger.json"
    write_json(
        fixture.root / ledger_path,
        {
            "schema": benchmark.FORMAL_ATTEMPT_LEDGER_SCHEMA,
            "experiment_id": experiment_id,
            "candidate_weights_sha256": captured["assets"]["candidate_weights"][
                "sha256"
            ],
            "stable_weights_sha256": captured["assets"]["stable_weights"]["sha256"],
            "openings_manifest_sha256": openings_identity["sha256"],
            "match_binding_sha256": fixture.binding_identity["sha256"],
            "worker_benchmark_receipt_sha256": receipt_identity["sha256"],
            "attempts": [],
        },
    )
    registry = benchmark.build_formal_ready_registry_candidate(
        {
            "experiment_id": experiment_id,
            "run_id": run_id,
            "attempt_ledger": identity(
                fixture.root,
                ledger_path,
                benchmark.FORMAL_ATTEMPT_LEDGER_SCHEMA,
            ),
            "openings_manifest": openings_identity,
            "openings_preflight_receipt": preflight_identity,
            "match_binding": fixture.binding_identity,
            "worker_benchmark_receipt": receipt_identity,
            "pair_workers": receipt["selection"]["selected_pair_workers"],
        }
    )
    registry_path = f"ml/protocols/{suffix}-formal-ready-registry.json"
    write_json(fixture.root / registry_path, registry)
    return registry_path


class FormalPairedAbV2WorkerBenchmarkBridgeTest(unittest.TestCase):
    def test_checked_in_registry_and_argumentless_cli_remain_blocked(self):
        registry = benchmark.validate_worker_benchmark_registry_data(
            json.loads((REPO_ROOT / benchmark.BENCHMARK_REGISTRY_PATH).read_text())
        )
        self.assertEqual(registry["status"], "BLOCKED")
        self.assertFalse(registry["gates"]["benchmark_execution_authorized"])
        self.assertFalse(registry["gates"]["formal_execution_authorized"])
        self.assertRegex(benchmark._git_head(REPO_ROOT), r"^[0-9a-f]{40}$")
        with mock.patch("sys.stdout", new_callable=io.StringIO) as stdout:
            self.assertEqual(runner.main([]), 2)
        receipt = json.loads(stdout.getvalue())
        self.assertEqual(receipt["reason"], "benchmark-registry-blocked")
        self.assertEqual(receipt["benchmark_games_started"], 0)
        self.assertEqual(receipt["formal_games_started"], 0)

    def test_builder_emits_review_only_ready_dedicated_benchmark_authority(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = BenchmarkFixture(temporary)
            candidate = fixture.ready_registry()
            self.assertEqual(candidate["status"], "READY")
            self.assertEqual(candidate["contract"]["worker_candidates"], [2, 4, 8, 12])
            self.assertEqual(
                candidate["contract"]["round_sequence"],
                [2, 4, 8, 12, 12, 8, 4, 2],
            )
            self.assertEqual(
                candidate["implementation"]["benchmark_orchestrator"]["path"],
                "ml/formal_paired_ab_v2_worker_benchmark_bridge.py",
            )
            self.assertEqual(
                candidate["implementation"]["benchmark_production_runner"]["path"],
                "ml/run_formal_paired_ab_v2_worker_benchmark.py",
            )
            self.assertEqual(
                candidate["implementation"]["formal_production_runner"]["path"],
                "ml/formal_paired_ab_v2_benchmark_bound_runner.py",
            )
            self.assertNotIn("authority", candidate["implementation"])
            self.assertTrue(candidate["gates"]["benchmark_execution_authorized"])
            self.assertFalse(candidate["gates"]["formal_execution_authorized"])
            self.assertFalse(candidate["gates"]["production_weight_write_authorized"])
            self.assertFalse(candidate["boundary"]["sealed_formal_openings_access"])

            wrong_path = copy.deepcopy(fixture.enrollment)
            wrong_path["dedicated_openings_manifest"] = {
                **wrong_path["dedicated_openings_manifest"],
                "path": "ml/protocols/formal-openings.json",
            }
            with self.assertRaisesRegex(ValueError, "dedicated benchmark boundary"):
                builder.build_formal_paired_ab_v2_worker_benchmark_registry_candidate(
                    _repo_root=fixture.root,
                    _enrollment=wrong_path,
                    _git_head=lambda _root: fixture.revision,
                )

    def test_real_schedule_receipt_is_bound_before_formal_ready_candidate(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = BenchmarkFixture(temporary)
            captured = fixture.capture_ready()
            clock = iter(range(len(benchmark.BENCHMARK_SEQUENCE) * 2))
            receipt = benchmark.run_captured_worker_benchmark(
                fixture.root,
                captured,
                execute_round=synthetic_round,
                monotonic_ns=lambda: next(clock),
            )
            self.assertEqual(receipt["status"], "PASS")
            self.assertEqual(receipt["benchmark_games_started"], 192)
            self.assertEqual(receipt["formal_pair_journals_created"], 0)
            self.assertEqual(receipt["formal_games_started"], 0)
            self.assertEqual(receipt["selection"]["selected_pair_workers"], 2)
            self.assertEqual(
                receipt["candidate_weights"], captured["assets"]["candidate_weights"]
            )

            receipt_path = "ml/protocols/worker-benchmark-reviewed-receipt.json"
            write_json(fixture.root / receipt_path, receipt)
            receipt_identity = identity(
                fixture.root, receipt_path, benchmark.BOUND_BENCHMARK_RECEIPT_SCHEMA
            )

            formal_manifest = openings_manifest()
            formal_manifest["source_manifest_sha256"] = "f" * 64
            formal_openings_path = "ml/protocols/formal-reviewed-openings.json"
            write_json(fixture.root / formal_openings_path, formal_manifest)
            formal_openings_identity = identity(
                fixture.root,
                formal_openings_path,
                contract.FORMAL_WASM_OPENINGS_MANIFEST_SCHEMA,
            )
            formal_preflight_path = "ml/protocols/formal-reviewed-preflight.json"
            write_json(
                fixture.root / formal_preflight_path,
                preflight_receipt(formal_manifest, 950),
            )
            formal_preflight_identity = identity(
                fixture.root,
                formal_preflight_path,
                contract.FORMAL_WASM_OPENINGS_PREFLIGHT_SCHEMA,
            )
            experiment_id = "sha256:" + "3" * 64
            run_id = "sha256:" + "4" * 64
            ledger_path = "ml/protocols/formal-reviewed-attempt-ledger.json"
            write_json(
                fixture.root / ledger_path,
                {
                    "schema": benchmark.FORMAL_ATTEMPT_LEDGER_SCHEMA,
                    "experiment_id": experiment_id,
                    "candidate_weights_sha256": captured["assets"]["candidate_weights"][
                        "sha256"
                    ],
                    "stable_weights_sha256": captured["assets"]["stable_weights"][
                        "sha256"
                    ],
                    "openings_manifest_sha256": formal_openings_identity["sha256"],
                    "match_binding_sha256": fixture.binding_identity["sha256"],
                    "worker_benchmark_receipt_sha256": receipt_identity["sha256"],
                    "attempts": [],
                },
            )
            registry = benchmark.build_formal_ready_registry_candidate(
                {
                    "experiment_id": experiment_id,
                    "run_id": run_id,
                    "attempt_ledger": identity(
                        fixture.root,
                        ledger_path,
                        benchmark.FORMAL_ATTEMPT_LEDGER_SCHEMA,
                    ),
                    "openings_manifest": formal_openings_identity,
                    "openings_preflight_receipt": formal_preflight_identity,
                    "match_binding": fixture.binding_identity,
                    "worker_benchmark_receipt": receipt_identity,
                    "pair_workers": 2,
                }
            )
            registry_path = "ml/protocols/formal-reviewed-ready-registry.json"
            write_json(fixture.root / registry_path, registry)
            with (
                mock.patch.object(
                    benchmark,
                    "_PINNED_BENCHMARK_REGISTRY_IDENTITY",
                    captured["registry_identity"],
                ),
                mock.patch.object(benchmark, "_require_revision_ancestor"),
            ):
                formal = benchmark.capture_formal_ready_registry(
                    fixture.root, registry_path
                )
                self.assertEqual(formal["registry"]["pair_workers"], 2)
                self.assertEqual(len(formal["pairs"]), 384)

                mismatched = copy.deepcopy(registry)
                mismatched["pair_workers"] = 4
                write_json(fixture.root / registry_path, mismatched)
                with self.assertRaisesRegex(
                    ValueError, "differs from its benchmark receipt"
                ):
                    benchmark.capture_formal_ready_registry(fixture.root, registry_path)

    def test_fake_recalculated_benchmark_registry_cannot_cross_trust_root(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = BenchmarkFixture(temporary)
            captured = fixture.capture_ready()
            clock = iter(range(len(benchmark.BENCHMARK_SEQUENCE) * 2))
            selection = benchmark.run_formal_ab_v2_worker_benchmark_core_for_tests(
                synthetic_round,
                monotonic_ns=lambda: next(clock),
            )
            fake_registry_path = "ml/protocols/fake-worker-benchmark-registry.json"
            write_json(fixture.root / fake_registry_path, captured["registry"])
            fake_captured = copy.deepcopy(captured)
            fake_captured["registry_identity"] = identity(
                fixture.root,
                fake_registry_path,
                benchmark.BENCHMARK_REGISTRY_SCHEMA,
            )
            forged_receipt = benchmark.compose_bound_worker_benchmark_receipt(
                fake_captured, selection
            )
            formal_path = write_formal_ready_fixture(
                fixture, captured, forged_receipt, "fake-trust-root"
            )
            with (
                mock.patch.object(
                    benchmark,
                    "_PINNED_BENCHMARK_REGISTRY_IDENTITY",
                    captured["registry_identity"],
                ),
                mock.patch.object(benchmark, "_require_revision_ancestor"),
                self.assertRaisesRegex(ValueError, "benchmark trust root"),
            ):
                benchmark.capture_formal_ready_registry(fixture.root, formal_path)

    def test_bound_receipt_validator_directly_rejects_fake_registry_identity(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = BenchmarkFixture(temporary)
            captured = fixture.capture_ready()
            clock = iter(range(len(benchmark.BENCHMARK_SEQUENCE) * 2))
            receipt = benchmark.run_captured_worker_benchmark(
                fixture.root,
                captured,
                execute_round=synthetic_round,
                monotonic_ns=lambda: next(clock),
            )
            forged = copy.deepcopy(receipt)
            forged["benchmark_registry"] = {
                **forged["benchmark_registry"],
                "path": "ml/protocols/fake-worker-benchmark-registry.json",
            }
            forged_body = {
                key: value for key, value in forged.items() if key != "receipt_sha256"
            }
            forged["receipt_sha256"] = benchmark._domain_digest(
                "shogi-formal-paired-ab-v2-bound-worker-benchmark-receipt-v1",
                forged_body,
            )

            with self.assertRaisesRegex(ValueError, "benchmark trust root"):
                benchmark.validate_bound_worker_benchmark_receipt(
                    forged,
                    expected_registry=captured["registry"],
                    expected_registry_identity=captured["registry_identity"],
                )

    def test_output_is_reserved_before_games_and_fault_is_a_rerun_tombstone(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = BenchmarkFixture(temporary)
            captured = fixture.capture_ready()
            calls = 0

            def fail_after_reservation(_repo_root, _captured):
                nonlocal calls
                calls += 1
                raise RuntimeError("synthetic benchmark crash")

            with (
                mock.patch.object(
                    benchmark,
                    "validate_pinned_worker_benchmark_registry",
                    return_value=captured,
                ),
                mock.patch.object(
                    benchmark,
                    "run_captured_worker_benchmark",
                    side_effect=fail_after_reservation,
                ),
            ):
                with self.assertRaisesRegex(RuntimeError, "synthetic benchmark crash"):
                    benchmark.run_pinned_worker_benchmark(fixture.root, temporary)
                run_root = (
                    Path(temporary)
                    / benchmark.BENCHMARK_OUTPUT_DIRECTORY
                    / fixture.benchmark_id.removeprefix("sha256:")
                )
                self.assertTrue(run_root.is_dir())
                self.assertFalse(
                    (run_root / benchmark.BENCHMARK_OUTPUT_RECEIPT_NAME).exists()
                )
                with self.assertRaisesRegex(
                    benchmark.FormalAbV2WorkerBenchmarkError,
                    "already reserved; automatic rerun is forbidden",
                ):
                    benchmark.run_pinned_worker_benchmark(fixture.root, temporary)
            self.assertEqual(calls, 1)

    def test_postflight_registry_drift_blocks_receipt_publication(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = BenchmarkFixture(temporary)
            captured = fixture.capture_ready()
            clock = iter(range(len(benchmark.BENCHMARK_SEQUENCE) * 2))
            receipt = benchmark.run_captured_worker_benchmark(
                fixture.root,
                captured,
                execute_round=synthetic_round,
                monotonic_ns=lambda: next(clock),
            )

            def drift_after_rounds(_repo_root, _captured):
                shutil.copyfile(
                    REPO_ROOT / benchmark.BENCHMARK_REGISTRY_PATH,
                    fixture.root / benchmark.BENCHMARK_REGISTRY_PATH,
                )
                return receipt

            with (
                mock.patch.object(
                    benchmark,
                    "_PINNED_BENCHMARK_REGISTRY_IDENTITY",
                    captured["registry_identity"],
                ),
                mock.patch.object(benchmark, "_require_revision_ancestor"),
                mock.patch.object(
                    benchmark,
                    "run_captured_worker_benchmark",
                    side_effect=drift_after_rounds,
                ),
                mock.patch.object(
                    benchmark, "publish_bound_worker_benchmark_receipt"
                ) as publish,
                self.assertRaisesRegex(
                    ValueError, "pinned worker benchmark registry identity differs"
                ),
            ):
                benchmark.run_pinned_worker_benchmark(fixture.root, temporary)
            publish.assert_not_called()

    def test_formal_production_pin_stays_closed_until_real_receipt_is_reviewed(self):
        self.assertIsNone(benchmark._PINNED_FORMAL_READY_REGISTRY_IDENTITY)
        with self.assertRaisesRegex(
            benchmark.FormalAbV2WorkerBenchmarkBlocked,
            "no code-pinned benchmark-bound formal READY registry",
        ):
            benchmark.validate_pinned_formal_ready_registry(REPO_ROOT)


if __name__ == "__main__":
    unittest.main()
