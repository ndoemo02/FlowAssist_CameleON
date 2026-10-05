> **LEGACY — poza CameleONem.** Opisuje widok mapy 3D z wcześniejszego etapu projektu.
> Strona główna nie obsługuje już `?view=map` (`HomePage` nie używa `useView`);
> komponent `ImmersiveMap` jest osiągalny tylko pod `/archive/showcase` i `/archive/old_home`, a kod w `src/`
> nie ładuje już `map_lviv_ukraine.glb` (kopia była w `archive/old_maps/`, usuniętym z drzewa 2026-10-05; dostępna w historii gita do `37ee1b8`). Aktualny stan projektu: [`AGENTS.md`](../AGENTS.md).

# 🚁 Fly to Address - Dokumentacja

## 📌 Przegląd

System umożliwia płynny przelot kamery do wybranego adresu na mapie 3D z animacją GSAP i efektami wizualnymi.

## 🎯 Funkcjonalności

### 1. **Wyszukiwanie adresów** (Autocomplete)
- Dynamiczne podpowiedzi podczas wpisywania
- Obsługa klawiatury (strzałki, Enter, Escape)
- Nawigacja strzałkami ↑↓
- Wyróżnienie wybranej pozycji

### 2. **Animacja przelotu** (GSAP)
- Płynna animacja kamery (2 sekundy)
- Easing: `power2.inOut`
- Automatyczne targetowanie obiektu
- Inteligentny offset kamery dla optymalnego kadru

### 3. **Efekty wizualne**
- **Pulsowanie obiektu** po przylocie (1.5s)
- **Emissive glow** w kolorze cyan
- **Scale animation** - powiększenie i powrót
- **Shake animation** dla błędnych adresów

### 4. **Walidacja**
- Sprawdzanie czy adres istnieje
- Komunikaty błędów w konsoli
- Wizualna informacja o nieprawidłowym adresie

## 🚀 Użycie

### Podstawowe użycie

1. Otwórz `http://localhost:3000/?view=map`
2. W górnym pasku wpisz adres (np. "Al. Korfantego")
3. Wybierz adres z listy lub naciśnij Enter
4. Obserwuj płynny przelot kamery!

### Przykładowe adresy

```
Al. Korfantego 132
ul. Chorzowska 124
ul. Przemysłowa 40
Dolina Trzech Stawów 149
Park Śląski 111
ul. Jasna 30
ul. Cicha 273
ul. Magazynowa 106
```

## 💻 API

### `flyToAddress()`

```typescript
async function flyToAddress(
  address: string,
  scene: THREE.Object3D,
  camera: THREE.Camera,
  controls: any,
  options?: FlyToOptions
): Promise<boolean>
```

**Parametry:**
- `address` - Adres z bazy (pełna nazwa ulicy z numerem)
- `scene` - Obiekt sceny Three.js
- `camera` - Kamera Three.js
- `controls` - OrbitControls
- `options` - Opcjonalne ustawienia animacji

**Opcje:**
```typescript
interface FlyToOptions {
  duration?: number;        // Czas animacji (domyślnie: 2s)
  offsetY?: number;         // Offset wysokości kamery (domyślnie: 50)
  offsetZ?: number;         // Offset głębokości kamery (domyślnie: 50)
  pulseColor?: string;      // Kolor pulsowania (domyślnie: '#00ffff')
  pulseDuration?: number;   // Czas pulsowania (domyślnie: 1.5s)
}
```

**Zwraca:**
- `true` - Przelot zakończony sukcesem
- `false` - Adres nie istnieje lub obiekt nie został znaleziony

### Pomocnicze funkcje

#### `getAllAddresses()`
```typescript
function getAllAddresses(): string[]
```
Zwraca tablicę wszystkich dostępnych adresów (279 pozycji).

#### `searchAddresses()`
```typescript
function searchAddresses(query: string, limit?: number): string[]
```
Filtruje adresy na podstawie zapytania (dla autocomplete).

**Parametry:**
- `query` - Wpisany tekst
- `limit` - Max liczba wyników (domyślnie: 10)

#### `isValidAddress()`
```typescript
function isValidAddress(address: string): boolean
```
Sprawdza czy adres istnieje w bazie.

## 🎨 Komponenty React

### `<AddressSearch />`

Główny komponent wyszukiwania z autocomplete.

```tsx
<AddressSearch 
  onAddressSelect={(address) => console.log(address)}
  placeholder="Wpisz adres..."
  className="custom-class"
/>
```

**Props:**
- `onAddressSelect` - Callback wywoływany po wyborze adresu
- `placeholder` - Tekst placeholder (opcjonalny)
- `className` - Dodatkowe klasy CSS (opcjonalny)

## 🎬 Mechanika animacji

### 1. Wyszukiwanie obiektu
```typescript
// Znajduje mesh w scenie po ID z addressMapping
const targetMesh = findMeshById(scene, addressData.id);
```

