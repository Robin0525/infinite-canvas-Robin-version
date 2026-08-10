---
name: canvas
description: 操作 Infinite Canvas 当前网页画布，读取节点和选区，创建节点、元素组与生成流程，配置批量生成、连接节点或触发生成。
---

# Infinite Canvas

你正在帮助用户操作 Infinite Canvas 网页画布。需要理解或改动画布时，优先使用已配置的 `infinite-canvas` MCP 工具；不要让用户手动复制 JSON、URL 或 token。

## 工作流

- 如果用户还没有打开或连接网页画布，使用 `open-canvas` 技能打开 Infinite Canvas。
- 操作前先用 `canvas_get_state` 读取当前画布；用户明确提到选中内容、当前节点或“这个”时，先用 `canvas_get_selection`。
- 单个文本内容优先用 `canvas_create_text_node`；生成内容优先用 `canvas_generate_text`、`canvas_generate_image`、`canvas_generate_video` 或 `canvas_generate_audio`。
- 需要把提示词、配置和参考节点串成流程时，使用 `canvas_create_generation_flow`。`referenceNodeIds` 可以包含元素组；需要批量处理时设置 `batchEnabled: true` 和 `batchExecutionMode: concurrent` 或 `sequential`。
- 创建元素组时使用 `canvas_create_element_group`，可通过 `memberNodeIds` 按顺序加入已有图片、视频、音频或文本节点。
- 加入、移出或重排组成员时，先读取当前组成员，再用 `canvas_set_element_group_members` 传入完整的有序成员 ID 列表；传空数组会清空组。
- 已有生成配置需要批量使用元素组时，用 `canvas_configure_batch_generation` 连接组并设置并发或依次执行。
- 批量增删改、移动、连接节点或设置视口时，使用 `canvas_apply_ops`；元素组成员关系始终使用 `canvas_set_element_group_members`，不要直接改 `groupId` 元数据。
- 不要模拟鼠标点击，也不要要求用户手动复制 JSON。写入操作会由网页侧边栏按当前确认设置执行。

## 元素组与批量生成

- 元素组只能包含图片、视频、音频和文本节点，不能包含配置节点、另一个元素组或自身。
- `canvas_set_element_group_members` 是精确设置：传入列表同时代表最终成员集合和显示顺序。
- 单个元素组连接到开启批量处理的配置节点时，每个成员形成一个任务；多个元素组按成员笛卡尔积形成任务组合。
- 普通参考节点可作为所有任务的固定输入；元素组作为可变输入。只需要部分已连接元素组时，在提示词中引用相应组。
- `concurrent` 最多并发执行画布允许的任务数；`sequential` 严格逐项执行。用户没有指定时默认使用 `concurrent`。

## 风格

- 页面文案和画布节点内容默认使用中文。
- 生成节点、配置节点、元素组和提示词节点保持结构清晰，方便用户继续编辑。
- 批量创建节点时留出间距；元素组成员由画布自动按组尺寸进行网格布局。
- 图片、视频、音频等媒体节点默认保留原始比例；只有用户明确要求自由变形时才改变比例。
- 生成流程尽量少而清楚，让用户一眼看懂节点关系。
