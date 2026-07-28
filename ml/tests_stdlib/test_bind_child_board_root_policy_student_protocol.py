from __future__ import annotations

from argparse import Namespace
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import bind_child_board_root_policy_student_protocol as BINDER  # noqa: E402


def _json_bytes(value: object) -> bytes:
    return (
        json.dumps(value, indent=2, ensure_ascii=False).encode("utf-8") + b"\n"
    )


def _prebind_document() -> dict:
    return {
        "schema": BINDER.PREBIND_PROTOCOL_SCHEMA,
        "status": "prospective-pre-tune-fit-only-student-runtime-plan",
        "teacher_checkpoint_bindings": {
            "phase1_terminal_result": {
                "required_schema": BINDER.PHASE1_RESULT_SCHEMA,
                "required_status": BINDER.PHASE1_RESULT_STATUS,
                "required_parent_protocol_sha256": (
                    BINDER.PARENT_PROTOCOL_SHA256
                ),
                "required_tune_opened": False,
                "required_sealed_opened": False,
                "required_live_weights_changed": False,
            },
            "designated_distillation_teacher": {
                "seed": 42,
                "checkpoint_sha256": BINDER.PLACEHOLDERS[42],
            },
            "replication_teacher": {
                "seed": 314159,
                "checkpoint_sha256": BINDER.PLACEHOLDERS[314159],
            },
            "only_unresolved_slots": list(BINDER.CHANGED_JSON_POINTERS),
        },
        "unchanged_witness": {
            "whitespace_and_key_order": "must remain byte-identical",
            "tune_opened": False,
        },
    }


def _checkpoint_receipt(path: Path, seed: int) -> dict:
    raw = path.read_bytes()
    return {
        "schema": BINDER.CHECKPOINT_RECEIPT_SCHEMA,
        "seed": seed,
        "checkpoint": {
            "path": str(path.resolve()),
            "bytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest(),
        },
    }


def _result_document(seed42_path: Path, seed314159_path: Path) -> dict:
    return {
        "schema": BINDER.PHASE1_RESULT_SCHEMA,
        "status": BINDER.PHASE1_RESULT_STATUS,
        "protocol": {
            "path": "/fixed/parent-plan.json",
            "bytes": BINDER.PARENT_PROTOCOL_BYTES,
            "sha256": BINDER.PARENT_PROTOCOL_SHA256,
        },
        "training": {
            "final_checkpoints": [
                _checkpoint_receipt(seed314159_path, 314159),
                _checkpoint_receipt(seed42_path, 42),
            ]
        },
        "tune_opened": False,
        "sealed_opened": False,
        "live_weights_changed": False,
    }


class BindStudentProtocolTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.seed42 = self.root / "seed-42-final.pt"
        self.seed314159 = self.root / "seed-314159-final.pt"
        self.seed42.write_bytes(b"exact seed 42 checkpoint bytes")
        self.seed314159.write_bytes(b"exact seed 314159 checkpoint bytes")
        self.prebind = _json_bytes(_prebind_document())
        self.result = _json_bytes(
            _result_document(self.seed42, self.seed314159)
        )

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def _bind(self, **overrides):
        arguments = {
            "prebind_raw": self.prebind,
            "phase1_result_raw": self.result,
            "phase1_result_bytes": len(self.result),
            "phase1_result_sha256": hashlib.sha256(
                self.result
            ).hexdigest(),
            "expected_prebind_bytes": len(self.prebind),
            "expected_prebind_sha256": hashlib.sha256(
                self.prebind
            ).hexdigest(),
        }
        arguments.update(overrides)
        return BINDER.bind_protocol_bytes(**arguments)

    def test_replaces_exact_two_values_and_revalidates_actual_checkpoints(self):
        postbind, evidence = self._bind()
        before = json.loads(self.prebind)
        after = json.loads(postbind)
        expected_hashes = {
            42: hashlib.sha256(self.seed42.read_bytes()).hexdigest(),
            314159: hashlib.sha256(
                self.seed314159.read_bytes()
            ).hexdigest(),
        }
        self.assertEqual(
            after["teacher_checkpoint_bindings"][
                "designated_distillation_teacher"
            ]["checkpoint_sha256"],
            expected_hashes[42],
        )
        self.assertEqual(
            after["teacher_checkpoint_bindings"]["replication_teacher"][
                "checkpoint_sha256"
            ],
            expected_hashes[314159],
        )
        before["teacher_checkpoint_bindings"][
            "designated_distillation_teacher"
        ]["checkpoint_sha256"] = expected_hashes[42]
        before["teacher_checkpoint_bindings"]["replication_teacher"][
            "checkpoint_sha256"
        ] = expected_hashes[314159]
        self.assertEqual(after, before)
        self.assertEqual(
            evidence["changed_json_pointers"],
            list(BINDER.CHANGED_JSON_POINTERS),
        )
        self.assertEqual(
            evidence["source_pointers"][42],
            "/training/final_checkpoints/1/checkpoint/sha256",
        )
        self.assertEqual(
            evidence["source_pointers"][314159],
            "/training/final_checkpoints/0/checkpoint/sha256",
        )

    def test_publishes_bound_protocol_and_receipt_create_only(self):
        protocol_path = self.root / "prebind.json"
        result_path = self.root / "result.json"
        bound_path = self.root / "bound.json"
        receipt_path = self.root / "binding-receipt.json"
        protocol_path.write_bytes(self.prebind)
        result_path.write_bytes(self.result)
        args = Namespace(
            protocol=protocol_path,
            phase1_result=result_path,
            phase1_result_bytes=len(self.result),
            phase1_result_sha256=hashlib.sha256(self.result).hexdigest(),
            bound_protocol_out=bound_path,
            receipt_out=receipt_path,
        )
        receipt = BINDER.bind_and_publish(
            args,
            expected_prebind_bytes=len(self.prebind),
            expected_prebind_sha256=hashlib.sha256(
                self.prebind
            ).hexdigest(),
        )
        self.assertEqual(receipt["replacement_count"], 2)
        self.assertEqual(
            hashlib.sha256(bound_path.read_bytes()).hexdigest(),
            receipt["postbind_protocol"]["sha256"],
        )
        self.assertEqual(
            json.loads(receipt_path.read_bytes()),
            receipt,
        )
        with self.assertRaisesRegex(
            BINDER.BindingError, "binding receipt already exists"
        ):
            BINDER.bind_and_publish(
                args,
                expected_prebind_bytes=len(self.prebind),
                expected_prebind_sha256=hashlib.sha256(
                    self.prebind
                ).hexdigest(),
            )

    def test_rejects_any_prebind_byte_identity_drift(self):
        changed = self.prebind.replace(
            b"must remain byte-identical", b"changed outside bindings"
        )
        with self.assertRaisesRegex(
            BINDER.BindingError, "pre-bind protocol byte/SHA"
        ):
            self._bind(prebind_raw=changed)

    def test_rejects_open_protected_gate(self):
        result = json.loads(self.result)
        result["tune_opened"] = True
        raw = _json_bytes(result)
        with self.assertRaisesRegex(
            BINDER.BindingError, "gate must be false: tune_opened"
        ):
            self._bind(
                phase1_result_raw=raw,
                phase1_result_bytes=len(raw),
                phase1_result_sha256=hashlib.sha256(raw).hexdigest(),
            )

    def test_rejects_checkpoint_bytes_changed_after_result(self):
        self.seed42.write_bytes(b"tampered after terminal receipt")
        with self.assertRaisesRegex(
            BINDER.BindingError, "actual checkpoint byte/SHA mismatch"
        ):
            self._bind()

    def test_rejects_duplicate_or_missing_seed(self):
        result = json.loads(self.result)
        result["training"]["final_checkpoints"][0]["seed"] = 42
        raw = _json_bytes(result)
        with self.assertRaisesRegex(
            BINDER.BindingError, "unique 42/314159"
        ):
            self._bind(
                phase1_result_raw=raw,
                phase1_result_bytes=len(raw),
                phase1_result_sha256=hashlib.sha256(raw).hexdigest(),
            )

    def test_rejects_duplicate_json_key_even_with_matching_result_identity(self):
        result = self.result.replace(
            b'{\n  "schema":',
            b'{\n  "schema": "duplicate",\n  "schema":',
            1,
        )
        with self.assertRaisesRegex(BINDER.BindingError, "duplicate JSON key"):
            self._bind(
                phase1_result_raw=result,
                phase1_result_bytes=len(result),
                phase1_result_sha256=hashlib.sha256(result).hexdigest(),
            )

    def test_rejects_non_authoritative_phase1_result_identity(self):
        with self.assertRaisesRegex(
            BINDER.BindingError, "phase-1 result byte/SHA"
        ):
            self._bind(phase1_result_sha256="0" * 64)


if __name__ == "__main__":
    unittest.main()
