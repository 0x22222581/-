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
  newMessage: string,
  language: 'ru' | 'cs' = 'ru'
): Promise<AIResponse> {
  const parts: any[] = [];

  if (images && images.length > 0) {
    images.slice(0, 3).forEach((img) => {
      parts.push({
        inlineData: { data: img.base64Image, mimeType: img.mimeType },
      });
    });
  }

  let systemPrompt = `Ты — ИИ-Трейдер и Аналитик.
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

    if (language === 'cs') {
      systemPrompt = `Jste AI obchodník a analytik.
Vaším úkolem je přesně analyzovat grafy, předpovídat pohyb cen a pomáhat uživateli.
Pokud vám chybí data (např. graf je příliš oříznutý, cena není vidět přesně, nebo je nutný jiný časový rámec k potvrzení), řekněte to přímo uživateli ve své analýze.
Odpovídejte PŘÍSNĚ ve formátu JSON. Vyhněte se Markdown tagům.
Všechny texty ("analysis", "label", "timeFrame") poskytujte v češtině.

Struktura odpovědi:
{
  "analysis": "Vaše podrobná analýza v češtině. Pokud je graf špatný, požádejte o screenshot celé obrazovky. Pokud potřebujete změnit časový rámec, požádejte o to. Ujistěte se, že zmiňujete přesné ceny pro stop loss, vstup a take profit.",
  "zones": [
    {"label": "VSTUP (ENTRY)", "box": [ymin, xmin, ymax, xmax], "priceLevel": "60500.50", "timeFrame": "1-2 hodiny"},
    {"label": "VÝBĚR ZISKU (TAKE PROFIT)", "box": [ymin, xmin, ymax, xmax], "priceLevel": "62000.00", "timeFrame": "1-3 dny"},
    {"label": "STOP LOSS", "box": [ymin, xmin, ymax, xmax], "priceLevel": "59000.00", "timeFrame": "Zrušení scénáře"}
  ],
  "futurePath": [[x1, y1], [x2, y2], [x3, y3]],
  "direction": "UP",
  "confidence": 85
}
Důležité:
- Souřadnice 'box' MUSÍ být zadány v procentech od 0 do 100 [ymin_%, xmin_%, ymax_%, xmax_%].
- 'priceLevel' je konkrétní (nebo přibližná) cena, kterou v této zóně vidíte.
- 'timeFrame' je očekávaná doba k dosažení této ceny (např. "hned", "1-2 dny", "za pár hodin").
- 'direction' je očekávaný směr ("UP" - nahoru, "DOWN" - dolů, "NEUTRAL" - bokem).
- 'confidence' je jistota algoritmu v procentech od 1 do 100.
- 'futurePath' je pole bodů (x_%, y_%) pro nakreslení předpokládaného budoucího cenového vývoje zleva doprava.
- Pokud neexistují jasné zóny nebo cesta, vynechejte tato pole.`;
    }

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
  const cleanText = text.replace(/[*_#`~>]/g, "").trim();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: cleanText }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Puck' }, 
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      console.warn("No base64 audio returned from Gemini TTS");
      return null;
    }
    return pcmToWavUrl(base64Audio, 24000);
  } catch (err) {
    console.error("Audio generation failed:", err);
    return null; // The frontend needs to handle this and do fallback
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

