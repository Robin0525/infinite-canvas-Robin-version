import crypto from "node:crypto";

import type { ToolName } from "./schemas.js";
import { nextCanvasX } from "./tools.js";
import type { CanvasNode, CanvasNodeType, CanvasSnapshot } from "./types.js";

export type CanvasToolRequest = { name: "canvas_apply_ops"; input: Record<string, unknown> };

/** 将上层画布工具调用转换为前端可执行的批量操作。 */
export function buildCanvasToolRequest(name: ToolName, input: Record<string, unknown>, state: CanvasSnapshot | null): CanvasToolRequest {
    if (name === "canvas_apply_ops") return { name, input };
    if (name === "canvas_create_node") {
        const data = input as { nodeType: CanvasNodeType; title?: string; x?: number; y?: number; width?: number; height?: number; metadata?: Record<string, unknown> };
        return applyOps([{ type: "add_node", nodeType: data.nodeType, title: data.title, position: { x: data.x ?? nextCanvasX(state), y: data.y ?? 0 }, width: data.width, height: data.height, metadata: data.metadata }]);
    }
    if (name === "canvas_create_text_node") {
        const data = input as { text?: string; x?: number; y?: number; title?: string; width?: number; height?: number };
        return applyOps([textNodeOp(data, data.x ?? nextCanvasX(state), data.y ?? 0)]);
    }
    if (name === "canvas_create_text_nodes") {
        const data = input as { items: Array<{ text: string; title?: string; x?: number; y?: number; width?: number; height?: number }>; x?: number; y?: number; gap?: number; direction?: "row" | "column" };
        const x = Number(data.x ?? nextCanvasX(state));
        const y = Number(data.y ?? 0);
        const gap = Number(data.gap ?? 40);
        return applyOps(data.items.map((item, index) => textNodeOp(item, item.x ?? (data.direction === "row" ? x + index * (340 + gap) : x), item.y ?? (data.direction === "row" ? y : y + index * (240 + gap)))));
    }
    if (name === "canvas_create_element_group") {
        const data = input as { title?: string; x?: number; y?: number; width?: number; height?: number; memberNodeIds?: string[] };
        const groupId = `group-${crypto.randomUUID()}`;
        const memberNodeIds = uniqueIds(data.memberNodeIds);
        validateGroupMembers(state, groupId, memberNodeIds);
        const group: CanvasNode = { id: groupId, type: "group", title: data.title || nextGroupTitle(state), position: { x: data.x ?? nextCanvasX(state), y: data.y ?? 0 }, width: data.width ?? 760, height: data.height ?? 480 };
        return applyOps([
            { type: "add_node", id: group.id, nodeType: "group", title: group.title, position: group.position, width: group.width, height: group.height },
            ...elementGroupMemberOps(state, group, memberNodeIds),
            { type: "select_nodes", ids: [groupId] },
        ]);
    }
    if (name === "canvas_set_element_group_members") {
        const data = input as { groupId: string; memberNodeIds: string[] };
        requireNodeType(state, data.groupId, "group");
        const memberNodeIds = uniqueIds(data.memberNodeIds);
        validateGroupMembers(state, data.groupId, memberNodeIds);
        return applyOps(elementGroupMemberOps(state, requireNodeType(state, data.groupId, "group"), memberNodeIds));
    }
    if (name === "canvas_configure_batch_generation") {
        const data = input as { configNodeId: string; groupIds: string[]; enabled?: boolean; executionMode?: "concurrent" | "sequential" };
        requireNodeType(state, data.configNodeId, "config");
        const groupIds = uniqueIds(data.groupIds);
        groupIds.forEach((id) => requireNodeType(state, id, "group"));
        const connected = new Set((state?.connections || []).filter((item) => item.toNodeId === data.configNodeId).map((item) => item.fromNodeId));
        return applyOps([
            { type: "update_node", id: data.configNodeId, metadata: { batchEnabled: data.enabled ?? true, batchExecutionMode: data.executionMode || "concurrent" } },
            ...groupIds.filter((id) => !connected.has(id)).map((fromNodeId) => ({ type: "connect_nodes", fromNodeId, toNodeId: data.configNodeId })),
            { type: "select_nodes", ids: [data.configNodeId] },
        ]);
    }
    if (name === "canvas_create_image_prompt_flow") return applyOps(generationFlowOps({ ...input, mode: "image" }, state));
    if (name === "canvas_create_config_node") {
        const x = Number(input.x ?? nextCanvasX(state));
        const y = Number(input.y ?? 0);
        const configId = `config-${crypto.randomUUID()}`;
        const mode = generationMode(input.mode);
        const prompt = String(input.prompt || "");
        return applyOps([configNodeOp(configId, input, x, y), ...(input.autoRun ? [runGenerationOp(configId, mode, prompt)] : [])]);
    }
    if (name === "canvas_create_generation_flow") return applyOps(generationFlowOps(input, state));
    if (name === "canvas_generate_text" || name === "canvas_generate_image" || name === "canvas_generate_video" || name === "canvas_generate_audio") {
        return applyOps(generationFlowOps({ ...input, mode: name.replace("canvas_generate_", ""), autoRun: true }, state));
    }
    if (name === "canvas_update_node") {
        const data = input as { id: string; patch?: Record<string, unknown>; metadata?: Record<string, unknown> };
        return applyOps([{ type: "update_node", id: data.id, patch: data.patch, metadata: data.metadata }]);
    }
    if (name === "canvas_update_node_text") {
        const data = input as { id: string; text: string; title?: string };
        return applyOps([{ type: "update_node", id: data.id, patch: { ...(data.title ? { title: data.title } : {}) }, metadata: { content: data.text, status: "success" } }]);
    }
    if (name === "canvas_move_nodes") {
        const data = input as { items: Array<{ id: string; x?: number; y?: number; dx?: number; dy?: number }> };
        return applyOps(data.items.flatMap((item) => {
            const current = findNode(state, item.id);
            const position = { x: item.x ?? ((current?.position.x || 0) + (item.dx || 0)), y: item.y ?? ((current?.position.y || 0) + (item.dy || 0)) };
            const move = { type: "update_node", id: item.id, patch: { position } };
            if (current?.type !== "group") return [move];
            const memberNodeIds = currentGroupMemberIds(state, current.id);
            return [move, ...layoutElementGroupMemberOps(state, { ...current, position }, memberNodeIds)];
        }));
    }
    if (name === "canvas_resize_node") {
        const data = input as { id: string; width: number; height: number; freeResize?: boolean };
        const current = findNode(state, data.id);
        const resize = { type: "update_node", id: data.id, patch: { width: data.width, height: data.height }, metadata: data.freeResize === undefined ? undefined : { freeResize: data.freeResize } };
        return applyOps(current?.type === "group" ? [resize, ...layoutElementGroupMemberOps(state, { ...current, width: data.width, height: data.height }, currentGroupMemberIds(state, current.id))] : [resize]);
    }
    if (name === "canvas_delete_nodes") {
        const ids = (input as { ids: string[] }).ids;
        const deletedGroups = new Set((state?.nodes || []).filter((node) => ids.includes(node.id) && node.type === "group").map((node) => node.id));
        const releaseMembers = (state?.nodes || []).filter((node) => node.metadata?.groupId && deletedGroups.has(String(node.metadata.groupId))).map((node) => ({ type: "update_node", id: node.id, metadata: { groupId: undefined } }));
        return applyOps([...releaseMembers, { type: "delete_node", ids }]);
    }
    if (name === "canvas_connect_nodes") {
        const data = input as { connections: Array<{ fromNodeId: string; toNodeId: string }> };
        return applyOps(data.connections.map((connection) => ({ type: "connect_nodes", ...connection })));
    }
    if (name === "canvas_select_nodes") return applyOps([{ type: "select_nodes", ids: (input as { ids: string[] }).ids }]);
    if (name === "canvas_set_viewport") return applyOps([{ type: "set_viewport", viewport: (input as { viewport: unknown }).viewport }]);
    if (name === "canvas_run_generation") {
        const data = input as { nodeId: string; mode?: string; prompt?: string };
        return applyOps([runGenerationOp(data.nodeId, generationMode(data.mode), data.prompt)]);
    }
    throw new Error(`未知工具：${name}`);
}

