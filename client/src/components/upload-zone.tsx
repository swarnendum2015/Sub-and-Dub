import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CloudUpload, FolderOpen, Link, Cloud, Youtube, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadZoneProps {
  onFileUpload: (file: File) => void;
  onS3Upload: (s3Url: string) => void;
  onYouTubeUpload: (youtubeUrl: string) => void;
  onBrowseClick: () => void;
}

export function UploadZone({ onFileUpload, onS3Upload, onYouTubeUpload, onBrowseClick }: UploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [s3Url, setS3Url] = useState("");
  const [youtubeUrl, setYouTubeUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    const videoFile = files.find(file => file.type.startsWith('video/'));
    
    if (videoFile) {
      onFileUpload(videoFile);
    }
  };

  const validateS3Url = (url: string): boolean => {
    const s3Pattern = /^https?:\/\/[^\/]+\.s3[^\/]*\.amazonaws\.com\/.*$|^https?:\/\/s3[^\/]*\.amazonaws\.com\/[^\/]+\/.*$/;
    return s3Pattern.test(url);
  };

  const validateYouTubeUrl = (url: string): boolean => {
    const youtubePattern = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/;
    return youtubePattern.test(url);
  };

  const handleS3Upload = () => {
    if (!s3Url.trim()) {
      setUrlError('Please enter an S3 URL');
      return;
    }
    
    if (!validateS3Url(s3Url)) {
      setUrlError('Please enter a valid S3 URL');
      return;
    }
    
    setUrlError(null);
    onS3Upload(s3Url);
  };

  const handleYouTubeUpload = () => {
    if (!youtubeUrl.trim()) {
      setUrlError('Please enter a YouTube URL');
      return;
    }
    
    if (!validateYouTubeUrl(youtubeUrl)) {
      setUrlError('Please enter a valid YouTube URL');
      return;
    }
    
    setUrlError(null);
    onYouTubeUpload(youtubeUrl);
  };

  return (
    <Card className="max-w-2xl mx-auto">
      <CardContent className="p-8">
        <Tabs defaultValue="file" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="file">File Upload</TabsTrigger>
            <TabsTrigger value="s3">S3 Bucket</TabsTrigger>
            <TabsTrigger value="youtube">YouTube</TabsTrigger>
          </TabsList>
          
          <TabsContent value="file" className="space-y-4">
            <Card 
              className={cn(
                "border-2 border-dashed transition-colors duration-200 cursor-pointer",
                isDragOver ? "border-primary bg-primary/5" : "border-slate-300 hover:border-primary"
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={onBrowseClick}
            >
              <CardContent className="p-12 text-center">
                <div className="mb-6">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CloudUpload className="w-8 h-8 text-slate-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">
                    Drop your video file here
                  </h3>
                  <p className="text-slate-600">or click to browse your files</p>
                </div>

                <div className="mb-6">
                  <Button className="bg-primary hover:bg-primary/90 text-white">
                    <FolderOpen className="w-4 h-4 mr-2" />
                    Choose File
                  </Button>
                </div>

                <div className="text-sm text-slate-500 space-y-1">
                  <p>Supported formats: MP4, MOV, AVI, MKV</p>
                  <p>Maximum file size: 500MB</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="s3" className="space-y-4">
            <Card className="border-2 border-dashed border-slate-300">
              <CardContent className="p-12 text-center">
                <div className="mb-6">
                  <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Cloud className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">
                    S3 Bucket Video
                  </h3>
                  <p className="text-slate-600">Enter the S3 URL of your video file</p>
                </div>
                
                <div className="space-y-4">
                  <Input
                    placeholder="https://mybucket.s3.amazonaws.com/video.mp4"
                    value={s3Url}
                    onChange={(e) => setS3Url(e.target.value)}
                    className="max-w-md mx-auto"
                  />
                  <Button 
                    onClick={handleS3Upload}
                    disabled={!s3Url.trim()}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Link className="w-4 h-4 mr-2" />
                    Process S3 Video
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="youtube" className="space-y-4">
            <Card className="border-2 border-dashed border-slate-300">
              <CardContent className="p-12 text-center">
                <div className="mb-6">
                  <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Youtube className="w-8 h-8 text-red-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">
                    YouTube Video
                  </h3>
                  <p className="text-slate-600">Enter the YouTube URL to process</p>
                </div>
                
                <div className="space-y-4">
                  <Input
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={youtubeUrl}
                    onChange={(e) => setYouTubeUrl(e.target.value)}
                    className="max-w-md mx-auto"
                  />
                  <Button 
                    onClick={handleYouTubeUpload}
                    disabled={!youtubeUrl.trim()}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    <Youtube className="w-4 h-4 mr-2" />
                    Process YouTube Video
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        
        {urlError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <p className="text-sm text-red-700">{urlError}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
