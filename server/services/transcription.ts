import { storage } from "../storage";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync = promisify(exec);

// ElevenLabs API for transcription
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_LABS_API_KEY || "";

export async function transcribeVideo(videoId: number) {
  const video = await storage.getVideo(videoId);
  if (!video) {
    throw new Error("Video not found");
  }

  // Extract audio from video using ffmpeg
  const audioPath = await extractAudio(video.filePath);
  
  // Get video duration
  const duration = await getVideoDuration(video.filePath);
  await storage.updateVideoDuration(videoId, duration);

  // Transcribe audio using ElevenLabs
  const transcriptionResult = await transcribeAudio(audioPath);
  
  // Create transcription segments
  const transcriptions = [];
  for (const segment of transcriptionResult.segments) {
    const transcription = await storage.createTranscription({
      videoId,
      language: "bn", // Bengali
      text: segment.text,
      startTime: segment.start,
      endTime: segment.end,
      confidence: segment.confidence,
      isOriginal: true,
    });
    transcriptions.push(transcription);
  }

  // Clean up temporary audio file
  fs.unlinkSync(audioPath);

  return transcriptions;
}

async function extractAudio(videoPath: string): Promise<string> {
  const audioPath = path.join(path.dirname(videoPath), `${path.basename(videoPath, path.extname(videoPath))}.wav`);
  
  await execAsync(`ffmpeg -i "${videoPath}" -acodec pcm_s16le -ac 1 -ar 16000 "${audioPath}"`);
  
  return audioPath;
}

async function getVideoDuration(videoPath: string): Promise<number> {
  const { stdout } = await execAsync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${videoPath}"`);
  return parseFloat(stdout.trim());
}

async function transcribeAudio(audioPath: string) {
  if (!ELEVENLABS_API_KEY) {
    throw new Error("ElevenLabs API key is required");
  }

  const formData = new FormData();
  const audioBuffer = fs.readFileSync(audioPath);
  const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });
  formData.append('audio', audioBlob, 'audio.wav');
  formData.append('model', 'eleven_multilingual_v2');
  formData.append('language', 'bn'); // Bengali

  const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs transcription failed: ${response.statusText}`);
  }

  const result = await response.json();
  
  // Convert to our expected format
  return {
    segments: result.segments?.map((segment: any) => ({
      text: segment.text,
      start: segment.start,
      end: segment.end,
      confidence: segment.confidence || 0.9,
    })) || [{
      text: result.text || "",
      start: 0,
      end: 10,
      confidence: 0.9,
    }],
  };
}
