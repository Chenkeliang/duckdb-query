import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
    VisualQueryConfig,
    PivotConfig,
    GeneratedVisualQuery,
    VisualQueryMode
} from "../types/visualQuery";

const API_BASE_URL = "/api/query";

interface GeneratePivotParams {
    config: VisualQueryConfig;
    pivotConfig: PivotConfig;
}

/**
 * Hook to generate Pivot Table SQL from the backend
 */
export const useGeneratePivotSQL = () => {
    return useMutation<GeneratedVisualQuery, Error, GeneratePivotParams>({
        mutationFn: async ({ config, pivotConfig }) => {
            const response = await fetch(`${API_BASE_URL}/visual-generation`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    config,
                    mode: VisualQueryMode.PIVOT,
                    pivot_config: pivotConfig,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Failed to generate pivot SQL");
            }

            return response.json();
        },
    });
};
