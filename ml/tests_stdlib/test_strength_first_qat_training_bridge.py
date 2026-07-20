import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import fresh_qat_parent_accounting_v2 as ACCOUNTING  # noqa: E402
import fresh_qat_protocol as FRESH  # noqa: E402
import strength_first_qat_training_bridge as BRIDGE  # noqa: E402
from ml.tests_stdlib.test_fresh_qat_parent_accounting_v2 import (  # noqa: E402
    make_artifacts,
)


def file_identity(path, digest):
    return {"path": path, "bytes": 1, "sha256": digest}


def provenance_summary(
    *,
    target=24_000,
    forced=1_000,
    emitted=23_000,
    train_records=46_000,
    milestones=(100, 500),
    generation="v8",
    proposal_incomplete=0,
):
    summary = {
        "schema": (
            BRIDGE.STRENGTH_FIRST_V9_PROVENANCE_SUMMARY_SCHEMA
            if generation == "v9"
            else BRIDGE.STRENGTH_FIRST_V8_PROVENANCE_SUMMARY_SCHEMA
        ),
        "status": (
            BRIDGE.STRENGTH_FIRST_V9_PROVENANCE_SUMMARY_STATUS
            if generation == "v9"
            else BRIDGE.STRENGTH_FIRST_V8_PROVENANCE_SUMMARY_STATUS
        ),
        "target_parents": target,
        "emitted_parent_groups": emitted,
        "forced_parents_skipped": forced,
        "fewer_than_two_legal_moves": forced - proposal_incomplete,
        "search_timeout_no_label": 0,
        "train_records": train_records,
        "milestone_targets": list(milestones),
        "local_only": True,
        "network_requests": 0,
        "cloud_services": 0,
        "live_weight_changes": 0,
        "training_only": True,
        "private_identifiers_disclosed": False,
        "private_digests_disclosed": False,
    }
    if generation == "v9":
        summary["proposal_incomplete_no_label"] = proposal_incomplete
    return summary


