import copy
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest import mock


ML = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "child_board_root_policy_student_formal",
    ML / "child_board_root_policy_student_formal.py",
)
assert SPEC and SPEC.loader
FORMAL = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = FORMAL
SPEC.loader.exec_module(FORMAL)


def identity(name: str, marker: str = "a") -> dict:
    return {
        "path": f"/immutable/{name}",
        "bytes": len(name) + 1,
        "sha256": marker * 64,
    }


class StudentFormalFixture:
    def __init__(self) -> None:
        path = ML / "protocols/child-board-root-policy-student-formal-v1-registry.json"
        self.blocked = json.loads(path.read_text())
        self.ready = copy.deepcopy(self.blocked)
        self.ready["status"] = FORMAL.READY_STATUS
        self.ready["reason"] = "complete-runtime-admitted-formal-frozen"
        self.ready["authority"]["execution_authorized"] = True
        for name in (
            "tune_passed",
            "sealed_passed",
            "runtime_admission_passed",
            "all_content_identities_verified",
            "role_adapter_single_boolean_diff_verified",
            "stable_student_call_count_zero_verified",
            "execution_authorized",
        ):
            self.ready["gates"][name] = True
        for index, name in enumerate(
            key
            for key in self.ready["enrollments"]
            if key != "public_main_commit"
        ):
            marker = "abcdef123456789"[index % 15]
            self.ready["enrollments"][name] = identity(name, marker)
        self.ready["enrollments"]["public_main_commit"] = "1" * 40

        self.binding = {
            "schema": "shogi-child-board-root-policy-formal-binding-v1",
            "registry": identity("registry", "1"),
            "shared_assets": {
                name: self.ready["enrollments"][name]
                for name in (
                    "live_nnue",
                    "worker_source",
                    "worker_asset",
                    "wasm_source",
                    "wasm_asset",
                    "production_build_manifest",
                    "master_runtime_config",
                )
            },
            "student_assets": {
                "tensor": self.ready["enrollments"]["student_tensor"],
                "manifest": self.ready["enrollments"]["student_manifest"],
            },
            "candidate_adapter": {
                "identity": self.ready["enrollments"]["candidate_adapter"],
                "config": {
                    "schema": FORMAL.CANDIDATE_ADAPTER_SCHEMA,
                    "student_enabled": True,
                },
            },
            "stable_adapter": {
                "identity": self.ready["enrollments"]["stable_adapter"],
                "config": {
                    "schema": FORMAL.CANDIDATE_ADAPTER_SCHEMA,
                    "student_enabled": False,
                },
            },
            "opening_manifest": self.ready["enrollments"]["opening_manifest"],
            "runtime_admission_result": self.ready["enrollments"][
                "runtime_admission_result"
            ],
        }
        self.openings = [
            {
                "opening_id": f"sha256:{index + 1:064x}",
                "sfen": f"fixture-sfen-{index}",
                "usi_moves": ["7g7f", "3c3d"],
            }
            for index in range(FORMAL.PAIR_COUNT)
        ]

    @staticmethod
    def receipt(request: dict, result: str = "win") -> dict:
        return {
            "schema": FORMAL.PAIR_RECEIPT_SCHEMA,
            "status": "complete",
            "request_sha256": request["request_sha256"],
            "pair_index": request["pair_index"],
            "technical_fault_count": 0,
            "games": [
                {
                    "game_index": 0,
                    "candidate_color": "sente",
                    "result": result,
                    "technical_fault": False,
                },
                {
                    "game_index": 1,
                    "candidate_color": "gote",
                    "result": result,
                    "technical_fault": False,
                },
            ],
            "stable_student_tensor_reads": 0,
            "stable_student_inference_calls": 0,
            "candidate_student_inference_calls": 2,
        }


class StudentFormalRegistryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = StudentFormalFixture()

    def test_checked_in_registry_is_exactly_blocked(self) -> None:
        captured = FORMAL.validate_registry_data(self.fixture.blocked)
        self.assertEqual(captured["status"], FORMAL.BLOCKED_STATUS)
        self.assertFalse(captured["authority"]["execution_authorized"])
        self.assertTrue(
            all(value is None for value in captured["enrollments"].values())
        )
        with self.assertRaises(FORMAL.StudentFormalBlocked):
            FORMAL.assert_execution_authorized(captured)

    def test_checked_in_registry_authenticates_all_parent_contracts(self) -> None:
        captured, registry_identity = FORMAL.load_registry(ML.parent)
        self.assertEqual(captured["status"], FORMAL.BLOCKED_STATUS)
        self.assertEqual(registry_identity["schema"], FORMAL.REGISTRY_SCHEMA)
        self.assertEqual(len(registry_identity["sha256"]), 64)

    def test_registry_symlink_is_rejected_before_read(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = (
                ML
                / "protocols/child-board-root-policy-student-formal-v1-registry.json"
            )
            candidate = root / FORMAL.REGISTRY_RELATIVE_PATH
            candidate.parent.mkdir(parents=True)
            candidate.symlink_to(target)
            with self.assertRaisesRegex(FORMAL.StudentFormalError, "symlink"):
                FORMAL.load_registry(root)

    def test_ready_registry_requires_every_execution_gate(self) -> None:
        FORMAL.assert_execution_authorized(self.fixture.ready)
        for name in (
            "tune_passed",
            "sealed_passed",
            "runtime_admission_passed",
            "all_content_identities_verified",
            "role_adapter_single_boolean_diff_verified",
            "stable_student_call_count_zero_verified",
        ):
            changed = copy.deepcopy(self.fixture.ready)
            changed["gates"][name] = False
            with self.subTest(name=name), self.assertRaises(
                FORMAL.StudentFormalError
            ):
                FORMAL.validate_registry_data(changed)

    def test_role_binding_diff_is_only_student_enabled(self) -> None:
        captured = FORMAL.validate_role_binding(self.fixture.binding)
        self.assertTrue(captured["candidate_adapter"]["config"]["student_enabled"])
        self.assertFalse(captured["stable_adapter"]["config"]["student_enabled"])
        changed = copy.deepcopy(self.fixture.binding)
        changed["stable_adapter"]["config"]["extra"] = "separate-build"
        with self.assertRaisesRegex(
            FORMAL.StudentFormalError, "adapter fields differ"
        ):
            FORMAL.validate_role_binding(changed)

    def test_blocked_main_starts_no_execution(self) -> None:
        with mock.patch.object(
            FORMAL,
            "load_registry",
            return_value=(self.fixture.blocked, {"sha256": "a" * 64}),
        ):
            self.assertEqual(FORMAL.main([]), 2)


class StudentFormalScheduleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = StudentFormalFixture()

    def test_exact_384_pairs_and_768_games_complete(self) -> None:
        calls: list[int] = []
        lock = threading.Lock()

        def execute(request: dict) -> dict:
            with lock:
                calls.append(request["pair_index"])
            return self.fixture.receipt(request)

        receipts = FORMAL.run_authenticated_schedule(
            self.fixture.ready,
            self.fixture.binding["registry"],
            self.fixture.openings,
            self.fixture.binding,
            execute,
        )
        self.assertEqual(len(receipts), 384)
        self.assertEqual(sum(len(item["games"]) for item in receipts), 768)
        self.assertEqual([item["pair_index"] for item in receipts], list(range(384)))
        self.assertEqual(sorted(calls), list(range(384)))

    def test_blocked_registry_refuses_before_executor_call(self) -> None:
        calls = 0

        def execute(_request: dict) -> dict:
            nonlocal calls
            calls += 1
            raise AssertionError("must not execute")

        with self.assertRaises(FORMAL.StudentFormalBlocked):
            FORMAL.run_authenticated_schedule(
                self.fixture.blocked,
                self.fixture.binding["registry"],
                self.fixture.openings,
                self.fixture.binding,
                execute,
            )
        self.assertEqual(calls, 0)

    def test_role_binding_must_name_exact_registry_bytes(self) -> None:
        changed = copy.deepcopy(self.fixture.binding["registry"])
        changed["sha256"] = "e" * 64
        with self.assertRaisesRegex(
            FORMAL.StudentFormalError, "registry identity differs"
        ):
            FORMAL.run_authenticated_schedule(
                self.fixture.ready,
                changed,
                self.fixture.openings,
                self.fixture.binding,
                lambda request: self.fixture.receipt(request),
            )

    def test_first_pair_fault_stops_bounded_submission(self) -> None:
        calls: list[int] = []
        lock = threading.Lock()

        def execute(request: dict) -> dict:
            with lock:
                calls.append(request["pair_index"])
            if request["pair_index"] == 0:
                raise RuntimeError("fixture technical fault")
            return self.fixture.receipt(request)

        with self.assertRaisesRegex(
            FORMAL.StudentFormalError, "complete run is unanalyzable"
        ):
            FORMAL.run_authenticated_schedule(
                self.fixture.ready,
                self.fixture.binding["registry"],
                self.fixture.openings,
                self.fixture.binding,
                execute,
            )
        self.assertLessEqual(len(calls), FORMAL.PAIR_WORKERS)

    def test_stable_student_access_is_a_technical_fault(self) -> None:
        request = FORMAL.build_pair_request(
            0, self.fixture.openings[0], self.fixture.binding
        )
        receipt = self.fixture.receipt(request)
        receipt["stable_student_inference_calls"] = 1
        with self.assertRaisesRegex(FORMAL.StudentFormalError, "role accounting"):
            FORMAL.validate_pair_receipt(receipt, request)

    def test_placeholder_opening_identity_is_rejected(self) -> None:
        opening = copy.deepcopy(self.fixture.openings[0])
        opening["opening_id"] = f"sha256:{'0' * 64}"
        with self.assertRaisesRegex(FORMAL.StudentFormalError, "opening row"):
            FORMAL.build_pair_request(0, opening, self.fixture.binding)

    def test_complete_pair_bootstrap_is_only_authoritative_decision(self) -> None:
        pairs = [
            {
                "pair_index": index,
                "games": [
                    {
                        "game_index": 0,
                        "candidate_color": "sente",
                        "result": "win",
                    },
                    {
                        "game_index": 1,
                        "candidate_color": "gote",
                        "result": "win",
                    },
                ],
                "technical_fault_count": 0,
            }
            for index in range(FORMAL.PAIR_COUNT)
        ]
        result = FORMAL.analyze_complete_pair_results(pairs)
        self.assertEqual(result["games"], 768)
        self.assertTrue(result["safety_gate_passed"])
        self.assertTrue(result["stronger_claim_gate_passed"])
        self.assertTrue(result["external_calibration_authorized"])
        self.assertEqual(
            result["sprt_diagnostic"]["authority"],
            "diagnostic-only-no-early-strength-or-external-decision",
        )

    def test_partial_result_has_no_analysis_authority(self) -> None:
        with self.assertRaisesRegex(FORMAL.StudentFormalError, "exactly 384"):
            FORMAL.analyze_complete_pair_results([])


if __name__ == "__main__":
    unittest.main()
