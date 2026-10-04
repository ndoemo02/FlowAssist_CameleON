'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useAiUi } from '../store';
import { shortestDelta } from '../slots';
import { measureScreen, type ProjectedPoint, type Rect } from './measureScreen';
import { getScreenMeshes, hasAnchorSubscribers, publishAnchor, type AnchorState } from './anchorRegistry';
import { screenCluster } from './screenGeometry';

const MAX_POINTS = 1500;      // limit próbek ekranu (wierzchołki unii meshy)
const EDGE_BAND = 0.03;       // pas (ułamek wysokości) przy górze/dole ekranu w świecie = krawędź
const PUBLISH_EPS_PX = 0.5;

type Sample = { world: THREE.Vector3; edge: 'top' | 'bottom' | null };

/** Próbki świata z unii meshy ekranu (scena statyczna — liczone raz na rejestrację). */
function buildSamples(all: THREE.Mesh[]): Sample[] {
    const meshes = screenCluster(all);
    const raw: THREE.Vector3[] = [];
    const perMesh = Math.max(1, Math.floor(MAX_POINTS / Math.max(1, meshes.length)));
    for (const m of meshes) {
        m.updateWorldMatrix(true, false);
        const pos = m.geometry.attributes.position as THREE.BufferAttribute;
        const step = Math.max(1, Math.ceil(pos.count / perMesh)); // budżet per mesh: mały mesh nie ginie przy dużym
        for (let i = 0; i < pos.count; i += step) {
            raw.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
        }
    }
    if (raw.length === 0) return [];
    let minY = Infinity, maxY = -Infinity;
    for (const v of raw) { minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); }
    const band = (maxY - minY) * EDGE_BAND;
    return raw.map((world) => ({
        world,
        edge: world.y >= maxY - band ? 'top' : world.y <= minY + band ? 'bottom' : null,
    }));
}

const rectChanged = (a: Rect | null, b: Rect | null) =>
    !a || !b ? a !== b
        : Math.abs(a.x - b.x) > PUBLISH_EPS_PX || Math.abs(a.y - b.y) > PUBLISH_EPS_PX
          || Math.abs(a.w - b.w) > PUBLISH_EPS_PX || Math.abs(a.h - b.h) > PUBLISH_EPS_PX;

/**
 * Rzutuje unię meshy ekranu na płaszczyznę Canvasu w każdej klatce — ale tylko gdy ktoś słucha.
 * Viewport = okno ∩ Canvas (w układzie Canvasu), żeby scroll strony obniżał widoczność.
 */
export default function ScreenAnchor() {
    const { camera, size, gl } = useThree();
    const samples = useRef<Sample[]>([]);
    const version = useRef(-1);
    const canvasTop = useRef(0);
    const last = useRef<AnchorState | null>(null);
    const tmp = useRef(new THREE.Vector3());
    const view = useRef(new THREE.Vector3());
    const points = useRef<ProjectedPoint[]>([]);

    // Pozycja Canvasu względem okna — odczyt tylko przy scrollu/resize (bez wymuszania layoutu co klatkę).
    useEffect(() => {
        const update = () => { canvasTop.current = gl.domElement.getBoundingClientRect().top; };
        update();
        window.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('scroll', update);
            window.removeEventListener('resize', update);
        };
    }, [gl]);

    useFrame(() => {
        if (!hasAnchorSubscribers()) return;
        const t0 = performance.now();

        const reg = getScreenMeshes();
        if (reg.version !== version.current) {
            samples.current = buildSamples(reg.meshes);
            points.current = [];
            version.current = reg.version;
        }

        // Punkty alokowane raz na rejestrację meshy i mutowane w miejscu (bez śmieci co klatkę).
        if (points.current.length !== samples.current.length) {
            points.current = samples.current.map((s) => ({ x: 0, y: 0, inFront: true, edge: s.edge }));
        }
        camera.updateMatrixWorld();
        for (let i = 0; i < samples.current.length; i++) {
            const s = samples.current[i], p = points.current[i];
            view.current.copy(s.world).applyMatrix4(camera.matrixWorldInverse);
            tmp.current.copy(s.world).project(camera);
            p.x = ((tmp.current.x + 1) / 2) * size.width;
            p.y = ((1 - tmp.current.y) / 2) * size.height;
            p.inFront = view.current.z < 0;
        }

        const viewport: Rect = {
            x: 0,
            y: Math.max(0, -canvasTop.current),
            w: Math.min(size.width, window.innerWidth),
            h: Math.max(0, Math.min(size.height, window.innerHeight - canvasTop.current) - Math.max(0, -canvasTop.current)),
        };
        const angleDeg = Math.abs(THREE.MathUtils.radToDeg(shortestDelta(useAiUi.getState().camera.angle, 0)));
        const m = measureScreen(points.current, viewport, size, angleDeg, last.current?.active ?? false);

        const dt = performance.now() - t0;
        const prev = last.current;
        const computeMs = prev ? prev.computeMs * 0.95 + dt * 0.05 : dt;
        const next: AnchorState = { ...m, pointCount: points.current.length, computeMs };

        if (!prev || prev.active !== next.active || prev.reason !== next.reason || prev.mode !== next.mode
            || rectChanged(prev.panel, next.panel) || rectChanged(prev.outer, next.outer)
            || Math.abs(prev.coverage - next.coverage) > 0.01) {
            last.current = next;
            publishAnchor(next);
        } else {
            last.current = { ...prev, computeMs };
        }
    });

    return null;
}
