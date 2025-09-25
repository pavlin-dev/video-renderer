import { NextRequest, NextResponse } from "next/server";
import { renderTaskManager } from "../../../../lib/render-tasks";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ taskId: string }> }
) {
    try {
        const { taskId } = await params;

        if (!taskId || typeof taskId !== 'string') {
            return NextResponse.json(
                { error: "taskId is required" },
                { status: 400 }
            );
        }

        const task = renderTaskManager.getTask(taskId);
        console.log(`Task lookup result for ${taskId}:`, task ? 'found' : 'not found');

        if (!task) {
            return NextResponse.json(
                { error: "Task not found" },
                { status: 404 }
            );
        }

        // Return task status and progress
        const response = {
            taskId: task.id,
            status: task.status,
            progress: task.progress,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
            // Include result if task is completed or failed
            ...(task.status === 'completed' && task.result ? { result: task.result } : {}),
            ...(task.status === 'failed' && task.result ? { error: task.result } : {})
        };

        return NextResponse.json(response);

    } catch (error) {
        console.error("Task status API error:", error);
        return NextResponse.json(
            {
                error: "Internal server error",
                details: error instanceof Error ? error.message : "Unknown error"
            },
            { status: 500 }
        );
    }
}