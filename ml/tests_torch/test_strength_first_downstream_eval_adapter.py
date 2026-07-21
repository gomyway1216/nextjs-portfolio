from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

import torch


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

import strength_first_downstream_eval_adapter as ADAPTER  # noqa: E402


TRAINER = ADAPTER._load_module(
    "strength_first_downstream_adapter_test_train",
    "train.py",
)


def identity(name: str, marker: str) -> dict:
    return {
        "path": name,
        "bytes": 100 + ord(marker),
        "sha256": marker * 64,
        "schema": f"test-{name}-v1",
    }


def file_identity(path: Path) -> dict:
    raw = path.read_bytes()
    return {
        "path": path.name,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "schema": "test-legacy-retention-v1",
    }


def generator_rows() -> list[dict]:
    return [
        {
            "sfen": (
                "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/" "PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
            ),
            "cp": 30_000,
            "ply": 0,
            "bestmove": "7g7f",
            "depth": 8,
            # The generator explicitly maps a non-resign ``score mate 0`` to
            # +30000, so zero is part of the historical producer contract.
            "mate": 0,
        },
        {
            "sfen": (
                "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/" "PP1PPPPPP/1B5R1/LNSGKGSNL w - 2"
            ),
            "cp": -29_995,
            "ply": 1,
            "bestmove": "3c3d",
            "depth": 8,
            "mate": -5,
        },
        {
            "sfen": (
                "lnsgkgsnl/1r5b1/pp1pppppp/2p6/9/2P6/" "PP1PPPPPP/1B5R1/LNSGKGSNL b - 3"
            ),
            "cp": -100,
            "ply": 2,
            "bestmove": "2g2f",
            "depth": 8,
        },
        {
            "sfen": (
                "lnsgkgsnl/1r5b1/pp1pppppp/2p6/9/2P4P1/"
                "PP1PPPP1P/1B5R1/LNSGKGSNL w - 4"
            ),
            "cp": 200,
            "ply": 3,
            "bestmove": "8c8d",
            "depth": 8,
        },
    ]


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_bytes(
        b"".join(
            json.dumps(row, separators=(",", ":")).encode("utf-8") + b"\n"
            for row in rows
        )
    )


class Model:
    def __init__(self, name: str):
        self.name = name


class FakeEvaluator:
    def __init__(self, identities: dict[str, dict]):
        self.identities = identities

    def load_model(self, path: str):
        name = "candidate" if "candidate" in path else "stable"
        epoch = 20 if name == "candidate" else 27
        fingerprint = self.identities[f"{name}_checkpoint"]
        return (
            Model(name),
            {"epoch": epoch},
            600.0,
            {
                "bytes": fingerprint["bytes"],
                "sha256": fingerprint["sha256"],
            },
        )

    def load_validation_data(self, path: str, _cp_clamp: int):
        fingerprint = self.identities[path]
        board = torch.tensor([[1], [1]], dtype=torch.long)
        hands = torch.zeros((2, 1), dtype=torch.float32)
        raw = torch.tensor([-100.0, 100.0])
        return (
            board,
            hands,
            torch.zeros(2, dtype=torch.long),
            raw,
            raw,
            [{}, {}],
            [[0, 1]],
            {
                "bytes": fingerprint["bytes"],
                "sha256": fingerprint["sha256"],
            },
        )

    def quantized_predictions(
        self,
        model: Model,
        board: torch.Tensor,
        _hands: torch.Tensor,
        _k_sigmoid: float,
    ):
        if board.shape[0] == 4:
            if model.name == "candidate":
                return torch.tensor([2_900.0, -2_900.0, -90.0, 190.0])
            return torch.tensor([2_800.0, -2_800.0, -80.0, 180.0])
        return (
            torch.tensor([-90.0, 90.0])
            if model.name == "candidate"
            else torch.tensor([-80.0, 80.0])
        )

    @staticmethod
    def calculate_metrics(
        predictions,
        _clamped_cp,
        _raw_cp,
        _metadata,
        _pair_min_cp,
    ):
        candidate = float(predictions[0]) == -90.0
        return {
            "value_mae_cp": 10.0 if candidate else 20.0,
            "value_mse_cp2": 100.0 if candidate else 400.0,
            "within_parent_pair_accuracy": 0.7 if candidate else 0.6,
            "teacher_top1_accuracy": 0.6 if candidate else 0.5,
        }


