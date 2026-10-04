'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, useGLTF, Environment, OrbitControls, useVideoTexture, useTexture, PivotControls, TransformControls, PointerLockControls } from '@react-three/drei';
import { useControls, button, Leva } from 'leva';
import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { motion } from 'framer-motion';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
// SWITCH TO VECTOR MAP (Yellow/Golden Theme)
import TacticalMapVector from './components/TacticalMapVector';
import IntroOverlay from '@/components/IntroOverlay';
import SceneErrorBoundary from '@/components/SceneErrorBoundary';
import { useAiUi } from '@/features/aiui/store';
import AiUiOverlay from '@/features/aiui/overlay/AiUiOverlay';
import OrbitSlider from '@/features/aiui/overlay/OrbitSlider';
import ScreenAnchor from '@/features/aiui/scene/ScreenAnchor';
import ScreenAnchorProbe from '@/features/aiui/scene/ScreenAnchorProbe';
import { onScreenMeshes, registerScreenMeshes } from '@/features/aiui/scene/anchorRegistry';
import { dollyAlongView, focusDistance, frontDollyFactor } from '@/features/aiui/scene/frontFit';
import { screenCenter } from '@/features/aiui/scene/screenGeometry';
import { devToolsEnabled } from '@/lib/devTools';

// --- CONFIG ---
const CONFIG = {
    rotY: 1.64,
    hideShell: true,
    scale: 0.5,
    camOffsetLeft: 3.5,
    camOffsetDist: 3.0,
    // Desktop camera - calibrated 2026-02-12
    camPosition: [4.36, 0.58, 25.68] as [number, number, number],
    camTarget: [9.16, 0.67, 24.28] as [number, number, number],
    // Mobile camera - calibrated 2026-02-12
    mobileCamPosition: [1.01, 0.74, 28.36] as [number, number, number],
    mobileCamTarget: [5.33, 0.73, 25.86] as [number, number, number]
};

// Helper: detect mobile and return correct camera config
function getCameraConfig() {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    return {
        position: isMobile ? CONFIG.mobileCamPosition : CONFIG.camPosition,
        target: isMobile ? CONFIG.mobileCamTarget : CONFIG.camTarget,
        isMobile
    };
}

// --- TYPY ---
type CamSetupData = { position: THREE.Vector3, target: THREE.Vector3 };

type CameraCue = {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
};

// Kadr Front (ekran + avatar) — kalibracja właściciela 2026-10-04 (Leva "logPos")
const FRONT_POSITION: [number, number, number] = [4.403, 0.993, 26.098];
const FRONT_TARGET: [number, number, number] = [8.894, -0.180, 24.238];
const towards = (from: [number, number, number], to: [number, number, number], t: number) =>
    from.map((v, i) => v + (to[i] - v) * t) as [number, number, number];

const CAMERA_CUES: Record<'intro' | 'wide' | 'close', CameraCue> = {
    intro: {
        position: [1.75, 1.35, 34.8],
        target: [8.15, 0.72, 24.55],
        fov: 64
    },
    wide: {
        position: FRONT_POSITION,
        target: FRONT_TARGET,
        fov: 60
    },
    close: {
        // scroll push-in: 15% drogi od kadru Front do celu (wyliczone, bez nowych twardych liczb)
        position: towards(FRONT_POSITION, FRONT_TARGET, 0.15),
        target: FRONT_TARGET,
        fov: 55
    }
};

const MOBILE_CAMERA_CUES: Record<'intro' | 'wide' | 'close', CameraCue> = {
    intro: {
        position: [0.25, 1.15, 33.6],
        target: [4.75, 0.78, 25.7],
        fov: 66
    },
    wide: {
        position: CONFIG.mobileCamPosition,
        target: CONFIG.mobileCamTarget,
        fov: 62
    },
    close: {
        position: [1.95, 0.86, 26.9],
        target: CONFIG.mobileCamTarget,
        fov: 57
    }
};

const smoothstep01 = (value: number) => {
    const x = THREE.MathUtils.clamp(value, 0, 1);
    return x * x * (3 - 2 * x);
};

// --- KOMPONENTY SCENY ---

