"""Preregistered, resumable fixed-time NNUE playing-strength gates.

The heavy game process remains ``wasm-spike/match-nnue-vs-v3.ts``.  This
module binds arbitrary weight/runtime assets, gives every color-swapped pair
one preregistered seed, persists only complete pairs, and applies the three
bounded decisions used by the two-week experiment:

* ``screen56``: 28 pairs, 62 half-points, mathematical-futility stop allowed;
* ``independent96``: 48 pairs, one-sided 95% paired-bootstrap lower > 0.50;
* ``formal768``: 384 pairs, the existing formal-v2 paired-bootstrap rules.

It does not write live weights and it cannot turn a partial or faulted run
into a passing result.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import random
import re
import subprocess
import tempfile
from typing import Any

import formal_paired_ab_protocol_v2 as formal_v2


MANIFEST_SCHEMA = "shogi-nnue-fixed-time-gate-manifest-v1"
PAIR_RECEIPT_SCHEMA = "shogi-nnue-fixed-time-pair-receipt-v1"
GATE_REPORT_SCHEMA = "shogi-nnue-fixed-time-gate-report-v1"
TT_POLICY = "clear-before-each-game-retain-within-game"
COLOR_ORDER = ["candidate-sente", "candidate-gote"]
HARNESS_RELATIVE_PATH = "wasm-spike/match-nnue-vs-v3.ts"
MAX_SEED = ((1 << 53) - 1) // 15_485_863
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
SEMANTIC_ID_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
GAME_RE = re.compile(
    r"^game ([12])/2: NNUE=(SENTE|GOTE) opening=([0-9a-f]{64}) => "
    r"(?:(WIN NNUE-([AB])\([^\n]*\))|(DRAW \([^\n]*\))) "
    r"plies=([0-9]+) time=([0-9]+(?:\.[0-9]+)?)s$"
)
LEGAL_SUMMARY_RE = re.compile(r"\(all ([0-9]+) moves legal\)")


class NnueFixedTimeGateError(ValueError):
    """The manifest, durable state, child match, or result is invalid."""


@dataclass(frozen=True)
class PairResult:
    pair_index: int
    seed: int
    opening_fingerprint: str
    candidate_sente: str
    candidate_gote: str
    legal_moves: int
    log_bytes: int
    log_sha256: str

    @property
    def halfpoints(self) -> int:
        return _result_halfpoints(self.candidate_sente) + _result_halfpoints(
            self.candidate_gote
        )


@dataclass(frozen=True)
class ChildResult:
    returncode: int
    stdout: bytes
    stderr: bytes = b""


PairExecutor = Callable[
    [str | Path, Mapping[str, Any], int, int],
    ChildResult,
]


_GATE_SPECS = {
    "screen56": {
        "pairs": 28,
        "games": 56,
        "analysis": "halfpoints-threshold",
        "screen_pass_halfpoints": 62,
        "futility": True,
        "bootstrap_seed": None,
        "bootstrap_replicates": 0,
    },
    "independent96": {
        "pairs": 48,
        "games": 96,
        "analysis": "one-sided-95-paired-bootstrap-lower-above-0.50",
        "screen_pass_halfpoints": None,
        "futility": False,
        "bootstrap_seed": 20_260_721,
        "bootstrap_replicates": 100_000,
    },
    "formal768": {
        "pairs": formal_v2.PAIR_COUNT,
        "games": formal_v2.GAME_COUNT,
        "analysis": "formal-v2-strict-paired-bootstrap",
        "screen_pass_halfpoints": None,
        "futility": False,
        "bootstrap_seed": formal_v2.BOOTSTRAP_SEED,
        "bootstrap_replicates": formal_v2.BOOTSTRAP_REPLICATES,
    },
}


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _strict_json_loads(raw: bytes) -> Any:
    def object_hook(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in pairs:
            if key in result:
                raise NnueFixedTimeGateError("JSON contains a duplicate object key")
            result[key] = value
        return result

    def reject_constant(_value: str) -> None:
        raise NnueFixedTimeGateError("JSON contains a nonfinite number")

    try:
        return json.loads(
            raw,
            object_pairs_hook=object_hook,
            parse_constant=reject_constant,
        )
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise NnueFixedTimeGateError("JSON is invalid") from error


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _sha256_json(domain: str, value: Any) -> str:
    return _sha256_bytes((domain + "\0" + _canonical_json(value)).encode("utf-8"))


def _exact_dict(value: Any, fields: set[str], label: str) -> dict[str, Any]:
    if type(value) is not dict or set(value) != fields or any(
        type(key) is not str for key in value
    ):
        raise NnueFixedTimeGateError(f"{label} fields differ")
    return value


def _require_sha256(value: Any, label: str) -> str:
    if type(value) is not str or SHA256_RE.fullmatch(value) is None:
        raise NnueFixedTimeGateError(f"{label} is not a lowercase SHA-256")
    return value


def _require_positive_int(value: Any, label: str) -> int:
    if type(value) is not int or value < 1:
        raise NnueFixedTimeGateError(f"{label} must be a positive integer")
    return value


def opening_set_sha256(kind: str, seeds: Sequence[int]) -> str:
    """Content identity for one preregistered ordered opening-seed set."""

    return _sha256_json(
        "shogi-nnue-fixed-time-opening-seed-set-v1",
        {"gate": kind, "games_per_pair": 2, "seeds": list(seeds)},
    )


def _validate_asset(value: Any, label: str, *, require_buckets: bool) -> dict[str, Any]:
    fields = {"path", "bytes", "sha256"} | ({"buckets"} if require_buckets else set())
    asset = _exact_dict(value, fields, label)
    if type(asset["path"]) is not str or not asset["path"] or "\0" in asset["path"]:
        raise NnueFixedTimeGateError(f"{label} path is invalid")
    _require_positive_int(asset["bytes"], f"{label} bytes")
    _require_sha256(asset["sha256"], f"{label} SHA-256")
    if require_buckets:
        buckets = _require_positive_int(asset["buckets"], f"{label} buckets")
        if buckets > 65_535:
            raise NnueFixedTimeGateError(f"{label} buckets is too large")
    return dict(asset)


def validate_manifest(value: Any) -> dict[str, Any]:
    """Validate the exact three-gate preregistration and cross-gate disjointness."""

    manifest = _exact_dict(
        value,
        {"schema", "experiment_id", "assets", "match", "gates"},
        "fixed-time gate manifest",
    )
    if manifest["schema"] != MANIFEST_SCHEMA:
        raise NnueFixedTimeGateError("fixed-time gate manifest schema differs")
    if (
        type(manifest["experiment_id"]) is not str
        or SEMANTIC_ID_RE.fullmatch(manifest["experiment_id"]) is None
    ):
        raise NnueFixedTimeGateError("experiment_id is not a semantic SHA-256 ID")

    assets = _exact_dict(
        manifest["assets"],
        {"candidate_weights", "stable_weights", "research_wasm", "match_harness"},
        "fixed-time gate assets",
    )
    candidate = _validate_asset(assets["candidate_weights"], "candidate weights", require_buckets=True)
    stable = _validate_asset(assets["stable_weights"], "stable weights", require_buckets=True)
    runtime = _validate_asset(assets["research_wasm"], "research WASM", require_buckets=False)
    harness = _validate_asset(assets["match_harness"], "match harness", require_buckets=False)
    if candidate["sha256"] == stable["sha256"]:
        raise NnueFixedTimeGateError("candidate and stable weights must differ")
    if Path(harness["path"]).as_posix() != HARNESS_RELATIVE_PATH:
        raise NnueFixedTimeGateError("match harness path differs from the fixed harness")

    match = _exact_dict(
        manifest["match"],
        {
            "milliseconds_per_move",
            "scale_k",
            "scale_numer",
            "scale_denom",
            "games_per_pair",
            "color_order",
            "tt_policy",
            "book",
            "mate_solver",
        },
        "fixed-time match contract",
    )
    milliseconds = _require_positive_int(match["milliseconds_per_move"], "milliseconds_per_move")
    if milliseconds > 600_000:
        raise NnueFixedTimeGateError("milliseconds_per_move is too large")
    for field in ("scale_k", "scale_numer", "scale_denom"):
        number = _require_positive_int(match[field], field)
        if number > 1_000_000:
            raise NnueFixedTimeGateError(f"{field} is too large")
    if (
        match["games_per_pair"] != 2
        or match["color_order"] != COLOR_ORDER
        or match["tt_policy"] != TT_POLICY
        or match["book"] is not False
        or match["mate_solver"] is not False
    ):
        raise NnueFixedTimeGateError("fixed-time match behavior differs")

    gates_value = manifest["gates"]
    if type(gates_value) is not list or len(gates_value) != 3:
        raise NnueFixedTimeGateError("manifest must preregister exactly three gates")
    expected_order = list(_GATE_SPECS)
    captured_gates: list[dict[str, Any]] = []
    all_seeds: set[int] = set()
    opening_set_ids: set[str] = set()
    for gate_index, raw_gate in enumerate(gates_value):
        gate = _exact_dict(
            raw_gate,
            {
                "kind",
                "pairs",
                "games",
                "pair_workers",
                "pair_seeds",
                "opening_set_sha256",
                "analysis",
                "screen_pass_halfpoints",
                "futility_stop_allowed",
                "bootstrap_seed",
                "bootstrap_replicates",
            },
            f"gate {gate_index}",
        )
        kind = gate["kind"]
        if kind != expected_order[gate_index]:
            raise NnueFixedTimeGateError("gates must be screen56, independent96, formal768")
        spec = _GATE_SPECS[kind]
        expected = {
            "pairs": spec["pairs"],
            "games": spec["games"],
            "analysis": spec["analysis"],
            "screen_pass_halfpoints": spec["screen_pass_halfpoints"],
            "futility_stop_allowed": spec["futility"],
            "bootstrap_seed": spec["bootstrap_seed"],
            "bootstrap_replicates": spec["bootstrap_replicates"],
        }
        for field, expected_value in expected.items():
            if gate[field] != expected_value or type(gate[field]) is not type(expected_value):
                raise NnueFixedTimeGateError(f"{kind} {field} differs from preregistration")
        workers = _require_positive_int(gate["pair_workers"], f"{kind} pair_workers")
        if workers > 12:
            raise NnueFixedTimeGateError(f"{kind} pair_workers exceeds the local safe cap")
        seeds = gate["pair_seeds"]
        if type(seeds) is not list or len(seeds) != spec["pairs"]:
            raise NnueFixedTimeGateError(f"{kind} pair seed count differs")
        if any(type(seed) is not int or seed < 1 or seed > MAX_SEED for seed in seeds):
            raise NnueFixedTimeGateError(f"{kind} pair seed is invalid")
        if len(set(seeds)) != len(seeds) or any(seed in all_seeds for seed in seeds):
            raise NnueFixedTimeGateError("pair seeds must be unique within and across gates")
        all_seeds.update(seeds)
        opening_id = _require_sha256(gate["opening_set_sha256"], f"{kind} opening set")
        if opening_id != opening_set_sha256(kind, seeds) or opening_id in opening_set_ids:
            raise NnueFixedTimeGateError(f"{kind} opening set identity differs or repeats")
        opening_set_ids.add(opening_id)
        captured_gates.append({**gate, "pair_seeds": list(seeds)})

    return {
        "schema": MANIFEST_SCHEMA,
        "experiment_id": manifest["experiment_id"],
        "assets": {
            "candidate_weights": candidate,
            "stable_weights": stable,
            "research_wasm": runtime,
            "match_harness": harness,
        },
        "match": dict(match),
        "gates": captured_gates,
    }


def load_and_capture_manifest(repo_root: str | Path, manifest_path: str | Path) -> tuple[dict[str, Any], bytes, str]:
    root = Path(repo_root).resolve()
    path = Path(manifest_path).resolve()
    try:
        raw = path.read_bytes()
        value = _strict_json_loads(raw)
    except OSError as error:
        raise NnueFixedTimeGateError("could not read the preregistered manifest") from error
    manifest = validate_manifest(value)
    for label, asset in manifest["assets"].items():
        configured = Path(asset["path"]).expanduser()
        asset_path = (configured if configured.is_absolute() else root / configured).resolve()
        try:
            if label == "match_harness":
                asset_path.relative_to(root)
            payload = asset_path.read_bytes()
        except (OSError, ValueError) as error:
            raise NnueFixedTimeGateError(f"{label} cannot be captured") from error
        if len(payload) != asset["bytes"] or _sha256_bytes(payload) != asset["sha256"]:
            raise NnueFixedTimeGateError(f"{label} identity differs")
    return manifest, raw, _sha256_bytes(raw)


def parse_pair_log(
    raw: bytes,
    pair_index: int,
    seed: int,
    milliseconds_per_move: int | None = None,
) -> PairResult:
    """Parse exactly one complete color-swapped pair from the reused harness."""

    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise NnueFixedTimeGateError("pair log is not UTF-8") from error
    if (
        "tt=clear-before-each-game-retain-within-game" not in text
        or "fixed-time-ms=" not in text
        or f"(seed base {seed})" not in text
        or (
            milliseconds_per_move is not None
            and f"fixed-time-ms={milliseconds_per_move}" not in text
        )
    ):
        raise NnueFixedTimeGateError("pair log does not bind fixed-time TT behavior")
    game_lines = [line for line in text.splitlines() if line.startswith("game ")]
    if len(game_lines) != 2:
        raise NnueFixedTimeGateError("pair log must contain exactly two games")
    results: list[str] = []
    openings: list[str] = []
    for expected_index, line in enumerate(game_lines, start=1):
        match = GAME_RE.fullmatch(line)
        if match is None or int(match.group(1)) != expected_index:
            raise NnueFixedTimeGateError("pair game line is invalid or out of order")
        expected_color = "SENTE" if expected_index == 1 else "GOTE"
        if match.group(2) != expected_color:
            raise NnueFixedTimeGateError("pair is not candidate-sente then candidate-gote")
        openings.append(match.group(3))
        winner_role = match.group(5)
        if winner_role is None:
            results.append("draw")
        elif winner_role == "A":
            results.append("win")
        else:
            results.append("loss")
    if openings[0] != openings[1]:
        raise NnueFixedTimeGateError("color-swapped games do not share one opening")
    legal = LEGAL_SUMMARY_RE.search(text)
    if legal is None:
        raise NnueFixedTimeGateError("pair log lacks the all-moves-legal summary")
    return PairResult(
        pair_index=pair_index,
        seed=seed,
        opening_fingerprint=openings[0],
        candidate_sente=results[0],
        candidate_gote=results[1],
        legal_moves=int(legal.group(1)),
        log_bytes=len(raw),
        log_sha256=_sha256_bytes(raw),
    )


def _result_halfpoints(result: str) -> int:
    if result == "win":
        return 2
    if result == "draw":
        return 1
    if result == "loss":
        return 0
    raise NnueFixedTimeGateError("game result is invalid")


def _generic_paired_bootstrap_lowers(
    pair_units: Sequence[int], *, seed: int, replicates: int
) -> tuple[int, int]:
    if not pair_units or any(type(value) is not int or not 0 <= value <= 4 for value in pair_units):
        raise NnueFixedTimeGateError("paired bootstrap units are invalid")
    if type(seed) is not int or type(replicates) is not int or replicates < 40 or replicates % 40:
        raise NnueFixedTimeGateError("paired bootstrap configuration is invalid")
    count = len(pair_units)
    if len(set(pair_units)) == 1:
        samples = [pair_units[0] * count] * replicates
    else:
        rng = random.Random(seed)
        samples = sorted(
            sum(pair_units[rng.randrange(count)] for _ in range(count))
            for _ in range(replicates)
        )
    return samples[(replicates * 5 // 100) - 1], samples[(replicates * 25 // 1000) - 1]


def analyze_gate(
    manifest: Mapping[str, Any],
    kind: str,
    results: Sequence[PairResult],
    *,
    technical_faults: int = 0,
) -> dict[str, Any]:
    gate = next((entry for entry in manifest["gates"] if entry["kind"] == kind), None)
    if gate is None:
        raise NnueFixedTimeGateError("requested gate is not preregistered")
    if type(technical_faults) is not int or technical_faults < 0:
        raise NnueFixedTimeGateError("technical fault count is invalid")
    ordered = sorted(results, key=lambda result: result.pair_index)
    if len({result.pair_index for result in ordered}) != len(ordered):
        raise NnueFixedTimeGateError("pair result indices repeat")
    if any(
        result.pair_index < 0
        or result.pair_index >= gate["pairs"]
        or result.seed != gate["pair_seeds"][result.pair_index]
        for result in ordered
    ):
        raise NnueFixedTimeGateError("pair result binding differs from the manifest")
    if len({result.opening_fingerprint for result in ordered}) != len(ordered):
        raise NnueFixedTimeGateError("observed opening fingerprints repeat")
    complete = len(ordered) == gate["pairs"] and all(
        result.pair_index == index for index, result in enumerate(ordered)
    )
    halfpoints = sum(result.halfpoints for result in ordered)
    games = len(ordered) * 2
    wins = sum(
        game == "win"
        for result in ordered
        for game in (result.candidate_sente, result.candidate_gote)
    )
    draws = sum(
        game == "draw"
        for result in ordered
        for game in (result.candidate_sente, result.candidate_gote)
    )
    losses = games - wins - draws
    report: dict[str, Any] = {
        "schema": GATE_REPORT_SCHEMA,
        "experiment_id": manifest["experiment_id"],
        "gate": kind,
        "opening_set_sha256": gate["opening_set_sha256"],
        "planned_pairs": gate["pairs"],
        "planned_games": gate["games"],
        "completed_pairs": len(ordered),
        "completed_games": games,
        "candidate_wins": wins,
        "candidate_draws": draws,
        "candidate_losses": losses,
        "candidate_halfpoints": halfpoints,
        "score_denominator_halfpoints": games * 2,
        "technical_fault_count": technical_faults,
        "all_pairs_complete": complete,
        "all_observed_openings_unique": True,
        "all_observed_moves_legal": all(result.legal_moves >= 0 for result in ordered),
        "decision": "pending",
        "passed": False,
        "promotion_authorized": False,
        "live_weight_write_authorized": False,
    }
    if technical_faults:
        report["decision"] = "rejected-technical-fault"
        return report

    if kind == "screen56":
        threshold = gate["screen_pass_halfpoints"]
        maximum = halfpoints + (gate["games"] - games) * 2
        report["pass_halfpoints"] = threshold
        report["maximum_possible_final_halfpoints"] = maximum
        if complete:
            report["passed"] = halfpoints >= threshold
            report["decision"] = "passed" if report["passed"] else "rejected-complete"
        elif maximum < threshold:
            report["decision"] = "rejected-futility"
        return report

    if not complete:
        return report
    pair_units = [result.halfpoints for result in ordered]
    denominator = gate["pairs"] * 4
    if kind == "formal768":
        one_lower, two_lower = formal_v2._paired_bootstrap_lower_numerators(
            pair_units,
            seed=gate["bootstrap_seed"],
            replicates=gate["bootstrap_replicates"],
        )
        safety = one_lower * 100 > 45 * denominator
        stronger = two_lower * 100 > 50 * denominator
        report["bootstrap"] = {
            "seed": gate["bootstrap_seed"],
            "replicates": gate["bootstrap_replicates"],
            "resampling_unit": "two-game-color-swapped-opening-pair",
            "one_sided_95_lower_numerator": one_lower,
            "two_sided_95_lower_numerator": two_lower,
            "denominator": denominator,
        }
        report["safety_strictly_above_0_45"] = safety
        report["stronger_claim_strictly_above_0_50"] = stronger
        report["passed"] = safety and stronger
    else:
        one_lower, _ = _generic_paired_bootstrap_lowers(
            pair_units,
            seed=gate["bootstrap_seed"],
            replicates=gate["bootstrap_replicates"],
        )
        report["bootstrap"] = {
            "seed": gate["bootstrap_seed"],
            "replicates": gate["bootstrap_replicates"],
            "resampling_unit": "two-game-color-swapped-opening-pair",
            "one_sided_95_lower_numerator": one_lower,
            "denominator": denominator,
        }
        report["passed"] = one_lower * 2 > denominator
    report["decision"] = "passed" if report["passed"] else "rejected-complete"
    return report


def _receipt_value(manifest_sha256: str, kind: str, result: PairResult) -> dict[str, Any]:
    body = {
        "schema": PAIR_RECEIPT_SCHEMA,
        "manifest_sha256": manifest_sha256,
        "gate": kind,
        "pair_index": result.pair_index,
        "seed": result.seed,
        "opening_fingerprint": result.opening_fingerprint,
        "candidate_sente": result.candidate_sente,
        "candidate_gote": result.candidate_gote,
        "legal_moves": result.legal_moves,
        "log_bytes": result.log_bytes,
        "log_sha256": result.log_sha256,
        "technical_fault": False,
    }
    return {**body, "receipt_sha256": _sha256_json(PAIR_RECEIPT_SCHEMA, body)}


def _atomic_write(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def _load_pair_receipt(
    stage_dir: Path,
    manifest_sha256: str,
    kind: str,
    pair_index: int,
    seed: int,
    milliseconds_per_move: int,
) -> PairResult | None:
    receipt_path = stage_dir / f"pair-{pair_index:04d}.json"
    log_path = stage_dir / f"pair-{pair_index:04d}.log"
    if not receipt_path.exists() and not log_path.exists():
        return None
    if not receipt_path.exists() or not log_path.exists():
        raise NnueFixedTimeGateError("resume state contains an orphan pair artifact")
    try:
        receipt_raw = receipt_path.read_bytes()
        value = _strict_json_loads(receipt_raw)
        raw_log = log_path.read_bytes()
    except OSError as error:
        raise NnueFixedTimeGateError("resume pair artifact cannot be read") from error
    receipt = _exact_dict(
        value,
        {
            "schema",
            "manifest_sha256",
            "gate",
            "pair_index",
            "seed",
            "opening_fingerprint",
            "candidate_sente",
            "candidate_gote",
            "legal_moves",
            "log_bytes",
            "log_sha256",
            "technical_fault",
            "receipt_sha256",
        },
        "pair receipt",
    )
    body = {key: receipt[key] for key in receipt if key != "receipt_sha256"}
    if (
        receipt_raw != (_canonical_json(receipt) + "\n").encode("utf-8")
        or
        receipt["schema"] != PAIR_RECEIPT_SCHEMA
        or receipt["manifest_sha256"] != manifest_sha256
        or receipt["gate"] != kind
        or receipt["pair_index"] != pair_index
        or receipt["seed"] != seed
        or receipt["technical_fault"] is not False
        or receipt["receipt_sha256"] != _sha256_json(PAIR_RECEIPT_SCHEMA, body)
    ):
        raise NnueFixedTimeGateError("pair receipt binding differs")
    parsed = parse_pair_log(raw_log, pair_index, seed, milliseconds_per_move)
    expected = _receipt_value(manifest_sha256, kind, parsed)
    if receipt != expected:
        raise NnueFixedTimeGateError("pair receipt differs from its durable log")
    return parsed


def _validate_stage_namespace(stage_dir: Path, pairs: int) -> None:
    if not stage_dir.exists():
        return
    allowed = {"report.json"}
    for pair_index in range(pairs):
        stem = f"pair-{pair_index:04d}"
        allowed.update({f"{stem}.log", f"{stem}.json", f"{stem}.fault.json"})
    observed = {entry.name for entry in stage_dir.iterdir()}
    if not observed.issubset(allowed) or any(not entry.is_file() for entry in stage_dir.iterdir()):
        raise NnueFixedTimeGateError("gate output directory contains an unknown artifact")


def _require_prerequisite_pass(
    output_root: Path,
    manifest: Mapping[str, Any],
    manifest_sha256: str,
    kind: str,
) -> None:
    gate = next(entry for entry in manifest["gates"] if entry["kind"] == kind)
    stage_dir = output_root / kind
    _validate_stage_namespace(stage_dir, gate["pairs"])
    if any(stage_dir.glob("pair-*.fault.json")):
        raise NnueFixedTimeGateError(f"prerequisite {kind} contains a technical fault")

    results: list[PairResult] = []
    for pair_index, seed in enumerate(gate["pair_seeds"]):
        result = _load_pair_receipt(
            stage_dir,
            manifest_sha256,
            kind,
            pair_index,
            seed,
            manifest["match"]["milliseconds_per_move"],
        )
        if result is None:
            raise NnueFixedTimeGateError(
                f"prerequisite {kind} does not have every durable pair"
            )
        results.append(result)

    recomputed = analyze_gate(manifest, kind, results)
    if not recomputed["all_pairs_complete"] or not recomputed["passed"]:
        raise NnueFixedTimeGateError(f"prerequisite {kind} did not pass")
    expected_report = {**recomputed, "manifest_sha256": manifest_sha256}
    report_path = stage_dir / "report.json"
    try:
        report_raw = report_path.read_bytes()
        report = _strict_json_loads(report_raw)
    except OSError as error:
        raise NnueFixedTimeGateError(
            f"prerequisite {kind} report cannot be read"
        ) from error
    if (
        report_raw != (_canonical_json(report) + "\n").encode("utf-8")
        or report != expected_report
    ):
        raise NnueFixedTimeGateError(
            f"prerequisite {kind} report differs from durable pair evidence"
        )


def execute_pair_subprocess(
    repo_root: str | Path,
    manifest: Mapping[str, Any],
    _pair_index: int,
    seed: int,
) -> ChildResult:
    root = Path(repo_root).resolve()
    assets = manifest["assets"]
    match = manifest["match"]
    candidate = assets["candidate_weights"]
    stable = assets["stable_weights"]
    node_executable = os.environ.get("NODE", "node")
    command = [
        node_executable,
        "-r",
        "tsx/cjs",
        str(root / assets["match_harness"]["path"]),
        str(root / candidate["path"]),
        "--vs",
        str(root / stable["path"]),
        "--games",
        "2",
        "--ms",
        str(match["milliseconds_per_move"]),
        "--seed",
        str(seed),
        "--k",
        str(match["scale_k"]),
        "--scale-numer",
        str(match["scale_numer"]),
        "--scale-denom",
        str(match["scale_denom"]),
        "--wasm-path",
        str(root / assets["research_wasm"]["path"]),
        "--buckets-a",
        str(candidate["buckets"]),
        "--buckets-b",
        str(stable["buckets"]),
        "--sha-a",
        candidate["sha256"],
        "--sha-b",
        stable["sha256"],
        "--wasm-sha",
        assets["research_wasm"]["sha256"],
    ]
    completed = subprocess.run(
        command,
        cwd=root,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=max(120, match["milliseconds_per_move"] * 1_024 // 1_000),
        check=False,
        env={"PATH": os.environ.get("PATH", "")},
    )
    return ChildResult(completed.returncode, completed.stdout, completed.stderr)


def run_gate(
    repo_root: str | Path,
    manifest: Mapping[str, Any],
    manifest_sha256: str,
    kind: str,
    output_root: str | Path,
    *,
    executor: PairExecutor = execute_pair_subprocess,
) -> dict[str, Any]:
    """Resume complete pairs and execute missing pairs in a bounded window."""

    captured = validate_manifest(manifest)
    gate = next((entry for entry in captured["gates"] if entry["kind"] == kind), None)
    if gate is None:
        raise NnueFixedTimeGateError("requested gate is not preregistered")
    output_path = Path(output_root).resolve()
    prerequisite = {
        "independent96": "screen56",
        "formal768": "independent96",
    }.get(kind)
    if prerequisite is not None:
        _require_prerequisite_pass(
            output_path,
            captured,
            manifest_sha256,
            prerequisite,
        )
    stage_dir = output_path / kind
    stage_dir.mkdir(parents=True, exist_ok=True)
    _validate_stage_namespace(stage_dir, gate["pairs"])
    results: dict[int, PairResult] = {}
    durable_faults = sorted(stage_dir.glob("pair-*.fault.json"))
    if durable_faults:
        report = analyze_gate(
            captured,
            kind,
            [],
            technical_faults=len(durable_faults),
        )
        report["manifest_sha256"] = manifest_sha256
        _atomic_write(
            stage_dir / "report.json",
            (_canonical_json(report) + "\n").encode("utf-8"),
        )
        return report
    for pair_index, seed in enumerate(gate["pair_seeds"]):
        resumed = _load_pair_receipt(
            stage_dir,
            manifest_sha256,
            kind,
            pair_index,
            seed,
            captured["match"]["milliseconds_per_move"],
        )
        if resumed is not None:
            results[pair_index] = resumed

    other_openings: set[str] = set()
    for other_gate in captured["gates"]:
        if other_gate["kind"] == kind:
            continue
        other_dir = output_path / other_gate["kind"]
        for other_index, other_seed in enumerate(other_gate["pair_seeds"]):
            other = _load_pair_receipt(
                other_dir,
                manifest_sha256,
                other_gate["kind"],
                other_index,
                other_seed,
                captured["match"]["milliseconds_per_move"],
            )
            if other is not None:
                if other.opening_fingerprint in other_openings:
                    raise NnueFixedTimeGateError(
                        "durable cross-gate opening evidence already repeats"
                    )
                other_openings.add(other.opening_fingerprint)
    if any(result.opening_fingerprint in other_openings for result in results.values()):
        raise NnueFixedTimeGateError("observed opening repeats across gates")

    missing = [index for index in range(gate["pairs"]) if index not in results]
    fault_count = 0
    initial_report = analyze_gate(captured, kind, list(results.values()))
    if initial_report["decision"] == "rejected-futility":
        initial_report["manifest_sha256"] = manifest_sha256
        _atomic_write(
            stage_dir / "report.json",
            (_canonical_json(initial_report) + "\n").encode("utf-8"),
        )
        return initial_report
    repo_path = Path(repo_root).resolve()
    stop_submitting = False
    next_missing = iter(missing)
    with ThreadPoolExecutor(max_workers=gate["pair_workers"]) as pool:
        futures: dict[Future[ChildResult], int] = {}

        def fill_window() -> None:
            while not stop_submitting and len(futures) < gate["pair_workers"]:
                try:
                    pair_index = next(next_missing)
                except StopIteration:
                    break
                future = pool.submit(
                    executor,
                    repo_path,
                    captured,
                    pair_index,
                    gate["pair_seeds"][pair_index],
                )
                futures[future] = pair_index

        fill_window()
        while futures:
            completed, _ = wait(futures, return_when=FIRST_COMPLETED)
            for future in sorted(completed, key=lambda item: futures[item]):
                pair_index = futures.pop(future)
                seed = gate["pair_seeds"][pair_index]
                try:
                    child = future.result()
                    if child.returncode != 0 or child.stderr:
                        raise NnueFixedTimeGateError("pair subprocess reported a technical fault")
                    parsed = parse_pair_log(
                        child.stdout,
                        pair_index,
                        seed,
                        captured["match"]["milliseconds_per_move"],
                    )
                    if parsed.opening_fingerprint in other_openings or any(
                        parsed.opening_fingerprint == result.opening_fingerprint
                        for result in results.values()
                    ):
                        raise NnueFixedTimeGateError(
                            "observed opening fingerprint repeats within or across gates"
                        )
                    log_path = stage_dir / f"pair-{pair_index:04d}.log"
                    receipt_path = stage_dir / f"pair-{pair_index:04d}.json"
                    _atomic_write(log_path, child.stdout)
                    receipt = _receipt_value(manifest_sha256, kind, parsed)
                    _atomic_write(receipt_path, (_canonical_json(receipt) + "\n").encode("utf-8"))
                    results[pair_index] = parsed
                except Exception:
                    fault_count += 1
                    fault = {
                        "schema": "shogi-nnue-fixed-time-pair-fault-v1",
                        "manifest_sha256": manifest_sha256,
                        "gate": kind,
                        "pair_index": pair_index,
                        "seed": seed,
                        "technical_fault": True,
                        "strength_conclusion_allowed": False,
                    }
                    _atomic_write(
                        stage_dir / f"pair-{pair_index:04d}.fault.json",
                        (_canonical_json(fault) + "\n").encode("utf-8"),
                    )
            report = analyze_gate(
                captured,
                kind,
                list(results.values()),
                technical_faults=fault_count,
            )
            if fault_count or report["decision"] == "rejected-futility":
                stop_submitting = True
            fill_window()

    report = analyze_gate(captured, kind, list(results.values()), technical_faults=fault_count)
    report["manifest_sha256"] = manifest_sha256
    report_path = stage_dir / "report.json"
    _atomic_write(report_path, (_canonical_json(report) + "\n").encode("utf-8"))
    return report


def build_manifest_template(
    *,
    experiment_id: str,
    assets: Mapping[str, Any],
    milliseconds_per_move: int,
    seed_starts: Mapping[str, int],
    pair_workers: Mapping[str, int],
) -> dict[str, Any]:
    """Build a reviewable manifest value; it still requires exact asset identities."""

    gates = []
    for kind, spec in _GATE_SPECS.items():
        seeds = list(range(seed_starts[kind], seed_starts[kind] + spec["pairs"]))
        gates.append(
            {
                "kind": kind,
                "pairs": spec["pairs"],
                "games": spec["games"],
                "pair_workers": pair_workers[kind],
                "pair_seeds": seeds,
                "opening_set_sha256": opening_set_sha256(kind, seeds),
                "analysis": spec["analysis"],
                "screen_pass_halfpoints": spec["screen_pass_halfpoints"],
                "futility_stop_allowed": spec["futility"],
                "bootstrap_seed": spec["bootstrap_seed"],
                "bootstrap_replicates": spec["bootstrap_replicates"],
            }
        )
    return validate_manifest(
        {
            "schema": MANIFEST_SCHEMA,
            "experiment_id": experiment_id,
            "assets": dict(assets),
            "match": {
                "milliseconds_per_move": milliseconds_per_move,
                "scale_k": 600,
                "scale_numer": 1,
                "scale_denom": 1,
                "games_per_pair": 2,
                "color_order": COLOR_ORDER,
                "tt_policy": TT_POLICY,
                "book": False,
                "mate_solver": False,
            },
            "gates": gates,
        }
    )
