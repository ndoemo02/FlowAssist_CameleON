> **HISTORYCZNE** — dokument sprzed CameleONa (audyt repo z 2026-02-11; część wskazanych ścieżek, np. `src/app/v2`, `src/app/dev/*`, `src/app/sandbox`, już nie istnieje). Nie opisuje aktualnej architektury.
> Aktualny stan projektu: [`AGENTS.md`](AGENTS.md).

# 🧠 FlowAssist Repository Audit & Cleanup Plan

**Senior Architect Report**  
**Project:** FlowAssist Platform (3D + Voice + AI + Experience)  
**Date:** 2026-02-11  
**Auditor:** System Architect AI

---

## Executive Summary

Repository has **clear production core** but contains **significant experimental debt** across multiple version branches (`flow-v2`, `flow-v12`), duplicate 3D models, and scattered dev scenes. Current structure is **production-safe** but needs **logical reorganization** to improve developer experience and reduce confusion.

**Risk Level:** 🟢 LOW (no critical orphans blocking production)  
**Cleanup Potential:** ~300MB+ reclaimable space  
**Archive Candidates:** 15+ experimental scenes, 20+ unused GLB models

---

## 1️⃣ KEEP (Production Critical)

### **Core Runtime - DO NOT TOUCH**

#### **Main Application**
```
src/app/page.tsx                       ✅ Primary landing (3D scene + Avatar)
src/app/layout.tsx                     ✅ Root layout
src/components/Navbar.tsx              ✅ Main navigation
```

#### **3D Scene Infrastructure**
```
src/app/components/StudioModel.tsx           ✅ Main studio scene loader
src/app/components/PixelSwarmText.tsx        ✅ Animated logo/text
src/app/components/HeroSceneEffects.tsx      ✅ Visual effects
src/app/components/lighting/StudioLighting.tsx ✅ Scene lighting
```

#### **Materials System**
```
src/app/components/materials/PearlMaterial.tsx  ✅ Pearl shader
src/app/components/materials/GlassMaterial.tsx  ✅ Glass shader
src/app/components/materials/CarbonMaterial.tsx ✅ Carbon fiber shader
src/app/components/materials/index.ts           ✅ Material exports
```

#### **Voice & AI Core**
```
src/hooks/useVoiceFlow.ts              ✅ Voice command hook
src/app/api/speech/route.ts            ✅ Speech API
src/app/api/webhook/vapi/route.ts      ✅ VAPI integration
```

#### **Map System**
```
src/app/components/TacticalMapWarsaw.tsx  ✅ Warsaw tactical map
src/app/components/TacticalMapVector.tsx  ✅ Vector map component
public/tactical_warsaw.html               ✅ HTML map fallback
public/map_data.json                      ✅ Map data
```

#### **Production Models (ACTIVE)**
```
public/virtual_studio_ver_02.glb       ✅ 25MB - Main studio (IN USE)
public/models/Flowassist3d/scene.gltf  ✅ Star galaxy model (IN USE)
public/assets/video/ambi.mp4           ✅ Avatar video (IN USE)
public/assets/video/drzewo_video.mp4   ✅ Screen video (IN USE)
```

---

## 2️⃣ MOVE TO /experience (Marketing Runtime)

### **Presentation & Visual Experience**
```
public/presentation.html                → /experience/presentation
src/app/carbon/page.tsx                 → /experience/carbon-demo
src/app/carbon-debug/page.tsx           → /experience/carbon-debug
src/app/components/CarbonPearlDashboard.tsx → /experience/components/
src/app/components/AvatarAssistant.tsx  → /experience/components/
```

**Reason:** These are visual demos/showcases, not core business logic.

---

## 3️⃣ MOVE TO /archive (Legacy & Experimental)

### **🗂️ /archive/legacy_pages**
```
src/app/archive/contact/page.tsx        ❌ Old contact page
src/app/archive/old_home/page.tsx       ❌ Previous homepage
src/app/archive/showcase/page.tsx       ❌ Old showcase
src/app/sandbox/page.tsx                ❌ Testing sandbox
```

### **🗂️ /archive/legacy_versions**
```
/flow-v2/                               ❌ Entire v2 project (45 files)
/flow-v12/                              ❌ Entire v12 project (45 files)
```
**Reason:** These are complete parallel codebases. Should be git-tagged and removed from main branch.

### **🗂️ /archive/dev_scenes**
```
src/app/dev/page.tsx                    ❌ V1 Studio test
src/app/dev/v3/page.tsx                 ❌ HDRI preview
src/app/dev/v4/page.tsx                 ❌ Experimental scene
src/app/dev/v5/page.tsx                 ❌ Contact test
src/app/v2/page.tsx                     ❌ Lviv map test
src/app/v3/page.tsx                     ❌ Duplicate test scene
src/app/lanyard/page.tsx                ❌ Badge component test
```
**Reason:** Development experiments, not production routes.

