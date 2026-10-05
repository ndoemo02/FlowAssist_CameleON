# FlowAssist XR / CameleON

Prototyp AI-to-UI na scenie 360° (Next.js 14 + React Three Fiber). Agent emituje
ustrukturyzowane zdarzenia (koperta A2UI v0.9.1, katalog `flowassist/v2`), a klient
pokazuje je jako kontrolowane widoki: stół roboczy z kartami (Back), deep-view na
zakrzywionym ekranie (Front) i HUD z taskami, narracją i decyzjami. Na razie agent
jest mockiem (`MockTransport` + scenariusz `research`).

## Uruchomienie

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # vitest (logika AI-to-UI)
npm run build
```

Demo: `http://localhost:3000/?demo=research` (autostart po intro).
Pozostałe parametry: `?speed=N`, `?anchor=probe`, `?dev` — opis w `AGENTS.md`.

## Dokumentacja

- [`AGENTS.md`](AGENTS.md) — koncepcja, stan implementacji, testowanie, zasady dla agentów
- [`src/features/aiui/README.md`](src/features/aiui/README.md) — architektura modułu AI-to-UI
- [`docs/history/`](docs/history/) — materiały historyczne sprzed CameleONa

Pozostałe pliki w `docs/`, `artifacts/` i `.agent/` są oznaczone jako historyczne lub legacy.
Stary kod i nieużywane assety (`archive/`, `_BACKUP_WARSAW/`, `REPO_AUDIT_2026-02-11.md` itd.)
usunięto z drzewa 2026-10-05; są w historii gita (przywracanie: `git checkout 37ee1b8 -- <ścieżka>`).
