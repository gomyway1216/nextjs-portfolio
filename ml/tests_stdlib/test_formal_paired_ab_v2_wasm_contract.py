import copy
import os
import sys
import unittest


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

import formal_paired_ab_v2_wasm_contract as contract  # noqa: E402


def digest(number):
    return f"{number:064x}"


def semantic_id(number):
    return f"sha256:{number:064x}"


def identity(path, byte_count, sha256):
    return {"path": path, "bytes": byte_count, "sha256": sha256}


def match_binding():
    assets = {
        "candidate_weights": identity(
            "private/candidate.bin",
            contract.NNUE_BYTES,
            digest(1),
        ),
        "stable_weights": identity(
            "private/stable.bin",
            contract.NNUE_BYTES,
            digest(2),
        ),
    }
    for index, (name, path) in enumerate(contract.MATCH_ASSET_PATHS.items(), 10):
        assets[name] = identity(path, 100 + index, digest(index))
    return {
        "schema": contract.FORMAL_WASM_MATCH_BINDING_SCHEMA,
        "engine_protocol": "production-browser-wasm-v20",
        "opening_protocol": "SFEN+USI",
        "result_protocol": "candidate-perspective-win-draw-loss",
        "assets": assets,
        "search_contract": copy.deepcopy(contract.SEARCH_CONTRACT),
        "pair_worker_policy": copy.deepcopy(contract.PAIR_WORKER_POLICY),
        "safety": copy.deepcopy(contract.SAFETY_CONTRACT),
    }


def openings_manifest():
    pairs = []
    moves = ["7g7f"] * contract.OPENING_SELECTION_RULE["opening_ply"]
    for pair_index in range(contract.PAIR_COUNT):
        opening = {
            "sfen": (
                "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/"
                f"PPPPPPPPP/1B5R1/LNSGKGSNL b - {pair_index + 1}"
            ),
            "usi_moves": moves,
        }
        opening_id = contract._expected_opening_id(opening)
        games = []
        for game_index, color in enumerate(("sente", "gote")):
            games.append(
                {
                    "game_index": game_index,
                    "game_id": contract._expected_game_id(
                        opening_id,
                        pair_index,
                        game_index,
                        color,
                    ),
                    "candidate_color": color,
                }
            )
        pairs.append(
            {
                "pair_index": pair_index,
                "source_game_id": semantic_id(1_000 + pair_index),
                "opening_id": opening_id,
                "opening": opening,
                "seed": (
                    contract.MAX_SAFE_SEED
                    if pair_index == contract.PAIR_COUNT - 1
                    else pair_index + 1
                ),
                "games": games,
            }
        )
    return {
        "schema": contract.FORMAL_WASM_OPENINGS_MANIFEST_SCHEMA,
        "source_manifest_sha256": digest(999),
        "selection_rule": copy.deepcopy(contract.OPENING_SELECTION_RULE),
        "pairs": pairs,
    }


class FormalPairedAbV2WasmContractTest(unittest.TestCase):
    def test_match_binding_names_only_assets_used_by_real_wasm_runner(self):
        binding = match_binding()
        captured, assets = contract.validate_formal_wasm_match_binding_core_for_tests(
            binding,
            lambda _name, observed: observed,
        )

        self.assertEqual(captured["search_contract"]["clock"], "none")
        self.assertEqual(captured["search_contract"]["fixed_depth"], 11)
        self.assertEqual(captured["search_contract"]["quiescence_depth"], 10)
        self.assertEqual(
            captured["pair_worker_policy"]["benchmark_candidates"],
            [2, 4, 8, 12],
        )
        self.assertNotIn("yaneuraou_engine", assets)
        self.assertEqual(
            set(assets),
            {
                "candidate_weights",
                "stable_weights",
                "pair_entry",
                "match_adapter",
                "isolated_player",
                "wasm_module_source",
            },
        )

        binding["assets"]["yaneuraou_engine"] = identity(
            "unused/yaneuraou",
            1,
            digest(90),
        )
        with self.assertRaisesRegex(ValueError, "fields are not exact"):
            contract.validate_formal_wasm_match_binding_core_for_tests(
                binding,
                lambda _name, observed: observed,
            )

    def test_attempt_zero_and_benchmark_worker_envelope_is_fail_closed(self):
        for workers in contract.PAIR_WORKER_CANDIDATES:
            self.assertEqual(
                contract.validate_formal_wasm_run_envelope(
                    {
                        "attempt_index": 0,
                        "rerun_authorization": None,
                        "pair_workers": workers,
                    }
                ),
                workers,
            )
        for mutation in (
            {"attempt_index": 1},
            {"attempt_index": False},
            {"attempt_index": 0.0},
            {"rerun_authorization": {"path": "rerun.json"}},
            {"pair_workers": 1},
            {"pair_workers": 6},
            {"pair_workers": 13},
        ):
            registry = {
                "attempt_index": 0,
                "rerun_authorization": None,
                "pair_workers": 2,
            }
            registry.update(mutation)
            with self.assertRaises(ValueError):
                contract.validate_formal_wasm_run_envelope(registry)

    def test_manifest_requires_safe_seeds_and_one_source_game_per_opening(self):
        manifest = openings_manifest()
        captured = contract.validate_formal_wasm_openings_manifest(manifest)
        self.assertEqual(len(captured["pairs"]), contract.PAIR_COUNT)
        self.assertEqual(
            captured["pairs"][-1]["seed"],
            contract.MAX_SAFE_SEED,
        )

        unsafe = copy.deepcopy(manifest)
        unsafe["pairs"][-1]["seed"] = contract.MAX_SAFE_SEED + 1
        with self.assertRaisesRegex(ValueError, "Number.MAX_SAFE_INTEGER"):
            contract.validate_formal_wasm_openings_manifest(unsafe)

        duplicate_source = copy.deepcopy(manifest)
        duplicate_source["pairs"][1]["source_game_id"] = (
            duplicate_source["pairs"][0]["source_game_id"]
        )
        with self.assertRaisesRegex(ValueError, "distinct source game"):
            contract.validate_formal_wasm_openings_manifest(duplicate_source)

    def test_preflight_receipt_binds_exact_manifest_and_384_unique_finals(self):
        manifest = contract.validate_formal_wasm_openings_manifest(
            openings_manifest()
        )
        body = {
            "schema": contract.FORMAL_WASM_OPENINGS_PREFLIGHT_SCHEMA,
            "status": "PASS",
            "manifest_sha256": contract._domain_digest(
                "shogi-formal-paired-ab-v2-wasm-openings-manifest-v2",
                manifest,
            ),
            "pairs": contract.PAIR_COUNT,
            "games": contract.GAME_COUNT,
            "source_games": contract.PAIR_COUNT,
            "semantic_final_positions": contract.PAIR_COUNT,
            "source_game_ids_sha256": digest(300),
            "semantic_final_position_ids_sha256": digest(301),
        }
        receipt = {
            **body,
            "receipt_sha256": contract._domain_digest(
                "shogi-formal-paired-ab-v2-wasm-openings-preflight-v1",
                body,
            ),
        }
        self.assertEqual(
            contract.validate_formal_wasm_openings_preflight_receipt(
                manifest,
                receipt,
            )["status"],
            "PASS",
        )

        drifted = copy.deepcopy(receipt)
        drifted["semantic_final_positions"] = contract.PAIR_COUNT - 1
        with self.assertRaisesRegex(ValueError, "semantic_final_positions differs"):
            contract.validate_formal_wasm_openings_preflight_receipt(
                manifest,
                drifted,
            )


if __name__ == "__main__":
    unittest.main()
