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

  // Try ElevenLabs first, fallback to OpenAI if it fails
  let transcriptionResult;
  try {
    transcriptionResult = await transcribeAudio(audioPath);
  } catch (elevenLabsError) {
    console.error('ElevenLabs failed, trying OpenAI Whisper:', elevenLabsError);
    transcriptionResult = await transcribeWithOpenAI(audioPath);
  }
  
  // Create transcription segments
  const transcriptions = [];
  
  // If no segments, create a single transcription with the full text
  if (!transcriptionResult.segments || transcriptionResult.segments.length === 0) {
    console.log('No segments found, creating single transcription');
    const transcription = await storage.createTranscription({
      videoId,
      language: "bn", // Bengali
      text: transcriptionResult.text || "Transcription failed",
      startTime: 0,
      endTime: duration || 10,
      confidence: 0.9,
      isOriginal: true,
    });
    transcriptions.push(transcription);
  } else {
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
  console.log('Starting transcription...');
  console.log('ElevenLabs API Key available:', !!ELEVENLABS_API_KEY);
  console.log('Audio file exists:', fs.existsSync(audioPath));
  
  // Skip ElevenLabs for now and use OpenAI Whisper
  return transcribeWithOpenAI(audioPath);
}

// Fallback transcription using OpenAI Whisper
async function transcribeWithOpenAI(audioPath: string) {
  try {
    const { default: OpenAI } = await import('openai');
    
    if (!process.env.OPENAI_API_KEY) {
      console.error('No OPENAI_API_KEY found');
      throw new Error('OpenAI API key is required for transcription');
    }
    
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    console.log('Using OpenAI Whisper for transcription...');
    
    const audioReadStream = fs.createReadStream(audioPath);
    
    const transcription = await openai.audio.transcriptions.create({
      file: audioReadStream,
      model: 'whisper-1',
      language: 'bn', // Bengali
      response_format: 'verbose_json'
    });
    
    console.log('OpenAI Whisper transcription result:', transcription.text?.substring(0, 50) + '...');
    
    // Convert to our expected format
    return {
      text: transcription.text,
      segments: transcription.segments?.map((segment: any) => ({
        text: segment.text,
        start: segment.start,
        end: segment.end,
        confidence: 0.8 // OpenAI doesn't provide confidence scores
      })) || [{
        text: transcription.text || "No transcription available", 
        start: 0,
        end: 10,
        confidence: 0.95
      }]
    };
  } catch (error) {
    console.error('Transcription error:', error);
    // Throw the error instead of returning demo data
    throw error;
  }
}
