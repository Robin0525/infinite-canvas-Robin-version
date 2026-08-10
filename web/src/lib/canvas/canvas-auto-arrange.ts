import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type Position } from "@/types/canvas";

export type CanvasAutoArrangeResult = {
    nodes: CanvasNodeData[];
    atomCount: number;
};

export function autoArrangeCanvasNodes(nodes: CanvasNodeData[], connections: CanvasConnection[], selectedNodeIds: Set<string>): CanvasAutoArrangeResult | null {
    if (!selectedNodeIds.size) return null;
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const atomId = (nodeId: string) => {
        const node = nodeById.get(nodeId);
        if (!node) return nodeId;
        if (node.metadata?.groupId && nodeById.get(node.metadata.groupId)?.type === CanvasNodeType.Group) return node.metadata.groupId;
        if (node.metadata?.batchRootId && nodeById.has(node.metadata.batchRootId)) return node.metadata.batchRootId;
        return node.id;
    };
    const selectedAtoms = new Set(Array.from(selectedNodeIds, atomId));
    const scope = selectedNodeIds.size === 1 ? connectedAtomIds(Array.from(selectedAtoms)[0], nodes, connections, atomId) : selectedAtoms;
    const atoms = Array.from(scope)
        .map((id) => nodeById.get(id))
        .filter((node): node is CanvasNodeData => Boolean(node));
    if (atoms.length < 2) return null;

    const atomIds = new Set(atoms.map((node) => node.id));
    const outgoing = new Map(atoms.map((node) => [node.id, new Set<string>()]));
    const indegree = new Map(atoms.map((node) => [node.id, 0]));
    connections.forEach((connection) => {
        const from = atomId(connection.fromNodeId);
        const to = atomId(connection.toNodeId);
        if (from === to || !atomIds.has(from) || !atomIds.has(to) || outgoing.get(from)?.has(to)) return;
        outgoing.get(from)?.add(to);
        indegree.set(to, (indegree.get(to) || 0) + 1);
    });

    const stableSort = (left: string, right: string) => {
        const a = nodeById.get(left)!;
        const b = nodeById.get(right)!;
        return a.position.y - b.position.y || a.position.x - b.position.x || a.id.localeCompare(b.id);
    };
    const depth = new Map(atoms.map((node) => [node.id, 0]));
    const queue = atoms
        .filter((node) => indegree.get(node.id) === 0)
        .map((node) => node.id)
        .sort(stableSort);
    while (queue.length) {
        const current = queue.shift()!;
        Array.from(outgoing.get(current) || [])
            .sort(stableSort)
            .forEach((next) => {
                depth.set(next, Math.max(depth.get(next) || 0, (depth.get(current) || 0) + 1));
                indegree.set(next, (indegree.get(next) || 0) - 1);
                if (indegree.get(next) === 0) {
                    queue.push(next);
                    queue.sort(stableSort);
                }
            });
    }

    const columns = new Map<number, CanvasNodeData[]>();
    atoms.forEach((node) => {
        const column = depth.get(node.id) || 0;
        columns.set(column, [...(columns.get(column) || []), node]);
    });
    const startX = Math.min(...atoms.map((node) => node.position.x));
    const startY = Math.min(...atoms.map((node) => node.position.y));
    const plannedPositions = new Map<string, Position>();
    let x = startX;
    Array.from(columns.keys())
        .sort((a, b) => a - b)
        .forEach((column) => {
            const columnNodes = columns.get(column)!.sort((a, b) => stableSort(a.id, b.id));
            let y = startY;
            let maxWidth = 180;
            columnNodes.forEach((node) => {
                plannedPositions.set(node.id, { x, y });
                y += Math.max(110, node.height) + 56;
                maxWidth = Math.max(maxWidth, node.width);
            });
            x += maxWidth + 180;
        });

    const movement = new Map<string, Position>();
    plannedPositions.forEach((position, id) => {
        const current = nodeById.get(id)!.position;
        movement.set(id, { x: position.x - current.x, y: position.y - current.y });
    });
    return {
        atomCount: atoms.length,
        nodes: nodes.map((node) => {
            const delta = movement.get(atomId(node.id));
            return delta ? { ...node, position: { x: node.position.x + delta.x, y: node.position.y + delta.y } } : node;
        }),
    };
}

function connectedAtomIds(startId: string, nodes: CanvasNodeData[], connections: CanvasConnection[], atomId: (nodeId: string) => string) {
    const validIds = new Set(nodes.map((node) => atomId(node.id)));
    const adjacent = new Map<string, Set<string>>();
    connections.forEach((connection) => {
        const from = atomId(connection.fromNodeId);
        const to = atomId(connection.toNodeId);
        if (from === to || !validIds.has(from) || !validIds.has(to)) return;
        if (!adjacent.has(from)) adjacent.set(from, new Set());
        if (!adjacent.has(to)) adjacent.set(to, new Set());
        adjacent.get(from)!.add(to);
        adjacent.get(to)!.add(from);
    });
    const visited = new Set<string>();
    const queue = [startId];
    while (queue.length) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        adjacent.get(current)?.forEach((next) => {
            if (!visited.has(next)) queue.push(next);
        });
    }
    return visited;
}
