# Learning Library: a usable daily entry point

The owner starts at `/study/learning`. The default **Today** view offers one article, one optional review, five domain shelves, and the three most recently saved or updated learnings. This is a read-only view of existing records, not an AI recommender or an automatic importer.

## What to do

- **Read:** open the newest unread article among the latest 20. If all 20 are marked read, revisit the latest or browse the article library. Read history is not evidence of understanding.
- **Recall:** an item whose user-selected review date is due appears without its answer. Reveal it, then optionally give a real self-assessment. No due items is different from a failed request.
- **Browse:** Engineering, English, Finance, Society, and Other / ungrouped link to the corresponding shelf. Existing content, diagrams and sources stay intact.
- **Ask / practice:** open a learning and choose **Learn through conversation**. Choose explanation or one-question-at-a-time practice, add an optional question, inspect and copy the prompt into Codex or Claude. The website does not send it or invoke a paid AI API. The prompt includes the original content, diagrams, sources, item ID and revision; a useful follow-up can be saved with `relatedIds` through Learning MCP.
- **Verify a save:** expand **Verify saved record** for the real ID, revision, stored update timestamp and private visibility. Refresh Today after saving through another client.
- **From an article:** below the article feedback, choose a section to preserve or discuss. The original section and its source link accompany the prompt. This is visible in the main reading flow on mobile, not only in the sidebar.

## Data flow

```text
Owner-authenticated Learning Library
  ├─ POST /api/study/library, search → recent saves / optional due review
  ├─ GET /api/study/articles        → latest 20 article summaries
  └─ GET /api/study/articles/read-history → authenticated owner's read IDs
                     ↓
            Today / domain shelves
                     ↓ owner opens a learning
        original explanation + diagram + sources
                     ↓ owner deliberately copies prompt
                Codex / Claude conversation
                     ↓ owner asks to keep a useful follow-up
       search_learning → save_learning (private, relatedIds)
                     ↓ refresh website
                 updated bookshelf
```

All requests use the current owner's Firebase authentication and `no-store`. The whole private component tree is remounted on account changes and removed on sign-out. Stale asynchronous responses are ignored after unmount. Partial request failures do not fabricate zero counts or unread status. Loading, opening, copying, and choosing a domain do not write learning state.

## Article quality and what remains outside this change

The existing daily article workflow and feedback API are retained, not silently replaced. The revised September 8 search article connects a three-document example to inverted indexes, PostgreSQL types / GIN, SQL, PDF ingestion, and a search API. That is evidence of a better-developed example, not proof that automated topic selection has become reliably useful.

This change adds **no new article-generation model, scheduler, autonomous syllabus, weakness diagnosis, notification service, PDF importer, or all-conversation capture**. Selection on Today is transparently recency plus read history. One-question-at-a-time practice runs in the user's chosen AI client, not inside this website. Topic quality must still be judged against actual owner feedback; absent records do not imply missing knowledge.

## Validation

Unit checks cover selection from real read history, unknown / failed states, partial failure isolation, read-only request actions, hidden review answers, cross-domain navigation, prompt provenance, original diagrams, and no implicit mastery. Existing owner-gate, article, feedback, and learning-route tests remain in place. No production learning or feedback was created solely to test this UI.
