#!/usr/bin/env python3
"""One-shot tune and sealed-512 scoring under the post-phase registry.

The scorer consumes a complete, byte-bound score bundle containing the exact
live reference and all three frozen artifacts.  It publishes no partial
metric.  A create-only opened marker is written before the first protected
bundle byte is read; only a fully materialized pending result may be recovered
without reopening that bundle.
"""

from __future__ import annotations

import argparse
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
import hashlib
import json
import math
import os
from pathlib import Path
import re
import stat
from typing import Any
import uuid

import child_board_strength_candidate_postphase_registry as REGISTRY


PAIR_GAP_CP = 50.0
NDCG_TEMPERATURE_CP = 100.0
NDCG_CLAMP_CP = -1200.0
_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
_USI_RE = re.compile(
    r"^(?:[1-9][a-i][1-9][a-i]\+?|[PLNSGBR]\*[1-9][a-i])$"
)


class ScoringError(ValueError):
    """The one-shot scoring contract was not satisfied."""


@dataclass(frozen=True)
class ScoreRow:
    domain: str
    parent_id: str
    move: str
    teacher_cp: float
    scores: Mapping[str, float]


def _reject_constant(value: str) -> None:
    raise ScoringError(f"non-finite JSON number is forbidden: {value}")


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ScoringError(f"duplicate JSON key is forbidden: {key}")
        result[key] = value
    return result


def strict_json_bytes(raw: bytes, label: str) -> dict[str, Any]:
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ScoringError(f"{label} is not UTF-8") from error
    try:
        value = json.loads(
            text,
            object_pairs_hook=_unique_object,
            parse_constant=_reject_constant,
        )
    except (json.JSONDecodeError, ScoringError) as error:
        raise ScoringError(f"{label} is not strict JSON: {error}") from error
    if type(value) is not dict:
        raise ScoringError(f"{label} root must be an object")
    return value


def _canonical_json(value: Mapping[str, object]) -> bytes:
    return (
        json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        ).encode("utf-8")
        + b"\n"
    )


def _byte_key(value: str) -> bytes:
    return value.encode("utf-8")


def _sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _identity(path: Path, raw: bytes) -> dict[str, object]:
    return {
        "path": str(path),
        "bytes": len(raw),
        "sha256": _sha256(raw),
    }


def _require_sha256(value: object, label: str) -> str:
    if type(value) is not str or _SHA256_RE.fullmatch(value) is None:
        raise ScoringError(f"{label} must be lowercase SHA-256")
    return value


def _read_regular_no_symlink(path: Path, label: str) -> bytes:
    try:
        metadata = path.lstat()
    except OSError as error:
        raise ScoringError(f"{label} is unavailable: {path}") from error
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode):
        raise ScoringError(f"{label} must be a regular non-symlink file")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
        with os.fdopen(descriptor, "rb") as stream:
            return stream.read()
    except OSError as error:
        raise ScoringError(f"{label} could not be read safely") from error


def _atomic_create(path: Path, raw: bytes) -> None:
    try:
        parent = path.parent.resolve(strict=True)
    except OSError as error:
        raise ScoringError(f"output parent is unavailable: {path.parent}") from error
    if not parent.is_dir():
        raise ScoringError("output parent must be a directory")
    temporary = path.parent / (
        f".{path.name}.tmp-{os.getpid()}-{uuid.uuid4().hex}"
    )
    flags = (
        os.O_WRONLY
        | os.O_CREAT
        | os.O_EXCL
        | getattr(os, "O_NOFOLLOW", 0)
    )
    try:
        descriptor = os.open(temporary, flags, 0o600)
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temporary, path)
        temporary.unlink()
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    except OSError as error:
        raise ScoringError(f"create-only atomic publication failed: {path}") from error
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def _verify_identity(
    identity: object,
    *,
    raw: bytes,
    expected_path: Path,
    label: str,
) -> None:
    if type(identity) is not dict or set(identity) != {
        "path",
        "bytes",
        "sha256",
    }:
        raise ScoringError(f"{label} identity keys mismatch")
    if (
        identity["path"] != str(expected_path)
        or type(identity["bytes"]) is not int
        or identity["bytes"] != len(raw)
        or _require_sha256(identity["sha256"], f"{label} SHA-256")
        != _sha256(raw)
    ):
        raise ScoringError(f"{label} byte/SHA/path identity mismatch")


