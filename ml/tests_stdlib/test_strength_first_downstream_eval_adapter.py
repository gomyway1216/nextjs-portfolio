from __future__ import annotations

import hashlib
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import strength_first_downstream_eval_adapter as ADAPTER  # noqa: E402


def file_identity(path: Path, schema: str) -> dict:
    raw = path.read_bytes()
    return {
        "path": path.name,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "schema": schema,
    }


class FakeEvaluator:
    def __init__(self, identities: dict[str, dict]):
        self.identities = identities

    def load_model(self, path: str):
        name = Path(path).name
        identity = self.identities[name]
        epoch = 20 if name == "candidate.pt" else 27
        return (
            object(),
            {"epoch": epoch},
            600.0,
            {
                "bytes": identity["bytes"],
                "sha256": identity["sha256"],
            },
        )


class StrengthFirstDownstreamExportTests(unittest.TestCase):
    def test_historical_retention_pair_contract_remains_exact(self):
        self.assertEqual(ADAPTER.RETENTION_PAIR_COUNT, 400_000)
        self.assertEqual(ADAPTER.RETENTION_PAIR_SEED, 43)
        self.assertEqual(ADAPTER.DECISIVE_PAIR_MIN_CP, 100.0)
        self.assertEqual(ADAPTER.DECISIVE_CP, 1_500.0)

    def test_public_adapter_surface_excludes_the_retired_python_static_probe(self):
        self.assertEqual(
            ADAPTER.__all__,
            [
                "evaluate_int16_datasets",
                "verify_checkpoint_weight_exports",
            ],
        )
        self.assertFalse(hasattr(ADAPTER, "evaluate_known_regression_static"))

    def prepared(self, directory: str):
        root = Path(directory)
        candidate_checkpoint = root / "candidate.pt"
        stable_checkpoint = root / "stable.pt"
        candidate_weights = root / "candidate.bin"
        stable_weights = root / "stable.bin"
        candidate_checkpoint.write_bytes(b"candidate checkpoint")
        stable_checkpoint.write_bytes(b"stable checkpoint")
        candidate_weights.write_bytes(b"c" * ADAPTER.NNUE_WEIGHTS_BYTES)
        stable_weights.write_bytes(b"s" * ADAPTER.NNUE_WEIGHTS_BYTES)
        identities = {
            path.name: file_identity(path, f"test-{path.suffix}-v1")
            for path in (
                candidate_checkpoint,
                stable_checkpoint,
                candidate_weights,
                stable_weights,
            )
        }
        arguments = {
            "candidate_checkpoint_path": str(candidate_checkpoint),
            "candidate_checkpoint": identities[candidate_checkpoint.name],
            "candidate_weights_path": str(candidate_weights),
            "candidate_weights": identities[candidate_weights.name],
            "stable_checkpoint_path": str(stable_checkpoint),
            "stable_checkpoint": identities[stable_checkpoint.name],
            "stable_weights_path": str(stable_weights),
            "stable_weights": identities[stable_weights.name],
            "evaluator": FakeEvaluator(identities),
            "exporter": object(),
        }
        return arguments, candidate_weights, stable_weights

    def test_reproduces_candidate_and_stable_weights_byte_exactly(self):
        with tempfile.TemporaryDirectory() as directory:
            arguments, candidate_weights, stable_weights = self.prepared(directory)
            with mock.patch.object(
                ADAPTER,
                "_serialized_quantized_weights",
                side_effect=[
                    candidate_weights.read_bytes(),
                    stable_weights.read_bytes(),
                ],
            ):
                result = ADAPTER.verify_checkpoint_weight_exports(**arguments)

        self.assertEqual(
            result["status"],
            "candidate-and-stable-int16-exports-byte-exact",
        )
        self.assertEqual(
            result["exporter"]["sha256"],
            ADAPTER.EXPORT_WEIGHTS_SOURCE_SHA256,
        )
        self.assertEqual(
            set(result["models"]),
            {"candidate", "stable"},
        )

    def test_rejects_a_weight_file_changed_during_reproduction(self):
        with tempfile.TemporaryDirectory() as directory:
            arguments, candidate_weights, _stable_weights = self.prepared(directory)
            original = candidate_weights.read_bytes()

            def mutate_after_snapshot(_exporter, _model, _k_sigmoid):
                candidate_weights.write_bytes(b"x" + original[1:])
                return original

            with mock.patch.object(
                ADAPTER,
                "_serialized_quantized_weights",
                side_effect=mutate_after_snapshot,
            ):
                with self.assertRaisesRegex(
                    ValueError,
                    "weights after export identity mismatch",
                ):
                    ADAPTER.verify_checkpoint_weight_exports(**arguments)


if __name__ == "__main__":
    unittest.main()
