import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { App, Breadcrumb, Button, Input, Modal } from "antd";
import { Download, FileUp, FolderInput, FolderPlus, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { readZip } from "@/lib/zip";
import { setMediaBlob } from "@/services/file-storage";
import { setImageBlob } from "@/services/image-storage";
import { CanvasDeleteProjectsDialog } from "@/components/canvas/canvas-delete-projects-dialog";
import { CanvasProjectCard } from "@/components/canvas/canvas-project-card";
import { CanvasFolderCard } from "@/components/canvas/canvas-folder-card";
import { CanvasFolderSelect } from "@/components/canvas/canvas-folder-select";
import type { CanvasExportFile } from "@/types/canvas-export";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useCanvasUiStore } from "@/stores/canvas/use-canvas-ui-store";
import { exportCanvasProjects } from "@/lib/canvas/canvas-export";
import { folderPath } from "@/lib/canvas/canvas-folders";

export default function CanvasPage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const inputRef = useRef<HTMLInputElement>(null);
    const autoOpenRef = useRef(false);
    const [exporting, setExporting] = useState(false);
    const hydrated = useCanvasStore((state) => state.hydrated);
    const projects = useCanvasStore((state) => state.projects);
    const folders = useCanvasStore((state) => state.folders);
    const createProject = useCanvasStore((state) => state.createProject);
    const importProject = useCanvasStore((state) => state.importProject);
    const createFolder = useCanvasStore((state) => state.createFolder);
    const moveProjects = useCanvasStore((state) => state.moveProjects);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);
    const clearSelectedIds = useCanvasUiStore((state) => state.clearSelectedProjectIds);
    const [createFolderOpen, setCreateFolderOpen] = useState(false);
    const [folderTitle, setFolderTitle] = useState("");
    const [moveOpen, setMoveOpen] = useState(false);
    const [moveFolderId, setMoveFolderId] = useState<string | undefined>();

    const mode = searchParams.get("mode");
    const agentMode = mode === "new" || mode === "recent" || mode === "choose";
    const agentQuery = agentMode ? `?${searchParams.toString()}` : "";
    const requestedFolderId = searchParams.get("folder") || undefined;
    const currentFolderId = requestedFolderId && folders.some((folder) => folder.id === requestedFolderId) ? requestedFolderId : undefined;
    const currentFolders = folders.filter((folder) => folder.parentId === currentFolderId).sort((a, b) => a.title.localeCompare(b.title));
    const currentProjects = projects.filter((project) => project.folderId === currentFolderId);
    const breadcrumbs = folderPath(currentFolderId, folders);
    const enterProject = (id: string) => {
        navigate(`/canvas/${id}${agentQuery}`);
    };
    const createAndEnter = () => enterProject(createProject(t("canvas.defaultTitle", { count: projects.length + 1 }), currentFolderId));
    const openFolder = (folderId?: string) => {
        const params = new URLSearchParams(searchParams);
        if (folderId) params.set("folder", folderId);
        else params.delete("folder");
        clearSelectedIds();
        navigate(`/canvas${params.size ? `?${params.toString()}` : ""}`);
    };
    const importCanvas = async (file?: File) => {
        if (!file) return;
        try {
            const zip = await readZip(file);
            const projectFile = zip.get("projects.json");
            if (!projectFile) throw new Error("missing projects.json");
            const data = JSON.parse(await projectFile.text()) as CanvasExportFile;
            await Promise.all(
                data.projects.flatMap((project) =>
                    project.files.map(async (item) => {
                        const blob = zip.get(item.path);
                        if (!blob) return;
                        const typedBlob = blob.type ? blob : blob.slice(0, blob.size, item.mimeType);
                        await (item.storageKey.startsWith("image:") ? setImageBlob(item.storageKey, typedBlob) : setMediaBlob(item.storageKey, typedBlob));
                    }),
                ),
            );
            data.projects.forEach((item) => importProject(item.project, currentFolderId));
            message.success(t("canvas.imported", { count: data.projects.length }));
        } catch {
            message.error(t("canvas.importFailed"));
        } finally {
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    const exportSelectedProjects = async () => {
        const targets = projects.filter((project) => selectedIds.includes(project.id));
        if (!targets.length || exporting) return;
        setExporting(true);
        const hide = message.loading(t("canvas.libraryExporting"), 0);
        try {
            const saved = await exportCanvasProjects(targets, `${t("canvas.title")}-${targets.length}`);
            if (saved) message.success(t("canvas.libraryExported", { count: targets.length }));
        } catch (error) {
            console.error(error);
            message.error(t("canvas.libraryExportFailed"));
        } finally {
            hide();
            setExporting(false);
        }
    };

    const confirmCreateFolder = () => {
        if (!folderTitle.trim()) return;
        createFolder(folderTitle, currentFolderId);
        setFolderTitle("");
        setCreateFolderOpen(false);
    };

    const confirmMoveSelected = () => {
        moveProjects(selectedIds, moveFolderId);
        clearSelectedIds();
        setMoveOpen(false);
        message.success(t("canvas.project.moved"));
    };

    useEffect(() => {
        if (!hydrated || autoOpenRef.current || (mode !== "new" && mode !== "recent")) return;
        autoOpenRef.current = true;
        enterProject(mode === "new" ? createProject(t("canvas.defaultTitle", { count: projects.length + 1 }), currentFolderId) : projects[0]?.id || createProject(t("canvas.defaultTitle", { count: projects.length + 1 }), currentFolderId));
    }, [createProject, currentFolderId, hydrated, mode, projects, t]);

    if (hydrated && (mode === "new" || mode === "recent")) return <main className="flex h-full items-center justify-center bg-background text-sm text-stone-500">{t("canvas.opening")}</main>;

    return (
        <main className="h-full overflow-auto bg-background text-stone-950 dark:text-stone-100">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
                <header className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-6 dark:border-stone-800">
                    <div>
                        <p className="text-xs text-stone-500">{t("canvas.library")}</p>
                        <h1 className="mt-3 text-3xl font-semibold">{t("canvas.title")}</h1>
                        <Breadcrumb
                            className="mt-3"
                            items={[{ title: <button onClick={() => openFolder()}>{t("canvas.folder.root")}</button> }, ...breadcrumbs.map((folder) => ({ title: <button onClick={() => openFolder(folder.id)}>{folder.title}</button> }))]}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        {selectedIds.length ? (
                            <>
                                <Button disabled={!hydrated || exporting} loading={exporting} icon={<Download className="size-4" />} onClick={() => void exportSelectedProjects()}>
                                    {t("canvas.exportSelected")}
                                </Button>
                                <Button
                                    disabled={!hydrated}
                                    icon={<FolderInput className="size-4" />}
                                    onClick={() => {
                                        setMoveFolderId(currentFolderId);
                                        setMoveOpen(true);
                                    }}
                                >
                                    {t("canvas.project.move")}
                                </Button>
                                <Button disabled={!hydrated} onClick={() => setDeleteIds(selectedIds)}>
                                    {t("canvas.deleteSelected")}
                                </Button>
                            </>
                        ) : null}
                        {currentProjects.length ? (
                            <Button disabled={!hydrated} onClick={() => setDeleteIds(currentProjects.map((project) => project.id))}>
                                {t("canvas.deleteAll")}
                            </Button>
                        ) : null}
                        <Button disabled={!hydrated} icon={<FolderPlus className="size-4" />} onClick={() => setCreateFolderOpen(true)}>
                            {t("canvas.folder.create")}
                        </Button>
                        <Button disabled={!hydrated} icon={<FileUp className="size-4" />} onClick={() => inputRef.current?.click()}>
                            {t("canvas.import")}
                        </Button>
                        <Button disabled={!hydrated} type="primary" icon={<Plus className="size-4" />} onClick={createAndEnter}>
                            {t("canvas.create")}
                        </Button>
                    </div>
                </header>

                {!hydrated ? (
                    <section className="flex min-h-[360px] items-center justify-center border-y border-stone-200 text-sm text-stone-500 dark:border-stone-800">{t("canvas.loading")}</section>
                ) : currentFolders.length || currentProjects.length ? (
                    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                        {currentFolders.map((folder) => (
                            <CanvasFolderCard key={folder.id} folder={folder} onOpen={() => openFolder(folder.id)} />
                        ))}
                        {currentProjects.map((project) => (
                            <CanvasProjectCard key={project.id} project={project} />
                        ))}
                    </div>
                ) : (
                    <section className="flex min-h-[360px] flex-col items-center justify-center border-y border-stone-200 text-center dark:border-stone-800">
                        <h2 className="text-xl font-medium">{t("canvas.empty")}</h2>
                        <p className="mt-3 text-sm text-stone-500">{t("canvas.emptyDescription")}</p>
                        <Button type="primary" className="mt-6" icon={<Plus className="size-4" />} onClick={createAndEnter}>
                            {t("canvas.create")}
                        </Button>
                    </section>
                )}
            </div>

            <input ref={inputRef} type="file" accept="application/zip,.zip" className="hidden" onChange={(event) => void importCanvas(event.target.files?.[0])} />
            <CanvasDeleteProjectsDialog />
            <Modal
                title={t("canvas.folder.createTitle")}
                open={createFolderOpen}
                onCancel={() => setCreateFolderOpen(false)}
                onOk={confirmCreateFolder}
                okButtonProps={{ disabled: !folderTitle.trim() }}
                okText={t("common.confirm")}
                cancelText={t("common.cancel")}
            >
                <Input value={folderTitle} onChange={(event) => setFolderTitle(event.target.value)} onPressEnter={confirmCreateFolder} autoFocus />
            </Modal>
            <Modal title={t("canvas.project.moveTitle")} open={moveOpen} onCancel={() => setMoveOpen(false)} onOk={confirmMoveSelected} okText={t("common.confirm")} cancelText={t("common.cancel")}>
                <CanvasFolderSelect value={moveFolderId} onChange={setMoveFolderId} className="w-full" />
            </Modal>
        </main>
    );
}
