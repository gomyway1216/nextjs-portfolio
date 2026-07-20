# 将棋AI強化：実ブラウザの Worker / WASM / NNUE 経路を測る準備

更新日: 2026-07-20

基準revision: `0c0d9715`

## 結論

今回追加したのは、選抜後の候補重みが実際のブラウザで正しいエンジン経路を通るか測るためのハーネスである。AIの棋力そのものはまだ上がっておらず、本番重みも変更していない。

これまでのローカルWASM probeは、同じWASM moduleをNode上で実行できることを確認していた。しかし、それだけではWebページが専用Workerを起動し、指定した重みをfetchし、NNUEを有効化したうえでWASM探索を返したことにはならない。この差を埋めるのが今回の変更である。

## 何を測るか

診断は通常の将棋画面から完全に分離した、リンクのない専用routeでだけ動く。さらに決められたqueryが1個だけ存在するとき以外は404になる。

固定局面には角落ちの初期局面を使い、上手の後手を手番にした。現在の組込み定跡と配布中の外部定跡ファイルの両方に該当手がないことをfocused testで固定している。そのため、返答が`book`へ逃げず、実探索へ進む。

ブラウザ内のaggregate結果には、次だけを含める。

| 確認項目 | 合格条件 |
| --- | --- |
| ページ境界 | COOP `same-origin`、COEP `require-corp` |
| 並列実行環境 | cross-origin isolated、SharedArrayBufferあり |
| Worker | 実Workerから応答が返る |
| 指し手 | 固定局面の合法手である |
| 探索経路 | `wasm` |
| 評価経路 | `nnue-wasm` |
| 候補重み | fetchされたbytesとSHA-256が入力候補と一致 |
| NNUE | loadedかつenabled |
| runtime WASM | readyで、bytesとSHA-256が本番WASMと一致 |

生の盤面、持駒、SFEN、返した指し手は証拠へ出さない。

## 本番ファイルを上書きしない仕組み

runnerは候補ファイルをrepository内のread-only入力として認証する。相対path、schema、1,185,988 bytes、SHA-256を必須にし、repository外への脱出、symlink、複数hard link、実行中の差し替えを拒否する。本番WASMも固定path、35,597 bytes、固定SHA-256へ一致しなければ停止する。

候補はブラウザが固定URL `/shogi-nnue-weights.bin` を要求した瞬間だけ、メモリから返す。intercept対象はこのURL一つだけで、checked-inの `public/shogi-nnue-weights.bin` は書き換えない。測定後には候補とWASMをもう一度認証する。

これにより、将来選ばれた候補を本番へ配置する前に、実ブラウザ経路だけを同じURL契約で試せる。

standalone runnerの前提として、`127.0.0.1:3000`で対象sourceからbuildしたserverを先に起動しておく必要がある。runner自身は、そこに待機しているserverがどのcommitからbuildされたかまでは認証しない。そのためstandalone結果は常に`served_app_build_identity_verified: false`、`standalone_result_is_formal_parity_evidence: false`を含み、単独では正式なparity証拠にならない。GitHub CI上ではcheckoutされたcommitと同じjobのbuild/E2Eを結び付けるが、実candidateの正式証拠には別途trusted evidence publisherが必要である。

network境界は固定host/portのHTTPに加え、同じhost/portの開発用WebSocketだけをlocalとして扱う。`localhost`という別名、別port、HTTPS、外部originは許可しない。

## 通常の将棋ページへの影響

最初の実装案では `/games/shogi` 自体がqueryを読む形だった。この形は通常routeをdynamic化し、既存の静的配信・cache特性を変える可能性があったため採用しなかった。

最終形では通常ページを元の実装へ戻し、`searchParams`も診断componentもimportしない。診断は `/games/shogi/engine-parity` の別routeに隔離し、同じCOOP/COEP条件だけを明示的に付けた。通常UIにリンクや診断表示はない。

## 今回の検証

ローカルでは、進行中の13-engine教師生成とCPU・メモリを奪い合わない軽い検証だけを実行した。

| 対象 | 結果 |
| --- | --- |
| exact query、通常route非依存、定跡外固定局面 | 3 / 3 pass |
| 入力認証、loopback境界、ブラウザ観測の負の契約 | 22 / 22 pass |
| machine evidenceと日英記事のbinding | 2 / 2 pass |
| TypeScript no-emit | pass |
| 変更対象lint、差分検査 | pass |
| ローカルproduction build | 未実行 |
| ローカルPlaywright | 未実行 |
| private candidate読取り | 0 |
| 実candidate browser測定 | 0 |

Playwright E2Eはremote CIで、現在配布中の重みを「E2E fixture」として使い、実Worker/WASM/NNUE経路とheader、intercept回数を確認する。この重みは新しく選抜された候補ではない。したがってCIが通っても「新候補のparity完了」や「棋力向上」を意味しない。

## まだ終わっていないこと

- 進行中教師生成の完了
- fresh final holdout
- 3 seed再学習と正式な候補選抜
- 選抜済み実candidateでの今回のbrowser parity実行
- formal paired A/B
- 外部棋力校正
- 高段・安定高段の証明
- 本番重みの変更

今回のハーネスは、再学習を置き換える作業ではない。候補ができた直後に「Nodeでは動いたが実サイトでは別経路だった」という失敗を短時間で検出し、弱い候補や誤配線をformal A/Bへ持ち込まないための実行境界である。
