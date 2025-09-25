export interface RenderTask {
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number; // 0-100
    createdAt: Date;
    updatedAt: Date;
    result?: {
        success: boolean;
        video?: {
            url: string;
            path: string;
            size: number;
            frames: number;
            duration: number;
            fps: number;
            width: number;
            height: number;
        };
        error?: string;
        details?: string;
    };
    parameters: {
        width: number;
        height: number;
        duration: number;
        render: string;
        fps?: number;
        quality?: 'low' | 'medium' | 'high';
        args?: Record<string, unknown>;
        audio?: Array<{
            url: string;
            start: number;
            end?: number;
            volume: number;
        }>;
    };
}

class RenderTaskManager {
    private tasks: Map<string, RenderTask> = new Map();

    createTask(parameters: RenderTask['parameters']): string {
        const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const task: RenderTask = {
            id: taskId,
            status: 'pending',
            progress: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            parameters
        };
        
        this.tasks.set(taskId, task);
        return taskId;
    }

    getTask(taskId: string): RenderTask | undefined {
        return this.tasks.get(taskId);
    }

    updateTaskStatus(taskId: string, status: RenderTask['status'], progress?: number): void {
        const task = this.tasks.get(taskId);
        if (task) {
            task.status = status;
            task.updatedAt = new Date();
            if (progress !== undefined) {
                task.progress = progress;
            }
        }
    }

    updateTaskProgress(taskId: string, progress: number): void {
        const task = this.tasks.get(taskId);
        if (task) {
            task.progress = Math.min(100, Math.max(0, progress));
            task.updatedAt = new Date();
        }
    }

    setTaskResult(taskId: string, result: RenderTask['result']): void {
        const task = this.tasks.get(taskId);
        if (task) {
            task.result = result;
            task.status = result?.success ? 'completed' : 'failed';
            task.progress = 100;
            task.updatedAt = new Date();
        }
    }

    getAllTasks(): RenderTask[] {
        return Array.from(this.tasks.values());
    }

    cleanupOldTasks(olderThanHours: number = 24): void {
        const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
        for (const [taskId, task] of this.tasks.entries()) {
            if (task.updatedAt < cutoffTime) {
                this.tasks.delete(taskId);
            }
        }
    }
}

export const renderTaskManager = new RenderTaskManager();