import { storage } from "../storage";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { transcribeWithGemini, combineTranscriptionResults } from "./transcription-gemini";
import { transcribeWithElevenLabs } from "./transcription-elevenlabs";

const execAsync = promisify(exec);

// ElevenLabs API for transcription
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_LABS_API_KEY || "";

export async function transcribeVideo(videoId: number, selectedModels?: string[]) {
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

  // Use selected models or default to both
  const modelsToUse = selectedModels && selectedModels.length > 0 ? selectedModels : ['openai', 'gemini'];
  console.log(`[TRANSCRIBE] Using transcription models:`, modelsToUse);

  let transcriptionResult;
  try {
    console.log(`[TRANSCRIBE] Starting audio transcription with selected models...`);
    
    let openaiResult = null;
    let geminiResult = null;
    let elevenlabsResult = null;
    
    // Try OpenAI if selected
    if (modelsToUse.includes('openai')) {
      try {
        console.log(`[TRANSCRIBE] Attempting OpenAI Whisper transcription...`);
        openaiResult = await transcribeWithOpenAI(audioPath);
      } catch (openaiError) {
        console.error('[TRANSCRIBE] OpenAI transcription failed:', openaiError);
        if (openaiError instanceof Error && openaiError.message.includes('429')) {
          console.log('[TRANSCRIBE] OpenAI quota exceeded');
        }
      }
    }
    
    // Try Gemini if selected
    if (modelsToUse.includes('gemini') && process.env.GEMINI_API_KEY) {
      try {
        console.log(`[TRANSCRIBE] Attempting Gemini transcription...`);
        geminiResult = await transcribeWithGemini(audioPath);
      } catch (geminiError) {
        console.error('[TRANSCRIBE] Gemini transcription failed:', geminiError);
      }
    }
    
    // Try ElevenLabs if selected
    if (modelsToUse.includes('elevenlabs') && process.env.ELEVENLABS_API_KEY) {
      try {
        console.log(`[TRANSCRIBE] Attempting ElevenLabs transcription...`);
        elevenlabsResult = await transcribeWithElevenLabs(audioPath);
      } catch (elevenlabsError) {
        console.error('[TRANSCRIBE] ElevenLabs transcription failed:', elevenlabsError);
      }
    }
    
    // Store all available results for comparison
    const results = [];
    if (openaiResult) results.push({ ...openaiResult, modelSource: 'OpenAI Whisper' });
    if (geminiResult) results.push({ ...geminiResult, modelSource: 'Gemini 2.5 Pro' });
    if (elevenlabsResult) results.push({ ...elevenlabsResult, modelSource: 'ElevenLabs STT' });
    
    if (results.length === 0) {
      throw new Error('All selected transcription services failed. Please check your API keys and quotas.');
    } else if (results.length === 1) {
      console.log(`[TRANSCRIBE] Using single result from ${results[0].modelSource}`);
      transcriptionResult = results[0];
    } else {
      console.log(`[TRANSCRIBE] Multiple results available, will create alternatives...`);
      // Use the first result as primary, store others as alternatives
      transcriptionResult = results[0];
      transcriptionResult.alternatives = results.slice(1);
    }
    
    console.log(`[TRANSCRIBE] Transcription completed successfully`);
  } catch (error) {
    console.error('[TRANSCRIBE] Transcription failed:', error);
    throw error;
  }
  
  // Create transcription segments with proper model source tracking
  const transcriptions = [];
  
  // If no segments, create a single transcription with the full text
  if (!transcriptionResult.segments || transcriptionResult.segments.length === 0) {
    console.log('No segments found, creating single transcription');
    
    // Get alternative text if available
    let alternativeText = null;
    let alternativeModelSource = null;
    if (transcriptionResult.alternatives && transcriptionResult.alternatives.length > 0) {
      const altResult = transcriptionResult.alternatives[0];
      alternativeText = altResult.text;
      alternativeModelSource = altResult.modelSource;
    }
    
    const transcription = await storage.createTranscription({
      videoId,
      language: "bn", // Bengali
      text: transcriptionResult.text || "Transcription failed",
      startTime: 0,
      endTime: duration || 10,
      confidence: transcriptionResult.confidence || 0.85, // Use actual confidence from transcription result
      isOriginal: true,
      modelSource: transcriptionResult.modelSource || 'OpenAI Whisper',
      alternativeText,
      alternativeModelSource,
      isAlternativeSelected: false,
    });
    transcriptions.push(transcription);
  } else {
    // Create individual transcriptions from segments
    for (let i = 0; i < transcriptionResult.segments.length; i++) {
      const segment = transcriptionResult.segments[i];
      
      // Get alternative text for this segment if available
      let alternativeText = null;
      let alternativeModelSource = null;
      if (transcriptionResult.alternatives && transcriptionResult.alternatives.length > 0) {
        const altResult = transcriptionResult.alternatives[0];
        if (altResult.segments && altResult.segments[i]) {
          alternativeText = altResult.segments[i].text;
          alternativeModelSource = altResult.modelSource;
        }
      }
      
      const transcription = await storage.createTranscription({
        videoId,
        language: "bn", // Bengali
        text: segment.text,
        startTime: segment.start,
        endTime: segment.end,
        confidence: segment.confidence || 0.85, // Use actual confidence from segment
        isOriginal: true,
        modelSource: transcriptionResult.modelSource || 'OpenAI Whisper',
        alternativeText,
        alternativeModelSource,
        isAlternativeSelected: false,
        speakerId: segment.speakerId || null,
        speakerName: segment.speakerName || null,
      });
      transcriptions.push(transcription);
    }
  }

  // Clean up audio file
  try {
    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }
  } catch (cleanupError) {
    console.error('Failed to cleanup audio file:', cleanupError);
  }

  return transcriptions;
}

