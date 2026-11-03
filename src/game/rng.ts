// シード付きの擬似乱数（mulberry32）。
// 内部状態は32ビット整数1つであり、GameState に含めて JSON で直列化できる（指示書 3-2）。
// Math.random() は使わない。

export type RngState = { readonly seed: number; readonly state: number };

export const createRng = (seed: number): RngState => ({ seed: seed >>> 0, state: seed >>> 0 });

/** [0, 1) の一様乱数と、進めた後の状態を返す。 */
export const nextFloat = (rng: RngState): [number, RngState] => {
  let t = (rng.state + 0x6d2b79f5) >>> 0;
  const nextState = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, { seed: rng.seed, state: nextState }];
};

/** [0, n) の整数。 */
export const nextInt = (rng: RngState, n: number): [number, RngState] => {
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`nextInt の上限は正の整数でなければならない：${n}`);
  }
  const [value, next] = nextFloat(rng);
  return [Math.floor(value * n), next];
};

/** Fisher–Yates で並べ替えた新しい配列を返す。元の配列は変更しない。 */
export const shuffle = <T>(items: readonly T[], rng: RngState): [T[], RngState] => {
  const result = [...items];
  let current = rng;
  for (let i = result.length - 1; i > 0; i -= 1) {
    const [j, next] = nextInt(current, i + 1);
    current = next;
    const a = result[i] as T;
    const b = result[j] as T;
    result[i] = b;
    result[j] = a;
  }
  return [result, current];
};
