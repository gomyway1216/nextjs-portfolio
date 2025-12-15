# AI Learning Path Generator - 機能提案書

AIに目標を伝えるだけで、自動的に学習アイテムを生成する機能

## 概要

### 問題点

現在のLearning Hubでは:
- ユーザーが学習内容を手動で入力する必要がある
- 何を学ぶべきかはユーザー自身が決める必要がある
- キャリア目標から逆算した学習計画が立てにくい

### 解決策

**AI Learning Path Generator** - AIに質問するだけで、自動的に:
1. 学習ロードマップを生成
2. 具体的な学習アイテムを作成
3. 関連するArticleを推薦
4. フラッシュカードと辞書用語を事前生成

---

## ユースケース

### 例1: キャリア目標

**ユーザーの質問:**
```
「Senior Software Engineerになるために何を学ぶべきか？」
```

**AIの応答と自動生成:**

```yaml
Learning Path: Senior Software Engineer
期間目安: 6-12ヶ月
フェーズ数: 4

Phase 1: 技術基盤の強化 (1-2ヶ月)
  - システム設計の基礎
  - デザインパターン
  - コードレビューのベストプラクティス
  - テスト戦略 (Unit, Integration, E2E)

Phase 2: アーキテクチャスキル (2-3ヶ月)
  - Microservices アーキテクチャ
  - API設計 (REST, GraphQL)
  - データベース設計と最適化
  - キャッシュ戦略

Phase 3: リーダーシップスキル (1-2ヶ月)
  - 技術的意思決定
  - ジュニアエンジニアのメンタリング
  - 技術ドキュメントの作成
  - プロジェクト見積もり

Phase 4: 影響力の拡大 (継続)
  - チーム横断的な改善提案
  - 技術負債の管理
  - ステークホルダーとのコミュニケーション
```

**自動生成されるアイテム:**

| 種類 | 数 | 例 |
|------|---|---|
| Learning Entries | 15+ | 「システム設計の基礎」「Microservicesパターン」 |
| Flashcards | 100+ | 「CAP定理とは？」「SOLIDの'S'は何の略？」 |
| Dictionary Terms | 50+ | 「Idempotency」「Circuit Breaker」 |
| Recommended Articles | 10+ | Study Sectionから関連記事をリンク |

### 例2: 特定スキル習得

**ユーザーの質問:**
```
「Kubernetesを本番環境で使えるレベルまで学びたい」
```

**自動生成される学習パス:**

```yaml
Learning Path: Kubernetes Production Ready
期間目安: 2-3ヶ月

Topics:
  1. Kubernetesの基本概念
     - Pod, Deployment, Service
     - ConfigMap, Secret
     - Namespace

  2. ネットワーキング
     - Service types (ClusterIP, NodePort, LoadBalancer)
     - Ingress
     - Network Policies

  3. ストレージ
     - PersistentVolume / PersistentVolumeClaim
     - StorageClass

  4. セキュリティ
     - RBAC
     - Pod Security Policies
     - Secrets管理

  5. 運用
     - Helm
     - モニタリング (Prometheus/Grafana)
     - ログ集約
     - オートスケーリング
```

### 例3: 資格試験対策

**ユーザーの質問:**
```
「AWS Solutions Architect Professional試験に合格したい」
```

**自動生成される学習パス:**

```yaml
Learning Path: AWS SAP Certification
期間目安: 2-4ヶ月

Domains:
  1. 組織の複雑さに対応する設計 (12.5%)
  2. 新しいソリューションの設計 (31%)
  3. 既存ソリューションの継続的改善 (15%)
  4. ワークロードの移行 (15%)
  5. コストコントロール (12.5%)

自動生成:
  - 各ドメインのLearning Entry
  - サービス別フラッシュカード (200+枚)
  - AWS用語辞書 (100+語)
  - 模擬問題 (Quiz機能)
```

---

## 技術設計

### 新しいAPIエンドポイント

