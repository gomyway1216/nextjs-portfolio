"""Append-only parent accounting for the future fresh Floodgate QAT run.

The immutable v1 preregistration counted 24,000 selected input parents.  A
forced parent is nevertheless a completed and accountable teacher input even
though it emits no sibling-training group.  V2 therefore keeps three separate
quantities:

    input_parents = forced_parents_skipped + emitted_parent_groups

Only ``emitted_parent_groups`` is projected into ``model_training_parents``.
This module is deliberately stdlib-only.  It can validate checked-in closed
records and materialize an in-memory proposal from already supplied input
metadata and train bytes.  It cannot run a teacher, read a holdout, dispatch
Torch, enroll an artifact, mutate a registry, or grant authority.
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
FRESH_QAT_PARENT_ACCOUNTING_AMENDMENT_BYTES = 6_469
FRESH_QAT_PARENT_ACCOUNTING_AMENDMENT_SHA256 = (
    "2a9c6ebb8b7c6d50d606bbdf0f1eb0cb5d971159e2cee836ff26a5d96c8c80d5"
)
FRESH_QAT_PARENT_ACCOUNTING_AMENDMENT_CANONICAL_SHA256 = (
    "6d63d71aa76e4b7c8084b07219ace2540447f9d1aed811f8fa4da894f229eda3"
)
FRESH_QAT_PLAN_REGISTRY_PATH_V2 = (
    "ml/protocols/floodgate-q1-2026-fresh-qat-plan-registry-v2.json"
)
FRESH_QAT_PLAN_REGISTRY_BYTES_V2 = 3_046
FRESH_QAT_PLAN_REGISTRY_SHA256_V2 = (
    "08f3ebecc880f2e3c97f4591d3a2e68cb186dde8772bcbaf534fe518fdd89130"
)
FRESH_QAT_PLAN_REGISTRY_CANONICAL_SHA256_V2 = (
    "85c9bce0a0cc545b9c5831911443cf6e0192d18c4697f16390251360a71df748"
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

_TRAIN_ROW_REQUIRED_FIELDS = frozenset(
    {
        "schema",
        "schema_version",
        "game_id",
        "parent_id",
        "position_id",
        "child_position_id",
        "split",
    }
)
_INPUT_PARENT_FIELDS = frozenset({"game_id", "parent_id", "position_id"})
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


def _scan_input_parents(
    input_parents: Any,
    expected_input_binding: Mapping[str, Any],
) -> tuple[list[str], dict[str, tuple[str, str]], dict[str, Any]]:
    if type(input_parents) is not list:
        raise ValueError("fresh QAT input parents must be an exact list")
    if len(input_parents) != expected_input_binding["parents"]:
        raise ValueError("fresh QAT input parent count differs from its binding")

    order: list[str] = []
    metadata: dict[str, tuple[str, str]] = {}
    games: set[str] = set()
    positions: set[str] = set()
    for index, item in enumerate(input_parents):
        parent = _exact_fields(
            item,
            _INPUT_PARENT_FIELDS,
            f"fresh QAT input parent {index}",
        )
        game_id = _require_semantic_id(
            parent["game_id"], f"fresh QAT input parent {index}.game_id"
        )
        parent_id = _require_semantic_id(
            parent["parent_id"], f"fresh QAT input parent {index}.parent_id"
        )
        position_id = _require_semantic_id(
            parent["position_id"],
            f"fresh QAT input parent {index}.position_id",
        )
        if parent_id in metadata:
            raise ValueError("fresh QAT input contains a duplicate parent ID")
        metadata[parent_id] = (game_id, position_id)
        order.append(parent_id)
        games.add(game_id)
        positions.add(position_id)

    if len(games) != expected_input_binding["games"]:
        raise ValueError("fresh QAT input game count differs from its binding")
    if len(positions) != expected_input_binding["position_ids_count"]:
        raise ValueError("fresh QAT input position count differs from its binding")
    if (
        _identifier_digest(order)
        != expected_input_binding["parent_ids_sha256"]
        or _identifier_digest(games)
        != expected_input_binding["game_ids_sha256"]
        or _identifier_digest(positions)
        != expected_input_binding["position_ids_sha256"]
    ):
        raise ValueError("fresh QAT input identifiers differ from the role binding")
    return order, metadata, {
        "parents": len(order),
        "games": len(games),
        "game_ids_sha256": _identifier_digest(games),
        "parent_ids_sha256": _identifier_digest(order),
        "position_ids_count": len(positions),
        "position_ids_sha256": _identifier_digest(positions),
    }


def _scan_train_bytes(
    train_raw: Any,
    input_order: list[str],
    input_metadata: Mapping[str, tuple[str, str]],
) -> tuple[dict[str, Any], list[str]]:
    if type(train_raw) is not bytes:
        raise ValueError("fresh QAT train content must be exact bytes")
    if b"\r" in train_raw:
        raise ValueError("fresh QAT train content may not contain CR bytes")
    if train_raw and (
        not train_raw.endswith(b"\n") or train_raw.endswith(b"\n\n")
    ):
        raise ValueError("fresh QAT train content requires one final LF")

    lines = [] if not train_raw else train_raw[:-1].split(b"\n")
    input_index = {parent_id: index for index, parent_id in enumerate(input_order)}
    emitted_order: list[str] = []
    emitted_set: set[str] = set()
    group_records: dict[str, int] = {}
    games: set[str] = set()
    positions: set[str] = set()
    children: set[str] = set()
    previous_parent: str | None = None
    previous_input_index = -1

    for line_number, raw_line in enumerate(lines, 1):
        if not raw_line:
            raise ValueError("fresh QAT train content contains a blank line")
        try:
            text = raw_line.decode("utf-8")
        except UnicodeDecodeError as error:
            raise ValueError(
                f"fresh QAT train line {line_number} is not UTF-8"
            ) from error
        row = _strict_json_loads(text, f"fresh QAT train line {line_number}")
        if type(row) is not dict or not _TRAIN_ROW_REQUIRED_FIELDS.issubset(row):
            raise ValueError(
                f"fresh QAT train line {line_number} lacks required fields"
            )
        if (
            row["schema"] != "shogi-sibling-v1"
            or type(row["schema"]) is not str
            or row["schema_version"] != 1
            or type(row["schema_version"]) is not int
            or row["split"] != "train"
            or type(row["split"]) is not str
        ):
            raise ValueError(
                f"fresh QAT train line {line_number} has an invalid row contract"
            )
        game_id = _require_semantic_id(
            row["game_id"], f"fresh QAT train line {line_number}.game_id"
        )
        parent_id = _require_semantic_id(
            row["parent_id"], f"fresh QAT train line {line_number}.parent_id"
        )
        position_id = _require_semantic_id(
            row["position_id"], f"fresh QAT train line {line_number}.position_id"
        )
        child_position_id = _require_semantic_id(
            row["child_position_id"],
            f"fresh QAT train line {line_number}.child_position_id",
        )
        expected_metadata = input_metadata.get(parent_id)
        if expected_metadata is None:
            raise ValueError(
                "fresh QAT train contains a replacement parent outside the input"
            )
        if expected_metadata != (game_id, position_id):
            raise ValueError(
                "fresh QAT train parent metadata differs from the input binding"
            )

        if parent_id != previous_parent:
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
            group_records[parent_id] = 0
        group_records[parent_id] += 1
        games.add(game_id)
        positions.add(position_id)
        children.add(child_position_id)

    if any(records < 2 for records in group_records.values()):
        raise ValueError(
            "fresh QAT emitted parent group has fewer than two sibling rows"
        )
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
        "semantic_position_ids_sha256": _identifier_digest(semantic_positions),
    }, emitted_order


def _materialize_fresh_qat_parent_accounting_proposal_v2(
    input_parents: Any,
    train_raw: Any,
    *,
    expected_input_binding: Mapping[str, Any],
    materialization_boundary: str,
) -> dict[str, Any]:
    _verify_unchanged_contract_digests()
    binding = _normalize_input_binding(expected_input_binding)
    input_order, input_metadata, input_summary = _scan_input_parents(
        input_parents,
        binding,
    )
    train, emitted_order = _scan_train_bytes(
        train_raw,
        input_order,
        input_metadata,
    )

    emitted_set = set(emitted_order)
    forced_order = [
        parent_id for parent_id in input_order if parent_id not in emitted_set
    ]
    emitted_positions = {
        input_metadata[parent_id][1] for parent_id in emitted_order
    }
    forced_positions = {
        input_metadata[parent_id][1] for parent_id in forced_order
    }
    input_count = len(input_order)
    forced_count = len(forced_order)
    emitted_count = len(emitted_order)
    if forced_count + emitted_count != input_count:
        raise ValueError("fresh QAT parent accounting equation failed")
    if train["parents"] != emitted_count:
        raise ValueError("fresh QAT train parent scan differs from emitted groups")
    if train["parent_ids_sha256"] != _identifier_digest(emitted_order):
        raise ValueError("fresh QAT train parent digest differs from emitted groups")

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

    proposal = {
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
            "artifact_enrolled": False,
            "training_executed": False,
            "candidate_selected": False,
            "strength_improved": False,
            "high_dan_calibrated": False,
            "live_weights_changed": False,
        },
    }
    _validate_fresh_qat_parent_accounting_proposal_v2(
        proposal,
        expected_input_binding=binding,
        expected_boundary=materialization_boundary,
    )
    return proposal


def materialize_fresh_qat_parent_accounting_proposal_v2(
    input_parents: Any,
    train_raw: Any,
) -> dict[str, Any]:
    """Materialize a production-bound proposal without writing or authorizing it."""

    return _materialize_fresh_qat_parent_accounting_proposal_v2(
        input_parents,
        train_raw,
        expected_input_binding=PRODUCTION_INPUT_TRAINING_BINDING,
        materialization_boundary=(
            "fixed-production-role-bundle-input-proposal-only"
        ),
    )


def materialize_fresh_qat_parent_accounting_proposal_v2_core_for_tests(
    input_parents: Any,
    train_raw: Any,
    *,
    expected_input_binding: Mapping[str, Any],
) -> dict[str, Any]:
    """Exercise the exact production core with a small synthetic input binding."""

    return _materialize_fresh_qat_parent_accounting_proposal_v2(
        input_parents,
        train_raw,
        expected_input_binding=expected_input_binding,
        materialization_boundary="synthetic-test-core-proposal-only",
    )


def _validate_fresh_qat_parent_accounting_proposal_v2(
    proposal: Mapping[str, Any],
    *,
    expected_input_binding: Mapping[str, Any],
    expected_boundary: str,
) -> Mapping[str, Any]:
    value = _exact_fields(
        proposal,
        _PROPOSAL_FIELDS,
        "fresh QAT parent-accounting proposal",
    )
    _require_plain_json(value, "fresh QAT parent-accounting proposal")
    if (
        value["schema"] != FRESH_QAT_PARENT_ACCOUNTING_PROPOSAL_SCHEMA
        or value["status"]
        != "materialized-proposal-only-not-enrolled-or-authorized"
        or value["materialization_boundary"] != expected_boundary
        or value["protocol_amendment_sha256"]
        != FRESH_QAT_PARENT_ACCOUNTING_AMENDMENT_SHA256
        or value["execution_plan_schema"] != FRESH_QAT_EXECUTION_PLAN_SCHEMA_V2
    ):
        raise ValueError("fresh QAT parent-accounting proposal header differs")
    if value["upstream"] != {
        "preregistered_plan": _PREREGISTERED_PLAN_IDENTITY,
        "role_bundle_result": _ROLE_BUNDLE_RESULT_IDENTITY,
        "input_training": dict(expected_input_binding),
    }:
        raise ValueError("fresh QAT parent-accounting proposal upstream differs")

    accounting = value["parent_accounting"]
    expected_accounting_fields = frozenset(
        {
            "input_parents",
            "forced_parents_skipped",
            "emitted_parent_groups",
            "equation",
            "equation_verified",
            "input_parent_ids_sha256",
            "forced_parent_ids_sha256",
            "emitted_parent_ids_sha256",
            "input_position_ids_sha256",
            "forced_position_ids_sha256",
            "emitted_position_ids_sha256",
            "replacement_parents",
            "resampled_parents",
            "emitted_order_preserved",
            "model_training_parents",
        }
    )
    accounting = _exact_fields(
        accounting,
        expected_accounting_fields,
        "fresh QAT proposal parent accounting",
    )
    input_count = accounting["input_parents"]
    forced_count = accounting["forced_parents_skipped"]
    emitted_count = accounting["emitted_parent_groups"]
    if (
        type(input_count) is not int
        or input_count != expected_input_binding["parents"]
        or type(forced_count) is not int
        or forced_count < 0
        or type(emitted_count) is not int
        or emitted_count < 1
        or forced_count + emitted_count != input_count
        or accounting["equation"]
        != "forced_parents_skipped+emitted_parent_groups=input_parents"
        or accounting["equation_verified"] is not True
        or accounting["replacement_parents"] != 0
        or type(accounting["replacement_parents"]) is not int
        or accounting["resampled_parents"] != 0
        or type(accounting["resampled_parents"]) is not int
        or accounting["emitted_order_preserved"] is not True
        or accounting["model_training_parents"] != emitted_count
    ):
        raise ValueError("fresh QAT proposal parent accounting is invalid")
    for field in (
        "input_parent_ids_sha256",
        "forced_parent_ids_sha256",
        "emitted_parent_ids_sha256",
        "input_position_ids_sha256",
        "forced_position_ids_sha256",
        "emitted_position_ids_sha256",
    ):
        _require_sha256(accounting[field], f"fresh QAT proposal {field}")
    if (
        accounting["input_parent_ids_sha256"]
        != expected_input_binding["parent_ids_sha256"]
        or accounting["input_position_ids_sha256"]
        != expected_input_binding["position_ids_sha256"]
    ):
        raise ValueError("fresh QAT proposal input digests differ")
    if forced_count == 0 and (
        accounting["forced_parent_ids_sha256"] != EMPTY_IDENTIFIER_SET_SHA256
        or accounting["forced_position_ids_sha256"]
        != EMPTY_IDENTIFIER_SET_SHA256
        or accounting["emitted_parent_ids_sha256"]
        != accounting["input_parent_ids_sha256"]
        or accounting["emitted_position_ids_sha256"]
        != accounting["input_position_ids_sha256"]
    ):
        raise ValueError("fresh QAT zero-forced partition digests are invalid")

    model_training = value["model_training"]
    expected_model_fields = frozenset(
        {
            "bytes",
            "sha256",
            "records",
            "parents",
            "games",
            "game_ids_sha256",
            "parent_ids_sha256",
            "semantic_position_ids_count",
            "semantic_position_ids_sha256",
        }
    )
    model_training = _exact_fields(
        model_training,
        expected_model_fields,
        "fresh QAT proposal model training",
    )
    for field in (
        "bytes",
        "records",
        "parents",
        "games",
        "semantic_position_ids_count",
    ):
        if type(model_training[field]) is not int:
            raise ValueError(f"fresh QAT model training {field} is not an integer")
    if (
        model_training["bytes"] < 1
        or model_training["records"] < emitted_count * 2
        or model_training["parents"] != emitted_count
        or not 1 <= model_training["games"] <= expected_input_binding["games"]
        or model_training["semantic_position_ids_count"] < emitted_count
        or model_training["parent_ids_sha256"]
        != accounting["emitted_parent_ids_sha256"]
    ):
        raise ValueError("fresh QAT proposal model training accounting is invalid")
    for field in (
        "sha256",
        "game_ids_sha256",
        "parent_ids_sha256",
        "semantic_position_ids_sha256",
    ):
        _require_sha256(
            model_training[field],
            f"fresh QAT proposal model training {field}",
            allow_empty_digest=False,
        )

    contracts = value["training_contracts"]
    if type(contracts) is not list or len(contracts) != len(FRESH_QAT_SLOT_ORDER):
        raise ValueError("fresh QAT proposal must contain all three contracts")
    plan_stub = {"inputs": {"model_training": model_training}}
    expected_contracts = [
        build_fresh_qat_training_contract(plan_stub, slot)
        for slot in _fixed_slots()
    ]
    if contracts != expected_contracts or any(
        type(contract) is not dict for contract in contracts
    ):
        raise ValueError("fresh QAT proposal training contracts differ")
    if any(
        contract["model_training_parents"] != emitted_count
        for contract in contracts
    ):
        raise ValueError("fresh QAT proposal did not pass emitted parents")

    unchanged = value["unchanged_contracts"]
    if unchanged != {
        "training": FRESH_QAT_REQUIRED_TRAINING,
        "slots": _fixed_slots(),
        "selection": FRESH_QAT_REQUIRED_SELECTION,
        "training_contract_canonical_sha256": (
            FRESH_QAT_TRAINING_CONTRACT_CANONICAL_SHA256
        ),
        "slot_registry_canonical_sha256": (
            FRESH_QAT_SLOT_REGISTRY_CANONICAL_SHA256
        ),
        "selection_contract_canonical_sha256": (
            FRESH_QAT_SELECTION_CONTRACT_CANONICAL_SHA256
        ),
    }:
        raise ValueError("fresh QAT proposal changed a frozen contract")
    _verify_unchanged_contract_digests()

    if any(value["authority"].values()):
        raise ValueError("fresh QAT proposal contains authority")
    if any(value["nonclaims"].values()):
        raise ValueError("fresh QAT proposal contradicts its nonclaims")
    return value


def validate_fresh_qat_parent_accounting_proposal_v2(
    proposal: Mapping[str, Any],
) -> Mapping[str, Any]:
    """Validate a production-bound in-memory proposal; never enroll it."""

    return _validate_fresh_qat_parent_accounting_proposal_v2(
        proposal,
        expected_input_binding=PRODUCTION_INPUT_TRAINING_BINDING,
        expected_boundary="fixed-production-role-bundle-input-proposal-only",
    )


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
]