function StudioModel({ onCamSetup }: { onCamSetup: (data: CamSetupData) => void }) {
    const { scene } = useGLTF('/virtual_studio_ver_02.glb');
    // Restore Tree Video on the main screen
    const videoTex = useVideoTexture('/images/freeflow.mp4', { muted: false, loop: true, start: true });

    // Ensure audio works bypassing autoplay policies on first user interaction
    useEffect(() => {
        const vid = videoTex.image;
        if (!vid) return;

        const handleInteraction = () => {
            if (vid.paused) {
                vid.play().catch(e => console.log('Video play failed:', e));
            }
        };

        window.addEventListener('click', handleInteraction, { once: true });
        window.addEventListener('touchstart', handleInteraction, { once: true });

        return () => {
            window.removeEventListener('click', handleInteraction);
            window.removeEventListener('touchstart', handleInteraction);
        };
    }, [videoTex]);

    // Hardcoded camera setup from calibration
    useEffect(() => {
        onCamSetup({
            position: new THREE.Vector3(...CONFIG.camPosition),
            target: new THREE.Vector3(...CONFIG.camTarget)
        });
    }, [onCamSetup]);

    useEffect(() => {
        const screenMeshes: THREE.Mesh[] = [];
        scene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                const name = child.name.toLowerCase();

                // Ukrywanie ścian (Shell)
                child.visible = false;

                const tempBox = new THREE.Box3().setFromObject(child);
                const size = tempBox.getSize(new THREE.Vector3());
                const center = tempBox.getCenter(new THREE.Vector3());
                const distFromCenter = center.distanceTo(new THREE.Vector3(0, 0, 0));
                const maxDim = Math.max(size.x, size.y, size.z);

                // EKRAN GŁÓWNY
                const isScreenName = name.includes('object003_photostudio_1003') || name.includes('rectangle002') ||
                    name.includes('screen') || name.includes('monitor') || name.includes('tv') ||
                    name.includes('rectangle003');

                if (isScreenName) {
                    child.visible = true;
                    const mesh = child as THREE.Mesh;
                    screenMeshes.push(mesh);

                    // Fix for artifacts:
                    videoTex.wrapS = THREE.ClampToEdgeWrapping;
                    videoTex.wrapT = THREE.ClampToEdgeWrapping;
                    videoTex.minFilter = THREE.LinearFilter;
                    videoTex.magFilter = THREE.LinearFilter;
                    videoTex.flipY = true;

                    // Automatically fit video to screen bounds without stretching
                    const adjustVideoAspect = () => {
                        const vid = videoTex.image;
                        if (!vid || !vid.videoWidth || !size.y) return;
                        
                        const screenWidth = Math.max(size.x, size.z);
                        const screenHeight = size.y;
                        const screenAspect = screenWidth / screenHeight;
                        const videoAspect = vid.videoWidth / vid.videoHeight;
                        
                        if (screenAspect > videoAspect) {
                            const scaleY = videoAspect / screenAspect;
                            videoTex.repeat.set(1, scaleY);
                            videoTex.offset.set(0, (1 - scaleY) / 2);
                        } else {
                            const scaleX = screenAspect / videoAspect;
                            videoTex.repeat.set(scaleX, 1);
                            videoTex.offset.set((1 - scaleX) / 2, 0);
                        }
                        videoTex.needsUpdate = true;
                    };

                    const vid = videoTex.image;
                    if (vid) {
                        if (vid.readyState >= 1) {
                            adjustVideoAspect();
                        } else {
                            vid.addEventListener('loadedmetadata', adjustVideoAspect, { once: true });
                        }
                    }

                    mesh.material = new THREE.MeshBasicMaterial({
                        map: videoTex,
                        toneMapped: false,
                        side: THREE.DoubleSide
                    });
                    return;
                }

                // GŁADKA PODŁOGA
                if (name.includes('floor') || name.includes('ground') || name.includes('plane') || name.includes('circle')) {
                    if (distFromCenter < 100.0) {
                        child.visible = true;
                        (child as THREE.Mesh).material = new THREE.MeshStandardMaterial({
                            color: '#050505',
                            roughness: 0.05,
                            metalness: 0.8,
                            envMapIntensity: 1.0
                        });
                        return;
                    }
                }

                // SPRZĘT
                const isBanned = name.includes('box') || name.includes('wall') || name.includes('plant') ||
                    name.includes('leaf') || name.includes('rock') || name.includes('stone') || name.includes('temp') || name.includes('1002') ||
                    name.includes('decoration') || name.includes('ivy') || name.includes('vine') || name.includes('grass') ||
                    name.includes('bush') || name.includes('flower') || name.includes('geo') || name.includes('shape');

                if (isBanned) return;
                if (distFromCenter > 10.0) return;

                const isInsideSafeZone = Math.abs(center.x) < 2.5 && (center.y > -0.5 && center.y < 2.5) && Math.abs(center.z) < 3.0;
                if (isInsideSafeZone && maxDim < 1.2) {
                    if (name.startsWith('cam') || name.startsWith('flap') || name.startsWith('body')) {
                        if (!(name.startsWith('body') && maxDim > 0.5)) {
                            child.visible = true;
                        }
                    }
                }
            } else if ((child as THREE.Light).isLight) {
                child.castShadow = true;
            }
        });
        // Adapter sceny ScreenAnchor: unia wszystkich widocznych meshy ekranu
        registerScreenMeshes(screenMeshes);
    }, [scene, onCamSetup, videoTex]);

    return (
        <group>
            <primitive
                object={scene}
                position={[0, 0, 0]}
                rotation={[0, CONFIG.rotY, 0]}
                scale={[CONFIG.scale, CONFIG.scale, CONFIG.scale]}
            />
            {/* Frame in same transform space as the model */}
            <group rotation={[0, CONFIG.rotY, 0]} scale={[CONFIG.scale, CONFIG.scale, CONFIG.scale]}>
                <ScreenFrame scene={scene} />
            </group>
        </group>
    );
}

// --- Extract boundary edges from geometry (edges belonging to only 1 face) ---
function extractBoundaryLoop(geometry: THREE.BufferGeometry): THREE.Vector3[] {
    const position = geometry.attributes.position as THREE.BufferAttribute;
    let index = geometry.index;

    // Non-indexed → build sequential index
    if (!index) {
        const arr: number[] = [];
        for (let i = 0; i < position.count; i++) arr.push(i);
        geometry = geometry.clone();
        geometry.setIndex(arr);
        index = geometry.index!;
    }

    // Position key with tolerance (merge close vertices)
    const posKey = (idx: number) => {
        const x = Math.round(position.getX(idx) * 1000) / 1000;
        const y = Math.round(position.getY(idx) * 1000) / 1000;
        const z = Math.round(position.getZ(idx) * 1000) / 1000;
        return `${x},${y},${z}`;
    };

    // Count faces per edge
    const edgeMap = new Map<string, { count: number; v1: number; v2: number }>();
    for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
        for (const [v1, v2] of [[a, b], [b, c], [c, a]] as [number, number][]) {
            const k1 = posKey(v1), k2 = posKey(v2);
            const key = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
            const e = edgeMap.get(key);
            if (e) e.count++; else edgeMap.set(key, { count: 1, v1, v2 });
        }
    }

    // Boundary = edges with count 1
    const boundary: [number, number][] = [];
    edgeMap.forEach(d => { if (d.count === 1) boundary.push([d.v1, d.v2]); });
    if (boundary.length === 0) return [];

    // Build adjacency (by position key for proper vertex merging)
    const adj = new Map<string, string[]>();
    const keyToIdx = new Map<string, number>();
    for (const [a, b] of boundary) {
        const ka = posKey(a), kb = posKey(b);
        if (!keyToIdx.has(ka)) keyToIdx.set(ka, a);
        if (!keyToIdx.has(kb)) keyToIdx.set(kb, b);
        if (!adj.has(ka)) adj.set(ka, []);
        if (!adj.has(kb)) adj.set(kb, []);
        adj.get(ka)!.push(kb);
        adj.get(kb)!.push(ka);
    }

    // Walk loop
    const visited = new Set<string>();
    const loop: string[] = [];
    let cur = posKey(boundary[0][0]);
    while (!visited.has(cur)) {
        visited.add(cur);
        loop.push(cur);
        const next = (adj.get(cur) || []).find(n => !visited.has(n));
        if (!next) break;
        cur = next;
    }

    return loop.map(k => {
        const idx = keyToIdx.get(k)!;
        return new THREE.Vector3(position.getX(idx), position.getY(idx), position.getZ(idx));
    });
}

