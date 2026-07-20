import copy
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest import mock


ML_DIR = os.path.dirname(os.path.dirname(__file__))
REPO_ROOT = Path(ML_DIR).parent
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

import formal_paired_ab_v2_production_activation as activation  # noqa: E402
from formal_paired_ab_local_launcher import (  # noqa: E402
    _validate_openings_manifest as validate_existing_openings_manifest,
)


def digest(number):
    return f"{number:064x}"


def semantic_id(number):
    return f"sha256:{number:064x}"


def artifact_identity(path, raw, schema):
    return {
        "path": path,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "schema": schema,
    }


def content_record(path, payload):
    raw = activation._canonical_artifact_bytes(payload)
    return {
        "identity": artifact_identity(path, raw, payload["schema"]),
        "payload": payload,
    }


def rebind_content_record(record):
    return content_record(record["identity"]["path"], record["payload"])


def opening_schedule():
    pairs = []
    for pair_index in range(activation.PAIR_COUNT):
        opening = {
            "sfen": (
                "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/"
                f"PPPPPPPPP/1B5R1/LNSGKGSNL b - {pair_index + 1}"
            ),
            "usi_moves": [],
        }
        opening_id = activation._expected_opening_id(opening)
        games = []
        for game_index, color in enumerate(activation.COLORS):
            games.append(
                {
                    "game_index": game_index,
                    "game_id": activation._expected_game_id(
                        opening_id,
                        pair_index,
                        game_index,
                        color,
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
    return {
        "schema": activation.OPENING_SCHEDULE_SCHEMA,
        "pairs": pairs,
    }


def composition_fixture():
    candidate_raw = b"synthetic-candidate-weight"
    stable_raw = b"synthetic-stable-weight"
    adapter_raw = b"synthetic-match-adapter"
    result_raw = b"synthetic-downstream-result"
    retention_raw = b"synthetic-retention-receipt"
    rollback_raw = b"synthetic-rollback-receipt"
    schedule = opening_schedule()
    time_control = {
        "schema": activation.TIME_CONTROL_SCHEMA,
        "main_time_ms": 10_000,
        "byoyomi_ms": 1_000,
        "increment_ms": 0,
        "maximum_moves": 512,
        "adjudication": "adapter-terminal-or-maximum-moves-draw",
    }
    return {
        "schema": activation.ACTIVATION_COMPOSITION_INPUT_SCHEMA,
        "experiment_id": semantic_id(1),
        "run_id": semantic_id(2),
        "candidate_weights": artifact_identity(
            "synthetic/candidate.bin",
            candidate_raw,
            activation.WEIGHTS_SCHEMA,
        ),
        "stable_weights": artifact_identity(
            "synthetic/stable.bin",
            stable_raw,
            activation.WEIGHTS_SCHEMA,
        ),
        "openings_manifest": content_record(
            "synthetic/openings.json",
            schedule,
        ),
        "colors": ["sente", "gote"],
        "time_control": content_record(
            "synthetic/time-control.json",
            time_control,
        ),
        "pair_workers": 6,
        "match_adapter": artifact_identity(
            "synthetic/match-adapter.bin",
            adapter_raw,
            activation.MATCH_ADAPTER_SCHEMA,
        ),
        "receipts": {
            "result_receipt": artifact_identity(
                "synthetic/downstream-result.json",
                result_raw,
                activation.RESULT_RECEIPT_SCHEMA,
            ),
            "retention_receipt": artifact_identity(
                "synthetic/retention.json",
                retention_raw,
                activation.RETENTION_RECEIPT_SCHEMA,
            ),
            "rollback_receipt": artifact_identity(
                "synthetic/rollback.json",
                rollback_raw,
                activation.ROLLBACK_RECEIPT_SCHEMA,
            ),
        },
        "safety": {
            "test_only": True,
            "production_authority": False,
            "execute_games": False,
            "engine_access": False,
            "network_access": False,
            "live_weight_write": False,
        },
    }


class DictSubclass(dict):
    pass


class FormalPairedAbV2ProductionActivationTest(unittest.TestCase):
    def test_checked_in_activation_registry_is_exact_closed_and_null(self):
        path = REPO_ROOT / activation.ACTIVATION_REGISTRY_PATH
        raw = path.read_bytes()
        self.assertEqual(len(raw), activation.ACTIVATION_REGISTRY_BYTES)
        self.assertEqual(
            hashlib.sha256(raw).hexdigest(),
            activation.ACTIVATION_REGISTRY_SHA256,
        )
        registry = activation.validate_closed_production_activation_registry(
            REPO_ROOT
        )
        self.assertEqual(
            registry["status"],
            "closed-awaiting-reviewed-enrollments",
        )
        self.assertTrue(
            all(value is None for value in registry["enrollments"].values())
        )
        self.assertTrue(
            all(value is False for value in registry["gates"].values())
        )
        self.assertEqual(registry["protocol"]["pairs"], 384)
        self.assertEqual(registry["protocol"]["games"], 768)
        self.assertEqual(registry["protocol"]["colors"], ["sente", "gote"])
        self.assertEqual(registry["nonclaims"]["games_started"], 0)
        self.assertEqual(registry["nonclaims"]["live_weight_changes"], 0)

    def test_registry_byte_drift_and_intermediate_symlink_fail_closed(self):
        required_paths = (
            activation.ACTIVATION_REGISTRY_PATH,
            activation.FORMAL_AB_V2_REGISTRY_PATH,
            activation.FORMAL_AB_V2_AMENDMENT_PATH,
            activation.FRESH_SIBLING_PLAN_PATH,
            activation.ORIGINAL_V1_REGISTRY_PATH,
        )
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary, "repo")
            root.mkdir(mode=0o700)
            for relative_path in required_paths:
                source = REPO_ROOT / relative_path
                target = root / relative_path
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, target)
            registry = root / activation.ACTIVATION_REGISTRY_PATH
            registry.write_bytes(registry.read_bytes() + b"\n")
            with self.assertRaisesRegex(
                activation.FormalAbV2ActivationError,
                "byte length differs",
            ):
                activation.validate_closed_production_activation_registry(root)

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary, "repo")
            real_ml = Path(temporary, "real-ml")
            root.mkdir(mode=0o700)
            real_ml.mkdir(mode=0o700)
            for relative_path in required_paths:
                source = REPO_ROOT / relative_path
                relative = Path(relative_path)
                target = real_ml.joinpath(*relative.parts[1:])
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, target)
            (root / "ml").symlink_to(real_ml, target_is_directory=True)
            with self.assertRaisesRegex(
                activation.FormalAbV2ActivationError,
                "cannot be opened safely",
            ):
                activation.validate_closed_production_activation_registry(root)

    def test_argumentless_entry_stops_before_test_core_or_external_access(self):
        stdout = io.StringIO()
        stderr = io.StringIO()
        with (
            mock.patch.object(
                activation,
                "compose_formal_ab_v2_activation_core_for_tests",
                side_effect=AssertionError("test core must not run"),
            ),
            mock.patch("sys.stdout", stdout),
            mock.patch("sys.stderr", stderr),
        ):
            status = activation.main([])
        self.assertEqual(status, 2)
        self.assertEqual(stderr.getvalue(), "")
        receipt = json.loads(stdout.getvalue())
        self.assertEqual(receipt["status"], "STOP")
        self.assertEqual(receipt["reason"], "enrollments-closed")
        for field in (
            "pairs_started",
            "games_started",
            "engine_processes_started",
            "network_requests",
            "live_weight_changes",
        ):
            self.assertEqual(receipt[field], 0)

    def test_arguments_stop_before_registry_access(self):
        stdout = io.StringIO()
        stderr = io.StringIO()
        with (
            mock.patch.object(
                activation,
                "argumentless_production_preflight",
                side_effect=AssertionError("preflight must not run"),
            ),
            mock.patch("sys.stdout", stdout),
            mock.patch("sys.stderr", stderr),
        ):
            status = activation.main(["unexpected"])
        self.assertEqual(status, 2)
        self.assertEqual(stdout.getvalue(), "")
        receipt = json.loads(stderr.getvalue())
        self.assertEqual(receipt["reason"], "arguments-forbidden")
        self.assertEqual(receipt["games_started"], 0)

    def test_core_for_tests_is_deterministic_and_binds_exact_accounting(self):
        fixture = composition_fixture()
        first = activation.compose_formal_ab_v2_activation_core_for_tests(
            fixture
        )
        reordered = {
            key: copy.deepcopy(fixture[key])
            for key in reversed(list(fixture))
        }
        second = activation.compose_formal_ab_v2_activation_core_for_tests(
            reordered
        )
        self.assertEqual(first, second)
        self.assertEqual(
            first["status"],
            "test-only-composition-complete-no-execution-authority",
        )
        self.assertEqual(
            first["binding"]["accounting"],
            {
                "pairs": 384,
                "games_per_pair": 2,
                "games": 768,
                "candidate_sente_games": 384,
                "candidate_gote_games": 384,
            },
        )
        self.assertEqual(
            first["binding"]["candidate_colors"],
            ["sente", "gote"],
        )
        self.assertEqual(
            first["binding"]["protocol"]["activation_registry"],
            activation._ACTIVATION_REGISTRY_IDENTITY,
        )
        self.assertEqual(first["binding"]["pair_workers"], 6)
        self.assertEqual(
            first["binding"]["candidate_weights"],
            fixture["candidate_weights"],
        )
        self.assertEqual(
            first["binding"]["stable_weights"],
            fixture["stable_weights"],
        )
        self.assertEqual(
            first["binding"]["match_adapter"],
            fixture["match_adapter"],
        )
        self.assertEqual(
            first["binding"]["receipts"],
            fixture["receipts"],
        )
        self.assertEqual(
            len(
                validate_existing_openings_manifest(
                    fixture["openings_manifest"]["payload"]
                )
            ),
            activation.PAIR_COUNT,
        )
        self.assertTrue(
            all(value is False for value in first["authority"].values())
        )
        self.assertTrue(
            all(value == 0 for value in first["observations"].values())
        )

    def test_core_for_tests_never_opens_files(self):
        fixture = composition_fixture()
        with mock.patch.object(
            activation.os,
            "open",
            side_effect=AssertionError("composition must not open files"),
        ):
            receipt = (
                activation.compose_formal_ab_v2_activation_core_for_tests(
                    fixture
                )
            )
        self.assertEqual(receipt["observations"]["games_started"], 0)

    def test_openings_colors_and_exact_768_accounting_are_fail_closed(self):
        probes = []

        missing_pair = composition_fixture()
        missing_pair["openings_manifest"]["payload"]["pairs"].pop()
        missing_pair["openings_manifest"] = rebind_content_record(
            missing_pair["openings_manifest"]
        )
        probes.append(missing_pair)

        wrong_color = composition_fixture()
        wrong_color["openings_manifest"]["payload"]["pairs"][0]["games"][0][
            "candidate_color"
        ] = "gote"
        wrong_color["openings_manifest"] = rebind_content_record(
            wrong_color["openings_manifest"]
        )
        probes.append(wrong_color)

        duplicate_game = composition_fixture()
        duplicate_game["openings_manifest"]["payload"]["pairs"][1]["games"][0][
            "game_id"
        ] = duplicate_game["openings_manifest"]["payload"]["pairs"][0][
            "games"
        ][0]["game_id"]
        duplicate_game["openings_manifest"] = rebind_content_record(
            duplicate_game["openings_manifest"]
        )
        probes.append(duplicate_game)

        wrong_colors = composition_fixture()
        wrong_colors["colors"] = ["gote", "sente"]
        probes.append(wrong_colors)

        duplicate_seed = composition_fixture()
        duplicate_seed["openings_manifest"]["payload"]["pairs"][1]["seed"] = (
            duplicate_seed["openings_manifest"]["payload"]["pairs"][0]["seed"]
        )
        duplicate_seed["openings_manifest"] = rebind_content_record(
            duplicate_seed["openings_manifest"]
        )
        probes.append(duplicate_seed)

        for probe in probes:
            with self.subTest(probe=len(probe["openings_manifest"]["payload"]["pairs"])):
                with self.assertRaises(activation.FormalAbV2ActivationError):
                    activation.compose_formal_ab_v2_activation_core_for_tests(
                        probe
                    )

    def test_content_identity_drift_time_and_worker_types_fail_closed(self):
        time_drift = composition_fixture()
        time_drift["time_control"]["payload"]["byoyomi_ms"] += 1
        with self.assertRaisesRegex(
            activation.FormalAbV2ActivationError,
            "SHA-256 differs",
        ):
            activation.compose_formal_ab_v2_activation_core_for_tests(
                time_drift
            )

        for workers in (True, 0, 7, 1.0):
            probe = composition_fixture()
            probe["pair_workers"] = workers
            with self.subTest(workers=workers):
                with self.assertRaisesRegex(
                    activation.FormalAbV2ActivationError,
                    "pair_workers",
                ):
                    activation.compose_formal_ab_v2_activation_core_for_tests(
                        probe
                    )

        zero_time = composition_fixture()
        zero_payload = zero_time["time_control"]["payload"]
        zero_payload["main_time_ms"] = 0
        zero_payload["byoyomi_ms"] = 0
        zero_payload["increment_ms"] = 0
        zero_time["time_control"] = content_record(
            "synthetic/time-control.json",
            zero_payload,
        )
        with self.assertRaisesRegex(
            activation.FormalAbV2ActivationError,
            "positive thinking time",
        ):
            activation.compose_formal_ab_v2_activation_core_for_tests(
                zero_time
            )

    def test_weight_adapter_and_receipt_identity_mutations_fail_closed(self):
        same_weights = composition_fixture()
        same_weights["stable_weights"]["sha256"] = same_weights[
            "candidate_weights"
        ]["sha256"]
        with self.assertRaisesRegex(
            activation.FormalAbV2ActivationError,
            "candidate and stable",
        ):
            activation.compose_formal_ab_v2_activation_core_for_tests(
                same_weights
            )

        same_weight_path = composition_fixture()
        same_weight_path["stable_weights"]["path"] = same_weight_path[
            "candidate_weights"
        ]["path"]
        with self.assertRaisesRegex(
            activation.FormalAbV2ActivationError,
            "candidate and stable",
        ):
            activation.compose_formal_ab_v2_activation_core_for_tests(
                same_weight_path
            )

        wrong_adapter = composition_fixture()
        wrong_adapter["match_adapter"]["schema"] = "wrong"
        with self.assertRaisesRegex(
            activation.FormalAbV2ActivationError,
            "match adapter.schema differs",
        ):
            activation.compose_formal_ab_v2_activation_core_for_tests(
                wrong_adapter
            )

        wrong_receipt = composition_fixture()
        wrong_receipt["receipts"]["retention_receipt"]["schema"] = "wrong"
        with self.assertRaisesRegex(
            activation.FormalAbV2ActivationError,
            "retention receipt.schema differs",
        ):
            activation.compose_formal_ab_v2_activation_core_for_tests(
                wrong_receipt
            )

        duplicate_receipt = composition_fixture()
        duplicate_receipt["receipts"]["rollback_receipt"]["sha256"] = (
            duplicate_receipt["receipts"]["result_receipt"]["sha256"]
        )
        with self.assertRaisesRegex(
            activation.FormalAbV2ActivationError,
            "receipt identities must be distinct",
        ):
            activation.compose_formal_ab_v2_activation_core_for_tests(
                duplicate_receipt
            )

        duplicate_receipt_path = composition_fixture()
        duplicate_receipt_path["receipts"]["rollback_receipt"]["path"] = (
            duplicate_receipt_path["receipts"]["result_receipt"]["path"]
        )
        with self.assertRaisesRegex(
            activation.FormalAbV2ActivationError,
            "receipt identities must be distinct",
        ):
            activation.compose_formal_ab_v2_activation_core_for_tests(
                duplicate_receipt_path
            )

    def test_extra_fields_subclasses_unsafe_paths_and_authority_fail_closed(self):
        extra = composition_fixture()
        extra["extra"] = None
        with self.assertRaisesRegex(
            activation.FormalAbV2ActivationError,
            "fields are not exact",
        ):
            activation.compose_formal_ab_v2_activation_core_for_tests(extra)

        subclass = DictSubclass(composition_fixture())
        with self.assertRaisesRegex(
            activation.FormalAbV2ActivationError,
            "fields are not exact",
        ):
            activation.compose_formal_ab_v2_activation_core_for_tests(subclass)

        nested_subclass = composition_fixture()
        nested_subclass["time_control"]["payload"] = DictSubclass(
            nested_subclass["time_control"]["payload"]
        )
        with self.assertRaisesRegex(
            activation.FormalAbV2ActivationError,
            "not plain JSON",
        ):
            activation.compose_formal_ab_v2_activation_core_for_tests(
                nested_subclass
            )

        unsafe = composition_fixture()
        unsafe["candidate_weights"]["path"] = "../candidate.bin"
        with self.assertRaisesRegex(
            activation.FormalAbV2ActivationError,
            "safe relative path",
        ):
            activation.compose_formal_ab_v2_activation_core_for_tests(unsafe)

        for path_alias in (
            "synthetic//candidate.bin",
            "synthetic/./candidate.bin",
            "synthetic/candidate.bin/",
        ):
            alias = composition_fixture()
            alias["candidate_weights"]["path"] = path_alias
            with self.subTest(path_alias=path_alias):
                with self.assertRaisesRegex(
                    activation.FormalAbV2ActivationError,
                    "canonical safe relative path",
                ):
                    activation.compose_formal_ab_v2_activation_core_for_tests(
                        alias
                    )

        aliased_weight_path = composition_fixture()
        aliased_weight_path["stable_weights"]["path"] = (
            "synthetic/./candidate.bin"
        )
        with self.assertRaisesRegex(
            activation.FormalAbV2ActivationError,
            "canonical safe relative path",
        ):
            activation.compose_formal_ab_v2_activation_core_for_tests(
                aliased_weight_path
            )

        authority = composition_fixture()
        authority["safety"]["production_authority"] = True
        with self.assertRaisesRegex(
            activation.FormalAbV2ActivationError,
            "safety.production_authority differs",
        ):
            activation.compose_formal_ab_v2_activation_core_for_tests(
                authority
            )

    def test_returned_receipt_does_not_alias_input(self):
        fixture = composition_fixture()
        receipt = activation.compose_formal_ab_v2_activation_core_for_tests(
            fixture
        )
        fixture["candidate_weights"]["path"] = "synthetic/mutated.bin"
        fixture["receipts"]["result_receipt"]["path"] = "synthetic/mutated.json"
        self.assertEqual(
            receipt["binding"]["candidate_weights"]["path"],
            "synthetic/candidate.bin",
        )
        self.assertEqual(
            receipt["binding"]["receipts"]["result_receipt"]["path"],
            "synthetic/downstream-result.json",
        )


if __name__ == "__main__":
    unittest.main()
