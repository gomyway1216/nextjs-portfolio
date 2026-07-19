"""Append-only parent accounting for the future fresh Floodgate QAT run.

The immutable v1 preregistration counted 24,000 selected input parents.  A
forced parent is nevertheless a completed and accountable teacher input even
though it emits no sibling-training group.  V2 therefore keeps three separate
quantities:

    input_parents = forced_parents_skipped + emitted_parent_groups

Only ``emitted_parent_groups`` is projected into ``model_training_parents``.
This module is deliberately stdlib-only.  Its synthetic test core can
materialize an in-memory proposal only from exact input, per-parent completion,
and train byte streams whose identities are supplied separately.  The
production wrapper stays fail-closed until a finalizer-authenticated
per-parent completion identity is enrolled.  It cannot run a teacher, read a
holdout, dispatch Torch, enroll an artifact, mutate a registry, or grant
authority.
"""

from __future__ import annotations

from collections.abc import Mapping
import copy
import hashlib
import json
import math
from pathlib import Path
import re
from typing import Any

from fresh_qat_protocol import (
    FRESH_QAT_REQUIRED_SELECTION,
    FRESH_QAT_REQUIRED_TRAINING,
    FRESH_QAT_RUN_ROOT,
    FRESH_QAT_SLOT_ORDER,
    build_fresh_qat_training_contract,
)


FRESH_QAT_PARENT_ACCOUNTING_AMENDMENT_SCHEMA = (
    "shogi-floodgate-fresh-qat-parent-accounting-amendment-v2"
)
FRESH_QAT_PARENT_ACCOUNTING_PROPOSAL_SCHEMA = (
    "shogi-floodgate-fresh-qat-parent-accounting-proposal-v2"
)
FRESH_QAT_PARENT_COMPLETION_RECORD_SCHEMA = (
    "shogi-floodgate-fresh-qat-parent-completion-v2"
)
FRESH_QAT_PARENT_COMPLETION_FORMAT = (
    "shogi-floodgate-fresh-qat-parent-completion-jsonl-v2"
)
FRESH_QAT_EXECUTION_PLAN_SCHEMA_V2 = (
    "shogi-floodgate-fresh-qat-execution-plan-v2"
)
FRESH_QAT_PLAN_REGISTRY_SCHEMA_V2 = (
    "shogi-floodgate-fresh-qat-plan-registry-v2"
)
FRESH_QAT_PARENT_ACCOUNTING_AMENDMENT_PATH = (
    "ml/protocols/"
    "floodgate-q1-2026-fresh-qat-parent-accounting-v2-amendment.json"
)
FRESH_QAT_PARENT_ACCOUNTING_AMENDMENT_BYTES = 7_571
FRESH_QAT_PARENT_ACCOUNTING_AMENDMENT_SHA256 = (
    "983e89b8e611dbcd42c70c51a4109f879dfffe40fd8b560a99c798b826f86bef"
)
FRESH_QAT_PARENT_ACCOUNTING_AMENDMENT_CANONICAL_SHA256 = (
    "7150887dcde98eaf0b83f9eb5155df10b119277143fbb6ea853a05bd15e51834"
)
FRESH_QAT_PLAN_REGISTRY_PATH_V2 = (
    "ml/protocols/floodgate-q1-2026-fresh-qat-plan-registry-v2.json"
)
FRESH_QAT_PLAN_REGISTRY_BYTES_V2 = 3_501
FRESH_QAT_PLAN_REGISTRY_SHA256_V2 = (
    "97bd6c1839288f505d31e62904ba095a0ccd11a5dc1f5a58d37f21bea11e214c"
)
FRESH_QAT_PLAN_REGISTRY_CANONICAL_SHA256_V2 = (
    "8e5a1ffb039da21484d51502afb31f5dd3dfd4a95083a4c36fed49078d4384c9"
)

FRESH_QAT_INPUT_PARENTS = 24_000
FRESH_QAT_INPUT_GAMES = 1_000
EMPTY_IDENTIFIER_SET_SHA256 = hashlib.sha256(b"").hexdigest()
CANONICAL_SEMANTIC_ID_RE = re.compile(r"^sha256:[0-9a-f]{64}$")

FRESH_QAT_TRAINING_CONTRACT_CANONICAL_SHA256 = (
    "b0bf9dbd2342b8be325fae4d195e9bdd909a702361d229293f30849f1348d8ac"
)
FRESH_QAT_SLOT_REGISTRY_CANONICAL_SHA256 = (
    "aab83502378adca6557e4ba0d9da4cf545061eed8d15b1aeae0b99b8a41ffeed"
)
FRESH_QAT_SELECTION_CONTRACT_CANONICAL_SHA256 = (
    "9aeade0c64556bd8c3b59bff7b1b1cedb386d2226a4ce60fc7b59677d305352c"
)

_PREREGISTERED_PLAN_IDENTITY = {
    "path": "ml/protocols/floodgate-q1-2026-fresh-sibling-plan.json",
    "bytes": 10_890,
    "sha256": "ad9e6d7f2cc7ae2d03913c405d81755d24a0b9f02b84c384b4d641c6c2b7a0af",
    "schema": "shogi-floodgate-fresh-sibling-plan-v1",
}
_ROLE_BUNDLE_RESULT_IDENTITY = {
    "path": "ml/protocols/floodgate-q1-2026-role-bundle-result.json",
    "bytes": 14_735,
    "sha256": "56009b1abaf83a75ae66ea8abf62e1f9f7214ad1aa687f7808972679e4af3ccf",
    "schema": "shogi-floodgate-role-bundle-result-v1",
}
_V1_PLAN_REGISTRY_IDENTITY = {
    "path": "ml/protocols/floodgate-q1-2026-fresh-qat-plan-registry.json",
    "bytes": 409,
    "sha256": "9a1af8144cda4a222e300676c1475d69314c5ac32fe6a11a58adf7acfe5d9a00",
    "schema": "shogi-floodgate-fresh-qat-plan-registry-v1",
}
_V1_SELECTION_REGISTRY_IDENTITY = {
    "path": (
        "ml/protocols/"
        "floodgate-q1-2026-fresh-qat-selection-preflight-registry.json"
    ),
    "bytes": 2_294,
    "sha256": "7593d5675884431e5fbcc71c7925b7f094c3ab48f6de9f74850b195f57aedd39",
    "schema": "shogi-floodgate-fresh-qat-selection-preflight-registry-v1",
}
_AMENDMENT_IDENTITY = {
    "path": FRESH_QAT_PARENT_ACCOUNTING_AMENDMENT_PATH,
    "bytes": FRESH_QAT_PARENT_ACCOUNTING_AMENDMENT_BYTES,
    "sha256": FRESH_QAT_PARENT_ACCOUNTING_AMENDMENT_SHA256,
    "schema": FRESH_QAT_PARENT_ACCOUNTING_AMENDMENT_SCHEMA,
}
_HISTORICAL_EVIDENCE_IDENTITIES = {
    "plan_binding_evidence": {
        "path": "docs/data/floodgate-fresh-qat-plan-binding-2026-07-17.json",
        "bytes": 2_248,
        "sha256": (
            "5586e46d8a12ee759a2658ca41eb9178a96f313625a72bba57f7ff74b5f1589b"
        ),
    },
    "selection_preflight_evidence": {
        "path": (
            "docs/data/floodgate-fresh-qat-selection-preflight-2026-07-17.json"
        ),
        "bytes": 5_062,
        "sha256": (
            "a8be7cf0f43c816960265263ec7a570fe7c4ad8924593e1379d07b8c8f345cef"
        ),
    },
    "plan_binding_article_ja": {
        "path": "docs/blog-shogi-floodgate-fresh-qat-plan-binding.md",
        "bytes": 6_089,
        "sha256": (
            "b55d56164c3f2635bf7ee3d69c7d1f4b9103d83e142f79b9ac6b0ef7ff79eec8"
        ),
    },
    "plan_binding_article_en": {
        "path": "docs/blog-shogi-floodgate-fresh-qat-plan-binding.en.md",
        "bytes": 5_660,
        "sha256": (
            "3efab2074163a9cf99bd3595af956e1b439de7ea9578fc3a929df6bedc0266e8"
        ),
    },
    "selection_preflight_article_ja": {
        "path": "docs/blog-shogi-floodgate-fresh-qat-selection-preflight.md",
        "bytes": 10_184,
        "sha256": (
            "5fd8ccc806e2a5946062536196efda3bc80b0af7a198ae3bafe23bbfefb28c71"
        ),
    },
    "selection_preflight_article_en": {
        "path": "docs/blog-shogi-floodgate-fresh-qat-selection-preflight.en.md",
        "bytes": 9_720,
        "sha256": (
            "862b5e3b2ff6c5661fb73e7b9389c58673c0195fc67cf256fcf150074033d22e"
        ),
    },
}

