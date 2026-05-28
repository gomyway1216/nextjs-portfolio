'use client';
import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import * as api from '@/services/imageService';
import { Upload, X } from 'lucide-react';
import styles from './image-upload.module.scss';

interface ImageUploadProps {
  id: string;
  type: string;
  handleImageUrl: (url: string) => void;
  originalImageUrl?: string;
}

const ImageUpload = ({ id, type, handleImageUrl, originalImageUrl }: ImageUploadProps) => {
  const [imageUrl, setImageUrl] = useState<string>(originalImageUrl || '');
  const [loading, setLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);

  useEffect(() => {
    if (originalImageUrl) {
      setImageUrl(originalImageUrl);
    }
  }, [originalImageUrl]);

  const onFileChange = async (imageFile: File) => {
    setLoading(true);
    setProgress(0);

    // Simulate progress (you can integrate real progress tracking if your API supports it)
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
      setImageUrl(downloadURL);
      handleImageUrl(downloadURL);
      setProgress(100);
    } catch (error) {
      console.error('Error uploading image: ', error);
    } finally {
      clearInterval(progressInterval);
      setLoading(false);
      setTimeout(() => setProgress(0), 1000);
    }
  };

  const handleImageRemove = () => {
    setImageUrl('');
    handleImageUrl('');
  };

  return (
    <div className={styles.imageUploadRoot}>
      <div className="uploadButton">
        <input
          accept="image/*"
          type="file"
          id="select-image"
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              const file = e.target.files[0];
              onFileChange(file);
              e.target.value = '';
            }
          }}
        />
        <label htmlFor="select-image">
          <Button
            type="button"
            variant="default"
            className="cursor-pointer"
            asChild
          >
            <span>
              <Upload className="mr-2 h-4 w-4" />
              Upload Main Image
            </span>
          </Button>
        </label>
      </div>

      {loading && (
        <div className="w-full mt-2">
          <Progress value={progress} />
        </div>
      )}

      {imageUrl && (
        <div className="mt-4 relative w-48">
          <img src={imageUrl} alt="Uploaded" className="imagePreview rounded-md" />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2"
            onClick={handleImageRemove}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default ImageUpload;
