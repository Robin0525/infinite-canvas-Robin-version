import { fetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";

export type UpdateInstallerAsset = {
    name: string;
    url: string;
    size: number;
    digest?: string;
};

export type UpdateDownloadProgress = {
    downloaded: number;
    total: number;
    percent: number;
};

export function isDesktopUpdaterAvailable() {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function downloadAndInstallUpdate(asset: UpdateInstallerAsset, onProgress: (progress: UpdateDownloadProgress) => void) {
    if (!isDesktopUpdaterAvailable()) throw new Error("desktop updater unavailable");

    const response = await fetch(asset.url, { method: "GET" });
    if (!response.ok) throw new Error(`update download failed (${response.status})`);

    const headerSize = Number(response.headers.get("content-length")) || 0;
    const total = asset.size || headerSize;
    const chunks: Uint8Array[] = [];
    let downloaded = 0;

    if (response.body) {
        const reader = response.body.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value?.length) continue;
            chunks.push(value);
            downloaded += value.length;
            onProgress({ downloaded, total, percent: total ? Math.min(99, Math.round((downloaded / total) * 100)) : 0 });
        }
    } else {
        const bytes = new Uint8Array(await response.arrayBuffer());
        chunks.push(bytes);
        downloaded = bytes.length;
    }

    const installer = new Uint8Array(downloaded);
    let offset = 0;
    chunks.forEach((chunk) => {
        installer.set(chunk, offset);
        offset += chunk.length;
    });

    if (asset.size > 0 && installer.length !== asset.size) throw new Error("update size mismatch");
    if (asset.digest?.toLowerCase().startsWith("sha256:")) {
        const expected = asset.digest.slice("sha256:".length).toLowerCase();
        const actual = await sha256(installer);
        if (actual !== expected) throw new Error("update digest mismatch");
    }

    onProgress({ downloaded, total: total || downloaded, percent: 100 });
    await invoke("install_update", { filename: asset.name, bytes: Array.from(installer) });
}

async function sha256(bytes: Uint8Array) {
    const digest = await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
    return Array.from(new Uint8Array(digest))
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
}
