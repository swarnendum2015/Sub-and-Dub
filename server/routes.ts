import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { insertVideoSchema } from "@shared/schema";
import { transcribeVideo } from "./services/transcription";
import { translateText, retranslateText } from "./services/translation-new";
import { generateDubbingSimple } from "./services/dubbing-simple";
import { generateSRT } from "./routes/srt";

const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.mp4', '.mov', '.avi', '.mkv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file format'));
    }
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Upload video
  app.post("/api/videos/upload", upload.single("video"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Parse selected models from request
      let selectedModels = ['openai', 'gemini']; // Default to both
      if (req.body.models) {
        try {
          selectedModels = JSON.parse(req.body.models);
        } catch (e) {
          console.log('Failed to parse models, using defaults');
        }
      }

      const video = await storage.createVideo({
        filename: req.file.filename,
        originalName: req.file.originalname,
        filePath: req.file.path,
        fileSize: req.file.size,
        status: "uploaded",
      });

      // Start background processing with selected models
      processVideoWithTimeout(video.id, selectedModels).catch(console.error);

      res.json(video);
    } catch (error) {
      res.status(500).json({ message: "Upload failed", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Get all videos
  app.get("/api/videos", async (req, res) => {
    try {
      const videos = await storage.getAllVideos();
      res.json(videos);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch videos", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Test endpoint for batch translation functionality
  app.post("/api/test-batch-translation", async (req: Request, res: Response) => {
    try {
      // Create a test video with confirmed Bengali transcriptions using actual video file
      const testVideo = await storage.createVideo({
        filename: "birangana-test.mov",
        originalName: "Birangana Test Video.mov",
        filePath: "attached_assets/Birangana Trailer Revised3_1751984055833.mov",
        fileSize: 32560929,
        status: "completed",
      });
      
      // Set Bengali as confirmed
      await storage.updateVideoBengaliConfirmed(testVideo.id, true);
      
      // Create sample Bengali transcriptions
      const sampleTranscriptions = [
        { videoId: testVideo.id, language: "bn", text: "এই একটি পরীক্ষা।", startTime: 0, endTime: 2, confidence: 0.9, isOriginal: true },
        { videoId: testVideo.id, language: "bn", text: "আমি বাংলায় কথা বলছি।", startTime: 2, endTime: 4, confidence: 0.9, isOriginal: true },
        { videoId: testVideo.id, language: "bn", text: "এটি অনুবাদ পরীক্ষার জন্য।", startTime: 4, endTime: 6, confidence: 0.9, isOriginal: true }
      ];
      
      for (const trans of sampleTranscriptions) {
        await storage.createTranscription(trans);
      }
      
      res.json({ 
        message: "Test video created successfully", 
        videoId: testVideo.id,
        status: "Ready for batch translation testing"
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Get single video
  app.get("/api/videos/:id", async (req, res) => {
    try {
      const video = await storage.getVideo(parseInt(req.params.id));
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }
      res.json(video);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch video", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Get video by ID
  app.get("/api/videos/:id", async (req, res) => {
    try {
      const video = await storage.getVideo(parseInt(req.params.id));
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }
      res.json(video);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch video", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Process video endpoint
  app.post("/api/videos/:id/process", async (req, res) => {
    try {
      const videoId = parseInt(req.params.id);
      const { models } = req.body;
      const video = await storage.getVideo(videoId);
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }

      // Start processing in the background with timeout and selected models
      processVideoWithTimeout(videoId, models).catch(console.error);
      
      res.json({ message: "Video processing started", videoId: videoId });
    } catch (error) {
      res.status(500).json({ message: "Failed to start video processing", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Serve video files
  app.get("/api/videos/:id/stream", async (req, res) => {
    try {
      const video = await storage.getVideo(parseInt(req.params.id));
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }

      if (!fs.existsSync(video.filePath)) {
        return res.status(404).json({ message: "Video file not found" });
      }

      const stat = fs.statSync(video.filePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(video.filePath, { start, end });
        const head = {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'video/mp4',
        };
        res.writeHead(206, head);
        file.pipe(res);
      } else {
        const head = {
          'Content-Length': fileSize,
          'Content-Type': 'video/mp4',
        };
        res.writeHead(200, head);
        fs.createReadStream(video.filePath).pipe(res);
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to stream video", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Get transcriptions for a video
  app.get("/api/videos/:id/transcriptions", async (req, res) => {
    try {
      const transcriptions = await storage.getTranscriptionsByVideoId(parseInt(req.params.id));
      res.json(transcriptions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch transcriptions", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Update transcription text
  app.patch("/api/transcriptions/:id", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ message: "Text is required" });
      }
      
      await storage.updateTranscription(parseInt(req.params.id), text);
      res.json({ message: "Transcription updated successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to update transcription", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Get translations for a transcription
  app.get("/api/transcriptions/:id/translations", async (req, res) => {
    try {
      const translations = await storage.getTranslationsByTranscriptionId(parseInt(req.params.id));
      res.json(translations);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch translations", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Update translation text
  app.patch("/api/translations/:id", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ message: "Text is required" });
      }
      
      await storage.updateTranslation(parseInt(req.params.id), text);
      res.json({ message: "Translation updated successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to update translation", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Generate dubbing for a video using ElevenLabs Dubbing Studio
  app.post("/api/videos/:id/dubbing", async (req, res) => {
    try {
      const { language, voiceId } = req.body;
      if (!language) {
        return res.status(400).json({ message: "Language is required" });
      }

      const dubbingJob = await storage.createDubbingJob({
        videoId: parseInt(req.params.id),
        language: language,
        voiceId: voiceId || undefined,
        status: "pending",
      });

      console.log(`[DUBBING] Starting ElevenLabs Dubbing Studio for job ${dubbingJob.id}`);

      // Start background dubbing process using ElevenLabs Dubbing Studio
      const { generateDubbingWithStudio } = await import('./services/dubbing-elevenlabs');
      generateDubbingWithStudio({ dubbingJobId: dubbingJob.id }).catch(console.error);

      res.json(dubbingJob);
    } catch (error) {
      res.status(500).json({ message: "Failed to start dubbing job", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Get dubbing jobs for a video
  app.get("/api/videos/:id/dubbing", async (req, res) => {
    try {
      const dubbingJobs = await storage.getDubbingJobsByVideoId(parseInt(req.params.id));
      res.json(dubbingJobs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch dubbing jobs", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });
  
  // Confirm Bengali transcription
  app.post("/api/videos/:id/confirm-transcription", async (req, res) => {
    try {
      const videoId = parseInt(req.params.id);
      const video = await storage.getVideo(videoId);
      
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }
      
      // Update video Bengali confirmation status
      await storage.updateVideoBengaliConfirmed(videoId, true);
      
      res.json({ message: "Bengali transcription confirmed successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to confirm transcription", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Unconfirm Bengali transcription
  app.post("/api/videos/:id/unconfirm-transcription", async (req, res) => {
    try {
      const videoId = parseInt(req.params.id);
      const video = await storage.getVideo(videoId);
      
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }
      
      // Update video Bengali confirmation status to false
      await storage.updateVideoBengaliConfirmed(videoId, false);
      
      res.json({ message: "Bengali transcription unconfirmed successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to unconfirm transcription", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Fix stuck jobs endpoint
  app.post("/api/admin/fix-stuck-jobs", async (req: Request, res: Response) => {
    try {
      const videos = await storage.getAllVideos();
      const stuckVideos = [];
      const currentTime = Date.now();
      const PROCESSING_TIMEOUT = 10 * 60 * 1000; // 10 minutes
      
      for (const video of videos) {
        if (video.status === 'processing') {
          const processingTime = currentTime - new Date(video.updatedAt).getTime();
          if (processingTime > PROCESSING_TIMEOUT) {
            await storage.updateVideoStatus(video.id, 'failed');
            stuckVideos.push(video.id);
          }
        }
      }
      
      res.json({ 
        message: `Fixed ${stuckVideos.length} stuck jobs`,
        videoIds: stuckVideos 
      });
    } catch (error) {
      console.error("Error fixing stuck jobs:", error);
      res.status(500).json({ error: "Failed to fix stuck jobs" });
    }
  });
  
  // Retry failed video
  app.post("/api/videos/:id/retry", async (req: Request, res: Response) => {
    const videoId = parseInt(req.params.id);
    
    try {
      const video = await storage.getVideo(videoId);
      if (!video) {
        return res.status(404).json({ error: "Video not found" });
      }
      
      if (video.status !== 'failed' && video.status !== 'processing') {
        return res.status(400).json({ error: "Video is not in a retriable state" });
      }
      
      // Reset status and restart processing
      await storage.updateVideoStatus(videoId, 'pending');
      processVideoWithTimeout(videoId).catch(console.error);
      
      res.json({ message: "Video processing restarted" });
    } catch (error) {
      console.error("Error retrying video:", error);
      res.status(500).json({ error: "Failed to retry video" });
    }
  });
  
  // Confirm Bengali transcription (no automatic translation)
  app.post("/api/videos/:id/confirm-transcription", async (req: Request, res: Response) => {
    const videoId = parseInt(req.params.id);
    
    try {
      const video = await storage.getVideo(videoId);
      if (!video) {
        return res.status(404).json({ error: "Video not found" });
      }
      
      // Update the database to mark Bengali as confirmed
      await storage.updateVideoBengaliConfirmed(videoId, true);
      console.log(`Bengali transcription confirmed for video ${videoId}`);
      
      res.json({ message: "Bengali transcription confirmed successfully", videoId });
    } catch (error) {
      console.error("Error confirming transcription:", error);
      res.status(500).json({ error: "Failed to confirm transcription" });
    }
  });
  
  // Translate video to specific language using batch processing
  app.post("/api/videos/:id/translate", async (req: Request, res: Response) => {
    const videoId = parseInt(req.params.id);
    const { targetLanguage } = req.body;
    
    if (!targetLanguage) {
      return res.status(400).json({ error: "Target language is required" });
    }
    
    try {
      console.log(`[TRANSLATE] Starting batch translation for video ${videoId} to ${targetLanguage}`);
      
      // Use the new batch translation service
      const { translateVideoBatch } = await import('./services/translation-batch');
      const translations = await translateVideoBatch({ videoId, targetLanguage });
      
      res.json({ 
        message: `Batch translation completed for ${translations.length} segments`,
        translations 
      });
      
    } catch (error) {
      console.error("Batch translation error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Translation failed" 
      });
    }
  });

  // Re-translate specific transcription
  app.post("/api/transcriptions/:id/retranslate", async (req, res) => {
    try {
      const transcriptionId = parseInt(req.params.id);
      const { targetLanguage } = req.body;
      
      console.log(`Re-translating transcription ${transcriptionId} to ${targetLanguage}`);
      
      await retranslateText(transcriptionId, targetLanguage);
      res.json({ message: "Re-translation completed successfully" });
    } catch (error) {
      console.error("Error in re-translation:", error);
      res.status(500).json({ message: "Re-translation failed", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Download dubbing audio
  app.get("/api/videos/:videoId/dubbing/:dubbingId/download", async (req, res) => {
    try {
      const dubbingJobs = await storage.getDubbingJobsByVideoId(parseInt(req.params.videoId));
      const dubbingJob = dubbingJobs.find(job => job.id === parseInt(req.params.dubbingId));
      
      if (!dubbingJob || !dubbingJob.audioPath) {
        return res.status(404).json({ error: "Dubbing not found" });
      }
      
      const audioPath = dubbingJob.audioPath;
      if (!fs.existsSync(audioPath)) {
        return res.status(404).json({ error: "Audio file not found" });
      }
      
      const filename = `${dubbingJob.language}_dubbing.mp3`;
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      fs.createReadStream(audioPath).pipe(res);
    } catch (error) {
      console.error("Error downloading dubbing:", error);
      res.status(500).json({ error: "Failed to download dubbing" });
    }
  });

  // Export SRT subtitles
  app.get("/api/videos/:id/srt", generateSRT);

  const httpServer = createServer(app);
  // S3 video upload endpoint
  app.post("/api/videos/upload-s3", async (req, res) => {
    try {
      const { s3Url, selectedModels } = req.body;
      
      if (!s3Url) {
        return res.status(400).json({ error: "S3 URL is required" });
      }
      
      // Validate S3 URL pattern
      const s3Pattern = /^https?:\/\/[^\/]+\.s3[^\/]*\.amazonaws\.com\/.*$|^https?:\/\/s3[^\/]*\.amazonaws\.com\/[^\/]+\/.*$/;
      if (!s3Pattern.test(s3Url)) {
        return res.status(400).json({ error: "Invalid S3 URL format" });
      }
      
      const video = await storage.createVideo({
        filename: s3Url.split('/').pop() || 'S3_Video',
        originalName: s3Url.split('/').pop() || 'S3_Video',
        filePath: s3Url,
        status: 'pending',
      });
      
      // Start processing the video with selected models
      processVideoWithTimeout(video.id, selectedModels).catch(console.error);
      
      res.json({ videoId: video.id, message: "S3 video processing started" });
    } catch (error) {
      console.error("Error processing S3 video:", error);
      res.status(500).json({ error: "Failed to process S3 video" });
    }
  });

  // YouTube video upload endpoint
  app.post("/api/videos/upload-youtube", async (req, res) => {
    try {
      const { youtubeUrl, selectedModels } = req.body;
      
      if (!youtubeUrl) {
        return res.status(400).json({ error: "YouTube URL is required" });
      }
      
      // Validate YouTube URL pattern
      const youtubePattern = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/;
      if (!youtubePattern.test(youtubeUrl)) {
        return res.status(400).json({ error: "Invalid YouTube URL format" });
      }
      
      // Extract video ID from URL
      const videoId = youtubeUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1];
      if (!videoId) {
        return res.status(400).json({ error: "Could not extract video ID from YouTube URL" });
      }
      
      const video = await storage.createVideo({
        filename: `youtube_${videoId}`,
        originalName: `YouTube: ${videoId}`,
        filePath: youtubeUrl,
        status: 'pending',
      });
      
      // Start processing the video with selected models
      processVideoWithTimeout(video.id, selectedModels).catch(console.error);
      
      res.json({ videoId: video.id, message: "YouTube video processing started" });
    } catch (error) {
      console.error("Error processing YouTube video:", error);
      res.status(500).json({ error: "Failed to process YouTube video" });
    }
  });

  return httpServer;
}

// Background processing function with timeout
async function processVideoWithTimeout(videoId: number, selectedModels?: string[]) {
  const PROCESSING_TIMEOUT = 10 * 60 * 1000; // 10 minutes
  
  const timeout = setTimeout(async () => {
    console.error(`Processing timeout for video ${videoId}`);
    await storage.updateVideoStatus(videoId, "failed");
  }, PROCESSING_TIMEOUT);
  
  try {
    await processVideo(videoId, selectedModels);
  } finally {
    clearTimeout(timeout);
  }
}

// Background processing function
async function processVideo(videoId: number, selectedModels?: string[]) {
  try {
    console.log(`[PROCESS] Starting video processing for ID: ${videoId}`);
    await storage.updateVideoStatus(videoId, "processing");
    
    // Transcribe video (Bengali only) with selected models
    console.log(`[PROCESS] Starting Bengali transcription for video ${videoId} with models:`, selectedModels);
    try {
      const transcriptions = await transcribeVideo(videoId, selectedModels);
      console.log(`[PROCESS] Bengali transcription completed. Found ${transcriptions?.length || 0} transcriptions for video ${videoId}`);
    } catch (transcribeError) {
      console.error(`[PROCESS] Transcription error for video ${videoId}:`, transcribeError);
      throw transcribeError;
    }
    
    // DO NOT generate translations automatically
    // Translations will only happen after user confirms Bengali transcription
    console.log(`[PROCESS] Video transcription completed. Waiting for user confirmation before translation.`);
    
    await storage.updateVideoStatus(videoId, "completed");
    console.log(`[PROCESS] Video processing completed for ID: ${videoId}`);
  } catch (error) {
    console.error(`[PROCESS] Processing failed for video ${videoId}:`, error);
    console.error(`[PROCESS] Error details:`, error instanceof Error ? error.stack : error);
    
    // Store error message for UI display
    let errorMessage = "Processing failed";
    if (error instanceof Error) {
      if (error.message.includes('QUOTA_EXCEEDED')) {
        errorMessage = "API quota exceeded. Please check your OpenAI billing.";
      } else {
        errorMessage = error.message;
      }
    }
    
    await storage.updateVideoStatus(videoId, "failed");
    // Store error in video metadata (we'll need to add this field)
  }
}