def _validate_artifact_receipt(
    value: Mapping[str, Any],
    *,
    lane: str,
    artifact_names: Sequence[str],
    reference_name: str,
) -> None:
    expected_keys = {
        "schema",
        "artifacts",
        "tune_opened",
        "sealed_labels_generated",
        "sealed_scores_opened",
        "live_weights_changed",
    }
    if set(value) != expected_keys:
        raise ScoringError("artifact receipt keys mismatch")
    if value["schema"] != (
        "shogi-child-board-strength-candidate-artifact-set-v1"
    ):
        raise ScoringError("artifact receipt schema mismatch")
    artifacts = value["artifacts"]
    all_names = [reference_name, *artifact_names]
    if type(artifacts) is not dict or set(artifacts) != set(all_names):
        raise ScoringError("artifact receipt roles mismatch")
    seen: set[tuple[str, int, str]] = set()
    for name in all_names:
        identity = artifacts[name]
        if type(identity) is not dict or set(identity) != {
            "path",
            "bytes",
            "sha256",
            "role",
        }:
            raise ScoringError(f"artifact identity malformed: {name}")
        if (
            type(identity["path"]) is not str
            or not identity["path"]
            or type(identity["bytes"]) is not int
            or identity["bytes"] < 1
            or identity["role"] != name
        ):
            raise ScoringError(f"artifact path/bytes/role mismatch: {name}")
        sha = _require_sha256(identity["sha256"], f"artifact {name}")
        key = (identity["path"], identity["bytes"], sha)
        if key in seen:
            raise ScoringError("artifact identities must be distinct")
        seen.add(key)
    expected_flags = {
        "tune": (False, False, False),
        "sealed": (True, True, False),
    }
    try:
        tune_opened, labels_generated, sealed_scores = expected_flags[lane]
    except KeyError as error:
        raise ScoringError(f"unknown scoring lane: {lane}") from error
    if (
        value["tune_opened"] is not tune_opened
        or value["sealed_labels_generated"] is not labels_generated
        or value["sealed_scores_opened"] is not sealed_scores
        or value["live_weights_changed"] is not False
    ):
        raise ScoringError("artifact receipt protected-state mismatch")


def _verify_artifact_files(
    value: Mapping[str, Any],
    *,
    artifact_names: Sequence[str],
    reference_name: str,
) -> None:
    for name in [reference_name, *artifact_names]:
        registered = value["artifacts"][name]
        path = Path(registered["path"])
        raw = _read_regular_no_symlink(path, f"frozen artifact {name}")
        if (
            len(raw) != registered["bytes"]
            or _sha256(raw) != registered["sha256"]
        ):
            raise ScoringError(f"frozen artifact byte/SHA mismatch: {name}")


def _validate_bundle_receipt(
    value: Mapping[str, Any],
    *,
    lane: str,
    bundle_path: Path,
    artifact_receipt_raw: bytes,
    domains: Sequence[Mapping[str, Any]],
) -> None:
    expected_keys = {
        "schema",
        "lane",
        "bundle",
        "domains",
        "artifact_receipt_sha256",
        "source_receipts",
        "rows",
        "parents",
    }
    if set(value) != expected_keys:
        raise ScoringError("score-bundle receipt keys mismatch")
    if value["schema"] != (
        "shogi-child-board-strength-candidate-score-bundle-receipt-v1"
    ) or value["lane"] != lane:
        raise ScoringError("score-bundle receipt schema/lane mismatch")
    bundle = value["bundle"]
    if (
        type(bundle) is not dict
        or set(bundle) != {"path", "bytes", "sha256"}
        or bundle["path"] != str(bundle_path)
        or type(bundle["bytes"]) is not int
        or bundle["bytes"] < 1
    ):
        raise ScoringError("score-bundle registered identity is malformed")
    _require_sha256(bundle["sha256"], "score-bundle")
    expected_domains = [entry["name"] for entry in domains]
    expected_parents = sum(int(entry["parents"]) for entry in domains)
    sources = value["source_receipts"]
    if (
        value["domains"] != expected_domains
        or type(value["rows"]) is not int
        or value["rows"] < expected_parents * 2
        or value["parents"] != expected_parents
        or value["artifact_receipt_sha256"] != _sha256(artifact_receipt_raw)
        or type(sources) is not dict
        or set(sources) != set(expected_domains)
    ):
        raise ScoringError("score-bundle completeness receipt mismatch")
    for domain in expected_domains:
        identity = sources[domain]
        if (
            type(identity) is not dict
            or set(identity) != {"path", "bytes", "sha256"}
            or type(identity["path"]) is not str
            or not identity["path"]
            or type(identity["bytes"]) is not int
            or identity["bytes"] < 1
        ):
            raise ScoringError(f"source receipt identity malformed: {domain}")
        _require_sha256(identity["sha256"], f"source receipt {domain}")


