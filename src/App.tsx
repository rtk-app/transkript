/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, ChangeEvent, useEffect, useRef, DragEvent, ErrorInfo, ReactNode } from 'react';
import { Upload, Download, Loader2, Languages, X, LogOut } from 'lucide-react';
import { transcribeAudio, translateText, TranscriptionSegment } from './services/transcriptionService';
import { auth, loginWithEmail, signupWithEmail, logout } from './firebase';
import { User } from 'firebase/auth';
import { ErrorBoundary } from 'react-error-boundary';

function ErrorFallback({ error, resetErrorBoundary }: { error: Error, resetErrorBoundary: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
        <h2 className="text-2xl font-bold text-red-600 mb-4">Ndodhi një gabim</h2>
        <p className="text-gray-600 mb-6">{error.message || "Diçka shkoi keq."}</p>
        <button 
          onClick={resetErrorBoundary}
          className="bg-[#003399] text-white px-6 py-2 rounded-full font-medium"
        >
          Rifresko faqen
        </button>
      </div>
    </div>
  );
}

interface Caption {
  start: number;
  end: number;
  text: string;
}

function parseSRT(srt: string): Caption[] {
  const captions: Caption[] = [];
  // Normalize newlines and split by double newline (with optional whitespace)
  const blocks = srt.trim().split(/\n\s*\n/);
  
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length >= 3) {
      // The second line should be the timestamp
      const timeLine = lines[1];
      if (timeLine && timeLine.includes(' --> ')) {
        const text = lines.slice(2).join('\n').trim();
        const [startStr, endStr] = timeLine.split(' --> ');
        
        const start = timeToSeconds(startStr);
        const end = timeToSeconds(endStr);
        
        if (!isNaN(start) && !isNaN(end)) {
          captions.push({ start, end, text });
        }
      }
    }
  }
  return captions;
}

function timeToSeconds(time: string): number {
  if (!time) return NaN;
  // Handle both 00:00:00,000 and 00:00:00.000
  const normalizedTime = time.trim().replace(',', '.');
  const parts = normalizedTime.split(':');
  if (parts.length !== 3) return NaN;
  
  const h = parseFloat(parts[0]);
  const m = parseFloat(parts[1]);
  const s = parseFloat(parts[2]);
  
  if (isNaN(h) || isNaN(m) || isNaN(s)) return NaN;
  
  return h * 3600 + m * 60 + s;
}

function LoginModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      if (isLogin) {
        await loginWithEmail(email, password);
      } else {
        if (!name.trim()) throw new Error("Ju lutemi shkruani emrin tuaj.");
        await signupWithEmail(email, password, name);
      }
      setEmail('');
      setPassword('');
      setName('');
      onClose();
    } catch (err: any) {
      console.error(isLogin ? "Login failed" : "Signup failed", err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError("Emaili ose fjalëkalimi është i pasaktë.");
      } else if (err.code === 'auth/email-already-in-use') {
        setError("Ky email është tashmë në përdorim.");
      } else if (err.code === 'auth/weak-password') {
        setError("Fjalëkalimi është shumë i dobët.");
      } else {
        setError(err.message || "Ndodhi një gabim. Ju lutemi provoni përsëri.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white p-8 rounded-3xl w-full max-w-md relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X className="w-6 h-6" />
        </button>
        <img src="https://upload.wikimedia.org/wikipedia/commons/a/a2/RTK_logo.svg" alt="RTK Logo" className="w-20 h-auto mx-auto mb-6" />
        <h2 className="text-2xl font-semibold text-center mb-6">{isLogin ? "Kyçu në sistem" : "Krijo llogari të re"}</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Emri i plotë</label>
              <input 
                id="name"
                name="name"
                type="text" 
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#003399] outline-none"
                placeholder="Emri juaj"
              />
            </div>
          )}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email adresa</label>
            <input 
              id="email"
              name="email"
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#003399] outline-none"
              placeholder="emri@shembull.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Fjalëkalimi</label>
            <input 
              id="password"
              name="password"
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#003399] outline-none"
              placeholder="••••••••"
            />
          </div>
          
          {error && <p className="text-red-600 text-sm">{error}</p>}
          
          <button 
            type="submit"
            disabled={isLoading}
            className="w-full bg-[#003399] text-white py-3 rounded-xl font-medium hover:bg-[#002266] transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isLogin ? "Kyçu" : "Regjistrohu")}
          </button>
        </form>
        
        <div className="mt-6 text-center">
          <button 
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
            }}
            className="text-sm text-gray-500 hover:text-[#003399]"
          >
            {isLogin ? "Nuk keni llogari? Regjistrohu" : "Keni llogari? Kyçu këtu"}
          </button>
        </div>
      </div>
    </div>
  );
}

