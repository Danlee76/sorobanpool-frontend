'use client';

import { useState, useRef } from 'react';

export interface UploadedImage {
  id: string;
  file: File;
  preview: string;
  order: number;
}

interface MultiImageUploadProps {
  onImagesChange: (images: UploadedImage[]) => void;
  maxImages?: number;
  maxSizeBytes?: number;
  acceptedFormats?: string[];
}

/**
 * Multi-image upload component with drag-and-drop support and ordering.
 * Allows users to upload multiple images, preview them, and reorder them.
 */
export function MultiImageUpload({
  onImagesChange,
  maxImages = 10,
  maxSizeBytes = 5 * 1024 * 1024, // 5MB default
  acceptedFormats = ['image/jpeg', 'image/png', 'image/webp'],
}: MultiImageUploadProps) {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList) => {
    const newImages: UploadedImage[] = [];

    Array.from(files).forEach((file) => {
      // Validate file type
      if (!acceptedFormats.includes(file.type)) {
        console.error(`File type ${file.type} not accepted`);
        return;
      }

      // Validate file size
      if (file.size > maxSizeBytes) {
        console.error(`File size ${file.size} exceeds max ${maxSizeBytes}`);
        return;
      }

      // Check max images limit
      if (images.length + newImages.length >= maxImages) {
        console.warn(`Maximum ${maxImages} images allowed`);
        return;
      }

      const preview = URL.createObjectURL(file);
      newImages.push({
        id: `${Date.now()}-${Math.random()}`,
        file,
        preview,
        order: images.length + newImages.length,
      });
    });

    const updated = [...images, ...newImages];
    setImages(updated);
    onImagesChange(updated);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const removeImage = (id: string) => {
    const updated = images.filter((img) => img.id !== id);
    setImages(updated);
    onImagesChange(updated);
  };

  const moveImage = (id: string, direction: 'up' | 'down') => {
    const index = images.findIndex((img) => img.id === id);
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === images.length - 1)) {
      return;
    }

    const updated = [...images];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];

    // Update order
    updated.forEach((img, idx) => {
      img.order = idx;
    });

    setImages(updated);
    onImagesChange(updated);
  };

  return (
    <div className="space-y-4">
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptedFormats.join(',')}
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          className="hidden"
        />
        <p className="text-gray-600">
          Drag and drop images here or click to select
        </p>
        <p className="text-sm text-gray-500 mt-2">
          {images.length} / {maxImages} images
        </p>
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {images.map((image, index) => (
            <div key={image.id} className="relative group">
              <img
                src={image.preview}
                alt={`Upload ${index + 1}`}
                className="w-full h-32 object-cover rounded-lg"
              />
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 rounded-lg transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                {index > 0 && (
                  <button
                    onClick={() => moveImage(image.id, 'up')}
                    className="p-2 bg-white rounded-full hover:bg-gray-200"
                    title="Move up"
                  >
                    ↑
                  </button>
                )}
                {index < images.length - 1 && (
                  <button
                    onClick={() => moveImage(image.id, 'down')}
                    className="p-2 bg-white rounded-full hover:bg-gray-200"
                    title="Move down"
                  >
                    ↓
                  </button>
                )}
                <button
                  onClick={() => removeImage(image.id)}
                  className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600"
                  title="Remove"
                >
                  ×
                </button>
              </div>
              <div className="absolute top-1 left-1 bg-black text-white text-xs px-2 py-1 rounded">
                {index + 1}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
