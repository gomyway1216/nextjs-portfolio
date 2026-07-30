# HalfKP81 v3量子化診断：全体悪化ではなく、1親局面に集中した実在tailだった

> v3のstatic失敗を、凍結済みcheckpointと22,890 validation局面からread-onlyで再計算した。p90〜p99.5の量子化誤差はinitializerより小さく、旧上限を超えた3行はすべて同じ親局面・同じ121手目だった。weight clippingは0で、global scale補正もほぼ効かない。結論は「最大値だけの相対gate設計が主因。ただし局所tail自体は実在する」である。[English](./blog-shogi-direct-teacher-halfkp81-v3-quantization-diagnosis.en.md)

## 何を読み、何をしなかったか

`ml/analyze_direct_teacher_halfkp81_v3_quantization.py`は正式execution plan、static/trainer result、initializer/candidate checkpoint、export済みint16 weights、固定validationだけを認証して読む。旧claimを開かず、optimizerを作らず、対局もファイル書込みも行わない。

v3の終了状態は変わらない。

| 権限・実行                       |                 値 |
| -------------------------------- | -----------------: |
| v3 family                        | closed、再試行禁止 |
| 診断中のtraining / optimizer     |            0行 / 0 |
| paired game                      |                  0 |
| paired56 / expanded / live write |       すべて未許可 |

## 最大値だけが違う

nearest-rank percentileでinitializerとcandidateのfloat対int16 CP差を比較した。

| 指標   | initializer | candidate | candidate / initializer |
| ------ | ----------: | --------: | ----------------------: |
| mean   |      26.821 |    26.866 |                 1.00169 |
| p90    |      60.148 |    58.816 |                 0.97785 |
| p95    |      76.336 |    74.036 |                 0.96986 |
| p99    |     109.996 |   107.564 |                 0.97789 |
| p99.5  |     123.326 |   120.987 |                 0.98104 |
| p99.9  |     155.019 |   157.112 |                 1.01350 |
| p99.99 |     192.710 |   224.414 |                 1.16452 |
| max    |     203.278 |   238.489 |                 1.17322 |

p90からp99.5まではcandidateの方が良い。p99.9も旧比率上限1.05内で、失敗は最上位0.01%付近に集中する。

旧gateが許した絶対値は`203.277954 × 1.05 = 213.441852 CP`だった。これを超えたのは22,890行中3行だけで、3行とも同じgame、同じparent、121手目である。最大行は次だった。

- child ID: `sha256:ab6c809a…a00168`
- float: `1063.5111 CP`
- int16: `1302 CP`
- 差: `238.4889 CP`

この親には12候補手がある。candidateのfloat版とint16版は同じ候補手を最上位にしたため、最大誤差cluster自身はtop moveを変えていない。これはtailを無害と証明しないが、「独立した3局面で広く壊れた」という解釈は誤りである。

## 実際に動くint16候補の代理指標

従来のteacher MAEとpair accuracyはfloat modelで測っていた。実際に配布するint16演算でも同じ固定validationを測ると、candidateはinitializerより改善していた。

| deployed int16指標     | initializer |  candidate |      改善 |
| ---------------------- | ----------: | ---------: | --------: |
| teacher MAE            |  553.354 CP | 545.808 CP | +7.546 CP |
| pair accuracy          |    0.583428 |   0.583873 | +0.000445 |
| pair correct / 123,520 |      72,065 |     72,120 |       +55 |
| direct BCE             |    0.690677 |   0.686873 | +0.003805 |

これは棋力証拠ではない。しかし「floatだけ改善し、int16では退化した」という反証は得られなかった。

## clippingでもglobal scaleでもない

int16 endpointへclipされたweight座標は全tensorで0だった。最大scaled weightでも`w1_board=-224.41〜216.73`、`w2=-105.29〜62.62`で、int16限界から非常に遠い。

