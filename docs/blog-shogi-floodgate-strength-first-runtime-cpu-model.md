# 学習runtimeのCPUモデルをPATH非依存にした

> 2026年7月20日、strength-first v9の3-seed学習を始める前のresource監査で、
> candidate builderとtraining launcherが同じMacを異なるCPUモデル名として記録する
> 問題を発見した。学習はまだ始まっておらず、live weightも変更していない。
> English version:
> [blog-shogi-floodgate-strength-first-runtime-cpu-model.en.md](./blog-shogi-floodgate-strength-first-runtime-cpu-model.en.md)

## 結論

`ml/train.py`のCPUモデル取得を、呼出し側の`PATH`に依存しない
`/usr/sbin/sysctl`の固定呼出しへ変更した。修正後はcandidate builderの狭い固定環境と
launcherの通常環境が、どちらも`Apple M4 Pro`を含む同一のruntime JSONを返す。

これは学習計算の変更ではない。CPU、Torch 2 threads、interop 1、決定論的algorithm、
seed 42 / 43 / 44、20 epochs、batch 256、loss、データ、選抜gateは変えていない。

| 項目                | 修正前             | 修正後             |
| ------------------- | ------------------ | ------------------ |
| builderの`PATH`     | `/usr/bin:/bin`    | 変更なし           |
| CPUモデル取得       | bare `sysctl`      | `/usr/sbin/sysctl` |
| builderのCPUモデル  | `arm`へfallback    | `Apple M4 Pro`     |
| launcherのCPUモデル | `Apple M4 Pro`     | `Apple M4 Pro`     |
| runtime exact一致   | 不一致で学習前STOP | 一致               |

## なぜ学習を止める問題だったか

candidate builderは固定venvを`PATH=/usr/bin:/bin`でprobeする。この環境には
`/usr/sbin`がないため、従来のbare `sysctl`は見つからず、CPUモデルはprocessor名の
`arm`へfallbackしていた。

一方、3-seed launcherは通常の環境を引き継ぐ。通常`PATH`には`/usr/sbin`があり、
同じ関数は`Apple M4 Pro`を返す。学習planはruntimeをexact dataとして保存し、
各学習processは開始時に実runtimeとの型付き完全一致を要求する。そのため修正前のplanを
登録すると、3 processは教師データを学ぶ前にruntime mismatchで停止する。

resource監査中に実行した約2.5秒の固定venv probeでこの差を確認できたため、
正式教師の完了前に修正できた。失敗した学習slot、部分checkpoint、選抜data readはない。

## 修正とfallback

Darwinだけが固定`/usr/sbin/sysctl -n machdep.cpu.brand_string`を呼ぶ。
非DarwinではDarwin固有commandを呼ばず、従来どおりprocessor、machine、最後に
`unknown`の順でfallbackする。Darwinでもbinary不在、command失敗、空出力なら同じ
fallbackを維持する。

この境界をmock testで固定した。

1. `PATH=/usr/bin:/bin`でもabsolute argvを使い、CPUモデルを取得する
2. builder相当PATHとlauncher相当PATHが同じ`Apple M4 Pro`を返す
3. 非Darwinでは`sysctl`を呼ばず、Darwinの不在・失敗時もfallbackする

focused 3 test、Python compile、Ruff、diff checkはPASSした。さらに固定venvで二つの
実環境を連続probeし、Python 3.13.0、PyTorch 2.12.1、CPU 14 cores、Torch 2 threads、
interop 1、deterministic mode、`Apple M4 Pro`を含むJSONのbyte equalityを確認した。
これはruntime preflightであり、optimizer trainingや棋力評価ではない。

## 既存planへの影響

既存のWCSC36 planはすでに`Apple M4 Pro`を記録している。この変更で既存planやauditを
編集せず、bytesとhashも変えない。通常環境で返していたruntime値も変わらない。

新しいstrength-first v9 exact planは、正式教師の最終resultが出た後に、修正を含む
review済みrevisionで生成する。既存のpipeline-revision検査がそのsourceをplanと
checkpointへ結ぶ。古い実験を新revisionで再実行したり、歴史的resultを書き換えたりはしない。

## 現在地

記録時点で正式v9教師は稼働中で、最終`result.json`、exact training plan、
seed 42 / 43 / 44の実学習、候補選抜、formal A/Bはいずれもまだない。
この修正にproduction weight書込み権限はなく、live weight変更は0である。

教師完了後はcandidate builderで実identityとruntimeを生成し、data-only planをreviewして
登録した後にだけ3-seed launcherを実行する。棋力向上はその後のfresh selection、
sealed holdout、正式paired A/B、外部校正を通過するまで主張しない。

機械可読記録:
[floodgate-strength-first-runtime-cpu-model-2026-07-20.json](./data/floodgate-strength-first-runtime-cpu-model-2026-07-20.json)
