# Zvendorowane schematy A2UI (capabilities)

Kopie **bez zmian** normatywnych schematów A2UI, używane wyłącznie w testach (Ajv 2020-12) do sprawdzenia, że
capabilities klienta i mocka mają kształt zgodny z upstreamem (P1.7a, ADR 0002 „Handshake możliwości”).

| Plik | Źródło | md5 |
|---|---|---|
| `client_capabilities.json` | `google/A2UI` @ `d6f6a62815016235f0b0a3e673aa3e3b4676b7a8`, `specification/v0_9_1/json/client_capabilities.json` | `dde5158782f094a795dfd0b7c127cf3e` |
| `server_capabilities.json` | `google/A2UI` @ `d6f6a62815016235f0b0a3e673aa3e3b4676b7a8`, `specification/v0_9_1/json/server_capabilities.json` | `d321ba49c646441cc6ec703194742eb0` |

- Pliki `v0_9/` i `v0_9_1/` w tym commicie są identyczne (md5), oba mają `$id` `…/v0_9/…` — trzymamy jedną kopię.
- md5 dotyczy treści w repo (końce linii LF, jak upstream). Kopia robocza na Windows może mieć CRLF (`core.autocrlf`),
  co zmienia md5 pliku na dysku, ale nie treść JSON.
- Obiekt capabilities jest zagnieżdżony pod kluczem wersji `"v0.9"` (także w v0.9.1).
- Aktualizacja: pobrać nowe pliki z przypiętego SHA, uaktualnić tabelę i przejrzeć wynik testów `transportCapabilities`.
