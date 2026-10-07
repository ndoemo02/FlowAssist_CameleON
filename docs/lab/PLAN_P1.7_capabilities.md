# P1.7 — handshake możliwości i profil transportowy `flowassist-transport/1` (plan v2)

> Status: **v2.2** (2026-10-06): decyzje właściciela D1, D4, D5, D8 = TAK. **D2 zamknięte** po review Astry (`Review P1.7 plan (Astra).md`, GO WITH FIXES; trzy poprawki naniesione: A3 + A4 (bramka wysyłki), A2a (walidacja `kinds`), A2b (egzekwowanie wyniku)). Q2 zrobione: `fe69264`. **P1.7a zaimplementowane lokalnie** (`9e0ca1b..HEAD` na `feat/aiui-prototype`, przed pushem; review Claude GO WITH FIXES → poprawki).
> Baza: `feat/aiui-prototype` @ `25a293a` (po FU-4).
> Poprzednia wersja: `PLAN_P1.7_capabilities.v1.md`. Review: `Review P1.7 plan (Claude).md`, werdykt **GO WITH FIXES**.
> Źródła: plan v1.3.2 (§2.2, P1.7, P1.6), ADR 0001/0002/0005/0007, decyzje właściciela 2026-10-06, schematy A2UI upstream (§2).

**Podział (decyzja właściciela 2026-10-06):**

- **P1.7a — capabilities w kodzie.** Typy, kompozycja capabilities, `negotiate`, kanał capabilities serwera, egzekwowanie negocjacji w mocku, testy zgodności. Q2 idzie osobnym małym commitem kernela.
- **P1.7b — zamknięcie profilu.** Dokument `flowassist-transport/1` z aneksem wiązania AG-UI, ramką, lifecycle, raportowaniem, akcjami i rozszerzeniami. Domknięcie ADR 0002 „Otwarte”.
- **P1.6 pozostaje zablokowane do zakończenia P1.7b.** „GO” dla P1.7a nie oznacza, że profil jest zamknięty.

## 1. Cel

1. Klient deklaruje agentowi, co **faktycznie** obsługuje, z jednego źródła prawdy (`catalog.ts`, `contract.ts`), w kształcie zgodnym z normatywnym schematem A2UI.
2. Profil `flowassist-transport/1` jest **zamkniętą umową** dla P1.6. Adapter AG-UI implementuje dokument, a nie dopisuje reguł w locie.
3. Wszystko, co profil ustala na stałe, jest pilnowane testami (dryf, parytet), a nie tylko opisane.

## 2. Zgodność z A2UI v0.9 / v0.9.1 (zweryfikowane 2026-10-06 na schematach normatywnych)

- Repo `google/A2UI`, `specification/v0_9{,_1}/json/{client,server}_capabilities.json`.
  - Ostatnia zmiana plików: `d6f6a62` (2026-07-06).
  - `main` w chwili sprawdzenia: `46ecc2d`.
  - Pliki v0.9 i v0.9.1 są **identyczne** (md5) i oba mają `$id` `…/v0_9/…`.
- **Opakowanie wersji (H1):**
  - klient: `a2uiClientCapabilities = { "v0.9": { supportedCatalogIds: string[]; inlineCatalogs?: … } }`, `required: ["v0.9"]`;
  - serwer: `{ "v0.9": { supportedCatalogIds?: string[]; acceptsInlineCatalogs?: boolean (domyślnie false) } }`.
- Capabilities jadą w metadanych transportu, a nie jako komunikat A2UI. To wolno, bo w A2UI katalog **wybiera serwer** (`createSurface.catalogId`).
- Autorytatywna kontrola po stronie klienta już istnieje: `parseEvent` odrzuca `createSurface` z `catalogId ≠ 'flowassist/v2'` (`contract.ts:198`). `negotiate` to kontrola spójności **przed** przebiegiem, a nie wybór katalogu.
- `inlineCatalogs` nie używamy: zamknięty, zaufany katalog (I10). `acceptsInlineCatalogs: true` po stronie serwera jest ignorowane.
- Upstream v0.9.1 sam przyjmuje `version ∈ {"v0.9","v0.9.1"}` (`server_to_client.json`, `client_to_server.json`). To uzasadnienie tolerancji OBS-3 (M5).

---

## Część A — P1.7a: capabilities w kodzie

### A1. Kształt (H1, M3, L1, L2, L3)

