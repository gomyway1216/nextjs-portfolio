from __future__ import annotations

import copy
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest


ML_ROOT = Path(__file__).resolve().parents[1]
if str(ML_ROOT) not in sys.path:
    sys.path.insert(0, str(ML_ROOT))

import halfkp81_depth18_strength_protocol as PROTOCOL
import prepare_halfkp81_depth18_v1r11_training as HANDOFF


REVISION = "1" * 40
FINGERPRINT = "2" * 64


def _canonical(value: object) -> bytes:
    return (
        json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode()
        + b"\n"
    )


def _write(path: Path, value: object | bytes) -> dict[str, object]:
    raw = value if isinstance(value, bytes) else _canonical(value)
    path.write_bytes(raw)
    return {
        "path": str(path.resolve()),
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


class V1R11TrainingHandoffTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        verifier_path = self.repo / "verifier.ts"
        verifier_identity = _write(verifier_path, b"export {};\n")
        self.verifier = {
            "source_revision": REVISION,
            "entrypoint": "verifier.ts",
            "dependency_closure": [
                {
                    "path": "verifier.ts",
                    "bytes": verifier_identity["bytes"],
                    "sha256": verifier_identity["sha256"],
                }
            ],
        }

        self.role_counts = {"fit": 2, "tune": 2, "sealed": 2}
        self.tracked_path = self.root / "tracked.json"
        self.tracked = {
            "schema": HANDOFF.TRACKED_PLAN_SCHEMA,
            "family": "halfkp81-hard-depth18-yaneura-only-v1r11",
            "selection_roles": copy.deepcopy(self.role_counts),
            "training": copy.deepcopy(PROTOCOL.EXPECTED_TRAINING),
        }
        _write(self.tracked_path, self.tracked)

        runtime_plan_path = self.root / "teacher-plan.json"
        runtime_plan = {
            "schema": HANDOFF.TEACHER_PLAN_SCHEMA,
            "source_revision": REVISION,
            "selection_roles": copy.deepcopy(self.role_counts),
        }
        self.plan = {
            **_write(runtime_plan_path, runtime_plan),
            "schema": HANDOFF.TEACHER_PLAN_SCHEMA,
        }

        self.outputs: dict[str, dict[str, object]] = {}
        for role in HANDOFF.ROLE_ORDER:
            rows = b"".join(
                _canonical({"parent_id": f"{role}-{parent}", "row": row})
                for parent in range(2)
                for row in range(2)
            )
            identity = _write(self.root / f"{role}.jsonl", rows)
            self.outputs[role] = {
                **identity,
                "schema": PROTOCOL.V1R11_DATASET_SCHEMA,
            }

        work_path = self.root / "teacher-work.jsonl"
        work_header = {
            "schema": HANDOFF.TEACHER_WORK_SCHEMA,
            "source_revision": REVISION,
            "run_fingerprint": FINGERPRINT,
            "teacher_plan": self.plan,
        }
        self.work = {
            **_write(work_path, _canonical(work_header)),
            "schema": HANDOFF.TEACHER_WORK_SCHEMA,
        }

        self.chain: dict[str, dict[str, object]] = {}
        for field, schema in HANDOFF.CHAIN_SCHEMAS.items():
            if field == "raw_teacher_receipt":
                continue
            path = self.root / f"{field}.jsonl"
            if field not in {
                "preformal_authority_ledger",
                "power_continuity_ledger",
            }:
                path = path.with_suffix(".json")
                raw: object | bytes = {
                    "schema": schema,
                    "source_revision": REVISION,
                    "run_fingerprint": FINGERPRINT,
                }
            else:
                raw = b"{}\n"
            self.chain[field] = {**_write(path, raw), "schema": schema}

        raw_path = self.root / "raw-teacher-receipt.json"
        raw_receipt = {
            "schema": HANDOFF.CHAIN_SCHEMAS["raw_teacher_receipt"],
            "status": "complete-unverified-no-training-authority",
            "teacher_plan": self.plan,
            "source_revision": REVISION,
            "run_fingerprint": FINGERPRINT,
            "teacher_work": self.work,
            "teacher_output": self.outputs,
            **copy.deepcopy(self.chain),
            "finalizer": {},
            "authority": {
                "may_train": False,
                "may_play_formal_games": False,
                "may_write_live_weights": False,
            },
        }
        self.chain["raw_teacher_receipt"] = {
            **_write(raw_path, raw_receipt),
            "schema": HANDOFF.CHAIN_SCHEMAS["raw_teacher_receipt"],
        }

        self.receipt_path = self.root / "verified-receipt.json"
        self.receipt = {
            "schema": PROTOCOL.V1R11_VERIFIED_TEACHER_RECEIPT_SCHEMA,
            "status": "teacher-artifacts-and-authority-chain-independently-verified-training-only-authority",
            "teacher_plan": self.plan,
            "source_revision": REVISION,
            "run_fingerprint": FINGERPRINT,
            "raw_teacher_receipt": self.chain["raw_teacher_receipt"],
            "teacher_work": self.work,
            "teacher_output": self.outputs,
            **{
                field: value
                for field, value in self.chain.items()
                if field != "raw_teacher_receipt"
            },
            "verifier": self.verifier,
            "authority": {
                "may_train_fixed_v1r11_candidate": True,
                "may_play_formal_games": False,
                "may_write_live_weights": False,
            },
        }
        _write(self.receipt_path, self.receipt)

        initializer_path = self.root / "initializer.pt"
        replay_path = self.root / "replay.jsonl"
        self.initializer = _write(initializer_path, b"initializer\n")
        replay_identity = _write(replay_path, b"{}\n{}\n{}\n")
        self.replay = {
            **replay_identity,
            "rows": 3,
            "schema": "shogi-direct-teacher-halfkp81-v2-position-v1",
        }

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def prepare(self, name: str = "training") -> tuple[dict, str]:
        return HANDOFF.prepare_training_handoff(
            verified_receipt_path=str(self.receipt_path),
            tracked_plan_path=str(self.tracked_path),
            output_directory=str(self.root / name),
            repo_root=str(self.repo),
            role_counts=self.role_counts,
            fixed_initializer=self.initializer,
            fixed_direct_replay=self.replay,
            require_clean_revision=False,
        )

    def test_verified_receipt_creates_fail_closed_handoff(self) -> None:
        handoff, path = self.prepare()
        self.assertEqual(handoff["teacher_accounting"]["fit"], {"parents": 2, "rows": 4})
        self.assertFalse(handoff["authority"]["may_start_optimizer"])
        self.assertEqual(handoff["entrypoint_compatibility"]["training_runs_created"], 0)
        self.assertEqual(Path(path).read_bytes(), _canonical(handoff))
        with self.assertRaises(HANDOFF.V1R11TrainingHandoffError):
            self.prepare()

    def test_raw_receipt_cannot_be_used_as_verified_receipt(self) -> None:
        raw_path = self.chain["raw_teacher_receipt"]["path"]
        with self.assertRaisesRegex(
            HANDOFF.V1R11TrainingHandoffError, "no training handoff authority"
        ):
            HANDOFF.prepare_training_handoff(
                verified_receipt_path=str(raw_path),
                tracked_plan_path=str(self.tracked_path),
                output_directory=str(self.root / "raw"),
                repo_root=str(self.repo),
                role_counts=self.role_counts,
                fixed_initializer=self.initializer,
                fixed_direct_replay=self.replay,
                require_clean_revision=False,
            )

    def test_forged_authority_chain_is_rejected(self) -> None:
        power_receipt = Path(self.chain["power_continuity_receipt"]["path"])
        power_receipt.write_bytes(power_receipt.read_bytes() + b" ")
        with self.assertRaisesRegex(
            HANDOFF.V1R11TrainingHandoffError, "bytes/SHA/path changed"
        ):
            self.prepare("forged")

    def test_epoch_or_seed_count_drift_is_rejected(self) -> None:
        for field, changed_value in (("epochs", 4), ("seeds", 2)):
            changed = copy.deepcopy(self.tracked)
            changed["training"][field] = changed_value
            path = self.root / f"tracked-{field}.json"
            _write(path, changed)
            with self.assertRaisesRegex(
                HANDOFF.V1R11TrainingHandoffError,
                "tracked v1r11 training contract differs",
            ):
                HANDOFF.prepare_training_handoff(
                    verified_receipt_path=str(self.receipt_path),
                    tracked_plan_path=str(path),
                    output_directory=str(self.root / f"wrong-{field}"),
                    repo_root=str(self.repo),
                    role_counts=self.role_counts,
                    fixed_initializer=self.initializer,
                    fixed_direct_replay=self.replay,
                    require_clean_revision=False,
                )

        caller_selected_seed = copy.deepcopy(self.tracked)
        caller_selected_seed["training"]["seed"] = 42
        caller_seed_path = self.root / "tracked-caller-seed.json"
        _write(caller_seed_path, caller_selected_seed)
        with self.assertRaisesRegex(
            HANDOFF.V1R11TrainingHandoffError,
            "tracked v1r11 training contract differs",
        ):
            HANDOFF.prepare_training_handoff(
                verified_receipt_path=str(self.receipt_path),
                tracked_plan_path=str(caller_seed_path),
                output_directory=str(self.root / "caller-seed"),
                repo_root=str(self.repo),
                role_counts=self.role_counts,
                fixed_initializer=self.initializer,
                fixed_direct_replay=self.replay,
                require_clean_revision=False,
            )

    def test_role_cardinality_drift_is_rejected(self) -> None:
        changed = copy.deepcopy(self.tracked)
        changed["selection_roles"]["fit"] = 3
        path = self.root / "tracked-role.json"
        _write(path, changed)
        with self.assertRaisesRegex(
            HANDOFF.V1R11TrainingHandoffError,
            "tracked v1r11 training contract differs",
        ):
            HANDOFF.prepare_training_handoff(
                verified_receipt_path=str(self.receipt_path),
                tracked_plan_path=str(path),
                output_directory=str(self.root / "wrong-role"),
                repo_root=str(self.repo),
                role_counts=self.role_counts,
                fixed_initializer=self.initializer,
                fixed_direct_replay=self.replay,
                require_clean_revision=False,
            )


if __name__ == "__main__":
    unittest.main()
