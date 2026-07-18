# Closing digest-only launch conditions into canonical bytes — Floodgate v7

> The preceding [external supervisor / verifier source boundary](./blog-shogi-floodgate-v7-external-supervisor-verifier-source.en.md) defined a signed handoff and a 220-byte runtime-launch policy. Its argv, working directory, environment, and runtime-install policy were still represented only by SHA-256 values, with no canonical preimages that independent implementations could recompute. This change adds those four preimages and fixed-key golden vectors to source and tests. It performs no process launch, root installation, production-key operation, or production inspection; both executables remain fixed STOPs that exit 78. The operational decision remains **UNAVAILABLE / STOP**. Japanese version: [blog-shogi-floodgate-v7-runtime-policy-preimages.md](./blog-shogi-floodgate-v7-runtime-policy-preimages.md)

## 1. Result

The boundary moves from “trust this digest” to recomputable records that state which bytes are hashed, what would be launched, and which filesystem metadata would be required.

| Boundary        | Canonically fixed here                                                                                           | Still absent                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| argv            | exactly two absolute paths: the future root-owned Node and diagnostic bundle                                     | spawn / exec                      |
| cwd             | exact `/`                                                                                                        | application to a real process     |
| environment     | exactly zero entries                                                                                             | application to a real process     |
| runtime install | 11 paths, owner, group, mode, link rule, no-follow, same-device, local-filesystem, and zero writable ACL entries | installer / filesystem verifier   |
| signed handoff  | mandatory closure from manifest → launch policy → four preimages → Node / bundle identities                      | production manifest / keys / head |
| cross parser    | shared fixed-Ed25519-key canonical bytes, SHA-256 values, and signatures                                         | production key material           |

This makes the representation and verification of launch conditions stronger. It is not evidence of a safe installation, a production inspection, or increased playing strength.

## 2. What an opaque digest left unspecified

SHA-256 is strong when the correct preimage is already agreed. A field named “argv digest” or “environment digest” plus 32 bytes does not itself define:

- element counts, length encoding, or integer endianness;
- path encoding or absolute-versus-relative semantics;
- whether argv[0] is included;
- environment ordering, duplicates, or the distinction from empty;
- how far ancestor inspection extends; or
- owner, group, mode, link-count, and ACL comparison rules.

Swift and a future separate process could therefore hash different byte strings while calling them the same policy. This change avoids variable JSON and maps in the wire format. Each record has a versioned magic, fixed field order, big-endian lengths, and exact byte count. Any wrong length, magic, tag, fixed path, metadata value, or trailing byte fails closed as the single `invalidCanonicalRecord` error.

## 3. Four canonical preimages

| Record                           | Magic      | Bytes | Pinned SHA-256                                                     |
| -------------------------------- | ---------- | ----: | ------------------------------------------------------------------ |
| fixed argv                       | `FGV7ARV1` |   265 | `bf7c65abbc101939ca4b3bccbd52c17891e12e6db50af141b6784d753b936b15` |
| fixed working directory          | `FGV7CWD1` |    17 | `01329f16e0b138c9583da158e6f533dfc8278d5102e0c2d0e9b2e30704d4c98e` |
| fixed environment                | `FGV7ENV1` |    16 | `b4c85fb22072c92826ccfadce1555b3a25515aa45c27224498f0cad35c5a509d` |
| runtime-install mutation fixture | `FGV7RIP1` | 1,307 | `9582e2e987ece65e3d9dc4d6291ddeae055d97e06033d9e45590c0518e0c9803` |

The first three records fix their values as well as their formats, so their digests are invariant. The runtime-install record carries nine variable digest fields, including Node and bundle identities: its format and length are fixed, but its digest varies with those nine fields. The table uses a synthetic fixed-record mutation fixture. Its framing, fixed-policy, and path-metadata bytes are exhaustively mutated. Its nine variable 32-byte fields comprise one record ID, six Node/bundle identity digests, one filesystem-identity-policy digest, and one ACL-policy digest. The canonical decoder guarantees only that they are nonzero and pairwise distinct; observing those identities and policies against real artifacts and filesystems remains a later gate. The shared golden fixture and a future production record intentionally have different digests.

The argv record permits only:

1. `/Library/Application Support/com.gomyway1216.shogi-floodgate-v7/ExternalTrustRoot/v1/runtime/bin/node`
2. `/Library/Application Support/com.gomyway1216.shogi-floodgate-v7/ExternalTrustRoot/v1/runtime/lib/floodgate-v7-stable-deadline-diagnostic.cjs`

It includes no caller arguments, `--eval`, preload, shell, or JXA intermediary. The working directory is `/` and the environment contains zero entries. The representation therefore forbids implicitly inheriting caller-controlled `NODE_OPTIONS`, `PATH`, `HOME`, `DYLD_*`, or similar values.

