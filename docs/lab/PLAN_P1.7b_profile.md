# P1.7b — zamknięcie profilu `flowassist-transport/1` (plan v2)

> Status: **v2, 2026-10-06, decyzje właściciela naniesione (§9).**
> - **Zatwierdzone:** D3, D6, D7, D9, D10, D11, D13, D15, D16, D17, D18, D19, D20.
> - **Zmienione przez właściciela:**
>   - **D12:** najwyżej jedna oczekująca akcja, bez FIFO (B6.3);
>   - **D14:** po wyczerpaniu prób połączenie `offline`, a przebieg zostaje wznawialny, bez terminalnego `error` z powodu sieci (B2.9).
> - **D6 doprecyzowane:** zakres i reset `seq` oraz deduplikacja (B2.1a–B2.1e).
>
> P1.7b jest implementowane w małych commitach, P1.6 nie startuje.
> Baza: `feat/aiui-prototype` @ `6cca2dc` (kod = `fdc79b6`, tag `p1.7a-closed`).
> Źródła wewnętrzne:
> - `docs/checkpoints/P1.7a-CLOSED-2026-10-06.md` (§10–§12);
> - `PLAN_P1.7_capabilities.md` (v2.2, część B, którą ten plan zastępuje);
> - ADR 0001, 0002, 0005, 0007.
>
> Cel: profil zamyka **każdą** regułę transportową, więc P1.6 tylko implementuje. Dlatego reguły niżej mają już poziom normatywny (MUST / MUST NOT). Po zgodzie trafią prawie dosłownie do `docs/protocol/flowassist-transport-1.md`.

Każda reguła ma jedną kategorię:
- **[DOC]** — tylko dokument profilu i schematy;
- **[KOD-0]** — kod w P1.7b **bez zmiany zachowania** (identyczne ślady replay, testy jak dotąd);
- **[P1.6]** — zmiana zachowania, implementowana w P1.6. Każda wymaga zgody, a zgoda na plan nie jest zgodą na kod.

---

## 0. Źródła upstream (research 2026-10-06, przypięte)

| Źródło | Wersja / SHA | Uwagi |
|---|---|---|
| AG-UI spec | `ag-ui-protocol/ag-ui` @ `a30600791dcb` (2026-10-06), `docs/spec/1.0/**`, `schema.json` | **Spec 1.0 jest normatywny** (BCP 14). Schemat odpowiada za strukturę, dokument za zachowanie |
| `@ag-ui/core`, `@ag-ui/client` | **1.0.2** (npm, 2026-10-05) | |
| `@ag-ui/a2ui-middleware` | **0.0.12** (2026-10-05) | od 0.0.11 zbudowany na `@ag-ui/core` 1.0 |
| A2UI | `google/A2UI` @ `0b22a7e` (2026-10-06) | v0.9.1 bez zmian normatywnych. Zvendorowane `client/server_capabilities.json` mają **md5 identyczne z `main`**. `server_to_client.json` zmienił się 2026-09-01 (`73d75a6`), ale tylko w opisach |
| A2UI v1.0 | `specification/v1_0` | **Status: Candidate.** Wciąż w ruchu (2026-10-02: klucze `@`) |

Kopie robocze researchu leżą w scratchpadzie sesji. Do repo trafią tylko cytowane fragmenty, z SHA.

## 1. Ustalenia researchu (fakty, które rozstrzygają reguły)

- **F1. Brak kanału od klienta w trakcie biegu AG-UI.** Jedyny komunikat klient → agent to `RunAgentInput`, wysyłany raz na bieg. Akcja albo raport w trakcie biegu może więc pojechać dopiero w następnym biegu (`interrupt-resume.mdx`, `run-input.mdx`).
- **F2. Lifecycle tylko w polach standardowych.**
  - `RUN_FINISHED.outcome` ∈ `success` (także brak `outcome`), `interrupt` (≥ 1 `Interrupt`), `cancelled`. `RUN_ERROR` oznacza porażkę. Dopuszczalny jest spóźniony `RUN_ERROR` po `RUN_FINISHED`.
  - „The run's outcome … MUST travel in the fields the schema describes … never only in a new event type” (`versioning.mdx`). Sygnał `awaiting_action`/`done` **nie może** więc jechać w `CUSTOM`.
- **F3. Interrupt / resume.**
  - `Interrupt{id, reason (otwarty string), message?, toolCallId?, responseSchema?, expiresAt?}`.
  - Następny bieg niesie `resume: [{interruptId, status: resolved|cancelled, payload?}]`, który MUSI pokryć **każdy** interrupt (reguła konsumenta).
- **F4. `cancelled`.** Konsument MUST NOT pokazać go jako sukcesu ani jako porażki.
- **F5. Binding HTTP+SSE.**
  - Uporządkowane i kompletne dostarczanie. Jedno zdarzenie na ramkę SSE. Strumień kończy się zamknięciem body po zdarzeniu terminalnym.
  - Zerwanie bez zdarzenia terminalnego to **ucięty bieg**. Nie wolno syntetyzować `RUN_FINISHED`.
  - **Brak wznawiania** (`Last-Event-ID` nieużywany). Ponowienie oznacza nowy bieg z nowym `runId`.
  - Odrzucone wejście to błąd HTTP przed strumieniem.
- **F6. Zdarzenia nie mają identyfikatora ani sekwencji.**
  - `BaseEvent = {type, timestamp?, rawEvent?, metadata?}`.
  - `RUN_ERROR` nie niesie `runId`, więc przypisanie wynika z pozycji w strumieniu.
  - Jeden strumień może nieść kilka biegów (replay historii przed biegiem żądanym).
- **F7. `CUSTOM {name, value}`.**
  - Konsument, który nie zna `name`, MUST ignore.
  - Producent MUST NOT przenosić w `CUSTOM` semantyki zdarzenia standardowego („custom message … is not a message”).
  - Nazwy z prefiksem dostawcy.
- **F8. Capabilities AG-UI (`AgentCapabilities`).**
  - Są informacyjne. Sposób pobrania nie jest zdefiniowany.
  - **„A rejected or absent declaration MUST NOT prevent a run.”** Grupa `custom` jest otwarta.
- **F9. `forwardedProps`** to kanał aplikacji, którego pośrednicy MUST NOT zmieniać. **`context`** jest do wstrzyknięcia modelowi, a nie do księgowości transportu.
- **F10. Wersja protokołu w paśmie.**
  - Klient deklaruje ją w `RunAgentInput.protocolVersion`, producent w `RUN_STARTED.protocolVersion` (`MAJOR.MINOR`).
  - Brak pola oznacza peera sprzed wersjonowania (0.x). Nowsza wersja minor: kontynuować i ostrzec.
- **F11. Model przetwarzania AG-UI.**
  - Nierozpoznany materiał przeżywa: nieznane zdarzenie jest odrzucane, a nieznane pole usuwane, w obu przypadkach z ostrzeżeniem.
  - Zniekształcona znana wartość jest **fatalna**.
  - `@ag-ui/client` sam robi `JSON.parse` danych SSE.
