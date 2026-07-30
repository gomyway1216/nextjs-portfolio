# 将棋AIを次に強くする実験：片側だけの自己対局を捨て、高レート棋譜の難局面をdepth18で学び直す

> HalfKP81 v4はfresh 56局で29勝24敗3分、61/112だった。点推定では上向いたが、事前合格線62/112に1点届かず、不採用にした。次は同じ候補の救済ではない。既存の広い教師データを保ちつつ、高レート棋譜80万局面から難しい8,192局面を選び、その兄弟手をやねうら王depth18で新しく採点する独立実験にする。[English](./blog-shogi-halfkp81-hard-depth18-strength-plan.en.md)

## まず、何が失敗したのか

これまでの学習は完全に無意味だったわけではない。凍結候補は量子化・WASM一致・実行速度の検査を通り、fresh対局でも29勝24敗3分だった。しかし、22,890 validation局面でのpair accuracy改善は`+0.000445`、つまり`+0.0445 percentage point`にすぎない。これは棋力向上の証明ではない。56局でも合格線に届かなかったので、同じ候補を追加epoch、別seed、閾値変更で救済しない。

時間を使いすぎた原因も明確にする。所有権、改ざん検知、鍵、PR境界は再現可能な正式実験には必要だったが、棋力を直接上げる作業ではない。その境界作りを必要以上に広げ、学習指標の小幅改善を実戦の強さに近いものとして扱った。今回は、すでにある安全基盤を再利用し、計算時間の大半を新しい強い教師ラベルへ振る。

## 使う直前に、自己対局poolの前提ミスを見つけた

当初は自己対局cycle0の186,634局面から選ぶ計画だった。独立監査でSFEN手番を全数集計すると、`b=186,634 / w=0`だった。4手間隔samplingが偶数plyだけを残したparity defectである。このままなら新しいfit、tune、sealedも全て同じ手番になり、既知の偏りをもう一度学習する。正式教師計算を始める前にこの入力を破棄した。

代わりに使うのは、Floodgate Q1 2026の高レート棋譜から作った認証済み800,000局面である。14,861対局、手番は`b=402,090 / w=397,910`。全rowはやねうら王depth12と最終勝敗を持つ。旧depth12 CPは難しさの選抜にだけ使い、教師値としては使わない。

read-only走査では、合法手数付与と重複除外より前の供給として、対象plyかつ`|CP|≤1000`の局面はopening 175,903、middle 298,191、late 197,394だった。異なる対局数も11,392、13,622、11,692あり、「1対局から1局面」の8,192親に十分な余裕がある。正式quotaの成立は、合法手数付与と重複除外を完了した選抜manifestで初めて確定する。

| phase   |    ply | eligible distinct games |          固定選抜数 |
| ------- | -----: | ----------------------: | ------------------: |
| opening |  12–39 |                  11,392 | 2,048（b/w各1,024） |
| middle  |  40–79 |                  13,622 | 3,072（b/w各1,536） |
| late    | 80–119 |                  11,692 | 3,072（b/w各1,536） |
| 合計    |        |                         | 8,192（b/w各4,096） |

選抜は、depth12 CPと最終勝敗の食い違い、両対局者の低い方のrating、最後にSHA-256の順で決定する。1対局から1局面とし、`game_id`を分けてからfit 6,144、tune 1,024、sealed 1,024へ割り当てる。各roleもb/wを完全に50/50にする。既存の直接教師train/validationと、seedから再構成できるv2/v4の選択済み正式opening 56件（初期局面＋各6手のprefix）のsemantic positionを除外する。中央筋の歩を多く突いたopeningでv4候補が3勝9敗だった所見は探索的仮説に留め、唯一の選抜条件にはしない。

元データには合法手数がない。そのまま正式選抜すると「強制手を除外した」と証明できないため、正式CLIは合法手数の欠落を拒否する。SFENから本番ルールの合法手生成器で合法手数を決定的に付与し、実行toolと手生成rules closure 11ファイルのbytes/SHAをheld descriptorで二重読取してmanifestへ固定する。selectorもその固定closureと実ファイルを再認証するため、自己申告だけの古い・偽造manifestは通らない。さらに、直接教師の親子全局面と再構成可能な選択済み正式56序盤を束ねたsemantic-overlap inventoryを結合する。両方が揃うまで、選抜結果を正式成果物として扱わない。

