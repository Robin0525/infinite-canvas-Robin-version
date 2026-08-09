import { useEffect, useState } from "react";
import { Button, Modal, Tooltip } from "antd";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useImageEditorViewport } from "@/components/canvas/use-image-editor-viewport";
import { readImageMeta } from "@/lib/image-utils";

type Props = {
    dataUrl: string;
    title: string;
    open: boolean;
    onClose: () => void;
};

export function CanvasImagePreviewModal({ dataUrl, title, open, onClose }: Props) {
    const { t } = useTranslation();
    const [image, setImage] = useState<{ width: number; height: number } | null>(null);
    const viewport = useImageEditorViewport(image, open);

    useEffect(() => {
        if (!open || !dataUrl) return;
        let active = true;
        setImage(null);
        void readImageMeta(dataUrl).then((metadata) => {
            if (active) setImage(metadata);
        });
        return () => {
            active = false;
        };
    }, [dataUrl, open]);

    return (
        <Modal title={t("canvas.projectPage.imageDetails")} open={open && Boolean(dataUrl)} centered onCancel={onClose} footer={null} width="min(92vw, 1200px)" destroyOnHidden>
            <div className="space-y-3" data-canvas-no-zoom>
                <div
                    ref={viewport.viewportRef}
                    {...viewport.panHandlers}
                    className={`relative h-[min(78vh,820px)] min-h-[360px] rounded-xl bg-black/90 ${viewport.scrollClassName} ${viewport.isPanning ? "cursor-grabbing" : viewport.spacePressed ? "cursor-grab" : ""}`}
                >
                    <div className="relative" style={viewport.contentStyle}>
                        <div ref={viewport.stageRef} className="absolute select-none" style={viewport.stageStyle}>
                            <div className="absolute left-0 top-0" style={viewport.mediaStyle}>
                                <img src={dataUrl} alt={title} className="block h-full w-full object-contain" draggable={false} />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-center gap-1">
                    <Tooltip title={t("canvas.editors.zoomOut")}>
                        <Button type="text" icon={<ZoomOut className="size-4" />} disabled={!viewport.canZoomOut} aria-label={t("canvas.editors.zoomOut")} onClick={viewport.zoomOut} />
                    </Tooltip>
                    <button type="button" className="min-w-16 rounded-md px-2 py-1 text-center text-xs font-semibold tabular-nums opacity-75 hover:bg-black/5 dark:hover:bg-white/10" onClick={viewport.resetZoom}>
                        {Math.round(viewport.zoom * 100)}%
                    </button>
                    <Tooltip title={t("canvas.editors.zoomIn")}>
                        <Button type="text" icon={<ZoomIn className="size-4" />} disabled={!viewport.canZoomIn} aria-label={t("canvas.editors.zoomIn")} onClick={viewport.zoomIn} />
                    </Tooltip>
                    <Tooltip title={t("canvas.editors.reset")}>
                        <Button type="text" icon={<RotateCcw className="size-4" />} aria-label={t("canvas.editors.reset")} onClick={viewport.resetZoom} />
                    </Tooltip>
                    <span className="ml-2 text-xs opacity-55">{t("canvas.projectPage.previewZoomHint")}</span>
                </div>
            </div>
        </Modal>
    );
}