PRODUCTION_INPUT_TRAINING_BINDING = {
    "path": "training.raw.jsonl",
    "format": "shogi-floodgate-label-free-raw-parent-jsonl-v1",
    "bytes": 15_369_952,
    "sha256": "c9ee90da69135ead5dbb60cbab6eaa82ad018db791132dd4ec122d6088c37b62",
    "parents": FRESH_QAT_INPUT_PARENTS,
    "games": FRESH_QAT_INPUT_GAMES,
    "game_ids_sha256": (
        "97609ce53a9dee1fffd8faadcf408d79bc3e0724c17d52d8a2ac095bc607e3d7"
    ),
    "parent_ids_sha256": (
        "6681bd08bb282be04f47bf3157ea07fbbe2bc6a6864a100ce65902dc9cc3f08f"
    ),
    "position_ids_count": FRESH_QAT_INPUT_PARENTS,
    "position_ids_sha256": (
        "a97788b608a6687c078b7fbe2172a5c4068c57a42ed322c3997692f697e73b5c"
    ),
}

_RAW_INPUT_FIELDS = frozenset(
    {
        "schema_version",
        "source",
        "source_url",
        "game_sha256",
        "game_id",
        "parent_id",
        "position_id",
        "parent_sfen",
        "ply",
        "played_move",
    }
)
_COMPLETION_FIELDS = frozenset(
    {
        "schema",
        "game_id",
        "parent_id",
        "position_id",
        "completed_parent_sha256",
        "forced_parent_skipped",
        "train_group_records",
        "train_group_sha256",
    }
)
_TRAIN_ROW_FIELDS = frozenset(
    {
        "schema",
        "schema_version",
        "game_id",
        "parent_id",
        "position_id",
        "parent_sfen",
        "parent_ply",
        "ply",
        "move",
        "sources",
        "sfen",
        "child_position_id",
        "cp",
        "child_sfen",
        "teacher_child_cp",
        "teacher_parent_cp",
        "teacher_rank",
        "teacher_score_kind",
        "split",
    }
)
_TRAIN_MATE_FIELDS = frozenset({"teacher_mate", "teacher_mate_sign"})
_SIBLING_SOURCE_PRIORITY = {"played": 0, "teacher": 1}
_MAX_NON_MATE_CP = 900_000
_MATE_SCORE_CP = 1_000_000
_MAX_MATE_DISTANCE = _MATE_SCORE_CP - _MAX_NON_MATE_CP - 1
_AUTHORITY_FIELDS = frozenset(
    {
        "teacher_execution_authorized",
        "artifact_enrollment_authorized",
        "training_dispatch_authorized",
        "selection_reader_authorized",
        "holdout_reader_authorized",
        "promotion_authorized",
        "production_weight_write_authorized",
    }
)
_NONCLAIM_FIELDS = frozenset(
    {
        "teacher_origin_authenticated_by_this_materializer",
        "completion_origin_authenticated_by_this_materializer",
        "artifact_enrolled",
        "training_executed",
        "candidate_selected",
        "strength_improved",
        "high_dan_calibrated",
        "live_weights_changed",
    }
)
_PROPOSAL_FIELDS = frozenset(
    {
        "schema",
        "status",
        "materialization_boundary",
        "protocol_amendment_sha256",
        "execution_plan_schema",
        "upstream",
        "parent_accounting",
        "model_training",
        "training_contracts",
        "unchanged_contracts",
        "authority",
        "nonclaims",
    }
)


class FreshQATNoTrainableParentGroups(ValueError):
    """All inputs were accountable, but none emitted a trainable group."""

    def __init__(self, accounting_receipt: Mapping[str, Any]):
        super().__init__(
            "fresh QAT parent accounting STOP: no-trainable-parent-groups"
        )
        self.accounting_receipt = copy.deepcopy(dict(accounting_receipt))


def _reject_nonfinite_constant(value: str) -> None:
    raise ValueError(f"non-finite JSON value is forbidden: {value}")


def _strict_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key is forbidden: {key}")
        result[key] = value
    return result


def _strict_json_loads(raw: str, label: str) -> Any:
    try:
        value = json.loads(
            raw,
            object_pairs_hook=_strict_object,
            parse_constant=_reject_nonfinite_constant,
        )
    except (UnicodeError, json.JSONDecodeError, ValueError) as error:
        raise ValueError(f"{label} is not strict JSON: {error}") from error
    _require_plain_json(value, label)
    return value


def _require_plain_json(value: Any, label: str) -> None:
    if value is None or type(value) in (str, int, bool):
        return
    if type(value) is float:
        if not math.isfinite(value):
            raise ValueError(f"{label} contains a non-finite float")
        return
    if type(value) is list:
        for index, item in enumerate(value):
            _require_plain_json(item, f"{label}[{index}]")
        return
    if type(value) is dict:
        for key, item in value.items():
            if type(key) is not str:
                raise ValueError(f"{label} contains a non-string key")
            _require_plain_json(item, f"{label}.{key}")
        return
    raise ValueError(f"{label} contains a non-JSON type")


def _canonical_bytes(value: Any) -> bytes:
    _require_plain_json(value, "canonical value")
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def _canonical_sha256(value: Any) -> str:
    return hashlib.sha256(_canonical_bytes(value)).hexdigest()


def _typed_equal(value: Any, expected: Any) -> bool:
    if type(value) is not type(expected):
        return False
    if type(expected) is dict:
        return set(value) == set(expected) and all(
            _typed_equal(value[key], expected[key]) for key in expected
        )
    if type(expected) is list:
        return len(value) == len(expected) and all(
            _typed_equal(item, expected_item)
            for item, expected_item in zip(value, expected)
        )
    return value == expected


def _identifier_digest(values: set[str] | list[str] | tuple[str, ...]) -> str:
    return hashlib.sha256("\n".join(sorted(set(values))).encode("ascii")).hexdigest()


def _require_semantic_id(value: Any, label: str) -> str:
    if type(value) is not str or CANONICAL_SEMANTIC_ID_RE.fullmatch(value) is None:
        raise ValueError(f"{label} is not a canonical sha256 semantic ID")
    return value


def _require_sha256(value: Any, label: str, *, allow_empty_digest: bool = True) -> str:
    if (
        type(value) is not str
        or len(value) != 64
        or any(character not in "0123456789abcdef" for character in value)
    ):
        raise ValueError(f"{label} is not a lowercase SHA-256")
    if not allow_empty_digest and value == EMPTY_IDENTIFIER_SET_SHA256:
        raise ValueError(f"{label} may not be the empty-set SHA-256")
    return value


def _exact_fields(value: Any, fields: frozenset[str], label: str) -> dict[str, Any]:
    if (
        type(value) is not dict
        or any(type(key) is not str for key in value)
        or set(value) != set(fields)
    ):
        raise ValueError(f"{label} fields are not exact")
    return value