過去inventoryにはv2 3,198件、v4 3,302件のfingerprintしか残っておらず、seedやSFENがないためsemantic positionへ逆変換できない。この範囲まで「完全除外した」とは主張しない。正式選抜manifestにこの限界を固定し、復元可能な元資料が見つかった場合だけ別の事前登録版で範囲を広げる。

ply 120以降の旧poolは別のsampling都合でbしか残っていなかったため、新しいhard setには使わない。endgameを捨てるという意味ではない。既存200,944件の学習用direct replayには終盤が残り、別の22,890件は学習に混ぜないpreservation validationとして終盤を含む診断に使う。新hard setの目的は「両手番が揃う難しい序中盤の兄弟順位」へ限定する。

## 新しく学ぶもの

各親局面で、やねうら王を次の固定条件で動かす。

| 項目               |                                      固定値 |
| ------------------ | ------------------------------------------: |
| proposal           |                         MultiPV 12、depth16 |
| 追加する手         | 棋譜の手、20秒内にdepth11まで完了した安定手 |
| 全兄弟手の最終採点 |                                     depth18 |
| process            |                                          13 |
| thread / process   |                                           1 |
| hash / process     |                                     512 MiB |
| timeout / parent   |               やねうら王600秒、安定手は20秒 |

安定手は候補を一つ増やす補助経路に限定する。20秒のcooperative deadlineまでにdepth11へ届かなければ途中の手・scoreは捨て、認証済みの「省略」として記録する。これは親全体の失敗ではなく、やねうら王のMultiPV 12と棋譜の手は必ずdepth18で再評価する。元の学習用200,944 direct labelは捨てず、広い局面を忘れないためのreplayにする。22,890 validation labelは学習に混ぜず、保存性能の検査専用に保つ。学習batchは親単位で旧direct 50%、新hard 50%。目的関数はdirect sigmoid BCE 50%と、同じ親の兄弟手順位を学ぶListNet 50%に固定する。

initializerは失敗したv3/v4候補ではなく、元のalpha-050 checkpointへ戻す。HalfKP81、1 seed、3 epochs、最終epochだけを候補にする。うまく見えるcheckpointを後から選ばない。

## どこまで改善すれば次へ進むか

強くなる保証はない。あるのは、以前と違う原因を狙い、失敗を安く切る設計である。

最初に教師100親、次に500親でdepth18、親ごと最低2手、出力完全性、fault 0を認証する。学習後はtuneと未使用sealedの両方でinitializer比top-1 `+2.0 percentage points`以上、兄弟pair `+1.0 point`以上を必須にする。旧22,890 validationでもteacher MAE `5 CP`以上改善、pair差非悪化を求める。

teacher planを作る前にもselection manifestと8,192行JSONLをheld descriptorで二重読取し、canonical bytes/SHA/row数、semantic ID、hardness、順序、phase/sideとrole/side quota、1対局1局面、role間game重複0、source/legal/overlap bindingを再計算する。短いphase名と事前登録名の対応も固定した。planは任意の40桁文字列ではなく、呼出側が認証したmerged source revisionとこのselection evidenceの両方へ結合する。現在のreceipt validatorは計画・件数・pathの構造だけを検査し、学習開始権限を持たない。教師JSONLをheld descriptorで読み、実bytes/SHA/row数、8,192親のrole所属、全targetのdepth18、旧depth12 target混入0を再計算するartifact verifierが通った後にだけ、学習計画を作れるようにする。

その後にint16 clipping 0、WASM mismatch 0、p99.9量子化比`≤1.05`、絶対差`≤300 CP`、実行速度低下`≤5%`を通す。全部通った場合だけfresh 56局へ進み、以前と同じ62/112以上、technical fault 0を要求する。どれか一つでも失敗したら終了する。追加epoch、追加seed、QAT、蒸留、閾値変更、同じ候補の続行はしない。

