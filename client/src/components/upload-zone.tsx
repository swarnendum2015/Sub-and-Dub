import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CloudUpload, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadZoneProps {
  onFileUpload: (file: File) => void;
  onBrowseClick: () => void;
}

export function UploadZone({ onFileUpload, onBrowseClick }: UploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

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

  return (
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
  );
}
