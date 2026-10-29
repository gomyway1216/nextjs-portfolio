# パーティーゲームの効果音

2026-10-28確認。短い操作音と、録音素材を使った数秒の見せ場の音を使い分けます。Jackboxの音声・旋律は利用していません。実行時に外部の音声サービスへ接続しません。

## 参照した設計

[Jackbox公式のParty Pack 10音作り解説](https://www.jackboxgames.com/blog/behind-the-scenes-of-pp10-audio)の打楽器と、見た目に合う楽器・声・foleyの使い分けを参照しました。[Party Pack 4制作記事](https://www.jackboxgames.com/blog/making-the-jackbox-party-pack-4)ではCivic Doodleのkazoo等の演奏楽器とキャラクターの声が紹介されています。

[公式Party Pack 3サウンドトラック](https://jackboxgames.bandcamp.com/album/the-jackbox-party-pack-3-soundtrack)は、Winner Trophyが3秒、3,2,1,Go!が4秒で、Lobby・Write・Vote・Score Revealには別の曲があることを確認しました。今回、操作音は短く保ち、発表には数秒の始まり・盛り上がり・余韻を作る設計へ置き換えています。この尺と役割への適用は本実装の判断です。公式曲のコピーや、モデル自身が音を聴き比べて一致を確認したという主張はしていません。

## 配信する見せ場の音

|ファイル / cue|構成と長さ|
|---|---|
|`start-stinger.mp3` / start|Classic Fanfareの約2.93秒の演奏を自然な終止まで保持。約3.0秒。多数決のように最初から投票へ入るゲームも開始時に鳴らします。|
|`answer-pop.mp3` / bounce|unfaの実際の口のポップに、独自の無音程のair tailと小さい反射を重ねた約0.62秒。声や音程を伸ばしていません。|
|`points-cheer.mp3` / count|0msに口ポップの明瞭なアクセント、実録スネアの助走、約1.0秒にReitannaの短いYay、その後に実際の拍手。全体約2.8秒。表示開始を遅らせず、数字の約1秒の増加が終わる頃に声が来ます。|
|`ranking-stinger.mp3` / ranking|録音されたスティックの助走に、Happy Tubaの約2.92秒のフレーズを終止まで使用し、拍手の尾を重ねる約3.7秒。|
|`cheer.mp3` / cheer|Classic Fanfareの全フレーズ、別テイクのグループYay、短い拍手の録音全体を重ねた約4.8秒。|

全ファイルはゲインを調整してPCMピーク0.85へ正規化し、mono 22050Hz / 64kbps MP3へ変換しています。録音の音程・速度は変更せず、必要な短いフェードを入れています。ファンファーレは途中で旋律を切らず、ドラムと拍手は非旋律の抜粋をフェードしています。通常の先読みは5ファイル、合計約123KBです。

## 素材の作者・許諾・取得元

下記は全て作者の公開ページでCC0 1.0を確認した素材です。CC0はクレジットを必須にしていませんが、出典を残します。Freesoundからは公開HQ MP3プレビューを使用しています。今回のための録音や有料の音声生成サービスは使用していません。

|入力ファイル|作者・公開ページ|使用した配信ファイル|
|---|---|---|
|`unfa-cartoon-pop-clean.mp3`|unfa / [Cartoon Pop (Clean)](https://freesound.org/people/unfa/sounds/245645/) — 作者自身の口による0.171秒のポップ|[HQ MP3](https://cdn.freesound.org/previews/245/245645_1038806-hq.mp3)|
|`snare-roll-2.mp3`|laffik / [Snare Roll 2.wav](https://freesound.org/people/laffik/sounds/659874/) — Mapexスネアの録音|[HQ MP3](https://cdn.freesound.org/previews/659/659874_2305630-hq.mp3)|
|`sticks-drum-roll.mp3`|Mead815 / [drum roll.mp3](https://freesound.org/people/Mead815/sounds/535508/)|[HQ MP3](https://cdn.freesound.org/previews/535/535508_3644547-hq.mp3)|
|`applause-short-burst.mp3`|soundmary / [Aplause - short burst.wav](https://freesound.org/people/soundmary/sounds/117592/)|[HQ MP3](https://cdn.freesound.org/previews/117/117592_1160789-hq.mp3)|
|`well-done.ogg`|qubodup / [Well Done](https://opengameart.org/content/well-done) — hackathonでの拍手の自身の録音。作者は2024-10-05にCC0へ変更と明記|[OGG](https://opengameart.org/sites/default/files/Well%20Done%20CCBY3.ogg)。旧ファイル名のCCBY3は公開ページの更新済み許諾に従います。|
|`classic-fanfare.ogg`|fvcalderan / [Classic Fanfare Lick](https://opengameart.org/content/classic-fanfare-lick) — GarageBand標準楽器を使う作者の演奏で、既製ループではないとの説明|[OGG](https://opengameart.org/sites/default/files/fanfare_3.ogg)|
|`happy-tuba.ogg`|Trex0n / Cal McEachern / [Happy and Sad Tuba Fanfare](https://opengameart.org/content/happy-and-sad-tuba-fanfare)|[OGG](https://opengameart.org/sites/default/files/fanfarehappy_0.ogg)|
|`short-yay.mp3`|Reitanna / [funny yay.wav](https://freesound.org/people/Reitanna/sounds/323703/) — 作者がYayと明記した約0.464秒の一声|[HQ MP3](https://cdn.freesound.org/previews/323/323703_950925-hq.mp3)|
|`crowd-yay.mp3`|zut50 / [yay.mp3](https://freesound.org/people/zut50/sounds/162395/) — 作者が友人グループのYayと明記。使用したプレビューのデコード後は約1.83秒|[HQ MP3](https://cdn.freesound.org/previews/162/162395_2645723-hq.mp3)|

## 操作・試聴・再生

13種類は音設定から試聴できます。選択・送信・投票・秒読みなどの操作音は短い独自合成音です。「投票ジングル」「発表ジングル」「ファンファーレ」は試聴用の補助音で、13種類全てが通常進行で必ず鳴るという意味ではありません。初期の試聴選択は現在の「イェーイ！（得点）」です。

得点の演出はゲーム種別に依存せず、同じ参加者の得点が実際に増えた発表だけで鳴らします。0点・無投票・絵のチェーンを見せるだけの発表は口ポップにし、同じ状態のpollでは繰り返しません。新しいフェーズや一時停止に移ると長い前の演出音を止めます。操作や進行を音の終了待ちにはしません。

旧URL `boing.mp3` と `score-count.mp3` も、現在の口ポップ・得点演出と同じ内容の互換ファイルとして保持します。開いたままの旧画面でも先読みを404にしません。以前のMicroFreakのバネ、コイン連打、乾杯のCheersの録音は使っていません。

最初はミュートで、操作からAudioContextを開始したときに先読みします。音量・ミュート・再開・Escapeや外側クリックで設定を閉じる操作を維持します。最終gainはユーザー音量を使い、上流には既存のコンプレッサーとピーク上限0.96があります。非表示やミュートでは音を止め、画面を閉じるとAudioContextを解放します。BGMはこの変更には含めません。

## 再現

素材を上表の入力ファイル名で `.artifacts/ogiri/audio-sources/` に保存し、`python3 scripts/ogiri/mix-show-sounds.py` で5つの見せ場のファイルを生成できます（ffmpegが必要）。素材とYayが別のディレクトリなら2つのパスを引数に渡せます。素材は実行時には不要で、変換済みMP3をローカル配信します。

`npx tsx scripts/ogiri/render-sounds.ts` は出力処理を含むWAV試聴を生成します。ブラウザの実際のノードで処理したWAVと全cueの長さ・peak・RMSも、変更時に別途検証しています。端末本体の物理音量や出力先は変更しません。
