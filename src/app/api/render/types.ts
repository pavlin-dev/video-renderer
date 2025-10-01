export type RenderParams = {
    width: number;
    height: number;
    duration: number;
    render: string;
    fps?: number;
    quality?: "low" | "medium" | "high";
    args?: Record<string, unknown>;
    audio?: Array<{
        url: string;
        start: number;
        end?: number;
        volume: number;
    }>;
};


export const checkRenderParamsValidity = 