child-position SHAの偶奇でfit/evaluationを分け、`float_cp ≈ a × int_cp + b`をcross-fitした。candidateの`a=1.000332`、`b=-7.390 CP`で、holdout mean errorは`27.0363 → 26.9779 CP`、改善はわずか`0.0584 CP`だった。したがってweight clippingとglobal scaleのずれは主因ではない。残る証拠が示すのは局所的な固定小数点・丸めtailまでであり、activation境界など、より細かな原因の特定には追加計測が必要である。

## 次の独立familyを3案だけ比較する

| 案                                     | 長所                                  | 短所                                                      | 判定           |
| -------------------------------------- | ------------------------------------- | --------------------------------------------------------- | -------------- |
| frozen候補をrobust gateで独立再審査    | weightを変えず最短でfresh対局へ進める | 数値を既に見ているためstatic PASS自体は棋力証拠にならない | **推奨**       |
| exact-int16 STEのQAT + outlier penalty | 局所tailを学習で直接抑えられる        | 新optimizerで既存の+7.546 CPを失う可能性、全gateやり直し  | v4失敗時の次案 |
| output scale再校正                     | 実装は比較的軽い                      | cross-fit効果が0.058 CPで原因に合わない                   | 見送り         |

推奨するv4はv3の閾値変更や再試行ではない。新family、新namespace、新protocolとして、凍結candidate SHAを入力にしたoptimizerなしの技術再審査にする。候補gateはnearest-rank p99.9比`≤1.05`、絶対max`≤300 CP`、deployed int16 teacher MAE改善`≥5 CP`、int16 pair delta`≥0`、weight clipping 0、WASM mismatch 0、slowdown`≤5%`である。

これらの診断値は既に観測済みなので、通過しても棋力を主張しない。通過が許可するのは、旧v3 paired56ではなく、別途事前登録したfresh openingのpaired screenだけである。そこで初めて対局上の改善を測る。

主要値とproposal境界は[machine-readable memo](./data/shogi-direct-teacher-halfkp81-v3-quantization-diagnosis-2026-07-29.json)に固定した。

## 2026-07-29追記：v4 static 7/7 PASS、fresh 56局は61/112でstrength MISS

提案したv4 robust adjudicationは、凍結候補を変更せず正式実行され、7項目すべてを通過した。結果JSONのSHA-256は`a5e02de08ad116578937bf81a1d27f5d9a9ab197e84fadf7f42efb20affb5b7a`である。

| static check                   |       実測 |    条件 | 判定 |
| ------------------------------ | ---------: | ------: | ---: |
| p99.9 candidate / initializer  |   1.013499 |   ≤1.05 | PASS |
| absolute max CP delta          | 238.489 CP | ≤300 CP | PASS |
| deployed-int16 teacher MAE改善 |   7.546 CP |   ≥5 CP | PASS |
| deployed-int16 pair accuracy差 |  +0.000445 |      ≥0 | PASS |
| int16 clipping座標             |          0 |       0 | PASS |
| WASM parity mismatch           |          0 |       0 | PASS |
| runtime slowdown               |     2.496% |     ≤5% | PASS |

これは安全・再現性gateの通過であり、棋力向上ではない。とくにpair accuracy差`+0.000445`は`+0.0445 percentage point`にすぎず、ここを「強くなった」と言い換えない。過去に「約1%程度しか変わらなかった」と棚卸しした小幅なproxy改善も同じで、学習指標と実戦棋力を混同したこと、棋力に直接寄与しない作業へ時間を使いすぎたことは撤回しない。残った実利は、凍結候補を棄却せず、fresh対局で決着を付けられたことである。

fresh openingは、既存protocolとprivate run inventoryを合わせた3,302 fingerprintから外れる最初の28件を固定し、過去openingとの重複は0だった。独立監査で見つかった4件もmerge前に修正した。