function segmentsToSRT(segments: TranscriptionSegment[]): string {
  return segments.map((seg, i) => {
    const start = secondsToTime(seg.start);
    const end = secondsToTime(seg.end);
    return `${i + 1}\n${start} --> ${end}\n${seg.text}\n`;
  }).join('\n');
}

function secondsToTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

function encodeWAV(audioBuffer: AudioBuffer): ArrayBuffer {
  const channelData = audioBuffer.getChannelData(0);
  const buffer = new ArrayBuffer(44 + channelData.length * 2);
  const view = new DataView(buffer);
  
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + channelData.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, audioBuffer.sampleRate, true);
  view.setUint32(28, audioBuffer.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, channelData.length * 2, true);
  
  let offset = 44;
  for (let i = 0; i < channelData.length; i++) {
    const s = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }
  
  return buffer;
}

function AppContent() {
  const [transcription, setTranscription] = useState<string>('');
  const [segments, setSegments] = useState<TranscriptionSegment[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [translating, setTranslating] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [timer, setTimer] = useState<number>(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number; duration?: number } | null>(null);
  const [currentCaption, setCurrentCaption] = useState<string>('');
  const [targetLanguage, setTargetLanguage] = useState<string>('Gjuha');
  const [isLoginOpen, setIsLoginOpen] = useState<boolean>(false);
  const [user, setUser] = useState<User | null>(null);
  const isCancelled = useRef<boolean>(false);
  const timerInterval = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [selectedServer, setSelectedServer] = useState<string>('gemini-flash-latest');
  const servers = [
    { id: 'gemini-flash-latest', name: 'Server 01 (Optimized)' },
    { id: 'gemini-1.5-flash', name: 'Server 02 (Fast)' },
    { id: 'gemini-1.5-pro', name: 'Server 03 (Pro)' },
  ];

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const clearAll = () => {
    setTranscription('');
    setSegments([]);
    setVideoUrl(null);
    setFileInfo(null);
    setCurrentCaption('');
    setLoading(false);
    setProgress(0);
    setTimer(0);
    setStatusMessage('');
    isCancelled.current = true;
    if (timerInterval.current) clearInterval(timerInterval.current);
  };

  const processFile = async (file: File) => {
    setFileInfo({ name: file.name, size: file.size });
    setVideoUrl(URL.createObjectURL(file));
    setLoading(true);
    setProgress(0);
    setTimer(0);
    isCancelled.current = false;
    
    // Start timer
    timerInterval.current = setInterval(() => {
      setTimer(prev => prev + 1);
    }, 1000);

    try {
      setStatusMessage('Duke lexuar skedarin e videos...');
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const arrayBuffer = await file.arrayBuffer();
      
      setStatusMessage('Duke dekoduar audion (kjo mund të zgjasë)...');
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      const duration = audioBuffer.duration;
      const CHUNK_DURATION = 30; // 30 seconds per chunk
      const numChunks = Math.ceil(duration / CHUNK_DURATION);
      
      let allSegments: TranscriptionSegment[] = [];
      
      for (let i = 0; i < numChunks; i++) {
        if (isCancelled.current) break;
        
        const startTime = i * CHUNK_DURATION;
        const endTime = Math.min((i + 1) * CHUNK_DURATION, duration);
        const currentProgressBase = (i / numChunks) * 100;
        const chunkWeight = 100 / numChunks;
        
        setStatusMessage(`Përpunimi i pjesës ${i + 1} nga ${numChunks}...`);
        setProgress(Math.floor(currentProgressBase));

        // Create a chunk of the audio
        const targetSampleRate = 16000;
        const chunkLength = Math.ceil((endTime - startTime) * targetSampleRate);
        const offlineCtx = new OfflineAudioContext(1, chunkLength, targetSampleRate);
        
        const source = offlineCtx.createBufferSource();
        source.buffer = audioBuffer;
        
        source.connect(offlineCtx.destination);
        source.start(0, startTime, endTime - startTime);
        
        const renderedBuffer = await offlineCtx.startRendering();
        const wavBuffer = encodeWAV(renderedBuffer);
        const blob = new Blob([wavBuffer], { type: 'audio/wav' });
        
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            if (result) resolve(result.split(',')[1]);
            else reject(new Error('Dështoi kthimi në base64'));
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        // Retry logic for each chunk
        let retryCount = 0;
        const maxRetries = 3; // Increased to 3
        let chunkSegments: TranscriptionSegment[] = [];
        
        while (retryCount <= maxRetries) {
          try {
            chunkSegments = await transcribeAudio(base64, 'audio/wav', selectedServer);
            break;
          } catch (err: any) {
            if (err.message === 'NETWORK_ERROR' && retryCount < maxRetries) {
              retryCount++;
              setStatusMessage(`Ritentim për pjesën ${i + 1} (Tentativa ${retryCount})...`);
              await new Promise(r => setTimeout(r, 3000 * retryCount)); // Slightly longer wait
              continue;
            }
            throw err;
          }
        }
        
        const offsetSegments = chunkSegments.map(seg => ({
          ...seg,
          start: seg.start + startTime,
          end: seg.end + startTime
        }));
        
        allSegments = [...allSegments, ...offsetSegments];
        setProgress(Math.floor(currentProgressBase + chunkWeight));
      }

      if (timerInterval.current) clearInterval(timerInterval.current);
      
      if (isCancelled.current) return;
      setSegments(allSegments);
      setTranscription(segmentsToSRT(allSegments));
      setProgress(100);
      setStatusMessage('');
    } catch (error: any) {
      if (timerInterval.current) clearInterval(timerInterval.current);
      if (isCancelled.current) return;
      console.error('Transcription failed:', error);
      setStatusMessage('');
      
      if (error.message === 'QUOTA_EXCEEDED') {
        setTranscription('Kuota ditore është tejkaluar. Ju lutem provoni një server tjetër ose kthehuni nesër.');
      } else if (error.message === 'SERVER_OVERLOADED') {
        setTranscription('Serverët e Google janë të mbingarkuar. Provoni përsëri pas pak sekondash.');
      } else if (error.message === 'NETWORK_ERROR') {
        setTranscription('Gabim rrjeti. Video mund të jetë shumë e gjatë ose lidhja jo e qëndrueshme. Provoni një server tjetër.');
      } else {
        setTranscription(`Gabim: ${error.message || 'Dështoi transkriptimi'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTranslate = async () => {
    setTranslating(true);
    try {
      const langMap: { [key: string]: string } = {
        'Shqip': 'Albanian',
        'Anglisht': 'English',
        'Gjuha': 'Albanian' // Default to Albanian if Gjuha is selected
      };
      const result = await translateText(segments, langMap[targetLanguage] as 'Albanian' | 'English', selectedServer);
      setSegments(result);
      setTranscription(segmentsToSRT(result));
    } catch (error: any) {
      console.error('Translation failed:', error);
      if (error.message === 'SERVER_OVERLOADED') {
        alert('Serverët e Google janë aktualisht në kërkesë shumë të lartë. Ju lutemi provoni përsëri pak më vonë.');
      } else {
        alert('Gabim gjatë përkthimit. Ju lutemi provoni përsëri.');
      }
    } finally {
      setTranslating(false);
    }
  };

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!user) return;
    const file = event.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && videoRef.current) {
        e.preventDefault();
        if (videoRef.current.paused) videoRef.current.play();
        else videoRef.current.pause();
      }
      if (e.ctrlKey && e.key === 'Enter' && transcription && !loading && !translating) {
        handleTranslate();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [transcription, loading, translating]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const currentTime = video.currentTime;
      const caption = segments.find(c => currentTime >= c.start && currentTime <= c.end);
      setCurrentCaption(caption ? caption.text : '');
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [segments]);

  const exportSRT = () => {
    const blob = new Blob([transcription], { type: 'text/srt' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transkriptimi.srt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const stopGeneration = () => {
    isCancelled.current = true;
    setLoading(false);
    setProgress(0);
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 p-8 font-sans">
      <header className="mb-12 max-w-6xl mx-auto flex items-center justify-between border-b border-gray-100 pb-6">
        <div className="flex items-center gap-8">
          <img src="https://upload.wikimedia.org/wikipedia/commons/a/a2/RTK_logo.svg" alt="RTK Logo" className="w-20 h-auto object-contain" />
          <div className="flex flex-col justify-center">
            <h1 className="text-xl font-bold tracking-tight text-gray-900 leading-none mb-1">Transkriptuesi</h1>
            <p className="text-gray-400 text-xs font-medium">Transkriptoni videot tuaja me lehtësi dhe saktësi.</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <select 
            id="server-select"
            value={selectedServer} 
            onChange={(e) => setSelectedServer(e.target.value)}
            className="h-8 pl-3 pr-8 border border-gray-100 rounded-full bg-gray-50 cursor-pointer focus:ring-1 focus:ring-gray-200 outline-none text-[11px] font-medium appearance-none bg-no-repeat bg-[right_8px_center]"
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'currentColor\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\' /%3E%3C/svg%3E")', backgroundSize: '12px' }}
          >
            {servers.map(server => (
              <option key={server.id} value={server.id}>{server.name}</option>
            ))}
          </select>

          {user ? (
            <div className="flex items-center gap-6">
              <span className="text-xs font-medium text-gray-400">{user.displayName || user.email}</span>
              <button 
                onClick={logout}
                className="flex items-center gap-2 bg-gray-50 text-gray-600 px-4 py-1.5 rounded-full hover:bg-gray-100 transition-colors font-medium text-xs border border-gray-100"
              >
                <LogOut className="w-3.5 h-3.5" /> Dil
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setIsLoginOpen(true)}
              className="flex items-center gap-2 bg-[#003399] text-white px-6 py-2 rounded-full hover:bg-[#002266] transition-colors font-medium text-sm"
            >
              Kyçu
            </button>
          )}
        </div>
      </header>

      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />

      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div 
          className="bg-gray-50 p-8 rounded-3xl border border-gray-100"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-medium">Ngarko Videon</h2>
            <button 
              onClick={clearAll}
              className="text-red-600 hover:text-red-700 font-medium text-sm transition-colors"
            >
              Pastro gjithçka
            </button>
          </div>
          {!user ? (
            <div className="border-2 border-dashed border-gray-200 rounded-2xl p-16 text-center flex flex-col items-center gap-4">
              <div className="bg-gray-100 p-4 rounded-full">
                <Upload className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-600 font-medium">Ju duhet të kyçeni për të ngarkuar video.</p>
              <button 
                onClick={() => setIsLoginOpen(true)}
                className="bg-[#003399] text-white px-6 py-2 rounded-full hover:bg-[#002266] transition-colors font-medium text-sm mt-2"
              >
                Kyçu Tani
              </button>
            </div>
          ) : (
            <>
              {!videoUrl && !loading && (
                <label htmlFor="video-upload" className="block border-2 border-dashed border-gray-200 rounded-2xl p-16 text-center text-gray-400 cursor-pointer hover:border-gray-400 transition-colors">
                  <input 
                    id="video-upload"
                    name="video-upload"
                    type="file" 
                    accept="video/*" 
                    className="hidden" 
                    onChange={handleFileUpload} 
                  />
                  <div className="space-y-4">
                    <Upload className="w-12 h-12 mx-auto" />
                    <p>Tërhiqeni videon këtu ose klikoni për të zgjedhur</p>
                  </div>
                </label>
              )}
              {loading && (
                <div className="border-2 border-dashed border-blue-200 rounded-3xl p-12 text-center bg-blue-50/30 flex flex-col items-center gap-6 shadow-sm">
                  <div className="relative w-20 h-20">
                    <svg className="w-20 h-20 transform -rotate-90">
                      <circle
                        cx="40"
                        cy="40"
                        r="36"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="transparent"
                        className="text-gray-200"
                      />
                      <circle
                        cx="40"
                        cy="40"
                        r="36"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="transparent"
                        strokeDasharray={2 * Math.PI * 36}
                        strokeDashoffset={2 * Math.PI * 36 * (1 - progress / 100)}
                        className="text-[#003399] transition-all duration-500 ease-out"
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-lg font-bold text-[#003399] leading-none">{progress}%</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <p className="text-sm text-gray-700 font-bold uppercase tracking-widest">{statusMessage || 'Duke procesuar...'}</p>
                    
                    {fileInfo && fileInfo.size > 50 * 1024 * 1024 && (
                      <p className="text-[11px] text-red-600 font-bold max-w-xs mx-auto animate-pulse">
                        KUJDES: Kjo video është {(fileInfo.size / (1024 * 1024)).toFixed(1)}MB. 
                        Ju lutem kompresojeni videon pasi kjo harxhon kuotën tuaj ditore shpejt.
                      </p>
                    )}

                    <div className="flex items-center justify-center gap-4 text-xs font-medium text-gray-400">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                        Përpunimi: {timer}s
                      </div>
                      {fileInfo && (
                        <div>
                          Madhësia: {(fileInfo.size / (1024 * 1024)).toFixed(1)}MB
                        </div>
                      )}
                    </div>
                  </div>

                  <button 
                    onClick={stopGeneration}
                    className="mt-2 bg-white text-red-500 hover:bg-red-50 border border-red-100 px-6 py-2 rounded-full font-medium text-xs shadow-sm transition-all flex items-center gap-2"
                  >
                    <X className="w-3.5 h-3.5" /> Ndalo gjenerimin
                  </button>
                </div>
              )}
              {videoUrl && (
                <div className="mt-8 relative rounded-2xl overflow-hidden shadow-2xl max-w-sm mx-auto">
                  <video ref={videoRef} src={videoUrl} controls className="w-full" />
                  {currentCaption && (
                    <div className="absolute bottom-12 left-4 right-4 flex justify-center pointer-events-none">
                      <div className="bg-black/80 backdrop-blur-md px-6 py-3 rounded-2xl text-center border border-white/10 shadow-2xl max-w-full">
                        <p className="text-white text-base md:text-lg font-bold leading-snug line-clamp-2 overflow-hidden text-ellipsis">
                          {currentCaption}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="bg-gray-50 p-8 rounded-3xl border border-gray-100">
          <h2 className="text-xl font-medium mb-6">Transkriptimi</h2>
            <textarea
              id="transcription"
              name="transcription"
              className="w-full h-96 p-6 border-none rounded-2xl bg-white shadow-inner focus:ring-2 focus:ring-gray-200 resize-none text-gray-800"
              value={transcription}
              onChange={(e) => {
                setTranscription(e.target.value);
                // Note: manual typing won't sync segments easily, but we'll try to parse if it's valid SRT
                setSegments(parseSRT(e.target.value));
              }}
              placeholder="Transkriptimi do të shfaqet këtu..."
            />
          <div className="flex flex-wrap items-center gap-3 mt-6">
            <button 
              className="flex items-center justify-center gap-2 bg-[#003399] text-white px-6 h-9 rounded-full hover:bg-[#002266] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium whitespace-nowrap text-sm"
              onClick={exportSRT}
              disabled={!transcription || loading || translating}
            >
              <Download className="w-4 h-4" /> Eksporto si SRT
            </button>
            <div className="flex items-center gap-2">
              <select 
                id="target-language"
                name="target-language"
                value={targetLanguage} 
                onChange={(e) => setTargetLanguage(e.target.value)}
                className="h-9 px-4 border rounded-full bg-white cursor-pointer focus:ring-2 focus:ring-gray-200 outline-none text-sm"
              >
                <option value="Gjuha">Gjuha</option>
                <option value="Shqip">Shqip</option>
                <option value="Anglisht">Anglisht</option>
              </select>
              <button 
                className="flex items-center justify-center gap-2 bg-[#5A2FBA] text-white px-6 h-9 rounded-full hover:bg-[#4A2699] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium min-w-[110px] text-sm shadow-sm"
                onClick={handleTranslate}
                disabled={!transcription || loading || translating || targetLanguage === 'Gjuha'}
              >
                {translating ? (
                  <div className="flex flex-col items-center gap-0.5 w-full">
                    <div className="w-12 bg-white/30 rounded-full h-0.5">
                      <div className="bg-white h-0.5 rounded-full animate-pulse" style={{ width: '70%' }}></div>
                    </div>
                    <span className="text-[10px] leading-none">Përkthim...</span>
                  </div>
                ) : (
                  <>
                    <Languages className="w-4 h-4" /> Përkthe
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback} onReset={() => window.location.reload()}>
      <AppContent />
    </ErrorBoundary>
  );
}
