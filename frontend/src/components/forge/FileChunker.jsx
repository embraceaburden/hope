import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Upload, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks

export default function FileChunker({ onUploadComplete, acceptedTypes = '*' }) {
  const [file, setFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [currentChunk, setCurrentChunk] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setUploadStatus(null);
      setUploadProgress(0);
    }
  };

  const uploadChunkedFile = async () => {
    if (!file) return;

    setIsUploading(true);
    setUploadStatus(null);
    setUploadProgress(0);

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    setTotalChunks(totalChunks);

    try {
      const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const chunks = [];

      // Upload chunks
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        setCurrentChunk(i + 1);

        // Create a new File object for this chunk
        const chunkFile = new File([chunk], `${file.name}.part${i}`, {
          type: file.type
        });

        // Upload chunk
        const { file_url } = await base44.integrations.Core.UploadFile({ 
          file: chunkFile 
        });

        chunks.push({
          index: i,
          url: file_url,
          size: chunk.size
        });

        // Update progress
        const progress = Math.round(((i + 1) / totalChunks) * 100);
        setUploadProgress(progress);
      }

      // Store metadata about chunked upload
      const metadata = {
        upload_id: uploadId,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        total_chunks: totalChunks,
        chunk_size: CHUNK_SIZE,
        chunks: chunks,
        upload_complete: true,
        timestamp: new Date().toISOString()
      };

      setUploadStatus('success');
      setIsUploading(false);

      if (onUploadComplete) {
        onUploadComplete(metadata);
      }

    } catch (error) {
      console.error('Chunked upload failed:', error);
      setUploadStatus('error');
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  return (
    <Card className="glass-panel">
      <CardContent className="p-6 space-y-4">
        {/* File Input */}
        <div className="border-2 border-dashed border-[var(--color-gold)]/30 rounded-lg p-8 text-center hover:border-[var(--color-gold)] transition-colors cursor-pointer bg-[var(--color-satin)]">
          <input
            type="file"
            id="chunked-file-input"
            className="hidden"
            onChange={handleFileSelect}
            accept={acceptedTypes}
            disabled={isUploading}
          />
          <label htmlFor="chunked-file-input" className="cursor-pointer">
            <Upload className="h-12 w-12 mx-auto mb-3 text-[var(--color-gold)]" />
            <p className="font-semibold text-[var(--color-pine-teal)] mb-1">
              {file ? file.name : 'Select Large File'}
            </p>
            <p className="text-sm text-gray-500">
              {file 
                ? `${formatFileSize(file.size)} • ${Math.ceil(file.size / CHUNK_SIZE)} chunks`
                : 'Supports files up to 10GB with chunked upload'
              }
            </p>
          </label>
        </div>

        {/* Upload Progress */}
        {isUploading && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-pine-teal)] font-medium">
                Uploading chunk {currentChunk} of {totalChunks}
              </span>
              <span className="text-[var(--color-gold)] font-bold">
                {uploadProgress}%
              </span>
            </div>
            <Progress value={uploadProgress} className="h-3" />
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Processing chunks for vector transport...</span>
            </div>
          </div>
        )}

        {/* Success State */}
        {uploadStatus === 'success' && (
          <div className="p-4 rounded-lg bg-green-50 border-2 border-green-200">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="font-semibold text-green-900">Upload Complete</p>
                <p className="text-sm text-green-700">
                  {totalChunks} chunks uploaded successfully
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error State */}
        {uploadStatus === 'error' && (
          <div className="p-4 rounded-lg bg-red-50 border-2 border-red-200">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <div>
                <p className="font-semibold text-red-900">Upload Failed</p>
                <p className="text-sm text-red-700">
                  Chunk upload failed. Please try again.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Upload Button */}
        {file && !isUploading && uploadStatus !== 'success' && (
          <Button
            onClick={uploadChunkedFile}
            className="w-full heritage-gradient-light text-white"
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload {formatFileSize(file.size)} in {Math.ceil(file.size / CHUNK_SIZE)} Chunks
          </Button>
        )}
      </CardContent>
    </Card>
  );
}