from __future__ import annotations

import copy
import json
from pathlib import Path
import subprocess
import sys
import unittest
from unittest import mock


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import halfkp81_depth18_strength_protocol as SELECTION_PROTOCOL  # noqa: E402
import halfkp81_depth18_yaneura_only_v1r2_protocol as PROTOCOL  # noqa: E402
import publish_halfkp81_depth18_yaneura_only_v1r2_plan as PUBLISHER  # noqa: E402


NEW_REVISION = "a" * 40
TRACKED_PLAN = ML_DIR / "halfkp81-hard-depth18-yaneura-only-v1r2-plan.json"
FAILED_V1_PLAN = Path(
    PROTOCOL.EXPECTED_FAILED_V1["teacher_plan"]["path"]
)
HAS_FAILED_V1_LOCAL_ARTIFACTS = (
    FAILED_V1_PLAN.is_file()
    and Path(
        PROTOCOL.EXPECTED_FAILED_V1["preflight"]["namespace"]
    ).is_dir()
)


def _selection_evidence() -> SELECTION_PROTOCOL.AuthenticatedSelectionEvidence:
    return SELECTION_PROTOCOL.AuthenticatedSelectionEvidence(
        {
            "schema": (
                "shogi-halfkp81-depth18-authenticated-selection-evidence-v1"
            ),
            "status": "authenticated-selection-complete-teacher-plan-eligible",
            "source_revision": NEW_REVISION,
            "selection_jsonl": {
                **copy.deepcopy(PROTOCOL.EXPECTED_REUSED_SELECTION["jsonl"]),
                "held_read_only_descriptor": True,
                "stable_double_read": True,
            },
            "selection_manifest": {
                **copy.deepcopy(
                    PROTOCOL.EXPECTED_REUSED_SELECTION["manifest"]
                ),
                "held_read_only_descriptor": True,
                "stable_double_read": True,
            },
            "phase_name_map": {},
            "accounting": {},
            "bindings": {},
            "verification": {},
        }
    )