def complete_plan(*, generation="v8"):
    completion = {
        "path": "parent-completion.jsonl",
        "format": ACCOUNTING.FRESH_QAT_PARENT_COMPLETION_FORMAT,
        "bytes": 1,
        "sha256": "4" * 64,
        "records": 24_000,
        "forced_parents_skipped": 1_000,
        "emitted_parent_groups": 23_000,
        "parent_ids_sha256": (
            ACCOUNTING.PRODUCTION_INPUT_TRAINING_BINDING[
                "parent_ids_sha256"
            ]
        ),
        "forced_parent_ids_sha256": "5" * 64,
        "emitted_parent_ids_sha256": "6" * 64,
    }
    model_training = {
        "path": "train.jsonl",
        "format": BRIDGE.STRENGTH_FIRST_TRAIN_FORMAT,
        "bytes": 1,
        "sha256": "7" * 64,
        "records": 46_000,
        "parents": 23_000,
        "games": 1_000,
        "game_ids_sha256": "8" * 64,
        "parent_ids_sha256": "6" * 64,
        "semantic_position_ids_count": 46_000,
        "semantic_position_ids_sha256": "9" * 64,
    }
    return {
        "schema": (
            BRIDGE.STRENGTH_FIRST_QAT_EXECUTION_PLAN_SCHEMA
            if generation == "v9"
            else BRIDGE.STRENGTH_FIRST_QAT_EXECUTION_PLAN_V2_SCHEMA
        ),
        "status": BRIDGE.STRENGTH_FIRST_QAT_PLAN_STATUS,
        "artifacts": {
            "role_bundle_manifest": file_identity("manifest.json", "1" * 64),
            "input_training": copy.deepcopy(
                ACCOUNTING.PRODUCTION_INPUT_TRAINING_BINDING
            ),
            "teacher_result": file_identity("result.json", "3" * 64),
            "parent_completion": completion,
            "model_training": model_training,
            "replay_exclusion": {
                "path": "replay-excluded-position-ids.txt",
                "format": FRESH.FRESH_QAT_ID_SET_FORMAT,
                "bytes": 72,
                "sha256": "a" * 64,
                "count": 1,
                "identifiers_sha256": "b" * 64,
            },
            "replay": {
                "path": "runOp1-train.jsonl",
                "bytes": FRESH.FRESH_QAT_REPLAY_BYTES,
                "sha256": FRESH.FRESH_QAT_REPLAY_SHA256,
            },
            "warm_initializer": {
                "path": "runOp1-best.pt",
                "bytes": FRESH.FRESH_QAT_WARM_INITIALIZER_BYTES,
                "sha256": FRESH.FRESH_QAT_WARM_INITIALIZER_SHA256,
            },
        },
        "teacher_provenance": provenance_summary(generation=generation),
        "runtime": {
            "platform": "synthetic-platform",
            "system": "Darwin",
            "machine": "arm64",
            "processor": "arm",
            "cpu_model": "synthetic-cpu",
            "logical_cpu_count": 14,
            "device": "cpu",
            "python_version": "3.13.0",
            "torch_version": "2.12.1",
            "torch_threads": 2,
            "torch_interop_threads": 1,
            "deterministic_algorithms": True,
            "deterministic_debug_mode": "error",
        },
        "training": copy.deepcopy(FRESH.FRESH_QAT_REQUIRED_TRAINING),
        "slots": [
            {
                "id": (
                    f"floodgate-strength-first-int16-aware-seed-{seed}"
                ),
                "seed": seed,
                "output": (
                    f"{BRIDGE.STRENGTH_FIRST_QAT_RUN_ROOT}/seed-{seed}"
                ),
            }
            for seed in FRESH.FRESH_QAT_SLOT_ORDER
        ],
        "boundary": {
            "training_only": True,
            "selection_label_read_authorized": False,
            "holdout_label_read_authorized": False,
            "candidate_selection_authorized": False,
            "production_weight_write_authorized": False,
        },
    }


def teacher_documents(plan):
    artifacts = plan["artifacts"]
    generation = (
        "v9"
        if plan["teacher_provenance"]["schema"]
        == BRIDGE.STRENGTH_FIRST_V9_PROVENANCE_SUMMARY_SCHEMA
        else "v8"
    )

    def projection(identity):
        return {
            key: identity[key] for key in ("path", "bytes", "sha256")
        }

    manifest = {
        "schema": BRIDGE.STRENGTH_FIRST_TEACHER_MANIFEST_SCHEMA,
        "status": "complete-training-only",
        "forced_skip_reasons": {
            "fewer_than_two_legal_moves": artifacts["parent_completion"][
                "forced_parents_skipped"
            ],
            "search_timeout_no_label": 0,
            **(
                {"proposal_incomplete_no_label": 0}
                if generation == "v9"
                else {}
            ),
        },
        "parent_completion": copy.deepcopy(
            artifacts["parent_completion"]
        ),
        "outputs": {
            "train": copy.deepcopy(artifacts["model_training"]),
        },
    }
    result = {
        "schema": (
            BRIDGE.STRENGTH_FIRST_V9_TEACHER_RESULT_SCHEMA
            if generation == "v9"
            else BRIDGE.STRENGTH_FIRST_TEACHER_RESULT_SCHEMA
        ),
        "status": (
            BRIDGE.STRENGTH_FIRST_V9_TEACHER_RESULT_STATUS
            if generation == "v9"
            else BRIDGE.STRENGTH_FIRST_TEACHER_RESULT_STATUS
        ),
        "claim_boundary": (
            "fast-input-and-staged-output-integrity-not-playing-strength-evidence"
            if generation == "v9"
            else "postflight-input-and-staged-output-integrity-not-playing-strength-evidence"
        ),
        "runner": {
            "local_only": True,
            "network_requests": 0,
            "cloud_services": [],
            "live_weight_changes": 0,
        },
        "production_asset_preflight": {},
        "authenticated_input": {},
        **({"consumer_postflight": {}} if generation == "v8" else {}),
        "teacher": {},
        "milestones": {
            "targets": [100, 500, ACCOUNTING.FRESH_QAT_INPUT_PARENTS],
            "prefix_100": file_identity("milestone-100.json", "a" * 64),
            "prefix_500": file_identity("milestone-500.json", "b" * 64),
        },
        "completion": {
            "input_parents": ACCOUNTING.FRESH_QAT_INPUT_PARENTS,
            "completed_parents": ACCOUNTING.FRESH_QAT_INPUT_PARENTS,
            "forced_parents_skipped": artifacts["parent_completion"][
                "forced_parents_skipped"
            ],
            "forced_skip_reasons": copy.deepcopy(
                manifest["forced_skip_reasons"]
            ),
            "emitted_parent_groups": artifacts["parent_completion"][
                "emitted_parent_groups"
            ],
            "run_fingerprint": "f" * 64,
        },
        "staged_outputs": {
            "work": file_identity("work.jsonl", "d" * 64),
            "train": projection(artifacts["model_training"]),
            "parent_completion": projection(
                artifacts["parent_completion"]
            ),
            "manifest": file_identity("manifest.json", "2" * 64),
            "staged_result": file_identity(
                "staged-result.json",
                "e" * 64,
            ),
        },
        "publication": {},
    }
    return manifest, result


