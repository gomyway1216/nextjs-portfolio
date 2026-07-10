import copy
import hashlib
import json
import os
import sys
import tempfile
import unittest


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

from sibling_manifest import (  # noqa: E402
    CANDIDATE_EXECUTION_ORDER,
    EXACT_RESCORE_MODE,
    LABEL_POLICY,
    RECORD_MANIFEST_SCHEMA,
    RUNTIME_SNAPSHOT_CONTRACT,
    SEARCH_STATE_RESET,
    SYNTHESIZED_RANK_ORDER,
    TEACHER_MANIFEST_SCHEMA,
    SiblingManifestError,
    verify_sibling_manifest,
)


REVISION = "0123456789abcdef0123456789abcdef01234567"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def eval_tree_digest(files):
    canonical = "\n".join(
        json.dumps(
            value,
            ensure_ascii=False,
            allow_nan=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        for value in files
    )
    return digest(("eval-tree-v1\0" + canonical).encode("utf-8"))


def manifest_for(train_bytes, val_bytes):
    return {
        "schema": TEACHER_MANIFEST_SCHEMA,
        "record_manifest_schema": RECORD_MANIFEST_SCHEMA,
        "search": {
            "label_policy": LABEL_POLICY,
            "exact_rescore_mode": EXACT_RESCORE_MODE,
            "search_state_reset_before_proposal": SEARCH_STATE_RESET,
            "search_state_reset_before_each_candidate": SEARCH_STATE_RESET,
            "tt_reset_before_proposal": True,
            "tt_reset_before_each_candidate": True,
            "candidate_execution_order": CANDIDATE_EXECUTION_ORDER,
            "synthesized_rank_order": SYNTHESIZED_RANK_ORDER,
        },
        "pipeline": {
            "source_revision": REVISION,
            "tracked_tree_clean": True,
        },
        "teacher": {
            "engine_bin_sha256": "a" * 64,
            "engine_bin_bytes": 123,
            "engine_args": ["--weights", "weights.bin"],
            "engine_arg_files": [
                {
                    "path": "weights.bin",
                    "bytes": 7,
                    "sha256": "b" * 64,
                }
            ],
            "eval_sha256": None,
            "eval_files": [],
            "runtime_snapshot": {
                **RUNTIME_SNAPSHOT_CONTRACT,
                "engine_argument_file_count": 1,
                "eval_tree_present": False,
            },
        },
        "outputs": {
            "train_sha256": digest(train_bytes),
            "val_sha256": digest(val_bytes),
            "train_bytes": len(train_bytes),
            "val_bytes": len(val_bytes),
        },
    }


def write_bytes(path, data):
    with open(path, "wb") as target:
        target.write(data)


def write_manifest(path, manifest):
    with open(path, "w", encoding="utf-8", newline="\n") as target:
        json.dump(manifest, target, indent=2, sort_keys=True)
        target.write("\n")


class SiblingManifestTest(unittest.TestCase):
    def test_accepts_v6_policy_contract_and_binds_requested_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            train_path = os.path.join(tmp, "train.jsonl")
            val_path = os.path.join(tmp, "val.jsonl")
            manifest_path = os.path.join(tmp, "manifest.json")
            train_bytes = b'{"split":"train"}\n'
            val_bytes = b'{"split":"val"}\n'
            write_bytes(train_path, train_bytes)
            write_bytes(val_path, val_bytes)
            write_manifest(manifest_path, manifest_for(train_bytes, val_bytes))

            provenance = verify_sibling_manifest(
                manifest_path,
                train_path=train_path,
                val_path=val_path,
            )
            self.assertEqual(provenance["schema"], TEACHER_MANIFEST_SCHEMA)
            self.assertEqual(provenance["label_policy"], LABEL_POLICY)
            self.assertEqual(provenance["pipeline"]["source_revision"], REVISION)
            self.assertEqual(provenance["verified_splits"], ["train", "val"])
            self.assertEqual(
                provenance["teacher_runtime_snapshot"],
                {
                    **RUNTIME_SNAPSHOT_CONTRACT,
                    "engine_argument_file_count": 1,
                    "eval_tree_present": False,
                },
            )
            self.assertTrue(provenance["pipeline"]["tracked_tree_clean"])
            self.assertEqual(provenance["outputs"]["train_sha256"], digest(train_bytes))
            with open(manifest_path, "rb") as source:
                raw_manifest = source.read()
            self.assertEqual(provenance["bytes"], len(raw_manifest))
            self.assertEqual(provenance["sha256"], digest(raw_manifest))

            # Evaluation is deliberately independent of access to train bytes.
            os.unlink(train_path)
            val_only = verify_sibling_manifest(manifest_path, val_path=val_path)
            self.assertEqual(val_only["sha256"], provenance["sha256"])
            self.assertEqual(val_only["verified_splits"], ["val"])

            with_eval_tree = manifest_for(train_bytes, val_bytes)
            eval_files = [
                {"path": "nn.bin", "bytes": 11, "sha256": "d" * 64}
            ]
            with_eval_tree["teacher"]["eval_sha256"] = eval_tree_digest(eval_files)
            with_eval_tree["teacher"]["eval_files"] = eval_files
            with_eval_tree["teacher"]["runtime_snapshot"][
                "eval_tree_present"
            ] = True
            write_manifest(manifest_path, with_eval_tree)
            eval_tree = verify_sibling_manifest(manifest_path, val_path=val_path)
            self.assertTrue(
                eval_tree["teacher_runtime_snapshot"]["eval_tree_present"]
            )

    def test_rejects_old_policy_or_untrusted_pipeline_and_exact_types(self):
        train_bytes = b"train-a\n"
        val_bytes = b"val-a__\n"
        cases = [
            (
                "teacher schema",
                lambda value: value.__setitem__("schema", "shogi-sibling-teacher-manifest-v1"),
                "schema",
            ),
            (
                "record manifest schema",
                lambda value: value.__setitem__("record_manifest_schema", "shogi-sibling-v1"),
                "record_manifest_schema",
            ),
            (
                "old v3 label policy",
                lambda value: value["search"].__setitem__("label_policy", "joint-multipv-v3"),
                "label_policy",
            ),
            (
                "joint rescore",
                lambda value: value["search"].__setitem__("exact_rescore_mode", "joint-multipv"),
                "exact_rescore_mode",
            ),
            (
                "missing proposal reset",
                lambda value: value["search"].pop("search_state_reset_before_proposal"),
                "search_state_reset_before_proposal",
            ),
            (
                "missing candidate reset",
                lambda value: value["search"].pop("search_state_reset_before_each_candidate"),
                "search_state_reset_before_each_candidate",
            ),
            (
                "proposal TT retained",
                lambda value: value["search"].__setitem__(
                    "tt_reset_before_proposal", False
                ),
                "tt_reset_before_proposal",
            ),
            (
                "candidate TT retained",
                lambda value: value["search"].__setitem__(
                    "tt_reset_before_each_candidate", 1
                ),
                "tt_reset_before_each_candidate",
            ),
            (
                "proposal-order execution",
                lambda value: value["search"].__setitem__(
                    "candidate_execution_order", "proposal-order"
                ),
                "candidate_execution_order",
            ),
            (
                "unstable synthesized rank",
                lambda value: value["search"].__setitem__(
                    "synthesized_rank_order", "cp-descending"
                ),
                "synthesized_rank_order",
            ),
            (
                "uppercase revision",
                lambda value: value["pipeline"].__setitem__("source_revision", REVISION.upper()),
                "lowercase 40-digit",
            ),
            (
                "mutable engine binary",
                lambda value: value["teacher"]["runtime_snapshot"].__setitem__(
                    "engine_binary", False
                ),
                "engine_binary",
            ),
            (
                "empty engine binary",
                lambda value: value["teacher"].__setitem__("engine_bin_bytes", 0),
                "positive integer",
            ),
            (
                "unsnapshotted argument files",
                lambda value: value["teacher"]["runtime_snapshot"].__setitem__(
                    "engine_argument_files", "live-paths"
                ),
                "engine_argument_files",
            ),
            (
                "mutable eval tree",
                lambda value: value["teacher"]["runtime_snapshot"].__setitem__(
                    "eval_tree", "live"
                ),
                "eval_tree",
            ),
            (
                "eval options accepted",
                lambda value: value["teacher"]["runtime_snapshot"].__setitem__(
                    "eval_options_file", "accepted"
                ),
                "eval_options_file",
            ),
            (
                "shared working directory",
                lambda value: value["teacher"]["runtime_snapshot"].__setitem__(
                    "private_working_directory", False
                ),
                "private_working_directory",
            ),
            (
                "boolean argument count",
                lambda value: value["teacher"]["runtime_snapshot"].__setitem__(
                    "engine_argument_file_count", True
                ),
                "non-negative integer",
            ),
            (
                "negative argument count",
                lambda value: value["teacher"]["runtime_snapshot"].__setitem__(
                    "engine_argument_file_count", -1
                ),
                "non-negative integer",
            ),
            (
                "argument count mismatch",
                lambda value: value["teacher"]["runtime_snapshot"].__setitem__(
                    "engine_argument_file_count", 0
                ),
                "does not match",
            ),
            (
                "truthy eval-tree flag",
                lambda value: value["teacher"]["runtime_snapshot"].__setitem__(
                    "eval_tree_present", 1
                ),
                "must be a boolean",
            ),
            (
                "missing eval tree with digest",
                lambda value: value["teacher"].__setitem__(
                    "eval_sha256", "c" * 64
                ),
                "absent eval tree",
            ),
            (
                "present eval tree without digest",
                lambda value: (
                    value["teacher"]["runtime_snapshot"].__setitem__(
                        "eval_tree_present", True
                    ),
                    value["teacher"].__setitem__(
                        "eval_files",
                        [{"path": "nn.bin", "bytes": 11, "sha256": "d" * 64}],
                    ),
                ),
                "must bind the present eval tree",
            ),
            (
                "present empty eval tree",
                lambda value: (
                    value["teacher"]["runtime_snapshot"].__setitem__(
                        "eval_tree_present", True
                    ),
                    value["teacher"].__setitem__(
                        "eval_sha256", eval_tree_digest([])
                    ),
                ),
                "at least one eval file",
            ),
            (
                "eval tree digest mismatch",
                lambda value: (
                    value["teacher"]["runtime_snapshot"].__setitem__(
                        "eval_tree_present", True
                    ),
                    value["teacher"].__setitem__(
                        "eval_files",
                        [{"path": "nn.bin", "bytes": 11, "sha256": "d" * 64}],
                    ),
                    value["teacher"].__setitem__("eval_sha256", "e" * 64),
                ),
                "does not match teacher.eval_files",
            ),
            (
                "short revision",
                lambda value: value["pipeline"].__setitem__("source_revision", REVISION[:-1]),
                "lowercase 40-digit",
            ),
            (
                "dirty pipeline",
                lambda value: value["pipeline"].__setitem__("tracked_tree_clean", False),
                "exactly true",
            ),
            (
                "truthy pipeline flag",
                lambda value: value["pipeline"].__setitem__("tracked_tree_clean", 1),
                "exactly true",
            ),
            (
                "boolean byte count",
                lambda value: value["outputs"].__setitem__("train_bytes", True),
                "non-negative integer",
            ),
            (
                "float byte count",
                lambda value: value["outputs"].__setitem__("val_bytes", float(len(val_bytes))),
                "non-negative integer",
            ),
            (
                "uppercase digest",
                lambda value: value["outputs"].__setitem__(
                    "val_sha256", digest(val_bytes).upper()
                ),
                "lowercase SHA-256",
            ),
        ]

        with tempfile.TemporaryDirectory() as tmp:
            train_path = os.path.join(tmp, "train.jsonl")
            val_path = os.path.join(tmp, "val.jsonl")
            manifest_path = os.path.join(tmp, "manifest.json")
            write_bytes(train_path, train_bytes)
            write_bytes(val_path, val_bytes)
            base = manifest_for(train_bytes, val_bytes)
            for label, mutate, expected in cases:
                with self.subTest(label=label):
                    candidate = copy.deepcopy(base)
                    mutate(candidate)
                    write_manifest(manifest_path, candidate)
                    with self.assertRaisesRegex(SiblingManifestError, expected):
                        verify_sibling_manifest(
                            manifest_path,
                            train_path=train_path,
                            val_path=val_path,
                        )

    def test_rejects_duplicate_keys_nonstandard_numbers_and_missing_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            val_path = os.path.join(tmp, "val.jsonl")
            manifest_path = os.path.join(tmp, "manifest.json")
            write_bytes(val_path, b"val\n")

            write_bytes(manifest_path, b'{"schema":"a","schema":"b"}\n')
            with self.assertRaisesRegex(SiblingManifestError, "duplicate key"):
                verify_sibling_manifest(manifest_path, val_path=val_path)

            write_bytes(manifest_path, b'{"unexpected":NaN}\n')
            with self.assertRaisesRegex(SiblingManifestError, "non-standard JSON number"):
                verify_sibling_manifest(manifest_path, val_path=val_path)

            with self.assertRaisesRegex(SiblingManifestError, "does not exist"):
                verify_sibling_manifest(
                    os.path.join(tmp, "missing.json"), val_path=val_path
                )

    def test_rejects_partial_publish_even_when_replacement_has_same_size(self):
        with tempfile.TemporaryDirectory() as tmp:
            train_path = os.path.join(tmp, "train.jsonl")
            val_path = os.path.join(tmp, "val.jsonl")
            manifest_path = os.path.join(tmp, "manifest.json")
            train_a = b"train-a\n"
            val_a = b"value-a\n"
            val_b = b"value-b\n"
            self.assertEqual(len(val_a), len(val_b))
            write_bytes(train_path, train_a)
            write_bytes(val_path, val_a)
            write_manifest(manifest_path, manifest_for(train_a, val_a))

            # Simulate manifest-last publication interrupted after only val was
            # replaced by another otherwise complete generation.
            write_bytes(val_path, val_b)
            with self.assertRaisesRegex(
                SiblingManifestError, r"outputs\.val_sha256"
            ):
                verify_sibling_manifest(
                    manifest_path,
                    train_path=train_path,
                    val_path=val_path,
                )


if __name__ == "__main__":
    unittest.main()