class StrengthFirstDownstreamMetricAdapterTests(unittest.TestCase):
    def configured(self, directory: str):
        root = Path(directory)
        general = root / "general.jsonl"
        opening = root / "opening.jsonl"
        write_jsonl(general, generator_rows())
        write_jsonl(opening, generator_rows())
        identities = {
            "candidate_checkpoint": identity("candidate.pt", "a"),
            "stable_checkpoint": identity("stable.pt", "b"),
            "fresh.jsonl": identity("fresh.jsonl", "c"),
            "legacy.jsonl": identity("legacy.jsonl", "d"),
        }
        evaluator = FakeEvaluator(identities)
        datasets = {
            "fresh_final_holdout": (
                "fresh.jsonl",
                identities["fresh.jsonl"],
            ),
            "legacy_final_holdout": (
                "legacy.jsonl",
                identities["legacy.jsonl"],
            ),
            "general_retention": (str(general), file_identity(general)),
            "opening_retention": (str(opening), file_identity(opening)),
        }
        return identities, evaluator, datasets

    def test_generator_jsonl_uses_legacy_loader_and_real_retention_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            identities, evaluator, datasets = self.configured(directory)
            with mock.patch.object(ADAPTER, "RETENTION_PAIR_COUNT", 64):
                result = ADAPTER.evaluate_int16_datasets(
                    candidate_checkpoint_path="candidate.pt",
                    candidate_checkpoint=identities["candidate_checkpoint"],
                    stable_checkpoint_path="stable.pt",
                    stable_checkpoint=identities["stable_checkpoint"],
                    datasets=datasets,
                    evaluator=evaluator,
                    trainer=TRAINER,
                    torch_module=torch,
                )

        self.assertEqual(
            result["fresh_final_holdout"],
            {
                "candidate_int16_pair_accuracy": 0.7,
                "stable_int16_pair_accuracy": 0.6,
                "candidate_int16_top1_accuracy": 0.6,
                "stable_int16_top1_accuracy": 0.5,
            },
        )
        self.assertEqual(
            set(result["retention"]),
            {"general", "opening"},
        )
        self.assertEqual(
            result["retention"]["general"]["candidate_pair_accuracy"],
            1.0,
        )
        self.assertEqual(
            result["retention"]["general"]["candidate_decisive_pair_accuracy"],
            1.0,
        )

    def test_legacy_loader_rejects_every_row_instead_of_skipping(self):
        base = generator_rows()
        malformed_cases = {
            "blank": (
                json.dumps(base[0], separators=(",", ":")).encode() + b"\n\n",
                "blank JSONL row",
            ),
            "duplicate position": (
                b"".join(
                    json.dumps(row, separators=(",", ":")).encode() + b"\n"
                    for row in (base[0], base[0])
                ),
                "duplicate legacy retention position",
            ),
            "extra field": (
                json.dumps(
                    {**base[0], "schema": "not-part-of-the-legacy-format"},
                    separators=(",", ":"),
                ).encode()
                + b"\n",
                "fields are not exact",
            ),
            "nonfinite": (
                json.dumps(base[0], separators=(",", ":"))
                .replace('"cp":30000', '"cp":1e999')
                .encode()
                + b"\n",
                "non-finite",
            ),
            "bool integer": (
                json.dumps(
                    {**base[0], "depth": True},
                    separators=(",", ":"),
                ).encode()
                + b"\n",
                "depth must be an integer",
            ),
            "bool cp": (
                json.dumps(
                    {**base[0], "cp": True},
                    separators=(",", ":"),
                ).encode()
                + b"\n",
                "cp must be an integer",
            ),
            "bool ply": (
                json.dumps(
                    {**base[0], "ply": False},
                    separators=(",", ":"),
                ).encode()
                + b"\n",
                "ply must be an integer",
            ),
            "bool mate": (
                json.dumps(
                    {**base[0], "mate": False},
                    separators=(",", ":"),
                ).encode()
                + b"\n",
                "mate must be an integer",
            ),
            "float integer": (
                json.dumps(
                    {**base[0], "cp": 30_000.0},
                    separators=(",", ":"),
                ).encode()
                + b"\n",
                "cp must be an integer",
            ),
            "missing field": (
                json.dumps(
                    {key: value for key, value in base[0].items() if key != "bestmove"},
                    separators=(",", ":"),
                ).encode()
                + b"\n",
                "fields are not exact",
            ),
            "malformed JSON": (
                b'{"sfen":\n',
                "invalid strict JSON",
            ),
            "invalid UTF-8": (
                b"\xff\n",
                "invalid UTF-8",
            ),
            "invalid sfen": (
                json.dumps(
                    {**base[0], "sfen": "9/9 b - 1"},
                    separators=(",", ":"),
                ).encode()
                + b"\n",
                "board must contain exactly 9 ranks",
            ),
            "inconsistent mate": (
                json.dumps(
                    {**base[0], "cp": 29_999},
                    separators=(",", ":"),
                ).encode()
                + b"\n",
                "mate and cp are inconsistent",
            ),
            "missing final LF": (
                json.dumps(base[0], separators=(",", ":")).encode(),
                "exactly one LF-terminated",
            ),
            "CRLF": (
                json.dumps(base[0], separators=(",", ":")).encode() + b"\r\n",
                "exactly one LF-terminated",
            ),
        }
        duplicate_key = (
            json.dumps(base[0], separators=(",", ":"))
            .replace('"cp":30000', '"cp":30000,"cp":30000')
            .encode()
            + b"\n"
        )
        malformed_cases["duplicate JSON key"] = (
            duplicate_key,
            "duplicate JSON object key",
        )

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "retention.jsonl"
            for name, (raw, expected) in malformed_cases.items():
                with self.subTest(name=name):
                    path.write_bytes(raw)
                    with self.assertRaisesRegex(ValueError, expected):
                        ADAPTER._load_legacy_retention_dataset(
                            trainer=TRAINER,
                            path=str(path),
                            identity=file_identity(path),
                            label="test retention",
                            torch_module=torch,
                        )

    def test_legacy_loader_binds_the_exact_file_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "retention.jsonl"
            write_jsonl(path, generator_rows())
            enrolled = file_identity(path)
            path.write_bytes(path.read_bytes() + b"\n")

            with self.assertRaisesRegex(ValueError, "identity mismatch"):
                ADAPTER._load_legacy_retention_dataset(
                    trainer=TRAINER,
                    path=str(path),
                    identity=enrolled,
                    label="test retention",
                    torch_module=torch,
                )


if __name__ == "__main__":
    unittest.main()
