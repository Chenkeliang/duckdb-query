import { useMutation } from "@tanstack/react-query";
import {
    VisualQueryConfig,
    PivotConfig,
    GeneratedVisualQuery,
} from "../types/visualQuery";
import { generatePivotVisualQuery } from "@/api";

interface GeneratePivotParams {
    config: VisualQueryConfig;
    pivotConfig: PivotConfig;
}

/**
 * Hook to generate Pivot Table SQL from the backend（/api/visual-query/generate）
 */
export const useGeneratePivotSQL = () => {
    return useMutation<GeneratedVisualQuery, Error, GeneratePivotParams>({
        mutationFn: ({ config, pivotConfig }) =>
            generatePivotVisualQuery(config, pivotConfig),
    });
};
