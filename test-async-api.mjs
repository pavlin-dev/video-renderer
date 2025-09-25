#!/usr/bin/env node

const baseUrl = 'http://localhost:3000';

async function testAsyncRenderAPI() {
    console.log('🧪 Testing async render API...');
    
    // Test data
    const renderData = {
        width: 1920,
        height: 1080,
        duration: 1,
        render: `
            (context) => {
                return \`<div style="width: 100%; height: 100%; background: linear-gradient(\${context.time * 360}deg, #ff6b6b, #4ecdc4); display: flex; align-items: center; justify-content: center; color: white; font-size: 48px; font-family: Arial;">
                    Frame \${context.frame} / Time \${context.time.toFixed(2)}s
                </div>\`;
            }
        `,
        fps: 12,
        quality: 'low'
    };

    try {
        console.log('1️⃣  Starting render job...');
        
        // Step 1: Start render job
        const startResponse = await fetch(`${baseUrl}/api/render`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(renderData)
        });

        if (!startResponse.ok) {
            throw new Error(`Start request failed: ${startResponse.status} ${startResponse.statusText}`);
        }

        const startResult = await startResponse.json();
        console.log('✅ Render started:', startResult);
        
        if (!startResult.success || !startResult.taskId) {
            throw new Error('Invalid start response');
        }

        const taskId = startResult.taskId;
        console.log(`📋 Task ID: ${taskId}`);

        // Step 2: Poll task status
        console.log('2️⃣  Polling task status...');
        
        let attempts = 0;
        const maxAttempts = 60; // 5 minutes max
        
        while (attempts < maxAttempts) {
            const statusResponse = await fetch(`${baseUrl}/api/render/${taskId}`);
            
            if (!statusResponse.ok) {
                throw new Error(`Status request failed: ${statusResponse.status} ${statusResponse.statusText}`);
            }
            
            const status = await statusResponse.json();
            console.log(`📊 Status: ${status.status} (${status.progress}%)`);
            
            if (status.status === 'completed') {
                console.log('🎉 Render completed!');
                console.log('📹 Result:', status.result);
                return;
            } else if (status.status === 'failed') {
                console.log('❌ Render failed!');
                console.log('💥 Error:', status.error);
                return;
            }
            
            // Wait 5 seconds before next poll
            await new Promise(resolve => setTimeout(resolve, 5000));
            attempts++;
        }
        
        console.log('⏰ Timeout waiting for render to complete');
        
    } catch (error) {
        console.error('💥 Test failed:', error.message);
    }
}

// Test that server is running
async function checkServerHealth() {
    try {
        const response = await fetch(`${baseUrl}/api/health`);
        if (response.ok) {
            console.log('✅ Server is running');
            return true;
        }
    } catch (error) {
        console.log('❌ Server is not running. Please start it with: npm run dev');
        return false;
    }
}

// Main execution
(async () => {
    if (await checkServerHealth()) {
        await testAsyncRenderAPI();
    }
})();