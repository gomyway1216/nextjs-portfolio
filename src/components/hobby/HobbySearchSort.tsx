'use client';

import { useState, useEffect } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { SORT_OPTIONS, type SortType } from '@/lib/animeUtils';

interface HobbySearchSortProps {
  onSearchChange: (query: string) => void;
  onSortChange: (sortType: SortType) => void;
  initialSearch?: string;
  initialSort?: SortType;
  showScoreSort?: boolean;
  language?: 'en' | 'ja';
  placeholder?: string;
}

export default function HobbySearchSort({
  onSearchChange,
  onSortChange,
  initialSearch = '',
  initialSort = 'alphabetical',
  showScoreSort = true,
  language = 'ja',
  placeholder,
}: HobbySearchSortProps) {
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [sortType, setSortType] = useState<SortType>(initialSort);
  const [showFilters, setShowFilters] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearchChange(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, onSearchChange]);

  const handleSortChange = (newSort: SortType) => {
    setSortType(newSort);
    onSortChange(newSort);
  };

  const clearSearch = () => {
    setSearchQuery('');
    onSearchChange('');
  };

  // Filter sort options based on showScoreSort
  const filteredSortOptions = showScoreSort
    ? SORT_OPTIONS
    : SORT_OPTIONS.filter(opt => !opt.value.includes('score'));

  return (
    <div className="hobby-search-sort">
      {/* Search Input */}
      <div className="hobby-search-sort__search">
        <Search size={18} className="hobby-search-sort__search-icon" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
