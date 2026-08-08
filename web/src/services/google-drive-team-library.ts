import axios, { AxiosError } from "axios";

export type GoogleDriveFile = {
    id: string;
    name: string;
    mimeType: string;
    modifiedTime: string;
    size?: string;
    description?: string;
    path?: string;
};

export type GoogleDriveUser = { displayName: string; emailAddress: string; photoLink?: string };

type GoogleTokenClient = { requestAccessToken: (options?: { prompt?: string }) => void };
type GoogleAccounts = { oauth2: { initTokenClient: (options: { client_id: string; scope: string; callback: (response: { access_token?: string; error?: string }) => void }) => GoogleTokenClient } };

declare global {
    interface Window { google?: { accounts: GoogleAccounts } }
}

const GIS_URL = "https://accounts.google.com/gsi/client";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const ACCESS_TOKEN_STORAGE_KEY = "infinite-canvas:google-drive-team-library-token";
let gisPromise: Promise<void> | null = null;

type StoredAccessToken = { value: string; expiresAt: number; refreshToken?: string };

function readStoredToken() {
    try { return JSON.parse(localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) || "null") as StoredAccessToken | null; }
    catch { return null; }
}

export function readGoogleDriveAccessToken() {
    try {
        const data = readStoredToken();
        return data && data.expiresAt > Date.now() ? data.value : "";
    } catch { return ""; }
}

export function saveGoogleDriveAccessToken(value: string, expiresInSeconds = 3600, refreshToken?: string) {
    const stored = readStoredToken();
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, JSON.stringify({ value, expiresAt: Date.now() + Math.max(60, expiresInSeconds - 60) * 1000, refreshToken: refreshToken || stored?.refreshToken }));
}

export function hasGoogleDriveRefreshToken() { return Boolean(readStoredToken()?.refreshToken); }

export function clearGoogleDriveAccessToken() {
    localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
}

export async function requestGoogleDriveAccessToken(clientId: string, clientSecret = "") {
    if (!clientId.trim()) throw new Error("请先填写 Google OAuth Client ID");
    if (isDesktopApp()) return requestDesktopGoogleDriveAccessToken(clientId, clientSecret);
    await loadGoogleIdentityServices();
    return new Promise<string>((resolve, reject) => {
        const client = window.google?.accounts.oauth2.initTokenClient({
            client_id: clientId.trim(),
            scope: DRIVE_SCOPE,
            callback: (response) => response.access_token ? resolve(response.access_token) : reject(new Error(response.error || "Google 授权失败")),
        });
        if (!client) return reject(new Error("Google 授权服务不可用"));
        client.requestAccessToken();
    });
}

async function requestDesktopGoogleDriveAccessToken(clientId: string, clientSecret: string) {
    if (!clientSecret.trim()) throw new Error("请先填写 Google Desktop Client Secret");
    const { invoke } = await import("@tauri-apps/api/core");
    const [accessToken, expiresIn, refreshToken] = await invoke<[string, number, string]>("google_oauth_authorize", { clientId: clientId.trim(), clientSecret: clientSecret.trim() });
    saveGoogleDriveAccessToken(accessToken, expiresIn, refreshToken);
    return accessToken;
}

export async function restoreGoogleDriveAccessToken(clientId: string, clientSecret: string) {
    const current = readGoogleDriveAccessToken();
    if (current) return current;
    const refreshToken = readStoredToken()?.refreshToken;
    if (!refreshToken || !isDesktopApp() || !clientId.trim() || !clientSecret.trim()) return "";
    try {
        const { invoke } = await import("@tauri-apps/api/core");
        const [accessToken, expiresIn] = await invoke<[string, number]>("google_oauth_refresh", { clientId: clientId.trim(), clientSecret: clientSecret.trim(), refreshToken });
        saveGoogleDriveAccessToken(accessToken, expiresIn, refreshToken);
        return accessToken;
    } catch (error) {
        clearGoogleDriveAccessToken();
        throw error;
    }
}

