export type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};

/** Neither an unanswered permission prompt nor a stalled service can hold the form open. */
export function voiceSession(recognition: Recognition, callbacks: {
  state: (active: boolean, message: string) => void; text: (text: string) => void;
}, startupMs = 8000, maximumMs = 60000) {
  let ended = false;
  let timer: ReturnType<typeof setTimeout>;
  const detach = () => { recognition.onstart = null; recognition.onresult = null; recognition.onerror = null; recognition.onend = null; };
  const finish = (message: string, abort = true) => {
    if (ended) return;
    ended = true; clearTimeout(timer); detach();
    if (abort) { try { recognition.abort(); } catch { /* Already stopped. */ } }
    callbacks.state(false, message);
  };
  recognition.lang = "en-US"; recognition.continuous = false; recognition.interimResults = false;
  recognition.onstart = () => {
    if (ended) return;
    clearTimeout(timer);
    timer = setTimeout(() => finish("Dictation stopped. Your notes remain here."), maximumMs);
    callbacks.state(true, "Listening… You can keep typing or stop dictation.");
  };
  recognition.onresult = event => {
    if (ended) return;
    const text = Array.from(event.results).filter(result => result.isFinal).map(result => result[0].transcript).join(" ").trim();
    if (text) callbacks.text(text);
    finish(text ? "Dictation added. Check the wording before saving." : "No speech received. Type or use your keyboard’s microphone.");
  };
  recognition.onerror = () => finish("Dictation unavailable. Type or use your keyboard’s microphone. Your notes remain here.");
  recognition.onend = () => finish("Dictation stopped. Your notes remain here.", false);
  timer = setTimeout(() => finish("Microphone did not start. Type or use your keyboard’s microphone."), startupMs);
  callbacks.state(true, "Starting microphone… You can cancel and keep typing.");
  try { recognition.start(); } catch { finish("Microphone unavailable. Type or use your keyboard’s microphone."); }
  return { cancel: () => finish("Dictation stopped. Your notes remain here."), dispose: () => {
    if (ended) return;
    ended = true; clearTimeout(timer); detach();
    try { recognition.abort(); } catch { /* Already stopped. */ }
  } };
}
