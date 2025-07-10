import { storage } from "../storage";
import { 
  enhanceTranscriptionWithStandards, 
  calculateEnhancedConfidence, 
  validateSubtitleSegment,
  NETFLIX_STANDARDS 
} from './subtitling-standards.js';

// Fallback if Google GenAI is not available, use OpenAI
async function translateBatchWithOpenAI(batchText: string, targetLanguage: string): Promise<string> {
  const languageMap: { [key: string]: string } = {
    'en': 'English',
    'hi': 'Hindi',
    'ta': 'Tamil',
    'te': 'Telugu',
    'ml': 'Malayalam'
  };
  
  const targetLangName = languageMap[targetLanguage] || targetLanguage;
  
  const prompt = `You are a premium Translation and Subtitling expert working for a world-class content studio. Your expertise includes contextual translation, cultural adaptation, and professional subtitling standards.

TRANSLATION BRIEF:
- Source Language: Bengali
- Target Language: ${targetLangName}
- Content Type: Video subtitles/dialogue
- Quality Standard: Broadcast/Cinema level

PROFESSIONAL SUBTITLING STANDARDS:
1. CONTEXTUAL TRANSLATION: Understand the video context, emotions, and cultural nuances rather than literal word-for-word translation
2. PRONOUN HANDLING: Properly identify and translate pronouns based on context, gender, and cultural appropriateness
3. SUBTITLE BEST PRACTICES:
   - Keep translations concise and readable (max 2 lines when possible)
   - Maintain natural speech patterns and rhythm
   - Preserve emotional tone and speaker intent
   - Use culturally appropriate expressions and idioms
4. TECHNICAL REQUIREMENTS:
   - Maintain exact SEGMENT_X: format
   - Translate only text after the colon
   - Ensure subtitle timing compatibility
5. QUALITY ASSURANCE:
   - Avoid common subtitling errors (redundancy, awkward phrasing)
   - Ensure grammatical accuracy and proper punctuation
   - Maintain consistency in terminology and character names
   - Adapt cultural references appropriately

Bengali text to translate:
${batchText}

Translate to ${targetLangName}:`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [{
        role: 'user',
        content: prompt
      }],
      temperature: 0.3
    })
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    console.error('[BATCH_TRANSLATE] OpenAI API error:', data);
    throw new Error(`OpenAI API error: ${data.error?.message || 'Unknown error'}`);
  }
  
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    console.error('[BATCH_TRANSLATE] Unexpected OpenAI response format:', data);
    throw new Error('Unexpected OpenAI response format');
  }
  
  return data.choices[0].message.content;
}

interface BatchTranslationRequest {
  videoId: number;
  targetLanguage: string;
}

interface TranslationSegment {
  id: number;
  startTime: number;
  endTime: number;
  text: string;
  speakerId?: string;
  speakerName?: string;
  originalText?: string;
}

// Calculate translation confidence based on studio-grade quality metrics
function calculateTranslationConfidence(
  originalText: string, 
  translatedText: string, 
  startTime: number, 
  endTime: number
): number {
  if (!originalText || !translatedText) return 0.1;
  
  // Studio-grade translation confidence scoring
  const duration = endTime - startTime;
  
  // Validate against subtitle standards
  const validation = validateSubtitleSegment(translatedText, startTime, endTime);
  
  // Professional translation quality metrics
  const originalWords = originalText.trim().split(/\s+/).length;
  const translatedWords = translatedText.trim().split(/\s+/).length;
  const lengthRatio = translatedWords / originalWords;
  
  // Base confidence starts with subtitle standards compliance
  let confidence = validation.qualityScore / 100;
  
  // Adjust for optimal length ratio (0.8-1.2 is good for most language pairs)
  if (lengthRatio >= 0.8 && lengthRatio <= 1.2) {
    confidence += 0.1;
  } else if (lengthRatio < 0.5 || lengthRatio > 2.0) {
    confidence -= 0.2; // Severely penalize extreme length differences
  }
  
  // Reward proper duration compliance
  if (duration >= NETFLIX_STANDARDS.minDuration && duration <= NETFLIX_STANDARDS.maxDuration) {
    confidence += 0.05;
  }
  
  // Check for translation quality indicators
  if (translatedText.length > 10 && !translatedText.includes('[') && !translatedText.includes('Unable')) {
    confidence += 0.05;
  }
  
  return Math.max(0.1, Math.min(0.98, confidence));
}

