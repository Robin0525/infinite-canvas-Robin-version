import { useCallback, useEffect, useMemo, useState } from "react";
import { App } from "antd";
import { useTranslation } from "react-i18next";
import { APP_VERSION } from "@/constant/env";
import type { ReleaseInfo } from "@/lib/release";

const releasesUrl = "https://api.github.com/repos/Robin0525/infinite-canvas-Robin-version/releases?per_page=20";
type GithubRelease = { tag_name?: string; name?: string; body?: string; published_at?: string; created_at?: string; draft?: boolean; prerelease?: boolean };

function readLocalReleases(): ReleaseInfo[] {
    return __APP_RELEASES__ || [];
}

function toVersionParts(version: string) {
    const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
    return match ? match.slice(1).map(Number) : null;
}

function isNewerVersion(latestVersion: string, currentVersion: string) {
    const latest = toVersionParts(latestVersion);
    const current = toVersionParts(currentVersion);
    if (!latest || !current) return false;
    return latest.some((value, index) => value > current[index] && latest.slice(0, index).every((part, prevIndex) => part === current[prevIndex]));
}

function releaseItems(body: string) {
    return body
        .split("\n")
        .map((line) => line.replace(/^\s*[-*+]\s*/, "").trim())
        .filter(Boolean)
        .map((content) => {
            const match = content.match(/^\[(.+?)\]\s+(.+)$/);
            return match ? { type: match[1], content: match[2] } : { type: "更新", content };
        });
}

function mapRelease(release: GithubRelease): ReleaseInfo | null {
    const version = (release.tag_name || release.name || "").trim();
    if (!version) return null;
    const date = (release.published_at || release.created_at || "").slice(0, 10);
    return { version, date, items: releaseItems(release.body || "") };
}

async function fetchReleases() {
    const response = await fetch(releasesUrl);
    if (!response.ok) throw new Error("release request failed");
    const data = (await response.json()) as GithubRelease[];
    return data
        .filter((release) => !release.draft && !release.prerelease)
        .map(mapRelease)
        .filter((release): release is ReleaseInfo => Boolean(release));
}

export function useVersionCheck() {
    const { t } = useTranslation();
    const currentVersion = APP_VERSION;
    const { message } = App.useApp();
    const localReleases = useMemo(readLocalReleases, []);
    const [latestVersion, setLatestVersion] = useState(currentVersion);
    const [releases, setReleases] = useState<ReleaseInfo[]>(localReleases);
    const [checking, setChecking] = useState(false);
    const [open, setOpen] = useState(false);
    const hasNewVersion = isNewerVersion(latestVersion, currentVersion);

    const checkLatestVersion = useCallback(async () => {
        try {
            const [latest] = await fetchReleases();
            if (!latest) return false;
            setLatestVersion(latest.version);
            return true;
        } catch {
            return false;
        }
    }, [currentVersion]);

    const checkLatestRelease = useCallback(
        async (showMessage = false) => {
            setChecking(true);
            try {
                const releases = await fetchReleases();
                if (!releases.length) throw new Error(t("version.readFailed"));
                setLatestVersion(releases[0].version);
                setReleases(releases);
                if (showMessage) message.success(t("version.updated"));
                return true;
            } catch {
                setLatestVersion(currentVersion);
                setReleases(localReleases);
                if (showMessage) message.error(t("version.updateFailed"));
                return false;
            } finally {
                setChecking(false);
            }
        },
        [currentVersion, localReleases, message, t],
    );

    useEffect(() => {
        void checkLatestVersion();
    }, [checkLatestVersion]);

    const openReleaseModal = useCallback(() => {
        setOpen(true);
        void checkLatestRelease();
    }, [checkLatestRelease]);

    return {
        open,
        setOpen,
        openReleaseModal,
        latestVersion,
        releases,
        checking,
        hasNewVersion,
        checkLatestRelease,
    };
}