export async function listGoogleDriveFolderFiles(accessToken: string, folderId: string) {
    const rootId = normalizeGoogleDriveFolderId(folderId);
    if (!rootId) throw new Error("请先填写已发布库文件夹 ID");
    const result: GoogleDriveFile[] = [];
    const folders = [{ id: rootId, path: "" }];
    for (let index = 0; index < folders.length && index < 100; index += 1) {
        const folder = folders[index];
        const children = await listFolderChildren(accessToken, folder.id);
        children.forEach((item) => {
            const path = folder.path ? `${folder.path}/${item.name}` : item.name;
            if (item.mimeType === "application/vnd.google-apps.folder") folders.push({ id: item.id, path });
            else result.push({ ...item, path });
        });
    }
    return result.sort((a, b) => Date.parse(b.modifiedTime) - Date.parse(a.modifiedTime));
}

export async function listGoogleDriveFolderChildren(accessToken: string, folderId: string) {
    const normalized = normalizeGoogleDriveFolderId(folderId);
    if (!normalized) throw new Error("请先填写团队库文件夹 ID");
    return listFolderChildren(accessToken, normalized);
}

export function isGoogleDriveFolder(file: GoogleDriveFile) {
    return file.mimeType === "application/vnd.google-apps.folder";
}

export async function getGoogleDriveUser(accessToken: string) {
    const data = await driveGet<{ user?: GoogleDriveUser }>(accessToken, "https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,photoLink)");
    if (!data.user) throw new Error("无法读取当前 Google 账号信息");
    return data.user;
}

export async function revokeGoogleDriveAccessToken(accessToken: string) {
    const token = readStoredToken()?.refreshToken || accessToken;
    try { await axios.post(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`); }
    catch { /* Local logout still succeeds if Google is unreachable. */ }
    clearGoogleDriveAccessToken();
}

export async function downloadGoogleDriveFile(accessToken: string, file: GoogleDriveFile) {
    return driveGet<Blob>(accessToken, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`, "blob");
}

async function driveGet<T>(accessToken: string, url: string, responseType?: "blob") {
    try { return (await axios.get<T>(url, { headers: { Authorization: `Bearer ${accessToken}` }, responseType })).data; }
    catch (error) {
        const status = error instanceof AxiosError ? error.response?.status : undefined;
        if (status === 401) throw new Error("Google 授权已过期，请重新连接");
        if (status === 403) throw new Error("没有该团队库的读取权限，请确认共享文件夹权限");
        throw new Error(status ? `Google Drive 请求失败（${status}）` : "Google Drive 网络请求失败");
    }
}

async function listFolderChildren(accessToken: string, folderId: string) {
    const query = `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`;
    const params = new URLSearchParams({ q: query, orderBy: "folder,name", pageSize: "1000", supportsAllDrives: "true", includeItemsFromAllDrives: "true", fields: "files(id,name,mimeType,modifiedTime,size,description)" });
    const data = await driveGet<{ files?: GoogleDriveFile[] }>(accessToken, `https://www.googleapis.com/drive/v3/files?${params}`);
    return data.files || [];
}

function normalizeGoogleDriveFolderId(value: string) {
    const input = value.trim();
    if (!input) return "";
    const folderMatch = input.match(/\/folders\/([^/?#]+)/);
    if (folderMatch) return folderMatch[1];
    try { return new URL(input).searchParams.get("id") || input; }
    catch { return input; }
}

function isDesktopApp() { return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window; }

function loadGoogleIdentityServices() {
    if (window.google?.accounts.oauth2) return Promise.resolve();
    if (gisPromise) return gisPromise;
    gisPromise = new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = GIS_URL;
        script.async = true;
        const timeout = window.setTimeout(() => reject(new Error("Google 授权服务加载超时，请检查网络后重试")), 15000);
        script.onload = () => {
            window.clearTimeout(timeout);
            if (window.google?.accounts.oauth2) resolve();
            else reject(new Error("Google 授权服务加载失败"));
        };
        script.onerror = () => {
            window.clearTimeout(timeout);
            reject(new Error("无法加载 Google 授权服务，请检查网络"));
        };
        document.head.appendChild(script);
    });
    return gisPromise;
}
