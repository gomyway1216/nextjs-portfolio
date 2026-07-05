# ml/ — 将棋AI 蒸留学習パイプライン

やねうら王(NNUE) + 公開評価関数『Háo』をローカルで教師として使い、
自作エンジン(`src/components/game/ShogiImproved/`)向けの小型ニューラル評価関数を
PyTorch で蒸留学習するためのパイプライン。

```
自己対戦(自作エンジン, 低budget+ランダム分岐)
   → SFEN 局面生成 (王手中除外, 手数6〜120, 重複排除)
   → やねうら王 NNUE で depth 8 評価 (USI, 並列プロセス)
   → ml/data/teacher.jsonl (追記式・再開可能)
   → train.py (2282→256→32→1, ClippedReLU, MPS対応)
   → export-weights.py (int16 量子化, 自作エンジン/WASM 向け)
```

**このディレクトリでコミットされるのはコードと README のみ。**
エンジンバイナリ・評価関数・データセット・venv・チェックポイントは `.gitignore` 済み。

---

## 1. セットアップ

### 1-1. やねうら王のビルド (macOS Apple Silicon)

```sh
cd ml
git clone --depth 1 https://github.com/yaneurao/YaneuraOu.git engine/YaneuraOu
cd engine/YaneuraOu/source
make -j normal YANEURAOU_EDITION=YANEURAOU_ENGINE_NNUE TARGET_CPU=APPLEM1 COMPILER=clang++
cd ../../..
mkdir -p bin && cp engine/YaneuraOu/source/YaneuraOu-by-gcc bin/yaneuraou
```

- 標準 NNUE (halfkp_256x2-32-32) エディション。Intel Mac は `TARGET_CPU=APPLEAVX2` / `APPLESSE42`。
- 注意: macOS はファイルシステムが大文字小文字を区別しないため、
  クローン先 `engine/YaneuraOu` と同名になる `engine/yaneuraou` にバイナリを置かないこと (`bin/` を使う)。

### 1-2. 評価関数『Háo』の配置

```sh
cd ml
curl -sL -o eval/hao.7z \
  https://github.com/nodchip/tanuki-/releases/download/tanuki-.halfkp_256x2-32-32.2023-05-08/tanuki-.halfkp_256x2-32-32.2023-05-08.7z
cd eval && bsdtar -xf hao.7z && cd ..   # → ml/eval/eval/nn.bin (61MB)
```

- **出典**: tanuki- チーム (nodchip) 公式 GitHub リリース
  <https://github.com/nodchip/tanuki-/releases/tag/tanuki-.halfkp_256x2-32-32.2023-05-08>
- **内容**: 標準 NNUE (halfkp_256x2-32-32) 評価関数『Háo』。WCSC33 版 tanuki-『Lí』と同程度の棋力とされる。
- **ライセンス**: アーカイブに `gpl-3.0.txt` が同梱されており **GPL-3.0**
  (配布リポジトリ nodchip/tanuki- 自体も GPL-3.0、やねうら王のフォーク)。
  ローカルでの利用・改変は自由。本パイプラインは評価値(数値ラベル)を教師として利用するのみで、
  評価関数バイナリ自体は再配布しない (gitignore 済み)。
- 使用時は `FV_SCALE=20` を指定 (配布元推奨。generate-teacher.ts が自動設定)。
- SHA-256 (`eval/eval/nn.bin`): `1141d275bceec911156801f27303dc9ff5beb24f4f59144cc069306c59e80782`

疎通確認:

```sh
cd ml
printf 'usi\nsetoption name EvalDir value %s/eval/eval\nsetoption name FV_SCALE value 20\nsetoption name USI_OwnBook value false\nisready\nposition startpos\ngo depth 8\n' "$(pwd)" \
  | ./bin/yaneuraou   # readyok と bestmove が出れば OK
```

### 1-3. Python 環境 (PyTorch)

```sh
cd ml
python3 -m venv venv
./venv/bin/pip install torch     # macOS arm64 は MPS 対応 wheel が入る
```

依存は PyTorch のみ (numpy 等は不要)。

---

## 2. 教師データ生成

```sh
# リポジトリルートで実行 (npx tsx は不可、node -r tsx/cjs を使う)
node -r tsx/cjs ml/generate-teacher.ts --target 10000                 # パイプライン検証用
node -r tsx/cjs ml/generate-teacher.ts --target 100000 --engines 8    # 本番 (バックグラウンド推奨)
```

- 出力: `ml/data/teacher.jsonl` (1行1局面 `{sfen, cp, ply, bestmove, depth}`)
  - `cp` は **手番側視点** の centipawn。詰みは `±(30000 - 手数)` に写像 (`mate` フィールド付き)。
- **再開可能**: 追記式。中断しても同じコマンドを再実行すれば、既存局面を重複排除しつつ
  `--target` に達するまで続きから生成する。
- 局面生成: 自作エンジン V20 (maxDepth 4 / 25ms) の自己対戦 + 確率 0.2 のランダム分岐。
  手数 6〜120、手番側が王手されている局面は除外、SFEN(手数除く) で重複排除。
- 主なオプション: `--target N` `--engines N` `--depth 8` `--epsilon 0.2`
  `--movetime 25` `--chunk 2000` `--out path`
- 実測 throughput (M4 Pro): 生成 ≈ 20 局面/s (ボトルネック)、
  ラベリング ≈ 1,300〜1,400 局面/s (depth 8, エンジン 4〜6 並列)。
  10万局面 ≈ 約 90 分。

---

## 3. 学習

