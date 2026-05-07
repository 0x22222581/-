import React, { useState, useRef, useEffect } from "react";
import { Upload, Activity, AlertCircle, Play, Pause, ChevronRight, Trash2, Send, Volume2, ImagePlus } from "lucide-react";
import { BotRenderer, BotState } from "./components/BotRenderer";
import { analyzeCryptoChart, generateSpeech, AIResponse } from "./services/geminiService";

interface ImageItem {
  file: File;
  preview: string;
  base64: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  zones?: AIResponse['zones'];
  futurePath?: AIResponse['futurePath'];
  direction?: AIResponse['direction'];
  confidence?: AIResponse['confidence'];
}

// Simple Live Ticker component
function CryptoTicker() {
  const [prices, setPrices] = useState<{ [key: string]: string }>({ BTCUSDT: "...", ETHUSDT: "..." });

  useEffect(() => {
    const ws = new WebSocket("wss://stream.binance.com:9443/ws/btcusdt@ticker/ethusdt@ticker");
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setPrices(prev => ({ ...prev, [data.s]: parseFloat(data.c).toFixed(2) }));
    };
    return () => ws.close();
  }, []);

  return (
    <div className="flex items-center gap-4 text-xs font-mono">
      <div className="flex items-center gap-1">
        <span className="text-[#888]">BTC/USDT</span>
        <span className={prices.BTCUSDT !== "..." ? "text-[#00FF41]" : "text-[#555]"}>{prices.BTCUSDT}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[#888]">ETH/USDT</span>
        <span className={prices.ETHUSDT !== "..." ? "text-[#00FF41]" : "text-[#555]"}>{prices.ETHUSDT}</span>
      </div>
    </div>
  );
}

