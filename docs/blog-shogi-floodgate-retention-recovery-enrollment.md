# 旧retentionデータを「operator-recovered」として再登録

> 2026年7月20日、失われていた旧general / opening retention用ファイルをローカルの
> durable領域へ回収し、path・bytes・raw改行数・SHA-256を固定registryへ登録した。
> **これは元manifestを復元した証明でも、棋力評価を通した結果でもない。** データが無いという
> blockerだけを解消し、下流ゲートへの接続は別PRまで閉じたままにしている。
> English version:
> [blog-shogi-floodgate-retention-recovery-enrollment.en.md](./blog-shogi-floodgate-retention-recovery-enrollment.en.md)

## 何が戻ったか

| intended role     | durable path                                                                                | bytes   | raw rows | SHA-256                                                            |
| ----------------- | ------------------------------------------------------------------------------------------- | ------- | -------- | ------------------------------------------------------------------ |
| general retention | `$HOME/.codex/shogi-data/floodgate-q1-2026-retention-recovered-v1/holdout5m-4k.jsonl`       | 542,594 | 4,000    | `3d25f6bf113710c8ea326c132d2fc2cc9f76f572dddbd09c1d397b78cb07d00e` |
| opening retention | `$HOME/.codex/shogi-data/floodgate-q1-2026-retention-recovered-v1/opening-holdout-4k.jsonl` | 538,870 | 4,000    | `1f8d91f286eec160eb1141ba5adfd36b842af12ceec37aa4f959038a60969ce6` |

durable directoryはowner-only、2ファイルも`0600`である。builderは固定pathをsymlinkを
追わずに開き、読み取り前後のfile identityが同じことを確認して、bytes・SHA-256・raw改行数だけを
再計算する。JSONをdecodeせず、label fieldへ触れず、内容をstdoutへ出さない。`4,000 rows`は
意味検証済みの4,000局面という主張ではなく、末尾改行を持つファイルの改行数が4,000だったという
物理的な記録である。

review用candidateは次のargumentless commandでstdoutにだけ出る。現在のdurable filesからの
出力はchecked-in registryとbyte-for-byte一致する。

```sh
python3 ml/build_retention_recovery_enrollment_registry_candidate.py
```

## 回収元について分かっていること

公開registryでは元のprivate absolute pathとinode値を伏せ、source A / Bというredacted labelで
operator観測だけを残した。

- general fileは別々のfile identityを持つ2コピーで、bytes・raw rows・SHA-256が完全一致した。
  これは単一の壊れたコピーを偶然採用した可能性を下げる独立duplicate evidenceである。
- opening fileは1コピーだけを観測した。観測時のbranch名とworking-tree HEADは記録したが、
  独立duplicateは無い。
- これらsource観測はregistry builderの認証対象ではない。builderが毎回再認証するのは回収後の
  durable 2ファイルだけである。

generalの2コピー一致は有用だが、元の作成時点のmanifestやrole receiptの代わりにはならない。
openingは特に単一コピーなので、出所についてgeneralより弱い証拠しかない。

## 何を主張しないか

元manifest、元receipt、事前登録hash、artifactのGit objectは見つかっていない。そのためregistryは
明示的に`operator-recovered`であり、次をすべてfalseに固定する。

| 非主張                             | 状態  |
| ---------------------------------- | ----- |
| 元manifest / historical roleの認証 | false |
| row semanticsの検証                | false |
| fresh未使用データであることの認証  | false |
| downstream retention gateへの接続  | false |
| 棋力向上 / 高段校正                | false |
| formal A/B / 外部校正              | 0局   |
| live weight変更                    | false |

したがって、このPR単体でAIは強くならない。実利は、後続のretention評価を始めるための2ファイルが
durable identity付きで再び利用可能になり、「ファイル自体が無い」というblockerが消えたことである。
次の別工程では候補とstableを同じ実装で評価し、row semanticsとrole suitabilityをfail-closeに
確認した上で、初めてdownstream gateへexact identityを接続する。今回のregistryだけをgate receiptや
live authorityとして使うことは禁止したままである。

## 検証

focused stdlib testは、checked-in registryのcanonical bytes、実durable filesからのbuilder
byte match、決定的な再生成、内容改変、欠損、symlink、authority拡張、CLI引数差し替えの拒否を
確認する。テストfixtureもopaque bytesと改行だけを扱い、将棋labelをparse / displayしない。

機械可読記録:
[floodgate-retention-recovery-enrollment-2026-07-20.json](./data/floodgate-retention-recovery-enrollment-2026-07-20.json)
