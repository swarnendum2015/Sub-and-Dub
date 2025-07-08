import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { 
  Languages, 
  FileAudio, 
  Subtitles, 
  ArrowRight, 
  CheckCircle, 
  AlertCircle,
  Loader2
} from "lucide-react";

interface WorkflowSelectionProps {
  videoId: string;
}

export function WorkflowSelectionPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const videoId = params.id;
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>('');
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query for video data
  const { data: video, isLoading } = useQuery({
    queryKey: [`/api/videos/${videoId}`],
    enabled: !!videoId,
  });

  // Bengali transcription mutation
  const bengaliTranscriptionMutation = useMutation({
    mutationFn: async (models: string[]) => {
      setIsProcessing(true);
      const response = await fetch(`/api/videos/${videoId}/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedModels: models })
      });
      
      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Transcription failed: ${errorData}`);
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Bengali transcription started successfully",
      });
      setLocation(`/workspace/${videoId}`);
    },
    onError: (error) => {
      setIsProcessing(false);
      toast({
        title: "Error",
        description: "Failed to start transcription. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Subtitle generation mutation
  const subtitleMutation = useMutation({
    mutationFn: async (languages: string[]) => {
      setIsProcessing(true);
      // First ensure Bengali transcription
      const transcribeResponse = await fetch(`/api/videos/${videoId}/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedModels: ['gemini'] })
      });
      
      if (!transcribeResponse.ok) {
        throw new Error('Bengali transcription failed');
      }

      // Wait a moment for transcription to start
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Generate translations for selected languages
      for (const language of languages) {
        const translateResponse = await fetch(`/api/videos/${videoId}/translate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetLanguage: language })
        });
        
        if (!translateResponse.ok) {
          console.warn(`Translation failed for ${language}`);
        }
      }
      
      return { languages };
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: `Subtitle generation started for ${data.languages.length} language(s)`,
      });
      setLocation(`/workspace/${videoId}`);
    },
    onError: (error) => {
      setIsProcessing(false);
      toast({
        title: "Error",
        description: "Failed to generate subtitles. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Audio dubbing mutation
  const dubbingMutation = useMutation({
    mutationFn: async (language: string) => {
      setIsProcessing(true);
      // First ensure Bengali transcription and translation
      const transcribeResponse = await fetch(`/api/videos/${videoId}/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedModels: ['gemini'] })
      });
      
      if (!transcribeResponse.ok) {
        throw new Error('Bengali transcription failed');
      }

      // Wait a moment for transcription to start
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Generate translation
      const translateResponse = await fetch(`/api/videos/${videoId}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetLanguage: language })
      });
      
      if (!translateResponse.ok) {
        throw new Error('Translation failed');
      }

      // Start dubbing
      const dubbingResponse = await fetch(`/api/videos/${videoId}/dubbing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          language, 
          voiceIds: ['21m00Tcm4TlvDq8ikWAM'], 
          dubbingType: 'studio' 
        })
      });
      
      if (!dubbingResponse.ok) {
        throw new Error('Dubbing failed');
      }
      
      return dubbingResponse.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Audio dubbing started successfully",
      });
      setLocation(`/workspace/${videoId}`);
    },
    onError: (error) => {
      setIsProcessing(false);
      toast({
        title: "Error",
        description: "Failed to start audio dubbing. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleLanguageToggle = (language: string) => {
    setSelectedLanguages(prev => 
      prev.includes(language) 
        ? prev.filter(l => l !== language)
        : [...prev, language]
    );
  };

  const handleProceed = () => {
    if (!selectedWorkflow) {
      toast({
        title: "Selection Required",
        description: "Please select a workflow option",
        variant: "destructive",
      });
      return;
    }

    switch (selectedWorkflow) {
      case 'transcription':
        bengaliTranscriptionMutation.mutate(['gemini']); // Use Gemini as OpenAI quota exceeded
        break;
      case 'subtitles':
        if (selectedLanguages.length === 0) {
          toast({
            title: "Language Required",
            description: "Please select at least one language for subtitles",
            variant: "destructive",
          });
          return;
        }
        subtitleMutation.mutate(selectedLanguages);
        break;
      case 'dubbing':
        if (selectedLanguages.length !== 1) {
          toast({
            title: "Single Language Required",
            description: "Please select exactly one language for dubbing",
            variant: "destructive",
          });
          return;
        }
        dubbingMutation.mutate(selectedLanguages[0]);
        break;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!video) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Alert className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Video not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Choose Your Workflow</h1>
          <p className="text-gray-600">Select what you'd like to do with your video</p>
          <div className="mt-4 p-3 bg-white rounded-lg border inline-block">
            <p className="text-sm text-gray-700">
              <strong>Video:</strong> {video.originalName} 
              <Badge className="ml-2 bg-green-100 text-green-700">
                <CheckCircle className="w-3 h-3 mr-1" />
                Uploaded
              </Badge>
            </p>
          </div>
        </div>

        {/* Workflow Options */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Bengali Transcription */}
          <Card 
            className={`cursor-pointer transition-all ${
              selectedWorkflow === 'transcription' 
                ? 'ring-2 ring-blue-500 bg-blue-50' 
                : 'hover:shadow-md'
            }`}
            onClick={() => setSelectedWorkflow('transcription')}
          >
            <CardHeader>
              <CardTitle className="flex items-center">
                <Languages className="w-5 h-5 mr-2 text-blue-600" />
                Bengali Transcription
              </CardTitle>
              <CardDescription>
                Convert your video audio to Bengali text with timestamps
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Automatic speech-to-text</li>
                <li>• Bengali language detection</li>
                <li>• Segmented timestamps</li>
                <li>• Editable text output</li>
              </ul>
              {selectedWorkflow === 'transcription' && (
                <div className="mt-4 p-3 bg-blue-100 rounded">
                  <p className="text-sm text-blue-800">
                    <CheckCircle className="w-4 h-4 inline mr-1" />
                    Ready to start Bengali transcription
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Subtitle Generation */}
          <Card 
            className={`cursor-pointer transition-all ${
              selectedWorkflow === 'subtitles' 
                ? 'ring-2 ring-green-500 bg-green-50' 
                : 'hover:shadow-md'
            }`}
            onClick={() => setSelectedWorkflow('subtitles')}
          >
            <CardHeader>
              <CardTitle className="flex items-center">
                <Subtitles className="w-5 h-5 mr-2 text-green-600" />
                Create Subtitles
              </CardTitle>
              <CardDescription>
                Generate SRT subtitle files in multiple languages
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Bengali transcription first</li>
                <li>• Multi-language translation</li>
                <li>• SRT file generation</li>
                <li>• Download ready files</li>
              </ul>
              {selectedWorkflow === 'subtitles' && (
                <div className="mt-4 space-y-3">
                  <p className="text-sm font-medium text-green-800">Select Languages:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { code: 'en', name: 'English' },
                      { code: 'hi', name: 'Hindi' },
                      { code: 'ta', name: 'Tamil' },
                      { code: 'te', name: 'Telugu' },
                      { code: 'ml', name: 'Malayalam' }
                    ].map(lang => (
                      <label key={lang.code} className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedLanguages.includes(lang.code)}
                          onChange={() => handleLanguageToggle(lang.code)}
                          className="rounded"
                        />
                        <span className="text-sm">{lang.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Audio Dubbing */}
          <Card 
            className={`cursor-pointer transition-all ${
              selectedWorkflow === 'dubbing' 
                ? 'ring-2 ring-purple-500 bg-purple-50' 
                : 'hover:shadow-md'
            }`}
            onClick={() => setSelectedWorkflow('dubbing')}
          >
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileAudio className="w-5 h-5 mr-2 text-purple-600" />
                Audio Dubbing
              </CardTitle>
              <CardDescription>
                Create AI-powered voice dubbing in your target language
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Bengali transcription first</li>
                <li>• Language translation</li>
                <li>• AI voice generation</li>
                <li>• Professional quality audio</li>
              </ul>
              {selectedWorkflow === 'dubbing' && (
                <div className="mt-4 space-y-3">
                  <p className="text-sm font-medium text-purple-800">Select Target Language:</p>
                  <Select 
                    value={selectedLanguages[0] || ''} 
                    onValueChange={(value) => setSelectedLanguages([value])}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="hi">Hindi</SelectItem>
                      <SelectItem value="ta">Tamil</SelectItem>
                      <SelectItem value="te">Telugu</SelectItem>
                      <SelectItem value="ml">Malayalam</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Action Button */}
        <div className="text-center">
          <Button 
            onClick={handleProceed}
            disabled={!selectedWorkflow || isProcessing}
            size="lg"
            className="px-8"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Proceed with {selectedWorkflow === 'transcription' ? 'Transcription' : 
                           selectedWorkflow === 'subtitles' ? 'Subtitle Generation' : 
                           'Audio Dubbing'}
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
          
          {selectedWorkflow && !isProcessing && (
            <p className="text-sm text-gray-600 mt-4">
              {selectedWorkflow === 'transcription' && 
                "This will convert your video audio to Bengali text segments"}
              {selectedWorkflow === 'subtitles' && selectedLanguages.length > 0 &&
                `This will create subtitle files for ${selectedLanguages.length} language(s)`}
              {selectedWorkflow === 'dubbing' && selectedLanguages.length === 1 &&
                `This will create AI dubbing in ${selectedLanguages[0].toUpperCase()}`}
            </p>
          )}
        </div>

        {/* Processing Status */}
        {isProcessing && (
          <div className="mt-8 p-4 bg-blue-50 rounded-lg border">
            <div className="flex items-center space-x-3">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              <div>
                <p className="font-medium text-blue-900">Processing Your Request</p>
                <p className="text-sm text-blue-700">
                  {selectedWorkflow === 'transcription' && "Starting Bengali transcription..."}
                  {selectedWorkflow === 'subtitles' && "Generating subtitles with translations..."}
                  {selectedWorkflow === 'dubbing' && "Creating audio dubbing with AI voices..."}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}