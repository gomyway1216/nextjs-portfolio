"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  StudyArticle,
  LearningSourceType,
  CreateLearningEntryRequest,
} from "@/types/study";
import { createLearningEntry } from "@/services/studyService";
import { BookOpen, Plus, Sparkles, Check, Loader2, ExternalLink } from "lucide-react";

interface ArticleLearningIntegrationProps {
  article: StudyArticle;
  onClose?: () => void;
}

export default function ArticleLearningIntegration({
  article,
  onClose,
}: ArticleLearningIntegrationProps) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [isCreated, setIsCreated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [notes, setNotes] = useState("");
  const [generateFlashcards, setGenerateFlashcards] = useState(true);
  const [extractTerms, setExtractTerms] = useState(true);

  const handleCreateLearningEntry = async () => {
    setIsCreating(true);
    setError(null);

    try {
      // Build the learning entry request
      const entryData: CreateLearningEntryRequest = {
        title: `Notes from: ${article.title}`,
        content: notes || buildContentFromArticle(article),
        sourceType: LearningSourceType.ARTICLE,
        sourceDetails: {
          type: LearningSourceType.ARTICLE,
          articleTitle: article.title,
          articleAuthor: "AI Generated",
          notes: `From study article ID: ${article.id}`,
        },
        categoryId: article.categoryId,
        topicIds: article.topicId ? [article.topicId] : [],
        tags: article.tags,
        keyTakeaways: article.keyTakeaways,
        linkedArticleIds: [article.id],
        generateFlashcards,
        extractTerms,
      };

      await createLearningEntry(entryData);
      setIsCreated(true);

      // Auto redirect after 2 seconds
      setTimeout(() => {
        router.push("/study/learning");
      }, 2000);
    } catch (err) {
      console.error("Failed to create learning entry:", err);
      setError(err instanceof Error ? err.message : "Failed to create learning entry");
    } finally {
      setIsCreating(false);
    }
  };

  const buildContentFromArticle = (article: StudyArticle): string => {
    let content = `# ${article.title}\n\n`;
    content += `## Summary\n${article.summary}\n\n`;
    content += `## Introduction\n${article.introduction}\n\n`;

    for (const section of article.sections) {
      content += `## ${section.title}\n${section.content}\n\n`;
      if (section.codeExamples && section.codeExamples.length > 0) {
        for (const example of section.codeExamples) {
          content += `### Code Example (${example.language})\n\`\`\`${example.language}\n${example.code}\n\`\`\`\n`;
          if (example.explanation) {
            content += `${example.explanation}\n\n`;
          }
        }
      }
    }

    content += `## Conclusion\n${article.conclusion}\n\n`;
    content += `## Key Takeaways\n`;
    for (const takeaway of article.keyTakeaways) {
      content += `- ${takeaway}\n`;
    }

    return content;
  };

  if (isCreated) {
    return (
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-medium text-green-800 dark:text-green-200">
              Learning entry created!
            </h4>
            <p className="text-sm text-green-700 dark:text-green-300 mt-1">
              Redirecting to Learning Hub...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-medium text-sm"
      >
        <BookOpen size={16} />
        Add to Learning Hub
      </button>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <BookOpen size={18} className="text-purple-600" />
            Create Learning Entry
          </h3>
          <button
            onClick={() => setShowForm(false)}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            &times;
          </button>
        </div>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Save this article to your personal learning hub with optional AI-generated flashcards
        </p>
      </div>

      <div className="p-4 space-y-4">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Additional Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Add your own notes, thoughts, or questions about this article..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            If left empty, the full article content will be used
          </p>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <Sparkles size={14} className="text-purple-600" />
            AI Features
          </h4>

          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={generateFlashcards}
              onChange={(e) => setGenerateFlashcards(e.target.checked)}
              className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
            />
            <div>
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Generate flashcards
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                AI will create study flashcards from key concepts
              </p>
            </div>
          </label>

          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={extractTerms}
              onChange={(e) => setExtractTerms(e.target.checked)}
              className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
            />
            <div>
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Extract dictionary terms
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                AI will identify and define key terms for your glossary
              </p>
            </div>
          </label>
        </div>

        <div className="flex items-center justify-end space-x-3 pt-2">
          <button
            onClick={() => setShowForm(false)}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateLearningEntry}
            disabled={isCreating}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            {isCreating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus size={16} />
                Create Entry
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
