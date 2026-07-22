import json
import math
import os
import struct
import sys
import tempfile
import unittest

import torch
import torch.nn as nn
import torch.nn.functional as F


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

from train_bonapiece_halfkp import (  # noqa: E402
    BONA_ZERO,
    BOARD_BASES,
    FE_END,
    FE_HAND_END,
    HALFKP_DIM,
    HAND_BASES,
    LEGACY_EXPORT_BYTES,
    NON_KING_PIECES,
    BonaPieceHalfKPNet,
    _checkpoint_topology,
    _loaded_data_metadata,
    build_argument_parser,
    expected_research_export_bytes,
    export_research_weights,
    load_legacy_custom_weights,
    load_teacher_jsonl,
    parse_sfen_bonapiece_halfkp,
    probability_loss,
    quantize_research_model,
    research_int16_forward,
    semantic_warm_initialize_from_legacy,
    validate_training_arguments,
)


START = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"


class BonaPieceHalfKPTests(unittest.TestCase):
    def write_legacy_fixture(self, directory):
        payload = bytearray(LEGACY_EXPORT_BYTES)

        def i16(offset, value):
            struct.pack_into("<h", payload, offset, value)

        def i32(offset, value):
            struct.pack_into("<i", payload, offset, value)

        w1_board = 0
        w1_hand = 2 * 2268 * 256
        b1 = w1_hand + 2 * 14 * 256
        w2 = b1 + 4 * 256
        b2 = w2 + 2 * 32 * 256
        w3 = b2 + 4 * 32
        b3 = w3 + 2 * 32

        # Board feature-major rows.
        i16(w1_board + 2 * ((0 * 81 + 10) * 256 + 0), 127)  # friend pawn
        i16(w1_board + 2 * ((14 * 81 + 10) * 256 + 0), -127)  # enemy pawn
        i16(w1_board + 2 * ((4 * 81 + 15) * 256 + 2), 63)  # friend gold
        i16(w1_board + 2 * ((8 * 81 + 15) * 256 + 2), 100)  # ignored +P
        i16(w1_hand + 2 * (0 * 256 + 1), 11)  # friend pawn hand linear row
        i16(w1_hand + 2 * (7 * 256 + 1), 17)  # enemy pawn hand linear row
        i32(b1 + 4 * 3, 127)
        i16(w2 + 2 * (2 * 256 + 4), 64)
        i32(b2 + 4 * 2, 8128)
        i16(w3 + 2 * 2, 64)
        i32(b3, 8128)

        path = os.path.join(directory, "legacy.weights.bin")
        with open(path, "wb") as target:
            target.write(payload)
        return path

    def test_exact_official_default_offsets(self):
        self.assertEqual(FE_HAND_END, 90)
        self.assertEqual(FE_END, 1548)
        self.assertEqual(HALFKP_DIM, 81 * 1548)
        self.assertEqual(
            HAND_BASES,
            {
                "P": (1, 20), "L": (39, 44), "N": (49, 54),
                "S": (59, 64), "G": (69, 74), "B": (79, 82), "R": (85, 88),
            },
        )
        self.assertEqual(
            BOARD_BASES,
            {
                "P": (90, 171), "L": (252, 333), "N": (414, 495),
                "S": (576, 657), "G": (738, 819), "B": (900, 981),
                "H": (1062, 1143), "R": (1224, 1305), "D": (1386, 1467),
            },
        )

    def test_start_position_has_38_non_king_features_in_both_views(self):
        parsed = parse_sfen_bonapiece_halfkp(START)
        self.assertEqual(parsed.missing_pieces, 0)
        self.assertEqual(tuple(map(len, parsed.bona_pieces)), (38, 38))
        self.assertEqual(tuple(map(len, parsed.halfkp)), (38, 38))
        self.assertNotIn(BONA_ZERO, parsed.bona_pieces[0])
        self.assertNotIn(BONA_ZERO, parsed.bona_pieces[1])
        self.assertEqual(parsed.king_squares, (44, 44))
        self.assertEqual(parsed.perspective_black, (True, False))

    def test_stacked_hand_slots_and_handicap_zero_are_explicit(self):
        # Remove three black pawns and two white pawns from the board; put 3P2p
        # in hand.  Slots are consecutive and total inventory remains complete.
        sfen = "lnsgkgsnl/1r5b1/ppppppp2/9/9/9/3PPPPPP/1B5R1/LNSGKGSNL b 3P2p 1"
        parsed = parse_sfen_bonapiece_halfkp(sfen)
        self.assertEqual(parsed.missing_pieces, 0)
        black_view, white_view = parsed.bona_pieces
        for value in (1, 2, 3, 20, 21):
            self.assertIn(value, black_view)
        for value in (20, 21, 22, 1, 2):
            self.assertIn(value, white_view)

        handicap = parse_sfen_bonapiece_halfkp(
            "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/7R1/LNSGKGSNL b - 1"
        )
        self.assertEqual(handicap.missing_pieces, 1)
        self.assertEqual(handicap.bona_pieces[0].count(BONA_ZERO), 1)
        self.assertEqual(handicap.bona_pieces[1].count(BONA_ZERO), 1)
        self.assertEqual(tuple(map(len, handicap.bona_pieces)), (38, 38))

    def test_promoted_minors_collapse_to_gold_but_horse_dragon_are_distinct(self):
        sfen = "4k4/9/9/9/4+P+L+N+S1/9/9/9/4K+B+R2 b 14P3L3N3S4GBR 1"
        parsed = parse_sfen_bonapiece_halfkp(sfen)
        black = parsed.bona_pieces[0]
        # Rank five is index 4; files 5,4,3,2 become squares 40,31,22,13.
        for square in (40, 31, 22, 13):
            self.assertIn(BOARD_BASES["G"][0] + square, black)
        self.assertIn(BOARD_BASES["H"][0] + 35, black)
        self.assertIn(BOARD_BASES["D"][0] + 26, black)
        for collapsed in ("P", "L", "N", "S"):
            self.assertNotIn(BOARD_BASES[collapsed][0] + {"P": 40, "L": 31, "N": 22, "S": 13}[collapsed], black)

    def test_turn_only_swaps_perspective_order_and_white_view_rotates(self):
        black_turn = parse_sfen_bonapiece_halfkp(START)
        white_turn = parse_sfen_bonapiece_halfkp(START.replace(" b ", " w "))
        self.assertEqual(white_turn.perspective_black, (False, True))
        self.assertEqual(white_turn.bona_pieces[0], black_turn.bona_pieces[1])
        self.assertEqual(white_turn.bona_pieces[1], black_turn.bona_pieces[0])
        self.assertEqual(white_turn.halfkp[0], black_turn.halfkp[1])
        self.assertEqual(white_turn.halfkp[1], black_turn.halfkp[0])

        # In black view, black pawn on 7g is friend at square 60. In white view
        # it is enemy at the rotated square 20.
        self.assertIn(BOARD_BASES["P"][0] + 60, black_turn.bona_pieces[0])
        self.assertIn(BOARD_BASES["P"][1] + 20, black_turn.bona_pieces[1])

    def test_malformed_inventory_and_kings_fail_closed(self):
        with self.assertRaisesRegex(ValueError, "too many P"):
            parse_sfen_bonapiece_halfkp(START.replace(" - ", " 19P "))
        with self.assertRaisesRegex(ValueError, "exactly one black king"):
            parse_sfen_bonapiece_halfkp(START.replace("K", "1", 1))

    def test_model_dimensions_shared_transform_and_fixed_export_layout(self):
        torch.manual_seed(7)
        model = BonaPieceHalfKPNet()
        self.assertEqual(tuple(model.transform.weight.shape), (81 * 1548, 256))
        self.assertEqual(tuple(model.l2.weight.shape), (32, 512))
        self.assertEqual(tuple(model.l3.weight.shape), (32, 32))
        self.assertEqual(tuple(model.l4.weight.shape), (1, 32))
        sample = torch.tensor([parse_sfen_bonapiece_halfkp(START).halfkp])
        self.assertEqual(tuple(model(sample).shape), (1,))

        quantized = quantize_research_model(model)
        self.assertEqual(tuple(quantized["w1"].shape), (81 * 1548, 256))
        self.assertEqual(quantized["w1"].dtype, torch.int16)
        self.assertEqual(quantized["b1"].dtype, torch.int32)
        integer_output = research_int16_forward(quantized, sample)
        self.assertEqual(tuple(integer_output.shape), (1,))
        self.assertEqual(integer_output.dtype, torch.int64)
        self.assertEqual(expected_research_export_bytes(), 64_234_820)

        with tempfile.TemporaryDirectory() as directory:
            metadata = export_research_weights(model, directory, 600.0)
            path = os.path.join(directory, "bonapiece-halfkp-research.weights.bin")
            self.assertEqual(os.path.getsize(path), expected_research_export_bytes())
            self.assertFalse(metadata["production_compatible"])
            self.assertFalse(metadata["yaneuraou_nnue_file"])
            self.assertEqual(metadata["weights"]["bytes"], 64_234_820)
            self.assertEqual(len(metadata["weights"]["sha256"]), 64)
            self.assertNotIn("data", metadata)

    def test_default_dual_model_remains_bit_exact_with_original_construction(self):
        class OriginalDual(nn.Module):
            def __init__(self):
                super().__init__()
                self.transform = nn.EmbeddingBag(81 * 1548, 256, mode="sum")
                self.b1 = nn.Parameter(torch.zeros(256))
                self.l2 = nn.Linear(512, 32)
                self.l3 = nn.Linear(32, 32)
                self.l4 = nn.Linear(32, 1)

            def forward(self, features):
                batch = features.shape[0]
                transformed = self.transform(features.reshape(batch * 2, 38))
                transformed = torch.clamp(transformed + self.b1, 0.0, 1.0)
                transformed = transformed.reshape(batch, 512)
                hidden2 = torch.clamp(self.l2(transformed), 0.0, 1.0)
                hidden3 = torch.clamp(self.l3(hidden2), 0.0, 1.0)
                return self.l4(hidden3).squeeze(-1)

        torch.manual_seed(20260721)
        current = BonaPieceHalfKPNet()
        torch.manual_seed(20260721)
        original = OriginalDual()
        self.assertEqual(list(current.state_dict()), list(original.state_dict()))
        for name, value in current.state_dict().items():
            self.assertTrue(torch.equal(value, original.state_dict()[name]), name)
        sample = torch.tensor([parse_sfen_bonapiece_halfkp(START).halfkp])
        self.assertTrue(torch.equal(current(sample), original(sample)))

    def test_single_topology_exact_layout_metadata_and_offsets(self):
        model = BonaPieceHalfKPNet("single")
        self.assertEqual(model.topology, "single")
        self.assertEqual(tuple(model.transform.weight.shape), (81 * 1548, 256))
        self.assertEqual(tuple(model.l2.weight.shape), (32, 256))
        self.assertEqual(tuple(model.l3.weight.shape), (1, 32))
        self.assertFalse(hasattr(model, "l4"))

        with torch.no_grad():
            for parameter in model.parameters():
                parameter.zero_()
            model.transform.weight[0, 0] = 1 / 127
            model.b1[0] = 1 / 127
            model.l2.weight[0, 0] = 1 / 64
            model.l2.bias[0] = 1 / (127 * 64)
            model.l3.weight[0, 0] = 1 / 64
            model.l3.bias[0] = 1 / (127 * 64)

        quantized = quantize_research_model(model)
        self.assertEqual(
            list(quantized), ["w1", "b1", "w2", "b2", "w3", "b3"]
        )
        self.assertEqual(tuple(quantized["w2"].shape), (32, 256))
        self.assertEqual(tuple(quantized["w3"].shape), (32,))
        self.assertEqual(expected_research_export_bytes("single"), 64_216_260)

        offsets = {
            "w1": 0,
            "b1": 81 * 1548 * 256 * 2,
            "w2": 81 * 1548 * 256 * 2 + 256 * 4,
        }
        offsets["b2"] = offsets["w2"] + 32 * 256 * 2
        offsets["w3"] = offsets["b2"] + 32 * 4
        offsets["b3"] = offsets["w3"] + 32 * 2
        self.assertEqual(offsets["b3"] + 4, 64_216_260)

        data_evidence = {
            "train": {
                "loaded_rows": 5_892_140,
                "skipped_rows": 52,
                "malformed_policy": "skip-json-sfen-only",
            }
        }
        with tempfile.TemporaryDirectory() as directory:
            metadata = export_research_weights(
                model, directory, 600.0, data=data_evidence
            )
            path = os.path.join(
                directory, "bonapiece-halfkp-single-research.weights.bin"
            )
            self.assertEqual(os.path.getsize(path), 64_216_260)
            with open(path, "rb") as source:
                for name, fmt in (
                    ("w1", "<h"),
                    ("b1", "<i"),
                    ("w2", "<h"),
                    ("b2", "<i"),
                    ("w3", "<h"),
                    ("b3", "<i"),
                ):
                    source.seek(offsets[name])
                    self.assertEqual(struct.unpack(fmt, source.read(struct.calcsize(fmt)))[0], 1)
            self.assertEqual(metadata["runtime_selector"], 84)
            self.assertEqual(
                metadata["topology"], "single-perspective-side-to-move"
            )
            self.assertTrue(metadata["nonstandard_topology"])
            self.assertFalse(metadata["production_compatible"])
            self.assertFalse(metadata["yaneuraou_nnue_file"])
            self.assertIn("not a YaneuraOu .nnue file", metadata["notices"][1])
            self.assertEqual(metadata["weights"]["bytes"], 64_216_260)
            self.assertEqual(metadata["data"], data_evidence)

    def test_legacy_semantic_warm_init_is_deterministic_and_maps_meaning(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.write_legacy_fixture(directory)
            torch.manual_seed(1)
            first = BonaPieceHalfKPNet()
            first_metadata = semantic_warm_initialize_from_legacy(first, path)
            torch.manual_seed(999)
            second = BonaPieceHalfKPNet()
            second_metadata = semantic_warm_initialize_from_legacy(second, path)

        self.assertEqual(first_metadata, second_metadata)
        self.assertFalse(first_metadata["exact_lift"])
        self.assertFalse(first_metadata["target_binary_layout_changed"])
        self.assertIn("excludes both kings", first_metadata["non_exact_reasons"][0])
        for name, value in first.state_dict().items():
            self.assertTrue(torch.equal(value, second.state_dict()[name]), name)

        q = quantize_research_model(first)
        for king in (0, 17, 80):
            bucket = king * FE_END
            self.assertEqual(int(q["w1"][bucket + BOARD_BASES["P"][0] + 10, 0]), 127)
            self.assertEqual(int(q["w1"][bucket + BOARD_BASES["P"][1] + 10, 0]), -127)
            # Official promoted minors share G and therefore use legacy G, not +P.
            self.assertEqual(int(q["w1"][bucket + BOARD_BASES["G"][0] + 15, 2]), 63)
            self.assertEqual(int(q["w1"][bucket + BONA_ZERO, 0]), 0)

        # Slot repetition preserves the old linear hand contribution for count c.
        pawn_slots = q["w1"][1:4, 1]
        self.assertTrue(torch.equal(pawn_slots, torch.tensor([11, 11, 11], dtype=torch.int16)))
        self.assertEqual(int(pawn_slots.to(torch.int32).sum()), 3 * 11)
        enemy_slots = q["w1"][20:23, 1]
        self.assertTrue(torch.equal(enemy_slots, torch.tensor([17, 17, 17], dtype=torch.int16)))

        self.assertEqual(int(q["b1"][3]), 127)
        self.assertEqual(int(q["w2"][2, 4]), 64)
        self.assertEqual(int(torch.count_nonzero(q["w2"][:, 256:])), 0)
        self.assertTrue(torch.equal(q["w3"], torch.eye(32, dtype=torch.int16) * 64))
        self.assertEqual(int(q["w4"][2]), 64)
        self.assertEqual(int(q["b4"][0]), 8128)

    def test_single_semantic_warm_init_maps_dense_layers_without_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.write_legacy_fixture(directory)
            torch.manual_seed(11)
            first = BonaPieceHalfKPNet("single")
            first_metadata = semantic_warm_initialize_from_legacy(first, path)
            torch.manual_seed(999)
            second = BonaPieceHalfKPNet("single")
            second_metadata = semantic_warm_initialize_from_legacy(second, path)

        self.assertEqual(first_metadata, second_metadata)
        self.assertEqual(first_metadata["topology"], "single")
        self.assertFalse(first_metadata["exact_lift"])
        self.assertFalse(first_metadata["mapping"]["inserted_hidden_layer"])
        self.assertEqual(
            first_metadata["mapping"]["dense"],
            "legacy W2 and output copied directly",
        )
        for name, value in first.state_dict().items():
            self.assertTrue(torch.equal(value, second.state_dict()[name]), name)

        q = quantize_research_model(first)
        self.assertEqual(int(q["w1"][BOARD_BASES["P"][0] + 10, 0]), 127)
        self.assertEqual(int(q["w2"][2, 4]), 64)
        self.assertEqual(int(q["b2"][2]), 8128)
        self.assertEqual(int(q["w3"][2]), 64)
        self.assertEqual(int(q["b3"][0]), 8128)

        sample = torch.tensor([parse_sfen_bonapiece_halfkp(START).halfkp])
        float_output = first(sample)
        integer_output = research_int16_forward(q, sample, "single")
        self.assertTrue(
            torch.equal(float_output, integer_output.to(torch.float32) / (127 * 64))
        )

        opponent_changed = sample.clone()
        opponent_changed[:, 1, :] = 0
        self.assertTrue(torch.equal(first(sample), first(opponent_changed)))
        self.assertTrue(
            torch.equal(
                research_int16_forward(q, sample, "single"),
                research_int16_forward(q, opponent_changed, "single"),
            )
        )

    def test_legacy_loader_and_init_mode_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self.write_legacy_fixture(directory)
            weights, identity = load_legacy_custom_weights(path)
            self.assertEqual(identity["bytes"], LEGACY_EXPORT_BYTES)
            self.assertEqual(tuple(weights["w1_board"].shape), (2268, 256))

            short_path = os.path.join(directory, "short.bin")
            with open(short_path, "wb") as target:
                target.write(b"not-a-weight")
            with self.assertRaisesRegex(ValueError, "exactly 1185988 bytes"):
                load_legacy_custom_weights(short_path)

            parser = build_argument_parser()
            base = parser.parse_args(
                ["--out", directory, "--train-data", "train", "--val-data", "val"]
            )
            base.init_mode = "legacy-semantic-warm"
            with self.assertRaisesRegex(ValueError, "requires --legacy-weights"):
                validate_training_arguments(base)
            base.legacy_weights = path
            validate_training_arguments(base)
            base.init_mode = "scratch"
            with self.assertRaisesRegex(ValueError, "requires --init-mode"):
                validate_training_arguments(base)

    def test_basic_cli_numeric_ranges_fail_closed(self):
        parser = build_argument_parser()
        with tempfile.TemporaryDirectory() as directory:
            args = parser.parse_args(
                ["--out", directory, "--train-data", "train", "--val-data", "val"]
            )
            for field, value, message in (
                ("lr", 0.0, "lr must be finite and positive"),
                ("lr", math.nan, "lr must be finite and positive"),
                ("weight_decay", -0.1, "weight-decay must be finite"),
                ("weight_decay", math.inf, "weight-decay must be finite"),
                ("k", 0.0, "k must be finite and positive"),
                ("wdl_mix", 1.1, "wdl-mix must be finite"),
                ("loss_power", 0.99, "loss-power must be finite"),
                ("loss_power", math.nan, "loss-power must be finite"),
                ("epochs", 0, "epochs must be a positive integer"),
                ("limit", -1, "limit must be a non-negative integer"),
            ):
                original = getattr(args, field)
                setattr(args, field, value)
                with self.subTest(field=field, value=value):
                    with self.assertRaisesRegex(ValueError, message):
                        validate_training_arguments(args)
                setattr(args, field, original)

            self.assertEqual(args.topology, "dual")
            self.assertFalse(args.skip_malformed)
            skip_args = parser.parse_args(
                [
                    "--out", directory,
                    "--train-data", "train",
                    "--val-data", "val",
                    "--skip-malformed",
                ]
            )
            self.assertTrue(skip_args.skip_malformed)
            validate_training_arguments(skip_args)
            skip_args.skip_malformed = "yes"
            with self.assertRaisesRegex(ValueError, "skip-malformed must be a boolean"):
                validate_training_arguments(skip_args)
            args.topology = "unsupported"
            with self.assertRaisesRegex(ValueError, "topology must be one of"):
                validate_training_arguments(args)
            with self.assertRaisesRegex(ValueError, "topology must be one of"):
                BonaPieceHalfKPNet("unsupported")
            with self.assertRaisesRegex(ValueError, "topology must be one of"):
                expected_research_export_bytes("unsupported")

            valid_single = {
                "schema": "shogi-bonapiece-halfkp-training-checkpoint-v1",
                "architecture": {"topology": "single"},
            }
            self.assertEqual(_checkpoint_topology(valid_single, "resume"), "single")
            with self.assertRaisesRegex(ValueError, "incompatible topology"):
                _checkpoint_topology(
                    {
                        "schema": "shogi-bonapiece-halfkp-training-checkpoint-v1",
                        "architecture": {"topology": "other"},
                    },
                    "resume",
                )

    def test_loss_power_two_is_historical_mse_and_26_matches_definition(self):
        logits = torch.tensor([-2.0, -0.3, 0.0, 1.7], dtype=torch.float32)
        targets = torch.tensor([0.0, 0.25, 0.5, 1.0], dtype=torch.float32)
        old = F.mse_loss(torch.sigmoid(logits), targets)
        default = probability_loss(logits, targets, 2.0)
        self.assertTrue(torch.equal(default, old))

        expected = torch.abs(torch.sigmoid(logits) - targets).pow(2.6).mean()
        actual = probability_loss(logits, targets, 2.6)
        self.assertTrue(torch.equal(actual, expected))
        expected_sum = torch.abs(torch.sigmoid(logits) - targets).pow(2.6).sum()
        self.assertTrue(
            torch.equal(
                probability_loss(logits, targets, 2.6, reduction="sum"),
                expected_sum,
            )
        )

    def test_teacher_jsonl_cp_and_played_only_wdl_mix(self):
        rows = [
            {"sfen": START, "cp": 0, "outcome": 1},
            {"sfen": START.replace(" b ", " w "), "cp": 0},
        ]
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "teacher.jsonl")
            with open(path, "w", encoding="utf-8", newline="\n") as target:
                for row in rows:
                    target.write(json.dumps(row) + "\n")
            loaded = load_teacher_jsonl(path, wdl_mix=0.25)
        self.assertEqual(tuple(loaded.features.shape), (2, 2, NON_KING_PIECES))
        self.assertEqual(loaded.features.dtype, torch.int32)
        self.assertTrue(torch.equal(loaded.targets, torch.tensor([0.625, 0.5])))
        self.assertEqual(loaded.outcome_rows, 1)
        self.assertEqual(loaded.input_rows, 2)
        self.assertEqual(loaded.skipped_rows, 0)
        self.assertEqual(loaded.skipped_json_rows, 0)
        self.assertEqual(loaded.skipped_sfen_rows, 0)

    def test_skip_malformed_is_explicit_narrow_and_auditable(self):
        valid_black = json.dumps({"sfen": START, "cp": 25, "outcome": 1}).encode()
        malformed_sfen = json.dumps(
            {"sfen": START.replace(" - ", " S "), "cp": 0}
        ).encode()
        valid_white = json.dumps(
            {"sfen": START.replace(" b ", " w "), "cp": -25, "outcome": 0}
        ).encode()
        payload = b"\n".join(
            (
                valid_black,
                malformed_sfen,
                b"",
                b"{bad-json",
                b"[]",
                b'{"sfen": "\xff"}',
                valid_white,
            )
        ) + b"\n"
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "teacher.jsonl")
            with open(path, "wb") as target:
                target.write(payload)

            # The historical/default path still fails on the first malformed
            # SFEN and never silently changes the training population.
            with self.assertRaisesRegex(ValueError, "too many S pieces: 5 > 4"):
                load_teacher_jsonl(path)

            loaded = load_teacher_jsonl(path, skip_malformed=True, wdl_mix=0.25)

        self.assertEqual(loaded.rows, 2)
        self.assertEqual(loaded.input_rows, 7)
        self.assertEqual(loaded.skipped_rows, 5)
        self.assertEqual(loaded.skipped_json_rows, 4)
        self.assertEqual(loaded.skipped_sfen_rows, 1)
        self.assertEqual(loaded.outcome_rows, 2)
        self.assertEqual(tuple(loaded.features.shape), (2, 2, NON_KING_PIECES))
        self.assertTrue(torch.isfinite(loaded.targets).all())
        checkpoint_data = _loaded_data_metadata(loaded, skip_malformed=True)
        self.assertEqual(checkpoint_data["loaded_rows"], 2)
        self.assertEqual(checkpoint_data["skipped_rows"], 5)
        self.assertEqual(checkpoint_data["skipped_json_rows"], 4)
        self.assertEqual(checkpoint_data["skipped_sfen_rows"], 1)
        self.assertEqual(checkpoint_data["malformed_policy"], "skip-json-sfen-only")

    def test_skip_malformed_never_skips_cp_or_outcome_integrity_errors(self):
        cases = (
            ({"sfen": START, "cp": "bad"}, "cp must be a finite number"),
            ({"sfen": START, "cp": math.nan}, "cp must be a finite number"),
            (
                {"sfen": START, "cp": 0, "outcome": 0.25},
                "outcome must be one of 0, 0.5, 1",
            ),
        )
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "teacher.jsonl")
            for record, message in cases:
                with open(path, "w", encoding="utf-8", newline="\n") as target:
                    target.write(json.dumps(record) + "\n")
                with self.subTest(record=record):
                    with self.assertRaisesRegex(ValueError, message):
                        load_teacher_jsonl(path, skip_malformed=True)

            with self.assertRaisesRegex(ValueError, "skip_malformed must be a boolean"):
                load_teacher_jsonl(path, skip_malformed=1)


if __name__ == "__main__":
    unittest.main()