## 4. The runtime-install record's 11-path closure

The record fixes this order from `/` through the two runtime files:

1. `/`
2. `/Library`
3. `/Library/Application Support`
4. `/Library/Application Support/com.gomyway1216.shogi-floodgate-v7`
5. `.../ExternalTrustRoot`
6. `.../ExternalTrustRoot/v1`
7. `.../ExternalTrustRoot/v1/runtime`
8. `.../runtime/bin`
9. `.../runtime/bin/node`
10. `.../runtime/lib`
11. `.../runtime/lib/floodgate-v7-stable-deadline-diagnostic.cjs`

Directories require root ownership and mode 0755; `/Library/Application Support` alone fixes macOS's normal `admin` group (GID 80). Node is a root:wheel regular file with mode 0555 and exact link count 1. The bundle is a root:wheel regular file with mode 0444 and exact link count 1. The global policy requires no-follow traversal, one device, a local filesystem, and zero allowed writable ACL entries.

The record separately carries Node whole-file, CodeDirectory, designated-requirement, and held-executable identity digests, plus bundle whole-file and held-file identities. A correct path does not make different bytes, a different code-signing identity, or a post-open replacement equivalent.

## 5. Making the preimages mandatory in signed handoff

Adding records would not close the boundary if callers could retain a path that supplied only the old raw `RuntimeLaunchPolicyRecordV1`. Every challenge, receipt, and attestation API therefore now requires `RuntimeLaunchPreimageClosureV1`.

The binding is:

```text
signed challenge / receipt / attestation
  → source-manifest SHA-256
    → runtime-launch-policy SHA-256
      → fixed argv / cwd / environment / runtime-install SHA-256
        → Node / bundle bytes, code identity, and held identity
```

The closure rechecks all four canonical digests, the bundle digest, all four Node identities pinned by the manifest, audience and purpose, and the complete canonical manifest digest. Composition tests reject substitution of only argv, cwd, environment, the install record, the bundle, one Node identity, or even an apparently unrelated manifest field.

## 6. Avoiding a Swift-only consensus

A round trip through one encoder and its matching decoder can pass when both share the same error. Public test seeds therefore derive distinct authority, supervisor, and verifier Ed25519 keys and pin the following in one shared JSON fixture:

- raw public keys and their SHA-256 key IDs;
- fixed argv, working-directory, environment, runtime-install, and runtime-launch-policy records;
- the repository source manifest and authority-signed enrollment and activation envelopes;
- an expected head that names the signed activation envelope;
- a supervisor challenge, verifier receipt, and one-shot attestation bound to the manifest, head, and signed activation;
- signature payloads, 64-byte signatures, canonical bytes, and canonical SHA-256 values; and
- field offsets, lengths, and the manifest → enrollment → signed envelope → head → challenge → receipt → attestation digest chain.

Swift strictly decodes and exactly re-encodes the fixture's canonical bytes, then uses CryptoKit to verify the public keys, key IDs, and fixture signatures. Node imports no Swift implementation: it uses only standard `crypto` and an independent big-endian parser to verify lengths, offsets, hashes, key IDs, and Ed25519 signatures. Negative cases mutate domain magic, role keys, and chained digests.

The 14-record fixture does not include the canonical preimages for the release supervisor/verifier `FGV7ACL1` artifact closure or `FGV7INP1` install policy. The manifest therefore carries a distinct synthetic digest rather than aliasing the runtime `FGV7RIP1` digest, and the omitted preimages are explicitly out of scope. The protocol's real authority-to-manifest link is the authority-signed enrollment carrying the manifest's canonical SHA-256; no fixture-only derivation rule is added.

Swift also injects a closure that is internally valid for a different manifest into each of the four public handoff entrypoints and requires every path to fail closed. CI generates the public symbol graph and checks that those four entrypoints require `RuntimeLaunchPreimageClosureV1`, while six signature/freshness-only or raw-policy partial entrypoints remain non-public.

During implementation, repeated local CryptoKit signing with the same seed and payload produced different 64-byte values that were all valid under the same public key. The cross-parser contract therefore does not require both implementations to regenerate identical signature bytes. It requires both to parse the same fixed canonical signed bytes at the same field boundaries and verify them with the same public key. The fixture signature is a fixed test vector generated by Node's standard `crypto`.

These are not production keys. Their seeds are public test vectors and must never be provisioned into production.

## 7. Measurements and nonclaims