## 時間と現在地

過去の実測では24,000親のdepth16教師が約11.47時間だった。8,192親なら単純換算約3.91時間だが、今回はdepth18なので保守的に8〜16時間を見込む。80万局面の合法手付与・選抜、学習、static gateは1時間未満、56局screenは15〜25分が目安で、合計9〜18時間である。これはM4 Pro上の範囲予測で、保証時刻ではない。

2026年7月30日、事前登録・選抜器・認証器を含むPR #665は通常mergeされた（merge `0ec6807c7d6c13f3e7caf4f08d45e87ce1ba005b`）。そのmerged revisionでsemantic-overlap 243,368行、合法手数付きpool 800,000行、hard parent 8,192行を正式生成・再認証した。選抜はfit 6,144、tune 1,024、sealed 1,024で、8,192件の`game_id`と`position_id`は全て一意、role間game重複は0、各roleの手番は50/50だった。

再開可能runnerとartifact verifierを含むPR #666も通常mergeされた（merge `eaa03e570e1ed687c3479a38eba377807be4cd9e`）。stable assetsを復元・再認証し、clean mainから6,306 bytes、SHA-256 `c0b4a4ab2bc0a4b4a685b06e65afb0d3194551c72ae4382a9021754188a725b0`のimmutable teacher planを発行してv1を実行した。しかし、やねうら王へ渡した`EvalDir`が実際の`nn.bin`を含む`.../eval/eval`ではなく、その1階層上の`.../eval`だった。workerは最初の親を処理する前のUSI初期化で終了したため、結果は完了`0 / 8,192`親、depth18教師`0`行、technical fault 1である。これは棋力やデータの失敗ではなく、engine pathの技術的失敗である。

v1のterminal faultは消さずに保存し、v1 output directoryを閉じた。同じfamilyをその場で再開する権限はなく、既存の`teacher-work.jsonl`やteacher planを上書きもしない。次のv2は`halfkp81-hard-depth18-engine-evaldir-v2`という別のtechnical-recovery familyにした。認証済み8,192選抜は同じbytes/SHAのまま再利用する一方、v2修正を含む新しいmerged source revisionと、v1とは別のcreate-only output directoryへ結合した。

PR #667は全15 check成功後に通常mergeされ（merge `551759a171ac7fed5cf4a5b7cc2279dc60eea6bd`）、v2は正しいEvalDirで開始した。しかし49 / 8,192親、585行まで進んだ所で、stable-WASM depth11探索が600秒の外側watchdogへ到達してterminal faultになった。共有poolは1 workerの失敗を全active requestへ配ったため、faultに書かれた親だけが原因とは断定できなかった。v2は再開せず、最初の62件で未完だった13親をtrainingに使わないscratch診断へ分離した。

隔離したexact production条件では9件が4.918〜547.152秒でdepth11へ到達し、4件はそれぞれ別workerで600.000〜600.003秒のtimeoutを再現した。全childとpoolは正常に終了し、formal work/faultも不変だった。したがって原因は単一の誤帰属やpool deadlockではなく、複数局面の本物のdepth11長尾と、それを全pool停止へ拡大する実装だった。timeoutをさらに延ばすだけでは完走上限を作れない。

独立v3 `halfkp81-hard-depth18-bounded-stable-v3`は、同じ8,192選抜をbytes/SHA固定で再利用するが、v2の49親・585行は一切流用せず0から計算する。stable-WASMは20秒以内にdepth11へ完了した場合だけ候補手を一つ足し、未完partialは捨てる。通常deadlineはpool全体をpoisonせず、そのworkerだけを回収・交換する。正式起動も`KeepAlive=false`、`LaunchOnlyOnce=true`のone-shot LaunchAgentに変えた。これらは結果を見て合格線を変える操作ではなく、弱い補助候補が強い教師生成全体を無期限停止させないための新しい事前登録familyである。診断の全実数は[機械可読メモ](./data/shogi-halfkp81-depth18-v2-timeout-diagnostic-2026-07-30.json)に保存した。