```ts
// transport/capabilities.ts (nowy) — składanie i negocjacja; catalog.ts eksportuje tylko część katalogową (L3)
export const TRANSPORT_PROFILE = 'flowassist-transport/1' as const;

export interface ClientCapabilities {
    /** Standard A2UI v0.9, kształt dokładnie wg client_capabilities.json (opakowanie "v0.9"). */
    a2uiClientCapabilities: { 'v0.9': { supportedCatalogIds: [typeof CATALOG_ID] } };
    /** Rozszerzenie profilu, POZA a2uiClientCapabilities. Tylko to, co może się różnić między klientami (M3). */
    flowassist: {
        profile: typeof TRANSPORT_PROFILE;
        /** Rodzaje bez obsługiwanej reprezentacji są pominięte (L1). Kolejność informacyjna; P10 bierze kolejność agenta. */
        kinds: Partial<Record<ItemKind, SupportedRepresentation[]>>;
    };
}

export interface ServerCapabilities {
    /** Profile transportowe, którymi serwer potrafi mówić (krok 1 negocjacji). */
    transportProfiles: string[];
    /** Standard A2UI v0.9, kształt dokładnie wg server_capabilities.json (krok 2–3). */
    a2uiServerCapabilities: { 'v0.9': { supportedCatalogIds?: string[]; acceptsInlineCatalogs?: boolean } };
    /** Wymagane w profilu flowassist-transport/1 (krok 4): co serwer potrafi generować dla każdego rodzaju. */
    flowassist?: { kinds: Partial<Record<ItemKind, string[]>> };
}

export interface StartRequest { scenario: string; prompt?: string; capabilities: ClientCapabilities } // wymagane
```

- **Usunięte z ładunku względem v1 (M3, L2):**
  - `representations`, bo to pole pochodne od `kinds`;
  - `envelope.send/accept`, `presentations`, `limits`, `dataRules`, `reservedKeys`.
- Te reguły są **stałe dla wersji profilu**. Żyją w `transport/profile.ts` jako `PROFILE_RULES`, wyprowadzone przez `typeof` ze stałych `contract.ts`/`catalog.ts`: `A2UI_VERSION`, `ACCEPTED_VERSIONS` (eksport jako `readonly` krotka zamiast prywatnego `Set`), `PROTOCOL_LIMITS`, `RESERVED_KEYS`, `PRESENTATIONS`.
- Opisuje je dokument profilu (P1.7b). Nie są wysyłane, więc nie powstaje trzecie źródło prawdy.
- **`catalog.ts` (L3):** eksportuje `catalogCapabilities() → { catalogId, kinds }`, policzone z `SUPPORTED_REPRESENTATIONS` ∩ `KIND_REPRESENTATIONS`. Składanie `clientCapabilities()` odbywa się w `transport/capabilities.ts` (osie 1–3 się nie mieszają).
- **`CATALOG_PROPS` (M2, część kodowa):** deklaratywna lista propsów każdego komponentu w `catalog.ts` plus test parytetu z `schemas/flowassist-v2/components.schema.json`. Walidatory bez zmian. Reguły adaptera dla Q1 i `literalOnly` należą do P1.7b.

### A2. Kanał capabilities serwera (H3, częściowo)

- `AgentTransport` dostaje **addytywny** człon `serverCapabilities(): ServerCapabilities | null`.
  - **`null` nie omija negocjacji.** W profilu/1 brak capabilities serwera przed `start` oznacza `SERVER_CAPABILITIES_UNKNOWN`, a przebieg kończy się `error`. Bez tej reguły adapter zwracający `null` obszedłby kroki 1, 4 i 5 negocjacji. Kontrola `catalogId` w `parseEvent` by tego nie wyłapała, bo generyczny agent wysyła poprawne `flowassist/v2`.
  - Kontrola `catalogId` w `parseEvent` zostaje jako druga, niezależna linia obrony.
  - Mock zwraca statyczne `ServerCapabilities`: `flowassist-transport/1`, `flowassist/v2`, `kinds` obejmujące reprezentacje używane przez scenariusze. Testy podmieniają je, żeby przejść przez każdy krok porażki.
  - Skąd biorą się capabilities w P1.6 (Agent Card, konfiguracja, odpowiedź startowa), rozstrzyga P1.7b (B2). Muszą być znane **przed** `start`.