/** 按最大边限制计算附件图片节点尺寸，并保持原始比例。 */
export function fitAttachmentNodeSize(width: number, height: number) {
    const scale = Math.min(1, 640 / width, 640 / height);
    return { width: width * scale, height: height * scale };
}

/** 创建统一的批量画布操作请求。 */
function applyOps(ops: unknown[]): CanvasToolRequest {
    return { name: "canvas_apply_ops", input: { ops } };
}

/** 创建文本节点操作。 */
function textNodeOp(input: { id?: string; text?: string; title?: string; width?: number; height?: number }, x: number, y: number) {
    return { type: "add_node", id: input.id, nodeType: "text", title: input.title, position: { x, y }, width: input.width, height: input.height, metadata: { content: input.text || "", status: "success", fontSize: 14 } };
}

/** 创建生成配置节点操作。 */
function configNodeOp(id: string, input: Record<string, unknown>, x: number, y: number) {
    const mode = generationMode(input.mode);
    const prompt = String(input.prompt || "");
    return {
        type: "add_node",
        id,
        nodeType: "config",
        title: String(input.title || generationTitle(mode)),
        position: { x, y },
        width: typeof input.width === "number" ? input.width : undefined,
        height: typeof input.height === "number" ? input.height : undefined,
        metadata: cleanRecord({
            generationMode: mode,
            composerContent: prompt,
            prompt,
            status: "idle",
            model: input.model,
            size: input.size,
            quality: input.quality,
            count: input.count,
            seconds: input.seconds,
            vquality: input.vquality,
            generateAudio: input.generateAudio,
            watermark: input.watermark,
            audioVoice: input.audioVoice,
            audioFormat: input.audioFormat,
            audioSpeed: input.audioSpeed,
            audioInstructions: input.audioInstructions,
            batchEnabled: input.batchEnabled,
            batchExecutionMode: input.batchExecutionMode,
        }),
    };
}

