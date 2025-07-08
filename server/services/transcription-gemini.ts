import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Transcribe using Gemini 2.5 Pro
export async function transcribeWithGemini(audioPath: string): Promise<any> {
  console.log('[GEMINI] Starting Gemini transcription');
  
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is required for Gemini transcription');
  }
  
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  try {
    // Convert audio to a format Gemini can process
    const mp3Path = audioPath.replace('.wav', '.mp3');
    await execAsync(`ffmpeg -i "${audioPath}" -acodec mp3 -ab 128k "${mp3Path}" -y`);
    
    // Read audio file
    const audioBytes = fs.readFileSync(mp3Path);
    const base64Audio = audioBytes.toString('base64');
    
    // Prepare prompt for Bengali transcription
    const prompt = `Please transcribe this Bengali audio accurately. 
Return the transcription in the following JSON format:
{
  "text": "full transcription text",
  "segments": [
    {
      "text": "segment text",
      "start": start_time_in_seconds,
      "end": end_time_in_seconds
    }
  ]
}

Important:
- Transcribe in Bengali (বাংলা) language
- Be very accurate with the transcription
- If you can identify natural pauses or sentence breaks, use them to create segments
- If unable to segment, return the full text as a single segment`;

    const contents = [{
      role: "user",
      parts: [
        {
          inlineData: {
            data: base64Audio,
            mimeType: "audio/mp3",
          },
        },
        { text: prompt }
      ]
    }];

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: contents,
      config: {
        responseMimeType: "application/json",
      }
    });

    const result = JSON.parse(response.text || "{}");
    
    // Clean up temporary MP3 file
    fs.unlinkSync(mp3Path);
    
    console.log('[GEMINI] Transcription completed');
    console.log('[GEMINI] Text length:', result.text?.length || 0);
    
    // Add confidence scores
    if (result.segments) {
      result.segments = result.segments.map((seg: any) => ({
        ...seg,
        confidence: 0.85 // Gemini confidence estimate
      }));
    }
    
    return result;
  } catch (error) {
    console.error('[GEMINI] Transcription error:', error);
    throw error;
  }
}

// Combine results from multiple models for higher confidence
export function combineTranscriptionResults(openaiResult: any, geminiResult: any): any {
  console.log('[COMBINE] Combining transcription results from multiple models');
  
  // If only one result is available, use it
  if (!openaiResult && geminiResult) return geminiResult;
  if (openaiResult && !geminiResult) return openaiResult;
  if (!openaiResult && !geminiResult) throw new Error('No transcription results available');
  
  // For now, use a simple strategy: prefer OpenAI segments with Gemini as fallback
  // In the future, this could use more sophisticated alignment algorithms
  const combinedSegments = [];
  
  if (openaiResult.segments && openaiResult.segments.length > 0) {
    combinedSegments.push(...openaiResult.segments.map((seg: any) => ({
      ...seg,
      confidence: seg.confidence || 0.9,
      source: 'openai'
    })));
  } else if (geminiResult.segments && geminiResult.segments.length > 0) {
    combinedSegments.push(...geminiResult.segments.map((seg: any) => ({
      ...seg,
      confidence: seg.confidence || 0.85,
      source: 'gemini'
    })));
  }
  
  // Use the longer transcription as the full text (usually more complete)
  const fullText = (openaiResult.text?.length || 0) > (geminiResult.text?.length || 0) 
    ? openaiResult.text 
    : geminiResult.text;
  
  return {
    text: fullText,
    segments: combinedSegments,
    multiModel: true,
    models: ['openai', 'gemini']
  };
}