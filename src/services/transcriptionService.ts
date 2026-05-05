import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export async function transcribeAudio(audioData: string, mimeType: string, modelName: string = "gemini-flash-latest"): Promise<TranscriptionSegment[]> {
  try {
    const isGemini3 = modelName.includes('gemini-3');
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          {
            inlineData: {
              data: audioData,
              mimeType: mimeType,
            },
          },
          {
            text: "Transcribe the audio provided. Follow the system instructions strictly.",
          },
        ],
      },
      config: {
        systemInstruction: `You are an expert Albanian subtitle editor. 
        
CRITICAL RULES FOR ALBANIAN (SHQIP):
1. ALPHABET: Use only the correct Albanian alphabet. Ensure the letters 'ë' and 'ç' are used correctly (e.g., 'përshëndetje', 'çka', 'bëj', 'mirë', 'shumë', 'është'). Never omit the dots on 'ë' or 'ç'.
2. STANDARD ALBANIAN: Adhere strictly to the rules of Standard Albanian (Gjuha Standarde Shqipe). This includes correct grammar, verb endings, and word order. Avoid dialectal forms that depart from the standard in official transcription.
3. PHONETIC ALIGNMENT: Align 'start' and 'end' times precisely. Use the audio waveforms to guide you. Segments MUST NOT overlap. Gap between segments should be minimal (0.01s - 0.1s) unless there is actual silence. 
4. SEGMENTATION: Break segments at natural pauses, punctuation, or breathing points. Each segment should be 3-6 seconds long for readability.
5. NO PREDICTION: Transcribe ONLY audible words. If there is background music without speech, DO NOT generate text.
6. NO HALLUCINATION: If the audio has technical glitches or loops, skip those parts. NEVER guess text if it's unintelligible.
7. MAX 2 LINES: This is mandatory. Each segment must be short enough to fit in 2 lines (approx. 80 characters maximum).
8. ABSOLUTE ACCURACY: The 'start' timestamp MUST correspond exactly to the first audible syllable of the first word in the segment. The 'end' timestamp MUST correspond exactly to the end of the last audible syllable.

OUTPUT: Return a JSON array of segments.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              start: { type: Type.NUMBER, description: "Start time in seconds (float)" },
              end: { type: Type.NUMBER, description: "End time in seconds (float)" },
              text: { type: Type.STRING, description: "The transcribed text in Albanian" },
            },
            required: ["start", "end", "text"],
          },
        },
        temperature: 0,
        ...(isGemini3 ? { thinkingConfig: { thinkingLevel: "HIGH" as any } } : {}),
      }
    });

    if (!response.text) return [];
    
    let segments: TranscriptionSegment[] = JSON.parse(response.text);
    
    // Advanced filtering for hallucinations/repeats
    return segments.filter((seg, index, self) => {
      const text = seg.text.trim();
      if (!text || text.length < 2) return false;
      
      // Filter out common hallucinations or generic filler
      const lowerText = text.toLowerCase();
      if (lowerText.includes('subtitle by') || 
          lowerText.includes('transcribed by') ||
          lowerText.includes('thank you for watching') ||
          lowerText.includes('copyright owned')) return false;

      // Filter temporal anomalies
      if (seg.start >= seg.end) return false;
      
      // Filter duplicate segments (common in loops)
      if (index > 0 && text === self[index - 1].text && (seg.start - self[index - 1].end) < 0.8) {
        return false;
      }
      
      return true;
    });

  } catch (error: any) {
    if (error.message && (error.message.includes('429') || error.message.includes('quota'))) {
      throw new Error('QUOTA_EXCEEDED');
    }
    if (error.message && (error.message.includes('503') || error.message.includes('overloaded') || error.message.includes('high demand'))) {
      throw new Error('SERVER_OVERLOADED');
    }
    // Handle network fetch errors (Connection closed, timeout, etc)
    if (error instanceof TypeError && error.message.toLowerCase().includes('fetch')) {
      throw new Error('NETWORK_ERROR');
    }
    if (error.message && (error.message.includes('CONNECTION_CLOSED') || error.message.includes('Failed to fetch'))) {
      throw new Error('NETWORK_ERROR');
    }
    throw error;
  }
}

export async function translateText(segments: TranscriptionSegment[], targetLanguage: 'Albanian' | 'English', modelName: string = "gemini-flash-latest"): Promise<TranscriptionSegment[]> {
  const response = await ai.models.generateContent({
    model: modelName,
    contents: {
      parts: [
        {
          text: `Translate the following JSON transcription segments to ${targetLanguage}. 
Requirements:
1. Keep the 'start' and 'end' times exactly as they are.
2. Ensure the translation is natural and fits the timing.
3. ABSOLUTE MAX 2 LINES per segment.

Segments:
${JSON.stringify(segments)}`,
        },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            start: { type: Type.NUMBER },
            end: { type: Type.NUMBER },
            text: { type: Type.STRING },
          },
          required: ["start", "end", "text"],
        },
      },
    }
  });

  return JSON.parse(response.text || '[]');
}
