import { storage } from '../storage.js';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import { 
  enhanceTranscriptionWithStandards, 
  calculateEnhancedConfidence, 
  splitLongSegment,
  NETFLIX_STANDARDS 
} from './subtitling-standards.js';

const execAsync = promisify(exec);

export async function transcribeVideo(videoId: number, selectedModels?: string[]) {
  console.log(`[TRANSCRIPTION] Starting transcription for video ${videoId}`);
  
  try {
    const video = await storage.getVideo(videoId);
    if (!video) {
      throw new Error(`Video ${videoId} not found`);
    }

    await storage.updateVideoStatus(videoId, 'transcribing');

    // Extract audio
    const audioPath = await extractAudio(video.filePath);
    console.log(`[TRANSCRIPTION] Audio extracted to: ${audioPath}`);

    // Get video duration
    const duration = await getVideoDuration(video.filePath);
    await storage.updateVideoDuration(videoId, duration);
    console.log(`[TRANSCRIPTION] Video duration: ${duration} seconds`);

    // Transcribe audio
    const transcriptionResult = await transcribeAudio(audioPath);
    console.log(`[TRANSCRIPTION] Transcription completed`);

    // Create transcription records with studio-grade standards
    const transcriptions = [];
    
    if (transcriptionResult.segments && transcriptionResult.segments.length > 0) {
      for (const segment of transcriptionResult.segments) {
        const segmentText = segment.text.trim();
        const rawConfidence = segment.confidence || 0.85;
        
        // Apply studio-grade standards analysis
        const enhancedSegment = enhanceTranscriptionWithStandards(
          segmentText,
          segment.start,
          segment.end,
          rawConfidence,
          'openai-whisper'
        );
        
        // Calculate studio-grade confidence score
        const enhancedConfidence = calculateEnhancedConfidence(
          rawConfidence,
          'openai-whisper',
          enhancedSegment.qualityScore,
          segmentText.length,
          segment.end - segment.start
        );
        
        // Split segments that are too long according to Netflix standards
        const standardizedSegments = splitLongSegment(
          segmentText,
          segment.start,
          segment.end,
          NETFLIX_STANDARDS.maxDuration
        );
        
        for (const stdSegment of standardizedSegments) {
          const transcription = await storage.createTranscription({
            videoId: videoId,
            language: 'bn', // Bengali transcription
            text: stdSegment.text,
            startTime: stdSegment.startTime,
            endTime: stdSegment.endTime,
            confidence: enhancedConfidence,
            modelSource: 'openai-whisper',
            isOriginal: true
          });
          transcriptions.push(transcription);
        }
      }
    } else {
      // Create single transcription if no segments
      const transcription = await storage.createTranscription({
        videoId: videoId,
        language: 'bn', // Bengali transcription
        text: transcriptionResult.text || 'No transcription available',
        startTime: 0,
        endTime: duration,
        confidence: 0.75, // Lower confidence for non-segmented output
        modelSource: 'openai-whisper',
        isOriginal: true
      });
      transcriptions.push(transcription);
    }

    // Clean up audio file
    try {
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
    } catch (cleanupError) {
      console.error('[TRANSCRIPTION] Failed to cleanup audio file:', cleanupError);
    }

    await storage.updateVideoStatus(videoId, 'transcribed');
    console.log(`[TRANSCRIPTION] Transcription completed for video ${videoId}`);
    
    return transcriptions;
    
  } catch (error) {
    console.error(`[TRANSCRIPTION] Transcription failed for video ${videoId}:`, error);
    await storage.updateVideoStatus(videoId, 'failed');
    throw error;
  }
}

