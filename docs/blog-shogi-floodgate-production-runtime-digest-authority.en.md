# Binding production runtime receipt digests to exact factory facades

> The [production stable WASM runtime](./blog-shogi-floodgate-production-stable-wasm-runtime.en.md) and [production teacher USI runtime](./blog-shogi-floodgate-production-teacher-usi-runtime.en.md) can issue facades with fixed assets, options, and lifecycle behavior. Anyone can still canonicalize a copied receipt and calculate the same SHA-256. This change adds separate production / test `WeakMap` registries inside each stable / teacher module, making the existing-domain digest available only from the exact facade issued by the matching factory. This is code evidence for origin authority, not evidence for a production coordinator, adapter, checkpoint, key, real labels, training, a weight, live deployment, or playing strength. Japanese version: [blog-shogi-floodgate-production-runtime-digest-authority.md](./blog-shogi-floodgate-production-runtime-digest-authority.md)

---

## Current boundary

| Item                           | State                           | What this establishes                                                                                 |
| ------------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Plain receipt digest           | Identity only                   | SHA-256 identifies equal bytes but does not prove factory origin                                      |
| Stable exact-facade authority  | Code and focused tests complete | Returns the existing digest only for a facade issued by the matching factory / registry               |
| Teacher exact-facade authority | Code and focused tests complete | Returns the existing digest only for a facade issued by the matching factory / registry               |
| Schema / digest domain         | Unchanged                       | Preserves existing downstream-result and candidate-union identities                                   |
| Production positive evidence   | Factory path only               | Unit tests use a positive test registry and production cross-rejection                                |
| Coordinator / key / strength   | Not implemented; no evidence    | Durable origin binding, labels, training, a weight, live deployment, and strength remain later stages |

## 1. A plain receipt hash is not origin authority

A receipt digest is an identity calculated by prefixing canonical receipt bytes with a domain separator and applying SHA-256. Equal bytes produce the same digest whether the receipt came from the factory or a caller copied it later. The value alone therefore cannot establish that this process owned a runtime from the fixed production factory.

The missing boundary is not another receipt-shape check. It is an identity binding to the capability object returned by the factory. Stable facade construction calculates its digest once, shares it with the result closure and private pending authority, and promotes it only after the entire factory succeeds. The teacher computes and directly registers its digest at the public-facade successful-return boundary after engine / snapshot initialization. Either getter succeeds only when the caller holds a facade successfully returned by the matching factory in that process and module instance.

Once the getter's 64-hex string is copied into another context, however, the string alone is again not origin proof. An owning production adapter must create the runtime, call the getter under the same ownership, and immediately pass the value into the checkpoint run binding.

## 2. Separate production and test registries

The stable and teacher modules each retain two unexported registries.

```text
production factory -> exact frozen facade -> production WeakMap -> digest
test core factory  -> exact frozen facade -> test-only WeakMap  -> digest
```

The production getter reads only the production registry, and the test getter reads only the test registry. A fixture does not enter the production registry even if it creates an identical receipt shape or digest. Likewise, a plain receipt, facade clone, or object containing copied methods is not the same WeakMap key.

Constructing a facade alone does not register it. Registration waits for the entire factory to succeed. For the stable runtime, that means the asset provider returned the exact callback result and callback-finally asset-copy zeroization succeeded; a provider that retains an intermediate facade from a rejected factory gives it no authority. The teacher runtime registers at the successful return boundary after engine / snapshot initialization and public-facade construction. Both use the null-prototype frozen facade as the key, never the receipt object.

Lookup / registration captures not only native `WeakMap.prototype.get` / `set` but also the `Reflect.apply` used to invoke them at module load. Review found that replacing a live `Reflect.apply` could otherwise return a forged 64-hex value for an unregistered object. After the fix, replacing live `Reflect.apply` leaves the registered facade on its original digest and still rejects an unregistered object.

## 3. Getter contract and fail-closed matrix

The public production getter and test-only getter for both stable and teacher have function arity 1 and accept exactly one runtime-facade argument. A missing or extra argument is rejected.

| Input                        | Production getter | Test getter | Property / Proxy traps |
| ---------------------------- | ----------------- | ----------- | ---------------------- |
| Matching production facade   | Digest            | Reject      | 0                      |
| Matching test facade         | Reject            | Digest      | 0                      |
| Structurally identical clone | Reject            | Reject      | 0                      |
| Plain receipt / plain object | Reject            | Reject      | 0                      |
| Proxy around a valid facade  | Reject            | Reject      | 0                      |
| Missing / extra argument     | Reject            | Reject      | 0                      |

