interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
  description?: string;
  accent?: string;
  age?: string;
  gender?: string;
  use_case?: string;
  labels?: Record<string, string>;
}

interface LanguageVoices {
  [language: string]: ElevenLabsVoice[];
}

// Pre-curated language-specific voice recommendations
const LANGUAGE_VOICES: LanguageVoices = {
  'en': [
    { voice_id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', category: 'premade', gender: 'female', accent: 'american', age: 'young' },
    { voice_id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', category: 'premade', gender: 'female', accent: 'american', age: 'young' },
    { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', category: 'premade', gender: 'female', accent: 'american', age: 'young' },
    { voice_id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', category: 'premade', gender: 'male', accent: 'american', age: 'young' },
    { voice_id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', category: 'premade', gender: 'male', accent: 'american', age: 'middle' },
    { voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', category: 'premade', gender: 'male', accent: 'american', age: 'middle' },
    { voice_id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', category: 'premade', gender: 'male', accent: 'american', age: 'young' },
  ],
  'hi': [
    { voice_id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', category: 'premade', gender: 'female', accent: 'indian', age: 'young' },
    { voice_id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', category: 'premade', gender: 'male', accent: 'indian', age: 'middle' },
    { voice_id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', category: 'premade', gender: 'male', accent: 'indian', age: 'young' },
  ],
  'ta': [
    { voice_id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', category: 'premade', gender: 'female', accent: 'indian', age: 'young' },
    { voice_id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', category: 'premade', gender: 'male', accent: 'indian', age: 'middle' },
    { voice_id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', category: 'premade', gender: 'male', accent: 'indian', age: 'young' },
  ],
  'te': [
    { voice_id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', category: 'premade', gender: 'female', accent: 'indian', age: 'young' },
    { voice_id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', category: 'premade', gender: 'male', accent: 'indian', age: 'middle' },
    { voice_id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', category: 'premade', gender: 'male', accent: 'indian', age: 'young' },
  ],
  'ml': [
    { voice_id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', category: 'premade', gender: 'female', accent: 'indian', age: 'young' },
    { voice_id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', category: 'premade', gender: 'male', accent: 'indian', age: 'middle' },
    { voice_id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', category: 'premade', gender: 'male', accent: 'indian', age: 'young' },
  ]
};

export async function getVoicesForLanguage(language: string): Promise<ElevenLabsVoice[]> {
  // Return pre-curated voices for the language
  const voices = LANGUAGE_VOICES[language] || LANGUAGE_VOICES['en'];
  
  console.log(`[VOICES] Retrieved ${voices.length} voices for language: ${language}`);
  return voices;
}

export async function getAvailableVoices(): Promise<ElevenLabsVoice[]> {
  if (!process.env.ELEVENLABS_API_KEY) {
    console.warn("ElevenLabs API key not configured, using default voices");
    return LANGUAGE_VOICES['en'];
  }

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    const data = await response.json();
    return data.voices || [];
  } catch (error) {
    console.error('[VOICES] Failed to fetch ElevenLabs voices:', error);
    // Fallback to pre-curated voices
    return LANGUAGE_VOICES['en'];
  }
}

export function getVoiceRecommendations(language: string, speakerCount: number): ElevenLabsVoice[] {
  const availableVoices = LANGUAGE_VOICES[language] || LANGUAGE_VOICES['en'];
  
  // Return the first N voices based on speaker count
  // Alternate between male and female voices for variety
  const recommendations: ElevenLabsVoice[] = [];
  const maleVoices = availableVoices.filter(v => v.gender === 'male');
  const femaleVoices = availableVoices.filter(v => v.gender === 'female');
  
  for (let i = 0; i < speakerCount && i < availableVoices.length; i++) {
    if (i % 2 === 0 && femaleVoices.length > i / 2) {
      recommendations.push(femaleVoices[Math.floor(i / 2)]);
    } else if (maleVoices.length > Math.floor(i / 2)) {
      recommendations.push(maleVoices[Math.floor(i / 2)]);
    } else if (availableVoices[i]) {
      recommendations.push(availableVoices[i]);
    }
  }
  
  return recommendations;
}