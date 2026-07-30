from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest


MODULE_PATH = (
    Path(__file__).resolve().parents[1] / "build_halfkp81_depth18_overlap_inventory.py"
)
SPEC = importlib.util.spec_from_file_location("depth18_overlap_inventory", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
inventory = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = inventory
SPEC.loader.exec_module(inventory)


HIRATE = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
AFTER_76FU = "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 2"


def canonical(value: object) -> bytes:
    return (
        json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode()
        + b"\n"
    )


def semantic_id(sfen: str) -> str:
    return (
        "sha256:"
        + hashlib.sha256(
            ("sfen-v1\0" + " ".join(sfen.split()[:3])).encode()
        ).hexdigest()
    )


def direct_row(role: str, index: int = 0) -> dict[str, object]:
    return {
        "child_position_id": semantic_id(AFTER_76FU),
        "child_sfen": AFTER_76FU,
        "game_id": f"sha256:{index + 10:064x}",
        "parent_id": f"sha256:{index + 20:064x}",
        "position_id": semantic_id(HIRATE),
        "role": role,
        "schema": inventory.DIRECT_ROW_SCHEMA,
        "source_row_sha256": f"{index + 30:064x}",
        "teacher_child_cp": 12,
        "teacher_score_kind": "cp",
    }


def identity(raw: bytes, *, rows: int | None = None, role: str | None = None):
    result: dict[str, object] = {
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }
    if rows is not None:
        result["rows"] = rows
    if role is not None:
        result["role"] = role
    return result


def opening_document(label: str, seed_start: int) -> dict[str, object]:
    entries = [
        {
            "derived_seed": 0x5EED00 + (seed_start + index) * 15_485_863,
            "opening_fingerprint": f"{index + (100 if label == 'v2' else 200):064x}",
            "pair_index": index,
            "seed": seed_start + index,
        }
        for index in range(28)
    ]
    selection: dict[str, object] = {
        "derived_seed_rule": (
            "0x5eed00 + pair_seed * 15485863 " "+ pair_index_within_harness * 104729"
        ),
        "fingerprint_domain": "shogi-nnue-fixed-time-opening-v1\0",
        "games_per_pair": 2,
        "opening_set_sha256": f"{1 if label == 'v2' else 2:064x}",
        "pair_index_within_harness": 0,
        "pair_seed_scan_start": seed_start,
        "pairs": 28,
        "pairs_selected": entries,
        "prior_inventory_overlap": 0,
        "rule": "frozen test rule",
        "skipped": [],
        "within_selection_duplicates": 0,
    }
    if label == "v4":
        selection["colors"] = ["candidate-sente", "candidate-gote"]
        return {
            "authority": {},
            "bindings": {},
            "prior_opening_inventory": {
                "canonical_list_sha256": f"{3:064x}",
                "full_sorted_unique_fingerprints": [f"{9:064x}"],
                "union_fingerprints": 1,
            },
            "schema": "test-v4",
            "selection": selection,
            "status": "frozen-v4",
        }
    return {
        "authority": {},
        "prior_opening_inventory": {
            "canonical_list_sha256": f"{4:064x}",
            "fingerprints": 7,
        },
        "protocol": {},
        "schema": "test-v2",
        "selection": selection,
        "status": "frozen-v2",
    }


class OverlapInventoryTests(unittest.TestCase):
    def test_direct_scan_authenticates_canonical_parent_and_child_ids(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "rows.jsonl"
            raw = canonical(direct_row("training"))
            path.write_bytes(raw)
            ids, report = inventory._scan_direct_jsonl(
                path,
                identity(raw, rows=1, role="training"),
                "training",
            )
            self.assertEqual(ids, {semantic_id(HIRATE), semantic_id(AFTER_76FU)})
            self.assertEqual(report["rows"], 1)
            self.assertTrue(report["child_position_id_matches_sfen"])
            self.assertTrue(report["stable_second_digest"])

    def test_direct_scan_rejects_semantic_and_schema_drift(self):
        with tempfile.TemporaryDirectory() as temporary:
            for name, mutate in (
                (
                    "child-id",
                    lambda row: row.__setitem__(
                        "child_position_id", f"sha256:{99:064x}"
                    ),
                ),
                ("extra-field", lambda row: row.__setitem__("extra", True)),
            ):
                with self.subTest(name=name):
                    row = direct_row("validation")
                    mutate(row)
                    raw = canonical(row)
                    path = Path(temporary) / f"{name}.jsonl"
                    path.write_bytes(raw)
                    with self.assertRaises(inventory.OverlapInventoryError):
                        inventory._scan_direct_jsonl(
                            path,
                            identity(raw, rows=1, role="validation"),
                            "validation",
                        )

    def test_direct_scan_rejects_identity_drift_and_symlink(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            path = root / "rows.jsonl"
            raw = canonical(direct_row("training"))
            path.write_bytes(raw)
            wrong = identity(raw, rows=1, role="training")
            wrong["sha256"] = "0" * 64
            with self.assertRaisesRegex(
                inventory.OverlapInventoryError, "SHA-256 drift"
            ):
                inventory._scan_direct_jsonl(path, wrong, "training")
            link = root / "link.jsonl"
            link.symlink_to(path)
            with self.assertRaisesRegex(inventory.OverlapInventoryError, "symlink"):
                inventory._scan_direct_jsonl(
                    link,
                    identity(raw, rows=1, role="training"),
                    "training",
                )

    def test_opening_registry_validates_all_selected_seeds_and_limitations(self):
        v2 = opening_document("v2", 1_200_001)
        expected = {
            "schema": "test-v2",
            "status": "frozen-v2",
            "seed_start": 1_200_001,
            "opening_set_sha256": f"{1:064x}",
        }
        entries, limitation = inventory._opening_pair_entries(v2, expected, "v2")
        self.assertEqual(len(entries), 28)
        self.assertEqual(limitation["fingerprint_only_prior_inventory_count"], 7)

        drifted = copy.deepcopy(v2)
        drifted["selection"]["pairs_selected"][3]["seed"] += 1
        with self.assertRaisesRegex(
            inventory.OverlapInventoryError, "seed derivation drift"
        ):
            inventory._opening_pair_entries(drifted, expected, "v2")

    def test_reconstruction_output_requires_all_seven_prefix_positions(self):
        entries = [
            {
                "source": "v2",
                "pair_index": index,
                "seed": 1_200_001 + index,
                "opening_fingerprint": f"{index + 100:064x}",
            }
            for index in range(28)
        ]
        entries.extend(
            {
                "source": "v4",
                "pair_index": index,
                "seed": 1_300_001 + index,
                "opening_fingerprint": f"{index + 200:064x}",
            }
            for index in range(28)
        )

        def fake_deriver(_repo_root, requests):
            derived = [
                {
                    **dict(request),
                    "prefix_position_ids": [
                        semantic_id(HIRATE),
                        semantic_id(AFTER_76FU),
                        *[f"sha256:{index * 10 + value:064x}" for value in range(5)],
                    ],
                }
                for index, request in enumerate(requests)
            ]
            return derived, {
                "selected_openings": 56,
                "prefix_positions_per_opening": 7,
                "all_selected_fingerprints_derived": True,
                "non_derivable_selected_fingerprints": [],
            }

        derived, report = fake_deriver(Path("."), entries)
        self.assertEqual(len(derived), 56)
        self.assertEqual(report["non_derivable_selected_fingerprints"], [])

    def test_complete_build_is_sorted_create_only_and_manifest_last(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            train_raw = canonical(direct_row("training", 1))
            validation_raw = canonical(direct_row("validation", 2))
            train = root / "training.jsonl"
            validation = root / "validation.jsonl"
            train.write_bytes(train_raw)
            validation.write_bytes(validation_raw)

            opening_expectations: dict[str, dict[str, object]] = {}
            for label, seed_start in (("v2", 1_200_001), ("v4", 1_300_001)):
                document = opening_document(label, seed_start)
                raw = canonical(document)
                relative = f"{label}.json"
                (root / relative).write_bytes(raw)
                opening_expectations[label] = {
                    "relative_path": relative,
                    **identity(raw),
                    "schema": document["schema"],
                    "status": document["status"],
                    "seed_start": seed_start,
                    "opening_set_sha256": document["selection"]["opening_set_sha256"],
                }

            def fake_deriver(_repo_root, requests):
                rows = []
                for index, request in enumerate(requests):
                    rows.append(
                        {
                            **dict(request),
                            "prefix_position_ids": [
                                semantic_id(HIRATE),
                                semantic_id(AFTER_76FU),
                                *[
                                    f"sha256:{10_000 + index * 5 + offset:064x}"
                                    for offset in range(5)
                                ],
                            ],
                        }
                    )
                return rows, {
                    "selected_openings": len(rows),
                    "prefix_positions_per_opening": 7,
                    "prefix_position_observations": len(rows) * 7,
                    "unique_semantic_ids": 282,
                    "unique_semantic_ids_by_source": {"v2": 142, "v4": 142},
                    "all_selected_fingerprints_derived": True,
                    "non_derivable_selected_fingerprints": [],
                    "coverage": "test",
                }

            output = root / "overlap.jsonl"
            manifest = root / "manifest.json"
            result = inventory.build_overlap_inventory(
                repo_root=root,
                direct_train=train,
                direct_validation=validation,
                output=output,
                manifest=manifest,
                direct_expectations={
                    "training": identity(train_raw, rows=1, role="training"),
                    "validation": identity(validation_raw, rows=1, role="validation"),
                },
                opening_expectations=opening_expectations,
                deriver=fake_deriver,
                bind_derivation_sources=False,
            )
            lines = output.read_text().splitlines()
            ids = [json.loads(line)["position_id"] for line in lines]
            self.assertEqual(ids, sorted(set(ids)))
            self.assertEqual(result["output"]["rows"], len(ids))
            self.assertEqual(
                json.loads(manifest.read_bytes()),
                result,
            )
            with self.assertRaisesRegex(inventory.OverlapInventoryError, "create-only"):
                inventory.build_overlap_inventory(
                    repo_root=root,
                    direct_train=train,
                    direct_validation=validation,
                    output=output,
                    manifest=manifest,
                    direct_expectations={
                        "training": identity(train_raw, rows=1, role="training"),
                        "validation": identity(
                            validation_raw, rows=1, role="validation"
                        ),
                    },
                    opening_expectations=opening_expectations,
                    deriver=fake_deriver,
                    bind_derivation_sources=False,
                )


if __name__ == "__main__":
    unittest.main()