def parse_score_bundle(
    raw: bytes,
    *,
    domains: Sequence[Mapping[str, Any]],
    score_row_schema: str,
    score_keys: Sequence[str],
) -> dict[str, list[list[ScoreRow]]]:
    """Parse one complete canonically ordered score bundle."""

    if (
        raw.startswith(b"\xef\xbb\xbf")
        or b"\r" in raw
        or b"\0" in raw
        or not raw.endswith(b"\n")
        or raw.endswith(b"\n\n")
    ):
        raise ScoringError("score bundle JSONL framing is not canonical")
    raw_lines = raw[:-1].split(b"\n")
    if not raw_lines or any(not line for line in raw_lines):
        raise ScoringError("score bundle must contain non-empty rows")
    expected_domain_names = [str(domain["name"]) for domain in domains]
    domain_order = {
        name: index for index, name in enumerate(expected_domain_names)
    }
    expected_row_keys = {
        "schema",
        "domain",
        "parent_id",
        "move",
        "teacher_cp",
        "scores",
    }
    rows: list[ScoreRow] = []
    previous_key: tuple[int, bytes, bytes] | None = None
    for line_number, raw_line in enumerate(raw_lines, start=1):
        value = strict_json_bytes(raw_line, f"score row {line_number}")
        if set(value) != expected_row_keys or value["schema"] != score_row_schema:
            raise ScoringError(f"score row {line_number} schema/keys mismatch")
        domain = value["domain"]
        parent_id = value["parent_id"]
        move = value["move"]
        teacher_cp = value["teacher_cp"]
        scores = value["scores"]
        if (
            type(domain) is not str
            or domain not in domain_order
            or type(parent_id) is not str
            or not parent_id
            or type(move) is not str
            or _USI_RE.fullmatch(move) is None
            or type(teacher_cp) not in (int, float)
            or not math.isfinite(float(teacher_cp))
            or type(scores) is not dict
            or set(scores) != set(score_keys)
        ):
            raise ScoringError(f"score row {line_number} fields mismatch")
        captured_scores: dict[str, float] = {}
        for name in score_keys:
            score = scores[name]
            if type(score) not in (int, float) or not math.isfinite(float(score)):
                raise ScoringError(
                    f"score row {line_number} non-finite score: {name}"
                )
            captured_scores[name] = float(score)
        key = (domain_order[domain], _byte_key(parent_id), _byte_key(move))
        if previous_key is not None and key <= previous_key:
            raise ScoringError("score rows are not in strict registered order")
        previous_key = key
        rows.append(
            ScoreRow(
                domain,
                parent_id,
                move,
                float(teacher_cp),
                captured_scores,
            )
        )

    grouped: dict[str, list[list[ScoreRow]]] = {
        name: [] for name in expected_domain_names
    }
    for domain_name in expected_domain_names:
        domain_rows = [row for row in rows if row.domain == domain_name]
        current: list[ScoreRow] = []
        for row in domain_rows:
            if current and row.parent_id != current[0].parent_id:
                grouped[domain_name].append(current)
                current = []
            current.append(row)
        if current:
            grouped[domain_name].append(current)
        expected_parents = next(
            int(entry["parents"])
            for entry in domains
            if entry["name"] == domain_name
        )
        if len(grouped[domain_name]) != expected_parents:
            raise ScoringError(
                f"{domain_name} parent count mismatch: "
                f"{len(grouped[domain_name])}/{expected_parents}"
            )
        for group in grouped[domain_name]:
            if len(group) < 2 or len({row.move for row in group}) != len(group):
                raise ScoringError(
                    f"{domain_name}/{group[0].parent_id} is not all-legal complete"
                )
    return grouped


def _parent_metrics(
    group: Sequence[ScoreRow],
    artifact: str,
) -> dict[str, object]:
    teacher_best = max(row.teacher_cp for row in group)
    predicted_best = max(row.scores[artifact] for row in group)
    selected = [
        row for row in group if row.scores[artifact] == predicted_best
    ]
    top1_correct = all(row.teacher_cp == teacher_best for row in selected)
    regret = teacher_best - min(row.teacher_cp for row in selected)
    pair_correct = 0
    pair_count = 0
    for left_index, left in enumerate(group):
        for right in group[left_index + 1 :]:
            teacher_delta = left.teacher_cp - right.teacher_cp
            if abs(teacher_delta) < PAIR_GAP_CP:
                continue
            prediction_delta = (
                left.scores[artifact] - right.scores[artifact]
            )
            pair_count += 1
            if prediction_delta * teacher_delta > 0:
                pair_correct += 1

    def relevance(row: ScoreRow) -> float:
        delta = max(NDCG_CLAMP_CP, min(0.0, row.teacher_cp - teacher_best))
        return math.exp(delta / NDCG_TEMPERATURE_CP)

    predicted_order = sorted(
        group,
        key=lambda row: (
            -row.scores[artifact],
            row.teacher_cp,
            _byte_key(row.move),
        ),
    )[:5]
    ideal_order = sorted(
        group,
        key=lambda row: (-row.teacher_cp, _byte_key(row.move)),
    )[:5]

    def dcg(order: Sequence[ScoreRow]) -> float:
        return sum(
            relevance(row) / math.log2(rank + 1)
            for rank, row in enumerate(order, start=1)
        )

    ideal = dcg(ideal_order)
    ndcg = 0.0 if ideal == 0.0 else dcg(predicted_order) / ideal
    return {
        "parent_id": group[0].parent_id,
        "top1_correct": top1_correct,
        "regret_cp": regret,
        "pair_correct": pair_correct,
        "pair_count": pair_count,
        "ndcg_at_5": ndcg,
    }