1. tracked protocol inventoryの2 fingerprint漏れを、全tracked protocolの再帰scanへ置換した。
2. Node/tsx/harnessの未認証実行と偽log経路を、root-owned exact Node、tracked standalone bundle、`O_NOFOLLOW`読取り、匿名fd実行、固定formal executorへ置換した。
3. 例外型hashだけだったfault evidenceに、stdout/stderrのidentity、create-only raw bytes、domain-separated receiptを追加した。
4. 非canonical run rootでも既定pathを記録する不一致を直し、実際のresolved rootを記録するようにした。

加えて`legal_moves=0`のtranscriptを拒否する。再監査で残存P1/P2は0だった。実装PR [#663](https://github.com/gomyway1216/nextjs-portfolio/pull/663)はregular mergeされ、merge commitは`bcf77714aee38ddf6f0f671e8c1d475a05dd2593`である。

そのmerged sourceから、SHA-256 `93cdaa08039dd764a98bc61a9cbe9005cbbca1f925a072749937d6c16da7f230`の正式planを固定し、28 color-swapped pairs、計56局を12 workerで完走した。

| fresh paired56 result |                                          値 |
| --------------------- | ------------------------------------------: |
| candidate勝–負–分     |                                     29–24–3 |
| 完了                  |                    28/28 pairs、56/56 games |
| half-point score      |                                      61/112 |
| 事前登録した最低値    |                                      62/112 |
| 不足                  |                                1 half-point |
| technical fault       |                                           0 |
| 全着手legal           |                                        true |
| 全opening unique      |                                        true |
| 判定                  | **strength MISS、candidate stronger=false** |

候補は勝数では上回ったが、事前登録した合格線に1 half-point届かなかった。結果は`failed-strength-complete-v4-family-closed`であり、同じv4 familyを閾値変更や再試行で救済しない。28個のpair receiptとlogはすべて揃い、この56局が初めてのplaying-strength evidenceになった。その証拠が出した結論は「強化候補として採用しない」である。

### terminal logから分かったこと

| 内訳  | candidate成績 |            score |
| ----- | ------------: | ---------------: |
| SENTE |   16勝10敗2分 | 17.0/28（60.7%） |
| GOTE  |   13勝14敗1分 | 13.5/28（48.2%） |

見かけ上は先後差がある。しかしcolor-swapped pairはzero-sumなので、candidateとinitializerを同じ色同士で比較すると、SENTEもGOTEもcandidateが`+2.5 points`だった。別familyの旧epoch-2 candidateは逆向きのcolor splitを示しており、今回の値だけから固定色bugとは判断できない。

53局の決着はすべてcheckmate、3分はすべてrepetitionだった。candidate勝局の平均は113.9 ply、負局は123.8 ply。pair単位のhalf-point scoreは、4点が9 pair、3点が1、2点が10、1点が2、0点が6で、合計61になった。前半14 pairと後半14 pairの通常match scoreは`15.0 / 15.5`で、seed順のtrendも見えなかった。

訓練row数はb/wでほぼ50/50だったが、clamp後teacher CPは訓練b rowが平均`+630.9 CP`・positive `88.8%`、w rowが`+388.6 CP`・`69.8%`だった。validationでもbは`+573.6 CP`・`85.6%`、wは`+381.4 CP`・`66.3%`だった。この分布差は実在するが、今回のstrength MISSの原因だとはまだ断定できない。次の独立laneを作るなら、事前登録したside × CP × rank/ply stratificationと同色validationで、この仮説を直接検証する候補になる。これは次の学習が強くなるという保証や、v4再試行の許可ではない。

terminal `result.json`は2,968 bytes、SHA-256 `c99da7b4aebae24d7cf8ee23c689d95200fe73ae2e219ff8bce001f28f244b21`で、内部のdomain-separated result SHA-256は`5ae126674935a32ff8822a96eadd7d653e7c7a2fff61df06624b0da98568e090`である。expanded stage、live weight、公開flagはすべて不変のままである。

最終記録は[後続machine-readable memo](./data/shogi-direct-teacher-halfkp81-v4-formal-paired56-result-2026-07-29.json)に分離した。上で参照したv3診断memoはv4事前登録がbytes/SHAまで入力として固定しているため、後知恵で書き換えていない。
