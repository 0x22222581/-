import { GoogleGenAI, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: "AIzaSyCl1LBBFaSJZKuBM5IQQ_8ElAcurhP_6a0" }); 

export interface AIResponse {
  analysis: string;
  zones?: { label: string; box: [number, number, number, number], priceLevel?: string, timeFrame?: string }[];
  futurePath?: [number, number][];
  direction?: 'UP' | 'DOWN' | 'NEUTRAL';
  confidence?: number;
}

export async function analyzeCryptoChart(
  images: { base64Image: string; mimeType: string }[],
  history: { role: "user" | "model"; text: string }[],
  newMessage: string
): Promise<AIResponse> {
  const parts: any[] = [];

  if (images && images.length > 0) {
    images.slice(0, 3).forEach((img) => {
      parts.push({
        inlineData: { data: img.base64Image, mimeType: img.mimeType },
      });
    });
  }

  const systemPrompt = `Ты — ИИ-Трейдер и Аналитик.
Твоя задача — точно анализировать графики, предсказывать движение цены и помогать пользователю.
Если тебе не хватает данных (например, график слишком обрезан, не видно цены справа, или нужен другой таймфрейм для подтверждения), прямо скажи об этом пользователю в анализе.
Отвечай СТРОГО в формате JSON. Пропускай Markdown теги.
Структура ответа:
{
  "analysis": "Твой детальный анализ. Если график плохой - скажи сделать скрин полного экрана. Если нужно сменить таймфрейм - попроси. Обязательно проговаривай точные цены для стоп лосса, входа и тейк профита.",
  "zones": [
    {"label": "ENTRY", "box": [ymin, xmin, ymax, xmax], "priceLevel": "60500.50", "timeFrame": "1-2 часа"},
    {"label": "TAKE PROFIT", "box": [ymin, xmin, ymax, xmax], "priceLevel": "62000.00", "timeFrame": "1-3 дня"},
    {"label": "STOP LOSS", "box": [ymin, xmin, ymax, xmax], "priceLevel": "59000.00", "timeFrame": "Отмена сценария"}
  ],
  "futurePath": [[x1, y1], [x2, y2], [x3, y3]],
  "direction": "UP",
  "confidence": 85
}
Важно:
- Координаты 'box' ОБЯЗАТЕЛЬНО указывай в процентах от 0 до 100 [ymin_%, xmin_%, ymax_%, xmax_%].
- 'priceLevel' - это конкретная цена (или примерная), которую ты видишь на графике для этой зоны.
- 'timeFrame' - примерный временной промежуток достижения или актуальности этой цены (например, "Текущий момент", "1-2 дня", "через пару часов").
- 'direction' - это предполагаемое движение ("UP" - вверх, "DOWN" - вниз, "NEUTRAL" - боковик).
- 'confidence' - коэффициент уверенности алгоритма в прогнозе от 1 до 100 (где 100 - максимальная вероятность, 1 - минимальная).
- 'futurePath' - массив точек (x_%, y_%) для отрисовки линии предполагаемого будущего движения цены. Первая точка должна начинаться примерно с текущей цены на графике, а дальше уходить вправо.
- Если нет четких зон или пути - не выводи эти массивы.`;

  parts.push({ text: `[SYSTEM: ${systemPrompt}]\n\nUser Message: ${newMessage || "Проанализируй график и подскажи точку входа."}` });

  const contents = history.map((h) => ({
    role: h.role,
    parts: [{ text: h.text }],
  }));

  contents.push({ role: "user", parts });

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents,
    config: {
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  });

  let text = response.text || "{}";
  text = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  
  try {
    return JSON.parse(text) as AIResponse;
  } catch (e) {
    console.error("JSON parse error", text);
    return { analysis: text };
  }
}

export async function generateSpeech(text: string): Promise<string | null> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Puck' }, 
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) return null;
    return pcmToWavUrl(base64Audio, 24000);
  } catch (err) {
    console.error("Audio generation failed:", err);
    return null;
  }
}

function pcmToWavUrl(base64Data: string, sampleRate: number): string {
  const binaryString = atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const numChannels = 1;
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;

  const wavBuffer = new ArrayBuffer(44 + bytes.length);
  const view = new DataView(wavBuffer);

  const writeString = (view: DataView, offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + bytes.length, true);
  writeString(view, 8, 'WAVE');

  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);

  writeString(view, 36, 'data');
  view.setUint32(40, bytes.length, true);

  const pcmData = new Uint8Array(wavBuffer, 44);
  pcmData.set(bytes);

  const blob = new Blob([wavBuffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

