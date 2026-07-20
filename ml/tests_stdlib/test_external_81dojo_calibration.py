from __future__ import annotations

import copy
from datetime import datetime, timedelta, timezone
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest import mock


ML_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = ML_DIR.parent
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import external_81dojo_calibration as calibration  # noqa: E402


def digest(number: int) -> str:
    return f"{number:064x}"


def semantic_id(number: int) -> str:
    return f"sha256:{digest(number)}"


def asset(number: int) -> dict:
    return {"bytes": 1000 + number, "sha256": digest(number)}


def fixture_protocol() -> dict:
    _, policy_identity = calibration.load_checked_in_policy(REPO_ROOT)
    candidate = {
        "repository_revision": "1" * 40,
        "repository_tree": "2" * 40,
        "weights": asset(101),
        "worker": asset(102),
        "wasm": asset(103),
        "opening_book": asset(104),
        "runtime": copy.deepcopy(calibration.CANDIDATE_RUNTIME_CONTRACT),
    }
    upstream = {
        "selection_receipt_sha256": digest(201),
        "fresh_final_receipt_sha256": digest(202),
        "legacy_final_receipt_sha256": digest(203),
        "retention_receipt_sha256": digest(204),
        "known_regression_receipt_sha256": digest(205),
        "production_parity_receipt_sha256": digest(206),
        "formal_ab_receipt_sha256": digest(207),
        "all_internal_gates_passed": True,
    }
    execution_environment = {
        "hardware_id": "local-reference-machine-2026-07",
        "cpu": "fixture-cpu",
        "memory_bytes": 32 * 1024**3,
        "operating_system": "fixture-os",
        "browser": "fixture-browser",
        "official_client": {
            "name": "81Dojo official client",
            "version": "fixture-version",
            "artifact": asset(301),
        },
    }
    account = {
        "public_account_id_sha256": semantic_id(401),
        "name_prefix_verified": True,
        "rating_established": True,
        "rating_before_game_1": 2100,
        "rated_games_before_game_1": 50,
    }
    authorization = {
        "rules_reverified_date": "2026-07-20",
        "user_authorization_receipt_sha256": digest(501),
        "manual_relay_confirmed": True,
        "official_client_confirmed": True,
        "external_server_or_ui_automation": False,
        "execution_authorized": True,
    }
    return dict(
        calibration.build_candidate_protocol(
            experiment_id=semantic_id(601),
            preregistered_at_utc="2026-07-31T23:59:00Z",
            policy_identity=policy_identity,
            candidate=candidate,
            upstream=upstream,
            execution_environment=execution_environment,
            account=account,
            authorization=authorization,
        )
    )


def fixture_observation(
    sequence: int,
    *,
    rating_before: int = 2100,
    rating_after: int = 2100,
    selected_opponent: bool = False,
    technical_fault: dict | None = None,
) -> dict:
    color = "sente" if sequence % 2 else "gote"
    moves = ["7g7f", "3c3d", "2g2f", "8c8d"]
    first_ply = 1 if color == "sente" else 2
    decisions = [
        {
            "ply": ply,
            "usi": moves[ply - 1],
            "decision_receipt_sha256": digest(10_000 + sequence * 10 + ply),
        }
        for ply in range(first_ply, len(moves) + 1, 2)
    ]
    played_at = datetime(2026, 8, 1, tzinfo=timezone.utc) + timedelta(seconds=sequence)
    return {
        "server_game_id": f"81dojo-fixture-{sequence:03d}",
        "played_at_utc": played_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "candidate_color": color,
        "candidate_rating_before": rating_before,
        "candidate_rating_after": rating_after,
        "account_rated_games_before": 49 + sequence,
        "account_rated_games_after": 50 + sequence,
        "opponent_public_id_sha256": semantic_id(700 + sequence % 10),
        "opponent_rating_before": 2050 + sequence % 100,
        "result_for_candidate": ("win", "draw", "loss")[sequence % 3],
        "termination": "normal",
        "rating_counted": True,
        "selected_opponent": selected_opponent,
        "technical_fault": technical_fault,
        "server_record": {
            "schema": calibration.SERVER_RECORD_SCHEMA,
            "artifact": asset(20_000 + sequence),
            "normalized_moves": moves,
            "normalized_moves_sha256": calibration.normalized_moves_sha256(moves),
            "manual_export_attestation_sha256": digest(30_000 + sequence),
        },
        "candidate_trace": {
            "schema": calibration.TRACE_SCHEMA,
            "artifact": asset(40_000 + sequence),
            "runtime_receipt_sha256": digest(50_000 + sequence),
            "decisions": decisions,
            "decisions_sha256": calibration.trace_decisions_sha256(decisions),
        },
    }


