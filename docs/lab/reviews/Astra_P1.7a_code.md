# Review kodu P1.7a — Astra (openai/gpt-6-astra, inference.sh)

> 2026-10-06, task `06396yz8pfhw9yxzfra33yfwpm`. Wejście: łączny diff `25a293a..6e8c099` (Q2 + P1.7a), pełne `mockTransport.ts` i `types.ts`, plan v2.2, wyniki testów. Tokeny: 48001 wejście / 6184 wyjście.

## Werdykt: ISSUE

### 1. MEDIUM — reentrantny `stop` lub nieudany restart nie zatrzymuje zdarzeń poprzedniego przebiegu

**Plik + fragment:** `src/features/aiui/transport/mockTransport.ts:130–144`:
```ts
this.emitStatus(runId, 'running');
// dopiero potem:
this.schedule(step.at / speed, () => this.listeners.forEach((l) => l.onEvent(runId, step.event)));
```
Callback timera wykonuje bezwarunkowo `fn()`. Natomiast `stop()` (120–122) tylko kasuje **już istniejące** timery i cofa zgodę.

**Scenariusz:** subskrybent w `onStatus(1, 'running')` wywołuje `t.stop()`. Alternatywnie uruchamia przebieg 2 z `serverCapabilities() === null`, otrzymując błąd negocjacji.

**Dowód:** callback wraca do nadal wykonywanego `play(1, ...)`, które **po resecie zgody** dopiero zakłada timery. Zdarzenia przebiegu 1 oraz końcowy status zostają wyemitowane po stopie albo po nieudanym starcie 2. Cofnięcie zgody nie chroni tej ścieżki. To narusza również A4.3: starszy przebieg nie emituje po restarcie. Ewentualne odrzucenie przez store jest drugą linią obrony, nie zgodnością transportu.

**Kierunek poprawki:** sprawdzać tożsamość zgody/generacji po powrocie z callbacków i przed emisją zaplanowanych zdarzeń. Dodać oba powyższe przypadki do testów. Nie wymaga to ramki ani resetowania zgody przy `done`.

### 2. MEDIUM — wspólny test przepuszcza wysyłkę odłożoną z przebiegu bez zgody do nowego przebiegu

**Plik + fragment:** `src/features/aiui/__tests__/mockTransport.test.ts`, `AsyncMock`:
```ts
send(message: ClientMessage) {
    queueMicrotask(() => this.inner.send(message));
}
```
Zgoda jest sprawdzana dopiero w mikrozadaniu. W `__tests__/transportConformance.ts`, przypadek 7, kolejność:
```ts
t.send(action());
t.send(error());
await flush();
// dopiero później start kolejnego udanego przebiegu
```
usuwa możliwość wykrycia tego przeplotu.

**Scenariusz:**
1. `start(1)` nie negocjuje się (`server = null`).
2. `send(error)` kolejkuje mikrozadanie.
3. Bez `flush`: zmiana serwera na zgodny i `start(2)` z nowym snapshotem.
4. `flush()`.

**Dowód:** mikrozadanie wywoła `inner.send(error)` już przy zgodzie przebiegu 2, więc powstanie `BackendCall{kind:'continue', runId:2, capabilities: caps2}`. Komunikat wysłany podczas braku zgody nie został odrzucony lokalnie — został przeniesiony do następnego przebiegu. Obecny zestaw mimo tego uznaje `AsyncMock` za zgodny z A3/A4.

**Kierunek poprawki:** dodać do wspólnego zestawu przeploty bez opróżniania kolejki: `nieudany start → send → udany start` oraz `send w A → stop/restart`. Wrapper musi sprawdzać zgodę przy przyjęciu `send` i wiązać odroczoną pracę z jej generacją, zamiast korzystać później z dowolnej bieżącej zgody.

## GO WITH FIXES

### Potrzebne pliki
- Pełny `src/features/aiui/store.ts` — do zamknięcia oceny `startScenario`, `stopScenario`, `setTransport` i `runEffects`.
- Pełny plik istniejącego testu/fixture A2b: nieobsługiwana reprezentacja → fallback P10 **i raport**; dostarczone fragmenty nie pozwalają potwierdzić całej tej asercji.

**Czego nie sprawdziłam:** pełnej integracji store–transport i wskazanego fixture A2b; nie uruchamiałam testów ani bramek autora, nie porównywałam kopii schematów z upstream SHA. P1.7b/P1.6 poza oceną.