# パーティーゲームの効果音

2026-10-28確認。Jackboxの音声は利用していません。3つの主な発表音は、下記の作者公開ページでCC0を確認した素材を短縮・加工してローカル配信します。アプリから外部の音声サービスには接続しません。

|ゲーム内ファイル|作者・原作・公開ページ|加工|
|---|---|---|
|`public/audio/ogiri/cheer.mp3`|AuraVoice / Nocturnal_Vanguard, [Cheers](https://opengameart.org/content/cheers-0), 元 `cheers_1.ogg`|実際に録音された女性グループの歓声。先頭約115msの無音と末尾を除去、短いフェード、mono 22050Hz、ピーク0.85へ正規化、64kbps MP3。約1.73秒。|
|`public/audio/ogiri/boing.mp3`|Aeva, [BOING!](https://opengameart.org/content/boing), 元 `boing.flac`|作者がArturia MicroFreakで作ったバネ音。冒頭1.1秒へ短縮、末尾フェード、mono 22050Hz、ピーク0.85へ正規化、64kbps MP3。|
|`public/audio/ogiri/score-count.mp3`|LordTomorrow, [Coin Splash](https://opengameart.org/content/coin-splash), 元 `coinsplash_0.ogg`; Luke.RUSTLTD, [10 8bit coin sounds](https://opengameart.org/content/10-8bit-coin-sounds), 元 `coin1.wav`|実際のコイン音を加速・ピッチ変更して0〜640msに7回配置。最後に8bitコイン音を820msから置き、全体を1000msに編集。ピーク0.85へ正規化、mono 22050Hz、64kbps MP3。|

全素材の許諾は [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)。クレジットは必須ではありませんが出典と作者をここに残します。3ファイルの合計は40KB未満です。Kenney公式CC0パックも調査しましたが、今回は上記の3作品を採用しています。

開始・参加・回答送信・投票など他の短音は独自Web Audio合成です。ブラウザで有効にする際に3ファイルを一度読み込み・デコードし、得点発表時はデコード済みバッファを即時再生します。音量100%を32%へ制限していた係数は外し、ユーザー音量をそのまま最終gainに適用。上流でコンプレッサーとピーク上限0.96のリミッターを使います。音量は端末のlocalStorageに保存し、ページ更新後も引き継ぎますが、初期ミュートとクリックによる再生開始は維持します。

音設定は「閉じる」、Escape、パネル外の操作で閉じます。音量スライダーは同じ音設定の操作として扱い、調整中にパネルを勝手に閉じません。

再現用の短縮WAVは `.artifacts/ogiri/audible-sounds/`。`npx tsx scripts/ogiri/render-sounds.ts` でもサンプルを出力できます（MP3のWAV化にffmpegを使用）。端末の物理音量・消音・出力先はアプリから変更しません。