class PublishYaneuraOnlyV1R2PlanTests(unittest.TestCase):
    def test_build_authenticates_v1_boundary_and_rechecks_main(self) -> None:
        preregistration = PROTOCOL.validate_tracked_plan_file(TRACKED_PLAN)
        evidence = _selection_evidence()
        with (
            mock.patch.object(PUBLISHER, "_verify_merged_revision") as revision,
            mock.patch.object(
                PUBLISHER,
                "_verify_tracked_preregistration",
                return_value=preregistration,
            ) as prereg,
            mock.patch.object(
                PUBLISHER, "_verify_failed_v1_artifacts"
            ) as predecessor,
            mock.patch.object(
                PUBLISHER, "_verify_failed_v1_quiescent"
            ) as quiescent,
            mock.patch.object(PUBLISHER, "_verify_engine_assets") as engine,
            mock.patch.object(PUBLISHER, "_verify_live_baseline") as live,
            mock.patch.object(
                SELECTION_PROTOCOL,
                "authenticate_selection_artifacts",
                return_value=evidence,
            ) as selection,
            mock.patch.object(
                PUBLISHER.BASE_PUBLISHER,
                "_canonical_output_directory",
                return_value=Path(
                    PROTOCOL.EXPECTED_RUNTIME_OUTPUTS["directory"]
                ),
            ),
        ):
            plan = PUBLISHER.build_teacher_plan(
                selection_jsonl_path="/tmp/hard-parents.jsonl",
                selection_manifest_path="/tmp/hard-parents.manifest.json",
                expected_merged_revision=NEW_REVISION,
                output_directory=PROTOCOL.EXPECTED_RUNTIME_OUTPUTS[
                    "directory"
                ],
            )
        self.assertEqual(revision.call_count, 2)
        prereg.assert_called_once()
        predecessor.assert_called_once()
        quiescent.assert_called_once()
        engine.assert_called_once()
        live.assert_called_once()
        selection.assert_called_once_with(
            "/tmp/hard-parents.jsonl",
            "/tmp/hard-parents.manifest.json",
            expected_source_revision=NEW_REVISION,
        )
        self.assertEqual(plan["schema"], PROTOCOL.TEACHER_PLAN_SCHEMA)
        self.assertEqual(plan["teacher"], PROTOCOL.EXPECTED_TEACHER)
        self.assertEqual(plan["training"], PROTOCOL.EXPECTED_TRAINING)
        self.assertEqual(plan["predecessor_v1"]["completed_parents"], 0)
        self.assertEqual(plan["predecessor_v1"]["teacher_rows"], 0)
        self.assertIs(
            type(
                plan["downstream_gates"][
                    "absolute_max_cp_delta_maximum"
                ]
            ),
            int,
        )

    @unittest.skipUnless(
        HAS_FAILED_V1_LOCAL_ARTIFACTS,
        "requires the private failed-v1 artifacts on the originating Mac",
    )
    def test_failed_v1_real_projection_is_exactly_eight_integral_floats(
        self,
    ) -> None:
        raw = FAILED_V1_PLAN.read_bytes()
        plan = json.loads(raw)
        projection = PROTOCOL.cross_runtime_canonical_json_bytes(plan)
        expected = PROTOCOL.EXPECTED_FAILED_V1[
            "cross_runtime_projection"
        ]
        self.assertEqual(len(projection), expected["bytes"])
        self.assertEqual(len(projection) - len(raw), -16)
        self.assertEqual(PUBLISHER._count_integral_floats(plan), 8)
        self.assertNotEqual(projection, raw)
        self.assertIn(b":300.0", raw)
        self.assertIn(b":300", projection)
        self.assertNotIn(b":300.0", projection)

    @unittest.skipUnless(
        HAS_FAILED_V1_LOCAL_ARTIFACTS,
        "requires the private failed-v1 artifacts on the originating Mac",
    )
    def test_failed_v1_actual_artifacts_and_quiescence_authenticate(
        self,
    ) -> None:
        PUBLISHER._verify_failed_v1_artifacts(
            Path(__file__).resolve().parents[2]
        )
        PUBLISHER._verify_failed_v1_quiescent()

    def test_failed_revision_is_rejected_before_git(self) -> None:
        with mock.patch.object(
            PUBLISHER.BASE_PUBLISHER, "_verify_merged_revision"
        ) as base:
            with self.assertRaisesRegex(
                PUBLISHER.YaneuraOnlyV1R2PublicationError,
                "failed v1 source revision is forbidden",
            ):
                PUBLISHER._verify_merged_revision(
                    PROTOCOL.FAILED_V1_REVISION, Path("/tmp/repo")
                )
        base.assert_not_called()

    def test_failed_namespaces_require_exact_entries(self) -> None:
        for expected in (
            PROTOCOL.EXPECTED_FAILED_V1["formal_namespace"]["exact_entries"],
            PROTOCOL.EXPECTED_FAILED_V1["preflight"]["exact_entries"],
        ):
            with self.subTest(expected=expected):
                with (
                    mock.patch.object(
                        Path,
                        "lstat",
                        return_value=mock.Mock(st_mode=0o040700),
                    ),
                    mock.patch.object(
                        Path,
                        "iterdir",
                        return_value=iter(
                            Path("/formal") / name for name in expected
                        ),
                    ),
                ):
                    PUBLISHER._verify_exact_directory_entries(
                        Path("/formal"), expected
                    )
                with (
                    mock.patch.object(
                        Path,
                        "lstat",
                        return_value=mock.Mock(st_mode=0o040700),
                    ),
                    mock.patch.object(
                        Path,
                        "iterdir",
                        return_value=iter(
                            [
                                *(
                                    Path("/formal") / name
                                    for name in expected
                                ),
                                Path("/formal/unregistered"),
                            ]
                        ),
                    ),
                ):
                    with self.assertRaisesRegex(
                        PUBLISHER.YaneuraOnlyV1R2PublicationError,
                        "entries differ",
                    ):
                        PUBLISHER._verify_exact_directory_entries(
                            Path("/formal"), expected
                        )

    def test_quiescent_gate_rejects_service_or_process(self) -> None:
        absent = subprocess.CompletedProcess([], 1, "", "")
        present = subprocess.CompletedProcess([], 0, "123\n", "")
        with mock.patch.object(
            subprocess, "run", side_effect=[present, absent]
        ):
            with self.assertRaisesRegex(
                PUBLISHER.YaneuraOnlyV1R2PublicationError,
                "service is still present",
            ):
                PUBLISHER._verify_failed_v1_quiescent()
        with mock.patch.object(
            subprocess, "run", side_effect=[absent, present]
        ):
            with self.assertRaisesRegex(
                PUBLISHER.YaneuraOnlyV1R2PublicationError,
                "process is still present",
            ):
                PUBLISHER._verify_failed_v1_quiescent()

    def test_publish_passes_only_normalized_plan_to_create_only_base(
        self,
    ) -> None:
        valid = {
            "schema": PROTOCOL.TEACHER_PLAN_SCHEMA,
            "outputs": copy.deepcopy(PROTOCOL.EXPECTED_RUNTIME_OUTPUTS),
            "downstream_gates": {"maximum": 300.0, "ratio": 1.05},
        }
        captured: list[dict] = []

        def publish(plan, *, output_directory):
            captured.append(plan)
            return {
                "path": PROTOCOL.EXPECTED_RUNTIME_OUTPUTS["plan_json"],
                "bytes": 123,
                "sha256": "b" * 64,
            }

        with mock.patch.object(
            PUBLISHER.BASE_PUBLISHER,
            "publish_teacher_plan",
            side_effect=publish,
        ):
            identity = PUBLISHER.publish_teacher_plan(
                valid,
                output_directory=PROTOCOL.EXPECTED_RUNTIME_OUTPUTS[
                    "directory"
                ],
            )
        self.assertEqual(identity["schema"], PROTOCOL.TEACHER_PLAN_SCHEMA)
        self.assertEqual(captured[0]["downstream_gates"]["maximum"], 300)
        self.assertIs(
            type(captured[0]["downstream_gates"]["maximum"]), int
        )
        raw = PUBLISHER.BASE_PUBLISHER.PROTOCOL.canonical_json_bytes(
            captured[0]
        )
        self.assertNotIn(b":300.0", raw)


if __name__ == "__main__":
    unittest.main()
