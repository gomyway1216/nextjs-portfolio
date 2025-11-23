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
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import * as projectApi from '@/services/projectsService';
import { X } from 'lucide-react';
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

const UrlListEditor = ({ urls, setUrls }: UrlListEditorProps) => {
  const [urlTypeList, setUrlTypeList] = useState<string[]>([]);

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

  const handleOnDragEnd = (result: any) => {
    if (!result.destination) return;
    const items = Array.from(urls);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setUrls(items);
  };

  return (
    <DragDropContext onDragEnd={handleOnDragEnd}>
      <Droppable droppableId="droppable-url-list">
        {(provided: any) => (
          <div ref={provided.innerRef} {...provided.droppableProps}>
            {urls.map((url: any, index: number) => (
              <Draggable key={index} draggableId={`item-${index}`} index={index}>
                {(provided: any) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    // style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}
                    className="flex items-center gap-2 mb-4"
                  >
                    <Input
                      type="text"
                      value={url.name}
                      placeholder="Name"
                      onChange={(e) => handleChangeUrl(index, e.target.value, url.link, url.type)}
                      className="flex-1"
                    />
                    <Input
                      type="text"
                      value={url.link}
                      placeholder="Link"
                      onChange={(e) => handleChangeUrl(index, url.name, e.target.value, url.type)}
                      className="flex-[3]"
                    />
                    <Select
                      value={url.type}
                      onValueChange={(value) => handleChangeUrl(index, url.name, url.link, value)}
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
                      onClick={() => handleRemoveUrl(index)}
                      className="flex-shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
      <Button type="button" onClick={handleAddUrl}>Add URL</Button>
    </DragDropContext>
  );
};

export default UrlListEditor;
