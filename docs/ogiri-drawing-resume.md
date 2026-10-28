# 絵の伝言便 — 再起動前チェックポイント

2026-10-28、ユーザーのCodex再起動希望により作業を停止。未完成。次の明示的な再開指示が来たら未完だけ続行する。

## 場所とGit

- Managed worktree: `/Users/yudaiyaguchi/.codex/worktrees/ogiri-drawing-relay/nextjs-portfolio`
- ブランチ: `codex/party-drawing-relay`
- 開始時にorigin main fetch + main worktreeをff済み。baseはPR1077 merge済みmain `418ae493600e8894ced80e921e3d4c57c538d4ad`。
- 未完成のローカルcheckpoint commit。push・PR作成・CI・本番反映はまだしていない。
- parentの70b6はTV12人の修正、別agentはCI browser matrix PR1078を担当していた。再開時に最新main/チャット/PR状況を確認し、変更を捨てず通常mergeで取り込む。squash/rebaseしない。
- 依存はnpm ciでインストール済み。既存70b6から.env.localをローカルコピー済み（ignored、内容を表示/commitしない）。

## 合意した狭いルール

4番目のゲーム「おえかき伝言便」、GameType=`drawing`。3〜12人、GM/TVは参加者から除外。1ゲームは1伝言バッチに固定。3人なら3手(D→言葉→D)、4〜12人なら4手(D→言葉→D→言葉)。全員に別の独自お題を配り、各手で全員同時に次の人の担当を受け取る。各人の描く/推測回数が同じ。全員提出後「これでOK！」まで待つ。時間は目安で、主催者の明示締切も可能。全チェーンをTVで順番に公開後、好きな絵へ一票(自作不可)、一票100点。順位10/7/5/3の既存通算・同室ゲーム切替・90日履歴へ接続。

## 実装したもの

- `drawing-data.ts`: 512×384、整数座標、6色/3太さallowlist、最大64stroke/720点/8000byte、SVG入力拒否。数値から安全なSVGを生成。
- `drawing-game.ts`: 同時伝言の配分、各手の確定/取消、公開→投票→採点、退出/復帰、kick後の絵/票除外、履歴用の公開済みchain投影。
- `drawing-prompts.ts`: 独自短文48お題。
- 描画は圧縮JSON文字列で既存room文書内に保存。最大24枚、room JSON予算400KB。Firestore新コレクション・外部サービスはなし。
- 通常room pollにはvector payloadを含めずIDだけ。`/api/ogiri/[code]/drawings/[id]` GETは現在の担当者だけが前の絵/自分の保存絵を取得でき、公開後のみ誰でも取得可。本人以外/TVは公開前403。immutable idをcomponent cacheに保持。
- `/api/ogiri/[code]/drawing` POSTだけbody上限12KiB。通常操作の4KiBは維持。描画/推測/投票/確定のstale送信防止にdrawingだけturn keyへstageを追加。
- `DrawingCanvas.tsx`: 指/マウス、色/太さ/消しゴム/戻す/クリア、local draft、送信/確定中lock。`DrawingGamePanel`で個人担当、GM/TV待機、chain公開、拡大して投票するdialog。
- `DrawingPicture`は安全なSVG描画と初回のみのasset fetch/cache。
- 既存PartyGamePicker/phase header/Settings/engine/store/partyへ接続。drawingのroundsはserver側1へ固定、UIでもrounds選択を隠す。
- `DrawingHistory`と`drawingHistoryHtml`：公開済み絵・言葉・票・点を保存表示、HTML downloadはescapeした文字と数値SVGのみ、JS/外部取得なし(CSP default-src none)。通常ゲームは既存TXT保存を維持。
- `tests/unit/ogiri/drawing.test.ts` に13ケースを追加。

## 検証状況（正確に）

- 元の大喜利unit 13 files/90 testsは成功 (`/tmp/ogiri-drawing-existing-unit.log`)。
- 新規drawing unitは12/13成功。唯一の失敗はhostの拒否確認にテストhelperがnull assignmentを参照したもの。直接act(drawingGuess)で検証する1行へ修正済みだが、停止指示に従い再実行していない (`/tmp/ogiri-drawing-unit.log`)。
- 初回tscは成功。追加history/UI後のtscもlogは空 (`/tmp/ogiri-drawing-types.log`)。後の統合検証で再確認する。
- 初回対象lintはerror0/warning4、原因はDrawingCanvasのrenderでcleared.currentを読んだこと。useStateへ修正済み。修正後のlintは未実行 (`/tmp/ogiri-drawing-lint.log`)。
- production build、Firestore emulator、browser、CI、本番確認は未実施。
- サーバー/エミュレーターは起動していない。止める必要のある長時間プロセスはない。

## 再開時の未完作業

1. drawing unitと対象lint/tsc、全ogiri unitを再確認。履歴UIの条件分岐は最終順位を常時表示し、絵履歴のときだけ通常のお題回答欄を置換するよう最後に修正したので実画面確認する。
2. `DrawingImage`/draft保存→refresh/別tab/切断復帰、pointermoveの実canvas操作、submit lock、全員OK待ちを実ブラウザで検証。未送信変更は送信前にOKを無効化する。
3. 新規browser specはまだ書いていない。3/4/12人の独立contexts+GM/TVで、全段→全chain公開→自作拒否→投票→一票100点→順位/通算→HTML履歴→再戦/別ゲーム切替、private GETとpollの匿名性、stale turn、通常4KiB/描画12KiB制限を必要十分に検証する。
4. TV1080p/4Kと390px横はみ出しを確認。新DrawingGamePanel.module.cssに6列/4段のgallery上限とチェーン4列を実装したが未視覚確認。3人chainも現在4列設定なので3列へ調整したほうが自然。mobile chainは1列。
5. root側とlocal port衝突を避ける。own temp Playwright configでport3201、Firestore8091等を使う予定だったがまだ作成/起動していない。CIでは通常config3100/8088で可。
6. docs/ogiri-party.mdへ新ルール/保存予算/API/HTML download説明を追記する（まだ未実施）。この再開メモは最終PR前に完成版へ整理または削除。
7. 関連unit/build/browserが通ったらready PR作成→attach→レビュー対応→CI成功まで進め、rootへURL/SHA/結果を報告。mergeはrootが通常mergeする。PRの既存枝へpushする直前にはOPEN確認、merged/closedにはpushしない。

## コマンド

必ずcwdは上記専用worktreeを明示。Node PATHは `/Users/yudaiyaguchi/.nvm/versions/node/v22.13.0/bin:$PATH`。

```sh
npm test -- tests/unit/ogiri/drawing.test.ts
npm test -- tests/unit/ogiri
npx tsc --noEmit --pretty false
npx eslint src/lib/ogiri/{types,engine,party,store,http,history,drawing-data,drawing-game,drawing-prompts}.ts src/components/game/Ogiri/{DrawingCanvas,DrawingGamePanel,DrawingHistory,DrawingPicture,Ogiri,OgiriHistory,PartyGamePanel}.tsx tests/unit/ogiri/drawing.test.ts 'src/app/api/ogiri/[code]/drawing/route.ts' 'src/app/api/ogiri/[code]/drawings/[id]/route.ts'
npm run build
```