- **F12. Konwencja `@ag-ui/a2ui-middleware` 0.0.12.**
  - Surface'y jadą jako `ACTIVITY_SNAPSHOT` z `activityType: "a2ui-surface"` i `content: {a2ui_operations: [...]}`, z `replace: true`, **skumulowane**: każda migawka zawiera `createSurface` + komponenty + dane.
  - `messageId` liczony jest per wywołanie narzędzia. Ta sama migawka niesie też stany `building`/`retrying`/`failed`.
  - Akcje idą w `forwardedProps.a2uiAction.userAction`, zamieniane na syntetyczne wiadomości narzędzia.
  - Katalog jest **wstrzykiwany do `context`** jako schemat inline dla modelu.
  - Wiadomości z `stage`/`narration` middleware nie przenosi.
- **F13. A2UI v0.9.1, `updateDataModel`:**
  - upsert: istniejąca ścieżka jest aktualizowana, nieistniejąca tworzona;
  - brak `value` usuwa klucz, a **w tablicy ustawia `undefined` pod indeksem, zachowując długość**;
  - **nasz `setAt` robi `splice`**, czyli skraca tablicę i przesuwa indeksy. To rozbieżność już dziś.
  - A2UI v1.0 (Candidate) zmienia usuwanie na `value: null`.
- **F14. A2UI `error`.** Oba warianty (`VALIDATION_FAILED` i ogólny) **wymagają `surfaceId`**. Błąd bez surface nie ma więc reprezentacji w A2UI.
- **F15. Koperty A2UI v0.9.1 są zamknięte:** `additionalProperties: false` na poziomie koperty i treści. `version` ∈ {`v0.9`,`v0.9.1`}. Nasz runtime jest łagodniejszy: ignoruje nieznane pola kopert, a `narration` przepuszcza nieznane klucze.
- **F16. A2UI o transporcie.** Wymaga uporządkowanego dostarczania, ramkowania i metadanych dla capabilities. Koniec tury agenta sygnalizuje transport.

---

## 2. D6 — wiązanie z AG-UI: warianty i rekomendacja

| | (a) **Ramki profilu w `CUSTOM`** | (b) **Konwencja middleware** (`ACTIVITY_SNAPSHOT a2ui-surface`) | (c) **`ACTIVITY_SNAPSHOT` z własnym `activityType`**, tylko dopisywanie |
|---|---|---|---|
| Nośnik A2UI | `CUSTOM name="flowassist.frame"`, jedna wiadomość profilu na zdarzenie | skumulowane migawki `replace: true` | migawka z unikalnym `messageId` na partię |
| `stage`/`narration` | ten sam kanał i ta sama kolejność | **brak** (middleware ich nie przenosi), potrzebny osobny kanał | ten sam kanał |
| Zgodność z kernelem | 1:1 z obecnym `transportDispatch` | **konflikt**: każda migawka ponawia `createSurface` → `SURFACE_EXISTS` (ADR 0005, fixture 08). Adapter musiałby liczyć różnice między migawkami, czyli wymyślać semantykę (ponowiony `deleteSurface`, stany `building/failed`) | zgodna, ale wiadomości activity zostają w historii wątku i w `MESSAGES_SNAPSHOT` |
| I10 (zamknięty katalog) | bez zmian | middleware wstrzykuje katalog inline do `context`, a nasz model to zamknięty katalog bez katalogów inline | bez zmian |
| Lifecycle (F2) | `RUN_FINISHED.outcome` (standard) | standard | standard |
| Replay historii (F6) | prosta reguła: tylko bieg żądany | migawki z historii ponawiają `createSurface` | `messageId` daje idempotencję |
| Interop | konsument AG-UI spoza FlowAssist legalnie ignoruje ramki | agent zbudowany na middleware może karmić CameleON (po różnicowaniu) | żaden konsument nie zna typu |
| Ryzyko normatywne | F7: `narration` jako `CUSTOM` (patrz B7) | zgodny z konwencją ekosystemu, ale nie z kernelem | activity to „postęp”, a nie log operacji |

**Rekomendacja: (a) `CUSTOM`.** Rozstrzygają trzy ograniczenia:
1. skumulowane `replace` kontra `SURFACE_EXISTS` i reset P7 przy `deleteSurface`;
2. middleware nie przenosi `stage`/`narration`;
3. wstrzykiwanie katalogu do `context` kontra I10.

Wariant (c) nic nie zyskuje względem (a), a zostawia w historii wątku niepotrzebne wiadomości. (b) zostaje opisany w profilu jako **niewspierany w profilu/1**. Most do agentów pisanych pod middleware to ewentualny przyszły profil, a nie fallback (analogicznie do D2).

---

## 3. Reguły normatywne

### B1. Wiązanie z AG-UI

- **B1.1 [DOC]** Profil/1 działa na **AG-UI 1.x**, binding **HTTP + SSE** (F5). Protobuf i inne bindingi są poza profilem/1.
- **B1.2 [DOC]** Tożsamość:
  - jeden przebieg CameleON (`start` … stan terminalny) to **jeden `threadId`** (UUID, nowy przy każdym `start`, czyli P7);
  - każde wywołanie backendu to jeden bieg AG-UI z nowym `runId` (UUID);
  - liczbowy `runId` CameleON nigdy nie trafia na drut. Adapter trzyma mapowanie `runId` AG-UI → `runId` CameleON.
- **B1.3 [DOC]** Biegi są **sekwencyjne**: następny bieg startuje dopiero po zakończeniu body poprzedniej odpowiedzi (albo po jej ucięciu). Dwa biegi AG-UI jednego przebiegu nigdy nie trwają równocześnie.
- **B1.4 [DOC]** `RunAgentInput` w profilu/1:

  | Pole | Reguła |
  |---|---|
  | `threadId`, `runId` | wg B1.2 |
  | `protocolVersion` | MUST `"1.0"` |
  | `messages` | historia utrzymywana przez klienta AG-UI. Pierwszy bieg: jedna wiadomość `user` z `prompt` (albo nazwą scenariusza) |
  | `tools`, `context`, `state`, `parentRunId` | MUST być nieobecne. Profil/1 nie oferuje narzędzi frontendu, nie wstrzykuje katalogu (I10) i nie używa stanu współdzielonego |
  | `forwardedProps.flowassist` | obiekt profilu (schemat `forwarded-props.schema.json`): `{ profile, capabilities, scenario?, resync?, a2uiErrors?, diagnostics? }`. `capabilities` to **ten sam zamrożony snapshot** przebiegu przy **każdym** biegu (P1.7a A3) |
  | `resume` | wg B6 (akcje) |

- **B1.5 [DOC]** Ramka agent → klient:
  ```json
  { "type": "CUSTOM", "name": "flowassist.frame",
    "value": { "profile": "flowassist-transport/1", "seq": 0, "message": { "...": "jedna wiadomość profilu" } } }
  ```
  - `message` to dokładnie jedna wiadomość, którą dziś przyjmuje `transportDispatch`: koperta A2UI albo `stage`, albo `narration`.
  - `value` jest zamknięte: tylko `profile`, `seq`, `message`.
  - Zdarzenie może nieść `subagentRunId`. Atrybucja nie zmienia reguł, a `seq` jest wspólne dla biegu.