A native Proxy check from `node:util` rejects a Proxy before WeakMap lookup. Even an adversarial Proxy whose `get` and `ownKeys` traps throw records zero trap calls. Clones and plain objects are not walked to decide whether they look similar; absence of registered object identity is sufficient to reject them. Replacing live `Reflect.apply` with a forged-digest function also changes nothing because the authority uses its captured call path.

## 4. Digest retrieval starts no proposal or search

The stable runtime calculates its digest once from the receipt during facade construction, retains the same value in the result closure and private pending authority, and promotes it only after overall factory success. The teacher calculates and directly registers its digest once at the public-facade successful-return boundary after engine / snapshot initialization. Either getter only returns a registered value; it does not call stable `propose()`, teacher `propose()` / `rescore()`, engine `go depth`, or pool cleanup.

Focused tests hold the stable proposal count at zero before and after digest retrieval and find zero teacher search transcript entries before and after retrieval. Identity lookup therefore creates no implicit search, timeout, state transition, or label candidate.

The production-positive path is the code path that registers a production-execution-boundary facade created by the zero-argument production factory. Focused unit tests do not start real pinned production assets or a 12-process pool. They positively check a facade from the test core factory through the test registry, then reject the same facade through the production getter. The unit result is not evidence that a production factory ran.

## 5. Preserve the stable domain and later result

The stable runtime retains its existing digest domain.

```text
SHA-256(
  "shogi-floodgate-production-stable-runtime-receipt-v1\0" ||
  canonical_json(runtime_receipt)
)
```

The value calculated during facade construction goes to both the registry and later `runtime_binding.runtime_receipt_sha256`. The test obtains it from the getter before proposing, makes exactly one later proposal, and requires the result digest to match exactly. The receipt schema, runtime-result schema, and domain separator are unchanged, so existing result consumers need no migration.

## 6. Preserve the teacher domain and candidate-union compatibility

The teacher runtime also retains its existing domain.

```text
SHA-256(
  "shogi-floodgate-v7-runtime-receipt-v1\0" ||
  canonical_json(teacher_runtime_receipt)
)
```

This is the same existing domain used when the [v7 candidate union](./blog-shogi-floodgate-v7-candidate-union.en.md) canonicalizes a production teacher receipt. The runtime contract, receipt fields, candidate-union schema, and checkpoint v2 run-binding shape remain unchanged. The authority does not invent new digest arithmetic; it narrows who can obtain that same digest through exact facade identity.

The focused unit test requires the test-factory facade digest to equal an independently calculated value from the same domain and canonical receipt. A production-receipt candidate-union positive is outside this change's unit evidence because the production factory and owning adapter have not been run here.

## 7. Validation record

These are current values from the same working-tree content. Final PR values may be updated after additional review or full validation.

| Target                                 | Current result                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Focused stable + teacher runtime tests | 55 / 55 pass                                                                                                  |
| TypeScript                             | `tsc --noEmit` pass                                                                                           |
| Scoped lint                            | Pass                                                                                                          |
| Exact-facade positive                  | Pass through the matching test registry                                                                       |
| Adversarial rejection                  | Reject clone / Proxy / plain / cross-registry / wrong arity / live `Reflect.apply` replacement; Proxy traps 0 |
| No-work getter                         | Stable proposals 0 / teacher searches 0                                                                       |

The 55 tests include the existing focused tests for both runtime files, not only digest-authority cases. Production-positive authority exists in the factory-registration code path; it is not counted as a real production-runtime launch by the unit tests.

## 8. Claim boundary and next work

This change adds ephemeral authority inside the current module instance, binding a factory-issued facade to its digest. It is neither key authority for a digest stored in a durable file nor a production coordinator that owns both stable and teacher runtimes. It does not automatically connect to the existing test-only checkpoint or generate a real teacher label.

Next comes an all-settled adapter that owns the stable and teacher production factories under one lifecycle. If either initialization or parent operation fails, it must collect all started work and cleanup from both runtimes, obtain two digests through their matching production getters, and pass them into the checkpoint run binding in that same invocation. After that adapter's lifecycle / cleanup boundary is implemented and validated, deployment key authority is the next implementation stage.

No label generation, training row, optimizer, weight, A/B, Elo, rating, rank, or live environment changed. The claim that the evaluation function became stronger or reached stable high-dan strength remains zero.
