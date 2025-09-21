import fetch from 'node-fetch';

console.log('🔥 Testing real render endpoint...');
console.log('Make sure server is running: npm run dev');

const testData = {
  width: 1080,
  height: 1920,
  duration: 1,
  render: "({time}) => { document.body.innerHTML = `<h1 style='color: white; text-align: center; font-family: Arial; font-size: 48px; margin-top: 200px;'>ahojda ${time.toFixed(2)}</h1>`; document.body.style.backgroundColor = `hsl(${time * 360}, 70%, 50%)`; }"
};

try {
  console.log('📤 Sending request...');
  
  const response = await fetch('http://localhost:3000/api/render', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(testData)
  });

  const result = await response.json();
  
  console.log('📊 Response status:', response.status);
  console.log('📄 Response body:', JSON.stringify(result, null, 2));

  if (response.ok && result.success) {
    console.log('✅ Test PASSED!');
    console.log(`🎬 Video created: ${result.video.path}`);
    console.log(`📐 Dimensions: ${result.video.width}x${result.video.height}`);
    console.log(`⏱️  Duration: ${result.video.duration}s`);
    console.log(`🖼️  Frames: ${result.video.frames}`);
    console.log(`💾 Size: ${(result.video.size / 1024).toFixed(2)} KB`);
  } else {
    console.log('❌ Test FAILED!');
    console.log('Error:', result.error || 'Unknown error');
  }
  
} catch (error) {
  console.log('❌ Test FAILED with exception!');
  console.log('Error:', error.message);
  console.log('');
  console.log('💡 Make sure to:');
  console.log('1. Run "npm run dev" in another terminal');
  console.log('2. Install ffmpeg: "brew install ffmpeg"');
}