def _read_pinned_bytes(root: Path, identity: Mapping[str, Any], label: str) -> bytes:
    raw = (root / identity["path"]).read_bytes()
    if len(raw) != identity["bytes"]:
        raise ValueError(f"{label} byte length differs from the amendment")
    if hashlib.sha256(raw).hexdigest() != identity["sha256"]:
        raise ValueError(f"{label} SHA-256 differs from the amendment")
    return raw


def _read_pinned_json(root: Path, identity: Mapping[str, Any], label: str) -> dict:
    raw = _read_pinned_bytes(root, identity, label)
    payload = _strict_json_loads(raw.decode("utf-8"), label)
    if type(payload) is not dict:
        raise ValueError(f"{label} root is not an object")
    if payload.get("schema") != identity["schema"]:
        raise ValueError(f"{label} schema differs from the amendment")
    return payload


def _fixed_slots() -> list[dict[str, Any]]:
    return [
        {
            "id": f"floodgate-fresh-int16-aware-seed-{seed}",
            "seed": seed,
            "output": f"{FRESH_QAT_RUN_ROOT}/seed-{seed}",
        }
        for seed in FRESH_QAT_SLOT_ORDER
    ]


def _verify_unchanged_contract_digests() -> None:
    if (
        _canonical_sha256(FRESH_QAT_REQUIRED_TRAINING)
        != FRESH_QAT_TRAINING_CONTRACT_CANONICAL_SHA256
    ):
        raise ValueError("fresh QAT fixed training contract drifted")
    if (
        _canonical_sha256(_fixed_slots())
        != FRESH_QAT_SLOT_REGISTRY_CANONICAL_SHA256
    ):
        raise ValueError("fresh QAT fixed slot registry drifted")
    if (
        _canonical_sha256(FRESH_QAT_REQUIRED_SELECTION)
        != FRESH_QAT_SELECTION_CONTRACT_CANONICAL_SHA256
    ):
        raise ValueError("fresh QAT fixed selection contract drifted")


def validate_fresh_qat_parent_accounting_amendment_data(
    amendment: Mapping[str, Any],
) -> Mapping[str, Any]:
    """Validate the exact pre-result amendment as a plain JSON value."""

    if type(amendment) is not dict:
        raise ValueError("fresh QAT parent-accounting amendment must be an object")
    _require_plain_json(amendment, "fresh QAT parent-accounting amendment")
    if (
        amendment.get("schema")
        != FRESH_QAT_PARENT_ACCOUNTING_AMENDMENT_SCHEMA
    ):
        raise ValueError("fresh QAT parent-accounting amendment schema differs")
    if (
        _canonical_sha256(amendment)
        != FRESH_QAT_PARENT_ACCOUNTING_AMENDMENT_CANONICAL_SHA256
    ):
        raise ValueError(
            "fresh QAT parent-accounting amendment differs from preregistration"
        )
    return amendment


def validate_closed_fresh_qat_plan_registry_v2_data(
    registry: Mapping[str, Any],
) -> Mapping[str, Any]:
    """Validate the exact all-null, all-false v2 registry value."""

    if type(registry) is not dict:
        raise ValueError("fresh QAT v2 registry must be an object")
    _require_plain_json(registry, "fresh QAT v2 registry")
    if registry.get("schema") != FRESH_QAT_PLAN_REGISTRY_SCHEMA_V2:
        raise ValueError("fresh QAT v2 registry schema differs")
    if (
        _canonical_sha256(registry)
        != FRESH_QAT_PLAN_REGISTRY_CANONICAL_SHA256_V2
    ):
        raise ValueError("fresh QAT v2 registry differs from preregistration")
    return registry


def validate_fresh_qat_parent_accounting_amendment_chain(
    repo_root: str | Path,
) -> Mapping[str, Any]:
    """Verify the immutable plan, role result, v1 records, and old evidence."""

    root = Path(repo_root)
    amendment = _read_pinned_json(
        root,
        _AMENDMENT_IDENTITY,
        "fresh QAT parent-accounting amendment",
    )
    validate_fresh_qat_parent_accounting_amendment_data(amendment)
    _read_pinned_json(root, _PREREGISTERED_PLAN_IDENTITY, "fresh sibling plan")
    role_result = _read_pinned_json(
        root,
        _ROLE_BUNDLE_RESULT_IDENTITY,
        "fresh role-bundle result",
    )
    training_input = role_result["manifest"]["value"]["roles"]["training"][
        "raw_parents"
    ]
    expected_role_training = {
        "path": PRODUCTION_INPUT_TRAINING_BINDING["path"],
        "format": PRODUCTION_INPUT_TRAINING_BINDING["format"],
        "bytes": PRODUCTION_INPUT_TRAINING_BINDING["bytes"],
        "sha256": PRODUCTION_INPUT_TRAINING_BINDING["sha256"],
        "records": PRODUCTION_INPUT_TRAINING_BINDING["parents"],
        "games": PRODUCTION_INPUT_TRAINING_BINDING["games"],
        "game_ids_sha256": PRODUCTION_INPUT_TRAINING_BINDING[
            "game_ids_sha256"
        ],
        "parent_ids_sha256": PRODUCTION_INPUT_TRAINING_BINDING[
            "parent_ids_sha256"
        ],
        "position_ids_count": PRODUCTION_INPUT_TRAINING_BINDING[
            "position_ids_count"
        ],
        "position_ids_sha256": PRODUCTION_INPUT_TRAINING_BINDING[
            "position_ids_sha256"
        ],
    }
    if type(training_input) is not dict or training_input != expected_role_training:
        raise ValueError("fresh role-bundle training input identity drifted")

    v1_registry = _read_pinned_json(
        root,
        _V1_PLAN_REGISTRY_IDENTITY,
        "fresh QAT v1 plan registry",
    )
    if (
        v1_registry.get("status")
        != "awaiting-exact-tracked-execution-plan-and-artifact-identities"
        or v1_registry.get("artifact_identities_registered") is not False
        or v1_registry.get("training_dispatch_ready") is not False
        or v1_registry.get("plan", {}).get("bytes") is not None
        or v1_registry.get("plan", {}).get("sha256") is not None
    ):
        raise ValueError("fresh QAT v1 plan registry is no longer closed")

    v1_selection = _read_pinned_json(
        root,
        _V1_SELECTION_REGISTRY_IDENTITY,
        "fresh QAT v1 selection registry",
    )
    if (
        v1_selection.get("artifact_identities_registered") is not False
        or v1_selection.get("selection_preflight_ready") is not False
        or v1_selection.get("execution_plan", {}).get("bytes") is not None
        or v1_selection.get("execution_plan", {}).get("sha256") is not None
    ):
        raise ValueError("fresh QAT v1 selection registry is no longer closed")
    for run in v1_selection.get("runs", []):
        for field in ("result", "checkpoint"):
            if (
                run.get(field, {}).get("bytes") is not None
                or run.get(field, {}).get("sha256") is not None
            ):
                raise ValueError(
                    "fresh QAT v1 selection registry contains an artifact identity"
                )

    for name, identity in _HISTORICAL_EVIDENCE_IDENTITIES.items():
        _read_pinned_bytes(root, identity, f"historical fresh QAT record {name}")
    _verify_unchanged_contract_digests()
    return amendment


def validate_closed_fresh_qat_plan_registry_v2(
    path: str | Path,
) -> Mapping[str, Any]:
    """Validate the on-disk v2 registry and its entire append-only chain."""

    registry_path = Path(path).resolve()
    raw = registry_path.read_bytes()
    if len(raw) != FRESH_QAT_PLAN_REGISTRY_BYTES_V2:
        raise ValueError("fresh QAT v2 registry byte length differs")
    if hashlib.sha256(raw).hexdigest() != FRESH_QAT_PLAN_REGISTRY_SHA256_V2:
        raise ValueError("fresh QAT v2 registry SHA-256 differs")
    registry = _strict_json_loads(raw.decode("utf-8"), "fresh QAT v2 registry")
    validate_closed_fresh_qat_plan_registry_v2_data(registry)
    validate_fresh_qat_parent_accounting_amendment_chain(
        registry_path.parents[2]
    )
    return registry