def score_domain(
    groups: Sequence[Sequence[ScoreRow]],
    *,
    artifacts: Sequence[str],
) -> tuple[dict[str, dict[str, object]], dict[str, list[bool]]]:
    if not groups:
        raise ScoringError("cannot score an empty domain")
    metrics: dict[str, dict[str, object]] = {}
    correctness: dict[str, list[bool]] = {}
    for artifact in artifacts:
        parents = [_parent_metrics(group, artifact) for group in groups]
        pair_count = sum(int(parent["pair_count"]) for parent in parents)
        if pair_count == 0:
            raise ScoringError("domain contains no eligible 50-CP move pairs")
        top1 = [bool(parent["top1_correct"]) for parent in parents]
        pair_correct = sum(int(parent["pair_correct"]) for parent in parents)
        metrics[artifact] = {
            "parents": len(parents),
            "top1_correct": sum(top1),
            "top1_accuracy": sum(top1) / len(parents),
            "mean_regret_cp": sum(
                float(parent["regret_cp"]) for parent in parents
            )
            / len(parents),
            "pair_count": pair_count,
            "pair_accuracy": pair_correct / pair_count,
            "ndcg_at_5": sum(
                float(parent["ndcg_at_5"]) for parent in parents
            )
            / len(parents),
        }
        correctness[artifact] = top1
    return metrics, correctness


def exact_one_sided_mcnemar(
    artifact_correct: Sequence[bool],
    live_correct: Sequence[bool],
) -> dict[str, object]:
    if len(artifact_correct) != len(live_correct) or not artifact_correct:
        raise ScoringError("McNemar inputs must be equal non-empty vectors")
    b = sum(
        candidate and not live
        for candidate, live in zip(artifact_correct, live_correct)
    )
    c = sum(
        not candidate and live
        for candidate, live in zip(artifact_correct, live_correct)
    )
    n = b + c
    if n == 0:
        numerator = 1
        denominator = 1
    else:
        numerator = sum(math.comb(n, value) for value in range(b, n + 1))
        denominator = 1 << n
    return {
        "b": b,
        "c": c,
        "n": n,
        "p_numerator": str(numerator),
        "p_denominator": str(denominator),
        "p_value": numerator / denominator,
        "maximum_p": 0.05,
        "pass": 20 * numerator <= denominator,
    }


def _passes_thresholds(
    metrics: Mapping[str, object],
    gates: Mapping[str, object],
) -> tuple[bool, dict[str, bool]]:
    checks: dict[str, bool] = {}
    mapping = {
        "minimum_top1_correct": ("top1_correct", lambda left, right: left >= right),
        "minimum_top1_accuracy": (
            "top1_accuracy",
            lambda left, right: left >= right,
        ),
        "minimum_pair_accuracy": (
            "pair_accuracy",
            lambda left, right: left >= right,
        ),
        "maximum_mean_regret_cp": (
            "mean_regret_cp",
            lambda left, right: left <= right,
        ),
    }
    for gate_name, gate_value in gates.items():
        try:
            metric_name, comparison = mapping[gate_name]
        except KeyError as error:
            raise ScoringError(f"unknown tune gate: {gate_name}") from error
        checks[gate_name] = comparison(metrics[metric_name], gate_value)
    return all(checks.values()), checks


def build_tune_result(
    grouped: Mapping[str, Sequence[Sequence[ScoreRow]]],
    *,
    contract: Mapping[str, Any],
    artifact_receipt: Mapping[str, Any],
    artifact_receipt_identity: Mapping[str, object],
    bundle_receipt_identity: Mapping[str, object],
) -> dict[str, Any]:
    artifact_names = list(contract["artifact_names"])
    reference = str(contract["reference_name"])
    tune_contract = contract["tune"]
    results: dict[str, object] = {}
    all_pass = True
    for domain in tune_contract["domains"]:
        name = domain["name"]
        metrics, _ = score_domain(
            grouped[name],
            artifacts=[reference, *artifact_names],
        )
        artifacts_result: dict[str, object] = {}
        for artifact in artifact_names:
            passed, checks = _passes_thresholds(
                metrics[artifact], domain["gates"]
            )
            all_pass = all_pass and passed
            artifacts_result[artifact] = {
                "metrics": metrics[artifact],
                "checks": checks,
                "pass": passed,
            }
        results[name] = {
            "reference_metrics": metrics[reference],
            "artifacts": artifacts_result,
        }
    status = (
        tune_contract["success_status"]
        if all_pass
        else tune_contract["failure_status"]
    )
    return {
        "schema": "shogi-child-board-strength-candidate-tune-result-v1",
        "status": status,
        "lane": "tune",
        "pass": all_pass,
        "artifact_receipt": dict(artifact_receipt_identity),
        "score_bundle_receipt": dict(bundle_receipt_identity),
        "artifact_sha256": {
            name: artifact_receipt["artifacts"][name]["sha256"]
            for name in [reference, *artifact_names]
        },
        "domains": results,
        **dict(tune_contract["result_flags"]),
    }