The implementation evidence revision is `773f7eb88f943385ac89a6ec0e61d9e7a23e5e12`, based on PR #499's regular merge `e142d844fcf5e2b189bb29a1ee9880df74afaf1a`. The initial independent review found three P2 issues at `385f1c8bc9f31f784a491526c86125642cb9b622`; the signed-envelope chain, real closure-drift injection, and partial public APIs were then fixed. A second review found two P2 issues at `f75638e66f6903ba3ccac93de7b3f9bd484b405f`; the aliased policy domains and fixture-only authority rule were then removed. The final implementation-tree-only re-review found P0 / P1 / P2 = 0 / 0 / 0 at `773f7eb88f943385ac89a6ec0e61d9e7a23e5e12`.

The bilingual articles, data, evidence test, and provenance CI settings are checked under a separate publication review. Its first pass found three P1 chronology/scope/gate issues and four P2 mutation/wording/false-pass issues. The independent provenance pass then found three P2 issues in the nine-field classification, ordered gates, and counter provenance; the green-snapshot pass found three more P2 issues in the schema key, renewed chronology, and intentionally red test. PR #500's regular merge `0601268a57af32c910b785c3f79da647d3fbb428` was integrated without conflict at `3adfd0651e22ecb801b958eef8c9ca00f054a52e`; its post-main merge-tree review initially passed with P0 / P1 / P2 = 0 / 0 / 0, but the subsequent finalization diff introduced one P2 Prettier drift and was remediated again. One further P2 misattribution of working-tree review content to the integration-base commit was corrected by separating reviewed content from its integration base. The remediated total is three P1 and twelve P2 findings, retained as five CHANGES_REQUESTED entries in the data. The CI delta exists only to provide full-history checkout and a 25-minute timeout for the provenance gate; it is excluded from the implementation-tree security review. The machine-readable record preserves earlier findings rather than rewriting any reviewed content as clean, and records each remediation and review scope separately.

Swift source tests are **58 / 58 PASS** across every-byte mutation of fixed argv, cwd, and environment; runtime-install framing, fixed-policy, and path-metadata drift; five policy-digest substitutions; install swapping; Node-identity drift; manifest drift; and closure-drift rejection at all four public handoff entrypoints. The runtime-install record's nine variable digest fields are constrained only to be nonzero and pairwise distinct during canonical decoding; six of them carry runtime identities. This article claims neither that every runtime-install byte is fixed nor that the identities and policies have been observed in a real environment. The Swift cross-parser subset is 4 / 4 and the independent Node parser is **6 / 6 PASS**. The public symbol graph confirms exactly four composed entrypoints and six non-public partial entrypoints. The full TypeScript no-emit check, targeted ESLint, targeted Prettier, Python symbol-graph-checker compilation, and `git diff --check` also pass.

Every production operation observed by this task in the implementation range after `e142d844fcf5e2b189bb29a1ee9880df74afaf1a` and through `773f7eb88f943385ac89a6ec0e61d9e7a23e5e12` remains zero. Tracked state is supported by the Git diff; command counters are task-observed, not independently machine-verified totals from an immutable external command ledger. They are also not post-implementation publication-activity or program-lifetime totals:

- 0 production inspector or handoff runs;
- 0 production authority-key or activation-head loads;
- 0 root installs or process spawns;
- 0 private clean-room copies;
- 0 teacher generation;
- 0 training, candidate selection, formal A/B, or external-calibration runs; and
- 0 live-weight activations.

This PR changes neither live weights nor live configuration and performs zero new playing-strength measurements. It therefore claims neither improvement nor regression; the strength change is **UNKNOWN / NOT MEASURED**. The separate machine-readable record is [floodgate-v7-runtime-policy-preimages-2026-07-18.json](./data/floodgate-v7-runtime-policy-preimages-2026-07-18.json).

## 8. Next gates

Canonical bytes do not make the runtime safe to execute. At minimum, separate pull requests must close the following in order:

1. fresh loading and anti-rollback for a root-owned, create-only authority public key and activation head;
2. a signed/notarized release artifact and canonical root installation;
3. production manifests, authority-signed enrollment and activation, and role-key lifecycle;
4. no-follow filesystem, ACL, and code-signing measurements of the held runtime and bundle;
5. actual Git-control/repository-source, audit-token, and held-process-identity observations;
6. enforcement of exact argv, cwd, empty environment, and UID at exec;
7. actual-image revalidation after suspended spawn, a new process group, TERM→KILL→reap, and bounded stdout/stderr;
8. a zero-argument read-only production inspector and exactly one fresh evidence run;
9. private clean-room teacher generation, retraining, candidate selection, sealed holdout, formal A/B, and external calibration; and
10. evidence-gated live activation with a reversible canary, monitoring, and rollback.

Production recovery remains **UNAVAILABLE / STOP**, and live weights remain unchanged, until those gates pass normal review, CI, and regular merge.
