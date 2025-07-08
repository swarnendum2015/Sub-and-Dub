import { storage } from "../storage";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";

interface DubbingStudioRequest {
  dubbingJobId: number;
}

export async function generateDubbingWithStudio({ dubbingJobId }: DubbingStudioRequest) {
  console.log(`[DUBBING_STUDIO] Starting ElevenLabs dubbing studio for job ${dubbingJobId}`);
  
  try {
    const dubbingJob = await storage.getDubbingJob(dubbingJobId);
    if (!dubbingJob) {
      throw new Error("Dubbing job not found");
    }
    
    const video = await storage.getVideo(dubbingJob.videoId);
    if (!video) {
      throw new Error("Video not found");
    }
    
    console.log(`[DUBBING_STUDIO] Processing video: ${video.filename}`);
    
    // Update status to processing
    await storage.updateDubbingJobStatus(dubbingJobId, "processing");
    
    // Get the original audio file path
    const originalAudioPath = await getOriginalAudioPath(video.filePath);
    
    // Create dubbing using ElevenLabs Dubbing Studio API
    const dubbingId = await createDubbingStudioJob(originalAudioPath, dubbingJob.language);
    
    // Poll for dubbing completion
    const dubbedAudioPath = await pollDubbingCompletion(dubbingId, dubbingJobId);
    
    // Update dubbing job with completed status
    await storage.updateDubbingJobStatus(dubbingJobId, "completed", dubbedAudioPath);
    
    console.log(`[DUBBING_STUDIO] Dubbing completed successfully: ${dubbedAudioPath}`);
    return dubbedAudioPath;
    
  } catch (error) {
    console.error(`[DUBBING_STUDIO] Error in dubbing studio:`, error);
    await storage.updateDubbingJobStatus(dubbingJobId, "failed");
    throw error;
  }
}

async function getOriginalAudioPath(videoPath: string): Promise<string> {
  // Check if we already have the audio file
  const audioPath = videoPath.replace(/\.[^/.]+$/, ".wav");
  
  if (fs.existsSync(audioPath)) {
    return audioPath;
  }
  
  // Extract audio from video if not exists
  if (videoPath.startsWith('http')) {
    if (videoPath.includes('youtube.com') || videoPath.includes('youtu.be')) {
      // YouTube URL - use yt-dlp to extract audio directly
      const outputPath = path.join(process.cwd(), "uploads", `youtube_audio_${Date.now()}.wav`);
      await execAsync(`yt-dlp --extract-audio --audio-format wav --audio-quality 0 "${videoPath}" -o "${outputPath.replace('.wav', '.%(ext)s')}"`);
      return outputPath;
    } else {
      // S3 URL - download and extract audio
      const tempVideoPath = path.join(process.cwd(), "uploads", `s3_temp_${Date.now()}.mp4`);
      const outputPath = tempVideoPath.replace('.mp4', '.wav');
      
      await execAsync(`wget -O "${tempVideoPath}" "${videoPath}"`);
      await execAsync(`ffmpeg -i "${tempVideoPath}" -acodec pcm_s16le -ac 1 -ar 16000 "${outputPath}"`);
      await execAsync(`rm -f "${tempVideoPath}"`).catch(() => {});
      
      return outputPath;
    }
  }
  
  // Local file path
  const outputPath = path.join(path.dirname(videoPath), `${path.basename(videoPath, path.extname(videoPath))}.wav`);
  await execAsync(`ffmpeg -i "${videoPath}" -acodec pcm_s16le -ac 1 -ar 16000 "${outputPath}"`);
  
  return outputPath;
}

async function createDubbingStudioJob(audioPath: string, targetLanguage: string): Promise<string> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error("ElevenLabs API key not configured");
  }
  
  // Language mapping for ElevenLabs
  const languageMap: { [key: string]: string } = {
    'en': 'en',
    'hi': 'hi',
    'ta': 'ta',
    'te': 'te',
    'ml': 'ml'
  };
  
  const targetLangCode = languageMap[targetLanguage] || targetLanguage;
  
  // Read the audio file
  const audioBuffer = fs.readFileSync(audioPath);
  
  // Create form data for the API request
  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), path.basename(audioPath));
  formData.append('target_lang', targetLangCode);
  formData.append('mode', 'automatic'); // or 'manual' for more control
  formData.append('watermark', 'true'); // Set to true for free accounts, false for Creator+ users
  
  console.log(`[DUBBING_STUDIO] Creating dubbing job for language: ${targetLangCode}`);
  
  const response = await fetch('https://api.elevenlabs.io/v1/dubbing', {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
    },
    body: formData,
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs dubbing API error: ${response.status} - ${errorText}`);
  }
  
  const result = await response.json();
  const dubbingId = result.dubbing_id;
  
  if (!dubbingId) {
    throw new Error("No dubbing ID received from ElevenLabs");
  }
  
  console.log(`[DUBBING_STUDIO] Dubbing job created with ID: ${dubbingId}`);
  return dubbingId;
}

async function pollDubbingCompletion(dubbingId: string, jobId: number): Promise<string> {
  console.log(`[DUBBING_STUDIO] Polling for dubbing completion: ${dubbingId}`);
  
  const maxAttempts = 60; // 10 minutes with 10-second intervals
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/dubbing/${dubbingId}`, {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
        },
      });
      
      if (!response.ok) {
        throw new Error(`Status check failed: ${response.status}`);
      }
      
      const status = await response.json();
      console.log(`[DUBBING_STUDIO] Status check ${attempts + 1}: ${status.status}`);
      
      if (status.status === 'dubbed') {
        // Download the dubbed audio
        return await downloadDubbedAudio(dubbingId, jobId);
      } else if (status.status === 'failed') {
        throw new Error(`Dubbing failed: ${status.error_message || 'Unknown error'}`);
      }
      
      // Wait 10 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 10000));
      attempts++;
      
    } catch (error) {
      console.error(`[DUBBING_STUDIO] Error during status check:`, error);
      attempts++;
      
      if (attempts >= maxAttempts) {
        throw error;
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
  
  throw new Error("Dubbing timeout - job did not complete within 10 minutes");
}

async function downloadDubbedAudio(dubbingId: string, jobId: number): Promise<string> {
  console.log(`[DUBBING_STUDIO] Downloading dubbed audio for: ${dubbingId}`);
  
  const response = await fetch(`https://api.elevenlabs.io/v1/dubbing/${dubbingId}/audio/dubbed`, {
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
    },
  });
  
  if (!response.ok) {
    throw new Error(`Audio download failed: ${response.status}`);
  }
  
  const audioBuffer = await response.arrayBuffer();
  const outputPath = path.join(process.cwd(), "uploads", `dubbed_studio_${jobId}.mp3`);
  
  fs.writeFileSync(outputPath, Buffer.from(audioBuffer));
  
  console.log(`[DUBBING_STUDIO] Audio downloaded successfully: ${outputPath}`);
  return outputPath;
}