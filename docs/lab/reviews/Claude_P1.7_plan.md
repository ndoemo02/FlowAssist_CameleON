# Review planu P1.7 (recenzent Claude, świeży kontekst, tylko odczyt)

> Odzyskane 2026-10-06 z transkryptu subagenta `a3baa7b9abb95bbbf` (sesja 50f1df1b, 14:44). Przedmiot: `PLAN_P1.7_capabilities.v1.md` @ `25a293a`. Werdykt końcowy: **GO WITH FIXES** (nagłówek raportu: ISSUE).

## Werdykt: **ISSUE**

Zweryfikowałem kod `25a293a` (`contract.ts`, `catalog.ts`, `transport/*`, `store.ts`, `workspace.ts`, `__tests__/fixtures/replay.ts`, `runIsolation.test.ts`), ADR 0001/0002/0005/0007 i plan v1.3.2 (P1.6, P1.7). Źródła A2UI:
- strony a2ui.org v0.9 i v0.9.1;
- normatywne schematy JSON `client_capabilities.json`, `server_capabilities.json`, `client_to_server.json`, `server_to_client.json` dla `v0_9` i `v0_9_1`;
- źródło `@ag-ui/a2ui-middleware` (`src/index.ts`).

Uwagi dzielę na dwie grupy: (A) blokuje rozpoczęcie kodu P1.7; (B) blokuje uznanie P1.7 za zamknięte, a więc start P1.6.

### HIGH

**H1 (A) — §2, §3: kształt capabilities jest niezgodny z normatywnym schematem A2UI.**
- Oba schematy (`client_capabilities.json`, `server_capabilities.json`, w `v0_9` i w `v0_9_1`) zagnieżdżają obiekt pod kluczem wersji: `{"v0.9": {"supportedCatalogIds": [...], "inlineCatalogs"?: [...]}}`, z `required: ["v0.9"]`.
- Klucz pozostaje `"v0.9"` także w plikach v0.9.1.
- AG2 wysyła to samo: `"a2uiClientCapabilities": {"v0.9": {...}}`.
- Plan oparł się na prozie specyfikacji, która tego opakowania nie pokazuje. Cytuje też stronę v0.9, a obecna jest v0.9.1.
- Po stronie serwera `supportedCatalogIds` jest **opcjonalne**, a `acceptsInlineCatalogs` ma domyślnie `false`.
- **Kierunek:**
  - `a2uiClientCapabilities: { 'v0.9': { supportedCatalogIds } }` i analogicznie `ServerCapabilities`;
  - `negotiate` obsługuje brak klucza `v0.9` i brak `supportedCatalogIds`;
  - w §6 walidacja względem przypiętej, zvendorowanej kopii schematu upstream, a nie tylko własnego schematu.

**H2 (B) — §4, §7: brak wiązania z AG-UI, więc profil nie jest zamknięty.** W ekosystemie AG-UI istnieje konwencja `@ag-ui/a2ui-middleware`:
- A2UI jedzie w `ACTIVITY_SNAPSHOT` z `activityType: "a2ui-surface"`;
- obowiązuje **jeden stały `messageId` na surface** i `replace: true`;
- akcje idą w `forwardedProps.a2uiAction.userAction`;
- katalog idzie w `context`, a nie w `a2uiClientCapabilities`.

Konsekwencje dla tego kernela:
- migawki z `replace` ponownie wysyłają `createSurface`, a reducer odpowiada na to `SURFACE_EXISTS` (ADR 0005, fixture 08);
- powtarzany `messageId` nie nadaje się na klucz deduplikacji, bo §4.8 zgubiłby legalne aktualizacje.

Profil musi więc **przed P1.6** rozstrzygnąć:
- (a) własne ramki (np. AG-UI `CUSTOM` z ramką profilu); albo
- (b) konwencję middleware z różnicowaniem migawek w adapterze;
- oraz które pole `RunAgentInput` niesie capabilities i akcje.

Bez tego P1.6 będzie dopisywał reguły w locie, czego §1.2 zakazuje.

**Kierunek:** research wiązania AG-UI staje się wejściem P1.7, albo P1.7 dzielimy na:
- P1.7a — kod: capabilities, Q2;
- P1.7b — zamknięcie profilu z aneksem wiązania AG-UI, będące warunkiem P1.6.

