'use client';

import React, { useEffect, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ChevronsUpDown, X } from 'lucide-react';
import * as technologyApi from '@/services/technologiesService';
import styles from './technologies-selector.module.scss';

interface Technology {
  id: string;
  name: string;
  type: string;
}

interface TechnologiesSelectorProps {
  selectedTechnologies: Technology[];
  setSelectedTechnologies: (technologies: Technology[]) => void;
}

const TechnologiesSelector = ({ selectedTechnologies, setSelectedTechnologies }: TechnologiesSelectorProps) => {
  const [open, setOpen] = useState(false);
  const [technologiesList, setTechnologiesList] = useState<Technology[]>([]);

  useEffect(() => {
    const fetchTechnologies = async () => {
      const technologies = await technologyApi.getTechnologies();
      setTechnologiesList(technologies);
    };
    fetchTechnologies();
  }, []);

  const handleToggle = (technology: Technology) => {
    const currentIndex = selectedTechnologies.findIndex(t => t.id === technology.id);
    const newSelected = [...selectedTechnologies];

    if (currentIndex === -1) {
      newSelected.push(technology);
    } else {
      newSelected.splice(currentIndex, 1);
    }

    setSelectedTechnologies(newSelected);
  };

  const handleRemove = (technology: Technology) => {
    const newSelected = selectedTechnologies.filter(t => t.id !== technology.id);
    setSelectedTechnologies(newSelected);
  };

  const isSelected = (technology: Technology) => {
    return selectedTechnologies.some(t => t.id === technology.id);
  };

  return (
    <div className={styles.technologiesForm}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            <span className="truncate">
              {selectedTechnologies.length > 0
                ? `${selectedTechnologies.length} selected`
                : 'Select technologies'}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0">
          <div className="max-h-[300px] overflow-y-auto p-4 space-y-2">
            {technologiesList.map((technology) => (
              <div key={technology.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`tech-${technology.id}`}
                  checked={isSelected(technology)}
                  onCheckedChange={() => handleToggle(technology)}
                />
                <label
                  htmlFor={`tech-${technology.id}`}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                >
                  {technology.name}
                </label>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {selectedTechnologies.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {selectedTechnologies.map((technology) => (
            <Badge key={technology.id} variant="secondary" className="gap-1">
              {technology.name}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => handleRemove(technology)}
              />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
};

export default TechnologiesSelector;
