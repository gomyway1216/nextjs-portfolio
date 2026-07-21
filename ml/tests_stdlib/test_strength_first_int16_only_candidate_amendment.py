from __future__ import annotations

import copy
import json
from pathlib import Path
import sys
import unittest
from unittest import mock


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import build_strength_first_int16_only_candidate_amendment_registry_candidate as BUILDER  # noqa: E402
import strength_first_int16_only_candidate_amendment as PROTOCOL  # noqa: E402


class Int16OnlyCandidateAmendmentProtocolTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.candidate = BUILDER.build_registry_candidate()
        cls.evidence = json.loads(
            (ML_DIR.parent / PROTOCOL.BRIDGE_STOP_EVIDENCE_RELATIVE_PATH).read_text(
                encoding="utf-8"
            )
        )

    def test_builder_emits_adaptive_lock_ready_registry_without_strength_claim(self):
        validated = PROTOCOL.validate_registry(self.candidate)
        self.assertEqual(validated["status"], PROTOCOL.REGISTRY_STATUS)
        self.assertEqual(
            validated["policy"]["decision"]["decision_class"],
            "post-hoc-adaptive-candidate-lock-not-selection-pass",
        )
        self.assertFalse(validated["bridge_stop"]["family_gate_passed"])
        self.assertFalse(validated["bridge_stop"]["treated_as_pass"])
        self.assertFalse(validated["nonclaims"]["candidate_strength_selected"])
        self.assertFalse(validated["nonclaims"]["playing_strength_improved"])
        self.assertEqual(validated["boundary"]["fresh_final_label_reads"], 0)

    def test_pinned_registry_is_byte_identical_to_builder(self):
        self.assertEqual(
            BUILDER.build_registry_candidate(require_pinned_match=True),
            self.candidate,
        )

    def test_selected_seed_42_epoch_20_identity_is_literal(self):
        selected = self.candidate["models"]["seeds"][0]
        self.assertEqual(selected["seed"], 42)
        self.assertEqual(selected["parent_checkpoint"]["epoch"], 20)
        self.assertEqual(
            selected["parent_checkpoint"]["sha256"],
            PROTOCOL.SELECTED_CHECKPOINT_SHA256,
        )
        for field, replacement in (
            ("sha256", "f" * 64),
            ("epoch", 24),
            ("path", selected["parent_checkpoint"]["path"] + ".substituted"),
        ):
            with self.subTest(field=field):
                mutated = copy.deepcopy(self.candidate)
                mutated["models"]["seeds"][0]["parent_checkpoint"][field] = replacement
                with self.assertRaises(ValueError):
                    PROTOCOL.validate_registry(mutated)

    def test_old_bridge_stop_cannot_be_spoofed_as_pass(self):
        for mutation in (
            {"status": "PASS"},
            {"family_gate_passed": True},
            {"treated_as_pass": True},
            {"output_root_absent": False},
        ):
            with self.subTest(mutation=mutation):
                candidate = copy.deepcopy(self.candidate)
                candidate["bridge_stop"].update(mutation)
                with self.assertRaisesRegex(ValueError, "STOP was altered or promoted"):
                    PROTOCOL.validate_registry(candidate)

    def test_seed_fallback_and_float_authority_cannot_be_enabled(self):
        for field, value in (
            ("seed_43_fallback_allowed", True),
            ("float_metrics_have_selection_authority", True),
            ("aligned_epoch_24_has_deployment_authority", True),
            ("selected_seed", 43),
        ):
            with self.subTest(field=field):
                candidate = copy.deepcopy(self.candidate)
                candidate["policy"]["decision"][field] = value
                with self.assertRaisesRegex(ValueError, "policy drifted"):
                    PROTOCOL.validate_registry(candidate)

    def test_bridge_stop_evidence_rejects_authority_expansion_fields(self):
        mutations = []
        root = copy.deepcopy(self.evidence)
        root["bridge_passed"] = True
        mutations.append(root)
        outcome = copy.deepcopy(self.evidence)
        outcome["outcome"]["promotion_authorized"] = True
        mutations.append(outcome)
        boundary = copy.deepcopy(self.evidence)
        boundary["boundary"]["live_write_authorized"] = True
        mutations.append(boundary)
        delta = copy.deepcopy(self.evidence)
        delta["models"]["seed_42"]["aligned_float_to_parent_int16_delta"]["waived"] = (
            True
        )
        mutations.append(delta)
        metric = copy.deepcopy(self.evidence)
        metric["models"]["seed_43"]["parent_int16"]["within_parent_pair_accuracy"] += (
            0.0001
        )
        mutations.append(metric)
        for path, field, value in (
            (("boundary",), "candidate_locked", True),
            (("boundary",), "network_requests", 99),
            (("boundary",), "formal_ab_games", 768),
            (("outcome",), "minimum_seed_count_passed", False),
            ((), "claim_boundary", "bridge-passed-and-promotable"),
            (
                ("observation_provenance",),
                "metric_context",
                "authenticated PASS",
            ),
        ):
            mutated = copy.deepcopy(self.evidence)
            target = mutated
            for component in path:
                target = target[component]
            target[field] = value
            mutations.append(mutated)
        for index, mutation in enumerate(mutations):
            with self.subTest(index=index), self.assertRaises(ValueError):
                PROTOCOL.validate_bridge_stop_evidence(mutation)

    def test_bridge_stop_evidence_records_three_runs_but_no_fresh_or_live_read(self):
        evidence = PROTOCOL.validate_bridge_stop_evidence(self.evidence)
        self.assertEqual(
            (ML_DIR.parent / PROTOCOL.BRIDGE_STOP_EVIDENCE_RELATIVE_PATH).read_bytes(),
            PROTOCOL.canonical_json_bytes(evidence),
        )
        self.assertEqual(
            evidence["boundary"]["spent_selection_dataset_read_passes_total_observed"],
            3,
        )
        self.assertEqual(evidence["boundary"]["fresh_final_label_reads"], 0)
        self.assertFalse(evidence["boundary"]["live_weights_changed"])
        self.assertEqual(evidence["first_authoritative_attempt"]["wall_seconds"], 12.13)
        self.assertEqual(
            evidence["first_authoritative_attempt"]["maximum_resident_set_size_bytes"],
            739_557_376,
        )

    def test_builder_and_runner_arguments_are_forbidden_before_work(self):
        with mock.patch.object(BUILDER, "build_registry_candidate") as build:
            self.assertEqual(BUILDER.main(["--seed", "43"]), 2)
        build.assert_not_called()


if __name__ == "__main__":
    unittest.main()
