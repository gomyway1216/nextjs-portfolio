import copy
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)
TEST_DIR = os.path.dirname(__file__)
if TEST_DIR not in sys.path:
    sys.path.insert(0, TEST_DIR)

import formal_paired_ab_local_launcher as legacy  # noqa: E402
import formal_paired_ab_v2_wasm_match_launcher as launcher  # noqa: E402
from test_formal_paired_ab_local_launcher import ReadyFixture  # noqa: E402


def passing_pair_receipt(request, results=("win", "loss")):
    games = []
    transcript_sha256s = []
    for game, result in zip(request["games"], results, strict=True):
        transcript_body = {
            "game_index": game["game_index"],
            "game_id": game["game_id"],
            "candidate_color": game["candidate_color"],
            "result": result,
            "termination": "max-plies",
            "plies": 0,
            "moves": [],
            "move_receipt_sha256s": [],
            "final_sfen": request["opening"]["sfen"],
        }
        transcript_sha256 = launcher._domain_digest(
            "shogi-formal-paired-ab-v2-wasm-game-transcript-v1",
            transcript_body,
        )
        transcript_sha256s.append(transcript_sha256)
        games.append(
            {
                **transcript_body,
                "transcript_sha256": transcript_sha256,
                "launcher_receipt": {
                    "schema": legacy.LOCAL_GAME_RECEIPT_SCHEMA,
                    "pair_index": request["pair_index"],
                    "opening_id": request["opening_id"],
                    "game_index": game["game_index"],
                    "game_id": game["game_id"],
                    "candidate_color": game["candidate_color"],
                    "seed": request["seed"],
                    "candidate_weights_sha256": request["candidate_weights"]["sha256"],
                    "stable_weights_sha256": request["stable_weights"]["sha256"],
                    "match_binding_sha256": request["match_binding_sha256"],
                    "result": result,
                    "technical_fault": False,
                },
            }
        )
    cleanup_body = {
        "candidate_closed_and_reaped": True,
        "stable_closed_and_reaped": True,
        "assets_revalidated_after_games": True,
        "candidate_weights_sha256": request["candidate_weights"]["sha256"],
        "stable_weights_sha256": request["stable_weights"]["sha256"],
        "transcript_sha256s": transcript_sha256s,
    }
    cleanup = {
        "candidate_closed_and_reaped": True,
        "stable_closed_and_reaped": True,
        "assets_revalidated_after_games": True,
        "cleanup_receipt_sha256": launcher._domain_digest(
            "shogi-formal-paired-ab-v2-wasm-cleanup-v1", cleanup_body
        ),
    }
    body = {
        "schema": launcher.PAIR_RECEIPT_SCHEMA,
        "status": "complete",
        "execution_boundary": "authenticated-content-addressed-local-assets",
        "request_sha256": launcher._domain_digest(
            "shogi-formal-paired-ab-v2-wasm-pair-request-v1", request
        ),
        "pair_index": request["pair_index"],
        "opening_id": request["opening_id"],
        "seed": request["seed"],
        "candidate_weights_sha256": request["candidate_weights"]["sha256"],
        "stable_weights_sha256": request["stable_weights"]["sha256"],
        "match_binding_sha256": request["match_binding_sha256"],
        "search_contract": {
            "engine": "production-browser-wasm-v20",
            "wasm_bytes": launcher.WASM_BYTES,
            "wasm_sha256": launcher.WASM_SHA256,
            "fixed_depth": 11,
            "quiescence_depth": 10,
            "nnue_scale_k": 600,
            "reset_before_every_move": True,
            "book": False,
            "fallback": "forbidden",
        },
        "schedule": {
            "pairs": 1,
            "games": 2,
            "games_per_pair": 2,
            "candidate_colors": ["sente", "gote"],
        },
        "games": games,
        "summary": {
            "candidate_wins": list(results).count("win"),
            "draws": list(results).count("draw"),
            "candidate_losses": list(results).count("loss"),
            "games": 2,
        },
        "cleanup": cleanup,
        "safety": {
            "local_only": True,
            "network": False,
            "cloud": False,
            "aws": False,
            "live_weight_write": False,
        },
    }
    return {
        **body,
        "receipt_sha256": launcher._domain_digest(
            "shogi-formal-paired-ab-v2-wasm-pair-receipt-v1", body
        ),
    }


