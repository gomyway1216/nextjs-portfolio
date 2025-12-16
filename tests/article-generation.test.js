const test = require("node:test");
const assert = require("node:assert/strict");

const aiService = require("../../Yudai-new-portfolio-backend-ts/functions/src/study/aiService.ts");
const articleQueries = require("../../Yudai-new-portfolio-backend-ts/functions/src/study/articleQueries.ts");

test("buildArticleGenerationUserPrompt trims titles + includes forbidden section", () => {
  const existingTitles = Array.from({ length: 120 }, (_, i) => `Title ${i}`);
  existingTitles[0] = "Outboxパターン×Debezium 入門";
  existingTitles[1] = "Kubernetesのゼロダウンタイム";
  existingTitles[2] = "Caching in System Design";
  existingTitles[3] = "Intro to Redis";

  const { userPrompt, debug } = aiService.buildArticleGenerationUserPrompt({
    topicName: "System Design: Design Twitter Timeline",
    categoryName: "System Design",
    difficulty: "intermediate",
    numberOfQuestions: 5,
    language: "ja",
    existingArticleTitles: existingTitles,
    codingLanguage: "typescript",
  });

  assert.ok(userPrompt.includes("FORBIDDEN NICHE TOPICS"));
  assert.ok(userPrompt.includes("RECENT ARTICLE TITLES"));
  assert.equal(debug.existingTitlesProvided, 120);
  assert.equal(debug.existingTitlesIncluded, 50);
  assert.ok(userPrompt.includes("- Title 49"));
  assert.ok(!userPrompt.includes("- Title 119"));

  const cacheTheme = debug.themeCountsInRecentTitles.find((t) => t.id === "cache");
  assert.ok(cacheTheme);
  assert.ok(cacheTheme.count >= 2);
});

test("validateGeneratedTitleForDedupe rejects forbidden niche keywords", () => {
  const existingTitles = ["Design Twitter Timeline", "Outboxパターン×Debezium 入門"];
  const result = aiService.validateGeneratedTitleForDedupe("OutboxとDebeziumの話", existingTitles);
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes("forbidden_niche_topic_keyword"));
});

test("validateGeneratedTitleForDedupe rejects similar titles", () => {
  const existingTitles = ["Design Twitter Timeline"];
  const result = aiService.validateGeneratedTitleForDedupe("Design Twitter timeline", existingTitles);
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes("similar_to_existing_title"));
});

test("areTitlesSimilar normalizes Japanese × and punctuation", () => {
  assert.equal(
    aiService.areTitlesSimilar("Outboxパターン×Debezium", "OutboxパターンxDebezium"),
    true
  );
});

test("suggestSingleTopic prefers curated System Design topics (Twitter)", async () => {
  const result = await aiService.suggestSingleTopic(
    "System Design",
    [],
    "claude",
    undefined,
    "Explain Twitter system design",
    []
  );

  assert.ok(result);
  assert.equal(result.name, "Design Twitter Timeline");
});

test("suggestSingleTopic avoids existing titles and falls back deterministically", async () => {
  const originalRandom = Math.random;
  Math.random = () => 0;

  try {
    const result = await aiService.suggestSingleTopic(
      "System Design",
      [],
      "claude",
      undefined,
      "Explain Twitter system design",
      ["Design Twitter Timeline"]
    );

    assert.ok(result);
    assert.equal(result.name, "What is System Design? Understanding the Basics");
  } finally {
    Math.random = originalRandom;
  }
});

test("fetchRecentArticleTitles uses the expected query chain", async () => {
  const calls = [];
  const rawTitles = ["A", "B", "", "   ", null, undefined];

  const query = {
    orderBy: (field, direction) => {
      calls.push(["orderBy", field, direction]);
      return query;
    },
    select: (...fields) => {
      calls.push(["select", fields]);
      return query;
    },
    limit: (n) => {
      calls.push(["limit", n]);
      return query;
    },
    get: async () => {
      calls.push(["get"]);
      return {
        docs: rawTitles.map((title) => ({
          data: () => ({ title }),
        })),
      };
    },
  };

  const firestore = {
    collection: (name) => {
      calls.push(["collection", name]);
      return query;
    },
  };

  const titles = await articleQueries.fetchRecentArticleTitles(firestore, 500);
  assert.deepEqual(titles, ["A", "B"]);
  assert.deepEqual(calls, [
    ["collection", "study_articles"],
    ["orderBy", "createdAt", "desc"],
    ["select", ["title", "createdAt"]],
    ["limit", 500],
    ["get"],
  ]);
});
