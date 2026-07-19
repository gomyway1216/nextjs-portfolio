import copy
import hashlib
import json
import os
from pathlib import Path
from types import SimpleNamespace
import sys
import tempfile
import unittest
from unittest import mock


ML_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = ML_DIR.parent
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import fresh_qat_parent_accounting_v2 as ACCOUNTING  # noqa: E402
import fresh_qat_protocol as FRESH  # noqa: E402
import fresh_qat_v2_execution_dispatch as DISPATCH  # noqa: E402
from ml.tests_stdlib.test_fresh_qat_protocol import (  # noqa: E402
    synthetic_fixture,
)


ANCHOR_PATH = (
    REPO_ROOT / DISPATCH.FRESH_QAT_V2_ACTIVATION_ANCHOR_RELATIVE_PATH
)


def json_bytes(value):
    return (
        json.dumps(
            value,
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
            allow_nan=False,
        )
        + "\n"
    ).encode("utf-8")


def file_identity(relative, raw, *, schema=None, format_name=None):
    identity = {
        "path": relative,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }
    if schema is not None:
        identity["schema"] = schema
    if format_name is not None:
        identity["format"] = format_name
    return identity


def fixed_slots():
    return [
        {
            "id": f"floodgate-fresh-int16-aware-seed-{seed}",
            "seed": seed,
            "output": f"{FRESH.FRESH_QAT_RUN_ROOT}/seed-{seed}",
        }
        for seed in FRESH.FRESH_QAT_SLOT_ORDER
    ]


def parent_accounting(emitted):
    forced = DISPATCH.FRESH_QAT_V2_INPUT_PARENTS - emitted
    values = {
        "input_parents": DISPATCH.FRESH_QAT_V2_INPUT_PARENTS,
        "forced_parents_skipped": forced,
        "emitted_parent_groups": emitted,
        "equation": (
            "forced_parents_skipped+emitted_parent_groups=input_parents"
        ),
        "equation_verified": True,
        "model_training_parents": emitted,
        "replacement_parents": 0,
        "resampled_parents": 0,
        "emitted_order_preserved": True,
    }
    digest_fields = (
        "input_parent_ids_sha256",
        "forced_parent_ids_sha256",
        "emitted_parent_ids_sha256",
        "input_position_ids_sha256",
        "forced_position_ids_sha256",
        "emitted_position_ids_sha256",
        "input_parent_tuple_sequence_sha256",
        "forced_parent_tuple_sequence_sha256",
        "emitted_parent_tuple_sequence_sha256",
    )
    for index, field in enumerate(digest_fields, 1):
        values[field] = f"{index:x}" * 64
    return values


