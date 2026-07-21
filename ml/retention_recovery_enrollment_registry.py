"""Strict public enrollment for operator-recovered legacy retention files.

This registry records only durable file identity and operator observations about
where the two files were recovered.  It does not authenticate an original
manifest, the historical role assignment, row semantics, freshness, playing
strength, or any downstream/live authority.
"""

from __future__ import annotations

from collections.abc import Mapping
import copy
import hashlib
import json
from pathlib import Path
import re
from typing import Any


REGISTRY_SCHEMA = "shogi-floodgate-retention-recovery-enrollment-registry-v1"
REGISTRY_STATUS = "operator-recovered-data-availability-only"
REGISTRY_RELATIVE_PATH = (
    "ml/protocols/floodgate-q1-2026-retention-recovery-enrollment-registry.json"
)
BUILDER_COMMAND = "python3 ml/build_retention_recovery_enrollment_registry_candidate.py"
RECOVERY_ROOT_DISPLAY = (
    "$HOME/.codex/shogi-data/floodgate-q1-2026-retention-recovered-v1"
)
LINE_COUNT_METHOD = "raw-newline-count-only-no-json-or-label-field-parse"

_SHA256_RE = re.compile(r"[0-9a-f]{64}")
_ROLE_SPECS = (
    {
        "role": "general_retention_intended_role",
        "filename": "holdout5m-4k.jsonl",
        "bytes": 542_594,
        "rows": 4_000,
        "sha256": "3d25f6bf113710c8ea326c132d2fc2cc9f76f572dddbd09c1d397b78cb07d00e",
    },
    {
        "role": "opening_retention_intended_role",
        "filename": "opening-holdout-4k.jsonl",
        "bytes": 538_870,
        "rows": 4_000,
        "sha256": "1f8d91f286eec160eb1141ba5adfd36b842af12ceec37aa4f959038a60969ce6",
    },
)

SOURCE_PROVENANCE_OBSERVATIONS = {
    "provenance": "operator-observed-not-authenticated-by-registry-builder",
    "absolute_legacy_source_paths_published": False,
    "general_retention": {
        "observed_source_copy_count": 2,
        "observed_sources": [
            {
                "redacted_label": "legacy-worktree-source-a",
                "working_tree_head_observed": (
                    "29072482b02802092ad59de2e89850b9a133eb85"
                ),
                "bytes": 542_594,
                "rows": 4_000,
                "sha256": (
                    "3d25f6bf113710c8ea326c132d2fc2cc9f76f572dddbd09c1d397b78cb07d00e"
                ),
            },
            {
                "redacted_label": "legacy-worktree-source-b",
                "working_tree_head_observed": None,
                "bytes": 542_594,
                "rows": 4_000,
                "sha256": (
                    "3d25f6bf113710c8ea326c132d2fc2cc9f76f572dddbd09c1d397b78cb07d00e"
                ),
            },
        ],
        "independent_duplicate_evidence": {
            "present": True,
            "same_bytes_rows_sha256_observed": True,
            "distinct_file_identity_observed": True,
            "authenticated_by_builder": False,
        },
    },
    "opening_retention": {
        "observed_source_copy_count": 1,
        "observed_sources": [
            {
                "redacted_label": "legacy-worktree-source-a",
                "branch_observed": "shogi/nnue-opening-refresh",
                "working_tree_head_observed": (
                    "18ab9f385de084480656de0f4ed40aa36e9a100f"
                ),
                "bytes": 538_870,
                "rows": 4_000,
                "sha256": (
                    "1f8d91f286eec160eb1141ba5adfd36b842af12ceec37aa4f959038a60969ce6"
                ),
            }
        ],
        "independent_duplicate_evidence": {
            "present": False,
            "same_bytes_rows_sha256_observed": False,
            "distinct_file_identity_observed": False,
            "authenticated_by_builder": False,
        },
    },
}

HISTORICAL_EVIDENCE = {
    "original_manifest_available": False,
    "original_receipt_available": False,
    "preregistered_hash_available": False,
    "artifact_stored_as_git_object": False,
    "historical_manifest_authenticated": False,
    "historical_role_assignment_authenticated": False,
}

BOUNDARY = {
    "local_only": True,
    "network_requests": 0,
    "artifact_bytes_read_for_identity": True,
    "json_rows_parsed": 0,
    "label_fields_accessed": 0,
    "label_contents_displayed": False,
    "downstream_gate_connected": False,
    "candidate_selected": False,
    "formal_ab_games": 0,
    "external_calibration_games": 0,
    "live_weights_changed": False,
}

