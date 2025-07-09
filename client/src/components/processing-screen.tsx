import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle, Clock, Upload, Mic, Languages, Volume2, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

interface ProcessingScreenProps {
  videoId: string;
  videoName: string;
  onRetry?: () => void;
}

interface ProcessingStep {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  error?: string;
}

export function ProcessingScreen({ videoId, videoName, onRetry }: ProcessingScreenProps) {
  const [startTime] = useState(Date.now());
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const [steps, setSteps] = useState<ProcessingStep[]>([
    {
      id: 'upload',
      name: 'Video Upload',
      description: 'Video file uploaded and validated',
      icon: Upload,
      status: 'completed'
    },
    {
      id: 'transcription',
      name: 'Multi-Model Transcription',
      description: 'Using OpenAI Whisper, Gemini 2.5 Pro, and ElevenLabs STT',
      icon: Mic,
      status: 'processing',
      progress: 0
    },
    {
      id: 'review',
      name: 'Ready for Review',
      description: 'Bengali transcription ready for manual confirmation',
      icon: Languages,
      status: 'pending'
    }
  ]);
  
  const getElapsedTime = () => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const { data: video, error: videoError } = useQuery({
    queryKey: ['/api/videos', videoId],
    refetchInterval: 2000,
    enabled: !!videoId && !hasTimedOut,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  const { data: transcriptions, error: transcriptionError } = useQuery({
    queryKey: ['/api/videos', videoId, 'transcriptions'],
    refetchInterval: 3000,
    enabled: !!videoId && !hasTimedOut,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
  
  // Timeout handling - 10 minutes
  useEffect(() => {
    const timeoutDuration = 10 * 60 * 1000; // 10 minutes
    const timer = setTimeout(() => {
      if (video?.status === 'processing') {
        setHasTimedOut(true);
        setSteps(prev => prev.map(step => 
          step.id === 'transcription' 
            ? { ...step, status: 'failed' as const, error: `Processing timed out after ${getElapsedTime()}` }
            : step
        ));
      }
    }, timeoutDuration);
    
    return () => clearTimeout(timer);
  }, [video?.status]);

  const { data: translations } = useQuery({
    queryKey: ['/api/videos', videoId, 'translations'],
    refetchInterval: 3000,
    enabled: !!videoId && !!transcriptions?.length
  });

  // Update steps based on actual progress
  useEffect(() => {
    if (!video) return;

    setSteps(prev => prev.map(step => {
      switch (step.id) {
        case 'transcription':
          if (video.status === 'failed') {
            return { ...step, status: 'failed', error: 'Transcription failed. Please check API keys and try again.' };
          }
          if (transcriptions?.length > 0) {
            return { ...step, status: 'completed', progress: 100 };
          }
          if (video.status === 'processing') {
            return { ...step, status: 'processing', progress: Math.min(90, (step.progress || 0) + 5) };
          }
          return step;

        case 'translation':
          if (transcriptions?.length > 0) {
            if (translations?.length > 0) {
              return { ...step, status: 'completed' };
            }
            return { ...step, status: 'processing', progress: 50 };
          }
          return step;

        case 'dubbing':
          if (video.status === 'completed' && translations?.length > 0) {
            return { ...step, status: 'processing' };
          }
          return step;

        default:
          return step;
      }
    }));
  }, [video, transcriptions, translations]);

  const overallProgress = steps.reduce((acc, step) => {
    if (step.status === 'completed') return acc + 25;
    if (step.status === 'processing') return acc + (step.progress || 0) / 4;
    return acc;
  }, 0);

  const hasErrors = steps.some(step => step.status === 'failed');
  const isCompleted = steps.every(step => step.status === 'completed');

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            {isCompleted ? (
              <CheckCircle className="w-6 h-6 text-green-600" />
            ) : hasErrors ? (
              <AlertCircle className="w-6 h-6 text-red-600" />
            ) : (
              <Clock className="w-6 h-6 text-blue-600 animate-pulse" />
            )}
            Processing Video
          </CardTitle>
          <p className="text-slate-600 truncate">{videoName}</p>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Overall Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Overall Progress</span>
              <span className="font-medium">{Math.round(overallProgress)}%</span>
            </div>
            <Progress value={overallProgress} className="h-2" />
          </div>

          {/* Processing Steps */}
          <div className="space-y-4">
            {steps.map((step, index) => {
              const IconComponent = step.icon;
              return (
                <div key={step.id} className="flex items-start gap-4 p-4 bg-white rounded-lg border">
                  <div className="flex-shrink-0 mt-0.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      step.status === 'completed' ? 'bg-green-100 text-green-600' :
                      step.status === 'processing' ? 'bg-blue-100 text-blue-600' :
                      step.status === 'failed' ? 'bg-red-100 text-red-600' :
                      'bg-slate-100 text-slate-400'
                    }`}>
                      <IconComponent className="w-4 h-4" />
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-slate-900">{step.name}</h3>
                      <Badge variant={
                        step.status === 'completed' ? 'default' :
                        step.status === 'processing' ? 'secondary' :
                        step.status === 'failed' ? 'destructive' :
                        'outline'
                      } className="text-xs">
                        {step.status === 'processing' && (
                          <div className="w-2 h-2 bg-current rounded-full animate-pulse mr-1" />
                        )}
                        {step.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600 mb-2">{step.description}</p>
                    
                    {step.status === 'processing' && step.progress !== undefined && (
                      <Progress value={step.progress} className="h-1" />
                    )}
                    
                    {step.error && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 inline mr-1" />
                        {step.error}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Actions */}
          {hasErrors && onRetry && (
            <div className="flex justify-center pt-4">
              <Button onClick={onRetry} variant="outline">
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry Processing
              </Button>
            </div>
          )}

          {/* Debug Info */}
          {process.env.NODE_ENV === 'development' && (
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer font-medium">Debug Information</summary>
              <pre className="mt-2 p-2 bg-slate-100 rounded text-xs overflow-auto">
                {JSON.stringify({ 
                  videoStatus: video?.status,
                  transcriptionsCount: transcriptions?.length || 0,
                  translationsCount: translations?.length || 0,
                  videoId 
                }, null, 2)}
              </pre>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  );
}