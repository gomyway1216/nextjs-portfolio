# representation bridge v3のSTOPを残し、int16-only候補固定へ切り替える

> 2026年7月20日、real representation bridge v3は固定family gateを通らず、正式に
> `STOP`した。この結果をPASSへ読み替えたり、失敗した閾値を緩めたりはしない。一方、
> alignment前後で本番int16 tensorは完全に同じなので、さらにfloat alignmentを続けても
> 本番int16棋力は変わらない。そこで、未読fresh-finalを最初のprospective strength gateにする
> **別のpost-hoc adaptive candidate lock**を準備した。real int16 evaluatorとrunnerは未実行で、
> 候補lock receiptもまだ発行していない。ただし、開発初期の広い`rg`検索1 invocationが
> 既読selectionへ触れ、一部raw matching linesがinternal tool outputへ混入した事実は隠さず、
> 評価実行とは分けて記録する。exact read bytes / rowsは不明である。English version:
> [blog-shogi-floodgate-strength-first-int16-only-candidate-amendment.en.md](./blog-shogi-floodgate-strength-first-int16-only-candidate-amendment.en.md)

## real bridge v3はPASSではない

最初の正式実行は12.13秒でexit 1となり、stderrは
`representation bridge STOP: representation family gate failed`だった。gate判定前に
evaluation自体は終わったが、fail-closed境界により3ファイルのprivate output rootは作られて
いない。その後の2回は新しい候補判断ではなく、時間と失敗内容を再現するための診断である。

| 実行           |    wall |           最大RSS |        exit | 位置づけ                        |
| -------------- | ------: | ----------------: | ----------: | ------------------------------- |
| 最初の正式実行 | 12.13秒 | 739,557,376 bytes |           1 | real bridge v3の正式STOP        |
| 診断再実行     | 11.94秒 | 777,322,496 bytes |           1 | 時間・失敗再現のみ              |
| 独立診断再現   | 11.69秒 | 771,948,544 bytes |           1 | 独立した失敗・metric再現のみ    |
| 合計           | 35.76秒 |                 — | 3回ともSTOP | spent-selection読取は合計3 pass |

最初の実行はmetricを表示せず、認証済みbridge outputも残していない。以下のexact metricは
診断再現からoperatorが転記した値であり、7個の量子化tensor identityが同じ条件で、既存の
公開spent-selection再現値とも一致する。したがって有用な診断証拠ではあるが、「bridgeが
発行したPASS receipt」ではない。

## 失敗したのはseed 42のrepresentation pair差だけ

既存の固定metric ordering rule、つまりparent-int16のpair、top-1、MAE、seed、
checkpoint SHAの順を適用した観測順位は`43 → 42 → 44`だった。このspecific orderは
事前登録値ではなく、bridge STOP後かつfresh-final開封前にadaptive lockへ固定する値である。
median代表はseed 42となる。全parent-int16はstableよりpairとtop-1の両方が高く、MAEも
小さかった。

| model          |         int16 pair |        int16 top-1 |     int16 MAE (cp) | stableとのpair / top-1比較 |
| -------------- | -----------------: | -----------------: | -----------------: | -------------------------- |
| stable         | 0.5915841584158416 | 0.3034597749062109 |  526.6006381934217 | 基準                       |
| seed 42 parent | 0.6013040328423086 | 0.3153397248853689 |  405.9221193632092 | 両方ともstable超           |
| seed 43 parent | 0.6019882476052484 | 0.3161734055856607 |  402.7880987446525 | 両方ともstable超           |
| seed 44 parent | 0.6000563470981245 | 0.3186744476865361 | 405.71302335367136 | 両方ともstable超           |

bridge v3はこれに加えて、aligned-floatと同じparent-int16のpair差を絶対値0.002以下、
top-1差を絶対値0.005以下にすることを要求した。seed 42の記録されたpair方向差は
`-0.002636239233679505`、絶対値は`0.002636239233679505`で、上限を
`0.000636239233679505`だけ超えた。top-1差の絶対値`0.0033347228011672003`は通過し、
seed 43 / 44は両representation差を通過した。

| seed |         abs(pair差) / 上限0.002 |     abs(top-1差) / 上限0.005 | 4 gate全部 |
| ---: | ------------------------------: | ---------------------------: | ---------- |
|   42 | **0.002636239233679505 / FAIL** | 0.0033347228011672003 / PASS | FAIL       |
|   43 |    0.0017306608709650728 / PASS | 0.0027094622759483156 / PASS | PASS       |
|   44 |    0.0017709087981968574 / PASS | 0.0006252605252188292 / PASS | PASS       |

2 / 3 seedが4 gate全部を通ったため最小seed数条件は満たした。しかしmedian代表seed 42が
4 / 4ではなく、全seedが両representation差を通る条件も満たさなかった。したがってfamily
gateはfalseである。この失敗はそのまま保存し、bridge v3の閾値や判定を変更しない。

