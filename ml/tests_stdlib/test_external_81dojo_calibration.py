from __future__ import annotations

import base64
import copy
from datetime import datetime, timedelta, timezone
import hashlib
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
from urllib.parse import parse_qs, unquote, urlsplit


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


def git(repository_root: Path, *arguments: str, environment=None) -> str:
    completed = subprocess.run(
        ["/usr/bin/git", "-C", str(repository_root), *arguments],
        check=True,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=environment,
    )
    return completed.stdout.strip()


def initialize_publication_repository(repository_root: Path) -> None:
    repository_root.mkdir(mode=0o700)
    git(repository_root, "init", "-b", "main")
    git(repository_root, "config", "user.name", "Fixture Publisher")
    git(repository_root, "config", "user.email", "fixture@example.invalid")
    git(repository_root, "remote", "add", "origin", calibration.PUBLIC_REPOSITORY_URL)


class FixtureGitHubAPI:
    """Authoritative fixture distinct from mutable local remote-ref labels."""

    def __init__(self, repository_root: Path):
        self.repository_root = repository_root
        self.pulls: dict[int, dict] = {}
        self.main_revision: str | None = None

    def register_merged_pull(
        self,
        *,
        number: int,
        revision: str,
        data_path: str,
        merged_at_utc: str,
    ) -> None:
        self.pulls[number] = {
            "number": number,
            "revision": revision,
            "data_path": data_path,
            "merged_at_utc": merged_at_utc,
        }
        self.main_revision = revision

    def __call__(self, path: str) -> dict:
        split = urlsplit(path)
        prefix = calibration.PUBLIC_GITHUB_API_PREFIX
        relative = split.path.removeprefix(prefix)
        if relative.startswith("/pulls/"):
            number = int(relative.removeprefix("/pulls/"))
            if number not in self.pulls:
                raise ValueError("GitHub API returned HTTP 404")
            pull = self.pulls[number]
            return {
                "number": number,
                "state": "closed",
                "merged": True,
                "merged_at": pull["merged_at_utc"],
                "merge_commit_sha": pull["revision"],
                "html_url": f"{calibration.PUBLIC_REPOSITORY_URL}/pull/{number}",
                "base": {
                    "ref": "main",
                    "repo": {"full_name": calibration.PUBLIC_REPOSITORY_NAME},
                },
            }
        if relative == "/git/ref/heads/main":
            if self.main_revision is None:
                raise ValueError("GitHub API returned HTTP 404")
            return {
                "ref": calibration.PUBLIC_REMOTE_TRACKING_REF,
                "object": {
                    "type": "commit",
                    "sha": self.main_revision,
                },
            }
        if relative.startswith("/compare/"):
            comparison = relative.removeprefix("/compare/")
            ancestor, descendant = comparison.split("...", 1)
            completed = subprocess.run(
                [
                    "/usr/bin/git",
                    "-C",
                    str(self.repository_root),
                    "merge-base",
                    "--is-ancestor",
                    ancestor,
                    descendant,
                ],
                check=False,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            if completed.returncode != 0:
                return {
                    "status": "diverged",
                    "merge_base_commit": {"sha": digest(999_999)},
                }
            return {
                "status": "identical" if ancestor == descendant else "ahead",
                "merge_base_commit": {"sha": ancestor},
            }
        if relative.startswith("/git/commits/"):
            revision = relative.removeprefix("/git/commits/")
            return {
                "sha": revision,
                "tree": {
                    "sha": git(
                        self.repository_root,
                        "rev-parse",
                        f"{revision}^{{tree}}",
                    )
                },
            }
        if relative.startswith("/contents/"):
            data_path = unquote(relative.removeprefix("/contents/"))
            revision = parse_qs(split.query)["ref"][0]
            raw = subprocess.run(
                [
                    "/usr/bin/git",
                    "-C",
                    str(self.repository_root),
                    "show",
                    f"{revision}:{data_path}",
                ],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            ).stdout
            return {
                "type": "file",
                "path": data_path,
                "sha": git(
                    self.repository_root,
                    "rev-parse",
                    f"{revision}:{data_path}",
                ),
                "encoding": "base64",
                "size": len(raw),
                "content": base64.b64encode(raw).decode("ascii"),
            }
        raise AssertionError(f"unexpected fixture GitHub API path: {path}")


def fixture_protocol(
    repository_root: Path,
    github_api: FixtureGitHubAPI,
    identity_offset: int = 0,
) -> dict:
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
    data_path = (
        "docs/data/shogi-81dojo-fixture-protocol-" f"{601 + identity_offset}.json"
    )
    publication_path = repository_root / data_path
    publication_path.parent.mkdir(parents=True, exist_ok=True)
    publication_path.write_bytes(
        calibration.encode_preregistration_publication_document(document)
    )
    git(repository_root, "add", data_path)
    commit_second = 10 + identity_offset
    commit_time = f"2026-07-31T12:00:{commit_second:02d}+00:00"
    environment = {
        **os.environ,
        "GIT_AUTHOR_DATE": commit_time,
        "GIT_COMMITTER_DATE": commit_time,
    }
    git(
        repository_root,
        "commit",
        "-m",
        f"Publish fixture protocol {identity_offset}",
        environment=environment,
    )
    merged_main_revision = git(repository_root, "rev-parse", "HEAD")
    git(
        repository_root,
        "update-ref",
        calibration.PUBLIC_LOCAL_REMOTE_TRACKING_REF,
        merged_main_revision,
    )
    pull_request_number = 90_000 + identity_offset
    github_api.register_merged_pull(
        number=pull_request_number,
        revision=merged_main_revision,
        data_path=data_path,
        merged_at_utc=f"2026-07-31T12:00:{30 + identity_offset:02d}Z",
    )
    publication = calibration.bind_merged_main_publication(
        document,
        repository_root=repository_root,
        data_path=data_path,
        pull_request_number=pull_request_number,
        merged_main_revision=merged_main_revision,
    )
    return dict(
        calibration.build_candidate_protocol(
            core=core,
            assembled_at_utc="2026-07-31T12:01:00Z",
            preregistration_publication=publication,
            repository_root=repository_root,
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
            "search_artifact": asset(10_000 + sequence * 10 + ply),
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
        "candidate_trace": calibration.build_candidate_trace(
            protocol,
            server_game_id=server_game_id,
            server_record=server_record,
            runtime_execution_artifact=asset(50_000 + sequence),
            decisions=decisions,
        ),
    }


def replace_candidate_trace(
    protocol: dict,
    observation: dict,
    sequence: int,
    *,
    decisions: list[dict] | None = None,
) -> None:
    if decisions is None:
        moves = observation["server_record"]["normalized_moves"]
        first_ply = 1 if observation["candidate_color"] == "sente" else 2
        decisions = [
            {
                "ply": ply,
                "usi": moves[ply - 1],
                "search_artifact": asset(10_000 + sequence * 10 + ply),
            }
            for ply in range(first_ply, len(moves) + 1, 2)
        ]
    observation["candidate_trace"] = calibration.build_candidate_trace(
        protocol,
        server_game_id=observation["server_game_id"],
        server_record=observation["server_record"],
        runtime_execution_artifact=asset(50_000 + sequence),
        decisions=decisions,
    )


def fixture_ledger(
    protocol: dict,
    repository_root: Path,
    games: int,
    *,
    low_rating_sequence: int | None = None,
    selected_sequence: int | None = None,
    fault_sequence: int | None = None,
) -> bytes:
    calibration.validate_candidate_protocol(protocol, repository_root=repository_root)
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
        entry = calibration._build_game_entry_validated(
            protocol,
            sequence=sequence,
            previous_entry_sha256=previous_entry_sha256,
            observation=observation,
        )
        rows.extend(calibration.encode_ledger_entry(entry))
        previous_entry_sha256 = entry["entry_sha256"]
        rating = rating_after
    return bytes(rows)


def install_authoritative_ledger(path: Path, raw: bytes) -> None:
    path.mkdir(mode=0o700)
    lock = path / ".lock"
    lock.write_bytes(b"")
    lock.chmod(0o600)
    entries = path / "entries"
    entries.mkdir(mode=0o700)
    for sequence, row in enumerate(raw.splitlines(keepends=True), start=1):
        entry_path = entries / f"{sequence:06d}.json"
        entry_path.write_bytes(row)
        entry_path.chmod(0o400)


def finalize_fixture(
    protocol: dict,
    repository_root: Path,
    raw: bytes,
) -> dict:
    with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
        ledger_directory = Path(directory) / "ledger"
        install_authoritative_ledger(ledger_directory, raw)
        return dict(
            calibration.finalize_calibration(
                ledger_directory,
                protocol,
                repository_root=repository_root,
            )
        )


class External81DojoCalibrationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.publication_temporary_directory = tempfile.TemporaryDirectory(dir=REPO_ROOT)
        cls.repository_root = (
            Path(cls.publication_temporary_directory.name) / "publication-repository"
        )
        initialize_publication_repository(cls.repository_root)
        cls.github_api = FixtureGitHubAPI(cls.repository_root)
        cls.github_api_patch = mock.patch.object(
            calibration, "_github_api_json", side_effect=cls.github_api
        )
        cls.github_api_patch.start()
        cls.protocol = fixture_protocol(cls.repository_root, cls.github_api)
        cls.another_protocol = fixture_protocol(cls.repository_root, cls.github_api, 1)
        cls.complete_ledger = fixture_ledger(
            cls.protocol, cls.repository_root, calibration.GAME_COUNT
        )

    @classmethod
    def tearDownClass(cls):
        try:
            cls.github_api_patch.stop()
        finally:
            cls.publication_temporary_directory.cleanup()

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
        validated = calibration.validate_candidate_protocol(
            self.protocol, repository_root=self.repository_root
        )

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
        self.assertEqual(
            publication["remote_tracking_ref"],
            calibration.PUBLIC_REMOTE_TRACKING_REF,
        )
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
        self.assertEqual(
            publication["verification_receipt"]["authority"],
            "github-rest-api-tls-merge-and-object-verification",
        )
        self.assertEqual(publication["pull_request_number"], 90_000)
        self.assertEqual(publication["merged_at_utc"], "2026-07-31T12:00:30Z")

        automated = copy.deepcopy(self.protocol)
        automated["authorization"]["external_server_or_ui_automation"] = True
        with self.assertRaisesRegex(ValueError, "automation is forbidden"):
            calibration.validate_candidate_protocol(
                automated, repository_root=self.repository_root
            )

        wrong_runtime = copy.deepcopy(self.protocol)
        wrong_runtime["candidate"]["runtime"]["max_time_ms_per_move"] = 10_000
        with self.assertRaisesRegex(ValueError, "fixed policy"):
            calibration.validate_candidate_protocol(
                wrong_runtime, repository_root=self.repository_root
            )

        wrong_publication = copy.deepcopy(self.protocol)
        wrong_publication["preregistration_publication"] = copy.deepcopy(
            self.another_protocol["preregistration_publication"]
        )
        with self.assertRaisesRegex(ValueError, "another protocol core"):
            calibration.validate_candidate_protocol(
                wrong_publication, repository_root=self.repository_root
            )

    def test_nonexistent_self_asserted_publication_cannot_validate_or_finalize(self):
        forged = copy.deepcopy(self.protocol)
        publication = forged["preregistration_publication"]
        verification = publication["verification_receipt"]
        publication["merged_main_revision"] = "f" * 40
        publication["merged_main_tree"] = "e" * 40
        publication["merged_main_blob"] = "d" * 40
        verification["merged_main_revision"] = publication["merged_main_revision"]
        verification["merged_main_tree"] = publication["merged_main_tree"]
        verification["merged_main_blob"] = publication["merged_main_blob"]
        verification["receipt_sha256"] = calibration._body_digest(
            "shogi-external-81dojo-github-publication-verification-v1\0",
            calibration._publication_verification_body(verification),
        )
        forged["protocol_sha256"] = calibration._body_digest(
            "shogi-external-81dojo-candidate-protocol-v1\0",
            calibration._protocol_body(forged),
        )

        with self.assertRaisesRegex(ValueError, "trusted local git verification"):
            calibration.validate_candidate_protocol(
                forged, repository_root=self.repository_root
            )
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            ledger_directory = Path(directory) / "ledger"
            install_authoritative_ledger(ledger_directory, b"")
            with self.assertRaisesRegex(ValueError, "trusted local git verification"):
                calibration.finalize_calibration(
                    ledger_directory,
                    forged,
                    repository_root=self.repository_root,
                )

    def test_local_backdated_commit_and_mutable_origin_ref_are_not_publication(self):
        document = copy.deepcopy(
            self.protocol["preregistration_publication"]["document"]
        )
        data_path = "docs/data/shogi-81dojo-local-only-forgery.json"
        publication_path = self.repository_root / data_path
        publication_path.write_bytes(
            calibration.encode_preregistration_publication_document(document)
        )
        git(self.repository_root, "add", data_path)
        environment = {
            **os.environ,
            "GIT_AUTHOR_DATE": "2001-01-01T00:00:00+00:00",
            "GIT_COMMITTER_DATE": "2001-01-01T00:00:00+00:00",
        }
        git(
            self.repository_root,
            "commit",
            "-m",
            "Create a local-only backdated publication forgery",
            environment=environment,
        )
        local_only_revision = git(self.repository_root, "rev-parse", "HEAD")
        git(
            self.repository_root,
            "update-ref",
            calibration.PUBLIC_LOCAL_REMOTE_TRACKING_REF,
            local_only_revision,
        )

        with self.assertRaisesRegex(ValueError, "GitHub API returned HTTP 404"):
            calibration.bind_merged_main_publication(
                document,
                repository_root=self.repository_root,
                data_path=data_path,
                pull_request_number=99_999,
                merged_main_revision=local_only_revision,
            )

    def test_github_server_merge_time_cannot_be_backdated_in_receipt(self):
        forged = copy.deepcopy(self.protocol)
        publication = forged["preregistration_publication"]
        verification = publication["verification_receipt"]
        publication["merged_at_utc"] = "2026-07-31T12:00:20Z"
        verification["merged_at_utc"] = publication["merged_at_utc"]
        verification["receipt_sha256"] = calibration._body_digest(
            "shogi-external-81dojo-github-publication-verification-v1\0",
            calibration._publication_verification_body(verification),
        )
        forged["protocol_sha256"] = calibration._body_digest(
            "shogi-external-81dojo-candidate-protocol-v1\0",
            calibration._protocol_body(forged),
        )

        with self.assertRaisesRegex(
            ValueError, "publication GitHub and local git objects.merged_at_utc"
        ):
            calibration.validate_candidate_protocol(
                forged, repository_root=self.repository_root
            )

    def test_terminal_receipt_requires_live_github_reverification(self):
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            ledger_directory = Path(directory) / "ledger"
            install_authoritative_ledger(ledger_directory, b"")
            with mock.patch.object(
                calibration,
                "_github_api_json",
                side_effect=ValueError("GitHub API unavailable"),
            ):
                with self.assertRaisesRegex(ValueError, "GitHub API unavailable"):
                    calibration.finalize_calibration(
                        ledger_directory,
                        self.protocol,
                        repository_root=self.repository_root,
                    )

    def test_candidate_trace_must_match_every_server_move(self):
        observation = fixture_observation(self.protocol, 1)
        replace_candidate_trace(
            self.protocol,
            observation,
            1,
            decisions=[
                {"ply": 1, "usi": "2g2f", "search_artifact": asset(10_011)},
                {"ply": 3, "usi": "2g2f", "search_artifact": asset(10_013)},
            ],
        )

        with self.assertRaisesRegex(ValueError, "differs from server record"):
            calibration.build_game_entry(
                self.protocol,
                sequence=1,
                previous_entry_sha256=None,
                observation=observation,
                repository_root=self.repository_root,
            )

    def test_candidate_trace_cannot_cross_protocols_or_server_records(self):
        observation = fixture_observation(self.protocol, 1)

        with self.assertRaisesRegex(ValueError, "protocol_sha256"):
            calibration.build_game_entry(
                self.another_protocol,
                sequence=1,
                previous_entry_sha256=None,
                observation=observation,
                repository_root=self.repository_root,
            )

        wrong_record = fixture_observation(self.protocol, 1)
        wrong_record["server_record"]["artifact"] = asset(99_999)
        with self.assertRaisesRegex(ValueError, "server_record_artifact"):
            calibration.build_game_entry(
                self.protocol,
                sequence=1,
                previous_entry_sha256=None,
                observation=wrong_record,
                repository_root=self.repository_root,
            )

    def test_outer_trace_relabel_cannot_reuse_nested_receipt_bytes(self):
        observation = fixture_observation(self.protocol, 1)
        relabeled_document = copy.deepcopy(
            observation["candidate_trace"]["receipt"]["document"]
        )
        relabeled_document.update(
            calibration._trace_binding_fields(
                self.another_protocol,
                observation["server_game_id"],
                observation["server_record"],
            )
        )
        observation["candidate_trace"] = {
            "schema": calibration.TRACE_SCHEMA,
            "receipt": calibration._build_content_receipt(
                relabeled_document,
                domain="shogi-external-81dojo-candidate-trace-receipt-v1\0",
            ),
        }

        with self.assertRaisesRegex(ValueError, "runtime receipt.protocol_sha256"):
            calibration.build_game_entry(
                self.another_protocol,
                sequence=1,
                previous_entry_sha256=None,
                observation=observation,
                repository_root=self.repository_root,
            )

    def test_ledger_is_canonical_chained_continuous_and_append_only(self):
        first = fixture_ledger(self.protocol, self.repository_root, 1)
        first_two = fixture_ledger(self.protocol, self.repository_root, 2)
        receipt = calibration.verify_append_only_extension(
            first,
            first_two,
            self.protocol,
            repository_root=self.repository_root,
        )

        self.assertEqual(receipt["games_appended"], 1)
        self.assertTrue(receipt["prefix_exact"])
        self.assertEqual(
            len(
                calibration.parse_ledger(
                    first_two,
                    self.protocol,
                    repository_root=self.repository_root,
                )
            ),
            2,
        )

        alternate_observation = fixture_observation(self.protocol, 1)
        alternate_observation["server_game_id"] = "81dojo-fixture-alternate"
        replace_candidate_trace(self.protocol, alternate_observation, 1)
        alternate_entry = calibration.build_game_entry(
            self.protocol,
            sequence=1,
            previous_entry_sha256=None,
            observation=alternate_observation,
            repository_root=self.repository_root,
        )
        alternate = calibration.encode_ledger_entry(alternate_entry)
        with self.assertRaisesRegex(ValueError, "rewrote or removed"):
            calibration.verify_append_only_extension(
                first,
                alternate,
                self.protocol,
                repository_root=self.repository_root,
            )

    def test_first_game_must_be_after_public_merged_main_commitment(self):
        observation = fixture_observation(self.protocol, 1)
        observation["played_at_utc"] = "2026-07-31T11:59:59Z"

        with self.assertRaisesRegex(ValueError, "after merged publication"):
            calibration.build_game_entry(
                self.protocol,
                sequence=1,
                previous_entry_sha256=None,
                observation=observation,
                repository_root=self.repository_root,
            )

    def test_local_append_uses_immutable_authoritative_entry_files(self):
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            path = Path(directory) / "ledger"
            first = calibration.append_local_game(
                path,
                self.protocol,
                fixture_observation(self.protocol, 1),
                repository_root=self.repository_root,
            )
            calibration.append_local_game(
                path,
                self.protocol,
                fixture_observation(self.protocol, 2),
                repository_root=self.repository_root,
            )

            raw = calibration.authoritative_ledger_jsonl(
                path, self.protocol, repository_root=self.repository_root
            )
            games = calibration.parse_ledger(
                raw, self.protocol, repository_root=self.repository_root
            )
            self.assertEqual(len(games), 2)
            self.assertEqual(
                games[1]["previous_entry_sha256"],
                first["entry"]["entry_sha256"],
            )
            self.assertEqual(first["status"], "committed")
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
            with self.assertRaises(OSError):
                calibration.append_local_game(
                    symlink,
                    self.protocol,
                    fixture_observation(self.protocol, 3),
                    repository_root=self.repository_root,
                )

    def test_invalid_cross_entry_append_changes_zero_authoritative_bytes(self):
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            path = Path(directory) / "ledger"
            calibration.append_local_game(
                path,
                self.protocol,
                fixture_observation(self.protocol, 1),
                repository_root=self.repository_root,
            )
            before = calibration.authoritative_ledger_jsonl(
                path, self.protocol, repository_root=self.repository_root
            )
            before_files = {
                member.name: member.read_bytes()
                for member in (path / "entries").iterdir()
            }

            duplicate = fixture_observation(self.protocol, 2)
            duplicate["server_game_id"] = "81dojo-fixture-001"
            replace_candidate_trace(self.protocol, duplicate, 2)
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
                        calibration.append_local_game(
                            path,
                            self.protocol,
                            observation,
                            repository_root=self.repository_root,
                        )
                    self.assertEqual(
                        calibration.authoritative_ledger_jsonl(
                            path,
                            self.protocol,
                            repository_root=self.repository_root,
                        ),
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
                path,
                self.protocol,
                fixture_observation(self.protocol, 1),
                repository_root=self.repository_root,
            )
            before = calibration.authoritative_ledger_jsonl(
                path, self.protocol, repository_root=self.repository_root
            )

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
                        repository_root=self.repository_root,
                    )

            self.assertEqual(
                calibration.authoritative_ledger_jsonl(
                    path,
                    self.protocol,
                    repository_root=self.repository_root,
                ),
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
                path,
                self.protocol,
                fixture_observation(self.protocol, 2),
                repository_root=self.repository_root,
            )
            self.assertEqual(
                len(
                    calibration.parse_ledger(
                        calibration.authoritative_ledger_jsonl(
                            path,
                            self.protocol,
                            repository_root=self.repository_root,
                        ),
                        self.protocol,
                        repository_root=self.repository_root,
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

            with self.assertRaises(OSError):
                calibration.append_local_game(
                    linked_parent / "ledger",
                    self.protocol,
                    fixture_observation(self.protocol, 1),
                    repository_root=self.repository_root,
                )
            self.assertEqual(list(real_parent.iterdir()), [])

    def test_descriptor_walk_prevents_ancestor_swap_redirect(self):
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            base = Path(directory)
            visible_parent = base / "visible-parent"
            visible_parent.mkdir(mode=0o700)
            held_parent = base / "held-parent"
            redirect = base / "redirect"
            redirect.mkdir(mode=0o700)
            ledger = visible_parent / "ledger"
            real_mkdir = calibration.os.mkdir
            swapped = False

            def swap_before_descriptor_relative_mkdir(name, mode=0o777, *, dir_fd=None):
                nonlocal swapped
                if name == "ledger" and dir_fd is not None and not swapped:
                    os.rename(visible_parent, held_parent)
                    visible_parent.symlink_to(redirect, target_is_directory=True)
                    swapped = True
                return real_mkdir(name, mode, dir_fd=dir_fd)

            with mock.patch.object(
                calibration.os,
                "mkdir",
                side_effect=swap_before_descriptor_relative_mkdir,
            ):
                with self.assertRaisesRegex(ValueError, "postflight"):
                    calibration.append_local_game(
                        ledger,
                        self.protocol,
                        fixture_observation(self.protocol, 1),
                        repository_root=self.repository_root,
                    )
            self.assertTrue(swapped)
            self.assertEqual(list(redirect.iterdir()), [])

    def test_first_creation_fsync_order_and_failure_boundaries(self):
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            path = Path(directory) / "ledger"
            real_fsync = calibration.os.fsync
            observed = []

            def recording_fsync(fd):
                info = os.fstat(fd)
                observed.append((stat.S_IFMT(info.st_mode), info.st_ino))
                return real_fsync(fd)

            with mock.patch.object(
                calibration.os, "fsync", side_effect=recording_fsync
            ):
                result = calibration.append_local_game(
                    path,
                    self.protocol,
                    fixture_observation(self.protocol, 1),
                    repository_root=self.repository_root,
                )
            self.assertEqual(result["status"], "committed")
            expected = [
                (stat.S_IFDIR, path.parent.stat().st_ino),
                (stat.S_IFREG, (path / ".lock").stat().st_ino),
                (stat.S_IFDIR, path.stat().st_ino),
                (stat.S_IFDIR, path.stat().st_ino),
            ]
            self.assertEqual(observed[:4], expected)
            self.assertEqual(observed[4][0], stat.S_IFREG)
            self.assertEqual(
                observed[5:],
                [
                    (stat.S_IFDIR, (path / "entries").stat().st_ino),
                    (stat.S_IFDIR, (path / "entries").stat().st_ino),
                ],
            )

        for failing_call in range(1, 5):
            with self.subTest(first_creation_fsync=failing_call):
                with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
                    path = Path(directory) / "ledger"
                    real_fsync = calibration.os.fsync
                    calls = 0

                    def fail_one_creation_fsync(fd):
                        nonlocal calls
                        calls += 1
                        if calls == failing_call:
                            raise OSError(f"simulated fsync {failing_call}")
                        return real_fsync(fd)

                    with mock.patch.object(
                        calibration.os,
                        "fsync",
                        side_effect=fail_one_creation_fsync,
                    ):
                        with self.assertRaisesRegex(
                            OSError, f"simulated fsync {failing_call}"
                        ):
                            calibration.append_local_game(
                                path,
                                self.protocol,
                                fixture_observation(self.protocol, 1),
                                repository_root=self.repository_root,
                            )
                    entries = path / "entries"
                    self.assertEqual(
                        list(entries.glob("[0-9]*.json")) if entries.exists() else [],
                        [],
                    )
                    retry = calibration.append_local_game(
                        path,
                        self.protocol,
                        fixture_observation(self.protocol, 1),
                        repository_root=self.repository_root,
                    )
                    self.assertEqual(retry["status"], "committed")

    def test_post_publication_failures_reconcile_and_retry_idempotently(self):
        for boundary in ("link", "first-fsync", "unlink", "second-fsync"):
            with self.subTest(boundary=boundary):
                with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
                    path = Path(directory) / "ledger"
                    observation = fixture_observation(self.protocol, 1)
                    real_link = calibration.os.link
                    real_unlink = calibration.os.unlink
                    real_fsync = calibration.os.fsync
                    failed = False
                    entries_fsyncs = 0

                    def maybe_fail_link(*args, **kwargs):
                        nonlocal failed
                        result = real_link(*args, **kwargs)
                        if boundary == "link" and not failed:
                            failed = True
                            raise OSError("simulated post-link failure")
                        return result

                    def maybe_fail_unlink(name, *, dir_fd=None):
                        nonlocal failed
                        if (
                            boundary == "unlink"
                            and str(name).startswith(".tmp-")
                            and not failed
                        ):
                            failed = True
                            raise OSError("simulated unlink failure")
                        return real_unlink(name, dir_fd=dir_fd)

                    def maybe_fail_fsync(fd):
                        nonlocal failed, entries_fsyncs
                        info = os.fstat(fd)
                        entries = path / "entries"
                        if (
                            entries.exists()
                            and stat.S_ISDIR(info.st_mode)
                            and info.st_ino == entries.stat().st_ino
                        ):
                            entries_fsyncs += 1
                            target = 1 if boundary == "first-fsync" else 2
                            if (
                                boundary in ("first-fsync", "second-fsync")
                                and entries_fsyncs == target
                                and not failed
                            ):
                                failed = True
                                raise OSError(f"simulated {boundary} failure")
                        return real_fsync(fd)

                    with (
                        mock.patch.object(
                            calibration.os, "link", side_effect=maybe_fail_link
                        ),
                        mock.patch.object(
                            calibration.os, "unlink", side_effect=maybe_fail_unlink
                        ),
                        mock.patch.object(
                            calibration.os, "fsync", side_effect=maybe_fail_fsync
                        ),
                    ):
                        result = calibration.append_local_game(
                            path,
                            self.protocol,
                            observation,
                            repository_root=self.repository_root,
                        )
                    self.assertTrue(failed)
                    self.assertEqual(result["status"], "committed")
                    self.assertTrue(result["reconciled_after_error"])
                    retry = calibration.append_local_game(
                        path,
                        self.protocol,
                        observation,
                        repository_root=self.repository_root,
                    )
                    self.assertTrue(retry["recovered_existing_commit"])
                    raw = calibration.authoritative_ledger_jsonl(
                        path,
                        self.protocol,
                        repository_root=self.repository_root,
                    )
                    self.assertEqual(
                        len(
                            calibration.parse_ledger(
                                raw,
                                self.protocol,
                                repository_root=self.repository_root,
                            )
                        ),
                        1,
                    )

    def test_persistent_post_link_fsync_failure_is_indeterminate_then_recoverable(self):
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            path = Path(directory) / "ledger"
            observation = fixture_observation(self.protocol, 1)
            real_link = calibration.os.link
            real_fsync = calibration.os.fsync
            link_failed = False

            def publish_then_raise(*args, **kwargs):
                nonlocal link_failed
                real_link(*args, **kwargs)
                link_failed = True
                raise OSError("simulated ambiguous link return")

            def fail_entries_fsync(fd):
                info = os.fstat(fd)
                entries = path / "entries"
                if (
                    link_failed
                    and entries.exists()
                    and stat.S_ISDIR(info.st_mode)
                    and info.st_ino == entries.stat().st_ino
                ):
                    raise OSError("simulated persistent entries fsync failure")
                return real_fsync(fd)

            with (
                mock.patch.object(
                    calibration.os, "link", side_effect=publish_then_raise
                ),
                mock.patch.object(
                    calibration.os, "fsync", side_effect=fail_entries_fsync
                ),
            ):
                with self.assertRaisesRegex(
                    calibration.AppendIndeterminateError,
                    "durable publication is indeterminate",
                ) as caught:
                    calibration.append_local_game(
                        path,
                        self.protocol,
                        observation,
                        repository_root=self.repository_root,
                    )
            self.assertEqual(
                caught.exception.status,
                "indeterminate-stop-and-inspect",
            )
            recovered = calibration.append_local_game(
                path,
                self.protocol,
                observation,
                repository_root=self.repository_root,
            )
            self.assertTrue(recovered["recovered_existing_commit"])
            self.assertEqual(recovered["status"], "committed")

    def test_complete_receipt_keeps_primary_decision_separate_from_bootstrap(self):
        with mock.patch.object(calibration, "BOOTSTRAP_REPLICATES", 100):
            receipt = finalize_fixture(
                self.protocol,
                self.repository_root,
                self.complete_ledger,
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
        self.assertEqual(
            receipt["ledger"]["authority"],
            "locked-immutable-entry-directory-only",
        )
        self.assertEqual(
            len(receipt["ledger"]["authoritative_manifest"]["entries"]),
            calibration.GAME_COUNT,
        )

    def test_raw_jsonl_cannot_issue_a_terminal_receipt(self):
        with self.assertRaisesRegex(ValueError, "path is invalid"):
            calibration.finalize_calibration(
                self.complete_ledger,
                self.protocol,
                repository_root=self.repository_root,
            )

    def test_final_gate_fails_closed_on_incomplete_low_selected_or_faulted_data(self):
        with self.assertRaisesRegex(ValueError, "exactly 200"):
            finalize_fixture(
                self.protocol,
                self.repository_root,
                fixture_ledger(
                    self.protocol,
                    self.repository_root,
                    calibration.GAME_COUNT - 1,
                ),
            )
        with self.assertRaisesRegex(ValueError, "below 2050"):
            finalize_fixture(
                self.protocol,
                self.repository_root,
                fixture_ledger(
                    self.protocol,
                    self.repository_root,
                    calibration.GAME_COUNT,
                    low_rating_sequence=calibration.STABILITY_FIRST_GAME,
                ),
            )
        with self.assertRaisesRegex(ValueError, "selected pairing"):
            finalize_fixture(
                self.protocol,
                self.repository_root,
                fixture_ledger(
                    self.protocol,
                    self.repository_root,
                    calibration.GAME_COUNT,
                    selected_sequence=77,
                ),
            )
        with self.assertRaisesRegex(ValueError, "technical fault"):
            finalize_fixture(
                self.protocol,
                self.repository_root,
                fixture_ledger(
                    self.protocol,
                    self.repository_root,
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
                    fixture_ledger(self.protocol, self.repository_root, 1),
                    self.protocol,
                    repository_root=self.repository_root,
                )[0]
            )
            + b" \n"
        )
        with self.assertRaisesRegex(ValueError, "not canonical JSON"):
            calibration.parse_ledger(
                pretty,
                self.protocol,
                repository_root=self.repository_root,
            )


if __name__ == "__main__":
    unittest.main()
