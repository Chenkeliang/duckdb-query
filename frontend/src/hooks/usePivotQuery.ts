import { useQuery } from "@tanstack/react-query";
import {
    PivotQueryConfig,
    PivotConfig,
    PivotQueryPreviewPayload,
} from "../types/pivotQuery";
import { DEFAULT_MAX_QUERY_ROWS } from "@/constants/queryLimits";
import { previewPivotQuery } from "@/api";

interface UsePivotQueryParams {
    config: PivotQueryConfig;
    pivotConfig: PivotConfig;
    enabled?: boolean;
    /** 与后端 max_query_rows 对齐；缺省为 DEFAULT_MAX_QUERY_ROWS */
    previewRowLimit?: number;
}

export const usePivotQuery = ({ config, pivotConfig, enabled = false, previewRowLimit }: UsePivotQueryParams) => {
    const limit = previewRowLimit ?? DEFAULT_MAX_QUERY_ROWS;

    return useQuery<PivotQueryPreviewPayload, Error>({
        queryKey: ["pivot-preview", config, pivotConfig, limit],
        queryFn: async () => {
            return previewPivotQuery(config, pivotConfig, limit);
        },
        enabled: enabled,
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
    });
};