export async function translateVideoBatch({ videoId, targetLanguage }: BatchTranslationRequest) {
  console.log(`[BATCH_TRANSLATE] Starting batch translation for video ${videoId} to ${targetLanguage}`);
  
  try {
    // Get all confirmed Bengali transcriptions for this video
    const transcriptions = await storage.getTranscriptionsByVideoId(videoId);
    
    if (transcriptions.length === 0) {
      throw new Error("No transcriptions found for this video");
    }
    
    // Check if Bengali is confirmed for the video
    const video = await storage.getVideo(videoId);
    if (!video?.bengaliConfirmed) {
      throw new Error("Bengali transcription not confirmed. Please confirm the Bengali text first.");
    }
    
    // Use all Bengali transcriptions when video is confirmed
    const confirmedTranscriptions = transcriptions;
    
    console.log(`[BATCH_TRANSLATE] Found ${confirmedTranscriptions.length} confirmed transcriptions`);
    
    // Prepare batch text for translation
    const segmentMap: { [key: string]: TranslationSegment } = {};
    let batchText = "";
    
    confirmedTranscriptions.forEach((transcription, index) => {
      const segmentKey = `SEGMENT_${index}`;
      segmentMap[segmentKey] = {
        id: transcription.id,
        startTime: transcription.startTime,
        endTime: transcription.endTime,
        text: transcription.text,
        speakerId: transcription.speakerId,
        speakerName: transcription.speakerName,
        originalText: transcription.text
      };
      
      // Add segment markers for batch processing
      batchText += `${segmentKey}: ${transcription.text}\n`;
    });
    
    console.log(`[BATCH_TRANSLATE] Prepared batch text with ${Object.keys(segmentMap).length} segments`);
    
    // Translate the entire batch using Gemini with OpenAI fallback
    let translatedBatch;
    try {
      translatedBatch = await translateBatchWithGemini(batchText, targetLanguage);
    } catch (error) {
      console.error('[BATCH_TRANSLATE] Gemini failed, using OpenAI fallback:', error);
      try {
        translatedBatch = await translateBatchWithOpenAI(batchText, targetLanguage);
      } catch (openaiError) {
        console.error('[BATCH_TRANSLATE] Both Gemini and OpenAI failed:', openaiError);
        throw new Error(`Translation failed: Gemini (${error.message}) and OpenAI (${openaiError.message}) both unavailable`);
      }
    }
    
    // Parse the translated batch back into individual segments
    const translatedSegments = parseBatchTranslation(translatedBatch, segmentMap);
    
    // Save translations to database
    const savedTranslations = [];
    for (const segment of translatedSegments) {
      // Check if translation already exists
      const existingTranslations = await storage.getTranslationsByTranscriptionId(segment.id);
      const existingTranslation = existingTranslations.find(t => t.targetLanguage === targetLanguage);
      
      if (existingTranslation) {
        // Update existing translation with studio-grade confidence
        const newConfidence = calculateTranslationConfidence(
          segment.originalText || segment.text, 
          segment.translatedText,
          segment.startTime,
          segment.endTime
        );
        await storage.updateTranslation(existingTranslation.id, segment.translatedText, newConfidence);
        savedTranslations.push({
          ...existingTranslation,
          text: segment.translatedText,
          confidence: newConfidence
        });
      } else {
        // Create new translation with studio-grade analysis
        const studioConfidence = calculateTranslationConfidence(
          segment.originalText || segment.text, 
          segment.translatedText,
          segment.startTime,
          segment.endTime
        );
        const newTranslation = await storage.createTranslation({
          transcriptionId: segment.id,
          targetLanguage,
          text: segment.translatedText,
          confidence: studioConfidence,
          model: "gemini-2.5-pro"
        });
        savedTranslations.push(newTranslation);
      }
    }
    
    console.log(`[BATCH_TRANSLATE] Successfully saved ${savedTranslations.length} translations`);
    return savedTranslations;
    
  } catch (error) {
    console.error(`[BATCH_TRANSLATE] Error in batch translation:`, error);
    throw error;
  }
}

