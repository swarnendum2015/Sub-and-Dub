import { storage } from "../storage";

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

// Calculate translation confidence based on quality metrics
function calculateTranslationConfidence(originalText: string, translatedText: string): number {
  if (!originalText || !translatedText) return 0.1;
  
  // Professional translation confidence scoring based on subtitling standards
  const originalWords = originalText.trim().split(/\s+/).length;
  const translatedWords = translatedText.trim().split(/\s+/).length;
  const lengthRatio = translatedWords / originalWords;
  
  // Subtitle timing and readability metrics
  const charsPerSecond = translatedText.length / 3; // Assume 3-second segment average
  const idealCPS = 20; // Characters per second for readable subtitles
  const readabilityScore = Math.min(1.0, idealCPS / Math.max(charsPerSecond, 10));
  
  // Language-specific length expectations for Bengali translations
  let optimalLengthRange = { min: 0.6, max: 1.8 };
  
  let lengthScore = 1.0;
  if (lengthRatio < optimalLengthRange.min || lengthRatio > optimalLengthRange.max) {
    lengthScore = 0.75; // Outside optimal range
  } else if (lengthRatio < 0.8 || lengthRatio > 1.4) {
    lengthScore = 0.9; // Slightly outside ideal
  }
  
  // Translation quality indicators
  const qualityIndicators = {
    hasPlaceholders: /\[.*\]|\(.*\)|{.*}/.test(translatedText),
    hasErrorMarkers: /(unable|error|failed|cannot|न्हीं|नहीं)/i.test(translatedText),
    hasRepeatedOriginal: translatedText.includes(originalText.substring(0, Math.min(10, originalText.length))),
    hasIncompleteText: translatedText.length < 3 || translatedText.endsWith('...'),
    hasProperPunctuation: /[.!?।]$/.test(translatedText.trim()),
    hasNaturalFlow: !/\b(the the|a a|is is|and and)\b/i.test(translatedText)
  };
  
  let qualityScore = 1.0;
  if (qualityIndicators.hasPlaceholders || qualityIndicators.hasErrorMarkers) {
    qualityScore = 0.4;
  } else if (qualityIndicators.hasRepeatedOriginal || qualityIndicators.hasIncompleteText) {
    qualityScore = 0.6;
  } else if (!qualityIndicators.hasProperPunctuation || !qualityIndicators.hasNaturalFlow) {
    qualityScore = 0.85;
  }
  
  // Context and complexity scoring
  let complexityScore = 1.0;
  if (originalWords <= 2) {
    complexityScore = 0.95; // Very short phrases
  } else if (originalWords <= 5) {
    complexityScore = 0.92; // Short sentences
  } else if (originalWords <= 10) {
    complexityScore = 0.88; // Medium sentences
  } else {
    complexityScore = 0.85; // Long sentences
  }
  
  // Cultural and contextual adaptation bonus
  const hasCulturalAdaptation = /sir|madam|ji|saheb|bhai|didi/i.test(originalText) && 
                               !/sir|madam|ji|saheb|bhai|didi/i.test(translatedText);
  const culturalScore = hasCulturalAdaptation ? 1.05 : 1.0;
  
  // Final confidence calculation
  const finalConfidence = complexityScore * lengthScore * qualityScore * readabilityScore * culturalScore;
  
  // Ensure confidence is within reasonable bounds for professional subtitling
  return Math.max(0.65, Math.min(0.98, finalConfidence));
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
        // Update existing translation with new confidence
        const newConfidence = calculateTranslationConfidence(segment.originalText || segment.text, segment.translatedText);
        await storage.updateTranslation(existingTranslation.id, segment.translatedText, newConfidence);
        savedTranslations.push({
          ...existingTranslation,
          text: segment.translatedText,
          confidence: newConfidence
        });
      } else {
        // Create new translation
        const newTranslation = await storage.createTranslation({
          transcriptionId: segment.id,
          targetLanguage,
          text: segment.translatedText,
          confidence: calculateTranslationConfidence(segment.originalText, segment.translatedText), // Calculate real confidence
          model: "gemini-batch"
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