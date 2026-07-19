# Floodgate 24,000訓練局面の実認証が完了

> 2026年7月19日、元のtraining role-bundleを既存の固定verifier revision
> `e8a9197608cb48b1160b6707d97b0c4f78f90a1d`で実際に検証した。24,000親局面・
> 1,000対局を認証し、callbackから事後のfilesystem再検査とdescriptor close完了まで
> 1,088.743秒だった。これは入力が教師生成へ渡せることの実証であり、新しい完了済み教師
> dataset・学習・候補weight・A/B・live変更はまだ0である。
> English version:
> [blog-shogi-floodgate-training-input-real-authentication.en.md](./blog-shogi-floodgate-training-input-real-authentication.en.md)

## 実行結果

| 項目                                           |        実測 |
| ---------------------------------------------- | ----------: |
| authenticated training parents                 |      24,000 |
| source games                                   |       1,000 |
| callback到達                                   | 1,088.742秒 |
| callback後の再検査・descriptor closeを含む完了 | 1,088.743秒 |
| exit                                           |           0 |
| 新しい完了済み・公開済みteacher dataset        |           0 |
| optimizer runs / A/B games / live changes      |   0 / 0 / 0 |

Node v22.13.0で、固定raw-lock、role-lock、role-bundle、replay exclusion、24,000行の
training inputを読み取り専用で検証した。private absolute path、file descriptor、device /
inode、局面、識別子digestは公開出力へ含めていない。AWS、Firebase / GCP、Vercel、
runtime networkは使っていない。今回使ったAPIはformal postflight receiptを発行する版ではないが、
成功返却前のfilesystem再検査とdescriptor closeは完了している。

過去の停止したv7試行には3件の認証済みparent recordが残っている。これは完了済みdatasetでは
なく、今回の入力認証による新しいlabel生成も0である。

## なぜ14コアを全部使わなかったか

この18分の大半は24,000行のparseではなく、既存full bundle verifierの順序付き再検証である。
内部では36,349件のraw receipt（36,168件のCSAを含む）を4 pass、合計145,396回
順番に確認する。
実測済みの同系統runは平均
約1.07コア、peak RSS約5.63GB、swap 0、block I/O 0だった。したがって48GiB RAMや
SSD容量を増やしても、この1本は速くならない。複数の同じverifierを並行起動しても同じ仕事を
重複するだけで、1本の完了時刻は短縮しない。

大きく効く変更は、100・500・24,000の各milestoneで認証をやり直さないことだった。
3回なら実測換算で約54.44分だが、同じauthenticated callback内で連続実行すれば18.15分で済み、
約36.29分を削減できる。

## 強さ優先の次工程

問題のstable-WASM depth 11候補は、実runで600秒timeoutを起こした。一方、既存v6教師は
YaneuraOu MultiPV 12、強豪棋譜の実戦手、全unique候補のMultiPV 1 / `searchmoves`
独立depth-16再評価、12-engine並列、durable `work.jsonl` resumeを既に持つ。

次の変更はv7の多数のidentityを作り直さず、このv6教師を認証済みtraining inputへ接続する。
同一callbackで100 → 500 → 24,000のmilestoneを永続化し、最初の100完了時点から途中データを
公開する。teacher完了後も、3 seed学習・selection / final holdout・正式A/Bを通るまで
`runOp1`とlive weightは変更しない。

機械可読記録:
[floodgate-training-input-real-authentication-2026-07-19.json](./data/floodgate-training-input-real-authentication-2026-07-19.json)
