import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { insertVideoSchema } from "@shared/schema";
import { transcribeVideo } from "./services/transcription";
import { translateText } from "./services/translation";
import { generateDubbing } from "./services/dubbing";

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

      const video = await storage.createVideo({
        filename: req.file.filename,
        originalName: req.file.originalname,
        filePath: req.file.path,
        fileSize: req.file.size,
        status: "uploaded",
      });

      // Start background processing
      processVideo(video.id);

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

  // Generate dubbing for a video
  app.post("/api/videos/:id/dubbing", async (req, res) => {
    try {
      const { language } = req.body;
      if (!language) {
        return res.status(400).json({ message: "Language is required" });
      }

      const dubbingJob = await storage.createDubbingJob({
        videoId: parseInt(req.params.id),
        language,
        status: "pending",
      });

      // Start background dubbing process
      generateDubbing(dubbingJob.id);

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

  const httpServer = createServer(app);
  return httpServer;
}

// Background processing function
async function processVideo(videoId: number) {
  try {
    await storage.updateVideoStatus(videoId, "processing");
    
    // Transcribe video
    const transcriptions = await transcribeVideo(videoId);
    
    // Generate translations for each transcription
    for (const transcription of transcriptions) {
      const languages = ["en", "hi", "ta", "te", "ml"]; // English, Hindi, Tamil, Telugu, Malayalam
      for (const lang of languages) {
        if (lang !== "bn") { // Skip Bengali as it's the original
          await translateText(transcription.id, lang);
        }
      }
    }
    
    await storage.updateVideoStatus(videoId, "completed");
  } catch (error) {
    console.error("Processing failed:", error);
    await storage.updateVideoStatus(videoId, "failed");
  }
}
