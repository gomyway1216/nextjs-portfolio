from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import build_direct_teacher_halfkp81_v2_dataset as BUILDER  # noqa: E402
import direct_teacher_halfkp81_v2_protocol as PROTOCOL  # noqa: E402


TRACKED_PROTOCOL = ML_DIR / "protocols" / "direct-teacher-halfkp81-v2-plan.json"


def _pid(number: int) -> str:
    return f"sha256:{number:064x}"


def _row(
    *,
    game_number: int,
    parent_number: int,
    child_number: int,
    rank: int,
    cp: int,
    played: bool = False,
) -> BUILDER.DirectRow:
    return BUILDER.DirectRow(
        game_id=_pid(game_number),
        parent_id=_pid(parent_number),
        position_id=_pid(parent_number + 100_000),
        parent_sfen="9/9/9/9/9/9/9/9/9 b - 1",
        child_position_id=_pid(child_number),
        child_sfen="9/9/9/9/9/9/9/9/9 w - 2",
        move=f"5e5{rank}",
        teacher_child_cp=cp,
        teacher_rank=rank,
        sources=("teacher", "played") if played else ("teacher",),
        source_row_sha256=f"{child_number:064x}",
    )


def _group(game_number: int, parent_number: int, child_number: int):
    first = _row(
        game_number=game_number,
        parent_number=parent_number,
        child_number=child_number,
        rank=1,
        cp=-100,
        played=True,
    )
    second = _row(
        game_number=game_number,
        parent_number=parent_number,
        child_number=child_number + 1,
        rank=2,
        cp=100,
    )
    return BUILDER.ParentGroup(
        game_id=first.game_id,
        parent_id=first.parent_id,
        position_id=first.position_id,
        parent_sfen=first.parent_sfen,
        rows=(first, second),
    )


def _role_groups() -> list[BUILDER.ParentGroup]:
    groups: list[BUILDER.ParentGroup] = []
    training = validation = 0
    number = 1
    while training < 4 or validation < 2:
        game_id = _pid(number)
        role = BUILDER._role_for_game(game_id)
        if (role == "training" and training < 4) or (
            role == "validation" and validation < 2
        ):
            groups.append(_group(number, 10_000 + number, 20_000 + 2 * number))
            training += role == "training"
            validation += role == "validation"
        number += 1
    return groups


def _source_records() -> list[dict]:
    records = []
    for game_number in (1, 2):
        for rank, child_cp, sources in (
            (1, -100, ["played"]),
            (2, 100, ["teacher"]),
        ):
            parent_number = 100 + game_number
            child_number = 200 + game_number * 2 + rank
            records.append(
                {
                    "schema": "shogi-sibling-v1",
                    "schema_version": 1,
                    "split": "train",
                    "game_id": _pid(game_number),
                    "parent_id": _pid(parent_number),
                    "position_id": _pid(parent_number + 1_000),
                    "parent_sfen": "9/9/9/9/9/9/9/9/9 b - 1",
                    "parent_ply": 1,
                    "ply": 2,
                    "move": f"5e5{rank}",
                    "child_position_id": _pid(child_number),
                    "child_sfen": "9/9/9/9/9/9/9/9/9 w - 2",
                    "sfen": "9/9/9/9/9/9/9/9/9 w - 2",
                    "cp": child_cp,
                    "teacher_child_cp": child_cp,
                    "teacher_parent_cp": -child_cp,
                    "teacher_rank": rank,
                    "teacher_score_kind": "cp",
                    "sources": sources,
                }
            )
    return records


def _write_source(
    directory: str, records: list[dict]
) -> tuple[Path, dict]:
    path = Path(directory) / "source.jsonl"
    raw = b"".join(
        PROTOCOL.canonical_json_bytes(record) for record in records
    )
    path.write_bytes(raw)
    return path, {
        "path": str(path),
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "rows": len(records),
        "parents": len({record["parent_id"] for record in records}),
        "games": len({record["game_id"] for record in records}),
    }