- **B1.6 [DOC]** Wszystkie inne zdarzenia AG-UI (`TEXT_MESSAGE_*`, `REASONING_*`, `TOOL_CALL_*`, `STATE_*`, `MESSAGES_SNAPSHOT`, `ACTIVITY_*`, `STEP_*`, `SUBAGENT_*`, `RAW`, `CUSTOM` o innej nazwie) **nie zmieniają stanu CameleON** w profilu/1. Adapter MAY je zalogować w dev. Ich walidację robi potok `@ag-ui/client` (F11).
- **B1.7 [DOC]** Replay historii: adapter stosuje ramki i lifecycle **wyłącznie z biegu, o który prosił** (`RUN_STARTED.runId` = `RunAgentInput.runId`). Biegi poprzedzające go w strumieniu są pomijane w całości.

### B2. Ramka, lifecycle, capabilities serwera, wersjonowanie

**Ramka i sekwencja**
- **B2.1 [DOC]** Sekwencja ramek (D6, doprecyzowane):
  - **B2.1a Zakres:** licznik `seq` należy do **jednego biegu AG-UI**, czyli do jednego żądania `RunAgentInput` (start, akcja, resync). Nie należy do przebiegu CameleON, do wątku ani do połączenia. Jeden licznik obejmuje wszystkie ramki biegu, także zdarzenia z `subagentRunId`.
  - **B2.1b Reset:** pierwsza ramka po `RUN_STARTED` żądanego biegu ma `seq = 0`. Każda kolejna ma poprzednie `seq + 1` (liczba całkowita, ≤ 2^53 − 1).
    - Nowy bieg (kolejna akcja, każda próba resync) zaczyna od `0`.
    - Ramek z biegów replayu (B1.7) się nie liczy i ich nie stosuje: ramka przed `RUN_STARTED` żądanego biegu należy do biegu replayu.
    - Ramka poza jakimkolwiek otwartym biegiem (przed pierwszym `RUN_STARTED`, po zdarzeniu terminalnym) jest naruszeniem AG-UI wykrywanym przez potok klienta → `agui:PROTOCOL_VIOLATION` (F11).
  - **B2.1c Kontrola, a nie bufor:** binding gwarantuje kolejność i kompletność (F5), więc klient niczego nie przestawia ani nie buforuje. Każda ramka o `seq` innym niż oczekiwany (luka, cofnięcie, powtórzenie) jest **fatalna**: przerwanie żądania i `profile:FRAME_SEQUENCE`.
  - **B2.1d Deduplikacja:** kluczem tożsamości ramki jest para (`runId` AG-UI, `seq`), a ramka jest stosowana **najwyżej raz**.
    - Ponowienie klucza w biegu jest naruszeniem (B2.1c). Nie ma cichego pomijania.
    - Bieg, którego `runId` adapter już przetworzył, pojawiający się ponownie (replay historii), jest pomijany w całości (B1.7).
    - **Deduplikacji po treści nigdy nie ma** (ADR 0005): dwie identyczne wiadomości o różnych kluczach to dwa zdarzenia.
  - **B2.1e Bez ponownego dostarczenia:** ramek uciętego biegu nikt nie dosyła (brak `Last-Event-ID`, F5). Ramki zastosowane przed ucięciem zostają zastosowane. Zgodność stanu przywraca bieg resync (B2.10), którego treść jest idempotentna z konstrukcji: upsert komponentów, pełna wymiana danych, bez `createSurface` dla surface'ów trzymanych przez klienta.
- **B2.2 [DOC]** Fatalne jest także:
  - `value` o złym kształcie, nieznany klucz albo `profile` inny niż wynegocjowany → `profile:FRAME_INVALID`;
  - `seq` niebędący liczbą całkowitą ≥ 0 → `profile:FRAME_INVALID`.

**Lifecycle (F2–F4)**
- **B2.3 [DOC]** Mapowanie na `RunStatus` CameleON. Adapter zapamiętuje wynik z `RUN_FINISHED`, a **status ustala dopiero na czystym końcu strumienia** (koniec body albo zerwanie **po** zdarzeniu terminalnym):

  | Zdarzenie żądanego biegu | Status CameleON |
  |---|---|
  | `RUN_STARTED` | `running` (natychmiast) |
  | `RUN_FINISHED` + `interrupt` z **dokładnie jednym** interruptem `reason: "flowassist.awaiting_action"` | `awaiting_action` |
  | `RUN_FINISHED` + `interrupt` z innym zestawem | `error` `profile:UNSUPPORTED_INTERRUPTS` |
  | `RUN_FINISHED` + `success` (albo bez `outcome`), `pendingToolCallIds` puste lub nieobecne | `done` |
  | `RUN_FINISHED` + `success` z niepustym `pendingToolCallIds` | `error` `profile:UNEXPECTED_TOOL_CALLS` (profil/1 nie oferuje narzędzi) |
  | `RUN_FINISHED` + `cancelled` | **D11** (rekomendacja: nowy status terminalny `cancelled`) |
  | `RUN_ERROR` (przed, w trakcie albo po `RUN_FINISHED`, przed końcem strumienia) | `error` `agent:<code ?? RUN_ERROR>: <message>` |

  - Spóźniony `RUN_ERROR` wygrywa, bo status jest ustalany dopiero na końcu strumienia. Trwałość `done` w store (I6) się nie zmienia: `done` nigdy nie jest wysyłane przed czystym końcem.
  - `RUN_ERROR` bez `runId` przypisuje się pozycją (F6) do biegu otwartego w strumieniu. `RUN_ERROR` przed `RUN_STARTED` dotyczy biegu żądanego.
- **B2.4 [DOC]** Interrupt profilu:
  - `id` jest unikalny w biegu;
  - `message`, `responseSchema` i `toolCallId` są ignorowane;
  - `expiresAt` MUST być nieobecny, a jeśli jest, adapter go ignoruje, bo klient profilu/1 nie ocenia wygaśnięcia.
- **B2.5 [DOC]** Ucięcie strumienia (F5) **nie** oznacza `done` ani `error` (decyzja v1.3.2). Zachowanie opisuje B2.9.

**Capabilities serwera**
- **B2.6 [DOC]** `ServerCapabilities` profilu **nie są** AG-UI `AgentCapabilities` i **nie jadą** w `AgentCapabilities.custom`. AG-UI zabrania blokowania biegu z powodu braku deklaracji (F8), a profil/1 kończy negocjację błędem w kroku 0. Dwa różne dokumenty, więc nie ma sprzeczności.
  - Źródło w P1.6 rozstrzyga **D9**. Rekomendacja: **statyczna konfiguracja adaptera**, czyli obiekt `ServerCapabilities` przypisany do endpointu agenta i walidowany przez `negotiate()` przy każdym `start`.
  - Strona autorytatywna: serwer wybiera katalog (`createSurface.catalogId`), a klient go kontroluje (`parseEvent`).
- **B2.7 [DOC]** Echo profilu: każda ramka niesie `profile`. Niezgodność jest fatalna (B2.2).

**Wersjonowanie**
- **B2.8 [DOC]** AG-UI:
  - `RUN_STARTED.protocolVersion` MUST mieć major `1`;
  - brak pola albo inny major → `profile:AGUI_VERSION` (fatalne). Profil wymaga `outcome` z AG-UI 1.0, więc producent 0.x nie wyrazi `awaiting_action`;
  - nowszy minor: kontynuować i ostrzec w konsoli (F10).

  Rozstrzyga **D18**.

