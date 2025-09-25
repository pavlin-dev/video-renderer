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
        console.log(`✓ Task created: ${taskId}, total tasks in map: ${this.tasks.size}`);
        return taskId;
    }

    getTask(taskId: string): RenderTask | undefined {
        console.log(`Getting task: ${taskId}, total tasks in map: ${this.tasks.size}`);
        return this.tasks.get(taskId);
    }

    updateTaskStatus(taskId: string, status: RenderTask['status'], progress?: number): void {
        const task = this.tasks.get(taskId);
        if (task) {
            console.log(`Updating task ${taskId}: status=${status}, progress=${progress}`);
            task.status = status;
            task.updatedAt = new Date();
            if (progress !== undefined) {
                task.progress = progress;
            }
        } else {
            console.error(`Task ${taskId} not found when updating status`);
        }
    }

    updateTaskProgress(taskId: string, progress: number): void {
        const task = this.tasks.get(taskId);
        if (task) {
            const newProgress = Math.min(100, Math.max(0, progress));
            console.log(`Updating progress for task ${taskId}: ${task.progress}% -> ${newProgress}%`);
            task.progress = newProgress;
            task.updatedAt = new Date();
        } else {
            console.error(`Task ${taskId} not found when updating progress`);
        }
    }

    setTaskResult(taskId: string, result: RenderTask['result']): void {
        const task = this.tasks.get(taskId);
        if (task) {
            console.log(`Setting result for task ${taskId}, success: ${result?.success}`);
            task.result = result;
            task.status = result?.success ? 'completed' : 'failed';
            task.progress = 100;
            task.updatedAt = new Date();
            console.log(`Task ${taskId} updated: status=${task.status}, progress=${task.progress}`);
        } else {
            console.error(`Task ${taskId} not found when setting result`);
        }
    }

    getAllTasks(): RenderTask[] {
        console.log(`Getting all tasks, total tasks in map: ${this.tasks.size}`);
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

// Use globalThis to ensure singleton instance persists across Next.js module reloads
const globalForTaskManager = globalThis as unknown as {
    renderTaskManager: RenderTaskManager | undefined
}

export const renderTaskManager = globalForTaskManager.renderTaskManager ?? new RenderTaskManager()

if (process.env.NODE_ENV !== 'production') globalForTaskManager.renderTaskManager = renderTaskManager