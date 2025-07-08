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
  ArrowRight
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
  
  // Poll video status
  const { data: video } = useQuery({
    queryKey: [`/api/videos/${videoId}`],
    refetchInterval: 2000,
    enabled: !!videoId,
  });
  
  // Check transcriptions
  const { data: transcriptions } = useQuery({
    queryKey: [`/api/videos/${videoId}/transcriptions`],
    refetchInterval: 2000,
    enabled: !!videoId && video?.status === 'completed',
  });
  
  const [canProceed, setCanProceed] = useState(false);
  
  useEffect(() => {
    // Check if we can proceed to workspace
    if (video?.status === 'completed' && transcriptions && transcriptions.length > 0) {
      // Verify transcriptions have actual content
      const hasContent = transcriptions.some((t: any) => t.text && t.text.length > 0);
      setCanProceed(hasContent);
    }
  }, [video, transcriptions]);
  
  const getProcessingSteps = (): ProcessingStep[] => {
    const steps: ProcessingStep[] = [
      {
        id: 'upload',
        name: 'Video Upload',
        status: 'completed',
        message: video?.originalName || 'Video uploaded successfully'
      }
    ];
    
    if (video?.status === 'processing') {
      steps.push({
        id: 'transcription',
        name: 'Transcribing Bengali Audio',
        status: 'processing',
        message: 'Extracting and transcribing audio...'
      });
      steps.push({
        id: 'translation',
        name: 'Translating to Multiple Languages',
        status: 'pending',
        message: 'Will translate to English, Hindi, Tamil, Telugu, Malayalam'
      });
    } else if (video?.status === 'completed') {
      steps.push({
        id: 'transcription',
        name: 'Transcribing Bengali Audio',
        status: 'completed',
        message: `Found ${transcriptions?.length || 0} segments`
      });
      
      if (transcriptions && transcriptions.length > 0) {
        steps.push({
          id: 'translation',
          name: 'Translating to Multiple Languages',
          status: 'completed',
          message: 'Translations completed for all languages'
        });
      } else {
        steps.push({
          id: 'translation',
          name: 'Translating to Multiple Languages',
          status: 'processing',
          message: 'Processing translations...'
        });
      }
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
          {isProcessing && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Please wait while we process your video. This may take a few minutes depending on the video length.
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
            
            {video?.status === 'failed' && (
              <Button 
                variant="outline"
                onClick={() => setLocation('/')}
                className="flex-1"
              >
                Upload New Video
              </Button>
            )}
            
            {isProcessing && (
              <Button variant="outline" disabled className="flex-1">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
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