# 次はseedを足さない。Floodgate強豪1,400局で「データだけ」を変える

> WCSC36のexact-int16-aware学習では、3 seedすべてのproduction int16 pair accuracyがstableを上回った。それでもtop-1と量子化差を含む4条件を全部通ったseedは`0/3`で、判定は`static_selection_fail`だった。次に同じ341親のselectionを見ながらseedやlossを調整すれば、強くするよりdevelopment setへ合わせる作業になる。そこで次の実験は、モデル、loss、seed、閾値を固定したまま、学習・selection・holdoutを独立したFloodgate強豪棋譜へ入れ替える。English version: [blog-shogi-floodgate-fresh-sibling-plan.en.md](./blog-shogi-floodgate-fresh-sibling-plan.en.md)

---

## TL;DR

- [Floodgate公式アーカイブ](https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/)の2026-01-01〜03-31を使う。90/90の日別URLが存在し、36,419 CSAのうち36,168局が対象の`floodgate-300-10F`だった
- 対局日前の累積rating表で両identityがgroup 0かつ30局以上、CSA内の対局時ratingが双方3600以上、平手・先手開始・合法手・`%TORYO`終局だけを対象にする。表示名ではなくCSAのidentity hashで結ぶ
- 教師cpを見る前に1,400局を固定し、training 1,000局 / fresh selection 200局 / fresh final holdout 200局へ局単位で分ける。各局24親なので24,000 / 4,800 / 4,800親になる
- 親局面だけでなく、その親からの**全合法子局面**までsemantic IDを作る。final → selection → trainingの順で保護し、既存WCSC36の8,678 protected IDとも交差させない
- YaneuraOu depth 16でMultiPV 12、実戦手、stable runOp1 depth 11の手を候補和集合にし、候補を1手ずつ独立再探索する
- 学習は前回と同じ`2282→256→32→1`、同じexact-int16 STE、seed 42/43/44、20 epoch、`lr=1e-4`、replay 500,000。変えるのは新規教師データだけ
- 3 final checkpointが全部完成するまでfresh selection labelを作らない。family gate合格後だけfresh finalと未開封WCSC36 finalを開く。どこかで失敗したらproductionはrunOp1のまま
- 内部で全条件を通した後、384局paired A/Bと81Dojo公式COM環境200局を別ゲートにする。最後30局の各post-game ratingが2050以上なら、この計画では初めて「安定して高段」と呼ぶ

---

## 1. なぜ次は「強い棋譜から学び直す」なのか

前回のQATは完全な無駄ではない。3 seedすべてでint16 pairはstableを超え、production整数演算をlossへ入れる方向に部分的な再現性があった。一方で、top-1とfloat→int16差は安定しなかった。

現在のdevelopment setはWCSC36の4局・341親である。top-1は1親の変化が約`0.00293`、つまり0.293 percentage point動かす。seed 43のtop-1不合格はまさに1親分だった。これほど小さい集合をもう一度見ながら調整するのは危険である。

学習側もWCSC36 28局から作った1,725親だった。強豪対局ではあるが、局数、戦型、エンジンidentityの幅が狭い。今回の仮説は次の1つだけにする。

> exact-int16-aware学習の不安定さの主因がデータ分布の狭さなら、同じモデルと同じ学習契約を約10倍以上の独立した強豪親局面へ適用すると、3 seed familyでpair、top-1、量子化差を同時に通しやすくなる。

ネットワーク拡大やKP特徴追加を同時に行わない。結果差をデータ変更へ帰属できなくなるからである。

## 2. labelを見ずに公開在庫を調べた

対象はFloodgateの2026年Q1である。日別一覧の棚卸し結果は次のとおりだった。

| 項目                     |                     実測 |
| ------------------------ | -----------------------: |
| 日別URL                  |         90 / 90 HTTP 200 |
| CSA総数                  |                   36,419 |
| `floodgate-300-10F`      |                   36,168 |
| 1月 / 2月 / 3月          | 12,790 / 11,716 / 11,913 |
| 日別一覧HTML合計         |         10,098,337 bytes |
| 90行一覧manifest SHA-256 |        `05d35341…bfc822` |

