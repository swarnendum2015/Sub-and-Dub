import * as fs from "fs";
import * as path from "path";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";

export async function transcribeWithElevenLabs(audioPath: string): Promise<any> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error("ElevenLabs API key not configured");
  }

  console.log(`[TRANSCRIBE] Starting ElevenLabs transcription for: ${audioPath}`);
  
  try {
    // Read the audio file
    const audioBuffer = fs.readFileSync(audioPath);
    
    // Create form data
    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });
    formData.append('audio', audioBlob, path.basename(audioPath));
    formData.append('model', 'eleven_multilingual_v2');
    formData.append('language', 'bn'); // Bengali language code
    
    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TRANSCRIBE] ElevenLabs API error:`, response.status, errorText);
      throw new Error(`ElevenLabs API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    console.log(`[TRANSCRIBE] ElevenLabs raw response:`, result);

    // Convert ElevenLabs response to our format
    if (result.text) {
      // ElevenLabs returns full text, we need to create segments
      // For now, create a single segment - in production you'd want proper segmentation
      const transcriptionResult = {
        text: result.text,
        language: 'bn',
        segments: [
          {
            start: 0,
            end: 30, // Default duration, should be calculated from audio
            text: result.text,
            confidence: result.confidence || 0.8
          }
        ],
        confidence: result.confidence || 0.8
      };

      console.log(`[TRANSCRIBE] ElevenLabs transcription completed:`, transcriptionResult.text.substring(0, 100));
      return transcriptionResult;
    } else {
      throw new Error("ElevenLabs returned empty transcription");
    }
  } catch (error) {
    console.error(`[TRANSCRIBE] ElevenLabs transcription failed:`, error);
    throw error;
  }
}