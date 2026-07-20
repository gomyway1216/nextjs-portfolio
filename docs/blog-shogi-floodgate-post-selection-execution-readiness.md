# 将棋AI強化：選抜後の実行経路を、実データ対応まで進めた

更新日: 2026-07-20

## 結論

この変更だけでは、AIの棋力はまだ上がっていない。本番重みも変更していない。

今回終えたのは、3 seed再学習から候補が選ばれた直後に、その候補を実データで検査するための実行経路である。これまで契約だけだった部分へ、次の処理を接続した。

1. 登録済みselection receiptを認証し、各runのgate、preflight hash、順位/代表seed、family gateを再計算し、teacher identity/completionを固定registryへ照合してから一度限りの権限を発行する
2. checkpointから本番int16重みを再生成し、1 byte単位で一致を確認する
3. fresh / legacy final holdoutとgeneral / opening retentionを実モデルで評価する
4. 既知の`P*8f`回帰を、正確な合法手集合と本番系WASMで測る
5. 実ブラウザ検証で使うWorker診断情報を、通常対局へ影響しないopt-in経路で取得する

正式なブラウザ/Worker parity、formal A/B、外部棋力校正はまだ未実施である。そのためformal A/B readinessは明示的に`false`のままにした。

## 何が実装されたか

| 経路 | 今回の結果 | 棋力との関係 |
| --- | --- | --- |
| candidate authorization | 全3 runのgate、preflight hash、順位/代表seed、family gateを再計算し、teacher identity/completionを照合してから一度限りの権限を作る | 間違ったcheckpointを評価する事故を防ぐ |
| checkpoint → int16 | candidate epoch 20とstable epoch 27から本番形式を再生成し、各1,185,988 bytesの完全一致を要求 | 学習時の候補と実戦で読む重みを同一にする |
| final holdout | 既存のstrict sibling loaderと本番int16 forwardを再利用 | 未見局面のpair/top1を同じ実装で比較する |
| retention | 旧形式のgeneral/opening JSONLをfail-closedで読む | 全体精度や決定的局面を壊していないか確認する |
| known regression | exact fixtureの全childを親局面から導出し、WASM NNUEでstatic順位と探索手を測る | 実際に起きた`P*8f`回帰の再発を止める |
| Worker diagnostics | 読み込んだ重み、embedded WASM、最後の探索/eval経路を明示要求時だけ返す | 実ブラウザがNNUE/WASMを本当に通ったか後で証明する |

## 実装中に見つかった重要な点

### 1. retentionはsibling形式ではなかった

general/opening retentionの実ファイルは、古いteacher generatorが作った次の形式だった。

```text
{sfen, cp, ply, bestmove, depth}
```

mateスコアの行だけ`mate`が加わる。これをsibling datasetのstrict loaderへ渡すと、正しい実データでも全行を拒否する。今回、旧generator形式専用のloaderへ分離した。

新しいloaderは、重複JSON key、空行、CRLF、非UTF-8、余分/欠落field、bool/floatで偽装した整数、SFENとplyの不一致、不正USI、mateとcpの不一致、重複局面を一件でも見つけると停止する。壊れた行を黙って飛ばして良い結果だけを残す動作はしない。

### 2. 既知局面の「46手」と「48手」は両方正しかった

既報のproduction search列挙は46手だった。一方、rules-complete列挙は48手だった。

差分は、探索最適化が省いていた合法な非成り2手である。

- `2b7g`
- `8e8g`

今回のfixtureは安全側へ寄せ、rules-completeな48手をUSI byte順で固定した。各child SFENは保存値を信用せず、親SFENとmoveから同じTypeScript境界内で再導出する。一手の欠落、追加、重複、順序変更、別childへの差し替えをすべて拒否する。

### 3. ローカルWASMと実ブラウザは別の証拠である

Node上でembedded WASMと同じ35,597 bytesを実行できても、それだけでは本番WebページのWorker経路を通った証明にならない。

そのためローカルrunnerの結果は`complete-local-wasm-module-probes`に限定した。結果にはbrowser/Worker parity passを含めず、formal A/B readinessも開かない。実ブラウザ側は、次工程でPlaywrightからopt-in diagnosticsを取得し、次を別に確認する。

- fetchされた重みのbytesとSHA-256
- NNUEがloadedかつenabledか
- embedded WASMのbytesとSHA-256
- 最後の探索が`wasm`、評価が`nnue-wasm`だったか

### 4. 自作した登録表から権限を作れる入口を閉じた

途中レビューで、呼び出し側がregistryとreceiptを同時に自作し、内部hashを合わせればbranded authorizationを作れる入口が見つかった。

production入口は引数を受け取らない形へ変更した。trackedの固定registryを読み、そのregistry自体がコードへbytes/SHA/schemaでpinされている場合だけ、そこへ登録済みのreceiptを読む。現在のchecked-in registryは全て`null`で、pinも未設定なので、production権限は必ず発行されない。

テスト用のdependency injectionはprivate関数へ分離した。テスト用registryからproduction権限を作ることはできない。

## 検証結果

今回のfocused検証は次のとおり。

| 対象 | 結果 |
| --- | --- |
| downstream registry / authorization / receipt gates | 48 / 48 pass |
| checkpoint export adapter | 4 / 4 pass |
| Torch metric / legacy retention adapter | 3 / 3 pass |
| exact fixture / local WASM probe | 11 / 11 pass |
| Worker client / NNUE / ponder / diagnostics | 24 / 24 pass |
| Python compile、ruff、diff check、TypeScript typecheck | pass |

重いreal-WASM固定深さsuiteと全体suiteは、進行中のteacher生成とCPUを奪い合わないようローカルでは追加実行せず、PRのremote CIへ回す。

## まだ達成していないこと

- 新しいcandidateの選抜
- final holdout labelの読取り
- candidate/stableの実測比較
- `P*8f` probeのcandidate実測
- 実ブラウザ/Worker parity
- formal paired A/B
- 外部レーティング校正
- 高段、安定高段、棋力向上の証明
- 本番重みの更新

AWS、GCP、Vercel、Firebase、その他cloudはこの処理に使っていない。今回の境界はlocal-only、network false、live-weight-write falseである。

## 次の実行順

1. 進行中のformal teacher生成を完了する
2. warm seed 42 / 43 / 44を再学習する
3. preregister済み規則だけで代表candidateを選ぶ
4. receiptと全入力identityをregistryへ登録し、registry identityをコードへpinする
5. 今回実装したexport、final、retention、local WASM probeを実データで実行する
6. trusted evidence publisherと実Playwright browser/Worker parityを追加する
7. 全て通った候補だけをformal paired A/Bへ進める
8. 外部校正まで通過後、別PRで本番重みを更新する

この順序は「安全作業を続ける」ためではない。次の再学習が終わった瞬間に、候補を実データで早く落とすか、正式対局へ進めるための最短経路である。
