// Studio-grade subtitling standards based on Netflix and international guidelines
// Implementation of Hollywood film industry standards for transcription and translation

export interface SubtitleStandards {
  minDuration: number;     // Minimum duration in seconds (5/6 second = 0.833)
  maxDuration: number;     // Maximum duration in seconds (7 seconds)
  maxCharactersPerLine: number;  // Maximum 47 characters per line
  maxLines: number;        // Maximum 2 lines per subtitle
  minGapBetweenSubtitles: number; // Minimum gap in seconds (2 frames = 0.083)
  maxReadingSpeed: number; // Maximum words per minute (250 for adults, 180 for youth)
  frameRate: number;       // Standard frame rate (24fps)
}

export const NETFLIX_STANDARDS: SubtitleStandards = {
  minDuration: 5/6,        // 5/6 second minimum (20 frames at 24fps)
  maxDuration: 7,          // 7 seconds maximum
  maxCharactersPerLine: 47, // Netflix standard
  maxLines: 2,             // Maximum 2 lines
  minGapBetweenSubtitles: 2/24, // 2 frames gap at 24fps
  maxReadingSpeed: 250,    // Words per minute for adults
  frameRate: 24            // Standard cinema frame rate
};

export const YOUTH_STANDARDS: SubtitleStandards = {
  ...NETFLIX_STANDARDS,
  maxReadingSpeed: 180     // Slower reading speed for youth content
};

export interface SubtitleValidationResult {
  isValid: boolean;
  violations: string[];
  recommendations: string[];
  qualityScore: number;    // 0-100 score based on standards compliance
}

export interface EnhancedTranscriptionSegment {
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
  model: string;
  speakerId?: string;
  speakerName?: string;
  characterCount: number;
  lineCount: number;
  readingSpeed: number;     // Words per minute
  isCompliant: boolean;
  qualityScore: number;
  violations: string[];
  recommendations: string[];
}

/**
 * Calculate reading speed in words per minute
 */
export function calculateReadingSpeed(text: string, duration: number): number {
  const wordCount = text.trim().split(/\s+/).length;
  const durationInMinutes = duration / 60;
  return Math.round(wordCount / durationInMinutes);
}

/**
 * Calculate character count per line
 */
export function calculateLineBreaking(text: string): { lines: string[], maxLineLength: number } {
  // Intelligent line breaking based on natural speech patterns
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    
    if (testLine.length <= NETFLIX_STANDARDS.maxCharactersPerLine) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        // Word itself is too long, split it
        lines.push(word.substring(0, NETFLIX_STANDARDS.maxCharactersPerLine));
        currentLine = word.substring(NETFLIX_STANDARDS.maxCharactersPerLine);
      }
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  const maxLineLength = Math.max(...lines.map(line => line.length));
  return { lines: lines.slice(0, NETFLIX_STANDARDS.maxLines), maxLineLength };
}

/**
 * Validate subtitle segment against international standards
 */
export function validateSubtitleSegment(
  text: string, 
  startTime: number, 
  endTime: number,
  isYouthContent: boolean = false
): SubtitleValidationResult {
  const standards = isYouthContent ? YOUTH_STANDARDS : NETFLIX_STANDARDS;
  const duration = endTime - startTime;
  const { lines, maxLineLength } = calculateLineBreaking(text);
  const readingSpeed = calculateReadingSpeed(text, duration);
  
  const violations: string[] = [];
  const recommendations: string[] = [];
  let qualityScore = 100;

  // Duration validation
  if (duration < standards.minDuration) {
    violations.push(`Duration too short: ${duration.toFixed(2)}s (min: ${standards.minDuration.toFixed(2)}s)`);
    qualityScore -= 15;
  }
  
  if (duration > standards.maxDuration) {
    violations.push(`Duration too long: ${duration.toFixed(2)}s (max: ${standards.maxDuration}s)`);
    qualityScore -= 10;
  }

  // Character count validation
  if (maxLineLength > standards.maxCharactersPerLine) {
    violations.push(`Line too long: ${maxLineLength} chars (max: ${standards.maxCharactersPerLine})`);
    qualityScore -= 20;
  }

  // Line count validation
  if (lines.length > standards.maxLines) {
    violations.push(`Too many lines: ${lines.length} (max: ${standards.maxLines})`);
    qualityScore -= 25;
  }

  // Reading speed validation
  if (readingSpeed > standards.maxReadingSpeed) {
    violations.push(`Reading speed too fast: ${readingSpeed} WPM (max: ${standards.maxReadingSpeed})`);
    qualityScore -= 15;
  }

  // Recommendations for improvement
  if (readingSpeed > standards.maxReadingSpeed * 0.9) {
    recommendations.push('Consider simplifying language for better readability');
  }
  
  if (maxLineLength > standards.maxCharactersPerLine * 0.9) {
    recommendations.push('Consider breaking into shorter segments');
  }

  if (duration < standards.minDuration * 1.2) {
    recommendations.push('Consider extending display time for better readability');
  }

  // Quality bonuses
  if (readingSpeed >= 150 && readingSpeed <= 200) {
    qualityScore += 5; // Optimal reading speed
  }
  
  if (lines.length === 1 && maxLineLength <= 40) {
    qualityScore += 3; // Single line preference
  }

  qualityScore = Math.max(0, Math.min(100, qualityScore));

  return {
    isValid: violations.length === 0,
    violations,
    recommendations,
    qualityScore
  };
}

