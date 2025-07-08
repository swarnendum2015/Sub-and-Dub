import { storage } from "../storage";
import fs from "fs";
import path from "path";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_LABS_API_KEY || "";

export async function generateDubbingSimple(dubbingJobId: number) {
  const dubbingJob = await storage.getDubbingJob(dubbingJobId);
  
  // Get voice ID from global map
  const voiceId = global.dubbingVoiceMap?.get(dubbingJobId) || "21m00Tcm4TlvDq8ikWAM";
  
  if (!dubbingJob) {
    throw new Error("Dubbing job not found");
  }

  try {
    await storage.updateDubbingJobStatus(dubbingJobId, "processing");

    // Get video and its transcriptions
    const video = await storage.getVideo(dubbingJob.videoId);
    if (!video) {
      throw new Error("Video not found");
    }

    const transcriptions = await storage.getTranscriptionsByVideoId(dubbingJob.videoId);
    
    // Get translations for the target language
    const translations = [];
    for (const transcription of transcriptions) {
      const trans = await storage.getTranslationsByTranscriptionId(transcription.id);
      const targetTranslation = trans.find(t => t.targetLanguage === dubbingJob.language);
      if (targetTranslation) {
        translations.push({
          text: targetTranslation.translatedText,
          startTime: transcription.startTime,
          endTime: transcription.endTime,
        });
      }
    }

    if (translations.length === 0) {
      throw new Error(`No translations found for language: ${dubbingJob.language}`);
    }

    // Create dubbing using simplified TTS approach with selected voice
    const dubbingResult = await createSimpleDubbing(translations, dubbingJob.language, voiceId);
    
    // Save audio file
    const audioPath = path.join("uploads", `dubbed_${dubbingJob.id}_${dubbingJob.language}.mp3`);
    fs.writeFileSync(audioPath, dubbingResult.audioBuffer);

    await storage.updateDubbingJobStatus(dubbingJobId, "completed", audioPath);
    
    return { audioPath, jobId: dubbingResult.jobId };
  } catch (error) {
    console.error("Dubbing failed:", error);
    await storage.updateDubbingJobStatus(dubbingJobId, "failed");
    throw error;
  }
}

async function createSimpleDubbing(translations: any[], targetLanguage: string, voiceId?: string) {
  console.log(`Creating TTS dubbing for ${targetLanguage} with ${translations.length} segments, voice: ${voiceId || 'default'}`);
  
  if (!ELEVENLABS_API_KEY) {
    // Use demo dubbing if no API key
    console.log("No ElevenLabs API key, using demo dubbing");
    return {
      audioBuffer: Buffer.from(`Demo audio for ${targetLanguage}: ${translations.slice(0, 3).map(t => t.text).join(' ')}`),
      jobId: `demo_${Date.now()}`,
    };
  }
  
  try {
    // Combine all translations into a single text with pauses
    const fullText = translations.map(t => t.text).join(" ... ");
    
    // Use ElevenLabs text-to-speech API with selected voice
    const selectedVoiceId = voiceId || "21m00Tcm4TlvDq8ikWAM"; // Default to Rachel voice
    
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: fullText,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5,
        },
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs API error:", response.status, errorText);
      
      // Fall back to demo if API fails
      return {
        audioBuffer: Buffer.from(`Demo audio (API error): ${translations.slice(0, 3).map(t => t.text).join(' ')}`),
        jobId: `demo_error_${Date.now()}`,
      };
    }
    
    const audioBuffer = Buffer.from(await response.arrayBuffer());
    
    return {
      audioBuffer,
      jobId: `tts_${Date.now()}`,
    };
  } catch (error) {
    console.error("TTS error:", error);
    // Fall back to demo on any error
    return {
      audioBuffer: Buffer.from(`Demo audio (error): ${translations.slice(0, 3).map(t => t.text).join(' ')}`),
      jobId: `demo_catch_${Date.now()}`,
    };
  }
}