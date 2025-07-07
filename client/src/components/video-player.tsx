import { useRef, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize, 
  RotateCcw, 
  RotateCw 
} from "lucide-react";

interface VideoPlayerProps {
  videoId: string;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
}

export function VideoPlayer({ videoId, currentTime, onTimeUpdate }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
    <div className="flex-1 bg-black relative">
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        src={`/api/videos/${videoId}/stream`}
        preload="metadata"
      />
      
      {/* Current Time Indicator */}
      <div className="absolute top-4 left-4 bg-primary text-white px-3 py-1 rounded-lg text-sm font-mono">
        {formatTime(currentTime)}
      </div>

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