- **`negotiate(server, client)`** (czysta funkcja w `transport/`) zwraca `{ ok: true; profile; catalogId; kinds } | { ok: false; reason }`. Kroki idą w **stałej kolejności (decyzja właściciela)**. Pierwszy niespełniony krok kończy negocjację, a `reason` należy do zamkniętej unii:

  | Krok | Pytanie | Porażka (`reason`) |
  |---|---|---|
  | 0 | Czy capabilities serwera są znane przed `start`? | `SERVER_CAPABILITIES_UNKNOWN` (`null`) |
  | 1 | Czy jest wspólny profil transportowy? (`transportProfiles` zawiera `flowassist-transport/1`) | `PROFILE_UNSUPPORTED` (także brak lub zły typ `transportProfiles`) |
  | 2 | Czy capabilities serwera są poprawne wg A2UI? (klucz `"v0.9"`, typy pól; wg zvendorowanego schematu) | `SERVER_CAPABILITIES_INVALID` |
  | 3 | Czy jest wspólny `catalogId`? | `SERVER_CATALOGS_UNDECLARED` (brak `supportedCatalogIds`: upstream pozwala, profil/1 wymaga) albo `NO_COMMON_CATALOG` |
  | 4 | Profil = `flowassist-transport/1` → czy serwer podał rozszerzenie `flowassist` z poprawnym `kinds`? | `FLOWASSIST_CAPABILITIES_MISSING` albo `FLOWASSIST_CAPABILITIES_INVALID` |
  | 5 | Czy przecięcie reprezentacji klienta i serwera jest niepuste? Przecięcie liczone per rodzaj; rodzaje z pustym przecięciem odpadają | `NO_COMMON_REPRESENTATION` (puste dla wszystkich rodzajów) |
  | 6 | Każda porażka jest jawna | przebieg kończy się `error` (`negotiation:<reason>`) **przed pierwszym zdarzeniem**; nigdy cichy fallback |

  - **A2a. Walidacja rozszerzenia `flowassist` (krok 4, Astra MEDIUM).** Słownik rodzajów i reprezentacji **nie** jest w profilu/1 zamknięty dla serwera, więc dla zgodności w przód:
    - `FLOWASSIST_CAPABILITIES_INVALID` = **błędny kształt**: `flowassist` nie jest obiektem; `kinds` nie jest obiektem; wartość nie jest tablicą stringów; klucz albo identyfikator z `RESERVED_KEYS` (spójnie z FU-4);
    - nieznany, poprawnie utypowany rodzaj albo identyfikator reprezentacji jest **pomijany**, a nie odrzucany;
    - pusta tablica jest poprawna: rodzaj nic nie wnosi do przecięcia;
    - poprawna deklaracja bez części wspólnej daje `NO_COMMON_REPRESENTATION` (krok 5), a nie `INVALID`.
  - Sukces zwraca wynegocjowany `profile`, `catalogId` i `kinds` (przecięcie, kolejność klienta). Wynik jest zamrożony na przebieg, tak jak capabilities klienta.
  - Przy wielu wspólnych katalogach wybierany jest deterministycznie pierwszy z listy klienta (dziś jest tylko jeden).
  - **A2b. Egzekwowanie wyniku negocjacji (Astra MEDIUM).** Sukces negocjacji nie gwarantuje obsługi dowolnego scenariusza, tylko ustala zobowiązanie.
    - **Zobowiązanie serwera (normatywne w profilu/1):** emituje wyłącznie elementy, których `kind` jest w wynegocjowanym `kinds`, a lista `representations` ma niepuste przecięcie z wynegocjowanymi reprezentacjami tego rodzaju.
    - **Kontrola odbiorcza klienta, bez zmiany kernela:**
      - reprezentacji, której klient nie obsługuje, P10 nigdy nie wyrenderuje (`resolveItem` → fallback `brak reprezentacji obsługiwanej przez klienta` z raportem `VALIDATION_FAILED`);
      - rodzaj spoza `ITEM_KINDS` albo reprezentacja niedozwolona dla rodzaju (`KIND_REPRESENTATIONS`) daje fallback w `validateProps` (`/kind`, `/representations/{i}`) z raportem.
      - Fałszywie pozytywne „klient to obsługuje” jest więc wykluczone po stronie klienta.
    - **Naruszenie, które klient potrafi wyrenderować** (rodzaj obsługiwany przez klienta, ale wypadły z przecięcia, bo serwer go nie zadeklarował) to niezgodność serwera, a nie ryzyko renderowania. Reakcję (tolerancja z diagnostyką albo raport) ustala P1.7b (B2/B3) razem z ramką.
    - **Mock (D4):** test statyczny sprawdza, że każdy `WorkspaceItem` w skryptach mocka mieści się w `kinds` deklarowanych przez mock. Fixture: serwer emituje reprezentację spoza obsługi klienta → fallback P10 z raportem.
  - **Nie ma trybu zgodności „sam `catalogId`”.** Agent A2UI, który podaje tylko `supportedCatalogIds`, kończy na kroku 1 albo 4. Bazowy tryb interoperacyjności A2UI bez rozszerzenia FlowAssist to w przyszłości **osobny profil/polityka**, a nie automatyczny fallback w v1.3 (D2).
