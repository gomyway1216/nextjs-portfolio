import importlib.util
import io
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

import torch


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import fresh_qat_protocol as FRESH  # noqa: E402
import fresh_qat_selection_preflight as PREFLIGHT  # noqa: E402
from train import DistillNet  # noqa: E402


def load_stdlib_fixture_helpers():
    fixture_path = ML_DIR / "tests_stdlib" / "test_fresh_qat_selection_preflight.py"
    specification = importlib.util.spec_from_file_location(
        "_fresh_qat_stdlib_fixture_helpers",
        fixture_path,
    )
    if specification is None or specification.loader is None:
        raise RuntimeError("cannot load fresh QAT stdlib fixture helpers")
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    return module


class FreshQatSelectionTorchPreflightTests(unittest.TestCase):
    def test_fixed_loader_and_model_validator_use_captured_checkpoint_bytes(self):
        model = DistillNet("board")
        buffer = io.BytesIO()
        torch.save(
            {
                "schema": FRESH.FRESH_QAT_FINAL_CHECKPOINT_SCHEMA,
                "model": model.state_dict(),
            },
            buffer,
        )
        raw = buffer.getvalue()

        checkpoint = PREFLIGHT._torch_checkpoint_loader(raw)
        self.assertEqual(
            checkpoint["schema"],
            FRESH.FRESH_QAT_FINAL_CHECKPOINT_SCHEMA,
        )
        PREFLIGHT._torch_strict_model_validator(checkpoint["model"], 42)

        for invalid in (bytearray(raw), "/tmp/not-checkpoint-bytes"):
            with self.subTest(type=type(invalid).__name__), self.assertRaisesRegex(
                ValueError,
                "cannot strict-load fresh final checkpoint",
            ):
                PREFLIGHT._torch_checkpoint_loader(invalid)

    def test_public_fixed_path_mints_one_shot_reader_guard(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            helpers = load_stdlib_fixture_helpers()
            fixture = helpers.synthetic_fixture(root)
            for registered_run in fixture["selection_registry"]["runs"]:
                seed = registered_run["seed"]
                checkpoint_path = root / registered_run["checkpoint"]["path"]
                checkpoint = fixture["checkpoints"][str(checkpoint_path)]
                checkpoint["model"] = DistillNet("board").state_dict()
                torch.save(checkpoint, checkpoint_path)
                registered_run["checkpoint"].update(
                    helpers.identity_file(checkpoint_path)
                )

                result = fixture["results"][seed]
                result["candidate_artifact"].update(
                    helpers.identity_file(checkpoint_path)
                )
                result_path = root / registered_run["result"]["path"]
                result_path.write_bytes(helpers.json_bytes(result))
                registered_run["result"].update(helpers.identity_file(result_path))
            helpers.write_selection_registry(fixture)

            module_path = root / "ml/fresh_qat_selection_preflight.py"
            module_path.write_text(
                "# public fixed-path test anchor\n", encoding="utf-8"
            )
            (root / ".gitignore").write_text("ml/runs/\n", encoding="utf-8")

            def git(*arguments):
                return subprocess.run(
                    ["/usr/bin/git", *arguments],
                    cwd=root,
                    check=True,
                    capture_output=True,
                    text=True,
                ).stdout

            git("init", "-q")
            git("config", "user.name", "Fresh QAT Torch Test")
            git("config", "user.email", "fresh-qat-torch@example.invalid")
            git(
                "add",
                ".gitignore",
                str(module_path.relative_to(root)),
                str(fixture["plan_path"].relative_to(root)),
                str(fixture["training_registry_path"].relative_to(root)),
                str(fixture["selection_registry_path"].relative_to(root)),
            )
            git("commit", "-q", "-m", "public fixed-path fixture")
            revision = git("rev-parse", "HEAD").strip()

            with mock.patch.object(PREFLIGHT, "__file__", str(module_path)):
                receipt = PREFLIGHT.preflight_fresh_qat_selection(
                    audit_revision=revision,
                )
            self.assertIsInstance(
                receipt,
                PREFLIGHT.FreshQatSelectionPreflightReceipt,
            )
            self.assertFalse(hasattr(receipt, "__dict__"))
            public = receipt.to_dict()
            self.assertEqual([run["seed"] for run in public["runs"]], [42, 43, 44])
            reader = mock.Mock(return_value={"reader": "fixed"})
            self.assertEqual(
                PREFLIGHT.call_fresh_selection_reader(receipt, reader),
                {"reader": "fixed"},
            )
            reader.assert_called_once()
            with self.assertRaisesRegex(ValueError, "unused preflight receipt"):
                PREFLIGHT.call_fresh_selection_reader(receipt, reader)
            with self.assertRaisesRegex(ValueError, "invalid or already used"):
                receipt.to_dict()


if __name__ == "__main__":
    unittest.main()
