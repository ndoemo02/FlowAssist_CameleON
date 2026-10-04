// Adapter sceny dla ScreenAnchor — jedyne miejsce z referencjami Three.js.
// StudioModel rejestruje meshe ekranu; ScreenAnchor (w Canvasie) publikuje wynik pomiaru
// subskrybentom DOM bez Reacta (imperatywnie), żeby ruch kamery nie powodował re-renderów.

import type * as THREE from 'three';
import type { ScreenMeasure } from './measureScreen';

let screenMeshes: THREE.Mesh[] = [];
let meshesVersion = 0;

const meshListeners = new Set<(meshes: THREE.Mesh[]) => void>();

export function registerScreenMeshes(meshes: THREE.Mesh[]) {
    screenMeshes = meshes;
    meshesVersion++;
    meshListeners.forEach((l) => l(meshes));
}

/** Powiadomienie o (re)rejestracji meshy ekranu — np. dla responsywnego kadru Front. */
export function onScreenMeshes(fn: (meshes: THREE.Mesh[]) => void) {
    meshListeners.add(fn);
    if (screenMeshes.length) fn(screenMeshes);
    return () => { meshListeners.delete(fn); };
}

export function getScreenMeshes() {
    return { meshes: screenMeshes, version: meshesVersion };
}

export interface AnchorState extends ScreenMeasure {
    pointCount: number;
    computeMs: number; // średnia krocząca czasu pomiaru na klatkę
}

type Listener = (s: AnchorState) => void;
const listeners = new Set<Listener>();
let current: AnchorState | null = null;

export function subscribeAnchor(fn: Listener) {
    listeners.add(fn);
    if (current) fn(current);
    return () => { listeners.delete(fn); };
}

export const hasAnchorSubscribers = () => listeners.size > 0;

export function publishAnchor(s: AnchorState) {
    current = s;
    listeners.forEach((l) => l(s));
}

export const getAnchorState = () => current;

// Dev: diagnostyka z konsoli (meshe ekranu, stan pomiaru)
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
    (window as unknown as { __anchorRegistry: unknown }).__anchorRegistry = { getScreenMeshes, getAnchorState };
}