def _normalize_input_binding(
    expected_input_binding: Mapping[str, Any],
) -> dict[str, Any]:
    expected_fields = frozenset(
        {
            "path",
            "format",
            "bytes",
            "sha256",
            "parents",
            "games",
            "game_ids_sha256",
            "parent_ids_sha256",
            "position_ids_count",
            "position_ids_sha256",
        }
    )
    binding = _exact_fields(
        expected_input_binding,
        expected_fields,
        "fresh QAT expected input binding",
    )
    for field in ("path", "format"):
        if type(binding[field]) is not str or not binding[field]:
            raise ValueError(f"fresh QAT input binding {field} is invalid")
    for field in ("bytes", "parents", "games", "position_ids_count"):
        if type(binding[field]) is not int or binding[field] < 1:
            raise ValueError(f"fresh QAT input binding {field} is invalid")
    for field in (
        "sha256",
        "game_ids_sha256",
        "parent_ids_sha256",
        "position_ids_sha256",
    ):
        _require_sha256(binding[field], f"fresh QAT input binding {field}")
    return copy.deepcopy(binding)


def _normalize_completion_binding(
    expected_completion_binding: Mapping[str, Any],
) -> dict[str, Any]:
    expected_fields = frozenset(
        {
            "path",
            "format",
            "bytes",
            "sha256",
            "records",
            "forced_parents_skipped",
            "emitted_parent_groups",
            "parent_ids_sha256",
            "forced_parent_ids_sha256",
            "emitted_parent_ids_sha256",
        }
    )
    binding = _exact_fields(
        expected_completion_binding,
        expected_fields,
        "fresh QAT expected completion binding",
    )
    if type(binding["path"]) is not str or not binding["path"]:
        raise ValueError("fresh QAT completion binding path is invalid")
    if binding["format"] != FRESH_QAT_PARENT_COMPLETION_FORMAT:
        raise ValueError("fresh QAT completion binding format is invalid")
    for field in (
        "bytes",
        "records",
        "forced_parents_skipped",
        "emitted_parent_groups",
    ):
        if type(binding[field]) is not int or binding[field] < 0:
            raise ValueError(
                f"fresh QAT completion binding {field} is invalid"
            )
    if binding["bytes"] < 1 or binding["records"] < 1:
        raise ValueError("fresh QAT completion binding is empty")
    if (
        binding["forced_parents_skipped"]
        + binding["emitted_parent_groups"]
        != binding["records"]
    ):
        raise ValueError("fresh QAT completion binding equation is invalid")
    for field in (
        "sha256",
        "parent_ids_sha256",
        "forced_parent_ids_sha256",
        "emitted_parent_ids_sha256",
    ):
        _require_sha256(
            binding[field], f"fresh QAT completion binding {field}"
        )
    return copy.deepcopy(binding)


def _required_text(value: Any, label: str) -> str:
    if (
        type(value) is not str
        or not value
        or value != value.strip()
        or "\0" in value
    ):
        raise ValueError(f"{label} must be non-empty canonical text")
    return value


def _validate_sfen_syntax(parts: list[str], label: str) -> None:
    board, turn, hand, _move_number = parts
    if turn not in ("b", "w"):
        raise ValueError(f"{label} turn is invalid")
    ranks = board.split("/")
    if len(ranks) != 9:
        raise ValueError(f"{label} board must contain nine ranks")
    pieces = set("PLNSGBRKplnsgbrk")
    promotable = set("PLNSBRplnsbr")
    for rank_number, rank in enumerate(ranks, 1):
        squares = 0
        offset = 0
        while offset < len(rank):
            token = rank[offset]
            if token in "123456789":
                if (
                    offset + 1 < len(rank)
                    and rank[offset + 1] in "0123456789"
                ):
                    raise ValueError(
                        f"{label} rank {rank_number} has adjacent empty runs"
                    )
                squares += int(token)
                offset += 1
                continue
            if token == "+":
                offset += 1
                if offset >= len(rank) or rank[offset] not in promotable:
                    raise ValueError(
                        f"{label} rank {rank_number} promotion is invalid"
                    )
                squares += 1
                offset += 1
                continue
            if token not in pieces:
                raise ValueError(
                    f"{label} rank {rank_number} contains an invalid piece"
                )
            squares += 1
            offset += 1
        if squares != 9:
            raise ValueError(
                f"{label} rank {rank_number} expands to {squares} squares"
            )
    if hand == "-":
        return
    hand_order = {
        piece: index for index, piece in enumerate("RBGSNLPrbgsnlp")
    }
    seen: set[str] = set()
    previous = -1
    offset = 0
    while offset < len(hand):
        count_start = offset
        while offset < len(hand) and hand[offset] in "0123456789":
            offset += 1
        count_text = hand[count_start:offset]
        if count_text and (
            count_text.startswith("0") or int(count_text) < 2
        ):
            raise ValueError(f"{label} hand count is not canonical")
        if offset >= len(hand) or hand[offset] not in hand_order:
            raise ValueError(f"{label} hand grammar is invalid")
        piece = hand[offset]
        if piece in seen or hand_order[piece] <= previous:
            raise ValueError(f"{label} hand order is not canonical")
        seen.add(piece)
        previous = hand_order[piece]
        offset += 1


def _normalized_sfen(value: Any, label: str) -> str:
    text = _required_text(value, label)
    parts = text.split()
    if (
        len(parts) != 4
        or " ".join(parts) != text
        or not all(
            character in "0123456789"
            for character in parts[3]
        )
        or int(parts[3]) <= 0
    ):
        raise ValueError(f"{label} is not a canonical four-field SFEN")
    _validate_sfen_syntax(parts, label)
    return text


def _position_id_from_sfen(sfen: str) -> str:
    canonical = " ".join(sfen.split()[:3])
    return "sha256:" + hashlib.sha256(
        f"sfen-v1\0{canonical}".encode("utf-8")
    ).hexdigest()


def _parent_id_for_game_ply(game_id: str, ply: int) -> str:
    return "sha256:" + hashlib.sha256(
        f"parent-occurrence-v1\0{game_id}\0{ply}".encode("utf-8")
    ).hexdigest()


def _game_id_for_source_url(source_url: str) -> str:
    return "sha256:" + hashlib.sha256(
        f"floodgate-q1-2026-game-id-v1\0{source_url}".encode("utf-8")
    ).hexdigest()


def _tuple_sequence_digest(
    order: list[str],
    metadata: Mapping[str, Mapping[str, Any]],
) -> str:
    digest = hashlib.sha256()
    for parent_id in order:
        parent = metadata[parent_id]
        digest.update(parent["game_id"].encode("ascii"))
        digest.update(b"\0")
        digest.update(parent_id.encode("ascii"))
        digest.update(b"\0")
        digest.update(parent["position_id"].encode("ascii"))
        digest.update(b"\n")
    return digest.hexdigest()


def _strict_jsonl_lines(
    raw: Any,
    label: str,
    *,
    allow_empty: bool,
) -> list[tuple[bytes, str]]:
    if type(raw) is not bytes:
        raise ValueError(f"{label} must be exact bytes")
    if not raw:
        if allow_empty:
            return []
        raise ValueError(f"{label} may not be empty")
    if raw.startswith(b"\xef\xbb\xbf"):
        raise ValueError(f"{label} contains a UTF-8 BOM")
    if b"\0" in raw or b"\r" in raw:
        raise ValueError(f"{label} contains forbidden NUL or CR bytes")
    if not raw.endswith(b"\n") or raw.endswith(b"\n\n"):
        raise ValueError(f"{label} requires exactly one final LF")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ValueError(f"{label} is not fatal-valid UTF-8") from error
    raw_lines = raw[:-1].split(b"\n")
    text_lines = text[:-1].split("\n")
    if len(raw_lines) != len(text_lines) or any(
        not line for line in raw_lines
    ):
        raise ValueError(f"{label} contains a blank line")
    return list(zip(raw_lines, text_lines))


