from __future__ import annotations

import copy
import hashlib
import io
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock


ML_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = ML_DIR.parent
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import build_retention_recovery_enrollment_registry_candidate as BUILDER  # noqa: E402
import retention_recovery_enrollment_registry as REGISTRY  # noqa: E402


class SyntheticRecovery:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.general = b"opaque-general-fixture\n" * 4_000
        self.opening = b"opaque-opening-fixture\n" * 4_000
        self.specs = (
            {
                "role": "general_retention_intended_role",
                "filename": "holdout5m-4k.jsonl",
                "bytes": len(self.general),
                "rows": 4_000,
                "sha256": hashlib.sha256(self.general).hexdigest(),
            },
            {
                "role": "opening_retention_intended_role",
                "filename": "opening-holdout-4k.jsonl",
                "bytes": len(self.opening),
                "rows": 4_000,
                "sha256": hashlib.sha256(self.opening).hexdigest(),
            },
        )
        self.write("holdout5m-4k.jsonl", self.general)
        self.write("opening-holdout-4k.jsonl", self.opening)

    def write(self, filename: str, raw: bytes) -> None:
        path = self.root / filename
        path.write_bytes(raw)
        path.chmod(0o600)

    def build(self) -> dict:
        with mock.patch.object(REGISTRY, "_ROLE_SPECS", self.specs):
            return BUILDER.build_registry_candidate(
                repo_root=REPO_ROOT,
                data_root=self.root,
                require_pinned_match=False,
            )


class RetentionRecoveryEnrollmentTests(unittest.TestCase):
    def test_pinned_registry_is_strict_canonical_and_narrow(self):
        registry = REGISTRY.load_registry(repo_root=REPO_ROOT)
        raw = (REPO_ROOT / REGISTRY.REGISTRY_RELATIVE_PATH).read_bytes()
        self.assertEqual(REGISTRY.canonical_json_bytes(registry), raw)
        self.assertEqual([item["rows"] for item in registry["artifacts"]], [4000, 4000])
        self.assertEqual(
            registry["source_provenance_observations"]["general_retention"][
                "observed_source_copy_count"
            ],
            2,
        )
        self.assertTrue(registry["claims"]["data_availability_blocker_removed"])
        self.assertFalse(registry["claims"]["row_semantics_validated"])
        self.assertFalse(registry["boundary"]["downstream_gate_connected"])
        self.assertFalse(registry["boundary"]["live_weights_changed"])

    def test_builder_matches_pinned_bytes_when_durable_files_are_available(self):
        durable_root = (
            Path.home() / ".codex/shogi-data/floodgate-q1-2026-retention-recovered-v1"
        )
        if not durable_root.is_dir():
            self.skipTest("operator-recovered durable files are intentionally private")
        candidate = BUILDER.build_registry_candidate(repo_root=REPO_ROOT)
        self.assertEqual(
            BUILDER.serialize_registry_candidate(candidate),
            (REPO_ROOT / REGISTRY.REGISTRY_RELATIVE_PATH).read_bytes(),
        )

    def test_synthetic_builder_is_deterministic_without_parsing_json(self):
        with tempfile.TemporaryDirectory() as temporary:
            recovery = SyntheticRecovery(Path(temporary))
            with mock.patch.object(REGISTRY, "_ROLE_SPECS", recovery.specs):
                first = BUILDER.build_registry_candidate(
                    repo_root=REPO_ROOT,
                    data_root=recovery.root,
                    require_pinned_match=False,
                )
                second = BUILDER.build_registry_candidate(
                    repo_root=REPO_ROOT,
                    data_root=recovery.root,
                    require_pinned_match=False,
                )
                self.assertEqual(
                    BUILDER.serialize_registry_candidate(first),
                    BUILDER.serialize_registry_candidate(second),
                )
        self.assertEqual(first["boundary"]["json_rows_parsed"], 0)
        self.assertEqual(first["boundary"]["label_fields_accessed"], 0)

    def test_builder_rejects_stable_content_mutation(self):
        with tempfile.TemporaryDirectory() as temporary:
            recovery = SyntheticRecovery(Path(temporary))
            path = recovery.root / "holdout5m-4k.jsonl"
            with path.open("r+b") as stream:
                stream.write(b"X")
            with mock.patch.object(REGISTRY, "_ROLE_SPECS", recovery.specs):
                with self.assertRaisesRegex(ValueError, "identity drifted"):
                    BUILDER.build_registry_candidate(
                        repo_root=REPO_ROOT,
                        data_root=recovery.root,
                        require_pinned_match=False,
                    )

    def test_builder_rejects_missing_file(self):
        with tempfile.TemporaryDirectory() as temporary:
            recovery = SyntheticRecovery(Path(temporary))
            (recovery.root / "opening-holdout-4k.jsonl").unlink()
            with mock.patch.object(REGISTRY, "_ROLE_SPECS", recovery.specs):
                with self.assertRaisesRegex(ValueError, "cannot be read"):
                    BUILDER.build_registry_candidate(
                        repo_root=REPO_ROOT,
                        data_root=recovery.root,
                        require_pinned_match=False,
                    )

    def test_builder_rejects_symlink(self):
        with tempfile.TemporaryDirectory() as temporary:
            recovery = SyntheticRecovery(Path(temporary))
            link = recovery.root / "opening-holdout-4k.jsonl"
            target = recovery.root / "opening-target.jsonl"
            link.rename(target)
            os.symlink(target, link)
            with mock.patch.object(REGISTRY, "_ROLE_SPECS", recovery.specs):
                with self.assertRaisesRegex(ValueError, "canonical owner-only"):
                    BUILDER.build_registry_candidate(
                        repo_root=REPO_ROOT,
                        data_root=recovery.root,
                        require_pinned_match=False,
                    )

    def test_builder_rejects_non_owner_only_recovery_root(self):
        with tempfile.TemporaryDirectory() as temporary:
            recovery = SyntheticRecovery(Path(temporary))
            recovery.root.chmod(0o755)
            with mock.patch.object(REGISTRY, "_ROLE_SPECS", recovery.specs):
                with self.assertRaisesRegex(ValueError, "owner-only directory"):
                    BUILDER.build_registry_candidate(
                        repo_root=REPO_ROOT,
                        data_root=recovery.root,
                        require_pinned_match=False,
                    )

    def test_registry_rejects_provenance_or_authority_expansion(self):
        registry = REGISTRY.load_registry(repo_root=REPO_ROOT)
        for path, value in (
            (("claims", "playing_strength_improved"), True),
            (("historical_evidence", "historical_manifest_authenticated"), True),
            (("boundary", "downstream_gate_connected"), True),
            (("boundary", "live_weights_changed"), True),
        ):
            changed = copy.deepcopy(registry)
            changed[path[0]][path[1]] = value
            with self.assertRaisesRegex(ValueError, "fixed boundary drifted"):
                REGISTRY.validate_registry(changed)

    def test_main_rejects_arguments_before_reading_private_files(self):
        stderr = io.StringIO()
        with (
            mock.patch.object(sys, "stderr", stderr),
            mock.patch.object(BUILDER, "build_registry_candidate") as build,
        ):
            self.assertEqual(BUILDER.main(["--data", "forbidden"]), 2)
        build.assert_not_called()
        self.assertIn("arguments are forbidden", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
