export type SceneLayer = { id: string; x: number; y: number; width: number; height: number; background?: boolean };
export function sceneLayerOrder(items: readonly SceneLayer[], frontToBack?: readonly string[]) {
  const ranks = new Map(frontToBack?.map((id, index) => [id, index]));
  const rank = (id: string) => ranks.get(id) ?? ranks.size;
  return [...items].sort((a, b) => Number(!!b.background) - Number(!!a.background) ||
    (frontToBack?.length ? rank(b.id) - rank(a.id) : 0) ||
    (a.y + a.height) - (b.y + b.height) || (a.x + a.width / 2) - (b.x + b.width / 2) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(item => item.id);
}
