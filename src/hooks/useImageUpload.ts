'use client';

import { useState } from 'react';
import * as api from '@/services/imageService';

/**
 * Hook for image upload operations
 */
export function useImageUpload() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  const uploadMenuImage = async (file: File) => {
    try {
      setLoading(true);
      setError(null);
      setUploadProgress(0);
      const downloadURL = await api.getMenuImageRef(file);
      setUploadProgress(100);
      return downloadURL;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to upload image');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const uploadImage = async (file: File, type: string, id: string) => {
    try {
      setLoading(true);
      setError(null);
      setUploadProgress(0);
      const downloadURL = await api.getImageRef(file, type, id);
      setUploadProgress(100);
      return downloadURL;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to upload image');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return {
    uploadMenuImage,
    uploadImage,
    loading,
    error,
    uploadProgress,
  };
}