期間全体を含む最初の累積snapshot、[players-floodgate-20260401](https://wdoor.c.u-tokyo.ac.jp/shogi/x/rating/players-floodgate-20260401.html)は332,094 bytes、SHA-256 `17bd9969…ac5b4`だった。group 0には316 identityがあり、rating 3600以上かつ30局以上は152 identityだった。先頭9,000候補のheader確認だけでも、identityと対局時ratingの両条件を満たす局が少なくとも8,391局あり、1,400局は閾値を下げず作れる見込みである。

これはteacher cp、勝者、候補モデルscoreを見ない在庫確認である。既存final holdoutも開いていない。

### 表示名だけでは結ばない

同じ表示名に別identity hashがある例が5件見つかった。したがってファイル名の名前だけで強豪局を選ばない。各CSAの次の情報を相互照合する。

```text
'rating:<player+identity-hash>:<player+identity-hash>
'black_rate:<identity>:<game-time-rate>
'white_rate:<identity>:<game-time-rate>
```

公式ratingページはgroup間のratingを比較できないと明記している。group 0限定は人間段位への換算ではなく、同じrating母集団内の強いエンジン分布を選ぶためのcorpus filterである。

## 3. 先に固定するsource filter

各対局について、その対局日より前に作られた同日名の累積`players-floodgate-YYYYMMDD.html`を使う。

1. 両identityがgroup 0
2. 両identityがそのsnapshotで累積30局以上
3. CSA内の対局時ratingが双方3600以上
4. 両者は異なるfull identity
5. eventは`floodgate-300-10F`
6. 平手初期局面、先手開始、全指し手が合法
7. 終局は`%TORYO`のみ
8. 親候補は0始まりply 16〜119に24個以上

勝者、戦型名、実戦手の良し悪し、teacher scoreでは除外しない。同じCSA bytesが複数URLにあればUTF-8 byte順で最小のURLだけを残す。identityが一方へ偏らないよう、各roleで1 identityが含まれる局を10%まで、同じidentity pairを2%までにする。不足してもrating、局数、diversity cap、semantic isolationを緩めず停止する。

取得は最大4並列・request開始間隔100ms以上とし、公式origin以外、redirect、query、fragment、userinfo、非標準portを拒否する。一覧、rating、CSAのexact bytesをSHA-256 lockし、その後はoffline再現する。

## 4. 1,400局を3つの役割へ封じる

| role                |  局数 | 親/局 |   親数 | labelを作る時点               |
| ------------------- | ----: | ----: | -----: | ----------------------------- |
| training            | 1,000 |    24 | 24,000 | role lock後                   |
| fresh selection     |   200 |    24 |  4,800 | 3 seedのfinal完成後、一度だけ |
| fresh final holdout |   200 |    24 |  4,800 | static family pass後だけ      |

game hashはrole別domainで順位化する。優先順はfresh final → fresh selection → trainingで、同じ局を2 roleへ入れない。

1局24親は序盤ply 16–31から6、中盤32–79から12、終盤80–119から6をhash選択する。あるphaseが短ければ、同局のply 16–119の残りを別domain hash順で補う。phase不足だけで長い対局へ偏らせないためである。

### 全合法childまで先に保護する

parent SFENから合法手を全列挙し、次の集合をlabelなしで作る。

```text
protected(parent) = parent position ID ∪ every legal child position ID
```

既存WCSC36 selection、未開封final、policy exposureの和集合8,678 IDと交差するparent groupは使わない。新しいrole間でもfinalを最優先に、selection、trainingの順でsemantic overlapを落とす。parent→childのtranspositionも衝突として扱う。

これにより、finalのMultiPVやcpを先に生成しなくてもholdout input spaceを学習replayから守れる。

## 5. 教師と候補集合

教師は過去のdepth pilotで完走性を確認したYaneuraOu fixed depth 16を使う。[YaneuraOu公式](https://github.com/yaneurao/YaneuraOu)のUSI/MultiPV実装を、既存receipt、binary、eval treeのhashで固定する。

各親の候補は次の和集合である。

- YaneuraOu MultiPV 12
- 強豪棋譜の実戦手
- 現行runOp1 production int16がfixed depth 11で選ぶ手

その後、候補ごとにMultiPV 1、`searchmoves` 1手、depth 16で独立再探索する。proposal前と各candidate前に`isready`とTT resetを行い、UTF-8 byte順で実行する。12 process、各1 thread、Hash 64 MiB、1探索600秒timeoutで、欠落・timeout・不完全parentはfail closedにする。

runOp1手を候補に足すのは、現行productionが選ぶ手を強いteacherが明示的に比較できるようにするためであり、candidate QATモデルの手は足さない。

## 6. 学習側は変えない

| 項目                | 固定値                                                    |
| ------------------- | --------------------------------------------------------- |
| architecture        | board `2282→256→32→1`                                     |
| initializer         | runOp1 `571ca309…aa65ff8`                                 |
| objective           | `0.5 × float full task + 0.5 × exact-int16 STE full task` |
| seeds               | 42 / 43 / 44                                              |
| epoch / batch       | 20 / 256                                                  |
| optimizer / lr      | AdamW / `1e-4`                                            |
| replay              | 500,000 / ratio `1.0`                                     |
| checkpoint          | final epoch only                                          |
| early stopping      | false                                                     |
| 学習中selection評価 | 0                                                         |

architecture、loss、optimizer、seed、量子化式、selection gateは変更禁止である。fresh selectionのpathを学習processへ渡さず、3つの`final.pt`と`result.json`がstrict-loadできてからselection teacherを初めて生成する。

## 7. 合否とholdout解除順

fresh selection上でstableも同時評価する。各seedは次の4条件を全部通す必要がある。

1. int16 pair accuracy `> stable`
2. int16 top-1 `>= stable`
3. `abs(float-int16 pair delta) <= 0.002`
4. `abs(float-int16 top1 delta) <= 0.005`

int16 pair、top-1、MAE、seed、checkpoint hashの固定順で並べ、median seedを代表にする。代表が4/4、3 seed中2 seed以上が4/4、全seedが量子化差2条件を通ることをfamily passとする。既に使ったWCSC36 selectionは再読しない。

static pass後だけ、次へ進む。

1. fresh Floodgate finalでcandidateのpair/top-1がstable以上
2. 未開封WCSC36 finalでもpair/top-1がstable以上
3. general/opening retention、`P*8f`、production parity/search/browser
4. 384局、192 color-swapped opening pairのpaired A/B

384局はpairをblockとして100,000回bootstrapする。one-sided 95% lower boundが45%超で安全性、two-sided 95% lower boundが50%超で初めて「stableより強い」と呼ぶ。途中で落ちたら後段を開かない。

## 8. 計算時間の見積もり

WCSC36 depth 16実績を線形換算すると、training teacher 24,000親は約11.47時間、fresh selection 4,800親は約2.29時間である。最初のstatic判定まで約13.8時間。合格時だけfresh finalへさらに約2.29時間、最大約16.1時間を見込む。3 seed学習は同時実行で約30〜45分と推定する。

これは見積もりであり、timeoutや候補数で変わる。teacher jobが計算量の大半を占める。

## 9. 「安定して高段」の定義

内部A/Bはstableより強いかを測るだけで、人間段位を証明しない。全内部gateを通った後だけ、[81Dojo利用規約](https://81dojo.com/en/terms.html)に従う公式COM accountと公式clientで200 rated gamesを行う。対局相手を選ばず、game 171〜200の各post-game ratingが[公式段級位表](https://system.81dojo.com/pages/ranks)の5段下限2050以上なら、この計画では「stable high-dan」と判定する。

アカウント、接続、対局条件は実行前にユーザーと最終確認する。内部scoreから人間段位へ換算したとは主張しない。

## 10. 実行順

1. このplanを先にmergeする
2. source parser、checksum lock、role allocator、all-legal-child protectionを実装する
3. online取得を1回行い、offline再現とexact role quotaを確認する
4. training teacherだけ生成する
5. 同じQATを3 seed同時学習する
6. fresh selectionを一度だけ生成・評価する
7. pass時だけholdout、回帰、384局A/B、外部校正へ進む

事前登録JSONは10,623 bytes、SHA-256は次である。

```text
87d9d8927e8a8f645d5170d64b5d6b8fe17d54ca4bb32000f6454b0cf6291493
```

今回の判断は「今の評価関数へ強い棋譜を無条件に上書きする」ではない。現行productionを残し、独立candidateを作り、fresh selectionと2つのfinal holdoutと実戦A/Bを通った時だけ置き換える。これなら失敗しても今の強さを失わず、成功した時だけ検証可能な形で前へ進める。