// --- PREMIUM SCREEN FRAME (boundary edge TubeGeometry) ---
function ScreenFrame({ scene }: { scene: THREE.Group }) {
    const groupRef = useRef<THREE.Group>(null);

    // Textures
    const pearlTex = useTexture('/images/pearle.webp');
    const carbonTex = useTexture('/images/carbon.webp');
    // Configure texture wrapping
    useMemo(() => {
        [pearlTex, carbonTex].forEach(tex => {
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(20, 1); // Repeat along the strip length
            tex.colorSpace = THREE.SRGBColorSpace;
        });
    }, [pearlTex, carbonTex]);

    // Leva controls
    const { frameStyle, frameVisible, frameWidth, frameThickness, fresnelBoost } = useControls('Screen Frame', {
        frameVisible: { value: true, label: '🖼️ Visible' },
        frameStyle: { value: 'Pearl', options: ['Pearl', 'Carbon'], label: '🎨 Material' },
        frameWidth: { value: 0.025, min: 0.01, max: 0.15, step: 0.005, label: '📐 Width' },
        frameThickness: { value: 0.02, min: 0.005, max: 0.1, step: 0.005, label: '📏 Thickness' },
        fresnelBoost: { value: 0.25, min: 0, max: 1.0, step: 0.05, label: '✨ Fresnel' }
    });

    // Extract boundary loops from all screen meshes
    const frameData = useMemo(() => {
        const screenNames = ['object003_photostudio_1003', 'rectangle002', 'rectangle003'];
        const meshes: THREE.Mesh[] = [];
        scene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                const n = child.name.toLowerCase();
                if (screenNames.some(s => n.includes(s))) meshes.push(child as THREE.Mesh);
            }
        });
        if (meshes.length === 0) { console.warn('⚠️ ScreenFrame: No screen mesh found'); return null; }

        scene.updateWorldMatrix(true, false);
        const sceneInv = new THREE.Matrix4().copy(scene.matrixWorld).invert();
        const results: { curve: THREE.CatmullRomCurve3; wPos: THREE.Vector3; wQuat: THREE.Quaternion; wScale: THREE.Vector3 }[] = [];

        for (const mesh of meshes) {
            const loop = extractBoundaryLoop(mesh.geometry);
            if (loop.length < 3) { console.warn(`   ⚠️ "${mesh.name}": ${loop.length} boundary verts, skipping`); continue; }

            mesh.updateWorldMatrix(true, false);
            const rel = new THREE.Matrix4().copy(sceneInv).multiply(mesh.matrixWorld);
            const wPos = new THREE.Vector3(), wQuat = new THREE.Quaternion(), wScale = new THREE.Vector3();
            rel.decompose(wPos, wQuat, wScale);

            // Calculate geometry center for expansion
            mesh.geometry.computeBoundingBox();
            const center = new THREE.Vector3();
            mesh.geometry.boundingBox!.getCenter(center);

            // Expand loop outward from center to create gap
            const expandedLoop = loop.map(p => {
                return p.clone().sub(center).multiplyScalar(1.025).add(center);
            });

            // Create closed curve using expanded points
            const curve = new THREE.CatmullRomCurve3(expandedLoop, true, 'centripetal', 0.5);

            results.push({ curve, wPos, wQuat, wScale });
        }
        return results.length > 0 ? results : null;
    }, [scene]);

    // Create extruded geometries (flat bezel)
    const bezelGeos = useMemo(() => {
        if (!frameData) return null;

        // Rectangular profile (flat strip)
        const shape = new THREE.Shape();
        const w = frameWidth / 2;
        const t = frameThickness;

        // Centered thickness (-t/2 to t/2)
        shape.moveTo(-w, -t / 2);
        shape.lineTo(w, -t / 2);
        shape.lineTo(w, t / 2);
        shape.lineTo(-w, t / 2);
        shape.lineTo(-w, -t / 2);

        return frameData.map(d => {
            const steps = Math.max(100, Math.floor(d.curve.points.length * 1.5));
            return new THREE.ExtrudeGeometry(shape, {
                extrudePath: d.curve,
                steps: steps,
                bevelEnabled: false,
                curveSegments: 12 // smooth turns
            });
        });
    }, [frameData, frameWidth, frameThickness]);

    // Mobile perf
    const isMobilePerfMode = useMemo(() => typeof window !== 'undefined' && window.devicePixelRatio < 2, []);

    if (!frameData || !bezelGeos || !frameVisible) return null;

    const isPearl = frameStyle === 'Pearl';
    const frameMat = new THREE.MeshPhysicalMaterial({
        map: isPearl ? pearlTex : carbonTex,
        color: isPearl ? '#ffffff' : '#222222', // Brighter base color for texture visibility
        roughness: isPearl ? 0.3 : 0.6,
        metalness: isPearl ? 0.1 : 0.4,
        clearcoat: 0.5,
        clearcoatRoughness: 0.2,
        side: THREE.DoubleSide,
        envMapIntensity: 2.0, // High env map to catch light
    });

    // Simple fresnel (optional, if needed)
    // Removed complex shader replace to ensure texture visibility first

    return (
        <group ref={groupRef}>
            {bezelGeos.map((geo, idx) => (
                <mesh
                    key={idx}
                    geometry={geo}
                    material={frameMat}
                    position={[frameData[idx].wPos.x, frameData[idx].wPos.y, frameData[idx].wPos.z]}
                    quaternion={frameData[idx].wQuat}
                    scale={frameData[idx].wScale}
                    castShadow receiveShadow
                />
            ))}
        </group>
    );
}

function TreeLogoModel() {
    const { scene } = useGLTF('/assets/models/sample_model.glb');

    useEffect(() => {
        scene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                // Opcjonalnie: Dodaj materiał emisyjny lub metaliczny jeśli to logo
                /*
               (child as THREE.Mesh).material = new THREE.MeshStandardMaterial({
                   color: '#00ff99',
                   metalness: 0.9,
                   roughness: 0.1
               });
               */
            }
        });
    }, [scene]);

    // Pozycja dobrana tak, aby była widoczna w kadrze (zależy od kamery)
    // Mobile Cam jest blisko (Dist 3.0), więc model musi być blisko celu
    return (
        <primitive
            object={scene}
            position={[1.5, 0.8, -0.5]}
            rotation={[0, -Math.PI / 3, 0]}
            scale={[0.8, 0.8, 0.8]}
        />
    );
}


// REPLACED STARFIELD WITH GLTF MODEL AS REQUESTED
// --- REPLACED STARFIELD WITH GLTF MODEL ---
// --- REPLACED STARFIELD WITH GLTF MODEL ---
// --- REPLACED STARFIELD WITH GLTF MODEL ---
// Added TransformControls & PivotControls for manual adjustment

