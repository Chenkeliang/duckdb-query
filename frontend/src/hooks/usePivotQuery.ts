import { useQuery } from "@tanstack/react-query";
import {
    VisualQueryConfig,
    PivotConfig,
    VisualQueryMode,
    PreviewResponse
} from "../types/visualQuery";

const API_BASE_URL = "/api/visual-query";

interface UsePivotQueryParams {
    config: VisualQueryConfig;
    pivotConfig: PivotConfig;
    enabled?: boolean;
}

export const usePivotQuery = ({ config, pivotConfig, enabled = false }: UsePivotQueryParams) => {
    return useQuery<PreviewResponse, Error>({
        queryKey: ["pivot-preview", config, pivotConfig],
        queryFn: async () => {
            const response = await fetch(`${API_BASE_URL}/preview`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    config,
                    mode: VisualQueryMode.PIVOT,
                    pivot_config: pivotConfig,
                    limit: 10000 // Hard limit for safety, backend also enforces
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
