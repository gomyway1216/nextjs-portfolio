# Learning System Documentation

A comprehensive personal learning tool integrated with the study section for tracking knowledge from multiple sources, reviewing with spaced repetition, and building a personal dictionary.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [User Guide](#user-guide)
- [API Reference](#api-reference)
- [Data Models](#data-models)

## Overview

The Learning System allows you to:
- Capture learning from various sources (books, YouTube, work, courses, etc.)
- Build a personal dictionary/glossary of terms
- Create and review flashcards using spaced repetition (SM-2 algorithm)
- Generate AI-powered flashcards and term extractions
- Track learning progress and mastery levels
- Integrate with existing study articles

## Features

### 1. Multi-Source Learning Entries
Track learning from:
- **Books** - Title, author, ISBN, chapter, page numbers
- **YouTube** - Video URL, title, channel, timestamp
- **Articles/Blogs** - URL, title, author, publication
- **Courses** - Platform (Udemy, Coursera), course name, lesson
- **Podcasts** - Show name, episode title, URL
- **Work** - Project name, task description, team context
- **Conferences** - Event name, speaker, talk title
- **Documentation** - Doc URL, technology
- **Conversations** - Notes from discussions

### 2. Spaced Repetition Review
- SM-2 algorithm for optimal review scheduling
- Four response levels: Again, Hard, Good, Easy
- Automatic interval calculation based on performance
- Mastery level tracking (0-5)
- Combined review of flashcards and learning entries

### 3. Flashcard System
- Create flashcard decks for organization
- Manual card creation with front/back content
- AI-powered flashcard generation from content
- Difficulty levels (easy, medium, hard)
- Hints for additional help
- Progress tracking per card

### 4. Personal Dictionary
- Add and define key terms
- Categorize terms by topic
- Add usage examples
- Link related terms
- Auto-extraction from learning content via AI

### 5. AI Integration
- **Flashcard Generation** - Creates study cards from any content
- **Term Extraction** - Identifies and defines key vocabulary
- **Summary Generation** - Condenses notes into summaries
- **Quiz Generation** - Creates quizzes from learning entries

### 6. Article Integration
- Save study articles to Learning Hub
- Auto-generate flashcards from articles
- Extract terms from article content
- Link entries to source articles

## Architecture

### Frontend (Next.js)

```
src/
├── app/
│   ├── api/study/learning/
│   │   ├── entries/          # Learning entries CRUD
│   │   ├── dictionary/       # Dictionary terms
│   │   ├── flashcards/       # Flashcards & decks
│   │   ├── review/           # Spaced repetition
│   │   ├── stats/            # Learning statistics
│   │   ├── quick-capture/    # Quick notes
│   │   └── ai/               # AI generation
│   └── study/learning/
│       ├── page.tsx          # Learning Hub dashboard
│       ├── new/page.tsx      # New entry form
│       ├── review/page.tsx   # Review session
│       ├── dictionary/page.tsx
│       └── flashcards/page.tsx
├── components/study/
│   └── ArticleLearningIntegration.tsx
├── hooks/
│   └── useStudy.ts           # Learning hooks
├── services/
│   └── studyService.ts       # API service layer
└── types/
    └── study.ts              # TypeScript types
```

### Backend (Firebase Cloud Functions)

```
functions/src/study/
├── types.ts                  # Firestore types
├── learningFunctions.ts      # CRUD cloud functions
├── learningAiService.ts      # AI service
└── index.ts                  # Exports
```

### Database Collections (Firestore)

- `learningEntries` - Main learning records
- `dictionaryTerms` - Personal glossary
- `flashcards` - Individual flashcards
- `flashcardDecks` - Flashcard organization
- `quickCaptures` - Quick notes
- `learningGoals` - Learning objectives

## Getting Started

### Prerequisites
- Next.js application running
- Firebase project configured
- Cloud Functions deployed
- AI API keys (Claude/ChatGPT) configured

### Accessing the Learning Hub

1. Navigate to `/study` (main study page)
2. Click the purple "Learning Hub" banner, or
3. Go directly to `/study/learning`

## User Guide

### Creating a Learning Entry

1. Click **"New Entry"** from the Learning Hub
2. Enter a descriptive title
3. Select the source type (Book, YouTube, etc.)
4. Fill in source-specific details
5. Write your notes in markdown format
6. Add key takeaways as bullet points
7. Add relevant tags
8. (Optional) Enable AI features:
   - Generate Flashcards
   - Extract Dictionary Terms
   - Generate Summary
9. Click **"Create Entry"**

### Reviewing with Spaced Repetition

1. Go to `/study/learning/review`
2. Items due for review are shown automatically
3. For each item:
   - Read the question/front of card
   - Think of the answer
   - Click "Show Answer"
   - Rate your recall:
     - **Again** (0) - Didn't remember, show again soon
     - **Hard** (1) - Struggled, shorter interval
     - **Good** (2) - Remembered with effort
     - **Easy** (3) - Instant recall, longer interval
4. Continue until all due items are reviewed

### SM-2 Algorithm Details

The system uses a modified SM-2 algorithm:

| Rating | Effect | Next Interval |
|--------|--------|---------------|
| Again | Reset to learning | < 1 minute |
| Hard | Decrease ease factor | 1-10 minutes |
| Good | Standard progression | 1-3 days |
| Easy | Increase ease factor | 4+ days |

Mastery levels progress from 0 to 5 based on consecutive correct reviews.

### Managing Flashcards

#### Creating a Deck
1. Go to `/study/learning/flashcards`
2. Click **"New Deck"**
3. Enter deck name and description
4. Add optional tags
5. Click **"Create Deck"**

#### Creating Cards Manually
1. Click **"New Card"**
2. Enter the front (question/prompt)
3. Enter the back (answer)
4. Select difficulty level
5. Add optional hint
6. Choose a deck (optional)
7. Click **"Create Card"**

#### AI-Generated Flashcards
1. On any deck, click the lightbulb icon
2. Paste your content (notes, text, etc.)
3. Set number of cards to generate
4. Choose difficulty level
5. Click **"Generate Cards"**

### Using the Dictionary

#### Adding Terms
1. Go to `/study/learning/dictionary`
2. Click **"Add Term"**
3. Enter the term/concept
4. Write the definition
5. (Optional) Add:
   - Category for grouping
   - Usage examples
   - Related terms
6. Click **"Add Term"**

#### Searching Terms
- Use the search bar to filter terms
- Filter by category using the dropdown
- Sort alphabetically or by date

### Saving Articles to Learning Hub

1. Open any study article
2. Scroll to the sidebar
3. Find the "Learning Hub" section
4. Click **"Add to Learning Hub"**
5. (Optional) Add personal notes
6. Enable AI features if desired
7. Click **"Create Entry"**

## API Reference

### Learning Entries

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/study/learning/entries` | GET | List all entries |
| `/api/study/learning/entries` | POST | Create entry |
| `/api/study/learning/entries/[id]` | GET | Get single entry |
| `/api/study/learning/entries/[id]` | PUT | Update entry |
| `/api/study/learning/entries/[id]` | DELETE | Delete entry |

### Dictionary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/study/learning/dictionary` | GET | List all terms |
| `/api/study/learning/dictionary` | POST | Create term |
| `/api/study/learning/dictionary/[id]` | PUT | Update term |
| `/api/study/learning/dictionary/[id]` | DELETE | Delete term |

### Flashcards

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/study/learning/flashcards` | GET | List all flashcards |
| `/api/study/learning/flashcards` | POST | Create flashcard |
| `/api/study/learning/flashcards/decks` | GET | List all decks |
| `/api/study/learning/flashcards/decks` | POST | Create deck |

### Review

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/study/learning/review` | GET | Get due items |
| `/api/study/learning/review` | POST | Submit review |

### AI Generation

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/study/learning/ai` | POST | Generate content |

Request body options:
```json
{
  "action": "generateFlashcards" | "extractTerms" | "generateSummary",
  "content": "...",
  "count": 5,
  "difficulty": "medium"
}
```

## Data Models

### LearningEntry

```typescript
interface LearningEntry {
  id: string;
  userId: string;
  title: string;
  content: string;              // Markdown notes
  summary?: string;
  sourceType: LearningSourceType;
  sourceDetails: LearningSource;
  categoryId?: string;
  topicIds: string[];
  tags: string[];
  keyTakeaways: string[];
  dictionaryTermIds: string[];
  flashcardIds: string[];
  linkedArticleIds: string[];
  reviewStatus: ReviewStatus;
  nextReviewDate?: string;
  reviewCount: number;
  confidenceLevel: number;      // 0-100
  createdAt: string;
  updatedAt: string;
}
```

### Flashcard

```typescript
interface Flashcard {
  id: string;
  userId: string;
  deckId?: string;
  front: string;
  back: string;
  hint?: string;
  difficulty: FlashcardDifficulty;
  tags: string[];
  sourceEntryId?: string;
  easeFactor: number;           // SM-2 ease factor
  interval: number;             // Days until next review
  repetitions: number;
  nextReviewDate: string;
  lastReviewedAt?: string;
  reviewCount: number;
  correctCount: number;
  masteryLevel: number;         // 0-5
  createdAt: string;
  updatedAt: string;
}
```

### DictionaryTerm

```typescript
interface DictionaryTerm {
  id: string;
  userId: string;
  term: string;
  definition: string;
  category?: string;
  examples: string[];
  relatedTerms: string[];
  sourceEntryIds: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
```

## Best Practices

### Effective Note-Taking
- Use markdown formatting for structure
- Include code examples where relevant
- Add key takeaways for quick review
- Tag entries for easy filtering

### Optimal Review Schedule
- Review daily for best retention
- Don't skip "Again" ratings - they help identify weak spots
- Use hints sparingly to build recall strength

### Flashcard Creation
- Keep questions focused and specific
- One concept per card
- Use AI generation as a starting point, then edit

### Dictionary Management
- Add terms as you encounter them
- Include practical examples
- Link related terms for context

## Troubleshooting

### Reviews Not Showing
- Check if items are actually due (nextReviewDate)
- Verify you're logged in
- Refresh the page

### AI Generation Fails
- Check API keys are configured
- Verify content isn't too long
- Check network connectivity

### Data Not Syncing
- Ensure Firebase connection is active
- Check browser console for errors
- Try refreshing the page
