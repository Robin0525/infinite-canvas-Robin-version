import type { AiTextMessage } from "@/services/api/image";
import i18n from "@/i18n";
import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import { seedanceReferenceLabel } from "@/lib/seedance-video";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";
import { getGenerationResourceNodes } from "@/lib/canvas/canvas-resource-references";
import { cartesianGroupMembers, getBatchElementGroups, getConnectedElementGroups, getElementGroupMembers } from "@/lib/canvas/canvas-element-groups";

export type NodeGenerationContext = {
    prompt: string;
    referenceImages: ReferenceImage[];
    referenceVideos: ReferenceVideo[];
    referenceAudios: ReferenceAudio[];
    textCount: number;
    imageCount: number;
    videoCount: number;
    audioCount: number;
};

export type NodeGenerationInput = {
    nodeId: string;
    originalNodeId?: string;
    groupId?: string;
    groupTitle?: string;
    type: "text" | "image" | "video" | "audio" | "group";
    title: string;
    text?: string;
    image?: ReferenceImage;
    video?: ReferenceVideo;
    audio?: ReferenceAudio;
};

export type NodeGenerationGroup = {
    id: string;
    title: string;
    inputs: NodeGenerationInput[];
};

export function buildElementGroupMentionInputs(groups: NodeGenerationGroup[]): NodeGenerationInput[] {
    return groups.map((group) => ({ nodeId: `group:${group.id}`, originalNodeId: group.id, groupId: group.id, type: "group", title: group.title }));
}

export function buildNodeGenerationContext(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[], prompt: string): NodeGenerationContext {
    const inputs = buildNodeGenerationInputs(nodeId, nodes, connections);
    const sourceNode = nodes.find((node) => node.id === nodeId);
    if (sourceNode?.type === CanvasNodeType.Config && Boolean(sourceNode.metadata?.composerContent?.trim())) {
        return buildComposerGenerationContext(inputs, prompt);
    }

    const upstreamText = inputs
        .map((input) => input.text)
        .filter(Boolean)
        .join("\n\n");
    const referenceImages = inputs.map((input) => input.image).filter((image): image is ReferenceImage => Boolean(image));
    const referenceVideos = inputs.map((input) => input.video).filter((video): video is ReferenceVideo => Boolean(video));
    const referenceAudios = inputs.map((input) => input.audio).filter((audio): audio is ReferenceAudio => Boolean(audio));

    return {
        prompt: upstreamText ? `${prompt}\n\n${upstreamText}` : prompt,
        referenceImages,
        referenceVideos,
        referenceAudios,
        textCount: inputs.filter((input) => input.type === "text").length,
        imageCount: referenceImages.length,
        videoCount: referenceVideos.length,
        audioCount: referenceAudios.length,
    };
}

function buildComposerGenerationContext(inputs: NodeGenerationInput[], prompt: string): NodeGenerationContext {
    const inputByNodeId = new Map(inputs.map((input) => [input.nodeId, input]));
    const selectedInputs: NodeGenerationInput[] = [];
    const labelByNodeId = new Map<string, string>();
    const textBlocks: string[] = [];
    const counts = { image: 0, video: 0, audio: 0, text: 0, group: 0 };
    let hasToken = false;
    let lastIndex = 0;
    let nextPrompt = "";

    for (const match of prompt.matchAll(/@\[node:([^\]]+)\]/g)) {
        if (match.index === undefined) continue;
        hasToken = true;
        nextPrompt += prompt.slice(lastIndex, match.index);
        const input = inputByNodeId.get(match[1]);
        if (input) {
            let label = labelByNodeId.get(input.nodeId);
            if (!label) {
                label = generationLabel(input.type, counts[input.type]++);
                labelByNodeId.set(input.nodeId, label);
                if (input.type === "text") textBlocks.push(`【${label}】\n${input.text || ""}`);
                else if (input.type !== "group") selectedInputs.push(input);
            }
            nextPrompt += input.type === "text" ? `【${label}】` : label;
        }
        lastIndex = match.index + match[0].length;
    }

    nextPrompt += prompt.slice(lastIndex);
    if (textBlocks.length) nextPrompt = `${nextPrompt.trim()}\n\n${textBlocks.join("\n\n")}`;
    const referenceImages = selectedInputs.map((input) => input.image).filter((image): image is ReferenceImage => Boolean(image));
    const referenceVideos = selectedInputs.map((input) => input.video).filter((video): video is ReferenceVideo => Boolean(video));
    const referenceAudios = selectedInputs.map((input) => input.audio).filter((audio): audio is ReferenceAudio => Boolean(audio));

    if (!hasToken) {
        return {
            prompt,
            referenceImages: [],
            referenceVideos: [],
            referenceAudios: [],
            textCount: 0,
            imageCount: 0,
            videoCount: 0,
            audioCount: 0,
        };
    }

    return {
        prompt: nextPrompt,
        referenceImages,
        referenceVideos,
        referenceAudios,
        textCount: counts.text,
        imageCount: referenceImages.length,
        videoCount: referenceVideos.length,
        audioCount: referenceAudios.length,
    };
}

