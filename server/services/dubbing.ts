import { storage } from "../storage";
import fs from "fs";
import path from "path";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_LABS_API_KEY || "";

export async function generateDubbing(dubbingJobId: number) {
  const dubbingJobs = await storage.getDubbingJobsByVideoId(dubbingJobId);
  const dubbingJob = dubbingJobs.find(job => job.id === dubbingJobId);
  
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

    // Create dubbing using ElevenLabs Dubbing Studio
    const dubbingResult = await createDubbing(video.filePath, translations, dubbingJob.language);
    
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

async function createDubbing(videoPath: string, translations: any[], targetLanguage: string) {
  if (!ELEVENLABS_API_KEY) {
    throw new Error("ElevenLabs API key is required");
  }

  // Create project for dubbing
  const projectResponse = await fetch('https://api.elevenlabs.io/v1/dubbing', {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `Dubbing_${Date.now()}`,
      source_language: 'bn',
      target_language: targetLanguage,
      num_speakers: 1,
      watermark: false,
    }),
  });

  if (!projectResponse.ok) {
    throw new Error(`Failed to create dubbing project: ${projectResponse.statusText}`);
  }

  const project = await projectResponse.json();

  // Upload video file
  const formData = new FormData();
  const videoBuffer = fs.readFileSync(videoPath);
  const videoBlob = new Blob([videoBuffer], { type: 'video/mp4' });
  formData.append('file', videoBlob, 'video.mp4');

  const uploadResponse = await fetch(`https://api.elevenlabs.io/v1/dubbing/${project.dubbing_id}/audio`, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
    },
    body: formData,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload video: ${uploadResponse.statusText}`);
  }

  // Wait for processing to complete
  let status = 'processing';
  while (status === 'processing') {
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    
    const statusResponse = await fetch(`https://api.elevenlabs.io/v1/dubbing/${project.dubbing_id}`, {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
    });

    if (!statusResponse.ok) {
      throw new Error(`Failed to check dubbing status: ${statusResponse.statusText}`);
    }

    const statusData = await statusResponse.json();
    status = statusData.status;
  }

  if (status !== 'completed') {
    throw new Error(`Dubbing failed with status: ${status}`);
  }

  // Download the dubbed audio
  const downloadResponse = await fetch(`https://api.elevenlabs.io/v1/dubbing/${project.dubbing_id}/audio/${targetLanguage}`, {
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
    },
  });

  if (!downloadResponse.ok) {
    throw new Error(`Failed to download dubbed audio: ${downloadResponse.statusText}`);
  }

  const audioBuffer = await downloadResponse.arrayBuffer();

  return {
    audioBuffer: Buffer.from(audioBuffer),
    jobId: project.dubbing_id,
  };
}
