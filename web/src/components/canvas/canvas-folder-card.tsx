import { useState } from "react";
import { App, Button, Input, Modal } from "antd";
import { Copy, Folder, FolderInput, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CanvasFolderSelect } from "@/components/canvas/canvas-folder-select";
import { folderDescendantIds } from "@/lib/canvas/canvas-folders";
import { useAssetStore } from "@/stores/use-asset-store";
import { useCanvasStore, type CanvasFolder } from "@/stores/canvas/use-canvas-store";

type DialogMode = "rename" | "copy" | "move" | null;

export function CanvasFolderCard({ folder, onOpen }: { folder: CanvasFolder; onOpen: () => void }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const folders = useCanvasStore((state) => state.folders);
    const projects = useCanvasStore((state) => state.projects);
    const renameFolder = useCanvasStore((state) => state.renameFolder);
    const duplicateFolder = useCanvasStore((state) => state.duplicateFolder);
    const moveFolder = useCanvasStore((state) => state.moveFolder);
    const deleteFolders = useCanvasStore((state) => state.deleteFolders);
    const cleanupImages = useAssetStore((state) => state.cleanupImages);
    const [mode, setMode] = useState<DialogMode>(null);
    const [title, setTitle] = useState("");
    const [destinationId, setDestinationId] = useState<string | undefined>();
    const excludedIds = folderDescendantIds(folder.id, folders);
    const childFolders = folders.filter((item) => item.parentId === folder.id).length;
    const childProjects = projects.filter((project) => project.folderId === folder.id).length;

    const openDialog = (nextMode: Exclude<DialogMode, null>) => {
        setMode(nextMode);
        setTitle(nextMode === "copy" ? `${folder.title} ${t("canvas.project.copySuffix")}` : folder.title);
        setDestinationId(folder.parentId);
    };
    const confirm = () => {
        if (mode === "rename") renameFolder(folder.id, title);
        if (mode === "copy") duplicateFolder(folder.id, title, destinationId);
        if (mode === "move") moveFolder(folder.id, destinationId);
        setMode(null);
        message.success(t(`canvas.folder.${mode === "rename" ? "renamed" : mode === "copy" ? "copied" : "moved"}`));
    };
    const confirmDelete = () => {
        Modal.confirm({
            title: t("canvas.folder.deleteTitle"),
            content: t("canvas.folder.deleteDescription"),
            okText: t("common.delete"),
            cancelText: t("common.cancel"),
            okButtonProps: { danger: true },
            centered: true,
            onOk: () => {
                deleteFolders([folder.id]);
                cleanupImages();
            },
        });
    };

    return (
        <>
            <article className="group flex min-h-36 cursor-pointer flex-col justify-between rounded-2xl border border-stone-200 bg-background p-5 transition hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-white/5" onClick={onOpen}>
                <div className="flex items-center gap-3">
                    <Folder className="size-8 fill-amber-300 text-amber-500" />
                    <div className="min-w-0">
                        <h2 className="truncate text-lg font-semibold">{folder.title}</h2>
                        <p className="mt-1 text-xs text-stone-500">{t("canvas.folder.stats", { folders: childFolders, projects: childProjects })}</p>
                    </div>
                </div>
                <div className="mt-6 flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                    <Button type="text" size="small" shape="circle" icon={<Copy className="size-4" />} onClick={() => openDialog("copy")} aria-label={t("canvas.folder.copy")} />
                    <Button type="text" size="small" shape="circle" icon={<FolderInput className="size-4" />} onClick={() => openDialog("move")} aria-label={t("canvas.folder.move")} />
                    <Button type="text" size="small" shape="circle" icon={<Pencil className="size-4" />} onClick={() => openDialog("rename")} aria-label={t("canvas.folder.rename")} />
                    <Button type="text" size="small" shape="circle" icon={<Trash2 className="size-4" />} onClick={confirmDelete} aria-label={t("canvas.folder.delete")} />
                </div>
            </article>
            <Modal
                title={t(`canvas.folder.${mode === "rename" ? "renameTitle" : mode === "copy" ? "copyTitle" : "moveTitle"}`)}
                open={Boolean(mode)}
                onCancel={() => setMode(null)}
                onOk={confirm}
                okButtonProps={{ disabled: mode !== "move" && !title.trim() }}
                okText={t("common.confirm")}
                cancelText={t("common.cancel")}
            >
                {mode !== "move" ? <Input value={title} onChange={(event) => setTitle(event.target.value)} onPressEnter={confirm} autoFocus /> : null}
                {mode !== "rename" ? (
                    <label className="mt-4 grid gap-2 text-sm">
                        <span>{t("canvas.folder.destination")}</span>
                        <CanvasFolderSelect value={destinationId} onChange={setDestinationId} excludedIds={excludedIds} />
                    </label>
                ) : null}
            </Modal>
        </>
    );
}
