import copy
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import stat
import sys
import tempfile
import threading
import unittest
from unittest import mock


ML_DIR = os.path.dirname(os.path.dirname(__file__))
REPO_ROOT = Path(ML_DIR).parent
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

import formal_paired_ab_local_launcher as launcher  # noqa: E402
from formal_paired_ab_protocol_v2 import (  # noqa: E402
    FORMAL_AB_V2_AMENDMENT_PATH,
    FORMAL_AB_V2_REGISTRY_PATH,
    ORIGINAL_V1_REGISTRY_PATH,
)
from formal_paired_ab_protocol import FRESH_SIBLING_PLAN_PATH  # noqa: E402


def digest(number):
    return f"{number:064x}"


def semantic_id(number):
    return f"sha256:{number:064x}"


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def identity_for(root, relative_path, schema=None):
    raw = Path(root, relative_path).read_bytes()
    identity = {
        "path": relative_path,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }
    if schema is not None:
        identity["schema"] = schema
    return identity


class ReadyFixture:
    def __init__(self, temporary):
        self.root = Path(temporary, "repo")
        self.root.mkdir(mode=0o700)
        for relative_path in (
            FRESH_SIBLING_PLAN_PATH,
            ORIGINAL_V1_REGISTRY_PATH,
            FORMAL_AB_V2_AMENDMENT_PATH,
            FORMAL_AB_V2_REGISTRY_PATH,
        ):
            source = REPO_ROOT / relative_path
            target = self.root / relative_path
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)

        assets = {
            "candidate_weights": b"candidate-weights-v1",
            "stable_weights": b"stable-weights-v1",
            "yaneuraou_engine": b"local-yaneuraou-binary",
            "yaneuraou_eval": b"local-yaneuraou-eval",
            "local_match_adapter": b"existing-local-match-adapter",
        }
        self.asset_paths = {}
        for name, raw in assets.items():
            relative_path = f"local/{name}.bin"
            target = self.root / relative_path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
            self.asset_paths[name] = relative_path

        engine_receipt_path = "local/yaneuraou-engine-receipt.json"
        engine_raw = assets["yaneuraou_engine"]
        write_json(
            self.root / engine_receipt_path,
            {
                "schema": "shogi-teacher-engine-receipt-v1",
                "source_repository": "https://example.invalid/YaneuraOu.git",
                "source_commit": "1" * 40,
                "source_commit_date": "2026-07-18T00:00:00+00:00",
                "build_directory": "source",
                "build_command": "fixture-only",
                "compiler": "fixture-only",
                "compiler_target": "fixture-only",
                "engine_id": "YaneuraOu fixture",
                "binary_bytes": len(engine_raw),
                "binary_sha256": hashlib.sha256(engine_raw).hexdigest(),
            },
        )
        self.asset_paths["yaneuraou_engine_receipt"] = engine_receipt_path

        pairs = []
        for pair_index in range(launcher.PAIR_COUNT):
            opening = {
                "sfen": (
                    "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/"
                    f"PPPPPPPPP/1B5R1/LNSGKGSNL b - {pair_index + 1}"
                ),
                "usi_moves": [],
            }
            opening_id = launcher._expected_opening_id(opening)
            games = []
            for game_index, color in enumerate(("sente", "gote")):
                games.append(
                    {
                        "game_index": game_index,
                        "game_id": launcher._expected_game_id(
                            opening_id, pair_index, game_index, color
                        ),
                        "candidate_color": color,
                    }
                )
            pairs.append(
                {
                    "pair_index": pair_index,
                    "opening_id": opening_id,
                    "opening": opening,
                    "seed": 90_000 + pair_index,
                    "games": games,
                }
            )
        openings_path = "local/formal-ab-v2-openings.json"
        write_json(
            self.root / openings_path,
            {
                "schema": launcher.LOCAL_OPENINGS_MANIFEST_SCHEMA,
                "pairs": pairs,
            },
        )

        binding_path = "local/formal-ab-v2-match-binding.json"
        binding_assets = {
            name: identity_for(
                self.root,
                relative_path,
                (
                    "shogi-teacher-engine-receipt-v1"
                    if name == "yaneuraou_engine_receipt"
                    else None
                ),
            )
            for name, relative_path in self.asset_paths.items()
        }
        write_json(
            self.root / binding_path,
            {
                "schema": launcher.LOCAL_MATCH_BINDING_SCHEMA,
                "engine_protocol": "USI",
                "opening_protocol": "SFEN+USI",
                "result_protocol": "candidate-perspective-win-draw-loss",
                "assets": binding_assets,
                "deterministic_options": {
                    "fixture_only": True,
                    "options_are_pinned_not_interpreted_by_launcher": True,
                },
                "safety": {
                    "local_only": True,
                    "network": False,
                    "aws": False,
                    "external_calibration": False,
                    "live_weight_write": False,
                    "automatic_run": False,
                },
            },
        )

        attempt_ledger_path = "local/formal-ab-v2-attempt-ledger.json"
        write_json(
            self.root / attempt_ledger_path,
            {
                "schema": launcher.LOCAL_ATTEMPT_LEDGER_SCHEMA,
                "attempts": [],
            },
        )
        (self.root / attempt_ledger_path).chmod(0o400)

        self.registry_path = self.root / "local/formal-ab-v2-run-registry.json"
        self.registry = {
            "schema": launcher.LOCAL_RUN_REGISTRY_SCHEMA,
            "status": "ready-local-only",
            "source_registry": launcher._SOURCE_REGISTRY_IDENTITY,
            "plan": launcher._PLAN_IDENTITY,
            "protocol_amendment_sha256": launcher.FORMAL_AB_V2_AMENDMENT_SHA256,
            "experiment_id": semantic_id(10),
            "run_id": semantic_id(11),
            "attempt_index": 0,
            "attempt_ledger": identity_for(
                self.root,
                attempt_ledger_path,
                launcher.LOCAL_ATTEMPT_LEDGER_SCHEMA,
            ),
            "rerun_authorization": None,
            "openings_manifest": identity_for(
                self.root,
                openings_path,
                launcher.LOCAL_OPENINGS_MANIFEST_SCHEMA,
            ),
            "match_binding": identity_for(
                self.root,
                binding_path,
                launcher.LOCAL_MATCH_BINDING_SCHEMA,
            ),
            "pair_workers": launcher.MAX_PAIR_WORKERS,
            "execution_boundary": (
                "argumentless-local-only-reviewed-enrollment-no-network-aws-"
                "external-or-live"
            ),
        }
        self.write_registry()
        self.receipts = Path(temporary, "receipts")

    def write_registry(self):
        write_json(self.registry_path, self.registry)

    @staticmethod
    def passing_receipt(request, result="draw"):
        return {
            "schema": launcher.LOCAL_GAME_RECEIPT_SCHEMA,
            "pair_index": request["pair_index"],
            "opening_id": request["opening_id"],
            "game_index": request["game_index"],
            "game_id": request["game_id"],
            "candidate_color": request["candidate_color"],
            "seed": request["seed"],
            "candidate_weights_sha256": request["candidate_weights"]["sha256"],
            "stable_weights_sha256": request["stable_weights"]["sha256"],
            "match_binding_sha256": request["match_binding_sha256"],
            "result": result,
            "technical_fault": False,
        }