### 2. Obliczanie pozycji
```typescript
// Pobiera pozycję światową + offset
targetMesh.getWorldPosition(targetPosition);
const cameraTarget = new Vector3(
  targetPosition.x,
  targetPosition.y + offsetY,
  targetPosition.z + offsetZ
);
```

### 3. Animacja GSAP
```typescript
gsap.to(camera.position, {
  x: cameraTarget.x,
  y: cameraTarget.y,
  z: cameraTarget.z,
  duration: 2,
  ease: 'power2.inOut',
  onUpdate: () => controls.update()
});
```

### 4. Pulsowanie materiału
```typescript
// Emissive intensity 0 → 2 → 0
gsap.to(material, {
  emissiveIntensity: 2,
  duration: 0.75,
  yoyo: true,
  repeat: 1
});
```

## ⌨️ Skróty klawiszowe

| Klawisz | Akcja |
|---------|-------|
| `↓` | Następna podpowiedź |
| `↑` | Poprzednia podpowiedź |
| `Enter` | Wybierz adres / Wykonaj przelot |
| `Esc` | Zamknij podpowiedzi |

## 🔧 Integracja z istniejącym kodem

### Mapowanie adresów

Plik `public/addressMapping.json`:
```json
{
  "Al. Korfantego 132": {
    "id": "ENTRANCE_DEFAULT001_wall_0",
    "zone": "Centrum",
    "description": "Obiekt Biznes (ENTRANCE)"
  }
}
```

### Struktura pliku
- **Klucz** - Pełny adres (string)
- **id** - Nazwa mesza w scenie GLTF
- **zone** - Strefa (Centrum, Industrial, Wypoczynek, Mieszkaniowa)
- **description** - Opis obiektu

## 🐛 Debugowanie

### Problem: Kamera nie leci
**Sprawdź:**
1. Czy adres istnieje w `addressMapping.json`
2. Czy obiekt o danym ID znajduje się w scenie
3. Konsola - szukaj błędów `❌`

```javascript
// Debug w konsoli
window.mapData // Sprawdź wszystkie obiekty
window.filterByName("ENTRANCE") // Znajdź obiekty po nazwie
```

### Problem: Obiekt nie pulsuje
**Przyczyny:**
- Materiał nie ma właściwości `emissive`
- Materiał nie jest MeshStandardMaterial/MeshPhongMaterial

**Rozwiązanie:**
Funkcja automatycznie obsługuje brak emissive (używa domyślnych wartości).

### Problem: Shake nie działa
**Sprawdź:**
- Czy Framer Motion jest zainstalowany
- Czy komponent AddressSearch jest prawidłowo zaimportowany

## 📊 Wydajność

- **GSAP** - Wydajna biblioteka animacji (używa RAF)
- **Throttling** - Autocomplete aktualizuje się przy każdym znaku (może być zoptymalizowane)
- **Mesh lookup** - O(n) traversal (dla 280 obiektów - OK)

### Potencjalne optymalizacje

1. **Debounce dla autocomplete**
```typescript
const debouncedSearch = useMemo(
  () => debounce((query) => setSuggestions(searchAddresses(query)), 300),
  []
);
```

2. **Mesh cache**
```typescript
const meshCache = new Map<string, THREE.Mesh>();
```

3. **Spatial index** (dla większych scen)
```typescript
// Quadtree lub Octree dla fast spatial queries
```

## 🎯 Przykłady użycia

### Przelot z custom opcjami
```typescript
await flyToAddress(
  "ul. Chorzowska 124",
  scene,
  camera,
  controls,
  {
    duration: 3,           // Wolniejsza animacja
    offsetY: 100,          // Wyższa kamera
    offsetZ: 100,          // Dalej od obiektu
    pulseColor: '#ff0000', // Czerwone pulsowanie
    pulseDuration: 2       // Dłuższe pulsowanie
  }
);
```

### Programowy przelot (bez UI)
```typescript
import { flyToAddress } from '@/utils/flyToAddress';

// W komponencie Three.js
const handleClick = async () => {
  await flyToAddress("Park Śląski 111", scene, camera, controls);
};
```

### Integracja z voice command
```typescript
const handleVoiceCommand = async (spokenAddress: string) => {
  // Fuzzy match do najbliższego adresu
  const matches = searchAddresses(spokenAddress, 1);
  if (matches.length > 0) {
    await flyToAddress(matches[0], scene, camera, controls);
  }
};
```

## 🚀 Roadmap

### Planowane funkcje
- [ ] Fuzzy search (Levenshtein distance)
- [ ] Historia ostatnich wyszukiwań
- [ ] Ulubione adresy
- [ ] Tour mode (automatyczny przelot przez kilka adresów)
- [ ] POI markers w 3D
- [ ] Klikanie obiektów bezpośrednio w scenie

---

**Utworzono**: 2026-01-18  
**Wersja**: 1.0  
**Zależności**: GSAP, Three.js, Framer Motion