```typescript
// POST /api/study/learning/ai
{
  "action": "generateLearningPath",
  "goal": "Senior Software Engineerになりたい",
  "context": {
    "currentLevel": "Mid-level Engineer",
    "yearsOfExperience": 3,
    "primaryTechStack": ["TypeScript", "React", "Node.js"],
    "availableHoursPerWeek": 10,
    "preferredLearningStyle": "hands-on" | "reading" | "video"
  },
  "options": {
    "generateEntries": true,
    "generateFlashcards": true,
    "generateDictionary": true,
    "linkArticles": true,
    "createGoals": true
  }
}
```

### レスポンス構造

```typescript
interface LearningPathResponse {
  path: {
    id: string;
    title: string;
    description: string;
    estimatedDuration: string;
    phases: LearningPhase[];
  };
  generatedItems: {
    entries: LearningEntry[];
    flashcards: Flashcard[];
    dictionaryTerms: DictionaryTerm[];
    linkedArticles: StudyArticle[];
    goals: LearningGoal[];
  };
  recommendations: {
    books: string[];
    courses: string[];
    youtubeChannels: string[];
    podcasts: string[];
  };
}

interface LearningPhase {
  number: number;
  title: string;
  description: string;
  estimatedDuration: string;
  topics: LearningTopic[];
  milestones: string[];
}

interface LearningTopic {
  title: string;
  description: string;
  importance: 'critical' | 'important' | 'nice-to-have';
  prerequisites: string[];
  resources: Resource[];
}
```

### 新しい型定義

```typescript
// src/types/study.ts に追加

export interface LearningPath {
  id: string;
  userId: string;
  title: string;
  description: string;
  goal: string;
  estimatedDuration: string;
  phases: LearningPhase[];
  status: 'not_started' | 'in_progress' | 'completed';
  progress: number; // 0-100
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LearningPhase {
  id: string;
  pathId: string;
  number: number;
  title: string;
  description: string;
  estimatedDuration: string;
  topics: LearningTopic[];
  milestones: string[];
  status: 'not_started' | 'in_progress' | 'completed';
  progress: number;
  entryIds: string[];
  flashcardDeckIds: string[];
}

export interface LearningTopic {
  id: string;
  phaseId: string;
  title: string;
  description: string;
  importance: 'critical' | 'important' | 'nice-to-have';
  prerequisites: string[];
  status: 'not_started' | 'in_progress' | 'completed';
  entryId?: string;
  flashcardIds: string[];
  dictionaryTermIds: string[];
  linkedArticleIds: string[];
}
```

---

## UI設計

### 新しいページ: Learning Path Generator

**URL:** `/study/learning/paths`

