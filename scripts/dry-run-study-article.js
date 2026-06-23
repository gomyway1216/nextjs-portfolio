/**
 * Dry-run the Study Article generator end-to-end (auth + Cloud Function call) and print:
 * - resolved topic
 * - sample of recent titles fetched from Firestore
 * - the exact prompt text that would be sent to the LLM
 *
 * Usage:
 *   node scripts/dry-run-study-article.js
 *
 * Optional env:
 *   TOPIC_NAME="Design Twitter Timeline"
 *   CUSTOM_PROMPT="Twitterのシステムデザインを解説して"
 *   CATEGORY_NAME="System Design"
 */

const dotenv = require("dotenv");
const path = require("node:path");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

dotenv.config({ path: path.resolve(__dirname, "..", ".env.local") });

const FIREBASE_WEB_API_KEY = process.env.NEXT_PUBLIC_API_KEY;
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
const FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY
  ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
  : undefined;

const CATEGORY_NAME = process.env.CATEGORY_NAME || "System Design";
const TOPIC_NAME = process.env.TOPIC_NAME || "";
const CUSTOM_PROMPT = process.env.CUSTOM_PROMPT || "Twitterのシステムデザインを解説して";

const CLOUD_RUN_PROJECT_HASH = "qtveh4ivsq";
const CLOUD_RUN_REGION = "uc";

function getCloudFunctionUrl(functionName) {
  return `https://${functionName.toLowerCase()}-${CLOUD_RUN_PROJECT_HASH}-${CLOUD_RUN_REGION}.a.run.app`;
}

function requireEnv(name, value) {
  if (!value || String(value).trim().length === 0) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function initAdmin() {
  if (getApps().length > 0) return;
  initializeApp({
    credential: cert({
      projectId: requireEnv("FIREBASE_PROJECT_ID", FIREBASE_PROJECT_ID),
      clientEmail: requireEnv("FIREBASE_CLIENT_EMAIL", FIREBASE_CLIENT_EMAIL),
      privateKey: requireEnv("FIREBASE_PRIVATE_KEY", FIREBASE_PRIVATE_KEY),
    }),
  });
}

async function signInWithCustomToken() {
  initAdmin();

  const uid = `codex-dryrun-${Date.now()}`;
  const customToken = await getAuth().createCustomToken(uid);

  const apiKey = requireEnv("NEXT_PUBLIC_API_KEY", FIREBASE_WEB_API_KEY);
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    const message = data?.error?.message || JSON.stringify(data);
    throw new Error(`Failed to exchange custom token for idToken: ${message}`);
  }

  if (!data.idToken) {
    throw new Error("No idToken in signInWithCustomToken response");
  }

  return String(data.idToken);
}

async function fetchCategories() {
  const url = getCloudFunctionUrl("getStudyCategories");
  const res = await fetch(url, { method: "GET" });
  const data = await res.json();
  if (!res.ok || !data?.success) {
    throw new Error(`getStudyCategories failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return data.categories || [];
}

async function resolveCategoryIdByName(name) {
  const categories = await fetchCategories();
  const normalizedNeedle = String(name).toLowerCase().normalize("NFKC");

  const match =
    categories.find((c) => String(c.name).toLowerCase().normalize("NFKC") === normalizedNeedle) ||
    categories.find((c) => String(c.name).toLowerCase().normalize("NFKC").includes(normalizedNeedle));

  if (!match) {
    const available = categories.map((c) => c.name).slice(0, 30);
    throw new Error(
      `Category "${name}" not found. Available (first 30): ${available.join(", ")}`
    );
  }

  return match.id;
}

async function dryRunGenerateStudyArticle({ categoryId, idToken }) {
  const url = getCloudFunctionUrl("generateStudyArticle");

  const body = {
    categoryId,
    topicName: TOPIC_NAME || undefined,
    aiProvider: "claude",
    difficulty: "intermediate",
    includeQuiz: false,
    numberOfQuestions: 5,
    customPrompt: CUSTOM_PROMPT,
    language: "ja",
    codingLanguage: "typescript",
    dryRun: true,
    debug: true,
    debugIncludePrompt: true,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok || !data?.success) {
    throw new Error(`generateStudyArticle dryRun failed: ${res.status} ${JSON.stringify(data)}`);
  }

  return data;
}

async function main() {
  const categoryId = await resolveCategoryIdByName(CATEGORY_NAME);
  const idToken = await signInWithCustomToken();
  const result = await dryRunGenerateStudyArticle({ categoryId, idToken });

  // Print only the fields we need (avoid printing tokens/secrets).
  console.log(JSON.stringify({
    success: result.success,
    dryRun: result.dryRun,
    topic: result.topic,
    category: result.category,
    ai: result.ai,
    promptDebug: result.promptDebug,
    existingTitles: result.existingTitles,
    prompt: result.prompt,
    willCreateTopic: result.willCreateTopic,
  }, null, 2));
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
});
