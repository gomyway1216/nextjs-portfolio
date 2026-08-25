"""The student trainer's pins must equal the bridge's own.

ml/train_child_board_root_policy_student.py verifies the production
root-move-universe bridge before it will spawn Node: it checks the bridge
source's bytes/SHA-256, the response schema, and the WASM identity and moveBuf
offset the bridge reports. Every one of those is a hand-copied duplicate of a
constant declared in ml/child-board-root-move-universe-bridge.ts, and nothing
but discipline kept the two in step.

The discipline failed. Before 2026-08-25 this module still pinned the
36,545-byte legacy shogi.wasm (the bridge had moved to the 38,288-byte HalfKP81
production build) and a bridge source revision two changes old, so
_bridge_source_identity() raised "production move-universe bridge source drift"
on the first call and the pipeline could not run at all - silently, because
nothing exercised it.

This test is the mechanism that was missing: it parses the constants out of the
TypeScript and compares. If the bridge changes and these pins are not updated
with it, CI says so instead of the training run discovering it months later.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
import re
import unittest

ML_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = ML_DIR.parent
BRIDGE_PATH = ML_DIR / "child-board-root-move-universe-bridge.ts"
TRAINER_PATH = ML_DIR / "train_child_board_root_policy_student.py"

# The trainer imports torch, which the dependency-free stdlib suite does not
# have, so its constants are read out of the source text rather than imported.
# That is also the stricter check: it sees the literal a human would edit.


def _py_number(name: str, source: str) -> int:
    match = re.search(rf"^{name} = ([0-9_]+)$", source, re.MULTILINE)
    if match is None:
        raise AssertionError(f"trainer does not declare {name} as an integer")
    return int(match.group(1).replace("_", ""))


def _py_string(name: str, source: str) -> str:
    match = re.search(
        rf'^{name} = \(\n    "([^"]*)"\n\)$', source, re.MULTILINE
    ) or re.search(rf'^{name} = "([^"]*)"$', source, re.MULTILINE)
    if match is None:
        raise AssertionError(f"trainer does not declare {name} as a string")
    return match.group(1)


def _const(source: str, name: str) -> str:
    match = re.search(rf"export const {name} =\s*([^;]+);", source)
    if match is None:
        raise AssertionError(f"bridge does not declare {name}")
    return match.group(1).strip()


def _number(source: str, name: str) -> int:
    raw = _const(source, name)
    if not re.fullmatch(r"[0-9_]+", raw):
        raise AssertionError(f"{name} is not a plain integer literal: {raw!r}")
    return int(raw.replace("_", ""))


def _string(source: str, name: str) -> str:
    raw = _const(source, name)
    match = re.fullmatch(r'"([^"]*)"', raw)
    if match is None:
        raise AssertionError(f"{name} is not a plain string literal: {raw!r}")
    return match.group(1)


class StudentBridgePinTests(unittest.TestCase):
    def setUp(self) -> None:
        self.raw = BRIDGE_PATH.read_bytes()
        self.source = self.raw.decode("utf-8")
        self.trainer = TRAINER_PATH.read_text(encoding="utf-8")

    def test_bridge_source_identity_matches(self) -> None:
        """The bytes/SHA the trainer refuses to run without."""
        self.assertEqual(
            len(self.raw),
            _py_number("MOVE_UNIVERSE_BRIDGE_BYTES", self.trainer),
        )
        self.assertEqual(
            hashlib.sha256(self.raw).hexdigest(),
            _py_string("MOVE_UNIVERSE_BRIDGE_SHA256", self.trainer),
        )

    def test_schemas_match(self) -> None:
        self.assertEqual(
            _string(self.source, "REQUEST_SCHEMA"),
            _py_string("MOVE_UNIVERSE_REQUEST_SCHEMA", self.trainer),
        )
        self.assertEqual(
            _string(self.source, "RESPONSE_SCHEMA"),
            _py_string("MOVE_UNIVERSE_RESPONSE_SCHEMA", self.trainer),
        )

    def test_wasm_identity_and_buffer_offset_match(self) -> None:
        self.assertEqual(
            _number(self.source, "PINNED_WASM_BYTES"),
            _py_number("MOVE_UNIVERSE_WASM_BYTES", self.trainer),
        )
        self.assertEqual(
            _string(self.source, "PINNED_WASM_SHA256"),
            _py_string("MOVE_UNIVERSE_WASM_SHA256", self.trainer),
        )
        self.assertEqual(
            _number(self.source, "PINNED_ROOT_MOVE_BUFFER_OFFSET"),
            _py_number("MOVE_UNIVERSE_WASM_BUFFER_OFFSET", self.trainer),
        )

    def test_pinned_wasm_identity_is_the_shipped_binary(self) -> None:
        """And the pinned WASM is the one the browser actually loads.

        This is the check that would have caught the 36,545-byte drift on its
        own: the trainer must be describing the engine that is checked in, not
        one from an earlier generation.
        """
        wasm = (
            REPO_ROOT
            / "src/components/game/ShogiImproved/wasm/shogi-halfkp81-production.wasm"
        ).read_bytes()
        self.assertEqual(
            len(wasm), _py_number("MOVE_UNIVERSE_WASM_BYTES", self.trainer)
        )
        self.assertEqual(
            hashlib.sha256(wasm).hexdigest(),
            _py_string("MOVE_UNIVERSE_WASM_SHA256", self.trainer),
        )

    def test_response_evidence_fields_match_the_bridge(self) -> None:
        """The trainer's allowed `wasm` field set must be what the bridge emits.

        The v2 bridge reported second_search_depth/nodes/leaves as evidence that
        moveBuf held the root universe; v3 reports root_move_fill instead. A
        trainer still demanding the old field names rejects every response.
        """
        # Field DECLARATIONS, not prose: the bridge header comment still
        # mentions second_search_* to explain why it went away.
        self.assertIn("readonly root_move_fill: number;", self.source)
        self.assertNotIn("readonly second_search_depth", self.source)
        self.assertIn("root_move_fill: filled,", self.source)
        self.assertIn('"root_move_fill"', self.trainer)
        self.assertNotIn('"second_search_depth"', self.trainer)


if __name__ == "__main__":
    unittest.main()
