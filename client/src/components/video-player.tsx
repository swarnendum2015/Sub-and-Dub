import { useRef, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize, 
  RotateCcw, 
  RotateCw,
  Subtitles,
  Eye,
  EyeOff
} from "lucide-react";

interface VideoPlayerProps {
  videoId: string;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
}

interface Transcription {
  id: number;
  startTime: number;
  endTime: number;
  text: string;
  speakerId?: string;
  speakerName?: string;
  modelSource?: string;
  confidence?: number;
}

export function VideoPlayer({ videoId, currentTime, onTimeUpdate }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [subtitleLanguage, setSubtitleLanguage] = useState('bn'); // Default to Bengali

  // Fetch transcriptions for subtitle overlay
  const { data: transcriptions = [] } = useQuery({
    queryKey: ['/api/videos', videoId, 'transcriptions'],
    queryFn: async () => {
      const response = await fetch(`/api/videos/${videoId}/transcriptions`);
      if (!response.ok) throw new Error('Failed to fetch transcriptions');
      return response.json();
    },
    enabled: !!videoId,
  });

  // Fetch translations for non-Bengali subtitles
  const { data: allTranslations = [] } = useQuery({
    queryKey: ['/api/translations', videoId, subtitleLanguage],
    queryFn: async () => {
      if (!transcriptions.length || subtitleLanguage === 'bn') return [];
      
      const translationPromises = transcriptions.map(async (transcription: Transcription) => {
        try {
          const response = await fetch(`/api/transcriptions/${transcription.id}/translations`);
          if (!response.ok) return null;
          const translations = await response.json();
          return translations.find((t: any) => t.targetLanguage === subtitleLanguage);
        } catch (error) {
          return null;
        }
      });
      
      const translations = await Promise.all(translationPromises);
      return translations.filter(Boolean);
    },
    enabled: !!videoId && !!transcriptions.length && subtitleLanguage !== 'bn',
  });

  // Helper function to get current subtitle text
  const getCurrentSubtitle = () => {
    if (!showSubtitles || !transcriptions.length) return null;
    
    const currentTranscription = transcriptions.find((t: Transcription) => 
      currentTime >= t.startTime && currentTime <= t.endTime
    );
    
    if (!currentTranscription) return null;
    
    if (subtitleLanguage === 'bn') {
      return {
        text: currentTranscription.text,
        confidence: currentTranscription.confidence,
        modelSource: currentTranscription.modelSource,
        speakerName: currentTranscription.speakerName
      };
    } else {
      const translation = allTranslations.find((t: any) => 
        t.transcriptionId === currentTranscription.id
      );
      return translation ? {
        text: translation.translatedText,
        confidence: translation.confidence,
        modelSource: translation.model,
        speakerName: currentTranscription.speakerName
      } : null;
    }
  };

  const currentSubtitle = getCurrentSubtitle();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      onTimeUpdate(video.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };

    const handleEnded = () => {
      setIsPlaying(false);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('ended', handleEnded);
    };
  }, [onTimeUpdate]);

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (value: number[]) => {
    const video = videoRef.current;
    if (!video) return;
    
    video.currentTime = value[0];
    onTimeUpdate(value[0]);
  };

  const handleVolumeChange = (value: number[]) => {
    const video = videoRef.current;
    if (!video) return;
    
    const newVolume = value[0];
    setVolume(newVolume);
    video.volume = newVolume;
    setIsMuted(newVolume === 0);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    
    if (isMuted) {
      video.volume = volume;
      setIsMuted(false);
    } else {
      video.volume = 0;
      setIsMuted(true);
    }
  };

  const toggleFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;

    if (!isFullscreen) {
      video.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const skipTime = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    
    video.currentTime = Math.max(0, Math.min(duration, video.currentTime + seconds));
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full h-full bg-black relative">
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        src={`/api/videos/${videoId}/stream`}
        preload="metadata"
        controls
      />
      
      {/* Current Time Indicator */}
      <div className="absolute top-4 left-4 bg-primary text-white px-3 py-1 rounded-lg text-sm font-mono">
        {formatTime(currentTime)}
      </div>

      {/* Subtitle Controls */}
      <div className="absolute top-4 right-4 flex items-center space-x-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowSubtitles(!showSubtitles)}
          className="text-white bg-black bg-opacity-50 hover:bg-opacity-75"
        >
          {showSubtitles ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </Button>
        <select
          value={subtitleLanguage}
          onChange={(e) => setSubtitleLanguage(e.target.value)}
          className="bg-black bg-opacity-50 text-white text-sm rounded px-2 py-1 border border-white border-opacity-30"
        >
          <option value="bn">Bengali</option>
          <option value="en">English</option>
          <option value="hi">Hindi</option>
          <option value="ta">Tamil</option>
          <option value="te">Telugu</option>
          <option value="ml">Malayalam</option>
        </select>
      </div>

      {/* Subtitle Overlay */}
      {currentSubtitle && showSubtitles && (
        <div className="absolute bottom-24 left-4 right-4 flex justify-center">
          <div className="bg-black bg-opacity-80 text-white p-4 rounded-lg max-w-3xl">
            <div className="text-center">
              <p className="text-lg leading-relaxed mb-2">
                {currentSubtitle.text}
              </p>
              <div className="flex items-center justify-center space-x-2 text-sm opacity-75">
                {currentSubtitle.speakerName && (
                  <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-300">
                    {currentSubtitle.speakerName}
                  </Badge>
                )}
                {currentSubtitle.confidence && (
                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-300">
                    {Math.round(currentSubtitle.confidence * 100)}%
                  </Badge>
                )}
                {currentSubtitle.modelSource && (
                  <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">
                    {currentSubtitle.modelSource}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Video Controls */}
      <div className="absolute bottom-4 left-4 right-4 bg-black bg-opacity-75 rounded-lg p-4">
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={togglePlayPause}
            className="text-white hover:text-primary"
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => skipTime(-10)}
            className="text-white hover:text-primary"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => skipTime(10)}
            className="text-white hover:text-primary"
          >
            <RotateCw className="w-4 h-4" />
          </Button>

          <div className="flex-1 flex items-center space-x-2">
            <Slider
              value={[currentTime]}
              max={duration}
              step={0.1}
              onValueChange={handleSeek}
              className="flex-1"
            />
          </div>

          <span className="text-white text-sm font-mono min-w-[100px]">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleMute}
              className="text-white hover:text-primary"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </Button>

            <Slider
              value={[isMuted ? 0 : volume]}
              max={1}
              step={0.1}
              onValueChange={handleVolumeChange}
              className="w-20"
            />
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={toggleFullscreen}
            className="text-white hover:text-primary"
          >
            <Maximize className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Timeline Scrubber */}
      <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4">
        <div className="relative">
          <div className="h-12 bg-slate-100 rounded-lg relative overflow-hidden">
            {/* Timeline markers */}
            <div className="absolute inset-0 flex">
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i} className="flex-1 border-r border-slate-300 p-2">
                  <div className="text-xs text-slate-600">
                    {formatTime((i * duration) / 6)}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Current time indicator */}
            <div 
              className="absolute top-0 bottom-0 w-1 bg-primary"
              style={{ left: `${(currentTime / duration) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
