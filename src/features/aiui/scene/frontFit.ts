// Responsywny kadr Front: kalibracja właściciela powstała przy proporcjach ok. 2:1.
// FOV kamery jest pionowy, więc węższy viewport obcina scenę w poziomie. Zamiast poszerzać FOV
// (zmienia perspektywę), odsuwamy kamerę wzdłuż osi widzenia tak, by ekran zachował poziomy zasięg.

export type Vec3 = [number, number, number];

/** Proporcje viewportu, w którym właściciel skalibrował kadr Front (screen 1906×943). */
export const FRONT_REF_ASPECT = 1906 / 943;

/**
 * Współczynnik skali odległości do ekranu (≥ 1) przy stałym pionowym FOV.
 * Widoczna półszerokość w odległości d to d·tan(vfov/2)·aspect, więc żeby ekran mieścił się
 * jak w kalibracji, odległość do NIEGO musi urosnąć o refAspect / aspect (tangens się skraca).
 * Dla szerszych viewportów niż kalibracja — bez zmian (nie przybliżamy).
 */
export function frontDollyFactor(aspect: number, refAspect = FRONT_REF_ASPECT): number {
    if (!(aspect > 0) || aspect >= refAspect) return 1;
    return refAspect / aspect;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Odległość od kamery do punktu (np. środka ekranu) mierzona wzdłuż osi widzenia. */
export function focusDistance(position: Vec3, target: Vec3, focus: Vec3): number {
    const d = sub(target, position);
    const len = Math.hypot(...d);
    return len > 0 ? dot(sub(focus, position), d) / len : 0;
}

/**
 * Cofa kamerę wzdłuż osi widzenia tak, by odległość do punktu ostrości urosła `factor` razy.
 * Cel i kierunek patrzenia bez zmian. (Skalowanie względem celu przesadzało, gdy ekran
 * jest dużo bliżej kamery niż cel.)
 */
export function dollyAlongView(position: Vec3, target: Vec3, focusDist: number, factor: number): Vec3 {
    const d = sub(target, position);
    const len = Math.hypot(...d);
    if (len === 0 || factor === 1 || focusDist <= 0) return position;
    const back = (focusDist * (factor - 1)) / len;
    return [position[0] - d[0] * back, position[1] - d[1] * back, position[2] - d[2] * back];
}