**H3 (B) — §4.2, §4.8, §4.9: ramka, lifecycle i ServerCapabilities są nieokreślone.** Brakuje:
- **Ramki:** nazw pól, typów i miejsca ramki.
  - Nie może to być poziom najwyższy koperty A2UI, bo `client_to_server.json` ma `maxProperties: 2`; ramka musi więc być poza kopertą.
  - Trzeba ustalić zakres `seq` (przebieg CameleON czy pojedyncze wywołanie backendu, skoro jeden przebieg to wiele wywołań).
  - Trzeba ustalić zachowanie przy luce, zamianie kolejności i duplikacie.
  - Trzeba ustalić, czy ramka obejmuje też `stage`/`narration` (wspólna kolejność).
- **Lifecycle:** konkretnego sygnału dla `awaiting_action` i `done`. Profil musi określić, czy to rozszerzenie profilu (nowy klucz to zmiana `parseEvent`), czy sygnał konsumowany wyłącznie przez adapter. Dziś „decyzja terminalna” istnieje tylko jako `terminal: true` w skrypcie mocka.
- **ServerCapabilities:** sposobu, w jaki docierają do klienta.
  - `AgentTransport` nie ma na to kanału; zdanie „mock deklaruje ServerCapabilities” nie ma gdzie żyć bez addytywnego członu interfejsu.
  - W A2UI katalog wybiera serwer, więc klientowe `negotiate` jest najwyżej kontrolą spójności. Profil powinien wskazać stronę autorytatywną.
- **Wersjonowanie profilu:** echa wersji profilu od serwera, zachowania przy nieznanej wersji (np. `error` jako „niezgodny protokół” z tabeli P1.6), kodu i komunikatu błędu negocjacji.

### MEDIUM

**M1 — §4.6: raport OBS-1 nie mieści się w typach.**
- `ClientError.surfaceId` to zamknięta unia `SurfaceId`, a `VALIDATION_FAILED` wymaga `surfaceId` i `path`.
- Odrzucona koperta z nieznanym lub brakującym surface oraz odrzucone `stage`/`narration` nie mają ani jednego, ani drugiego.
- `parseEvent` zwraca samo `null`, bez ścieżki i przyczyny. Adapter musiałby więc powielić walidację, czyli stworzyć drugie źródło prawdy.
- Brakuje też zamkniętej listy kodów klienta: dziś są `VALIDATION_FAILED`, `SURFACE_EXISTS`, `SURFACE_NOT_FOUND`.
- **Kierunek:**
  - reguła profilu dla błędów bez surface (osobny kod albo jawna konwencja);
  - diagnostyczny wariant `parseEvent` w `contract.ts` (jawna zmiana kontraktu z testami);
  - konwencja `path` oparta na `id`, a nie na indeksie jak w przykładzie A2UI.

**M2 — §3 `bindingsOnlyIn: 'catalog-props'`: Q1 nie ma źródła danych.**
- Propsy katalogu istnieją tylko wewnątrz funkcji walidatorów, więc adapter nie ma skąd ich wziąć.
- Brakuje też ustaleń:
  - czy odrzucana jest cała koperta `updateComponents`, czy jeden komponent;
  - że `{path}` zagnieżdżony w dosłownej treści to dana, a nie binding;
  - co adapter robi z bindingiem `presentation`/`priority`. ST-4(a) mówi „poza profilem; układ ignoruje, gotowość wstrzymana, walidowany”, a Q1 mówi „odrzucić z `VALIDATION_FAILED`” — reguły są niesymetryczne.
- **Kierunek:**
  - deklaratywna lista `CATALOG_PROPS` dla każdego komponentu w `catalog.ts`, z testem parytetu z `components.schema.json`;
  - jawna reguła adaptera dla `literalOnly`.

**M3 — §3, §3 „Źródło prawdy”: reguły stałe dla wersji profilu trafiają do ładunku runtime.**
- `limits`, `dataRules`, `reservedKeys` i `envelope.accept` nie podlegają negocjacji, bo wyznacza je `flowassist-transport/1`.
- Wysyłane w ładunku tworzą trzecie źródło prawdy (obok dokumentu profilu i `contract.ts`) i mogą się rozjechać bez podbicia wersji profilu.
- Typy z krotkami literałów (`['card','focus','screen']`, `512`) nie są wyprowadzone ze stałych.
- `ACCEPTED_VERSIONS` jest dziś nieeksportowanym `Set`.
- **Kierunek:**
  - w ładunku tylko to, co różni się między klientami (katalogi, `kinds`), ewentualnie reguły jako jawnie informacyjne;
  - typy wyprowadzone przez `typeof`;
  - zasada „zmiana dowolnej reguły to `flowassist-transport/2`” pilnowana testem migawki (patrz §6).