- **Egzekwowanie w mocku (§6 review):** gdy negocjacja się nie udaje (także przy `null`), `start` kończy przebieg statusem `error` (`negotiation:<reason>`) **przed pierwszym zdarzeniem**. Do tego dochodzi fixture. Reguła działa od P1.7a, a nie dopiero od P1.6.

### A3. Wysyłka (§8.1, L5)

- `store.ts: startScenario` dokłada `capabilities: clientCapabilities()` do `StartRequest` (**D1 = TAK**).
  - Wartość to **snapshot zamrożony dla danego przebiegu** (głęboki `Object.freeze`, liczony raz w `startScenario`). Restart oznacza nowe `StartRequest` z nowym snapshotem o tej samej treści.
  - **Adapter nie konstruuje capabilities sam.** Używa wyłącznie `request.capabilities` ze `start`. Pilnuje tego statyczny test: pliki implementacji transportu nie importują `clientCapabilities`.
  - `startScenario` nie jest funkcją kernela (ADR 0001), ale realizuje P7 i współdzieli I6. Dostaje adnotację w ADR 0001 jako zmiana niekernelowa.
- Reguła adaptera: `send(message)` nie ma `runId` ani żądania. Adapter pamięta capabilities ze `start(runId, request)` bieżącego przebiegu i dołącza je do **każdej** kontynuacji (`send`). Po `stop()` lub po nowym `start` używa wyłącznie capabilities nowego przebiegu.
- **Bramka wysyłki (Astra HIGH).** Zgoda na wywołania backendu należy do przebiegu i ustanawia ją wyłącznie **udana negocjacja tego przebiegu**.
  - Każdy nowy `start` najpierw unieważnia zgodę poprzedniego przebiegu, zanim cokolwiek wyśle.
  - Po porażce negocjacji albo po `stop()` żadne `send` nie tworzy `BackendCall` aż do następnego udanego `start`. Komunikat jest odrzucany lokalnie (w dev z ostrzeżeniem), bez ponawiania.
  - Scenariusz z review: przebieg A negocjuje poprawnie, `start(B)` dostaje `null` i kończy się błędem, potem przychodzi `send`. Wynik: zero `BackendCall`, a capabilities A nie wyciekają do B.
  - To minimalna bramka P1.7a, nie projekt reconnect (D8).

### A4. Obserwowalny szew dla testu zgodności (§6 review)

- W `transport/types.ts` pojawia się typ `BackendCall = { kind: 'start' | 'continue'; runId: number; capabilities: ClientCapabilities; body: unknown }`.
- Każda implementacja `AgentTransport` przyjmuje w konstruktorze opcjonalny obserwator `onBackendCall?: (call: BackendCall) => void`, wywoływany dla każdego wywołania backendu (dla mocka: logicznego).
  - Bez tego „capabilities przy kontynuacji” w mocku byłoby nieobserwowalne, a test pusty.
- **Wspólny zestaw `transportConformance(factory)`** w `__tests__/transportConformance.ts` przechodzi dla `MockTransport` w P1.7a i dla adaptera AG-UI w P1.6 (warunek wejścia P1.6). Sprawdza:
  1. `start` daje `BackendCall{kind:'start'}` z capabilities tego przebiegu;
  2. `send` po `start` daje `continue` z **tymi samymi** capabilities i `runId` bieżącego przebiegu;
  3. po restarcie `continue` niesie `runId` nowego przebiegu, a starszy przebieg nie emituje już zdarzeń;
  4. po `stop` nie ma `send`/`continue`;
  5. niezgodne lub `null` `serverCapabilities()` dają `error` przed pierwszym `onEvent`;
  6. każde zdarzenie jest tagowane `runId` przebiegu (I6);
  7. **bramka wysyłki (A3):** udany `start(A)` → nieudany `start(B)` (`null` albo `NO_COMMON_CATALOG`) → `send` nie daje żadnego `BackendCall`; to samo po `stop()`; po kolejnym udanym `start(C)` `send` daje `continue` z capabilities i `runId` przebiegu C;
  8. nieudany pierwszy `start` → `send` nie daje `BackendCall`.

### A5. Q2 — osobny commit kernela (L4)

