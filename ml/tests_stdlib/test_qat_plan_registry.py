from pathlib import Path
from types import SimpleNamespace
import os
import sys
import tempfile
import unittest
from unittest import mock


ML_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = ML_DIR.parent
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import qat_plan_registry as REGISTRY  # noqa: E402
import fresh_qat_protocol as FRESH  # noqa: E402
import qat_protocol as WCSC36  # noqa: E402


class QatPlanRegistryTests(unittest.TestCase):
    def dispatch(self, plan_path):
        args = SimpleNamespace(
            experiment_plan=None if plan_path is None else str(plan_path)
        )
        runtime = {}
        tracker = mock.Mock()
        with mock.patch.object(
            REGISTRY,
            "verify_fresh_qat_experiment_plan",
            return_value={"route": "fresh"},
        ) as fresh, mock.patch.object(
            REGISTRY,
            "verify_fresh_qat_v2_execution_plan",
            return_value={"route": "fresh-v2"},
        ) as fresh_v2, mock.patch.object(
            REGISTRY,
            "verify_wcsc36_qat_experiment_plan",
            return_value={"route": "wcsc36"},
        ) as wcsc36:
            result = REGISTRY.verify_qat_experiment_plan(
                args,
                runtime,
                tracking_verifier=tracker,
            )
        return result, fresh, fresh_v2, wcsc36

    def test_exact_fresh_path_dispatches_to_versioned_verifier(self):
        fresh_path = REPO_ROOT / REGISTRY.FRESH_QAT_EXECUTION_PLAN_RELATIVE_PATH
        result, fresh, fresh_v2, wcsc36 = self.dispatch(fresh_path)
        self.assertEqual(result, {"route": "fresh"})
        fresh.assert_called_once()
        fresh_v2.assert_not_called()
        wcsc36.assert_not_called()

    def test_exact_fresh_v2_path_dispatches_only_to_v2_verifier(self):
        fresh_v2_path = (
            REPO_ROOT / REGISTRY.FRESH_QAT_V2_EXECUTION_PLAN_RELATIVE_PATH
        )
        result, fresh, fresh_v2, wcsc36 = self.dispatch(fresh_v2_path)
        self.assertEqual(result, {"route": "fresh-v2"})
        fresh_v2.assert_called_once()
        fresh.assert_not_called()
        wcsc36.assert_not_called()

    def test_exact_strength_first_path_has_its_own_dispatch_and_schema_pair(self):
        exact = (
            REPO_ROOT
            / REGISTRY.STRENGTH_FIRST_QAT_EXECUTION_PLAN_RELATIVE_PATH
        )
        args = SimpleNamespace(experiment_plan=str(exact))
        with mock.patch.object(
            REGISTRY,
            "verify_strength_first_qat_training_plan",
            return_value={"route": "strength-first"},
        ) as strength, mock.patch.object(
            REGISTRY,
            "verify_fresh_qat_experiment_plan",
        ) as fresh, mock.patch.object(
            REGISTRY,
            "verify_fresh_qat_v2_execution_plan",
        ) as fresh_v2, mock.patch.object(
            REGISTRY,
            "verify_wcsc36_qat_experiment_plan",
        ) as wcsc36:
            result = REGISTRY.verify_qat_experiment_plan(
                args,
                {},
                tracking_verifier=mock.Mock(),
            )
        self.assertEqual(result, {"route": "strength-first"})
        strength.assert_called_once()
        fresh.assert_not_called()
        fresh_v2.assert_not_called()
        wcsc36.assert_not_called()

        schemas = REGISTRY.resolve_qat_artifact_schemas(
            {
                "provenance": {
                    "schema": (
                        REGISTRY.STRENGTH_FIRST_QAT_EXECUTION_PLAN_SCHEMA
                    )
                },
                "contract": {
                    "schema": FRESH.FRESH_QAT_TRAINING_CONTRACT_SCHEMA
                },
            }
        )
        self.assertEqual(
            schemas,
            {
                "result": (
                    REGISTRY.STRENGTH_FIRST_QAT_TRAINING_RESULT_SCHEMA
                ),
                "checkpoint": (
                    REGISTRY.STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA
                ),
            },
        )

    def test_strength_first_near_paths_symlinks_and_non_strings_fail_closed(self):
        exact = (
            REPO_ROOT
            / REGISTRY.STRENGTH_FIRST_QAT_EXECUTION_PLAN_RELATIVE_PATH
        )
        near = (
            Path(str(exact) + ".copy"),
            exact.with_name(exact.name + "-near"),
            REPO_ROOT / "ml/protocols/strength-first-qat-wrong.json",
        )
        for candidate in near:
            with self.subTest(candidate=candidate):
                with self.assertRaisesRegex(ValueError, "non-exact"):
                    self.dispatch(candidate)

        with tempfile.TemporaryDirectory() as directory:
            symlink = Path(directory) / exact.name
            symlink.symlink_to(exact)
            with self.assertRaisesRegex(ValueError, "symlinked"):
                self.dispatch(symlink)

        for candidate in (exact, str(exact).encode("utf-8")):
            with self.subTest(candidate_type=type(candidate).__name__):
                args = SimpleNamespace(experiment_plan=candidate)
                with self.assertRaisesRegex(
                    ValueError,
                    "exact built-in string",
                ):
                    REGISTRY.verify_qat_experiment_plan(
                        args,
                        {},
                        tracking_verifier=mock.Mock(),
                    )

    def test_old_path_and_old_invalid_fallback_are_unchanged(self):
        old_path = REPO_ROOT / WCSC36.QAT_PLAN_RELATIVE_PATH
        result, fresh, fresh_v2, wcsc36 = self.dispatch(old_path)
        self.assertEqual(result, {"route": "wcsc36"})
        wcsc36.assert_called_once()
        fresh.assert_not_called()
        fresh_v2.assert_not_called()

        result, fresh, fresh_v2, wcsc36 = self.dispatch(
            REPO_ROOT / "ml/protocols/not-a-registered-plan.json"
        )
        self.assertEqual(result, {"route": "wcsc36"})
        wcsc36.assert_called_once()
        fresh.assert_not_called()
        fresh_v2.assert_not_called()

    def test_true_none_is_not_stringified_before_fallback(self):
        result, fresh, fresh_v2, wcsc36 = self.dispatch(None)
        self.assertEqual(result, {"route": "wcsc36"})
        wcsc36.assert_called_once()
        fresh.assert_not_called()
        fresh_v2.assert_not_called()

    def test_fresh_v2_near_paths_and_symlinks_fail_closed(self):
        exact = REPO_ROOT / REGISTRY.FRESH_QAT_V2_EXECUTION_PLAN_RELATIVE_PATH
        near_paths = (
            Path(str(exact) + ".copy"),
            exact.with_name(exact.name + "-near"),
            REPO_ROOT / "ml/protocols/fresh-qat-v2-wrong.json",
        )
        for near in near_paths:
            with self.subTest(path=near):
                with self.assertRaisesRegex(ValueError, "non-exact"):
                    self.dispatch(near)

        with tempfile.TemporaryDirectory() as directory:
            symlink = Path(directory) / exact.name
            symlink.symlink_to(exact)
            with self.assertRaisesRegex(ValueError, "symlinked"):
                self.dispatch(symlink)

    def test_non_plain_v2_path_types_fail_instead_of_cross_routing(self):
        exact = REPO_ROOT / REGISTRY.FRESH_QAT_V2_EXECUTION_PLAN_RELATIVE_PATH

        class StringSubclass(str):
            pass

        candidates = (
            exact,
            str(exact).encode("utf-8"),
            StringSubclass(str(exact)),
        )
        for candidate in candidates:
            with self.subTest(candidate_type=type(candidate).__name__):
                args = SimpleNamespace(experiment_plan=candidate)
                with mock.patch.object(
                    REGISTRY,
                    "verify_fresh_qat_experiment_plan",
                ) as fresh, mock.patch.object(
                    REGISTRY,
                    "verify_fresh_qat_v2_execution_plan",
                ) as fresh_v2, mock.patch.object(
                    REGISTRY,
                    "verify_wcsc36_qat_experiment_plan",
                ) as wcsc36:
                    with self.assertRaisesRegex(
                        ValueError,
                        "exact built-in string",
                    ):
                        REGISTRY.verify_qat_experiment_plan(
                            args,
                            {},
                            tracking_verifier=mock.Mock(),
                        )
                fresh.assert_not_called()
                fresh_v2.assert_not_called()
                wcsc36.assert_not_called()

    def test_stateful_pathlike_is_snapshotted_once_before_routing(self):
        exact = REPO_ROOT / REGISTRY.FRESH_QAT_V2_EXECUTION_PLAN_RELATIVE_PATH
        old_fallback = REPO_ROOT / "ml/protocols/not-a-registered-plan.json"

        class SwitchingPath:
            def __init__(self, first, second):
                self.values = (str(first), str(second))
                self.calls = 0

            def __fspath__(self):
                value = self.values[min(self.calls, 1)]
                self.calls += 1
                return value

        switch_to_v2 = SwitchingPath(old_fallback, exact)
        args = SimpleNamespace(experiment_plan=switch_to_v2)
        with mock.patch.object(
            REGISTRY,
            "verify_fresh_qat_experiment_plan",
        ) as fresh, mock.patch.object(
            REGISTRY,
            "verify_fresh_qat_v2_execution_plan",
        ) as fresh_v2, mock.patch.object(
            REGISTRY,
            "verify_wcsc36_qat_experiment_plan",
            return_value={"route": "wcsc36"},
        ) as wcsc36:
            result = REGISTRY.verify_qat_experiment_plan(
                args,
                {},
                tracking_verifier=mock.Mock(),
            )
        self.assertEqual(result, {"route": "wcsc36"})
        self.assertEqual(switch_to_v2.calls, 1)
        fresh.assert_not_called()
        fresh_v2.assert_not_called()
        wcsc36.assert_called_once()

        switch_from_v2 = SwitchingPath(exact, old_fallback)
        args = SimpleNamespace(experiment_plan=switch_from_v2)
        with mock.patch.object(
            REGISTRY,
            "verify_fresh_qat_experiment_plan",
        ) as fresh, mock.patch.object(
            REGISTRY,
            "verify_fresh_qat_v2_execution_plan",
        ) as fresh_v2, mock.patch.object(
            REGISTRY,
            "verify_wcsc36_qat_experiment_plan",
        ) as wcsc36:
            with self.assertRaisesRegex(
                ValueError,
                "exact built-in string",
            ):
                REGISTRY.verify_qat_experiment_plan(
                    args,
                    {},
                    tracking_verifier=mock.Mock(),
                )
        self.assertEqual(switch_from_v2.calls, 1)
        fresh.assert_not_called()
        fresh_v2.assert_not_called()
        wcsc36.assert_not_called()

    def test_malformed_pathlike_attribute_error_is_captured_once(self):
        class BrokenPath(os.PathLike):
            def __init__(self):
                self.calls = 0

            def __fspath__(self):
                self.calls += 1
                raise AttributeError("malformed dynamic path")

        broken = BrokenPath()
        self.assertIsNone(REGISTRY._plain_path_text(broken))
        self.assertEqual(broken.calls, 1)

    def test_artifact_schema_dispatch_preserves_legacy_and_separates_fresh(self):
        legacy = REGISTRY.resolve_qat_artifact_schemas(
            {
                "provenance": {"schema": WCSC36.QAT_PLAN_SCHEMA},
                "contract": {"schema": WCSC36.QAT_TRAINING_CONTRACT_SCHEMA},
            }
        )
        self.assertEqual(
            legacy,
            {
                "result": WCSC36.QAT_TRAINING_RESULT_SCHEMA,
                "checkpoint": WCSC36.QAT_FINAL_CHECKPOINT_SCHEMA,
            },
        )

        fresh = REGISTRY.resolve_qat_artifact_schemas(
            {
                "provenance": {"schema": FRESH.FRESH_QAT_EXECUTION_PLAN_SCHEMA},
                "contract": {"schema": FRESH.FRESH_QAT_TRAINING_CONTRACT_SCHEMA},
            }
        )
        self.assertEqual(
            fresh,
            {
                "result": FRESH.FRESH_QAT_TRAINING_RESULT_SCHEMA,
                "checkpoint": FRESH.FRESH_QAT_FINAL_CHECKPOINT_SCHEMA,
            },
        )
        self.assertNotEqual(fresh["result"], legacy["result"])
        self.assertNotEqual(fresh["checkpoint"], legacy["checkpoint"])

        fresh_v2 = REGISTRY.resolve_qat_artifact_schemas(
            {
                "provenance": {
                    "schema": REGISTRY.FRESH_QAT_V2_EXECUTION_PLAN_SCHEMA
                },
                "contract": {
                    "schema": FRESH.FRESH_QAT_TRAINING_CONTRACT_SCHEMA
                },
            }
        )
        self.assertEqual(fresh_v2, fresh)

        with self.assertRaisesRegex(ValueError, "unknown or hybrid"):
            REGISTRY.resolve_qat_artifact_schemas(
                {
                    "provenance": {"schema": FRESH.FRESH_QAT_EXECUTION_PLAN_SCHEMA},
                    "contract": {"schema": WCSC36.QAT_TRAINING_CONTRACT_SCHEMA},
                }
            )
        for plan_schema, contract_schema in (
            (
                REGISTRY.FRESH_QAT_V2_EXECUTION_PLAN_SCHEMA,
                WCSC36.QAT_TRAINING_CONTRACT_SCHEMA,
            ),
            (
                FRESH.FRESH_QAT_EXECUTION_PLAN_SCHEMA,
                "shogi-floodgate-fresh-qat-training-experiment-v2",
            ),
            (
                WCSC36.QAT_PLAN_SCHEMA,
                FRESH.FRESH_QAT_TRAINING_CONTRACT_SCHEMA,
            ),
        ):
            with self.subTest(
                plan_schema=plan_schema,
                contract_schema=contract_schema,
            ):
                with self.assertRaisesRegex(ValueError, "unknown or hybrid"):
                    REGISTRY.resolve_qat_artifact_schemas(
                        {
                            "provenance": {"schema": plan_schema},
                            "contract": {"schema": contract_schema},
                        }
                    )

    def test_historical_constants_remain_exact(self):
        self.assertEqual(
            WCSC36.QAT_PLAN_RELATIVE_PATH,
            "ml/protocols/wcsc36-int16-aware-plan.json",
        )
        self.assertEqual(WCSC36.QAT_PLAN_BYTES, 8_152)
        self.assertEqual(
            WCSC36.QAT_PLAN_SHA256,
            "bef7863a5f6c85d5d6c5b97cc21aef48d17dae137ffd679efeda764d352a6b6b",
        )
        self.assertEqual(WCSC36.QAT_SLOT_ORDER, (42, 43, 44))


if __name__ == "__main__":
    unittest.main()
