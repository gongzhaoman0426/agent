import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * 收集给定智能体本身 + 所有（间接）挂载了它们的父级。
 * 子智能体实例被父级实例持有，任一节点配置变化时整条向上的链路都要重建。
 */
export async function collectWithAncestors(
  prisma: PrismaService,
  agentIds: string[],
): Promise<string[]> {
  const visited = new Set<string>(agentIds);
  let frontier = agentIds;

  while (frontier.length > 0) {
    const edges = await prisma.agentSubAgent.findMany({
      where: { childId: { in: frontier } },
      select: { parentId: true },
    });
    frontier = edges
      .map((edge) => edge.parentId)
      .filter((id) => !visited.has(id));
    for (const id of frontier) {
      visited.add(id);
    }
  }

  return [...visited];
}