class FormalPairedAbV2WasmMatchLauncherTest(unittest.TestCase):
    def test_exact_384_pair_768_game_run_journals_receipts_and_resumes(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = ReadyFixture(temporary)
            fixture.registry["pair_workers"] = launcher.MAX_PAIR_WORKERS
            fixture.write_registry()
            barrier = threading.Barrier(launcher.MAX_PAIR_WORKERS)
            lock = threading.Lock()
            active = 0
            maximum_active = 0
            requests = []

            def execute_pair(request):
                nonlocal active, maximum_active
                with lock:
                    active += 1
                    maximum_active = max(maximum_active, active)
                    requests.append(copy.deepcopy(request))
                if request["pair_index"] < launcher.MAX_PAIR_WORKERS:
                    barrier.wait(timeout=5)
                with lock:
                    active -= 1
                return passing_pair_receipt(request)

            result = launcher.run_ready_wasm_pairs_core_for_tests(
                fixture.root,
                fixture.registry_path,
                fixture.receipts,
                execute_pair,
            )
            self.assertEqual(maximum_active, launcher.MAX_PAIR_WORKERS)
            self.assertEqual(len(requests), launcher.PAIR_COUNT)
            self.assertEqual(len(result["pairs"]), launcher.PAIR_COUNT)
            self.assertEqual(
                sum(len(pair["games"]) for pair in result["pairs"]),
                launcher.GAME_COUNT,
            )
            self.assertEqual(
                [game["candidate_color"] for game in result["pairs"][0]["games"]],
                ["sente", "gote"],
            )
            self.assertEqual(
                len(list(fixture.receipts.glob("pair-*.jsonl"))),
                launcher.PAIR_COUNT,
            )
            self.assertEqual(
                len(list(fixture.receipts.glob("pair-*.receipt.json"))),
                launcher.PAIR_COUNT,
            )
            events = [
                json.loads(line)
                for line in (fixture.receipts / legacy._pair_file_name(0))
                .read_text(encoding="utf-8")
                .splitlines()
            ]
            self.assertEqual(
                [event["event"] for event in events],
                [
                    "pair-started",
                    "game-completed",
                    "game-completed",
                    "pair-completed",
                ],
            )
            self.assertTrue(all("transcript_sha256" in event for event in events[1:3]))
            self.assertIn("cleanup_receipt_sha256", events[3])
            self.assertIn("pair_receipt_sha256", events[3])

            resumed_calls = 0

            def must_not_replay(_request):
                nonlocal resumed_calls
                resumed_calls += 1
                raise AssertionError("complete pair was replayed")

            resumed = launcher.run_ready_wasm_pairs_core_for_tests(
                fixture.root,
                fixture.registry_path,
                fixture.receipts,
                must_not_replay,
            )
            self.assertEqual(resumed_calls, 0)
            self.assertEqual(resumed, result)

            sidecar = fixture.receipts / launcher._pair_receipt_file_name(0)
            raw = bytearray(sidecar.read_bytes())
            raw[10] ^= 1
            sidecar.write_bytes(raw)
            sidecar.chmod(0o600)
            with self.assertRaisesRegex(
                ValueError, "runtime receipt sidecar identity differs"
            ):
                launcher.run_ready_wasm_pairs_core_for_tests(
                    fixture.root,
                    fixture.registry_path,
                    fixture.receipts,
                    must_not_replay,
                )
            self.assertEqual(resumed_calls, 0)

    def test_pair_crash_is_terminal_and_never_replayed(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = ReadyFixture(temporary)
            fixture.registry["pair_workers"] = 1
            fixture.write_registry()

            def crash(_request):
                raise RuntimeError("synthetic isolated player crash")

            with self.assertRaisesRegex(
                launcher.FormalAbV2WasmMatchTechnicalFault,
                "technical fault",
            ):
                launcher.run_ready_wasm_pairs_core_for_tests(
                    fixture.root,
                    fixture.registry_path,
                    fixture.receipts,
                    crash,
                )
            calls = 0

            def no_replay(request):
                nonlocal calls
                calls += 1
                return passing_pair_receipt(request)

            with self.assertRaisesRegex(
                launcher.FormalAbV2WasmMatchTechnicalFault,
                "terminal technical fault",
            ):
                launcher.run_ready_wasm_pairs_core_for_tests(
                    fixture.root,
                    fixture.registry_path,
                    fixture.receipts,
                    no_replay,
                )
            self.assertEqual(calls, 0)

    def test_real_runner_is_code_pinned_closed_and_caps_workers_at_two(self):
        self.assertTrue(callable(launcher.run_pinned_ready_wasm_pairs))
        with self.assertRaisesRegex(
            legacy.FormalAbLocalLauncherBlocked,
            "no code-pinned checked-in ready registry",
        ):
            launcher.run_pinned_ready_wasm_pairs(
                Path(ML_DIR).parent, Path(ML_DIR).parent / "unused"
            )

        with tempfile.TemporaryDirectory() as temporary:
            fixture = ReadyFixture(temporary)
            fixture.registry["pair_workers"] = 3
            fixture.write_registry()
            calls = 0

            def execute(request):
                nonlocal calls
                calls += 1
                return passing_pair_receipt(request)

            with self.assertRaisesRegex(ValueError, "one or two pair workers"):
                launcher.run_ready_wasm_pairs_core_for_tests(
                    fixture.root,
                    fixture.registry_path,
                    fixture.receipts,
                    execute,
                )
            self.assertEqual(calls, 0)


if __name__ == "__main__":
    unittest.main()