def _scan_input_bytes(
    input_raw: Any,
    expected_input_binding: Mapping[str, Any],
) -> tuple[list[str], dict[str, dict[str, Any]], dict[str, Any]]:
    if type(input_raw) is not bytes:
        raise ValueError("fresh QAT input content must be exact bytes")
    if (
        len(input_raw) != expected_input_binding["bytes"]
        or hashlib.sha256(input_raw).hexdigest()
        != expected_input_binding["sha256"]
    ):
        raise ValueError(
            "fresh QAT input raw bytes do not match the role binding"
        )
    lines = _strict_jsonl_lines(
        input_raw, "fresh QAT input content", allow_empty=False
    )
    if len(lines) != expected_input_binding["parents"]:
        raise ValueError("fresh QAT input parent count differs from its binding")

    order: list[str] = []
    metadata: dict[str, dict[str, Any]] = {}
    games: set[str] = set()
    positions: set[str] = set()
    game_sources: dict[str, tuple[str, str]] = {}
    previous_parent: str | None = None
    for index, (raw_line, text) in enumerate(lines, 1):
        row = _strict_json_loads(text, f"fresh QAT input line {index}")
        row = _exact_fields(
            row, _RAW_INPUT_FIELDS, f"fresh QAT input line {index}"
        )
        if _canonical_bytes(row) != raw_line:
            raise ValueError(
                f"fresh QAT input line {index} is not canonical JSON"
            )
        if row["schema_version"] != 1 or type(row["schema_version"]) is not int:
            raise ValueError(
                f"fresh QAT input line {index} schema version is invalid"
            )
        if row["source"] != "floodgate" or type(row["source"]) is not str:
            raise ValueError(
                f"fresh QAT input line {index} source is invalid"
            )
        source_url = _required_text(
            row["source_url"], f"fresh QAT input line {index}.source_url"
        )
        game_sha256 = _require_sha256(
            row["game_sha256"],
            f"fresh QAT input line {index}.game_sha256",
        )
        game_id = _require_semantic_id(
            row["game_id"], f"fresh QAT input line {index}.game_id"
        )
        parent_id = _require_semantic_id(
            row["parent_id"], f"fresh QAT input line {index}.parent_id"
        )
        position_id = _require_semantic_id(
            row["position_id"], f"fresh QAT input line {index}.position_id"
        )
        parent_sfen = _normalized_sfen(
            row["parent_sfen"],
            f"fresh QAT input line {index}.parent_sfen",
        )
        ply = row["ply"]
        if type(ply) is not int or ply < 0:
            raise ValueError(f"fresh QAT input line {index}.ply is invalid")
        _required_text(
            row["played_move"],
            f"fresh QAT input line {index}.played_move",
        )
        if (
            game_id != _game_id_for_source_url(source_url)
            or parent_id != _parent_id_for_game_ply(game_id, ply)
            or position_id != _position_id_from_sfen(parent_sfen)
            or int(parent_sfen.split()[3]) != ply + 1
        ):
            raise ValueError(
                f"fresh QAT input line {index} semantic tuple is invalid"
            )
        if previous_parent is not None and previous_parent >= parent_id:
            raise ValueError(
                "fresh QAT input parent order is not strict byte order"
            )
        previous_parent = parent_id
        if parent_id in metadata:
            raise ValueError("fresh QAT input contains a duplicate parent ID")
        if position_id in positions:
            raise ValueError(
                "fresh QAT input contains a duplicate semantic position"
            )
        source_identity = (source_url, game_sha256)
        if (
            game_id in game_sources
            and game_sources[game_id] != source_identity
        ):
            raise ValueError(
                "fresh QAT input game source identity is inconsistent"
            )
        game_sources[game_id] = source_identity
        metadata[parent_id] = {
            "game_id": game_id,
            "position_id": position_id,
            "parent_sfen": parent_sfen,
            "ply": ply,
        }
        order.append(parent_id)
        games.add(game_id)
        positions.add(position_id)

    summary = {
        "parents": len(order),
        "games": len(games),
        "game_ids_sha256": _identifier_digest(games),
        "parent_ids_sha256": _identifier_digest(order),
        "position_ids_count": len(positions),
        "position_ids_sha256": _identifier_digest(positions),
        "parent_tuple_sequence_sha256": _tuple_sequence_digest(
            order, metadata
        ),
    }
    for field in (
        "parents",
        "games",
        "game_ids_sha256",
        "parent_ids_sha256",
        "position_ids_count",
        "position_ids_sha256",
    ):
        if summary[field] != expected_input_binding[field]:
            raise ValueError(
                "fresh QAT input aggregates differ from the role binding"
            )
    return order, metadata, summary


def _scan_completion_bytes(
    completion_raw: Any,
    expected_completion_binding: Mapping[str, Any],
    input_order: list[str],
    input_metadata: Mapping[str, Mapping[str, Any]],
) -> tuple[dict[str, Any], list[str], list[str], dict[str, dict[str, Any]]]:
    if type(completion_raw) is not bytes:
        raise ValueError("fresh QAT completion evidence must be exact bytes")
    if (
        len(completion_raw) != expected_completion_binding["bytes"]
        or hashlib.sha256(completion_raw).hexdigest()
        != expected_completion_binding["sha256"]
    ):
        raise ValueError(
            "fresh QAT completion bytes do not match the authenticated identity"
        )
    lines = _strict_jsonl_lines(
        completion_raw,
        "fresh QAT completion evidence",
        allow_empty=False,
    )
    if len(lines) != len(input_order):
        raise ValueError(
            "fresh QAT completion evidence does not cover every input parent"
        )
    forced_order: list[str] = []
    emitted_order: list[str] = []
    records: dict[str, dict[str, Any]] = {}
    for index, ((raw_line, text), expected_parent_id) in enumerate(
        zip(lines, input_order), 1
    ):
        row = _strict_json_loads(
            text, f"fresh QAT completion line {index}"
        )
        row = _exact_fields(
            row, _COMPLETION_FIELDS, f"fresh QAT completion line {index}"
        )
        if _canonical_bytes(row) != raw_line:
            raise ValueError(
                f"fresh QAT completion line {index} is not canonical JSON"
            )
        if row["schema"] != FRESH_QAT_PARENT_COMPLETION_RECORD_SCHEMA:
            raise ValueError(
                f"fresh QAT completion line {index} schema is invalid"
            )
        game_id = _require_semantic_id(
            row["game_id"], f"fresh QAT completion line {index}.game_id"
        )
        parent_id = _require_semantic_id(
            row["parent_id"],
            f"fresh QAT completion line {index}.parent_id",
        )
        position_id = _require_semantic_id(
            row["position_id"],
            f"fresh QAT completion line {index}.position_id",
        )
        completed_parent_sha256 = _require_sha256(
            row["completed_parent_sha256"],
            (
                f"fresh QAT completion line {index}"
                ".completed_parent_sha256"
            ),
            allow_empty_digest=False,
        )
        if parent_id != expected_parent_id:
            raise ValueError(
                "fresh QAT completion parent sequence differs from exact input"
            )
        input_parent = input_metadata[parent_id]
        if (
            game_id != input_parent["game_id"]
            or position_id != input_parent["position_id"]
        ):
            raise ValueError(
                "fresh QAT completion metadata differs from exact input"
            )
        forced = row["forced_parent_skipped"]
        group_records = row["train_group_records"]
        group_sha256 = row["train_group_sha256"]
        if type(forced) is not bool or type(group_records) is not int:
            raise ValueError(
                f"fresh QAT completion line {index} disposition is invalid"
            )
        if forced:
            if group_records != 0 or group_sha256 is not None:
                raise ValueError(
                    "fresh QAT forced completion cannot claim a train group"
                )
            forced_order.append(parent_id)
        else:
            if group_records < 2:
                raise ValueError(
                    "fresh QAT emitted completion has fewer than two rows"
                )
            _require_sha256(
                group_sha256,
                f"fresh QAT completion line {index}.train_group_sha256",
                allow_empty_digest=False,
            )
            emitted_order.append(parent_id)
        records[parent_id] = {
            "completed_parent_sha256": completed_parent_sha256,
            "forced_parent_skipped": forced,
            "train_group_records": group_records,
            "train_group_sha256": group_sha256,
        }

    summary = {
        "path": expected_completion_binding["path"],
        "format": FRESH_QAT_PARENT_COMPLETION_FORMAT,
        "bytes": len(completion_raw),
        "sha256": hashlib.sha256(completion_raw).hexdigest(),
        "records": len(lines),
        "forced_parents_skipped": len(forced_order),
        "emitted_parent_groups": len(emitted_order),
        "parent_ids_sha256": _identifier_digest(input_order),
        "forced_parent_ids_sha256": _identifier_digest(forced_order),
        "emitted_parent_ids_sha256": _identifier_digest(emitted_order),
    }
    if not _typed_equal(summary, dict(expected_completion_binding)):
        raise ValueError(
            "fresh QAT completion aggregates differ from authenticated identity"
        )
    return summary, forced_order, emitted_order, records


