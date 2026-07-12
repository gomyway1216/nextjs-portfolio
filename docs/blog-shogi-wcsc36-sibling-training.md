# 強豪棋譜を「正解」にしない — WCSC36 sibling教師を作り直した記録

> `deep16`で評価関数を弱くした反省から、「強い棋譜で学び直す」を安全な実験へ変えた。途中で、同じ候補集合を一度の`searchmoves`へ渡す方法そのものが、候補の入力順に依存することを実機で確認した。そこで旧ラベルを捨て、候補を1手ずつ独立探索するv6契約、再現可能なprovenance、上書きしない学習手順まで作り直した。本稿は棋力向上の発表ではなく、その判断と途中データの台帳である。

> **2026-07-10更新**：本稿はPR3時点の履歴である。depth-18 full attemptsのheavy tailを受けた
> Lane A再比較ではfixed depth 16を選び、fresh full runは3,112 selected entryをaccountして完了した。以下のdepth-18 full-run /
> training commandsはsupersededである。
> またLane A全workが全28局へ触れていたため、game-level untouchedの主張は撤回した。現行の
> 102 parent / 1,392 semantic exposure契約とPR4A以降のexact-row sealは
> [続編](./blog-shogi-wcsc36-sibling-training-results.md)を参照。

---

## TL;DR

