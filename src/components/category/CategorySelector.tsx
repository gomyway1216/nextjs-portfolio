'use client';

import React, { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ChevronsUpDown, X } from 'lucide-react';

interface CategorySelectorProps {
  categoryList: string[];
  selectedCategories: string[];
  onCategoryChange: (event: { target: { value: string[] } }) => void;
}

const CategorySelector = ({ categoryList, selectedCategories, onCategoryChange }: CategorySelectorProps) => {
  const [open, setOpen] = useState(false);

  const handleToggle = (category: string) => {
    const currentIndex = selectedCategories.indexOf(category);
    const newSelected = [...selectedCategories];

    if (currentIndex === -1) {
      newSelected.push(category);
    } else {
      newSelected.splice(currentIndex, 1);
    }

    // Create a synthetic event to match the MUI interface
    onCategoryChange({
      target: {
        value: newSelected,
      },
    });
  };

  const handleRemove = (category: string) => {
    const newSelected = selectedCategories.filter(c => c !== category);
    onCategoryChange({
      target: {
        value: newSelected,
      },
    });
  };

  return (
    <div className="w-[300px]">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            <span className="truncate">
              {selectedCategories.length > 0
                ? `${selectedCategories.length} selected`
                : 'Select categories'}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0">
          <div className="max-h-[300px] overflow-y-auto p-4 space-y-2">
            {categoryList.map((category) => (
              <div key={category} className="flex items-center space-x-2">
                <Checkbox
                  id={`category-${category}`}
                  checked={selectedCategories.includes(category)}
                  onCheckedChange={() => handleToggle(category)}
                />
                <label
                  htmlFor={`category-${category}`}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                >
                  {category}
                </label>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {selectedCategories.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {selectedCategories.map((category) => (
            <Badge key={category} variant="secondary" className="gap-1">
              {category}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => handleRemove(category)}
              />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
};

export default CategorySelector;
