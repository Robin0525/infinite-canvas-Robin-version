import { Select } from "antd";
import { useTranslation } from "react-i18next";

import { folderOptions } from "@/lib/canvas/canvas-folders";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";

export function CanvasFolderSelect({ value, onChange, excludedIds, className }: { value?: string; onChange: (folderId?: string) => void; excludedIds?: Set<string>; className?: string }) {
    const { t } = useTranslation();
    const folders = useCanvasStore((state) => state.folders);
    return <Select className={className} value={value || ""} options={folderOptions(folders, t("canvas.folder.root"), excludedIds)} onChange={(folderId) => onChange(folderId || undefined)} showSearch optionFilterProp="label" />;
}
