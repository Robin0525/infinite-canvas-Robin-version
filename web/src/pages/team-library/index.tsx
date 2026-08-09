import { useEffect, useRef, useState } from "react";
import { Alert, App, Avatar, Breadcrumb, Button, Empty, Input, Modal, Spin, Tag } from "antd";
import { Cloud, Download, ExternalLink, FileArchive, FileJson2, Folder, FolderOpen, LogOut, RefreshCw, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { readZip } from "@/lib/zip";
import { setMediaBlob } from "@/services/file-storage";
import { setImageBlob } from "@/services/image-storage";
import { clearGoogleDriveAccessToken, downloadGoogleDriveFile, getGoogleDriveUser, hasGoogleDriveRefreshToken, isGoogleDriveFolder, listGoogleDriveFolderChildren, readGoogleDriveAccessToken, requestGoogleDriveAccessToken, restoreGoogleDriveAccessToken, revokeGoogleDriveAccessToken, type GoogleDriveFile, type GoogleDriveUser } from "@/services/google-drive-team-library";
import { readAssetPackage } from "@/pages/assets/asset-transfer";
import { useAssetStore } from "@/stores/use-asset-store";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useConfigStore } from "@/stores/use-config-store";
import type { CanvasExportFile } from "@/types/canvas-export";

function errorMessage(error: unknown, fallback: string) {
    if (typeof error === "string" && error.trim()) return error;
    if (error instanceof Error && error.message) return error.message;
    if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
    return fallback;
}