export default function App() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [botState, setBotState] = useState<BotState>("idle");
  const [error, setError] = useState<string | null>(null);
  
  // Audio state
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const processFiles = async (files: File[]) => {
    const toProcess = files.slice(0, 3 - images.length);
    if (toProcess.length === 0) return;

    const newImages = await Promise.all(toProcess.map(async (f) => {
      return new Promise<ImageItem>((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            const b64 = event.target.result.toString().split(",")[1];
            resolve({ file: f, preview: URL.createObjectURL(f), base64: b64 });
          }
        };
        reader.readAsDataURL(f);
      });
    }));

    const updatedImages = [...images, ...newImages].slice(0, 3);
    setImages(updatedImages);
    setError(null);
    executeAnalysis(false, updatedImages);
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const newFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) newFiles.push(file);
        }
      }

      if (newFiles.length > 0) {
        processFiles(newFiles);
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [images]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(Array.from(e.target.files));
    }
    if (e.target) e.target.value = ''; // reset input
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const executeAnalysis = async (isFollowUp: boolean, targetImages: ImageItem[] = images) => {
    if (!isFollowUp && targetImages.length === 0) return;
    const textToSend = isFollowUp ? inputText.trim() : (chatHistory.length > 0 ? "Изображение обновлено, сфокусируйся на новом графике." : "Проанализируй график и покажи точки входа/выхода.");
    if (isFollowUp && !textToSend) return;

    try {
      const newUserMsg: ChatMessage = { id: Date.now().toString(), role: "user", text: textToSend };
      setChatHistory(prev => [...prev, newUserMsg]);
      if (isFollowUp) setInputText("");
      
      setBotState("thinking");
      setError(null);

      // Stop audio if it was playing
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        setIsPlaying(false);
      } else {
        audioRef.current = new Audio();
      }

      const historyForApi = chatHistory.map(m => ({ role: m.role, text: m.text }));
      
      const payloadImages = targetImages.map(img => ({ base64Image: img.base64, mimeType: img.file.type }));

      const response = await analyzeCryptoChart(payloadImages, historyForApi, textToSend);

      let finalAnalysis = response.analysis;

      const newModelMsg: ChatMessage = { 
        id: Date.now().toString() + "_bot", 
        role: "model", 
        text: finalAnalysis, 
        zones: response.zones,
        futurePath: response.futurePath,
        direction: response.direction,
        confidence: response.confidence
      };
      
      setChatHistory(prev => [...prev, newModelMsg]);

      // Start TTS
      setBotState("speaking");
      const audioDataUrl = await generateSpeech(finalAnalysis);
      
      if (audioDataUrl) {
        audioRef.current!.src = audioDataUrl;
        audioRef.current!.volume = volume;
        audioRef.current!.onended = () => {
          setBotState("idle");
          setIsPlaying(false);
        };
        audioRef.current!.onplay = () => setIsPlaying(true);
        audioRef.current!.onerror = () => {
          console.error("Audio playback error");
          setBotState("idle");
        };
        try {
          await audioRef.current!.play();
        } catch (e) {
          console.error("Autoplay prevented:", e);
          setIsPlaying(false);
          setBotState("idle");
        }
      } else {
        setBotState("idle");
      }

    } catch (err) {
      console.error(err);
      setError("Ошибка соединения с API. Проверьте сеть или API ключ.");
      setBotState("idle");
    }
  };

  const toggleAudio = () => {
    if (audioRef.current && audioRef.current.src) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
        setBotState("idle");
      } else {
        audioRef.current.play().catch(e => console.error("Play failed", e));
        setIsPlaying(true);
        setBotState("speaking");
      }
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (audioRef.current) {
      audioRef.current.volume = v;
    }
  };

  // Extract the latest predicted zones and path from chat history
  const latestZonesMsg = [...chatHistory].reverse().find(m => (m.zones && m.zones.length > 0) || (m.futurePath && m.futurePath.length > 0) || m.direction || m.confidence);
  const zonesToDraw = latestZonesMsg?.zones || null;
  const pathToDraw = latestZonesMsg?.futurePath || null;
  const directionStr = latestZonesMsg?.direction || null;
  const confidenceScore = latestZonesMsg?.confidence || null;

  const entryZone = zonesToDraw?.find(z => z.label.toUpperCase().includes("ENTRY"));
  const tpZone = zonesToDraw?.find(z => z.label.toUpperCase().includes("TAKE"));
  const slZone = zonesToDraw?.find(z => z.label.toUpperCase().includes("STOP"));

  return (
    <div className="min-h-screen bg-[#050505] text-[#e0e0e0] font-sans selection:bg-[#00FF41]/30 flex flex-col">
      <main className="max-w-[1400px] w-full mx-auto px-4 py-6 md:py-10 flex flex-col lg:flex-row gap-8 lg:gap-12 flex-1">
        
        {/* Left Column - Input & Diagram */}
        <div className="w-full lg:w-1/2 flex flex-col gap-6">
          <header className="border-b border-[#222] pb-6">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-3 h-3 bg-[#00FF41] rounded-full animate-pulse"></div>
                  <span className="text-xs font-mono tracking-widest text-[#888] uppercase">ИИ-Аналитик v2.0 // Active</span>
                </div>
                <h1 className="text-3xl md:text-4xl font-black text-white tracking-tighter uppercase mt-2">
                  Crypto Entry AI
                </h1>
              </div>
              <CryptoTicker />
            </div>
          </header>

          {/* Image Upload Area */}
          {images.length > 0 ? (
            <div className="flex flex-col gap-3">
              {/* Main Canvas Area */}
              <div className="relative w-full aspect-video bg-[#111] border border-[#222] rounded-xl overflow-hidden group">
                <img src={images[0].preview} className="w-full h-full object-contain" alt="Main Chart" />
                
                {/* Future Path Overlay */}
                {pathToDraw && pathToDraw.length > 1 && (
                  <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" style={{ filter: 'drop-shadow(0 0 8px #00FF41)' }}>
                    <polyline
                      points={pathToDraw.map(p => `${p[0]}%,${p[1]}%`).join(' ')}
                      fill="none"
                      stroke="#00FF41"
                      strokeWidth="3"
                      strokeDasharray="8 4"
                      className="animate-[dash_1s_linear_infinite]"
                    />
                    {pathToDraw.map((p, i) => (
                       <circle key={i} cx={`${p[0]}%`} cy={`${p[1]}%`} r="4" fill="#00FF41" />
                    ))}
                  </svg>
                )}

                <button onClick={() => removeImage(0)} className="absolute top-3 right-3 bg-red-900/80 text-white p-2 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600">
                  <Trash2 className="w-4 h-4"/>
                </button>
                <div className="absolute top-3 left-3 bg-black/60 text-white text-[10px] font-mono px-2 py-1 rounded">Главный холст (Анализ)</div>
              </div>

              {/* Thumbnails row */}
              <div className="flex gap-3">
                {images.slice(1).map((img, i) => (
                  <div key={i + 1} className="relative w-24 h-24 bg-[#111] border border-[#222] rounded-lg overflow-hidden group">
                    <img src={img.preview} className="w-full h-full object-cover opacity-60" alt={`Thumb ${i+1}`} />
                    <button onClick={() => removeImage(i + 1)} className="absolute top-1 right-1 bg-red-900/80 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-red-600">
                      <Trash2 className="w-3 h-3"/>
                    </button>
                  </div>
                ))}
                {images.length < 3 && (
                  <label className="w-24 h-24 border-2 border-[#222] border-dashed rounded-lg bg-[#050505] flex flex-col items-center justify-center cursor-pointer hover:border-[#00FF41] hover:text-[#00FF41] transition-colors text-[#555]">
                    <ImagePlus className="w-5 h-5 mb-1" />
                    <span className="text-[9px] font-mono uppercase tracking-widest text-center mt-1">Добавить<br/>(Ctrl+V)</span>
                    <input type="file" multiple className="hidden" accept="image/*" onChange={handleFileChange} />
                  </label>
                )}
              </div>

              {/* HUD / Indicators */}
              {(directionStr || entryZone || tpZone || slZone || confidenceScore) && (
                <div className="flex flex-col md:flex-row gap-4 mt-2">
                  {(directionStr || confidenceScore) && (
                    <div className="flex-[1.5] bg-[#111] border border-[#222] rounded-xl p-4 flex flex-col relative overflow-hidden">
                      <div className={`absolute inset-0 opacity-10 ${directionStr === 'UP' ? 'bg-[#00FF41]' : directionStr === 'DOWN' ? 'bg-red-500' : 'bg-gray-500'}`} />
                      
                      <div className="flex justify-between items-start z-10 w-full mb-2">
                        <span className="text-[10px] font-mono uppercase tracking-widest text-[#888]">{directionStr ? "Прогноз" : "Анализ"}</span>
                        {confidenceScore && (
                           <div className="flex items-center gap-1">
                             <span className="text-[10px] font-mono uppercase tracking-widest text-[#888]">Уверенность</span>
                             <span className={`text-xs font-black ${confidenceScore >= 80 ? 'text-[#00FF41]' : confidenceScore >= 50 ? 'text-yellow-500' : 'text-red-500'}`}>{confidenceScore}%</span>
                           </div>
                        )}
                      </div>

                      <div className="flex items-end justify-between z-10 w-full mt-auto">
                        <span className={`text-2xl font-black uppercase tracking-widest leading-none ${directionStr === 'UP' ? 'text-[#00FF41]' : directionStr === 'DOWN' ? 'text-red-500' : 'text-[#e0e0e0]'}`}>
                          {directionStr || "Анализ..."}
                        </span>
                        
                        {confidenceScore && (
                           <div className="w-1/2 h-1.5 bg-[#222] rounded-full overflow-hidden mb-1 flex-shrink-0 ml-4">
                             <div className={`h-full ${confidenceScore >= 80 ? 'bg-[#00FF41]' : confidenceScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${confidenceScore}%` }} />
                           </div>
                        )}
                      </div>
                    </div>
                  )}
                  {tpZone && (
                     <div className="flex-1 bg-[#050505] border border-[#1a1a1a] rounded-xl p-4 flex flex-col items-center justify-center">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-blue-500 mb-1">Take Profit</span>
                        <span className="text-xl font-mono text-[#e0e0e0]">{tpZone.priceLevel || "..."}</span>
                        {tpZone.timeFrame && <span className="text-[9px] font-mono text-[#555] uppercase tracking-widest mt-1 text-center">{tpZone.timeFrame}</span>}
                     </div>
                  )}
                  {entryZone && (
                     <div className="flex-1 bg-[#050505] border border-[#1a1a1a] rounded-xl p-4 flex flex-col items-center justify-center shadow-[0_0_20px_rgba(0,255,65,0.1)]">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#00FF41] mb-1">Entry Point</span>
                        <span className="text-xl font-mono text-white">{entryZone.priceLevel || "..."}</span>
                        {entryZone.timeFrame && <span className="text-[9px] font-mono text-[#555] uppercase tracking-widest mt-1 text-center">{entryZone.timeFrame}</span>}
                     </div>
                  )}
                  {slZone && (
                     <div className="flex-1 bg-[#050505] border border-[#1a1a1a] rounded-xl p-4 flex flex-col items-center justify-center">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-red-500 mb-1">Stop Loss</span>
                        <span className="text-xl font-mono text-[#e0e0e0]">{slZone.priceLevel || "..."}</span>
                        {slZone.timeFrame && <span className="text-[9px] font-mono text-[#555] uppercase tracking-widest mt-1 text-center">{slZone.timeFrame}</span>}
                     </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <label className="relative flex flex-col items-center justify-center w-full h-80 border-2 border-[#1a1a1a] border-dashed rounded-xl cursor-pointer bg-[#111] hover:bg-[#1a1a1a] transition-colors group overflow-hidden">
              <Upload className="w-10 h-10 mb-4 text-[#444] group-hover:text-[#00FF41] transition-colors" />
              <p className="mb-2 text-sm text-[white] font-bold uppercase tracking-widest text-center px-4">
                Загрузить Изображения<br/><span className="text-[10px] text-[#888] font-mono lowercase">(или Ctrl+V, макс 3)</span>
              </p>
              <p className="text-[11px] font-mono text-[#444] uppercase tracking-[0.3em] mt-2">PNG, JPG, WEBP</p>
              <input type="file" multiple className="hidden" accept="image/*" onChange={handleFileChange} />
            </label>
          )}

          {error && (
            <div className="p-4 bg-[#111] border border-red-900 rounded-xl text-red-500 flex items-start gap-3 text-xs font-mono uppercase">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {/* Initial Analysis Button if haven't started chatting */}
          {images.length > 0 && chatHistory.length === 0 && botState === "idle" && (
             <button
               onClick={() => executeAnalysis(false)}
               className="w-full py-5 px-10 bg-white hover:bg-[#00FF41] text-black rounded-xl font-bold text-lg tracking-wide transition-colors flex items-center justify-center gap-2 uppercase mt-2 shadow-[0_0_20px_rgba(0,255,65,0.1)] hover:shadow-[0_0_30px_rgba(0,255,65,0.4)]"
             >
               <span className="flex items-center gap-2 tracking-[0.2em]">Начать Анализ <ChevronRight className="w-5 h-5" /></span>
             </button>
          )}
        </div>

        {/* Right Column - Bot & Chat */}
        <div className="w-full lg:w-1/2 flex flex-col bg-[#0a0a0a] border border-[#222] rounded-2xl overflow-hidden h-full max-h-[85vh]">
          {/* Header & Bot status */}
          <div className="p-4 border-b border-[#222] flex justify-between items-center bg-[#111]">
            <div className="flex items-center gap-4">
              <BotRenderer state={botState} className="w-16 h-16 transform scale-50 -my-4 origin-left drop-shadow-[0_0_15px_rgba(0,255,65,0.4)]" />
              <div className="flex flex-col">
                <span className="text-[10px] font-mono text-[#00FF41] uppercase tracking-widest">{botState === "idle" ? "РЕЖИМ ОЖИДАНИЯ" : botState === "thinking" ? "ВЫЧИСЛЕНИЯ..." : "ВЕЩАНИЕ"}</span>
                <span className="text-xs font-bold text-white uppercase tracking-wider">AI ТРЕЙДЕР PRO</span>
              </div>
            </div>
            
            {/* Audio Controls */}
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-3">
                 <div className="flex items-center bg-[#050505] border border-[#222] px-2 py-1 rounded gap-2 group">
                   <Volume2 className="w-3 h-3 text-[#555] group-hover:text-[#00FF41] transition-colors" />
                   <input type="range" min="0" max="1" step="0.05" value={volume} onChange={handleVolumeChange}
                          title="Громкость"
                          className="w-16 accent-[#00FF41] cursor-pointer h-1 bg-[#222] rounded-full appearance-none outline-none" />
                 </div>
                 {chatHistory.length > 0 && (
                   <button onClick={toggleAudio} disabled={!audioRef.current?.src}
                     className="px-3 py-1.5 border border-[#333] bg-[#050505] hover:bg-[#1a1a1a] disabled:opacity-50 disabled:cursor-not-allowed rounded text-[#e0e0e0] transition-colors flex items-center justify-center"
                     title={isPlaying ? "Пауза" : "Воспроизвести анализ"}
                   >
                     {isPlaying ? <Pause className="w-3 h-3 text-[#00FF41]" /> : <Play className="w-3 h-3 text-[#00FF41]" />}
                   </button>
                 )}
              </div>
            </div>
          </div>

          {/* Chat History */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 flex flex-col">
            {chatHistory.length === 0 ? (
              <div className="m-auto text-center">
                <p className="text-[11px] font-mono text-[#444] uppercase tracking-[0.3em]">История анализа пуста</p>
                <p className="text-[10px] font-mono text-[#333] mt-2">Загрузите скриншоты для старта алгоритма</p>
              </div>
            ) : (
              chatHistory.map((msg) => (
                <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[85%] p-4 rounded-xl text-[13px] font-mono leading-relaxed whitespace-pre-wrap shadow-xl 
                                 ${msg.role === 'user' 
                                   ? 'bg-[#1a1a1a] border border-[#333] text-[#e0e0e0] rounded-br-sm' 
                                   : 'bg-[#050505] border border-[#00FF41]/30 text-[#00FF41] rounded-bl-sm shadow-[0_0_15px_rgba(0,255,65,0.05)]'}`}>
                    {msg.text}
                  </div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input */}
          {images.length > 0 && (
             <div className="p-4 bg-[#111] border-t border-[#222]">
                <div className="relative flex items-center">
                   <input
                     type="text"
                     value={inputText}
                     onChange={e => setInputText(e.target.value)}
                     onKeyDown={e => e.key === "Enter" && executeAnalysis(true)}
                     placeholder="Уточните детали или задайте вопрос алгоритму..."
                     className="w-full bg-[#050505] border border-[#333] rounded-lg py-3 pl-4 pr-12 text-sm font-mono text-white placeholder-[#555] outline-none focus:border-[#00FF41] transition-colors"
                   />
                   <button
                     onClick={() => executeAnalysis(true)}
                     disabled={!inputText.trim() || botState === "thinking"}
                     className="absolute right-2 p-2 bg-[#1a1a1a] hover:bg-[#00FF41] hover:text-black disabled:hover:bg-[#1a1a1a] disabled:hover:text-[#555] text-[#888] rounded-md transition-colors"
                   >
                     {botState === "thinking" ? <Activity className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                   </button>
                </div>
                <div className="mt-2 text-right">
                   <span className="text-[9px] font-mono text-[#444] uppercase tracking-widest">REAL-TIME SYNC</span>
                </div>
             </div>
          )}
        </div>

      </main>
    </div>
  );
}
