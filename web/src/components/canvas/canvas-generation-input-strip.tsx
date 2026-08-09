import { useState } from "react";
import { FileText, GripVertical, Image as ImageIcon, Music2, Video } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { NodeGenerationGroup, NodeGenerationInput } from "./canvas-node-generation";
import { ELEMENT_GROUP_REORDER_MIME } from "@/lib/canvas/canvas-element-groups";

export function CanvasGenerationInputStrip({ inputs, groups = [], reorderable = false, onReorder }: { inputs: NodeGenerationInput[]; groups?: NodeGenerationGroup[]; reorderable?: boolean; onReorder?: (ids: string[]) => void }) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const visibleInputs = inputs.filter((input) => input.type !== "group");
    if (!inputs.length && !groups.length) return null;

    const reorder = (targetId: string) => {
        if (!draggedId || draggedId === targetId || !onReorder) return;
        const ids = visibleInputs.map((input) => input.originalNodeId || input.nodeId);
        const from = ids.indexOf(draggedId);
        const to = ids.indexOf(targetId);
        if (from < 0 || to < 0) return;
        const next = [...ids];
        next.splice(to, 0, next.splice(from, 1)[0]);
        onReorder(next);
    };

    return (
        <div className="mb-2 rounded-xl border p-2" style={{ borderColor: theme.node.stroke, background: `${theme.node.fill}88` }}>
            {groups.length ? (
                <div className="mb-2 flex flex-wrap gap-1.5">
                    {groups.map((group, index) => (
                        <span key={group.id} className="rounded-full border px-2 py-1 text-[11px] font-medium" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
                            {t("canvas.elementGroup.groupLabel", { index: index + 1 })} · {t("canvas.node.nodeCount", { count: group.inputs.length })}
                        </span>
                    ))}
                </div>
            ) : null}
            <div className="thin-scrollbar flex gap-2 overflow-x-auto pb-1">
                {visibleInputs.map((input) => {
                    const id = input.originalNodeId || input.nodeId;
                    return (
                        <div
                            key={input.nodeId}
                            draggable={reorderable}
                            className="relative w-20 shrink-0 overflow-hidden rounded-lg border"
                            style={{ borderColor: draggedId === id ? theme.node.activeStroke : theme.node.stroke, background: theme.toolbar.panel }}
                            onDragStart={(event) => {
                                event.stopPropagation();
                                setDraggedId(id);
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData(ELEMENT_GROUP_REORDER_MIME, id);
                            }}
                            onDragOver={(event) => {
                                if (reorderable) event.preventDefault();
                            }}
                            onDrop={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                reorder(id);
                                setDraggedId(null);
                            }}
                            onDragEnd={() => setDraggedId(null)}
                        >
                            <ResourcePreview input={input} />
                            <div className="flex items-center gap-1 px-1.5 py-1 text-[11px] font-medium" style={{ color: theme.node.text }}>
                                {reorderable ? <GripVertical className="size-3 shrink-0 opacity-45" /> : null}
                                <span className="truncate">{inputLabel(input, visibleInputs, t)}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function ResourcePreview({ input }: { input: NodeGenerationInput }) {
    if (input.type === "image" && input.image) return <img src={input.image.dataUrl} alt="" className="h-14 w-full object-cover" />;
    if (input.type === "video" && input.video) return <video src={input.video.url} className="h-14 w-full bg-black object-cover" muted preload="metadata" />;
    const Icon = input.type === "audio" ? Music2 : input.type === "video" ? Video : input.type === "image" ? ImageIcon : FileText;
    return (
        <span className="grid h-14 w-full place-items-center bg-black/10">
            <Icon className="size-5" />
        </span>
    );
}

function inputLabel(input: NodeGenerationInput, inputs: NodeGenerationInput[], t: (key: string, options?: Record<string, unknown>) => string) {
    const sameType = inputs.filter((item) => item.type === input.type);
    const index = Math.max(
        0,
        sameType.findIndex((item) => item.nodeId === input.nodeId),
    );
    return t(`canvas.composer.resources.${input.type}`, { index: index + 1 });
}
