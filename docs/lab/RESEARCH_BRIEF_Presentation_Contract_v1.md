# Brief badawczy — CameleON Presentation Contract v1

> **Do selektywnej dystrybucji:** Perplexity, Exa, DeepSeek (analiza detektywistyczna), research katalogu inference.
> Każde pytanie ma adresata. **Nie przeglądać całego katalogu inference na ślepo.**
> **Kontekst bez sekretów:** brak kluczy, adresów wewnętrznych i danych użytkowników.

## Kontekst (wystarczający do odpowiedzi)

**CameleON** to klient webowy (Next.js + React Three Fiber, scena 3D 360°), który **renderuje** gotowe artefakty prezentacyjne:
- wykres, tabelę, KPI, mapę, slajdy;
- może dojść diagram i tekst.

Artefakty lądują jako karty, fokus albo panel na zakrzywionym ekranie.

**Granica odpowiedzialności** (decyzja właściciela):
- **producenci inference** robią research, porównania, redukcję, agregację, paginację i przygotowanie artefaktu;
- **gateway** łączy aplikacje inference ze strumieniem do klienta (AG-UI 1.0, HTTP+SSE) i trzyma migawkę do reconnect;
- **klient** waliduje, wybiera obsługiwaną reprezentację, układa, prezentuje i atomowo stosuje rewizje.

**Stan techniczny:**
- AG-UI spec 1.0 (`@ag-ui/client` 1.0.2);
- A2UI v0.9.1 jako słownik UI (zamknięty katalog `flowassist/v2`, bez HTML i JS od agenta);
- ramki aplikacji w AG-UI `CUSTOM`.

**Szkic artefaktu:**
- `artifactId`, monotoniczna `revision`, `kind`, `title`, `representations` (kolejność preferencji);
- `presentation.hint` (card | focus | screen), `content` (kompletny, ograniczony);
- `paging`, `actions`, `provenance`;
- budżet ≤ 256 KiB na artefakt i ≤ 32 artefakty na workspace.

## Pytania

### Q1 — AG-UI: nośnik artefaktu i migawka (Exa: kod i issues; Perplexity: dokumentacja)
1. Czy w ekosystemie AG-UI 1.x istnieje wzorzec dostarczania **ograniczonych artefaktów z rewizją**? Do porównania: `STATE_SNAPSHOT`/`STATE_DELTA`, `ACTIVITY_SNAPSHOT`, `CUSTOM`. Który z nich mają przyjęte implementacje (CopilotKit runtime, LangGraph, Mastra) i dlaczego?
2. Jak implementacje AG-UI rozwiązują **reconnect** przy bindingu HTTP+SSE, który nie ma wznawiania? Chodzi o: trwałość wątku po stronie runtime (np. „connect”, „loadAgentState”, checkpointer LangGraph), endpoint migawki, wzorce ETag/rewizji. Proszę o linki do kodu.
3. Czy `@ag-ui/client` 1.0.x ma API, przez które aplikacja pobiera stan wątku poza biegiem? Jeśli nie, jaki jest rekomendowany wzorzec?

### Q2 — A2UI: semantyka zastępowania całości (Exa; DeepSeek: spójność)
1. Czy A2UI v0.9.1 / v1.0 (Candidate) zakłada lub rekomenduje **zastępowanie całości** (surface, data model) zamiast drobnych aktualizacji ścieżek przy dużych danych? Co mówi o rozmiarze data modelu i paginacji?
2. A2UI v1.0 pozwala osadzić komponenty i dane w samym `createSurface`. Czy to rekomendowany wzorzec „migawki” i jak współgra z `deleteSurface`/odtworzeniem?
3. Czy istnieje w A2UI (albo jego issues) wzorzec „danych przez referencję” (zasób do pobrania), czy wyłącznie inline?

### Q3 — Katalog inference: aplikacje „Send to …” (research katalogu, celowany)
Sprawdzić **tylko** aplikacje odpowiadające: „Send to Diagram UI”, „Send to Screen Viewer”, „Send to Table/Chart UI” oraz aplikacje research / comparison / viewpoint extraction.

