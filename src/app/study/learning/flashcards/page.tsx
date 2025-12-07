"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFlashcards, useLearningAI } from "@/hooks/useStudy";
import {
  Flashcard,
  FlashcardDeck,
  FlashcardDifficulty,
  CreateFlashcardRequest,
  CreateFlashcardDeckRequest,
} from "@/types/study";
import { formatDistanceToNow } from "date-fns";

type TabType = "decks" | "cards" | "create";

export default function FlashcardsPage() {
  const router = useRouter();
  const {
    flashcards,
    decks,
    loading,
    error,
    fetchFlashcards,
    fetchDecks,
    createFlashcard,
    createDeck,
    updateFlashcard,
    deleteDeck,
  } = useFlashcards();
  const { generateFlashcards, loading: aiLoading } = useLearningAI();

  const [activeTab, setActiveTab] = useState<TabType>("decks");
  const [selectedDeck, setSelectedDeck] = useState<FlashcardDeck | null>(null);
  const [showCreateDeckModal, setShowCreateDeckModal] = useState(false);
  const [showCreateCardModal, setShowCreateCardModal] = useState(false);
  const [showAIGenerateModal, setShowAIGenerateModal] = useState(false);
  const [showCardDetailModal, setShowCardDetailModal] = useState(false);
  const [selectedCard, setSelectedCard] = useState<Flashcard | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);

  // Create deck form state
  const [newDeckName, setNewDeckName] = useState("");
  const [newDeckDescription, setNewDeckDescription] = useState("");
  const [newDeckTags, setNewDeckTags] = useState("");

  // Create card form state
  const [newCardFront, setNewCardFront] = useState("");
  const [newCardBack, setNewCardBack] = useState("");
  const [newCardDifficulty, setNewCardDifficulty] = useState<FlashcardDifficulty>("medium");
  const [newCardHint, setNewCardHint] = useState("");
  const [newCardTags, setNewCardTags] = useState("");

  // AI generation form state
  const [aiContent, setAiContent] = useState("");
  const [aiCardCount, setAiCardCount] = useState(5);
  const [aiDifficulty, setAiDifficulty] = useState<FlashcardDifficulty>("medium");

  useEffect(() => {
    fetchDecks();
    fetchFlashcards();
  }, []);

  const handleCreateDeck = async () => {
    if (!newDeckName.trim()) return;

    const deckData: CreateFlashcardDeckRequest = {
      name: newDeckName.trim(),
      description: newDeckDescription.trim() || undefined,
      tags: newDeckTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };

    await createDeck(deckData);
    setShowCreateDeckModal(false);
    setNewDeckName("");
    setNewDeckDescription("");
    setNewDeckTags("");
  };

  const handleCreateCard = async () => {
    if (!newCardFront.trim() || !newCardBack.trim()) return;

    const cardData: CreateFlashcardRequest = {
      front: newCardFront.trim(),
      back: newCardBack.trim(),
      difficulty: newCardDifficulty,
      hint: newCardHint.trim() || undefined,
      tags: newCardTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      deckId: selectedDeck?.id,
    };

    await createFlashcard(cardData);
    setShowCreateCardModal(false);
    setNewCardFront("");
    setNewCardBack("");
    setNewCardDifficulty("medium");
    setNewCardHint("");
    setNewCardTags("");
  };

  const handleAIGenerate = async () => {
    if (!aiContent.trim() || !selectedDeck) return;

    const generatedCards = await generateFlashcards(
      aiContent,
      aiCardCount,
      aiDifficulty
    );

    if (generatedCards && generatedCards.length > 0) {
      // Create each generated card
      for (const card of generatedCards) {
        await createFlashcard({
          front: card.front,
          back: card.back,
          difficulty: card.difficulty || aiDifficulty,
          hint: card.hint,
          tags: card.tags || [],
          deckId: selectedDeck.id,
        });
      }
    }

    setShowAIGenerateModal(false);
    setAiContent("");
    setAiCardCount(5);
  };

  const handleDeleteDeck = async (deckId: string) => {
    if (confirm("Are you sure you want to delete this deck? All flashcards in this deck will also be deleted.")) {
      await deleteDeck(deckId);
      if (selectedDeck?.id === deckId) {
        setSelectedDeck(null);
      }
    }
  };

  const handleCardClick = (card: Flashcard) => {
    setSelectedCard(card);
    setIsFlipped(false);
    setShowCardDetailModal(true);
  };

  const getDeckCards = (deckId: string) => {
    return flashcards.filter((card) => card.deckId === deckId);
  };

  const getUnassignedCards = () => {
    return flashcards.filter((card) => !card.deckId);
  };

  const getDifficultyColor = (difficulty: FlashcardDifficulty) => {
    switch (difficulty) {
      case "easy":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "medium":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "hard":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
    }
  };

  const getMasteryColor = (level: number) => {
    if (level >= 4) return "text-green-600 dark:text-green-400";
    if (level >= 2) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading flashcards...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push("/study/learning")}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Flashcards</h1>
                <p className="text-gray-600 dark:text-gray-400">
                  Manage your flashcard decks and cards
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowCreateDeckModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                New Deck
              </button>
              <button
                onClick={() => setShowCreateCardModal(true)}
                className="px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              >
                New Card
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-red-600 dark:text-red-400">{error}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab("decks")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "decks"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              Decks ({decks.length})
            </button>
            <button
              onClick={() => setActiveTab("cards")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "cards"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              All Cards ({flashcards.length})
            </button>
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === "decks" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {decks.map((deck) => {
              const deckCards = getDeckCards(deck.id);
              const dueCards = deckCards.filter(
                (card) => new Date(card.nextReviewDate) <= new Date()
              ).length;

              return (
                <div
                  key={deck.id}
                  className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md transition-shadow"
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          {deck.name}
                        </h3>
                        {deck.description && (
                          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                            {deck.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center space-x-2 ml-4">
                        <button
                          onClick={() => {
                            setSelectedDeck(deck);
                            setShowAIGenerateModal(true);
                          }}
                          className="p-2 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                          title="AI Generate Cards"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteDeck(deck.id)}
                          className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          title="Delete Deck"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center space-x-4 text-sm">
                      <div className="flex items-center text-gray-600 dark:text-gray-400">
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        {deckCards.length} cards
                      </div>
                      {dueCards > 0 && (
                        <div className="flex items-center text-orange-600 dark:text-orange-400">
                          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {dueCards} due
                        </div>
                      )}
                    </div>

                    {deck.tags && deck.tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {deck.tags.slice(0, 3).map((tag, index) => (
                          <span
                            key={index}
                            className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                        {deck.tags.length > 3 && (
                          <span className="px-2 py-0.5 text-xs text-gray-500">
                            +{deck.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <button
                        onClick={() => {
                          setSelectedDeck(deck);
                          setActiveTab("cards");
                        }}
                        className="w-full py-2 text-center text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors text-sm font-medium"
                      >
                        View Cards
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Empty State for Decks */}
            {decks.length === 0 && (
              <div className="col-span-full text-center py-12">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No decks yet</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Create a deck to organize your flashcards
                </p>
                <button
                  onClick={() => setShowCreateDeckModal(true)}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Create First Deck
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === "cards" && (
          <div>
            {/* Filter by Deck */}
            {selectedDeck && (
              <div className="mb-4 flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                <div className="flex items-center space-x-2">
                  <span className="text-blue-700 dark:text-blue-300 font-medium">
                    Deck: {selectedDeck.name}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedDeck(null)}
                  className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                >
                  Show All Cards
                </button>
              </div>
            )}

            {/* Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(selectedDeck ? getDeckCards(selectedDeck.id) : flashcards).map((card) => (
                <div
                  key={card.id}
                  onClick={() => handleCardClick(card)}
                  className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-900 dark:text-white font-medium line-clamp-2">
                        {card.front}
                      </p>
                      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                        {card.back}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-0.5 text-xs rounded ${getDifficultyColor(card.difficulty)}`}>
                        {card.difficulty}
                      </span>
                      <span className={`text-xs ${getMasteryColor(card.masteryLevel)}`}>
                        Level {card.masteryLevel}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {card.reviewCount} reviews
                    </span>
                  </div>

                  {new Date(card.nextReviewDate) <= new Date() && (
                    <div className="mt-2 text-xs text-orange-600 dark:text-orange-400">
                      Due for review
                    </div>
                  )}
                </div>
              ))}

              {/* Unassigned Cards Section */}
              {!selectedDeck && getUnassignedCards().length > 0 && (
                <>
                  <div className="col-span-full mt-6 mb-2">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                      Unassigned Cards ({getUnassignedCards().length})
                    </h3>
                  </div>
                  {getUnassignedCards().map((card) => (
                    <div
                      key={card.id}
                      onClick={() => handleCardClick(card)}
                      className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-900 dark:text-white font-medium line-clamp-2">
                            {card.front}
                          </p>
                          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                            {card.back}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-0.5 text-xs rounded ${getDifficultyColor(card.difficulty)}`}>
                            {card.difficulty}
                          </span>
                          <span className={`text-xs ${getMasteryColor(card.masteryLevel)}`}>
                            Level {card.masteryLevel}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {card.reviewCount} reviews
                        </span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Empty State for Cards */}
            {flashcards.length === 0 && (
              <div className="text-center py-12">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No flashcards yet</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Create flashcards to start studying
                </p>
                <button
                  onClick={() => setShowCreateCardModal(true)}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Create First Card
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Deck Modal */}
      {showCreateDeckModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Create New Deck
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Deck Name *
                </label>
                <input
                  type="text"
                  value={newDeckName}
                  onChange={(e) => setNewDeckName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Japanese Vocabulary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={newDeckDescription}
                  onChange={(e) => setNewDeckDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="What is this deck about?"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={newDeckTags}
                  onChange={(e) => setNewDeckTags(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="language, japanese, n5"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowCreateDeckModal(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDeck}
                disabled={!newDeckName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Deck
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Card Modal */}
      {showCreateCardModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Create New Card
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Front (Question) *
                </label>
                <textarea
                  value={newCardFront}
                  onChange={(e) => setNewCardFront(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter the question or prompt"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Back (Answer) *
                </label>
                <textarea
                  value={newCardBack}
                  onChange={(e) => setNewCardBack(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter the answer"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Difficulty
                </label>
                <select
                  value={newCardDifficulty}
                  onChange={(e) => setNewCardDifficulty(e.target.value as FlashcardDifficulty)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Hint (optional)
                </label>
                <input
                  type="text"
                  value={newCardHint}
                  onChange={(e) => setNewCardHint(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="A hint to help remember"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Deck
                </label>
                <select
                  value={selectedDeck?.id || ""}
                  onChange={(e) => {
                    const deck = decks.find((d) => d.id === e.target.value);
                    setSelectedDeck(deck || null);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">No Deck</option>
                  {decks.map((deck) => (
                    <option key={deck.id} value={deck.id}>
                      {deck.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={newCardTags}
                  onChange={(e) => setNewCardTags(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="vocabulary, verb, jlpt"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowCreateCardModal(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCard}
                disabled={!newCardFront.trim() || !newCardBack.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Card
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Generate Modal */}
      {showAIGenerateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full mx-4 p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              AI Generate Flashcards
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Paste content and let AI create flashcards for you. Cards will be added to: {selectedDeck?.name}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Content *
                </label>
                <textarea
                  value={aiContent}
                  onChange={(e) => setAiContent(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Paste your notes, text, or content here..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Number of Cards
                  </label>
                  <input
                    type="number"
                    value={aiCardCount}
                    onChange={(e) => setAiCardCount(parseInt(e.target.value) || 5)}
                    min={1}
                    max={20}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Difficulty
                  </label>
                  <select
                    value={aiDifficulty}
                    onChange={(e) => setAiDifficulty(e.target.value as FlashcardDifficulty)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowAIGenerateModal(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAIGenerate}
                disabled={!aiContent.trim() || aiLoading}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {aiLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    <span>Generate Cards</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Card Detail Modal */}
      {showCardDetailModal && selectedCard && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Flashcard Details
              </h2>
              <button
                onClick={() => setShowCardDetailModal(false)}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Flip Card */}
            <div
              onClick={() => setIsFlipped(!isFlipped)}
              className={`relative cursor-pointer transition-transform duration-500 min-h-[200px] ${
                isFlipped ? "[transform:rotateY(180deg)]" : ""
              }`}
              style={{ transformStyle: "preserve-3d" }}
            >
              {/* Front */}
              <div
                className={`absolute inset-0 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 flex items-center justify-center ${
                  isFlipped ? "invisible" : ""
                }`}
                style={{ backfaceVisibility: "hidden" }}
              >
                <p className="text-white text-lg text-center">{selectedCard.front}</p>
              </div>
              {/* Back */}
              <div
                className={`absolute inset-0 bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 flex items-center justify-center ${
                  !isFlipped ? "invisible" : ""
                }`}
                style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
              >
                <p className="text-white text-lg text-center">{selectedCard.back}</p>
              </div>
            </div>

            <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-2">
              Click to flip
            </p>

            {/* Card Stats */}
            <div className="mt-6 grid grid-cols-3 gap-4 text-center">
              <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {selectedCard.masteryLevel}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Mastery</p>
              </div>
              <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {selectedCard.reviewCount}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Reviews</p>
              </div>
              <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {Math.round((selectedCard.correctCount / Math.max(selectedCard.reviewCount, 1)) * 100)}%
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Accuracy</p>
              </div>
            </div>

            {selectedCard.hint && (
              <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <strong>Hint:</strong> {selectedCard.hint}
                </p>
              </div>
            )}

            <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              <p>
                Next review:{" "}
                {new Date(selectedCard.nextReviewDate) <= new Date()
                  ? "Due now"
                  : formatDistanceToNow(new Date(selectedCard.nextReviewDate), { addSuffix: true })}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