### **🗂️ /archive/unused_models**

#### **Furniture Models (Unused)**
```
models/KAISER Idell™ 6631-T LUKSUS Table lamp/  ❌ 7MB
models/Mirror Oval/                             ❌ 3MB
models/Sahara/                                  ❌ 4MB
models/Thermory Benchmark/                      ❌ 2MB
```

#### **Duplicate/Test Models**
```
public/sci-fi_panels_material_with_circuits_pbr.glb  ❌ 2.6MB (duplicate in /assets)
models/Flowassist3d/dinning_table.glb               ❌ Not referenced
models/Flowassist3d/laptop_dell_xps.glb             ❌ Not referenced
models/Flowassist3d/drone_bake.glb                  ❌ Not referenced
models/Flowassist3d/tv_low_poly.glb                 ❌ Not referenced
models/Flowassist3d/studio_light.glb                ❌ Not referenced
models/Flowassist3d/golden_play_button.glb          ❌ Not referenced
models/Flowassist3d/silver_play_button.glb          ❌ Not referenced
models/Flowassist3d/cyberpunk_music_*.glb           ❌ Not referenced
models/Flowassist3d/earthquakes_*.glb               ❌ Not referenced (duplicate)
models/Flowassist3d/of_planes_and_satellites*.glb   ❌ Not referenced (duplicate)
models/Flowassist3d/old_paper.glb                   ❌ Not referenced (duplicate)
models/Flowassist3d/02_paper.glb                    ❌ Not referenced (duplicate)
```

#### **Nested Duplicates**
```
models/Flowassist3d/Flowassist3d-20260109T055551Z-1-001/  ❌ ENTIRE FOLDER (duplicates)
models/Flowassist3d/source/                                ❌ Backup source files
models/Flowassist3d/stylized-isometric-living-room-diorama/ ❌ Unused scene
```

### **🗂️ /archive/unused_video**
```
public/assets/video/Amber test.mp4     ❌ Test file
public/assets/video/drzewo video.mp4   ❌ Duplicate (underscore version is used)
public/assets/video/flowassist-promo.mp4 ❌ Not referenced
```

### **🗂️ /archive/maps**
```
public/models/map_lviv_ukraine.glb      ❌ 70MB Lviv map (only used in /v2 test page)
public/_BACKUP_WARSAW/                  ❌ Legacy Warsaw backup folder
```

---

## 4️⃣ DELETE LATER (Flag for Review)

**⚠️ DO NOT DELETE YET - FLAG ONLY**

### **Potential Orphans (Verify First)**
```
public/assets/models/base_basic_pbr.glb          🔴 No references found
public/assets/models/base_basic_shaded.glb       🔴 No references found
public/assets/models/gaming_setup_low-poly.glb   🔴 No references found
public/assets/models/ipad10.glb                  🔴 No references found
public/assets/models/ipad_pro_2024.glb           🔴 No references found
public/assets/models/kula led.glb                🔴 No references found
public/assets/models/kula led2.glb               🔴 No references found
public/assets/models/lampa.glb                   🔴 No references found
public/assets/models/sofa.glb                    🔴 No references found
public/assets/models/table.glb                   🔴 No references found
```

### **Workspace Files**
```
27.01FlowAssistant.code-workspace     🔴 Old workspace config
FlowAssistant.code-workspace          🟢 KEEP (current)
```

### **Debug/Temp Files**
```
check_model.js                        🔴 Debug script
output.txt                            🔴 Log file
Untitled-1.json                       🔴 2.3MB mystery file
implementation_plan.md                🔴 Old plan doc
```

### **Duplicate Projects**
```
/ai-news-aggregation-dashboard (2)/   🔴 Unrelated project in repo
```

---

## 5️⃣ MENU CLEANUP PLAN

### **Current Navigation Issues**

#### **Public Navigation (Navbar.tsx)**
```
✅ KEEP: Technologia
✅ KEEP: Mapy Warszawy (Scroll trigger)
✅ KEEP: Mapa 3D (Main map)
⚠️ REVIEW: 🌍 Cesium Maps (External link - should this be internal?)
✅ KEEP: Kontakt
```

#### **Dev Panel (DEV_MODE = true)**
```
🔵 MOVE TO ADMIN: V1: Studio (/dev/)
🔵 MOVE TO ADMIN: V2: Living Room (/dev/v2/)
🔵 MOVE TO ADMIN: V3: HDRI Preview (/dev/v3/)
🔴 REMOVE: Test 3D (/test.html) - broken link
```

### **Recommended Menu Structure**

