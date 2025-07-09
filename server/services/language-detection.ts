import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

interface LanguageDetectionResult {
  language: string;
  confidence: number;
  languageName: string;
}

// Supported languages with their codes and names
const SUPPORTED_LANGUAGES = {
  'bn': 'Bengali',
  'en': 'English',
  'hi': 'Hindi',
  'ta': 'Tamil',
  'te': 'Telugu',
  'ml': 'Malayalam',
  'ur': 'Urdu',
  'pa': 'Punjabi',
  'gu': 'Gujarati',
  'kn': 'Kannada',
  'or': 'Odia',
  'as': 'Assamese',
  'mr': 'Marathi',
  'ne': 'Nepali',
  'si': 'Sinhala',
  'my': 'Myanmar',
  'th': 'Thai',
  'vi': 'Vietnamese',
  'id': 'Indonesian',
  'ms': 'Malay',
  'tl': 'Filipino',
  'ja': 'Japanese',
  'ko': 'Korean',
  'zh': 'Chinese',
  'ar': 'Arabic',
  'fa': 'Persian',
  'tr': 'Turkish',
  'ru': 'Russian',
  'de': 'German',
  'fr': 'French',
  'es': 'Spanish',
  'it': 'Italian',
  'pt': 'Portuguese',
  'nl': 'Dutch',
  'pl': 'Polish',
  'sv': 'Swedish',
  'da': 'Danish',
  'no': 'Norwegian',
  'fi': 'Finnish',
  'hu': 'Hungarian',
  'cs': 'Czech',
  'sk': 'Slovak',
  'sl': 'Slovenian',
  'hr': 'Croatian',
  'sr': 'Serbian',
  'bg': 'Bulgarian',
  'ro': 'Romanian',
  'uk': 'Ukrainian',
  'he': 'Hebrew',
  'sw': 'Swahili',
  'am': 'Amharic'
};

export async function detectLanguageFromVideo(videoPath: string): Promise<LanguageDetectionResult> {
  try {
    console.log(`Starting language detection for video: ${videoPath}`);
    
    // Extract a short audio sample for analysis (first 30 seconds)
    const audioPath = await extractAudioSample(videoPath);
    
    // Use OpenAI Whisper for initial transcription and language detection
    const whisperResult = await detectWithWhisper(audioPath);
    
    // If OpenAI fails, try with Gemini as fallback
    if (!whisperResult) {
      const geminiResult = await detectWithGemini(audioPath);
      return geminiResult || { language: 'en', confidence: 0.5, languageName: 'English' };
    }
    
    // Clean up temporary audio file
    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }
    
    return whisperResult;
    
  } catch (error) {
    console.error('Language detection failed:', error);
    // Default to English with low confidence
    return { language: 'en', confidence: 0.3, languageName: 'English' };
  }
}

async function extractAudioSample(videoPath: string): Promise<string> {
  const outputPath = path.join(path.dirname(videoPath), `lang_detect_${Date.now()}.wav`);
  
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', videoPath,
      '-t', '30', // First 30 seconds
      '-vn', // No video
      '-acodec', 'pcm_s16le',
      '-ar', '16000', // 16kHz sample rate
      '-ac', '1', // Mono
      '-y', // Overwrite output file
      outputPath
    ]);

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`FFmpeg failed with code ${code}`));
      }
    });

    ffmpeg.on('error', reject);
  });
}

async function detectWithWhisper(audioPath: string): Promise<LanguageDetectionResult | null> {
  try {
    const response = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: "whisper-1",
      language: undefined, // Let Whisper auto-detect
      response_format: "verbose_json",
    });

    const detectedLanguage = response.language;
    const confidence = calculateWhisperConfidence(response.text);
    
    // Map Whisper language codes to our supported languages
    const mappedLanguage = mapWhisperLanguage(detectedLanguage);
    const languageName = SUPPORTED_LANGUAGES[mappedLanguage as keyof typeof SUPPORTED_LANGUAGES] || 'Unknown';
    
    console.log(`Whisper detected: ${detectedLanguage} -> ${mappedLanguage} (${languageName}) with confidence ${confidence}`);
    
    return {
      language: mappedLanguage,
      confidence,
      languageName
    };
    
  } catch (error) {
    console.error('Whisper language detection failed:', error);
    return null;
  }
}

