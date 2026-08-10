import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

from build_kingpair_legacy_2m_shards import (  # noqa: E402
    LegacyShardError,
    PRIORITY_DOMAIN,
    SEMANTIC_DOMAIN,
    SourcePin,
    build_legacy_shards,
)


def sparse_sfen(pawns, move_number=1):
    hand = "P" if pawns == 1 else f"{pawns}P"
    return f"4k4/9/9/9/9/9/9/9/4K4 b {hand} {move_number}"


def source_row(sfen, cp):
    return {
        "sfen": sfen,
        "cp": cp,
        "ply": 12,
        "bestmove": "5i5h",
        "depth": 12,
    }


def semantic(canonical_sfen):
    return hashlib.sha256(SEMANTIC_DOMAIN + canonical_sfen.encode()).digest()


def priority(identifier):
    return hashlib.sha256(PRIORITY_DOMAIN + identifier).digest()


def fixture_pin(raw, rows, valid, invalid):
    return SourcePin(hashlib.sha256(raw).hexdigest(), len(raw), rows, valid, invalid)


class KingPairLegacyShardBuilderTests(unittest.TestCase):
    def make_fixture(self, directory):
        records = [source_row(sparse_sfen(value), value * 10) for value in range(1, 13)]
        records.append(source_row(sparse_sfen(2, 99), 20))  # exact semantic duplicate
        records.extend(
            [
                source_row(sparse_sfen(13), 130),
                source_row(sparse_sfen(13, 2), 131),  # conflicting duplicate
                source_row(sparse_sfen(19), 190),  # impossible inventory
            ]
        )
        raw = b"".join(
            (json.dumps(row, separators=(",", ":")) + "\n").encode()
            for row in records
        )
        path = Path(directory) / "runOp1-fixture.jsonl"
        path.write_bytes(raw)
        return path, raw, records

    def test_bottom_hash_selection_is_exact_deterministic_and_not_a_prefix(self):
        with tempfile.TemporaryDirectory() as directory:
            source, raw, records = self.make_fixture(directory)
            pin = fixture_pin(raw, len(records), len(records) - 1, 1)
            first = Path(directory) / "first"
            second = Path(directory) / "second"
            manifest = build_legacy_shards(
                source, first, pin=pin, target_rows=5, shard_rows=2
            )
            build_legacy_shards(source, second, pin=pin, target_rows=5, shard_rows=2)

            output_rows = []
            for shard in manifest["shards"]:
                output_rows.extend(
                    json.loads(line)
                    for line in (first / shard["name"]).read_text().splitlines()
                )
            candidates = []
            for value in range(1, 13):
                canonical = " ".join(sparse_sfen(value).split()[:3])
                identifier = semantic(canonical)
                candidates.append((priority(identifier), identifier, canonical))
            expected = {identifier.hex() for _rank, identifier, _sfen in sorted(candidates)[:5]}
            actual = {
                row["semantic_position_id"].removeprefix("sha256:")
                for row in output_rows
            }
            self.assertEqual(actual, expected)
            first_five = {identifier.hex() for _rank, identifier, _sfen in candidates[:5]}
            self.assertNotEqual(actual, first_five)
            self.assertEqual(len(output_rows), 5)
            self.assertEqual(manifest["format"]["shard_count"], 3)
            self.assertEqual(manifest["selection"]["duplicate_rows_removed"], 2)
            self.assertEqual(
                manifest["selection"]["conflicting_semantic_positions_removed"], 1
            )
            self.assertEqual(manifest["source"]["quarantined_invalid_sfen_rows"], 1)

            first_bytes = {
                path.name: path.read_bytes() for path in sorted(first.iterdir())
            }
            second_bytes = {
                path.name: path.read_bytes() for path in sorted(second.iterdir())
            }
            self.assertEqual(first_bytes, second_bytes)

    def test_manifest_binds_every_create_only_shard(self):
        with tempfile.TemporaryDirectory() as directory:
            source, raw, records = self.make_fixture(directory)
            pin = fixture_pin(raw, len(records), len(records) - 1, 1)
            output = Path(directory) / "output"
            manifest = build_legacy_shards(
                source, output, pin=pin, target_rows=7, shard_rows=3
            )
            stored = json.loads((output / "manifest.json").read_text())
            self.assertEqual(stored, manifest)
            for receipt in manifest["shards"]:
                shard = (output / receipt["name"]).read_bytes()
                self.assertEqual(len(shard), receipt["bytes"])
                self.assertEqual(hashlib.sha256(shard).hexdigest(), receipt["sha256"])
                self.assertEqual(len(shard.splitlines()), receipt["rows"])
            with self.assertRaisesRegex(LegacyShardError, "create-only"):
                build_legacy_shards(
                    source, output, pin=pin, target_rows=7, shard_rows=3
                )

    def test_source_identity_mismatch_fails_before_publication(self):
        with tempfile.TemporaryDirectory() as directory:
            source, raw, records = self.make_fixture(directory)
            pin = fixture_pin(raw, len(records), len(records) - 1, 1)
            wrong = SourcePin("0" * 64, pin.bytes, pin.rows, pin.valid_rows, pin.invalid_sfen_rows)
            output = Path(directory) / "output"
            with self.assertRaisesRegex(LegacyShardError, "pinned runOp1 identity"):
                build_legacy_shards(
                    source, output, pin=wrong, target_rows=5, shard_rows=2
                )
            self.assertFalse(output.exists())

    def test_label_corruption_is_not_quarantined_as_malformed_sfen(self):
        with tempfile.TemporaryDirectory() as directory:
            row = source_row(sparse_sfen(1), 10)
            row["cp"] = 1.5
            raw = (json.dumps(row) + "\n").encode()
            source = Path(directory) / "bad-label.jsonl"
            source.write_bytes(raw)
            pin = fixture_pin(raw, 1, 1, 0)
            with self.assertRaisesRegex(LegacyShardError, "cp must be an integer"):
                build_legacy_shards(
                    source,
                    Path(directory) / "output",
                    pin=pin,
                    target_rows=1,
                    shard_rows=1,
                )

    def test_exact_target_shortage_fails_without_output_root(self):
        with tempfile.TemporaryDirectory() as directory:
            source, raw, records = self.make_fixture(directory)
            pin = fixture_pin(raw, len(records), len(records) - 1, 1)
            output = Path(directory) / "output"
            with self.assertRaisesRegex(LegacyShardError, "need 20"):
                build_legacy_shards(
                    source, output, pin=pin, target_rows=20, shard_rows=2
                )
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
