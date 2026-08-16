import os
from pathlib import Path
import sys
import tempfile
import unittest


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

from build_kingpair_zero_payload import (  # noqa: E402
    ZERO_PAYLOAD_SHA256,
    build_zero_payload,
)
from kingpair_runtime_int_reference import (  # noqa: E402
    HIDDEN,
    KING_EMBED,
    LAYOUT,
    MIX1,
    MIX2,
    MIXED,
    forward_dense_int,
    interaction_product_q,
    relative_king_index,
)


class KingPairRuntimeIntegerReferenceTests(unittest.TestCase):
    def test_payload_layout_is_contiguous_and_exact(self):
        self.assertEqual(LAYOUT.hand_w1, 47_029_248)
        self.assertEqual(LAYOUT.first_bias, 47_319_552)
        self.assertEqual(LAYOUT.king_pair, 47_320_064)
        self.assertEqual(LAYOUT.mix1_weight, 47_329_312)
        self.assertEqual(LAYOUT.mix1_bias, 47_396_896)
        self.assertEqual(LAYOUT.mix2_weight, 47_397_152)
        self.assertEqual(LAYOUT.mix2_bias, 47_401_248)
        self.assertEqual(LAYOUT.output_weight, 47_401_376)
        self.assertEqual(LAYOUT.output_bias, 47_401_440)
        self.assertEqual(LAYOUT.total_bytes, 47_401_444)

    def test_relative_bucket_and_product_rounding_are_frozen(self):
        self.assertEqual(relative_king_index(4 * 9 + 8, 4 * 9 + 8), 8 * 17)
        self.assertEqual(interaction_product_q(127, 127), 127)
        self.assertEqual(interaction_product_q(64, 64), 32)
        self.assertEqual(interaction_product_q(1, 63), 0)
        self.assertEqual(interaction_product_q(1, 64), 1)

    def test_zero_dense_payload_returns_zero(self):
        zeros1 = [[0] * MIXED for _ in range(MIX1)]
        zeros2 = [[0] * MIX1 for _ in range(MIX2)]
        output = forward_dense_int(
            [900] * HIDDEN,
            [-900] * HIDDEN,
            [0] * KING_EMBED,
            zeros1,
            [0] * MIX1,
            zeros2,
            [0] * MIX2,
            [0] * MIX2,
            0,
        )
        self.assertEqual(output, 0)

    def test_zero_payload_builder_is_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "kingpair-zero.bin"
            result = build_zero_payload(output)
            self.assertEqual(result["bytes"], LAYOUT.total_bytes)
            self.assertEqual(result["sha256"], ZERO_PAYLOAD_SHA256)
            self.assertFalse(any(output.read_bytes()))
            with self.assertRaises(FileExistsError):
                build_zero_payload(output)


if __name__ == "__main__":
    unittest.main()
