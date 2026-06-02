'use client';
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import * as api from '@/services/imageService';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Upload, X } from 'lucide-react';
import Image from 'next/image';
import styles from './image-upload.module.scss';

interface ImageMultipleUploadProps {
  id: string;
  type: string;
  handleImageUrls: (urls: string[]) => void;
  originalImageUrls?: string[];
}

interface SortableImageItemProps {
  url: string;
  index: number;
  onRemove: () => void;
}

const SortableImageItem = ({ url, index, onRemove }: SortableImageItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: url });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="relative w-48 cursor-grab active:cursor-grabbing"
    >
      <Image
        src={url}
        alt={`Image ${index}`}
        width={192}
        height={192}
        unoptimized
        className="imagePreview rounded-md"
      />
      <Button
        type="button"
        variant="destructive"
        size="icon"
        className="absolute top-2 right-2"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};

const ImageMultipleUpload = ({ id, type, handleImageUrls, originalImageUrls }: ImageMultipleUploadProps) => {
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>(originalImageUrls || []);
  const [loading, setLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = imageUrls.indexOf(String(active.id));
      const newIndex = imageUrls.indexOf(String(over.id));
      const newImageUrls = arrayMove(imageUrls, oldIndex, newIndex);
      setImageUrls(newImageUrls);
      handleImageUrls(newImageUrls);
    }
  };

  useEffect(() => {
    if (originalImageUrls) {
      setImageUrls(originalImageUrls);
    }
  }, [originalImageUrls]);

  const onFileChange = async (imageFile: File) => {
    setLoading(true);
    setProgress(0);

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 100);

    try {
      const downloadURL = await api.getImageRef(imageFile, type, id);
      const newImageUrls = [...imageUrls, downloadURL];
      setImageUrls(newImageUrls);
      handleImageUrls(newImageUrls);
      setProgress(100);
    } catch (error) {
      console.error('Error uploading image: ', error);
    } finally {
      clearInterval(progressInterval);
      setLoading(false);
      setTimeout(() => setProgress(0), 1000);
    }
  };

  useEffect(() => {
    selectedImages.forEach((imageFile) => {
      if (imageFile) {
        onFileChange(imageFile);
      }
    });
  }, [selectedImages]);

  const handleImageRemove = (index: number) => {
    const newImageUrls = imageUrls.filter((_, i) => i !== index);
    setImageUrls(newImageUrls);
    handleImageUrls(newImageUrls);
  };

  return (
    <div className={styles.imageMultipleUploadRoot}>
      <div className="uploadButton">
        <input
          accept="image/*"
          multiple
          type="file"
          id="select-multiple-image"
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files) {
              const filesArray = Array.from(e.target.files);
              setSelectedImages(filesArray);
              filesArray.forEach(file => {
                onFileChange(file);
              });
              e.target.value = '';
            }
          }}
        />
        <label htmlFor="select-multiple-image">
          <Button
            type="button"
            variant="default"
            className="cursor-pointer"
            asChild
          >
            <span>
              <Upload className="mr-2 h-4 w-4" />
              Upload Sub Images
            </span>
          </Button>
        </label>
      </div>

      {loading && (
        <div className="w-full mt-2">
          <Progress value={progress} />
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={imageUrls}
          strategy={horizontalListSortingStrategy}
        >
          <div className="mt-4 flex flex-wrap gap-4">
            {imageUrls.map((url, index) => (
              <SortableImageItem
                key={url}
                url={url}
                index={index}
                onRemove={() => handleImageRemove(index)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
};

export default ImageMultipleUpload;
