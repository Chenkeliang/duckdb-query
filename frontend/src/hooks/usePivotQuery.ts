import { useQuery } from "@tanstack/react-query";
import {
    VisualQueryConfig,
    PivotConfig,
    VisualQueryPreviewPayload,
} from "../types/visualQuery";
import { DEFAULT_MAX_QUERY_ROWS } from "@/constants/queryLimits";
import { previewPivotVisualQuery } from "@/api/visualQueryApi";

interface UsePivotQueryParams {
    config: VisualQueryConfig;
    pivotConfig: PivotConfig;
    enabled?: boolean;
    /** 与后端 max_query_rows 对齐；缺省为 DEFAULT_MAX_QUERY_ROWS */
    previewRowLimit?: number;
}

export const usePivotQuery = ({ config, pivotConfig, enabled = false, previewRowLimit }: UsePivotQueryParams) => {
    const limit = previewRowLimit ?? DEFAULT_MAX_QUERY_ROWS;

    return useQuery<VisualQueryPreviewPayload, Error>({
        queryKey: ["pivot-preview", config, pivotConfig, limit],
        queryFn: async () => {
            return previewPivotVisualQuery(config, pivotConfig, limit);
        },
        enabled: enabled,
        staleTime: 5 * 60 * 1000, // 5 minutes cache
        gcTime: 10 * 60 * 1000,   // 10 minutes garbage collection
    });
};
