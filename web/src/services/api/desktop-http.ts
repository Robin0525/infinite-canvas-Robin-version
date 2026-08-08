import axios, { AxiosError, type AxiosAdapter, type AxiosRequestConfig, type AxiosResponse } from "axios";

function isDesktopApp() {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function requestHeaders(headers: AxiosRequestConfig["headers"], body: AxiosRequestConfig["data"]) {
    const value = headers && "toJSON" in headers && typeof headers.toJSON === "function" ? headers.toJSON() : headers;
    const isMultipart = typeof FormData !== "undefined" && body instanceof FormData;

    // Let Request generate the multipart boundary. Forwarding Axios's generic
    // `multipart/form-data` header strips that boundary and makes edit APIs
    // reject the request body before they reach the selected image model.
    return Object.fromEntries(
        Object.entries(value || {})
            .filter(([key, item]) => item !== undefined && (!isMultipart || key.toLowerCase() !== "content-type"))
            .map(([key, item]) => [key, String(item)]),
    );
}

async function responseData(response: Response, responseType?: AxiosRequestConfig["responseType"]) {
    if (responseType === "blob") return response.blob();
    if (responseType === "arraybuffer") return response.arrayBuffer();
    if (responseType === "text" || responseType === "stream") return response.text();
    const text = await response.text();
    if (!text) return null;
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return text;
    }
}

const desktopAdapter: AxiosAdapter = async (config) => {
    const { fetch } = await import("@tauri-apps/plugin-http");
    const body = config.data;
    const response = await fetch(new URL(config.url || "", config.baseURL).toString(), {
        method: config.method?.toUpperCase(),
        headers: requestHeaders(config.headers, body),
        body,
        signal: config.signal as AbortSignal | undefined,
    });
    const result: AxiosResponse = {
        data: await responseData(response, config.responseType),
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        config,
        request: response,
    };
    const validateStatus = config.validateStatus || ((status: number) => status >= 200 && status < 300);
    if (validateStatus(response.status)) return result;
    throw new AxiosError(`Request failed with status code ${response.status}`, "ERR_BAD_RESPONSE", config, response, result);
};

if (isDesktopApp()) axios.defaults.adapter = desktopAdapter;
