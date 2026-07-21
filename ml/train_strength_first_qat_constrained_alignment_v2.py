"""Train one seed while preserving its deployed integer tensors bit-for-bit."""

from __future__ import annotations

import argparse
from collections.abc import Sequence
import copy
import hashlib
import io
import json
import math
import os
from pathlib import Path
import random
import shutil
import subprocess
import sys
import tempfile
import time
from typing import Any

import torch

import build_strength_first_qat_constrained_alignment_v2_plan_candidate as PLAN_BUILDER
import int16_forward as INTEGER
import strength_first_qat_constrained_alignment_v2_protocol as PROTOCOL
import strength_first_qat_training_bridge as BASE
import strength_first_quantized_cell_alignment as ALIGN
import train as TRAIN


def _git_head(repo_root: Path) -> str:
    try:
        completed = subprocess.run(
            ["/usr/bin/git", "rev-parse", "--verify", "HEAD^{commit}"],
            cwd=repo_root,
            env={
                "PATH": "/usr/bin:/bin",
                "HOME": "/var/empty",
                "GIT_CONFIG_NOSYSTEM": "1",
                "GIT_CONFIG_GLOBAL": "/dev/null",
                "GIT_CONFIG_SYSTEM": "/dev/null",
                "LC_ALL": "C",
                "LANG": "C",
            },
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError) as error:
        raise ValueError("cannot read alignment pipeline revision") from error
    revision = completed.stdout.strip()
    if len(revision) != 40 or any(
        character not in "0123456789abcdef" for character in revision
    ):
        raise ValueError("alignment pipeline revision is invalid")
    return revision


def _fingerprint(path: str | os.PathLike[str]) -> dict[str, Any]:
    digest = hashlib.sha256()
    size = 0
    try:
        with open(path, "rb") as source:
            while block := source.read(1024 * 1024):
                size += len(block)
                digest.update(block)
    except OSError as error:
        raise ValueError("alignment artifact cannot be read") from error
    return {"bytes": size, "sha256": digest.hexdigest()}


def _publish_staged_output(staging: Path, output: Path) -> None:
    """Atomically expose a complete run directory without a partial slot."""

    staging = staging.absolute()
    output = output.absolute()
    if staging.parent != output.parent or not staging.is_dir():
        raise ValueError("alignment staging directory is invalid")
    lock = output.with_name(f".{output.name}.publish.lock")
    try:
        descriptor = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError as error:
        raise ValueError("alignment output publication is already claimed") from error
    try:
        os.close(descriptor)
        if os.path.lexists(output):
            raise ValueError("alignment output slot already exists; preserve it")
        os.rename(staging, output)
        try:
            directory_descriptor = os.open(output.parent, os.O_RDONLY)
            try:
                os.fsync(directory_descriptor)
            finally:
                os.close(directory_descriptor)
        except OSError:
            pass
    finally:
        try:
            lock.unlink()
        except FileNotFoundError:
            pass


def _stage_verify_and_publish(
    *,
    output: Path,
    checkpoint_value: dict[str, Any],
    result_without_candidate: dict[str, Any],
    anchor: Any,
) -> dict[str, Any]:
    """Strict-reload a staged checkpoint before atomically publishing it."""

    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(
        tempfile.mkdtemp(
            prefix=f".{output.name}.constrained-alignment-v2-",
            dir=output.parent,
        )
    )
    try:
        checkpoint_path = staging / "final.pt"
        TRAIN.atomic_torch_save(checkpoint_value, str(checkpoint_path))
        try:
            reloaded = torch.load(
                checkpoint_path,
                map_location="cpu",
                weights_only=True,
            )
            if type(reloaded) is not dict:
                raise ValueError("alignment checkpoint root is not an object")
            reload_model = TRAIN.DistillNet("board")
            reload_model.load_state_dict(reloaded["model"], strict=True)
            ALIGN.assert_quantized_anchor(
                reload_model,
                anchor,
                "alignment strict reload",
            )
        except Exception as error:
            raise ValueError(
                "alignment final checkpoint reload invariant failed"
            ) from error
        result = {
            **copy.deepcopy(result_without_candidate),
            "candidate_artifact": {
                "name": "final.pt",
                **_fingerprint(checkpoint_path),
            },
        }
        TRAIN.atomic_write_text(
            str(staging / "result.json"),
            json.dumps(
                result,
                ensure_ascii=False,
                sort_keys=True,
                indent=2,
                allow_nan=False,
            )
            + "\n",
        )
        _publish_staged_output(staging, output)
        return result
    finally:
        shutil.rmtree(staging, ignore_errors=True)