/** 创建包含提示词、配置节点和引用连线的生成流程。 */
function generationFlowOps(input: Record<string, unknown>, state: CanvasSnapshot | null) {
    const mode = generationMode(input.mode);
    const prompt = String(input.prompt || "");
    const x = Number(input.x ?? nextCanvasX(state));
    const y = Number(input.y ?? 0);
    const textId = `text-${crypto.randomUUID()}`;
    const configId = `config-${crypto.randomUUID()}`;
    const referenceNodeIds = Array.isArray(input.referenceNodeIds) ? input.referenceNodeIds.filter((id): id is string => typeof id === "string") : [];
    const tokens = [`@[node:${textId}]`, ...referenceNodeIds.map((id) => `@[node:${findNode(state, id)?.type === "group" ? `group:${id}` : id}]`)];
    return [
        textNodeOp({ id: textId, text: prompt, title: String(input.title || "提示词") }, x, y),
        configNodeOp(configId, { ...input, prompt: tokens.join("\n") }, x + 420, y),
        { type: "connect_nodes", fromNodeId: textId, toNodeId: configId },
        ...referenceNodeIds.map((fromNodeId) => ({ type: "connect_nodes", fromNodeId, toNodeId: configId })),
        { type: "select_nodes", ids: [configId] },
        ...(input.autoRun ? [runGenerationOp(configId, mode, tokens.join("\n"))] : []),
    ];
}

/** 创建触发节点生成的画布操作。 */
function runGenerationOp(nodeId: string, mode: "text" | "image" | "video" | "audio", prompt?: string) {
    return { type: "run_generation", nodeId, mode, prompt };
}

/** 将未知生成模式归一为画布支持的模式。 */
function generationMode(value: unknown): "text" | "image" | "video" | "audio" {
    return value === "text" || value === "video" || value === "audio" ? value : "image";
}

/** 获取生成模式对应的默认节点标题。 */
function generationTitle(mode: "text" | "image" | "video" | "audio") {
    if (mode === "text") return "文本生成";
    if (mode === "video") return "视频生成";
    if (mode === "audio") return "音频生成";
    return "图片生成";
}

/** 按节点 ID 查找当前画布节点。 */
function findNode(state: CanvasSnapshot | null, id: string): CanvasNode | undefined {
    return (state?.nodes || []).find((node) => node.id === id);
}

