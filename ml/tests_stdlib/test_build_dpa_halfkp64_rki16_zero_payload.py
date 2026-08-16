from __future__ import annotations

import hashlib
from pathlib import Path
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ml"))

from build_dpa_halfkp64_rki16_zero_payload import (  # noqa: E402
    TOTAL_BYTES,
    ZERO_PAYLOAD_SHA256,
    build_zero_payload,
)


class Halfkp64Rki16ZeroPayloadTest(unittest.TestCase):
    def test_create_only_payload_has_fixed_identity(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "zero.bin"
            result = build_zero_payload(output)
            self.assertEqual(output.stat().st_size, TOTAL_BYTES)
            self.assertEqual(result["sha256"], ZERO_PAYLOAD_SHA256)
            self.assertEqual(hashlib.sha256(output.read_bytes()).hexdigest(), ZERO_PAYLOAD_SHA256)
            with self.assertRaises(FileExistsError):
                build_zero_payload(output)


if __name__ == "__main__":
    unittest.main()
