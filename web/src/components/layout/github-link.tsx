import { GithubOutlined } from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";

import { cn } from "@/lib/utils";

type GitHubLinkProps = {
    className?: string;
    style?: React.CSSProperties;
};

export function GitHubLink({ className, style }: GitHubLinkProps) {
    const url = "https://github.com/Robin0525/infinite-canvas-Robin-version";
    return (
        <a
            className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-full text-stone-600 transition hover:bg-stone-100 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-white", className)}
            style={style}
            href={url}
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            title="GitHub"
            onClick={(event) => {
                if (!("__TAURI_INTERNALS__" in window)) return;
                event.preventDefault();
                void invoke("open_system_browser", { url });
            }}
        >
            <GithubOutlined className="text-base" />
        </a>
    );
}
