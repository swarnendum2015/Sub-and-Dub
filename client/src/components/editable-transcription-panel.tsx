import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  Languages,
  Volume2,
  FileAudio,
  RefreshCw,
  Edit2,
  Download
} from "lucide-react";

import type { Transcription, Translation, DubbingJob } from "@shared/schema";

interface EditableTranscriptionPanelProps {
  videoId: string;
  currentTime: number;
  onTimeSeek: (time: number) => void;
}

export function EditableTranscriptionPanel({
  videoId,
  currentTime,
  onTimeSeek,
}: EditableTranscriptionPanelProps) {
  const [editingSegment, setEditingSegment] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [dubbingLanguages, setDubbingLanguages] = useState<Set<string>>(new Set());
  const [speakerCount, setSpeakerCount] = useState(1);
  const [selectedVoiceIds, setSelectedVoiceIds] = useState<string[]>(["21m00Tcm4TlvDq8ikWAM"]);
  const [selectedDubbingLanguage, setSelectedDubbingLanguage] = useState<string>('');
  const [selectedTranslationLanguage, setSelectedTranslationLanguage] = useState<string>('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query for video data
  const { data: video } = useQuery({
    queryKey: [`/api/videos/${videoId}`],
    enabled: !!videoId,
  });

  // Query for transcriptions
  const { data: transcriptions = [], isLoading: transcriptionsLoading } = useQuery({
    queryKey: [`/api/videos/${videoId}/transcriptions`],
    enabled: !!videoId,
  });

  // Query for all translations
  const { data: allTranslations = [] } = useQuery({
    queryKey: [`/api/videos/${videoId}/translations`],
    enabled: !!videoId,
  });

  // Query for dubbing jobs
  const { data: dubbingJobs = [] } = useQuery({
    queryKey: [`/api/videos/${videoId}/dubbing-jobs`],
    enabled: !!videoId,
  });

  const bengaliConfirmed = video?.bengaliConfirmed || false;

  console.log('Video data:', video);
  console.log('Bengali confirmed status:', bengaliConfirmed);

  // Confirm Bengali mutation
  const confirmBengaliMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/videos/${videoId}/confirm-transcription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to confirm Bengali transcription');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/videos/${videoId}`] });
      toast({
        title: "Success",
        description: "Bengali transcription confirmed successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to confirm Bengali transcription",
        variant: "destructive",
      });
    },
  });

  // Translation mutation
  const translateMutation = useMutation({
    mutationFn: async (language: string) => {
      const response = await fetch(`/api/videos/${videoId}/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ language }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to translate');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/videos/${videoId}/translations`] });
      toast({
        title: "Success",
        description: "Translation generated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to generate translation",
        variant: "destructive",
      });
    },
  });

  // Dubbing mutation
  const dubbingMutation = useMutation({
    mutationFn: async ({ language, voiceIds, dubbingType }: { language: string; voiceIds: string[]; dubbingType: string }) => {
      const response = await fetch(`/api/videos/${videoId}/dubbing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ language, voiceIds, dubbingType }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to start dubbing');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/videos/${videoId}/dubbing-jobs`] });
      toast({
        title: "Success",
        description: "Dubbing job started successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to start dubbing",
        variant: "destructive",
      });
    },
  });

  // Update transcription mutation
  const updateTranscriptionMutation = useMutation({
    mutationFn: async ({ id, text }: { id: number; text: string }) => {
      const response = await fetch(`/api/transcriptions/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update transcription');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/videos/${videoId}/transcriptions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/videos/${videoId}`] });
      toast({
        title: "Success",
        description: "Transcription updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update transcription",
        variant: "destructive",
      });
    },
  });

  const getLanguageName = (code: string) => {
    const names: { [key: string]: string } = {
      'en': 'English',
      'hi': 'Hindi',
      'ta': 'Tamil',
      'te': 'Telugu',
      'ml': 'Malayalam',
      'bn': 'Bengali'
    };
    return names[code] || code;
  };

  const getTranslationStatus = (language: string) => {
    const translations = allTranslations.filter((t: Translation) => t.targetLanguage === language);
    const totalTranscriptions = transcriptions.length;
    
    if (translations.length === 0) return 'none';
    if (translations.length === totalTranscriptions) return 'completed';
    return 'partial';
  };

  if (transcriptionsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!transcriptions || transcriptions.length === 0) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-gray-600">No transcriptions available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Video Info Header */}
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center space-x-2">
          <h2 className="text-lg font-semibold">Bengali Transcription</h2>
          {bengaliConfirmed ? (
            <Badge className="bg-green-100 text-green-700 border-green-300">
              <CheckCircle className="w-3 h-3 mr-1" />
              Bengali Confirmed
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
              <AlertCircle className="w-3 h-3 mr-1" />
              Pending Confirmation
            </Badge>
          )}
          <span className="text-xs text-gray-500">Video ID: {videoId}</span>
        </div>
      </div>

      <div className="p-4 border rounded-lg">
        {/* Bengali Transcription Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-4">Bengali Transcription</h3>
          
          {!bengaliConfirmed ? (
            <div className="space-y-3">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Please review and confirm the Bengali transcription before proceeding with translations.
                </AlertDescription>
              </Alert>
              <Button 
                size="sm" 
                onClick={() => confirmBengaliMutation.mutate()}
                disabled={confirmBengaliMutation.isPending}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {confirmBengaliMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4 mr-2" />
                )}
                Confirm Bengali Transcription
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {transcriptions.map((transcription: Transcription) => (
                <div key={transcription.id} className="p-3 border rounded-lg bg-white">
                  <div className="text-xs text-gray-500 mb-1">
                    {Math.floor(transcription.startTime / 60)}:{(transcription.startTime % 60).toFixed(1).padStart(4, '0')} - {Math.floor(transcription.endTime / 60)}:{(transcription.endTime % 60).toFixed(1).padStart(4, '0')}
                  </div>
                  <p className="text-sm">{transcription.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Translation and Dubbing Options - Always Visible */}
        {bengaliConfirmed && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Translation Section */}
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center mb-3">
                <Languages className="w-5 h-5 text-green-600 mr-2" />
                <span className="font-medium text-green-800">Translation Options</span>
              </div>
              <p className="text-sm text-green-700 mb-3">
                Select one language to translate your Bengali content:
              </p>
              
              <div className="space-y-3">
                <Select value={selectedTranslationLanguage} onValueChange={setSelectedTranslationLanguage}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select translation language" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="hi">Hindi</SelectItem>
                    <SelectItem value="ta">Tamil</SelectItem>
                    <SelectItem value="te">Telugu</SelectItem>
                    <SelectItem value="ml">Malayalam</SelectItem>
                  </SelectContent>
                </Select>
                
                <Button 
                  onClick={() => {
                    if (selectedTranslationLanguage) {
                      translateMutation.mutate(selectedTranslationLanguage);
                    }
                  }}
                  disabled={!selectedTranslationLanguage || translateMutation.isPending}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  {translateMutation.isPending && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Generate Translation
                </Button>
                
                {/* Show translation status */}
                {selectedTranslationLanguage && (
                  <div className="mt-3 p-2 bg-white rounded border">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {getLanguageName(selectedTranslationLanguage)} Status
                      </span>
                      {(() => {
                        const status = getTranslationStatus(selectedTranslationLanguage);
                        return status === 'completed' ? (
                          <Badge className="bg-green-100 text-green-700">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Completed
                          </Badge>
                        ) : (
                          <Badge className="bg-gray-100 text-gray-700">
                            Not Started
                          </Badge>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Dubbing Section */}
            <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
              <div className="flex items-center mb-3">
                <Volume2 className="w-5 h-5 text-purple-600 mr-2" />
                <span className="font-medium text-purple-800">Audio Dubbing</span>
              </div>
              <p className="text-sm text-purple-700 mb-3">
                Generate AI dubbing in one language:
              </p>
              
              {dubbingJobs.length > 0 ? (
                <div className="space-y-2">
                  {dubbingJobs.map((job: DubbingJob) => (
                    <div key={job.id} className="p-2 bg-white rounded border">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          {job.language.toUpperCase()} Dubbing
                        </span>
                        <Badge 
                          className={
                            job.status === 'completed' ? 'bg-green-100 text-green-700' :
                            job.status === 'failed' ? 'bg-red-100 text-red-700' :
                            'bg-blue-100 text-blue-700'
                          }
                        >
                          {job.status === 'pending' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                          {job.status}
                        </Badge>
                      </div>
                      {job.audioPath && (
                        <audio controls className="w-full mt-2">
                          <source src={job.audioPath} type="audio/mpeg" />
                        </audio>
                      )}
                    </div>
                  ))}
                  <p className="text-xs text-purple-600 mt-2">
                    Dubbing session active. New dubbing will be available after current jobs complete.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <Select value={selectedDubbingLanguage} onValueChange={setSelectedDubbingLanguage}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select dubbing language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="hi">Hindi</SelectItem>
                      <SelectItem value="ta">Tamil</SelectItem>
                      <SelectItem value="te">Telugu</SelectItem>
                      <SelectItem value="ml">Malayalam</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Button 
                    onClick={() => {
                      if (selectedDubbingLanguage) {
                        dubbingMutation.mutate({
                          language: selectedDubbingLanguage,
                          voiceIds: ['21m00Tcm4TlvDq8ikWAM'],
                          dubbingType: 'studio'
                        });
                      }
                    }}
                    disabled={!selectedDubbingLanguage || dubbingMutation.isPending}
                    className="w-full bg-purple-600 hover:bg-purple-700"
                  >
                    {dubbingMutation.isPending && (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    Generate Audio Dubbing
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};