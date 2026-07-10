import os
import sys
import tempfile
import unittest


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

from checkpoint_compat import (  # noqa: E402
    CheckpointCompatibilityError,
    expected_arch,
    sha256_file,
    validate_arch,
)


class CheckpointCompatibilityTest(unittest.TestCase):
    def setUp(self):
        self.arch = expected_arch(
            features="board",
            input_dim=2282,
            h1=256,
            h2=32,
            k=600,
            kp_buckets=1,
        )

    def test_accepts_an_exact_architecture_match(self):
        validate_arch(dict(self.arch), self.arch)

    def test_reports_every_mismatched_field(self):
        actual = dict(self.arch)
        actual.update(features="kp", input=13692, h1=128, k=400, kp_buckets=6)
        with self.assertRaises(CheckpointCompatibilityError) as caught:
            validate_arch(actual, self.arch)
        message = str(caught.exception)
        for field in ("features", "input", "h1", "k", "kp_buckets"):
            self.assertIn(field, message)
        self.assertIn("expected", message)
        self.assertIn("actual", message)

    def test_rejects_missing_or_versionless_metadata(self):
        with self.assertRaisesRegex(CheckpointCompatibilityError, "metadata is missing"):
            validate_arch(None, self.arch)
        actual = dict(self.arch)
        del actual["schema"]
        with self.assertRaisesRegex(CheckpointCompatibilityError, "schema"):
            validate_arch(actual, self.arch)

    def test_hashes_the_exact_checkpoint_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "best.pt")
            with open(path, "wb") as target:
                target.write(b"checkpoint-bytes\r\n")
            self.assertEqual(
                sha256_file(path),
                "f8d623420d964102d47545273cf24eeba74e41104cfa30ba99e42734b7e804f7",
            )


if __name__ == "__main__":
    unittest.main()
