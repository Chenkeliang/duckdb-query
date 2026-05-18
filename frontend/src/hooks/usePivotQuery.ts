import { useQuery } from "@tanstack/react-query";
import {
    VisualQueryConfig,
    PivotConfig,
    VisualQueryMode,
    PreviewResponse
} from "../types/visualQuery";
import { DEFAULT_MAX_QUERY_ROWS } from "@/constants/queryLimits";

const API_BASE_URL = "/api/visual-query";

interface UsePivotQueryParams {
    config: VisualQueryConfig;
    pivotConfig: PivotConfig;
    enabled?: boolean;
    /** 与后端 max_query_rows 对齐；缺省为 DEFAULT_MAX_QUERY_ROWS */
    previewRowLimit?: number;
}

export const usePivotQuery = ({ config, pivotConfig, enabled = false, previewRowLimit }: UsePivotQueryParams) => {
    const limit = previewRowLimit ?? DEFAULT_MAX_QUERY_ROWS;

    return useQuery<PreviewResponse, Error>({
        queryKey: ["pivot-preview", config, pivotConfig, limit],
        queryFn: async () => {
            const response = await fetch(`${API_BASE_URL}/preview`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    config,
                    mode: VisualQueryMode.PIVOT,
                    pivot_config: pivotConfig,
                    limit,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Failed to fetch pivot data");
            }

            return response.json();
        },
        enabled: enabled,
        staleTime: 5 * 60 * 1000, // 5 minutes cache
        gcTime: 10 * 60 * 1000,   // 10 minutes garbage collection
    });
};
