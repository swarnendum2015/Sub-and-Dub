import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Mic, Save, Edit, Check, X, Languages, AlertCircle, 
  Clock, CheckCircle, Loader2 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Transcription, Translation } from "@shared/schema";

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
  const { toast } = useToast();
  const [currentLanguage, setCurrentLanguage] = useState("bn");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  const [bengaliConfirmed, setBengaliConfirmed] = useState(false);
  
  // Fetch transcriptions
  const { data: transcriptions = [], isLoading: transcriptionsLoading } = useQuery({
    queryKey: [`/api/videos/${videoId}/transcriptions`],
    refetchInterval: bengaliConfirmed ? false : 5000,
  });
  
  // Fetch translations for each transcription
  const translationQueries = transcriptions.map((t: Transcription) => ({
    queryKey: [`/api/transcriptions/${t.id}/translations`],
    enabled: bengaliConfirmed && !!t.id,
  }));
  
  // Update transcription mutation
  const updateTranscriptionMutation = useMutation({
    mutationFn: async ({ id, text }: { id: number; text: string }) => {
      return apiRequest('PATCH', `/api/transcriptions/${id}`, { text });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/videos/${videoId}/transcriptions`] });
      toast({
        title: "Transcription updated",
        description: "Your changes have been saved successfully.",
      });
      setEditingId(null);
      setEditingText("");
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Update translation mutation
  const updateTranslationMutation = useMutation({
    mutationFn: async ({ id, text }: { id: number; text: string }) => {
      return apiRequest('PATCH', `/api/translations/${id}`, { text });
    },
    onSuccess: (_, variables) => {
      // Invalidate the specific translation query
      transcriptions.forEach((t: Transcription) => {
        queryClient.invalidateQueries({ queryKey: [`/api/transcriptions/${t.id}/translations`] });
      });
      toast({
        title: "Translation updated",
        description: "Your changes have been saved successfully.",
      });
      setEditingId(null);
      setEditingText("");
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Confirm Bengali transcription
  const confirmBengaliMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/videos/${videoId}/confirm-transcription`);
    },
    onSuccess: () => {
      setBengaliConfirmed(true);
      toast({
        title: "Bengali transcription confirmed",
        description: "You can now proceed with translations to other languages.",
      });
    },
    onError: (error) => {
      toast({
        title: "Confirmation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Trigger translation mutation
  const triggerTranslationMutation = useMutation({
    mutationFn: async ({ language }: { language: string }) => {
      return apiRequest('POST', `/api/videos/${videoId}/translate`, { targetLanguage: language });
    },
    onSuccess: (_, variables) => {
      toast({
        title: "Translation started",
        description: `Translating to ${getLanguageName(variables.language)}...`,
      });
      // Invalidate all translation queries
      transcriptions.forEach((t: Transcription) => {
        queryClient.invalidateQueries({ queryKey: [`/api/transcriptions/${t.id}/translations`] });
      });
    },
    onError: (error) => {
      toast({
        title: "Translation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const getCurrentSegment = () => {
    return transcriptions.find((t: Transcription) => 
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
  
  const getLanguageName = (code: string) => {
    const languages: Record<string, string> = {
      bn: "Bengali",
      en: "English",
      hi: "Hindi",
      ta: "Tamil",
      te: "Telugu",
      ml: "Malayalam",
    };
    return languages[code] || code;
  };
  
  const handleEdit = (item: Transcription | Translation, isTranslation: boolean = false) => {
    setEditingId(item.id);
    setEditingText(isTranslation ? (item as Translation).translatedText : (item as Transcription).text);
  };
  
  const handleSave = (isTranslation: boolean = false) => {
    if (editingId) {
      if (isTranslation) {
        updateTranslationMutation.mutate({ id: editingId, text: editingText });
      } else {
        updateTranscriptionMutation.mutate({ id: editingId, text: editingText });
      }
    }
  };
  
  const handleCancel = () => {
    setEditingId(null);
    setEditingText("");
  };
  
  const currentSegment = getCurrentSegment();
  
  // Get translations for current language
  const getTranslationsForLanguage = (transcriptionId: number) => {
    const { data: translations = [] } = useQuery({
      queryKey: [`/api/transcriptions/${transcriptionId}/translations`],
      enabled: bengaliConfirmed && currentLanguage !== 'bn',
    });
    
    return translations.find((t: Translation) => t.targetLanguage === currentLanguage);
  };
  
  return (
    <div className="flex flex-col h-full">
      {/* Header with Language Tabs */}
      <div className="border-b border-slate-200 p-4">
        <Tabs value={currentLanguage} onValueChange={setCurrentLanguage} className="w-full">
          <TabsList className="grid w-full grid-cols-6 text-xs">
            <TabsTrigger value="bn" className="text-xs">
              Bengali {!bengaliConfirmed && <Mic className="w-3 h-3 ml-1" />}
            </TabsTrigger>
            <TabsTrigger value="en" className="text-xs" disabled={!bengaliConfirmed}>
              English
            </TabsTrigger>
            <TabsTrigger value="hi" className="text-xs" disabled={!bengaliConfirmed}>
              Hindi
            </TabsTrigger>
            <TabsTrigger value="ta" className="text-xs" disabled={!bengaliConfirmed}>
              Tamil
            </TabsTrigger>
            <TabsTrigger value="te" className="text-xs" disabled={!bengaliConfirmed}>
              Telugu
            </TabsTrigger>
            <TabsTrigger value="ml" className="text-xs" disabled={!bengaliConfirmed}>
              Malayalam
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      
      {/* Status Bar */}
      {currentLanguage === 'bn' && !bengaliConfirmed && transcriptions.length > 0 && (
        <div className="p-4 bg-amber-50 border-b border-amber-200">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="flex items-center justify-between">
                <span>Review and edit Bengali transcription before proceeding to translations</span>
                <Button 
                  size="sm" 
                  onClick={() => confirmBengaliMutation.mutate()}
                  disabled={confirmBengaliMutation.isPending}
                >
                  {confirmBengaliMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Confirming...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Confirm Bengali
                    </>
                  )}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )}
      
      {/* Translation Trigger */}
      {bengaliConfirmed && currentLanguage !== 'bn' && (
        <div className="p-4 bg-blue-50 border-b border-blue-200">
          <div className="flex items-center justify-between">
            <span className="text-sm text-blue-900">
              Translate Bengali to {getLanguageName(currentLanguage)}
            </span>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => triggerTranslationMutation.mutate({ language: currentLanguage })}
              disabled={triggerTranslationMutation.isPending}
            >
              {triggerTranslationMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Translating...
                </>
              ) : (
                <>
                  <Languages className="w-4 h-4 mr-2" />
                  Translate
                </>
              )}
            </Button>
          </div>
        </div>
      )}
      
      {/* Transcription/Translation Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {transcriptionsLoading ? (
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
          transcriptions.map((transcription: Transcription) => {
            const isCurrentSegment = currentSegment?.id === transcription.id;
            const translation = currentLanguage !== 'bn' ? getTranslationsForLanguage(transcription.id) : null;
            const displayItem = currentLanguage === 'bn' ? transcription : translation;
            const isEditing = editingId === displayItem?.id;
            
            if (currentLanguage !== 'bn' && !displayItem) {
              return (
                <Card
                  key={transcription.id}
                  className="p-3 border border-slate-200"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-slate-500">
                      {formatTime(transcription.startTime)} - {formatTime(transcription.endTime)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 italic">
                    Translation not available. Click "Translate" above to generate.
                  </p>
                </Card>
              );
            }
            
            return (
              <Card
                key={transcription.id}
                className={`p-3 cursor-pointer transition-all duration-200 group ${
                  isCurrentSegment 
                    ? "border-2 border-primary bg-blue-50" 
                    : "border border-slate-200 hover:border-primary"
                }`}
                onClick={() => onTimeSeek(transcription.startTime)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-mono ${
                    isCurrentSegment ? "text-primary font-semibold" : "text-slate-500"
                  }`}>
                    {formatTime(transcription.startTime)} - {formatTime(transcription.endTime)}
                  </span>
                  <div className="flex items-center space-x-1">
                    {displayItem?.confidence && (
                      <Badge className={`text-xs ${getConfidenceColor(displayItem.confidence)}`}>
                        {Math.round(displayItem.confidence * 100)}%
                      </Badge>
                    )}
                    {!isEditing && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(displayItem!, currentLanguage !== 'bn');
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Edit className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
                
                {isEditing ? (
                  <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                    <Textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      className="min-h-[60px] text-sm"
                      autoFocus
                    />
                    <div className="flex justify-end space-x-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleCancel}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleSave(currentLanguage !== 'bn')}
                        disabled={updateTranscriptionMutation.isPending || updateTranslationMutation.isPending}
                      >
                        {(updateTranscriptionMutation.isPending || updateTranslationMutation.isPending) ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className={`text-sm ${
                    isCurrentSegment ? "text-slate-900 font-medium" : "text-slate-700"
                  }`}>
                    {currentLanguage === 'bn' ? transcription.text : displayItem?.translatedText}
                  </p>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}