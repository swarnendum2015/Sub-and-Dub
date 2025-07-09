import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, AlertCircle, Languages, Mic, Volume2, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Video } from "@shared/schema";

interface Language {
  code: string;
  name: string;
}

interface ServiceSelectionProps {
  videoId: number;
  video: Video;
  onComplete: () => void;
}

const TRANSCRIPTION_MODELS = [
  { id: "openai", name: "OpenAI Whisper", description: "Industry-leading transcription accuracy" },
  { id: "gemini", name: "Google Gemini", description: "Advanced context understanding" },
  { id: "elevenlabs", name: "ElevenLabs", description: "High-quality speech processing" }
];

const TARGET_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "hi", name: "Hindi" },
  { code: "ta", name: "Tamil" },
  { code: "te", name: "Telugu" },
  { code: "ml", name: "Malayalam" },
  { code: "ur", name: "Urdu" },
  { code: "pa", name: "Punjabi" },
  { code: "gu", name: "Gujarati" },
  { code: "kn", name: "Kannada" },
  { code: "or", name: "Odia" },
  { code: "as", name: "Assamese" },
  { code: "mr", name: "Marathi" }
];

export default function ServiceSelectionPage() {
  const { id } = useParams<{ id: string }>();
  const videoId = parseInt(id || "0");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>(["openai", "gemini"]);
  const [selectedTargetLanguages, setSelectedTargetLanguages] = useState<string[]>([]);
  const [correctedSourceLanguage, setCorrectedSourceLanguage] = useState<string>("");

  // Fetch video data
  const { data: video, isLoading: videoLoading } = useQuery<Video>({
    queryKey: [`/api/videos/${videoId}`],
    enabled: !!videoId,
  });

  // Fetch supported languages
  const { data: supportedLanguages } = useQuery<Language[]>({
    queryKey: ["/api/languages"],
  });

  // Initialize corrected source language when video loads
  useEffect(() => {
    if (video?.sourceLanguage) {
      setCorrectedSourceLanguage(video.sourceLanguage);
    }
  }, [video]);

  // Service selection mutation
  const selectServicesMutation = useMutation({
    mutationFn: async (data: {
      services: string[];
      models: string[];
      targetLanguages: string[];
      sourceLanguage: string;
    }) => {
      return await apiRequest(`/api/videos/${videoId}/select-services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "Services Selected",
        description: "Your video is now being processed with the selected services.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/videos/${videoId}`] });
      navigate(`/workspace/${videoId}`);
    },
    onError: (error: any) => {
      toast({
        title: "Selection Failed",
        description: error.message || "Failed to select services. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleServiceChange = (service: string, checked: boolean) => {
    if (checked) {
      setSelectedServices([...selectedServices, service]);
    } else {
      setSelectedServices(selectedServices.filter(s => s !== service));
    }
  };

  const handleModelChange = (model: string, checked: boolean) => {
    if (checked) {
      setSelectedModels([...selectedModels, model]);
    } else {
      setSelectedModels(selectedModels.filter(m => m !== model));
    }
  };

  const handleTargetLanguageChange = (language: string, checked: boolean) => {
    if (checked) {
      setSelectedTargetLanguages([...selectedTargetLanguages, language]);
    } else {
      setSelectedTargetLanguages(selectedTargetLanguages.filter(l => l !== language));
    }
  };

  const handleProceed = () => {
    if (selectedServices.length === 0) {
      toast({
        title: "No Services Selected",
        description: "Please select at least one service to proceed.",
        variant: "destructive",
      });
      return;
    }

    // Validate transcription models if transcription is selected
    if (selectedServices.includes("transcription") && selectedModels.length === 0) {
      toast({
        title: "No Models Selected",
        description: "Please select at least one transcription model.",
        variant: "destructive",
      });
      return;
    }

    // Validate target languages if translation is selected
    if (selectedServices.includes("translation") && selectedTargetLanguages.length === 0) {
      toast({
        title: "No Target Languages Selected",
        description: "Please select at least one target language for translation.",
        variant: "destructive",
      });
      return;
    }

    selectServicesMutation.mutate({
      services: selectedServices,
      models: selectedModels,
      targetLanguages: selectedTargetLanguages,
      sourceLanguage: correctedSourceLanguage,
    });
  };

  if (videoLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!video) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Video Not Found</h2>
          <p className="text-gray-600">The video you're looking for doesn't exist.</p>
        </div>
      </div>
    );
  }

  if (video.status !== "analyzed") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">
            {video.status === "analyzing" ? "Analyzing Video..." : "Video Not Ready"}
          </h2>
          <p className="text-gray-600">
            {video.status === "analyzing" 
              ? "Please wait while we analyze your video and detect the source language."
              : "This video needs to be analyzed first before selecting services."
            }
          </p>
        </div>
      </div>
    );
  }

  const detectedLanguage = supportedLanguages?.find(lang => lang.code === video.sourceLanguage);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Select Services</h1>
          <p className="text-gray-600">Choose the services you want for your video: {video.originalName}</p>
        </div>

        {/* Video Analysis Results */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Analysis Complete
            </CardTitle>
            <CardDescription>
              Your video has been analyzed and is ready for processing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Detected Source Language</Label>
                <div className="flex items-center gap-4 mt-2">
                  <Badge variant="outline" className="flex items-center gap-2">
                    <Languages className="h-4 w-4" />
                    {detectedLanguage?.name || video.sourceLanguage}
                    <span className="text-xs opacity-70">
                      ({Math.round((video.sourceLanguageConfidence || 0) * 100)}% confidence)
                    </span>
                  </Badge>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="source-language" className="text-sm">Correct to:</Label>
                    <Select value={correctedSourceLanguage} onValueChange={setCorrectedSourceLanguage}>
                      <SelectTrigger id="source-language" className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {supportedLanguages?.map((lang) => (
                          <SelectItem key={lang.code} value={lang.code}>
                            {lang.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Service Selection */}
        <div className="grid gap-6">
          {/* Services */}
          <Card>
            <CardHeader>
              <CardTitle>Select Services</CardTitle>
              <CardDescription>Choose which services you want to apply to your video</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="transcription" 
                    checked={selectedServices.includes("transcription")}
                    onCheckedChange={(checked) => handleServiceChange("transcription", checked as boolean)}
                  />
                  <Label htmlFor="transcription" className="flex items-center gap-2 cursor-pointer">
                    <Mic className="h-4 w-4" />
                    Transcription
                  </Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="translation" 
                    checked={selectedServices.includes("translation")}
                    onCheckedChange={(checked) => handleServiceChange("translation", checked as boolean)}
                  />
                  <Label htmlFor="translation" className="flex items-center gap-2 cursor-pointer">
                    <Languages className="h-4 w-4" />
                    Translation
                  </Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="dubbing" 
                    checked={selectedServices.includes("dubbing")}
                    onCheckedChange={(checked) => handleServiceChange("dubbing", checked as boolean)}
                  />
                  <Label htmlFor="dubbing" className="flex items-center gap-2 cursor-pointer">
                    <Volume2 className="h-4 w-4" />
                    Dubbing
                  </Label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Transcription Models */}
          {selectedServices.includes("transcription") && (
            <Card>
              <CardHeader>
                <CardTitle>Transcription Models</CardTitle>
                <CardDescription>Select which AI models to use for transcription</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {TRANSCRIPTION_MODELS.map((model) => (
                    <div key={model.id} className="flex items-start space-x-2">
                      <Checkbox 
                        id={model.id}
                        checked={selectedModels.includes(model.id)}
                        onCheckedChange={(checked) => handleModelChange(model.id, checked as boolean)}
                      />
                      <div className="grid gap-1.5 leading-none">
                        <Label htmlFor={model.id} className="cursor-pointer font-medium">
                          {model.name}
                        </Label>
                        <p className="text-xs text-gray-500">{model.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Target Languages */}
          {selectedServices.includes("translation") && (
            <Card>
              <CardHeader>
                <CardTitle>Target Languages</CardTitle>
                <CardDescription>Select which languages to translate to</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {TARGET_LANGUAGES.map((language) => (
                    <div key={language.code} className="flex items-center space-x-2">
                      <Checkbox 
                        id={language.code}
                        checked={selectedTargetLanguages.includes(language.code)}
                        onCheckedChange={(checked) => handleTargetLanguageChange(language.code, checked as boolean)}
                      />
                      <Label htmlFor={language.code} className="cursor-pointer">
                        {language.name}
                      </Label>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between mt-8">
          <Button variant="outline" onClick={() => navigate("/")}>
            Cancel
          </Button>
          <Button 
            onClick={handleProceed}
            disabled={selectServicesMutation.isPending || selectedServices.length === 0}
          >
            {selectServicesMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Settings className="mr-2 h-4 w-4" />
                Start Processing
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}