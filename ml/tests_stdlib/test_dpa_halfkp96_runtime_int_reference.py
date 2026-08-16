import os
from pathlib import Path
import sys
import tempfile
import unittest


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

from build_dpa_halfkp96_zero_payload import (  # noqa: E402
    ZERO_PAYLOAD_SHA256,
    build_zero_payload,
)
from dpa_halfkp96_runtime_int_reference import (  # noqa: E402
    HIDDEN,
    LAYOUT,
    forward_int,
)


class DpaHalfkp96RuntimeIntegerReferenceTests(unittest.TestCase):
    def test_payload_layout_is_contiguous_and_exact(self):
        self.assertEqual(LAYOUT.hand_w1, 35_271_936)
        self.assertEqual(LAYOUT.first_bias, 35_489_664)
        self.assertEqual(LAYOUT.output_weight, 35_490_048)
        self.assertEqual(LAYOUT.total_bytes, 35_490_240)

    def test_forward_is_antisymmetric_and_clipped(self):
        us = [200, -10] + [30] * (HIDDEN - 2)
        them = [20, 100] + [10] * (HIDDEN - 2)
        weights = [3, -2] + [1] * (HIDDEN - 2)
        forward = forward_int(us, them, weights)
        reverse = forward_int(them, us, weights)
        self.assertEqual(forward, -reverse)
        self.assertEqual(forward_int([0] * HIDDEN, [0] * HIDDEN, weights), 0)

    def test_zero_payload_builder_is_atomic_create_only(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "dpa-halfkp96-zero.bin"
            result = build_zero_payload(output)
            self.assertEqual(result["bytes"], LAYOUT.total_bytes)
            self.assertEqual(result["sha256"], ZERO_PAYLOAD_SHA256)
            self.assertFalse(any(output.read_bytes()))
            with self.assertRaises(FileExistsError):
                build_zero_payload(output)


if __name__ == "__main__":
    unittest.main()