## なぜ追加float alignmentを止めるのか

constrained alignment v2は、float parameterを親と同じ量子化セル内だけで動かした。
独立strict reload後、3 seed × 7 tensor = 21比較がすべて親epoch 20と完全一致している。
つまりepoch 24 aligned checkpointをさらに学習してfloat差を縮めても、本番で使うint16
weight、整数評価値、そこから選ばれる手は変わらない。

追加alignmentは旧representation gateを満たす可能性はあっても、int16棋力を上げる処理では
ない。しかも既読selectionに対して繰り返せば、実棋力を変えないまま診断集合へ合わせ続ける
ことになる。高段を目標にする現在は、未読データと実対局で配備表現そのものを評価する方が
直接的である。

## 新しい判断は「旧gateの合格」ではなくadaptive lock

旧4-gateからfloat差を外して同じ実験を合格扱いすれば、事後的なgate緩和になる。今回の
扱いはそうではない。旧bridge v3を失敗した実験として閉じ、既読selectionは開発証拠にだけ
限定し、未読fresh-finalの前に1つのint16候補を固定する別protocolである。

| 固定項目                           | 値                                                                 |
| ---------------------------------- | ------------------------------------------------------------------ |
| decision class                     | `post-hoc-adaptive-candidate-lock-not-selection-pass`              |
| parent-int16順位                   | `43 → 42 → 44`                                                     |
| 固定候補                           | medianのseed 42、epoch 20                                          |
| checkpoint SHA-256                 | `84ab533c7bf36183b83228c5dab5817dd730fcfae5d81be645569f45b5622a6a` |
| epoch 24 aligned checkpoint        | deployment authorityなし                                           |
| seed 43 / 44へのfallback           | 禁止                                                               |
| seed 42がfresh-finalで失敗した場合 | 3-seed family全体を再学習                                          |
| 最初のprospective strength gate    | sealed fresh-final                                                 |

`candidate_locked`と`candidate_strength_selected`は別である。候補を将来の独立評価用に
固定しても、「強い候補が選ばれた」とはまだ主張しない。seed 42がfresh-finalを通らない場合、
同じfresh-finalを見てseed 43または44へ切り替えることも、閾値を変更することも禁止する。
その場合はfamily全体を再学習し、次の未使用データを持つ新しい実験へ進む。

## 現在の読取・実行境界

real int16 evaluator、model evaluation、argumentless runnerはまだ実行しておらず、
fresh-final、legacy holdout、retentionも未読である。しかし、開発初期に
`rg ... ~/.codex/shogi-runs`という広い検索を1 invocation実行し、already-spent selectionへ
触れて一部raw matching linesをinternal tool outputへ混入させた。exact read bytes / rowsは
観測していないため不明である。この検索結果はJSON評価、metric計算、順位変更、候補判断には
使っていないが、private data readを0とは記録しない。これはSTOP evidenceが数える過去3回の
evaluator passとは別の`development-search-1` accidental non-evaluation text scanであり、
machine STOP recordの境界にも含まれない。

後日、reviewとmergeが完了したargumentless runnerを実行するときに限り、already-spent
selectionをexact 1 evaluator passだけ再認証し、stableとepoch 20の3 parentをproduction
int16経路で各1回評価する。float評価とaligned checkpoint loadは0の契約である。

| 項目                                                     |               現在値 |
| -------------------------------------------------------- | -------------------: |
| 過去のbridge / 診断によるspent-selection evaluator read  |               3 pass |
| このPR開発中のaccidental non-evaluation search           |         1 invocation |
| そのsearchのexact read bytes / rows                      |              unknown |
| raw matching linesの混入先                               | internal tool output |
| そのsearchによるmetric計算 / 候補判断                    |                0 / 0 |
| int16 model evaluation / runner / candidate-lock receipt |            0 / 0 / 0 |
| fresh-final / legacy holdout / retention label read      |            0 / 0 / 0 |
| formal A/B / external calibration                        |            0局 / 0局 |
| candidate strength selected                              |                false |
| live weights changed                                     |                false |

将来の1回再認証が成功しても、それはcandidate-lock receiptであってstrength passではない。
fresh-finalでは既存gateを変えず、同じデータとexact int16経路でcandidateのpairがstableを
strictly上回り、top-1がstable以上であることを確認する。その後もlegacy final、general /
opening retention、known regression、production browser parityを省略せず、固定formal A/B
v2の384 color-swapped pairs / 768 gamesへ進む。
正式A/Bでstable超を確認しても、高段の主張には別の外部校正が必要であり、それまではlive
weightを変更しない。

機械可読記録:

- [representation bridge v3 STOP](./data/floodgate-strength-first-representation-bridge-v3-stop-2026-07-20.json)
- [int16-only candidate amendment readiness](./data/floodgate-strength-first-int16-only-candidate-amendment-readiness-2026-07-20.json)
