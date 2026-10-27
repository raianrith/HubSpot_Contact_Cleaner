export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    const ac = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ac === b.charCodeAt(j - 1) ? 0 : 1;
      const insert = curr[j - 1] + 1;
      const remove = prev[j] + 1;
      const replace = prev[j - 1] + cost;
      curr[j] = insert < remove ? (insert < replace ? insert : replace) : remove < replace ? remove : replace;
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[b.length];
}
