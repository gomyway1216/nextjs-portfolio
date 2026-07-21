import importlib.util
import os
import sys
import unittest
from types import SimpleNamespace
from unittest import mock


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

DUMP_SPEC = importlib.util.spec_from_file_location(
    "dump_reference_for_test", os.path.join(ML_DIR, "dump-reference.py")
)
assert DUMP_SPEC is not None and DUMP_SPEC.loader is not None
DUMP = importlib.util.module_from_spec(DUMP_SPEC)
DUMP_SPEC.loader.exec_module(DUMP)


def fake_model(features: str, bucket_count: int):
    return SimpleNamespace(
        features=features,
        kp=bucket_count > 1,
        pad_idx=bucket_count * DUMP.BOARD_FEATS,
        hand_feats=bucket_count * DUMP.HAND_FEATS,
    )


class DumpReferenceInputTests(unittest.TestCase):
    def parsed_position(self, king_sq: int):
        hands = [float(value) for value in range(DUMP.HAND_FEATS)]
        return [3, 17], hands, True, king_sq

    def test_halfkp_factor_preserves_every_normalized_king_square(self):
        model = fake_model("halfkp-factor", 81)
        for king_sq in range(81):
            with self.subTest(king_sq=king_sq), mock.patch.object(
                DUMP, "parse_sfen", return_value=self.parsed_position(king_sq)
            ):
                pad, hands, hands_x, bucket = DUMP.prepare_reference_inputs(
                    model, "unused"
                )

                self.assertEqual(bucket, king_sq)
                self.assertEqual(pad[0], king_sq * DUMP.BOARD_FEATS + 3)
                self.assertEqual(pad[1], king_sq * DUMP.BOARD_FEATS + 17)
                start = king_sq * DUMP.HAND_FEATS
                self.assertEqual(hands_x[start : start + DUMP.HAND_FEATS], hands)
                self.assertEqual(sum(hands_x[:start]), 0.0)
                self.assertEqual(sum(hands_x[start + DUMP.HAND_FEATS :]), 0.0)

    def test_kp_keeps_historical_six_bucket_mapping(self):
        model = fake_model("kp", 6)
        king_sq = 80
        with mock.patch.object(
            DUMP, "parse_sfen", return_value=self.parsed_position(king_sq)
        ):
            pad, hands, hands_x, bucket = DUMP.prepare_reference_inputs(
                model, "unused"
            )

        expected_bucket = DUMP._train.kp_bucket(9, 9)
        self.assertEqual(bucket, expected_bucket)
        self.assertEqual(pad[0], expected_bucket * DUMP.BOARD_FEATS + 3)
        start = expected_bucket * DUMP.HAND_FEATS
        self.assertEqual(hands_x[start : start + DUMP.HAND_FEATS], hands)

    def test_board_features_remain_unbucketed(self):
        model = fake_model("board", 1)
        model.kp = False
        with mock.patch.object(
            DUMP, "parse_sfen", return_value=self.parsed_position(80)
        ):
            pad, hands, hands_x, bucket = DUMP.prepare_reference_inputs(
                model, "unused"
            )

        self.assertEqual(bucket, 0)
        self.assertEqual(pad[:2], [3, 17])
        self.assertEqual(hands_x, hands)

    def test_bucketed_features_skip_positions_without_a_king(self):
        model = fake_model("halfkp-factor", 81)
        with mock.patch.object(
            DUMP, "parse_sfen", return_value=self.parsed_position(-1)
        ):
            self.assertIsNone(DUMP.prepare_reference_inputs(model, "unused"))


if __name__ == "__main__":
    unittest.main()
