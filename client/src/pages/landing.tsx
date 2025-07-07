import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { UploadZone } from "@/components/upload-zone";
import { CloudUpload, MessageSquare } from "lucide-react";

export default function LandingPage() {
  const [, setLocation] = useLocation();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

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

      const xhr = new XMLHttpRequest();
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = (event.loaded / event.total) * 100;
          setUploadProgress(progress);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          toast({
            title: "Upload successful",
            description: "Your video has been uploaded and processing has started.",
          });
          setLocation(`/workspace/${response.id}`);
        } else {
          throw new Error(xhr.responseText);
        }
      };

      xhr.onerror = () => {
        throw new Error("Upload failed");
      };

      xhr.open('POST', '/api/videos/upload');
      xhr.send(formData);
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
            Upload Video
          </h2>
          <p className="text-slate-600">
            Upload your Bengali video to start transcription and translation
          </p>
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
            <UploadZone onFileUpload={handleFileUpload} onBrowseClick={handleBrowseClick} />
          )}
        </div>
      </main>
    </div>
  );
}
