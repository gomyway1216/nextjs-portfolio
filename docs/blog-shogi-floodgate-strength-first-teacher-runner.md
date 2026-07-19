# Floodgate強化優先teacher runnerを実装

> 2026年7月19日、認証済みの24,000訓練親局面を1回だけ開き、同じcallbackと
> `work.jsonl`を使って100 → 500 → 24,000へ自動継続するMacローカルrunnerを
> 実装した。review修正後のfocused validationは5 files / 46 testsがPASSし、
> runner単体は23 / 23 testsがPASSした。
> **実teacher runはまだ開始していない。**
> 完了済みteacher dataset、学習、候補選抜、正式A/B、live weight変更はすべて0である。
> English version:
> [blog-shogi-floodgate-strength-first-teacher-runner.en.md](./blog-shogi-floodgate-strength-first-teacher-runner.en.md)

## 現在地

| 項目                                  | 状態                                     |
| ------------------------------------- | ---------------------------------------- |
| 元のtraining input実認証              | 完了: 24,000親 / 1,000対局 / 1,088.743秒 |
| strength-first runner実装             | 完了                                     |
| focused validation                    | 最終5 files / 46 tests PASS              |
| runner単体validation                  | 23 / 23 tests PASS                       |
| core独立review                        | P0 / P1 / P2 = 0 / 0 / 0                 |
| runner独立review                      | P0 / P1 / P2 = 0 / 0 / 0                 |
| strength-first実teacher command       | 0回                                      |
| 完了milestone / 完了teacher dataset   | 0 / 0                                    |
| optimizer / candidate selection / A/B | 0 / 0 / 0                                |
| live weight変更                       | 0                                        |

過去の停止試行で残った3件のpartial parent recordは履歴として保持しているが、100件の
milestoneにも完了済みdatasetにも数えない。実装とsynthetic testが完了したことは、実データの
label生成や棋力向上を意味しない。

## 1回の認証を12-engine教師生成へ直結

固定Node v22.13.0を直接使うargumentless command
`"$HOME/.nvm/versions/node/v22.13.0/bin/node" -r tsx/cjs ml/run-floodgate-strength-first-teacher.ts`
はmacOS arm64でのみ動き、path overrideを受け付けない。過去の固定証跡を連鎖的に
書き換えないため`package.json`は変更していない。処理順は次のとおりである。

1. YaneuraOu、評価ファイル、stable assetを固定production asset authorityで検証する。
2. runner repositoryのexact clean Git revisionを取得する。これは入力を検証する固定
   bundle verifier revision
   `e8a9197608cb48b1160b6707d97b0c4f78f90a1d`とは別のidentityとして記録する。
3. formal postflight対応consumerを1回呼び、callback冒頭でtraining inputを同期的に1回だけ
   claimする。
4. 同じ24,000行と同じflat stageで100、500、24,000を順に処理する。operator確認待ちは
   挟まない。
5. callback完了後にinput filesystem再検査とdescriptor closeを含むpostflight receiptを
   検証・claimし、それからだけ`result.json`をcommitする。

教師は各親局面でYaneuraOu depth 16 / MultiPV 12をproposalに使い、強豪棋譜の実戦手が
含まれなければ候補へ追加する。全unique候補をUTF-8 byte順で並べ、それぞれを別の
MultiPV 1 / exactly-one-candidate `searchmoves` depth 16で再評価する。12 process、
各1 thread、Hash 64 MB、1 searchあたりtimeout 600秒でローカルCPUを使う。

各USI childは親の`process.env`を継承しない。`HOME`と`TMPDIR`はchildごとの
`<private-worker-cwd>`、`PATH=/usr/bin:/bin`、`LANG=C`、`LC_ALL=C`、`TZ=UTC`へ固定する。
過剰な内側並列を防ぐため、`OMP_NUM_THREADS`、`OMP_THREAD_LIMIT`、
`OPENBLAS_NUM_THREADS`、`MKL_NUM_THREADS`、`VECLIB_MAXIMUM_THREADS`、
`NUMEXPR_NUM_THREADS`、`BLIS_NUM_THREADS`もすべて`1`へ固定する。macOSのspawnは
明示envに`__CF_USER_TEXT_ENCODING`だけを追加し得るため、そのplatform注入名だけを
許可する。固定変数、親環境を継承しないこと、唯一許容する注入名はrun fingerprint、
manifest、staged / final resultへ束縛し、実childのenvironment traceでも検査する。

stable assetは共有preflightでintegrityを確認するだけで、stable engine / policyは候補生成にも
評価にも実行しない。runtime network、AWS、Firebase / GCP、Vercelは使用しない。

