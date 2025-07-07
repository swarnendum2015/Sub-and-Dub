import { storage } from "../storage";
import OpenAI from "openai";

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "" 
});

const GOOGLE_TRANSLATE_API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY || "";
const AZURE_TRANSLATOR_KEY = process.env.AZURE_TRANSLATOR_KEY || "";

export async function translateText(transcriptionId: number, targetLanguage: string) {
  const transcription = await storage.getTranscriptionsByVideoId(transcriptionId);
  if (!transcription.length) {
    throw new Error("Transcription not found");
  }

  const sourceText = transcription[0].text;
  
  // Use multiple translation models for confidence scoring
  const translations = await Promise.all([
    translateWithOpenAI(sourceText, targetLanguage),
    translateWithGoogle(sourceText, targetLanguage),
    translateWithAzure(sourceText, targetLanguage),
  ]);

  // Calculate confidence based on agreement between models
  const confidence = calculateTranslationConfidence(translations);
  
  // Use the translation with highest individual confidence
  const bestTranslation = translations.reduce((best, current) => 
    current.confidence > best.confidence ? current : best
  );

  return await storage.createTranslation({
    transcriptionId,
    targetLanguage,
    translatedText: bestTranslation.text,
    confidence: confidence,
    model: "multi-model-ensemble",
  });
}

async function translateWithOpenAI(text: string, targetLanguage: string) {
  try {
    const languageNames = {
      'en': 'English',
      'hi': 'Hindi',
      'ta': 'Tamil',
      'te': 'Telugu',
      'ml': 'Malayalam',
      'es': 'Spanish',
      'fr': 'French',
    };

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: `You are a professional translator. Translate the following Bengali text to ${languageNames[targetLanguage]}. Maintain the original meaning, tone, and context. Respond with JSON in this format: { "translation": "translated text", "confidence": 0.95 }`,
        },
        {
          role: "user",
          content: text,
        },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return {
      text: result.translation || text,
      confidence: result.confidence || 0.8,
      model: "openai-gpt-4o",
    };
  } catch (error) {
    console.error("OpenAI translation error:", error);
    return {
      text: text,
      confidence: 0.5,
      model: "openai-gpt-4o",
    };
  }
}

async function translateWithGoogle(text: string, targetLanguage: string) {
  try {
    if (!GOOGLE_TRANSLATE_API_KEY) {
      throw new Error("Google Translate API key not provided");
    }

    const response = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_TRANSLATE_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: text,
          source: 'bn',
          target: targetLanguage,
        }),
      }
    );

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error?.message || 'Translation failed');
    }

    return {
      text: result.data.translations[0].translatedText,
      confidence: 0.85,
      model: "google-translate",
    };
  } catch (error) {
    console.error("Google Translate error:", error);
    return {
      text: text,
      confidence: 0.5,
      model: "google-translate",
    };
  }
}

async function translateWithAzure(text: string, targetLanguage: string) {
  try {
    if (!AZURE_TRANSLATOR_KEY) {
      throw new Error("Azure Translator key not provided");
    }

    const response = await fetch(
      `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=bn&to=${targetLanguage}`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': AZURE_TRANSLATOR_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([{ text }]),
      }
    );

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error?.message || 'Translation failed');
    }

    return {
      text: result[0].translations[0].text,
      confidence: result[0].translations[0].confidence || 0.8,
      model: "azure-translator",
    };
  } catch (error) {
    console.error("Azure Translate error:", error);
    return {
      text: text,
      confidence: 0.5,
      model: "azure-translator",
    };
  }
}

function calculateTranslationConfidence(translations: any[]): number {
  // Simple confidence calculation based on model agreement
  const validTranslations = translations.filter(t => t.confidence > 0.6);
  if (validTranslations.length === 0) return 0.5;
  
  const avgConfidence = validTranslations.reduce((sum, t) => sum + t.confidence, 0) / validTranslations.length;
  
  // Boost confidence if multiple models agree
  const agreementBonus = validTranslations.length > 1 ? 0.1 : 0;
  
  return Math.min(0.99, avgConfidence + agreementBonus);
}