def fixture_ledger(
    protocol: dict,
    games: int,
    *,
    low_rating_sequence: int | None = None,
    selected_sequence: int | None = None,
    fault_sequence: int | None = None,
) -> bytes:
    rows = bytearray()
    previous_entry_sha256 = None
    rating = protocol["account"]["rating_before_game_1"]
    for sequence in range(1, games + 1):
        rating_after = 2049 if sequence == low_rating_sequence else 2100
        fault = None
        if sequence == fault_sequence:
            fault = {
                "kind": "fixture-runtime-fault",
                "evidence_sha256": digest(60_000 + sequence),
            }
        observation = fixture_observation(
            sequence,
            rating_before=rating,
            rating_after=rating_after,
            selected_opponent=sequence == selected_sequence,
            technical_fault=fault,
        )
        entry = calibration.build_game_entry(
            protocol,
            sequence=sequence,
            previous_entry_sha256=previous_entry_sha256,
            observation=observation,
        )
        rows.extend(calibration.encode_ledger_entry(entry))
        previous_entry_sha256 = entry["entry_sha256"]
        rating = rating_after
    return bytes(rows)


class External81DojoCalibrationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.protocol = fixture_protocol()
        cls.complete_ledger = fixture_ledger(cls.protocol, calibration.GAME_COUNT)

    def test_checked_in_policy_is_exact_and_closed(self):
        policy, identity = calibration.load_checked_in_policy(REPO_ROOT)

        self.assertEqual(identity["bytes"], calibration.POLICY_BYTES)
        self.assertEqual(identity["sha256"], calibration.POLICY_SHA256)
        self.assertEqual(
            policy["status"], "blocked-before-candidate-account-and-manual-relay"
        )
        self.assertFalse(policy["authority"]["execution_authorized"])
        self.assertFalse(policy["authority"]["external_write_authorized"])
        self.assertEqual(policy["unresolved"]["external_games_observed"], 0)

    def test_protocol_binds_candidate_runtime_environment_and_authorization(self):
        validated = calibration.validate_candidate_protocol(self.protocol)

        self.assertEqual(
            validated["candidate"]["runtime"],
            calibration.CANDIDATE_RUNTIME_CONTRACT,
        )
        self.assertEqual(validated["preregistered_at_utc"], "2026-07-31T23:59:00Z")
        self.assertTrue(validated["upstream"]["all_internal_gates_passed"])
        self.assertTrue(validated["authorization"]["manual_relay_confirmed"])
        self.assertFalse(validated["authorization"]["external_server_or_ui_automation"])

        automated = copy.deepcopy(self.protocol)
        automated["authorization"]["external_server_or_ui_automation"] = True
        with self.assertRaisesRegex(ValueError, "automation is forbidden"):
            calibration.validate_candidate_protocol(automated)

        wrong_runtime = copy.deepcopy(self.protocol)
        wrong_runtime["candidate"]["runtime"]["max_time_ms_per_move"] = 10_000
        with self.assertRaisesRegex(ValueError, "fixed policy"):
            calibration.validate_candidate_protocol(wrong_runtime)

    def test_candidate_trace_must_match_every_server_move(self):
        observation = fixture_observation(1)
        observation["candidate_trace"]["decisions"][0]["usi"] = "2g2f"
        observation["candidate_trace"]["decisions_sha256"] = (
            calibration.trace_decisions_sha256(
                observation["candidate_trace"]["decisions"]
            )
        )

        with self.assertRaisesRegex(ValueError, "differs from server record"):
            calibration.build_game_entry(
                self.protocol,
                sequence=1,
                previous_entry_sha256=None,
                observation=observation,
            )

    def test_ledger_is_canonical_chained_continuous_and_append_only(self):
        first = fixture_ledger(self.protocol, 1)
        first_two = fixture_ledger(self.protocol, 2)
        receipt = calibration.verify_append_only_extension(
            first, first_two, self.protocol
        )

        self.assertEqual(receipt["games_appended"], 1)
        self.assertTrue(receipt["prefix_exact"])
        self.assertEqual(len(calibration.parse_ledger(first_two, self.protocol)), 2)

        alternate_observation = fixture_observation(1)
        alternate_observation["server_game_id"] = "81dojo-fixture-alternate"
        alternate_entry = calibration.build_game_entry(
            self.protocol,
            sequence=1,
            previous_entry_sha256=None,
            observation=alternate_observation,
        )
        alternate = calibration.encode_ledger_entry(alternate_entry)
        with self.assertRaisesRegex(ValueError, "rewrote or removed"):
            calibration.verify_append_only_extension(first, alternate, self.protocol)

    def test_first_game_must_be_after_candidate_preregistration(self):
        observation = fixture_observation(1)
        observation["played_at_utc"] = "2026-07-31T23:58:59Z"

        with self.assertRaisesRegex(ValueError, "after protocol preregistration"):
            calibration.build_game_entry(
                self.protocol,
                sequence=1,
                previous_entry_sha256=None,
                observation=observation,
            )

    def test_local_append_uses_private_regular_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "ledger.jsonl"
            first = calibration.append_local_game(
                path, self.protocol, fixture_observation(1)
            )
            calibration.append_local_game(path, self.protocol, fixture_observation(2))

            games = calibration.parse_ledger(path.read_bytes(), self.protocol)
            self.assertEqual(len(games), 2)
            self.assertEqual(games[1]["previous_entry_sha256"], first["entry_sha256"])
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)

            symlink = Path(directory) / "ledger-link.jsonl"
            symlink.symlink_to(path)
            with mock.patch.object(calibration.os, "O_NOFOLLOW", None):
                with self.assertRaisesRegex(ValueError, "path is a symlink"):
                    calibration.append_local_game(
                        symlink, self.protocol, fixture_observation(3)
                    )

    def test_complete_receipt_keeps_primary_decision_separate_from_bootstrap(self):
        with mock.patch.object(calibration, "BOOTSTRAP_REPLICATES", 100):
            receipt = calibration.finalize_calibration(
                self.protocol, self.complete_ledger
            )

        self.assertEqual(receipt["status"], "complete-pass")
        self.assertTrue(receipt["primary_decision"]["passed"])
        self.assertEqual(
            receipt["primary_decision"]["observed_minimum_post_game_rating"],
            2100,
        )
        self.assertEqual(
            receipt["auxiliary_statistics"]["authority"],
            "report-only-never-primary",
        )
        self.assertEqual(
            receipt["auxiliary_statistics"]["all_games"]["bootstrap_replicates"],
            100,
        )
        self.assertFalse(receipt["nonclaims"]["bootstrap_authorizes_primary_decision"])
        self.assertFalse(receipt["nonclaims"]["universal_human_rank_established"])
        self.assertFalse(receipt["nonclaims"]["live_weight_change"])

    def test_final_gate_fails_closed_on_incomplete_low_selected_or_faulted_data(self):
        with self.assertRaisesRegex(ValueError, "exactly 200"):
            calibration.finalize_calibration(
                self.protocol,
                fixture_ledger(self.protocol, calibration.GAME_COUNT - 1),
            )
        with self.assertRaisesRegex(ValueError, "below 2050"):
            calibration.finalize_calibration(
                self.protocol,
                fixture_ledger(
                    self.protocol,
                    calibration.GAME_COUNT,
                    low_rating_sequence=calibration.STABILITY_FIRST_GAME,
                ),
            )
        with self.assertRaisesRegex(ValueError, "selected pairing"):
            calibration.finalize_calibration(
                self.protocol,
                fixture_ledger(
                    self.protocol,
                    calibration.GAME_COUNT,
                    selected_sequence=77,
                ),
            )
        with self.assertRaisesRegex(ValueError, "technical fault"):
            calibration.finalize_calibration(
                self.protocol,
                fixture_ledger(
                    self.protocol,
                    calibration.GAME_COUNT,
                    fault_sequence=88,
                ),
            )

    def test_strict_json_rejects_duplicate_keys_and_noncanonical_rows(self):
        with self.assertRaisesRegex(ValueError, "duplicate JSON key"):
            calibration.strict_json_loads('{"a":1,"a":2}')

        pretty = (
            calibration.canonical_json_bytes(
                calibration.parse_ledger(
                    fixture_ledger(self.protocol, 1), self.protocol
                )[0]
            )
            + b" \n"
        )
        with self.assertRaisesRegex(ValueError, "not canonical JSON"):
            calibration.parse_ledger(pretty, self.protocol)


if __name__ == "__main__":
    unittest.main()