export function buildNodeGenerationInputs(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]): NodeGenerationInput[] {
    const source = nodes.find((node) => node.id === nodeId);
    if (source?.type === CanvasNodeType.Group) return getElementGroupMembers(source.id, nodes).flatMap((node) => generationInputFromNode(node, source));
    return getGenerationResourceNodes(nodeId, nodes, connections).flatMap((node): NodeGenerationInput[] =>
        node.type === CanvasNodeType.Group ? getElementGroupMembers(node.id, nodes).flatMap((member) => generationInputFromNode(member, node)) : generationInputFromNode(node),
    );
}

export function buildNodeGenerationGroups(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]): NodeGenerationGroup[] {
    const source = nodes.find((node) => node.id === nodeId);
    const groups = source?.type === CanvasNodeType.Group ? [{ group: source, members: getElementGroupMembers(source.id, nodes) }] : getConnectedElementGroups(nodeId, nodes, connections);
    return groups.map(({ group, members }) => ({ id: group.id, title: group.title, inputs: members.flatMap((member) => generationInputFromNode(member, group)) }));
}

export function buildBatchGenerationContexts(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[], prompt: string) {
    const connectedGroups = getConnectedElementGroups(nodeId, nodes, connections);
    if (!connectedGroups.length) return [buildNodeGenerationContext(nodeId, nodes, connections, prompt)];
    const groups = getBatchElementGroups(nodeId, nodes, connections, prompt);
    const connectedIds = new Set(connectedGroups.map(({ group }) => group.id));
    const batchMemberIds = new Set(groups.flatMap(({ members }) => members.map((member) => member.id)));
    const groupLabelById = new Map(connectedGroups.map(({ group }, index) => [group.id, i18n.t("canvas.elementGroup.groupLabel", { index: index + 1 })]));
    const constantNodes = getGenerationResourceNodes(nodeId, nodes, connections).filter((node) => !connectedIds.has(node.id) && !batchMemberIds.has(node.id) && node.type !== CanvasNodeType.Group);
    const constants = constantNodes.flatMap((node) => generationInputFromNode(node));
    const batchTokenLabels = new Map(constants.map((input) => [input.nodeId, input.title]));
    connectedGroups.forEach(({ group, members }) => {
        const label = groupLabelById.get(group.id) || group.title;
        batchTokenLabels.set(`group:${group.id}`, label);
        members.flatMap((member) => generationInputFromNode(member, group)).forEach((input) => batchTokenLabels.set(input.nodeId, label));
    });
    const resolvedPrompt = prompt.replace(/@\[node:([^\]]+)\]/g, (_, inputId: string) => batchTokenLabels.get(inputId) || "");
    const combinations = cartesianGroupMembers(groups);
    return combinations.map((members) => {
        const selected = members.flatMap((member, index) => generationInputFromNode(member, groups[index].group));
        const groupDescription = selected.map((input) => `${groupLabelById.get(input.groupId || "") || input.groupTitle}: ${input.title}`).join("\n");
        return buildGenerationContextFromInputs([...constants, ...selected], groupDescription ? `${resolvedPrompt}\n\n${groupDescription}` : resolvedPrompt, false);
    });
}

export function buildNodeResponseMessages(context: NodeGenerationContext): AiTextMessage[] {
    if (!context.referenceImages.length) {
        return [{ role: "user", content: context.prompt }];
    }

    return [
        {
            role: "user",
            content: [{ type: "text" as const, text: context.prompt }, ...context.referenceImages.map((image) => ({ type: "image_url" as const, image_url: { url: image.dataUrl } }))],
        },
    ];
}

