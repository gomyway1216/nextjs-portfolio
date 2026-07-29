#!/usr/bin/env python3
"""Validate the fixed post-phase paths, schemas, metrics, and publications."""

from __future__ import annotations

import argparse
from collections.abc import Mapping, Sequence
import hashlib
import json
from pathlib import Path
from typing import Any


REGISTRY_RELATIVE_PATH = (
    "ml/protocols/child-board-strength-candidate-postphase-v1-registry.json"
)
REGISTRY_BYTES = 15_447
REGISTRY_SHA256 = (
    "bbc0b8d82cf3ef5219ed4250944ce631241c7f861a34676aa700037f5493d091"
)
REGISTRY_SCHEMA = (
    "shogi-child-board-strength-candidate-postphase-registry-v1"
)
REGISTRY_STATUS = (
    "prospective-postphase-interfaces-fixed-protected-data-locked"
)
PARENT_PROTOCOL_RELATIVE_PATH = (
    "ml/protocols/child-board-strength-candidate-v1-plan.json"
)
PARENT_PROTOCOL_BYTES = 42_427
PARENT_PROTOCOL_SHA256 = (
    "b9b8256433cec77da8d32a6d05018b9a5e405e5b57fdabe299490a5f9f90cfe2"
)
STUDENT_PROTOCOL_BYTES = 65_314
STUDENT_PROTOCOL_SHA256 = (
    "6bc5478a76bf52005bf133c097bcb8741a8dd7cf0cf568e2ae4d7c0d65a58db0"
)

_EXPECTED_TOP_LEVEL_KEYS = {
    "schema",
    "status",
    "authority",
    "parent_protocol",
    "student_protocol",
    "binding_receipt",
    "outputs",
    "sealed_label_shards",
    "metric_definitions",
    "execution_contract",
    "publication_rules",
    "protected_state_at_registration",
}
_SUBTREE_SHA256 = {
    "parent_protocol": (
        "4804909fd3e36d66f1c3cd398f8d25452cbabe49aae07f6591f07f56d8c4b2a8"
    ),
    "student_protocol": (
        "af51837cca8ec34888361e1ccf08d0cf21f39141a43b638e981fdae3f9afd756"
    ),
    "binding_receipt": (
        "b3561115db50c08b1045924114315241f5213a302f4919d494baf801a8b43161"
    ),
    "outputs": (
        "41b4874d40fdc4304a3b29c45f83738827c097a9012121801e395b6273af60a0"
    ),
    "sealed_label_shards": (
        "3ee9b71ec454c508c50624267862e84c3a49a580f0c58d3027c2216097bb4ae2"
    ),
    "metric_definitions": (
        "c577425ca566eaa1d2a8279ecf439eacea0d461dfe8c9e3f9015a6cad0e3581c"
    ),
    "execution_contract": (
        "3def384c810250c756dbabc57f66d67d7611888f065119128874a0747d1b4cbc"
    ),
    "publication_rules": (
        "39f4e9d1bfc43c8adb896fd025932c99fa0acccf413b934fc805cdaa42fb9742"
    ),
    "protected_state_at_registration": (
        "ece60c217d99a7f660bdbce21510c3e6780bb7e8a0f2a08a1f102b1c9cb7dc13"
    ),
}


class RegistryError(ValueError):
    """The post-phase registry does not match its prospective contract."""


def _reject_constant(value: str) -> None:
    raise RegistryError(f"non-finite JSON number is forbidden: {value}")


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise RegistryError(f"duplicate JSON key is forbidden: {key}")
        result[key] = value
    return result


def _strict_json(raw: bytes, label: str) -> dict[str, Any]:
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise RegistryError(f"{label} is not UTF-8") from error
    try:
        value = json.loads(
            text,
            object_pairs_hook=_unique_object,
            parse_constant=_reject_constant,
        )
    except (json.JSONDecodeError, RegistryError) as error:
        raise RegistryError(f"{label} is not strict JSON: {error}") from error
    if type(value) is not dict:
        raise RegistryError(f"{label} root must be an object")
    return value


def _canonical_sha256(value: object) -> str:
    raw = json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _mapping(value: object, label: str) -> Mapping[str, Any]:
    if type(value) is not dict:
        raise RegistryError(f"{label} must be an object")
    return value


