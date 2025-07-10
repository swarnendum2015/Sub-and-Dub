import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  FileVideo, 
  Mic, 
  Languages,
  BrainCircuit,
  ArrowRight,
  RefreshCw
} from "lucide-react";

export default function ProcessingPage() {
  const { id: videoId } = useParams();
  const [, setLocation] = useLocation();

  const { data: video, refetch } = useQuery({
    queryKey: ['/api/videos', videoId],
    refetchInterval: (data) => {
      // Stop polling when processing is complete
      if (data?.status === 'completed' || data?.status === 'failed') {
        return false;
      }
      return 2000; // Poll every 2 seconds during processing
    },
    enabled: !!videoId,
  });

  const { data: transcriptions = [] } = useQuery({
    queryKey: ['/api/videos', videoId, 'transcriptions'],
    enabled: !!videoId && video?.status === 'completed',
  });

  // Auto-redirect when processing is complete
  useEffect(() => {
    if (video?.status === 'completed' && transcriptions.length > 0) {
      // Small delay to show completion state
      const timer = setTimeout(() => {
        setLocation(`/workspace/${videoId}`);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [video?.status, transcriptions.length, videoId, setLocation]);

  if (!video) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading video details...</p>
        </div>
      </div>
    );
  }

  const getStatusInfo = () => {
    switch (video.status) {
      case 'pending':
        return {
          icon: Clock,
          color: 'bg-yellow-100 text-yellow-800',
          title: 'Queued for Processing',
          description: 'Your video is in the processing queue.',
          progress: 10
        };
      case 'analyzing':
        return {
          icon: BrainCircuit,
          color: 'bg-blue-100 text-blue-800',
          title: 'Analyzing Video',
          description: 'Detecting language and preparing for transcription.',
          progress: 25
        };
      case 'processing':
      case 'transcribing':
        return {
          icon: Mic,
          color: 'bg-purple-100 text-purple-800',
          title: 'Transcribing Audio',
          description: 'Converting speech to text using AI models.',
          progress: 65
        };
      case 'completed':
        return {
          icon: CheckCircle,
          color: 'bg-green-100 text-green-800',
          title: 'Processing Complete',
          description: `Transcription completed with ${transcriptions.length} segments.`,
          progress: 100
        };
      case 'failed':
        return {
          icon: AlertCircle,
          color: 'bg-red-100 text-red-800',
          title: 'Processing Failed',
          description: 'An error occurred during processing.',
          progress: 0
        };
      default:
        return {
          icon: Clock,
          color: 'bg-gray-100 text-gray-800',
          title: 'Unknown Status',
          description: 'Processing status unclear.',
          progress: 0
        };
    }
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Video Processing</h1>
          <p className="text-gray-600">Studio-grade transcription and analysis in progress</p>
        </div>

        {/* Main Status Card */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-3">
                <StatusIcon className="w-6 h-6" />
                <span>{statusInfo.title}</span>
              </CardTitle>
              <Badge className={statusInfo.color}>
                {video.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-gray-600">{statusInfo.description}</p>
              
              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progress</span>
                  <span>{statusInfo.progress}%</span>
                </div>
                <Progress value={statusInfo.progress} className="h-2" />
              </div>

              {/* Processing Steps */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
                <div className={`flex items-center space-x-2 p-3 rounded-lg ${
                  ['analyzing', 'processing', 'transcribing', 'completed'].includes(video.status) 
                    ? 'bg-green-50 text-green-700' 
                    : 'bg-gray-50 text-gray-500'
                }`}>
                  <BrainCircuit className="w-4 h-4" />
                  <span className="text-sm font-medium">Analysis</span>
                  {['analyzing', 'processing', 'transcribing', 'completed'].includes(video.status) && (
                    <CheckCircle className="w-4 h-4" />
                  )}
                </div>
                
                <div className={`flex items-center space-x-2 p-3 rounded-lg ${
                  ['processing', 'transcribing', 'completed'].includes(video.status)
                    ? 'bg-green-50 text-green-700'
                    : video.status === 'analyzing' 
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-gray-50 text-gray-500'
                }`}>
                  <Mic className="w-4 h-4" />
                  <span className="text-sm font-medium">Transcription</span>
                  {['completed'].includes(video.status) && (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  {['processing', 'transcribing'].includes(video.status) && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                </div>
                
                <div className={`flex items-center space-x-2 p-3 rounded-lg ${
                  video.status === 'completed' 
                    ? 'bg-green-50 text-green-700'
                    : 'bg-gray-50 text-gray-500'
                }`}>
                  <Languages className="w-4 h-4" />
                  <span className="text-sm font-medium">Review</span>
                  {video.status === 'completed' && (
                    <CheckCircle className="w-4 h-4" />
                  )}
                </div>
                
                <div className="flex items-center space-x-2 p-3 rounded-lg bg-gray-50 text-gray-500">
                  <FileVideo className="w-4 h-4" />
                  <span className="text-sm font-medium">Translation</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Video Information */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Video Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-500">Filename</p>
                <p className="font-medium truncate">{video.originalName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">File Size</p>
                <p className="font-medium">{formatFileSize(video.fileSize)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Duration</p>
                <p className="font-medium">
                  {video.duration ? formatDuration(video.duration) : 'Analyzing...'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Source Language</p>
                <p className="font-medium">
                  {video.sourceLanguage ? (
                    <span className="flex items-center space-x-1">
                      <span>{video.sourceLanguage.toUpperCase()}</span>
                      {video.sourceLanguageConfidence && (
                        <Badge variant="outline" className="text-xs">
                          {Math.round(video.sourceLanguageConfidence * 100)}%
                        </Badge>
                      )}
                    </span>
                  ) : (
                    'Detecting...'
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Processing Details */}
        {video.status === 'processing' && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Processing Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  <span>Using OpenAI Whisper for high-accuracy transcription</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">Estimated completion: 2-5 minutes</span>
                </div>
                <div className="flex items-center space-x-2">
                  <BrainCircuit className="w-4 h-4 text-purple-600" />
                  <span className="text-gray-600">Applying studio-grade subtitling standards</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error Handling */}
        {video.status === 'failed' && (
          <Alert className="mb-6 border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              Processing failed. This could be due to:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Audio quality issues or corrupted file</li>
                <li>API quota limits exceeded</li>
                <li>Unsupported video format or encoding</li>
                <li>Network connectivity problems</li>
              </ul>
              <div className="mt-4">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    fetch(`/api/videos/${videoId}/retry`, { method: 'POST' })
                      .then(() => refetch())
                      .catch(console.error);
                  }}
                  className="text-red-700 border-red-300 hover:bg-red-100"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retry Processing
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Success State */}
        {video.status === 'completed' && transcriptions.length > 0 && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                  <div>
                    <h3 className="text-lg font-semibold text-green-900">
                      Processing Complete!
                    </h3>
                    <p className="text-green-700">
                      Successfully transcribed {transcriptions.length} segments. 
                      Redirecting to workspace...
                    </p>
                  </div>
                </div>
                <Button 
                  onClick={() => setLocation(`/workspace/${videoId}`)}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <ArrowRight className="w-4 h-4 mr-2" />
                  Continue to Workspace
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Back to Upload */}
        <div className="text-center mt-8">
          <Button 
            variant="outline" 
            onClick={() => setLocation('/')}
          >
            Back to Upload
          </Button>
        </div>
      </div>
    </div>
  );
}