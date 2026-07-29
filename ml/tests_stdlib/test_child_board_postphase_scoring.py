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

import child_board_postphase_scoring as SCORING  # noqa: E402
import child_board_strength_candidate_postphase_registry as REGISTRY  # noqa: E402


def _canonical(value: object) -> bytes:
    return (
        json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8")
        + b"\n"
    )


def _identity(path: Path, raw: bytes) -> dict:
    return {
        "path": str(path),
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


def _artifact_receipt(lane: str, contract: dict) -> dict:
    names = [contract["reference_name"], *contract["artifact_names"]]
    return {
        "schema": contract["artifact_receipt_schema"],
        "artifacts": {
            name: {
                "path": f"/frozen/{name}.bin",
                "bytes": index + 10,
                "sha256": hashlib.sha256(name.encode()).hexdigest(),
                "role": name,
            }
            for index, name in enumerate(names)
        },
        "tune_opened": lane == "sealed",
        "sealed_labels_generated": lane == "sealed",
        "sealed_scores_opened": False,
        "live_weights_changed": False,
    }


def _score_row(
    *,
    schema: str,
    domain: str,
    parent: str,
    move: str,
    teacher_cp: int,
    score_keys: list[str],
    artifacts_correct: bool = True,
) -> dict:
    teacher_best = teacher_cp > 0
    live_score = 0 if teacher_best else 100
    artifact_score = (
        (100 if teacher_best else 0)
        if artifacts_correct
        else live_score
    )
    scores = {}
    for name in score_keys:
        scores[name] = live_score if name == "exact_live" else artifact_score
    return {
        "schema": schema,
        "domain": domain,
        "parent_id": parent,
        "move": move,
        "teacher_cp": teacher_cp,
        "scores": scores,
    }


def _bundle(
    contract: dict,
    domains: list[dict],
    *,
    artifacts_correct: bool = True,
) -> bytes:
    rows = []
    for domain in domains:
        for parent_index in range(domain["parents"]):
            parent = f"parent-{parent_index:04d}"
            rows.extend(
                [
                    _score_row(
                        schema=contract["score_row_schema"],
                        domain=domain["name"],
                        parent=parent,
                        move="2g2f",
                        teacher_cp=100,
                        score_keys=contract["score_row"]["score_keys"],
                        artifacts_correct=artifacts_correct,
                    ),
                    _score_row(
                        schema=contract["score_row_schema"],
                        domain=domain["name"],
                        parent=parent,
                        move="7g7f",
                        teacher_cp=0,
                        score_keys=contract["score_row"]["score_keys"],
                        artifacts_correct=artifacts_correct,
                    ),
                ]
            )
    return b"".join(
        json.dumps(
            row,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8")
        + b"\n"
        for row in rows
    )


def _small_contract() -> dict:
    document = REGISTRY.validate_checked_in_registry()
    contract = copy.deepcopy(document["execution_contract"])
    contract["tune"]["domains"] = [
        {
            "name": "browser_tune",
            "parents": 2,
            "gates": {
                "minimum_top1_correct": 2,
                "minimum_pair_accuracy": 1.0,
                "maximum_mean_regret_cp": 0.0,
            },
        },
        {
            "name": "v9_tune",
            "parents": 2,
            "gates": {
                "minimum_top1_correct": 2,
                "minimum_top1_accuracy": 1.0,
                "minimum_pair_accuracy": 1.0,
                "maximum_mean_regret_cp": 0.0,
            },
        },
    ]
    contract["sealed"]["parents"] = 5
    contract["sealed"]["gates"] = {
        "minimum_top1_correct_gain": 1,
        "minimum_pair_accuracy_gain": 0.5,
        "minimum_ndcg_at_5_gain": 0.1,
        "mcnemar_one_sided_maximum_p": 0.05,
    }
    return contract


class ChildBoardPostphaseScoringTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.contract = _small_contract()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def _paths(self) -> dict[str, Path]:
        return {
            "artifact_receipt": self.root / "artifacts.json",
            "score_bundle": self.root / "score-bundle.jsonl",
            "score_bundle_receipt": self.root / "score-bundle-receipt.json",
            "opened_marker": self.root / "opened.json",
            "pending_result": self.root / "pending-result.json",
            "result": self.root / "result.json",
        }

    def _prepare(self, lane: str) -> tuple[dict[str, Path], bytes]:
        paths = self._paths()
        domains = (
            self.contract["tune"]["domains"]
            if lane == "tune"
            else [
                {
                    "name": self.contract["sealed"]["score_domain"],
                    "parents": self.contract["sealed"]["parents"],
                }
            ]
        )
        artifact_raw = _canonical(_artifact_receipt(lane, self.contract))
        bundle_raw = _bundle(self.contract, domains)
        paths["artifact_receipt"].write_bytes(artifact_raw)
        paths["score_bundle"].write_bytes(bundle_raw)
        bundle_receipt = {
            "schema": self.contract["score_bundle_receipt_schema"],
            "lane": lane,
            "bundle": _identity(paths["score_bundle"], bundle_raw),
            "domains": [domain["name"] for domain in domains],
            "source_receipts": {
                domain["name"]: {
                    "path": f"/fixed/{domain['name']}-labels.jsonl",
                    "bytes": 100 + index,
                    "sha256": hashlib.sha256(
                        domain["name"].encode()
                    ).hexdigest(),
                }
                for index, domain in enumerate(domains)
            },
            "artifact_receipt_sha256": hashlib.sha256(
                artifact_raw
            ).hexdigest(),
            "rows": sum(domain["parents"] for domain in domains) * 2,
            "parents": sum(domain["parents"] for domain in domains),
        }
        paths["score_bundle_receipt"].write_bytes(_canonical(bundle_receipt))
        return paths, bundle_raw

    def test_tune_requires_three_complete_artifacts_across_both_domains(self):
        paths, _ = self._prepare("tune")
        result = SCORING.run_one_shot(
            lane="tune",
            registry={},
            paths_override=paths,
            contract_override=self.contract,
            verify_artifact_files=False,
        )
        self.assertTrue(result["pass"])
        self.assertEqual(
            list(result["domains"]),
            ["browser_tune", "v9_tune"],
        )
        for domain in result["domains"].values():
            self.assertEqual(
                list(domain["artifacts"]),
                self.contract["artifact_names"],
            )
            self.assertTrue(
                all(
                    artifact["pass"]
                    for artifact in domain["artifacts"].values()
                )
            )
        self.assertTrue(result["tune_opened"])
        self.assertFalse(result["sealed_scores_opened"])
        self.assertFalse(result["live_weights_changed"])
        self.assertTrue(paths["opened_marker"].is_file())
        self.assertTrue(paths["pending_result"].is_file())
        self.assertEqual(
            paths["pending_result"].read_bytes(),
            paths["result"].read_bytes(),
        )

    def test_sealed_scores_gains_and_exact_mcnemar_for_all_three(self):
        paths, _ = self._prepare("sealed")
        result = SCORING.run_one_shot(
            lane="sealed",
            registry={},
            paths_override=paths,
            contract_override=self.contract,
            verify_artifact_files=False,
        )
        self.assertTrue(result["pass"])
        for artifact in result["artifacts"].values():
            self.assertTrue(artifact["pass"])
            self.assertEqual(
                artifact["mcnemar_one_sided"]["p_numerator"], "1"
            )
            self.assertEqual(
                artifact["mcnemar_one_sided"]["p_denominator"], "32"
            )
            self.assertTrue(artifact["mcnemar_one_sided"]["pass"])
        self.assertTrue(result["sealed_labels_generated"])
        self.assertTrue(result["sealed_scores_opened"])
        self.assertFalse(result["live_weights_changed"])

    def test_pessimistic_ties_apply_to_top1_regret_pairs_and_ndcg(self):
        keys = self.contract["score_row"]["score_keys"]
        rows = [
            ScoreRow(
                "sealed512",
                "p",
                "2g2f",
                100.0,
                {name: (5.0 if name == "frozen_student" else 0.0) for name in keys},
            ),
            ScoreRow(
                "sealed512",
                "p",
                "7g7f",
                0.0,
                {name: (5.0 if name == "frozen_student" else 0.0) for name in keys},
            ),
        ]
        parent = SCORING._parent_metrics(rows, "frozen_student")
        self.assertFalse(parent["top1_correct"])
        self.assertEqual(parent["regret_cp"], 100.0)
        self.assertEqual(parent["pair_correct"], 0)
        self.assertLess(parent["ndcg_at_5"], 1.0)

    def test_complete_pending_allows_terminalize_only_without_bundle_reopen(self):
        paths, _ = self._prepare("tune")
        with self.assertRaisesRegex(SCORING.ScoringError, "injected fault"):
            SCORING.run_one_shot(
                lane="tune",
                registry={},
                paths_override=paths,
                contract_override=self.contract,
                fault_after_pending=True,
                verify_artifact_files=False,
            )
        self.assertFalse(paths["result"].exists())
        paths["score_bundle"].unlink()
        paths["artifact_receipt"].unlink()
        paths["score_bundle_receipt"].unlink()
        recovered = SCORING.run_one_shot(
            lane="tune",
            registry={},
            paths_override=paths,
            contract_override=self.contract,
            verify_artifact_files=False,
        )
        self.assertEqual(
            recovered["recovery"],
            "terminalized-existing-complete-pending",
        )
        self.assertTrue(paths["result"].is_file())

    def test_terminalize_only_rejects_a_tampered_pending_decision(self):
        paths, _ = self._prepare("tune")
        with self.assertRaisesRegex(SCORING.ScoringError, "injected fault"):
            SCORING.run_one_shot(
                lane="tune",
                registry={},
                paths_override=paths,
                contract_override=self.contract,
                fault_after_pending=True,
                verify_artifact_files=False,
            )
        pending = json.loads(paths["pending_result"].read_bytes())
        pending["pass"] = False
        pending["status"] = self.contract["tune"]["failure_status"]
        paths["pending_result"].write_bytes(_canonical(pending))
        with self.assertRaisesRegex(
            SCORING.ScoringError, "decision/status mismatch"
        ):
            SCORING.run_one_shot(
                lane="tune",
                registry={},
                paths_override=paths,
                contract_override=self.contract,
                verify_artifact_files=False,
            )

    def test_frozen_artifact_bytes_are_verified_before_open_marker(self):
        paths, _ = self._prepare("tune")
        artifact = json.loads(paths["artifact_receipt"].read_bytes())
        for name, identity in artifact["artifacts"].items():
            file = self.root / f"{name}.bin"
            raw = f"frozen-{name}".encode()
            file.write_bytes(raw)
            identity.update(
                {
                    "path": str(file),
                    "bytes": len(raw),
                    "sha256": hashlib.sha256(raw).hexdigest(),
                }
            )
        artifact_raw = _canonical(artifact)
        paths["artifact_receipt"].write_bytes(artifact_raw)
        bundle_receipt = json.loads(
            paths["score_bundle_receipt"].read_bytes()
        )
        bundle_receipt["artifact_receipt_sha256"] = hashlib.sha256(
            artifact_raw
        ).hexdigest()
        paths["score_bundle_receipt"].write_bytes(_canonical(bundle_receipt))
        (self.root / "frozen_student.bin").write_bytes(b"tampered")
        with self.assertRaisesRegex(
            SCORING.ScoringError, "frozen artifact byte/SHA mismatch"
        ):
            SCORING.run_one_shot(
                lane="tune",
                registry={},
                paths_override=paths,
                contract_override=self.contract,
            )
        self.assertFalse(paths["opened_marker"].exists())

    def test_opened_without_complete_pending_closes_lane_without_rerun(self):
        paths, _ = self._prepare("tune")
        receipt = json.loads(paths["score_bundle_receipt"].read_bytes())
        receipt["bundle"]["sha256"] = "0" * 64
        paths["score_bundle_receipt"].write_bytes(_canonical(receipt))
        # Keep the receipt self-consistent enough to reach opened publication.
        artifact_raw = paths["artifact_receipt"].read_bytes()
        receipt["artifact_receipt_sha256"] = hashlib.sha256(
            artifact_raw
        ).hexdigest()
        paths["score_bundle_receipt"].write_bytes(_canonical(receipt))
        with self.assertRaisesRegex(SCORING.ScoringError, "identity mismatch"):
            SCORING.run_one_shot(
                lane="tune",
                registry={},
                paths_override=paths,
                contract_override=self.contract,
                verify_artifact_files=False,
            )
        self.assertTrue(paths["opened_marker"].is_file())
        self.assertFalse(paths["pending_result"].exists())
        with self.assertRaisesRegex(SCORING.ScoringError, "lane is closed"):
            SCORING.run_one_shot(
                lane="tune",
                registry={},
                paths_override=paths,
                contract_override=self.contract,
                verify_artifact_files=False,
            )

    def test_existing_terminal_result_validation_reads_no_protected_inputs(self):
        paths, _ = self._prepare("tune")
        SCORING.run_one_shot(
            lane="tune",
            registry={},
            paths_override=paths,
            contract_override=self.contract,
            verify_artifact_files=False,
        )
        paths["score_bundle"].unlink()
        paths["artifact_receipt"].unlink()
        paths["score_bundle_receipt"].unlink()
        existing = SCORING.run_one_shot(
            lane="tune",
            registry={},
            paths_override=paths,
            contract_override=self.contract,
            verify_artifact_files=False,
        )
        self.assertEqual(
            existing["recovery"], "validated-existing-terminal-result"
        )

    def test_bundle_rejects_missing_artifact_score_and_incomplete_domain(self):
        domains = [{"name": "browser_tune", "parents": 1}]
        raw = _bundle(self.contract, domains)
        row, remainder = raw.split(b"\n", 1)
        value = json.loads(row)
        value["scores"].pop("frozen_student")
        missing = json.dumps(value, separators=(",", ":")).encode() + b"\n" + remainder
        with self.assertRaisesRegex(SCORING.ScoringError, "fields mismatch"):
            SCORING.parse_score_bundle(
                missing,
                domains=domains,
                score_row_schema=self.contract["score_row_schema"],
                score_keys=self.contract["score_row"]["score_keys"],
            )
        one_row = raw.split(b"\n", 1)[0] + b"\n"
        with self.assertRaisesRegex(
            SCORING.ScoringError, "not all-legal complete"
        ):
            SCORING.parse_score_bundle(
                one_row,
                domains=domains,
                score_row_schema=self.contract["score_row_schema"],
                score_keys=self.contract["score_row"]["score_keys"],
            )


ScoreRow = SCORING.ScoreRow


if __name__ == "__main__":
    unittest.main()