/** 校验元素组与成员类型，避免把配置节点或另一个元素组放入组内。 */
function validateGroupMembers(state: CanvasSnapshot | null, groupId: string, memberNodeIds: string[]) {
    memberNodeIds.forEach((id) => {
        if (id === groupId) throw new Error("元素组不能包含自身");
        const node = findNode(state, id);
        if (!node) throw new Error(`找不到元素组成员节点：${id}`);
        if (!(["image", "text", "video", "audio"] as CanvasNodeType[]).includes(node.type)) throw new Error(`节点 ${id} 的类型不能加入元素组`);
    });
}

/** 要求节点存在且类型正确。 */
function requireNodeType(state: CanvasSnapshot | null, id: string, type: CanvasNodeType) {
    const node = findNode(state, id);
    if (!node) throw new Error(`找不到节点：${id}`);
    if (node.type !== type) throw new Error(`节点 ${id} 不是 ${type} 类型`);
    return node;
}

/** 去重并保留节点 ID 的传入顺序。 */
function uniqueIds(value: unknown) {
    return [...new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && Boolean(id)) : [])];
}

/** 按当前画布已有组名称生成易读的默认标题。 */
function nextGroupTitle(state: CanvasSnapshot | null) {
    const used = new Set((state?.nodes || []).filter((node) => node.type === "group").map((node) => Number(node.title?.match(/(\d+)\s*$/)?.[1])).filter((value) => Number.isInteger(value) && value > 0));
    let index = 1;
    while (used.has(index)) index += 1;
    return `元素组${index}`;
}

/** 生成兼容现有 0.15.2 网页协议的元素组成员更新与网格布局操作。 */
function elementGroupMemberOps(state: CanvasSnapshot | null, group: CanvasNode, memberNodeIds: string[]) {
    const members = new Set(memberNodeIds);
    const released = (state?.nodes || []).filter((node) => node.metadata?.groupId === group.id && !members.has(node.id));
    return [
        { type: "update_node", id: group.id, metadata: { elementOrderIds: memberNodeIds } },
        ...released.map((node) => ({ type: "update_node", id: node.id, metadata: { groupId: undefined } })),
        ...layoutElementGroupMemberOps(state, group, memberNodeIds),
    ];
}

/** 按网页端相同规则计算元素组成员的行列位置。 */
function layoutElementGroupMemberOps(state: CanvasSnapshot | null, group: CanvasNode, memberNodeIds: string[]) {
    if (!memberNodeIds.length) return [];
    const padding = 20;
    const headerHeight = 68;
    const gap = 12;
    const usableWidth = Math.max(120, group.width - padding * 2);
    const usableHeight = Math.max(100, group.height - headerHeight - padding);
    const columns = Math.max(1, Math.min(memberNodeIds.length, Math.ceil(Math.sqrt((memberNodeIds.length * usableWidth) / usableHeight))));
    const rows = Math.ceil(memberNodeIds.length / columns);
    const cellWidth = Math.max(1, (usableWidth - gap * (columns - 1)) / columns);
    const cellHeight = Math.max(1, (usableHeight - gap * (rows - 1)) / rows);
    return memberNodeIds.flatMap((id, index) => findNode(state, id) ? [{
        type: "update_node",
        id,
        patch: { position: { x: group.position.x + padding + (index % columns) * (cellWidth + gap), y: group.position.y + headerHeight + Math.floor(index / columns) * (cellHeight + gap) }, width: cellWidth, height: cellHeight },
        metadata: { groupId: group.id },
    }] : []);
}

/** 读取元素组当前显式顺序并补齐尚未写入顺序的成员。 */
function currentGroupMemberIds(state: CanvasSnapshot | null, groupId: string) {
    const members = (state?.nodes || []).filter((node) => node.metadata?.groupId === groupId);
    const byId = new Set(members.map((node) => node.id));
    const ordered = findNode(state, groupId)?.metadata?.elementOrderIds;
    const ids = Array.isArray(ordered) ? ordered.filter((id): id is string => typeof id === "string" && byId.has(id)) : [];
    return [...ids, ...members.map((node) => node.id).filter((id) => !ids.includes(id))];
}

/** 移除对象中未设置的生成参数。 */
function cleanRecord(value: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== ""));
}