export async function hydrateNodeGenerationContext(context: NodeGenerationContext) {
    const { imageToDataUrl } = await import("@/services/image-storage");
    return { ...context, referenceImages: await Promise.all(context.referenceImages.map(async (image) => ({ ...image, dataUrl: await imageToDataUrl(image) }))) };
}

function readNodeTextInput(node: CanvasNodeData) {
    if (node.type === CanvasNodeType.Text) return node.metadata?.content || node.metadata?.prompt || "";
    return node.metadata?.prompt || "";
}

function generationInputFromNode(node: CanvasNodeData, group?: CanvasNodeData): NodeGenerationInput[] {
    const common = { nodeId: group ? `${group.id}::${node.id}` : node.id, originalNodeId: node.id, groupId: group?.id, groupTitle: group?.title, title: node.title };
    const image = readReferenceImage(node);
    if (image) return [{ ...common, type: "image", image }];
    const video = readReferenceVideo(node);
    if (video) return [{ ...common, type: "video", video }];
    const audio = readReferenceAudio(node);
    if (audio) return [{ ...common, type: "audio", audio }];
    const text = readNodeTextInput(node);
    if (text) return [{ ...common, type: "text", text }];
    return [];
}

function buildGenerationContextFromInputs(inputs: NodeGenerationInput[], prompt: string, composer: boolean): NodeGenerationContext {
    if (composer) return buildComposerGenerationContext(inputs, prompt);
    const upstreamText = inputs
        .map((input) => input.text)
        .filter(Boolean)
        .join("\n\n");
    const referenceImages = inputs.map((input) => input.image).filter((image): image is ReferenceImage => Boolean(image));
    const referenceVideos = inputs.map((input) => input.video).filter((video): video is ReferenceVideo => Boolean(video));
    const referenceAudios = inputs.map((input) => input.audio).filter((audio): audio is ReferenceAudio => Boolean(audio));
    return {
        prompt: upstreamText ? `${prompt}\n\n${upstreamText}` : prompt,
        referenceImages,
        referenceVideos,
        referenceAudios,
        textCount: inputs.filter((input) => input.type === "text").length,
        imageCount: referenceImages.length,
        videoCount: referenceVideos.length,
        audioCount: referenceAudios.length,
    };
}

function generationLabel(type: NodeGenerationInput["type"], index: number) {
    if (type === "image") return imageReferenceLabel(index);
    if (type === "video") return seedanceReferenceLabel("video", index);
    if (type === "audio") return seedanceReferenceLabel("audio", index);
    if (type === "group") return i18n.t("canvas.elementGroup.groupLabel", { index: index + 1 });
    return i18n.t("canvas.composer.resources.text", { index: index + 1 });
}

function readReferenceImage(node: CanvasNodeData): ReferenceImage | null {
    if (node.type !== CanvasNodeType.Image || !node.metadata?.content) return null;
    return {
        id: node.id,
        name: `${node.title || node.id}.png`,
        type: node.metadata.mimeType || "image/png",
        dataUrl: node.metadata.content,
        storageKey: node.metadata.storageKey,
    };
}

function readReferenceVideo(node: CanvasNodeData): ReferenceVideo | null {
    if (node.type !== CanvasNodeType.Video || !node.metadata?.content) return null;
    return {
        id: node.id,
        name: `${node.title || node.id}.mp4`,
        type: node.metadata.mimeType || "video/mp4",
        url: node.metadata.content,
        storageKey: node.metadata.storageKey,
        bytes: node.metadata.bytes,
        width: node.metadata.naturalWidth,
        height: node.metadata.naturalHeight,
        durationMs: node.metadata.durationMs,
    };
}

function readReferenceAudio(node: CanvasNodeData): ReferenceAudio | null {
    if (node.type !== CanvasNodeType.Audio || !node.metadata?.content) return null;
    return {
        id: node.id,
        name: `${node.title || node.id}.mp3`,
        type: node.metadata.mimeType || "audio/mpeg",
        url: node.metadata.content,
        storageKey: node.metadata.storageKey,
        durationMs: node.metadata.durationMs,
    };
}