def build_sealed_result(
    grouped: Mapping[str, Sequence[Sequence[ScoreRow]]],
    *,
    contract: Mapping[str, Any],
    artifact_receipt: Mapping[str, Any],
    artifact_receipt_identity: Mapping[str, object],
    bundle_receipt_identity: Mapping[str, object],
) -> dict[str, Any]:
    artifact_names = list(contract["artifact_names"])
    reference = str(contract["reference_name"])
    sealed = contract["sealed"]
    domain = str(sealed["score_domain"])
    metrics, correctness = score_domain(
        grouped[domain],
        artifacts=[reference, *artifact_names],
    )
    gates = sealed["gates"]
    artifacts_result: dict[str, object] = {}
    all_pass = True
    for artifact in artifact_names:
        gains = {
            "top1_correct_gain": (
                int(metrics[artifact]["top1_correct"])
                - int(metrics[reference]["top1_correct"])
            ),
            "pair_accuracy_gain": (
                float(metrics[artifact]["pair_accuracy"])
                - float(metrics[reference]["pair_accuracy"])
            ),
            "ndcg_at_5_gain": (
                float(metrics[artifact]["ndcg_at_5"])
                - float(metrics[reference]["ndcg_at_5"])
            ),
        }
        mcnemar = exact_one_sided_mcnemar(
            correctness[artifact], correctness[reference]
        )
        checks = {
            "minimum_top1_correct_gain": (
                gains["top1_correct_gain"]
                >= gates["minimum_top1_correct_gain"]
            ),
            "minimum_pair_accuracy_gain": (
                gains["pair_accuracy_gain"]
                >= gates["minimum_pair_accuracy_gain"]
            ),
            "minimum_ndcg_at_5_gain": (
                gains["ndcg_at_5_gain"]
                >= gates["minimum_ndcg_at_5_gain"]
            ),
            "mcnemar_one_sided_maximum_p": bool(mcnemar["pass"]),
        }
        passed = all(checks.values())
        all_pass = all_pass and passed
        artifacts_result[artifact] = {
            "metrics": metrics[artifact],
            "gains_over_exact_live": gains,
            "mcnemar_one_sided": mcnemar,
            "checks": checks,
            "pass": passed,
        }
    status = (
        sealed["success_status"]
        if all_pass
        else sealed["failure_status"]
    )
    return {
        "schema": "shogi-child-board-strength-candidate-sealed-result-v1",
        "status": status,
        "lane": "sealed",
        "pass": all_pass,
        "artifact_receipt": dict(artifact_receipt_identity),
        "score_bundle_receipt": dict(bundle_receipt_identity),
        "artifact_sha256": {
            name: artifact_receipt["artifacts"][name]["sha256"]
            for name in [reference, *artifact_names]
        },
        "reference_metrics": metrics[reference],
        "artifacts": artifacts_result,
        **dict(sealed["result_flags"]),
    }


def _validate_embedded_identity(value: object, label: str) -> None:
    if (
        type(value) is not dict
        or set(value) != {"path", "bytes", "sha256"}
        or type(value["path"]) is not str
        or not value["path"]
        or type(value["bytes"]) is not int
        or value["bytes"] < 1
    ):
        raise ScoringError(f"terminal {label} identity malformed")
    _require_sha256(value["sha256"], f"terminal {label}")


def _validate_metric_summary(value: object, label: str) -> Mapping[str, Any]:
    keys = {
        "parents",
        "top1_correct",
        "top1_accuracy",
        "mean_regret_cp",
        "pair_count",
        "pair_accuracy",
        "ndcg_at_5",
    }
    if type(value) is not dict or set(value) != keys:
        raise ScoringError(f"{label} metric keys mismatch")
    parents = value["parents"]
    correct = value["top1_correct"]
    pair_count = value["pair_count"]
    numeric = (
        value["top1_accuracy"],
        value["mean_regret_cp"],
        value["pair_accuracy"],
        value["ndcg_at_5"],
    )
    if (
        type(parents) is not int
        or parents < 1
        or type(correct) is not int
        or not 0 <= correct <= parents
        or type(pair_count) is not int
        or pair_count < 1
        or any(
            type(item) not in (int, float) or not math.isfinite(float(item))
            for item in numeric
        )
        or value["top1_accuracy"] != correct / parents
        or value["mean_regret_cp"] < 0
        or not 0 <= value["pair_accuracy"] <= 1
        or not 0 <= value["ndcg_at_5"] <= 1 + 1e-12
    ):
        raise ScoringError(f"{label} metric values mismatch")
    return value


