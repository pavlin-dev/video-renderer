import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoUrl, times } = body;

    if (!videoUrl || !Array.isArray(times)) {
      return NextResponse.json(
        { error: 'Missing videoUrl or times array' },
        { status: 400 }
      );
    }

    console.log(`Pre-loading ${times.length} frames for ${videoUrl}`);

    // Pre-load all frames concurrently
    const preloadPromises = times.map(async (time: number) => {
      try {
        const frameUrl = `http://localhost:3000/api/video-frame?url=${encodeURIComponent(videoUrl)}&time=${time}`;
        const response = await fetch(frameUrl);
        return {
          time,
          success: response.ok,
          cached: response.headers.get('x-cache-status') === 'hit'
        };
      } catch (error) {
        return {
          time,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    const results = await Promise.all(preloadPromises);
    const successCount = results.filter(r => r.success).length;

    console.log(`Pre-loaded ${successCount}/${times.length} frames`);

    return NextResponse.json({
      success: true,
      preloaded: successCount,
      total: times.length,
      results
    });

  } catch (error) {
    console.error('Pre-load error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to pre-load frames',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}