async function extractAudio(videoPath: string): Promise<string> {
  try {
    console.log(`[TRANSCRIPTION] Extracting audio from: ${videoPath}`);
    
    if (videoPath.startsWith('http')) {
      if (videoPath.includes('youtube.com') || videoPath.includes('youtu.be')) {
        // YouTube URL
        const tempVideoPath = path.join(process.cwd(), "uploads", `yt_${Date.now()}.mp4`);
        const audioPath = tempVideoPath.replace('.mp4', '.wav');
        
        await execAsync(`yt-dlp -f "best[height<=720]" -o "${tempVideoPath}" "${videoPath}"`);
        await execAsync(`ffmpeg -i "${tempVideoPath}" -acodec pcm_s16le -ac 1 -ar 16000 "${audioPath}"`);
        
        // Clean up temp video
        try {
          if (fs.existsSync(tempVideoPath)) {
            fs.unlinkSync(tempVideoPath);
          }
        } catch (cleanupError) {
          console.error('[TRANSCRIPTION] Error cleaning up temp video file:', cleanupError);
        }
        
        return audioPath;
      } else {
        // S3 URL
        const tempVideoPath = path.join(process.cwd(), "uploads", `s3_${Date.now()}.mp4`);
        const audioPath = tempVideoPath.replace('.mp4', '.wav');
        
        await execAsync(`wget -O "${tempVideoPath}" "${videoPath}"`);
        await execAsync(`ffmpeg -i "${tempVideoPath}" -acodec pcm_s16le -ac 1 -ar 16000 "${audioPath}"`);
        
        // Clean up temp video
        try {
          if (fs.existsSync(tempVideoPath)) {
            fs.unlinkSync(tempVideoPath);
          }
        } catch (cleanupError) {
          console.error('[TRANSCRIPTION] Error cleaning up temp video file:', cleanupError);
        }
        
        return audioPath;
      }
    }
    
    // Local file path
    const audioPath = path.join(path.dirname(videoPath), `${path.basename(videoPath, path.extname(videoPath))}.wav`);
    await execAsync(`ffmpeg -i "${videoPath}" -acodec pcm_s16le -ac 1 -ar 16000 "${audioPath}"`);
    
    return audioPath;
  } catch (error) {
    console.error('[TRANSCRIPTION] Failed to extract audio:', error);
    throw new Error(`Audio extraction failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function getVideoDuration(videoPath: string): Promise<number> {
  try {
    if (videoPath.startsWith('http')) {
      if (videoPath.includes('youtube.com') || videoPath.includes('youtu.be')) {
        // YouTube URL
        const { stdout } = await execAsync(`yt-dlp --get-duration "${videoPath}"`);
        const durationStr = stdout.trim();
        
        const parts = durationStr.split(':').reverse();
        let duration = 0;
        for (let i = 0; i < parts.length; i++) {
          duration += parseInt(parts[i]) * Math.pow(60, i);
        }
        return duration;
      } else {
        // S3 URL
        const tempVideoPath = path.join(process.cwd(), "uploads", `temp_${Date.now()}.mp4`);
        
        await execAsync(`wget -O "${tempVideoPath}" "${videoPath}"`);
        const { stdout } = await execAsync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${tempVideoPath}"`);
        
        // Clean up temp file
        try {
          if (fs.existsSync(tempVideoPath)) {
            fs.unlinkSync(tempVideoPath);
          }
        } catch (cleanupError) {
          console.error('[TRANSCRIPTION] Error cleaning up temp file:', cleanupError);
        }
        
        return parseFloat(stdout.trim());
      }
    }
    
    // Local file path
    const { stdout } = await execAsync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${videoPath}"`);
    return parseFloat(stdout.trim());
  } catch (error) {
    console.error('[TRANSCRIPTION] Failed to get video duration:', error);
    throw new Error(`Video duration detection failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function transcribeAudio(audioPath: string) {
  console.log('[TRANSCRIPTION] Starting transcription...');
  
  try {
    // Try OpenAI Whisper first (auto-detect language)
    return await transcribeWithOpenAI(audioPath);
  } catch (error) {
    console.error('[TRANSCRIPTION] OpenAI Whisper failed:', error);
    
    // For now, throw the error - in future we could add fallback to other services
    throw new Error(`Transcription failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Gemini transcription fallback
async function transcribeWithGemini(audioPath: string) {
  console.log('[TRANSCRIPTION] Starting Gemini transcription');
  
  try {
    // Placeholder for Gemini transcription - would need Gemini API integration
    throw new Error('Gemini transcription not implemented yet');
  } catch (error) {
    console.error('[TRANSCRIPTION] Gemini transcription failed:', error);
    throw error;
  }
}

// ElevenLabs transcription fallback
async function transcribeWithElevenLabs(audioPath: string) {
  console.log('[TRANSCRIPTION] Starting ElevenLabs transcription');
  
  try {
    // Placeholder for ElevenLabs transcription - would need ElevenLabs API integration
    throw new Error('ElevenLabs transcription not implemented yet');
  } catch (error) {
    console.error('[TRANSCRIPTION] ElevenLabs transcription failed:', error);
    throw error;
  }
}

// Fallback transcription function for quota exceeded scenarios
export async function transcribeVideoFallback(videoId: number) {
  console.log(`[TRANSCRIPTION FALLBACK] Starting fallback transcription for video ${videoId}`);
  
  try {
    const video = await storage.getVideo(videoId);
    if (!video) {
      throw new Error(`Video ${videoId} not found`);
    }

    await storage.updateVideoStatus(videoId, 'transcribing');

    // Extract audio
    const audioPath = await extractAudio(video.filePath);
    console.log(`[TRANSCRIPTION FALLBACK] Audio extracted to: ${audioPath}`);

    // Get video duration
    const duration = await getVideoDuration(video.filePath);
    await storage.updateVideoDuration(videoId, duration);
    console.log(`[TRANSCRIPTION FALLBACK] Video duration: ${duration} seconds`);

    // Try alternative transcription services
    let transcriptionResult;
    
    // Try Gemini first as fallback
    try {
      console.log('[TRANSCRIPTION FALLBACK] Attempting Gemini transcription...');
      transcriptionResult = await transcribeWithGemini(audioPath);
    } catch (geminiError) {
      console.error('[TRANSCRIPTION FALLBACK] Gemini failed:', geminiError);
      
      // Try ElevenLabs as second fallback
      try {
        console.log('[TRANSCRIPTION FALLBACK] Attempting ElevenLabs transcription...');
        transcriptionResult = await transcribeWithElevenLabs(audioPath);
      } catch (elevenLabsError) {
        console.error('[TRANSCRIPTION FALLBACK] ElevenLabs failed:', elevenLabsError);
        throw new Error('All fallback transcription services failed');
      }
    }

    console.log(`[TRANSCRIPTION FALLBACK] Transcription completed`);

    // Create transcription records with studio-grade standards
    const transcriptions = [];
    
    if (transcriptionResult.segments && transcriptionResult.segments.length > 0) {
      for (const segment of transcriptionResult.segments) {
        const segmentText = segment.text.trim();
        const rawConfidence = segment.confidence || 0.75; // Lower confidence for fallback
        
        // Apply studio-grade standards analysis
        const enhancedSegment = enhanceTranscriptionWithStandards(
          segmentText,
          segment.start,
          segment.end,
          rawConfidence,
          'fallback-service'
        );
        
        // Calculate studio-grade confidence score
        const enhancedConfidence = calculateEnhancedConfidence(
          rawConfidence,
          'fallback-service',
          enhancedSegment.qualityScore,
          segmentText.length,
          segment.end - segment.start
        );
        
        // Split segments that are too long according to Netflix standards
        const standardizedSegments = splitLongSegment(
          segmentText,
          segment.start,
          segment.end,
          NETFLIX_STANDARDS.maxDuration
        );
        
        for (const stdSegment of standardizedSegments) {
          const transcription = await storage.createTranscription({
            videoId: videoId,
            language: 'bn', // Bengali transcription
            text: stdSegment.text,
            startTime: stdSegment.startTime,
            endTime: stdSegment.endTime,
            confidence: enhancedConfidence,
            modelSource: 'fallback-service',
            isOriginal: true
          });
          transcriptions.push(transcription);
        }
      }
    } else {
      // Create single transcription if no segments
      const transcription = await storage.createTranscription({
        videoId: videoId,
        language: 'bn', // Bengali transcription
        text: transcriptionResult.text || 'No transcription available',
        startTime: 0,
        endTime: duration,
        confidence: 0.65, // Lower confidence for fallback non-segmented output
        modelSource: 'fallback-service',
        isOriginal: true
      });
      transcriptions.push(transcription);
    }

    // Clean up audio file
    try {
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
    } catch (cleanupError) {
      console.error('[TRANSCRIPTION FALLBACK] Failed to cleanup audio file:', cleanupError);
    }

    await storage.updateVideoStatus(videoId, 'transcribed');
    return transcriptions;
  } catch (error) {
    console.error(`[TRANSCRIPTION FALLBACK] Error:`, error);
    await storage.updateVideoStatus(videoId, 'failed');
    throw error;
  }
}

async function transcribeWithOpenAI(audioPath: string) {
  try {
    console.log('[TRANSCRIPTION] Starting OpenAI Whisper transcription');
    const { default: OpenAI } = await import('openai');
    
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key is required for transcription');
    }
    
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    // Verify file exists
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    console.log('[TRANSCRIPTION] File size:', fs.statSync(audioPath).size, 'bytes');
    
    const audioReadStream = fs.createReadStream(audioPath);
    
    const transcription = await openai.audio.transcriptions.create({
      file: audioReadStream,
      model: 'whisper-1',
      // Let Whisper auto-detect the language instead of forcing Bengali
      response_format: 'verbose_json'
    });
    
    console.log('[TRANSCRIPTION] Whisper API response received');
    console.log('[TRANSCRIPTION] Text length:', transcription.text?.length || 0);
    
    // Convert to expected format
    return {
      text: transcription.text,
      segments: transcription.segments?.map((segment: any) => ({
        text: segment.text,
        start: segment.start,
        end: segment.end,
        confidence: segment.avg_logprob ? Math.exp(segment.avg_logprob) : 0.85
      })) || [{
        text: transcription.text || "No transcription available", 
        start: 0,
        end: 10,
        confidence: 0.85
      }]
    };
  } catch (error) {
    console.error('[TRANSCRIPTION] Transcription error:', error);
    throw error;
  }
}