def _empty_exclusions() -> BUILDER.ExclusionInputs:
    return BUILDER.ExclusionInputs(
        spent_tune_parent_ids=frozenset(),
        spent_tune_semantic_ids=frozenset(),
        known_eval_ids=frozenset(),
        fresh_selection_ids=frozenset(),
        fresh_final_ids=frozenset(),
        prior_protected_union=frozenset(),
        phase1_browser_kept_semantic_ids=frozenset(),
        phase1_receipt={
            "path": "/phase1.json",
            "bytes": 1,
            "sha256": "1" * 64,
            "schema": "phase1",
            "status": "complete",
        },
        spent_tune_receipt={
            "path": "/tune.json",
            "bytes": 1,
            "sha256": "2" * 64,
            "schema": "tune",
            "parents": 1,
            "rows": 2,
        },
    )


class DirectTeacherHalfkp81V2DatasetBuilderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.protocol, cls.protocol_identity = PROTOCOL.load_strict_json_file(
            str(TRACKED_PROTOCOL), "tracked v2 protocol"
        )

    def _build_documents(
        self, groups: list[BUILDER.ParentGroup]
    ) -> tuple[dict[str, bytes], dict, dict]:
        protocol = copy.deepcopy(self.protocol)
        protocol["inputs"]["direct_teacher_source"]["fit_parents"] = len(groups)
        return BUILDER.build_dataset_documents(
            protocol=protocol,
            protocol_identity=self.protocol_identity,
            fit_groups=groups,
            exclusions=_empty_exclusions(),
            generator_identity={
                "path": "/generator.py",
                "bytes": 1,
                "sha256": "3" * 64,
            },
        )

    def test_materializes_game_isolated_direct_cp_rows_and_id_receipts(self) -> None:
        groups = _role_groups()
        payloads, manifest, receipt = self._build_documents(groups)
        self.assertEqual(
            set(payloads), {"training.jsonl", "validation.jsonl", "manifest.json"}
        )
        self.assertGreater(manifest["accounting"]["training_rows"], 0)
        self.assertGreater(manifest["accounting"]["validation_rows"], 0)
        self.assertEqual(manifest["split"]["game_overlap"], 0)
        self.assertEqual(manifest["split"]["semantic_overlap"], 0)
        self.assertFalse(manifest["training_started"])
        self.assertFalse(manifest["live_weight_write_authorized"])
        self.assertFalse(receipt["state"]["optimizer_created"])
        self.assertFalse(receipt["state"]["live_weights_changed"])
        self.assertEqual(
            receipt["deduplication"]["input_rows"],
            receipt["deduplication"]["output_rows"],
        )
        self.assertEqual(
            receipt["deduplication"]["exact_duplicate_child_rows_removed"], 0
        )
        for role in ("training", "validation"):
            rows = [
                json.loads(line)
                for line in payloads[f"{role}.jsonl"].splitlines()
            ]
            self.assertTrue(rows)
            self.assertEqual({row["role"] for row in rows}, {role})
            self.assertEqual(
                {row["teacher_score_kind"] for row in rows}, {"cp"}
            )
            self.assertEqual(
                len({row["child_position_id"] for row in rows}), len(rows)
            )
            for field in PROTOCOL.ID_SET_SHA256_FIELDS:
                self.assertRegex(
                    manifest["output"][role][field], r"^[0-9a-f]{64}$"
                )

    def test_source_loader_accepts_only_direct_child_cp_contract(self) -> None:
        records = _source_records()
        with tempfile.TemporaryDirectory() as temporary:
            _path, binding = _write_source(temporary, records)
            groups = BUILDER._load_direct_source(binding, repo_root=temporary)
            self.assertEqual(len(groups), 2)
            self.assertEqual(sum(len(group.rows) for group in groups), 4)
            records[0]["teacher_score_kind"] = "wdl"
            _path, binding = _write_source(temporary, records)
            with self.assertRaisesRegex(
                PROTOCOL.DirectTeacherHalfkpV2Error, "non-CP"
            ):
                BUILDER._load_direct_source(binding, repo_root=temporary)

    def test_source_loader_strictly_validates_canonical_mate_rows(self) -> None:
        base = _source_records()
        mate_cp = BUILDER.MATE_CP_SENTINEL - 4
        base[1].update(
            teacher_mate=-4,
            teacher_mate_sign=-1,
            teacher_score_kind="mate",
            teacher_child_cp=mate_cp,
            teacher_parent_cp=-mate_cp,
            cp=mate_cp,
        )
        positive_mate_cp = -(BUILDER.MATE_CP_SENTINEL - 19)
        base[2].update(
            teacher_child_cp=-999_982,
            teacher_parent_cp=999_982,
            cp=-999_982,
        )
        base[3].update(
            teacher_mate=19,
            teacher_mate_sign=1,
            teacher_score_kind="mate",
            teacher_child_cp=positive_mate_cp,
            teacher_parent_cp=-positive_mate_cp,
            cp=positive_mate_cp,
        )
        with tempfile.TemporaryDirectory() as temporary:
            _path, binding = _write_source(temporary, base)
            groups = BUILDER._load_direct_source(binding, repo_root=temporary)
            self.assertEqual(groups[0].rows[1].teacher_child_cp, mate_cp)
            self.assertEqual(
                groups[1].rows[1].teacher_child_cp, positive_mate_cp
            )

            mutations = {
                "missing-sign": lambda row: row.pop("teacher_mate_sign"),
                "extra-field": lambda row: row.__setitem__("unexpected", 1),
                "wrong-sign": lambda row: row.__setitem__("teacher_mate_sign", 1),
                "wrong-kind": lambda row: row.__setitem__(
                    "teacher_score_kind", "cp"
                ),
                "wrong-mapped-cp": lambda row: (
                    row.__setitem__("teacher_child_cp", mate_cp - 1),
                    row.__setitem__("teacher_parent_cp", -(mate_cp - 1)),
                    row.__setitem__("cp", mate_cp - 1),
                ),
            }
            for name, mutate in mutations.items():
                with self.subTest(name=name):
                    changed = copy.deepcopy(base)
                    mutate(changed[1])
                    _path, changed_binding = _write_source(
                        temporary, changed
                    )
                    with self.assertRaises(
                        PROTOCOL.DirectTeacherHalfkpV2Error
                    ):
                        BUILDER._load_direct_source(
                            changed_binding, repo_root=temporary
                        )

    def test_conflicting_duplicate_child_labels_stop_before_publication(self) -> None:
        groups = _role_groups()
        original = groups[0]
        conflicting = BUILDER.DirectRow(
            **{
                **original.rows[0].__dict__,
                "teacher_child_cp": original.rows[0].teacher_child_cp + 1,
                "source_row_sha256": "f" * 64,
            }
        )
        replacement = BUILDER.ParentGroup(
            game_id=groups[1].game_id,
            parent_id=groups[1].parent_id,
            position_id=groups[1].position_id,
            parent_sfen=groups[1].parent_sfen,
            rows=(conflicting, groups[1].rows[1]),
        )
        groups[1] = replacement
        with self.assertRaisesRegex(
            PROTOCOL.DirectTeacherHalfkpV2Error, "conflicting duplicate"
        ):
            self._build_documents(groups)

    def test_create_only_receipt_is_last_completion_marker(self) -> None:
        payloads, _manifest, receipt = self._build_documents(_role_groups())
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "dataset"
            publication = BUILDER.publish_dataset_create_only(
                payloads, receipt, str(output)
            )
            self.assertEqual(
                list(path.name for path in sorted(output.iterdir())),
                [
                    "manifest.json",
                    "receipt.json",
                    "training.jsonl",
                    "validation.jsonl",
                ],
            )
            receipt_raw = output.joinpath("receipt.json").read_bytes()
            self.assertEqual(
                publication["receipt"]["sha256"],
                hashlib.sha256(receipt_raw).hexdigest(),
            )
            with self.assertRaisesRegex(
                PROTOCOL.DirectTeacherHalfkpV2Error, "overwrite"
            ):
                BUILDER.publish_dataset_create_only(
                    payloads, receipt, str(output)
                )

    def test_component_split_is_order_independent_and_semantic_isolated(self) -> None:
        groups = _role_groups() * 4
        unique = [
            _group(
                50_000 + index,
                60_000 + index,
                70_000 + 2 * index,
            )
            for index in range(len(groups))
        ]
        fit_a, tune_a, receipt_a = BUILDER._component_split(
            unique, seed=42, tune_modulus=5
        )
        fit_b, tune_b, receipt_b = BUILDER._component_split(
            list(reversed(unique)), seed=42, tune_modulus=5
        )
        self.assertEqual(
            {group.parent_id for group in fit_a},
            {group.parent_id for group in fit_b},
        )
        self.assertEqual(
            {group.parent_id for group in tune_a},
            {group.parent_id for group in tune_b},
        )
        self.assertEqual(
            receipt_a["component_assignments_sha256"],
            receipt_b["component_assignments_sha256"],
        )


if __name__ == "__main__":
    unittest.main()