```sh
ml/venv/bin/python ml/train.py --data ml/data/teacher.jsonl --out ml/runs/run1 --epochs 20
```

- 入力特徴 (2282 次元, **手番側視点に正規化**。後手番は盤を 180 度回転して色を入替):
  - 盤面: 駒種 14 × 自分/相手 = 28 プレーン × 81 マス = 2268 (one-hot)
  - 持ち駒: 自分 7 種 + 相手 7 種 = 14 (枚数)
- ネットワーク: 全結合 2282 → 256 → 32 → 1、活性化 ClippedReLU (`clamp(x,0,1)`)。
  第1層は EmbeddingBag で NNUE の accumulator と同型 (差分更新・WASM 実装がしやすい)。
- ターゲット: `y = sigmoid(cp / K)` (K=600, cp は ±3000 にクランプ)。損失は MSE。
  推論時は `cp ≈ 出力ロジット × K`。
- MPS (Apple GPU) / CPU 自動選択 (`--device` で強制可)。
- 出力: `runs/<name>/best.pt`, `last.pt`, 学習曲線 `curve.csv`
  (epoch, train_loss, val_loss, val_mae_cp, lr, sec)。
- 主なオプション: `--epochs` `--batch 256` `--lr 1e-3` `--k 600` `--val-ratio 0.1` `--limit N`
- **特徴量 (`--features`)**: `board` (既定, 2282次元) / `kp` (縮約King-Piece: 自玉位置を
  6バケットに量子化し盤面/持ち駒テーブルをバケット毎に複製, 13692次元) /
  `kp-factor` (同特徴の分解学習: `w1[b][f] = w_shared[f] + w_delta[b][f]`, 本家NNUEの
  factorizer 定石。エクスポート時に合成されるので推論形式は `kp` と同一)。
  バケット定義は `kp_bucket()` (WASM/TS 側と厳密一致必須)。
  第3サイクルの結果 (教師1Mでは base を上回れず、本番不採用) は
  `ml/data/training-report-3.md` 参照。

### ホールドアウト比較 (eval-holdout.py)

複数チェックポイントを共通ホールドアウトで比較する (MAE / median / pair_acc / |cp|バケット別 MAE):

```sh
ml/venv/bin/python ml/eval-holdout.py --data ml/data/holdout-1m-4k.jsonl \
    --ckpt base=ml/runs/run1m-base/best.pt kp6=ml/runs/run1m-kpf/best.pt
```

---

## 4. 重みのエクスポート (自作エンジン用)

```sh
ml/venv/bin/python ml/export-weights.py --ckpt ml/runs/run1/best.pt --verify ml/data/teacher.jsonl
ml/venv/bin/python ml/export-weights.py --ckpt ml/runs/run1/best.pt --json   # JSON 版も欲しい場合
```

- `weights.bin` + `weights.meta.json` (int16 フラット配列, NNUE 風固定小数点) を出力。
- 量子化スキームと `weights.bin` のバイトレイアウトは `export-weights.py` の docstring 参照。
  整数演算のみ (int16 重み・int32 アキュムレータ・`>>6` シフト) で推論でき、
  `cp = out_q * K / (127*64)`。`--verify` で float モデルとの誤差 (cp) を確認できる。

### WASM エンジン側との照合 (dump-reference.py)

WASM エンジン (`wasm-spike/assembly/index.ts` の `nnueEvaluate()`) が実重みで
int_forward とビット一致するかを検証する手順:

```sh
# torch 環境側 (このリポジトリ + venv)
ml/venv/bin/python ml/dump-reference.py --ckpt ml/runs/run1/best.pt \
    --data ml/data/teacher.jsonl --out ml/runs/run1/reference.json --n 200
ml/venv/bin/python ml/export-weights.py --ckpt ml/runs/run1/best.pt

# torch 不要 (WASM / TS 参照実装 / torch int16 シミュの 3-way 照合)
node -r tsx/cjs wasm-spike/nnue-verify-reference.ts \
    ml/runs/run1/weights.bin ml/runs/run1/reference.json
```

---

## 5. 今後の拡張

- **局面数を 100 万へ**: 生成がボトルネック (~20 局面/s) なので、
  自己対戦を worker_threads で並列化するか、`--movetime` を下げる /
  やねうら王自身の自己対戦 (`gensfen` 系コマンド) への置換で 10 倍以上にできる。
  ラベリング側は depth 8 で 1,300 局面/s 出ており余裕がある。
- **教師の質**: `--depth 10〜12` に上げる、multipv で分布を取る、
  勝敗結果 (WDL) とブレンドする (`lambda * eval + (1-lambda) * result`)。
- **WASM 推論への接続**: 第1層は active feature の加算だけなので、
  自作エンジンの `KyokumenImproved.move/back` に差分更新 (accumulator) を実装すれば
  1 局面あたり 256 次元の加減算 + 小さい行列積 2 回で評価できる。
  `weights.bin` をそのまま `Int16Array`/`Int32Array` として `fetch` → WASM/TS 側で読み込む。
  特徴 index の定義 (`plane*81 + (suji-1)*9 + (dan-1)`, 手番側視点) は train.py と一致させること。
- **強化学習ループ**: 蒸留済み NN を自作エンジンに載せ、その自己対戦で再生成 → 再学習 (iterated distillation)。

## 再開コマンド早見

```sh
# 10万局面生成の継続 (何度でも可)
node -r tsx/cjs ml/generate-teacher.ts --target 100000 --engines 8

# 学習 (データが増えたら再実行)
ml/venv/bin/python ml/train.py --data ml/data/teacher.jsonl --out ml/runs/run2 --epochs 30
```
