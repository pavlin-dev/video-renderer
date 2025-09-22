describe('Render API - Async Test', () => {
  test('should successfully generate video with async red background', async () => {
    console.log('🧪 Testing render API with async operations...');
    
    const renderFunction = `({ time }) => {
      return {
        html: "<div id='box' style='width:1080px;height:1920px;background:#000'></div>" +
              "<script>" +
              "(async () => {" +
                "const box = document.getElementById('box');" +
                "await new Promise(res => setTimeout(res, 1000));" +
                "box.style.background = 'red';" +
                "document.body.setAttribute('data-ready','1');" +
              "})();" +
              "</script>",
        waitUntil: () => {
          return document.body.getAttribute("data-ready") === "1";
        }
      };
    }`;

    // Call the render API
    const response = await fetch('http://localhost:3000/api/render', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        width: 1080,
        height: 1920,
        duration: 0.1, // Very short video
        render: renderFunction
      })
    });

    const result = await response.json();
    
    // Basic assertions - just check that API worked
    expect(response.ok).toBe(true);
    expect(result.success).toBe(true);
    expect(result.video).toBeDefined();
    expect(result.video.url).toBeDefined();
    expect(result.video.frames).toBeGreaterThan(0);
    
    console.log('✅ API Success - Video generated:', result.video.url);
    console.log('Video info:', {
      frames: result.video.frames,
      duration: result.video.duration,
      size: result.video.size
    });
    
    console.log('🎉 SUCCESS: Async render API test passed!');
  }, 30000);
});