'use client';
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import * as api from '@/services/imageService';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { Upload, X } from 'lucide-react';
import styles from './image-upload.module.scss';

interface ImageMultipleUploadProps {
  id: string;
  type: string;
  handleImageUrls: (urls: string[]) => void;
  originalImageUrls?: string[];
}

const ImageMultipleUpload = ({ id, type, handleImageUrls, originalImageUrls }: ImageMultipleUploadProps) => {
  const [selectedImages, setSelectedImages] = useState<any[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>(originalImageUrls || []);
  const [loading, setLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);

  const handleOnDragEnd = (result: any) => {
    if (!result.destination) return;
    const items = Array.from(imageUrls);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setImageUrls(items);
    handleImageUrls(items);
  };

  useEffect(() => {
    if (originalImageUrls) {
      setImageUrls(originalImageUrls);
    }
  }, [originalImageUrls]);

  const onFileChange = async (imageFile: any) => {
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

      <DragDropContext onDragEnd={handleOnDragEnd}>
        <Droppable droppableId="imageList" direction="horizontal">
          {(provided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="mt-4 flex flex-wrap gap-4"
            >
              {imageUrls.map((url, index) => (
                <Draggable key={url} draggableId={url} index={index}>
                  {(provided) => (
                    <div
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      ref={provided.innerRef}
                      className="relative w-48"
                    >
                      <img src={url} alt={`Image ${index}`} className="imagePreview rounded-md" />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2"
                        onClick={() => handleImageRemove(index)}
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
      </DragDropContext>
    </div>
  );
};

export default ImageMultipleUpload;