export default function TeamLibraryPage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const config = useConfigStore((state) => state.googleDriveTeamLibrary);
    const updateConfig = useConfigStore((state) => state.updateGoogleDriveTeamLibrary);
    const importProject = useCanvasStore((state) => state.importProject);
    const addAsset = useAssetStore((state) => state.addAsset);
    const [accessToken, setAccessToken] = useState(readGoogleDriveAccessToken);
    const [files, setFiles] = useState<GoogleDriveFile[]>([]);
    const [folderPath, setFolderPath] = useState<Array<{ id: string; name: string }>>([]);
    const [googleUser, setGoogleUser] = useState<GoogleDriveUser | null>(null);
    const [loading, setLoading] = useState(false);
    const [importingId, setImportingId] = useState("");
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [connectionError, setConnectionError] = useState("");
    const autoRefreshRef = useRef(false);
    const oauthJsonInputRef = useRef<HTMLInputElement>(null);

    const loadLibrary = async (token: string, folderId = config.publishedFolderId, path = folderPath) => {
        const user = await getGoogleDriveUser(token);
        setGoogleUser(user);
        setFiles(await listGoogleDriveFolderChildren(token, folderId));
        setFolderPath(path.length ? path : [{ id: config.publishedFolderId, name: t("teamLibrary.rootFolder") }]);
    };

    const connectAndLoad = async () => {
        setConnectionError("");
        setLoading(true);
        try {
            const token = await requestGoogleDriveAccessToken(config.clientId, config.clientSecret);
            setAccessToken(token);
            await loadLibrary(token, config.publishedFolderId, [{ id: config.publishedFolderId, name: t("teamLibrary.rootFolder") }]);
            message.success(t("teamLibrary.connected"));
        } catch (error) {
            const text = errorMessage(error, t("teamLibrary.loadFailed"));
            setConnectionError(text);
            message.error(text);
        } finally {
            setLoading(false);
        }
    };
    const refresh = async () => {
        setConnectionError("");
        setLoading(true);
        try {
            const token = await restoreGoogleDriveAccessToken(config.clientId, config.clientSecret);
            if (!token) {
                await connectAndLoad();
                return;
            }
            setAccessToken(token);
            const current = folderPath.at(-1) || { id: config.publishedFolderId, name: t("teamLibrary.rootFolder") };
            await loadLibrary(token, current.id, folderPath.length ? folderPath : [current]);
            message.success(t("teamLibrary.refreshed"));
        }
        catch (error) {
            const text = errorMessage(error, t("teamLibrary.loadFailed"));
            if (text.includes("授权已过期") || text.includes("重新连接")) {
                clearGoogleDriveAccessToken();
                setAccessToken("");
                setGoogleUser(null);
            }
            message.error(text);
            setConnectionError(text);
        }
        finally { setLoading(false); }
    };
    useEffect(() => {
        if (autoRefreshRef.current || (!accessToken && !hasGoogleDriveRefreshToken()) || !config.publishedFolderId.trim()) return;
        autoRefreshRef.current = true;
        void refresh();
    }, [accessToken, config.publishedFolderId]);
    const disconnect = async () => {
        if (accessToken) await revokeGoogleDriveAccessToken(accessToken);
        clearGoogleDriveAccessToken();
        setAccessToken("");
        setGoogleUser(null);
        setFiles([]);
        setFolderPath([]);
        setConnectionError("");
        autoRefreshRef.current = false;
        message.success(t("teamLibrary.disconnected"));
    };
    const importOAuthJson = async (file: File) => {
        try {
            const json = JSON.parse(await file.text()) as { installed?: { client_id?: string; client_secret?: string } };
            const client = json.installed;
            if (!client?.client_id || !client.client_secret) throw new Error(t("teamLibrary.oauthJsonInvalid"));
            updateConfig("clientId", client.client_id);
            updateConfig("clientSecret", client.client_secret);
            clearGoogleDriveAccessToken();
            setAccessToken("");
            setGoogleUser(null);
            setFiles([]);
            setFolderPath([]);
            message.success(t("teamLibrary.oauthJsonImported"));
        } catch (error) {
            message.error(errorMessage(error, t("teamLibrary.oauthJsonInvalid")));
        } finally {
            if (oauthJsonInputRef.current) oauthJsonInputRef.current.value = "";
        }
    };
    const openFolder = async (folder: GoogleDriveFile) => {
        if (!accessToken) return;
        setLoading(true);
        try {
            const nextPath = [...folderPath, { id: folder.id, name: folder.name }];
            await loadLibrary(accessToken, folder.id, nextPath);
        } catch (error) { message.error(errorMessage(error, t("teamLibrary.loadFailed"))); }
        finally { setLoading(false); }
    };
    const openBreadcrumb = async (index: number) => {
        if (!accessToken || index === folderPath.length - 1) return;
        const nextPath = folderPath.slice(0, index + 1);
        const folder = nextPath[index];
        setLoading(true);
        try { await loadLibrary(accessToken, folder.id, nextPath); }
        catch (error) { message.error(errorMessage(error, t("teamLibrary.loadFailed"))); }
        finally { setLoading(false); }
    };
    const importFile = async (file: GoogleDriveFile) => {
        if (!accessToken) return;
        setImportingId(file.id);
        try {
            const blob = await downloadGoogleDriveFile(accessToken, file);
            const name = file.name.toLowerCase();
            if (name.endsWith(".zip")) {
                const zip = await readZip(blob);
                if (zip.has("projects.json")) {
                    const data = JSON.parse(await zip.get("projects.json")!.text()) as CanvasExportFile;
                    await Promise.all(data.projects.flatMap((project) => project.files.map(async (item) => {
                        const media = zip.get(item.path);
                        if (!media) return;
                        const typed = media.type ? media : media.slice(0, media.size, item.mimeType);
                        await (item.storageKey.startsWith("image:") ? setImageBlob(item.storageKey, typed) : setMediaBlob(item.storageKey, typed));
                    })));
                    data.projects.forEach((item) => importProject(item.project));
                    message.success(t("teamLibrary.canvasImported", { count: data.projects.length }));
                } else if (zip.has("assets.json")) {
                    const assets = await readAssetPackage(blob);
                    assets.forEach((asset) => {
                        const payload = { ...asset } as Record<string, unknown>;
                        delete payload.id; delete payload.createdAt; delete payload.updatedAt;
                        addAsset(payload as Parameters<typeof addAsset>[0]);
                    });
                    message.success(t("teamLibrary.assetsImported", { count: assets.length }));
                } else throw new Error(t("teamLibrary.unsupportedPackage"));
            } else if (name.endsWith(".json")) {
                const records = JSON.parse(await blob.text()) as Array<{ title?: string; prompt?: string; tags?: string[]; description?: string }>;
                if (!Array.isArray(records)) throw new Error(t("teamLibrary.unsupportedPackage"));
                const prompts = records.filter((item) => item.title && item.prompt);
                prompts.forEach((item) => addAsset({ kind: "text", title: item.title!, coverUrl: "", tags: item.tags || [], source: t("teamLibrary.source"), note: item.description || "", data: { content: item.prompt! } }));
                message.success(t("teamLibrary.promptsImported", { count: prompts.length }));
            } else throw new Error(t("teamLibrary.unsupportedFile"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("teamLibrary.importFailed"));
        } finally { setImportingId(""); }
    };

    return <main className="h-full overflow-auto bg-background text-stone-950 dark:text-stone-100"><div className="mx-auto max-w-6xl px-6 py-8">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-6 dark:border-stone-800"><div><p className="text-xs text-stone-500">Google Drive</p><h1 className="mt-2 text-3xl font-semibold">{t("teamLibrary.title")}</h1><p className="mt-2 text-sm text-stone-500">{t("teamLibrary.description")}</p>{googleUser ? <div className="mt-3 flex items-center gap-2"><Avatar size={24} src={googleUser.photoLink}>{googleUser.displayName.slice(0, 1)}</Avatar><Tag color="success">{t("teamLibrary.connectedStatus")}</Tag><span className="text-xs text-stone-500">{googleUser.displayName} · {googleUser.emailAddress}</span></div> : null}</div><div className="flex flex-wrap gap-2"><Button icon={<Settings2 className="size-4" />} onClick={() => setSettingsOpen(true)}>{t("teamLibrary.settings")}</Button>{accessToken ? <><Button type="primary" icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void refresh()}>{t("teamLibrary.refresh")}</Button><Button icon={<LogOut className="size-4" />} onClick={() => void disconnect()}>{t("teamLibrary.disconnect")}</Button></> : <Button type="primary" icon={<Cloud className="size-4" />} loading={loading} onClick={() => void connectAndLoad()}>{t("teamLibrary.connect")}</Button>}</div></header>
        {connectionError ? <Alert className="mt-5" type="error" showIcon message={t("teamLibrary.connectionFailed")} description={connectionError} /> : null}
        {accessToken && folderPath.length ? <Breadcrumb className="mt-5" items={folderPath.map((folder, index) => ({ title: <button type="button" className="hover:text-blue-600" onClick={() => void openBreadcrumb(index)}>{folder.name}</button> }))} /> : null}
        {!loading && !files.length ? <Empty className="py-20" description={accessToken ? t("teamLibrary.empty") : t("teamLibrary.connectHint")} /> : null}
        {loading ? <div className="flex justify-center py-20"><Spin /></div> : null}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{files.map((file) => { const folder = isGoogleDriveFolder(file); return <article key={file.id} className="rounded-lg border border-stone-200 p-4 dark:border-stone-800"><button type="button" className={`flex w-full gap-3 text-left ${folder ? "cursor-pointer" : "cursor-default"}`} onClick={() => folder && void openFolder(file)}>{folder ? <Folder className="mt-0.5 size-5 shrink-0 text-amber-500" /> : <FileArchive className="mt-0.5 size-5 shrink-0 text-stone-500" />}<div className="min-w-0 flex-1"><h2 className="truncate font-medium">{file.name}</h2><p className="mt-1 text-xs text-stone-500">{file.modifiedTime ? new Date(file.modifiedTime).toLocaleString() : ""}</p>{file.description ? <p className="mt-2 line-clamp-2 text-xs text-stone-500">{file.description}</p> : null}</div></button><div className="mt-4 flex justify-end">{folder ? <Button size="small" type="text" icon={<FolderOpen className="size-4" />} onClick={() => void openFolder(file)}>{t("teamLibrary.openFolder")}</Button> : <Button size="small" type="text" loading={importingId === file.id} icon={<Download className="size-4" />} onClick={() => void importFile(file)}>{t("teamLibrary.import")}</Button>}</div></article>; })}</div>
        {config.submissionFormUrl ? <a className="mt-8 inline-flex items-center gap-2 text-sm text-blue-600 hover:underline" href={config.submissionFormUrl} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />{t("teamLibrary.submit")}</a> : null}
    </div><Modal title={t("teamLibrary.settings")} open={settingsOpen} onCancel={() => setSettingsOpen(false)} footer={<Button type="primary" onClick={() => setSettingsOpen(false)}>{t("common.done")}</Button>}><div className="grid gap-4"><div><input ref={oauthJsonInputRef} className="hidden" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importOAuthJson(file); }} /><Button icon={<FileJson2 className="size-4" />} onClick={() => oauthJsonInputRef.current?.click()}>{t("teamLibrary.importOAuthJson")}</Button><p className="mt-2 text-xs text-stone-500">{t("teamLibrary.importOAuthJsonHint")}</p></div><label className="text-sm">{t("teamLibrary.clientId")}<Input className="mt-1" value={config.clientId} onChange={(event) => updateConfig("clientId", event.target.value)} /></label><label className="text-sm">{t("teamLibrary.clientSecret")}<Input.Password className="mt-1" value={config.clientSecret || ""} onChange={(event) => updateConfig("clientSecret", event.target.value)} /></label><label className="text-sm">{t("teamLibrary.folderId")}<Input className="mt-1" value={config.publishedFolderId} onChange={(event) => updateConfig("publishedFolderId", event.target.value)} /></label><label className="text-sm">{t("teamLibrary.formUrl")}<Input className="mt-1" value={config.submissionFormUrl} onChange={(event) => updateConfig("submissionFormUrl", event.target.value)} /></label><p className="text-xs text-stone-500">{t("teamLibrary.settingsHint")}</p></div></Modal>
    </main>;
}
