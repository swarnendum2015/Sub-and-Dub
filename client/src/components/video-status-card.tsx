import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileVideo, Clock, CheckCircle, AlertCircle, Play, RotateCcw, Eye, Calendar } from "lucide-react";
// Mock supported languages for client-side use
const getSupportedLanguages = () => [
  { code: 'bn', name: 'Bengali' },
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'ml', name: 'Malayalam' }
];

interface VideoStatusCardProps {
  video: any;
  onRetry: (videoId: number) => void;
  onStartTranscription: (videoId: number) => void;
  onViewWorkspace: (videoId: number) => void;
}

export function VideoStatusCard({ video, onRetry, onStartTranscription, onViewWorkspace }: VideoStatusCardProps) {
  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'pending':
        return { label: 'Uploading', color: 'bg-blue-100 text-blue-800', icon: Clock };
      case 'analyzing':
        return { label: 'Analyzing', color: 'bg-yellow-100 text-yellow-800', icon: Clock };
      case 'analyzed':
        return { label: 'Ready for Transcription', color: 'bg-purple-100 text-purple-800', icon: Play };
      case 'processing':
        return { label: 'Transcribing', color: 'bg-blue-100 text-blue-800', icon: Clock };
      case 'completed':
        return { label: 'Ready', color: 'bg-green-100 text-green-800', icon: CheckCircle };
      case 'failed':
        return { label: 'Failed', color: 'bg-red-100 text-red-800', icon: AlertCircle };
      default:
        return { label: status, color: 'bg-gray-100 text-gray-800', icon: Clock };
    }
  };

  const statusInfo = getStatusInfo(video.status);
  const StatusIcon = statusInfo.icon;

  return (
    <Card className="hover:border-primary transition-colors">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
              <FileVideo className="w-6 h-6 text-slate-600" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-slate-900 mb-1">
                {video.originalName || video.filename}
              </h4>
              <div className="flex items-center gap-4 text-sm text-slate-500">
                {video.fileSize && (
                  <span>{(video.fileSize / (1024 * 1024)).toFixed(1)} MB</span>
                )}
                {video.duration && <span>{Math.round(video.duration)}s</span>}
                {video.sourceLanguage && (
                  <span>
                    {getSupportedLanguages().find(l => l.code === video.sourceLanguage)?.name || video.sourceLanguage}
                  </span>
                )}
                {video.createdAt && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(video.createdAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className={`gap-1 ${statusInfo.color}`}>
              <StatusIcon className="w-3 h-3" />
              {statusInfo.label}
            </Badge>
            
            {/* Action Buttons */}
            <div className="flex gap-2">
              {video.status === 'failed' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRetry(video.id)}
                  className="gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  Retry
                </Button>
              )}
              
              {video.status === 'analyzed' && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => onStartTranscription(video.id)}
                  className="gap-1 bg-purple-600 hover:bg-purple-700"
                >
                  <Play className="w-3 h-3" />
                  Start Transcription
                </Button>
              )}
              
              {(video.status === 'completed' || video.status === 'processing') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onViewWorkspace(video.id)}
                  className="gap-1"
                >
                  <Eye className="w-3 h-3" />
                  View Workspace
                </Button>
              )}
            </div>
          </div>
        </div>
        
        {/* Additional Status Details */}
        {video.status === 'analyzing' && (
          <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
            <p className="text-sm text-yellow-800">
              🔍 Analyzing video and detecting language... This usually takes 30-60 seconds.
            </p>
          </div>
        )}
        
        {video.status === 'analyzed' && (
          <div className="mt-4 p-3 bg-purple-50 rounded-lg">
            <p className="text-sm text-purple-800">
              ✅ Analysis complete! Click "Start Transcription" to begin Bengali transcription with Hollywood-grade quality.
            </p>
          </div>
        )}
        
        {video.status === 'processing' && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              🎬 Transcribing with OpenAI Whisper... This may take 1-3 minutes depending on video length.
            </p>
          </div>
        )}
        
        {video.status === 'failed' && (
          <div className="mt-4 p-3 bg-red-50 rounded-lg">
            <p className="text-sm text-red-800">
              ❌ Processing failed. This could be due to API limits or file format issues. Click "Retry" to try again.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}