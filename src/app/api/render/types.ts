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


export const checkRenderParamsValidity = (params: unknown): params is RenderParams => {
    if (!params || typeof params !== "object") {
        return false;
    }
    
    const p = params as Record<string, unknown>;
    
    return (
        typeof p.width === "number" &&
        p.width > 0 &&
        typeof p.height === "number" &&
        p.height > 0 &&
        typeof p.duration === "number" &&
        p.duration > 0 &&
        typeof p.render === "string" &&
        p.render.trim() !== ""
    );
};