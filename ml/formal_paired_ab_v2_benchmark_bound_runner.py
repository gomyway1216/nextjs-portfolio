"""Argumentless benchmark-bound production runner for formal paired A/B v2.

The published WASM launcher remains immutable historical evidence.  This
successor supplies the missing production authority boundary: one fixed
repository root, one OS-account home, one run-id-derived output namespace, and
an append-only runtime attempt ledger reserved before any pair journal exists.
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
import pwd
import stat
import sys
from typing import Any, Callable, Mapping

import formal_paired_ab_local_launcher as legacy
import formal_paired_ab_protocol_v2 as formal_protocol
import formal_paired_ab_v2_wasm_match_launcher as immutable_wasm_launcher
import formal_paired_ab_v2_worker_benchmark_bridge as bridge


FORMAL_RUN_OUTPUT_DIRECTORY = (
    ".codex/shogi-runs/" "floodgate-q1-2026-formal-paired-ab-v2-benchmark-bound-v1"
)
FORMAL_PAIR_RECEIPT_DIRECTORY_NAME = "pairs"
FORMAL_RUNTIME_ATTEMPT_LEDGER_NAME = "runtime-attempt-ledger.jsonl"
FORMAL_RESULT_NAME = "formal-result.json"
FORMAL_RUNTIME_ATTEMPT_EVENT_SCHEMA = (
    "shogi-formal-paired-ab-v2-runtime-attempt-event-v1"
)
FORMAL_CLI_RECEIPT_SCHEMA = "shogi-formal-paired-ab-v2-benchmark-bound-cli-receipt-v1"
_ATTEMPT_EVENTS = frozenset(
    {"run-reserved", "attempt-started", "attempt-completed", "attempt-faulted"}
)
_PUBLIC_ANALYSIS_FIELDS = frozenset(
    {
        "schema",
        "experiment_id",
        "run_id",
        "attempt_index",
        "attempt_ledger_sha256",
        "rerun_authorization_sha256",
        "candidate_weights_sha256",
        "stable_weights_sha256",
        "match_binding_sha256",
        "technical_fault_count",
        "protocol_amendment_sha256",
        "counts",
        "point_score_rate",
        "bootstrap",
        "gates",
        "authority",
        "nonclaims",
    }
)


class FormalAbV2BenchmarkBoundRunnerError(ValueError):
    """The fixed formal production run cannot proceed safely."""


def _current_user_home() -> Path:
    """Resolve the account database home without honoring caller HOME."""

    try:
        record = pwd.getpwuid(os.geteuid())
        home = Path(record.pw_dir).resolve(strict=True)
        metadata = home.stat()
    except (KeyError, OSError, RuntimeError) as error:
        raise FormalAbV2BenchmarkBoundRunnerError(
            "formal production account home cannot be authenticated"
        ) from error
    if not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid != os.geteuid():
        raise FormalAbV2BenchmarkBoundRunnerError(
            "formal production account home is not current-user-owned"
        )
    return home


def _runtime_event(
    captured: Mapping[str, Any],
    event: str,
    previous_event_sha256: str | None,
    *,
    result_sha256: str | None = None,
    technical_fault_evidence_sha256: str | None = None,
) -> dict:
    if event not in _ATTEMPT_EVENTS:
        raise FormalAbV2BenchmarkBoundRunnerError(
            "formal runtime attempt event differs"
        )
    body = {
        "schema": FORMAL_RUNTIME_ATTEMPT_EVENT_SCHEMA,
        "event": event,
        "formal_registry_sha256": captured["registry_sha256"],
        "experiment_id": captured["registry"]["experiment_id"],
        "run_id": captured["registry"]["run_id"],
        "attempt_index": captured["registry"]["attempt_index"],
        "preregistered_attempt_ledger_sha256": captured["attempt_ledger_identity"][
            "sha256"
        ],
        "worker_benchmark_receipt_sha256": captured[
            "worker_benchmark_receipt_identity"
        ]["sha256"],
        "previous_event_sha256": previous_event_sha256,
        "result_sha256": result_sha256,
        "technical_fault_evidence_sha256": technical_fault_evidence_sha256,
    }
    return {
        **body,
        "event_sha256": bridge._domain_digest(
            "shogi-formal-paired-ab-v2-runtime-attempt-event-v1", body
        ),
    }


def _write_all(descriptor: int, raw: bytes) -> None:
    remaining = memoryview(raw)
    while remaining:
        try:
            written = os.write(descriptor, remaining)
        except OSError as error:
            raise FormalAbV2BenchmarkBoundRunnerError(
                "formal runtime attempt ledger write failed"
            ) from error
        if type(written) is not int or written <= 0 or written > len(remaining):
            raise FormalAbV2BenchmarkBoundRunnerError(
                "formal runtime attempt ledger write was incomplete"
            )
        remaining = remaining[written:]


def _verify_private_file(metadata: os.stat_result, label: str) -> None:
    if (
        not stat.S_ISREG(metadata.st_mode)
        or metadata.st_uid != os.geteuid()
        or metadata.st_nlink != 1
        or stat.S_IMODE(metadata.st_mode) != 0o600
    ):
        raise FormalAbV2BenchmarkBoundRunnerError(
            f"{label} must be one current-user-owned 0600 inode"
        )


def _append_runtime_event(
    reservation: dict[str, Any],
    captured: Mapping[str, Any],
    event: str,
    *,
    result_sha256: str | None = None,
    technical_fault_evidence_sha256: str | None = None,
) -> dict:
    bridge._verify_private_run_output_reservation(reservation)
    previous = reservation.get("attempt_event_sha256")
    value = _runtime_event(
        captured,
        event,
        previous,
        result_sha256=result_sha256,
        technical_fault_evidence_sha256=technical_fault_evidence_sha256,
    )
    raw = f"{legacy._canonical_json(value)}\n".encode("utf-8")
    flags = os.O_WRONLY | os.O_APPEND | os.O_NOFOLLOW
    if hasattr(os, "O_NONBLOCK"):
        flags |= os.O_NONBLOCK
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    try:
        descriptor = os.open(
            FORMAL_RUNTIME_ATTEMPT_LEDGER_NAME,
            flags,
            dir_fd=reservation["run_descriptor"],
        )
    except OSError as error:
        raise FormalAbV2BenchmarkBoundRunnerError(
            "formal runtime attempt ledger cannot be reopened safely"
        ) from error
    try:
        metadata = os.fstat(descriptor)
        _verify_private_file(metadata, "formal runtime attempt ledger")
        expected_inode = reservation["attempt_ledger_inode"]
        if (metadata.st_dev, metadata.st_ino) != expected_inode:
            raise FormalAbV2BenchmarkBoundRunnerError(
                "formal runtime attempt ledger inode differs"
            )
        _write_all(descriptor, raw)
        os.fsync(descriptor)
        os.fsync(reservation["run_descriptor"])
        path_metadata = os.stat(
            FORMAL_RUNTIME_ATTEMPT_LEDGER_NAME,
            dir_fd=reservation["run_descriptor"],
            follow_symlinks=False,
        )
        if (path_metadata.st_dev, path_metadata.st_ino) != expected_inode:
            raise FormalAbV2BenchmarkBoundRunnerError(
                "formal runtime attempt ledger path no longer names its inode"
            )
    finally:
        os.close(descriptor)
    reservation["attempt_event_sha256"] = value["event_sha256"]
    bridge._verify_private_run_output_reservation(reservation)
    return value


def _create_runtime_attempt_ledger(
    reservation: dict[str, Any], captured: Mapping[str, Any]
) -> None:
    value = _runtime_event(captured, "run-reserved", None)
    bridge._write_exclusive_json_at(
        reservation["run_descriptor"],
        FORMAL_RUNTIME_ATTEMPT_LEDGER_NAME,
        value,
    )
    flags = os.O_RDONLY | os.O_NOFOLLOW
    if hasattr(os, "O_NONBLOCK"):
        flags |= os.O_NONBLOCK
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    descriptor = os.open(
        FORMAL_RUNTIME_ATTEMPT_LEDGER_NAME,
        flags,
        dir_fd=reservation["run_descriptor"],
    )
    try:
        metadata = os.fstat(descriptor)
        _verify_private_file(metadata, "formal runtime attempt ledger")
        reservation["attempt_ledger_inode"] = (metadata.st_dev, metadata.st_ino)
        path_metadata = os.stat(
            FORMAL_RUNTIME_ATTEMPT_LEDGER_NAME,
            dir_fd=reservation["run_descriptor"],
            follow_symlinks=False,
        )
        if (path_metadata.st_dev, path_metadata.st_ino) != reservation[
            "attempt_ledger_inode"
        ]:
            raise FormalAbV2BenchmarkBoundRunnerError(
                "formal runtime attempt ledger path identity differs"
            )
    finally:
        os.close(descriptor)
    reservation["attempt_event_sha256"] = value["event_sha256"]


def _create_pair_receipt_directory(reservation: Mapping[str, Any]) -> Path:
    try:
        os.mkdir(
            FORMAL_PAIR_RECEIPT_DIRECTORY_NAME,
            0o700,
            dir_fd=reservation["run_descriptor"],
        )
        os.fsync(reservation["run_descriptor"])
        descriptor = os.open(
            FORMAL_PAIR_RECEIPT_DIRECTORY_NAME,
            bridge._directory_open_flags(),
            dir_fd=reservation["run_descriptor"],
        )
    except OSError as error:
        raise FormalAbV2BenchmarkBoundRunnerError(
            "formal pair receipt directory cannot be reserved safely"
        ) from error
    try:
        bridge._verify_owned_directory(
            os.fstat(descriptor), "formal pair receipt directory", private=True
        )
    finally:
        os.close(descriptor)
    return reservation["path"] / FORMAL_PAIR_RECEIPT_DIRECTORY_NAME


def _fault_evidence_sha256(error: Exception) -> str:
    identity = f"{type(error).__module__}.{type(error).__qualname__}".encode("utf-8")
    return hashlib.sha256(identity).hexdigest()


def _run_reserved_formal_core_for_tests(
    repo_root: str | Path,
    home_root: str | Path,
    captured: Mapping[str, Any],
    execute_pair: Callable[[Mapping], Mapping],
    recapture: Callable[[], Mapping],
) -> dict:
    """Injected execution seam; production authority is never caller supplied."""

    if not callable(execute_pair) or not callable(recapture):
        raise FormalAbV2BenchmarkBoundRunnerError(
            "formal production CoreForTests dependencies must be callable"
        )
    reservation = bridge._reserve_private_run_output(
        home_root,
        FORMAL_RUN_OUTPUT_DIRECTORY,
        captured["registry"]["run_id"],
        label="formal paired A/B run",
    )
    try:
        _create_runtime_attempt_ledger(reservation, captured)
        receipt_directory = _create_pair_receipt_directory(reservation)
        pregame = recapture()
        bridge._require_exact_json(
            pregame, captured, "pre-game code-pinned formal enrollment snapshot"
        )
        _append_runtime_event(reservation, captured, "attempt-started")

        def exact_recapture() -> Mapping:
            latest = recapture()
            bridge._require_exact_json(
                latest,
                captured,
                "post-game code-pinned formal enrollment snapshot",
            )
            return latest

        try:
            result = immutable_wasm_launcher._run_captured(
                captured,
                receipt_directory,
                execute_pair,
                exact_recapture,
            )
        except Exception as error:
            _append_runtime_event(
                reservation,
                captured,
                "attempt-faulted",
                technical_fault_evidence_sha256=_fault_evidence_sha256(error),
            )
            raise
        result_sha256 = hashlib.sha256(
            f"{legacy._canonical_json(result)}\n".encode("utf-8")
        ).hexdigest()
        bridge._write_exclusive_json_at(
            reservation["run_descriptor"], FORMAL_RESULT_NAME, result
        )
        _append_runtime_event(
            reservation,
            captured,
            "attempt-completed",
            result_sha256=result_sha256,
        )
        return result
    finally:
        bridge._close_private_run_output_reservation(reservation)


def run_pinned_ready_wasm_pairs() -> dict:
    """Run exactly one code-pinned formal attempt with no caller inputs."""

    root = Path(__file__).resolve().parents[1]
    home = _current_user_home()
    captured = bridge.validate_pinned_formal_ready_registry(root)
    for name in ("candidate_weights", "stable_weights"):
        if captured["assets"][name]["bytes"] != immutable_wasm_launcher.NNUE_BYTES:
            raise FormalAbV2BenchmarkBoundRunnerError(
                f"pinned {name} byte length differs from the WASM layout"
            )
    if (
        captured["assets"]["pair_entry"]["path"]
        != immutable_wasm_launcher.PAIR_ENTRY_PATH
    ):
        raise FormalAbV2BenchmarkBoundRunnerError(
            "pinned pair entry path differs from the executable entry"
        )
    return _run_reserved_formal_core_for_tests(
        root,
        home,
        captured,
        lambda request: immutable_wasm_launcher._execute_pair_subprocess(root, request),
        lambda: bridge.validate_pinned_formal_ready_registry(root),
    )


def _validate_public_analysis(value: Mapping[str, Any]) -> dict[str, Any]:
    """Accept only the preregistered aggregate, never pair-level transcripts."""

    if type(value) is not dict or set(value) != _PUBLIC_ANALYSIS_FIELDS:
        raise FormalAbV2BenchmarkBoundRunnerError(
            "formal public analysis fields differ"
        )
    if (
        value["schema"] != formal_protocol.FORMAL_AB_V2_ANALYSIS_SCHEMA
        or value["technical_fault_count"] != 0
    ):
        raise FormalAbV2BenchmarkBoundRunnerError(
            "formal public analysis header differs"
        )
    try:
        legacy._require_exact_json(
            value["counts"],
            {
                "pairs": formal_protocol.PAIR_COUNT,
                "games": formal_protocol.GAME_COUNT,
            },
            "formal public analysis counts",
        )
        legacy._require_exact_json(
            value["authority"],
            {
                "promotion_authorized": False,
                "production_weight_write_authorized": False,
            },
            "formal public analysis authority",
        )
        legacy._require_exact_json(
            value["nonclaims"],
            {
                "strength_improved": False,
                "high_dan_calibrated": False,
            },
            "formal public analysis nonclaims",
        )
    except ValueError as error:
        raise FormalAbV2BenchmarkBoundRunnerError(str(error)) from error
    return dict(value)


def _cli_stop(reason: str) -> dict[str, Any]:
    return {
        "schema": FORMAL_CLI_RECEIPT_SCHEMA,
        "status": "STOP",
        "reason": reason,
        "public_analysis_emitted": False,
        "production_weight_write_authorized": False,
    }


def _main_core_for_tests(
    arguments: list[str],
    run: Callable[[], Mapping[str, Any]],
    analyze: Callable[[Mapping[str, Any]], Mapping[str, Any]],
) -> int:
    """Injected CLI seam; production paths and authority remain fixed."""

    if arguments:
        print(
            legacy._canonical_json(_cli_stop("arguments-forbidden")),
            file=sys.stderr,
        )
        return 2
    try:
        result = run()
        analysis = _validate_public_analysis(analyze(result))
    except bridge.FormalAbV2WorkerBenchmarkBlocked:
        print(
            legacy._canonical_json(_cli_stop("formal-ready-registry-blocked")),
            file=sys.stderr,
        )
        return 2
    except (OSError, RuntimeError, TypeError, ValueError):
        print(
            legacy._canonical_json(_cli_stop("formal-run-failed-closed")),
            file=sys.stderr,
        )
        return 2
    print(legacy._canonical_json(analysis))
    return 0


def main(argv: list[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    return _main_core_for_tests(
        arguments,
        run_pinned_ready_wasm_pairs,
        formal_protocol.analyze_formal_paired_ab_v2,
    )


if __name__ == "__main__":
    raise SystemExit(main())