- Zakres: usunięcie nieużywanych `hint` i `priority` z wariantu `ready` `WorkspaceItemView` (`workspace.ts`). Układ czyta je wyłącznie z `workspaceMeta`.
- Bezpieczeństwo sprawdził recenzent: `ItemContent` (memo), `LiveRegions` i `replay` nie czytają tych pól. Przed zmianą autor potwierdza to sam (grep + typy: usunięcie pól z typu musi przejść `tsc` bez nowych błędów).
- Testy: przepisać `itemStates.test.ts` (ok. l. 100 i 164) oraz `workspace.test.ts:33`. Test ST-4 sprawdza **brak** pól w widoku i niezmienione `workspaceMeta`. Ślady replay bez zmian.
- Dokumentacja: adnotacja w ADR 0001 (jak przy ST-1(b)), a w ADR 0007 aktualizacja zdania ST-4 („`resolveItem` rozwiązuje je w widoku `ready`”) i oznaczenie Q2 jako zrealizowanego.
- Kolejność: pierwszy commit P1.7a, niezależnie od D2 (D5 = TAK).

### A6. Testy i bramki P1.7a

- **Zgodność z upstreamem (H1):**
  - zvendorowana, przypięta kopia `schemas/a2ui-v0.9/{client,server}_capabilities.json` (jedna kopia, SHA `d6f6a62`, plik `UPSTREAM.md` ze źródłem i md5);
  - walidacja `a2uiClientCapabilities` i capabilities mocka przez **`ajv/dist/2020`**. Istniejący `schema.test.ts` używa domyślnego Ajv (draft-07), a upstream to draft 2020-12 z zewnętrznym `$ref` do metaschematu 2020-12 — przy implementacji trzeba sprawdzić, czy Ajv2020 go rozwiązuje bez sieci;
  - rozszerzenie `flowassist` ma własny `schemas/flowassist-transport-1/client-capabilities.schema.json` i jest walidowane osobno. Upstream widzi tylko swoje poddrzewo.
- **`negotiate`:**
  - wspólny katalog; brak wspólnego; wiele katalogów agenta;
  - `null` (capabilities nieznane) → `SERVER_CAPABILITIES_UNKNOWN`;
  - po jednym przypadku porażki na każdy krok 0–5 tabeli A2, plus **kolejność**: przy kilku wadach naraz raportowany jest najwcześniejszy krok;
  - brak klucza `"v0.9"`; brak `supportedCatalogIds`; nie-stringi i zły kształt;
  - `acceptsInlineCatalogs: true` jest ignorowane;
  - brak `transportProfiles` lub tylko inny profil; brak `flowassist`; `kinds` z nieznanym rodzajem lub nie-tablicą;
  - przecięcie częściowe (część rodzajów odpada) vs puste;
  - A2a: nieznany rodzaj albo reprezentacja (poprawne typy) pomijane; pusta tablica poprawna; klucz zarezerwowany albo nie-string → `FLOWASSIST_CAPABILITIES_INVALID`; poprawna deklaracja bez części wspólnej → `NO_COMMON_REPRESENTATION`;
  - A2b: skrypty mocka mieszczą się w `kinds` mocka (test statyczny); reprezentacja spoza obsługi klienta → fallback P10 z raportem;
  - mock: każda porażka daje `error` przed pierwszym `onEvent` (D4: mock egzekwuje te same reguły co przyszły adapter).
- **Strażnik dryfu (M3):** test z **ręcznie wpisanym** oczekiwanym literałem `clientCapabilities()` i `PROFILE_RULES` dla `flowassist-transport/1`, bez `toMatchSnapshot` (bo `-u` to nieświadoma aktualizacja). Zmiana `SUPPORTED_REPRESENTATIONS`, limitów, kluczy zarezerwowanych albo wersji koperty oblewa test, dopóki ktoś świadomie nie zmieni literału albo nie podbije profilu (ADR 0002).
- **Parytet:**
  - `CATALOG_PROPS` ↔ `components.schema.json` (M2);
  - `kinds` ↔ `catalog.ts` (każda obsługiwana reprezentacja jest, żadnej nieobsługiwanej, brak pustych rodzajów).
  - Parytet dokumentu profilu ze stałymi powstaje w P1.7b.
- **Store:** `startScenario` przekazuje `capabilities` (spy transportu); snapshot jest zamrożony (próba mutacji go nie zmienia); restart daje nowe `StartRequest` z tą samą treścią; `continue` niesie dokładnie snapshot ze `start` tego przebiegu. `tsc`: fałszywe transporty bez capabilities muszą zostać poprawione, bo pole jest wymagane.
- **Wspólny test zgodności transportu** (A4) przechodzi dla `MockTransport`, a fixture negocjacji przechodzi w mocku.
- **Q2:** widok bez `hint`/`priority`, `workspaceMeta` bez zmian.
- **Bramki:**
  - vitest; pełny tsc (1 znany błąd Lanyard); ślady replay bez zmian; pełne e2e; `next build`;
  - recenzent Claude co 1–2 commity;
  - Astra (inference.sh) po P1.7a, za zgodą właściciela na wysyłkę.

