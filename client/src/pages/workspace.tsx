import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VideoPlayer } from "@/components/video-player";
import { EditableTranscriptionPanel } from "@/components/editable-transcription-panel";
import ErrorBoundary from "@/components/error-boundary";
import { ProcessingScreen } from "@/components/processing-screen";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  MessageSquare, 
  Menu, 
  Download, 
  FileAudio, 
  FileVideo,
  Settings,
  Palette,
  CheckCircle,
  Video
} from "lucide-react";

function WorkspaceContent() {
  const { videoId } = useParams<{ videoId: string }>();
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState("bn");
  const [currentTime, setCurrentTime] = useState(0);

  const { data: video, isLoading: videoLoading } = useQuery({
    queryKey: ['/api/videos', videoId],
    enabled: !!videoId,
    refetchInterval: 2000, // Always check video status
    staleTime: 0,
  });

  const { data: transcriptions, isLoading: transcriptionsLoading } = useQuery({
    queryKey: [`/api/videos/${videoId}/transcriptions`],
    enabled: !!videoId,
    refetchInterval: video?.status === 'processing' ? 2000 : false,
    staleTime: 0, // Always fetch fresh data
  });

  // Fetch all English translations for transcriptions
  const { data: allTranslations, isLoading: translationsLoading } = useQuery({
    queryKey: ['/api/videos', videoId, 'translations', 'en'],
    queryFn: async () => {
      if (!transcriptions || transcriptions.length === 0) return {};
      
      const translationsMap: Record<number, any> = {};
      
      for (const transcription of transcriptions) {
        try {
          const response = await fetch(`/api/transcriptions/${transcription.id}/translations`);
          if (response.ok) {
            const translations = await response.json();
            const englishTranslation = translations.find((t: any) => t.targetLanguage === 'en');
            if (englishTranslation) {
              translationsMap[transcription.id] = englishTranslation;
            }
          }
        } catch (error) {
          console.error(`Failed to fetch translation for transcription ${transcription.id}:`, error);
        }
      }
      
      return translationsMap;
    },
    enabled: !!transcriptions && transcriptions.length > 0,
    refetchInterval: video?.status === 'processing' ? 3000 : video?.status === 'completed' ? 5000 : false, // Refresh while processing and after completion
  });

  const { data: dubbingJobs } = useQuery({
    queryKey: ['/api/videos', videoId, 'dubbing'],
    enabled: !!videoId,
  });

  // Retry processing mutation - must be declared before any conditional returns
  const retryProcessingMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/videos/${videoId}/process`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/videos', videoId] });
    }
  });

  const getProcessingStatus = () => {
    if (!video) return { status: "loading", color: "bg-gray-100 text-gray-700" };
    
    switch (video.status) {
      case "completed":
        return { status: "Processing Complete", color: "bg-green-100 text-green-700" };
      case "processing":
        return { status: "Processing", color: "bg-blue-100 text-blue-700" };
      case "failed":
        return { status: "Processing Failed", color: "bg-red-100 text-red-700" };
      default:
        return { status: "Uploaded", color: "bg-gray-100 text-gray-700" };
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return "confidence-high";
    if (confidence >= 0.7) return "confidence-medium";
    return "confidence-low";
  };

  const formatConfidence = (confidence: number) => {
    return `${Math.round(confidence * 100)}%`;
  };

  if (videoLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading video...</p>
        </div>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6 text-center">
            <p className="text-slate-600">Video not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const processingStatus = getProcessingStatus();

  // Show processing screen for videos in processing or failed state
  if (video?.status === 'processing' || (video?.status === 'failed' && transcriptions?.length === 0)) {
    return (
      <ProcessingScreen 
        videoId={videoId!} 
        videoName={video.originalName}
        onRetry={() => retryProcessingMutation.mutate()}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Compact Top Navigation */}
      <nav className="bg-white border-b border-slate-200 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-primary rounded flex items-center justify-center">
                <MessageSquare className="w-3 h-3 text-white" />
              </div>
              <span className="font-medium text-slate-900">SubtitlePro</span>
            </div>
            <span className="text-sm text-slate-600 truncate max-w-md">{video?.originalName || 'Untitled'}</span>
          </div>

          <div className="flex items-center space-x-3">
            <Badge className={`${processingStatus.color} text-xs`}>
              {video?.status === "completed" && <CheckCircle className="w-3 h-3 mr-1" />}
              {video?.status === "processing" && (
                <div className="w-2 h-2 bg-current rounded-full animate-pulse mr-1"></div>
              )}
              <span>{processingStatus.status}</span>
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSideMenuOpen(!sideMenuOpen)}
            >
              <Menu className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Main Workspace */}
      <div className="flex h-[calc(100vh-48px)]">
        {/* Collapsible Side Menu */}
        {sideMenuOpen && (
          <div className="w-64 bg-white border-r border-slate-200 p-4 space-y-6">
            {/* Export Options */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Export Options</h3>
              <div className="space-y-2">
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  size="sm"
                >
                  <Download className="w-4 h-4 mr-3" />
                  Download SRT Files
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  size="sm"
                >
                  <FileAudio className="w-4 h-4 mr-3" />
                  Export Dubbed Audio
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  size="sm"
                >
                  <FileVideo className="w-4 h-4 mr-3" />
                  Export Final Video
                </Button>
              </div>
            </div>

            {/* Settings */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Settings</h3>
              <div className="space-y-2">
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  size="sm"
                >
                  <Settings className="w-4 h-4 mr-3" />
                  AI Model Settings
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  size="sm"
                >
                  <Palette className="w-4 h-4 mr-3" />
                  Subtitle Styling
                </Button>
              </div>
            </div>

            {/* Processing History */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Processing History</h3>
              <div className="space-y-3">
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-green-900">Bengali Transcription</span>
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="text-xs text-green-700">Confidence: 94%</div>
                </div>
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-green-900">English Translation</span>
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="text-xs text-green-700">Confidence: 91%</div>
                </div>
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-green-900">Hindi Translation</span>
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="text-xs text-green-700">Confidence: 89%</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Video Player Section */}
        <div className="w-1/2 bg-black">
          <VideoPlayer
            videoId={videoId!}
            currentTime={currentTime}
            onTimeUpdate={setCurrentTime}
          />
        </div>

        {/* Bengali and English Translation Panel */}
        <div className="w-1/2 bg-white border-l border-slate-200 flex flex-col">
          <EditableTranscriptionPanel
            videoId={videoId!}
            currentTime={currentTime}
            onTimeSeek={setCurrentTime}
          />
        </div>
      </div>
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <ErrorBoundary>
      <WorkspaceContent />
    </ErrorBoundary>
  );
}
