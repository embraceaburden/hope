import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle2, Circle, Loader2, AlertCircle, 
  ArrowRight, Lock, Unlock, Eye, EyeOff, 
  Zap, Database, Shuffle, Package, Shield
} from 'lucide-react';
import { cn } from '@/lib/utils';
import PolytopeVisualizer from './PolytopeVisualizer';

const EMBED_STAGES = [
  { key: 'validation', label: 'Validation', icon: Package, description: 'Validating & cleaning input data', phase: 1 },
  { key: 'neuroglyph', label: 'Neuroglyph Wrap', icon: Zap, description: 'Neural compression preprocessing', phase: 1 },
  { key: 'zstandard', label: 'Zstandard Compression', icon: Database, description: 'Hyper-compression (22 levels)', phase: 1 },
  { key: 'geometricMapping', label: 'Geometric Mapping', icon: Shuffle, description: 'PassageMath polytope mapping', phase: 2 },
  { key: 'shuffling', label: 'Shuffling', icon: Shuffle, description: 'Deterministic scrambling', phase: 2 },
  { key: 'embedding', label: 'Steganographic Embed', icon: EyeOff, description: 'StegoImageX adaptive LSB', phase: 2 },
  { key: 'unscrambling', label: 'Unscrambling', icon: Shuffle, description: 'Inverse geometric transform', phase: 3 },
  { key: 'masking', label: 'Alpha Masking', icon: Eye, description: '10% transparency guard layer', phase: 3 },
  { key: 'encryption', label: 'Cryptographic Seal', icon: Lock, description: 'AES-256-GCM encryption', phase: 3 },
  { key: 'completed', label: 'Complete', icon: CheckCircle2, description: 'Package ready for deployment', phase: 3 }
];

const EXTRACT_STAGES = [
  { key: 'validation', label: 'Decrypt', icon: Unlock, description: 'AES-256-GCM decryption', phase: 1 },
  { key: 'masking', label: 'Unmask', icon: Eye, description: 'Alpha layer separation', phase: 1 },
  { key: 'embedding', label: 'Extract', icon: EyeOff, description: 'StegoImageX extraction', phase: 2 },
  { key: 'unscrambling', label: 'Unshuffle', icon: Shuffle, description: 'Geometric unscrambling', phase: 2 },
  { key: 'geometricMapping', label: 'Inverse Mapping', icon: Shuffle, description: 'PassageMath inverse', phase: 2 },
  { key: 'zstandard', label: 'Decompress Zstandard', icon: Database, description: 'Zstandard decompression', phase: 3 },
  { key: 'neuroglyph', label: 'Unwrap Neuroglyph', icon: Zap, description: 'Neural decompression', phase: 3 },
  { key: 'completed', label: 'Verify & Restore', icon: Shield, description: 'Data integrity check', phase: 3 }
];

