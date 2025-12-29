import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  WifiOff, Play, Upload, Download, Settings, 
  AlertCircle, CheckCircle2, Loader2
} from 'lucide-react';
import { toast } from 'sonner';

const PIPELINE_TOOLS = {
  embed: [
    { id: 'preparation', name: 'Preparation', endpoint: '/prepare' },
    { id: 'compression', name: 'Compression', endpoint: '/compress' },
    { id: 'mapping', name: 'Geometric Mapping', endpoint: '/map' },
    { id: 'embedding', name: 'Steganographic Embed', endpoint: '/embed' },
    { id: 'sealing', name: 'Cryptographic Seal', endpoint: '/seal' }
  ],
  extract: [
    { id: 'unlock', name: 'Unlock & Decrypt', endpoint: '/unlock' },
    { id: 'unmask', name: 'Unmask Layers', endpoint: '/unmask' },
    { id: 'extract', name: 'Extract Data', endpoint: '/extract' },
    { id: 'unshuffle', name: 'Geometric Unshuffle', endpoint: '/unshuffle' },
    { id: 'decompress', name: 'Decompress', endpoint: '/decompress' },
    { id: 'verify', name: 'Verify & Restore', endpoint: '/verify' }
  ]
};

export default function OfflineToolPanel({ backendUrl, isOfflineMode }) {
  const [activeTab, setActiveTab] = useState('embed');
  const [selectedTool, setSelectedTool] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [formData, setFormData] = useState({});
  const [uploadedFile, setUploadedFile] = useState(null);

  const tools = PIPELINE_TOOLS[activeTab];

  const handleToolExecute = async () => {
    if (!selectedTool) {
      toast.error('Please select a tool first');
      return;
    }

    if (!uploadedFile) {
      toast.error('Please upload a file first');
      return;
    }

    setIsProcessing(true);
    setResult(null);

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('file', uploadedFile);
      Object.keys(formData).forEach(key => {
        formDataToSend.append(key, formData[key]);
      });

      const response = await fetch(`${backendUrl}${selectedTool.endpoint}`, {
        method: 'POST',
        body: formDataToSend
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setResult({ success: true, data });
      toast.success(`${selectedTool.name} completed successfully`);
    } catch (error) {
      setResult({ success: false, error: error.message });
      toast.error(`${selectedTool.name} failed: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setUploadedFile(file);
      toast.success(`File loaded: ${file.name}`);
    }
  };

  return (
    <Card className="glass-panel">
      <CardHeader className="border-b border-[var(--color-gold)]/20">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-[var(--color-pine-teal)]">
            <WifiOff className="h-5 w-5" />
            Offline Tool Execution
          </CardTitle>
          {isOfflineMode && (
            <Badge className="bg-orange-100 text-orange-800">
              Offline Mode Active
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="embed">Embed Pipeline</TabsTrigger>
            <TabsTrigger value="extract">Extract Pipeline</TabsTrigger>
          </TabsList>

          <div className="space-y-6">
            {/* Tool Selection */}
            <div className="space-y-2">
              <Label>Select Tool</Label>
              <Select 
                value={selectedTool?.id} 
                onValueChange={(id) => setSelectedTool(tools.find(t => t.id === id))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a pipeline tool..." />
                </SelectTrigger>
                <SelectContent>
                  {tools.map(tool => (
                    <SelectItem key={tool.id} value={tool.id}>
                      {tool.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* File Upload */}
            <div className="space-y-2">
              <Label>Input File</Label>
              <div className="flex gap-2">
                <Input
                  type="file"
                  onChange={handleFileUpload}
                  className="flex-1"
                />
                {uploadedFile && (
                  <Badge className="self-center bg-green-100 text-green-800">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {uploadedFile.name}
                  </Badge>
                )}
              </div>
            </div>

            {/* Tool-specific parameters */}
            {selectedTool && (
              <div className="space-y-4 p-4 bg-[var(--color-satin)] rounded-lg">
                <h4 className="font-semibold text-sm text-[var(--color-pine-teal)]">
                  Configuration Parameters
                </h4>
                
                {activeTab === 'embed' && (
                  <>
                    {['compression', 'mapping', 'sealing'].includes(selectedTool.id) && (
                      <div className="space-y-2">
                        <Label className="text-xs">Compression Level (1-22)</Label>
                        <Input
                          type="number"
                          min="1"
                          max="22"
                          defaultValue="22"
                          onChange={(e) => setFormData({...formData, compression_level: e.target.value})}
                        />
                      </div>
                    )}
                    {['mapping', 'embedding'].includes(selectedTool.id) && (
                      <div className="space-y-2">
                        <Label className="text-xs">Polytope Type</Label>
                        <Select 
                          onValueChange={(v) => setFormData({...formData, polytope_type: v})}
                          defaultValue="cube"
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cube">Cube</SelectItem>
                            <SelectItem value="grand_antiprism">Grand Antiprism</SelectItem>
                            <SelectItem value="regular_polygon">Regular Polygon</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {selectedTool.id === 'sealing' && (
                      <div className="space-y-2">
                        <Label className="text-xs">Password</Label>
                        <Input
                          type="password"
                          placeholder="Enter encryption password"
                          onChange={(e) => setFormData({...formData, password: e.target.value})}
                        />
                      </div>
                    )}
                  </>
                )}

                {activeTab === 'extract' && selectedTool.id === 'unlock' && (
                  <div className="space-y-2">
                    <Label className="text-xs">Decryption Password</Label>
                    <Input
                      type="password"
                      placeholder="Enter decryption password"
                      onChange={(e) => setFormData({...formData, password: e.target.value})}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Execute Button */}
            <Button
              onClick={handleToolExecute}
              disabled={!selectedTool || !uploadedFile || isProcessing}
              className="w-full heritage-gradient-light text-white"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Execute {selectedTool?.name || 'Tool'}
                </>
              )}
            </Button>

            {/* Result Display */}
            {result && (
              <div className={`p-4 rounded-lg border-2 ${
                result.success 
                  ? 'bg-green-50 border-green-300' 
                  : 'bg-red-50 border-red-300'
              }`}>
                <div className="flex items-start gap-3">
                  {result.success ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <h4 className={`font-semibold mb-2 ${
                      result.success ? 'text-green-900' : 'text-red-900'
                    }`}>
                      {result.success ? 'Success' : 'Error'}
                    </h4>
                    <pre className="text-xs overflow-auto max-h-48 bg-white/50 p-2 rounded">
                      {JSON.stringify(result.success ? result.data : result.error, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Tabs>

        {/* Backend URL Display */}
        <div className="mt-6 pt-4 border-t border-[var(--color-gold)]/20">
          <div className="text-xs text-gray-500">
            <span className="font-medium">Backend:</span> {backendUrl || 'Not configured'}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}