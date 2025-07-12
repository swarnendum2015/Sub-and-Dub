import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
  Video,
  Home
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
      
      // Use Promise.allSettled to handle all requests safely
      const translationPromises = transcriptions.map(async (transcription) => {
        try {
          const response = await fetch(`/api/transcriptions/${transcription.id}/translations`);
          if (response.ok) {
            const translations = await response.json();
            const englishTranslation = translations.find((t: any) => t.targetLanguage === 'en');
            if (englishTranslation) {
              return { id: transcription.id, translation: englishTranslation };
            }
          }
          return null;
        } catch (error) {
          console.error(`Failed to fetch translation for transcription ${transcription.id}:`, error);
          return null;
        }
      });
      
      try {
        const results = await Promise.allSettled(translationPromises);
        results.forEach(result => {
          if (result.status === 'fulfilled' && result.value) {
            translationsMap[result.value.id] = result.value.translation;
          }
        });
      } catch (error) {
        console.error('Error fetching translations:', error);
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

  // Fetch file details for the video - auto-fetch when video is completed
  const { data: fileDetails, isLoading: fileDetailsLoading } = useQuery({
    queryKey: ['/api/videos', videoId, 'details'],
    enabled: !!videoId && video?.status === 'completed',
    refetchInterval: video?.status === 'completed' ? 5000 : false,
    staleTime: 0,
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
    if (!video) return { status: "Loading...", color: "bg-gray-100 text-gray-700" };
    
    switch (video.status) {
      case "completed":
        return { status: "Ready", color: "bg-green-100 text-green-700" };
      case "processing":
        return { status: "Processing Video", color: "bg-blue-100 text-blue-700" };
      case "transcribing":
        return { status: "Transcribing", color: "bg-purple-100 text-purple-700" };
      case "failed":
        return { status: "Processing Failed", color: "bg-red-100 text-red-700" };
      case "analyzed":
        return { status: "Ready for Transcription", color: "bg-yellow-100 text-yellow-700" };
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

  // Show processing screen only for videos still in processing state without transcriptions
  if (video?.status === 'processing' && (!transcriptions || transcriptions.length === 0)) {
    return (
      <ProcessingScreen 
        videoId={videoId!} 
        videoName={video.originalName}
        onRetry={() => retryProcessingMutation.mutate()}
      />
    );
  }

  // Show error state for failed videos
  if (video?.status === 'failed' && (!transcriptions || transcriptions.length === 0)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6 text-center">
            <p className="text-slate-600 mb-4">Processing failed. Please try again.</p>
            <Button onClick={() => retryProcessingMutation.mutate()}>
              Retry Processing
            </Button>
          </CardContent>
        </Card>
      </div>
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
            <div className="flex items-center space-x-4">
              <span className="text-sm text-slate-600 truncate max-w-md">{video?.originalName || 'Untitled'}</span>
              {video && (
                <div className="flex items-center space-x-3 text-xs text-slate-500">
                  <span>{(video.fileSize / (1024 * 1024)).toFixed(1)} MB</span>
                  {video.duration && (
                    <span>{Math.floor(video.duration / 60)}:{String(Math.floor(video.duration % 60)).padStart(2, '0')}</span>
                  )}
                  <span>Bengali</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Badge className={`${processingStatus.color} text-xs`}>
              {video?.status === "completed" && <CheckCircle className="w-3 h-3 mr-1" />}
              {video?.status === "processing" && (
                <div className="w-2 h-2 bg-current rounded-full animate-pulse mr-1"></div>
              )}
              <span>{processingStatus.status}</span>
            </Badge>
            
            {/* Navigation Menu */}
            <Sheet open={sideMenuOpen} onOpenChange={setSideMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Menu className="w-4 h-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80">
                <SheetHeader>
                  <SheetTitle className="flex items-center space-x-2">
                    <MessageSquare className="w-5 h-5" />
                    <span>SubtitlePro</span>
                  </SheetTitle>
                </SheetHeader>
                
                <div className="mt-6 space-y-6">
                  {/* Navigation Links */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-900">Navigation</h3>
                    <div className="space-y-2">
                      <Button 
                        variant="ghost" 
                        className="w-full justify-start"
                        onClick={() => window.location.href = "/"}
                      >
                        <Home className="w-4 h-4 mr-2" />
                        Home
                      </Button>
                      <Button 
                        variant="ghost" 
                        className="w-full justify-start"
                        onClick={() => window.location.href = `/workspace/${videoId}`}
                      >
                        <Video className="w-4 h-4 mr-2" />
                        Current Workspace
                      </Button>
                    </div>
                  </div>
                  
                  {/* Video Actions */}
                  {video && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-slate-900">Video Actions</h3>
                      <div className="space-y-2">
                        <Button 
                          variant="ghost" 
                          className="w-full justify-start"
                          onClick={() => window.open(`/api/videos/${videoId}/srt/download?lang=bn`, '_blank')}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download Bengali SRT
                        </Button>
                        <Button 
                          variant="ghost" 
                          className="w-full justify-start"
                          onClick={() => window.open(`/api/videos/${videoId}/srt/download?lang=en`, '_blank')}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download English SRT
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  {/* Video Stats */}
                  {video && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-slate-900">Video Information</h3>
                      <div className="space-y-2 text-sm text-slate-600">
                        <div className="flex justify-between">
                          <span>File Size:</span>
                          <span>{(video.fileSize / (1024 * 1024)).toFixed(1)} MB</span>
                        </div>
                        {video.duration && (
                          <div className="flex justify-between">
                            <span>Duration:</span>
                            <span>{Math.floor(video.duration / 60)}:{String(Math.floor(video.duration % 60)).padStart(2, '0')}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span>Status:</span>
                          <span className="capitalize">{video.status}</span>
                        </div>
                        
                        {/* File Details Section */}
                        {video.status === 'completed' && (
                          <>
                            <div className="border-t pt-2 mt-3">
                              <h4 className="text-xs font-medium text-slate-900 mb-2">Technical Details</h4>
                              {fileDetailsLoading ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 border border-slate-300 border-t-transparent rounded-full animate-spin"></div>
                                  <span className="text-xs text-slate-500">Loading file details...</span>
                                </div>
                              ) : fileDetails ? (
                                <>
                                  <div className="flex justify-between">
                                    <span>Format:</span>
                                    <span className="uppercase">{fileDetails.codec || 'Unknown'}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Resolution:</span>
                                    <span>{fileDetails.resolution || 'Unknown'}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Frame Rate:</span>
                                    <span>{fileDetails.fps ? `${fileDetails.fps.toFixed(0)} fps` : 'Unknown'}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Audio:</span>
                                    <span className="uppercase">
                                      {fileDetails.audioCodec || 'Unknown'} 
                                      {fileDetails.audioSampleRate ? ` ${Math.round(fileDetails.audioSampleRate/1000)}kHz` : ''}
                                    </span>
                                  </div>
                                </>
                              ) : (
                                <div className="text-xs text-slate-500">
                                  No file details available. The system may still be generating metadata.
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </nav>

      {/* Main Workspace */}
      <div className="flex h-[calc(100vh-60px)]">
        {/* Video and Transcription Panels */}
        <div className="flex-1">
          <div className="grid grid-cols-1 lg:grid-cols-2 h-full">
            {/* Video Player */}
            <div className="bg-black relative">
              <ErrorBoundary>
                <VideoPlayer 
                  videoId={videoId!} 
                  currentTime={currentTime}
                  onTimeUpdate={setCurrentTime}
                />
              </ErrorBoundary>
              
              {/* Video Loading Overlay */}
              {videoLoading && (
                <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                  <div className="text-white text-center">
                    <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    <p className="text-sm">Loading video...</p>
                  </div>
                </div>
              )}
            </div>

            {/* Transcription Panel */}
            <div className="bg-white border-l border-slate-200 overflow-hidden relative">
              <ErrorBoundary>
                <EditableTranscriptionPanel
                  videoId={videoId!}
                  currentTime={currentTime}
                  onTimeSeek={setCurrentTime}
                />
              </ErrorBoundary>
              
              {/* Transcription Loading Overlay */}
              {transcriptionsLoading && (
                <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    <p className="text-sm text-slate-600">Loading transcriptions...</p>
                  </div>
                </div>
              )}
            </div>
          </div>
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