**M4 — §8.2 jest sprzeczne z tekstem planu v1.3.2 P1.7.**
- Plan v1.3.2 mówi: „rozszerzenie listy obsługiwanych reprezentacji wymaga nowego identyfikatora katalogu”.
- §8.2 twierdzi, że jest „zgodne z planem”, a nie jest.
- Generyczny agent A2UI czyta tylko `supportedCatalogIds`; po dodaniu reprezentacji P10 zmieni się dla niego po cichu.
- **Kierunek:**
  - jawna decyzja właściciela: po P1.7 dodanie obsługiwanej reprezentacji, która już jest w `REPRESENTATIONS`, to zmiana capabilities, a nie katalogu;
  - warunek: serwer profilu/1 musi deklarować, że czyta `flowassist.kinds`, a bez tej deklaracji negocjacja się nie udaje;
  - aktualizacja ADR 0002 (oś 2) i planu.

**M5 — §3 `envelope`: polityka wersji koperty zostaje otwarta, choć profil ma być zamknięty.**
- OBS-3(a) obowiązywało „do czasu handshake'u (P1.7)”, a ADR 0002 ma ją w „Otwarte 1”.
- Upstream v0.9.1 sam przyjmuje `version ∈ {"v0.9","v0.9.1"}` (`server_to_client.json`, `client_to_server.json`). To gotowe uzasadnienie tolerancji.
- **Kierunek:** zamknąć ADR 0002 „Otwarte” 1 (tolerancja zostaje, uzasadniona schematem v0.9.1) i 2 (mechanizm handshake'u), zamiast tylko ogłaszać `accept`.

**M6 — §4.7, §4.10: akcje.**
- Brak identyfikatora akcji, potwierdzenia i klasyfikacji idempotencji.
- Plan v1.3.2 wymienia `approve` i `deepen` jako nieidempotentne, ale nie ma źródła tej klasyfikacji.
- Brak `itemId` w opisie `context`, choć I9 go wymaga.
- **Kierunek:**
  - identyfikator akcji w ramce, nie w kopercie;
  - domyślnie „żadna akcja nie jest automatycznie ponawiana”, chyba że profil zdefiniuje klasyfikację.

**M7 — §4.4: `stage`/`narration`.**
- Brakuje zapisu, że należą do profilu, a nie do katalogu: obowiązują niezależnie od `catalogId`, bez `version` (dziś ignorowane) i bez `surfaceId`.
- Brak polityki nieznanych pól: `parseEvent` odrzuca nieznane klucze `stage`, ale ignoruje `version`.
- Brak informacji, jak te rozszerzenia jadą w wiązaniu AG-UI. W `a2ui_operations` odrzuciłby je każdy zgodny middleware (łączy się z H2).

### LOW

- **L1 — §3:** `kinds: Record<ItemKind, …>` przeczy zdaniu „rodzaj bez reprezentacji pomijany”; poprawny typ to `Partial<Record<…>>`. „Kolejność P10” jest myląca, bo P10 bierze kolejność z listy agenta. Kolejność po stronie klienta jest co najwyżej informacyjna i trzeba to napisać.
- **L2 — §3:** `representations` to suma wartości `kinds`. Usunąć je albo opisać jako pole pochodne, z testem.
- **L3 — §3:** `clientCapabilities()` w `catalog.ts`, składające limity, klucze i reguły profilu, miesza osie 1–3. Lepiej, żeby `catalog.ts` eksportował tylko część katalogową, a składanie odbywało się w `transport/` (`runIsolation.test.ts` pozwala na importy z `catalog.ts`).
- **L4 — §5 Q2:** to zmiana `workspace.ts`, pliku kernela. Wymaga adnotacji w ADR 0001 (jak przy ST-1(b)) i aktualizacji ADR 0007 (ST-4: „`resolveItem` rozwiązuje je w widoku `ready`”; Q2 oznaczyć jako zrealizowane).
  - Bezpieczeństwo sprawdziłem: memo w `ItemContent`, `LiveRegions` ani `replay` nie czytają tych pól.
  - Do przepisania są asercje w `itemStates.test.ts` (ok. linii 100 i 164) oraz w `workspace.test.ts:33` (`hint: 'card'`). Test ST-4 powinien sprawdzać brak tych pól i niezmienione `workspaceMeta`.
- **L5 — §3 „Wysyłka”:** `startScenario` nie jest na liście funkcji kernela w ADR 0001, ale realizuje P7 i współdzieli I6. Zmianę trzeba odnotować w ADR 0001 jako niekernelową.

## Ocena §8

1. **`store.ts: startScenario` dokłada `capabilities`: zgoda, z warunkami.**
   - Uzasadnienie: zgodne z planem v1.3.2 („`StartRequest`”); capabilities są zamrożone na przebieg; `startScenario` nie jest funkcją kernela; replay jest neutralny (fałszywy transport zapisuje tylko `runId`).
   - Warunki:
     - `capabilities` wymagane w typie;
     - profil nakazuje adapterowi dołączać capabilities z `StartRequest` danego przebiegu do każdej kontynuacji (`send`), bo store kontroluje tylko `start`;
     - adnotacja w ADR 0001.
2. **Reprezentacje w rozszerzeniu `flowassist`: zgoda tylko pod warunkiem z M4.** Osobne identyfikatory katalogu dla każdego zestawu reprezentacji dają eksplozję kombinatoryczną. Brak warunku M4 oznacza jednak cichą zmianę P10 u agenta, który czyta tylko identyfikator katalogu, i sprzeczność z planem v1.3.2.
3. **Profil jako dokument w repo + schemat JSON: zgoda, z uzupełnieniami.**
   - zvendorowane, przypięte schematy A2UI `client_capabilities` i `server_capabilities`;
   - schematy ramki i rozszerzeń;
   - zamknięcie ADR 0002 „Otwarte” 1–2 i aktualizacja osi 3.

## §6: czego brakuje

- **Zgodność z upstreamem:** walidacja `a2uiClientCapabilities` względem przypiętego `client_capabilities.json` (opakowanie `v0.9`).
- **`negotiate`:** serwer bez `supportedCatalogIds`, bez klucza `v0.9`, z nieznaną wersją profilu, z `acceptsInlineCatalogs`.
- **Strażnik dryfu:** zamrożona migawka `clientCapabilities()` profilu/1. Zmiana `SUPPORTED_REPRESENTATIONS`, limitów lub kluczy oblewa test, dopóki ktoś świadomie nie podbije migawki albo profilu (ADR 0002).
- **Parytet** dokumentu profilu ze stałymi oraz `CATALOG_PROPS` ze schematem komponentów (M2).
- **Wspólny test zgodności transportu** dla każdej implementacji `AgentTransport`: capabilities przy `start` i przy kontynuacji przez `send`. Ten sam zestaw powinien przejść P1.6.
- **Mock:** egzekwowanie negocjacji (brak wspólnego katalogu daje `error` przed pierwszym zdarzeniem, plus fixture) albo jawne „poza zakresem”. Dziś reguła pozostaje niewykonywalna aż do P1.6.
- **`tsc`:** `StartRequest.capabilities` wymagane, więc mocki i fałszywe transporty bez capabilities nie przejdą kompilacji.

Pozostałe bramki (vitest, tsc z 1 znanym błędem, replay, e2e, `next build`, review) wystarczają.

## **GO WITH FIXES**

- **Przed pierwszym commitem kodu:** poprawić H1 i podjąć decyzje §8.1, §8.2 (z M4).
- **Q2 (§5)** może iść od razu jako osobny commit, z adnotacją w ADR 0001 i ADR 0007.
- **P1.7 nie jest zamknięte, a P1.6 nie może ruszyć,** dopóki dokument profilu nie rozstrzygnie H2, H3, M1, M2, M5, M6 i M7. Rekomenduję jawny podział na P1.7a (kod) i P1.7b (zamknięcie profilu z aneksem wiązania AG-UI), żeby „GO” dla kodu nie zostało odczytane jako „profil zamknięty”.

Pliki: `C:\Develop\Flow Assist\PLAN_P1.7_capabilities.md`, `C:\Develop\Flow Assist\FlowAssist\src\features\aiui\{contract.ts,catalog.ts,transport\types.ts,transport\mockTransport.ts,store.ts,workspace.ts}`, `C:\Develop\Flow Assist\FlowAssist\docs\adr\0001-…, 0002-…, 0005-…, 0007-…`.
