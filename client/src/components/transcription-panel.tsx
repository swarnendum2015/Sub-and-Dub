import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Mic, Save, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Transcription } from "@shared/schema";

interface TranscriptionPanelProps {
  videoId: string;
  transcriptions: any[];
  currentLanguage: string;
  onLanguageChange: (language: string) => void;
  currentTime: number;
  onTimeSeek: (time: number) => void;
  isLoading: boolean;
}

export function TranscriptionPanel({
  videoId,
  transcriptions,
  currentLanguage,
  onLanguageChange,
  currentTime,
  onTimeSeek,
  isLoading
}: TranscriptionPanelProps) {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");

  const { data: translations } = useQuery({
    queryKey: ['/api/transcriptions', transcriptions[0]?.id, 'translations'],
    enabled: transcriptions.length > 0,
  });

  const updateTranscriptionMutation = useMutation({
    mutationFn: async ({ id, text }: { id: number; text: string }) => {
      return apiRequest('PATCH', `/api/transcriptions/${id}`, { text });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/videos', videoId, 'transcriptions'] });
      toast({
        title: "Transcription updated",
        description: "Your changes have been saved successfully.",
      });
      setEditingId(null);
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const generateDubbingMutation = useMutation({
    mutationFn: async ({ language }: { language: string }) => {
      return apiRequest('POST', `/api/videos/${videoId}/dubbing`, { language });
    },
    onSuccess: () => {
      toast({
        title: "Dubbing started",
        description: "Your dubbing job has been queued for processing.",
      });
    },
    onError: (error) => {
      toast({
        title: "Dubbing failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEdit = (transcription: Transcription) => {
    setEditingId(transcription.id);
    setEditingText(transcription.text);
  };

  const handleSave = () => {
    if (editingId) {
      updateTranscriptionMutation.mutate({ id: editingId, text: editingText });
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditingText("");
  };

  const handleSegmentClick = (transcription: Transcription) => {
    onTimeSeek(transcription.startTime);
  };

  const getCurrentSegment = () => {
    return transcriptions.find(t => 
      currentTime >= t.startTime && currentTime <= t.endTime
    );
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return "bg-green-100 text-green-700";
    if (confidence >= 0.7) return "bg-yellow-100 text-yellow-700";
    return "bg-red-100 text-red-700";
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const milliseconds = Math.floor((time % 1) * 1000);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  };

  const currentSegment = getCurrentSegment();

  return (
    <>
      {/* Language Tabs */}
      <div className="border-b border-slate-200 p-4">
        <Tabs value={currentLanguage} onValueChange={onLanguageChange} className="w-full">
          <TabsList className="grid w-full grid-cols-6 text-xs">
            <TabsTrigger value="bn" className="text-xs">Bengali</TabsTrigger>
            <TabsTrigger value="en" className="text-xs">English</TabsTrigger>
            <TabsTrigger value="hi" className="text-xs">Hindi</TabsTrigger>
            <TabsTrigger value="ta" className="text-xs">Tamil</TabsTrigger>
            <TabsTrigger value="te" className="text-xs">Telugu</TabsTrigger>
            <TabsTrigger value="ml" className="text-xs">Malayalam</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Transcription Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Card key={i} className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-6 w-12" />
                </div>
                <Skeleton className="h-16 w-full" />
              </Card>
            ))}
          </div>
        ) : transcriptions.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Mic className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <p>No transcriptions available yet.</p>
            <p className="text-sm">Processing may still be in progress.</p>
          </div>
        ) : (
          transcriptions.map((transcription) => {
            const isCurrentSegment = currentSegment?.id === transcription.id;
            const isEditing = editingId === transcription.id;

            return (
              <Card
                key={transcription.id}
                className={`p-3 cursor-pointer transition-all duration-200 ${
                  isCurrentSegment 
                    ? "border-2 border-primary bg-blue-50" 
                    : "border border-slate-200 hover:border-primary"
                }`}
                onClick={() => handleSegmentClick(transcription)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-mono ${
                    isCurrentSegment ? "text-primary font-semibold" : "text-slate-500"
                  }`}>
                    {formatTime(transcription.startTime)} - {formatTime(transcription.endTime)}
                  </span>
                  <div className="flex items-center space-x-1">
                    {transcription.confidence && (
                      <Badge className={`text-xs ${getConfidenceColor(transcription.confidence)}`}>
                        {Math.round(transcription.confidence * 100)}%
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(transcription);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Edit className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      className="w-full p-2 border border-slate-300 rounded resize-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      rows={3}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex justify-end space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancel();
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSave();
                        }}
                        disabled={updateTranscriptionMutation.isPending}
                      >
                        {updateTranscriptionMutation.isPending ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-900 leading-relaxed">
                    {transcription.text}
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* Action Buttons */}
      <div className="border-t border-slate-200 p-4 space-y-3">
        <Button
          className="w-full"
          onClick={() => generateDubbingMutation.mutate({ language: currentLanguage })}
          disabled={generateDubbingMutation.isPending}
        >
          <Mic className="w-4 h-4 mr-2" />
          {generateDubbingMutation.isPending ? "Processing..." : "Generate Dubbing"}
        </Button>
        <Button
          variant="outline"
          className="w-full"
        >
          <Save className="w-4 h-4 mr-2" />
          Save Progress
        </Button>
      </div>
    </>
  );
}
