# 24,000局面の実認証を、証明を変えずに12並列へつないだ

先に結果を書く。36,349件のraw receiptを1回認証する単発観測は、現行直列の31.706秒、source closure込みの本番12 workerで15.680秒だった。**この1回の経路比は2.022倍、差は1 passあたり16.026秒**である。直列と並列のreportはdeep strict equalityで一致し、候補manifestのcanonical bytesも一致し、raw manifestの保存bytesは前後で不変だった。

これは前回の[非本番foundation](./blog-shogi-floodgate-raw-authentication-worker-foundation.md)を本番認証経路へ接続した続編である。ローカルMacだけを使い、AWS、GCP/Firebase、Vercel、network requestは使っていない。教師生成、学習、formal A/B、live weightも変更していない。

English version: [Productionizing twelve-core raw authentication without changing the proof](./blog-shogi-floodgate-raw-authentication-worker-production.en.md)

## 実測

同じ完了済みraw lockと同じcandidate manifestを、Node v22.13.0、Apple M4 Pro 14 core、48 GB RAMで直列、本番12 workerの順に各1回だけ処理した。明示的なpage-cache warmup、反復、counterbalanceは行っていない。直列が先に全receiptを読んだため、後続のparallelが温まったpage cacheの利益を受けた可能性があり、cache / order biasは除去できていない。したがって2.022倍はこの順序での1回の観測比であり、order-neutralなthroughput推定値ではない。時刻は`process.hrtime.bigint`、RSSは5 ms間隔のprocess観測値である。

| 実経路                     |           36,349件 |       観測peak RSS | 結果           |
| -------------------------- | -----------------: | -----------------: | -------------- |
| 現行直列                   |      31,705.588 ms |  355,041,280 bytes | PASS           |
| source-closed本番12 worker |      15,679.927 ms |  754,171,904 bytes | PASS           |
| 差                         | **-16,025.661 ms** | +399,130,624 bytes | report完全一致 |

このserial-first単発観測では12 worker / serial比が2.022049だった。48 GB machineに対する観測peakは約719 MiBであり、メモリを増やして速さを得る設計として十分小さい。ただし384 MiB × 12のold-generation設定はV8の構成上限であって、process RSSの予約値でも実使用量でもない。

前回のproduction-shape emulationでは2.82倍を観測したが、本番経路で採用できる観測は、上記bias制限を持つserial-first単発の2.02倍だけである。今回の時間には、実際のcandidate再検証だけでなく、worker bundleのheld read、Git tracked tree全体のexact-clean確認、worker終了後の同一revision再確認が入る。安全境界を除いた数字を本番速度として扱わない。

逆順の追加runも実行自体と出力同値性は通ったが、一時diagnosticのtimerが`await`より前にelapsedを計算する誤りだった。その0.003 / 0.005 msという値は明らかに無効であり、速度計算から除外した。途中の失敗値を都合よく採用しない。

## workerはspawn後にpathを読まない

以前の未解決点は、workerがspawn後にTypeScript entryと`tsx`をpathから読むことだった。親がclean revisionを確認しても、その後に別bytesへ差し替えられる余地があった。

本番経路は次の形へ変更した。

- 4個のtransitive sourceだけをesbuildのexact allowlistでbundleする
- Node built-in以外のexternal importをbuild時に拒否する
- tracked CJS 54,297 bytesをSHA-256で固定する
- `O_NOFOLLOW`でsingle-link regular fileを開き、current user ownership、mode、size、digestを検査する
- 検証済みbytesをメモリから`Worker(..., { eval: true, execArgv: [] })`へ渡す
- bundle、親directory、repositoryのdescriptorを全worker終了まで保持する
- symlink、path swap、in-place書換えとbytes復元、親directoryの途中変更をpostflightで拒否する
- worker側も親と同じNode version、V8 version、module ABI、executable path、platform、architectureを要求する
- tracked bundleがsourceからbyte-identicalに再buildできることを通常unit testで毎回確認する

これにより、workerはspawn後にTypeScript、`tsx`、`node_modules`、repository上のbundle pathを読み直さない。

## 過去の検証用treeと、今動くworker sourceは別

途中reviewで重要な誤りが1つ見つかった。役割bundleは過去の固定semantic verifier revision `e8a9197608cb48b1160b6707d97b0c4f78f90a1d`を検査する一方、実際にロードされているworker poolは最新runner repositoryにある。当初案は過去のrevisionをworker source revisionとして誤用しており、その過去treeには新bundleがないため次の正式runで停止する設計だった。

修正後は権限を分離した。

- 過去の固定verifier root / revisionは、従来どおりrole-lockとbundleの意味論・ancestryを検査する
- worker sourceは、`__dirname`から得た「今ロードされているrepository root」を使う
- そのcurrent HEADをspawn直前にexact-clean captureし、全worker終了後に同じrevisionを再検査する
- 過去のsemantic revisionをcurrent worker revisionへ読み替えない

異なるrootとrevisionを使うintegration testを追加し、この混同が再発しないようにした。

## 順序と失敗は変えない

taskは従来の直列順、すなわちlisting、daily rating、period inventory、CSAの各UTF-8 bytewise順にordinalを付ける。完了順が入れ替わっても、resultは必ずordinal順へ戻す。複数taskが失敗した場合は、時計上最初の失敗ではなく最小input ordinalの失敗を返す。

worker responseは親でexact shape、receipt kind、URL、body identityを再captureする。raw bytesはthread境界を渡さない。taskは60秒、shutdownは5秒で期限を切り、停止しないworkerはterminateする。既存のconstructor failure、hang、malformed response、extra message、逆転したfailure timingのtestも残した。

## 全認証への効果と残る床

過去のfull authentication 1,088.743秒はraw passを4回行った。cache / order biasを除去していない今回の単発差16.025661秒を4回へ単純投影すると、64.102646秒短縮、1,024.640秒、約17.08分になる。

これは**full authenticationの実測ではなく投影**である。次の正式run自身が同じ認証を必要とし、その直後に12 engine教師探索へ進むため、別の16〜18分認証を重複実行してCPUを競合させなかった。

raw verificationを仮に0秒へしても、同じ過去値から計算した床は約961.921秒、16.03分である。次の大きな短縮対象はrole replayの局面ごとの不変な準備であり、global blocked setを更新するcommitはcanonical順のまま残す。SSDやRAMを埋めるだけではこの順序依存部分は消えない。

## 検証とclaim boundary

実装revisionではworker / source / raw verifierの25 tests、role-lock / bundle / training consumerの110 tests、targeted ESLint、bundle再build、diff checkが通った。独立reviewとCIの結果はPR段階で追記する。

この変更が示すのは認証が速くなったことだけである。評価関数の棋力、教師label品質、再学習、候補選抜、formal A/B、高段、live deploymentの証拠ではない。機械可読値は[production evidence](./data/floodgate-raw-authentication-worker-production-2026-07-19.json)に保存した。
