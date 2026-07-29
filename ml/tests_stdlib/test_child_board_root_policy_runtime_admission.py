from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

import child_board_root_policy_runtime_admission as admission


SHA = "a" * 64


def identity(name: str) -> dict[str, object]:
    return {"path": f"/frozen/{name}", "bytes": 123, "sha256": SHA}


def harness() -> dict[str, object]:
    receipt = {"bytes": 4, "sha256": SHA}
    raw = [1.0] * admission.FIXTURE_PARENTS
    return {
        "schema": admission.HARNESS_SCHEMA,
        "status": "complete-frozen-student-harness-pass",
        "providerKind": "frozen-student",
        "admitted": False,
        "harnessChecksPassed": True,
        "tensorSpecificAdmission":
            "harness-pass-awaiting-authorized-publication",
        "fixtureCount": admission.FIXTURE_PARENTS,
        "warmupRoots": admission.WARMUP_ROOTS,
        "measuredRoots": admission.FIXTURE_PARENTS,
        "repeats": admission.REPEATS,
        "fixtureIdentityReceipt": receipt,
        "warmupInferenceCalls": admission.WARMUP_ROOTS,
        "measuredRootInferenceCalls":
            admission.FIXTURE_PARENTS * admission.REPEATS,
        "rootInferenceCalls":
            admission.WARMUP_ROOTS
            + admission.FIXTURE_PARENTS * admission.REPEATS,
        "disabledInferenceCalls": 0,
        "nonRootStudentCalls": 0,
        "studentToEvaluatorFlows": 0,
        "studentToTtFlows": 0,
        "studentToUiFlows": 0,
        "disabledByteParityReceipts":
            [dict(receipt) for _ in range(admission.FIXTURE_PARENTS)],
        "determinismReceipts":
            [dict(receipt) for _ in range(admission.FIXTURE_PARENTS)],
        "latency": {
            "rawIncrementalMilliseconds": raw,
            "rawEndToEndMilliseconds": raw,
            "incrementalP50Milliseconds": 1.0,
            "incrementalP95Milliseconds": 1.0,
            "endToEndP50Milliseconds": 1.0,
            "endToEndP95Milliseconds": 1.0,
        },
        "faultsChecked": admission.HARNESS_FAULT_CASES,
        "staticDependencyViolations": [],
        "failures": [],
        "liveWeightsChanged": False,
        "tuneOpened": False,
        "sealedOpened": False,
    }


def parity(
    fixture: dict[str, object],
    tensor: dict[str, object],
    manifest: dict[str, object],
    build: dict[str, object],
) -> dict[str, object]:
    projected = 40_000
    return {
        "schema": admission.PARITY_SCHEMA,
        "status": "complete-frozen-student-parity-measured",
        "fixture": fixture,
        "student_tensor": tensor,
        "student_manifest": manifest,
        "production_build_receipt": build,
        "parents": admission.FIXTURE_PARENTS,
        "browser_parents": admission.BROWSER_PARENTS,
        "v9_parents": admission.V9_PARENTS,
        "projected_moves": projected,
        "parent_and_production_usi_sequence_matches":
            admission.FIXTURE_PARENTS,
        "live_nnue_child_cp_exact_matches": projected,
        "finite_output_matches": projected,
        "top1_matches": admission.FIXTURE_PARENTS,
        "pair_direction_matches": 80_000,
        "pair_direction_total": 80_000,
        "maximum_absolute_combined_cp_error": 0.25,
        "mean_absolute_combined_cp_error": 0.01,
        "stable_order_matches": 30_000,
        "stable_order_total": 30_000,
        "technical_faults": 0,
        "live_weights_changed": False,
    }


def latency(
    fixture: dict[str, object],
    tensor: dict[str, object],
    manifest: dict[str, object],
    build: dict[str, object],
    *,
    incremental_milliseconds: float = 5.0,
    end_to_end_milliseconds: float = 10.0,
) -> dict[str, object]:
    incremental = [incremental_milliseconds] * admission.FIXTURE_PARENTS
    end_to_end = [end_to_end_milliseconds] * admission.FIXTURE_PARENTS
    sequences = list(range(1, admission.FIXTURE_PARENTS + 1))
    return {
        "schema": admission.LATENCY_SCHEMA,
        "status": "complete-m4-pro-production-chromium-measured",
        "fixture": fixture,
        "student_tensor": tensor,
        "student_manifest": manifest,
        "production_build_receipt": build,
        "environment": {
            "hardware_chip": "Apple M4 Pro",
            "os": "Darwin 25.6.0",
            "architecture": "arm64",
            "power_source": "AC",
            "low_power_mode": False,
            "foreground": True,
            "browser_name": "Chromium",
            "browser_version": "140.0.0",
            "wasm": True,
            "inference_workers": 1,
            "devtools_open": False,
            "clock": "performance.now()",
            "explicit_gc": False,
            "build_git_commit": "d0123451",
        },
        "warmup_roots": admission.WARMUP_ROOTS,
        "idle_quiescence_milliseconds": 5_000,
        "measured_roots": admission.FIXTURE_PARENTS,
        "request_sequence_numbers": sequences,
        "response_sequence_numbers": list(sequences),
        "raw_incremental_milliseconds": incremental,
        "raw_end_to_end_milliseconds": end_to_end,
        "summaries": {
            "incremental": admission._latency_summary(incremental),
            "end_to_end": admission._latency_summary(end_to_end),
        },
        "technical_faults": 0,
        "live_weights_changed": False,
    }


class RuntimeAdmissionDecisionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = identity("fixture")
        self.tensor = identity("tensor")
        self.manifest = identity("manifest")
        self.build = identity("build")
        self.environment = {"source_git_commit": "d0123451"}

    def decide(
        self,
        *,
        harness_value: dict[str, object] | None = None,
        parity_value: dict[str, object] | None = None,
        latency_value: dict[str, object] | None = None,
    ) -> dict[str, object]:
        return admission.decide_runtime_admission(
            harness=harness_value or harness(),
            parity=parity_value or parity(
                self.fixture,
                self.tensor,
                self.manifest,
                self.build,
            ),
            latency=latency_value or latency(
                self.fixture,
                self.tensor,
                self.manifest,
                self.build,
            ),
            fixture=self.fixture,
            tensor=self.tensor,
            manifest=self.manifest,
            build_receipt=self.build,
            build_environment=self.environment,
        )

    def test_admits_only_when_every_recomputed_gate_passes(self) -> None:
        result = self.decide()
        self.assertIs(result["admitted"], True)
        self.assertEqual(result["status"], admission.SUCCESS_STATUS)
        self.assertEqual(result["failures"], [])

    def test_45_point_4_ms_incremental_latency_is_not_admitted(self) -> None:
        measured = latency(
            self.fixture,
            self.tensor,
            self.manifest,
            self.build,
            incremental_milliseconds=45.4,
        )
        result = self.decide(latency_value=measured)
        self.assertIs(result["admitted"], False)
        self.assertEqual(result["status"], admission.FAILURE_STATUS)
        self.assertIn(
            "latency.incremental_p50_milliseconds_maximum",
            result["failures"],
        )
        self.assertIn(
            "latency.incremental_p95_milliseconds_maximum",
            result["failures"],
        )
        self.assertEqual(
            result["latency"]["incremental"]["p50_milliseconds"],
            45.4,
        )

    def test_wrong_hardware_fails_closed_without_rewriting_samples(self) -> None:
        measured = latency(
            self.fixture,
            self.tensor,
            self.manifest,
            self.build,
        )
        measured["environment"]["hardware_chip"] = "Apple M3 Pro"
        result = self.decide(latency_value=measured)
        self.assertIs(result["admitted"], False)
        self.assertIn("latency.m4_pro_environment", result["failures"])

    def test_spoofed_latency_summary_is_rejected_as_malformed(self) -> None:
        measured = latency(
            self.fixture,
            self.tensor,
            self.manifest,
            self.build,
            incremental_milliseconds=45.4,
        )
        measured["summaries"]["incremental"]["p50_milliseconds"] = 1.0
        with self.assertRaisesRegex(
            admission.RuntimeAdmissionError,
            "summaries were not exactly recomputed",
        ):
            self.decide(latency_value=measured)

    def test_incomplete_harness_table_is_rejected_before_decision(self) -> None:
        measured = harness()
        measured["determinismReceipts"] = measured[
            "determinismReceipts"
        ][:-1]
        with self.assertRaisesRegex(
            admission.RuntimeAdmissionError,
            "receipt table is incomplete",
        ):
            self.decide(harness_value=measured)

    def test_boolean_cannot_impersonate_zero_harness_counter(self) -> None:
        measured = harness()
        measured["disabledInferenceCalls"] = False
        with self.assertRaisesRegex(
            admission.RuntimeAdmissionError,
            "counters are malformed",
        ):
            self.decide(harness_value=measured)


class RuntimeAdmissionPublicationTests(unittest.TestCase):
    def test_create_only_publication_accepts_identical_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "runtime-admission-result.json"
            raw = b'{"admitted":false}\n'
            admission._publish_create_only(path, raw)
            admission._publish_create_only(path, raw)
            self.assertEqual(path.read_bytes(), raw)

    def test_create_only_publication_rejects_drift(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "runtime-admission-result.json"
            admission._publish_create_only(path, b'{"admitted":false}\n')
            with self.assertRaisesRegex(
                admission.RuntimeAdmissionError,
                "existing runtime admission result drift",
            ):
                admission._publish_create_only(
                    path,
                    b'{"admitted":true}\n',
                )

    def test_canonical_result_rejects_nonfinite_numbers(self) -> None:
        with self.assertRaises(ValueError):
            admission._canonical({"latency": float("nan")})


if __name__ == "__main__":
    unittest.main()