実装PR #668は全15 check成功後に通常mergeされた（merge `28a3310a9f16fafc4b192b090dcc3cdf2600de09`）。clean mainからv3のimmutable teacher plan（9,103 bytes、SHA-256 `6b69cb61044df051999191e6204be098205aa2301690f2a1becc0730baf9eda5`）をcreate-onlyで発行し、`com.meetyudai.shogi.halfkp81-depth18-bounded-v3-28a3310a`としてone-shot起動した。しかしrunnerはworkerを作る前に`bounded stable v3 preregistration is not canonical JSON with one terminal LF`で停止した。tracked preregistrationは固定済みのpretty JSONなのに、runnerが同じbytesへcanonical 1行JSONという追加条件を誤って課していたのが原因である。出力namespaceに残ったのはteacher planだけで、完了は0 / 8,192親・0教師行、やねうら王とstable workerの起動も0だった。launchd jobはunload済みで、学習・棋力証明は進んでいない。

v3のplanやnamespaceを上書きして再開はしない。修正版v3r2は新しいsource revision、run fingerprint、output namespaceへ結合する別のtechnical-recovery familyにする。変更するのは、pretty JSONのtracked preregistrationを既存のexact bytes/SHAで認証し、矛盾する1行化条件を外す点だけである。8,192選抜、stable-WASMの固定20秒上限、やねうら王depth16 MultiPV 12、全候補のdepth18再評価、3 epoch・1 seed、全棋力gateは変えない。v3 startup faultの証拠と境界は[機械可読メモ](./data/shogi-halfkp81-depth18-v3-startup-fault-2026-07-30.json)に保存した。

v3r2を含むPR #669は全15 check成功後に通常mergeされた（merge `f0ae74c208d3934849864c05cc68219f1834ef83`）。正式実行は5分11秒で94 / 8,192親、depth18教師1,125行まで進んだ。optional stable候補はdepth11完了proposal 61件と、20秒のcooperative deadlineによる認証済みomission 33件だった。omissionは全てpartialを捨て、そのworkerを回収・交換しており、長尾探索を親全体の失敗にしない経路そのものは動作した。しかし次のworker startupがtimeoutし、technical fault 1でfamilyを終了した。planは10,827 bytes、SHA-256 `53e3aaabf2d08b9c440478e94dc1ccbdca58334618523dfcccf5d80ed3a072a9`、workは1,463,884 bytes、SHA-256 `f182810f3629c6c57e81db759aca995eda4e4aa76787cd646a96295931856200`、terminal faultは884 bytes、SHA-256 `10cfd2bc38fab128c3c7eff54bd9a5c005d96bb097ae24f6e322d4521bd4c1e6`で固定した。v3r2の94親・1,125行は失敗familyに結合済みなので、学習にも次familyにも流用しない。

同じstartup timeoutはstress waveで再現した。停止childをsampleした167 / 167件が、worker sourceを渡すfd 3の`readFileSync(3)`でEOFを待っていた。停止点はWASMやweightsを読む前であり、FD leak、pool poison、特定のparent 49、探索timeoutの長さは原因ではなかった。v3r3は新しいsource revision、run fingerprint、output namespaceを使い、親が`sourcePipe.end()`の完了を上限付きで待ってからworker initへ進むようにする。timeoutの延長、教師・学習・合格線の変更、v3r2行の再利用はしない。実行・診断の全実数は[機械可読メモ](./data/shogi-halfkp81-depth18-v3r2-worker-startup-fault-2026-07-30.json)に保存した。この修正もまだ棋力向上の証拠ではない。

ライブ基準は`public/shogi-nnue-weights.bin`の1,185,988 bytes、SHA-256 `e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc`のままである。選抜の完了は棋力向上の証拠ではなく、公開flagも変更していない。

機械可読の条件と実測値は[データメモ](./data/shogi-halfkp81-hard-depth18-strength-plan-2026-07-29.json)へ分離する。
