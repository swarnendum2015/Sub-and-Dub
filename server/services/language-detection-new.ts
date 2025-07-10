import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

// Initialize Google AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

interface LanguageDetectionResult {
  language: string;
  confidence: number;
  languageName: string;
}

const SUPPORTED_LANGUAGES = {
  'bn': 'Bengali',
  'en': 'English', 
  'hi': 'Hindi',
  'ta': 'Tamil',
  'te': 'Telugu',
  'ml': 'Malayalam'
};

export async function detectLanguageFromVideo(videoPath: string): Promise<LanguageDetectionResult> {
  console.log('[LANG-DETECT] Starting language detection for:', videoPath);
  
  let audioPath: string | null = null;
  
  try {
    // Extract audio sample using FFmpeg with error handling
    audioPath = await extractAudioSample(videoPath);
    console.log('[LANG-DETECT] Audio extracted to:', audioPath);
    
    // Try Gemini detection first
    const geminiResult = await detectWithGemini(audioPath);
    if (geminiResult) {
      console.log('[LANG-DETECT] Gemini detection successful:', geminiResult);
      return geminiResult;
    }
    
    // Fallback to default Bengali
    console.log('[LANG-DETECT] All detection methods failed, defaulting to Bengali');
    return { 
      language: 'bn', 
      confidence: 0.7, 
      languageName: 'Bengali' 
    };
    
  } catch (error) {
    console.error('[LANG-DETECT] Language detection failed:', error);
    return { 
      language: 'bn', 
      confidence: 0.5, 
      languageName: 'Bengali' 
    };
  } finally {
    // Clean up audio file
    if (audioPath) {
      try {
        if (fs.existsSync(audioPath)) {
          fs.unlinkSync(audioPath);
          console.log('[LANG-DETECT] Cleaned up audio file:', audioPath);
        }
      } catch (cleanupError) {
        console.error('[LANG-DETECT] Failed to cleanup audio file:', cleanupError);
      }
    }
  }
}

async function extractAudioSample(videoPath: string): Promise<string> {
  const outputPath = path.join(path.dirname(videoPath), `lang_detect_${Date.now()}.wav`);
  
  try {
    const command = `ffmpeg -i "${videoPath}" -t 30 -vn -acodec pcm_s16le -ar 16000 -ac 1 -y "${outputPath}"`;
    await execAsync(command);
    
    if (!fs.existsSync(outputPath)) {
      throw new Error('Audio extraction failed - output file not created');
    }
    
    return outputPath;
  } catch (error) {
    console.error('[LANG-DETECT] FFmpeg extraction failed:', error);
    throw new Error(`Audio extraction failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function detectWithGemini(audioPath: string): Promise<LanguageDetectionResult | null> {
  try {
    if (!process.env.GOOGLE_AI_API_KEY) {
      console.log('[LANG-DETECT] No Google AI API key, skipping Gemini detection');
      return null;
    }
    
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    
    const audioData = fs.readFileSync(audioPath);
    const audioBase64 = audioData.toString('base64');
    
    const prompt = `Analyze this audio and identify the primary language. 
    Supported languages: Bengali (bn), English (en), Hindi (hi), Tamil (ta), Telugu (te), Malayalam (ml).
    
    Respond with only JSON:
    {
      "language": "language_code",
      "confidence": 0.85,
      "languageName": "Language Name"
    }`;
    
    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { mimeType: "audio/wav", data: audioBase64 } }
    ]);
    
    const response = result.response.text();
    const parsedResponse = JSON.parse(response);
    
    if (parsedResponse.language && SUPPORTED_LANGUAGES[parsedResponse.language as keyof typeof SUPPORTED_LANGUAGES]) {
      return {
        language: parsedResponse.language,
        confidence: Math.max(0, Math.min(1, parsedResponse.confidence || 0.8)),
        languageName: parsedResponse.languageName || SUPPORTED_LANGUAGES[parsedResponse.language as keyof typeof SUPPORTED_LANGUAGES]
      };
    }
    
    return null;
    
  } catch (error) {
    console.error('[LANG-DETECT] Gemini detection failed:', error);
    return null;
  }
}

export function getSupportedLanguages(): Array<{ code: string; name: string }> {
  return Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => ({ code, name }));
}