```
┌─────────────────────────────────────────────────────────────┐
│  🎯 Learning Path Generator                                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 💬 学習目標を教えてください                              │ │
│  │                                                         │ │
│  │ ┌─────────────────────────────────────────────────────┐ │ │
│  │ │ Senior Software Engineerになるために何を学ぶべき    │ │ │
│  │ │ か？                                                │ │ │
│  │ └─────────────────────────────────────────────────────┘ │ │
│  │                                                         │ │
│  │ Examples:                                               │ │
│  │ • 「Kubernetesを本番環境で使えるようになりたい」        │ │
│  │ • 「AWS SAP試験に合格したい」                           │ │
│  │ • 「フロントエンドからフルスタックに移行したい」        │ │
│  │                                                         │ │
│  │                              [🔮 学習パスを生成]        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ───────────── Your Learning Paths ──────────────           │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │ 📚 Senior SWE     │  │ 📚 Kubernetes     │                │
│  │ Progress: 35%    │  │ Progress: 10%    │                 │
│  │ Phase 2/4        │  │ Phase 1/5        │                 │
│  │ [Continue →]     │  │ [Continue →]     │                 │
│  └──────────────────┘  └──────────────────┘                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Learning Path Detail View

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back    Senior Software Engineer Path                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Progress: ████████████░░░░░░░░░░░░░░░░░░  35%             │
│  Phase 2 of 4 | Estimated: 3 months remaining               │
│                                                              │
│  ═══════════════════════════════════════════════════════════│
│                                                              │
│  ✅ Phase 1: 技術基盤の強化 (Completed)                     │
│     └── 4 topics, 23 flashcards, 12 terms                   │
│                                                              │
│  🔵 Phase 2: アーキテクチャスキル (In Progress)             │
│  ┌──────────────────────────────────────────────────────────┐
│  │ ✅ Microservices アーキテクチャ                          │
│  │    └─ Entry created, 15 flashcards                      │
│  │                                                          │
│  │ 🔵 API設計 (REST, GraphQL)  ← Current                   │
│  │    └─ Entry in progress, 8/20 flashcards reviewed       │
│  │    └─ 📖 Related Article: "RESTful API Design Guide"    │
│  │                                                          │
│  │ ⭕ データベース設計と最適化                              │
│  │    └─ Not started                                       │
│  │                                                          │
│  │ ⭕ キャッシュ戦略                                        │
│  │    └─ Not started                                       │
│  └──────────────────────────────────────────────────────────┘
│                                                              │
│  ⭕ Phase 3: リーダーシップスキル (Locked)                   │
│                                                              │
│  ⭕ Phase 4: 影響力の拡大 (Locked)                          │
│                                                              │
│  ─────────────────────────────────────────────────────────── │
│  📊 Stats                                                    │
│  • Entries: 6/15 completed                                  │
│  • Flashcards: 45/150 mastered                              │
│  • Dictionary: 23/50 terms added                            │
│  • Study Time: 12h 30m                                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Article連携の強化

### 自動Article推薦

Learning Pathを生成する際、Study Sectionの既存Articleを自動的にリンク:

```typescript
// 内部処理のイメージ
async function linkRelatedArticles(topic: LearningTopic): Promise<StudyArticle[]> {
  // 1. トピックのキーワードを抽出
  const keywords = extractKeywords(topic.title, topic.description);

  // 2. Study Sectionで関連記事を検索
  const articles = await searchArticles({
    keywords,
    categoryId: topic.categoryId,
    limit: 5
  });

  // 3. 関連度でソート
  return sortByRelevance(articles, topic);
}
```

### Article → Learning Path連携

記事を読んだ後、その記事に関連するLearning Pathを提案:

```
┌────────────────────────────────────────────────────┐
│ 📖 Related Learning Paths                          │
│                                                    │
│ This article is part of these learning paths:     │
│                                                    │
│ • Senior Software Engineer Path (Phase 2)         │
│   └─ Click to continue your path                  │
│                                                    │
│ • System Design Fundamentals                      │
│   └─ 60% complete                                 │
│                                                    │
│ [+ Create a new path from this topic]             │
└────────────────────────────────────────────────────┘
```

---

## 自動化フロー

### 完全自動ワークフロー

```
1. ユーザーが目標を入力
   「Senior Software Engineerになりたい」
         ↓
2. AI が学習パスを生成
   - 4フェーズ、15トピック
         ↓
3. 自動的に作成されるもの:
   ┌─────────────────────────────────────┐
   │ • 15 Learning Entries (下書き)      │
   │ • 150 Flashcards (デッキ分類済み)   │
   │ • 50 Dictionary Terms               │
   │ • 10 Article Links                  │
   │ • 4 Phase Goals                     │
   │ • Daily Review Schedule             │
   └─────────────────────────────────────┘
         ↓
4. ユーザーは「Learn」ボタンを押すだけ
         ↓
5. システムが自動的に:
   - 今日学ぶべきコンテンツを表示
   - 復習が必要なカードを提示
   - 進捗を追跡
   - 次のトピックへの移行を提案
