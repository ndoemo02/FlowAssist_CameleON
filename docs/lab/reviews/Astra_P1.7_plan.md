# Review planu P1.7 v2.1 — Astra (openai/gpt-6-astra, inference.sh)

> 2026-10-06, task `5dxg17acha880kzd9epy7wycgc`. Wejście: `Astra P1.7 decision diff.md` + fragmenty planu v2.1 (§2, A1–A3, §4). Tokeny: 4957 wejście / 5049 wyjście.

## Werdykt: **GO WITH FIXES**

**D2: TAK — można zamknąć.** Przed implementacją P1.7a trzeba doprecyzować bramkę wysyłki i walidację rozszerzenia. Sama kolejność kroków nie gwarantuje braku obejść.

## Uwagi

- **HIGH — A2 (kroki 0–6), A3, D1/D8: brak jawnej bramki dla `send`.**  
  **Scenariusz:** przebieg A negocjuje poprawnie; nowy `start(B)` dostaje `serverCapabilities() = null` i kończy się błędem; następnie wywoływane jest `send`. A3 nakazuje pamiętać capabilities i dołączać je do kontynuacji, ale nie uzależnia wysyłki od **udanej negocjacji bieżącego przebiegu**. Fragmenty nie wykluczają więc `BackendCall` mimo porażki negocjacji.  
  **Poprawka:** każdy nowy `start` unieważnia poprzednią zgodę na wysyłkę; dopiero sukces negocjacji ją ustanawia. Po porażce lub `stop` — żadnego backendowego `send` do następnego udanego startu. Dodać przypadki do wspólnego testu. To minimalna bramka P1.7a, nie projekt reconnect.

- **MEDIUM — A1, A2 (krok 4), D3: „poprawne `kinds`” nie ma dostatecznej definicji wykonawczej.**  
  **Scenariusz:** serwer deklaruje właściwy profil i katalog, a obok wspólnej reprezentacji podaje nieznany klientowi identyfikator. Odrzucenie całego rozszerzenia blokuje ewolucję mimo działającego przecięcia; bez określonej polityki mock i przyszły adapter mogą negocjować inaczej.  
  **Poprawka:** przed P1.7a ustalić walidację typów oraz zasady dla nieznanych rodzajów/reprezentacji i pustych tablic. Rozdzielić błędny kształt (`FLOWASSIST_CAPABILITIES_INVALID`) od poprawnej deklaracji bez przecięcia (`NO_COMMON_REPRESENTATION`). Dla kompatybilności w przód preferować pomijanie nieznanych, poprawnie utypowanych identyfikatorów, o ile profil nie zamyka normatywnie ich słownika.

- **MEDIUM — §2, A2 (krok 5), A3, D4: brak wskazanego egzekwowania wyniku negocjacji.**  
  **Scenariusz:** właściwy profil i `flowassist/v2`; jeden rodzaj ma wspólną reprezentację, drugi odpada. Negocjacja przechodzi, ale agent następnie emituje odrzucony rodzaj. Sama kontrola `createSurface.catalogId` tego nie wykryje.  
  **Poprawka:** zapisać obowiązek ograniczenia emisji do wynegocjowanego `kinds` oraz wskazać kontrolę odbiorczą i reakcję na naruszenie. Mock powinien mieć taki przypadek testowy; związanie z wiadomościami można zamknąć w P1.7b. Nie trzeba wymagać przecięcia dla wszystkich rodzajów, lecz sukces nie może oznaczać gwarancji obsługi dowolnego scenariusza.

## Odpowiedź na pytanie

**Tak, rozszerzenie powinno być obowiązkowe w `flowassist-transport/1`.** Poprawny agent A2UI podający wyłącznie katalogi odpada na kroku 1; jeśli deklaruje ten profil, lecz pomija rozszerzenie — na kroku 4. To wymaganie profilu FlowAssist, nie ogólne wymaganie A2UI.

Osobne `catalogId` mają sens przy zmianie **kontraktu komponentów**, nie przy każdej kombinacji możliwości renderera. Kodowanie kombinacji w ID mnoży katalogi i może uniemożliwiać wykrycie wspólnego podzbioru. Sam wspólny katalog nie wystarcza natomiast do potwierdzenia obsługi reprezentacji; rozszerzenie ogranicza takie fałszywe pozytywy, pod warunkiem egzekwowania wyniku.

Przyszły **jawnie wybierany profil bazowy A2UI** jest czytelniejszy niż fallback po nieudanej negocjacji: ma własne minimalne gwarancje i nie zamienia błędu deklaracji profilu/1 w niejawny downgrade.

Kolejność 0–5 nie wymaga zmiany. Krok 6 opisuje reakcję, nie dodatkową kontrolę; brak obejść wymaga powyższych doprecyzowań.

## Potrzebne materiały

- Projekt walidacji rozszerzenia oraz przypadków wspólnego testu `AgentTransport`.
- Fragment kontraktu/P10 określający użycie wynegocjowanego `kinds`.

Bez repo i schematów nie potwierdzam wskazanego SHA, równoważności wersji ani pełnej zgodności semantycznej deklaracji `supportedCatalogIds`.