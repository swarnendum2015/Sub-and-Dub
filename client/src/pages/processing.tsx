import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, CheckCircle, Clock, Play, Upload, Mic, Languages, Settings, FileText, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";

interface Video {
  id: number;
  filename: string;
  originalName: string;
  filePath: string;
  status: string;
  sourceLanguage?: string;
  sourceLanguageConfidence?: number;
  services?: string[];
  models?: string[];
  targetLanguages?: string[];
  bengaliConfirmed?: boolean;
  duration?: number;
  createdAt: string;
  errorMessage?: string;
}

export default function ProcessingPage() {
  const { videoId } = useParams();
  const [, setLocation] = useLocation();
  const [processingStage, setProcessingStage] = useState<string>('uploading');
  const queryClient = useQueryClient();

  const { data: video, isLoading, error } = useQuery<Video>({
    queryKey: ['/api/videos', videoId],
    enabled: !!videoId,
    refetchInterval: 2000, // Poll every 2 seconds
  });

  const retryMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/videos/${videoId}/retry`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to retry processing');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/videos', videoId] });
    },
  });

  const fixStuckMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/admin/fix-stuck-jobs', {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to fix stuck jobs');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/videos', videoId] });
    },
  });

  // Update processing stage based on video status
  useEffect(() => {
    if (video) {
      switch (video.status) {
        case 'uploading':
          setProcessingStage('uploading');
          break;
        case 'analyzing':
          setProcessingStage('analyzing');
          break;
        case 'analyzed':
          setProcessingStage('analyzed');
          break;
        case 'processing':
          setProcessingStage('transcribing');
          break;
        case 'completed':
          setProcessingStage('completed');
          break;
        case 'failed':
          setProcessingStage('failed');
          break;
        default:
          setProcessingStage('uploading');
      }
    }
  }, [video?.status]);

  // Auto-redirect to workspace when completed
  useEffect(() => {
    if (video?.status === 'completed') {
      const timer = setTimeout(() => {
        setLocation(`/workspace/${videoId}`);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [video?.status, videoId, setLocation]);

  const getProgressPercentage = () => {
    switch (processingStage) {
      case 'uploading': return 10;
      case 'analyzing': return 30;
      case 'analyzed': return 50;
      case 'transcribing': return 75;
      case 'completed': return 100;
      case 'failed': return 0;
      default: return 0;
    }
  };

  const getStatusIcon = () => {
    switch (processingStage) {
      case 'uploading':
        return <Upload className="w-6 h-6 text-blue-600 animate-pulse" />;
      case 'analyzing':
        return <Settings className="w-6 h-6 text-yellow-600 animate-spin" />;
      case 'analyzed':
        return <CheckCircle className="w-6 h-6 text-green-600" />;
      case 'transcribing':
        return <Mic className="w-6 h-6 text-purple-600 animate-pulse" />;
      case 'completed':
        return <CheckCircle className="w-6 h-6 text-green-600" />;
      case 'failed':
        return <AlertCircle className="w-6 h-6 text-red-600" />;
      default:
        return <Clock className="w-6 h-6 text-gray-400" />;
    }
  };

  const getStatusMessage = () => {
    switch (processingStage) {
      case 'uploading':
        return 'Uploading video file...';
      case 'analyzing':
        return 'Analyzing video and detecting language...';
      case 'analyzed':
        return 'Analysis complete. Ready for service selection.';
      case 'transcribing':
        return 'Transcribing video content using AI models...';
      case 'completed':
        return 'Processing complete! Redirecting to workspace...';
      case 'failed':
        return `Processing failed: ${video?.errorMessage || 'Unknown error occurred'}`;
      default:
        return 'Initializing...';
    }
  };

  const handleRetry = () => {
    retryMutation.mutate();
  };

  const handleFixStuck = () => {
    fixStuckMutation.mutate();
  };

  const handleProceedToWorkspace = () => {
    setLocation(`/workspace/${videoId}`);
  };

  const handleSelectServices = () => {
    setLocation(`/select-services/${videoId}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading video information...</p>
        </div>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Video Not Found</h2>
              <p className="text-gray-600 mb-4">
                The video you're looking for doesn't exist or has been removed.
              </p>
              <Button onClick={() => setLocation('/')} variant="outline">
                Back to Upload
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Processing Video</h1>
              <p className="text-sm text-gray-500">{video.originalName}</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => setLocation('/')}>
            Back to Upload
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="space-y-6">
          {/* Progress Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                {getStatusIcon()}
                <span>Processing Status</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">{getStatusMessage()}</p>
                <Badge variant={processingStage === 'failed' ? 'destructive' : 
                              processingStage === 'completed' ? 'default' : 'secondary'}>
                  {processingStage.charAt(0).toUpperCase() + processingStage.slice(1)}
                </Badge>
              </div>
              <Progress value={getProgressPercentage()} className="w-full" />
              
              {/* Processing Steps */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
                <div className={`flex items-center space-x-2 p-3 rounded-lg ${
                  ['uploading', 'analyzing', 'analyzed', 'transcribing', 'completed'].includes(processingStage) 
                    ? 'bg-green-50 text-green-700' 
                    : 'bg-gray-50 text-gray-500'
                }`}>
                  <Upload className="w-4 h-4" />
                  <span className="text-sm font-medium">Upload</span>
                </div>
                
                <div className={`flex items-center space-x-2 p-3 rounded-lg ${
                  ['analyzing', 'analyzed', 'transcribing', 'completed'].includes(processingStage)
                    ? 'bg-green-50 text-green-700' 
                    : processingStage === 'uploading'
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-gray-50 text-gray-500'
                }`}>
                  <Settings className="w-4 h-4" />
                  <span className="text-sm font-medium">Analyze</span>
                </div>
                
                <div className={`flex items-center space-x-2 p-3 rounded-lg ${
                  ['transcribing', 'completed'].includes(processingStage)
                    ? 'bg-green-50 text-green-700'
                    : ['analyzing', 'analyzed'].includes(processingStage)
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-gray-50 text-gray-500'
                }`}>
                  <Mic className="w-4 h-4" />
                  <span className="text-sm font-medium">Transcribe</span>
                </div>
                
                <div className={`flex items-center space-x-2 p-3 rounded-lg ${
                  processingStage === 'completed'
                    ? 'bg-green-50 text-green-700'
                    : ['transcribing'].includes(processingStage)
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-gray-50 text-gray-500'
                }`}>
                  <Languages className="w-4 h-4" />
                  <span className="text-sm font-medium">Complete</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Video Information */}
          <Card>
            <CardHeader>
              <CardTitle>Video Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">File Name</label>
                  <p className="text-sm text-gray-900">{video.originalName}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Status</label>
                  <p className="text-sm text-gray-900 capitalize">{video.status}</p>
                </div>
                {video.sourceLanguage && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Detected Language</label>
                    <p className="text-sm text-gray-900">
                      {video.sourceLanguage.toUpperCase()} 
                      {video.sourceLanguageConfidence && (
                        <span className="text-gray-500 ml-1">
                          ({Math.round(video.sourceLanguageConfidence * 100)}% confidence)
                        </span>
                      )}
                    </p>
                  </div>
                )}
                {video.duration && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Duration</label>
                    <p className="text-sm text-gray-900">
                      {Math.floor(video.duration / 60)}:{(video.duration % 60).toString().padStart(2, '0')}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Error Handling */}
          {processingStage === 'failed' && (
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2 text-red-700">
                  <AlertTriangle className="w-5 h-5" />
                  <span>Processing Failed</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-sm text-red-600">
                    {video.errorMessage || 'An unknown error occurred during processing.'}
                  </p>
                  
                  {video.errorMessage?.includes('quota') && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <div className="flex items-start space-x-2">
                        <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                        <div>
                          <h4 className="text-sm font-medium text-yellow-800">API Quota Exceeded</h4>
                          <p className="text-sm text-yellow-700 mt-1">
                            The AI service has reached its usage limit. This usually resolves automatically after a brief period.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex space-x-3">
                    <Button 
                      onClick={handleRetry} 
                      disabled={retryMutation.isPending}
                      variant="outline"
                    >
                      {retryMutation.isPending ? 'Retrying...' : 'Retry Processing'}
                    </Button>
                    <Button 
                      onClick={handleFixStuck} 
                      disabled={fixStuckMutation.isPending}
                      variant="outline"
                    >
                      {fixStuckMutation.isPending ? 'Fixing...' : 'Fix Stuck Jobs'}
                    </Button>
                    <Button onClick={() => setLocation('/')} variant="secondary">
                      Upload New Video
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          {processingStage === 'analyzed' && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Analysis Complete</h3>
                  <p className="text-gray-600 mb-4">
                    Your video has been analyzed. You can now select transcription and translation services.
                  </p>
                  <div className="flex justify-center space-x-3">
                    <Button onClick={handleSelectServices}>
                      Select Services
                    </Button>
                    <Button onClick={handleProceedToWorkspace} variant="outline">
                      Skip to Workspace
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {processingStage === 'completed' && (
            <Card className="border-green-200">
              <CardContent className="pt-6">
                <div className="text-center">
                  <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Processing Complete!</h3>
                  <p className="text-gray-600 mb-4">
                    Your video has been successfully processed. You can now view transcriptions and manage translations.
                  </p>
                  <Button onClick={handleProceedToWorkspace}>
                    Open Workspace
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}