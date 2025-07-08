import { storage } from "../storage";

// Fallback if Google GenAI is not available, use OpenAI
async function translateBatchWithOpenAI(batchText: string, targetLanguage: string): Promise<string> {
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
        content: `Translate the following Bengali text segments to ${targetLanguage}. Keep the SEGMENT_X: format intact.\n\n${batchText}`
      }],
      temperature: 0.3
    })
  });
  
  const data = await response.json();
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
        speakerName: transcription.speakerName
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
      translatedBatch = await translateBatchWithOpenAI(batchText, targetLanguage);
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
        // Update existing translation
        await storage.updateTranslation(existingTranslation.id, segment.translatedText);
        savedTranslations.push({
          ...existingTranslation,
          text: segment.translatedText
        });
      } else {
        // Create new translation
        const newTranslation = await storage.createTranslation({
          transcriptionId: segment.id,
          targetLanguage,
          text: segment.translatedText,
          confidence: 0.95, // High confidence for batch translations
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
  
  const prompt = `You are a professional translator specializing in Bengali to ${targetLangName} translation. 

Translate the following Bengali text segments to ${targetLangName}. Each segment is marked with SEGMENT_X: followed by the Bengali text.

IMPORTANT INSTRUCTIONS:
1. Maintain the exact same format with SEGMENT_X: markers
2. Translate only the text after the colon, keep the segment markers unchanged
3. Preserve the natural flow and context of the conversation
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