import { pgTable, text, serial, integer, boolean, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const videos = pgTable("videos", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  filePath: text("file_path").notNull(),
  fileSize: integer("file_size").notNull(),
  duration: real("duration"),
  status: text("status").notNull().default("uploaded"), // uploaded, processing, completed, failed
  createdAt: timestamp("created_at").defaultNow(),
});

export const transcriptions = pgTable("transcriptions", {
  id: serial("id").primaryKey(),
  videoId: integer("video_id").references(() => videos.id),
  language: text("language").notNull(),
  text: text("text").notNull(),
  startTime: real("start_time").notNull(),
  endTime: real("end_time").notNull(),
  confidence: real("confidence"),
  isOriginal: boolean("is_original").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const translations = pgTable("translations", {
  id: serial("id").primaryKey(),
  transcriptionId: integer("transcription_id").references(() => transcriptions.id),
  targetLanguage: text("target_language").notNull(),
  translatedText: text("translated_text").notNull(),
  confidence: real("confidence"),
  model: text("model").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const dubbingJobs = pgTable("dubbing_jobs", {
  id: serial("id").primaryKey(),
  videoId: integer("video_id").references(() => videos.id),
  language: text("language").notNull(),
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  audioPath: text("audio_path"),
  jobId: text("job_id"), // ElevenLabs job ID
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertVideoSchema = createInsertSchema(videos).omit({
  id: true,
  createdAt: true,
});

export const insertTranscriptionSchema = createInsertSchema(transcriptions).omit({
  id: true,
  createdAt: true,
});

export const insertTranslationSchema = createInsertSchema(translations).omit({
  id: true,
  createdAt: true,
});

export const insertDubbingJobSchema = createInsertSchema(dubbingJobs).omit({
  id: true,
  createdAt: true,
});

export type Video = typeof videos.$inferSelect;
export type InsertVideo = z.infer<typeof insertVideoSchema>;
export type Transcription = typeof transcriptions.$inferSelect;
export type InsertTranscription = z.infer<typeof insertTranscriptionSchema>;
export type Translation = typeof translations.$inferSelect;
export type InsertTranslation = z.infer<typeof insertTranslationSchema>;
export type DubbingJob = typeof dubbingJobs.$inferSelect;
export type InsertDubbingJob = z.infer<typeof insertDubbingJobSchema>;
