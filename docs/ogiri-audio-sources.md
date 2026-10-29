# パーティーゲームの効果音

2026-10-28確認。Jackboxの音声は利用していません。回答登場は独自の短いポップ合成音、得点・優勝は下記の作者公開ページでCC0を確認済みの録音素材です。アプリから外部の音声サービスには接続しません。

方向性の参考はJackbox公式の [Party Pack 10の音作り解説](https://www.jackboxgames.com/blog/behind-the-scenes-of-pp10-audio)です。FixyTextのアナログ・ドラムマシン由来の打楽器、ゲームの見た目に合う音色、遊びを邪魔しないバランスという考え方を参考にしました。[Party Starterの公式トレーラー紹介](https://www.jackboxgames.com/blog/watch-the-official-trailer-for-the-jackbox-party-starter)も参照先として記録します。今回の音と短いリズムは独自に作り、Jackboxの音声・旋律の抽出や転用はしていません。

|ゲーム内ファイル|作者・原作・公開ページ|加工|
|---|---|---|
|`public/audio/ogiri/points-cheer.mp3` / `score-count.mp3`（旧URL互換）|Reitanna, [funny yay.wav](https://freesound.org/people/Reitanna/sounds/323703/)。作者説明にYayの発声と明記。使用した公開[HQ MP3プレビュー](https://cdn.freesound.org/previews/323/323703_950925-hq.mp3)|約0.464秒の短い一声。全体を維持し、mono 22050Hzへ変換、変換前PCMピーク0.85へ正規化、冒頭2ms・末尾12msのみフェード、64kbps MP3。音程・速度変更なし。|
|`public/audio/ogiri/cheer.mp3`|zut50, [yay.mp3](https://freesound.org/people/zut50/sounds/162395/)。作者説明は友人グループのYayの歓声。使用した公開[HQ MP3プレビュー](https://cdn.freesound.org/previews/162/162395_2645723-hq.mp3)|作者ページの長さは1.842秒、使用したプレビューのデコード後は約1.830秒。全体を維持し、mono 22050Hzへ変換、変換前PCMピーク0.85へ正規化、冒頭2ms・末尾12msのみフェード、64kbps MP3。音程・速度変更なし。優勝用の別テイク。|

録音素材の許諾は [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)。クレジットは必須ではありませんが出典と作者をここに残します。通常の新しい画面が先読みする2ファイルは合計約20KBです。今回のための録音・音声生成サービスは使わず、作者が公開した既存素材を使用しています。

回答が現れるときのポップは、950Hzから620Hzへ短く下がる100msの独自sine波です。ビブラート・往復するピッチ・低音のバズを使いません。以前のMicroFreak由来のバネ音とコイン連打音は使用を止めました。開いたままの旧画面でも先読みが404にならないよう、旧URL `boing.mp3` はこの独自ポップをmono 22050Hz / 64kbps MP3化した互換ファイル、`score-count.mp3` は新しい得点の声と同じ内容で残します。新しい画面はこの2つの互換URLを読み込みません。旧素材の記録: Aeva / [BOING!](https://opengameart.org/content/boing)、LordTomorrow / [Coin Splash](https://opengameart.org/content/coin-splash)、Luke.RUSTLTD / [10 8bit coin sounds](https://opengameart.org/content/10-8bit-coin-sounds)（いずれも確認時CC0）。

得点の声はゲームの種別に依存せず、発表前後の同じ参加者の得点が実際に増えたときだけ鳴らします。0点・無投票・答えを見せるだけの発表はポップ音にし、同じ状態のpollで声を繰り返しません。優勝時も録音歓声を使い、得点用とは異なるグループのテイクを鳴らします。以前の乾杯の「Cheers」録音は使用していません。音設定の初期試聴は現在の「イェーイ！（得点）」です。

13種類全体の音色も更新し、選択は乾いたクリック、入場は木を叩くような2打と小さなポップ、開始は短いスネアの助走と温かいブラスの和音、送信は紙を払うような打音、投票は低めのtick-tock、順位は短いドラムのリズムと和音にしました。高い音の階段状のアルペジオ、音程を往復するバネや合成の疑似歓声は使いません。これらは独自Web Audio合成で、他作品の音声やメロディーを取り込んでいません。ブラウザで音を有効にする際に2ファイルを一度読み込み・デコードし、得点発表時はデコード済みバッファを描画前に即時再生します。音量100%を32%へ制限していた係数は使わず、ユーザー音量をそのまま最終gainに適用。上流でコンプレッサーとピーク上限0.96のリミッターを使います。音量は端末のlocalStorageに保存し、初期ミュートとクリックによる再生開始を維持します。

音設定は「閉じる」、Escape、パネル外の操作で閉じます。音量スライダーの操作ではパネルを閉じません。ミュート・非表示では再生音を止め、閉じた画面のAudioContextを解放します。

再現用WAVは `npx tsx scripts/ogiri/render-sounds.ts` で `.artifacts/ogiri/sounds/` に出力できます（MP3のWAV化と出力処理にffmpegを使用）。`bounce.wav` がポップ、`count.wav` が得点の実声です。端末の物理音量・消音・出力先はアプリから変更しません。
