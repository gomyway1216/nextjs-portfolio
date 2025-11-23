'use client';
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import * as projectApi from '@/services/projectsService';
import { X, GripVertical } from 'lucide-react';
import styles from './url-list-editor.module.scss';

interface Url {
  name: string;
  link: string;
  type: string;
}

interface UrlListEditorProps {
  urls: Url[];
  setUrls: (urls: Url[]) => void;
}

interface SortableUrlItemProps {
  url: Url;
  index: number;
  urlTypeList: string[];
  onRemove: () => void;
  onChange: (name: string, link: string, type: string) => void;
}

const SortableUrlItem = ({ url, index, urlTypeList, onRemove, onChange }: SortableUrlItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: `url-${index}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 mb-4"
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing flex-shrink-0"
      >
        <GripVertical className="h-5 w-5 text-gray-400" />
      </div>
      <Input
        type="text"
        value={url.name}
        placeholder="Name"
        onChange={(e) => onChange(e.target.value, url.link, url.type)}
        className="flex-1"
      />
      <Input
        type="text"
        value={url.link}
        placeholder="Link"
        onChange={(e) => onChange(url.name, e.target.value, url.type)}
        className="flex-[3]"
      />
      <Select
        value={url.type}
        onValueChange={(value) => onChange(url.name, url.link, value)}
      >
        <SelectTrigger className="flex-1">
          <SelectValue placeholder="URL Type" />
        </SelectTrigger>
        <SelectContent>
          {urlTypeList.map((type, i) => (
            <SelectItem key={i} value={type}>
              {type}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="flex-shrink-0"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};

const UrlListEditor = ({ urls, setUrls }: UrlListEditorProps) => {
  const [urlTypeList, setUrlTypeList] = useState<string[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const fetchUrlTypeList = async () => {
    const urlTypeList = await projectApi.getUrlTypeList();
    setUrlTypeList(urlTypeList);
  };

  useEffect(() => {
    fetchUrlTypeList();
  }, []);

  const handleAddUrl = () => {
    setUrls([...urls, { name: '', link: '', type: '' }]);
  };

  const handleRemoveUrl = (index: number) => {
    const newUrls = urls.filter((_: any, i: number) => i !== index);
    setUrls(newUrls);
  };

  const handleChangeUrl = (index: number, newName: string, newLink: string, newType: string) => {
    const newUrls = urls.map((url: any, i: number) => {
      if (i === index) {
        return { ...url, name: newName, link: newLink, type: newType};
      }
      return url;
    });
    setUrls(newUrls);
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      const oldIndex = parseInt(active.id.replace('url-', ''));
      const newIndex = parseInt(over.id.replace('url-', ''));
      setUrls(arrayMove(urls, oldIndex, newIndex));
    }
  };

  return (
    <div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={urls.map((_, index) => `url-${index}`)}
          strategy={verticalListSortingStrategy}
        >
          {urls.map((url: any, index: number) => (
            <SortableUrlItem
              key={`url-${index}`}
              url={url}
              index={index}
              urlTypeList={urlTypeList}
              onRemove={() => handleRemoveUrl(index)}
              onChange={(name, link, type) => handleChangeUrl(index, name, link, type)}
            />
          ))}
        </SortableContext>
      </DndContext>
      <Button type="button" onClick={handleAddUrl}>Add URL</Button>
    </div>
  );
};

export default UrlListEditor;