**Połączenie i reconnect (D14)**
- **B2.9 [DOC]** Stan połączenia (`connected` | `reconnecting` | `offline`) to oś niezależna od `RunStatus` (D14, zmienione przez właściciela). Ucięcie biegu w `running`, ucięcie biegu akcji albo błąd sieci lub `5xx` przed odpowiedzią dla biegu kontynuacji oznacza:
  - stan `reconnecting`; **status przebiegu bez zmian**;
  - **bieg resync**: ten sam `threadId`, nowy `runId`, `forwardedProps.flowassist.resync = { surfaces: [<surfaceId trzymane przez klienta>] }`, **bez** `resume` i bez akcji;
  - próby po 1 s, 2 s i 4 s od ucięcia albo od poprzedniej nieudanej próby. Udana próba (`RUN_STARTED` biegu resync) → `connected`;
  - **po 3 nieudanych próbach** połączenie przechodzi w `offline`, a **przebieg zostaje wznawialny**:
    - status logiczny (`running` / `awaiting_action`) się nie zmienia;
    - **sieć nigdy sama nie daje terminalnego `error`**. Kod `transport:CONNECTION_LOST` nie istnieje;
  - wznowienie z `offline` to nowa seria prób (1/2/4 s), uruchamiana:
    - jawnie przez użytkownika (kontrolka „Połącz ponownie” w HUD, `reconnect()` transportu);
    - albo raz przez zdarzenie przeglądarki `online`;
  - przebieg w `offline` kończy tylko użytkownik (`stop`, restart) albo agent po wznowieniu;
  - `stop()` przerywa wszystko (abort żądania, koniec serii prób).
- **B2.10 [DOC]** Obowiązek agenta w biegu resync. Ramkami odtwarza **pełny bieżący stan**:
  - dla każdego swojego surface'u, który klient trzyma: `updateComponents` (wszystkie komponenty) + `updateDataModel` bez `path` (całość);
  - dla swojego, którego klient nie trzyma: `createSurface` + to samo;
  - dla trzymanego przez klienta, którego agent już nie ma: `deleteSurface`;
  - na końcu `stage` (bieżące) i `narration` (bieżący tekst albo `null`, `speak: false`);
  - bieg kończy bieżącym wynikiem lifecycle. Otwarty interrupt jest podnoszony ponownie (AG-UI pozwala na to przy nieopłaconym interrupcie).
  - Klient **nie resetuje układu**: nie ma `deleteSurface` dla trzymanych surface'ów, a członkostwo wynika z `children` (P6).
- **B2.11 [DOC] (wyrównane do D14 po review advisora, 2026-10-07):** bieg startu podlega tym samym regułom sieci.
  - Przyczyna sieciowa (sieć, `5xx`, `408`, `429`) uruchamia serię resync ze `scenario` i `surfaces: []` (start niepotwierdzony); terminalnego `error` z sieci nie ma.
  - `4xx` (poza `408`/`429`) daje `transport:INPUT_REJECTED`.
  - Odpowiedź inna niż `200` + SSE daje `agui:PROTOCOL_VIOLATION`.
- **B2.12 [DOC] Reguła pochodna** (D10 + D14 + pokrycie interruptów AG-UI; właściciel może ją zawetować): jeśli POST biegu akcji padł przed `RUN_STARTED`, resync MUSI pokryć otwarty interrupt wpisem `{interruptId, status: "cancelled"}` bez `payload`.
  - To porzucenie, a nie replay akcji.
  - Agent traktuje je jako „decyzja nie zapadła” i podnosi interrupt ponownie.

### B3. Raportowanie

- **B3.1 [DOC]** Dwie klasy, rozdzielone zgodnie z F14:
  - **raport A2UI** (`{version:"v0.9.1", error}`, schemat upstream) **tylko** wtedy, gdy surface jest znany i poprawny (`surfaceId` ∈ `SURFACE_IDS`);
  - **diagnostyka profilu** dla wszystkiego bez surface'u: `{ code, message, frame?: { runId: <runId AG-UI>, seq }, path? }`.
- **B3.2 [DOC]** Zamknięta lista kodów.

  Raport A2UI:
  - `VALIDATION_FAILED` (upstream);
  - `SURFACE_EXISTS`, `SURFACE_NOT_FOUND` (reducer).

  Diagnostyka profilu:
  - `ENVELOPE_REJECTED` (koperta odrzucona, surface nieustalony);
  - `STAGE_REJECTED`;
  - `NARRATION_REJECTED`;
  - `MESSAGE_TOO_LARGE` (B4a).

  Status przebiegu (`error`, format `<przestrzeń>:<KOD>[: szczegół]`):
  - `negotiation:*` (P1.7a);
  - `profile:FRAME_INVALID`, `profile:FRAME_SEQUENCE`, `profile:EVENT_TOO_LARGE`, `profile:AGUI_VERSION`, `profile:UNSUPPORTED_INTERRUPTS`, `profile:UNEXPECTED_TOOL_CALLS`;
  - `agui:PROTOCOL_VIOLATION` (weryfikacja `@ag-ui/client`);
  - `agent:*`;
  - `transport:INPUT_REJECTED`. Sieć nie kończy przebiegu (B2.9, B2.11); kodów błędu sieciowego nie ma.
- **B3.3 [DOC]** Konwencja `path` (wskaźnik RFC 6901, segmenty oparte na `id`, nigdy na indeksie). Rodzinę rozpoznaje się po pierwszym segmencie:
  - **koperta odrzucona na granicy:** pierwszy segment to klucz payloadu, np. `/version`, `/createSurface/catalogId`, `/updateComponents/components/{id}/children`, `/updateDataModel/path`;
  - **problem stanu po przyjęciu:** `/components/{id}{wskaźnik propsa}` (obecna konwencja `workspace.ts`, `resolveTree.ts`) oraz `/dataModel{path}`.

  Segment `{id}` MUST być escapowany według RFC 6901. Dziś nie jest, a rozwiązuje to **D19** (rekomendacja: zakaz `/` i `~` w `id` i `children`, bo wtedy escapowanie jest niepotrzebne).
- **B3.4 [DOC]** Dostarczenie (F1, **D13**). Raporty i diagnostyka **nie uruchamiają biegu**.
  - Klient zbiera je i dołącza do **następnego** biegu (akcji albo resync) w `forwardedProps.flowassist.a2uiErrors` / `diagnostics`.
  - Limit to 32 pozycje: najstarsze odpadają z ostrzeżeniem w konsoli.
  - Pozycje są potwierdzone przez `RUN_STARTED` biegu, który je niósł.
  - Po stanie terminalnym przebiegu niewysłane raporty przepadają (jak dziś po `done`).
- **B3.5 [KOD-0, D7]** Wariant diagnostyczny `parseEvent`: patrz §4.

### B4. Reguły danych dla adaptera (Q1, ST-4)

- **B4.1 [DOC]** Atomowość:
  - błąd strukturalny wykryty na granicy (kształt koperty, `id`/`children`, limity FU-3, klucze FU-4, B4.3, B4.4) odrzuca **całą** kopertę, łącznie z `updateComponents`, nawet gdy zła jest jedna pozycja (jak OBS-4: bez częściowej konsumpcji);
  - błąd semantyczny propsów po przyjęciu daje fallback **elementu** z raportem (stan obecny, `validationReporting.ts`).
