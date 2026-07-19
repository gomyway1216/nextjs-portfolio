from pathlib import Path
from types import SimpleNamespace
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