```

### Daily Learning Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│  🌅 Today's Learning Plan                     Dec 14, 2024 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Current Path: Senior Software Engineer                      │
│  Current Topic: API設計 (REST, GraphQL)                     │
│                                                              │
│  ═══════════════════════════════════════════════════════════│
│                                                              │
│  📚 Study Session (Est. 25 min)                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 1. Read: "RESTful API Design Best Practices"  [10 min] │ │
│  │ 2. Review: 8 flashcards due                   [5 min]  │ │
│  │ 3. Practice: Design a simple API endpoint     [10 min] │ │
│  │                                                         │ │
│  │                    [▶ Start Session]                    │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  📊 Today's Progress                                        │
│  ├── Study Time: 0/25 min                                   │
│  ├── Flashcards: 0/8 reviewed                               │
│  └── Topics: 0/1 completed                                  │
│                                                              │
│  🔥 Streak: 7 days                                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 実装優先度

### Phase 1: 基本機能 (MVP)

1. **Learning Path AIエンドポイント**
   - 目標からパスを生成
   - フェーズとトピックの構造化

2. **Learning Pathデータモデル**
   - Firestoreコレクション追加
   - 型定義

3. **基本UI**
   - パス生成フォーム
   - パス一覧表示
   - パス詳細表示

### Phase 2: 自動化

1. **コンテンツ自動生成**
   - トピックからEntry自動作成
   - Flashcard自動生成
   - Dictionary自動追加

2. **Article連携**
   - 関連記事の自動リンク
   - 記事からパスへの提案

### Phase 3: インテリジェンス

1. **Daily Learning Plan**
   - 今日のおすすめコンテンツ
   - 適応型スケジューリング

2. **進捗ベースの調整**
   - 習得速度に応じた提案変更
   - 弱点分野の強化提案

3. **統合ダッシュボード**
   - 複数パスの進捗統合
   - 長期的な学習分析

---

## API設計詳細

### 新しいエンドポイント一覧

| エンドポイント | メソッド | 説明 |
|---------------|---------|------|
| `/api/study/learning/paths` | GET | パス一覧取得 |
| `/api/study/learning/paths` | POST | パス作成（AI生成） |
| `/api/study/learning/paths/[id]` | GET | パス詳細取得 |
| `/api/study/learning/paths/[id]` | PUT | パス更新 |
| `/api/study/learning/paths/[id]` | DELETE | パス削除 |
| `/api/study/learning/paths/[id]/topics/[topicId]/start` | POST | トピック学習開始 |
| `/api/study/learning/paths/[id]/topics/[topicId]/complete` | POST | トピック完了 |
| `/api/study/learning/daily` | GET | 今日の学習プラン取得 |

### Cloud Functions追加

```typescript
// functions/src/study/learningPathFunctions.ts

// 学習パス生成
export const generateLearningPath = onCall(async (request) => {
  const { goal, context, options } = request.data;

  // 1. AIでパス構造を生成
  const pathStructure = await generatePathWithAI(goal, context);

  // 2. 必要に応じてコンテンツを自動生成
  if (options.generateEntries) {
    await generateEntriesForPath(pathStructure);
  }
  if (options.generateFlashcards) {
    await generateFlashcardsForPath(pathStructure);
  }
  if (options.linkArticles) {
    await linkArticlesToPath(pathStructure);
  }

  // 3. Firestoreに保存
  const pathId = await saveLearningPath(pathStructure);

  return { success: true, pathId };
});

// 今日の学習プラン生成
export const getDailyLearningPlan = onCall(async (request) => {
  const userId = request.auth?.uid;

  // 1. アクティブなパスを取得
  const activePaths = await getActivePaths(userId);

  // 2. 復習が必要なアイテムを取得
  const dueItems = await getDueReviewItems(userId);

  // 3. 今日のおすすめを生成
  const plan = await generateDailyPlan({
    paths: activePaths,
    dueItems,
    availableTime: 30 // minutes
  });

  return plan;
});
```

---

## まとめ

### 現在 vs 提案機能

| 機能 | 現在 | 提案後 |
|------|------|--------|
| 学習計画作成 | 手動 | AI自動生成 |
| コンテンツ作成 | 手動 | 自動生成（編集可） |
| 復習スケジュール | 個別アイテム | パス全体で最適化 |
| 進捗追跡 | 個別 | ゴール志向で統合 |
| Article連携 | 手動リンク | 自動推薦 |
| 日々の学習 | 自分で決める | システムが提案 |

### 期待される効果

1. **学習の敷居を下げる** - 何を学ぶか考える必要なし
2. **継続率向上** - 明確なゴールと進捗可視化
3. **効率向上** - 最適化された学習順序
4. **総合的な学習体験** - バラバラの機能が一つのフローに

---

*このドキュメントはAI Learning Path Generator機能の提案書です。実装には追加の設計とレビューが必要です。*