class StrengthFirstQATTrainingBridgeTests(unittest.TestCase):
    def test_role_manifest_rejects_non_object_nested_bindings(self):
        plan = complete_plan()
        artifacts = plan["artifacts"]
        expected_input = copy.deepcopy(artifacts["input_training"])
        expected_input["records"] = expected_input.pop("parents")
        manifest = {
            "schema": BRIDGE.STRENGTH_FIRST_ROLE_BUNDLE_SCHEMA,
            "status": BRIDGE.STRENGTH_FIRST_ROLE_BUNDLE_STATUS,
            "provenance": {
                "labeled_final_holdout_read": False,
                "labeled_selection_read": False,
                "teacher_or_candidate_scores_read": False,
            },
            "roles": {
                "training": {
                    "raw_parents": expected_input,
                }
            },
            "replay_exclusion": {
                "identifiers": copy.deepcopy(
                    artifacts["replay_exclusion"]
                )
            },
        }
        BRIDGE._validate_role_manifest(manifest, artifacts)

        mutations = {
            "roles null": lambda item: item.__setitem__("roles", None),
            "training list": lambda item: item["roles"].__setitem__(
                "training",
                [],
            ),
            "replay exclusion null": lambda item: item.__setitem__(
                "replay_exclusion",
                None,
            ),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                changed = copy.deepcopy(manifest)
                mutate(changed)
                with self.assertRaisesRegex(
                    ValueError,
                    "role-bundle .* differs",
                ):
                    BRIDGE._validate_role_manifest(changed, artifacts)

    def test_neutral_scanner_binds_exact_source_completion_and_train(self):
        artifacts = make_artifacts([0, 2])
        scanned = BRIDGE.scan_strength_first_training_artifacts_exact(
            artifacts["input_raw"],
            artifacts["completion_raw"],
            artifacts["train_raw"],
            expected_input_binding=artifacts["input_binding"],
            expected_completion_binding=artifacts["completion_binding"],
        )
        self.assertEqual(scanned["parent_accounting"]["input_parents"], 4)
        self.assertEqual(
            scanned["parent_accounting"]["forced_parents_skipped"],
            2,
        )
        self.assertEqual(
            scanned["parent_accounting"]["emitted_parent_groups"],
            2,
        )
        self.assertEqual(scanned["model_training"]["records"], 4)
        self.assertEqual(
            set(scanned),
            {
                "input_training",
                "input_summary",
                "parent_completion",
                "model_training",
                "parent_accounting",
            },
        )
        self.assertFalse(
            {
                "selection",
                "holdout",
                "promotion",
                "production_weight_write_authorized",
            }
            & set(scanned)
        )

        with self.assertRaisesRegex(ValueError, "role binding"):
            BRIDGE.scan_strength_first_training_artifacts_exact(
                artifacts["input_raw"] + b"x",
                artifacts["completion_raw"],
                artifacts["train_raw"],
                expected_input_binding=artifacts["input_binding"],
                expected_completion_binding=artifacts["completion_binding"],
            )
        with self.assertRaisesRegex(ValueError, "authenticated identity"):
            BRIDGE.scan_strength_first_training_artifacts_exact(
                artifacts["input_raw"],
                artifacts["completion_raw"] + b"x",
                artifacts["train_raw"],
                expected_input_binding=artifacts["input_binding"],
                expected_completion_binding=artifacts["completion_binding"],
            )
        with self.assertRaisesRegex(
            ValueError,
            "groups differ|missing its train group",
        ):
            BRIDGE.scan_strength_first_training_artifacts_exact(
                artifacts["input_raw"],
                artifacts["completion_raw"],
                b"",
                expected_input_binding=artifacts["input_binding"],
                expected_completion_binding=artifacts["completion_binding"],
            )

    def test_complete_plan_is_training_only_and_exactly_three_warm_seeds(self):
        plan = complete_plan()
        validated = BRIDGE.validate_strength_first_qat_training_plan_data(
            plan
        )
        self.assertIs(validated, plan)
        self.assertEqual(
            [slot["seed"] for slot in plan["slots"]],
            [42, 43, 44],
        )
        self.assertEqual(plan["training"]["learning_rate"], 0.0001)
        self.assertEqual(plan["training"]["epochs"], 20)
        self.assertEqual(plan["training"]["batch"], 256)
        self.assertEqual(plan["training"]["device"], "cpu")
        self.assertEqual(plan["training"]["torch_threads"], 2)
        self.assertTrue(plan["boundary"]["training_only"])
        self.assertTrue(
            all(
                value is False
                for key, value in plan["boundary"].items()
                if key != "training_only"
            )
        )
        self.assertEqual(
            plan["schema"],
            BRIDGE.STRENGTH_FIRST_QAT_EXECUTION_PLAN_V2_SCHEMA,
        )

        v9_plan = complete_plan(generation="v9")
        BRIDGE.validate_strength_first_qat_training_plan_data(v9_plan)
        self.assertEqual(
            v9_plan["schema"],
            BRIDGE.STRENGTH_FIRST_QAT_EXECUTION_PLAN_SCHEMA,
        )
        with self.assertRaisesRegex(ValueError, "schema/source"):
            v9_plan["schema"] = BRIDGE.STRENGTH_FIRST_QAT_EXECUTION_PLAN_V2_SCHEMA
            BRIDGE.validate_strength_first_qat_training_plan_data(v9_plan)

    def test_default_teacher_paths_follow_the_v8_root(self):
        paths = BRIDGE.default_strength_first_local_paths(
            repo_root="/repo",
            home="/home/tester",
        )
        self.assertEqual(
            paths["teacher_result"],
            (
                "/home/tester/.codex/shogi-runs/"
                "floodgate-q1-2026-strength-first-v8/result.json"
            ),
        )
        v9_paths = BRIDGE.default_strength_first_local_paths(
            repo_root="/repo",
            home="/home/tester",
            teacher_generation="v9",
        )
        self.assertEqual(
            v9_paths["teacher_result"],
            (
                "/home/tester/.codex/shogi-runs/"
                "floodgate-q1-2026-strength-first-v9/result.json"
            ),
        )

    def test_plan_rejects_selection_holdout_live_or_training_drift(self):
        mutations = {
            "selection authority": lambda plan: plan["boundary"].__setitem__(
                "selection_label_read_authorized", True
            ),
            "holdout authority": lambda plan: plan["boundary"].__setitem__(
                "holdout_label_read_authorized", True
            ),
            "live write": lambda plan: plan["boundary"].__setitem__(
                "production_weight_write_authorized", True
            ),
            "seed": lambda plan: plan["slots"][2].__setitem__("seed", 45),
            "learning rate": lambda plan: plan["training"].__setitem__(
                "learning_rate", 0.001
            ),
            "initializer": lambda plan: plan["artifacts"][
                "warm_initializer"
            ].__setitem__("sha256", "0" * 64),
            "input": lambda plan: plan["artifacts"][
                "input_training"
            ].__setitem__("parents", 23_999),
            "private digest disclosure": lambda plan: plan[
                "teacher_provenance"
            ].__setitem__("private_digests_disclosed", True),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                plan = complete_plan()
                mutate(plan)
                with self.assertRaises(ValueError):
                    BRIDGE.validate_strength_first_qat_training_plan_data(
                        plan
                    )

    def test_teacher_documents_bind_postflight_completion_and_all_outputs(self):
        plan = complete_plan()
        manifest, result = teacher_documents(plan)
        BRIDGE._validate_teacher_documents(
            manifest,
            result,
            plan["artifacts"],
            plan["teacher_provenance"],
        )

        mutations = {
            "outer status": lambda manifest, result: result.__setitem__(
                "status", "complete-training-only"
            ),
            "completion count": lambda manifest, result: result[
                "completion"
            ].__setitem__("completed_parents", 23_999),
            "completion timeout reasons": lambda manifest, result: result[
                "completion"
            ]["forced_skip_reasons"].update(
                {
                    "fewer_than_two_legal_moves": 975,
                    "search_timeout_no_label": 25,
                }
            ),
            "manifest/result reason mismatch": (
                lambda manifest, result: manifest[
                    "forced_skip_reasons"
                ].update(
                    {
                        "fewer_than_two_legal_moves": 999,
                        "search_timeout_no_label": 1,
                    }
                )
            ),
            "result train binding": lambda manifest, result: result[
                "staged_outputs"
            ]["train"].__setitem__("bytes", 2),
            "manifest train binding": lambda manifest, result: manifest[
                "outputs"
            ]["train"].__setitem__("sha256", "0" * 64),
            "manifest completion binding": lambda manifest, result: manifest[
                "parent_completion"
            ].__setitem__("records", 23_999),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                manifest, result = teacher_documents(plan)
                mutate(manifest, result)
                with self.assertRaises(ValueError):
                    BRIDGE._validate_teacher_documents(
                        manifest,
                        result,
                        plan["artifacts"],
                        plan["teacher_provenance"],
                    )

        v9_plan = complete_plan(generation="v9")
        v9_manifest, v9_result = teacher_documents(v9_plan)
        BRIDGE._validate_teacher_documents(
            v9_manifest,
            v9_result,
            v9_plan["artifacts"],
            v9_plan["teacher_provenance"],
        )
        missing_manifest, missing_result = teacher_documents(v9_plan)
        del missing_manifest["forced_skip_reasons"][
            "proposal_incomplete_no_label"
        ]
        del missing_result["completion"]["forced_skip_reasons"][
            "proposal_incomplete_no_label"
        ]
        BRIDGE._validate_teacher_documents(
            missing_manifest,
            missing_result,
            v9_plan["artifacts"],
            v9_plan["teacher_provenance"],
        )
        for label in ("manifest", "result"):
            with self.subTest(v9_asymmetric_reason_presence=label):
                asymmetric_manifest, asymmetric_result = teacher_documents(
                    v9_plan
                )
                asymmetric_target = (
                    asymmetric_manifest["forced_skip_reasons"]
                    if label == "manifest"
                    else asymmetric_result["completion"][
                        "forced_skip_reasons"
                    ]
                )
                del asymmetric_target["proposal_incomplete_no_label"]
                with self.assertRaisesRegex(ValueError, "completion mismatch"):
                    BRIDGE._validate_teacher_documents(
                        asymmetric_manifest,
                        asymmetric_result,
                        v9_plan["artifacts"],
                        v9_plan["teacher_provenance"],
                    )
        positive_plan = complete_plan(generation="v9")
        positive_plan["teacher_provenance"] = provenance_summary(
            generation="v9",
            proposal_incomplete=1,
        )
        positive_manifest, positive_result = teacher_documents(positive_plan)
        for reasons in (
            positive_manifest["forced_skip_reasons"],
            positive_result["completion"]["forced_skip_reasons"],
        ):
            reasons["fewer_than_two_legal_moves"] = 999
            reasons["proposal_incomplete_no_label"] = 1
        BRIDGE._validate_teacher_documents(
            positive_manifest,
            positive_result,
            positive_plan["artifacts"],
            positive_plan["teacher_provenance"],
        )
        extra_manifest, extra_result = teacher_documents(v9_plan)
        extra_manifest["forced_skip_reasons"]["unexpected"] = 0
        with self.assertRaisesRegex(ValueError, "fields are not exact"):
            BRIDGE._validate_teacher_documents(
                extra_manifest,
                extra_result,
                v9_plan["artifacts"],
                v9_plan["teacher_provenance"],
            )
        v9_result["completion"]["forced_skip_reasons"] = {
            "fewer_than_two_legal_moves": 999,
            "search_timeout_no_label": 0,
            "proposal_incomplete_no_label": 1,
        }
        with self.assertRaisesRegex(ValueError, "completion mismatch"):
            BRIDGE._validate_teacher_documents(
                v9_manifest,
                v9_result,
                v9_plan["artifacts"],
                v9_plan["teacher_provenance"],
            )

    def test_teacher_work_fingerprint_detects_flat_root_byte_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory) / "work.jsonl"
            work.write_bytes(b'{"schema":"work"}\n')
            identity = {
                "path": "work.jsonl",
                "bytes": work.stat().st_size,
                "sha256": hashlib.sha256(work.read_bytes()).hexdigest(),
            }
            BRIDGE._verify_fingerprint(
                str(work),
                identity,
                "teacher work",
            )
            work.write_bytes(b'{"schema":"tampered"}\n')
            with self.assertRaisesRegex(ValueError, "identity mismatch"):
                BRIDGE._verify_fingerprint(
                    str(work),
                    identity,
                    "teacher work",
                )

    def test_injected_bridge_recomputes_all_three_sources_before_contract(self):
        source = make_artifacts([0, 2])
        input_identity = {
            **source["input_binding"],
            "path": "training.raw.jsonl",
        }
        completion_identity = {
            **source["completion_binding"],
            "path": "parent-completion.jsonl",
        }
        scan = BRIDGE.scan_strength_first_training_artifacts_exact(
            source["input_raw"],
            source["completion_raw"],
            source["train_raw"],
            expected_input_binding=input_identity,
            expected_completion_binding=completion_identity,
        )
        replay_exclusion = {
            "path": "replay-excluded-position-ids.txt",
            "format": FRESH.FRESH_QAT_ID_SET_FORMAT,
            "bytes": 72,
            "sha256": "a" * 64,
            "count": 1,
            "identifiers_sha256": "b" * 64,
        }
        role_manifest = {
            "schema": BRIDGE.STRENGTH_FIRST_ROLE_BUNDLE_SCHEMA,
            "status": BRIDGE.STRENGTH_FIRST_ROLE_BUNDLE_STATUS,
            "provenance": {
                "labeled_final_holdout_read": False,
                "labeled_selection_read": False,
                "teacher_or_candidate_scores_read": False,
            },
            "roles": {
                "training": {
                    "raw_parents": {
                        **input_identity,
                        "records": input_identity["parents"],
                    }
                }
            },
            "replay_exclusion": {"identifiers": replay_exclusion},
        }
        role_manifest["roles"]["training"]["raw_parents"].pop("parents")
        role_raw = json.dumps(
            role_manifest,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
        work_raw = b'{"schema":"shogi-sibling-teacher-work-v2"}\n'

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            paths = {
                **BRIDGE.default_strength_first_local_paths(
                    repo_root=root,
                    home=root / "home",
                )
            }
            plan = complete_plan()
            model_training_identity = {
                "path": "train.jsonl",
                "format": BRIDGE.STRENGTH_FIRST_TRAIN_FORMAT,
                **scan["model_training"],
            }
            work_identity = {
                "path": "work.jsonl",
                "bytes": len(work_raw),
                "sha256": hashlib.sha256(work_raw).hexdigest(),
            }
            teacher_manifest = {
                "schema": BRIDGE.STRENGTH_FIRST_TEACHER_MANIFEST_SCHEMA,
                "status": "complete-training-only",
                "forced_skip_reasons": {
                    "fewer_than_two_legal_moves": 2,
                    "search_timeout_no_label": 0,
                },
                "parent_completion": completion_identity,
                "outputs": {"train": model_training_identity},
            }
            teacher_raw = json.dumps(
                teacher_manifest,
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
            teacher_manifest_identity = {
                "path": "manifest.json",
                "bytes": len(teacher_raw),
                "sha256": hashlib.sha256(teacher_raw).hexdigest(),
            }
            teacher_result = {
                "schema": BRIDGE.STRENGTH_FIRST_TEACHER_RESULT_SCHEMA,
                "status": BRIDGE.STRENGTH_FIRST_TEACHER_RESULT_STATUS,
                "claim_boundary": (
                    "postflight-input-and-staged-output-integrity-not-playing-strength-evidence"
                ),
                "runner": {
                    "local_only": True,
                    "network_requests": 0,
                    "cloud_services": [],
                    "live_weight_changes": 0,
                },
                "production_asset_preflight": {},
                "authenticated_input": {},
                "consumer_postflight": {},
                "teacher": {},
                "milestones": {
                    "targets": [100, 500, 4],
                    "prefix_100": {
                        "path": "milestone-100.json",
                        "bytes": 1,
                        "sha256": "a" * 64,
                    },
                    "prefix_500": {
                        "path": "milestone-500.json",
                        "bytes": 1,
                        "sha256": "b" * 64,
                    },
                },
                "completion": {
                    "input_parents": 4,
                    "completed_parents": 4,
                    "forced_parents_skipped": 2,
                    "forced_skip_reasons": {
                        "fewer_than_two_legal_moves": 2,
                        "search_timeout_no_label": 0,
                    },
                    "emitted_parent_groups": 2,
                    "run_fingerprint": "f" * 64,
                },
                "staged_outputs": {
                    "work": work_identity,
                    "train": {
                        key: model_training_identity[key]
                        for key in ("path", "bytes", "sha256")
                    },
                    "parent_completion": {
                        key: completion_identity[key]
                        for key in ("path", "bytes", "sha256")
                    },
                    "manifest": teacher_manifest_identity,
                    "staged_result": {
                        "path": "staged-result.json",
                        "bytes": 1,
                        "sha256": "e" * 64,
                    },
                },
                "publication": {},
            }
            result_raw = json.dumps(
                teacher_result,
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
            plan["artifacts"] = {
                "role_bundle_manifest": {
                    "path": "manifest.json",
                    "bytes": len(role_raw),
                    "sha256": hashlib.sha256(role_raw).hexdigest(),
                },
                "input_training": input_identity,
                "teacher_result": {
                    "path": "result.json",
                    "bytes": len(result_raw),
                    "sha256": hashlib.sha256(result_raw).hexdigest(),
                },
                "parent_completion": completion_identity,
                "model_training": model_training_identity,
                "replay_exclusion": replay_exclusion,
                "replay": {
                    "path": "runOp1-train.jsonl",
                    "bytes": FRESH.FRESH_QAT_REPLAY_BYTES,
                    "sha256": FRESH.FRESH_QAT_REPLAY_SHA256,
                },
                "warm_initializer": {
                    "path": "runOp1-best.pt",
                    "bytes": FRESH.FRESH_QAT_WARM_INITIALIZER_BYTES,
                    "sha256": FRESH.FRESH_QAT_WARM_INITIALIZER_SHA256,
                },
            }
            plan["teacher_provenance"] = provenance_summary(
                target=4,
                forced=2,
                emitted=2,
                train_records=scan["model_training"]["records"],
            )
            plan_raw = json.dumps(
                plan,
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
            reads = {
                paths["experiment_plan"]: plan_raw,
                paths["role_bundle_manifest"]: role_raw,
                paths["teacher_manifest"]: teacher_raw,
                paths["teacher_result"]: result_raw,
                paths["teacher_work"]: work_raw,
                paths["input_training"]: source["input_raw"],
                paths["parent_completion"]: source["completion_raw"],
                paths["model_training"]: source["train_raw"],
            }
            args = SimpleNamespace(
                experiment_plan=paths["experiment_plan"],
                pipeline_revision="c" * 40,
                data=paths["model_training"],
                sibling_manifest=paths["teacher_manifest"],
                validation_partition_manifest=paths[
                    "role_bundle_manifest"
                ],
                holdout_protected_position_ids=paths[
                    "holdout_protected_position_ids"
                ],
                policy_exposure_receipt=paths["policy_exposure_receipt"],
                policy_exposed_parent_ids=paths[
                    "policy_exposed_parent_ids"
                ],
                policy_exposed_semantic_position_ids=paths[
                    "policy_exposed_semantic_position_ids"
                ],
                replay_data=paths["replay"],
                replay_excluded_position_ids=paths["replay_exclusion"],
                init_ckpt=paths["warm_initializer"],
                val_data="",
                experiment_family="int16-aware",
                seed=42,
                out=str(
                    root
                    / BRIDGE.STRENGTH_FIRST_QAT_RUN_ROOT
                    / "seed-42"
                ),
            )
            tracker = mock.Mock()
            fingerprints = mock.Mock()
            with mock.patch.object(
                ACCOUNTING,
                "PRODUCTION_INPUT_TRAINING_BINDING",
                input_identity,
            ), mock.patch.object(
                ACCOUNTING,
                "FRESH_QAT_INPUT_PARENTS",
                4,
            ), mock.patch.object(
                ACCOUNTING,
                "FRESH_QAT_INPUT_GAMES",
                2,
            ):
                binding = BRIDGE._verify_strength_first_qat_training_plan(
                    args,
                    plan["runtime"],
                    tracking_verifier=tracker,
                    repo_root=str(root),
                    local_paths=paths,
                    artifact_reader=lambda path: reads[path],
                    fingerprint_verifier=fingerprints,
                )
        self.assertEqual(binding["contract"]["seed"], 42)
        self.assertEqual(binding["contract"]["model_training_parents"], 2)
        self.assertFalse(
            binding["boundary"]["selection_label_read_authorized"]
        )
        self.assertFalse(
            binding["boundary"]["holdout_label_read_authorized"]
        )
        self.assertFalse(
            binding["boundary"]["production_weight_write_authorized"]
        )
        tracker.assert_called_once_with(paths["experiment_plan"], "c" * 40)
        self.assertEqual(fingerprints.call_count, 7)
        fingerprints.assert_any_call(
            paths["teacher_work"],
            work_identity,
            "teacher work",
        )


if __name__ == "__main__":
    unittest.main()