class FormalPairedAbLocalLauncherTest(unittest.TestCase):
    def test_argumentless_cli_validates_closed_registry_and_starts_zero_games(self):
        with mock.patch("sys.stdout", new_callable=io.StringIO) as stdout:
            self.assertEqual(launcher.main([]), 2)
        receipt = json.loads(stdout.getvalue())
        self.assertEqual(receipt["status"], "STOP")
        self.assertEqual(receipt["reason"], "candidate-identities-not-enrolled")
        self.assertEqual(receipt["pairs_started"], 0)
        self.assertEqual(receipt["games_started"], 0)

        with mock.patch("sys.stderr", new_callable=io.StringIO) as stderr:
            self.assertEqual(launcher.main(["--run"]), 2)
        receipt = json.loads(stderr.getvalue())
        self.assertEqual(receipt["reason"], "arguments-forbidden")
        self.assertEqual(receipt["games_started"], 0)

    def test_exact_384_pair_run_uses_at_most_six_workers_and_validates_result(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = ReadyFixture(temporary)
            lock = threading.Lock()
            active = 0
            maximum_active = 0
            requests = []

            def execute(request):
                nonlocal active, maximum_active
                with lock:
                    active += 1
                    maximum_active = max(maximum_active, active)
                    requests.append(copy.deepcopy(request))
                    active -= 1
                return fixture.passing_receipt(
                    request, "win" if request["game_index"] == 0 else "loss"
                )

            result = launcher.run_ready_local_formal_ab_v2_core_for_tests(
                fixture.root,
                fixture.registry_path,
                fixture.receipts,
                execute,
            )
            self.assertEqual(maximum_active, 1)
            self.assertLessEqual(maximum_active, launcher.MAX_PAIR_WORKERS)
            self.assertEqual(len(requests), launcher.GAME_COUNT)
            self.assertEqual(len(result["pairs"]), launcher.PAIR_COUNT)
            self.assertEqual(
                [game["candidate_color"] for game in result["pairs"][0]["games"]],
                ["sente", "gote"],
            )
            self.assertEqual(
                [pair["pair_index"] for pair in result["pairs"]],
                list(range(launcher.PAIR_COUNT)),
            )
            self.assertTrue(
                all(
                    request["network"] is False
                    and request["aws"] is False
                    and request["external_calibration"] is False
                    and request["live_weight_write"] is False
                    for request in requests
                )
            )
            self.assertEqual(
                stat.S_IMODE(fixture.receipts.stat().st_mode), 0o700
            )
            self.assertEqual(
                len(list(fixture.receipts.glob("pair-*.jsonl"))),
                launcher.PAIR_COUNT,
            )

            resumed_calls = 0

            def must_not_replay(_request):
                nonlocal resumed_calls
                resumed_calls += 1
                raise AssertionError("complete pair was replayed")

            resumed = launcher.run_ready_local_formal_ab_v2_core_for_tests(
                fixture.root,
                fixture.registry_path,
                fixture.receipts,
                must_not_replay,
            )
            self.assertEqual(resumed_calls, 0)
            self.assertEqual(resumed, result)

    def test_parallel_pair_workers_never_exceed_six(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = ReadyFixture(temporary)
            barrier = threading.Barrier(launcher.MAX_PAIR_WORKERS)
            lock = threading.Lock()
            active = 0
            maximum_active = 0

            def execute(request):
                nonlocal active, maximum_active
                with lock:
                    active += 1
                    maximum_active = max(maximum_active, active)
                if request["pair_index"] < launcher.MAX_PAIR_WORKERS and request[
                    "game_index"
                ] == 0:
                    barrier.wait(timeout=5)
                with lock:
                    active -= 1
                return fixture.passing_receipt(request)

            launcher.run_ready_local_formal_ab_v2_core_for_tests(
                fixture.root,
                fixture.registry_path,
                fixture.receipts,
                execute,
            )
            self.assertEqual(maximum_active, launcher.MAX_PAIR_WORKERS)

    def test_partial_pair_or_technical_fault_is_terminal_and_never_replayed(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = ReadyFixture(temporary)

            def fail_second_game(request):
                if request["pair_index"] == 0 and request["game_index"] == 1:
                    raise RuntimeError("synthetic technical fault")
                return fixture.passing_receipt(request)

            with self.assertRaisesRegex(
                launcher.FormalAbLocalTechnicalFault, "technical fault"
            ):
                launcher.run_ready_local_formal_ab_v2_core_for_tests(
                    fixture.root,
                    fixture.registry_path,
                    fixture.receipts,
                    fail_second_game,
                )
            replay_calls = 0

            def no_replay(_request):
                nonlocal replay_calls
                replay_calls += 1
                return {}

            with self.assertRaisesRegex(
                launcher.FormalAbLocalTechnicalFault, "terminal technical fault"
            ):
                launcher.run_ready_local_formal_ab_v2_core_for_tests(
                    fixture.root,
                    fixture.registry_path,
                    fixture.receipts,
                    no_replay,
                )
            self.assertEqual(replay_calls, 0)

    def test_wrong_receipt_identity_result_or_weight_is_a_technical_fault(self):
        mutations = (
            ("game_id", semantic_id(999)),
            ("candidate_color", "gote"),
            ("candidate_weights_sha256", digest(999)),
            ("match_binding_sha256", digest(998)),
            ("result", "void"),
            ("technical_fault", True),
        )
        for field, value in mutations:
            with self.subTest(field=field), tempfile.TemporaryDirectory() as temporary:
                fixture = ReadyFixture(temporary)

                def execute(request):
                    receipt = fixture.passing_receipt(request)
                    if request["pair_index"] == 0 and request["game_index"] == 0:
                        receipt[field] = value
                    return receipt

                with self.assertRaises(launcher.FormalAbLocalTechnicalFault):
                    launcher.run_ready_local_formal_ab_v2_core_for_tests(
                        fixture.root,
                        fixture.registry_path,
                        fixture.receipts,
                        execute,
                    )

    def test_wrong_plan_registry_worker_or_asset_fails_before_output_and_games(self):
        mutations = (
            ("source_registry", {**launcher._SOURCE_REGISTRY_IDENTITY, "bytes": 1}),
            ("plan", {**launcher._PLAN_IDENTITY, "sha256": digest(99)}),
            ("pair_workers", 7),
            ("execution_boundary", "network"),
        )
        for field, value in mutations:
            with self.subTest(field=field), tempfile.TemporaryDirectory() as temporary:
                fixture = ReadyFixture(temporary)
                fixture.registry[field] = value
                fixture.write_registry()
                calls = 0

                def execute(_request):
                    nonlocal calls
                    calls += 1
                    return {}

                with self.assertRaises(ValueError):
                    launcher.run_ready_local_formal_ab_v2_core_for_tests(
                        fixture.root,
                        fixture.registry_path,
                        fixture.receipts,
                        execute,
                    )
                self.assertEqual(calls, 0)
                self.assertFalse(fixture.receipts.exists())

        with tempfile.TemporaryDirectory() as temporary:
            fixture = ReadyFixture(temporary)
            (fixture.root / fixture.asset_paths["candidate_weights"]).write_bytes(
                b"drifted"
            )
            with self.assertRaisesRegex(ValueError, "byte length differs|SHA-256 differs"):
                launcher.run_ready_local_formal_ab_v2_core_for_tests(
                    fixture.root,
                    fixture.registry_path,
                    fixture.receipts,
                    lambda _request: {},
                )
            self.assertFalse(fixture.receipts.exists())

    def test_manifest_rejects_missing_duplicate_out_of_order_and_color_drift(self):
        mutations = []

        def missing(payload):
            payload["pairs"].pop()

        mutations.append(missing)

        def duplicate(payload):
            payload["pairs"][1]["opening_id"] = payload["pairs"][0]["opening_id"]

        mutations.append(duplicate)

        def out_of_order(payload):
            payload["pairs"][1]["pair_index"] = 8

        mutations.append(out_of_order)

        def wrong_color(payload):
            payload["pairs"][0]["games"][1]["candidate_color"] = "sente"

        mutations.append(wrong_color)

        for mutate in mutations:
            with self.subTest(mutate=mutate.__name__), tempfile.TemporaryDirectory() as temporary:
                fixture = ReadyFixture(temporary)
                manifest_path = fixture.root / fixture.registry["openings_manifest"]["path"]
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                mutate(manifest)
                write_json(manifest_path, manifest)
                fixture.registry["openings_manifest"] = identity_for(
                    fixture.root,
                    fixture.registry["openings_manifest"]["path"],
                    launcher.LOCAL_OPENINGS_MANIFEST_SCHEMA,
                )
                fixture.write_registry()
                with self.assertRaises(ValueError):
                    launcher.run_ready_local_formal_ab_v2_core_for_tests(
                        fixture.root,
                        fixture.registry_path,
                        fixture.receipts,
                        lambda _request: {},
                    )
                self.assertFalse(fixture.receipts.exists())

    def test_receipt_tamper_unknown_entry_and_noncanonical_jsonl_fail_before_resume(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = ReadyFixture(temporary)
            launcher.run_ready_local_formal_ab_v2_core_for_tests(
                fixture.root,
                fixture.registry_path,
                fixture.receipts,
                fixture.passing_receipt,
            )
            pair_zero = fixture.receipts / "pair-000.jsonl"
            original = pair_zero.read_bytes()

            pair_zero.write_bytes(original.replace(b'"result":"draw"', b'"result":"win"', 1))
            calls = 0

            def no_call(_request):
                nonlocal calls
                calls += 1
                return {}

            with self.assertRaisesRegex(ValueError, "binding differs|digest differs"):
                launcher.run_ready_local_formal_ab_v2_core_for_tests(
                    fixture.root,
                    fixture.registry_path,
                    fixture.receipts,
                    no_call,
                )
            self.assertEqual(calls, 0)

            pair_zero.write_bytes(original.replace(b",", b", ", 1))
            with self.assertRaisesRegex(ValueError, "canonical JSONL"):
                launcher.run_ready_local_formal_ab_v2_core_for_tests(
                    fixture.root,
                    fixture.registry_path,
                    fixture.receipts,
                    no_call,
                )
            self.assertEqual(calls, 0)

            pair_zero.write_bytes(original)
            (fixture.receipts / "unexpected").write_text("x", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "unknown entry"):
                launcher.run_ready_local_formal_ab_v2_core_for_tests(
                    fixture.root,
                    fixture.registry_path,
                    fixture.receipts,
                    no_call,
                )
            self.assertEqual(calls, 0)

    def test_receipt_directory_and_journal_aliases_fail_closed(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = ReadyFixture(temporary)
            fixture.receipts.mkdir(mode=0o755)
            with self.assertRaisesRegex(ValueError, "0700"):
                launcher.run_ready_local_formal_ab_v2_core_for_tests(
                    fixture.root,
                    fixture.registry_path,
                    fixture.receipts,
                    fixture.passing_receipt,
                )

        with tempfile.TemporaryDirectory() as temporary:
            fixture = ReadyFixture(temporary)
            fixture.receipts.mkdir(mode=0o700)
            target = Path(temporary, "outside")
            target.write_text("{}\n", encoding="utf-8")
            os.symlink(target, fixture.receipts / "pair-000.jsonl")
            with self.assertRaisesRegex(ValueError, "0600 regular inode"):
                launcher.run_ready_local_formal_ab_v2_core_for_tests(
                    fixture.root,
                    fixture.registry_path,
                    fixture.receipts,
                    fixture.passing_receipt,
                )

    def test_match_binding_rejects_network_aws_live_or_nonexact_options(self):
        mutations = (
            ("network", True),
            ("aws", True),
            ("external_calibration", True),
            ("live_weight_write", True),
            ("automatic_run", True),
        )
        for safety_field, value in mutations:
            with self.subTest(field=safety_field), tempfile.TemporaryDirectory() as temporary:
                fixture = ReadyFixture(temporary)
                binding_path = fixture.root / fixture.registry["match_binding"]["path"]
                binding = json.loads(binding_path.read_text(encoding="utf-8"))
                binding["safety"][safety_field] = value
                write_json(binding_path, binding)
                fixture.registry["match_binding"] = identity_for(
                    fixture.root,
                    fixture.registry["match_binding"]["path"],
                    launcher.LOCAL_MATCH_BINDING_SCHEMA,
                )
                fixture.write_registry()
                with self.assertRaises(ValueError):
                    launcher.validate_ready_local_run_registry_core_for_tests(
                        fixture.root, fixture.registry_path
                    )

        with tempfile.TemporaryDirectory() as temporary:
            fixture = ReadyFixture(temporary)
            binding_path = fixture.root / fixture.registry["match_binding"]["path"]
            binding = json.loads(binding_path.read_text(encoding="utf-8"))
            binding["deterministic_options"] = {}
            write_json(binding_path, binding)
            fixture.registry["match_binding"] = identity_for(
                fixture.root,
                fixture.registry["match_binding"]["path"],
                launcher.LOCAL_MATCH_BINDING_SCHEMA,
            )
            fixture.write_registry()
            with self.assertRaisesRegex(ValueError, "deterministic options"):
                launcher.validate_ready_local_run_registry_core_for_tests(
                    fixture.root, fixture.registry_path
                )

    def test_production_ready_registry_route_stays_code_pinned_and_closed(self):
        self.assertIsNone(launcher._PINNED_READY_RUN_REGISTRY_IDENTITY)
        self.assertFalse(hasattr(launcher, "run_ready_local_formal_ab_v2"))
        self.assertFalse(hasattr(launcher, "validate_ready_local_run_registry"))
        with self.assertRaisesRegex(
            launcher.FormalAbLocalLauncherBlocked,
            "no code-pinned checked-in ready registry",
        ):
            launcher.validate_pinned_ready_local_run_registry(REPO_ROOT)

    def test_attempt_ledger_and_rerun_authorization_require_read_only_artifacts(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = ReadyFixture(temporary)
            fixture.registry["attempt_ledger"] = digest(901)
            fixture.write_registry()
            with self.assertRaisesRegex(ValueError, "fields are not exact"):
                launcher.validate_ready_local_run_registry_core_for_tests(
                    fixture.root, fixture.registry_path
                )

        with tempfile.TemporaryDirectory() as temporary:
            fixture = ReadyFixture(temporary)
            fixture.registry["attempt_index"] = 1
            fixture.registry["rerun_authorization"] = digest(902)
            fixture.write_registry()
            with self.assertRaisesRegex(ValueError, "fields are not exact"):
                launcher.validate_ready_local_run_registry_core_for_tests(
                    fixture.root, fixture.registry_path
                )

        with tempfile.TemporaryDirectory() as temporary:
            fixture = ReadyFixture(temporary)
            ledger_path = fixture.root / fixture.registry["attempt_ledger"]["path"]
            ledger_path.chmod(0o600)
            with self.assertRaisesRegex(ValueError, "immutable read-only"):
                launcher.validate_ready_local_run_registry_core_for_tests(
                    fixture.root, fixture.registry_path
                )

        with tempfile.TemporaryDirectory() as temporary:
            fixture = ReadyFixture(temporary)
            rerun_path = fixture.root / "local/formal-ab-v2-rerun.json"
            write_json(
                rerun_path,
                {
                    "schema": launcher.LOCAL_RERUN_AUTHORIZATION_SCHEMA,
                    "authorized_attempt": 1,
                },
            )
            rerun_path.chmod(0o400)
            fixture.registry["attempt_index"] = 1
            fixture.registry["rerun_authorization"] = identity_for(
                fixture.root,
                "local/formal-ab-v2-rerun.json",
                launcher.LOCAL_RERUN_AUTHORIZATION_SCHEMA,
            )
            fixture.write_registry()
            captured = (
                launcher.validate_ready_local_run_registry_core_for_tests(
                    fixture.root, fixture.registry_path
                )
            )
            self.assertEqual(
                captured["rerun_authorization_identity"]["sha256"],
                fixture.registry["rerun_authorization"]["sha256"],
            )

            rerun_path.chmod(0o600)
            with self.assertRaisesRegex(ValueError, "immutable read-only"):
                launcher.validate_ready_local_run_registry_core_for_tests(
                    fixture.root, fixture.registry_path
                )

    def test_every_repository_path_component_rejects_intermediate_symlinks(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = ReadyFixture(temporary)
            outside = Path(temporary, "outside-assets")
            outside.mkdir()
            (outside / "candidate.bin").write_bytes(b"outside-candidate")
            os.symlink(outside, fixture.root / "alias-assets")
            binding_path = (
                fixture.root / fixture.registry["match_binding"]["path"]
            )
            binding = json.loads(binding_path.read_text(encoding="utf-8"))
            binding["assets"]["candidate_weights"] = identity_for(
                fixture.root, "alias-assets/candidate.bin"
            )
            write_json(binding_path, binding)
            fixture.registry["match_binding"] = identity_for(
                fixture.root,
                fixture.registry["match_binding"]["path"],
                launcher.LOCAL_MATCH_BINDING_SCHEMA,
            )
            fixture.write_registry()
            with self.assertRaisesRegex(ValueError, "cannot be opened safely"):
                launcher.validate_ready_local_run_registry_core_for_tests(
                    fixture.root, fixture.registry_path
                )

        with tempfile.TemporaryDirectory() as temporary:
            fixture = ReadyFixture(temporary)
            outside = Path(temporary, "outside-registry")
            outside.mkdir()
            shutil.copyfile(fixture.registry_path, outside / "ready.json")
            os.symlink(outside, fixture.root / "alias-registry")
            with self.assertRaisesRegex(ValueError, "cannot be opened safely"):
                launcher.validate_ready_local_run_registry_core_for_tests(
                    fixture.root, "alias-registry/ready.json"
                )

    def test_invalid_sfen_and_arbitrary_deterministic_options_fail_closed(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = ReadyFixture(temporary)
            manifest_path = (
                fixture.root / fixture.registry["openings_manifest"]["path"]
            )
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            opening = {"sfen": "not-a-valid-sfen", "usi_moves": []}
            opening_id = launcher._expected_opening_id(opening)
            manifest["pairs"][0]["opening"] = opening
            manifest["pairs"][0]["opening_id"] = opening_id
            for game_index, color in enumerate(("sente", "gote")):
                manifest["pairs"][0]["games"][game_index]["game_id"] = (
                    launcher._expected_game_id(
                        opening_id, 0, game_index, color
                    )
                )
            write_json(manifest_path, manifest)
            fixture.registry["openings_manifest"] = identity_for(
                fixture.root,
                fixture.registry["openings_manifest"]["path"],
                launcher.LOCAL_OPENINGS_MANIFEST_SCHEMA,
            )
            fixture.write_registry()
            with self.assertRaisesRegex(ValueError, "not canonical SFEN"):
                launcher.validate_ready_local_run_registry_core_for_tests(
                    fixture.root, fixture.registry_path
                )

        with tempfile.TemporaryDirectory() as temporary:
            fixture = ReadyFixture(temporary)
            binding_path = (
                fixture.root / fixture.registry["match_binding"]["path"]
            )
            binding = json.loads(binding_path.read_text(encoding="utf-8"))
            binding["deterministic_options"] = {
                "time_ms": -1,
                "network_endpoint": "https://example.invalid",
            }
            write_json(binding_path, binding)
            fixture.registry["match_binding"] = identity_for(
                fixture.root,
                fixture.registry["match_binding"]["path"],
                launcher.LOCAL_MATCH_BINDING_SCHEMA,
            )
            fixture.write_registry()
            with self.assertRaisesRegex(ValueError, "deterministic options"):
                launcher.validate_ready_local_run_registry_core_for_tests(
                    fixture.root, fixture.registry_path
                )


if __name__ == "__main__":
    unittest.main()