---

## Część B — P1.7b: zamknięcie profilu (warunek P1.6)

> **Zastąpione 2026-10-06 przez `PLAN_P1.7b_profile.md` (v1)**: research AG-UI 1.0 i A2UI, reguły normatywne, macierz pokrycia, decyzje D3, D6, D7, D9–D20.
> Po zamknięciu P1.7a (`fdc79b6`, tag `p1.7a-closed`) dochodzi **B4b**: indeks tablicy ≥ długości w ścieżce `updateDataModel` (ADR 0002 „Otwarte” 4). Poniższa treść zostaje jako historia.

Wynik: `docs/protocol/flowassist-transport-1.md` + schematy ramki i rozszerzeń w `schemas/flowassist-transport-1/` + aktualizacja ADR 0002. Każdy punkt poniżej musi mieć w dokumencie **regułę normatywną**, a nie zapowiedź.

**B1. Wiązanie z AG-UI (H2) — research przed decyzją**, zgodnie z regułą „research per zależność tuż przed spike'iem”.

Konwencja `@ag-ui/a2ui-middleware`:
- A2UI jedzie w `ACTIVITY_SNAPSHOT` (`activityType: "a2ui-surface"`), z jednym stałym `messageId` na surface i `replace: true`;
- akcje idą w `forwardedProps.a2uiAction.userAction`, a katalog w `context`.

Konflikty z kernelem:
- ponowny `createSurface` w migawce `replace` kończy się `SURFACE_EXISTS` (ADR 0005, fixture 08);
- powtarzany `messageId` nie nadaje się na klucz deduplikacji.

Opcje do decyzji właściciela po researchu:
- **(a)** własne ramki profilu (np. AG-UI `CUSTOM`);
- **(b)** konwencja middleware z różnicowaniem migawek w adapterze.

W obu wariantach trzeba ustalić, które pole `RunAgentInput` niesie capabilities, akcje i (dla M7) `stage`/`narration`.

**B2. Ramka, lifecycle, capabilities serwera, wersjonowanie (H3).**
- **Ramka:**
  - nazwy pól i typy;
  - miejsce **poza** kopertą A2UI (`client_to_server.json` ma `maxProperties: 2`);
  - zakres `seq`: przebieg CameleON czy pojedyncze wywołanie backendu;
  - zachowanie przy luce, zamianie kolejności i duplikacie (deduplikacja po identyfikatorze, nigdy po treści — ADR 0005);
  - czy ramka obejmuje `stage`/`narration` (wspólna kolejność).
- **Lifecycle:** konkretny sygnał dla `awaiting_action` i `done`. EOF ≠ `done`. Trzeba też ustalić, czy sygnał jest rozszerzeniem profilu (a wtedy zmianą `parseEvent`) czy jest konsumowany wyłącznie przez adapter.
- **Capabilities serwera:** skąd przychodzą w P1.6 i kto jest stroną autorytatywną (serwer wybiera katalog; klient kontroluje `catalogId`).
- **Wersjonowanie:** echo profilu od serwera, nieznana wersja → `error` „niezgodny protokół”, kod i komunikat błędu negocjacji (spójne z `reason` z A2).

**B3. Raportowanie (M1).**
- Reguła dla błędów bez surface (koperta z nieznanym lub brakującym surface, odrzucone `stage`/`narration`): osobny kod albo jawna konwencja. `ClientError.surfaceId` jest dziś zamkniętą unią.
- Zamknięta lista kodów klienta: `VALIDATION_FAILED`, `SURFACE_EXISTS`, `SURFACE_NOT_FOUND` plus nowe.
- Konwencja `path` oparta na `id`, a nie na indeksie.
- Diagnostyczny wariant `parseEvent` (ścieżka i przyczyna zamiast `null`), żeby adapter nie powielał walidacji. To **zmiana kontraktu** (stop-gate właściciela). Kod idzie osobnym commitem z testami: na końcu P1.7b albo jako pierwszy commit P1.6 — do decyzji.

