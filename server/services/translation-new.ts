import { storage } from "../storage";
import { GoogleGenAI } from "@google/genai";

const gemini = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY || "" 
});

const LANGUAGE_NAMES: Record<string, string> = {
  'en': 'English',
  'hi': 'Hindi', 
  'ta': 'Tamil',
  'te': 'Telugu',
  'ml': 'Malayalam',
  'es': 'Spanish',
  'fr': 'French'
};

async function translateWithGemini(text: string, targetLanguage: string): Promise<{ text: string; confidence: number; model: string }> {
  if (!process.env.GEMINI_API_KEY) {
    console.warn("Gemini API key not configured");
    throw new Error("Gemini API key not configured");
  }

  const targetLangName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;

  try {
    console.log(`[TRANSLATE] Gemini translating "${text.substring(0, 30)}..." to ${targetLangName}`);
    
    const response = await gemini.models.generateContent({
      model: "gemini-2.5-pro",
      contents: [
        {
          role: "user",
          parts: [{
            text: `You are a professional translator. Translate the following Bengali text to ${targetLangName}.

Requirements:
- Provide ONLY the direct translation
- Do NOT include any prefixes like "[Translated from Bengali]"
- Do NOT include any explanations or additional text
- Maintain the original meaning and tone
- Return the translation in ${targetLangName} script/language

Bengali text: ${text}

${targetLangName} translation:`
          }]
        }
      ],
      config: {
        temperature: 0.1,
        maxOutputTokens: 1000
      }
    });

    const translatedText = response.text?.trim() || text;
    
    // Validate translation - ensure no Bengali characters for English
    const bengaliPattern = /[\u0980-\u09FF]/;
    if (targetLanguage === 'en' && bengaliPattern.test(translatedText)) {
      console.error(`[TRANSLATE] Gemini returned Bengali text for English translation: "${translatedText}"`);
      throw new Error("Translation returned Bengali text instead of English");
    }

    // Ensure translation is not just the original text
    if (translatedText === text) {
      console.warn(`[TRANSLATE] Gemini returned original text unchanged`);
      throw new Error("Translation returned unchanged text");
    }

    console.log(`[TRANSLATE] Gemini success: "${translatedText.substring(0, 50)}..."`);

    return {
      text: translatedText,
      confidence: 0.92,
      model: "gemini-2.5-pro"
    };
  } catch (error) {
    console.error(`[TRANSLATE] Gemini translation failed:`, error);
    throw error;
  }
}

// Removed fallback translations - only using real Gemini translations


export async function translateText(transcriptionId: number, targetLanguage: string) {
  console.log(`[TRANSLATE] Starting translation for transcription ${transcriptionId} to ${targetLanguage}`);
  
  // Find the transcription
  let transcription = null;
  const allVideos = await storage.getAllVideos();
  
  for (const video of allVideos) {
    const transcriptions = await storage.getTranscriptionsByVideoId(video.id);
    const found = transcriptions.find(t => t.id === transcriptionId);
    if (found) {
      transcription = found;
      break;
    }
  }
  
  if (!transcription) {
    throw new Error(`Transcription ${transcriptionId} not found`);
  }

  // Check if translation already exists
  const existingTranslations = await storage.getTranslationsByTranscriptionId(transcriptionId);
  const existing = existingTranslations.find(t => t.targetLanguage === targetLanguage);
  
  if (existing) {
    console.log(`[TRANSLATE] Translation already exists for ${transcriptionId} -> ${targetLanguage}`);
    return;
  }

  // Perform translation - only use real Gemini translation, no fallbacks
  const translation = await translateWithGemini(transcription.text, targetLanguage);
  
  // Store the translation
  await storage.createTranslation({
    transcriptionId,
    targetLanguage,
    translatedText: translation.text,
    confidence: translation.confidence,
    model: translation.model
  });
  
  console.log(`[TRANSLATE] Success: "${transcription.text.substring(0, 30)}..." -> "${translation.text.substring(0, 30)}..."`);
}

export async function retranslateText(transcriptionId: number, targetLanguage: string) {
  console.log(`[RETRANSLATE] Re-translating transcription ${transcriptionId} to ${targetLanguage}`);
  
  // Find the transcription
  let transcription = null;
  const allVideos = await storage.getAllVideos();
  
  for (const video of allVideos) {
    const transcriptions = await storage.getTranscriptionsByVideoId(video.id);
    const found = transcriptions.find(t => t.id === transcriptionId);
    if (found) {
      transcription = found;
      break;
    }
  }
  
  if (!transcription) {
    throw new Error(`Transcription ${transcriptionId} not found`);
  }

  try {
    // Force re-translation by calling Gemini again
    const result = await translateWithGemini(transcription.text, targetLanguage);
    
    console.log(`[RETRANSLATE] New translation result: "${result.text.substring(0, 50)}..."`);
    
    // Update existing translation
    const existingTranslations = await storage.getTranslationsByTranscriptionId(transcriptionId);
    const existing = existingTranslations.find(t => t.targetLanguage === targetLanguage);
    
    if (existing) {
      // Update via storage interface
      await storage.updateTranslation(existing.id, result.text);
      console.log(`[RETRANSLATE] Updated existing translation ${existing.id}`);
    } else {
      // Create new translation
      await storage.createTranslation({
        transcriptionId,
        targetLanguage,
        translatedText: result.text,
        confidence: result.confidence,
        model: result.model
      });
      console.log(`[RETRANSLATE] Created new translation for ${transcriptionId} -> ${targetLanguage}`);
    }
    
    return result;
  } catch (error) {
    console.error(`[RETRANSLATE] Error re-translating transcription ${transcriptionId}:`, error);
    throw error;
  }
}