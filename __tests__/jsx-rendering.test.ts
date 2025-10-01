import { evaluateJSXRenderFunction } from '../src/lib/jsx-transpiler';

describe('JSX Rendering', () => {
    const mockContext = {
        time: 1.5,
        frame: 30,
        duration: 10,
        width: 1920,
        height: 1080
    };

    test('should render simple JSX', async () => {
        const renderCode = `
            return (
                <div className="container">
                    <h1>Hello World</h1>
                    <p>Frame: {frame}, Time: {time}s</p>
                </div>
            );
        `;

        const result = await evaluateJSXRenderFunction(renderCode, mockContext);
        
        expect(result.html).toContain('<div class="container">');
        expect(result.html).toContain('<h1>Hello World</h1>');
        expect(result.html).toContain('<p>Frame: 30, Time: 1.5s</p>');
        expect(result.html).toContain('</div>');
    });

    test('should render JSX with dynamic styles', async () => {
        const renderCode = `
            const backgroundColor = time > 5 ? 'red' : 'blue';
            const opacity = Math.sin(time * 2) * 0.5 + 0.5;
            
            return (
                <div 
                    style={{
                        backgroundColor,
                        opacity,
                        width: '100px',
                        height: '100px'
                    }}
                >
                    <span>Dynamic content</span>
                </div>
            );
        `;

        const result = await evaluateJSXRenderFunction(renderCode, mockContext);
        
        expect(result.html).toContain('background-color: blue');
        expect(result.html).toContain('opacity:');
        expect(result.html).toContain('<span>Dynamic content</span>');
    });

    test('should handle self-closing tags', async () => {
        const renderCode = `
            return (
                <div>
                    <img src="test.jpg" alt="Test" />
                    <br />
                    <input type="text" value="test" />
                </div>
            );
        `;

        const result = await evaluateJSXRenderFunction(renderCode, mockContext);
        
        expect(result.html).toContain('<img src="test.jpg" alt="Test" />');
        expect(result.html).toContain('<br />');
        expect(result.html).toContain('<input type="text" value="test" />');
    });

    test('should handle conditional rendering', async () => {
        const renderCode = `
            return (
                <div>
                    {time > 5 && <p>Time is greater than 5</p>}
                    {frame % 2 === 0 ? <span>Even frame</span> : <span>Odd frame</span>}
                </div>
            );
        `;

        const result = await evaluateJSXRenderFunction(renderCode, mockContext);
        
        expect(result.html).toContain('<span>Even frame</span>');
    });

    test('should work with nested components', async () => {
        const renderCode = `
            return (
                <div className="card">
                    <h2>Video Frame</h2>
                    <div className="card-content">
                        <p>Current time: {time}</p>
                        <p>Frame number: {frame}</p>
                    </div>
                </div>
            );
        `;

        const result = await evaluateJSXRenderFunction(renderCode, mockContext);
        
        expect(result.html).toContain('<div class="card">');
        expect(result.html).toContain('<h2>Video Frame</h2>');
        expect(result.html).toContain('<div class="card-content">');
        expect(result.html).toContain('<p>Current time: 1.5</p>');
        expect(result.html).toContain('<p>Frame number: 30</p>');
    });

    test('should handle arrays and mapping', async () => {
        const renderCode = `
            const items = ['apple', 'banana', 'cherry'];
            
            return (
                <ul>
                    {items.map((item, index) => (
                        <li key={index}>{item}</li>
                    ))}
                </ul>
            );
        `;

        const result = await evaluateJSXRenderFunction(renderCode, mockContext);
        
        expect(result.html).toContain('<ul>');
        expect(result.html).toContain('<li>apple</li>');
        expect(result.html).toContain('<li>banana</li>');
        expect(result.html).toContain('<li>cherry</li>');
        expect(result.html).toContain('</ul>');
    });

    test('should fall back to string rendering for non-JSX code', async () => {
        const renderCode = `
            return '<div><h1>Hello from string</h1></div>';
        `;

        const result = await evaluateJSXRenderFunction(renderCode, mockContext);
        
        expect(result.html).toBe('<div><h1>Hello from string</h1></div>');
    });

    test('should support waitUntil function', async () => {
        const renderCode = `
            return {
                html: <div><p>Loading...</p></div>,
                waitUntil: () => document.body.getAttribute('data-ready') === 'true'
            };
        `;

        const result = await evaluateJSXRenderFunction(renderCode, mockContext);
        
        expect(result.html).toContain('<div><p>Loading...</p></div>');
        expect(result.waitUntil).toBeDefined();
        expect(typeof result.waitUntil).toBe('function');
    });
});