def _validate_parent_result(
    value: dict[str, Any],
    *,
    seed: int,
    checkpoint_identity: dict[str, Any],
) -> None:
    contract = value.get("experiment_contract")
    candidate = value.get("candidate_artifact")
    if (
        value.get("schema") != BASE.STRENGTH_FIRST_QAT_TRAINING_RESULT_SCHEMA
        or value.get("status") != "complete"
        or value.get("completed_epochs") != 20
        or value.get("selection_labels_read") is not False
        or value.get("selection_evaluations") != 0
        or value.get("early_stopping") is not False
        or type(contract) is not dict
        or contract.get("seed") != seed
        or type(candidate) is not dict
        or candidate.get("name") != "final.pt"
        or candidate.get("bytes") != checkpoint_identity["bytes"]
        or candidate.get("sha256") != checkpoint_identity["sha256"]
    ):
        raise ValueError(f"alignment parent seed {seed} result is invalid")


def _validate_parent_checkpoint(
    checkpoint: dict[str, Any],
    *,
    seed: int,
    expected_architecture: dict[str, Any],
) -> None:
    args = checkpoint.get("args")
    contract = checkpoint.get("experiment_contract")
    selection = checkpoint.get("checkpoint_selection")
    if (
        checkpoint.get("schema") != BASE.STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA
        or checkpoint.get("epoch") != 20
        or type(args) is not dict
        or args.get("seed") != seed
        or args.get("features") != "board"
        or type(contract) is not dict
        or contract.get("seed") != seed
        or type(selection) is not dict
        or selection.get("mode") != "final-only"
        or selection.get("selection_labels_read") is not False
        or selection.get("selection_evaluations") != 0
        or selection.get("early_stopping") is not False
    ):
        raise ValueError(f"alignment parent seed {seed} checkpoint is invalid")
    TRAIN.validate_arch(checkpoint.get("arch"), expected_architecture)


def _verify_implementation_sources(repo_root: Path, plan: dict[str, Any]) -> None:
    for name, identity in plan["implementation"].items():
        PROTOCOL.verify_registered_file(
            repo_root,
            identity,
            f"alignment implementation {name}",
        )


def _verify_recomputed_plan(repo_root: Path, plan_raw: bytes) -> None:
    candidate = PLAN_BUILDER.build_alignment_plan_candidate(repo_root=repo_root)
    if PROTOCOL.canonical_json_bytes(candidate) != plan_raw:
        raise ValueError("alignment plan differs from its exact recomputation")


def _load_exact_parent(
    *, repo_root: Path, plan: dict[str, Any], seed: int
) -> tuple[dict[str, Any], bytes]:
    parent = next(value for value in plan["parents"] if value["seed"] == seed)
    result_raw = PROTOCOL.verify_registered_file(
        repo_root,
        parent["result"],
        f"alignment parent seed {seed} result",
    )
    _validate_parent_result(
        PROTOCOL.strict_json(result_raw, f"alignment parent seed {seed} result"),
        seed=seed,
        checkpoint_identity=parent["checkpoint"],
    )
    checkpoint_raw = PROTOCOL.verify_registered_file(
        repo_root,
        {
            key: parent["checkpoint"][key]
            for key in ("path", "schema", "bytes", "sha256")
        },
        f"alignment parent seed {seed} checkpoint",
    )
    return parent, checkpoint_raw