/**
 * Enhance transcription with studio-grade analysis
 */
export function enhanceTranscriptionWithStandards(
  text: string,
  startTime: number,
  endTime: number,
  confidence: number,
  model: string,
  speakerId?: string,
  speakerName?: string,
  isYouthContent: boolean = false
): EnhancedTranscriptionSegment {
  const { lines, maxLineLength } = calculateLineBreaking(text);
  const duration = endTime - startTime;
  const readingSpeed = calculateReadingSpeed(text, duration);
  const validation = validateSubtitleSegment(text, startTime, endTime, isYouthContent);

  return {
    text,
    startTime,
    endTime,
    confidence,
    model,
    speakerId,
    speakerName,
    characterCount: maxLineLength,
    lineCount: lines.length,
    readingSpeed,
    isCompliant: validation.isValid,
    qualityScore: validation.qualityScore,
    violations: validation.violations,
    recommendations: validation.recommendations
  };
}

/**
 * Calculate overall confidence score based on multiple factors
 */
export function calculateEnhancedConfidence(
  rawConfidence: number,
  model: string,
  qualityScore: number,
  textLength: number,
  duration: number
): number {
  let enhancedConfidence = rawConfidence;

  // Model reliability adjustments
  const modelReliability = {
    'openai-whisper': 1.0,
    'google-speech': 0.95,
    'elevenlabs-stt': 0.90,
    'gemini-2.5-pro': 0.85
  };
  
  const reliability = modelReliability[model] || 0.8;
  enhancedConfidence *= reliability;

  // Quality score impact (studio standards compliance)
  const qualityFactor = qualityScore / 100;
  enhancedConfidence = (enhancedConfidence * 0.7) + (qualityFactor * 0.3);

  // Duration appropriateness
  if (duration >= NETFLIX_STANDARDS.minDuration && duration <= NETFLIX_STANDARDS.maxDuration) {
    enhancedConfidence += 0.05;
  }

  // Text length appropriateness
  if (textLength >= 10 && textLength <= NETFLIX_STANDARDS.maxCharactersPerLine) {
    enhancedConfidence += 0.03;
  }

  // Penalize very short segments
  if (textLength < 5) {
    enhancedConfidence -= 0.1;
  }

  return Math.max(0, Math.min(1, enhancedConfidence));
}

/**
 * Generate model attribution badge
 */
export function getModelAttribution(model: string): { name: string, badge: string, color: string } {
  const attributions = {
    'openai-whisper': {
      name: 'OpenAI Whisper',
      badge: 'OpenAI',
      color: 'bg-green-100 text-green-700'
    },
    'google-speech': {
      name: 'Google Speech-to-Text',
      badge: 'Google',
      color: 'bg-blue-100 text-blue-700'
    },
    'elevenlabs-stt': {
      name: 'ElevenLabs Speech',
      badge: 'ElevenLabs',
      color: 'bg-purple-100 text-purple-700'
    },
    'gemini-2.5-pro': {
      name: 'Google Gemini 2.5 Pro',
      badge: 'Gemini',
      color: 'bg-amber-100 text-amber-700'
    }
  };

  return attributions[model] || {
    name: 'Unknown Model',
    badge: 'Unknown',
    color: 'bg-gray-100 text-gray-700'
  };
}

/**
 * Split long segments to comply with studio standards
 */
export function splitLongSegment(
  text: string,
  startTime: number,
  endTime: number,
  maxDuration: number = NETFLIX_STANDARDS.maxDuration
): Array<{ text: string, startTime: number, endTime: number }> {
  const totalDuration = endTime - startTime;
  
  if (totalDuration <= maxDuration) {
    return [{ text, startTime, endTime }];
  }

  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length <= 1) {
    // Single sentence, split by clauses or words
    const words = text.trim().split(/\s+/);
    const wordsPerSegment = Math.ceil(words.length / Math.ceil(totalDuration / maxDuration));
    
    const segments = [];
    for (let i = 0; i < words.length; i += wordsPerSegment) {
      const segmentWords = words.slice(i, i + wordsPerSegment);
      const segmentDuration = (totalDuration * segmentWords.length) / words.length;
      const segmentStart = startTime + (totalDuration * i) / words.length;
      const segmentEnd = segmentStart + segmentDuration;
      
      segments.push({
        text: segmentWords.join(' '),
        startTime: segmentStart,
        endTime: segmentEnd
      });
    }
    return segments;
  }

  // Split by sentences
  const segments = [];
  const durationPerSentence = totalDuration / sentences.length;
  
  for (let i = 0; i < sentences.length; i++) {
    const segmentStart = startTime + (i * durationPerSentence);
    const segmentEnd = segmentStart + durationPerSentence;
    
    segments.push({
      text: sentences[i].trim(),
      startTime: segmentStart,
      endTime: Math.min(segmentEnd, endTime)
    });
  }

  return segments;
}