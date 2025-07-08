import { storage } from "../storage";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync = promisify(exec);

// ElevenLabs API for transcription
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_LABS_API_KEY || "";

export async function transcribeVideo(videoId: number) {
  console.log(`[TRANSCRIBE] Starting transcription for video ${videoId}`);
  const video = await storage.getVideo(videoId);
  if (!video) {
    throw new Error("Video not found");
  }

  console.log(`[TRANSCRIBE] Video found: ${video.originalName} at ${video.filePath}`);

  // Extract audio from video using ffmpeg
  console.log(`[TRANSCRIBE] Extracting audio...`);
  const audioPath = await extractAudio(video.filePath);
  console.log(`[TRANSCRIBE] Audio extracted to: ${audioPath}`);
  
  // Get video duration
  const duration = await getVideoDuration(video.filePath);
  console.log(`[TRANSCRIBE] Video duration: ${duration} seconds`);
  await storage.updateVideoDuration(videoId, duration);

  // Try transcription
  let transcriptionResult;
  try {
    console.log(`[TRANSCRIBE] Starting audio transcription...`);
    transcriptionResult = await transcribeAudio(audioPath);
    console.log(`[TRANSCRIBE] Transcription result:`, transcriptionResult);
  } catch (error) {
    console.error('[TRANSCRIBE] Transcription failed:', error);
    console.error('[TRANSCRIBE] Error stack:', error instanceof Error ? error.stack : error);
    throw error;
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
    // Create individual transcriptions from segments
    for (const segment of transcriptionResult.segments) {
      const transcription = await storage.createTranscription({
        videoId,
        language: "bn", // Bengali
        text: segment.text,
        startTime: segment.start,
        endTime: segment.end,
        confidence: segment.confidence || 0.9,
        isOriginal: true,
      });
      transcriptions.push(transcription);
    }
  }

  // Clean up audio file
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
  
  // Use OpenAI Whisper
  return transcribeWithOpenAI(audioPath);
}

// Transcription using OpenAI Whisper
async function transcribeWithOpenAI(audioPath: string) {
  try {
    console.log('[OPENAI] Starting OpenAI Whisper transcription');
    const { default: OpenAI } = await import('openai');
    
    if (!process.env.OPENAI_API_KEY) {
      console.error('[OPENAI] No OPENAI_API_KEY found');
      throw new Error('OpenAI API key is required for transcription');
    }
    
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    console.log('[OPENAI] Creating audio stream from:', audioPath);
    console.log('[OPENAI] File size:', fs.statSync(audioPath).size, 'bytes');
    
    const audioReadStream = fs.createReadStream(audioPath);
    
    console.log('[OPENAI] Sending to OpenAI Whisper API...');
    const transcription = await openai.audio.transcriptions.create({
      file: audioReadStream,
      model: 'whisper-1',
      language: 'bn', // Bengali
      response_format: 'verbose_json'
    });
    
    console.log('[OPENAI] Whisper API response received');
    console.log('[OPENAI] Text length:', transcription.text?.length || 0);
    console.log('[OPENAI] First 100 chars:', transcription.text?.substring(0, 100) + '...');
    
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