実機は14物理 / 14論理core、51,539,607,552 bytes（48 GiB）RAMで、確認時の空きdiskは
106 GiBだった。探索に12 processを割り当て、残る2 coreを入力供給、永続化、OSへ残す。
depth 16ではCPUが主な制約であり、空きRAMやSSDを埋めても直列認証や探索が比例して
速くなるわけではない。

## flatでdurableな途中データ

出力rootはprivateな
`~/.codex/shogi-runs/floodgate-q1-2026-strength-first-v6`に固定し、stageを分岐させない。

| file                      | commit時点と役割                                                      |
| ------------------------- | --------------------------------------------------------------------- |
| `work.jsonl`              | parentごとに追記・data syncし、再開時に検証して完了済みparentを再利用 |
| `milestone-100.json`      | canonical 100-parent prefixのbytes / SHA-256を固定                    |
| `milestone-500.json`      | 同じrun fingerprintのcanonical 500-parent prefixを固定                |
| `train.jsonl`             | 24,000完了時だけ作るcanonical training-only rows                      |
| `parent-completion.jsonl` | 全parentをemitted groupまたはforced skipへ1対1でaccounting            |
| `manifest.json`           | input、runner、teacher、search、completion、training outputを束縛     |
| `staged-result.json`      | callback内で作る未postflightの完了記録                                |
| `result.json`             | exact consumer postflight claim後だけ作るformal completion marker     |

追記した`work.jsonl`は各entryでdata syncし、milestone終了時にはcanonicalな順序へatomic rewrite
する。final outputとmilestone / result JSONはfile sync、同一directory内rename、directory
syncを行う。途中で停止した場合は同じrun fingerprintの検証済み`work.jsonl`から再開できる。
完了後の再実行は`result.json`とそこに束縛された全fileを再検証し、再認証やengine workを
行わずidempotentに返る。

二重起動は親runnerが保持するdescriptor-backedなmacOS `/usr/bin/lockf`のkernel advisory
lockで防ぐ。親がprivate lock fileを1回開き、取得helperへ同じopen-file-descriptionのFDを
継承する。helperはnonblocking lockを取得し、acquisitionがcallerへ返る前に終了する。
helper終了後も親が保持する同じopen-file-descriptionのdescriptorによってlockは継続する。
明示releaseで親FDをcloseしたとき、または親の異常終了・死亡でOSがFDをcloseしたときに
lockが解放される。lock pathのunlink / reopenも、PID / token / keeper processも使わない。
2 processの同時取得試験ではexactly oneだけが成功する。

`train.jsonl`はすべて`train` roleで、internal random validation splitは作らない。
fresh selectionとfresh / 既存final holdoutは開かず、その役割をteacher trainingへ混ぜない。

## 認証時間と慎重な所要時間見積もり

元入力の実認証は24,000親 / 1,000対局でcallback 1,088.742秒、post-callback検査とcloseまで
1,088.743秒だった。同じ認証を100、500、24,000ごとに3回行う換算は約54.44分である。
1 callbackへまとめることで認証部分を約18.15分にし、約36.29分を削減する。

初回real 100のend-to-endは開始から約22〜35分、24,000のteacher生成は認証に加えて
約11.5〜12時間と見積もる。これらは実測完了時刻ではなく、過去の処理速度から得た幅のある
見積もりである。局面ごとの候補数やsearch時間で変動する。

## validationと次の証拠

review修正後のlocal focused validationは5 files / 46 testsで、runner単体は23 / 23 testsが
PASSした。資産authority・USI runtime・postflight consumerまで含む最終関連validationは
8 files / 120 testsがPASSした。publication evidence単体は5 / 5、scoped ESLint、
Prettier、diff checkもPASSした。新規TypeScript fileに限定したcheckはerror 0だった。
repository全体のTypeScript checkには今回のrunnerと無関係な既存errorが残るため、runnerの
合否へ付け替えていない。teacher coreとrunnerの独立reviewは、いずれも
P0 / P1 / P2すべて0で完了した。

次の証拠は、review済みrunnerを通常mergeした後、固定revisionのargumentless commandを
実行して得る。100 / 500の
途中記録、24,000 training-only dataset、3-seed再学習、候補選抜、sealed holdout、
正式paired A/B、外部校正の順に進める。それらが通るまで、このrunnerは入力・生成物の
完全性を示すだけで、棋力やlive昇格を主張しない。

機械可読記録:
[floodgate-strength-first-teacher-runner-2026-07-19.json](./data/floodgate-strength-first-teacher-runner-2026-07-19.json)
