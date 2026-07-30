from __future__ import annotations

import copy
import inspect
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


ML_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = ML_DIR.parent
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import direct_teacher_halfkp81_v4_robust_protocol as PROTOCOL  # noqa: E402
import run_direct_teacher_halfkp81_v4_robust_adjudication as RUNNER  # noqa: E402


TRACKED_PROTOCOL = (
    ML_DIR / "protocols" / "direct-teacher-halfkp81-v4-robust-adjudication-plan.json"
)


def _analysis() -> dict:
    return {
        "schema": "shogi-direct-teacher-halfkp81-v3-quantization-diagnosis-v1",
        "status": "complete-read-only-no-authority",
        "authority": {
            "optimizer_created": False,
            "training_rows": 0,
        },
        "inputs": {
            "candidate_weights": copy.deepcopy(PROTOCOL.EXPECTED_CANDIDATE),
        },
        "candidate": {
            "abs_cp_delta_distribution": {
                "max_cp": PROTOCOL.EXPECTED_KNOWN_OBSERVATIONS[
                    "absolute_max_cp_delta_maximum"
                ],
            },
            "weight_scale": {
                name: {"int16_clipping_coordinates": 0}
                for name in ("w1_board", "w1_hand", "w2", "w3")
            },
        },
        "candidate_over_initializer_ratios": {
            "p99_9_cp": PROTOCOL.EXPECTED_KNOWN_OBSERVATIONS[
                "nearest_rank_p99_9_candidate_over_initializer_ratio_maximum"
            ],
        },
        "deployed_int16_candidate_over_initializer": {
            "teacher_mae_cp_improvement": PROTOCOL.EXPECTED_KNOWN_OBSERVATIONS[
                "deployed_int16_teacher_mae_cp_improvement_minimum"
            ],
            "pair_accuracy_delta": PROTOCOL.EXPECTED_KNOWN_OBSERVATIONS[
                "deployed_int16_pair_accuracy_delta_minimum"
            ],
        },
    }


def _v3_static() -> dict:
    return {
        "schema": PROTOCOL.V3_STATIC_SCHEMA,
        "status": PROTOCOL.V3_STATIC_STATUS,
        "all_checks_passed": False,
        "technical_faults": 0,
        "paired56_authorized": False,
        "expanded_stage_authorized": False,
        "live_weight_write_authorized": False,
        "one_shot_claim": {
            "status": "exclusive-v3-cpu-one-shot-claimed-no-retry",
            "additional_run_authorized": False,
        },
        "candidate_weights": copy.deepcopy(PROTOCOL.EXPECTED_CANDIDATE),
        "checks": {
            "quantized_max_abs_cp_delta_ratio_maximum": {
                "observed": 1.1732157215750398,
                "requirement": 1.05,
                "passed": False,
            },
            "wasm_parity_mismatches_maximum": {
                "observed": 0,
                "requirement": 0,
                "passed": True,
            },
            "research_runtime_search_slowdown_percent_maximum": {
                "observed": 2.495517211805487,
                "requirement": 5,
                "passed": True,
            },
        },
    }


