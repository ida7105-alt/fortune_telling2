/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, RefreshCw, Share2, Wind, Leaf, Moon, Download, Coffee, Volume2, VolumeX, RotateCcw } from 'lucide-react';
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
      const apiKey = (typeof process !== 'undefined' && process.env) ? (process.env.GEMINI_API_KEY || process.env.API_KEY) : '';
      
      if (!apiKey) {
        throw new Error("系統尚未配置 API 金鑰");
      }
      
      const ai = new GoogleGenAI({ apiKey });
      const randomTheme = themes[Math.floor(Math.random() * themes.length)];

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `請以此主題生成一份繁體中文侘寂風籤詩：${randomTheme}。
        請回傳 JSON 格式，包含：
        - poem: 四句詩，每句用 \\n 換行
        - advice: 一句溫暖建議
        - type: 大吉/中吉/小吉/末吉/平
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
      
      if (!result || !result.poem || !result.type) {
        throw new Error("籤詩感應不全，請再試一次");
      }

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
    <div className="min-h-screen flex flex-col items-center justify-center p-6 sm:p-12 selection:bg-wabi-accent/20 transition-colors duration-1000" style={{ backgroundColor: '#0f1a1a' }}>
      {/* Background Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Water Base Gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0f1a1a] to-[#354b4b]" />
        
        {/* Shimmering Water Effect (Caustics) */}
        <div className="absolute inset-0 opacity-[0.3]">
          {[...Array(3)].map((_, i) => (
            <motion.div 
              key={i}
              animate={{ 
                x: [0, 30 * (i + 1), 0],
                y: [0, 20 * (i + 1), 0],
                scale: [1, 1.1, 1],
                opacity: [0.2, 0.5, 0.2]
              }}
              transition={{ 
                duration: 10 + i * 5, 
                repeat: Infinity, 
                ease: "easeInOut" 
              }}
              className="absolute inset-[-50%] opacity-40"
              style={{
                backgroundImage: `
                  radial-gradient(circle at 20% 30%, rgba(255, 255, 255, 0.4) 0%, transparent 1%),
                  radial-gradient(circle at 80% 10%, rgba(255, 255, 255, 0.3) 0%, transparent 1.5%),
                  radial-gradient(circle at 40% 70%, rgba(255, 255, 255, 0.4) 0%, transparent 1.2%),
                  radial-gradient(circle at 10% 90%, rgba(255, 255, 255, 0.3) 0%, transparent 1.8%),
                  radial-gradient(circle at 60% 40%, rgba(255, 255, 255, 0.4) 0%, transparent 1.3%),
                  radial-gradient(circle at 30% 60%, rgba(255, 255, 255, 0.3) 0%, transparent 1.1%),
                  radial-gradient(circle at 70% 80%, rgba(255, 255, 255, 0.4) 0%, transparent 1.4%),
                  radial-gradient(circle at 50% 20%, rgba(255, 255, 255, 0.3) 0%, transparent 1.6%)
                `,
                backgroundSize: '200px 200px',
                filter: 'blur(8px)',
                mixBlendMode: 'screen'
              }}
            />
          ))}
        </div>

        {/* Deep Water Ripples */}
        <div className="absolute inset-0 opacity-[0.2]">
          <motion.div 
            animate={{ 
              opacity: [0.1, 0.3, 0.1],
              scale: [1, 1.05, 1]
            }}
            transition={{ 
              duration: 8, 
              repeat: Infinity, 
              ease: "easeInOut" 
            }}
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(circle at 50% 50%, rgba(0, 255, 255, 0.05) 0%, transparent 70%)',
              mixBlendMode: 'overlay'
            }}
          />
        </div>
      </div>

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
          className="p-3 rounded-full bg-[#DCDCDC] border border-black/5 hover:opacity-90 transition-all text-[#333333] pointer-events-auto cursor-pointer"
          title={isMuted ? "開啟聲音" : "靜音"}
        >
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>

      <div className="fixed top-20 sm:top-8 left-0 right-0 flex justify-center pointer-events-none z-40">
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-serif text-[24px] tracking-[0.3em] text-white/80 drop-shadow-[0_2px_2px_rgba(0,0,0,0.3)]"
        >
          {new Date().toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, ' . ')}
        </motion.div>
      </div>

      <main className="relative z-10 w-full max-w-2xl flex flex-col items-center mt-32 sm:mt-16">
        <AnimatePresence mode="wait">
          {!fortune ? (
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="text-center space-y-12"
            >
              <div className="space-y-4">
                <motion.div
                  animate={{ rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                  className="inline-block p-4 rounded-full bg-[#DCDCDC] border border-black/5 mb-4"
                >
                  <Wind className="w-8 h-8 text-[#333333]" />
                </motion.div>
                <h1 className="font-serif text-4xl sm:text-5xl tracking-widest text-white">
                  日和籤詩
                </h1>
                <p className="text-white/60 font-serif tracking-[0.3em] text-[14px] uppercase opacity-80">
                  Wabi-Sabi Daily Wisdom
                </p>
              </div>

              <div className="w-px h-24 bg-gradient-to-b from-wabi-ink/20 to-transparent mx-auto" />

              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => drawFortune()}
                  disabled={loading || draws.count >= 3}
                  className={cn(
                    "wabi-button group relative overflow-hidden",
                    draws.count >= 3 && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <span className="relative z-10 flex items-center gap-2">
                    {loading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {loading ? "正在感應..." : draws.count >= 3 ? "今日緣分已滿" : "求取今日籤詩"}
                  </span>
                </button>
                <p className="text-[10px] tracking-[0.2em] text-wabi-muted uppercase opacity-60">
                  每日限抽 3 次 · 今日剩餘 {Math.max(0, 3 - draws.count)} 次
                </p>
              </div>

              {error && (
                <p className="text-red-800/60 text-sm font-light mt-4">{error}</p>
              )}
            </motion.div>
          ) : (
            <motion.div
              key={fortune.timestamp}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full space-y-8"
            >
              <div ref={cardRef} className="wabi-card p-8 sm:p-16 relative overflow-hidden">
                {/* Decorative Elements */}
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <Moon className="w-24 h-24" />
                </div>
                
                <div className="flex flex-col md:flex-row gap-12 items-center md:items-start justify-between">
                  {/* Fortune Type & Theme */}
                  <div className="flex flex-col items-center gap-4">
                    <div className="writing-vertical font-serif text-3xl border-2 border-wabi-ink/20 px-2 py-4 rounded-sm">
                      {fortune.type}
                    </div>
                    <div className="writing-vertical text-[10px] tracking-[0.5em] text-wabi-muted font-light uppercase">
                      {fortune.theme}
                    </div>
                    <div className="w-px h-12 bg-wabi-ink/10" />
                  </div>

                  {/* Poem Content */}
                  <div className="flex-1 text-center md:text-left space-y-8 relative">
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 1, delay: 0.2 }}
                      className="font-serif text-2xl sm:text-3xl leading-relaxed tracking-[0.15em] whitespace-pre-line text-wabi-ink/90"
                    >
                      {fortune.poem}
                    </motion.div>
                    
                    <div className="space-y-6 pt-8 border-t border-wabi-ink/5">
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 1, delay: 0.6 }}
                        className="space-y-2"
                      >
                        <span className="text-[10px] uppercase tracking-[0.3em] text-wabi-muted font-semibold block">
                          禪師寄語
                        </span>
                        <p className="text-wabi-ink/70 font-light italic text-lg">
                          「 {fortune.advice} 」
                        </p>
                      </motion.div>

                      <div className="flex flex-col p-4 bg-wabi-muted/5 rounded-lg border border-wabi-muted/10 w-full">
                        <div className="flex items-center gap-2 mb-1">
                          <Coffee className="w-3 h-3 text-wabi-muted" />
                          <span className="text-[9px] uppercase tracking-wider text-wabi-muted">轉運小Tip</span>
                        </div>
                        <span className="text-sm text-wabi-ink/70 font-medium">{fortune.reminder}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={reset}
                  className="p-3 rounded-full bg-[#DCDCDC] border border-black/5 hover:opacity-90 transition-all text-[#333333] cursor-pointer"
                  title="重新求籤"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
                <button
                  onClick={generateShareLink}
                  className="p-3 rounded-full bg-[#DCDCDC] border border-black/5 hover:opacity-90 transition-all text-[#333333] relative cursor-pointer"
                  title="複製分享連結"
                >
                  <AnimatePresence>
                    {shareLinkCopied && (
                      <motion.span
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: -30 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 flex items-center justify-center text-[10px] whitespace-nowrap text-wabi-accent font-medium"
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
                  className="p-3 rounded-full bg-[#DCDCDC] border border-black/5 hover:opacity-90 transition-all text-[#333333] relative cursor-pointer"
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
          className="text-[10px] tracking-[0.2em] text-[#b8b8b8] uppercase hover:text-[#ececec] hover:border-[#ececec] transition-all cursor-pointer border border-[#b8b8b8] px-4 py-1.5 rounded-full"
          title="重置今日次數"
        >
          Reset Daily Limit
        </button>
        <div className="text-wabi-muted text-[10px] tracking-[0.4em] uppercase opacity-20">
          Finding beauty in the imperfect
        </div>
      </footer>
    </div>
  );
}