Dla każdej:
1. dokładna nazwa i wersja;
2. schemat wejścia i wyjścia (JSON Schema? format tabeli, wykresu, diagramu);
3. typowy rozmiar wyniku i czy jest ograniczany;
4. streaming czy wynik końcowy;
5. determinizm i koszt na wywołanie;
6. czy wynik zawiera stabilny identyfikator lub rewizję;
7. czy aplikacja umie paginować.

### Q4 — Wzorce branżowe ograniczonego UI od agenta (Perplexity; Exa: przykłady kodu)
1. Jak MCP Apps (zasoby UI), OpenAI Apps SDK (`structuredContent` + widget), Vercel AI SDK (generative UI), CopilotKit (generative UI) i Google A2UI **ograniczają** ładunek UI od agenta? Chodzi o limity, paginację, dane przez referencję i walidację po stronie klienta.
2. Który z nich rozdziela „przygotowanie danych” (agent lub narzędzie) od „renderowania” (klient) w sposób najbliższy granicy z kontekstu? Proszę o cytaty z dokumentacji.

### Q5 — Schematy treści: wykres i tabela (Perplexity; DeepSeek: ocena)
1. Kandydaci na **kanoniczny, bezpieczny** format semantyczny wykresu od producenta: podzbiór Vega-Lite, podzbiór opcji ECharts, Observable Plot (spec?), własny minimalny. Kryteria:
   - brak wykonywalnego kodu;
   - łatwa walidacja JSON Schema;
   - ograniczalny rozmiar;
   - wsparcie w generowaniu przez LLM.
2. Dla tabel: Frictionless Table Schema, JSON:API-like paging, własny `{ columns, rows }`. Jak opisać typy kolumn, formaty liczb i stronę?

### Q6 — Diagramy (Perplexity; DeepSeek)
1. Mermaid (tekst) czy JSON grafu (ELK JSON, Cytoscape JSON) jako wyjście producenta „Send to Diagram UI”? Ryzyka bezpieczeństwa renderowania (Mermaid a HTML i XSS), deterministyczny layout, ograniczenia rozmiaru.

### Q7 — Gateway: magazyn rewizji i migawka (Exa; DeepSeek)
1. Wzorce trzymania „ostatniej rewizji per `artifactId`” per wątek, z migawką do reconnect:
   - Redis lub KV;
   - checkpointer LangGraph;
   - Durable Objects;
   - `useCoAgent` i persistence w CopilotKit.
2. Wzorce idempotencji: (`artifactId`, `revision`), tombstone, kolejność `remove` vs `upsert` przy wyścigach.
3. Gdzie ograniczać budżety: tylko w gateway, tylko w kliencie czy w obu? Jakie są typowe praktyki defense in depth?

### Q8 — Proweniencja i punkty widzenia (Perplexity)
1. Czy istnieje standard lub uzus dla wyniku „comparison / viewpoint extraction”: twierdzenia z cytatami, stanowiska, poziom pewności? Jakie minimalne pola `provenance` są praktyczne do pokazania w UI?

### Q9 — Budżety prezentacyjne (DeepSeek: analiza; Perplexity: źródła UX)
1. Realistyczne górne granice czytelności dla kart 3D, panelu ekranu i telefonu w poziomie: punkty na serię, liczba serii, wiersze tabeli na stronę, węzły diagramu, długość tekstu. Ma to potwierdzić albo skorygować szkic: 8 serii × 500 punktów, 12 kolumn × 200 wierszy, 100 węzłów i 200 krawędzi, 4 000 znaków.

### Q10 — Detektyw: spójność kontraktu (DeepSeek)
Na podstawie szkicu artefaktu i operacji (`artifact.upsert`, `artifact.remove`, `snapshot.begin…complete`, `decision` z `interruptId`) znajdź sprzeczności i wyścigi. W szczególności:
- reconnect w trakcie migawki;
- rewizja starsza po nowszej;
- `remove` dla nieznanego artefaktu;
- akcja użytkownika na artefakcie, który zmienił rewizję między kliknięciem a wysłaniem;
- paginacja a akcje.

## Format odpowiedzi (dla każdego adresata)

- Odpowiedź na każde przypisane pytanie: wniosek, dowód (link i cytat albo plik:linia), poziom pewności.
- Osobno: czego nie udało się ustalić.
- Bez rekomendacji implementacyjnych poza pytaniem.