def ready_fixture(root, emitted=12_000):
    base = synthetic_fixture(root)
    input_raw = b'{"schema":"synthetic-enrolled-input-source"}\n'
    completion_raw = b'{"schema":"synthetic-enrolled-completion-source"}\n'
    train_raw = b'{"schema":"synthetic-ready-train-row"}\n'
    train = {
        **file_identity(
            DISPATCH.FRESH_QAT_V2_TRAIN_RELATIVE_PATH,
            train_raw,
            format_name=DISPATCH.FRESH_QAT_V2_TRAIN_FORMAT,
        ),
        "records": emitted * 2,
        "parents": emitted,
        "games": 1_000,
        "game_ids_sha256": "a" * 64,
        "parent_ids_sha256": "b" * 64,
        "semantic_position_ids_count": emitted,
        "semantic_position_ids_sha256": "c" * 64,
    }
    accounting = parent_accounting(emitted)
    input_training = {
        **file_identity(
            DISPATCH.FRESH_QAT_V2_INPUT_TRAINING_RELATIVE_PATH,
            input_raw,
            format_name=(
                ACCOUNTING.PRODUCTION_INPUT_TRAINING_BINDING["format"]
            ),
        ),
        "parents": DISPATCH.FRESH_QAT_V2_INPUT_PARENTS,
        "games": 1_000,
        "game_ids_sha256": "d" * 64,
        "parent_ids_sha256": accounting["input_parent_ids_sha256"],
        "position_ids_count": DISPATCH.FRESH_QAT_V2_INPUT_PARENTS,
        "position_ids_sha256": accounting["input_position_ids_sha256"],
    }
    parent_completion = {
        **file_identity(
            DISPATCH.FRESH_QAT_V2_PARENT_COMPLETION_RELATIVE_PATH,
            completion_raw,
            format_name=ACCOUNTING.FRESH_QAT_PARENT_COMPLETION_FORMAT,
        ),
        "records": DISPATCH.FRESH_QAT_V2_INPUT_PARENTS,
        "forced_parents_skipped": accounting["forced_parents_skipped"],
        "emitted_parent_groups": accounting["emitted_parent_groups"],
        "parent_ids_sha256": accounting["input_parent_ids_sha256"],
        "forced_parent_ids_sha256": accounting[
            "forced_parent_ids_sha256"
        ],
        "emitted_parent_ids_sha256": accounting[
            "emitted_parent_ids_sha256"
        ],
    }
    plan_stub = {"inputs": {"model_training": train}}
    slots = fixed_slots()
    proposal = {
        "schema": ACCOUNTING.FRESH_QAT_PARENT_ACCOUNTING_PROPOSAL_SCHEMA,
        "status": DISPATCH.FRESH_QAT_V2_PROPOSAL_STATUS,
        "materialization_boundary": DISPATCH.FRESH_QAT_V2_PROPOSAL_BOUNDARY,
        "protocol_amendment_sha256": (
            ACCOUNTING.FRESH_QAT_PARENT_ACCOUNTING_AMENDMENT_SHA256
        ),
        "execution_plan_schema": (
            DISPATCH.FRESH_QAT_V2_EXECUTION_PLAN_SCHEMA
        ),
        "upstream": {
            "preregistered_plan": copy.deepcopy(
                DISPATCH._PREREGISTERED_PLAN_IDENTITY
            ),
            "role_bundle_result": copy.deepcopy(
                DISPATCH._ROLE_BUNDLE_RESULT_IDENTITY
            ),
            "input_training": copy.deepcopy(input_training),
            "parent_completion": copy.deepcopy(parent_completion),
        },
        "parent_accounting": copy.deepcopy(accounting),
        "model_training": copy.deepcopy(train),
        "training_contracts": [
            FRESH.build_fresh_qat_training_contract(plan_stub, slot)
            for slot in slots
        ],
        "unchanged_contracts": {
            "training": copy.deepcopy(FRESH.FRESH_QAT_REQUIRED_TRAINING),
            "slots": slots,
            "selection": copy.deepcopy(FRESH.FRESH_QAT_REQUIRED_SELECTION),
            "training_contract_canonical_sha256": (
                ACCOUNTING.FRESH_QAT_TRAINING_CONTRACT_CANONICAL_SHA256
            ),
            "slot_registry_canonical_sha256": (
                ACCOUNTING.FRESH_QAT_SLOT_REGISTRY_CANONICAL_SHA256
            ),
            "selection_contract_canonical_sha256": (
                ACCOUNTING.FRESH_QAT_SELECTION_CONTRACT_CANONICAL_SHA256
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
    proposal_raw = json_bytes(proposal)
    proposal_identity = file_identity(
        DISPATCH.FRESH_QAT_V2_PARENT_ACCOUNTING_PROPOSAL_RELATIVE_PATH,
        proposal_raw,
        schema=ACCOUNTING.FRESH_QAT_PARENT_ACCOUNTING_PROPOSAL_SCHEMA,
    )

    plan = copy.deepcopy(base["plan"])
    plan["schema"] = DISPATCH.FRESH_QAT_V2_EXECUTION_PLAN_SCHEMA
    plan["status"] = DISPATCH.FRESH_QAT_V2_PLAN_STATUS
    plan["activation"] = {
        "anchor": copy.deepcopy(DISPATCH._ANCHOR_IDENTITY),
        "closed_parent_accounting_registry": copy.deepcopy(
            DISPATCH._CLOSED_V2_REGISTRY_IDENTITY
        ),
        "parent_accounting_proposal": copy.deepcopy(proposal_identity),
    }
    plan["parent_accounting"] = copy.deepcopy(accounting)
    plan["inputs"]["model_training"] = {
        field: train[field] for field in DISPATCH._MODEL_TRAINING_FIELDS
    }
    plan["inputs"]["replay_exclusion"]["components"]["legacy"] = (
        copy.deepcopy(FRESH.FRESH_QAT_LEGACY_REPLAY_COMPONENT_IDENTITY)
    )
    plan_raw = json_bytes(plan)
    plan_identity = file_identity(
        DISPATCH.FRESH_QAT_V2_EXECUTION_PLAN_RELATIVE_PATH,
        plan_raw,
        schema=DISPATCH.FRESH_QAT_V2_EXECUTION_PLAN_SCHEMA,
    )
    successor = {
        "schema": DISPATCH.FRESH_QAT_V2_READY_SUCCESSOR_SCHEMA,
        "status": DISPATCH.FRESH_QAT_V2_READY_STATUS,
        "activation_anchor": copy.deepcopy(DISPATCH._ANCHOR_IDENTITY),
        "closed_parent_accounting_registry": copy.deepcopy(
            DISPATCH._CLOSED_V2_REGISTRY_IDENTITY
        ),
        "execution_plan": plan_identity,
        "parent_accounting_proposal": proposal_identity,
        "input_training": copy.deepcopy(input_training),
        "parent_completion": copy.deepcopy(parent_completion),
        "train_jsonl": copy.deepcopy(train),
        "parent_accounting": {
            field: accounting[field]
            for field in DISPATCH._ACCOUNTING_COUNT_FIELDS
        },
        "allowed_schema_pair": copy.deepcopy(
            DISPATCH.FRESH_QAT_V2_SCHEMA_PAIR
        ),
        "gates": {
            field: True for field in DISPATCH._READY_GATE_FIELDS
        },
        "authority": {
            "artifact_read_authorized": True,
            "torch_read_authorized": True,
            "training_contract_issue_authorized": True,
            "training_dispatch_authorized": True,
            "selection_reader_authorized": False,
            "holdout_reader_authorized": False,
            "production_weight_write_authorized": False,
        },
        "nonclaims": {
            field: False for field in DISPATCH._READY_NONCLAIM_FIELDS
        },
    }
    successor_raw = json_bytes(successor)
    protocol = {
        str(
            root / DISPATCH.FRESH_QAT_V2_ACTIVATION_ANCHOR_RELATIVE_PATH
        ): ANCHOR_PATH.read_bytes(),
        str(
            root / DISPATCH.FRESH_QAT_V2_READY_SUCCESSOR_RELATIVE_PATH
        ): successor_raw,
    }
    for relative in (
        FRESH.FRESH_QAT_REGISTRY_RELATIVE_PATH,
        DISPATCH._V1_SELECTION_REGISTRY_IDENTITY["path"],
        ACCOUNTING.FRESH_QAT_PLAN_REGISTRY_PATH_V2,
    ):
        protocol[str(root / relative)] = (REPO_ROOT / relative).read_bytes()
    artifacts = {
        str(
            root
            / DISPATCH.FRESH_QAT_V2_PARENT_ACCOUNTING_PROPOSAL_RELATIVE_PATH
        ): proposal_raw,
        str(
            root / DISPATCH.FRESH_QAT_V2_EXECUTION_PLAN_RELATIVE_PATH
        ): plan_raw,
        str(
            root / DISPATCH.FRESH_QAT_V2_INPUT_TRAINING_RELATIVE_PATH
        ): input_raw,
        str(
            root / DISPATCH.FRESH_QAT_V2_PARENT_COMPLETION_RELATIVE_PATH
        ): completion_raw,
        str(root / DISPATCH.FRESH_QAT_V2_TRAIN_RELATIVE_PATH): train_raw,
    }
    args = copy.deepcopy(base["args"])
    args.experiment_plan = str(
        root / DISPATCH.FRESH_QAT_V2_EXECUTION_PLAN_RELATIVE_PATH
    )
    args.data = str(root / DISPATCH.FRESH_QAT_V2_TRAIN_RELATIVE_PATH)
    return {
        "root": root,
        "args": args,
        "runtime": base["runtime"],
        "plan": plan,
        "plan_raw": plan_raw,
        "proposal": proposal,
        "proposal_raw": proposal_raw,
        "input_raw": input_raw,
        "completion_raw": completion_raw,
        "successor": successor,
        "successor_raw": successor_raw,
        "train": train,
        "protocol": protocol,
        "artifacts": artifacts,
    }


def mapping_reader(values):
    def read(path):
        try:
            return values[str(path)]
        except KeyError as error:
            raise FileNotFoundError(str(path)) from error

    return read


class FreshQatV2ExecutionDispatchTests(unittest.TestCase):
    def test_anchor_is_exact_and_successor_is_intentionally_absent(self):
        raw = ANCHOR_PATH.read_bytes()
        self.assertEqual(
            len(raw),
            DISPATCH.FRESH_QAT_V2_ACTIVATION_ANCHOR_BYTES,
        )
        self.assertEqual(
            hashlib.sha256(raw).hexdigest(),
            DISPATCH.FRESH_QAT_V2_ACTIVATION_ANCHOR_SHA256,
        )
        anchor = DISPATCH.validate_fresh_qat_v2_activation_anchor(
            ANCHOR_PATH
        )
        self.assertFalse(anchor["gates"]["ready_successor_present"])
        self.assertTrue(
            all(value is False for value in anchor["authority"].values())
        )
        self.assertFalse(
            (
                REPO_ROOT
                / DISPATCH.FRESH_QAT_V2_READY_SUCCESSOR_RELATIVE_PATH
            ).exists()
        )

    def test_default_reader_rejects_nonregular_and_unbounded_files_preopen(self):
        if not hasattr(os, "mkfifo"):
            self.skipTest("FIFO creation is unavailable")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            regular = root / "regular.bin"
            regular.write_bytes(b"four")
            symlink = root / "regular-link.bin"
            symlink.symlink_to(regular)
            fifo = root / "blocked.fifo"
            os.mkfifo(fifo)

            for label, candidate in (
                ("symlink", symlink),
                ("device", Path("/dev/null")),
            ):
                if not candidate.exists():
                    continue
                with self.subTest(label=label):
                    with self.assertRaisesRegex(
                        ValueError,
                        "regular non-symlink",
                    ):
                        DISPATCH._default_reader(str(candidate))

            real_open = os.open
            with mock.patch.object(
                DISPATCH.os,
                "open",
                wraps=real_open,
            ) as opener:
                with self.assertRaisesRegex(
                    ValueError,
                    "regular non-symlink",
                ):
                    DISPATCH._default_reader(str(fifo))
            self.assertNotIn(
                fifo.name,
                [call.args[0] for call in opener.call_args_list],
            )

            identity = {
                "path": regular.name,
                "bytes": 3,
                "sha256": hashlib.sha256(b"fou").hexdigest(),
            }
            with mock.patch.object(
                DISPATCH.os,
                "open",
                wraps=real_open,
            ) as opener:
                with self.assertRaisesRegex(
                    ValueError,
                    "byte length mismatch",
                ):
                    DISPATCH._read_bound_file(
                        str(root),
                        identity,
                        "bounded fixture",
                        DISPATCH._default_reader,
                    )
            self.assertNotIn(
                regular.name,
                [call.args[0] for call in opener.call_args_list],
            )

            oversized = root / "oversized.bin"
            oversized.write_bytes(
                b"x" * (DISPATCH._DEFAULT_UNBOUND_PROTOCOL_MAX_BYTES + 1)
            )
            with mock.patch.object(
                DISPATCH.os,
                "open",
                wraps=real_open,
            ) as opener:
                with self.assertRaisesRegex(
                    ValueError,
                    "exceeds the maximum",
                ):
                    DISPATCH._default_reader(str(oversized))
            self.assertNotIn(
                oversized.name,
                [call.args[0] for call in opener.call_args_list],
            )

    def test_root_bound_reader_holds_directories_and_redacts_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory).resolve()
            root = base / "repo"
            data = root / "ml" / "data"
            data.mkdir(parents=True)
            artifact = data / "artifact.bin"
            artifact.write_bytes(b"safe")
            outside = base / "outside"
            outside.mkdir()
            outside_artifact = outside / artifact.name
            outside_artifact.write_bytes(b"safe")
            identity = {
                "path": "ml/data/artifact.bin",
                "bytes": 4,
                "sha256": hashlib.sha256(b"safe").hexdigest(),
            }

            self.assertEqual(
                DISPATCH._read_bound_file(
                    str(root),
                    identity,
                    "root-bound fixture",
                    DISPATCH._default_reader,
                ),
                b"safe",
            )

            real_open = os.open
            held_data = data.with_name("data-held")
            intermediate_swapped = False

            def swap_intermediate(path, flags, *args, **kwargs):
                nonlocal intermediate_swapped
                if (
                    not intermediate_swapped
                    and path == "data"
                    and kwargs.get("dir_fd") is not None
                ):
                    data.rename(held_data)
                    data.symlink_to(outside, target_is_directory=True)
                    intermediate_swapped = True
                return real_open(path, flags, *args, **kwargs)

            with mock.patch.object(
                DISPATCH.os,
                "open",
                side_effect=swap_intermediate,
            ):
                with self.assertRaisesRegex(
                    ValueError,
                    "secure file access failed",
                ) as raised:
                    DISPATCH._read_bound_file(
                        str(root),
                        identity,
                        "root-bound fixture",
                        DISPATCH._default_reader,
                    )
            self.assertTrue(intermediate_swapped)
            self.assertNotIn(str(root), str(raised.exception))
            self.assertNotIn(str(outside), str(raised.exception))
            data.unlink()
            held_data.rename(data)

            held_artifact = artifact.with_name("artifact-held.bin")
            final_swapped = False

            def swap_final(path, flags, *args, **kwargs):
                nonlocal final_swapped
                if (
                    not final_swapped
                    and path == artifact.name
                    and kwargs.get("dir_fd") is not None
                ):
                    artifact.rename(held_artifact)
                    artifact.symlink_to(outside_artifact)
                    final_swapped = True
                return real_open(path, flags, *args, **kwargs)

            with mock.patch.object(
                DISPATCH.os,
                "open",
                side_effect=swap_final,
            ):
                with self.assertRaisesRegex(
                    ValueError,
                    "secure file access failed",
                ) as raised:
                    DISPATCH._read_bound_file(
                        str(root),
                        identity,
                        "root-bound fixture",
                        DISPATCH._default_reader,
                    )
            self.assertTrue(final_swapped)
            self.assertNotIn(str(root), str(raised.exception))
            self.assertNotIn(str(outside), str(raised.exception))
            artifact.unlink()
            held_artifact.rename(artifact)

            missing = dict(identity, path="ml/data/private-missing.bin")
            with self.assertRaisesRegex(
                ValueError,
                "secure file access failed",
            ) as raised:
                DISPATCH._read_bound_file(
                    str(root),
                    missing,
                    "root-bound fixture",
                    DISPATCH._default_reader,
                )
            self.assertNotIn(str(root), str(raised.exception))
            self.assertNotIn("private-missing.bin", str(raised.exception))

    def test_absent_successor_stops_before_artifact_or_runtime_reads(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            anchor_path = str(
                root
                / DISPATCH.FRESH_QAT_V2_ACTIVATION_ANCHOR_RELATIVE_PATH
            )
            successor_path = str(
                root
                / DISPATCH.FRESH_QAT_V2_READY_SUCCESSOR_RELATIVE_PATH
            )
            protocol_reader = mock.Mock(
                side_effect=mapping_reader(
                    {anchor_path: ANCHOR_PATH.read_bytes()}
                )
            )
            artifact_reader = mock.Mock()
            runtime_reader = mock.Mock()
            tracker = mock.Mock()
            args = SimpleNamespace(
                experiment_plan=str(
                    root
                    / DISPATCH.FRESH_QAT_V2_EXECUTION_PLAN_RELATIVE_PATH
                ),
                pipeline_revision="a" * 40,
            )

            with self.assertRaises(
                DISPATCH.FreshQATV2ActivationStop
            ) as raised:
                DISPATCH.dispatch_fresh_qat_v2_execution_plan_core_for_tests(
                    args,
                    tracking_verifier=tracker,
                    repo_root=str(root),
                    protocol_reader=protocol_reader,
                    artifact_reader=artifact_reader,
                    training_runtime_reader=runtime_reader,
                )

            self.assertEqual(raised.exception.phase, "ready-successor")
            self.assertFalse(raised.exception.artifact_reads_authorized)
            self.assertFalse(raised.exception.torch_reads_authorized)
            self.assertFalse(raised.exception.training_contract_issued)
            self.assertEqual(
                protocol_reader.call_args_list,
                [
                    mock.call(anchor_path),
                    mock.call(anchor_path),
                    mock.call(successor_path),
                ],
            )
            artifact_reader.assert_not_called()
            runtime_reader.assert_not_called()
            tracker.assert_called_once_with(anchor_path, "a" * 40)

    def test_repository_alias_allows_only_external_ancestor_symlinks(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory).resolve()
            root = base / "repository"
            root.mkdir()
            relatives = (
                DISPATCH.FRESH_QAT_V2_EXECUTION_PLAN_RELATIVE_PATH,
                DISPATCH.FRESH_QAT_V2_TRAIN_RELATIVE_PATH,
                "ml/data/floodgate-q1-2026-fresh-qat-v2/"
                "seed42/model.pt",
            )
            for relative in relatives:
                target = root / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.touch()

            alias = base / "repository-alias"
            alias.symlink_to(root, target_is_directory=True)
            for relative in relatives:
                with self.subTest(relative=relative):
                    expected = str(root / relative)
                    self.assertEqual(
                        DISPATCH._exact_repository_path(
                            str(alias / relative),
                            str(root),
                            relative,
                            "path mismatch",
                        ),
                        expected,
                    )

            inner_alias = root / "ml-alias"
            inner_alias.symlink_to(root / "ml", target_is_directory=True)
            with self.assertRaisesRegex(ValueError, "path mismatch"):
                DISPATCH._exact_repository_path(
                    str(
                        inner_alias
                        / "protocols"
                        / Path(
                            DISPATCH
                            .FRESH_QAT_V2_EXECUTION_PLAN_RELATIVE_PATH
                        ).name
                    ),
                    str(root),
                    DISPATCH.FRESH_QAT_V2_EXECUTION_PLAN_RELATIVE_PATH,
                    "path mismatch",
                )

            plan_path = (
                root / DISPATCH.FRESH_QAT_V2_EXECUTION_PLAN_RELATIVE_PATH
            )
            plan_target = plan_path.with_name("exact-plan-target.json")
            plan_path.replace(plan_target)
            plan_path.symlink_to(plan_target)
            with self.assertRaisesRegex(ValueError, "path mismatch"):
                DISPATCH._exact_repository_path(
                    str(
                        alias
                        / DISPATCH
                        .FRESH_QAT_V2_EXECUTION_PLAN_RELATIVE_PATH
                    ),
                    str(root),
                    DISPATCH.FRESH_QAT_V2_EXECUTION_PLAN_RELATIVE_PATH,
                    "path mismatch",
                )

    def test_partial_and_full_emission_ready_shapes_are_valid(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = ready_fixture(Path(directory).resolve(), emitted=12_000)
            result = DISPATCH.validate_fresh_qat_v2_ready_successor_data(
                fixture["successor"]
            )
            self.assertEqual(
                result["parent_accounting"]["forced_parents_skipped"],
                12_000,
            )
            self.assertEqual(
                result["train_jsonl"]["parents"],
                result["parent_accounting"]["emitted_parent_groups"],
            )

        with tempfile.TemporaryDirectory() as directory:
            fixture = ready_fixture(Path(directory).resolve(), emitted=24_000)
            result = DISPATCH.validate_fresh_qat_v2_ready_successor_data(
                fixture["successor"]
            )
            self.assertEqual(
                result["parent_accounting"]["forced_parents_skipped"],
                0,
            )

    def test_all_forced_declaration_fails_before_source_authentication(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = ready_fixture(Path(directory).resolve(), emitted=1)
            successor = copy.deepcopy(fixture["successor"])
            successor["parent_accounting"][
                "forced_parents_skipped"
            ] = 24_000
            successor["parent_accounting"]["emitted_parent_groups"] = 0
            successor["parent_accounting"]["model_training_parents"] = 0
            with mock.patch.object(
                FRESH, "build_fresh_qat_training_contract"
            ) as contract_builder:
                with self.assertRaises(
                    DISPATCH.FreshQATV2NoTrainableParentGroups
                ) as raised:
                    DISPATCH.validate_fresh_qat_v2_ready_successor_data(
                        successor
                    )
            contract_builder.assert_not_called()
            self.assertEqual(raised.exception.phase, "parent-accounting")
            self.assertIn(
                "source authentication was not reached",
                str(raised.exception),
            )

    def test_ready_shape_rejects_near_paths_schemas_hybrids_and_authority(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = ready_fixture(Path(directory).resolve())
            mutations = {
                "wrong successor schema": lambda item: item.__setitem__(
                    "schema", "shogi-floodgate-fresh-qat-v2-ready-successor-v2"
                ),
                "near plan path": lambda item: item["execution_plan"].__setitem__(
                    "path",
                    DISPATCH.FRESH_QAT_V2_EXECUTION_PLAN_RELATIVE_PATH + ".copy",
                ),
                "v1 plan hybrid": lambda item: item["execution_plan"].__setitem__(
                    "schema", FRESH.FRESH_QAT_EXECUTION_PLAN_SCHEMA
                ),
                "v2 contract hybrid": lambda item: item[
                    "allowed_schema_pair"
                ].__setitem__(
                    "training_contract",
                    "shogi-floodgate-fresh-qat-training-experiment-v2",
                ),
                "broken F plus E": lambda item: item[
                    "parent_accounting"
                ].__setitem__("forced_parents_skipped", 11_999),
                "closed ready gate": lambda item: item["gates"].__setitem__(
                    "train_identity_registered", False
                ),
                "selection authority": lambda item: item[
                    "authority"
                ].__setitem__("selection_reader_authorized", True),
                "invented result": lambda item: item["nonclaims"].__setitem__(
                    "strength_improved", True
                ),
                "boolean count": lambda item: item[
                    "parent_accounting"
                ].__setitem__("emitted_parent_groups", True),
            }
            for label, mutate in mutations.items():
                with self.subTest(label=label):
                    successor = copy.deepcopy(fixture["successor"])
                    mutate(successor)
                    with self.assertRaises(ValueError):
                        DISPATCH.validate_fresh_qat_v2_ready_successor_data(
                            successor
                        )

    def test_proposal_binds_exact_train_emission_and_frozen_contracts(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = ready_fixture(Path(directory).resolve())
            proposal = DISPATCH._validate_proposal(
                fixture["proposal"],
                fixture["successor"],
            )
            self.assertEqual(
                proposal["model_training"]["parents"],
                fixture["successor"]["parent_accounting"][
                    "emitted_parent_groups"
                ],
            )
            mutations = {
                "train parent identity": lambda item: item[
                    "model_training"
                ].__setitem__("parent_ids_sha256", "0" * 64),
                "emitted count": lambda item: item[
                    "parent_accounting"
                ].__setitem__("emitted_parent_groups", 11_999),
                "replacement parent": lambda item: item[
                    "parent_accounting"
                ].__setitem__("replacement_parents", 1),
                "slot drift": lambda item: item[
                    "unchanged_contracts"
                ]["slots"][0].__setitem__("seed", 45),
                "contract schema drift": lambda item: item[
                    "training_contracts"
                ][0].__setitem__(
                    "schema",
                    "shogi-floodgate-fresh-qat-training-experiment-v2",
                ),
                "authority field omitted": lambda item: item["authority"].pop(
                    "teacher_execution_authorized"
                ),
                "synthetic upstream": lambda item: item[
                    "upstream"
                ].__setitem__("input_training", {"synthetic_only": True}),
            }
            for label, mutate in mutations.items():
                with self.subTest(label=label):
                    changed = copy.deepcopy(fixture["proposal"])
                    mutate(changed)
                    with self.assertRaises(ValueError):
                        DISPATCH._validate_proposal(
                            changed,
                            fixture["successor"],
                        )

    def test_synthetic_sources_cannot_issue_a_contract_without_enrollment(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = ready_fixture(Path(directory).resolve())
            protocol_reader = mock.Mock(
                side_effect=mapping_reader(fixture["protocol"])
            )
            artifact_reader = mock.Mock(
                side_effect=mapping_reader(fixture["artifacts"])
            )
            runtime_reader = mock.Mock()
            tracker = mock.Mock()
            with mock.patch.object(
                FRESH, "build_fresh_qat_training_contract"
            ) as contract_builder:
                with self.assertRaisesRegex(
                    ValueError,
                    "authenticated per-parent completion evidence is not enrolled",
                ):
                    DISPATCH.dispatch_fresh_qat_v2_execution_plan_core_for_tests(
                        fixture["args"],
                        tracking_verifier=tracker,
                        repo_root=str(fixture["root"]),
                        protocol_reader=protocol_reader,
                        artifact_reader=artifact_reader,
                        training_runtime_reader=runtime_reader,
                    )
            contract_builder.assert_not_called()
            runtime_reader.assert_not_called()

    def test_exact_source_bytes_are_bound_before_production_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = ready_fixture(Path(directory).resolve())
            source_paths = (
                DISPATCH.FRESH_QAT_V2_INPUT_TRAINING_RELATIVE_PATH,
                DISPATCH.FRESH_QAT_V2_PARENT_COMPLETION_RELATIVE_PATH,
                DISPATCH.FRESH_QAT_V2_TRAIN_RELATIVE_PATH,
            )
            for relative in source_paths:
                with self.subTest(relative=relative):
                    artifacts = dict(fixture["artifacts"])
                    artifacts[str(fixture["root"] / relative)] += b"x"
                    runtime_reader = mock.Mock()
                    with mock.patch.object(
                        ACCOUNTING,
                        "validate_fresh_qat_parent_accounting_proposal_v2",
                    ) as source_validator, mock.patch.object(
                        FRESH, "build_fresh_qat_training_contract"
                    ) as contract_builder:
                        with self.assertRaisesRegex(
                            ValueError,
                            "byte length mismatch",
                        ):
                            DISPATCH.dispatch_fresh_qat_v2_execution_plan_core_for_tests(
                                fixture["args"],
                                tracking_verifier=mock.Mock(),
                                repo_root=str(fixture["root"]),
                                protocol_reader=mapping_reader(
                                    fixture["protocol"]
                                ),
                                artifact_reader=mapping_reader(artifacts),
                                training_runtime_reader=runtime_reader,
                            )
                    source_validator.assert_not_called()
                    contract_builder.assert_not_called()
                    runtime_reader.assert_not_called()

    def test_future_ready_core_cross_binds_plan_proposal_train_and_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = ready_fixture(Path(directory).resolve())
            protocol_reader = mock.Mock(
                side_effect=mapping_reader(fixture["protocol"])
            )
            artifact_reader = mock.Mock(
                side_effect=mapping_reader(fixture["artifacts"])
            )
            runtime_reader = mock.Mock(return_value=fixture["runtime"])
            tracker = mock.Mock()
            selected = fixture["plan"]["slots"][0]
            verified = {
                "model_training": {
                    "sha256": fixture["train"]["sha256"]
                }
            }
            with mock.patch.object(
                DISPATCH,
                "_validate_args_and_runtime",
                return_value=(selected, verified),
            ) as args_verifier, mock.patch.object(
                ACCOUNTING,
                "validate_fresh_qat_parent_accounting_proposal_v2",
                return_value=fixture["proposal"],
            ) as source_validator:
                binding = (
                    DISPATCH
                    .dispatch_fresh_qat_v2_execution_plan_core_for_tests(
                        fixture["args"],
                        tracking_verifier=tracker,
                        repo_root=str(fixture["root"]),
                        protocol_reader=protocol_reader,
                        artifact_reader=artifact_reader,
                        training_runtime_reader=runtime_reader,
                    )
                )

            self.assertEqual(
                binding["provenance"]["schema"],
                DISPATCH.FRESH_QAT_V2_EXECUTION_PLAN_SCHEMA,
            )
            self.assertEqual(
                binding["provenance"]["emitted_parent_groups"],
                12_000,
            )
            self.assertEqual(
                binding["provenance"]["forced_parents_skipped"],
                12_000,
            )
            self.assertEqual(
                binding["contract"]["model_training_parents"],
                12_000,
            )
            self.assertEqual(
                binding["contract"]["schema"],
                FRESH.FRESH_QAT_TRAINING_CONTRACT_SCHEMA,
            )
            runtime_reader.assert_called_once_with()
            args_verifier.assert_called_once()
            source_validator.assert_called_once_with(
                fixture["proposal"],
                fixture["input_raw"],
                fixture["completion_raw"],
                fixture["artifacts"][
                    str(
                        fixture["root"]
                        / DISPATCH.FRESH_QAT_V2_TRAIN_RELATIVE_PATH
                    )
                ],
            )
            self.assertGreaterEqual(artifact_reader.call_count, 10)
            tracked = [call.args[0] for call in tracker.call_args_list]
            self.assertIn(
                str(
                    fixture["root"]
                    / DISPATCH.FRESH_QAT_V2_EXECUTION_PLAN_RELATIVE_PATH
                ),
                tracked,
            )
            self.assertIn(
                str(
                    fixture["root"]
                    / DISPATCH.FRESH_QAT_V2_TRAIN_RELATIVE_PATH
                ),
                tracked,
            )

    def test_plan_rejects_wrong_schema_or_proposal_accounting(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = ready_fixture(Path(directory).resolve())
            DISPATCH._validate_plan(
                fixture["plan"],
                fixture["proposal"],
                fixture["successor"],
            )
            wrong_schema = copy.deepcopy(fixture["plan"])
            wrong_schema["schema"] = FRESH.FRESH_QAT_EXECUTION_PLAN_SCHEMA
            with self.assertRaisesRegex(ValueError, "contract mismatch"):
                DISPATCH._validate_plan(
                    wrong_schema,
                    fixture["proposal"],
                    fixture["successor"],
                )
            wrong_accounting = copy.deepcopy(fixture["plan"])
            wrong_accounting["parent_accounting"][
                "forced_parents_skipped"
            ] -= 1
            with self.assertRaisesRegex(ValueError, "plan/proposal"):
                DISPATCH._validate_plan(
                    wrong_accounting,
                    fixture["proposal"],
                    fixture["successor"],
                )

    def test_strict_json_rejects_duplicate_keys_and_nonfinite_values(self):
        with self.assertRaisesRegex(ValueError, "duplicate JSON key"):
            DISPATCH._strict_json(
                b'{"schema":"one","schema":"two"}',
                "duplicate successor",
            )
        with self.assertRaisesRegex(ValueError, "non-finite"):
            DISPATCH._strict_json(
                b'{"value":NaN}',
                "non-finite successor",
            )

    def test_frozen_predecessor_bytes_are_unchanged(self):
        expected = (
            (
                FRESH.FRESH_QAT_REGISTRY_RELATIVE_PATH,
                409,
                "9a1af8144cda4a222e300676c1475d69314c5ac32fe6a11a58adf7acfe5d9a00",
            ),
            (
                DISPATCH._V1_SELECTION_REGISTRY_IDENTITY["path"],
                2_294,
                "7593d5675884431e5fbcc71c7925b7f094c3ab48f6de9f74850b195f57aedd39",
            ),
            (
                ACCOUNTING.FRESH_QAT_PLAN_REGISTRY_PATH_V2,
                3_501,
                "97bd6c1839288f505d31e62904ba095a0ccd11a5dc1f5a58d37f21bea11e214c",
            ),
        )
        for relative, byte_count, sha256 in expected:
            with self.subTest(relative=relative):
                raw = (REPO_ROOT / relative).read_bytes()
                self.assertEqual(len(raw), byte_count)
                self.assertEqual(hashlib.sha256(raw).hexdigest(), sha256)


if __name__ == "__main__":
    unittest.main()
