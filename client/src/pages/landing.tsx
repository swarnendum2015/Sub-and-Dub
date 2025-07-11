import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { UploadZone } from "@/components/upload-zone";
import { VideoStatusCard } from "@/components/video-status-card";
import { CloudUpload, MessageSquare, FileVideo, CheckCircle, Clock, AlertCircle, Calendar } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function LandingPage() {
  const [, setLocation] = useLocation();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Fetch existing videos
  const { data: videos } = useQuery({
    queryKey: ['/api/videos'],
    refetchInterval: 5000,
  });
  
  // Sort videos by most recent
  const sortedVideos = videos ? [...videos].sort((a: any, b: any) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  ) : [];

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    // Validate file type
    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a video file (MP4, MOV, AVI, MKV)",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (500MB)
    if (file.size > 500 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload a video file smaller than 500MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('video', file);

      const uploadPromise = new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const progress = (event.loaded / event.total) * 100;
            setUploadProgress(progress);
          }
        };

        xhr.onload = () => {
          try {
            if (xhr.status === 200) {
              const response = JSON.parse(xhr.responseText);
              const videoId = response.id;
              
              toast({
                title: "Upload successful",
                description: "Starting video analysis...",
              });
              
              // Navigate to processing status page to show analysis progress
              setLocation(`/processing/${videoId}`);
              resolve();
            } else {
              reject(new Error(xhr.responseText || `HTTP ${xhr.status}`));
            }
          } catch (error) {
            reject(error);
          }
        };

        xhr.onerror = () => {
          reject(new Error("Network error during upload"));
        };

        xhr.open('POST', '/api/videos/upload');
        xhr.send(formData);
      });

      await uploadPromise;
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "An error occurred during upload",
        variant: "destructive",
      });
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleS3Upload = async (s3Url: string) => {
    try {
      const response = await fetch('/api/videos/upload-s3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ s3Url }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to process S3 video');
      }
      
      const data = await response.json();
      if (data.videoId) {
        setLocation(`/processing/${data.videoId}`);
      }
    } catch (error) {
      console.error('S3 upload error:', error);
      toast({
        title: "S3 Upload Failed",
        description: error instanceof Error ? error.message : "Failed to process S3 video",
        variant: "destructive",
      });
    }
  };

  const handleYouTubeUpload = async (youtubeUrl: string) => {
    try {
      const response = await fetch('/api/videos/upload-youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeUrl }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to process YouTube video');
      }
      
      const data = await response.json();
      if (data.videoId) {
        setLocation(`/processing/${data.videoId}`);
      }
    } catch (error) {
      console.error('YouTube upload error:', error);
      toast({
        title: "YouTube Upload Failed",
        description: error instanceof Error ? error.message : "Failed to process YouTube video",
        variant: "destructive",
      });
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Simple Header */}
      <header className="border-b border-slate-200 px-6 py-4">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">SubtitlePro</h1>
        </div>
      </header>

      {/* Main Upload Area */}
      <main className="max-w-2xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-bold text-slate-900 mb-3">
            Upload Video for Professional Subtitling
          </h2>
          <p className="text-slate-600 mb-6">
            Upload your video to start Hollywood-grade transcription and translation
          </p>
          
          {/* Step-by-step guide */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8 text-left">
            <h3 className="font-semibold text-blue-900 mb-4">How it works:</h3>
            <div className="space-y-3 text-sm text-blue-800">
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-semibold">1</div>
                <div>
                  <strong>Upload:</strong> Select your video file (MP4, MOV, AVI, MKV - max 500MB)
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-semibold">2</div>
                <div>
                  <strong>Processing:</strong> View real-time status as we analyze your video and detect language
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-semibold">3</div>
                <div>
                  <strong>Transcription:</strong> Get studio-grade transcription with confidence scores and model attribution
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-semibold">4</div>
                <div>
                  <strong>Translation:</strong> Netflix-compliant subtitles with international broadcast standards
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Upload Section */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          
          {isUploading ? (
            <div className="text-center p-12 border-2 border-dashed border-slate-300 rounded-lg">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CloudUpload className="w-8 h-8 text-primary animate-pulse" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">
                Uploading...
              </h3>
              <Progress value={uploadProgress} className="w-full max-w-md mx-auto mb-4" />
              <p className="text-slate-600">{Math.round(uploadProgress)}% complete</p>
            </div>
          ) : (
            <UploadZone 
              onFileUpload={handleFileUpload} 
              onS3Upload={handleS3Upload}
              onYouTubeUpload={handleYouTubeUpload}
              onBrowseClick={handleBrowseClick} 
            />
          )}
        </div>
        

        
        {/* Your Videos with Integrated Processing Status */}
        {sortedVideos.length > 0 && (
          <div className="mt-12">
            <h3 className="text-xl font-bold text-slate-900 mb-6">Your Videos</h3>
            <div className="space-y-4">
              {sortedVideos.slice(0, 5).map((video: any) => (
                <VideoStatusCard 
                  key={video.id} 
                  video={video}
                  onRetry={(videoId) => {
                    fetch(`/api/videos/${videoId}/retry`, { method: 'POST' })
                      .then(() => {
                        toast({
                          title: "Processing restarted",
                          description: "Video processing has been restarted.",
                        });
                        mutate(); // Refresh video list
                      })
                      .catch(console.error);
                  }}
                  onStartTranscription={(videoId) => {
                    fetch(`/api/videos/${videoId}/select-services`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        services: ['transcription'],
                        models: ['openai-whisper'],
                        targetLanguages: ['en', 'hi']
                      })
                    })
                    .then(() => {
                      toast({
                        title: "Transcription started",
                        description: "Bengali transcription is now processing.",
                      });
                      mutate(); // Refresh video list
                    })
                    .catch(console.error);
                  }}
                  onViewWorkspace={(videoId) => {
                    setLocation(`/processing/${videoId}`);
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
