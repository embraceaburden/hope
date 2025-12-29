import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { 
  Zap, Lock, Database, Shuffle, Eye, Shield, 
  Upload, Download, FileText, Terminal, Settings
} from 'lucide-react';

export default function Documentation() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[var(--color-satin)] via-white to-[var(--color-satin)] p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-[var(--color-pine-teal)] mb-3">
            The Forge Documentation
          </h1>
          <p className="text-lg text-gray-600">
            World's most advanced anti-counterfeiting and data-embedding engine
          </p>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-white/50">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="embed">Embedding</TabsTrigger>
            <TabsTrigger value="extract">Extraction</TabsTrigger>
            <TabsTrigger value="ai">AI Orchestrator</TabsTrigger>
            <TabsTrigger value="offline">Offline Mode</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview" className="space-y-6">
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle className="text-[var(--color-pine-teal)]">
                  What is The Forge?
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-700">
                  The Forge is a cutting-edge steganographic pipeline that combines multiple advanced technologies 
                  to embed data into images with military-grade security. It's designed for enterprise clients 
                  like Nike and Louis Vuitton to protect against counterfeiting.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  <div className="p-4 rounded-lg border border-[var(--color-gold)]/30 bg-[var(--color-satin)]">
                    <Database className="h-8 w-8 text-[var(--color-gold)] mb-3" />
                    <h4 className="font-semibold text-[var(--color-pine-teal)] mb-2">
                      Hyper-Compression
                    </h4>
                    <p className="text-sm text-gray-600">
                      Zstandard compression achieving 500x+ ratios with Neuroglyph optimization
                    </p>
                  </div>

                  <div className="p-4 rounded-lg border border-[var(--color-gold)]/30 bg-[var(--color-satin)]">
                    <Shuffle className="h-8 w-8 text-[var(--color-gold)] mb-3" />
                    <h4 className="font-semibold text-[var(--color-pine-teal)] mb-2">
                      Geometric Scrambling
                    </h4>
                    <p className="text-sm text-gray-600">
                      PassageMath polyhedral mapping creates unique, mathematically-derived keys
                    </p>
                  </div>

                  <div className="p-4 rounded-lg border border-[var(--color-gold)]/30 bg-[var(--color-satin)]">
                    <Eye className="h-8 w-8 text-[var(--color-gold)] mb-3" />
                    <h4 className="font-semibold text-[var(--color-pine-teal)] mb-2">
                      Steganographic Embedding
                    </h4>
                    <p className="text-sm text-gray-600">
                      StegoImageX hides data in images, invisible to the human eye and analysis tools
                    </p>
                  </div>

                  <div className="p-4 rounded-lg border border-[var(--color-gold)]/30 bg-[var(--color-satin)]">
                    <Lock className="h-8 w-8 text-[var(--color-gold)] mb-3" />
                    <h4 className="font-semibold text-[var(--color-pine-teal)] mb-2">
                      Cryptographic Sealing
                    </h4>
                    <p className="text-sm text-gray-600">
                      AES-256-GCM encryption ensures tampering is immediately detectable
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-panel">
              <CardHeader>
                <CardTitle className="text-[var(--color-pine-teal)]">
                  Key Features
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <Zap className="h-5 w-5 text-[var(--color-gold)] flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">AI-Guided Pipeline:</span>
                      <span className="text-gray-600 ml-2">
                        Intelligent orchestration with stage-gate validation
                      </span>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <Shield className="h-5 w-5 text-[var(--color-gold)] flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">Multi-Layer Security:</span>
                      <span className="text-gray-600 ml-2">
                        Compression, scrambling, embedding, and encryption combined
                      </span>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <Terminal className="h-5 w-5 text-[var(--color-gold)] flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">Offline Capable:</span>
                      <span className="text-gray-600 ml-2">
                        Disaster relief and blackout operation support
                      </span>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <Settings className="h-5 w-5 text-[var(--color-gold)] flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">Fully Configurable:</span>
                      <span className="text-gray-600 ml-2">
                        Customize compression levels, polytopes, security modes
                      </span>
                    </div>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Embedding Pipeline */}
          <TabsContent value="embed" className="space-y-6">
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle className="text-[var(--color-pine-teal)]">
                  Embedding Pipeline Stages
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  {[
                    {
                      stage: 'Preparation',
                      desc: 'Data validation, cleaning, and normalization using Pydantic',
                      tech: 'Pydantic, Pillow'
                    },
                    {
                      stage: 'Compression',
                      desc: 'Hyper-compression with Zstandard (level 22) achieving 500x+ ratios',
                      tech: 'Zstandard, Neuroglyph'
                    },
                    {
                      stage: 'Geometric Mapping',
                      desc: 'PassageMath polyhedral mapping creates unique scrambling patterns',
                      tech: 'PassageMath-polyhedra'
                    },
                    {
                      stage: 'Steganographic Embedding',
                      desc: 'StegoImageX hides compressed data in carrier image pixels',
                      tech: 'StegoImageX, Pillow'
                    },
                    {
                      stage: 'Cryptographic Sealing',
                      desc: 'AES-256-GCM encryption with alpha layer masking',
                      tech: 'PyCryptodome'
                    }
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-start gap-4 p-4 rounded-lg bg-[var(--color-satin)]">
                      <div className="flex-shrink-0 h-10 w-10 rounded-full heritage-gradient-light flex items-center justify-center text-white font-bold">
                        {idx + 1}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-[var(--color-pine-teal)] mb-1">
                          {item.stage}
                        </h4>
                        <p className="text-sm text-gray-600 mb-2">{item.desc}</p>
                        <Badge className="bg-[var(--color-gold)]/20 text-[var(--color-pine-teal)]">
                          {item.tech}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="glass-panel">
              <CardHeader>
                <CardTitle className="text-[var(--color-pine-teal)]">
                  Configuration Parameters
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Compression Level (1-22)</h4>
                    <p className="text-sm text-gray-600">
                      Higher levels = better compression but slower. Level 22 recommended for maximum density.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Security Mode</h4>
                    <p className="text-sm text-gray-600">
                      <strong>Standard:</strong> Basic protection • <strong>High:</strong> Recommended for enterprise • 
                      <strong>Ultra:</strong> Maximum security with multi-layer scrambling
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Polytope Type</h4>
                    <p className="text-sm text-gray-600">
                      Geometric shape for scrambling: Cube (fastest), Grand Antiprism (balanced), Regular Polygon (most secure)
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Extraction Pipeline */}
          <TabsContent value="extract" className="space-y-6">
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle className="text-[var(--color-pine-teal)]">
                  Extraction Pipeline Stages
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <p className="text-gray-700">
                  The extraction process reverses the embedding pipeline to restore original data:
                </p>

                <div className="space-y-4">
                  {[
                    { stage: 'Unlock & Decrypt', desc: 'AES-GCM decryption with authentication' },
                    { stage: 'Unmask', desc: 'Separate alpha and embedded layers' },
                    { stage: 'Extract', desc: 'Retrieve hidden data from image pixels' },
                    { stage: 'Unshuffle', desc: 'Reverse geometric scrambling' },
                    { stage: 'Decompress', desc: 'Zstandard decompression' },
                    { stage: 'Verify', desc: 'Data integrity check with auto-repair' }
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-center gap-4 p-3 rounded-lg border border-[var(--color-gold)]/30">
                      <div className="flex-shrink-0 h-8 w-8 rounded-full bg-[var(--color-gold)]/20 flex items-center justify-center text-[var(--color-pine-teal)] font-bold text-sm">
                        {idx + 1}
                      </div>
                      <div>
                        <h4 className="font-semibold text-[var(--color-pine-teal)]">{item.stage}</h4>
                        <p className="text-sm text-gray-600">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="glass-panel bg-blue-50 border-blue-200">
              <CardContent className="p-6">
                <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Auto-Repair Feature
                </h4>
                <p className="text-sm text-blue-700">
                  If data is damaged, ScaleNx and Inpaint algorithms automatically reconstruct missing information 
                  using AI-powered interpolation. This ensures data recovery even from physically damaged media.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI Orchestrator */}
          <TabsContent value="ai" className="space-y-6">
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle className="text-[var(--color-pine-teal)]">
                  AI Orchestrator Guide
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-700">
                  The floating AI chat interface provides intelligent guidance through the entire pipeline:
                </p>

                <div className="space-y-3">
                  <div className="p-4 rounded-lg bg-[var(--color-satin)]">
                    <h4 className="font-semibold mb-2">Stage-Gate Validation</h4>
                    <p className="text-sm text-gray-600">
                      The AI asks for files, validates them against requirements (DPI, alpha channels, size), 
                      and suggests enhancements before processing.
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-[var(--color-satin)]">
                    <h4 className="font-semibold mb-2">Context-Aware Configuration</h4>
                    <p className="text-sm text-gray-600">
                      Mention "500x compression" and it auto-enables high-security mode. Say "batch of 100" 
                      and it switches to batch processing mode.
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-[var(--color-satin)]">
                    <h4 className="font-semibold mb-2">Natural Language Errors</h4>
                    <p className="text-sm text-gray-600">
                      Technical errors are translated to human-readable explanations with "Fix & Retry" options.
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-[var(--color-satin)]">
                    <h4 className="font-semibold mb-2">Real-Time Tool Visualization</h4>
                    <p className="text-sm text-gray-600">
                      Watch each backend tool execute with live progress indicators and parameter displays.
                    </p>
                  </div>
                </div>

                <div className="mt-6 p-4 rounded-lg border-2 border-[var(--color-gold)]">
                  <h4 className="font-semibold mb-3">Example Interactions:</h4>
                  <ul className="space-y-2 text-sm text-gray-700">
                    <li>💬 "Embed this logo with maximum security"</li>
                    <li>💬 "Extract the hidden data from this image"</li>
                    <li>💬 "Process 50 product images in batch"</li>
                    <li>💬 "Use cube polytope with level 20 compression"</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Offline Mode */}
          <TabsContent value="offline" className="space-y-6">
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle className="text-[var(--color-pine-teal)]">
                  Offline Mode Operation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-700">
                  The Forge is designed for disaster relief and blackout scenarios where internet connectivity is unavailable.
                </p>

                <div className="p-4 rounded-lg bg-amber-50 border-2 border-amber-200">
                  <h4 className="font-semibold text-amber-900 mb-2">When to Use Offline Mode:</h4>
                  <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
                    <li>Disaster relief operations</li>
                    <li>Remote locations without connectivity</li>
                    <li>Power outages affecting network infrastructure</li>
                    <li>Secure environments requiring air-gapped operation</li>
                  </ul>
                </div>

                <h4 className="font-semibold mt-6 mb-3">Offline Tool Panel Features:</h4>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <Terminal className="h-5 w-5 text-[var(--color-gold)] flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">Direct Tool Execution:</span>
                      <span className="text-gray-600 ml-2">
                        Manually trigger any pipeline stage without AI guidance
                      </span>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <Settings className="h-5 w-5 text-[var(--color-gold)] flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">Manual Configuration:</span>
                      <span className="text-gray-600 ml-2">
                        Set all parameters manually for each tool
                      </span>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <FileText className="h-5 w-5 text-[var(--color-gold)] flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">Local File Processing:</span>
                      <span className="text-gray-600 ml-2">
                        Upload and process files entirely on local infrastructure
                      </span>
                    </div>
                  </li>
                </ul>

                <div className="mt-6 p-4 rounded-lg bg-green-50 border-2 border-green-200">
                  <h4 className="font-semibold text-green-900 mb-2">Toggle Modes:</h4>
                  <p className="text-sm text-green-800">
                    Use the Online/Offline toggle in the header to switch between AI-assisted and manual operation. 
                    The system automatically adapts the interface based on your selection.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}