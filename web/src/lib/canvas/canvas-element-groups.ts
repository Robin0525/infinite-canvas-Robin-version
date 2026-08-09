import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";

export type CanvasElementGroup = {
    group: CanvasNodeData;
    members: CanvasNodeData[];
};

export const ELEMENT_GROUP_REORDER_MIME = "application/x-infinite-canvas-element-group-reorder";

export function getElementGroupMembers(groupId: string, nodes: CanvasNodeData[]) {
    const group = nodes.find((node) => node.id === groupId && node.type === CanvasNodeType.Group);
    if (!group) return [];
    const members = nodes.filter((node) => node.metadata?.groupId === groupId && isElementGroupResource(node));
    const byId = new Map(members.map((node) => [node.id, node]));
    const ordered = (group.metadata?.elementOrderIds || []).map((id) => byId.get(id)).filter((node): node is CanvasNodeData => Boolean(node));
    const included = new Set(ordered.map((node) => node.id));
    return [...ordered, ...members.filter((node) => !included.has(node.id))];
}

export function getConnectedElementGroups(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]): CanvasElementGroup[] {
    return connections
        .filter((connection) => connection.toNodeId === nodeId)
        .map((connection) => nodes.find((node) => node.id === connection.fromNodeId))
        .filter((node): node is CanvasNodeData => node?.type === CanvasNodeType.Group)
        .map((group) => ({ group, members: getElementGroupMembers(group.id, nodes) }));
}

export function getBatchElementGroups(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[], prompt: string) {
    const connectedGroups = getConnectedElementGroups(nodeId, nodes, connections);
    const mentionedGroupIds = new Set(Array.from(prompt.matchAll(/@\[node:group:([^\]]+)\]/g), (match) => match[1]));
    return mentionedGroupIds.size ? connectedGroups.filter(({ group }) => mentionedGroupIds.has(group.id)) : connectedGroups;
}

export function syncElementGroupOrders(nodes: CanvasNodeData[]) {
    return nodes.map((node) => {
        if (node.type !== CanvasNodeType.Group) return node;
        const nextIds = getElementGroupMembers(node.id, nodes).map((member) => member.id);
        const currentIds = node.metadata?.elementOrderIds || [];
        if (currentIds.length === nextIds.length && currentIds.every((id, index) => id === nextIds[index])) return node;
        return { ...node, metadata: { ...node.metadata, elementOrderIds: nextIds } };
    });
}

export function reorderElementGroup(nodes: CanvasNodeData[], groupId: string, orderedIds: string[]) {
    const validIds = new Set(getElementGroupMembers(groupId, nodes).map((node) => node.id));
    const nextIds = orderedIds.filter((id) => validIds.has(id));
    validIds.forEach((id) => {
        if (!nextIds.includes(id)) nextIds.push(id);
    });
    return layoutElementGroupMembers(
        nodes.map((node) => (node.id === groupId ? { ...node, metadata: { ...node.metadata, elementOrderIds: nextIds } } : node)),
        groupId,
    );
}

export function layoutElementGroupMembers(nodes: CanvasNodeData[], groupId: string) {
    const group = nodes.find((node) => node.id === groupId && node.type === CanvasNodeType.Group);
    if (!group) return nodes;
    const members = getElementGroupMembers(groupId, nodes);
    if (!members.length) return nodes;
    const padding = 20;
    const headerHeight = 68;
    const gap = 12;
    const usableWidth = Math.max(120, group.width - padding * 2);
    const usableHeight = Math.max(100, group.height - headerHeight - padding);
    const columns = Math.max(1, Math.min(members.length, Math.ceil(Math.sqrt((members.length * usableWidth) / usableHeight))));
    const rows = Math.ceil(members.length / columns);
    const cellWidth = Math.max(1, (usableWidth - gap * (columns - 1)) / columns);
    const cellHeight = Math.max(1, (usableHeight - gap * (rows - 1)) / rows);
    const memberIndex = new Map(members.map((member, index) => [member.id, index]));
    return nodes.map((node) => {
        const index = memberIndex.get(node.id);
        if (index === undefined) return node;
        const column = index % columns;
        const row = Math.floor(index / columns);
        return {
            ...node,
            position: { x: group.position.x + padding + column * (cellWidth + gap), y: group.position.y + headerHeight + row * (cellHeight + gap) },
            width: cellWidth,
            height: cellHeight,
            metadata: { ...node.metadata, groupId },
        };
    });
}

export function layoutAllElementGroups(nodes: CanvasNodeData[]) {
    return nodes.filter((node) => node.type === CanvasNodeType.Group).reduce((current, group) => layoutElementGroupMembers(current, group.id), nodes);
}

export function cartesianGroupMembers(groups: CanvasElementGroup[]) {
    if (!groups.length) return [[]] as CanvasNodeData[][];
    if (groups.some((group) => !group.members.length)) return [] as CanvasNodeData[][];
    return groups.reduce<CanvasNodeData[][]>((rows, group) => rows.flatMap((row) => group.members.map((member) => [...row, member])), [[]]);
}

function isElementGroupResource(node: CanvasNodeData) {
    return [CanvasNodeType.Image, CanvasNodeType.Video, CanvasNodeType.Audio, CanvasNodeType.Text].includes(node.type as CanvasNodeType);
}