def _mate_to_cp(mate: int, mate_sign: int) -> int:
    return mate_sign * (
        _MATE_SCORE_CP - min(abs(mate), _MAX_MATE_DISTANCE)
    )


def _validate_train_row(row: Any, line_number: int) -> dict[str, Any]:
    label = f"fresh QAT train line {line_number}"
    if type(row) is not dict:
        raise ValueError(f"{label} must be an object")
    score_kind = row.get("teacher_score_kind")
    expected_fields = (
        _TRAIN_ROW_FIELDS | _TRAIN_MATE_FIELDS
        if score_kind == "mate"
        else _TRAIN_ROW_FIELDS
    )
    row = _exact_fields(row, expected_fields, label)
    if (
        row["schema"] != "shogi-sibling-v1"
        or type(row["schema"]) is not str
        or row["schema_version"] != 1
        or type(row["schema_version"]) is not int
        or row["split"] != "train"
        or type(row["split"]) is not str
    ):
        raise ValueError(f"{label} has an invalid sibling row contract")
    for field in (
        "game_id",
        "parent_id",
        "position_id",
        "child_position_id",
    ):
        _require_semantic_id(row[field], f"{label}.{field}")
    _required_text(row["move"], f"{label}.move")
    parent_sfen = _normalized_sfen(row["parent_sfen"], f"{label}.parent_sfen")
    child_sfen = _normalized_sfen(row["sfen"], f"{label}.sfen")
    child_alias = _normalized_sfen(
        row["child_sfen"], f"{label}.child_sfen"
    )
    if (
        row["position_id"] != _position_id_from_sfen(parent_sfen)
        or child_sfen != child_alias
        or row["child_position_id"] != _position_id_from_sfen(child_sfen)
    ):
        raise ValueError(f"{label} SFEN semantic identifiers are invalid")
    for field in (
        "parent_ply",
        "ply",
        "cp",
        "teacher_child_cp",
        "teacher_parent_cp",
        "teacher_rank",
    ):
        if type(row[field]) is not int:
            raise ValueError(f"{label}.{field} must be an integer")
    if (
        row["parent_ply"] < 0
        or row["ply"] != row["parent_ply"] + 1
        or int(parent_sfen.split()[3]) != row["parent_ply"] + 1
        or int(child_sfen.split()[3]) != row["ply"] + 1
        or row["teacher_rank"] <= 0
    ):
        raise ValueError(f"{label} ply or rank is inconsistent")
    expected_child_cp = -row["teacher_parent_cp"]
    if (
        row["cp"] != expected_child_cp
        or row["teacher_child_cp"] != expected_child_cp
    ):
        raise ValueError(f"{label} child/parent CP aliases are inconsistent")
    sources = row["sources"]
    if type(sources) is not list or not sources:
        raise ValueError(f"{label}.sources must be a non-empty list")
    for source in sources:
        _required_text(source, f"{label}.sources")
    canonical_sources = sorted(
        set(sources),
        key=lambda source: (
            _SIBLING_SOURCE_PRIORITY.get(source, 100),
            source,
        ),
    )
    if sources != canonical_sources:
        raise ValueError(f"{label}.sources are not unique and canonical")
    if score_kind == "mate":
        mate = row["teacher_mate"]
        mate_sign = row["teacher_mate_sign"]
        if (
            type(mate) is not int
            or type(mate_sign) is not int
            or mate_sign not in (-1, 1)
            or (mate > 0 and mate_sign != 1)
            or (mate < 0 and mate_sign != -1)
            or row["teacher_parent_cp"] != _mate_to_cp(mate, mate_sign)
        ):
            raise ValueError(f"{label} mate metadata is inconsistent")
    elif score_kind == "cp":
        if abs(row["teacher_parent_cp"]) > _MAX_NON_MATE_CP:
            raise ValueError(f"{label} CP is in the reserved mate band")
    else:
        raise ValueError(f"{label} teacher score kind is invalid")
    return row


def _validate_train_group(parent_id: str, rows: list[dict[str, Any]]) -> None:
    if len(rows) < 2:
        raise ValueError(
            "fresh QAT emitted parent group has fewer than two sibling rows"
        )
    first = rows[0]
    provenance = (
        first["game_id"],
        first["position_id"],
        first["parent_sfen"],
        first["parent_ply"],
        first["ply"],
        first["split"],
    )
    moves: set[str] = set()
    ranks: list[int] = []
    played = 0
    for row in rows:
        if (
            row["parent_id"] != parent_id
            or (
                row["game_id"],
                row["position_id"],
                row["parent_sfen"],
                row["parent_ply"],
                row["ply"],
                row["split"],
            )
            != provenance
        ):
            raise ValueError(
                "fresh QAT train parent group metadata is inconsistent"
            )
        if row["move"] in moves:
            raise ValueError(
                "fresh QAT train parent group repeats a sibling move"
            )
        moves.add(row["move"])
        ranks.append(row["teacher_rank"])
        if "played" in row["sources"]:
            played += 1
    if played != 1:
        raise ValueError(
            "fresh QAT train parent group must have exactly one played source"
        )
    if sorted(ranks) != list(range(1, len(rows) + 1)):
        raise ValueError(
            "fresh QAT train parent group teacher ranks are not contiguous"
        )
    ranked = sorted(rows, key=lambda row: row["teacher_rank"])
    if any(
        ranked[index - 1]["teacher_parent_cp"]
        < ranked[index]["teacher_parent_cp"]
        for index in range(1, len(ranked))
    ):
        raise ValueError(
            "fresh QAT train parent group rank/CP order is contradictory"
        )


