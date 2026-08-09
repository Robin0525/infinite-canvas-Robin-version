import axios from "axios";
import { saveAs } from "file-saver";

type DownloadSource = Blob | string;

function isDesktopApp() {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function sourceToBlob(source: DownloadSource) {
    if (source instanceof Blob) return source;
    if (source.startsWith("data:")) return fetch(source).then((response) => response.blob());
    const response = await axios.get<Blob>(source, { responseType: "blob" });
    return response.data;
}

/**
 * Saves a generated or locally stored file. Desktop builds use a native save
 * dialog because WebView download handling is inconsistent on Windows.
 */
export async function downloadFile(source: DownloadSource, filename: string) {
    if (!isDesktopApp()) {
        saveAs(source, filename);
        return true;
    }

    const blob = await sourceToBlob(source);
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<boolean>("save_download", { filename, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) });
}
