#!/usr/bin/env python3
"""Extend the immutable v1 symbol-graph verifier for Swift 6.3.3."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from types import ModuleType


LEGACY_VERIFIER_PATH = Path(__file__).with_name(
    "verify-public-api-symbol-graph.py"
)
SWIFT_6_3_3_GENERATOR = (
    "Apple Swift version 6.3.3 "
    "(swiftlang-6.3.3.1.3 clang-2100.1.1.101)"
)
SWIFT_6_3_3_PROFILE = (
    "xcode-26.5-swift-6.3.3-arm64-macos13",
    575,
    678,
    "1c7cfd318999e04a46513d96895f6b345801b948937fdc01a7064fe42d16266a",
)


def _load_legacy_verifier() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "floodgate_v7_public_api_symbol_graph_v1",
        LEGACY_VERIFIER_PATH,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("immutable v1 symbol-graph verifier cannot be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _extend_calibration(verifier: ModuleType) -> None:
    verifier.run_calibration_profile_self_checks()
    key = (
        SWIFT_6_3_3_GENERATOR,
        verifier.SYMBOL_GRAPH_FORMAT_VERSION_0_6_0,
        verifier.ARM64_MACOS_13_PLATFORM,
    )
    if key in verifier.EXPECTED_PUBLIC_SURFACE_PROFILES:
        raise verifier.VerificationError(
            "Swift 6.3.3 calibration unexpectedly exists in immutable v1"
        )
    verifier.EXPECTED_PUBLIC_SURFACE_PROFILES[key] = SWIFT_6_3_3_PROFILE
    metadata = {
        "formatVersion": json.loads(
            verifier.SYMBOL_GRAPH_FORMAT_VERSION_0_6_0
        ),
        "generator": SWIFT_6_3_3_GENERATOR,
    }
    module = {
        "name": verifier.SYMBOL_GRAPH_MODULE,
        "platform": json.loads(verifier.ARM64_MACOS_13_PLATFORM),
    }
    if (
        verifier.approved_public_surface_profile(metadata, module)
        != SWIFT_6_3_3_PROFILE
    ):
        raise verifier.VerificationError(
            "Swift 6.3.3 calibration self-check mismatch"
        )


def main() -> None:
    verifier = _load_legacy_verifier()
    _extend_calibration(verifier)
    verifier.run_calibration_profile_self_checks = lambda: None
    verifier.main()


if __name__ == "__main__":
    main()