def _validate_stored_mcnemar(value: object) -> bool:
    expected_keys = {
        "b",
        "c",
        "n",
        "p_numerator",
        "p_denominator",
        "p_value",
        "maximum_p",
        "pass",
    }
    if type(value) is not dict or set(value) != expected_keys:
        raise ScoringError("stored McNemar keys mismatch")
    b = value["b"]
    c = value["c"]
    n = value["n"]
    if (
        type(b) is not int
        or type(c) is not int
        or type(n) is not int
        or b < 0
        or c < 0
        or n != b + c
    ):
        raise ScoringError("stored McNemar counts mismatch")
    if n == 0:
        numerator, denominator = 1, 1
    else:
        numerator = sum(math.comb(n, index) for index in range(b, n + 1))
        denominator = 1 << n
    passed = 20 * numerator <= denominator
    if (
        value["p_numerator"] != str(numerator)
        or value["p_denominator"] != str(denominator)
        or value["p_value"] != numerator / denominator
        or value["maximum_p"] != 0.05
        or value["pass"] is not passed
    ):
        raise ScoringError("stored exact McNemar calculation mismatch")
    return passed


def _validate_terminal_result(
    value: Mapping[str, Any],
    *,
    lane: str,
    contract: Mapping[str, Any],
) -> None:
    lane_contract = contract[lane]
    expected_schema = (
        "shogi-child-board-strength-candidate-tune-result-v1"
        if lane == "tune"
        else "shogi-child-board-strength-candidate-sealed-result-v1"
    )
    if (
        value.get("schema") != expected_schema
        or value.get("lane") != lane
        or value.get("status")
        not in {
            lane_contract["success_status"],
            lane_contract["failure_status"],
        }
        or type(value.get("pass")) is not bool
    ):
        raise ScoringError("terminal scoring result schema/status mismatch")
    for key, expected in lane_contract["result_flags"].items():
        if value.get(key) is not expected:
            raise ScoringError(f"terminal protected flag mismatch: {key}")
    _validate_embedded_identity(value.get("artifact_receipt"), "artifact receipt")
    _validate_embedded_identity(
        value.get("score_bundle_receipt"), "score-bundle receipt"
    )
    artifact_sha = value.get("artifact_sha256")
    names = [contract["reference_name"], *contract["artifact_names"]]
    if type(artifact_sha) is not dict or set(artifact_sha) != set(names):
        raise ScoringError("terminal artifact completeness mismatch")
    for name in names:
        _require_sha256(artifact_sha[name], f"terminal artifact {name}")
    artifact_names = list(contract["artifact_names"])
    if lane == "tune":
        expected_keys = {
            "schema",
            "status",
            "lane",
            "pass",
            "artifact_receipt",
            "score_bundle_receipt",
            "artifact_sha256",
            "domains",
            *lane_contract["result_flags"],
        }
        domains = value.get("domains")
        expected_domains = [entry["name"] for entry in lane_contract["domains"]]
        if (
            set(value) != expected_keys
            or type(domains) is not dict
            or list(domains) != expected_domains
        ):
            raise ScoringError("terminal tune domain completeness mismatch")
        computed_pass = True
        for domain_contract in lane_contract["domains"]:
            name = domain_contract["name"]
            domain = domains[name]
            if (
                type(domain) is not dict
                or set(domain) != {"reference_metrics", "artifacts"}
                or type(domain["artifacts"]) is not dict
                or set(domain["artifacts"]) != set(artifact_names)
            ):
                raise ScoringError(f"terminal tune domain malformed: {name}")
            reference_metrics = _validate_metric_summary(
                domain["reference_metrics"], f"{name}/exact_live"
            )
            if reference_metrics["parents"] != domain_contract["parents"]:
                raise ScoringError(f"terminal tune parent count mismatch: {name}")
            for artifact in artifact_names:
                entry = domain["artifacts"][artifact]
                if type(entry) is not dict or set(entry) != {
                    "metrics",
                    "checks",
                    "pass",
                }:
                    raise ScoringError(f"terminal tune artifact malformed: {artifact}")
                metrics = _validate_metric_summary(
                    entry["metrics"], f"{name}/{artifact}"
                )
                if metrics["parents"] != domain_contract["parents"]:
                    raise ScoringError(
                        f"terminal tune artifact parent mismatch: {artifact}"
                    )
                passed, checks = _passes_thresholds(
                    metrics, domain_contract["gates"]
                )
                if entry["checks"] != checks or entry["pass"] is not passed:
                    raise ScoringError(
                        f"terminal tune gate calculation mismatch: {artifact}"
                    )
                computed_pass = computed_pass and passed
    else:
        expected_keys = {
            "schema",
            "status",
            "lane",
            "pass",
            "artifact_receipt",
            "score_bundle_receipt",
            "artifact_sha256",
            "reference_metrics",
            "artifacts",
            *lane_contract["result_flags"],
        }
        artifacts = value.get("artifacts")
        if (
            set(value) != expected_keys
            or type(artifacts) is not dict
            or set(artifacts) != set(artifact_names)
        ):
            raise ScoringError("terminal sealed artifact completeness mismatch")
        reference_metrics = _validate_metric_summary(
            value.get("reference_metrics"), "sealed/exact_live"
        )
        if reference_metrics["parents"] != lane_contract["parents"]:
            raise ScoringError("terminal sealed reference parent count mismatch")
        gates = lane_contract["gates"]
        if gates["mcnemar_one_sided_maximum_p"] != 0.05:
            raise ScoringError("terminal sealed McNemar threshold drift")
        computed_pass = True
        for artifact in artifact_names:
            entry = artifacts[artifact]
            if type(entry) is not dict or set(entry) != {
                "metrics",
                "gains_over_exact_live",
                "mcnemar_one_sided",
                "checks",
                "pass",
            }:
                raise ScoringError(f"terminal sealed artifact malformed: {artifact}")
            metrics = _validate_metric_summary(
                entry["metrics"], f"sealed/{artifact}"
            )
            gains = {
                "top1_correct_gain": (
                    metrics["top1_correct"]
                    - reference_metrics["top1_correct"]
                ),
                "pair_accuracy_gain": (
                    metrics["pair_accuracy"]
                    - reference_metrics["pair_accuracy"]
                ),
                "ndcg_at_5_gain": (
                    metrics["ndcg_at_5"]
                    - reference_metrics["ndcg_at_5"]
                ),
            }
            mcnemar_pass = _validate_stored_mcnemar(
                entry["mcnemar_one_sided"]
            )
            checks = {
                "minimum_top1_correct_gain": (
                    gains["top1_correct_gain"]
                    >= gates["minimum_top1_correct_gain"]
                ),
                "minimum_pair_accuracy_gain": (
                    gains["pair_accuracy_gain"]
                    >= gates["minimum_pair_accuracy_gain"]
                ),
                "minimum_ndcg_at_5_gain": (
                    gains["ndcg_at_5_gain"]
                    >= gates["minimum_ndcg_at_5_gain"]
                ),
                "mcnemar_one_sided_maximum_p": mcnemar_pass,
            }
            passed = all(checks.values())
            if (
                entry["gains_over_exact_live"] != gains
                or entry["checks"] != checks
                or entry["pass"] is not passed
                or metrics["parents"] != lane_contract["parents"]
            ):
                raise ScoringError(
                    f"terminal sealed gate calculation mismatch: {artifact}"
                )
            computed_pass = computed_pass and passed
    expected_status = (
        lane_contract["success_status"]
        if computed_pass
        else lane_contract["failure_status"]
    )
    if value["pass"] is not computed_pass or value["status"] != expected_status:
        raise ScoringError("terminal scoring result decision/status mismatch")