- 最初の局面源には、利用条件が明記された[コンピュータ将棋協会のWCSC36棋譜](https://www.computer-shogi.org/kifu/kifu.html)を選んだ。決勝28局を合法手照合し、拒否0局、ply 8〜120から3,112親局面を抽出した
- 棋譜の実戦手は強い局面分布と候補手を与えるが、無条件の正解にはしない。実戦手と教師MultiPV上位手を候補集合にし、同じ親局面の兄弟だけを比較する
- v1〜v3で使った「全候補を1回のjoint `searchmoves`で再探索」は不正だった。同じ候補を並べ替えるだけでbest move、順位、cpが変わったため、これらのラベルは学習に使えない
- v4は候補ごとの独立探索へ移したが、最終的なmate・provenance・publication契約より前の診断版である。v1〜v4の全生成物は**診断専用**であり、学習入力ではない
- 現行v6は、各候補の前に`isready`で探索状態をresetし、`MultiPV=1`、`searchmoves <1手>`で独立評価する。実行順はUTF-8 bytes昇順、合成順位はcp降順＋手のUTF-8 bytes昇順で固定する
- 詰みは通常cpと衝突しない`±1,000,000`帯へ写像する。指定depth未満での完了を許すのは、単一候補探索の最後の更新がexact mateである場合だけである
- engine receipt、評価ファイルhash、cleanなGit revision、read-only runtime snapshot、private working directory、train/valのhashを1つのmanifestへ結び付ける。manifestがないデータは学習器が受け付けない
- depth 14/16の100親v6 pilotではrank-1一致62%、candidate Jaccard 83.013%だった。200 cpをtie閾値にした全5,342 common pairの関係一致は91.01%（両方tieの3,643 pairを含む）、両depthでdecisiveだった1,227 pairの向き一致は99.35%だった。ただしclean-pipeline manifest導入前の診断データであり、学習には使わない。学習、量子化、対局、棋力向上はまだ結果ではない
- clean revisionから再生成したdepth 16/18の100親pilotも全事前ゲートを通過した。top-1集合overlap 68%、通常cp差median 29 cp / p90 125.3 cp、200 cp閾値の全pair反転0.146%、depth 18のnodeコスト2.471倍だった。PR3ではdepth 18へ固定したが、後のheavy-tail診断とLane A再比較でdepth 16へsupersedeした

---

## 0. 証拠の読み方

進行中の期待を実測結果に見せないため、状態を次のように分ける。

- **確認済み**：保存したbytes、checksum、パーサ結果、またはテストで確認した
- **診断専用**：原因調査には使えるが、現行契約を満たさず学習には使えない
- **設計・実装済み**：コードと契約はあるが、cleanな本番runの結果はまだない
- **未実施**：学習、export、探索回帰、対局など、まだ結果がない
- **採用条件**：結果を見る前に固定する合否基準

「3,112親局面を取り込んだ」「教師データを作った」「validationが改善した」「実戦で強くなった」は、それぞれ別の主張である。本稿ではこの境界を消さない。

---

## 1. WCSC36を最初の局面源にした理由

[コンピュータ将棋協会の棋譜集](https://www.computer-shogi.org/kifu/kifu.html)は棋譜利用を自由とし、記事へ使用・掲載するときは対局プログラム名、対局日時、大会名または出典を明記するよう求めている。この条件をデータprovenanceにもした。

| 項目 | 保存する値 |
|---|---|
| 大会 | 第36回世界コンピュータ将棋選手権 決勝 |
| 対局日時 | 2026年5月5日。CSA上の開始時刻は09:30:50〜16:10:25 |
| 対局プログラム | 氷彗、Ryfamate、dlshogi、奏乗、水匠、六角堂狸、ponkotsu、AobaZero |
| 出典 | [CSA棋譜集](https://www.computer-shogi.org/kifu/kifu.html)、[WCSC36決勝結果](https://www.computer-shogi.org/live/wcsc36/final.html) |
| 原本 | [wcsc36_kifu.zip](https://www.computer-shogi.org/kifu/wcsc36_kifu.zip) |

公式ZIPは295局を含む。最初の実験では8プログラム総当たりの決勝`F` 28局だけを使った。決勝が唯一正しいからではなく、出典と境界をhashで固定でき、parserから学習まで監査しやすい最小コーパスだからである。

---

## 2. 原本固定とCSA取り込み

| 項目 | 確認値 |
|---|---:|
| ZIP bytes | 1,421,658 |
| ZIP SHA-256 | `48ece58b091dbb4df41e6fb55b73600767f77f4c9ee9ff8360474d5b75bb2631` |
| CSA総数 / 決勝CSA | 295 / 28 |
| 決勝の総着手数 | 5,242 |
| accepted / rejected games | 28 / 0 |
| parent occurrences（0始まりply 8〜120） | 3,112 |
| record-set SHA-256 | `bdb7b19bfb236622ed6e1577631853aea1737d48bb1393c67c06135edbdc37b1` |
| parent JSONL SHA-256 | `827e912032feac9fd539af58a0e35c1131a1228abedcb1bca9c5f51f214bdfaa` |

CSAはSHIFT_JIS、カンマ区切りの複数statement、コメント、終局記号を含む。取り込みは文字列置換ではなく、その時点の合法手生成結果と各着手を照合し、手番、移動元・移動先、駒種、成り、持ち駒からの打ちを一致させる。1ファイルでも不正なら既定ではデータセット全体を書かない。

```bash
mkdir -p ml/data/wcsc36/extracted
curl --fail --location \
  https://www.computer-shogi.org/kifu/wcsc36_kifu.zip \
  --output ml/data/wcsc36/wcsc36_kifu.zip
openssl dgst -sha256 ml/data/wcsc36/wcsc36_kifu.zip
unzip -q ml/data/wcsc36/wcsc36_kifu.zip \
  'wcsc36_kifu/WCSC36-F*.csa' \
  -d ml/data/wcsc36/extracted

node -r tsx/cjs ml/import-csa-games.ts \
  --csa-dir ml/data/wcsc36/extracted/wcsc36_kifu \
  --source wcsc \
  --source-url https://www.computer-shogi.org/kifu/wcsc36_kifu.zip \
  --archive-sha256 48ece58b091dbb4df41e6fb55b73600767f77f4c9ee9ff8360474d5b75bb2631 \
  --archive-file ml/data/wcsc36/wcsc36_kifu.zip \
  --out ml/data/wcsc36/parents.raw.jsonl \
  --report ml/data/wcsc36/import-report.json \
  --min-ply 8 --max-ply 120
```

この3,112行は親局面と実戦手の原材料であり、まだ教師cpではない。

---

## 3. 途中で捨てたラベルと、その理由

### 3.1 joint `searchmoves`は同じ条件ではなかった

当初は、実戦手とMultiPV上位手をまとめ、全候補を1回の`go depth N searchmoves ...`へ渡せば「同じ探索条件」になると考えた。ところが、同じ親、同じ候補集合、同じdepth、同じresetでも、引数の順序だけで結果が変わった。

問題を再現した親`02af34…`では、13候補の並べ方によりjoint探索の先頭が次のように変化した。

| `searchmoves`の入力順 | joint探索のbest |
|---|---|
| proposal順 | `4b4a`、-46 cp |
| UTF-8 bytes昇順 | `6b5b`、-11 cp |
| 逆順 | `6b6a` / `8a7a`が-36 cpで同点 |

候補を1手ずつ独立探索すると、`4b4a`は-31 cpとなった。独立探索の候補実行順を逆にしても、各候補のcpとnodesはbyte単位で一致した。この親では独立探索全体が1,640,405 nodes、約4.8秒で、joint探索の約1.51倍だった。別の親`00064f…`ではbest自体は同じでも、候補の順位とcpの大きさが変わった。

実験とソースを突き合わせると、このbuildのやねうら王は`searchmoves`の呼び出し順をroot move列へ保持していた。探索は有限なので、その順序が探索履歴と計算配分を通じてscoreへ入る。つまり「同じ1回の探索へ入れた」ことは「各候補を順序に依存せず同条件で評価した」ことではなかった。

このため、joint `searchmoves`を用いたv1〜v3のラベルは学習に使わない。原因調査用としてのみ保存する。

破棄規模も記録しておく。full v1は3,112入力親のうち3,106親を完了、合法手2未満の6親をskipし、36,387候補行を生成した。量が多くても教師条件が不正なら価値は回復しないため、この全行を非trainingデータとした。

### 3.2 v4も診断データである

v4では候補ごとの独立探索へ切り替え、joint探索の順序依存を取り除けることを確認した。しかし、v4は後述するfinal-mate例外、完全な実行provenance、atomic manifest境界より前の契約である。したがってv4も、v1〜v3と同様に**診断専用**であり学習入力にはしない。途中版v5も採用しない。現行に近い条件でのdepth感度は、v6 pilotとして4節に分離して記録する。

### 3.3 古いmate写像も順位を壊した

初期版はmateを約`±30,000` cpへ写像していたが、実機の通常cpには-35,281までの値があり、帯が衝突した。実際に8 pairで順位が反転した。v6では通常cpを`|cp| ≤ 900,000`に制限し、mateを`sign × (1,000,000 - 手数)`へ写像する。`mate -0`の符号もprotocol tokenから保持する。

---

## 4. 現行v6ラベル契約

親局面ごとに次を実行する。

1. `isready`で探索状態をresetし、MultiPV探索で候補集合を提案する
2. 棋譜の実戦手が候補にいなければ追加し、合法手と重複を検査する
3. 候補手をUTF-8 bytes昇順へ並べ、実行順を固定する
4. **各候補の前に**`isready`で探索状態をresetする
5. `MultiPV=1`、`searchmoves <その1手>`、同じrequested limitで独立探索する
6. exact scoreだけを採用し、cp降順、同点なら手のUTF-8 bytes昇順で順位を合成する
7. 各候補についてrequested limit、実到達depth、nodes、cp/mate種別を保存する

```text
WCSC36親局面
  ├─ 実戦手
  └─ proposal MultiPV
         ↓ 合法性・重複検査
    bytewise候補集合
         ↓ 1候補ずつ reset + MultiPV=1 + searchmoves 1手
    独立exact score
         ↓ cp降順 + bytewise tie-break
    sibling順位と子局面value
```

proposal探索は必ずrequested depthへ到達しなければならない。候補の単独探索だけは、最後に受理した更新がexact mateであり、その後にcp、bound、不正rank、より浅い更新がないときに限り、requested depth未満での完了を許す。例えばdepth 18 smokeでは、親`009fde…`の`5h4h`がdepth 16で`mate -4`、-999,996 cp、1,215 nodesとして正当に完了した。これは強制手を「未完了」と誤棄却しないための狭い例外であり、通常の浅い探索を許す抜け道ではない。

fixed-nodesでrankごとのdepth混在やboundが出た試行はfail-closedした。v6もbound、欠落rank、古いnodes、不正な`multipv`、`bestmove`と最終PV1の不一致をラベルへ変換せず停止する。

### 100親v6 pilotの現在地

depth 14/16は同じ先頭100親で完走した。件数は次の通りである。

| pilot | 候補行（split前） | train行 | val行 | 漏洩除外 |
|---|---:|---:|---:|---:|
| depth 14 | 1,191 | 819 | 360 | 12行 / 1親 |
| depth 16 | 1,190 | 818 | 360 | 12行 / 1親 |

両方とも入力100親、出力99親、train 69親、validation 30親で、game・親局面・子局面の交差は0だった。同じ100親のdepth 14 → 16比較は次の通りである。

結果を見る前に固定したdepth安定性ゲートは、top-1集合overlap 55%以上、通常cp差のmedian 35 cp以下・p90 160 cp以下・5% trimmed mean 70 cp以下、200 cp tie閾値で全pair関係一致90%以上・両方decisiveの向き一致98%以上・全pair反転0.5%以下・baseline decisive retention 80%以上、400 cp tie閾値で全pair反転0.1%以下である。分母を後から入れ替えないよう、以下では件数も併記する。

| 指標（depth 14 → 16、n=100親） | 診断値 |
|---|---:|
| rank-1一致 / top-1集合overlap | 62% / 63% |
| candidate set完全一致 / micro Jaccard | 29% / 83.013% |
| 通常cp pair | 1,068 |
| 通常cp差のmean absolute / median | 56.12 / 29 cp |
| 通常cp差のp90 / p95 / 5% trimmed mean | 131.6 / 202 / 43.99 cp |
| 200 cpをtie閾値にした全common pairの関係一致 | 4,862 / 5,342 = 91.01%（両方tie 3,643を含む） |
| 両depthでdecisiveな200 cp pairの向き一致 / 反転 | 1,219 / 1,227 = 99.35% / 8 / 1,227 = 0.652% |
| 全common pairを分母にした200 cp反転 | 8 / 5,342 = 0.150% |
| baseline decisive retention | 1,227 / 1,443 = 85.03% |
| 両depthでdecisiveな400 cp pairの反転 | 2 / 698 = 0.287%（全5,342 pair比では0.037%） |
| 実戦手がtop-1 | 57% → 55% |
| observed nodes | 472,801,354 → 1,331,739,463（2.817×） |

depth 16 → 18は20親だけの予備値で、top-1集合overlap 95%、通常cp差median 31 cp、p90 98.4 cp、5% trimmed mean 38.67 cpだった。200 cpをtie閾値にした関係一致は1,029 / 1,106 = 93.04%（両方tie 825を含む）。両depthでdecisiveだった206 pairでは向き一致204 / 206 = 99.03%、反転2 / 206 = 0.971%であり、全1,106 pairを分母にした反転率は0.181%となる。nodesは268,157,536 → 660,586,146（2.463×）。このrunではrequested depth 18に対しactual depth 16で完了したterminal exact mateが1探索あった。n=20なので、depth選択を確定する証拠ではなく参考値として扱う。

ここまでのdepth 14/16と20親のdepth 16/18は有用な実測だが、clean pipeline revisionとruntime snapshotをmanifest必須項目にする前の**pre-pipeline診断run**である。学習入力には使わない。

### clean pipelineでのdepth 16 → 18、100親

実装と記事をcommitしたclean revision `debb8b6b02b8a4d2f76d3c19522fd5c00c2ce883`から、depth 16と18を100親ずつfresh生成した。両manifestはPython consumerでもtrain/val bytesまで検証した。depth 16 manifest SHA-256は`7dd47f21f8207a933670248ac4d2721962d570d0a08f8606fcf40429815f887f`、depth 18は`7214f4bc634348a36658d0bca2075cb4f6f44319791022f591403f7c60147030`である。

| 指標（depth 16 → 18、n=100親） | clean-pipeline診断値 |
|---|---:|
| rank-1一致 / top-1集合overlap | 67% / 68% |
| candidate set完全一致 / micro Jaccard | 31% / 84.926% |
| 通常cp pair | 1,080 |
| 通常cp差のmedian / p90 / p95 / 5% trimmed mean | 29 / 125.3 / 193.2 / 41.69 cp |
| 200 cpをtie閾値にした全common pairの関係一致 | 5,050 / 5,473 = 92.27%（両方tie 3,762を含む） |
| 両depthでdecisiveな200 cp pairの向き一致 / 反転 | 1,288 / 1,296 = 99.38% / 8 / 1,296 = 0.617% |
| 全common pairを分母にした200 cp反転 | 8 / 5,473 = 0.146% |
| baseline decisive retention | 1,296 / 1,474 = 87.92% |
| 両depthでdecisiveな400 cp pairの反転 | 1 / 750 = 0.133%（全5,473 pair比では0.018%） |
| 実戦手がtop-1 | 55% → 54% |
| observed nodes | 1,331,739,463 → 3,291,077,196（2.471×） |

通常cp差のmean absoluteは173.71 cpだが、これはply 118の同じ親で4候補が約2,900 cpから35,281 cpへ移った外れ群に引かれている。4手とも多くのmate候補より下のrank 9〜12であり、事前ゲートは外れ値に頑健なmedian、p90、trimmed meanを用いた。depth 18ではrequested depth 18に対しactual depth 16で完了したterminal exact mateが1探索あり、狭い早期完了契約も実データで作動した。

全事前ゲートが合格したため、計算量は増えるが深い教師側を優先し、**full runの`LABEL_DEPTH`を18に固定した**。この100親pilotのartifact bytesは学習入力へ流用せず、merge後のclean revisionで3,112親を別出力へ再生成する。元の100親はfull corpusにも含まれるが、post-merge契約で改めて探索・検証する。

---

## 5. 実行中のbytesまで固定するprovenance

ラベルの再現性には「開始時にhashを読んだ」だけでは足りない。長時間runの途中でbinaryや評価ファイルが置き換われば、1つのJSONLに異なる教師が混ざるからである。現行generatorは次を契約にした。

- **engine receipt**：source repository、source commit、build command、compiler、engine ID、binary size/hashを記録し、実binaryと照合する
- **clean pipeline revision**：`--pipeline-revision`は完全な40桁Git HEADと一致しなければならない。staged、unstaged、非ignore untrackedの変更があれば開始しない。公開直前にも再検査する
- **保護された出力先**：train、val、manifest、workは相互alias、入力とのhardlink/symlink alias、Git tracked pathを拒否する。repository内ならGit ignoredでなければならない
- **runtime snapshot**：検証済みengine binary、fileとして渡すengine引数、評価treeをprivate temp directoryへcopyし、copy後hashを再検証してwrite bitを落とす。workerは元ファイルでなく、このread-only snapshotとprivate working directoryだけを使う
- **固定option**：Threads 1、book無効、network delay 0、各探索前`isready`を実行・記録する。`eval_options.txt`は固定optionを上書きできるため、評価treeにあれば拒否する
- **resume binding**：work checkpointはraw、候補親集合、policy、pipeline revision、engine/eval、探索条件のfingerprintへ結び付く。1親ごとに`datasync`し、異なるrunへ流用しない

最後に全ラベルとsplitを検査してから、trainとvalをatomic renameで書き、両方のbytes/hashを含むmanifestを最後にatomic writeする。manifestがcommit markerである。途中でtrainだけが置かれても、manifestがなければconsumerは受理しない。学習器と評価器はmanifestを先に検証し、train/val両方のsizeとSHA-256を結び付けてからJSONLを読む。

---

## 6. splitと学習データの視点

1候補につき1行を保存し、`parent_id`で兄弟を束ねる。USI root scoreは親の手番側視点だが、model入力は1手後で手番が反転するため、`teacher_child_cp = -teacher_parent_cp`を明示する。学習器もこの関係を再検査する。

行単位shuffleはしない。seed `42`、validation比率`0.2`で対局全体を片側へ割り当て、その対局の全親・全候補を同じsplitへ置く。raw 3,112親ではtrain 21局 / 2,357親、validation 7局 / 755親となった。ラベル後に同じ親`position_id`または子`child_position_id`が両側へ現れたらvalidationを優先し、該当train親を丸ごと除く。

これにより、同じ親の最善手をtrain、次善手をvalidationへ置く漏洩を防ぐ。ただし28局は小さく、同じvalidationをepoch選択やwarm/scratch比較に使えば、それは**モデル選択用validation**であって最終holdoutではない。採用判断には、モデル選択に一度も使わない別の固定holdout、既知回帰局面、量子化後探索、十分な対局数のA/Bが必要である。

---

## 7. 再現コマンド

full label depthは上のclean 100親gateで18に事前固定した。結果を見て都合よく変更しない。

> **2026-07-10追記（この手順は履歴として残す）**：以下はPR3時点の旧CLIであり、現在の
> sealed training手順としては使わない。100親pilotは28局すべての親を含み、後の固定holdout
> 3局にも15親・180候補行が含まれていた。現行手順は全Lane A workの102 parent / 1,392 semantic
> exposure unionを全model roleから除外し、full 3,112-entry teacher契約とpartition manifestを必須にする。特に本節後半の旧
> `train.py` / `eval-sibling.py`コマンドは意図的にfailする。置き換え後のコマンドと限定された
> 「PR4A以降のexact-row seal」は[続編](./blog-shogi-wcsc36-sibling-training-results.md)を参照。
> 現在のHEADではこのraw-path CLI entry pointを削除済みなので、以下はそのまま実行できない。

```bash
readonly LABEL_DEPTH=18

node -r tsx/cjs ml/generate-sibling-teacher.ts \
  --raw ml/data/wcsc36/parents.raw.jsonl \
  --engine-bin ml/bin/yaneuraou \
  --engine-receipt ml/engine-receipts/yaneuraou-9133c527-applem1.json \
  --eval-dir ml/eval/eval \
  --pipeline-revision "$(git rev-parse HEAD)" \
  --depth "$LABEL_DEPTH" --multipv 12 --engines 12 \
  --seed 42 --val-ratio 0.2 --hash-mb 64 \
  --out-train ml/data/wcsc36/siblings.train.jsonl \
  --out-val ml/data/wcsc36/siblings.val.jsonl \
  --manifest ml/data/wcsc36/sibling-manifest.json \
  --work ml/data/wcsc36/sibling-progress.jsonl
```

この旧コマンドは当時、clean worktreeでのみ動き、ignoredな`ml/data/`へ出力して同じ引数でresumeした。現在のHEADではtombstoneがnonzeroで停止する。

---

## 8. 上書きせず、stable / warm-start / scratchを比較する

> **Superseded**：この節のコマンドは設計経緯の記録である。現行trainerへbase
> `siblings.train/val.jsonl`を直接渡してはいけない。続編のpolicy-exposure receipt、filtered
> model-training、model-selection、partition provenanceを使う。

本番`public/shogi-nnue-weights.bin`へ直接書かない。

| 系列 | 初期値 | 役割 |
|---|---|---|
| stable | 変更しない`runOp1` | 本番基準と即時rollback先 |
| warm-start | `runOp1` checkpoint | 既存value知識を低学習率で適応 |
| scratch | 乱数初期化 | stable由来の癖を引き継がない対照 |

warm-startはmodel weightだけをstrictに読み、optimizerとschedulerは新しくする。旧teacherデータはtrain-only replayとして忘却防止に使えるが、WCSC36 validationへ混ぜない。epoch 0でinitializer自体も評価し、fine-tuningが全epochで悪化した場合は「学習済みだから」という理由で採用しない。

```bash
ml/venv/bin/python ml/train.py \
  --data ml/data/wcsc36/siblings.train.jsonl \
  --val-data ml/data/wcsc36/siblings.val.jsonl \
  --sibling-manifest ml/data/wcsc36/sibling-manifest.json \
  --loss sibling-ranking --features board \
  --init-ckpt /absolute/path/to/runOp1/best.pt --allow-legacy-init \
  --replay-data /absolute/path/to/runOp1-train.jsonl \
  --replay-limit 500000 --replay-ratio 1.0 \
  --lr 1e-4 --epochs 20 --seed 42 \
  --out ml/runs/wcsc36-warm-seed42

ml/venv/bin/python ml/eval-sibling.py \
  --data ml/data/wcsc36/siblings.val.jsonl \
  --sibling-manifest ml/data/wcsc36/sibling-manifest.json \
  --checkpoint stable=/absolute/path/to/runOp1/best.pt \
  --checkpoint warm=ml/runs/wcsc36-warm-seed42/best-sibling.pt \
  --json-out ml/data/wcsc36/sibling-eval.json
```

scratchは`--init-ckpt`と`--allow-legacy-init`を外し、別の`--out`へ書く。sibling manifest由来を名乗るcheckpointが異なるtrain/val bytes、旧policy、別pipelineを持てば、評価比較はfail-closedする。manifest以前のstable `runOp1`だけは比較基準として読み込めるが、report上で`legacy_unverified`と明示し、新しいcheckpointと同等の学習provenanceがあるとは扱わない。

---

## 9. 何を最適化し、何を合格ゲートにするか

損失は子局面valueのsigmoid MSE、同じ親内だけのpairwise ranking、同じ親内のlistwise policyを組み合わせる。`val_sibling_pair_acc`と`val_sibling_top1`は有用だが、モデル選択用validation上の指標であり棋力そのものではない。

| ゲート | 合格の考え方 |
|---|---|
| provenance | source、archive、engine receipt、eval、pipeline revision、manifestが完全 |
| data integrity | 全手合法、符号整合、各親2候補以上、重複・game/position漏洩なし |
| model-selection validation | 同じsplitでstable/warm/scratch、float/int16を比較し、探索した設定数も記録 |
| untouched holdout | model/epoch/hyperparameter選択に未使用の別データでvalueと兄弟順位を確認 |
| stable retention | 旧holdoutのMAE、符号、決着圏を事前許容幅以上に壊さない |
| known regression | 32手目直前で△8六歩打をstableの良手より下へ置く |
| search / quantization | 固定depthと800/2000/4000ms、export前後で既知悪手を再発させない |
| match play | 本番path・時間で、事前の非劣性幅を十分な局数と区間で判定 |
| live browser | 非定跡局面でpath、score、depth、timer、consoleを同時確認 |

全体平均が改善しても既知回帰が落ちれば採用しない。validation top-1が上がっても、同じvalidationでモデルを選んだあとの数字を「最終holdout」と呼ばない。production昇格は、これらを通った成果物だけを別PRで行う。

---

## 10. Gitへ入れるもの、入れないもの

WCSC36 ZIP/CSA、親JSONL、教師JSONL、engine binary、評価ファイル、checkpoint、export weightは`ml/data/`等のignored領域に置き、commitしない。Gitへ残すのは、取得元URL、原本hash、集計値、生成物hash、engine receipt、実装、テスト、記事である。

この分離はデータを隠すためではない。大きなbinaryをrepositoryへ入れず、出典条件を保ちつつ、同じ公式bytesとclean revisionから再生成できるようにするためである。

---

## 11. 現在の台帳

| 工程 | 状態 | 証拠 / 次の出力 |
|---|---|---|
| WCSC36取得・hash固定 | **確認済み** | 1,421,658 bytes、ZIP SHA-256固定 |
| 決勝28局のCSA parse | **確認済み** | accepted 28、rejected 0 |
| ply 8〜120の親抽出 | **確認済み** | 3,112親、JSONL SHA-256固定 |
| v1〜v3 joint labels | **診断専用・不採用** | searchmoves入力順で順位/cpが変化 |
| v4 independent labels | **診断専用・不採用** | joint順序依存を除けることを確認したが契約未完成 |
| v6 depth 14/16 100親 | **診断専用** | rank-1一致62%、Jaccard 83.013%、node比2.817× |
| v6 depth 16/18 20親 | **pre-pipeline予備診断** | top-1集合overlap 95%、node比2.463×。nが小さい |
| v6 depth 16/18 100親 | **clean-pipeline確認済み** | 全事前gate合格、top-1 overlap 68%、node比2.471×、full depth 18に固定 |
| v6 generator契約 | **実装済み** | independent、mate帯、receipt、clean revision、snapshot、atomic manifest |
| clean revisionでのfull label | **未実施** | manifest、train/val件数・hash、比較reportを保存 |
| warm-start / scratch | **未実施** | epoch 0、curve、checkpoint hash、同一validation比較 |
| untouched holdout / export / 探索回帰 | **未実施** | model選択と最終評価を分離 |
| 本番時間A/B | **未実施** | 局数、点推定、区間、非劣性判定 |
| production昇格 | **未実施** | 全ゲート合格時だけ別PR |

---

## 12. 「今ある評価関数へ上書きするべきか」への答え

答えは**上書きしない**である。強豪棋譜は良い親局面を供給するが、実戦手を絶対の正解にはしない。同じ親の候補を独立した教師探索で比較し、stableを残したままwarm-startとscratchを競わせる。旧データは忘却防止のtrain-only replayへ限定する。

今回いちばん重要だった発見は、新しい重みではなく、旧ラベルの「同条件」が実は候補順に依存していたことだった。そこをごまかして学習量を増やしても、壊れた教師を強く信じるだけになる。

次に報告すべきなのは「学習が終わった」ではない。clean revisionで何親をラベルし、depth間の順位がどこまで安定し、warm-startとscratchがmodel-selection validationと未使用holdoutでどう違い、旧分布と既知回帰をどこまで保ち、量子化後の探索とA/Bを通ったかである。そこまで揃って初めて「強くなったか」を判定できる。
