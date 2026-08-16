from contextlib import redirect_stdout
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

from audit_kingpair_10m_fast_fixture import (  # noqa: E402
    AuditContract,
    AuditError,
    EncodedPosition,
    audit_fixture,
    load_contract,
    load_live_feature_encoder,
    main,
)


DOMAINS = (
    "fresh-selfplay",
    "browser-confusion",
    "public-floodgate-and-wcsc-games",
    "unused-runop1-positions-relabelled-by-aoba",
)
CONTRACT = AuditContract(DOMAINS, 0.4)


def encoded_for(sfen):
    number = int(sfen.removeprefix("fixture-"))
    us = number % 81
    them = (80 - number) % 81
    relative = ((number % 17) * 17 + ((number * 3) % 17)) % 289
    return EncodedPosition(
        active_views=(
            (us * 2_268 + 7, us * 2_268 + 88),
            (them * 2_268 + 11, them * 2_268 + 92),
        ),
        king_buckets=(us, them),
        relative_king_index=relative,
    )


def cp_row(number, domain, phase, parent_cp):
    return {
        "sfen": f"fixture-{number}",
        "child_sfen": f"fixture-{number}",
        "source_position_domain": domain,
        "phase": phase,
        "teacher_bound": "exact",
        "teacher_score_kind": "cp",
        "teacher_parent_cp": parent_cp,
        "teacher_child_cp": -parent_cp,
        "cp": -parent_cp,
    }


class KingPairFastFixtureAuditTests(unittest.TestCase):
    def test_stdlib_bridge_reuses_live_train_and_kingpair_representation(self):
        encoder = load_live_feature_encoder(load_contract())
        encoded = encoder(
            "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/"
            "PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
        )
        self.assertEqual(len(encoded.active_views[0]), 40)
        self.assertEqual(len(encoded.active_views[1]), 40)
        self.assertEqual(encoded.king_buckets, (44, 44))
        self.assertEqual(encoded.relative_king_index, 8 * 17)
        for view, bucket in zip(encoded.active_views, encoded.king_buckets):
            self.assertTrue(all(bucket * 2_268 <= value < (bucket + 1) * 2_268 for value in view))

    def test_read_only_cli_audits_real_sfen_without_torch(self):
        start = (
            "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/"
            "PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
        )
        rows = []
        for index, domain in enumerate(DOMAINS):
            row = cp_row(index + 1, domain, ("opening", "mid", "late")[index % 3], index)
            row["sfen"] = start
            row["child_sfen"] = start
            rows.append(row)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "fixture.jsonl"
            original = "".join(json.dumps(row) + "\n" for row in rows).encode()
            path.write_bytes(original)
            output = io.StringIO()
            with redirect_stdout(output):
                exit_code = main([str(path)])
            self.assertEqual(exit_code, 0)
            self.assertEqual(path.read_bytes(), original)
            self.assertEqual(json.loads(output.getvalue())["status"], "pass")

    def test_reports_halfkp_king_domain_phase_cp_mate_and_bound_coverage(self):
        rows = [
            cp_row(1, DOMAINS[0], "opening", -100),
            cp_row(2, DOMAINS[1], "mid", 0),
            cp_row(3, DOMAINS[2], "late", 200),
            {
                **cp_row(4, DOMAINS[3], "opening", 999_998),
                "teacher_score_kind": "mate",
                "teacher_mate": 2,
                "teacher_mate_sign": 1,
            },
        ]
        rejects = [
            {"reason": "lowerbound"},
            {"reason": "upperbound"},
            {"reason": "incomplete"},
        ]
        result = audit_fixture(
            ((row, f"row {index}") for index, row in enumerate(rows, 1)),
            ((row, f"reject {index}") for index, row in enumerate(rejects, 1)),
            contract=CONTRACT,
            encoder=encoded_for,
        )

        self.assertEqual(result["status"], "pass")
        self.assertEqual(result["rows"]["admitted_exact"], 4)
        self.assertEqual(result["rows"]["bound_rejects"], 2)
        self.assertEqual(
            result["source_coverage"]["domains"]["counts"],
            {domain: 1 for domain in DOMAINS},
        )
        self.assertEqual(result["source_coverage"]["domains"]["unseen"], [])
        self.assertEqual(result["source_coverage"]["phases"]["unseen"], [])
        self.assertEqual(
            result["feature_coverage"]["halfkp_active_features_per_view"][0]["counts"],
            {"2": 4},
        )
        self.assertEqual(
            result["feature_coverage"]["king_buckets"][0]["counts"][1], 1
        )
        self.assertEqual(
            result["teacher_score"]["score_kind_counts"], {"cp": 3, "mate": 1}
        )
        self.assertEqual(result["teacher_score"]["parent_child_sign_checks"], 4)
        self.assertEqual(
            result["teacher_score"]["child_cp"]["nearest_rank"]["min"],
            -999_998,
        )
        self.assertEqual(
            result["teacher_score"]["bounds"]["incomplete_rejects"], 1
        )

    def test_rejects_parent_child_sign_and_admitted_bound_errors(self):
        bad_sign = cp_row(1, DOMAINS[0], "opening", 100)
        bad_sign["teacher_child_cp"] = 100
        bad_sign["cp"] = 100
        with self.assertRaisesRegex(AuditError, "child CP alias/sign"):
            audit_fixture(
                [(bad_sign, "bad sign")],
                [],
                contract=CONTRACT,
                encoder=encoded_for,
            )

        bound = cp_row(1, DOMAINS[0], "opening", 100)
        bound["teacher_bound"] = "lowerbound"
        with self.assertRaisesRegex(AuditError, "not explicitly exact"):
            audit_fixture(
                [(bound, "bad bound")],
                [],
                contract=CONTRACT,
                encoder=encoded_for,
            )

    def test_rejected_bound_cannot_become_a_training_label(self):
        row = cp_row(1, DOMAINS[0], "opening", 100)
        with self.assertRaisesRegex(AuditError, "became a label"):
            audit_fixture(
                [(row, "row")],
                [({"reason": "lowerbound", "cp": 12}, "bound")],
                contract=CONTRACT,
                encoder=encoded_for,
            )

    def test_contract_failures_are_reported_without_relaxing_the_gate(self):
        rows = [
            cp_row(1, DOMAINS[0], "opening", 10),
            cp_row(2, DOMAINS[0], "mid", 20),
            cp_row(3, DOMAINS[0], "late", 30),
        ]
        result = audit_fixture(
            ((row, f"row {index}") for index, row in enumerate(rows, 1)),
            [({"reason": "technical-fault"}, "fault")],
            contract=CONTRACT,
            encoder=encoded_for,
        )
        self.assertEqual(result["status"], "fail")
        self.assertEqual(
            result["failures"],
            ["maximum-single-source-position-domain-fraction", "technical-faults"],
        )
        self.assertEqual(result["rows"]["technical_faults"], 1)

    def test_feature_rows_must_match_each_king_bucket(self):
        row = cp_row(1, DOMAINS[0], "opening", 10)

        def invalid_encoder(_sfen):
            return EncodedPosition(
                active_views=((0, 1), (0, 1)),
                king_buckets=(1, 2),
                relative_king_index=0,
            )

        with self.assertRaisesRegex(AuditError, "outside its HalfKP king bucket"):
            audit_fixture(
                [(row, "bad feature")],
                [],
                contract=CONTRACT,
                encoder=invalid_encoder,
            )


if __name__ == "__main__":
    unittest.main()
