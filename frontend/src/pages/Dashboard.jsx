import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { 
  Zap, Package, Database, Shield, TrendingUp, 
  Clock, CheckCircle2, AlertCircle, Activity,
  Upload, Download, Settings, WifiOff, Wifi, Play
} from 'lucide-react';

import AIOrchestrator from '../components/forge/AIOrchestrator';
import PipelineVisualizer from '../components/forge/PipelineVisualizer';
import StatsCard from '../components/forge/StatsCard';
import OfflineToolPanel from '../components/forge/OfflineToolPanel';
import FileChunker from '../components/forge/FileChunker';
import EnhancedJobCreator from '../components/forge/EnhancedJobCreator';
import FlowerButton from '../components/forge/FlowerButton';
import { forgeApi } from '../components/forge/forgeApi';
import {
  enqueueEncapsulationJob,
  getQueuedEncapsulationCount,
  getQueuedEncapsulationJobs,
  rebuildFile,
  removeQueuedEncapsulationJob
} from '../lib/offlineQueue';
import { toast } from 'sonner';

export default function Dashboard() {
  const [selectedJob, setSelectedJob] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [systemMode, setSystemMode] = useState('online');
  const [autoOffline, setAutoOffline] = useState(false);
  const [backendReachable, setBackendReachable] = useState(true);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);
  const queryClient = useQueryClient();

  const [config] = useState(() => ({
    mode: 'online',
    backend_url: import.meta.env.VITE_FORGE_BACKEND_URL || 'http://localhost:5000',
    theme: 'light',
    ai_orchestrator_enabled: true
  }));

  const toggleMode = () => {
    setAutoOffline(false);
    setSystemMode((mode) => (mode === 'online' ? 'offline' : 'online'));
  };

  const refreshOfflineQueueCount = async () => {
    try {
      const count = await getQueuedEncapsulationCount();
      setOfflineQueueCount(count);
    } catch (error) {
      console.warn('Failed to read offline queue count:', error);
    }
  };

  const enqueueOfflineJob = async ({ targetFiles, carrierImage, options }) => {
    const record = await enqueueEncapsulationJob({ targetFiles, carrierImage, options });
    await refreshOfflineQueueCount();
    return record;
  };

  const syncOfflineQueue = async () => {
    if (isSyncingQueue) return;
    setIsSyncingQueue(true);
    try {
      const queuedJobs = await getQueuedEncapsulationJobs();
      if (!queuedJobs.length) {
        return;
      }
      let syncedCount = 0;
      for (const job of queuedJobs) {
        try {
          const targetFiles = job.targetFiles.map(rebuildFile);
          const carrierImage = job.carrierImage ? rebuildFile(job.carrierImage) : null;
          if (!carrierImage) {
            throw new Error('Queued job missing carrier image.');
          }
          await forgeApi.encapsulateWithBaseUrl(
            config.backend_url,
            targetFiles,
            carrierImage,
            job.options || {}
          );
          await removeQueuedEncapsulationJob(job.id);
          syncedCount += 1;
        } catch (error) {
          console.warn('Failed to sync offline job:', error);
        }
      }
      if (syncedCount > 0) {
        queryClient.invalidateQueries({ queryKey: ['processingJobs'] });
        toast.success(`Synced ${syncedCount} offline job${syncedCount === 1 ? '' : 's'}.`);
      }
    } finally {
      setIsSyncingQueue(false);
      await refreshOfflineQueueCount();
    }
  };

  const fetchJobs = async () => {
    try {
      const response = await fetch(`${config.backend_url}/api/jobs`);
      if (!response.ok) {
        throw new Error(`Failed to fetch jobs: ${response.statusText}`);
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        return data;
      }
      return data.jobs || [];
    } catch (error) {
      console.warn('Job fetch failed:', error);
      return [];
    }
  };

  // Fetch processing jobs
  const { data: jobs = [] } = useQuery({
    queryKey: ['processingJobs', config.backend_url],
    queryFn: fetchJobs,
    initialData: [],
    refetchInterval: systemMode === 'online' && backendReachable ? 2000 : false
  });

  // Calculate statistics
  const stats = React.useMemo(() => {
    const total = jobs.length;
    const completed = jobs.filter(j => j.status === 'completed').length;
    const failed = jobs.filter(j => j.status === 'failed').length;
    const active = jobs.filter(j => 
      !['completed', 'failed', 'cancelled'].includes(j.status)
    ).length;

    const avgCompression = jobs
      .filter(j => j.pipeline_metadata?.compression_ratio)
      .reduce((sum, j) => sum + j.pipeline_metadata.compression_ratio, 0) / 
      (jobs.filter(j => j.pipeline_metadata?.compression_ratio).length || 1);

    const successRate = total > 0 ? ((completed / total) * 100).toFixed(1) : 0;

    return {
      total,
      completed,
      failed,
      active,
      avgCompression: avgCompression.toFixed(2),
      successRate
    };
  }, [jobs]);

  // Get recent active job
  useEffect(() => {
    const activeJob = jobs.find(j => 
      !['completed', 'failed', 'cancelled'].includes(j.status)
    );
    if (activeJob && !selectedJob) {
      setSelectedJob(activeJob);
    }
  }, [jobs, selectedJob]);

  useEffect(() => {
    refreshOfflineQueueCount();
  }, []);

  useEffect(() => {
    let isMounted = true;
    const checkConnectivity = async () => {
      if (!navigator.onLine) {
        if (!isMounted) return;
        setBackendReachable(false);
        if (systemMode === 'online') {
          setSystemMode('offline');
          setAutoOffline(true);
        }
        return;
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      try {
        const response = await fetch(`${config.backend_url}/`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) {
          throw new Error(`Health check failed: ${response.status}`);
        }
        if (!isMounted) return;
        setBackendReachable(true);
        if (autoOffline) {
          setSystemMode('online');
          setAutoOffline(false);
        }
      } catch (error) {
        clearTimeout(timeoutId);
        if (!isMounted) return;
        setBackendReachable(false);
        if (systemMode === 'online') {
          setSystemMode('offline');
          setAutoOffline(true);
        }
      }
    };

    const runCheck = () => {
      checkConnectivity().catch((error) => console.warn('Connectivity check failed:', error));
    };

    runCheck();
    const intervalId = setInterval(runCheck, 5000);

    const handleOnline = () => runCheck();
    const handleOffline = () => {
      if (!isMounted) return;
      setBackendReachable(false);
      if (systemMode === 'online') {
        setSystemMode('offline');
        setAutoOffline(true);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [autoOffline, config.backend_url, systemMode]);

  useEffect(() => {
    if (systemMode === 'online' && backendReachable) {
      syncOfflineQueue();
    }
  }, [systemMode, backendReachable]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      default: return 'bg-blue-100 text-blue-800';
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{
        background: 'linear-gradient(135deg, var(--color-satin) 25%, var(--color-muted) 50%, var(--color-satin) 100%)'
      }}
    >
      {/* Header */}
      <header
        className="border-b backdrop-blur-lg sticky top-0 z-40"
        style={{
          borderColor: 'rgba(188, 128, 77, 0.4)',
          background: 'rgba(236, 235, 234, 0.7)'
        }}
      >
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3" style={{ color: 'var(--color-pine-teal)' }}>
                <div
                  className="h-10 w-10 rounded-lg flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, var(--color-gold) 50%, var(--color-copper) 100%)' }}
                >
                  <Zap className="h-6 w-6 text-white" />
                </div>
                The Forge
              </h1>
              <p className="text-sm mt-1" style={{ color: '#6b7280' }}>
                Anti-Counterfeiting & Data-Embedding Engine
              </p>
            </div>
            
            <div className="flex items-center gap-6">
              {/* Flower Button */}
              <FlowerButton
                mainIcon={Zap}
                petalActions={[
                  { 
                    icon: Play, 
                    label: 'New Job',
                    onClick: () => setActiveTab('overview')
                  },
                  { 
                    icon: Download, 
                    label: 'Downloads',
                    onClick: () => setActiveTab('history')
                  },
                  { 
                    icon: Settings, 
                    label: 'Settings',
                    onClick: () => console.log('Settings')
                  }
                ]}
              />

              {/* Mode Toggle */}
              <Button
                variant="outline"
                onClick={toggleMode}
                style={{ borderColor: 'var(--color-gold)', color: 'var(--color-pine-teal)' }}
              >
                {systemMode === 'online' ? (
                  <>
                    <Wifi className="h-4 w-4 mr-2" />
                    Online
                  </>
                ) : (
                  <>
                    <WifiOff className="h-4 w-4 mr-2" />
                    Offline
                  </>
                )}
              </Button>
              {offlineQueueCount > 0 && (
                <Badge className="bg-orange-100 text-orange-800">
                  {offlineQueueCount} queued
                </Badge>
              )}

              <Badge
                className="text-white px-4 py-2"
                style={{ background: 'linear-gradient(135deg, var(--color-gold) 30%, var(--color-copper) 100%)' }}
              >
                <Activity className="h-3 w-3 mr-2" />
                {stats.active} Active
              </Badge>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList
            className="mb-6"
            style={{
              background: 'rgba(236, 235, 234, 0.7)',
              border: '2px solid rgba(188, 128, 77, 0.5)'
            }}
          >
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="pipeline">Pipeline Monitor</TabsTrigger>
            <TabsTrigger value="offline">Offline Tools</TabsTrigger>
            <TabsTrigger value="history">Job History</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatsCard
                title="Total Jobs"
                value={stats.total}
                icon={Package}
                trend="up"
                trendValue=""
              />
              <StatsCard
                title="Completed"
                value={stats.completed}
                icon={CheckCircle2}
              />
              <StatsCard
                title="Avg Compression"
                value={`${stats.avgCompression}x`}
                icon={Database}
              />
              <StatsCard
                title="Success Rate"
                value={`${stats.successRate}%`}
                icon={TrendingUp}
              />
            </div>

            {/* Job Creator */}
            <EnhancedJobCreator 
              backendUrl={config.backend_url}
              isOfflineMode={systemMode === 'offline'}
              onQueueJob={enqueueOfflineJob}
              onJobCreated={(job) => {
                queryClient.invalidateQueries({ queryKey: ['processingJobs'] });
                setSelectedJob(job);
                setActiveTab('pipeline');
              }}
            />

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              {/* Active Pipeline */}
              <div>
                <PipelineVisualizer 
                  job={selectedJob} 
                  jobType={selectedJob?.job_type || 'embed'}
                />
              </div>

              {/* Recent Jobs */}
              <Card style={{ background: 'rgba(255, 255, 255, 0.75)', backdropFilter: 'blur(12px)', border: '2px solid rgba(188, 128, 77, 0.4)', boxShadow: '0 8px 32px rgba(12, 65, 76, 0.2)', borderRadius: '12px' }}>
                <CardHeader className="border-b" style={{ borderColor: 'rgba(188, 128, 77, 0.4)' }}>
                  <CardTitle style={{ color: 'var(--color-pine-teal)' }}>
                    Recent Jobs
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-[var(--color-gold)]/10">
                    {jobs.slice(0, 8).map(job => (
                      <button
                        key={job.id}
                        onClick={() => setSelectedJob(job)}
                        className="w-full p-4 text-left transition-colors"
                        style={selectedJob?.id === job.id ? { background: 'var(--color-satin)' } : {}}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-satin)'}
                        onMouseLeave={(e) => { if (selectedJob?.id !== job.id) e.currentTarget.style.background = 'transparent' }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm" style={{ color: 'var(--color-pine-teal)' }}>
                            {job.job_id || job.id.substring(0, 8)}
                          </span>
                          <Badge className={getStatusColor(job.status)}>
                            {job.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs" style={{ color: '#6b7280' }}>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(job.created_date).toLocaleTimeString()}
                          </span>
                          <span className="capitalize">{job.job_type}</span>
                        </div>
                        {job.progress > 0 && job.status !== 'completed' && (
                          <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-mist)' }}>
                            <div 
                              className="h-full"
                              style={{ width: `${job.progress}%`, background: 'linear-gradient(135deg, var(--color-gold) 0%, var(--color-copper) 100%)' }}
                            />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Pipeline Monitor Tab */}
          <TabsContent value="pipeline">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <PipelineVisualizer 
                  job={selectedJob} 
                  jobType={selectedJob?.job_type || 'embed'}
                />
              </div>
              <div>
               <Card style={{ background: 'rgba(255, 255, 255, 0.75)', backdropFilter: 'blur(12px)', border: '1px solid rgba(188, 128, 77, 0.25)', boxShadow: '0 8px 32px rgba(12, 65, 76, 0.08)', borderRadius: '12px' }}>
                 <CardHeader>
                   <CardTitle style={{ color: 'var(--color-pine-teal)' }}>
                     Job Details
                   </CardTitle>
                 </CardHeader>
                  <CardContent className="space-y-4">
                    {selectedJob ? (
                      <>
                        <div>
                          <label className="text-xs" style={{ color: '#6b7280' }}>Job ID</label>
                          <p className="text-sm font-mono">{selectedJob.job_id || selectedJob.id}</p>
                        </div>
                        <div>
                          <label className="text-xs" style={{ color: '#6b7280' }}>Type</label>
                          <p className="text-sm capitalize">{selectedJob.job_type}</p>
                        </div>
                        <div>
                          <label className="text-xs" style={{ color: '#6b7280' }}>Status</label>
                          <Badge className={getStatusColor(selectedJob.status)}>
                            {selectedJob.status}
                          </Badge>
                        </div>
                        {selectedJob.configuration && (
                        <div>
                          <label className="text-xs" style={{ color: '#6b7280' }}>Configuration</label>
                          <pre className="text-xs mt-1 p-2 rounded" style={{ background: 'var(--color-satin)' }}>
                              {JSON.stringify(selectedJob.configuration, null, 2)}
                          </pre>
                        </div>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-center py-8" style={{ color: '#6b7280' }}>
                        No job selected
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Offline Tools Tab */}
          <TabsContent value="offline" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <FileChunker
                onUploadComplete={(metadata) => {
                  console.log('Chunked upload complete:', metadata);
                  // Can be used with AI or manual tools
                }}
                acceptedTypes="*"
              />
              <OfflineToolPanel 
                backendUrl={config.backend_url} 
                isOfflineMode={systemMode === 'offline'}
              />
            </div>
          </TabsContent>

          {/* Job History Tab */}
          <TabsContent value="history">
            <Card style={{ background: 'rgba(255, 255, 255, 0.75)', backdropFilter: 'blur(12px)', border: '1px solid rgba(188, 128, 77, 0.25)', boxShadow: '0 8px 32px rgba(12, 65, 76, 0.08)', borderRadius: '12px' }}>
              <CardHeader>
                <CardTitle style={{ color: 'var(--color-pine-teal)' }}>
                  Complete Job History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {jobs.map(job => (
                    <div
                      key={job.id}
                      className="p-4 rounded-lg border transition-colors cursor-pointer"
                      style={{ borderColor: 'rgba(188, 128, 77, 0.2)' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-satin)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      onClick={() => {
                        setSelectedJob(job);
                        setActiveTab('pipeline');
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium" style={{ color: 'var(--color-pine-teal)' }}>
                            {job.job_id || job.id}
                          </p>
                          <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
                            {new Date(job.created_date).toLocaleString()} • {job.job_type}
                          </p>
                        </div>
                        <Badge className={getStatusColor(job.status)}>
                          {job.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* AI Orchestrator - Floating */}
      {systemMode === 'online' && config.ai_orchestrator_enabled !== false && (
        <AIOrchestrator 
          onJobCreate={(jobData) => {
            queryClient.invalidateQueries({ queryKey: ['processingJobs'] });
          }}
          onConfigUpdate={(configData) => {
            queryClient.invalidateQueries({ queryKey: ['systemConfig'] });
          }}
        />
      )}
    </div>
  );
}
