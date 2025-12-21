# Firebase Storage ガイド

## 概要

このプロジェクトでは Firebase Storage を使用して画像を保存しています。

- **バケット**: `yudai-portfolio.appspot.com`
- **主なフォルダ**: `hobby/` (アニメ、声優、キャラクター、その他の趣味画像)

---

## ダウンロードトークンについて

### 問題

Firebase Storage のファイルには `firebaseStorageDownloadTokens` メタデータが必要です。このトークンがないと：

- Firebase Console でプレビュー/ダウンロードできない
- `firebasestorage.googleapis.com` 形式のURLが生成できない

### 解決策

Admin SDK でアップロードする際は、必ずトークンを含める：

```typescript
import { v4 as uuidv4 } from 'uuid';
import * as admin from 'firebase-admin';

const bucket = admin.storage().bucket();
const token = uuidv4();
const file = bucket.file('hobby/anime/new-image.jpg');

await file.save(imageBuffer, {
  metadata: {
    contentType: 'image/jpeg',
    metadata: {
      firebaseStorageDownloadTokens: token,
    },
  },
});

// 公開アクセスが必要な場合
await file.makePublic();
```

---

## URL形式

| 方法 | URL形式 | 用途 |
|------|---------|------|
| トークンあり | `https://firebasestorage.googleapis.com/v0/b/yudai-portfolio.appspot.com/o/path%2Fto%2Ffile.jpg?alt=media&token=xxx` | Console管理、認証付きアクセス |
| makePublic | `https://storage.googleapis.com/yudai-portfolio.appspot.com/path/to/file.jpg` | 公開アクセス、シンプルなURL |

**推奨**: 両方設定する（トークン + makePublic）ことで、Consoleでの管理と公開アクセスの両方が可能になります。

---

## アップロード方法

### 1. ブラウザから（Firebase Client SDK）

管理パネルなどブラウザからアップロードする場合、トークンは**自動的に生成**されます。

```typescript
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const storage = getStorage();
const storageRef = ref(storage, 'hobby/anime/new-image.jpg');

await uploadBytes(storageRef, file);
const url = await getDownloadURL(storageRef); // トークン付きURL
```

### 2. サーバーから（Firebase Admin SDK）

スクリプトやAPIからアップロードする場合、**手動でトークンを追加**する必要があります。

```typescript
import { v4 as uuidv4 } from 'uuid';
import * as admin from 'firebase-admin';

async function uploadImage(
  filePath: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const bucket = admin.storage().bucket();
  const token = uuidv4();
  const file = bucket.file(filePath);

  await file.save(buffer, {
    metadata: {
      contentType,
      metadata: {
        firebaseStorageDownloadTokens: token,
      },
    },
  });

  await file.makePublic();

  // 公開URLを返す
  return `https://storage.googleapis.com/${bucket.name}/${filePath}`;
}
```

---

## Storage セキュリティルール

現在のルール設定（Firebase Console > Storage > Rules）：

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // hobbyフォルダは公開読み取り可能
    match /hobby/{allPaths=**} {
      allow read: if true;
    }
    // その他は認証必要
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

## トラブルシューティング

### 「Error creating access token」が表示される

**原因**: ファイルに `firebaseStorageDownloadTokens` メタデータがない

**解決**: `scripts/fix-storage-tokens.ts` を実行

```bash
DRY_RUN=false npx tsx scripts/fix-storage-tokens.ts
```

### 画像が表示されない（Next.js）

**原因**: `next.config.ts` に画像ホストが設定されていない

**解決**: `next.config.ts` の `images.remotePatterns` に追加：

```typescript
images: {
  remotePatterns: [
    {
      protocol: 'https',
      hostname: 'firebasestorage.googleapis.com',
    },
    {
      protocol: 'https',
      hostname: 'storage.googleapis.com',
    },
  ],
},
```

---

## 関連スクリプト

| スクリプト | 説明 |
|-----------|------|
| `scripts/fix-storage-tokens.ts` | 既存ファイルにダウンロードトークンを追加 |
| `scripts/fix-image-permissions.ts` | 既存ファイルを公開設定にする |
| `scripts/migrate-images.ts` | 別プロジェクトから画像を移行 |
| `scripts/fix-collection-and-images.ts` | コレクション名と画像パスを修正 |

---

## フォルダ構造

```
hobby/
├── anime/           # アニメ画像
├── character/       # キャラクター画像
├── voice_actor/     # 声優画像
├── covers/          # カテゴリカバー画像
└── items/           # その他のアイテム画像
```
