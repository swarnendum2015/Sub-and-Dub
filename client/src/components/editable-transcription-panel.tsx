import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  CheckCircle, 
  AlertCircle, 
  Download, 
  Loader2, 
  RefreshCw, 
  FileAudio, 
  Edit,
  Check,
  X,
  Mic,
  Play,
  Languages,
  Trash2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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
  const [currentLanguage, setCurrentLanguage] = useState('bn');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [dubbingLanguages, setDubbingLanguages] = useState<Set<string>>(new Set());
  const [speakerCount, setSpeakerCount] = useState(1);
  const [selectedVoiceIds, setSelectedVoiceIds] = useState<string[]>(["21m00Tcm4TlvDq8ikWAM"]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Data fetching queries
  const { data: transcriptions = [], isLoading: transcriptionsLoading } = useQuery({
    queryKey: ['/api/videos', videoId, 'transcriptions'],
    queryFn: async () => {
      const response = await fetch(`/api/videos/${videoId}/transcriptions`);
      if (!response.ok) throw new Error('Failed to fetch transcriptions');
      return response.json();
    },
    enabled: !!videoId,
  });

  const { data: allTranslations = [] } = useQuery({
    queryKey: ['/api/translations', videoId, transcriptions.map(t => t.id).join(',')],
    queryFn: async () => {
      if (!transcriptions.length) return [];
      
      const translationPromises = transcriptions.map(async (transcription: Transcription) => {
        try {
          const response = await fetch(`/api/transcriptions/${transcription.id}/translations`);
          if (!response.ok) {
            console.error(`Failed to fetch translation for transcription ${transcription.id}:`, response.statusText);
            return [];
          }
          const translationsData = await response.json();
          return translationsData.map((t: Translation) => ({ ...t, transcriptionId: transcription.id }));
        } catch (error) {
          console.error(`Failed to fetch translation for transcription ${transcription.id}:`, error);
          return [];
        }
      });
      
      try {
        const translationResults = await Promise.allSettled(translationPromises);
        return translationResults
          .filter(result => result.status === 'fulfilled')
          .map(result => (result as PromiseFulfilledResult<any[]>).value)
          .flat();
      } catch (error) {
        console.error('Error fetching translations:', error);
        return [];
      }
    },
    enabled: !!videoId && transcriptions.length > 0,
    refetchInterval: 2000, // Refetch every 2 seconds to catch new translations
  });

  const { data: dubbingJobs = [] } = useQuery({
    queryKey: ['/api/videos', videoId, 'dubbing-jobs'],
    queryFn: async () => {
      const response = await fetch(`/api/videos/${videoId}/dubbing-jobs`);
      if (!response.ok) throw new Error('Failed to fetch dubbing jobs');
      return response.json();
    },
    enabled: !!videoId,
  });

  const { data: video, refetch: refetchVideo } = useQuery({
    queryKey: ['/api/videos', videoId],
    queryFn: async () => {
      const response = await fetch(`/api/videos/${videoId}`);
      if (!response.ok) throw new Error('Failed to fetch video');
      const data = await response.json();
      return data;
    },
    enabled: !!videoId,
    refetchInterval: 1000, // Refetch every second to ensure UI stays updated
  });

  // Helper functions
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.9) return 'bg-green-100 text-green-700';
    if (confidence >= 0.7) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  };

  const getLanguageName = (code: string): string => {
    const names = {
      'bn': 'Bengali',
      'en': 'English',
      'hi': 'Hindi',
      'ta': 'Tamil',
      'te': 'Telugu',
      'ml': 'Malayalam',
    };
    return names[code] || code;
  };

  const getCurrentSegment = () => {
    return transcriptions.find((t: Transcription) => 
      currentTime >= t.startTime && currentTime <= t.endTime
    );
  };

  const getTranslationsForLanguage = (transcriptionId: number) => {
    const translation = allTranslations.find((t: Translation) => 
      t.transcriptionId === transcriptionId && t.targetLanguage === currentLanguage
    );
    return translation;
  };

  const bengaliConfirmed = video?.bengaliConfirmed;
  const currentSegment = getCurrentSegment();
  
  // Debug logging (remove console logs to prevent performance issues)
  // console.log('Video data:', video);
  // console.log('Bengali confirmed status:', bengaliConfirmed);

  // Mutations
  const confirmBengaliMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/videos/${videoId}/confirm-transcription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error('Failed to confirm Bengali transcription');
      return response.json();
    },
    onSuccess: () => {
      // Force immediate refetch of video data
      refetchVideo();
      queryClient.invalidateQueries({ queryKey: ['/api/videos'] });
      toast({ title: "Bengali transcription confirmed successfully" });
    },
  });

  const updateTranscriptionMutation = useMutation({
    mutationFn: async ({ id, text }: { id: number; text: string }) => {
      const response = await fetch(`/api/transcriptions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) throw new Error('Failed to update transcription');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/transcriptions', videoId] });
      queryClient.invalidateQueries({ queryKey: ['/api/videos', videoId] });
      queryClient.invalidateQueries({ queryKey: ['/api/translations', videoId] });
      setEditingId(null);
      toast({ title: "Updated successfully" });
    },
  });

  const updateTranslationMutation = useMutation({
    mutationFn: async ({ id, text }: { id: number; text: string }) => {
      const response = await fetch(`/api/translations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) throw new Error('Failed to update translation');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/translations', videoId] });
      queryClient.invalidateQueries({ queryKey: ['/api/videos', videoId, 'transcriptions'] });
      setEditingId(null);
      toast({ title: "Translation updated successfully" });
    },
  });

  const deleteTranscriptionMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/transcriptions/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete transcription');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/videos', videoId, 'transcriptions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/translations', videoId] });
      queryClient.invalidateQueries({ queryKey: ['/api/videos', videoId] });
      toast({
        title: "Segment deleted",
        description: "Transcription segment has been removed",
      });
    },
    onError: (error) => {
      console.error('Failed to delete transcription:', error);
      toast({
        title: "Delete failed",
        description: "Could not delete transcription segment",
        variant: "destructive",
      });
    },
  });

  const retranslateMutation = useMutation({
    mutationFn: async ({ transcriptionId, language }: { transcriptionId: number; language: string }) => {
      const response = await fetch(`/api/transcriptions/${transcriptionId}/retranslate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetLanguage: language }),
      });
      if (!response.ok) throw new Error('Failed to retranslate');
      return response.json();
    },
    onSuccess: (_, { transcriptionId }) => {
      // Invalidate specific transcription translation query
      queryClient.invalidateQueries({ queryKey: [`/api/transcriptions/${transcriptionId}/translations`] });
      queryClient.invalidateQueries({ queryKey: ['/api/translations', videoId] });
      toast({ title: "Translation refreshed successfully" });
    },
  });

  const switchAlternativeMutation = useMutation({
    mutationFn: async (transcriptionId: number) => {
      const response = await fetch(`/api/transcriptions/${transcriptionId}/switch-alternative`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error('Failed to switch alternative transcription');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/videos', videoId, 'transcriptions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/translations', videoId] });
      toast({ title: "Alternative transcription selected" });
    },
    onError: (error) => {
      toast({
        title: "Switch failed",
        description: "Could not switch to alternative transcription",
        variant: "destructive",
      });
    },
  });

  const translateMutation = useMutation({
    mutationFn: async (targetLanguage: string) => {
      const response = await fetch(`/api/videos/${videoId}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetLanguage }),
      });
      if (!response.ok) throw new Error('Failed to start translation');
      return response.json();
    },
    onSuccess: () => {
      // Invalidate all translation-related queries with wildcard matching
      queryClient.invalidateQueries({ queryKey: ['/api/translations'] });
      // Also invalidate individual transcription translation queries
      transcriptions.forEach((transcription: Transcription) => {
        queryClient.invalidateQueries({ queryKey: [`/api/transcriptions/${transcription.id}/translations`] });
      });
      // Force refetch of translations
      queryClient.refetchQueries({ queryKey: ['/api/translations', videoId] });
      toast({ title: "Translation completed successfully" });
    },
  });

  const triggerDubbingMutation = useMutation({
    mutationFn: async ({ language, voiceIds, speakerCount }: { language: string; voiceIds: string[]; speakerCount: number }) => {
      setDubbingLanguages(prev => new Set([...prev, language]));
      const response = await fetch(`/api/videos/${videoId}/dubbing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          language, 
          voiceIds: voiceIds.slice(0, speakerCount),
          dubbingType: 'studio'
        }),
      });
      if (!response.ok) throw new Error('Failed to start dubbing');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/dubbing-jobs', videoId] });
      toast({ title: "Dubbing started" });
    },
    onSettled: (_, __, { language }) => {
      setDubbingLanguages(prev => {
        const newSet = new Set(prev);
        newSet.delete(language);
        return newSet;
      });
    },
  });

  // Edit handlers
  const handleEdit = (item: Transcription | Translation, isTranslation: boolean) => {
    setEditingId(item.id);
    setEditingText(isTranslation ? (item as Translation).text : (item as Transcription).text);
  };

  const handleSave = async (isTranslation: boolean) => {
    if (editingId === null) return;
    
    if (isTranslation) {
      await updateTranslationMutation.mutateAsync({ id: editingId, text: editingText });
    } else {
      await updateTranscriptionMutation.mutateAsync({ id: editingId, text: editingText });
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditingText('');
  };

  // Check translation status
  const getTranslationStatus = (language: string) => {
    if (language === 'bn') return 'original';
    
    const hasAllTranslations = transcriptions.every((t: Transcription) => {
      return allTranslations.some((trans: Translation) => 
        trans.transcriptionId === t.id && trans.targetLanguage === language
      );
    });
    
    const hasTranslations = transcriptions.some((t: Transcription) => {
      return allTranslations.some((trans: Translation) => 
        trans.transcriptionId === t.id && trans.targetLanguage === language
      );
    });
    
    if (hasAllTranslations) return 'completed';
    if (hasTranslations) return 'partial';
    return 'none';
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="p-4 border-b bg-slate-50">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">Transcription & Translation</h2>
          <div className="flex items-center space-x-2">
            {bengaliConfirmed ? (
              <Badge className="bg-green-100 text-green-700">
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
        
        {/* Language Tabs */}
        <Tabs value={currentLanguage} onValueChange={setCurrentLanguage} className="w-full">
          <TabsList className="grid grid-cols-6 gap-1">
            <TabsTrigger value="bn" className="text-xs">
              Bengali
            </TabsTrigger>
            {['en', 'hi', 'ta', 'te', 'ml'].map((lang) => {
              const status = getTranslationStatus(lang);
              return (
                <TabsTrigger key={lang} value={lang} className="text-xs relative">
                  {getLanguageName(lang)}
                  {status === 'completed' && (
                    <CheckCircle className="w-3 h-3 ml-1 text-green-600" />
                  )}
                  {status === 'partial' && (
                    <div className="w-2 h-2 bg-yellow-500 rounded-full ml-1" />
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
          
          {/* Tab Content */}
          {['bn', 'en', 'hi', 'ta', 'te', 'ml'].map((lang) => (
            <TabsContent key={lang} value={lang} className="mt-4">
              {(() => {
                if (lang === 'bn') {
                  // console.log('Bengali tab - confirmed status:', bengaliConfirmed);
                  if (!bengaliConfirmed) {
                    return (
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
                    );
                  } else {
                    return (
                      <div className="flex items-center space-x-2 p-3 bg-green-50 rounded-lg">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <span className="text-sm text-green-800">
                          Bengali transcription confirmed and ready for translation
                        </span>
                      </div>
                    );
                  }
                }
                
                // Translation languages
                const status = getTranslationStatus(lang);
                
                if (status === 'none' || status === 'partial') {
                  return (
                    <div className="space-y-3">
                      <Alert>
                        <Languages className="h-4 w-4" />
                        <AlertDescription>
                          {status === 'none' 
                            ? `Generate ${getLanguageName(lang)} translations for all transcription segments.`
                            : `Complete the remaining ${getLanguageName(lang)} translations.`
                          }
                        </AlertDescription>
                      </Alert>
                      
                      <Button 
                        size="sm" 
                        onClick={() => translateMutation.mutate(lang)}
                        disabled={translateMutation.isPending || !bengaliConfirmed}
                        title={!bengaliConfirmed ? 'Please confirm Bengali transcription first' : ''}
                        className={`w-full ${!bengaliConfirmed ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {translateMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Languages className="w-4 h-4 mr-2" />
                        )}
                        {status === 'none' ? 'Generate' : 'Complete'} {getLanguageName(lang)} Translation
                      </Button>
                      
                      {!bengaliConfirmed && (
                        <p className="text-xs text-gray-500 mt-1">
                          Please confirm Bengali transcription first
                        </p>
                      )}
                    </div>
                  );
                }
                
                return (
                  <div className="flex items-center space-x-2 p-3 bg-green-50 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="text-sm text-green-800">
                      {getLanguageName(lang)} translation completed
                    </span>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => translateMutation.mutate(lang)}
                      disabled={translateMutation.isPending}
                      className="ml-auto text-green-700 border-green-300 hover:bg-green-100"
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Refresh
                    </Button>
                  </div>
                );
              })()}
            </TabsContent>
          ))}
        </Tabs>
      </div>
      
      {/* Separate Dubbing Section - Independent from Translation */}
      {bengaliConfirmed && currentLanguage !== 'bn' && (
        <div className="mx-4 mt-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <div className="flex items-center space-x-2 mb-4">
            <FileAudio className="w-5 h-5 text-purple-600" />
            <h3 className="text-lg font-semibold text-purple-900">
              Audio Dubbing - {getLanguageName(currentLanguage)}
            </h3>
            <Badge variant="outline" className="text-purple-700">
              Uses Original Video Audio
            </Badge>
          </div>
          
          
          
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
                    {/* Model source indicator */}
                    {currentLanguage === 'bn' && transcription.modelSource && (
                      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700">
                        {transcription.modelSource}
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
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm('Are you sure you want to delete this subtitle segment?')) {
                              deleteTranscriptionMutation.mutate(transcription.id);
                            }
                          }}
                          className="h-6 px-2 hover:bg-red-100 hover:text-red-700"
                          disabled={deleteTranscriptionMutation.isPending}
                          title="Delete segment"
                        >
                          <Trash2 className="w-3 h-3" />
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
                    
                    {/* Alternative transcription display for Bengali */}
                    {currentLanguage === 'bn' && transcription.alternativeText && transcription.alternativeText !== transcription.text && (
                      <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-amber-800">
                            Alternative ({transcription.alternativeModelSource || 'Different Model'}):
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              switchAlternativeMutation.mutate(transcription.id);
                            }}
                            disabled={switchAlternativeMutation.isPending}
                            className="h-6 px-2 text-amber-700 hover:bg-amber-100"
                            title="Use this alternative text"
                          >
                            {switchAlternativeMutation.isPending ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              "Use This"
                            )}
                          </Button>
                        </div>
                        <p className="text-sm text-amber-900">
                          {transcription.alternativeText}
                        </p>
                      </div>
                    )}
                    
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