async function detectWithGemini(audioPath: string): Promise<LanguageDetectionResult | null> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    
    const audioData = fs.readFileSync(audioPath);
    const audioBase64 = audioData.toString('base64');
    
    const prompt = `Analyze this audio file and identify the primary language being spoken. 
    Consider these supported languages: ${Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => `${code} (${name})`).join(', ')}.
    
    Respond in JSON format with:
    {
      "language": "language_code",
      "confidence": 0.0-1.0,
      "languageName": "Language Name",
      "reasoning": "Brief explanation of detection"
    }`;
    
    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { mimeType: "audio/wav", data: audioBase64 } }
    ]);
    
    const response = result.response.text();
    const parsedResponse = JSON.parse(response);
    
    // Validate and sanitize response
    if (parsedResponse.language && SUPPORTED_LANGUAGES[parsedResponse.language as keyof typeof SUPPORTED_LANGUAGES]) {
      console.log(`Gemini detected: ${parsedResponse.language} (${parsedResponse.languageName}) with confidence ${parsedResponse.confidence}`);
      return {
        language: parsedResponse.language,
        confidence: Math.max(0, Math.min(1, parsedResponse.confidence)),
        languageName: parsedResponse.languageName
      };
    }
    
    return null;
    
  } catch (error) {
    console.error('Gemini language detection failed:', error);
    return null;
  }
}

function calculateWhisperConfidence(text: string): number {
  // Simple confidence calculation based on text quality
  if (!text || text.trim().length === 0) return 0.1;
  
  const words = text.split(/\s+/).filter(word => word.length > 0);
  if (words.length === 0) return 0.1;
  
  // Base confidence
  let confidence = 0.7;
  
  // Adjust based on text length (longer = more confident)
  if (words.length > 10) confidence += 0.1;
  if (words.length > 20) confidence += 0.1;
  
  // Adjust based on special characters (fewer = more confident)
  const specialChars = (text.match(/[^a-zA-Z0-9\s\u0080-\uFFFF]/g) || []).length;
  if (specialChars / text.length < 0.1) confidence += 0.05;
  
  return Math.min(0.95, confidence);
}

function mapWhisperLanguage(whisperLang: string): string {
  // Map Whisper language codes to our supported codes
  const mapping: Record<string, string> = {
    'bn': 'bn', // Bengali
    'en': 'en', // English
    'hi': 'hi', // Hindi
    'ta': 'ta', // Tamil
    'te': 'te', // Telugu
    'ml': 'ml', // Malayalam
    'ur': 'ur', // Urdu
    'pa': 'pa', // Punjabi
    'gu': 'gu', // Gujarati
    'kn': 'kn', // Kannada
    'or': 'or', // Odia
    'as': 'as', // Assamese
    'mr': 'mr', // Marathi
    'ne': 'ne', // Nepali
    'si': 'si', // Sinhala
    'my': 'my', // Myanmar
    'th': 'th', // Thai
    'vi': 'vi', // Vietnamese
    'id': 'id', // Indonesian
    'ms': 'ms', // Malay
    'tl': 'tl', // Filipino
    'ja': 'ja', // Japanese
    'ko': 'ko', // Korean
    'zh': 'zh', // Chinese
    'ar': 'ar', // Arabic
    'fa': 'fa', // Persian
    'tr': 'tr', // Turkish
    'ru': 'ru', // Russian
    'de': 'de', // German
    'fr': 'fr', // French
    'es': 'es', // Spanish
    'it': 'it', // Italian
    'pt': 'pt', // Portuguese
    'nl': 'nl', // Dutch
    'pl': 'pl', // Polish
    'sv': 'sv', // Swedish
    'da': 'da', // Danish
    'no': 'no', // Norwegian
    'fi': 'fi', // Finnish
    'hu': 'hu', // Hungarian
    'cs': 'cs', // Czech
    'sk': 'sk', // Slovak
    'sl': 'sl', // Slovenian
    'hr': 'hr', // Croatian
    'sr': 'sr', // Serbian
    'bg': 'bg', // Bulgarian
    'ro': 'ro', // Romanian
    'uk': 'uk', // Ukrainian
    'he': 'he', // Hebrew
    'sw': 'sw', // Swahili
    'am': 'am'  // Amharic
  };
  
  return mapping[whisperLang] || 'en'; // Default to English if not found
}

export function getSupportedLanguages(): Array<{ code: string; name: string }> {
  return Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => ({ code, name }));
}