def _lane_paths(
    registry: Mapping[str, Any],
    lane: str,
) -> dict[str, Path]:
    output = registry["outputs"][lane]
    return {
        "artifact_receipt": Path(output["artifact_receipt"]),
        "score_bundle": Path(output["score_bundle"]),
        "score_bundle_receipt": Path(output["score_bundle_receipt"]),
        "opened_marker": Path(output["opened_marker"]),
        "pending_result": Path(output["pending_result"]),
        "result": Path(output["result"]),
    }


def run_one_shot(
    *,
    lane: str,
    registry: Mapping[str, Any],
    paths_override: Mapping[str, Path] | None = None,
    contract_override: Mapping[str, Any] | None = None,
    fault_after_pending: bool = False,
    verify_artifact_files: bool = True,
) -> dict[str, Any]:
    """Run once, or perform validation/terminalize-only recovery."""

    if lane not in ("tune", "sealed"):
        raise ScoringError("lane must be tune or sealed")
    contract = (
        contract_override
        if contract_override is not None
        else registry["execution_contract"]
    )
    paths = (
        dict(paths_override)
        if paths_override is not None
        else _lane_paths(registry, lane)
    )
    required_paths = {
        "artifact_receipt",
        "score_bundle",
        "score_bundle_receipt",
        "opened_marker",
        "pending_result",
        "result",
    }
    if set(paths) != required_paths:
        raise ScoringError("one-shot path set mismatch")
    result_path = paths["result"]
    pending_path = paths["pending_result"]
    if result_path.exists():
        result = strict_json_bytes(
            _read_regular_no_symlink(result_path, "terminal result"),
            "terminal result",
        )
        _validate_terminal_result(result, lane=lane, contract=contract)
        return {**result, "recovery": "validated-existing-terminal-result"}
    if pending_path.exists():
        pending_raw = _read_regular_no_symlink(
            pending_path, "pending complete result"
        )
        result = strict_json_bytes(pending_raw, "pending complete result")
        _validate_terminal_result(result, lane=lane, contract=contract)
        _atomic_create(result_path, pending_raw)
        return {**result, "recovery": "terminalized-existing-complete-pending"}
    if paths["opened_marker"].exists():
        raise ScoringError(
            "opened marker exists without complete result; lane is closed"
        )

    artifact_raw = _read_regular_no_symlink(
        paths["artifact_receipt"], "artifact receipt"
    )
    artifact_receipt = strict_json_bytes(artifact_raw, "artifact receipt")
    artifact_names = list(contract["artifact_names"])
    reference_name = str(contract["reference_name"])
    _validate_artifact_receipt(
        artifact_receipt,
        lane=lane,
        artifact_names=artifact_names,
        reference_name=reference_name,
    )
    if verify_artifact_files:
        _verify_artifact_files(
            artifact_receipt,
            artifact_names=artifact_names,
            reference_name=reference_name,
        )
    bundle_receipt_raw = _read_regular_no_symlink(
        paths["score_bundle_receipt"], "score-bundle receipt"
    )
    bundle_receipt = strict_json_bytes(
        bundle_receipt_raw, "score-bundle receipt"
    )
    domains = (
        contract["tune"]["domains"]
        if lane == "tune"
        else [
            {
                "name": contract["sealed"]["score_domain"],
                "parents": contract["sealed"]["parents"],
            }
        ]
    )
    _validate_bundle_receipt(
        bundle_receipt,
        lane=lane,
        bundle_path=paths["score_bundle"],
        artifact_receipt_raw=artifact_raw,
        domains=domains,
    )
    marker = {
        "schema": f"shogi-child-board-strength-candidate-{lane}-opened-v1",
        "status": "protected-score-bundle-open-committed-no-rerun",
        "lane": lane,
        "artifact_receipt": _identity(
            paths["artifact_receipt"], artifact_raw
        ),
        "score_bundle_receipt": _identity(
            paths["score_bundle_receipt"], bundle_receipt_raw
        ),
        "tune_opened": True,
        "sealed_scores_opened": lane == "sealed",
        "live_weights_changed": False,
    }
    _atomic_create(paths["opened_marker"], _canonical_json(marker))

    bundle_raw = _read_regular_no_symlink(
        paths["score_bundle"], "protected score bundle"
    )
    _verify_identity(
        bundle_receipt["bundle"],
        raw=bundle_raw,
        expected_path=paths["score_bundle"],
        label="protected score bundle",
    )
    grouped = parse_score_bundle(
        bundle_raw,
        domains=domains,
        score_row_schema=contract["score_row_schema"],
        score_keys=contract["score_row"]["score_keys"],
    )
    actual_parents = sum(len(groups) for groups in grouped.values())
    actual_rows = sum(
        len(group)
        for groups in grouped.values()
        for group in groups
    )
    if (
        actual_parents != bundle_receipt["parents"]
        or actual_rows != bundle_receipt["rows"]
    ):
        raise ScoringError("score bundle differs from completeness receipt")
    artifact_identity = _identity(paths["artifact_receipt"], artifact_raw)
    bundle_receipt_identity = _identity(
        paths["score_bundle_receipt"], bundle_receipt_raw
    )
    if lane == "tune":
        result = build_tune_result(
            grouped,
            contract=contract,
            artifact_receipt=artifact_receipt,
            artifact_receipt_identity=artifact_identity,
            bundle_receipt_identity=bundle_receipt_identity,
        )
    else:
        result = build_sealed_result(
            grouped,
            contract=contract,
            artifact_receipt=artifact_receipt,
            artifact_receipt_identity=artifact_identity,
            bundle_receipt_identity=bundle_receipt_identity,
        )
    if verify_artifact_files:
        _verify_artifact_files(
            artifact_receipt,
            artifact_names=artifact_names,
            reference_name=reference_name,
        )
    result_raw = _canonical_json(result)
    _atomic_create(pending_path, result_raw)
    if fault_after_pending:
        raise ScoringError("injected fault after complete pending publication")
    _atomic_create(result_path, result_raw)
    return {**result, "recovery": "fresh-one-shot-complete"}


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lane", required=True, choices=("tune", "sealed"))
    parser.add_argument("--repo-root", type=Path)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    registry = REGISTRY.validate_checked_in_registry(args.repo_root)
    try:
        result = run_one_shot(lane=args.lane, registry=registry)
    except (OSError, ScoringError) as error:
        raise SystemExit(f"{args.lane} scoring refused: {error}") from error
    print(
        json.dumps(
            {
                "schema": result["schema"],
                "status": result["status"],
                "pass": result["pass"],
                "recovery": result["recovery"],
            },
            sort_keys=True,
            separators=(",", ":"),
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
