// Opcjonalna narracja głosowa (Web Speech API). Napisy działają zawsze; głos tylko gdy jest pl-PL.

export function speak(text: string) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('pl'));
    if (!voice) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 1.02;
    synth.speak(u);
}

export function stopSpeaking() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
}