- **B4.2 [DOC]** Binding to wartość propsa **najwyższego poziomu**: obiekt z dokładnie jednym własnym kluczem `path` typu string (`isBinding`). `{path}` zagnieżdżony głębiej to **dana**, a nie binding.
- **B4.3 [P1.6]** Q1: binding w propsie spoza `CATALOG_PROPS[component]` → koperta odrzucona, `VALIDATION_FAILED` `/updateComponents/components/{id}/{prop}`. Ścieżka ST-1(b) „binding poza katalogiem = pending” staje się nieosiągalna z transportu, ale zostaje dla `devDispatch`.
- **B4.4 [P1.6]** ST-4, wariant symetryczny (a): binding w `WorkspaceItem.presentation` albo `WorkspaceItem.priority` (lista `literalOnlyProps` w `PROFILE_RULES`) → koperta odrzucona z raportem jak B4.3. Jedna reguła, bez wariantu „ignorowane przez układ”.

### B4a. Granica danych adaptera

- **B4a.1 [DOC]** Świeżość: adapter przekazuje do `transportDispatch` **wynik round-tripu JSON** (`JSON.parse(JSON.stringify(message))`) pola `frame.message`. Nie przekazuje obiektów dzielonych z potokiem `@ag-ui/client`, nie zatrzymuje referencji i nie mutuje. Tym samym spełnia założenie guarda FU-4 (ADR 0002).
- **B4a.2 [DOC, D15]** Limity:
  - **zdarzenie AG-UI** (bajty UTF-8 pola `data` jednej ramki SSE, mierzone **przed** `JSON.parse` we własnej warstwie strumienia adaptera, bo `@ag-ui/client` parsuje sam) **≤ 1 MiB**. Przekroczenie → `profile:EVENT_TOO_LARGE`, fatalne (abort);
  - **wiadomość profilu** (`JSON.stringify(frame.message)` w bajtach UTF-8) **≤ 256 KiB**. Przekroczenie → wiadomość odrzucona, diagnostyka `MESSAGE_TOO_LARGE`; `seq` liczy się dalej (niefatalne);
  - limity FU-3 bez zmian.
- **B4a.3 [DOC]** Klucz własny `__proto__`, `constructor` albo `prototype` **gdziekolwiek** w wiadomości, także w legalnych danych (nazwa kolumny, klucz mapy), odrzuca całą wiadomość. Agent MUST zmieniać nazwy takich kluczy. Raport: `VALIDATION_FAILED` ze ścieżką do klucza, jeśli surface jest znany, w przeciwnym razie `ENVELOPE_REJECTED`.

### B4b. Tablice w ścieżce `updateDataModel` (ADR 0002 „Otwarte” 4, D16)

Stan dziś (`jsonPointer.ts: setAt`):
- zapis pod indeksem = długość dopisuje element;
- zapis pod indeksem > długość tworzy dziury;
- usunięcie elementu tablicy robi `splice` (skraca ją i przesuwa indeksy), wbrew A2UI v0.9.1 (F13).

Reguła rekomendowana **[P1.6]**:
- **B4b.1** Zapis pod indeksem `< długość` zastępuje, a `= długość` dopisuje (jak `add` w RFC 6902). **`> długość` → koperta odrzucona**, `VALIDATION_FAILED` `/dataModel{path}`. Dziur nie da się wyrazić w JSON, a bindingi by je czytały.
- **B4b.2** Usunięcie (brak `value`) elementu tablicy **zachowuje długość**, a element staje się `undefined`. To dosłownie A2UI v0.9.1. Walidatory treści traktują `undefined` jak brak wartości (fallback z raportem, a nie wyjątek).
- **B4b.3** Reguła dotyczy też segmentów pośrednich. Klucze obiektów bez zmian.
- Zmiana kontraktu w `jsonPointer.ts` (nie jest na liście kernela, ale woła go reducer) wymaga jawnej zgody i nowych śladów replay, jeśli korpus to obejmie.

### B5. Wersja koperty (zamyka ADR 0002 „Otwarte” 1)

- **B5.1 [DOC]**
  - wejście: `version` ∈ {`v0.9`, `v0.9.1`}, uzasadnione schematem upstream v0.9.1 (F15); wyjście: zawsze `v0.9.1`;
  - **A2UI v1.0 (Candidate) jest odrzucane** (`VALIDATION_FAILED` `/version`, jeśli surface znany, w przeciwnym razie `ENVELOPE_REJECTED`). v1.0 zmienia między innymi semantykę usuwania (F13), więc to przyszły profil `flowassist-transport/2`, a nie rozszerzenie /1.
