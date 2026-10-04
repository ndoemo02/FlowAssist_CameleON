'use client';

import { useAiUi } from '../store';

// Przycisk i suwak 360° wydzielone z HomePage (identyczny wygląd). Tylko panel suwaka subskrybuje
// kąt kamery — dzięki temu tween kamery nie re-renderuje strony.
export default function OrbitSlider() {
    const open = useAiUi((s) => s.ui.orbitPanel);
    const toggle = useAiUi((s) => s.toggleOrbitPanel);

    return (
        <>
            {/* 360° VIEW TOGGLE */}
            <div className="fixed top-4 right-4 z-[9999]">
                <button
                    onClick={toggle}
                    className="bg-black/60 backdrop-blur-md px-3 py-2 rounded-full text-xs hover:bg-black/80 transition-colors border border-white/10 flex items-center gap-2"
                >
                    <span className="text-purple-400">360°</span>
                    <span className="text-white/60">View</span>
                </button>
            </div>
            {open && <OrbitSliderPanel />}
        </>
    );
}

function OrbitSliderPanel() {
    const angle = useAiUi((s) => s.camera.angle);
    const setAngle = useAiUi((s) => s.setAngle);

    return (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] bg-black/70 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/10 shadow-2xl">
            <div className="flex items-center gap-4">
                <span className="text-xs text-white/40 w-12 text-right">Front</span>
                <div className="relative w-64">
                    <input
                        type="range"
                        min="0"
                        max={Math.PI * 2}
                        step="0.01"
                        value={angle}
                        onChange={(e) => setAngle(parseFloat(e.target.value), 'manual')}
                        className="w-full h-2 bg-gradient-to-r from-purple-500/30 via-cyan-500/30 to-purple-500/30 rounded-full cursor-pointer appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg"
                    />
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-purple-400 font-mono">
                        {Math.round((angle * 180) / Math.PI)}°
                    </div>
                </div>
                <span className="text-xs text-white/40 w-12">Back</span>
            </div>
        </div>
    );
}