async function extractAudio(videoPath: string): Promise<string> {
  try {
    // Handle S3 URLs and YouTube URLs
    if (videoPath.startsWith('http')) {
      if (videoPath.includes('youtube.com') || videoPath.includes('youtu.be')) {
        // YouTube URL - use yt-dlp to extract audio directly
        const audioPath = path.join(process.cwd(), "uploads", `youtube_${Date.now()}.wav`);
        
        await execAsync(`yt-dlp --extract-audio --audio-format wav --audio-quality 0 "${videoPath}" -o "${audioPath.replace('.wav', '.%(ext)s')}"`);
        
        return audioPath;
      } else {
        // S3 URL - download and extract audio
        const tempVideoPath = path.join(process.cwd(), "uploads", `s3_${Date.now()}.mp4`);
        const audioPath = tempVideoPath.replace('.mp4', '.wav');
        
        // Download S3 file
        await execAsync(`wget -O "${tempVideoPath}" "${videoPath}"`);
        
        // Extract audio from downloaded file
        await execAsync(`ffmpeg -i "${tempVideoPath}" -acodec pcm_s16le -ac 1 -ar 16000 "${audioPath}"`);
        
        // Clean up temporary video file
        await execAsync(`rm -f "${tempVideoPath}"`).catch(error => {
          console.error('Error cleaning up temp video file:', error);
        });
        
        return audioPath;
      }
    }
    
    // Local file path
    const audioPath = path.join(path.dirname(videoPath), `${path.basename(videoPath, path.extname(videoPath))}.wav`);
    
    await execAsync(`ffmpeg -i "${videoPath}" -acodec pcm_s16le -ac 1 -ar 16000 "${audioPath}"`);
    
    return audioPath;
  } catch (error) {
    console.error('Failed to extract audio:', error);
    throw new Error(`Audio extraction failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function getVideoDuration(videoPath: string): Promise<number> {
  try {
    if (videoPath.startsWith('http')) {
      if (videoPath.includes('youtube.com') || videoPath.includes('youtu.be')) {
        // YouTube URL - use yt-dlp to get duration
        const { stdout } = await execAsync(`yt-dlp --get-duration "${videoPath}"`);
        const durationStr = stdout.trim();
        
        // Parse duration string (HH:MM:SS or MM:SS)
        const parts = durationStr.split(':').reverse();
        let duration = 0;
        for (let i = 0; i < parts.length; i++) {
          duration += parseInt(parts[i]) * Math.pow(60, i);
        }
        return duration;
      } else {
        // S3 URL - download temporarily to get duration
        const tempVideoPath = path.join(process.cwd(), "uploads", `temp_${Date.now()}.mp4`);
        
        await execAsync(`wget -O "${tempVideoPath}" "${videoPath}"`);
        const { stdout } = await execAsync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${tempVideoPath}"`);
        
        // Clean up temporary file
        await execAsync(`rm -f "${tempVideoPath}"`).catch(error => {
          console.error('Error cleaning up temp file:', error);
        });
        
        return parseFloat(stdout.trim());
      }
    }
    
    // Local file path
    const { stdout } = await execAsync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${videoPath}"`);
    return parseFloat(stdout.trim());
  } catch (error) {
    console.error('Failed to get video duration:', error);
    throw new Error(`Video duration detection failed: ${error instanceof Error ? error.message : String(error)}`);
  }
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
    
    // Verify file exists before creating stream
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

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
        confidence: segment.avg_logprob ? Math.exp(segment.avg_logprob) : 0.85 // Use actual confidence from segment
      })) || [{
        text: transcription.text || "No transcription available", 
        start: 0,
        end: 10,
        confidence: 0.85
      }]
    };
  } catch (error) {
    console.error('Transcription error:', error);
    // Throw the error instead of returning demo data
    throw error;
  }
}