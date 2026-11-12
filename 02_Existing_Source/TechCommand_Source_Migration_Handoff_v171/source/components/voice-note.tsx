"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { voiceSession, type Recognition } from "@/lib/voice-session";
export function VoiceNote({ onText, disabled = false }: { onText: (text: string) => void; disabled?: boolean }) {
  const session = useRef<ReturnType<typeof voiceSession> | null>(null);
  const callback = useRef(onText); callback.current = onText;
  const [listening, setListening] = useState(false), [message, setMessage] = useState("");
  useEffect(() => () => session.current?.dispose(), []);
  useEffect(() => { if (disabled) session.current?.cancel(); }, [disabled]);
  function start() {
    const api = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Constructor = api.SpeechRecognition || api.webkitSpeechRecognition;
    if (!Constructor) { setMessage("Use the microphone on your phone keyboard, or type your notes. This browser has no built-in dictation."); return; }
    session.current?.dispose();
    session.current = voiceSession(new Constructor(), { text: text => callback.current(text), state: (active, text) => { setListening(active); setMessage(text); } });
  }
  return <div className="my-2"><Button type="button" variant="outline" disabled={disabled} onClick={() => listening ? session.current?.cancel() : start()}>{listening ? "Stop dictation" : "Dictate notes"}</Button>{message && <p role="status" className="mt-1 text-xs text-slate-600">{message}</p>}</div>;
}