def _scan_train_bytes(
    train_raw: Any,
    input_order: list[str],
    input_metadata: Mapping[str, Mapping[str, Any]],
) -> tuple[dict[str, Any], list[str], dict[str, dict[str, Any]]]:
    lines = _strict_jsonl_lines(
        train_raw, "fresh QAT train content", allow_empty=True
    )
    input_index = {
        parent_id: index for index, parent_id in enumerate(input_order)
    }
    emitted_order: list[str] = []
    emitted_set: set[str] = set()
    group_summaries: dict[str, dict[str, Any]] = {}
    games: set[str] = set()
    positions: set[str] = set()
    children: set[str] = set()
    previous_parent: str | None = None
    previous_input_index = -1
    current_rows: list[dict[str, Any]] = []
    current_digest = hashlib.sha256()

    def finish_group() -> None:
        nonlocal current_rows, current_digest
        if previous_parent is None:
            return
        _validate_train_group(previous_parent, current_rows)
        group_summaries[previous_parent] = {
            "records": len(current_rows),
            "sha256": current_digest.hexdigest(),
        }
        current_rows = []
        current_digest = hashlib.sha256()

    for line_number, (raw_line, text) in enumerate(lines, 1):
        row = _strict_json_loads(text, f"fresh QAT train line {line_number}")
        if _canonical_bytes(row) != raw_line:
            raise ValueError(
                f"fresh QAT train line {line_number} is not canonical JSON"
            )
        row = _validate_train_row(row, line_number)
        game_id = row["game_id"]
        parent_id = row["parent_id"]
        position_id = row["position_id"]
        expected_parent = input_metadata.get(parent_id)
        if expected_parent is None:
            raise ValueError(
                "fresh QAT train contains a replacement parent outside the input"
            )
        if (
            game_id != expected_parent["game_id"]
            or position_id != expected_parent["position_id"]
            or row["parent_sfen"] != expected_parent["parent_sfen"]
            or row["parent_ply"] != expected_parent["ply"]
        ):
            raise ValueError(
                "fresh QAT train parent metadata differs from exact input"
            )
        if parent_id != previous_parent:
            finish_group()
            if parent_id in emitted_set:
                raise ValueError(
                    "fresh QAT train reopens a non-contiguous parent group"
                )
            current_input_index = input_index[parent_id]
            if current_input_index <= previous_input_index:
                raise ValueError(
                    "fresh QAT emitted parents are not an order-preserving "
                    "subsequence of input parents"
                )
            previous_input_index = current_input_index
            previous_parent = parent_id
            emitted_order.append(parent_id)
            emitted_set.add(parent_id)
        current_rows.append(row)
        current_digest.update(raw_line)
        current_digest.update(b"\n")
        games.add(game_id)
        positions.add(position_id)
        children.add(row["child_position_id"])
    finish_group()

    semantic_positions = positions | children
    return {
        "bytes": len(train_raw),
        "sha256": hashlib.sha256(train_raw).hexdigest(),
        "records": len(lines),
        "parents": len(emitted_order),
        "games": len(games),
        "game_ids_sha256": _identifier_digest(games),
        "parent_ids_sha256": _identifier_digest(emitted_order),
        "semantic_position_ids_count": len(semantic_positions),
        "semantic_position_ids_sha256": _identifier_digest(
            semantic_positions
        ),
    }, emitted_order, group_summaries


def _materialize_fresh_qat_parent_accounting_proposal_v2(
    input_raw: Any,
    completion_raw: Any,
    train_raw: Any,
    *,
    expected_input_binding: Mapping[str, Any],
    expected_completion_binding: Mapping[str, Any],
    materialization_boundary: str,
) -> dict[str, Any]:
    _verify_unchanged_contract_digests()
    binding = _normalize_input_binding(expected_input_binding)
    completion_binding = _normalize_completion_binding(
        expected_completion_binding
    )
    input_order, input_metadata, input_summary = _scan_input_bytes(
        input_raw, binding
    )
    (
        completion,
        forced_order,
        completion_emitted_order,
        completion_records,
    ) = _scan_completion_bytes(
        completion_raw,
        completion_binding,
        input_order,
        input_metadata,
    )
    train, emitted_order, train_groups = _scan_train_bytes(
        train_raw, input_order, input_metadata
    )
    if emitted_order != completion_emitted_order:
        raise ValueError(
            "fresh QAT train groups differ from explicit completion dispositions"
        )
    for parent_id in input_order:
        completion_record = completion_records[parent_id]
        train_group = train_groups.get(parent_id)
        if completion_record["forced_parent_skipped"]:
            if train_group is not None:
                raise ValueError(
                    "fresh QAT forced completion unexpectedly emitted a group"
                )
            continue
        if train_group is None:
            raise ValueError(
                "fresh QAT non-forced completion is missing its train group"
            )
        if (
            train_group["records"]
            != completion_record["train_group_records"]
            or train_group["sha256"]
            != completion_record["train_group_sha256"]
        ):
            raise ValueError(
                "fresh QAT train group differs from completion evidence"
            )

    emitted_positions = [
        input_metadata[parent_id]["position_id"] for parent_id in emitted_order
    ]
    forced_positions = [
        input_metadata[parent_id]["position_id"] for parent_id in forced_order
    ]
    input_count = len(input_order)
    forced_count = len(forced_order)
    emitted_count = len(emitted_order)
    if (
        forced_count + emitted_count != input_count
        or completion["records"] != input_count
        or train["parents"] != emitted_count
        or train["parent_ids_sha256"] != _identifier_digest(emitted_order)
    ):
        raise ValueError("fresh QAT parent accounting equation failed")

    parent_accounting = {
        "input_parents": input_count,
        "forced_parents_skipped": forced_count,
        "emitted_parent_groups": emitted_count,
        "equation": (
            "forced_parents_skipped+emitted_parent_groups=input_parents"
        ),
        "equation_verified": forced_count + emitted_count == input_count,
        "input_parent_ids_sha256": input_summary["parent_ids_sha256"],
        "forced_parent_ids_sha256": _identifier_digest(forced_order),
        "emitted_parent_ids_sha256": _identifier_digest(emitted_order),
        "input_position_ids_sha256": input_summary["position_ids_sha256"],
        "forced_position_ids_sha256": _identifier_digest(forced_positions),
        "emitted_position_ids_sha256": _identifier_digest(emitted_positions),
        "input_parent_tuple_sequence_sha256": input_summary[
            "parent_tuple_sequence_sha256"
        ],
        "forced_parent_tuple_sequence_sha256": _tuple_sequence_digest(
            forced_order, input_metadata
        ),
        "emitted_parent_tuple_sequence_sha256": _tuple_sequence_digest(
            emitted_order, input_metadata
        ),
        "replacement_parents": 0,
        "resampled_parents": 0,
        "emitted_order_preserved": True,
        "model_training_parents": emitted_count,
    }
    if emitted_count == 0:
        stop_receipt = {
            "schema": (
                "shogi-floodgate-fresh-qat-parent-accounting-stop-receipt-v2"
            ),
            "status": "STOP-no-trainable-parent-groups",
            "upstream": {
                "input_training": binding,
                "parent_completion": completion,
            },
            "parent_accounting": parent_accounting,
            "train": train,
            "authority": {
                "training_dispatch_authorized": False,
                "artifact_enrollment_authorized": False,
                "production_weight_write_authorized": False,
            },
        }
        raise FreshQATNoTrainableParentGroups(stop_receipt)

    model_training = copy.deepcopy(train)
    plan_stub = {"inputs": {"model_training": model_training}}
    contracts = []
    for slot in _fixed_slots():
        contract = build_fresh_qat_training_contract(plan_stub, slot)
        if contract["model_training_parents"] != emitted_count:
            raise ValueError(
                "fresh QAT contract did not receive emitted parent groups"
            )
        contracts.append(contract)

    return {
        "schema": FRESH_QAT_PARENT_ACCOUNTING_PROPOSAL_SCHEMA,
        "status": "materialized-proposal-only-not-enrolled-or-authorized",
        "materialization_boundary": materialization_boundary,
        "protocol_amendment_sha256": (
            FRESH_QAT_PARENT_ACCOUNTING_AMENDMENT_SHA256
        ),
        "execution_plan_schema": FRESH_QAT_EXECUTION_PLAN_SCHEMA_V2,
        "upstream": {
            "preregistered_plan": copy.deepcopy(_PREREGISTERED_PLAN_IDENTITY),
            "role_bundle_result": copy.deepcopy(_ROLE_BUNDLE_RESULT_IDENTITY),
            "input_training": binding,
            "parent_completion": completion,
        },
        "parent_accounting": parent_accounting,
        "model_training": model_training,
        "training_contracts": contracts,
        "unchanged_contracts": {
            "training": copy.deepcopy(FRESH_QAT_REQUIRED_TRAINING),
            "slots": _fixed_slots(),
            "selection": copy.deepcopy(FRESH_QAT_REQUIRED_SELECTION),
            "training_contract_canonical_sha256": (
                FRESH_QAT_TRAINING_CONTRACT_CANONICAL_SHA256
            ),
            "slot_registry_canonical_sha256": (
                FRESH_QAT_SLOT_REGISTRY_CANONICAL_SHA256
            ),
            "selection_contract_canonical_sha256": (
                FRESH_QAT_SELECTION_CONTRACT_CANONICAL_SHA256
            ),
        },
        "authority": {
            "teacher_execution_authorized": False,
            "artifact_enrollment_authorized": False,
            "training_dispatch_authorized": False,
            "selection_reader_authorized": False,
            "holdout_reader_authorized": False,
            "promotion_authorized": False,
            "production_weight_write_authorized": False,
        },
        "nonclaims": {
            "teacher_origin_authenticated_by_this_materializer": False,
            "completion_origin_authenticated_by_this_materializer": False,
            "artifact_enrolled": False,
            "training_executed": False,
            "candidate_selected": False,
            "strength_improved": False,
            "high_dan_calibrated": False,
            "live_weights_changed": False,
        },
    }