export default function PipelineVisualizer({ job, jobType = 'embed' }) {
  const [currentStage, setCurrentStage] = useState(job?.status || 'queued');
  const stages = jobType === 'embed' ? EMBED_STAGES : EXTRACT_STAGES;

  useEffect(() => {
    if (job?.status) {
      setCurrentStage(job.status);
    }
  }, [job?.status]);

  const getStageStatus = (stageKey) => {
    const stageIndex = stages.findIndex(s => s.key === stageKey);
    const currentIndex = stages.findIndex(s => s.key === currentStage);

    if (currentIndex === -1) return 'pending';
    if (stageIndex < currentIndex) return 'completed';
    if (stageIndex === currentIndex) return 'active';
    return 'pending';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'text-green-600';
      case 'active': return 'text-[var(--color-gold)]';
      case 'failed': return 'text-[var(--color-copper)]';
      default: return 'text-gray-400';
    }
  };

  const getStatusBg = (status) => {
    switch (status) {
      case 'completed': return 'bg-green-100 border-green-300';
      case 'active': return 'bg-[var(--color-gold)]/20 border-[var(--color-gold)]';
      case 'failed': return 'bg-[var(--color-copper)]/20 border-[var(--color-copper)]';
      default: return 'bg-gray-100 border-gray-300';
    }
  };

  if (!job) {
    return (
      <Card className="glass-panel">
        <CardContent className="p-8 text-center">
          <Zap className="h-12 w-12 mx-auto mb-4 text-[var(--color-gold)]" />
          <p className="text-[var(--color-pine-teal)] font-medium">No active pipeline</p>
          <p className="text-sm text-gray-500 mt-2">Start a job to see the visualization</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-panel overflow-hidden">
      <CardHeader className="border-b border-[var(--color-gold)]/20 heritage-gradient-subtle">
        <div className="flex items-center justify-between">
          <CardTitle className="text-[var(--color-pine-teal)]">
            {jobType === 'embed' ? 'Embedding' : 'Extraction'} Pipeline
          </CardTitle>
          <Badge className={cn(
            'text-xs',
            job.status === 'completed' && 'bg-green-100 text-green-800',
            job.status === 'failed' && 'bg-red-100 text-red-800',
            !['completed', 'failed'].includes(job.status) && 'bg-blue-100 text-blue-800'
          )}>
            {job.status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-6">
        {/* Phase Indicator */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          {[1, 2, 3].map(phaseNum => (
            <div 
              key={phaseNum}
              className={cn(
                'p-3 rounded-lg border-2 transition-all',
                job.phase >= phaseNum 
                  ? 'heritage-gradient-light border-[var(--color-gold)] text-white' 
                  : 'bg-gray-100 border-gray-300 text-gray-400'
              )}
            >
              <div className="text-xs font-medium">Phase {phaseNum}</div>
              <div className="text-[10px] mt-1">
                {phaseNum === 1 && 'Triple-Smack'}
                {phaseNum === 2 && 'Geometric'}
                {phaseNum === 3 && 'Security'}
              </div>
            </div>
          ))}
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-[var(--color-pine-teal)]">Overall Progress</span>
            <span className="text-sm font-bold text-[var(--color-gold)]">{job.progress || 0}%</span>
          </div>
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full heritage-gradient-light transition-all duration-500 ease-out relative"
              style={{ width: `${job.progress || 0}%` }}
            >
              <div className="absolute inset-0 bg-white/20 animate-pulse" />
            </div>
          </div>
        </div>

        {/* Pipeline Stages */}
        <div className="space-y-4">
          {stages.map((stage, index) => {
            const status = getStageStatus(stage.key);
            const Icon = stage.icon;
            const isActive = status === 'active';
            const isCompleted = status === 'completed';
            const isPending = status === 'pending';

            return (
              <div key={stage.key} className="relative">
                {/* Connector Line */}
                {index < stages.length - 1 && (
                  <div 
                    className={cn(
                      'absolute left-6 top-12 w-0.5 h-8 transition-colors',
                      isCompleted ? 'bg-green-500' : 'bg-gray-300'
                    )}
                  />
                )}

                {/* Stage Card */}
                <div className={cn(
                  'flex items-start gap-4 p-4 rounded-lg border-2 transition-all duration-300',
                  getStatusBg(status),
                  isActive && 'shadow-lg scale-[1.02]'
                )}>
                  <div className={cn(
                    'flex-shrink-0 h-12 w-12 rounded-full flex items-center justify-center border-2 transition-all',
                    isCompleted && 'bg-green-500 border-green-600',
                    isActive && 'heritage-gradient-light border-[var(--color-gold)] shadow-lg',
                    isPending && 'bg-white border-gray-300'
                  )}>
                    {isActive ? (
                      <Loader2 className="h-6 w-6 text-white animate-spin" />
                    ) : (
                      <Icon className={cn(
                        'h-6 w-6',
                        isCompleted && 'text-white',
                        isPending && 'text-gray-400',
                        isActive && 'text-white'
                      )} />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className={cn(
                        'font-semibold',
                        getStatusColor(status)
                      )}>
                        {stage.label}
                      </h4>
                      {isCompleted && (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{stage.description}</p>
                    
                    {/* Stage-specific metadata */}
                    {isActive && job.progress && (
                      <div className="mt-2 text-xs text-gray-500">
                        {stage.key === 'neuroglyph' && job.progress?.neuroglyph && (
                          <span>Neural wrap: {job.progress.neuroglyph}%</span>
                        )}
                        {stage.key === 'zstandard' && job.progress?.zstandard && (
                          <span>Compression: {job.progress.zstandard}%</span>
                        )}
                        {stage.key === 'geometricMapping' && job.progress?.geometricMapping && (
                          <span>Mapping: {job.progress.geometricMapping}%</span>
                        )}
                        {stage.key === 'embedding' && job.progress?.embedding && (
                          <span>Embedding: {job.progress.embedding}%</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Error Display */}
        {job.status === 'failed' && job.error_log && (
          <div className="mt-6 p-4 bg-red-50 border-2 border-red-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-red-900 mb-1">Pipeline Error</h4>
                <p className="text-sm text-red-700">{job.error_log}</p>
              </div>
            </div>
          </div>
        )}

        {/* Metadata Display */}
        {job.status === 'completed' && job.pipeline_metadata && (
          <div className="mt-6 p-4 bg-green-50 border-2 border-green-200 rounded-lg">
            <h4 className="font-semibold text-green-900 mb-3">Pipeline Metadata</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {job.pipeline_metadata.compression_ratio && (
                <div>
                  <span className="text-gray-600">Compression:</span>
                  <span className="ml-2 font-medium text-green-800">
                    {job.pipeline_metadata.compression_ratio.toFixed(2)}x
                  </span>
                </div>
              )}
              {job.processing_time && (
                <div>
                  <span className="text-gray-600">Processing Time:</span>
                  <span className="ml-2 font-medium text-green-800">
                    {job.processing_time.toFixed(2)}s
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3D Polytope Visualization */}
        {job.configuration?.polytope_type && ['mapping', 'embedding', 'sealing', 'completed'].includes(job.status) && (
          <div className="mt-6">
            <PolytopeVisualizer
              polytopeType={job.configuration.polytope_type}
              permutationKey={job.pipeline_metadata?.permutation_key}
              isActive={['mapping', 'embedding'].includes(job.status)}
            />
          </div>
        )}
        </CardContent>
        </Card>
        );
        }