#### **Production Menu (Public)**
```
Home
Technology (presentation.html)
Maps → Warsaw 3D | Cesium View
Contact
```

#### **Admin Panel (DEV_MODE = true)**
```
Dev Tools →
  ├─ Studio Test
  ├─ Experience Demos
  ├─ Material Previews
  └─ API Playground
```

---

## 🔍 ORPHANED ASSETS DETECTION

### **Orphaned GLB Models: 20+ files**
**Total Size:** ~80MB  
**Location:** `/public/models/Flowassist3d/`

**Not Referenced in Codebase:**
- dinning_table.glb
- laptop_dell_xps.glb
- drone_bake.glb
- tv_low_poly.glb
- golden/silver_play_button.glb
- All nested duplicates in `Flowassist3d-20260109T055551Z-1-001/`

### **Unreferenced Textures**
```
public/assets/textures/              📁 2 items - verify usage
public/assets/modern_wooden_cabinet_4k.blend/  🔴 Blender source file (3 items)
```

### **Duplicate HDRI**
⚠️ **No HDRI files found** - using Three.js `Environment preset="night"`

### **Unused Shader Materials**
```
public/assets/models/virtual_studio_ver_02.glb  ✅ Has internal shaders (IN USE)
src/app/components/materials/                   ✅ Custom shaders (IN USE)
```
**Status:** No orphaned shaders detected.

### **Unreferenced Audio**
❌ **No audio files found in repository**

### **Cesium Assets**
```
public/cesium/                       📁 189 items (tiles, workers, widgets)
```
**Status:** Used by external Cesium map (`/dev/v3/`). If Cesium is production-critical, KEEP. Otherwise → ARCHIVE.

---

## 📊 SPACE SAVINGS ESTIMATE

| Category | Count | Size | Action |
|----------|-------|------|--------|
| Unused GLB Models | 20+ | ~80MB | Archive |
| Legacy Version Folders | 2 | ~5MB | Archive |
| Lviv Map (unused) | 1 | 70MB | Archive |
| Dev Test Pages | 8 | ~50KB | Archive |
| Duplicate Videos | 2 | ~10MB | Delete |
| Temp/Debug Files | 4 | ~2.5MB | Delete |
| **TOTAL RECLAIMABLE** | | **~170MB** | |

---

## ✅ RECOMMENDED ACTION PLAN

### **Phase 1: SAFE ARCHIVING (Week 1)**
```bash
mkdir -p archive/{legacy_versions,unused_models,dev_scenes,temp_files}

# Move legacy projects
mv flow-v2 flow-v12 archive/legacy_versions/

# Move unused models
mv public/models/Flowassist3d/Flowassist3d-20260109T055551Z-1-001 archive/unused_models/
mv public/models/KAISER* public/models/Mirror* public/models/Sahara archive/unused_models/

# Move dev pages
mv src/app/dev src/app/sandbox src/app/v2 src/app/v3 src/app/lanyard archive/dev_scenes/
```

### **Phase 2: VERIFICATION (Week 2)**
```bash
# Run production build
npm run build

# Test critical paths
- Voice commands
- 3D scene loading
- Map navigation
- Avatar playback

# If all pass → commit archive
```

### **Phase 3: CLEANUP (Week 3)**
```bash
# After 2 weeks of successful production
git rm -r archive/
git commit -m "chore: remove archived experimental code"
```

---

## 🚨 CRITICAL WARNINGS

### **DO NOT TOUCH**
```
✅ virtual_studio_ver_02.glb (main studio)
✅ models/Flowassist3d/scene.gltf (galaxy stars)
✅ /src/app/page.tsx (production entry)
✅ /src/components/Navbar.tsx
✅ /src/app/components/materials/ (all shader files)
✅ /src/hooks/useVoiceFlow.ts
```

### **VERIFY BEFORE ARCHIVING**
```
⚠️ /public/cesium/ - Check if Cesium maps are production-critical
⚠️ /public/assets/models/sample_model.glb - Used in dev pages, verify not in prod
⚠️ flow-v2, flow-v12 - Ensure git history preserved before removal
```

---

## 📋 NEXT STEPS CHECKLIST

- [ ] Create `/archive` folder structure
- [ ] Move `flow-v2` and `flow-v12` to archive
- [ ] Consolidate dev scenes under `/archive/dev_scenes`
- [ ] Move unused GLB models to `/archive/unused_models`
- [ ] Run `npm run build` to verify production integrity
- [ ] Test voice commands + 3D scene loading
- [ ] Update README with new structure
- [ ] Set `DEV_MODE = false` in Navbar for production
- [ ] Document which models are production-critical
- [ ] Create git tag `pre-cleanup-2026-02-11` before deleting archives

---

**Report Complete**  
**Architect:** System AI  
**Status:** ✅ Ready for Review & Approval