def _require_registered_production_completion_evidence() -> None:
    registry_path = (
        Path(__file__).resolve().parent
        / "protocols"
        / "floodgate-q1-2026-fresh-qat-plan-registry-v2.json"
    )
    registry = validate_closed_fresh_qat_plan_registry_v2(registry_path)
    if registry["enrollments"]["parent_completion_evidence"] is None:
        raise ValueError(
            "fresh QAT production STOP: authenticated per-parent completion "
            "evidence is not enrolled"
        )
    raise ValueError(
        "fresh QAT production STOP: the closed v2 registry cannot enroll "
        "completion evidence"
    )


def materialize_fresh_qat_parent_accounting_proposal_v2(
    input_raw: Any,
    completion_raw: Any,
    train_raw: Any,
) -> dict[str, Any]:
    """Fail closed while the production completion enrollment is null."""

    del input_raw, completion_raw, train_raw
    _require_registered_production_completion_evidence()
    raise AssertionError("unreachable")


def materialize_fresh_qat_parent_accounting_proposal_v2_core_for_tests(
    input_raw: Any,
    completion_raw: Any,
    train_raw: Any,
    *,
    expected_input_binding: Mapping[str, Any],
    expected_completion_binding: Mapping[str, Any],
) -> dict[str, Any]:
    """Exercise the byte-bound proposal core with synthetic identities only."""

    return _materialize_fresh_qat_parent_accounting_proposal_v2(
        input_raw,
        completion_raw,
        train_raw,
        expected_input_binding=expected_input_binding,
        expected_completion_binding=expected_completion_binding,
        materialization_boundary="synthetic-test-core-proposal-only",
    )


def _validate_fresh_qat_parent_accounting_proposal_v2(
    proposal: Mapping[str, Any],
    input_raw: Any,
    completion_raw: Any,
    train_raw: Any,
    *,
    expected_input_binding: Mapping[str, Any],
    expected_completion_binding: Mapping[str, Any],
    expected_boundary: str,
) -> Mapping[str, Any]:
    """Regenerate every digest and contract from the exact source bytes."""

    _exact_fields(
        proposal,
        _PROPOSAL_FIELDS,
        "fresh QAT parent-accounting proposal",
    )
    _require_plain_json(proposal, "fresh QAT parent-accounting proposal")
    expected = _materialize_fresh_qat_parent_accounting_proposal_v2(
        input_raw,
        completion_raw,
        train_raw,
        expected_input_binding=expected_input_binding,
        expected_completion_binding=expected_completion_binding,
        materialization_boundary=expected_boundary,
    )
    if not _typed_equal(proposal, expected):
        raise ValueError(
            "fresh QAT proposal differs from exact source-artifact recomputation"
        )
    return proposal


def validate_fresh_qat_parent_accounting_proposal_v2_core_for_tests(
    proposal: Mapping[str, Any],
    input_raw: Any,
    completion_raw: Any,
    train_raw: Any,
    *,
    expected_input_binding: Mapping[str, Any],
    expected_completion_binding: Mapping[str, Any],
) -> Mapping[str, Any]:
    """Recompute a synthetic proposal without granting production authority."""

    return _validate_fresh_qat_parent_accounting_proposal_v2(
        proposal,
        input_raw,
        completion_raw,
        train_raw,
        expected_input_binding=expected_input_binding,
        expected_completion_binding=expected_completion_binding,
        expected_boundary="synthetic-test-core-proposal-only",
    )


def validate_fresh_qat_parent_accounting_proposal_v2(
    proposal: Mapping[str, Any],
    input_raw: Any,
    completion_raw: Any,
    train_raw: Any,
) -> Mapping[str, Any]:
    """Fail closed while completion-origin authentication is unenrolled."""

    del proposal, input_raw, completion_raw, train_raw
    _require_registered_production_completion_evidence()
    raise AssertionError("unreachable")


def authorize_fresh_qat_training_v2(_proposal: Mapping[str, Any]) -> None:
    """There is intentionally no authority transition in this change."""

    raise ValueError(
        "fresh QAT v2 training authorization is not implemented; registry remains STOP"
    )


__all__ = [
    "EMPTY_IDENTIFIER_SET_SHA256",
    "FRESH_QAT_EXECUTION_PLAN_SCHEMA_V2",
    "FRESH_QAT_INPUT_GAMES",
    "FRESH_QAT_INPUT_PARENTS",
    "FRESH_QAT_PARENT_ACCOUNTING_AMENDMENT_BYTES",
    "FRESH_QAT_PARENT_ACCOUNTING_AMENDMENT_PATH",
    "FRESH_QAT_PARENT_ACCOUNTING_AMENDMENT_SCHEMA",
    "FRESH_QAT_PARENT_ACCOUNTING_AMENDMENT_SHA256",
    "FRESH_QAT_PARENT_ACCOUNTING_PROPOSAL_SCHEMA",
    "FRESH_QAT_PARENT_COMPLETION_FORMAT",
    "FRESH_QAT_PARENT_COMPLETION_RECORD_SCHEMA",
    "FRESH_QAT_PLAN_REGISTRY_BYTES_V2",
    "FRESH_QAT_PLAN_REGISTRY_PATH_V2",
    "FRESH_QAT_PLAN_REGISTRY_SCHEMA_V2",
    "FRESH_QAT_PLAN_REGISTRY_SHA256_V2",
    "FreshQATNoTrainableParentGroups",
    "PRODUCTION_INPUT_TRAINING_BINDING",
    "authorize_fresh_qat_training_v2",
    "materialize_fresh_qat_parent_accounting_proposal_v2",
    "materialize_fresh_qat_parent_accounting_proposal_v2_core_for_tests",
    "validate_closed_fresh_qat_plan_registry_v2",
    "validate_closed_fresh_qat_plan_registry_v2_data",
    "validate_fresh_qat_parent_accounting_amendment_chain",
    "validate_fresh_qat_parent_accounting_amendment_data",
    "validate_fresh_qat_parent_accounting_proposal_v2",
    "validate_fresh_qat_parent_accounting_proposal_v2_core_for_tests",
]