def _exact_integer_logits(
    anchor: Any,
    *,
    model: Any,
    board: torch.Tensor,
    hands: torch.Tensor,
) -> torch.Tensor:
    out_q = INTEGER.int16_forward_batch(
        anchor.quantized,
        board,
        hands,
        model.pad_idx,
    )
    if out_q.dtype != torch.int64 or out_q.requires_grad:
        raise ValueError("alignment integer target is not detached int64")
    return out_q.to(torch.float32) / float(INTEGER.OUT_SCALE)


def _precompute_exact_integer_logits(
    anchor: Any,
    *,
    model: Any,
    board: torch.Tensor,
    hands: torch.Tensor,
) -> torch.Tensor:
    """Materialize the constant integer targets once while qweights are fixed."""

    if board.ndim != 2 or hands.ndim != 2 or board.shape[0] != hands.shape[0]:
        raise ValueError("alignment target-cache inputs are invalid")
    chunks = []
    cache_batch = PROTOCOL.ALIGNMENT_TRAINING["integer_target_cache_chunk_rows"]
    for start in range(0, board.shape[0], cache_batch):
        stop = min(start + cache_batch, board.shape[0])
        chunks.append(
            _exact_integer_logits(
                anchor,
                model=model,
                board=board[start:stop],
                hands=hands[start:stop],
            )
        )
    if not chunks:
        raise ValueError("alignment target cache cannot be empty")
    exact_logits = torch.cat(chunks)
    if (
        exact_logits.shape != (board.shape[0],)
        or exact_logits.dtype != torch.float32
        or exact_logits.requires_grad
        or not bool(torch.isfinite(exact_logits).all().item())
    ):
        raise ValueError("alignment target cache is invalid")
    return exact_logits


def _integer_target_cache_receipt(
    exact_logits: torch.Tensor,
    *,
    seconds: float,
) -> dict[str, Any]:
    if (
        exact_logits.ndim != 1
        or exact_logits.dtype != torch.float32
        or exact_logits.requires_grad
        or not bool(torch.isfinite(exact_logits).all().item())
        or type(seconds) is not float
        or not math.isfinite(seconds)
        or seconds < 0.0
    ):
        raise ValueError("alignment integer-target cache receipt is invalid")
    return {
        "rows": exact_logits.numel(),
        "dtype": "float32",
        "bytes": exact_logits.numel() * exact_logits.element_size(),
        "chunk_rows": PROTOCOL.ALIGNMENT_TRAINING["integer_target_cache_chunk_rows"],
        "seconds": seconds,
        "source": "seed-parent-anchor",
        "reused_local_epochs": PROTOCOL.ALIGNMENT_TRAINING[
            "integer_target_cache_reused_local_epochs"
        ],
    }


def _train_alignment_batch(
    *,
    model: Any,
    optimizer: torch.optim.Optimizer,
    anchor: Any,
    board: torch.Tensor,
    hands: torch.Tensor,
    bucket: torch.Tensor,
    exact_logits: torch.Tensor,
    parent_group_sizes: Sequence[int],
) -> dict[str, Any]:
    """Execute the exact production batch path and restore crossed cells."""

    optimizer.zero_grad(set_to_none=True)
    float_logits = model(board, hands, bucket)
    if (
        exact_logits.shape != float_logits.shape
        or exact_logits.dtype != torch.float32
        or exact_logits.device != float_logits.device
        or exact_logits.requires_grad
        or not bool(torch.isfinite(exact_logits).all().item())
    ):
        raise ValueError("alignment batch exact targets are invalid")
    loss, huber, policy = ALIGN.alignment_consistency_loss(
        float_logits,
        exact_logits,
        parent_group_sizes,
        k_sigmoid=600.0,
        policy_temperature_cp=200.0,
        huber_beta=1.0 / 64.0,
        policy_weight=0.25,
    )
    if not all(bool(torch.isfinite(value).item()) for value in (loss, huber, policy)):
        raise ValueError("alignment loss is non-finite")
    loss.backward()
    optimizer.step()
    projection = ALIGN.project_optimizer_step_to_anchor(
        model,
        optimizer,
        anchor,
    )
    return {
        "loss": float(loss.detach()),
        "huber": float(huber.detach()),
        "parent_policy_kl": float(policy.detach()),
        "projection": projection,
    }


