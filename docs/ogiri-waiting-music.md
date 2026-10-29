# 回答・投票中のBGM

作者 Joth の [Funked Up](https://opengameart.org/content/funked-up) を使用。作者公開ページで [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) を確認しています。作者はループ曲と説明し、bass / Rhodes / guitar / drumset をタグに挙げています。Jackbox の音源は使っていません。

元ファイルは作者ページから公開されている `Funked Up.mp3`。元の iTunSMPB タグにある先頭528サンプルと末尾2372サンプルのエンコーダ余白を除き、2,919,724サンプル / 44,100Hz = 66.206893秒をループします。これは116 BPM・4拍子32小節に一致します。両端5msだけフェードして境界の急な段差を抑え、ゲイン0.72、44.1kHzステレオ、112kbps MP3へ変換した `public/audio/ogiri/waiting-funk.mp3` は927,939バイトです。

再生成例（ffmpeg）:

```sh
ffmpeg -i 'Funked Up.mp3' \
  -af 'atrim=start_sample=528:end_sample=2920252,asetpts=PTS-STARTPTS,volume=0.72,afade=t=in:d=0.005,afade=t=out:st=66.20189342403628:d=0.005' \
  -c:a libmp3lame -b:a 112k -ar 44100 -ac 2 -map_metadata -1 \
  -metadata title='Funked Up (waiting loop)' -metadata artist='Joth' \
  -metadata license='CC0 1.0' waiting-funk.mp3
```

全体の音は更新後も最初はOFFで、「音ON」の操作後にだけ再生可能です。BGMの選択は初期ON。「音設定」の「回答・投票中にBGM」をOFFにするとその端末へ保存され、BGMは読み込みません。ロビー・結果・順位・終了・一時停止・非表示・ミュートでは停止します。回答・投票中の同一ポーリングやターン変更ではループを再開し直しません。

効果音と同じAudioContextのmix入力へ接続し、既存コンプレッサー・リミッター・音量調整を共用します。BGMのゲインはmix入力前0.06。効果音中は20%へ下げ、効果音の終了後250msかけて戻します。BGMの取得・デコードは音を有効にした回答・投票中に一度だけ行い、結果は同じContext内で再利用します。取得失敗は効果音を止めず、音設定に再読み込み操作を表示します。同じポーリングでは自動再試行しません。

音楽素材の選定根拠は作者の説明・ライセンスと波形/ブラウザDSPの計測です。AIが耳で聴いて確認したとはしていません。ループ境界の短い実レンダーと計測値をブラウザテストの添付へ保存し、人が聴ける確認用サンプルも残します。