**B4. Reguły danych dla adaptera (M2, Q1, ST-4).**
- Czy odrzucana jest cała koperta `updateComponents`, czy jeden komponent.
- `{path}` zagnieżdżony w dosłownej treści to dana, a nie binding.
- Binding w propsie spoza `CATALOG_PROPS` → `VALIDATION_FAILED` (Q1).
- Binding w `presentation`/`priority`: reguła **symetryczna** z ST-4(a). Do wyboru: albo odrzucenie z raportem, albo „ignorowane przez układ, gotowość wstrzymana”, nie obie naraz.

**B4a. Granica danych adaptera (review FU-4, 2026-10-06).**
- Adapter parsuje każdy komunikat świeżo (`JSON.parse`, bez zatrzymywania referencji) albo robi round-trip JSON — guard FU-4 sprawdza migawkę, a store trzyma referencje.
- Limit bajtów komunikatu **przed** `JSON.parse` (dziś brak; FU-3 ogranicza tylko ścieżkę), reakcja na przekroczenie (odrzucenie + raport wg B3).
- Konsekwencja FU-4 dla agenta: klucz własny `constructor`/`prototype` także w legalnych danych odrzuca cały komunikat.

**B5. Wersja koperty (M5).** Zamknąć ADR 0002 „Otwarte” 1 (tolerancja v0.9/v0.9.1 zostaje, uzasadniona schematem upstream v0.9.1) i 2 (mechanizm handshake'u = A1–A3 + B1).

**B6. Akcje (M6, I9).**
- Identyfikator akcji w ramce, nie w kopercie, oraz potwierdzenie.
- `context.workspace` = migawka bez współrzędnych, **z `itemId`**.
- Domyślnie żadna akcja nie jest automatycznie ponawiana (reconnect bez resetu układu), chyba że profil zdefiniuje klasyfikację idempotencji. Dziś nie ma źródła dla „`approve`/`deepen` nieidempotentne”.

**B7. `stage` / `narration` (M7).**
- Należą do profilu, nie do katalogu: obowiązują niezależnie od `catalogId`, bez `version` i bez `surfaceId`.
- Polityka nieznanych pól, ujednolicona: dziś `parseEvent` odrzuca nieznane klucze `stage`, ale ignoruje `version`.
- Sposób przenoszenia w wiązaniu AG-UI (B1), bo zgodny middleware odrzuciłby je w `a2ui_operations`.

**B8. Polityka katalogu (M4).**
- Zapis w dokumencie profilu, ADR 0002 (oś 2) i planie v1.3.2 (korekta zdania o „nowym identyfikatorze katalogu”).
- Zawartość zależy od decyzji D2.

**Kryteria zamknięcia P1.7b (= odblokowanie P1.6):**
1. Dokument profilu ma regułę normatywną dla każdego punktu B1–B8.
2. Istnieją schematy ramki i rozszerzeń.
3. Test parytetu dokument ↔ `PROFILE_RULES` przechodzi.
4. ADR 0002 „Otwarte” 1–2 są zamknięte.
5. Review: recenzent Claude GO oraz Astra GO.

## 3. Poza zakresem P1.7 (→ P1.6)

- adapter AG-UI;
- ramka zdarzeń, deduplikacja i reconnect **w kodzie**;
- wysyłka `VALIDATION_FAILED` dla odrzuconych kopert;
- mapowanie lifecycle;
- egzekwowanie Q1 i negocjacji w adapterze — adapter musi przejść `transportConformance`.

## 4. Decyzje właściciela

| # | Decyzja | Blokuje | Rekomendacja |
|---|---|---|---|
| D1 | `startScenario` dokłada `capabilities` (§8.1 v1) | 1. commit kodu P1.7a | **TAK (właściciel 2026-10-06).** Pole wymagane; wartość = snapshot zamrożony dla przebiegu; adapter nie konstruuje capabilities sam, tylko dołącza snapshot do każdej kontynuacji; adnotacja w ADR 0001 |
| D2 | Reprezentacje w rozszerzeniu `flowassist` zamiast osobnych `catalogId` (§8.2 v1, M4) | 1. commit kodu P1.7a | **ZAMKNIĘTE: TAK (właściciel + Astra GO WITH FIXES, 2026-10-06).** Trzy osie: `catalogId` = semantyka komponentów (kontrakt katalogu; nowe ID tylko przy zmianie kontraktu komponentów); capabilities `flowassist` = co ten klient faktycznie renderuje; profil transportowy = jak strony się komunikują i negocjują. Rozszerzenie w profilu/1 jest **obowiązkowe**; agent podający tylko `supportedCatalogIds` odpada na kroku 1 (inny profil) albo 4 (brak rozszerzenia) — to wymaganie profilu FlowAssist, nie A2UI. Bazowy tryb A2UI = przyszły, jawnie wybierany osobny profil, nie fallback w v1.3. Do zrobienia: korekta ADR 0002 (oś 2) i planu v1.3.2 (pierwszy commit P1.7a) |
| D8 | Addytywne zmiany szwu i kontraktu | 1. commit kodu P1.7a (stop-gate: protokół) | **TAK (właściciel), tylko to, co konieczne dla P1.7a:** wymagane `StartRequest.capabilities`, kanał `serverCapabilities()`, `BackendCall` jako obserwowalny punkt testowy, interfejs potrzebny do `negotiate()` (oraz eksport `ACCEPTED_VERSIONS` dla `PROFILE_RULES`). **Bez** ramki, reconnect i lifecycle P1.6. Parsowanie i zachowanie kernela bez zmian |
| D3 | Profil jako dokument w repo + schematy (§8.3 v1) | P1.7b | **Tak**, z uzupełnieniami: zvendorowane schematy upstream, schematy ramki i rozszerzeń, zamknięcie ADR 0002 |
| D4 | Mock egzekwuje negocjację w P1.7a (A2) | P1.7a | **TAK (właściciel).** Mock egzekwuje prawdziwe reguły negocjacji, żeby nie przepuszczał niczego, czego live adapter nie przepuści |
| D5 | „Go” na Q2 (kernel, A5) | commit Q2 | **TAK (właściciel).** Osobny mały commit kernela z testem i adnotacją ADR; przed zmianą własna weryfikacja grepem/typami, że nie ma odczytów |
| D6 | B1 (a) własne ramki vs (b) konwencja middleware | P1.7b | **Bez rekomendacji przed researchem** |
| D7 | Termin kodu diagnostycznego `parseEvent` (B3) | P1.7b / P1.6 | Do decyzji po dokumencie B3 |

## 5. Mapa review → plan

| Uwaga | Gdzie | Rozstrzygnięcie |
|---|---|---|
| H1 kształt `"v0.9"` | A1, A6 | Typy wg upstream, `flowassist` poza opakowaniem, walidacja zvendorowanym schematem (Ajv 2020) |
| H2 wiązanie AG-UI | B1 | Research → D6; P1.6 zablokowane do tego czasu |
| H3 ramka / lifecycle / ServerCapabilities / wersje | A2 (kanał, `negotiate`) + B2 | Kod kanału w P1.7a, reguły w P1.7b |
| M1 raport bez surface | B3 | Reguła + kody + konwencja `path`; diagnostyczny `parseEvent` → D7 |
| M2 źródło propsów Q1 | A1 (`CATALOG_PROPS` + parytet) + B4 | Kod w P1.7a, reguły adaptera w P1.7b |
| M3 reguły w ładunku | A1, A6 | Ładunek: tylko katalog, `kinds`, profil; `PROFILE_RULES` + literał-strażnik |
| M4 sprzeczność z planem v1.3.2 | D2, A2, B8 | Jawna decyzja + obowiązkowe rozszerzenie i kolejność negocjacji + korekta ADR/planu |
| M5 polityka koperty | B5 | Zamknięcie ADR 0002 „Otwarte” 1–2 |
| M6 akcje | B6 | ID w ramce, `itemId`, brak automatycznych ponowień |
| M7 `stage`/`narration` | B7 | Poziom profilu, polityka nieznanych pól, wiązanie AG-UI |
| L1 `Partial`, kolejność | A1 | `Partial<Record<…>>`, kolejność informacyjna |
| L2 `representations` | A1 | Usunięte z ładunku |
| L3 mieszanie osi | A1 | `catalogCapabilities()` w `catalog.ts`, składanie w `transport/` |
| L4 Q2 = kernel | A5 | Adnotacje ADR 0001/0007, lista testów |
| L5 `startScenario` | A3 | Adnotacja w ADR 0001 jako zmiana niekernelowa |
| §6: upstream / `negotiate` / dryf / parytet / test zgodności / mock / `tsc` | A6, A4, A2 | Wszystkie ujęte |
| Astra HIGH: bramka `send` po nieudanej negocjacji | A3, A4 (7–8) | Zgoda per przebieg, tylko po udanej negocjacji |
| Astra MEDIUM: definicja poprawnego `kinds` | A2a, A6 | Kształt → `INVALID`; nieznane pomijane; puste OK; brak części wspólnej → krok 5 |
| Astra MEDIUM: egzekwowanie wyniku negocjacji | A2b, A6 | Zobowiązanie serwera; kontrola odbiorcza = P10 (bez zmiany kernela); reakcja na naruszenie renderowalne → P1.7b |