def run_alignment_seed(
    seed: int,
    *,
    repo_root: str | os.PathLike[str] | None = None,
    home: str | os.PathLike[str] | None = None,
) -> dict[str, Any]:
    if type(seed) is not int or seed not in PROTOCOL.ALIGNMENT_SEEDS:
        raise ValueError("alignment seed is not registered")
    root = Path(repo_root or Path(__file__).resolve().parent.parent).resolve()
    plan_path = root / PROTOCOL.ALIGNMENT_PLAN_RELATIVE_PATH
    plan_raw = plan_path.read_bytes()
    plan = PROTOCOL.validate_alignment_plan(
        PROTOCOL.strict_json(plan_raw, "alignment plan")
    )
    _verify_recomputed_plan(root, plan_raw)
    contract = PROTOCOL.alignment_contract(plan, seed)
    slot = next(value for value in plan["slots"] if value["seed"] == seed)
    output = root / slot["output"]
    if os.path.lexists(output):
        raise ValueError("alignment output slot already exists; preserve it")

    _verify_implementation_sources(root, plan)
    PROTOCOL.verify_registered_file(
        root,
        plan["base_training"]["plan"],
        "alignment base training plan",
    )
    PROTOCOL.verify_registered_file(
        root,
        plan["base_training"]["parent_preflight_registry"],
        "alignment parent preflight registry",
    )
    parent, parent_checkpoint_raw = _load_exact_parent(
        repo_root=root,
        plan=plan,
        seed=seed,
    )

    runtime = TRAIN.configure_sealed_torch_runtime(2)
    PROTOCOL.validate_runtime(plan, runtime)
    revision = _git_head(root)
    pipeline = TRAIN.verify_training_pipeline_revision(revision)

    home_root = Path(home or Path.home()).expanduser().resolve()
    local_paths = BASE.default_strength_first_local_paths(
        repo_root=root,
        home=home_root,
        teacher_generation="v9",
    )
    data_path = local_paths["model_training"]
    expected_data = plan["data"]["model_training"]
    if _fingerprint(data_path) != {
        "bytes": expected_data["bytes"],
        "sha256": expected_data["sha256"],
    }:
        raise ValueError("alignment model-training dataset identity mismatch")

    try:
        (
            board,
            hands,
            _targets,
            _clamped_cp,
            bucket,
            metadata,
            data_fingerprint,
        ) = TRAIN.load_dataset_with_metadata(
            data_path,
            600.0,
            3000,
            0,
            "board",
            strict=True,
            include_fingerprint=True,
        )
        groups = TRAIN.validate_sibling_metadata(metadata, "train")
    except (OSError, RuntimeError, ValueError) as error:
        raise ValueError("alignment training data is invalid") from error
    if (
        len(metadata) != expected_data["records"]
        or len(groups) != expected_data["parents"]
        or data_fingerprint.get("bytes") != expected_data["bytes"]
        or data_fingerprint.get("sha256") != expected_data["sha256"]
    ):
        raise ValueError("alignment training data accounting mismatch")

    torch.manual_seed(seed)
    random.seed(seed)
    model = TRAIN.DistillNet("board")
    expected_architecture = TRAIN.expected_arch(
        features="board",
        input_dim=model.board_feats + model.hand_feats,
        h1=TRAIN.DistillNet.H1,
        h2=TRAIN.DistillNet.H2,
        k=600.0,
        kp_buckets=1,
    )
    try:
        checkpoint = torch.load(
            io.BytesIO(parent_checkpoint_raw),
            map_location="cpu",
            weights_only=True,
        )
    except Exception as error:
        raise ValueError(f"alignment parent seed {seed} cannot strict-load") from error
    if type(checkpoint) is not dict:
        raise ValueError(f"alignment parent seed {seed} checkpoint is not an object")
    _validate_parent_checkpoint(
        checkpoint,
        seed=seed,
        expected_architecture=expected_architecture,
    )
    try:
        model.load_state_dict(checkpoint["model"], strict=True)
    except (KeyError, RuntimeError) as error:
        raise ValueError(
            f"alignment parent seed {seed} model is incompatible"
        ) from error
    model = model.to("cpu")
    anchor = ALIGN.capture_quantized_anchor(model)
    ALIGN.assert_quantized_anchor(model, anchor, "alignment initializer")
    cache_started = time.perf_counter()
    exact_integer_logits = _precompute_exact_integer_logits(
        anchor,
        model=model,
        board=board,
        hands=hands,
    )
    integer_target_cache = _integer_target_cache_receipt(
        exact_integer_logits,
        seconds=float(time.perf_counter() - cache_started),
    )
    if integer_target_cache["rows"] != expected_data["records"]:
        raise ValueError("alignment integer-target cache row count drifted")

    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=1e-5,
        betas=(0.9, 0.999),
        eps=1e-8,
        weight_decay=0.0,
        amsgrad=False,
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer,
        T_max=4,
    )
    history = []
    for local_epoch in range(1, 5):
        global_epoch = 20 + local_epoch
        started = time.time()
        generator = torch.Generator().manual_seed(seed + global_epoch)
        batches = TRAIN.grouped_batches(groups, 256, generator)
        huber_sum = 0.0
        policy_sum = 0.0
        rows = 0
        parents = 0
        quantized_crossings = 0
        forced_padding_restores = 0
        total_restored = 0
        lr_used = optimizer.param_groups[0]["lr"]
        for selection, parent_group_sizes in batches:
            primary_board = board[selection].to("cpu")
            primary_hands = hands[selection].to("cpu")
            primary_bucket = bucket[selection].to("cpu")
            batch_receipt = _train_alignment_batch(
                model=model,
                board=primary_board,
                hands=primary_hands,
                bucket=primary_bucket,
                exact_logits=exact_integer_logits[selection],
                optimizer=optimizer,
                anchor=anchor,
                parent_group_sizes=parent_group_sizes,
            )
            batch_rows = int(selection.numel())
            huber_sum += batch_receipt["huber"] * batch_rows
            policy_sum += batch_receipt["parent_policy_kl"] * len(parent_group_sizes)
            rows += batch_rows
            parents += len(parent_group_sizes)
            projection = batch_receipt["projection"]
            quantized_crossings += projection["total_quantized_crossing_coordinates"]
            forced_padding_restores += projection["forced_padding_coordinates"]
            total_restored += projection["total_restored_coordinates"]
        if rows != expected_data["records"] or parents != expected_data["parents"]:
            raise ValueError("alignment epoch did not consume the exact training set")
        scheduler.step()
        ALIGN.assert_quantized_anchor(
            model,
            anchor,
            f"alignment epoch {global_epoch}",
        )
        receipt = {
            "local_epoch": local_epoch,
            "global_epoch": global_epoch,
            "loss": huber_sum / rows + 0.25 * policy_sum / parents,
            "huber": huber_sum / rows,
            "parent_policy_kl": policy_sum / parents,
            "learning_rate": lr_used,
            "quantized_crossing_coordinates": quantized_crossings,
            "forced_padding_coordinates": forced_padding_restores,
            "total_restored_coordinates": total_restored,
            "rows": rows,
            "parents": parents,
            "seconds": time.time() - started,
        }
        if any(
            type(receipt[field]) not in (int, float)
            or not math.isfinite(receipt[field])
            for field in (
                "loss",
                "huber",
                "parent_policy_kl",
                "learning_rate",
                "seconds",
            )
        ):
            raise ValueError("alignment epoch receipt is non-finite")
        history.append(receipt)
        print(
            f"[alignment] seed={seed} epoch={global_epoch}/24 "
            f"loss={receipt['loss']:.8f} huber={receipt['huber']:.8f} "
            f"policy={receipt['parent_policy_kl']:.8f} "
            f"q_crossings={quantized_crossings} "
            f"forced_padding={forced_padding_restores} "
            f"lr={lr_used:.3e}"
        )

    ALIGN.assert_quantized_anchor(model, anchor, "alignment before save")
    TRAIN.require_finite_model_parameters(model, "alignment final")
    final_pipeline = TRAIN.verify_training_pipeline_revision(revision)
    if final_pipeline != pipeline:
        raise ValueError("alignment pipeline changed during training")
    if _fingerprint(data_path) != {
        "bytes": expected_data["bytes"],
        "sha256": expected_data["sha256"],
    }:
        raise ValueError("alignment training data changed during training")
    parent_after = PROTOCOL.verify_registered_file(
        root,
        {
            key: parent["checkpoint"][key]
            for key in ("path", "schema", "bytes", "sha256")
        },
        f"alignment parent seed {seed} checkpoint postflight",
    )
    if parent_after != parent_checkpoint_raw:
        raise ValueError("alignment parent checkpoint changed during training")
    _verify_implementation_sources(root, plan)
    if plan_path.read_bytes() != plan_raw:
        raise ValueError("alignment plan changed during training")
    _verify_recomputed_plan(root, plan_raw)

    checkpoint_value = {
        "schema": PROTOCOL.ALIGNMENT_CHECKPOINT_SCHEMA,
        "model": model.state_dict(),
        "epoch": 24,
        "arch": expected_architecture,
        "contract": contract,
        "parent": copy.deepcopy(parent),
        "optimizer": {
            "name": "AdamW",
            "state": "fresh-not-resumed",
            "weight_decay": 0.0,
        },
        "objective": {
            "huber_beta_logit": 1.0 / 64.0,
            "policy_consistency_weight": 0.25,
            "k_sigmoid": 600.0,
            "policy_temperature_cp": 200.0,
            "teacher_target_loss": False,
        },
        "quantized_invariant": ALIGN.anchor_identity(anchor),
        "integer_target_cache": copy.deepcopy(integer_target_cache),
        "training_pipeline": pipeline,
        "training_runtime": runtime,
        "training_history": history,
        "data": {
            "model_training": copy.deepcopy(expected_data),
            "replay_rows_read": 0,
            "selection_labels_read": False,
            "final_holdout_labels_read": False,
        },
    }
    return _stage_verify_and_publish(
        output=output,
        checkpoint_value=checkpoint_value,
        anchor=anchor,
        result_without_candidate={
            "schema": PROTOCOL.ALIGNMENT_RESULT_SCHEMA,
            "status": "complete",
            "contract": contract,
            "parent": copy.deepcopy(parent),
            "completed_local_epochs": 4,
            "final_epoch": 24,
            "training_pipeline": pipeline,
            "training_runtime": runtime,
            "training_history": history,
            "quantized_invariant": ALIGN.anchor_identity(anchor),
            "integer_target_cache": copy.deepcopy(integer_target_cache),
            "replay_rows_read": 0,
            "selection_labels_read": False,
            "selection_evaluations": 0,
            "final_holdout_labels_read": False,
            "candidate_selected": False,
            "live_weights_changed": False,
        },
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--seed", type=int, choices=PROTOCOL.ALIGNMENT_SEEDS, required=True
    )
    arguments = parser.parse_args(argv)
    try:
        result = run_alignment_seed(arguments.seed)
    except (OSError, RuntimeError, ValueError) as error:
        print(f"[alignment] STOP: {error}", file=sys.stderr)
        return 1
    print(
        json.dumps(
            {
                "schema": "shogi-floodgate-strength-first-alignment-cli-v1",
                "status": "PASS",
                "seed": arguments.seed,
                "candidate": result["candidate_artifact"],
                "replay_rows_read": 0,
                "selection_labels_read": False,
                "final_holdout_labels_read": False,
                "live_weights_changed": False,
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = [
    "run_alignment_seed",
]
