import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  Loader2, 
  FileVideo,
  Languages,
  Mic,
  ArrowRight,
  RefreshCw
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface ProcessingStep {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  message?: string;
}

export default function ProcessingStatusPage() {
  const params = useParams() as { videoId: string };
  const [, setLocation] = useLocation();
  const videoId = params.videoId;
  const [startTime] = useState(Date.now());
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const { toast } = useToast();
  
  // Poll video status with error handling
  const { data: video, error: videoError } = useQuery({
    queryKey: [`/api/videos/${videoId}`],
    refetchInterval: 2000,
    enabled: !!videoId && !hasTimedOut,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
  
  // Check transcriptions with error handling  
  const { data: transcriptions, error: transcriptionError } = useQuery({
    queryKey: [`/api/videos/${videoId}/transcriptions`],
    refetchInterval: 2000,
    enabled: !!videoId && video?.status === 'completed' && !hasTimedOut,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
  
  const [canProceed, setCanProceed] = useState(false);
  
  // Timeout handling - 10 minutes for transcription
  useEffect(() => {
    const timeoutDuration = 10 * 60 * 1000; // 10 minutes
    const timer = setTimeout(() => {
      if (video?.status === 'processing') {
        setHasTimedOut(true);
        toast({
          title: "Processing Timeout",
          description: "Transcription is taking longer than expected. You can retry or check back later.",
          variant: "destructive",
        });
      }
    }, timeoutDuration);
    
    return () => clearTimeout(timer);
  }, [video?.status, toast]);
  
  // Error handling
  useEffect(() => {
    if (videoError || transcriptionError) {
      toast({
        title: "Connection Error", 
        description: "Having trouble connecting to the server. Retrying automatically...",
        variant: "destructive",
      });
    }
  }, [videoError, transcriptionError, toast]);
  
  useEffect(() => {
    // Handle analysis completion - redirect to service selection
    if (video?.status === 'analyzed') {
      const timer = setTimeout(() => {
        toast({
          title: "Analysis Complete",
          description: "Video analyzed successfully! Please select your desired services.",
        });
        setLocation(`/select-services/${videoId}`);
      }, 2000);
      
      return () => clearTimeout(timer);
    }
    
    // Check if we can proceed to workspace (after services have been selected and processing is complete)
    if (video?.status === 'completed' && transcriptions && transcriptions.length > 0) {
      // Verify transcriptions have actual content
      const hasContent = transcriptions.some((t: any) => t.text && t.text.length > 0);
      setCanProceed(hasContent);
      
      // Auto-redirect to workspace when ready for review
      if (hasContent) {
        const timer = setTimeout(() => {
          toast({
            title: "Ready for Review",
            description: "Processing completed! Redirecting to workspace...",
          });
          setLocation(`/workspace/${videoId}`);
        }, 2000); // 2 second delay to show completion status
        
        return () => clearTimeout(timer);
      }
    }
  }, [video, transcriptions, videoId, setLocation, toast]);
  
  const getElapsedTime = () => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };
  
  const getProcessingSteps = (): ProcessingStep[] => {
    const steps: ProcessingStep[] = [
      {
        id: 'upload',
        name: 'Video Upload',
        status: 'completed',
        message: video?.originalName || 'Video uploaded successfully'
      }
    ];
    
    // Handle analyzing phase
    if (video?.status === 'analyzing') {
      steps.push({
        id: 'analysis',
        name: 'Video Analysis',
        status: 'processing',
        message: `Analyzing video and detecting source language... ${getElapsedTime()}`
      });
      
      steps.push({
        id: 'service-selection',
        name: 'Service Selection',
        status: 'pending',
        message: 'Waiting for analysis to complete'
      });
    } else if (video?.status === 'analyzed') {
      steps.push({
        id: 'analysis',
        name: 'Video Analysis',
        status: 'completed',
        message: `Source language detected: ${video.sourceLanguage || 'Unknown'}`
      });
      
      steps.push({
        id: 'service-selection',
        name: 'Service Selection',
        status: 'processing',
        message: 'Ready to select transcription, translation, and dubbing services'
      });
    } else if (video?.status === 'processing') {
      if (hasTimedOut) {
        steps.push({
          id: 'transcription',
          name: 'Transcribing Bengali Audio',
          status: 'failed',
          message: `Processing timed out after ${getElapsedTime()}. This may be due to high server load or a long video.`
        });
      } else {
        steps.push({
          id: 'transcription',
          name: 'Transcribing Bengali Audio',
          status: 'processing',
          message: `Processing for ${getElapsedTime()}... Using multiple AI models for best accuracy.`
        });
      }
      
      // Add model-specific status if available
      steps.push({
        id: 'models',
        name: 'AI Model Processing',
        status: 'processing',
        message: 'Running OpenAI Whisper, Gemini 2.5 Pro, and ElevenLabs STT in parallel'
      });
      // Translation is now manual, not automatic
      steps.push({
        id: 'review',
        name: 'Ready for Review',
        status: 'pending',
        message: 'Review and confirm Bengali transcription before translation'
      });
    } else if (video?.status === 'completed') {
      steps.push({
        id: 'transcription',
        name: 'Transcribing Bengali Audio',
        status: 'completed',
        message: `Found ${transcriptions?.length || 0} segments`
      });
      
      // Translation is manual, not automatic
      steps.push({
        id: 'review',
        name: 'Ready for Review',
        status: 'completed',
        message: 'Bengali transcription ready for review and manual translation'
      });
    } else if (video?.status === 'failed') {
      steps.push({
        id: 'transcription',
        name: 'Transcribing Bengali Audio',
        status: 'failed',
        message: 'Failed to transcribe audio'
      });
    }
    
    return steps;
  };
  
  const steps = getProcessingSteps();
  const isProcessing = video?.status === 'processing' || (video?.status === 'completed' && !canProceed);
  
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileVideo className="w-6 h-6" />
            Processing Your Video
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Progress Steps */}
          <div className="space-y-4">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-start gap-4">
                <div className="mt-1">
                  {step.status === 'completed' && (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  )}
                  {step.status === 'processing' && (
                    <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                  )}
                  {step.status === 'pending' && (
                    <Clock className="w-5 h-5 text-slate-400" />
                  )}
                  {step.status === 'failed' && (
                    <AlertCircle className="w-5 h-5 text-red-600" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{step.name}</span>
                    <Badge 
                      variant={
                        step.status === 'completed' ? 'default' : 
                        step.status === 'processing' ? 'secondary' :
                        step.status === 'failed' ? 'destructive' : 'outline'
                      }
                      className="text-xs"
                    >
                      {step.status}
                    </Badge>
                  </div>
                  {step.message && (
                    <p className="text-sm text-slate-600 mt-1">{step.message}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {/* Status Message */}
          {isProcessing && !hasTimedOut && (
            <Alert>
              <Clock className="h-4 w-4" />
              <AlertDescription>
                Processing your video with AI transcription models. This typically takes 2-5 minutes for a 15-minute video.
                <br />
                <span className="text-sm font-mono">Elapsed time: {getElapsedTime()}</span>
              </AlertDescription>
            </Alert>
          )}
          
          {hasTimedOut && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Processing timed out after 10 minutes. This might be due to:
                <ul className="list-disc ml-4 mt-2">
                  <li>Very long video file</li>
                  <li>High server load</li>
                  <li>API rate limiting</li>
                </ul>
                You can retry processing or try again later.
              </AlertDescription>
            </Alert>
          )}
          
          {video?.status === 'failed' && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Video processing failed. Please try uploading again or contact support.
              </AlertDescription>
            </Alert>
          )}
          
          {/* Action Buttons */}
          <div className="flex gap-3">
            {canProceed && (
              <Button 
                onClick={() => setLocation(`/workspace/${videoId}`)}
                className="flex-1"
              >
                Continue to Subtitles
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )}
            
            {(video?.status === 'failed' || hasTimedOut) && (
              <>
                <Button 
                  variant="outline"
                  onClick={async () => {
                    setHasTimedOut(false);
                    setRetryCount(prev => prev + 1);
                    try {
                      const response = await fetch(`/api/videos/${videoId}/retry`, { method: 'POST' });
                      if (response.ok) {
                        toast({
                          title: "Retry initiated",
                          description: "Video processing has been restarted",
                        });
                      }
                    } catch (error) {
                      toast({
                        title: "Retry failed",
                        description: "Could not restart processing. Please try again.",
                        variant: "destructive",
                      });
                    }
                  }}
                  className="flex-1"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retry Processing {retryCount > 0 && `(${retryCount})`}
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => setLocation('/')}
                  className="flex-1"
                >
                  Upload New Video
                </Button>
              </>
            )}
            
            {isProcessing && !hasTimedOut && (
              <Button variant="outline" disabled className="flex-1">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing... ({getElapsedTime()})
              </Button>
            )}
          </div>
          
          {/* Debug Info (remove in production) */}
          {process.env.NODE_ENV === 'development' && (
            <div className="text-xs text-slate-500 border-t pt-4 mt-4">
              <p>Video Status: {video?.status}</p>
              <p>Transcriptions: {transcriptions?.length || 0}</p>
              <p>Can Proceed: {canProceed ? 'Yes' : 'No'}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}