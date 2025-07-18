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
  Clock, CheckCircle, Loader2, FileAudio, Download, RefreshCw 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Transcription, Translation } from "@shared/schema";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const [translatingLanguages, setTranslatingLanguages] = useState<Set<string>>(new Set());
  const [dubbingLanguages, setDubbingLanguages] = useState<Set<string>>(new Set());
  const [selectedVoiceIds, setSelectedVoiceIds] = useState<string[]>(["21m00Tcm4TlvDq8ikWAM"]); // Support multiple voices
  const [speakerCount, setSpeakerCount] = useState<number>(1);
  const [selectedTranscriptionModel, setSelectedTranscriptionModel] = useState<string>("combined"); // For Bengali model selection
  const [selectedTranslationModel, setSelectedTranslationModel] = useState<string>("gemini"); // For translation model selection
  
  // Fetch video data to get confirmation status
  const { data: videoData } = useQuery({
    queryKey: [`/api/videos/${videoId}`],
    refetchInterval: 5000,
  });

  // Fetch transcriptions with proper error handling
  const { data: transcriptions = [], isLoading: transcriptionsLoading, error: transcriptionsError } = useQuery({
    queryKey: [`/api/videos/${videoId}/transcriptions`],
    refetchInterval: bengaliConfirmed ? false : 5000,
  });

  // Update Bengali confirmation status from video data
  useEffect(() => {
    if (videoData && videoData.bengaliConfirmed !== undefined) {
      setBengaliConfirmed(videoData.bengaliConfirmed);
    }
  }, [videoData]);

  // Detect speaker count from transcriptions
  useEffect(() => {
    if (transcriptions.length > 0) {
      const uniqueSpeakers = new Set(transcriptions.map((t: Transcription) => t.speakerId).filter(Boolean));
      const detectedSpeakerCount = Math.max(1, uniqueSpeakers.size);
      if (detectedSpeakerCount !== speakerCount) {
        setSpeakerCount(detectedSpeakerCount);
        // Initialize voice IDs array for detected speakers
        const newVoiceIds = Array.from({ length: detectedSpeakerCount }, (_, i) => 
          selectedVoiceIds[i] || (i === 0 ? "21m00Tcm4TlvDq8ikWAM" : "EXAVITQu4vr4xnSDxMaL")
        );
        setSelectedVoiceIds(newVoiceIds);
      }
    }
  }, [transcriptions, speakerCount, selectedVoiceIds]);
  
  // Fetch all translations at once
  const { data: allTranslations = {}, isLoading: translationsLoading, refetch: refetchTranslations } = useQuery({
    queryKey: [`/api/videos/${videoId}/all-translations`],
    queryFn: async () => {
      if (transcriptions.length === 0) return {};
      
      const translationMap: Record<number, Translation[]> = {};
      
      // Fetch translations for all transcriptions
      try {
        await Promise.all(
        transcriptions.map(async (t: Transcription) => {
          try {
            const res = await fetch(`/api/transcriptions/${t.id}/translations`);
            if (res.ok) {
              const translations = await res.json();
              translationMap[t.id] = translations;
            }
          } catch (error) {
            console.error(`Error fetching translations for transcription ${t.id}:`, error);
          }
        })
      );
      } catch (error) {
        console.error('Error fetching translations:', error);
      }
      
      return translationMap;
    },
    enabled: transcriptions.length > 0,
    refetchInterval: translatingLanguages.size > 0 ? 3000 : false,
    staleTime: 0,
    gcTime: 0,
  });
  
  // Update transcription mutation
  const updateTranscriptionMutation = useMutation({
    mutationFn: async ({ id, text }: { id: number; text: string }) => {
      return apiRequest('PATCH', `/api/transcriptions/${id}`, { text });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/videos/${videoId}/transcriptions`] });
      
      // If Bengali transcription was edited, mark it as unconfirmed and update video status
      const editedTranscription = transcriptions.find(t => t.id === variables.id);
      if (editedTranscription?.language === 'bn') {
        setBengaliConfirmed(false);
        // Update video Bengali confirmation status to false
        apiRequest('POST', `/api/videos/${videoId}/unconfirm-transcription`);
        // Clear existing translations since Bengali text changed
        queryClient.invalidateQueries({ queryKey: [`/api/videos/${videoId}/all-translations`] });
        queryClient.invalidateQueries({ queryKey: [`/api/videos/${videoId}`] });
        toast({
          title: "Bengali transcription updated",
          description: "Transcription is now unconfirmed. Please review and confirm before translating.",
          variant: "default",
        });
      } else {
        toast({
          title: "Transcription updated",
          description: "Your changes have been saved successfully.",
        });
      }
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
      // Invalidate translations query
      queryClient.invalidateQueries({ queryKey: [`/api/videos/${videoId}/all-translations`] });
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
      // Invalidate video data to refresh confirmation status
      queryClient.invalidateQueries({ queryKey: [`/api/videos/${videoId}`] });
      // Clear existing translations when Bengali is confirmed - they'll need to be regenerated
      queryClient.invalidateQueries({ queryKey: [`/api/videos/${videoId}/all-translations`] });
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
    mutationFn: async ({ language, model }: { language: string; model?: string }) => {
      return apiRequest('POST', `/api/videos/${videoId}/translate`, { 
        targetLanguage: language,
        selectedModel: model || selectedTranslationModel 
      });
    },
    onMutate: (variables) => {
      // Add language to translating set
      setTranslatingLanguages(prev => new Set([...prev, variables.language]));
    },
    onSuccess: (_, variables) => {
      toast({
        title: "Translation completed",
        description: `Successfully translated to ${getLanguageName(variables.language)}`,
      });
      // Immediately invalidate all translation queries to force refresh
      queryClient.invalidateQueries({ queryKey: [`/api/videos/${videoId}/all-translations`] });
      transcriptions.forEach((t: Transcription) => {
        queryClient.invalidateQueries({ queryKey: [`/api/transcriptions/${t.id}/translations`] });
      });
      // Remove from translating set
      setTranslatingLanguages(prev => {
        const newSet = new Set(prev);
        newSet.delete(variables.language);
        return newSet;
      });
    },
    onError: (error, variables) => {
      // Remove language from translating set
      setTranslatingLanguages(prev => {
        const newSet = new Set(prev);
        newSet.delete(variables.language);
        return newSet;
      });
      toast({
        title: "Translation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Retranslate specific transcription mutation
  const retranslateMutation = useMutation({
    mutationFn: async ({ transcriptionId, language }: { transcriptionId: number; language: string }) => {
      return apiRequest('POST', `/api/transcriptions/${transcriptionId}/retranslate`, { targetLanguage: language });
    },
    onSuccess: () => {
      // Invalidate translations to refetch updated data
      queryClient.invalidateQueries({ queryKey: [`/api/videos/${videoId}/all-translations`] });
      transcriptions.forEach((t: Transcription) => {
        queryClient.invalidateQueries({ queryKey: [`/api/transcriptions/${t.id}/translations`] });
      });
      toast({
        title: "Re-translation completed",
        description: "Translation has been updated with new content.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Re-translation failed",
        description: error.message || "Failed to re-translate text",
        variant: "destructive",
      });
    },
  });
  
  // Trigger dubbing mutation
  const triggerDubbingMutation = useMutation({
    mutationFn: async ({ language, voiceId, voiceIds, speakerCount }: { 
      language: string; 
      voiceId?: string; 
      voiceIds?: string[]; 
      speakerCount?: number; 
    }) => {
      return apiRequest('POST', `/api/videos/${videoId}/dubbing`, { 
        language, 
        voiceId, 
        voiceIds: voiceIds || [voiceId || "21m00Tcm4TlvDq8ikWAM"], 
        speakerCount: speakerCount || 1 
      });
    },
    onMutate: (variables) => {
      setDubbingLanguages(prev => new Set([...prev, variables.language]));
    },
    onSuccess: (_, variables) => {
      toast({
        title: "Dubbing started",
        description: `Generating ${getLanguageName(variables.language)} audio dubbing...`,
      });
    },
    onError: (error, variables) => {
      setDubbingLanguages(prev => {
        const newSet = new Set(prev);
        newSet.delete(variables.language);
        return newSet;
      });
      toast({
        title: "Dubbing failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Fetch dubbing jobs
  const { data: dubbingJobs = [] } = useQuery({
    queryKey: [`/api/videos/${videoId}/dubbing`],
    refetchInterval: dubbingLanguages.size > 0 ? 3000 : false,
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
    const translations = allTranslations[transcriptionId] || [];
    const translation = translations.find((t: Translation) => t.targetLanguage === currentLanguage);
    
    // Debug logging
    if (currentLanguage === 'en' && translation) {
      console.log('English translation found:', {
        id: translation.id,
        targetLanguage: translation.targetLanguage,
        translatedText: translation.translatedText,
        transcriptionId: transcriptionId
      });
    }
    
    return translation;
  };
  
  // Check if translations are complete for a language
  useEffect(() => {
    if (translatingLanguages.size > 0 && allTranslations) {
      translatingLanguages.forEach(lang => {
        const hasAllTranslations = transcriptions.every((t: Transcription) => {
          const translations = allTranslations[t.id] || [];
          return translations.some((trans: Translation) => trans.targetLanguage === lang);
        });
        
        if (hasAllTranslations) {
          // Remove from translating set
          setTranslatingLanguages(prev => {
            const newSet = new Set(prev);
            newSet.delete(lang);
            return newSet;
          });
          
          if (lang === currentLanguage) {
            toast({
              title: "Translation complete",
              description: `${getLanguageName(lang)} translation is ready!`,
            });
          }
        }
      });
    }
  }, [allTranslations, transcriptions, translatingLanguages, currentLanguage]);
  
  // Check if dubbing is complete for a language
  useEffect(() => {
    if (dubbingLanguages.size > 0 && dubbingJobs) {
      dubbingLanguages.forEach(lang => {
        const dubbingJob = dubbingJobs.find((job: any) => job.language === lang);
        
        if (dubbingJob && dubbingJob.status === 'completed') {
          // Remove from dubbing set
          setDubbingLanguages(prev => {
            const newSet = new Set(prev);
            newSet.delete(lang);
            return newSet;
          });
          
          if (lang === currentLanguage) {
            toast({
              title: "Dubbing complete",
              description: `${getLanguageName(lang)} audio dubbing is ready!`,
            });
          }
        }
      });
    }
  }, [dubbingJobs, dubbingLanguages, currentLanguage]);
  
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
              <div className="space-y-3">
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
                
                {/* Transcription Model Selection for Bengali */}
                <div className="flex items-center space-x-3">
                  <label className="text-sm font-medium text-amber-800">View transcription from:</label>
                  <Select value={selectedTranscriptionModel} onValueChange={(value) => {
                    setSelectedTranscriptionModel(value);
                    // Invalidate transcription cache to refresh with new model
                    queryClient.invalidateQueries({ queryKey: [`/api/videos/${videoId}/transcriptions`] });
                  }}>
                    <SelectTrigger className="w-[200px] bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="combined">Best Combined Result</SelectItem>
                      <SelectItem value="openai">OpenAI Whisper Only</SelectItem>
                      <SelectItem value="gemini">Gemini 2.5 Pro Only</SelectItem>
                      <SelectItem value="elevenlabs">ElevenLabs STT Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )}
      
      {/* Translation/Dubbing Status Bar */}
      {bengaliConfirmed && currentLanguage !== 'bn' && (() => {
        // Check if translations exist for any transcription in current language
        const hasTranslations = transcriptions.some((t: Transcription) => {
          const translations = allTranslations[t.id] || [];
          return translations.some((trans: Translation) => trans.targetLanguage === currentLanguage);
        });
        
        const isTranslating = translatingLanguages.has(currentLanguage);
        const isDubbing = dubbingLanguages.has(currentLanguage);
        const dubbingJob = dubbingJobs.find((job: any) => job.language === currentLanguage);
        
        return (
          <div className="p-4 bg-slate-50 border-b border-slate-200">
            <div className="space-y-3">
              {/* Translation Status */}
              {!hasTranslations && !isTranslating && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-700">
                      No {getLanguageName(currentLanguage)} translation available
                    </span>
                  </div>
                  
                  {/* Translation Model Selection */}
                  <div className="flex items-center space-x-3">
                    <label className="text-sm font-medium text-slate-700">Translation model:</label>
                    <Select value={selectedTranslationModel} onValueChange={(value) => {
                      setSelectedTranslationModel(value);
                      // Invalidate translation cache to refresh with new model
                      queryClient.invalidateQueries({ queryKey: [`/api/videos/${videoId}/all-translations`] });
                    }}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gemini">Gemini 2.5 Pro</SelectItem>
                        <SelectItem value="openai">OpenAI GPT-4</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => triggerTranslationMutation.mutate({ language: currentLanguage, model: selectedTranslationModel })}
                      disabled={triggerTranslationMutation.isPending}
                    >
                      <Languages className="w-4 h-4 mr-2" />
                      Translate to {getLanguageName(currentLanguage)}
                    </Button>
                  </div>
                </div>
              )}
              
              {/* Translation Model Selection for non-Bengali languages */}
              {hasTranslations && (
                <div className="flex items-center space-x-3">
                  <label className="text-sm font-medium text-slate-700">Translation source:</label>
                  <Select value={selectedTranslationModel} onValueChange={(value) => {
                    setSelectedTranslationModel(value);
                    // Invalidate translation cache to refresh with new model
                    queryClient.invalidateQueries({ queryKey: [`/api/videos/${videoId}/all-translations`] });
                  }}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gemini">Gemini 2.5 Pro</SelectItem>
                      <SelectItem value="openai">OpenAI GPT-4</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {isTranslating && (
                <div className="flex items-center justify-between bg-amber-50 p-3 rounded-lg">
                  <span className="text-sm text-amber-900">
                    Translating to {getLanguageName(currentLanguage)}...
                  </span>
                  <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                </div>
              )}
              
            </div>
          );
        }
      })()}
      
      {/* Separate Dubbing Section - Independent from Translation */}
      {bengaliConfirmed && currentLanguage !== 'bn' && (
        <div className="mt-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <div className="flex items-center space-x-2 mb-4">
            <FileAudio className="w-5 h-5 text-purple-600" />
            <h3 className="text-lg font-semibold text-purple-900">
              Audio Dubbing - {getLanguageName(currentLanguage)}
            </h3>
            <Badge variant="outline" className="text-purple-700">
              Uses Original Video Audio
            </Badge>
          </div>
          
          <Alert className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Audio dubbing processes the original video audio directly through ElevenLabs Dubbing Studio. 
              This is independent of text translations and creates authentic dubbed audio with natural timing.
            </AlertDescription>
          </Alert>
          
          {(() => {
            const dubbingJob = dubbingJobs.find((job: any) => job.language === currentLanguage);
            const isDubbing = dubbingLanguages.has(currentLanguage);
            
            if (!dubbingJob && !isDubbing) {
              return (
                <div className="space-y-3">
                  {/* Speaker Count Selection */}
                  <div className="flex items-center space-x-2">
                    <label className="text-sm font-medium text-purple-800">Speakers:</label>
                    <Select value={speakerCount.toString()} onValueChange={(value) => {
                      const newCount = parseInt(value);
                      setSpeakerCount(newCount);
                      const newVoiceIds = Array.from({ length: newCount }, (_, i) => 
                        selectedVoiceIds[i] || (i === 0 ? "21m00Tcm4TlvDq8ikWAM" : "EXAVITQu4vr4xnSDxMaL")
                      );
                      setSelectedVoiceIds(newVoiceIds);
                    }}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map(num => (
                          <SelectItem key={num} value={num.toString()}>{num} Speaker{num > 1 ? 's' : ''}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {transcriptions.length > 0 && (
                      <span className="text-xs text-purple-600">
                        (Auto-detected: {Math.max(1, new Set(transcriptions.map((t: Transcription) => t.speakerId).filter(Boolean)).size)})
                      </span>
                    )}
                  </div>
                  
                  {/* Voice Selection */}
                  <div className="space-y-2">
                    {Array.from({ length: speakerCount }, (_, i) => (
                      <div key={i} className="flex items-center space-x-2">
                        <label className="text-sm text-purple-800 w-16">Voice {i + 1}:</label>
                        <Select 
                          value={selectedVoiceIds[i] || "21m00Tcm4TlvDq8ikWAM"} 
                          onValueChange={(value) => {
                            const newVoices = [...selectedVoiceIds];
                            newVoices[i] = value;
                            setSelectedVoiceIds(newVoices);
                          }}
                        >
                          <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Select voice" />
                          </SelectTrigger>
                          <SelectContent>
                            {currentLanguage === 'en' && (
                              <>
                                <SelectItem value="21m00Tcm4TlvDq8ikWAM">Rachel (Female, American)</SelectItem>
                                <SelectItem value="EXAVITQu4vr4xnSDxMaL">Bella (Female, American)</SelectItem>
                                <SelectItem value="ErXwobaYiN019PkySvjV">Antoni (Male, American)</SelectItem>
                                <SelectItem value="pNInz6obpgDQGcFmaJgB">Adam (Male, American)</SelectItem>
                              </>
                            )}
                            {(currentLanguage === 'hi' || currentLanguage === 'ta' || currentLanguage === 'te' || currentLanguage === 'ml') && (
                              <>
                                <SelectItem value="XB0fDUnXU5powFXDhCwa">Charlotte (Female, Indian)</SelectItem>
                                <SelectItem value="IKne3meq5aSn9XLyUdCD">Charlie (Male, Indian)</SelectItem>
                                <SelectItem value="21m00Tcm4TlvDq8ikWAM">Rachel (Female, American)</SelectItem>
                                <SelectItem value="ErXwobaYiN019PkySvjV">Antoni (Male, American)</SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                  
                  <Button 
                    size="sm" 
                    variant="default"
                    onClick={() => triggerDubbingMutation.mutate({ 
                      language: currentLanguage, 
                      voiceId: selectedVoiceIds[0] || "21m00Tcm4TlvDq8ikWAM",
                      voiceIds: selectedVoiceIds.slice(0, speakerCount),
                      speakerCount 
                    })}
                    disabled={triggerDubbingMutation.isPending}
                    className="w-full bg-purple-600 hover:bg-purple-700"
                  >
                    <FileAudio className="w-4 h-4 mr-2" />
                    Generate Audio Dubbing ({speakerCount} Speaker{speakerCount > 1 ? 's' : ''})
                  </Button>
                </div>
              );
            }
            
            if (isDubbing) {
              return (
                <div className="flex items-center justify-between bg-purple-100 p-3 rounded-lg">
                  <span className="text-sm text-purple-900">
                    Processing {getLanguageName(currentLanguage)} dubbing with ElevenLabs Studio...
                  </span>
                  <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                </div>
              );
            }
            
            if (dubbingJob) {
              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-purple-900">
                      Dubbing Status: {dubbingJob.status}
                    </span>
                    <Badge className={dubbingJob.status === 'completed' ? 'bg-green-100 text-green-700' : 
                                    dubbingJob.status === 'failed' ? 'bg-red-100 text-red-700' : 
                                    'bg-yellow-100 text-yellow-700'}>
                      {dubbingJob.status}
                    </Badge>
                  </div>
                  
                  {dubbingJob.status === 'completed' && dubbingJob.audioPath && (
                    <div className="flex items-center space-x-2 p-2 bg-green-50 rounded">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-sm text-green-800">Dubbing completed!</span>
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="text-green-700 border-green-300 hover:bg-green-100"
                      >
                        <Download className="w-4 h-4 mr-1" />
                        Download
                      </Button>
                    </div>
                  )}
                  
                  {dubbingJob.status === 'failed' && (
                    <div className="flex items-center justify-between p-2 bg-red-50 rounded">
                      <span className="text-sm text-red-800">Dubbing failed</span>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => triggerDubbingMutation.mutate({ 
                          language: currentLanguage, 
                          voiceId: selectedVoiceIds[0] || "21m00Tcm4TlvDq8ikWAM",
                          voiceIds: selectedVoiceIds.slice(0, speakerCount),
                          speakerCount 
                        })}
                        disabled={triggerDubbingMutation.isPending}
                        className="text-red-700 border-red-300 hover:bg-red-100"
                      >
                        Retry Dubbing
                      </Button>
                    </div>
                  )}
                </div>
              );
            }
          })()}
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
            const isEditing = editingId === (currentLanguage === 'bn' ? transcription.id : translation?.id);
            
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
                    {/* Speaker identification */}
                    {currentLanguage === 'bn' && transcription.speakerId && (
                      <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700">
                        {transcription.speakerName || `Speaker ${transcription.speakerId}`}
                      </Badge>
                    )}
                    {!isEditing && (
                      <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {currentLanguage !== 'bn' && displayItem?.text && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              retranslateMutation.mutate({ 
                                transcriptionId: transcription.id, 
                                language: currentLanguage 
                              });
                            }}
                            disabled={retranslateMutation.isPending}
                            className="h-6 px-2"
                            title="Re-verify translation"
                          >
                            <RefreshCw className={`w-3 h-3 ${retranslateMutation.isPending ? 'animate-spin' : ''}`} />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(displayItem!, currentLanguage !== 'bn');
                          }}
                          className="h-6 px-2"
                          title="Edit text"
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                      </div>
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
                  <div>
                    <p className={`text-sm ${
                      isCurrentSegment ? "text-slate-900 font-medium" : "text-slate-700"
                    }`}>
                      {currentLanguage === 'bn' 
                        ? transcription.text 
                        : (translation?.translatedText || translation?.text || 'Translation not available')}
                    </p>
                    {currentLanguage !== 'bn' && translation && (
                      <p className="text-xs text-slate-500 mt-1 italic">
                        Bengali: {transcription.text}
                      </p>
                    )}
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
                      <Select value={speakerCount.toString()} onValueChange={(value) => {
                        const newCount = parseInt(value);
                        setSpeakerCount(newCount);
                        // Adjust voice IDs array
                        const newVoiceIds = Array.from({ length: newCount }, (_, i) => 
                          selectedVoiceIds[i] || (i === 0 ? "21m00Tcm4TlvDq8ikWAM" : "EXAVITQu4vr4xnSDxMaL")
                        );
                        setSelectedVoiceIds(newVoiceIds);
                      }}>
                        <SelectTrigger className="w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5].map(num => (
                            <SelectItem key={num} value={num.toString()}>{num} Speaker{num > 1 ? 's' : ''}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {/* Show detected speakers count */}
                      {transcriptions.length > 0 && (
                        <span className="text-xs text-slate-500">
                          (Detected: {Math.max(1, new Set(transcriptions.map((t: Transcription) => t.speakerId).filter(Boolean)).size)} speakers)
                        </span>
                      )}
                    </div>
                    
                    {/* Voice Selection for each speaker */}
                    <div className="space-y-2">
                      {Array.from({ length: speakerCount }, (_, i) => (
                        <div key={i} className="flex items-center space-x-2">
                          <label className="text-sm w-16">Voice {i + 1}:</label>
                          <Select 
                            value={selectedVoiceIds[i] || "21m00Tcm4TlvDq8ikWAM"} 
                            onValueChange={(value) => {
                              const newVoices = [...selectedVoiceIds];
                              newVoices[i] = value;
                              setSelectedVoiceIds(newVoices);
                            }}
                          >
                            <SelectTrigger className="w-[200px]">
                              <SelectValue placeholder="Select voice" />
                            </SelectTrigger>
                            <SelectContent>
                              {currentLanguage === 'en' && (
                                <>
                                  <SelectItem value="21m00Tcm4TlvDq8ikWAM">Rachel (Female, American)</SelectItem>
                                  <SelectItem value="EXAVITQu4vr4xnSDxMaL">Bella (Female, American)</SelectItem>
                                  <SelectItem value="AZnzlk1XvdvUeBnXmlld">Domi (Female, American)</SelectItem>
                                  <SelectItem value="ErXwobaYiN019PkySvjV">Antoni (Male, American)</SelectItem>
                                  <SelectItem value="VR6AewLTigWG4xSOukaG">Arnold (Male, American)</SelectItem>
                                  <SelectItem value="pNInz6obpgDQGcFmaJgB">Adam (Male, American)</SelectItem>
                                  <SelectItem value="yoZ06aMxZJJ28mfd3POQ">Sam (Male, American)</SelectItem>
                                </>
                              )}
                              {(currentLanguage === 'hi' || currentLanguage === 'ta' || currentLanguage === 'te' || currentLanguage === 'ml') && (
                                <>
                                  <SelectItem value="XB0fDUnXU5powFXDhCwa">Charlotte (Female, Indian Accent)</SelectItem>
                                  <SelectItem value="IKne3meq5aSn9XLyUdCD">Charlie (Male, Indian Accent)</SelectItem>
                                  <SelectItem value="onwK4e9ZLuTAKqWW03F9">Daniel (Male, Indian Accent)</SelectItem>
                                  <SelectItem value="21m00Tcm4TlvDq8ikWAM">Rachel (Female, American)</SelectItem>
                                  <SelectItem value="ErXwobaYiN019PkySvjV">Antoni (Male, American)</SelectItem>
                                  <SelectItem value="pNInz6obpgDQGcFmaJgB">Adam (Male, American)</SelectItem>
                                </>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                    
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => triggerDubbingMutation.mutate({ 
                        language: currentLanguage, 
                        voiceId: selectedVoiceIds[0] || "21m00Tcm4TlvDq8ikWAM",
                        voiceIds: selectedVoiceIds.slice(0, speakerCount),
                        speakerCount 
                      })}
                      disabled={triggerDubbingMutation.isPending}
                      className="w-full"
                    >
                      <FileAudio className="w-4 h-4 mr-2" />
                      Generate Dubbing ({speakerCount} Speaker{speakerCount > 1 ? 's' : ''})
                    </Button>
                  </div>
                </div>
              )}
              
              {isDubbing && (
                <div className="flex items-center justify-between bg-purple-50 p-3 rounded-lg">
                  <span className="text-sm text-purple-900">
                    Generating {getLanguageName(currentLanguage)} dubbing...
                  </span>
                  <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                </div>
              )}
              
              {dubbingJob && dubbingJob.status === 'completed' && (
                <div className="flex items-center justify-between bg-green-50 p-3 rounded-lg">
                  <span className="text-sm text-green-900">
                    {getLanguageName(currentLanguage)} dubbing ready
                  </span>
                  <Button 
                    size="sm" 
                    variant="ghost"
                    onClick={() => window.open(`/api/videos/${videoId}/dubbing/${dubbingJob.id}/download`, '_blank')}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download Audio
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })()}
      
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
            const isEditing = editingId === (currentLanguage === 'bn' ? transcription.id : translation?.id);
            
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
                    {/* Speaker identification */}
                    {currentLanguage === 'bn' && transcription.speakerId && (
                      <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700">
                        {transcription.speakerName || `Speaker ${transcription.speakerId}`}
                      </Badge>
                    )}
                    {!isEditing && (
                      <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {currentLanguage !== 'bn' && displayItem?.text && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              retranslateMutation.mutate({ 
                                transcriptionId: transcription.id, 
                                language: currentLanguage 
                              });
                            }}
                            disabled={retranslateMutation.isPending}
                            className="h-6 px-2"
                            title="Re-verify translation"
                          >
                            <RefreshCw className={`w-3 h-3 ${retranslateMutation.isPending ? 'animate-spin' : ''}`} />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(displayItem!, currentLanguage !== 'bn');
                          }}
                          className="h-6 px-2"
                          title="Edit text"
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                      </div>
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
                  <div>
                    <p className={`text-sm ${
                      isCurrentSegment ? "text-slate-900 font-medium" : "text-slate-700"
                    }`}>
                      {currentLanguage === 'bn' 
                        ? transcription.text 
                        : (translation?.translatedText || translation?.text || 'Translation not available')}
                    </p>
                    {currentLanguage !== 'bn' && translation && (
                      <p className="text-xs text-slate-500 mt-1 italic">
                        Bengali: {transcription.text}
                      </p>
                    )}
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}