class DirectTeacherHalfkp81V4RobustProtocolTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.source_revision = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        cls.protocol_raw, observed = PROTOCOL.load_strict_json_file(
            str(TRACKED_PROTOCOL),
            "tracked v4 protocol",
        )
        cls.protocol = PROTOCOL.validate_protocol_document(cls.protocol_raw)
        cls.protocol_identity = {
            "path": (
                "ml/protocols/"
                "direct-teacher-halfkp81-v4-robust-adjudication-plan.json"
            ),
            "bytes": observed["bytes"],
            "sha256": observed["sha256"],
            "schema": PROTOCOL.PROTOCOL_SCHEMA,
        }
        cls.diagnosis_identity = copy.deepcopy(
            cls.protocol["diagnosis_dependency"]["memo"]
        )
        cls.candidate_identity = copy.deepcopy(cls.protocol["candidate"])

    def test_tracked_protocol_discloses_known_values_and_locks_authority(self) -> None:
        protocol = self.protocol
        self.assertTrue(protocol["diagnostic_values_known_before_preregistration"])
        self.assertEqual(
            protocol["candidate"]["sha256"],
            "9ba78c70253d0f8ebfb6d0412f54532c53e5fbd495a585ae057f979c1633933a",
        )
        self.assertEqual(protocol["thresholds"], PROTOCOL.EXPECTED_THRESHOLDS)
        self.assertEqual(
            protocol["calculation"]["percentile"],
            "nearest-rank",
        )
        self.assertEqual(
            protocol["paired_screen"]["fresh_opening_selection"]["pairs"],
            28,
        )
        self.assertEqual(
            protocol["paired_screen"]["fresh_opening_selection"][
                "pair_seed_scan_start"
            ],
            1_300_001,
        )
        self.assertFalse(protocol["forbidden"]["old_v3_paired56_authorized"])
        self.assertFalse(protocol["forbidden"]["additional_optimizer_created"])
        self.assertFalse(protocol["forbidden"]["expanded_stage_authorized"])
        self.assertFalse(protocol["forbidden"]["live_weight_write_authorized"])

    def test_protocol_rejects_threshold_candidate_dependency_and_authority_drift(
        self,
    ) -> None:
        mutations = {
            "threshold": lambda value: value["thresholds"].__setitem__(
                "absolute_max_cp_delta_maximum", 301.0
            ),
            "known-observation": lambda value: value["known_observations"].__setitem__(
                "absolute_max_cp_delta_maximum", 200.0
            ),
            "candidate": lambda value: value["candidate"].__setitem__(
                "sha256", "0" * 64
            ),
            "diagnosis-pr": lambda value: value["diagnosis_dependency"].__setitem__(
                "pull_request", 0
            ),
            "v3-reopen": lambda value: value["source_v3"].__setitem__(
                "family_closed", False
            ),
            "claim": lambda value: value["claim"].__setitem__(
                "additional_claim_authorized", True
            ),
            "old-screen": lambda value: value["forbidden"].__setitem__(
                "old_v3_paired56_authorized", True
            ),
            "optimizer": lambda value: value["forbidden"].__setitem__(
                "additional_optimizer_created", True
            ),
            "expanded": lambda value: value["forbidden"].__setitem__(
                "expanded_stage_authorized", True
            ),
            "live": lambda value: value["forbidden"].__setitem__(
                "live_weight_write_authorized", True
            ),
            "executed": lambda value: value["current_state"].__setitem__(
                "adjudication_executed", True
            ),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                changed = copy.deepcopy(self.protocol)
                mutate(changed)
                with self.assertRaises(PROTOCOL.DirectTeacherHalfkpV4RobustError):
                    PROTOCOL.validate_protocol_document(changed)

    def test_merged_diagnosis_memo_matches_disclosed_protocol(self) -> None:
        memo_path = REPO_ROOT / self.diagnosis_identity["path"]
        memo_raw, observed = PROTOCOL.load_strict_json_file(
            str(memo_path),
            "merged diagnosis memo",
        )
        self.assertEqual(observed["bytes"], self.diagnosis_identity["bytes"])
        self.assertEqual(observed["sha256"], self.diagnosis_identity["sha256"])
        PROTOCOL.validate_diagnosis_memo(memo_raw, protocol=self.protocol)

    def test_only_the_closed_max_only_v3_failure_is_accepted(self) -> None:
        source = _v3_static()
        PROTOCOL.validate_closed_v3_static(source)
        changed = copy.deepcopy(source)
        changed["checks"]["wasm_parity_mismatches_maximum"]["passed"] = False
        with self.assertRaises(PROTOCOL.DirectTeacherHalfkpV4RobustError):
            PROTOCOL.validate_closed_v3_static(changed)
        changed = copy.deepcopy(source)
        changed["paired56_authorized"] = True
        with self.assertRaises(PROTOCOL.DirectTeacherHalfkpV4RobustError):
            PROTOCOL.validate_closed_v3_static(changed)

    def test_observations_are_rebuilt_from_exact_int16_and_runtime_evidence(
        self,
    ) -> None:
        observed = PROTOCOL.observations_from_diagnosis(
            _analysis(),
            v3_static=_v3_static(),
        )
        self.assertEqual(observed, PROTOCOL.EXPECTED_KNOWN_OBSERVATIONS)
        checks = PROTOCOL.build_checks(observed)
        self.assertTrue(all(item["passed"] for item in checks.values()))

    def test_fractional_clipping_and_wasm_counts_are_rejected_not_truncated(
        self,
    ) -> None:
        analysis = _analysis()
        analysis["candidate"]["weight_scale"]["w2"]["int16_clipping_coordinates"] = 0.9
        with self.assertRaises(PROTOCOL.DirectTeacherHalfkpV4RobustError):
            PROTOCOL.observations_from_diagnosis(
                analysis,
                v3_static=_v3_static(),
            )
        source = _v3_static()
        source["checks"]["wasm_parity_mismatches_maximum"]["observed"] = 0.9
        with self.assertRaises(PROTOCOL.DirectTeacherHalfkpV4RobustError):
            PROTOCOL.observations_from_diagnosis(
                _analysis(),
                v3_static=source,
            )

    def test_result_pass_authorizes_only_fresh_v4_paired56(self) -> None:
        claim = PROTOCOL.build_claim(
            protocol_identity=self.protocol_identity,
            diagnosis_identity=self.diagnosis_identity,
            candidate_identity=self.candidate_identity,
            source_revision=self.source_revision,
            owner_pid=123,
            repo_root=str(REPO_ROOT),
        )
        result = PROTOCOL.build_result(
            protocol_identity=self.protocol_identity,
            diagnosis_identity=self.diagnosis_identity,
            v3_static_identity=copy.deepcopy(
                self.protocol["source_v3"]["static_result"]
            ),
            candidate_identity=self.candidate_identity,
            claim=claim,
            observations=PROTOCOL.EXPECTED_KNOWN_OBSERVATIONS,
            repo_root=str(REPO_ROOT),
        )
        validated = PROTOCOL.validate_result(result, repo_root=str(REPO_ROOT))
        self.assertTrue(validated["all_checks_passed"])
        self.assertTrue(validated["authority"]["fresh_v4_paired56_authorized"])
        for field in (
            "old_v3_paired56_authorized",
            "optimizer_creation_authorized",
            "candidate_mutation_authorized",
            "expanded_stage_authorized",
            "live_weight_write_authorized",
            "playing_strength_claim_authorized",
        ):
            self.assertFalse(validated["authority"][field])
        self.assertEqual(validated["authority"]["additional_training_rows"], 0)
        forged = copy.deepcopy(validated)
        forged["candidate"] = {
            "path": "/tmp/forged.bin",
            "bytes": 1,
            "sha256": "3" * 64,
        }
        forged["claim"]["candidate"] = copy.deepcopy(forged["candidate"])
        with self.assertRaises(PROTOCOL.DirectTeacherHalfkpV4RobustError):
            PROTOCOL.validate_result(forged, repo_root=str(REPO_ROOT))

    def test_any_static_miss_closes_v4_without_downstream_authority(self) -> None:
        observations = copy.deepcopy(PROTOCOL.EXPECTED_KNOWN_OBSERVATIONS)
        observations["deployed_int16_pair_accuracy_delta_minimum"] = -0.000001
        claim = PROTOCOL.build_claim(
            protocol_identity=self.protocol_identity,
            diagnosis_identity=self.diagnosis_identity,
            candidate_identity=self.candidate_identity,
            source_revision=self.source_revision,
            owner_pid=456,
            repo_root=str(REPO_ROOT),
        )
        result = PROTOCOL.build_result(
            protocol_identity=self.protocol_identity,
            diagnosis_identity=self.diagnosis_identity,
            v3_static_identity=copy.deepcopy(
                self.protocol["source_v3"]["static_result"]
            ),
            candidate_identity=self.candidate_identity,
            claim=claim,
            observations=observations,
            repo_root=str(REPO_ROOT),
        )
        self.assertFalse(result["all_checks_passed"])
        self.assertFalse(result["authority"]["fresh_v4_paired56_authorized"])
        PROTOCOL.validate_result(result, repo_root=str(REPO_ROOT))

    def test_nonexistent_source_revision_cannot_create_or_validate_authority(
        self,
    ) -> None:
        with self.assertRaises(PROTOCOL.DirectTeacherHalfkpV4RobustError):
            PROTOCOL.build_claim(
                protocol_identity=self.protocol_identity,
                diagnosis_identity=self.diagnosis_identity,
                candidate_identity=self.candidate_identity,
                source_revision="0" * 40,
                owner_pid=1,
                repo_root=str(REPO_ROOT),
            )
        with self.assertRaises(PROTOCOL.DirectTeacherHalfkpV4RobustError):
            PROTOCOL.build_claim(
                protocol_identity=self.protocol_identity,
                diagnosis_identity=self.diagnosis_identity,
                candidate_identity=self.candidate_identity,
                source_revision=PROTOCOL.EXPECTED_DIAGNOSIS_DEPENDENCY[
                    "merge_revision"
                ],
                owner_pid=1,
                repo_root=str(REPO_ROOT),
            )
        valid_claim = PROTOCOL.build_claim(
            protocol_identity=self.protocol_identity,
            diagnosis_identity=self.diagnosis_identity,
            candidate_identity=self.candidate_identity,
            source_revision=self.source_revision,
            owner_pid=1,
            repo_root=str(REPO_ROOT),
        )
        forged_claim = copy.deepcopy(valid_claim)
        forged_claim["source_revision"] = "0" * 40
        with self.assertRaises(PROTOCOL.DirectTeacherHalfkpV4RobustError):
            PROTOCOL.build_result(
                protocol_identity=self.protocol_identity,
                diagnosis_identity=self.diagnosis_identity,
                v3_static_identity=copy.deepcopy(
                    self.protocol["source_v3"]["static_result"]
                ),
                candidate_identity=self.candidate_identity,
                claim=forged_claim,
                observations=PROTOCOL.EXPECTED_KNOWN_OBSERVATIONS,
                repo_root=str(REPO_ROOT),
            )

    def test_runner_contains_no_training_or_optimizer_path(self) -> None:
        source = (
            ML_DIR / "run_direct_teacher_halfkp81_v4_robust_adjudication.py"
        ).read_text(encoding="utf-8")
        self.assertNotIn("torch.optim", source)
        self.assertNotIn(".backward(", source)
        self.assertNotIn(".step(", source)
        self.assertNotIn("train_exactly_one_epoch", source)
        self.assertNotIn(
            "source_revision_override_for_tests",
            inspect.signature(RUNNER.run).parameters,
        )

    def test_runner_reauthenticates_source_and_code_after_long_recomputation(
        self,
    ) -> None:
        source = inspect.getsource(RUNNER.run)
        recompute = source.index("observations = _recompute_observations(")
        self.assertGreater(
            source.rindex("source_revision_after = verify_source_revision("),
            recompute,
        )
        self.assertGreater(
            source.rindex("protocol_after, protocol_identity_after = _load_protocol("),
            recompute,
        )
        self.assertGreater(
            source.rindex('label="merged v3 diagnosis analyzer after recomputation"'),
            recompute,
        )

    def test_create_only_publication_is_mode_0600_and_nonreplaceable(self) -> None:
        with tempfile.TemporaryDirectory(
            prefix=".shogi-v4-publication-test-",
            dir=Path.home(),
        ) as directory:
            path = str(Path(directory) / "result.json")
            value = {"schema": "test-v1", "status": "complete"}
            identity = RUNNER.publish_create_only(value, path=path)
            self.assertEqual(identity["path"], path)
            self.assertEqual(
                Path(path).read_bytes(),
                PROTOCOL.canonical_json_bytes(value),
            )
            self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)
            with self.assertRaises(RUNNER.DirectTeacherHalfkpV4RunError):
                RUNNER.publish_create_only(value, path=path)

    def test_secure_directory_rejects_an_actual_symlink_component(self) -> None:
        with tempfile.TemporaryDirectory(
            prefix=".shogi-v4-symlink-test-",
            dir=Path.home(),
        ) as directory:
            real = Path(directory) / "real"
            real.mkdir(mode=0o700)
            alias = Path(directory) / "alias"
            alias.symlink_to(real, target_is_directory=True)
            with self.assertRaises(RUNNER.DirectTeacherHalfkpV4RunError):
                RUNNER._ensure_secure_directory(str(alias / "nested"))

    def test_any_existing_family_claim_blocks_a_different_protocol_key(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory(
            prefix=".shogi-v4-claim-test-",
            dir=Path.home(),
        ) as directory:
            claim_directory = Path(directory) / "claims"
            claim_directory.mkdir(mode=0o700)
            (claim_directory / ("a" * 64 + ".json")).write_text(
                "{}",
                encoding="utf-8",
            )
            with (
                mock.patch.object(
                    PROTOCOL,
                    "CLAIM_DIRECTORY_PATH",
                    str(claim_directory),
                ),
                mock.patch.object(
                    PROTOCOL,
                    "RESULT_PATH",
                    str(Path(directory) / "result.json"),
                ),
                self.assertRaises(RUNNER.DirectTeacherHalfkpV4RunError),
            ):
                RUNNER.preflight_publication(PROTOCOL.EXPECTED_PROTOCOL_IDENTITY)

    def test_claim_consumes_the_family_directory_not_a_protocol_sha_slot(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory(
            prefix=".shogi-v4-exclusive-claim-test-",
            dir=Path.home(),
        ) as directory:
            claim_directory = Path(directory) / "claims"
            claim = PROTOCOL.build_claim(
                protocol_identity=PROTOCOL.EXPECTED_PROTOCOL_IDENTITY,
                diagnosis_identity=PROTOCOL.EXPECTED_DIAGNOSIS_DEPENDENCY["memo"],
                candidate_identity=PROTOCOL.EXPECTED_CANDIDATE,
                source_revision=self.source_revision,
                owner_pid=789,
                repo_root=str(REPO_ROOT),
            )
            with mock.patch.object(
                PROTOCOL,
                "CLAIM_DIRECTORY_PATH",
                str(claim_directory),
            ):
                identity = RUNNER.publish_family_claim_once(
                    claim,
                    protocol_identity=PROTOCOL.EXPECTED_PROTOCOL_IDENTITY,
                )
                self.assertEqual(identity["path"], str(claim_directory / "claim.json"))
                self.assertEqual(
                    os.stat(claim_directory).st_mode & 0o777,
                    0o700,
                )
                with self.assertRaises(RUNNER.DirectTeacherHalfkpV4RunError):
                    RUNNER.publish_family_claim_once(
                        claim,
                        protocol_identity=PROTOCOL.EXPECTED_PROTOCOL_IDENTITY,
                    )

    def test_source_revision_requires_a_fully_clean_tracked_and_untracked_tree(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory(
            prefix=".shogi-v4-git-test-",
            dir=Path.home(),
        ) as directory:
            for args in (
                ("init",),
                ("config", "user.name", "v4-test"),
                ("config", "user.email", "v4-test@example.invalid"),
            ):
                subprocess.run(
                    ["git", *args],
                    cwd=directory,
                    check=True,
                    capture_output=True,
                    text=True,
                )
            (Path(directory) / "tracked.txt").write_text("fixed\n", encoding="utf-8")
            subprocess.run(
                ["git", "add", "tracked.txt"],
                cwd=directory,
                check=True,
            )
            subprocess.run(
                ["git", "commit", "-m", "fixture"],
                cwd=directory,
                check=True,
                capture_output=True,
                text=True,
            )
            revision = subprocess.run(
                ["git", "rev-parse", "HEAD"],
                cwd=directory,
                check=True,
                capture_output=True,
                text=True,
            ).stdout.strip()
            self.assertEqual(
                RUNNER.verify_source_revision(
                    repo_root=directory,
                    diagnosis_merge_revision=revision,
                ),
                revision,
            )
            (Path(directory) / "untracked.txt").write_text(
                "not clean\n",
                encoding="utf-8",
            )
            with self.assertRaises(RUNNER.DirectTeacherHalfkpV4RunError):
                RUNNER.verify_source_revision(
                    repo_root=directory,
                    diagnosis_merge_revision=revision,
                )

    def test_tracked_protocol_is_valid_json_without_duplicate_projection(self) -> None:
        parsed = json.loads(TRACKED_PROTOCOL.read_text(encoding="utf-8"))
        self.assertEqual(parsed, self.protocol_raw)


if __name__ == "__main__":
    unittest.main()