- **B5.2 [DOC]** „Otwarte” 2 (mechanizm handshake'u) było już zamknięte w P1.7a. „Otwarte” 3 (lifecycle w AG-UI) zamyka B2.3.

### B6. Akcje (I9)

- **B6.1 [DOC]** Akcja semantyczna to **nowy bieg AG-UI**, który odpowiada na otwarty interrupt `flowassist.awaiting_action`:
  ```json
  "resume": [{ "interruptId": "<id>", "status": "resolved",
               "payload": { "version": "v0.9.1", "action": { "...": "koperta A2UI action" } } }]
  ```
  - `payload` jest dokładnie kopertą klient → serwer A2UI (schemat upstream).
  - `context.workspace` to migawka układu **bez współrzędnych**, z `itemId` (bez zmian).
- **B6.2 [DOC]** Tożsamością akcji jest `runId` biegu, który ją niesie. Potwierdzeniem przyjęcia jest `RUN_STARTED` tego biegu. Pole „id akcji” poza tym nie jest potrzebne (realizuje B6 z planu v2.2 bez nowego pola).
- **B6.3 [DOC, D12, zmienione przez właściciela]** Akcja w trakcie aktywnego biegu, w `reconnecting` albo w `offline` (F1):
  - klient trzyma **najwyżej jedną oczekującą akcję**. Pierwsza staje się oczekującą;
  - każda kolejna, gdy jedna już czeka, jest **odrzucana lokalnie** z komunikatem dla użytkownika. Nie zastępuje oczekującej i nie trafia do żadnej kolejki;
  - oczekująca akcja jest wysyłana dopiero wtedy, gdy bieżący bieg (albo resync) zakończy się wynikiem `awaiting_action`;
  - po `done`, `error`, `cancelled` albo `stop` oczekująca akcja przepada z komunikatem;
  - akcja oczekująca **nigdy nie była wysłana**, więc jej późniejsze wysłanie nie jest ponowieniem (B6.4).
- **B6.4 [DOC]** **Żadna wysłana akcja nie jest ponawiana automatycznie (brak replay)**: profil/1 nie klasyfikuje idempotencji, więc każda akcja semantyczna jest traktowana jako nieidempotentna.
  - Akcja jest „wysłana” od chwili wysłania żądania HTTP z jej `resume`.
  - Ucięcie albo błąd sieci po tej chwili oznacza, że akcja **mogła** dotrzeć. Klient nie wysyła jej ponownie i ogłasza „akcja mogła nie dotrzeć”.
  - Bieg resync nie niesie akcji. Odtworzony stan pokazuje, czy akcja zadziałała, a użytkownik może kliknąć ponownie.

### B7. `stage` / `narration`

- **B7.1 [DOC]** Należą do profilu, a nie do katalogu: są ważne niezależnie od `catalogId` i nie mają `version` ani `surfaceId`. Jadą tym samym kanałem ramek i w tej samej kolejności `seq` co koperty A2UI.
- **B7.2 [DOC]** `narration` w `CUSTOM` jest zgodne z F7. To **dyrektywa prezentacji** (podpis i TTS w HUD), a nie wiadomość rozmowy:
  - CameleON jej nie zapisuje w historii, a agent nie wznawia z niej rozmowy;
  - agent, który chce mieć wypowiedź w historii wątku, emituje ją **dodatkowo** standardowo jako `TEXT_MESSAGE_*`, które profil/1 ignoruje (B1.6);
  - semantyka standardowego zdarzenia nie jest więc przenoszona wyłącznie w `CUSTOM`.
- **B7.3 [P1.6, D17]** Ujednolicona polityka nieznanych pól: **obiekty zamknięte** zgodnie z A2UI (F15):
  - koperta: tylko `version` + jeden payload;
  - treść payloadu: tylko pola schematu upstream;
  - `stage`: `focus`, `drawer`; `narration`: `text`, `speak`;
  - nieznane pole odrzuca wiadomość z raportem B3;
  - nie dotyczy propsów komponentów: katalog i nieznane propsy jak dziś (I3, OBS-6).
  - Dziś `narration` przepuszcza nieznane klucze, a koperty ignorują nieznane pola. Zmiana obejmuje `parseEvent`, schematy P0.3 i ewentualnie ślady replay.

### B8. Polityka katalogu

- **B8.1 [DOC]**
  - `catalogId` = kontrakt komponentów; nowy identyfikator tylko przy zmianie tego kontraktu;
  - obsługiwane reprezentacje = capabilities (`flowassist.kinds`, D2);
  - rozszerzenie `flowassist` jest obowiązkowe;
  - bazowy tryb A2UI to przyszły osobny profil;
  - katalogi inline nie są wspierane (I10).
  - Korekta zdania w planie v1.3.2 (P1.7: „rozszerzenie listy obsługiwanych reprezentacji wymaga nowego identyfikatora katalogu”) poza repo.

---

## 4. D7 — diagnostyczny `parseEvent`

| | (a) **koniec P1.7b**, czysty refaktor | (b) pierwszy commit P1.6 |
|---|---|---|
| Treść | `parseEventDiagnostic(raw) → {ok:true, event} \| {ok:false, reason, path, surfaceId?}`; `parseEvent = ok ? event : null` | to samo |
| Zachowanie | identyczne: ta sama kolejność kontroli, ślady replay bez zmian, każda gałąź odrzucenia ma test z kodem i ścieżką (z mutacjami) | identyczne |
| Zysk | kody i ścieżki B3 da się **przetestować przed P1.6**, a P1.6 dostaje stabilne API | P1.7b zostaje czysto dokumentacyjne |

**Rekomendacja: (a).** To zmiana `contract.ts` (stop-gate), ale bez zmiany zachowania. Kody przyczyn tworzą zamkniętą listę, mapowaną 1:1 na B3.2/B3.3:
- `NOT_OBJECT`, `RESERVED_KEY`, `PAYLOAD_COUNT`;
- `STAGE_INVALID`, `NARRATION_INVALID`;
- `VERSION_UNSUPPORTED`, `SURFACE_UNKNOWN`, `CATALOG_MISMATCH`;
- `COMPONENT_INVALID`, `PATH_INVALID`, `PATH_LIMIT`.

---

## 5. Macierz pokrycia (każdy wiersz = reakcja adaptera; puste pole = brakująca reguła)

| Wejście | Reakcja adaptera | Status CameleON | Połączenie | Raport | Reguła |
|---|---|---|---|---|---|
| `start`, negocjacja nieudana | brak żądania HTTP | `error` `negotiation:*` | — | — | P1.7a |
| POST dowolnego biegu: sieć / 5xx / 408 / 429 | resync (start: ze `scenario`) | bez zmian | `reconnecting` | — | B2.9, B2.11 |
| POST dowolnego biegu: 4xx (poza 408/429) | — | `error` `transport:INPUT_REJECTED` | — | — | B2.11 |
| resync po POST akcji bez `RUN_STARTED` | `resume` z `cancelled` bez `payload` | bez zmian | `reconnecting` | — | B2.12 |
| `RUN_STARTED` żądanego biegu, major 1 | potwierdza akcję i raporty | `running` | `connected` | — | B2.3, B6.2, B3.4 |
| `RUN_STARTED` bez wersji / inny major | abort | `error` `profile:AGUI_VERSION` | — | — | B2.8 |
| biegi replayu (inny `runId`) | pominięte w całości | — | — | — | B1.7 |
| `CUSTOM flowassist.frame` poprawna | round-trip → `transportDispatch` | — | — | — | B1.5, B4a.1 |
| ramka: zły kształt / profil | abort | `error` `profile:FRAME_INVALID` | — | — | B2.2 |
| ramka: luka / duplikat / kolejność `seq` | abort | `error` `profile:FRAME_SEQUENCE` | — | — | B2.1 |
| ramka: wiadomość > 256 KiB | pominięta | — | — | `MESSAGE_TOO_LARGE` | B4a.2 |
| zdarzenie > 1 MiB | abort | `error` `profile:EVENT_TOO_LARGE` | — | — | B4a.2 |
| wiadomość odrzucona przez `parseEvent`, surface znany | pominięta | — | — | `VALIDATION_FAILED` (ścieżka B3.3) | B3, D7 |
| wiadomość odrzucona, surface nieznany / `stage` / `narration` | pominięta | — | — | `ENVELOPE_/STAGE_/NARRATION_REJECTED` | B3 |
| klucz zarezerwowany w wiadomości | pominięta | — | — | jak wyżej | B4a.3 |
| binding poza `CATALOG_PROPS` / w `presentation`,`priority` | koperta pominięta | — | — | `VALIDATION_FAILED` | B4.3, B4.4 |
| `updateDataModel` indeks > długość | koperta odrzucona | — | — | `VALIDATION_FAILED` `/dataModel…` | B4b |
| `CUSTOM` o innej nazwie, `RAW`, `TEXT_*`, `TOOL_*`, `STATE_*`, `ACTIVITY_*`, `STEP_*`, `SUBAGENT_*`, `REASONING_*`, `MESSAGES_SNAPSHOT` | ignorowane (log dev) | — | — | — | B1.6 |
| nieznany typ zdarzenia | odrzucany przez potok `@ag-ui/client` z ostrzeżeniem | — | — | — | F11 |
| naruszenie AG-UI (zdarzenie przed `RUN_STARTED`, po zamknięciu…) | abort | `error` `agui:PROTOCOL_VIOLATION` | — | — | F11, B3.2 |
| `RUN_FINISHED` interrupt `flowassist.awaiting_action` ×1 | zapamiętaj, ustal na końcu strumienia | `awaiting_action` | — | — | B2.3 |
| `RUN_FINISHED` interrupt — inny zestaw | — | `error` `profile:UNSUPPORTED_INTERRUPTS` | — | — | B2.3 |
| `RUN_FINISHED` success / brak `outcome` / nieznany `outcome` (usunięty → success) | ustal na końcu strumienia | `done` | — | — | B2.3, F2 |
| `RUN_FINISHED` success + `pendingToolCallIds` | — | `error` `profile:UNEXPECTED_TOOL_CALLS` | — | — | B2.3 |
| `RUN_FINISHED` cancelled | — | **D11** | — | — | B2.3 |
| `RUN_ERROR` (także spóźniony, przed końcem) | — | `error` `agent:*` | — | — | B2.3 |
| ucięcie przed zdarzeniem terminalnym | resync ×3 (1/2/4 s) | **bez zmian, także po 3 próbach** (przebieg wznawialny) | `reconnecting` → `connected` / `offline` | — | B2.9 |
| `offline` + „Połącz ponownie” albo zdarzenie `online` | nowa seria resync (1/2/4 s) | bez zmian | `reconnecting` | — | B2.9 |
| zerwanie po zdarzeniu terminalnym | traktowane jak czysty koniec | wg zapamiętanego wyniku | — | — | B2.3 |
| `stop()` użytkownika | abort, kolejka i raporty czyszczone | `idle` (store) | — | — | B1.3, B6.3 |
| akcja w `running` / `reconnecting` / `offline`, brak oczekującej | staje się oczekującą (jedyną) | — | — | — | B6.3 |
| akcja, gdy jedna już oczekuje | odrzucona lokalnie z komunikatem | — | — | — | B6.3 |
| ucięcie / błąd sieci po wysłaniu biegu akcji | **bez ponowienia akcji**, resync, komunikat „mogła nie dotrzeć” | bez zmian | `reconnecting` | — | B6.4, B2.9 |
| ramka poza otwartym biegiem (przed pierwszym `RUN_STARTED`, po zdarzeniu terminalnym) | abort (potok AG-UI) | `error` `agui:PROTOCOL_VIOLATION` | — | — | B2.1b, F11 |
| akcja w `awaiting_action` | nowy bieg z `resume` | `running` po `RUN_STARTED` | — | — | B6.1 |
| raport renderera (`send(error)`) | do kolejki raportów, przy następnym biegu | — | — | — | B3.4 |

---

## 6. Zakres P1.7b po zgodzie (commity, bramki)

1. **[DOC]** `docs/protocol/flowassist-transport-1.md`:
   - reguły B1–B8, B4a, B4b z kategoriami;
   - macierz §5;
   - obowiązki agenta (producenta profilu) jako lista kontrolna;
   - blok maszynowy (JSON w dokumencie) dla testu parytetu.

   ADR 0002:
   - zamknięcie „Otwarte” 1 i 3;
   - reguła „Otwarte” 4 → B4b;
   - definicja ramki osi 3.

   README modułu i `AGENTS.md`: tylko odnośnik.
2. **[DOC]** Schematy w `src/features/aiui/schemas/flowassist-transport-1/`:
   - `frame.schema.json`;
   - `forwarded-props.schema.json`;
   - `server-capabilities.schema.json` (rozszerzenie);
   - `diagnostic.schema.json`;
   - `interrupt.schema.json` (`reason`, brak `expiresAt`).

   Test: przykłady z dokumentu walidują się (Ajv 2020).
3. **[KOD-0]** `PROFILE_RULES` rozszerzone o:
   - `frameName`, `aguiMajor`, `limits.eventBytes` / `messageBytes`;
   - `literalOnlyProps`;
   - kody diagnostyki i statusów.

   Strażnik dryfu: świadomie zmieniony literał. **Test parytetu** dokument ↔ `PROFILE_RULES`. Bez zmiany zachowania (ślady, e2e).
4. **[KOD-0]** D7 (jeśli (a)): `parseEventDiagnostic`. Ślady replay identyczne, testy gałęzi z mutacjami.

Bramki:
- vitest, pełny tsc (1 znany Lanyard), ślady replay bez zmian;
- e2e tylko przy commicie 3–4 (sanity), `next build`;
- recenzent Claude co 1–2 commity;
- **Astra** (inference.sh, za zgodą na wydatek) na dokument + diff.

**Kryteria zamknięcia P1.7b:**
1. B1–B8, B4a i B4b mają reguły normatywne.
2. Schematy istnieją.
3. Parytet dokument ↔ `PROFILE_RULES` przechodzi.
4. ADR 0002 „Otwarte” 1 i 3 zamknięte, a 4 rozstrzygnięte.
5. Macierz §5 jest bez pustych pól.
6. Claude GO i Astra GO.

## 7. Co P1.6 implementuje (wynik profilu, każdy punkt za zgodą)

- adapter na `@ag-ui/client` 1.0.2 (HTTP + SSE) z własną warstwą strumienia mierzącą bajty (B4a.2);
- ramki z kontrolą `seq` (B2.1), lifecycle (B2.3), resync i `offline` (B2.9–B2.10), jedna oczekująca akcja (B6.3), raporty przy następnym biegu (B3.4);
- addytywne API transportu (**D20**):
  - stan połączenia (`connected` / `reconnecting` / `offline`), `reconnect()` (wznowienie z `offline`) i komunikaty dla UI (odrzucona akcja, akcja mogła nie dotrzeć, przepadła oczekująca);
  - `BackendCall.kind` z `'resync'`;
  - ewentualnie status `cancelled` (D11);
- **zmiany zamkniętych artefaktów P1.7a (D13):**
  - przypadek 2 testu zgodności („błędy renderera też dają natychmiastowe `continue`”) zmienia się na „raport jedzie w ciele następnego wywołania”;
  - mock robi to samo (D4);
- egzekwowanie B4.3 i B4.4, B4b (`setAt`), B7.3 (zamknięte obiekty), D19 (znaki `id`);
- UI: wskaźnik połączenia w HUD, komunikaty kolejki i braku dostarczenia akcji;
- e2e.

## 8. Poza zakresem

- A2UI v1.0 (profil /2);
- tryb bazowy A2UI bez rozszerzenia;
- konwencja middleware (b);
- binding protobuf;
- `sendDataModel`;
- katalogi inline;
- AG-UI `state`, `tools`, `context` w profilu/1.

## 9. Decyzje właściciela

**Stan 2026-10-06:**
- **Zatwierdzone zgodnie z rekomendacją:** D3, D6 (+ doprecyzowanie B2.1a–e), D7, D9, D10, D11, D13, D15, D16, D17, D18, D19, D20.
- **Zmienione przez właściciela:**
  - D12: najwyżej jedna oczekująca akcja, bez replay;
  - D14: po próbach `offline`, przebieg wznawialny, bez terminalnego `error` z sieci.

Tabela poniżej zostaje jako zapis wariantów.

**Stan 2026-10-07 (po review pakietu 1, GO WITH FIXES):**
- **H1 (właściciel):**
  - keep-alive ≤ 15 s;
  - 45 s bez żadnego ruchu SSE = zerwanie (komentarz SSE to ruch);
  - 30 s timeout nagłówków;
  - 5 s po zdarzeniu terminalnym.
- **M1 (właściciel):** akcja w locie zajmuje jedyne miejsce D12 od przyjęcia do końca invocation, która ją niesie.
  - Kolejne akcje są odrzucane lokalnie.
  - Oczekująca przed wysłaniem jest sprawdzana (surface, komponent źródłowy, członkostwo `itemId`); brak źródła = porzucenie z komunikatem.
- **M2 (właściciel, zmienione):** klasyfikacja według warstwy i przyczyny, a nie pozycji zdarzenia.
  - Ponawiana jest tylko jednoznaczna awaria transportu: sieć, timeouty, `408`/`429`/`502`/`503`/`504`, zerwanie, koniec bez zdarzenia terminalnego.
  - Bez ponowień: `401`/`403` (`transport:AUTH_REJECTED`), inne `4xx`, pozostałe `5xx` (`transport:SERVER_ERROR`), nieoczekiwana odpowiedź (`transport:UNEXPECTED_RESPONSE`), błędy profilu i protokołu oraz `RUN_ERROR` agenta.
  - Adapter nie syntetyzuje błędu agenta.
- **Niepewna akcja (właściciel):** po awarii przed potwierdzeniem akcja nie jest wysyłana drugi raz; resync porzuca interrupt (`cancelled`), a agent podnosi decyzję ponownie.
- Wszystkie poprawki są naniesione w dokumencie profilu (commit poprawek pakietu 1). Pakiet 2 rusza dopiero po ponownym review.
- **Re-review (GO WITH FIXES) → decyzje właściciela N1–N3 (2026-10-07):**
  - N1: w trakcie aktywnej invocation nic nie jest wysyłane; akcja może tylko zająć wolne miejsce jako oczekująca, gdy jest bieżący interrupt; walidacja dopiero po końcu invocation;
  - N2: oczekująca przechowuje expectedInterruptId; przed wysyłką zgodność interruptId, komponentu źródłowego i tożsamości wpisu (instance), bez odcisku propsów; nowa decyzja = nowe id interruptu;
  - N3: nieprawidłowy albo brakujący wymagany runId = agui:PROTOCOL_VIOLATION, terminalnie, bez resync.

| # | Decyzja | Warianty | Rekomendacja | Blokuje | Kernel / zamknięty P1.7a? |
|---|---|---|---|---|---|
| **D3** | Profil jako dokument w repo + schematy | tak / nie | **TAK** | dokument | nie |
| **D6** | Wiązanie AG-UI | (a) `CUSTOM` ramki / (b) middleware / (c) activity | **(a)** | dokument | nie |
| **D7** | Diagnostyczny `parseEvent` | (a) koniec P1.7b, refaktor bez zmiany zachowania / (b) P1.6 | **(a)** | kod P1.7b | `contract.ts` (stop-gate), zachowanie bez zmian |
| **D9** | Źródło `ServerCapabilities` w P1.6 | statyczna konfiguracja adaptera / endpoint aplikacji / `AgentCapabilities.custom` (✗ łamie F8) | **statyczna konfiguracja** | dokument | nie |
| **D10** | Lifecycle przez interrupt | dokładnie jeden `flowassist.awaiting_action`; akcja w `resume.payload` / akcje w `forwardedProps` (konwencja middleware) | **interrupt + `resume`** | dokument | nie |
| **D11** | `RUN_FINISHED cancelled` | nowy terminalny `RunStatus 'cancelled'` (UI neutralny, bez alertu) / jawne odstępstwo: mapuj na `error` `agent:CANCELLED` | **nowy status** | P1.6 | **tak**: `store.ts: isClosed` (kernel) + `types.ts` |
| **D12** | Akcja w trakcie biegu | ~~kolejka FIFO ≤ 3~~ / **właściciel: najwyżej 1 oczekująca, kolejne odrzucane lokalnie, bez replay** | **decyzja właściciela** | dokument → P1.6 | nie (`sendAction` bez zmian) |
| **D13** | Raporty klienta | przy następnym biegu, bez własnego biegu / osobny bieg tylko z raportem | **przy następnym biegu** | dokument → P1.6 | **tak**: zmienia przypadek 2 `transportConformance.ts` i mock (zamknięty P1.7a) |
| **D14** | Reconnect | resync wg B2.9–B2.10, 3 próby 1/2/4 s; **właściciel: potem `offline`, przebieg wznawialny, bez `error` z sieci** | **decyzja właściciela** | dokument → P1.6 | nie |
| **D15** | Limity rozmiaru | zdarzenie ≤ 1 MiB (fatalne), wiadomość ≤ 256 KiB (niefatalne) / inne wartości | **1 MiB / 256 KiB** | dokument → P1.6 | nie |
| **D16** | B4b tablice | indeks ≤ długość, > długość odrzucone; usunięcie zachowuje długość (A2UI) / status quo udokumentowane | **wg B4b** | P1.6 | kontrakt `jsonPointer.ts` (woła go reducer) |
| **D17** | Nieznane pola (B7.3) | obiekty zamknięte jak A2UI / łagodnie (ignoruj wszędzie) | **zamknięte** | P1.6 | kontrakt `parseEvent` + schematy P0.3 |
| **D18** | Wersja AG-UI | wymagany major 1, brak = fatalne / tolerować brak | **wymagany major 1** | dokument | nie |
| **D19** | Znaki w `id` / `children` | zakaz `/` i `~` na granicy / escapowanie ścieżek (dotyka `workspace.ts`, kernel) | **zakaz** | P1.6 | kontrakt `parseEvent` (nie kernel) |
| **D20** | Addytywne API transportu P1.6 | stan połączenia + komunikaty + `BackendCall 'resync'` | **TAK** (zakres P1.6) | P1.6 | `types.ts` (protokół, addytywnie) |

Kolejność proponowana:
1. D3, D6, D7, D9, D10, D18 odblokowują dokument i kod P1.7b bez zmiany zachowania.
2. D11–D17, D19 i D20 przenoszą się do dokumentu jako reguły, ale ich kod czeka na P1.6.

**Stan 2026-10-07 (po review Astry P1.7b: NO-GO, 4 uwagi; decyzje właściciela A1–A4):**
- A1 (HIGH): resync dzielony na części ≤ 256 KiB w transakcji begin → części → complete; budowa na kopii stanu, publikacja atomowa po complete; przerwana transakcja odrzucana w całości; limity 1024 części / 16 MiB; bez limitu stanu surface'u do jednej wiadomości.
- A2: puste miejsca tablic w resync jako null w podstawie + odtworzenie bez value w tej samej transakcji; renderer nie widzi przejściowych null.
- A3: zakaz deleteSurface w resync tylko dla surface'ów istniejących po obu stronach; surface istniejący tylko u klienta jest usuwany.
- A4: fatalnie walidowana tylko koperta transportowa ramki; wiadomość sterująca osobno; treść wiadomości profilu niefatalnie wg §11; pełny schemat wiadomości nie jest fatalną bramką.
- Plan dalszy: Claude review → po GO weryfikacja Astry tylko na diffie tych poprawek i zmienionych sekcjach.

**Stan 2026-10-07 (weryfikacja Astry: NO-GO — A1 nieusunięte (1025 pustych miejsc > 1024 części), nowa sprzeczność 256 KiB; decyzje właściciela):**
- A1+ (wariant a z zaostrzeniem): odtwarzalność to niezmiennik KAŻDEGO zatwierdzonego stanu; stan legalny tylko, gdy deterministyczny plan kanoniczny (z odtworzeniem pustych miejsc) mieści się w ≤ 1024 częściach i ≤ 16 MiB; zmiana tworząca stan nieodtwarzalny jest odrzucana przed zatwierdzeniem jako profile:RESYNC_LIMIT, bez D14; bez recepty przepisywania tablic. Wyrocznia: transport/resyncPlan.ts.
- A5: część > 256 KiB → MESSAGE_TOO_LARGE niefatalne dla połączenia, ale przerywa całą transakcję resync (nieudana próba); RESYNC_LIMIT tylko za liczbę części albo łączny rozmiar; zakaz pominięcia części i przyjęcia późniejszego complete.