CLAIMS = {
    "durable_file_identity_enrolled": True,
    "data_availability_blocker_removed": True,
    "row_semantics_validated": False,
    "freshness_authenticated": False,
    "playing_strength_improved": False,
    "high_dan_calibrated": False,
    "live_model_changed": False,
}

_REGISTRY_FIELDS = {
    "schema",
    "status",
    "recorded_date",
    "builder_command",
    "classification",
    "artifacts",
    "source_provenance_observations",
    "historical_evidence",
    "boundary",
    "claims",
    "next_step",
}
_ARTIFACT_FIELDS = {
    "role",
    "path",
    "bytes",
    "rows",
    "sha256",
    "mode",
    "line_count_method",
}


def canonical_json_bytes(value: Mapping[str, Any]) -> bytes:
    """Return the one checked-in serialization for this registry."""

    return (
        json.dumps(
            value,
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
            separators=(",", ": "),
        )
        + "\n"
    ).encode("utf-8")


def _exact(value: Any, fields: set[str], label: str) -> dict[str, Any]:
    if type(value) is not dict or set(value) != fields:
        raise ValueError(f"{label} fields are not exact")
    return value


def _expected_artifact(spec: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "role": spec["role"],
        "path": f"{RECOVERY_ROOT_DISPLAY}/{spec['filename']}",
        "bytes": spec["bytes"],
        "rows": spec["rows"],
        "sha256": spec["sha256"],
        "mode": "0600",
        "line_count_method": LINE_COUNT_METHOD,
    }


def validate_registry(value: Mapping[str, Any]) -> dict[str, Any]:
    """Validate the exact, deliberately narrow recovery enrollment."""

    registry = _exact(
        dict(value) if isinstance(value, Mapping) else value,
        _REGISTRY_FIELDS,
        "retention recovery registry",
    )
    if (
        registry["schema"] != REGISTRY_SCHEMA
        or registry["status"] != REGISTRY_STATUS
        or registry["recorded_date"] != "2026-07-20"
        or registry["builder_command"] != BUILDER_COMMAND
        or registry["classification"] != "operator-recovered"
        or registry["source_provenance_observations"] != SOURCE_PROVENANCE_OBSERVATIONS
        or registry["historical_evidence"] != HISTORICAL_EVIDENCE
        or registry["boundary"] != BOUNDARY
        or registry["claims"] != CLAIMS
        or registry["next_step"]
        != "separate-reviewed-downstream-retention-gate-connection"
    ):
        raise ValueError("retention recovery fixed boundary drifted")

    artifacts = registry["artifacts"]
    if type(artifacts) is not list or len(artifacts) != len(_ROLE_SPECS):
        raise ValueError("retention recovery requires exactly two artifacts")
    validated_artifacts = []
    for artifact, spec in zip(artifacts, _ROLE_SPECS, strict=True):
        artifact = _exact(artifact, _ARTIFACT_FIELDS, "recovered artifact")
        if artifact != _expected_artifact(spec):
            raise ValueError(f"recovered artifact {spec['role']} identity drifted")
        if _SHA256_RE.fullmatch(artifact["sha256"]) is None:
            raise ValueError("recovered artifact SHA-256 is invalid")
        validated_artifacts.append(copy.deepcopy(artifact))
    if (
        len({item["path"] for item in validated_artifacts}) != 2
        or len({item["sha256"] for item in validated_artifacts}) != 2
    ):
        raise ValueError("recovered artifact identities must be distinct")

    validated = copy.deepcopy(registry)
    validated["artifacts"] = validated_artifacts
    return validated


def load_registry(*, repo_root: str | Path | None = None) -> dict[str, Any]:
    root = Path(repo_root or Path(__file__).resolve().parent.parent).resolve()
    path = root / REGISTRY_RELATIVE_PATH
    try:
        raw = path.read_bytes()
        parsed = json.loads(raw)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("retention recovery registry cannot be loaded") from error
    if type(parsed) is not dict or canonical_json_bytes(parsed) != raw:
        raise ValueError("retention recovery registry is not canonical")
    return validate_registry(parsed)


def registry_identity(*, repo_root: str | Path | None = None) -> dict[str, Any]:
    root = Path(repo_root or Path(__file__).resolve().parent.parent).resolve()
    raw = (root / REGISTRY_RELATIVE_PATH).read_bytes()
    load_registry(repo_root=root)
    return {
        "path": REGISTRY_RELATIVE_PATH,
        "schema": REGISTRY_SCHEMA,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }
