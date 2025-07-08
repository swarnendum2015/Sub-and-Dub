import { Request, Response } from "express";
import { transcribeVideo } from "../services/transcription";

export async function startTranscription(req: Request, res: Response) {
  try {
    const videoId = parseInt(req.params.id);
    const { selectedModels = ['openai', 'gemini'] } = req.body;
    
    console.log(`[TRANSCRIBE_API] Starting transcription for video ${videoId} with models: ${selectedModels}`);
    
    // Start transcription in background
    transcribeVideo(videoId, selectedModels).catch(error => {
      console.error(`[TRANSCRIBE_API] Background transcription failed for video ${videoId}:`, error);
    });
    
    res.json({ 
      message: "Transcription started", 
      videoId, 
      models: selectedModels,
      status: "processing"
    });
    
  } catch (error) {
    console.error("[TRANSCRIBE_API] Error starting transcription:", error);
    res.status(500).json({ 
      error: "Failed to start transcription", 
      details: error instanceof Error ? error.message : "Unknown error" 
    });
  }
}