import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { nanoid } from "nanoid";
import i18n from "@/i18n";
import { localForageStorage } from "@/lib/localforage-storage";
import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, ViewportTransform } from "@/types/canvas";

export type CanvasProject = {
    id: string;
    title: string;
    folderId?: string;
    createdAt: string;
    updatedAt: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    viewport: ViewportTransform;
};

export type CanvasFolder = {
    id: string;
    title: string;
    parentId?: string;
    createdAt: string;
    updatedAt: string;
};

type CanvasStore = {
    hydrated: boolean;
    projects: CanvasProject[];
    folders: CanvasFolder[];
    createProject: (title?: string, folderId?: string) => string;
    importProject: (project: Partial<CanvasProject>, folderId?: string) => string;
    duplicateProject: (id: string, title: string, folderId?: string) => string | null;
    moveProjects: (ids: string[], folderId?: string) => void;
    openProject: (id: string) => CanvasProject | null;
    renameProject: (id: string, title: string) => void;
    deleteProjects: (ids: string[]) => void;
    replaceProjects: (projects: CanvasProject[]) => void;
    replaceFolders: (folders: CanvasFolder[]) => void;
    createFolder: (title: string, parentId?: string) => string;
    renameFolder: (id: string, title: string) => void;
    duplicateFolder: (id: string, title: string, parentId?: string) => string | null;
    moveFolder: (id: string, parentId?: string) => boolean;
    deleteFolders: (ids: string[]) => void;
    updateProject: (id: string, patch: Partial<Pick<CanvasProject, "nodes" | "connections" | "chatSessions" | "activeChatId" | "backgroundMode" | "showImageInfo" | "viewport">>) => void;
};

const initialViewport: ViewportTransform = { x: 0, y: 0, k: 1 };
const CANVAS_STORE_KEY = "infinite-canvas:canvas_store";
type PersistedCanvasState = Pick<CanvasStore, "projects" | "folders">;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let queuedPersistState: PersistedCanvasState | null = null;