function StarField() {
    const { scene } = useGLTF('/models/galaxy/scene.gltf');
    const galaxy = useMemo(() => {
        const cloned = scene.clone();
        cloned.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                // child.castShadow = true;
                // child.receiveShadow = true;
            }
        });
        return cloned;
    }, [scene]);

    // Added Leva controls for "setting the swarm"
    const {
        manualMode,
        // orbitEnabled removed - use global Free Fly Camera
        blockRotation,
        position,
        scale,
        rotationSpeed,
        opacity,
        visible
    } = useControls('Galaxy View', {
        visible: true, // RESTORED GLTF
        manualMode: { value: false, label: 'Edit Mode (Gizmo)' },
        blockRotation: { value: false, label: 'Stop Rotation' },
        position: { value: [0, -5, 0], step: 0.1 },
        scale: { value: 65, min: 1, max: 500, step: 1 },
        rotationSpeed: { value: 0.01, min: 0, max: 0.2, step: 0.001 },
        opacity: { value: 0.9, min: 0, max: 1, step: 0.1 }
    });

    // Pass orbitEnabled state up to parent (dirty hack via window or context usually, but here we can just export a signaled atom or use a ref if we refactored.
    // FOR NOW: We will use a unique approach. We'll render a separate OrbitControls just for this mode if enabled, overriding the main one.)

    useFrame((state) => {
        const t = state.clock.getElapsedTime();

        if (!manualMode && !blockRotation) {
            galaxy.rotation.y = t * rotationSpeed;

            // SUBTELNY RUCH "ODDYCHANIA" (PRZYBLIŻANIE/ODDALANIE)
            // Sprawia, że gwiazdy nie są zbyt blisko ani zbyt daleko w jednym momencie
            const pulse = scale + Math.sin(t * 0.3) * (scale * 0.05);
            galaxy.scale.set(pulse, pulse, pulse);
        } else {
            // W trybie edycji trzymamy stałą skalę
            galaxy.scale.set(scale, scale, scale);
        }

        // Update opacity if materials support it
        galaxy.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach((m: any) => {
                        m.transparent = true;
                        m.opacity = opacity;
                    });
                } else if (mesh.material) {
                    (mesh.material as any).transparent = true;
                    (mesh.material as any).opacity = opacity;
                }
            }
        });
    });

    // Wrapper for manual controls
    const Content = (
        <primitive
            object={galaxy}
            position={position}
        />
    );

    if (!visible) return null;

    if (manualMode) {
        return (
            <PivotControls
                anchor={[0, 0, 0]}
                depthTest={false}
                lineWidth={4}
                axisColors={['#9381ff', '#ff4d6d', '#7ae582']}
                scale={10}
                fixed={true}
            >
                {Content}
            </PivotControls>
        );
    }

    return Content;
}

// --- RESTORED PROCEDURAL STARFIELD (SWARM) ---
function StarSwarm({ count = 2000 }) {
    const points = useRef<THREE.Points>(null);
    const positions = useMemo(() => {
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            // Create a "ring" + "sphere" mix
            const radius = 15 + Math.random() * 40;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            // Flatten slightly to make it more like a galaxy disk
            pos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
            pos[i * 3 + 1] = (radius * Math.sin(phi) * Math.sin(theta)) * 0.4; // Flattened Y
            pos[i * 3 + 2] = radius * Math.cos(phi);
        }
        return pos;
    }, [count]);

    useFrame((state) => {
        if (points.current) {
            // Slow rotation for "swarm" effect
            points.current.rotation.y = state.clock.getElapsedTime() * 0.05;
        }
    });

    return (
        <points ref={points}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" array={positions} count={count} itemSize={3} />
            </bufferGeometry>
            {/* Using sizeAttenuation=true to make them look like stars, not squares */}
            <pointsMaterial size={0.15} sizeAttenuation={true} color="#ffffff" transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} />
        </points>
    );
}

function CosmicSnow({ count = 300 }) {
    const mesh = useRef<THREE.Group>(null);
    const particles = useMemo(() => {
        const temp = [];
        for (let i = 0; i < count; i++) {
            temp.push({
                t: Math.random() * 100,
                factor: 20 + Math.random() * 100,
                speed: 0.01 + Math.random() / 200,
                xFactor: -15 + Math.random() * 30,
                yFactor: -5 + Math.random() * 15,
                zFactor: -20 + Math.random() * 40
            });
        }
        return temp;
    }, [count]);

    /*
    useFrame(() => {
        if (!mesh.current) return;
        particles.forEach((particle, i) => {
            let { t, factor, speed, xFactor, yFactor, zFactor } = particle;
            t = particle.t += speed / 2;
            const a = Math.cos(t) + Math.sin(t * 1) / 10;
            const b = Math.sin(t) + Math.cos(t * 2) / 10;
            const child = mesh.current!.children[i] as THREE.Mesh;
            child.position.set(
                a + xFactor + Math.cos((t / 10) * factor) + (Math.sin(t * 1) * factor) / 10,
                b + yFactor + Math.sin((t / 10) * factor) + (Math.cos(t * 2) * factor) / 10,
                b + zFactor + Math.cos((t / 10) * factor) + (Math.sin(t * 3) * factor) / 10
            );
        });
    });
    */

    return (
        <group ref={mesh}>
            {particles.map((_, i) => (
                <mesh key={i}>
                    <sphereGeometry args={[0.04, 6, 6]} />
                    <meshStandardMaterial color="#8b5cf6" emissive="#8b5cf6" emissiveIntensity={2} transparent opacity={0.4} />
                </mesh>
            ))}
        </group>
    );
}

function LightingReveal() {
    return (
        <>
            <ambientLight intensity={0.5} color="#1a0a2e" />
            <spotLight position={[0, 10, -5]} angle={0.8} penumbra={0.5} intensity={2.0} color="#8b5cf6" castShadow />
            <pointLight position={[5, 3, 2]} intensity={1.5} color="#ec4899" distance={15} />
            <pointLight position={[-5, 3, 2]} intensity={1.5} color="#8b5cf6" distance={15} />
        </>
    );
}

