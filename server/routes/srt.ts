import { Request, Response } from "express";
import { storage } from "../storage";

// Generate SRT format from transcriptions
export async function generateSRT(req: Request, res: Response) {
  try {
    const videoId = parseInt(req.params.id);
    const { language } = req.query;
    
    const video = await storage.getVideo(videoId);
    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }
    
    const transcriptions = await storage.getTranscriptionsByVideoId(videoId);
    
    if (transcriptions.length === 0) {
      return res.status(404).json({ error: "No transcriptions found" });
    }
    
    let srtContent = "";
    let index = 1;
    
    for (const transcription of transcriptions) {
      let text = transcription.text;
      
      // If a specific language is requested, get translation
      if (language && language !== 'bn') {
        const translations = await storage.getTranslationsByTranscriptionId(transcription.id);
        const translation = translations.find(t => t.targetLanguage === language);
        if (translation) {
          text = translation.translatedText;
        }
      }
      
      // Format time to SRT format (HH:MM:SS,MMM)
      const startTime = formatSRTTime(transcription.startTime);
      const endTime = formatSRTTime(transcription.endTime);
      
      srtContent += `${index}\n`;
      srtContent += `${startTime} --> ${endTime}\n`;
      srtContent += `${text}\n\n`;
      
      index++;
    }
    
    // Set headers for file download
    const filename = `${video.originalName.replace(/\.[^/.]+$/, "")}_${language || 'bn'}.srt`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    res.send(srtContent);
  } catch (error) {
    console.error("Error generating SRT:", error);
    res.status(500).json({ error: "Failed to generate SRT file" });
  }
}

function formatSRTTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.round((seconds % 1) * 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
}