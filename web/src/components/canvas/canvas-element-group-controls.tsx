import { Button, Segmented } from "antd";
import { Image as ImageIcon, LoaderCircle, Play, Square, Video } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ModelPicker } from "@/components/model-picker";
import { defaultConfig, resolveModelForCapability, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import type { CanvasGenerationMode, CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";

export function CanvasElementGroupControls({
    node,
    isRunning,
    canGenerate,
    onConfigChange,
    onGenerate,
    onStop,
}: {
    node: CanvasNodeData;
    isRunning: boolean;
    canGenerate: boolean;
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onGenerate: (nodeId: string, mode: CanvasGenerationMode, prompt: string) => void;
    onStop: (nodeId: string) => void;
}) {
    const { t } = useTranslation();
    const globalConfig = useEffectiveConfig();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const mode = node.metadata?.generationMode === "video" ? "video" : "image";
    const config = buildConfig(globalConfig, node, mode);
    const prompt = node.metadata?.composerContent ?? node.metadata?.prompt ?? "";
    return (
        <div className="mt-3 flex min-w-0 items-center gap-2">
            <Segmented
                size="small"
                value={mode}
                onChange={(value) => onConfigChange(node.id, { generationMode: value as CanvasGenerationMode })}
                options={[
                    {
                        value: "image",
                        label: (
                            <span className="inline-flex items-center gap-1">
                                <ImageIcon className="size-3.5" />
                                {t("canvas.configNode.image")}
                            </span>
                        ),
                    },
                    {
                        value: "video",
                        label: (
                            <span className="inline-flex items-center gap-1">
                                <Video className="size-3.5" />
                                {t("canvas.configNode.video")}
                            </span>
                        ),
                    },
                ]}
            />
            <ModelPicker config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability={mode} onMissingConfig={() => openConfigDialog(true)} className="max-w-[180px]" />
            {mode === "image" ? (
                <CanvasImageSettingsPopover
                    config={config}
                    placement="topLeft"
                    buttonClassName="!h-9 !max-w-[155px] !rounded-full !px-3"
                    onConfigChange={(key, value) => onConfigChange(node.id, key === "count" ? { count: Number(value) || 1 } : { [key]: value })}
                />
            ) : (
                <CanvasVideoSettingsPopover
                    config={config}
                    buttonClassName="!h-9 !max-w-[155px] !rounded-full !px-3"
                    onConfigChange={(key, value) => onConfigChange(node.id, key === "videoSeconds" ? { seconds: value } : key === "videoGenerateAudio" ? { generateAudio: value } : key === "videoWatermark" ? { watermark: value } : { [key]: value })}
                />
            )}
            <Button type="primary" className="ml-auto !h-9 !rounded-full" danger={isRunning} disabled={!isRunning && !canGenerate} onClick={() => (isRunning ? onStop(node.id) : onGenerate(node.id, mode, prompt))}>
                {isRunning ? (
                    <span className="inline-flex items-center gap-1">
                        <LoaderCircle className="size-4 animate-spin" />
                        <Square className="size-3.5 fill-current" />
                        {t("canvas.configNode.stop")}
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1">
                        <Play className="size-4" />
                        {t("canvas.configNode.generate")}
                    </span>
                )}
            </Button>
        </div>
    );
}

function buildConfig(globalConfig: AiConfig, node: CanvasNodeData, mode: "image" | "video"): AiConfig {
    return {
        ...globalConfig,
        model: resolveModelForCapability(globalConfig, node.metadata?.model, mode),
        quality: node.metadata?.quality || globalConfig.quality || defaultConfig.quality,
        imageResolution: node.metadata?.imageResolution || globalConfig.imageResolution || defaultConfig.imageResolution,
        size: node.metadata?.size || globalConfig.size || defaultConfig.size,
        background: node.metadata?.background ?? globalConfig.background ?? defaultConfig.background,
        videoSeconds: node.metadata?.seconds || globalConfig.videoSeconds || defaultConfig.videoSeconds,
        vquality: node.metadata?.vquality || globalConfig.vquality || defaultConfig.vquality,
        videoGenerateAudio: node.metadata?.generateAudio || globalConfig.videoGenerateAudio || defaultConfig.videoGenerateAudio,
        videoWatermark: node.metadata?.watermark || globalConfig.videoWatermark || defaultConfig.videoWatermark,
        count: String(node.metadata?.count || globalConfig.canvasImageCount || globalConfig.count || defaultConfig.count),
    };
}
