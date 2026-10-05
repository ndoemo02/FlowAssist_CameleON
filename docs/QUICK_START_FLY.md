> **LEGACY — poza CameleONem.** Opisuje widok mapy 3D z wcześniejszego etapu projektu.
> Strona główna nie obsługuje już `?view=map` (`HomePage` nie używa `useView`);
> komponent `ImmersiveMap` jest osiągalny tylko pod `/archive/showcase` i `/archive/old_home`, a kod w `src/`
> nie ładuje już `map_lviv_ukraine.glb` (kopia była w `archive/old_maps/`, usuniętym z drzewa 2026-10-05; dostępna w historii gita do `37ee1b8`). Aktualny stan projektu: [`AGENTS.md`](../AGENTS.md).

# 🗺️ Quick Start - Fly To Address

## Szybki start (30 sekund)

1. **Otwórz mapę**
   ```
   http://localhost:3000/?view=map
   ```

2. **Wpisz adres**
   - Kliknij w pole wyszukiwania na górze ekranu
   - Zacznij wpisywać (np. "Korfantego")
   
3. **Wybierz z listy**
   - Użyj strzałek ↑↓ lub myszki
   - Naciśnij Enter lub kliknij

4. **Obserwuj przelot! 🚁**

## Przykładowe adresy do wypróbowania

### Centrum biznesowe
```
Al. Korfantego 132
Al. Korfantego 190
ul. Chorzowska 124
ul. Chorzowska 210
```

### Strefa przemysłowa
```
ul. Przemysłowa 40
ul. Magazynowa 106
ul. Magazynowa 148
```

### Parki i tereny zielone
```
Park Śląski 111
Park Śląski 280
Dolina Trzech Stawów 149
Dolina Trzech Stawów 232
```

### Osiedla mieszkaniowe
```
ul. Jasna 30
ul. Cicha 273
ul. Cicha 189
```

## Co się dzieje?

1. **Wyszukiwanie** - System znajduje obiekt w scenie 3D
2. **Przelot** - Kamera płynnie podlatuje (2 sekundy)
3. **Pulsowanie** - Obiekt świeci na cyan przez 1.5s
4. **Gotowe!** - Możesz manualnie obracać kamerą

## Wskazówki

✅ **Zacznij pisać częściowo** - Np. "Korfa" zamiast "Al. Korfantego 132"

✅ **Użyj klawiatury** - Szybsze niż myszka:
- `↓` - następna pozycja
- `↑` - poprzednia pozycja  
- `Enter` - wybierz

✅ **Sprawdź konsolę** - Naciśnij F12, aby zobaczyć logi przelotu

❌ **Błędny adres?** - Pole się potrząśnie (shake animation)

## Demo w konsoli

Możesz też przetestować funkcję bezpośrednio:

```javascript
// Otwórz konsolę (F12)

// Lista wszystkich adresów
window.mapData

// Znajdź adresy zawierające "Park"
window.filterByName("Park")

// Zobacz wszystkie obiekty w centrum (x: 0-500)
window.filterByArea(0, 500, 0, 500)
```

## Troubleshooting

**Problem:** Pole wyszukiwania nie pokazuje się
- Sprawdź czy jesteś na `?view=map`
- Odśwież stronę (Ctrl+R)

**Problem:** Kamera nie leci
- Sprawdź konsolę - czy adres istnieje?
- Poczekaj aż model się załaduje (pasek ładowania)

**Problem:** Nie widzę obiektu po przelocie
- Użyj myszki aby obrócić kamerą
- Spróbuj przybliżyć/oddalić (scroll)

---

**Więcej:** Zobacz `docs/FLY_TO_ADDRESS.md` dla pełnej dokumentacji
