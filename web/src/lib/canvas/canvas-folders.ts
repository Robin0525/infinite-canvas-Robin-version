import type { CanvasFolder } from "@/stores/canvas/use-canvas-store";

export function folderDescendantIds(folderId: string, folders: CanvasFolder[]) {
    const ids = new Set([folderId]);
    let changed = true;
    while (changed) {
        changed = false;
        folders.forEach((folder) => {
            if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
                ids.add(folder.id);
                changed = true;
            }
        });
    }
    return ids;
}

export function folderPath(folderId: string | undefined, folders: CanvasFolder[]) {
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    const path: CanvasFolder[] = [];
    const visited = new Set<string>();
    let current = folderId ? byId.get(folderId) : undefined;
    while (current && !visited.has(current.id)) {
        visited.add(current.id);
        path.unshift(current);
        current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return path;
}

export function folderOptions(folders: CanvasFolder[], rootLabel: string, excludedIds = new Set<string>()) {
    return [
        { value: "", label: rootLabel },
        ...folders
            .filter((folder) => !excludedIds.has(folder.id))
            .map((folder) => ({
                value: folder.id,
                label: `${folderPath(folder.id, folders)
                    .map((item) => item.title)
                    .join(" / ")}`,
            }))
            .sort((a, b) => a.label.localeCompare(b.label)),
    ];
}
