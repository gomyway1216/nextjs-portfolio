from __future__ import annotations

import copy
from datetime import datetime, timedelta, timezone
import hashlib
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


def fixture_protocol(identity_offset: int = 0) -> dict:
    _, policy_identity = calibration.load_checked_in_policy(REPO_ROOT)
    candidate = {
        "repository_revision": f"{identity_offset + 1:x}" * 40,
        "repository_tree": f"{identity_offset + 2:x}" * 40,
        "weights": asset(101 + identity_offset * 10),
        "worker": asset(102 + identity_offset * 10),
        "wasm": asset(103 + identity_offset * 10),
        "opening_book": asset(104 + identity_offset * 10),
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
    core = calibration.build_candidate_protocol_core(
        experiment_id=semantic_id(601 + identity_offset),
        policy_identity=policy_identity,
        candidate=candidate,
        upstream=upstream,
        execution_environment=execution_environment,
        account=account,
        authorization=authorization,
    )
    document = calibration.build_preregistration_publication_document(
        core, recorded_at_utc="2026-07-30T12:00:00Z"
    )
    publication = calibration.bind_merged_main_publication(
        document,
        data_path=(
            "docs/data/shogi-81dojo-fixture-protocol-" f"{601 + identity_offset}.json"
        ),
        merged_main_revision="3" * 40,
        merged_main_tree="4" * 40,
        merged_at_utc="2026-07-31T12:00:00Z",
    )
    return dict(
        calibration.build_candidate_protocol(
            core=core,
            assembled_at_utc="2026-07-31T12:01:00Z",
            preregistration_publication=publication,
        )
    )


def fixture_observation(
    protocol: dict,
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
    server_game_id = f"81dojo-fixture-{sequence:03d}"
    server_record = {
        "schema": calibration.SERVER_RECORD_SCHEMA,
        "artifact": asset(20_000 + sequence),
        "normalized_moves": moves,
        "normalized_moves_sha256": calibration.normalized_moves_sha256(moves),
        "manual_export_attestation_sha256": digest(30_000 + sequence),
    }
    return {
        "server_game_id": server_game_id,
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
        "server_record": server_record,
        "candidate_trace": {
            "schema": calibration.TRACE_SCHEMA,
            "protocol_sha256": protocol["protocol_sha256"],
            "server_game_id": server_game_id,
            "candidate_binding_sha256": calibration.candidate_binding_sha256(protocol),
            "runtime_binding_sha256": calibration.runtime_binding_sha256(protocol),
            "server_record_artifact": copy.deepcopy(server_record["artifact"]),
            "server_normalized_moves_sha256": server_record["normalized_moves_sha256"],
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
            protocol,
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
        self.assertTrue(
            policy["ledger_contract"][
                "public_merged_main_protocol_commitment_before_game_1"
            ]
        )
        self.assertTrue(
            policy["ledger_contract"][
                "self_asserted_timestamp_is_not_preregistration_proof"
            ]
        )

    def test_protocol_binds_candidate_runtime_environment_and_authorization(self):
        validated = calibration.validate_candidate_protocol(self.protocol)

        self.assertEqual(
            validated["status"],
            "requires-public-merged-main-commitment-before-external-game-1",
        )
        self.assertEqual(
            validated["candidate"]["runtime"],
            calibration.CANDIDATE_RUNTIME_CONTRACT,
        )
        self.assertEqual(validated["assembled_at_utc"], "2026-07-31T12:01:00Z")
        publication = validated["preregistration_publication"]
        self.assertEqual(publication["branch"], "main")
        publication_bytes = calibration.encode_preregistration_publication_document(
            publication["document"]
        )
        self.assertEqual(len(publication_bytes), publication["artifact"]["bytes"])
        self.assertEqual(
            hashlib.sha256(publication_bytes).hexdigest(),
            publication["artifact"]["sha256"],
        )
        self.assertEqual(
            publication["document"]["protocol_core_sha256"],
            calibration.protocol_core_sha256(
                calibration._protocol_core_body(validated)
            ),
        )
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

        another_protocol = fixture_protocol(1)
        wrong_publication = copy.deepcopy(self.protocol)
        wrong_publication["preregistration_publication"] = copy.deepcopy(
            another_protocol["preregistration_publication"]
        )
        with self.assertRaisesRegex(ValueError, "another protocol core"):
            calibration.validate_candidate_protocol(wrong_publication)

    def test_candidate_trace_must_match_every_server_move(self):
        observation = fixture_observation(self.protocol, 1)
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

    def test_candidate_trace_cannot_cross_protocols_or_server_records(self):
        another_protocol = fixture_protocol(1)
        observation = fixture_observation(self.protocol, 1)

        with self.assertRaisesRegex(ValueError, "another protocol"):
            calibration.build_game_entry(
                another_protocol,
                sequence=1,
                previous_entry_sha256=None,
                observation=observation,
            )

        wrong_record = fixture_observation(self.protocol, 1)
        wrong_record["server_record"]["artifact"] = asset(99_999)
        with self.assertRaisesRegex(ValueError, "server_record_artifact"):
            calibration.build_game_entry(
                self.protocol,
                sequence=1,
                previous_entry_sha256=None,
                observation=wrong_record,
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

        alternate_observation = fixture_observation(self.protocol, 1)
        alternate_observation["server_game_id"] = "81dojo-fixture-alternate"
        alternate_observation["candidate_trace"][
            "server_game_id"
        ] = "81dojo-fixture-alternate"
        alternate_entry = calibration.build_game_entry(
            self.protocol,
            sequence=1,
            previous_entry_sha256=None,
            observation=alternate_observation,
        )
        alternate = calibration.encode_ledger_entry(alternate_entry)
        with self.assertRaisesRegex(ValueError, "rewrote or removed"):
            calibration.verify_append_only_extension(first, alternate, self.protocol)

    def test_first_game_must_be_after_public_merged_main_commitment(self):
        observation = fixture_observation(self.protocol, 1)
        observation["played_at_utc"] = "2026-07-31T11:59:59Z"

        with self.assertRaisesRegex(ValueError, "after merged publication"):
            calibration.build_game_entry(
                self.protocol,
                sequence=1,
                previous_entry_sha256=None,
                observation=observation,
            )

    def test_local_append_uses_immutable_authoritative_entry_files(self):
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            path = Path(directory) / "ledger"
            first = calibration.append_local_game(
                path, self.protocol, fixture_observation(self.protocol, 1)
            )
            calibration.append_local_game(
                path, self.protocol, fixture_observation(self.protocol, 2)
            )

            raw = calibration.authoritative_ledger_jsonl(path, self.protocol)
            games = calibration.parse_ledger(raw, self.protocol)
            self.assertEqual(len(games), 2)
            self.assertEqual(games[1]["previous_entry_sha256"], first["entry_sha256"])
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o700)
            self.assertEqual(
                sorted(member.name for member in (path / "entries").iterdir()),
                ["000001.json", "000002.json"],
            )
            self.assertTrue(
                all(
                    stat.S_IMODE(member.stat().st_mode) == 0o400
                    for member in (path / "entries").iterdir()
                )
            )

            symlink = Path(directory) / "ledger-link"
            symlink.symlink_to(path)
            with mock.patch.object(calibration.os, "O_NOFOLLOW", None):
                with self.assertRaisesRegex(ValueError, "symlink component"):
                    calibration.append_local_game(
                        symlink,
                        self.protocol,
                        fixture_observation(self.protocol, 3),
                    )

    def test_invalid_cross_entry_append_changes_zero_authoritative_bytes(self):
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            path = Path(directory) / "ledger"
            calibration.append_local_game(
                path, self.protocol, fixture_observation(self.protocol, 1)
            )
            before = calibration.authoritative_ledger_jsonl(path, self.protocol)
            before_files = {
                member.name: member.read_bytes()
                for member in (path / "entries").iterdir()
            }

            duplicate = fixture_observation(self.protocol, 2)
            duplicate["server_game_id"] = "81dojo-fixture-001"
            duplicate["candidate_trace"]["server_game_id"] = "81dojo-fixture-001"
            rating_drift = fixture_observation(self.protocol, 2)
            rating_drift["candidate_rating_before"] = 2099
            count_drift = fixture_observation(self.protocol, 2)
            count_drift["account_rated_games_before"] = 999
            count_drift["account_rated_games_after"] = 1000
            timestamp_drift = fixture_observation(self.protocol, 2)
            timestamp_drift["played_at_utc"] = "2026-08-01T00:00:01Z"

            for observation, message in (
                (duplicate, "repeats a server game ID"),
                (rating_drift, "rating continuity"),
                (count_drift, "rated-game count continuity"),
                (timestamp_drift, "timestamps are not strictly increasing"),
            ):
                with self.subTest(message=message):
                    with self.assertRaisesRegex(ValueError, message):
                        calibration.append_local_game(path, self.protocol, observation)
                    self.assertEqual(
                        calibration.authoritative_ledger_jsonl(path, self.protocol),
                        before,
                    )
                    self.assertEqual(
                        {
                            member.name: member.read_bytes()
                            for member in (path / "entries").iterdir()
                        },
                        before_files,
                    )

    def test_partial_temp_write_does_not_poison_authoritative_prefix(self):
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            path = Path(directory) / "ledger"
            calibration.append_local_game(
                path, self.protocol, fixture_observation(self.protocol, 1)
            )
            before = calibration.authoritative_ledger_jsonl(path, self.protocol)

            def partial_write(fd: int, encoded: bytes):
                calibration.os.write(fd, encoded[:17])
                calibration.os.fsync(fd)
                raise OSError("simulated crash during temporary write")

            with mock.patch.object(
                calibration,
                "_write_complete_temp_file",
                side_effect=partial_write,
            ):
                with self.assertRaisesRegex(OSError, "simulated crash"):
                    calibration.append_local_game(
                        path,
                        self.protocol,
                        fixture_observation(self.protocol, 2),
                    )

            self.assertEqual(
                calibration.authoritative_ledger_jsonl(path, self.protocol),
                before,
            )
            self.assertEqual(
                [
                    member.name
                    for member in (path / "entries").iterdir()
                    if calibration.ENTRY_FILE_RE.fullmatch(member.name)
                ],
                ["000001.json"],
            )
            calibration.append_local_game(
                path, self.protocol, fixture_observation(self.protocol, 2)
            )
            self.assertEqual(
                len(
                    calibration.parse_ledger(
                        calibration.authoritative_ledger_jsonl(path, self.protocol),
                        self.protocol,
                    )
                ),
                2,
            )

    def test_symlink_parent_is_rejected_without_target_write(self):
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            base = Path(directory)
            real_parent = base / "real-parent"
            real_parent.mkdir(mode=0o700)
            linked_parent = base / "linked-parent"
            linked_parent.symlink_to(real_parent, target_is_directory=True)

            with self.assertRaisesRegex(ValueError, "symlink component"):
                calibration.append_local_game(
                    linked_parent / "ledger",
                    self.protocol,
                    fixture_observation(self.protocol, 1),
                )
            self.assertEqual(list(real_parent.iterdir()), [])

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