async function translateBatchWithGemini(batchText: string, targetLanguage: string): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Gemini API key not configured");
  }

  const languageMap: { [key: string]: string } = {
    'en': 'English',
    'hi': 'Hindi',
    'ta': 'Tamil',
    'te': 'Telugu',
    'ml': 'Malayalam'
  };
  
  const targetLangName = languageMap[targetLanguage] || targetLanguage;
  
  const prompt = `You are a premium Translation and Subtitling expert working for a world-class content studio. Your expertise includes contextual translation, cultural adaptation, and professional subtitling standards.

TRANSLATION BRIEF:
- Source Language: Bengali
- Target Language: ${targetLangName}
- Content Type: Video subtitles/dialogue
- Quality Standard: Broadcast/Cinema level

Translate the following Bengali text segments to ${targetLangName}. Each segment is marked with SEGMENT_X: followed by the Bengali text.

PROFESSIONAL SUBTITLING STANDARDS:
1. CONTEXTUAL TRANSLATION: Understand the video context, emotions, and cultural nuances rather than literal word-for-word translation
2. PRONOUN HANDLING: Properly identify and translate pronouns based on context, gender, and cultural appropriateness
3. SUBTITLE BEST PRACTICES:
   - Keep translations concise and readable (max 2 lines when possible)
   - Maintain natural speech patterns and rhythm
   - Preserve emotional tone and speaker intent
   - Use culturally appropriate expressions and idioms
4. TECHNICAL REQUIREMENTS:
   - Maintain exact SEGMENT_X: format
   - Translate only text after the colon
   - Ensure subtitle timing compatibility
5. QUALITY ASSURANCE:
   - Avoid common subtitling errors (redundancy, awkward phrasing)
   - Ensure grammatical accuracy and proper punctuation
   - Maintain consistency in terminology and character names
   - Adapt cultural references appropriately
4. Keep speaker names and technical terms appropriate for ${targetLangName}
5. Maintain the same number of segments in your response

Bengali text to translate:
${batchText}

Translate to ${targetLangName}:`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        temperature: 0.3,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 8192,
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Gemini API error:', response.status, errorText);
    // Fallback to OpenAI if Gemini fails
    return await translateBatchWithOpenAI(batchText, targetLanguage);
  }

  const data = await response.json();
  const translatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!translatedText) {
    console.error('No translation received from Gemini, falling back to OpenAI');
    return await translateBatchWithOpenAI(batchText, targetLanguage);
  }
  
  return translatedText;
}

function parseBatchTranslation(translatedBatch: string, segmentMap: { [key: string]: TranslationSegment }): Array<TranslationSegment & { translatedText: string }> {
  const results: Array<TranslationSegment & { translatedText: string }> = [];
  
  const lines = translatedBatch.split('\n');
  
  for (const line of lines) {
    const match = line.match(/^(SEGMENT_\d+):\s*(.+)$/);
    if (match) {
      const segmentKey = match[1];
      const translatedText = match[2].trim();
      
      if (segmentMap[segmentKey]) {
        results.push({
          ...segmentMap[segmentKey],
          translatedText
        });
      }
    }
  }
  
  return results;
}