def validate_registry_document(document: Mapping[str, Any]) -> None:
    """Validate exact registered subtrees plus their critical relationships."""

    if type(document) is not dict or set(document) != _EXPECTED_TOP_LEVEL_KEYS:
        raise RegistryError("registry top-level keys mismatch")
    if document["schema"] != REGISTRY_SCHEMA:
        raise RegistryError("registry schema mismatch")
    if document["status"] != REGISTRY_STATUS:
        raise RegistryError("registry status mismatch")
    if document["authority"] != (
        "path-schema-metric-and-publication-contract-only"
    ):
        raise RegistryError("registry authority mismatch")
    for key, expected_sha256 in _SUBTREE_SHA256.items():
        if _canonical_sha256(document[key]) != expected_sha256:
            raise RegistryError(f"registered {key} contract mismatch")

    outputs = _mapping(document["outputs"], "outputs")
    sealed = _mapping(outputs["sealed"], "outputs.sealed")
    schemas = _mapping(sealed["schemas"], "outputs.sealed.schemas")
    if any(
        type(value) is not str or not value.startswith("shogi-")
        for value in schemas.values()
    ):
        raise RegistryError("every sealed output schema must be explicit")
    for key in (
        "clean_derivative",
        "clean_derivative_receipt",
        "selected_parent_ids",
        "selection_receipt",
        "label_shards_directory",
        "label_shard_receipts_directory",
        "labels",
        "label_receipt",
        "artifact_receipt",
        "score_bundle",
        "score_bundle_receipt",
        "opened_marker",
        "pending_result",
        "result",
    ):
        if not str(sealed[key]).startswith(str(sealed["root"]) + "/"):
            raise RegistryError(f"sealed output escapes fixed root: {key}")

    shards = _mapping(
        document["sealed_label_shards"], "sealed_label_shards"
    )
    if (
        type(shards["parents"]) is not int
        or type(shards["shards"]) is not int
        or type(shards["parents_per_shard"]) is not int
        or shards["shards"] * shards["parents_per_shard"]
        != shards["parents"]
        or shards["parents"] != 512
    ):
        raise RegistryError("sealed shard arithmetic mismatch")

    metrics = _mapping(document["metric_definitions"], "metric_definitions")
    top1 = _mapping(metrics["candidate_top1_tie"], "candidate_top1_tie")
    pair = _mapping(metrics["pair_accuracy"], "pair_accuracy")
    ndcg = _mapping(metrics["ndcg_at_5"], "ndcg_at_5")
    mcnemar = _mapping(metrics["mcnemar_one_sided"], "mcnemar_one_sided")
    regret = _mapping(metrics["mean_regret_cp"], "mean_regret_cp")
    if (
        "every move" not in top1["correct"]
        or pair["candidate_tie"] != "incorrect"
        or "teacher-worst" not in regret["candidate_tie"]
        or "teacher CP ascending" not in ndcg["candidate_order"]
        or mcnemar["continuity_correction"] is not False
        or mcnemar["maximum_p"] != 0.05
        or mcnemar["exact_pass_comparison"]
        != "20 * sum(comb(n,k), k=b..n) <= 2**n"
    ):
        raise RegistryError("tie or exact McNemar definition mismatch")

    public = _mapping(
        outputs["public_student_assets"], "outputs.public_student_assets"
    )
    if (
        public["tensor_path"]
        != "public/shogi-root-policy-student-v1.f32.bin"
        or public["manifest_path"]
        != "public/shogi-root-policy-student-v1.manifest.json"
        or public["tensor_url"] != "/shogi-root-policy-student-v1.f32.bin"
        or public["manifest_url"]
        != "/shogi-root-policy-student-v1.manifest.json"
    ):
        raise RegistryError("public student asset path/URL mismatch")

    formal = _mapping(outputs["formal"], "outputs.formal")
    if (
        formal["pairs"] != 384
        or formal["games"] != 768
        or formal["games"] != 2 * formal["pairs"]
        or formal["pair_workers"] != 12
        or not str(formal["result"]).startswith(
            str(formal["output_root"]) + "/"
        )
    ):
        raise RegistryError("formal output or pair contract mismatch")

    execution = _mapping(document["execution_contract"], "execution_contract")
    if execution["artifact_names"] != [
        "seed42_teacher",
        "seed314159_teacher",
        "frozen_student",
    ] or execution["reference_name"] != "exact_live":
        raise RegistryError("execution artifact roles mismatch")
    score_row = _mapping(execution["score_row"], "execution_contract.score_row")
    score_receipt = _mapping(
        execution["score_bundle_receipt"],
        "execution_contract.score_bundle_receipt",
    )
    if score_row["score_keys"] != [
        "exact_live",
        "seed42_teacher",
        "seed314159_teacher",
        "frozen_student",
    ]:
        raise RegistryError("score-row completeness keys mismatch")
    if (
        "exact domain-name mapping" not in score_receipt["source_receipts"]
        or "actual total move-row count" not in score_receipt["completeness"]
    ):
        raise RegistryError("score-bundle receipt binding mismatch")
    tune = _mapping(execution["tune"], "execution_contract.tune")
    domains = tune["domains"]
    if (
        type(domains) is not list
        or [entry.get("name") for entry in domains] != [
            "browser_tune",
            "v9_tune",
        ]
        or [entry.get("parents") for entry in domains] != [196, 4411]
        or tune["all_three_artifacts_pass_independently"] is not True
    ):
        raise RegistryError("one-shot tune domain contract mismatch")
    sealed_execution = _mapping(
        execution["sealed"], "execution_contract.sealed"
    )
    selection = _mapping(
        sealed_execution["selection"], "execution_contract.sealed.selection"
    )
    labeling = _mapping(
        sealed_execution["labeling"], "execution_contract.sealed.labeling"
    )
    if (
        sealed_execution["parents"] != 512
        or selection["parents"] != 512
        or selection["maximum_parents_per_game"] != 4
        or labeling["depth"] != 12
        or labeling["labeler"]
        != "labelAllLegalMoves from ml/build-browser-confusion-ranking-teacher.ts"
        or sealed_execution["all_three_artifacts_pass_independently"] is not True
    ):
        raise RegistryError("sealed preparation or scoring contract mismatch")
    publication = _mapping(
        execution["one_shot_publication"],
        "execution_contract.one_shot_publication",
    )
    if (
        publication["partial_metrics_displayed"] is not False
        or publication["rerun"] is not False
        or "terminalize-only" not in publication["recovery"]
    ):
        raise RegistryError("one-shot publication/recovery contract mismatch")

    state = _mapping(
        document["protected_state_at_registration"],
        "protected_state_at_registration",
    )
    if any(
        state[key] is not False
        for key in (
            "tune_opened",
            "sealed_labels_generated",
            "sealed_scores_opened",
            "live_weights_changed",
        )
    ) or any(
        type(state[key]) is not int or state[key] != 0
        for key in ("formal_games_played", "external_games_played")
    ):
        raise RegistryError("protected registration state is not closed")


def validate_registry_bytes(raw: bytes) -> dict[str, Any]:
    if len(raw) != REGISTRY_BYTES or hashlib.sha256(raw).hexdigest() != (
        REGISTRY_SHA256
    ):
        raise RegistryError("tracked registry byte/SHA identity mismatch")
    document = _strict_json(raw, "post-phase registry")
    validate_registry_document(document)
    return document


def validate_checked_in_registry(
    repo_root: Path | None = None,
) -> dict[str, Any]:
    root = (
        repo_root
        if repo_root is not None
        else Path(__file__).resolve().parent.parent
    )
    registry_path = root / REGISTRY_RELATIVE_PATH
    document = validate_registry_bytes(registry_path.read_bytes())
    parent = _mapping(document["parent_protocol"], "parent_protocol")
    parent_path = root / str(parent["path"])
    parent_raw = parent_path.read_bytes()
    if (
        len(parent_raw) != PARENT_PROTOCOL_BYTES
        or hashlib.sha256(parent_raw).hexdigest() != PARENT_PROTOCOL_SHA256
    ):
        raise RegistryError("parent protocol byte/SHA identity mismatch")
    student = _mapping(document["student_protocol"], "student_protocol")
    student_path = root / str(student["path"])
    student_raw = student_path.read_bytes()
    if (
        len(student_raw) != STUDENT_PROTOCOL_BYTES
        or hashlib.sha256(student_raw).hexdigest()
        != STUDENT_PROTOCOL_SHA256
    ):
        raise RegistryError("student protocol byte/SHA identity mismatch")
    return document


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        document = validate_checked_in_registry(args.repo_root)
    except (OSError, RegistryError) as error:
        raise SystemExit(f"post-phase registry invalid: {error}") from error
    print(
        json.dumps(
            {
                "schema": document["schema"],
                "status": document["status"],
                "bytes": REGISTRY_BYTES,
                "sha256": REGISTRY_SHA256,
            },
            sort_keys=True,
            separators=(",", ":"),
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