const canvasStorage: PersistStorage<CanvasStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<CanvasStore>;
        queuedPersistState = parsed.state as PersistedCanvasState;
        return parsed;
    },
    setItem: (name, value) => {
        const nextState = value.state as PersistedCanvasState;
        if (queuedPersistState && queuedPersistState.projects === nextState.projects && queuedPersistState.folders === nextState.folders) return;
        queuedPersistState = nextState;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveTimer = null;
            void localForageStorage.setItem(name, JSON.stringify(value));
        }, 400);
    },
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useCanvasStore = create<CanvasStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            projects: [],
            folders: [],
            createProject: (title = i18n.t("canvas.project.untitled"), folderId) => {
                const now = new Date().toISOString();
                const id = nanoid();
                const project: CanvasProject = {
                    id,
                    title,
                    folderId,
                    createdAt: now,
                    updatedAt: now,
                    nodes: [],
                    connections: [],
                    chatSessions: [],
                    activeChatId: null,
                    backgroundMode: "lines",
                    showImageInfo: false,
                    viewport: initialViewport,
                };
                set((state) => ({ projects: [project, ...state.projects] }));
                return id;
            },
            importProject: (source, folderId) => {
                const now = new Date().toISOString();
                const project: CanvasProject = {
                    id: nanoid(),
                    title: source.title || i18n.t("canvas.project.imported"),
                    folderId,
                    createdAt: source.createdAt || now,
                    updatedAt: now,
                    nodes: source.nodes || [],
                    connections: source.connections || [],
                    chatSessions: source.chatSessions || [],
                    activeChatId: source.activeChatId || null,
                    backgroundMode: source.backgroundMode || "lines",
                    showImageInfo: source.showImageInfo || false,
                    viewport: source.viewport || initialViewport,
                };
                set((state) => ({ projects: [project, ...state.projects] }));
                return project.id;
            },
            duplicateProject: (id, title, folderId) => {
                const source = get().projects.find((item) => item.id === id);
                if (!source) return null;
                const now = new Date().toISOString();
                const project: CanvasProject = {
                    ...structuredClone(source),
                    id: nanoid(),
                    title: title.trim() || `${source.title} ${i18n.t("canvas.project.copySuffix")}`,
                    folderId,
                    createdAt: now,
                    updatedAt: now,
                };
                set((state) => ({ projects: [project, ...state.projects] }));
                return project.id;
            },
            moveProjects: (ids, folderId) =>
                set((state) => ({
                    projects: state.projects.map((project) => (ids.includes(project.id) ? { ...project, folderId, updatedAt: new Date().toISOString() } : project)),
                })),
            openProject: (id) => {
                return get().projects.find((item) => item.id === id) || null;
            },
            renameProject: (id, title) =>
                set((state) => ({
                    projects: state.projects.map((project) => (project.id === id ? { ...project, title: title.trim() || project.title, updatedAt: new Date().toISOString() } : project)),
                })),
            deleteProjects: (ids) =>
                set((state) => {
                    const projects = state.projects.filter((project) => !ids.includes(project.id));
                    return { projects };
                }),
            replaceProjects: (projects) => set({ projects }),
            replaceFolders: (folders) => set({ folders }),
            createFolder: (title, parentId) => {
                const id = nanoid();
                const now = new Date().toISOString();
                set((state) => ({ folders: [...state.folders, { id, title: title.trim(), parentId, createdAt: now, updatedAt: now }] }));
                return id;
            },
            renameFolder: (id, title) =>
                set((state) => ({
                    folders: state.folders.map((folder) => (folder.id === id ? { ...folder, title: title.trim() || folder.title, updatedAt: new Date().toISOString() } : folder)),
                })),
            duplicateFolder: (id, title, parentId) => {
                const state = get();
                const source = state.folders.find((folder) => folder.id === id);
                if (!source) return null;
                const sourceIds = collectFolderIds([id], state.folders);
                const idMap = new Map(Array.from(sourceIds, (sourceId) => [sourceId, nanoid()] as const));
                const now = new Date().toISOString();
                const folders = state.folders
                    .filter((folder) => sourceIds.has(folder.id))
                    .map((folder) => ({
                        ...folder,
                        id: idMap.get(folder.id)!,
                        title: folder.id === id ? title.trim() || `${folder.title} ${i18n.t("canvas.project.copySuffix")}` : folder.title,
                        parentId: folder.id === id ? parentId : folder.parentId ? idMap.get(folder.parentId) : undefined,
                        createdAt: now,
                        updatedAt: now,
                    }));
                const projects = state.projects
                    .filter((project) => project.folderId && sourceIds.has(project.folderId))
                    .map((project) => ({ ...structuredClone(project), id: nanoid(), folderId: idMap.get(project.folderId!), createdAt: now, updatedAt: now }));
                set({ folders: [...state.folders, ...folders], projects: [...projects, ...state.projects] });
                return idMap.get(id)!;
            },
            moveFolder: (id, parentId) => {
                const state = get();
                if (!state.folders.some((folder) => folder.id === id)) return false;
                if (parentId && collectFolderIds([id], state.folders).has(parentId)) return false;
                set({ folders: state.folders.map((folder) => (folder.id === id ? { ...folder, parentId, updatedAt: new Date().toISOString() } : folder)) });
                return true;
            },
            deleteFolders: (ids) =>
                set((state) => {
                    const deleted = collectFolderIds(ids, state.folders);
                    return {
                        folders: state.folders.filter((folder) => !deleted.has(folder.id)),
                        projects: state.projects.filter((project) => !project.folderId || !deleted.has(project.folderId)),
                    };
                }),
            updateProject: (id, patch) =>
                set((state) => ({
                    projects: state.projects.map((project) => (project.id === id ? { ...project, ...patch, updatedAt: new Date().toISOString() } : project)),
                })),
        }),
        {
            name: CANVAS_STORE_KEY,
            storage: canvasStorage,
            partialize: (state) =>
                ({
                    projects: state.projects,
                    folders: state.folders,
                }) as StorageValue<CanvasStore>["state"],
            onRehydrateStorage: () => () => {
                useCanvasStore.setState({ hydrated: true });
            },
        },
    ),
);

function collectFolderIds(ids: string[], folders: CanvasFolder[]) {
    const result = new Set(ids);
    let changed = true;
    while (changed) {
        changed = false;
        folders.forEach((folder) => {
            if (folder.parentId && result.has(folder.parentId) && !result.has(folder.id)) {
                result.add(folder.id);
                changed = true;
            }
        });
    }
    return result;
}
