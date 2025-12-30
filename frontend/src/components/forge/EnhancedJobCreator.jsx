import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Upload, Image, Lock, Zap, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { forgeApi } from './forgeApi';
import { useWebSocket } from './useWebSocket';
import { toast } from 'sonner';

export default function EnhancedJobCreator({ onJobCreated, backendUrl, isOfflineMode = false, onQueueJob }) {
  const [targetFiles, setTargetFiles] = useState([]);
  const [carrierImage, setCarrierImage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const {
    subscribeToJob,
    connectionState,
    retryAttempt,
    maxRetries,
    lastError
  } = useWebSocket(backendUrl);
  
  // Options
  const [compressionMode, setCompressionMode] = useState('high-ratio');
  const [noiseLevel, setNoiseLevel] = useState(30);
  const [encryption, setEncryption] = useState('aes-256-gcm');
  const [hashing, setHashing] = useState('sha-256');
  const [passphrase, setPassphrase] = useState('');
  const [keyIterations, setKeyIterations] = useState(100000);

  const handleSubmit = async () => {
    if (targetFiles.length === 0) {
      toast.error('Please select files to embed');
      return;
    }
    if (!carrierImage) {
      toast.error('Please select a carrier image');
      return;
    }
    if (!passphrase) {
      toast.error('Please enter a passphrase');
      return;
    }

    setIsProcessing(true);

    const options = {
      compression_mode: compressionMode,
      noise_level: noiseLevel,
      encryption,
      hashing,
      passphrase,
      key_iterations: keyIterations
    };

    try {
      if (isOfflineMode && onQueueJob) {
        const queuedJob = await onQueueJob({ targetFiles, carrierImage, options });
        toast.success(`Queued job ${queuedJob.id} for sync.`);
        if (onJobCreated) {
          onJobCreated({ jobId: queuedJob.id, status: 'queued', offline: true });
        }
        return;
      }

      const result = await forgeApi.encapsulate(targetFiles, carrierImage, options);

      toast.success('Job created successfully!');

      // Subscribe to WebSocket updates
      subscribeToJob(result.jobId, (update) => {
        console.log('Job update:', update);
      });

      if (onJobCreated) {
        onJobCreated(result);
      }
    } catch (error) {
      toast.error(`Failed to create job: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const statusLabel = (() => {
    if (connectionState === 'missing-token') {
      return 'Socket auth token missing';
    }
    if (connectionState === 'reconnecting') {
      return `Reconnecting (${retryAttempt}/${maxRetries})`;
    }
    if (connectionState === 'failed') {
      return 'Reconnect failed';
    }
    if (connectionState === 'error') {
      return lastError?.message || 'Connection error';
    }
    return connectionState.replace('-', ' ');
  })();

  const statusTone = (() => {
    if (connectionState === 'connected') return 'text-emerald-600';
    if (connectionState === 'reconnecting') return 'text-amber-600';
    if (connectionState === 'missing-token' || connectionState === 'failed' || connectionState === 'error') {
      return 'text-red-600';
    }
    return 'text-gray-500';
  })();

  return (
    <Card className="glass-panel">
      <CardHeader className="border-b border-[var(--color-gold)]/20 heritage-gradient-subtle">
        <CardTitle className="text-[var(--color-pine-teal)] flex items-center gap-2">
          <Zap className="h-5 w-5 text-[var(--color-gold)]" />
          Create Encapsulation Job
        </CardTitle>
        <p className={`text-xs ${statusTone}`}>
          Socket status: {statusLabel}
        </p>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {/* Target Files */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Target Files to Embed
          </Label>
          <Input
            type="file"
            multiple
            onChange={(e) => setTargetFiles(Array.from(e.target.files))}
            className="border-[var(--color-gold)]/30"
          />
          {targetFiles.length > 0 && (
            <p className="text-xs text-gray-600">
              {targetFiles.length} file(s) selected
            </p>
          )}
        </div>

        {/* Carrier Image */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Image className="h-4 w-4" />
            Carrier Image
          </Label>
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => setCarrierImage(e.target.files[0])}
            className="border-[var(--color-gold)]/30"
          />
          {carrierImage && (
            <p className="text-xs text-gray-600">{carrierImage.name}</p>
          )}
        </div>

        {/* Security Options */}
        <div className="p-4 rounded-lg bg-[var(--color-satin)] space-y-4">
          <h4 className="font-semibold text-sm text-[var(--color-pine-teal)] flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Security Configuration
          </h4>

          <div className="space-y-2">
            <Label>Encryption</Label>
            <Select value={encryption} onValueChange={setEncryption}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="aes-256-gcm">AES-256-GCM</SelectItem>
                <SelectItem value="chacha20-poly1305">ChaCha20-Poly1305</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Hashing Algorithm</Label>
            <Select value={hashing} onValueChange={setHashing}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sha-256">SHA-256</SelectItem>
                <SelectItem value="blake2s">BLAKE2s</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Passphrase</Label>
            <Input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Enter secure passphrase"
              className="border-[var(--color-gold)]/30"
            />
          </div>
        </div>

        {/* Compression Options */}
        <div className="p-4 rounded-lg bg-[var(--color-satin)] space-y-4">
          <h4 className="font-semibold text-sm text-[var(--color-pine-teal)]">
            Compression & Embedding
          </h4>

          <div className="space-y-2">
            <Label>Compression Mode</Label>
            <Select value={compressionMode} onValueChange={setCompressionMode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lossless">Lossless</SelectItem>
                <SelectItem value="high-ratio">High Ratio (Neuroglyph + Zstandard)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Noise Level: {noiseLevel}%</Label>
            <Slider
              value={[noiseLevel]}
              onValueChange={(val) => setNoiseLevel(val[0])}
              min={0}
              max={100}
              step={1}
              className="[&_[role=slider]]:bg-[var(--color-gold)]"
            />
          </div>

          <div className="space-y-2">
            <Label>PBKDF2 Iterations</Label>
            <Input
              type="number"
              value={keyIterations}
              onChange={(e) => setKeyIterations(parseInt(e.target.value))}
              className="border-[var(--color-gold)]/30"
            />
          </div>
        </div>

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          disabled={isProcessing}
          className="w-full heritage-gradient-light text-white h-12 text-lg"
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Creating Job...
            </>
          ) : (
            <>
              <Zap className="h-5 w-5 mr-2" />
              Start Encapsulation
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
