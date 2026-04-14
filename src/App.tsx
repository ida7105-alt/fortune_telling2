/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { motion, AnimatePresence } from 'motion/react';
import { Bell, RefreshCw, Share2, Wind, Leaf, Moon, Download, Coffee, Volume2, VolumeX, RotateCcw } from 'lucide-react';
import { toPng } from 'html-to-image';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GROUNDED_ACTIVITIES } from './constants';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Safely parse JSON from a string that might contain extra text or markdown blocks
 */
function safeJsonParse(text: string | undefined): any {
  if (!text) return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (innerE) {
        return null;
      }
    }
    return null;
  }
}

interface Fortune {
  poem: string;
  advice: string;
  lucky: string;
  type: string;
  theme: string;
  reminder: string;
  timestamp: number;
}

export default function App() {
  const [fortune, setFortune] = useState<Fortune | null>(null);
  const [loading, setLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = 0.2; // Set volume to 20%
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (audioRef.current) {
      if (isMuted) {
        audioRef.current.play().catch(e => console.log("Autoplay blocked", e));
      } else {
        audioRef.current.pause();
      }
      setIsMuted(prev => !prev);
    }
  }, [isMuted]);
  const [draws, setDraws] = useState(() => {
    const saved = localStorage.getItem('wabi_draw_limit');
    const today = new Date().toDateString();
    if (saved) {
      try {
        const { count, date } = JSON.parse(saved);
        if (date === today) {
          return { count, date };
        }
      } catch (e) {
        console.error("Failed to parse draws", e);
      }
    }
    return { count: 0, date: today };
  });

  const drawFortune = useCallback(async () => {
    if (draws.count >= 3) {
      setError("今日緣分已滿（限抽 3 次），請明日再試。");
      return;
    }

    const themes = ["四季更迭", "山川草木", "日常茶飯", "古寺鐘聲", "雨後初晴", "月光流影", "陶器裂紋", "枯山水", "苔蘚", "遠山", "晨霧", "晚霞", "落葉", "新芽", "溪水", "石階", "紙窗", "燭火", "墨跡", "茶煙"];
    setLoading(true);
    setError(null);
    try {
      const apiKey = (typeof process !== 'undefined' && process.env) 
        ? (process.env.GEMINI_API_KEY || process.env.API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY) 
        : (import.meta as any).env?.VITE_GEMINI_API_KEY;
      
      if (!apiKey) {
        throw new Error("系統尚未配置 API 金鑰");
      }
      
      const ai = new GoogleGenAI({ apiKey });
      const randomTheme = themes[Math.floor(Math.random() * themes.length)];

      // Determine fortune type based on probabilities:
      // 大吉: 30%, 中吉: 30%, 小吉: 30%, 末吉: 10%, 平: 0%
      const rand = Math.random();
      let selectedType = "小吉";
      if (rand < 0.3) selectedType = "大吉";
      else if (rand < 0.6) selectedType = "中吉";
      else if (rand < 0.9) selectedType = "小吉";
      else selectedType = "末吉";

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `請以此主題生成一份繁體中文侘寂風籤詩：${randomTheme}。
        這張籤的等級必須是：${selectedType}。
        請回傳 JSON 格式，包含：
        - poem: 四句詩，每句用 \\n 換行
        - advice: 一句溫暖建議
        - type: 必須回傳 "${selectedType}"
        - theme: 主題名稱`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              poem: { type: Type.STRING },
              advice: { type: Type.STRING },
              type: { type: Type.STRING },
              theme: { type: Type.STRING }
            },
            required: ["poem", "advice", "type", "theme"]
          }
        }
      });

      const result = safeJsonParse(response.text);
      
      if (!result || !result.poem) {
        throw new Error("籤詩感應不全，請再試一次");
      }

      // Force the selected type to ensure probabilities are strictly followed
      result.type = selectedType;

      const randomActivity = GROUNDED_ACTIVITIES[Math.floor(Math.random() * GROUNDED_ACTIVITIES.length)];
      
      const newFortune = { 
        ...result, 
        reminder: randomActivity.text, 
        timestamp: Date.now() 
      };
      
      setFortune(newFortune);
      
      // Update draws
      const newCount = draws.count + 1;
      const newDraws = { count: newCount, date: draws.date };
      setDraws(newDraws);
      localStorage.setItem('wabi_draw_limit', JSON.stringify(newDraws));

    } catch (err: any) {
      console.error("Failed to draw fortune:", err);
      setError(`緣分未到 (${err.message || "請稍後再試"})`);
    } finally {
      setLoading(false);
    }
  }, [draws]);

  const resetDraws = useCallback(() => {
    const today = new Date().toDateString();
    const newDraws = { count: 0, date: today };
    setDraws(newDraws);
    localStorage.setItem('wabi_draw_limit', JSON.stringify(newDraws));
    setError(null);
  }, []);

  const [shareLinkCopied, setShareLinkCopied] = useState(false);

  const downloadAsImage = async () => {
    if (cardRef.current === null) return;
    
    setIsDownloading(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        backgroundColor: '#F5F2ED', // wabi-bg color
        style: {
          borderRadius: '0',
        }
      });
      const link = document.createElement('a');
      link.download = `wabi-sabi-fortune-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to download image', err);
      setError("圖片下載失敗，請稍後再試。");
    } finally {
      setIsDownloading(false);
    }
  };

  // Check for shared fortune in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedData = params.get('f');
    if (sharedData) {
      try {
        // Decode from Base64 (using Unicode safe method)
        const jsonStr = decodeURIComponent(atob(sharedData).split('').map(c => {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        const decoded = JSON.parse(jsonStr);
        setFortune(decoded);
      } catch (e) {
        console.error("Failed to decode shared fortune", e);
      }
    }
  }, []);

  const generateShareLink = () => {
    if (fortune) {
      try {
        // Encode to Base64 (using Unicode safe method)
        const jsonStr = JSON.stringify(fortune);
        const base64 = btoa(encodeURIComponent(jsonStr).replace(/%([0-9A-F]{2})/g, (match, p1) => {
          return String.fromCharCode(parseInt(p1, 16));
        }));
        const url = `${window.location.origin}${window.location.pathname}?f=${base64}`;
        navigator.clipboard.writeText(url);
        setShareLinkCopied(true);
        setTimeout(() => setShareLinkCopied(false), 2000);
      } catch (e) {
        console.error("Failed to generate share link", e);
      }
    }
  };

  const reset = () => {
    setFortune(null);
    setError(null);
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-6 sm:p-12 selection:bg-wabi-accent/20 transition-colors duration-1000">
      {/* Background Grid is handled in index.css */}

      {/* Audio Element */}
      <audio
        ref={audioRef}
        src="https://assets.mixkit.co/active_storage/sfx/2431/2431-preview.mp3" // Light wind chime/nature sound
        loop
      />

      {/* Control Buttons */}
      <div className="fixed top-4 right-4 sm:top-6 sm:right-6 z-50 flex gap-3 pointer-events-none">
        <button 
          type="button"
          onClick={toggleMute}
          className="p-3 rounded-full bg-white/80 border border-black/5 hover:bg-white transition-all text-wabi-ink pointer-events-auto cursor-pointer shadow-sm"
          title={isMuted ? "開啟聲音" : "靜音"}
        >
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>

      <div className="fixed top-8 left-0 right-0 flex justify-center pointer-events-none z-40">
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-serif text-[14px] tracking-[0.5em] text-wabi-muted uppercase"
        >
          {new Date().toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, ' . ')}
        </motion.div>
      </div>

      <main className="relative z-10 w-full max-w-5xl flex flex-col items-center mt-24">
        <AnimatePresence mode="wait">
          {!fortune ? (
            <div className="w-full space-y-12">
              <div className="flex flex-col lg:flex-row gap-12 items-start">
                {/* Left Vertical Text */}
                <div className="hidden lg:flex flex-col items-center gap-6 pt-12">
                  <div className="w-10 h-10 rounded-full bg-wabi-stamp shadow-inner" />
                  <div className="writing-vertical font-serif text-3xl tracking-[0.5em] text-wabi-ink font-bold">
                    和敬清寂
                  </div>
                </div>

                {/* Main Hero Card */}
                <motion.div
                  key="landing"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="flex-1 wabi-card overflow-hidden flex flex-col md:flex-row min-h-[400px] sm:min-h-[450px]"
                >
                  <div className="flex-1 p-8 sm:p-16 flex flex-col justify-center space-y-6 sm:space-y-8">
                    <div className="space-y-4">
                      <span className="text-[10px] tracking-[0.4em] text-wabi-muted uppercase font-medium">
                        Japanese Traditional
                      </span>
                      <h1 className="font-serif text-3xl sm:text-5xl leading-tight text-wabi-ink">
                        感受四季流轉的<br />細膩與靜謐
                      </h1>
                      <p className="text-wabi-muted font-serif leading-relaxed text-xs sm:text-sm max-w-md whitespace-pre-line">
                        濁りなき　心の水に　すむ月は 波も砕けて　光とぞなる{"\n"}
                        問一個問題後，抽一張今日籤詩，問題即答案
                      </p>
                    </div>

                    <div className="pt-4">
                      <button
                        type="button"
                        onClick={() => drawFortune()}
                        disabled={loading || draws.count >= 3}
                        className={cn(
                          "wabi-button",
                          draws.count >= 3 && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <span className="relative z-10 flex items-center gap-3">
                          {loading ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <Bell className="w-4 h-4" />
                          )}
                          {loading ? "正在感應..." : draws.count >= 3 ? "今日緣分已滿" : "今日籤詩"}
                        </span>
                      </button>
                      <p className="mt-4 text-[9px] tracking-[0.2em] text-wabi-muted uppercase opacity-60">
                        每日限抽 3 次 · 今日剩餘 {Math.max(0, 3 - draws.count)} 次
                      </p>
                    </div>

                    {error && (
                      <p className="text-wabi-stamp text-xs font-light mt-4">{error}</p>
                    )}
                  </div>

                  {/* Right Image Area */}
                  <div className="w-full md:w-[40%] h-48 md:h-auto bg-[#EDEDED] relative flex items-center justify-center overflow-hidden">
                    <div className="absolute top-8 left-8 text-[10px] tracking-[0.2em] text-wabi-muted uppercase font-medium flex items-center gap-2">
                      <div className="w-4 h-px bg-wabi-muted/30" />
                      Zen Garden
                    </div>
                    <img 
                      src="https://picsum.photos/seed/zen/800/1200" 
                      alt="Zen Garden" 
                      className="w-full h-full object-cover opacity-40 grayscale"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute bottom-12 right-8 writing-vertical bg-white/90 px-2 py-6 text-[10px] tracking-[0.5em] text-wabi-muted border border-black/5">
                      枯山水
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Bottom Feature Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { char: "花", title: "花鳥風月", desc: "取法自然，將季節感融入設計細節之中。" },
                  { char: "侘", title: "侘寂之美", desc: "接受不完美，在樸素中發現歲月的痕跡。" },
                  { char: "間", title: "空間留白", desc: "以無勝有，讓視線與思緒得以自由舒展。" }
                ].map((item, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + idx * 0.1 }}
                    className="wabi-card p-6 sm:p-10 flex flex-col items-center text-center space-y-6"
                  >
                    <div className="w-16 h-16 rounded-full border border-wabi-accent flex items-center justify-center text-wabi-accent font-serif text-2xl">
                      {item.char}
                    </div>
                    <div className="space-y-2">
                      <h3 className="font-serif text-lg text-wabi-ink">{item.title}</h3>
                      <p className="text-xs text-wabi-muted leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ) : (
            <motion.div
              key={fortune.timestamp}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-3xl space-y-8"
            >
              <div ref={cardRef} className="wabi-card p-8 sm:p-20 relative overflow-hidden">
                {/* Decorative Elements */}
                <div className="absolute top-0 right-0 p-4 sm:p-8 opacity-5">
                  <Moon className="w-24 h-24 sm:w-32 sm:h-32" />
                </div>
                
                <div className="flex flex-col md:flex-row gap-10 md:gap-16 items-center md:items-start justify-between">
                  {/* Fortune Type & Theme */}
                  <div className="flex flex-row md:flex-col items-center gap-4 md:gap-6">
                    <div className="writing-vertical font-serif text-2xl sm:text-4xl border border-wabi-ink/10 px-2 md:px-3 py-4 md:py-8 rounded-sm bg-wabi-bg/30">
                      {fortune.type}
                    </div>
                    <div className="writing-vertical text-[9px] sm:text-[10px] tracking-[0.4em] sm:tracking-[0.6em] text-wabi-muted font-light uppercase">
                      {fortune.theme}
                    </div>
                    <div className="hidden md:block w-px h-16 bg-wabi-ink/5" />
                  </div>

                  {/* Poem Content */}
                  <div className="flex-1 text-center md:text-left space-y-8 md:space-y-12 relative">
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 1.2, delay: 0.2 }}
                      className="font-serif text-2xl sm:text-4xl leading-relaxed tracking-[0.15em] sm:tracking-[0.2em] whitespace-pre-line text-wabi-ink/90"
                    >
                      {fortune.poem}
                    </motion.div>
                    
                    <div className="space-y-6 md:space-y-8 pt-8 md:pt-12 border-t border-wabi-ink/5">
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 1.2, delay: 0.8 }}
                        className="space-y-2 md:space-y-3"
                      >
                        <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.3em] sm:tracking-[0.4em] text-wabi-muted font-semibold block">
                          禪師寄語
                        </span>
                        <p className="text-wabi-ink/80 font-serif italic text-lg sm:text-xl leading-relaxed">
                          「 {fortune.advice} 」
                        </p>
                      </motion.div>

                      <div className="flex flex-col p-6 bg-wabi-bg/50 rounded-sm border border-black/5 w-full">
                        <div className="flex items-center gap-2 mb-2">
                          <Coffee className="w-3 h-3 text-wabi-accent" />
                          <span className="text-[9px] uppercase tracking-widest text-wabi-muted font-bold">轉運小Tip</span>
                        </div>
                        <span className="text-sm text-wabi-ink/70 font-serif leading-relaxed">{fortune.reminder}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-6">
                <button
                  onClick={reset}
                  className="p-4 rounded-full bg-white border border-black/5 hover:bg-wabi-bg transition-all text-wabi-ink cursor-pointer shadow-sm"
                  title="重新求籤"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
                <button
                  onClick={generateShareLink}
                  className="p-4 rounded-full bg-white border border-black/5 hover:bg-wabi-bg transition-all text-wabi-ink relative cursor-pointer shadow-sm"
                  title="複製分享連結"
                >
                  <AnimatePresence>
                    {shareLinkCopied && (
                      <motion.span
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: -40 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 flex items-center justify-center text-[10px] whitespace-nowrap text-wabi-accent font-bold tracking-widest"
                      >
                        連結已複製
                      </motion.span>
                    )}
                  </AnimatePresence>
                  <Share2 className="w-5 h-5" />
                </button>
                <button
                  onClick={downloadAsImage}
                  disabled={isDownloading}
                  className="p-4 rounded-full bg-white border border-black/5 hover:bg-wabi-bg transition-all text-wabi-ink relative cursor-pointer shadow-sm"
                  title="下載為圖片"
                >
                  <AnimatePresence>
                    {isDownloading && (
                      <motion.span
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 flex items-center justify-center"
                      >
                        <RefreshCw className="w-4 h-4 animate-spin text-wabi-accent" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                  <Download className={cn("w-5 h-5", isDownloading && "opacity-0")} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="mt-auto pt-16 pb-12 flex flex-col items-center gap-4 relative z-10">
        <button
          onClick={resetDraws}
          className="text-[10px] tracking-[0.2em] text-wabi-muted uppercase hover:text-wabi-ink transition-all cursor-pointer border border-wabi-muted/20 px-4 py-1.5 rounded-full"
          title="重置今日次數"
        >
          Reset Daily Limit
        </button>
        <div className="text-wabi-muted text-[10px] tracking-[0.4em] uppercase opacity-40">
          Finding beauty in the imperfect
        </div>
      </footer>
    </div>
  );
}