// --- AVATAR COMPONENT ---
function Avatar() {
    // Force autoplay settings
    const videoTex = useVideoTexture('/images/avatar_gs.mp4', {
        start: true,
        muted: true,
        playsInline: true
    });

    const {
        pos,
        scale,
        aspectRatio, // New control for stretching
        keyColor,
        similarity,
        smoothness,
        visible
    } = useControls('Digital Avatar', {
        visible: true,
        pos: { value: [6.0, 0.4, 23.5], step: 0.1 }, // Updated from Screenshot
        scale: { value: 1.25, min: 0.1, max: 5 }, // Updated from Screenshot
        aspectRatio: { value: 0.95, min: 0.5, max: 3, step: 0.01, label: 'Aspect Ratio' }, // To fix stretching
        keyColor: { value: '#000000', label: 'Key Color (Background)' },
        similarity: { value: 0.0, min: 0, max: 1 }, // Updated from Screenshot
        smoothness: { value: 0.0, min: 0, max: 1 } // Updated from Screenshot
    });

    const shaderArgs = useMemo(() => ({
        uniforms: {
            uTex: { value: videoTex },
            uKeyColor: { value: new THREE.Color(keyColor) },
            uSimilarity: { value: similarity },
            uSmoothness: { value: smoothness }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D uTex;
            uniform vec3 uKeyColor;
            uniform float uSimilarity;
            uniform float uSmoothness;
            varying vec2 vUv;

            void main() {
                vec4 texColor = texture2D(uTex, vUv);
                
                // Calculate distance from key color
                float dist = length(texColor.rgb - uKeyColor);
                
                // Alpha mask based on similarity
                float alpha = smoothstep(uSimilarity, uSimilarity + uSmoothness, dist);
                
                gl_FragColor = vec4(texColor.rgb, texColor.a * alpha);
            }
        `
    }), [videoTex, keyColor, similarity, smoothness]);

    if (!visible) return null;

    return (
        <group position={pos}>
            <mesh scale={[scale * aspectRatio, scale, 1]}>
                <planeGeometry />
                <shaderMaterial
                    attach="material"
                    transparent
                    side={THREE.DoubleSide}
                    args={[shaderArgs]}
                    uniforms-uKeyColor-value={new THREE.Color(keyColor)} // Update uniform on change
                    uniforms-uSimilarity-value={similarity}
                    uniforms-uSmoothness-value={smoothness}
                />
            </mesh>
            {/* Glowing Floor Ring */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -scale / 2 + 0.1, 0]}>
                <torusGeometry args={[0.6, 0.02, 16, 100]} />
                <meshBasicMaterial color="#00ffff" toneMapped={false} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -scale / 2 + 0.1, 0]}>
                <ringGeometry args={[0.55, 0.65, 32]} />
                <meshBasicMaterial color="#00ffff" transparent opacity={0.2} side={THREE.DoubleSide} />
            </mesh>
        </group>
    );
}

function CameraSetup({ setupData, controlsRef, introActive }: {
    setupData: CamSetupData | null;
    controlsRef: MutableRefObject<OrbitControlsImpl | null>;
    introActive: boolean;
}) {
    const { camera, size } = useThree();
    const devTools = useMemo(() => devToolsEnabled(), []);
    const initializedRef = useRef(false);
    const initialCamPosRef = useRef(new THREE.Vector3());
    const entryStartRef = useRef<number | null>(null);
    const scrollProgressRef = useRef(0);
    const cinematicPosRef = useRef(new THREE.Vector3());
    const cinematicTargetRef = useRef(new THREE.Vector3());

    // === DEVELOPER PANEL ===
    const { freeCamera, controlMode, precision, rotateSpeed, panSpeed, moveSpeed } = useControls('Director Camera', {
        freeCamera: { value: false, label: '🎮 Free Camera (WASD)' },
        controlMode: {
            value: 'Orbit',
            options: ['Orbit', 'Fly (WASD+Look)'],
            label: 'Control Style'
        },
        precision: { value: false, label: '🔬 Precision Mode (Slow)' },
        moveSpeed: { value: 3.0, min: 0.5, max: 20.0, step: 0.5, label: '🏃 Move Speed' },
        rotateSpeed: { value: 0.8, min: 0.1, max: 2.0, step: 0.1, label: '🔄 Rotate Speed' },
        panSpeed: { value: 0.8, min: 0.1, max: 2.0, step: 0.1, label: '↔️ Pan Speed' },
        logPos: button(() => {
            const state = debugRef.current;
            const data = {
                position: `[${state.pos.x.toFixed(3)}, ${state.pos.y.toFixed(3)}, ${state.pos.z.toFixed(3)}]`,
                rotation: `[${state.rot.x.toFixed(3)}, ${state.rot.y.toFixed(3)}, ${state.rot.z.toFixed(3)}]`,
                target: `[${state.target.x.toFixed(3)}, ${state.target.y.toFixed(3)}, ${state.target.z.toFixed(3)}]`,
                fov: (camera as THREE.PerspectiveCamera).fov
            };
            console.log('%c📸 CAMERA CALIBRATION DATA', 'color: #00ff88; font-size: 14px; font-weight: bold;');
            console.log(`  Position: ${data.position}`);
            console.log(`  Rotation (Rad): ${data.rotation}`);
            console.log(`  Target: ${data.target}`);
            console.log(`  FOV: ${data.fov}`);
            console.log('%c──────────────────────────', 'color: #555;');
            alert(`📸 Camera Position:\n${data.position}\n\nTarget:\n${data.target}\n\nFOV: ${data.fov}`);
        })
    });

    // Real-time debug panel
    const [, setDebug] = useControls('📊 Camera Debug (Real-time)', () => ({
        posX: { value: 0, editable: false, label: 'pos.X' },
        posY: { value: 0, editable: false, label: 'pos.Y' },
        posZ: { value: 0, editable: false, label: 'pos.Z' },
        rotX: { value: 0, editable: false, label: 'rot.X (rad)' },
        rotY: { value: 0, editable: false, label: 'rot.Y (rad)' },
        rotZ: { value: 0, editable: false, label: 'rot.Z (rad)' },
        targetX: { value: 0, editable: false, label: 'target.X' },
        targetY: { value: 0, editable: false, label: 'target.Y' },
        targetZ: { value: 0, editable: false, label: 'target.Z' },
        fov: { value: 60, editable: false, label: 'FOV' }
    }));

    const debugRef = useRef({
        pos: new THREE.Vector3(),
        target: new THREE.Vector3(),
        rot: new THREE.Euler()
    });

    // === KEYBOARD MOVEMENT (WASD + QE) ===
    const [movement, setMovement] = useState({
        forward: false, backward: false,
        left: false, right: false,
        up: false, down: false
    });

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!freeCamera) return;
            switch (e.code) {
                case 'KeyW': setMovement(m => ({ ...m, forward: true })); break;
                case 'KeyS': setMovement(m => ({ ...m, backward: true })); break;
                case 'KeyA': setMovement(m => ({ ...m, left: true })); break;
                case 'KeyD': setMovement(m => ({ ...m, right: true })); break;
                case 'KeyE': setMovement(m => ({ ...m, up: true })); break;
                case 'KeyQ': setMovement(m => ({ ...m, down: true })); break;
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            switch (e.code) {
                case 'KeyW': setMovement(m => ({ ...m, forward: false })); break;
                case 'KeyS': setMovement(m => ({ ...m, backward: false })); break;
                case 'KeyA': setMovement(m => ({ ...m, left: false })); break;
                case 'KeyD': setMovement(m => ({ ...m, right: false })); break;
                case 'KeyE': setMovement(m => ({ ...m, up: false })); break;
                case 'KeyQ': setMovement(m => ({ ...m, down: false })); break;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [freeCamera]);

    // === RESPONSIVE CAMERA CONFIG ===
    const camConfig = useMemo(() => getCameraConfig(), []);
    // Responsywny Front: dla węższych proporcji niż kalibracja kamera cofa się wzdłuż osi widzenia,
    // tak by odległość do ekranu (środek z meshy sceny) urosła refAspect/aspect razy — ekran zachowuje
    // poziomy zasięg kalibracji, perspektywa bez zmian. Mobile (portrait) — osobne cue.
    const aspect = Math.round((size.width / Math.max(1, size.height)) * 100) / 100;
    const [screenFocus, setScreenFocus] = useState<[number, number, number] | null>(null);
    useEffect(() => onScreenMeshes((meshes) => setScreenFocus(screenCenter(meshes))), []);
    const cueSet = useMemo(() => {
        if (camConfig.isMobile) return MOBILE_CAMERA_CUES;
        const k = frontDollyFactor(aspect);
        if (k === 1 || !screenFocus) return CAMERA_CUES;
        const base = CAMERA_CUES.wide;
        const dist = focusDistance(base.position, base.target, screenFocus);
        const wide = { ...base, position: dollyAlongView(base.position, base.target, dist, k) };
        return { ...CAMERA_CUES, wide, close: { ...CAMERA_CUES.close, position: towards(wide.position, wide.target, 0.15) } };
    }, [camConfig.isMobile, aspect, screenFocus]);
    useEffect(() => {
        if (initializedRef.current) initialCamPosRef.current.set(...cueSet.wide.position);
    }, [cueSet]);
    const SCENE_CENTER = useMemo(() => new THREE.Vector3(...cueSet.wide.target), [cueSet]);

    useEffect(() => {
        const updateScrollProgress = () => {
            const travel = Math.max(window.innerHeight * 0.78, 1);
            scrollProgressRef.current = smoothstep01(window.scrollY / travel);
        };

        updateScrollProgress();
        window.addEventListener('scroll', updateScrollProgress, { passive: true });
        window.addEventListener('resize', updateScrollProgress);

        return () => {
            window.removeEventListener('scroll', updateScrollProgress);
            window.removeEventListener('resize', updateScrollProgress);
        };
    }, []);

    useEffect(() => {
        if (!introActive && entryStartRef.current === null) {
            entryStartRef.current = performance.now() / 1000;
        }
    }, [introActive]);

    // === INITIAL CAMERA POSITION (directly from CONFIG, no race condition) ===
    useEffect(() => {
        if (initializedRef.current) return;

        camera.position.set(...cueSet.intro.position);
        (camera as THREE.PerspectiveCamera).fov = cueSet.intro.fov;
        camera.updateProjectionMatrix();

        // Set orbit target
        if (controlsRef.current) {
            controlsRef.current.target.set(...cueSet.intro.target);
            controlsRef.current.update();
        }

        initialCamPosRef.current.set(...cueSet.wide.position);
        initializedRef.current = true;

        // Log initial position
        console.log(`%c🎬 Camera Initialized (${camConfig.isMobile ? 'MOBILE' : 'DESKTOP'})`, 'color: #00ff88; font-weight: bold;');
        console.log(`  Position: [${cueSet.intro.position.join(', ')}]`);
        console.log(`  Target: [${cueSet.intro.target.join(', ')}]`);
    }, [camera, controlsRef, camConfig.isMobile, cueSet]);

    // === LAST LOG TRACKER (prevent spam) ===
    const lastLogTime = useRef(0);

    // === MAIN FRAME LOOP ===
    useFrame((_, delta) => {
        // Kąt orbity z warstwy AI-to-UI (suwak 360° lub director); odczyt bez subskrypcji Reacta.
        useAiUi.getState().tickCamera(delta);
        const orbitAngle = useAiUi.getState().camera.angle;

        // ─── FREE CAMERA MODE ───
        if (freeCamera) {
            const speed = (precision ? moveSpeed * 0.15 : moveSpeed) * delta;
            const dir = new THREE.Vector3();
            camera.getWorldDirection(dir);
            const side = new THREE.Vector3().crossVectors(camera.up, dir).normalize();

            if (movement.forward) camera.position.addScaledVector(dir, speed);
            if (movement.backward) camera.position.addScaledVector(dir, -speed);
            if (movement.left) camera.position.addScaledVector(side, speed);
            if (movement.right) camera.position.addScaledVector(side, -speed);
            if (movement.up) camera.position.y += speed;
            if (movement.down) camera.position.y -= speed;

            // Sync Orbit Target when moving in Orbit mode
            if (controlMode === 'Orbit' && controlsRef.current) {
                const isMoving = movement.forward || movement.backward || movement.left || movement.right || movement.up || movement.down;
                if (isMoving) {
                    const lookDir = new THREE.Vector3();
                    camera.getWorldDirection(lookDir);
                    const newTarget = camera.position.clone().add(lookDir.multiplyScalar(5));
                    controlsRef.current.target.copy(newTarget);
                }
            }
        }

        // Cinematic entry + scroll push-in.
        if (!freeCamera && Math.abs(orbitAngle) < 0.001 && controlsRef.current && initializedRef.current) {
            const entryElapsed = entryStartRef.current === null ? 0 : Math.max(0, performance.now() / 1000 - entryStartRef.current);
            const entryProgress = introActive ? 0 : smoothstep01(entryElapsed / 1.9);
            const scrollProgress = scrollProgressRef.current;

            const introPos = new THREE.Vector3(...cueSet.intro.position);
            const widePos = new THREE.Vector3(...cueSet.wide.position);
            const closePos = new THREE.Vector3(...cueSet.close.position);
            const introTarget = new THREE.Vector3(...cueSet.intro.target);
            const wideTarget = new THREE.Vector3(...cueSet.wide.target);
            const closeTarget = new THREE.Vector3(...cueSet.close.target);

            cinematicPosRef.current.lerpVectors(introPos, widePos, entryProgress);
            cinematicTargetRef.current.lerpVectors(introTarget, wideTarget, entryProgress);

            cinematicPosRef.current.lerp(closePos, scrollProgress);
            cinematicTargetRef.current.lerp(closeTarget, scrollProgress);

            camera.position.lerp(cinematicPosRef.current, 1 - Math.exp(-delta * 4.8));
            controlsRef.current.target.lerp(cinematicTargetRef.current, 1 - Math.exp(-delta * 5.8));
            (camera as THREE.PerspectiveCamera).fov = THREE.MathUtils.lerp(
                (camera as THREE.PerspectiveCamera).fov,
                THREE.MathUtils.lerp(cueSet.wide.fov, cueSet.close.fov, scrollProgress),
                1 - Math.exp(-delta * 4.2)
            );
            (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
            controlsRef.current.update();
        }

        // ─── AUTO ORBIT (slider) ───
        if (!freeCamera && Math.abs(orbitAngle) >= 0.001 && controlsRef.current && initializedRef.current) {
            const initialPos = initialCamPosRef.current;
            const initialViewDir = new THREE.Vector3().subVectors(SCENE_CENTER, initialPos);
            const rotatedViewDir = initialViewDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -orbitAngle);

            // Tłumiony dojazd zamiast skoku (np. gdy kamera była w cue "close" po scrollu).
            camera.position.lerp(initialPos, 1 - Math.exp(-delta * 4.8));
            const newTarget = new THREE.Vector3().addVectors(camera.position, rotatedViewDir);
            controlsRef.current.target.copy(newTarget);
            camera.lookAt(newTarget);
            controlsRef.current.update();
        }

        // ─── ALWAYS: Update Debug Panel ───
        debugRef.current.pos.copy(camera.position);
        debugRef.current.rot.copy(camera.rotation);
        if (controlsRef.current) debugRef.current.target.copy(controlsRef.current.target);

        if (devTools) setDebug({
            posX: parseFloat(camera.position.x.toFixed(3)),
            posY: parseFloat(camera.position.y.toFixed(3)),
            posZ: parseFloat(camera.position.z.toFixed(3)),
            rotX: parseFloat(camera.rotation.x.toFixed(3)),
            rotY: parseFloat(camera.rotation.y.toFixed(3)),
            rotZ: parseFloat(camera.rotation.z.toFixed(3)),
            targetX: parseFloat(debugRef.current.target.x.toFixed(3)),
            targetY: parseFloat(debugRef.current.target.y.toFixed(3)),
            targetZ: parseFloat(debugRef.current.target.z.toFixed(3)),
            fov: (camera as THREE.PerspectiveCamera).fov
        });

        // ─── Console Logging on movement (throttled to 1x/sec) ───
        const now = Date.now();
        const isMoving = freeCamera && (movement.forward || movement.backward || movement.left || movement.right || movement.up || movement.down);
        if (isMoving && now - lastLogTime.current > 1000) {
            lastLogTime.current = now;
            console.log(`🎯 Cam [${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)}] → Target [${debugRef.current.target.x.toFixed(2)}, ${debugRef.current.target.y.toFixed(2)}, ${debugRef.current.target.z.toFixed(2)}]`);
        }
    });

    // === TOGGLE ORBIT CONTROLS ON/OFF ===
    useEffect(() => {
        if (controlsRef.current) {
            controlsRef.current.enableZoom = freeCamera;
            controlsRef.current.enablePan = freeCamera;
            controlsRef.current.enableRotate = freeCamera && controlMode === 'Orbit';
        }
    }, [freeCamera, controlMode, controlsRef]);

    // === RENDER CONTROLS ===
    return (
        <>
            {freeCamera && controlMode === 'Fly (WASD+Look)' && (
                <PointerLockControls />
            )}
        </>
    );
}

// --- LANDING PAGE KOMPONENT ---
export default function HomePage() {
    const [introActive, setIntroActive] = useState(true);

    const [camSetup, setCamSetup] = useState<CamSetupData | null>(null);
    const controlsRef = useRef<OrbitControlsImpl | null>(null);

    // Panel Leva tylko w trybie dev (lub z ?dev); ustalane po montażu, żeby nie psuć hydracji SSR
    const [devTools, setDevTools] = useState(false);
    useEffect(() => setDevTools(devToolsEnabled()), []);

    // Zapobiegamy kolizji z iframe reklamowymi
    useEffect(() => {
        const style = document.createElement('style');
        style.innerHTML = `body > iframe[style*="z-index: 2147483647"] { display: none !important; } nextjs-portal { display: none !important; }`;
        document.head.appendChild(style);
        return () => { document.head.removeChild(style); };
    }, []);

    return (
        <main className="relative w-full min-h-screen bg-[#020617] text-white overflow-x-hidden selection:bg-purple-500/30">
            <Leva collapsed hidden={!devTools} />
            {introActive && (
                <IntroOverlay
                    onComplete={() => {
                        setIntroActive(false);
                        useAiUi.getState().setSceneReady();
                    }}
                />
            )}

            {/* 360° VIEW TOGGLE + SLIDER (stan kąta w store AI-to-UI) */}
            <OrbitSlider />

            {/* 1. SECTION: INTRO (3D SCENE) */}
            <section className="relative w-full h-screen z-0">
                <div className="absolute inset-0 z-0">
                    <Canvas shadows camera={{ position: getCameraConfig().position, fov: 60 }}>
                        <color attach="background" args={['#050208']} />
                        <Suspense fallback={null}>
                            {/* <StarSwarm /> Replaced with GLTF Model */}
                        </Suspense>
                        <CosmicSnow count={150} />
                        {/* <StarSwarm count={5000} /> Removed procedural squares */}
                        <LightingReveal />
                        <Suspense fallback={null}>
                            {/* Scene stays fixed, camera orbits around it */}
                            <SceneErrorBoundary name="StarField"><StarField /></SceneErrorBoundary>
                            <SceneErrorBoundary name="Avatar"><Avatar /></SceneErrorBoundary>
                            <SceneErrorBoundary name="StudioModel"><StudioModel onCamSetup={setCamSetup} /></SceneErrorBoundary>
                            <Environment preset="night" blur={0.8} background={false} />
                        </Suspense>
                        <CameraSetup setupData={camSetup} controlsRef={controlsRef} introActive={introActive} />
                        <ScreenAnchor />
                        <OrbitControls
                            ref={controlsRef}
                            enablePan={true}
                            enableZoom={true}
                            autoRotate={false}
                            enableRotate={true}
                            enableDamping={true}
                            dampingFactor={0.05}
                            minPolarAngle={0}
                            maxPolarAngle={Math.PI}
                            mouseButtons={{
                                LEFT: THREE.MOUSE.ROTATE,
                                MIDDLE: THREE.MOUSE.DOLLY,
                                RIGHT: THREE.MOUSE.PAN
                            }}
                        />
                    </Canvas>
                </div>

                <div className="absolute bottom-10 left-0 right-0 z-10 flex justify-center animate-bounce pointer-events-none">
                    <span className="text-xs tracking-widest text-white/30 uppercase">Scroll to Explore</span>
                </div>

                {/* AI-TO-UI OVERLAY (Back canvas, Tasks, narracja) */}
                <AiUiOverlay />
                {/* SPIKE v1.2.1 krok 1: panel testowy ScreenAnchor (tylko ?anchor=probe) */}
                <ScreenAnchorProbe />

                {/* BOARDER OVERLAY */}
                <div className="pointer-events-none absolute inset-0 z-50 border-[20px] border-[#000000] rounded-[30px] md:border-[0px]" />
            </section>

            {/* 2. SECTION: VALUE PROP */}
            <section className="relative z-10 bg-gradient-to-b from-[#050208] to-[#0a0a0a] py-24 px-6">
                <div className="max-w-4xl mx-auto text-center space-y-12">
                    <motion.h2
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        transition={{ duration: 0.8 }}
                        viewport={{ once: true }}
                        className="text-3xl md:text-5xl font-light leading-tight text-white/90"
                    >
                        You won&apos;t be ignored.<br />
                        <span className="text-purple-400 font-normal">If you can book — you will.</span><br />
                        <span className="text-gray-500 text-2xl md:text-4xl">If you can&apos;t — you&apos;ll know why.</span>
                    </motion.h2>

                    <div className="grid md:grid-cols-3 gap-8 pt-12">
                        {[
                            { title: "Peace of Mind", desc: "Silence the chaos of missed calls." },
                            { title: "Certainty", desc: "Immediate answers. No guessing." },
                            { title: "Control", desc: "You set the rules. We guard them." }
                        ].map((item, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.2, duration: 0.8 }}
                                viewport={{ once: true }}
                                className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm"
                            >
                                <h3 className="text-xl font-medium text-purple-300 mb-2">{item.title}</h3>
                                <p className="text-gray-400 text-sm">{item.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* 3. SECTION: THE PROMISE */}
            <section className="relative z-10 bg-[#0a0a0a] py-24 px-6 border-t border-white/5">
                <div className="max-w-3xl mx-auto flex flex-col md:flex-row items-center gap-12">
                    <div className="flex-1 space-y-6">
                        <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">
                            Your Digital Gatekeeper
                        </h2>
                        <p className="text-lg text-gray-300 leading-relaxed">
                            &quot;I am here to handle the chaos so you can focus on the craft. I don&apos;t just answer phones. I create order.&quot;
                        </p>
                    </div>
                    <div className="relative w-full max-w-xs aspect-square rounded-full bg-gradient-to-tr from-cyan-900/40 to-purple-900/40 blur-3xl" />
                </div>
            </section>

            {/* 3.5 SECTION: TACTICAL MAP (WARSAW CASE) */}
            <section className="relative z-10 bg-black py-24 px-6 border-y border-white/5">
                <div className="max-w-6xl mx-auto space-y-12">
                    <div className="text-center space-y-4">
                        <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tighter">Warsaw Intelligent Space</h2>
                        <p className="text-gray-400 max-w-2xl mx-auto">
                            Experience the future of AI orchestration. Multi-agent fleets reacting in real-time to voice commands across the Warsaw metropolitan area.
                        </p>
                    </div>

                    {/* Integrated Warsaw Map */}
                    <div className="w-full h-[600px] border border-white/10 rounded-2xl overflow-hidden shadow-2xl relative">
                        <TacticalMapVector />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-12">
                        {[
                            { label: "Location", val: "Warsaw, PL" },
                            { label: "Active Fleets", val: "12 units" },
                            { label: "Validation", val: "Deterministic" },
                            { label: "Response", val: "< 800ms" }
                        ].map((stat, i) => (
                            <div key={i} className="p-4 border-l border-white/10">
                                <p className="text-[10px] text-gray-500 uppercase tracking-widest">{stat.label}</p>
                                <p className="text-xl font-medium text-cyan-400">{stat.val}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* 4. SECTION: CTA */}
            <section className="relative z-10 py-32 bg-black text-center px-6">
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    whileInView={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.5 }}
                    viewport={{ once: true }}
                    className="max-w-2xl mx-auto space-y-8"
                >
                    <h2 className="text-4xl md:text-6xl font-bold text-white mb-6">Start Control Space</h2>
                    <p className="text-gray-400 mb-10">Stop losing clients to silence.</p>
                    <a href="#" className="inline-block px-10 py-4 bg-white text-black font-bold rounded-full hover:bg-purple-50 transition-colors transform hover:scale-105 duration-200">
                        Get FlowAssist
                    </a>
                </motion.div>
                <footer className="mt-32 text-center text-gray-700 text-sm">
                    <p>FlowAssist &copy; {new Date().getFullYear()}. Smart Business.</p>
                </footer>
            </section>

        </main>
    );
}

function SwarmLogo() {
    const tex = useTexture('/assets/textures/logo_flowassist.png');
    const points = useRef<THREE.Points>(null);

    // Shader Uniforms
    const uniforms = useMemo(() => ({
        uTex: { value: tex },
        uTime: { value: 0 },
        uProgress: { value: 0 }
    }), [tex]);

    useFrame((state) => {
        if (points.current) {
            const material = points.current.material as THREE.ShaderMaterial;
            material.uniforms.uTime.value = state.clock.elapsedTime;

            // Animate progress from 0 to 1 smoothly
            material.uniforms.uProgress.value = THREE.MathUtils.lerp(
                material.uniforms.uProgress.value,
                1,
                0.015 // Speed of formation
            );
        }
    });

    const vertexShader = `
        uniform float uTime;
        uniform float uProgress;
        varying vec2 vUv;
        varying float vAlpha;

        // Simple noise 
        float random(vec2 st) {
            return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
        }

        void main() {
            vUv = uv;
            vec3 pos = position;
            
            // Generate a random scatter direction based on UV
            float r = random(uv) * 2.0 * 3.14159;
            float dist = random(uv + 1.0) * 10.0;
            
            vec3 scatteredPos = pos + vec3(cos(r) * dist, sin(r) * dist, dist * 0.5);
            
            // Wavy floating effect when formed
            float wave = sin(pos.x * 2.0 + uTime) * 0.1;
            pos.y += wave;

            // Mix scatter and formed state
            vec3 finalPos = mix(scatteredPos, pos, smoothstep(0.0, 1.0, uProgress));

            vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
            gl_PointSize = 3.0 * (2.0 / -mvPosition.z); // Size attenuation
            gl_Position = projectionMatrix * mvPosition;
        }
    `;

    const fragmentShader = `
        uniform sampler2D uTex;
        varying vec2 vUv;

        void main() {
            vec4 texColor = texture2D(uTex, vUv);
            if (texColor.a < 0.1) discard; 
            
            // Use original color mixed with electric blue based on alpha/intensity
            gl_FragColor = texColor;
        }
    `;

    return (
        <points ref={points} position={[0, 0.4, 3.2]} scale={[4, 2, 1]} rotation={[0, 0, 0]}>
            <planeGeometry args={[1, 1, 128, 64]} />
            <shaderMaterial
                uniforms={uniforms}
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                transparent={true}
                depthWrite={false}
                blending={THREE.NormalBlending}
            />
        </points>
    );
}
