import { Tooltip } from "antd";
import { Copy, Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";

import type { CanvasNodeData, ViewportTransform } from "@/types/canvas";

type Props = {
    nodes: CanvasNodeData[];
    viewport: ViewportTransform;
    downloading: boolean;
    onDownload: () => void;
    onDuplicate: () => void;
};

export function CanvasMultiSelectionToolbar({ nodes, viewport, downloading, onDownload, onDuplicate }: Props) {
    const { t } = useTranslation();
    if (nodes.length < 2) return null;

    const bounds = nodes.reduce(
        (current, node) => ({
            left: Math.min(current.left, node.position.x),
            top: Math.min(current.top, node.position.y),
            right: Math.max(current.right, node.position.x + node.width),
        }),
        { left: Infinity, top: Infinity, right: -Infinity },
    );
    const left = viewport.x + ((bounds.left + bounds.right) / 2) * viewport.k;
    const top = viewport.y + bounds.top * viewport.k - 14;

    return (
        <div
            className="absolute z-[72] flex h-12 -translate-x-1/2 -translate-y-full items-center overflow-hidden rounded-[18px] border border-black/10 bg-white text-[15px] text-[#242529] shadow-[0_8px_28px_rgba(15,23,42,.12)]"
            style={{ left, top }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            data-canvas-no-zoom
        >
            <MultiAction title={t("canvas.multiSelection.downloadAll")} icon={<Download className="size-4" />} onClick={onDownload} disabled={downloading} />
            <MultiAction title={t("canvas.multiSelection.copyAll")} icon={<Copy className="size-4" />} onClick={onDuplicate} />
        </div>
    );
}

function MultiAction({ title, icon, onClick, disabled = false }: { title: string; icon: ReactNode; onClick: () => void; disabled?: boolean }) {
    return (
        <Tooltip title={title} placement="top" mouseEnterDelay={0.2} color="#ffffff" styles={{ root: { color: "#242529", boxShadow: "0 8px 24px rgba(15,23,42,.16)", fontSize: 13, fontWeight: 500 } }}>
            <button type="button" className="group relative flex h-12 items-center whitespace-nowrap px-1.5 disabled:cursor-wait disabled:opacity-50" disabled={disabled} onClick={onClick} aria-label={title}>
                <span className="flex h-9 items-center gap-2 rounded-lg px-2.5 transition group-hover:bg-[#f0f0f1]">
                    {icon}
                    <span>{title}</span>
                </span>
            </button>
        </Tooltip>
    );
}
