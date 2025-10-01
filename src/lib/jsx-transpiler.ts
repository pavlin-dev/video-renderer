import * as ts from "typescript";

/**
 * React-like JSX to HTML transpiler for server-side rendering
 */

interface JSXElement {
    type: string;
    props: Record<string, unknown>;
    children: (JSXElement | string)[];
}

/**
 * Custom React-like implementation for server-side rendering
 */
const React = {
    createElement: (
        type: string, 
        props: Record<string, unknown> | null, 
        ...children: (JSXElement | string | number | boolean | null | undefined)[]
    ): JSXElement => {
        const validChildren = children
            .filter((child): child is JSXElement | string | number => 
                child !== null && child !== undefined && child !== false && child !== true)
            .flat()
            .map(child => typeof child === 'number' ? String(child) : child);
            
        return {
            type,
            props: props || {},
            children: validChildren
        };
    }
};

/**
 * Render JSX element to HTML string
 */
function renderToHTML(element: JSXElement | string): string {
    if (typeof element === 'string') {
        return escapeHTML(element);
    }

    const { type, props, children } = element;
    
    // Handle self-closing tags
    const selfClosingTags = ['img', 'br', 'hr', 'input', 'area', 'base', 'col', 'embed', 'link', 'meta', 'param', 'source', 'track', 'wbr'];
    
    let html = `<${type}`;
    
    // Add attributes (check if props is not null/undefined)
    if (props) {
        for (const [key, value] of Object.entries(props)) {
            if (key === 'children') continue;
            
            // Handle special React props
            if (key === 'className') {
                html += ` class="${escapeHTML(String(value))}"`;
            } else if (key === 'htmlFor') {
                html += ` for="${escapeHTML(String(value))}"`;
            } else if (key === 'style' && typeof value === 'object' && value) {
                // Handle style objects
                const styleString = Object.entries(value)
                    .map(([styleProp, styleValue]) => `${camelToKebab(styleProp)}: ${styleValue}`)
                    .join('; ');
                html += ` style="${escapeHTML(styleString)}"`;
            } else if (key === 'key') {
                // Skip React key prop in HTML output
                continue;
            } else if (typeof value === 'boolean') {
                if (value) {
                    html += ` ${key}`;
                }
            } else if (value != null) {
                html += ` ${key}="${escapeHTML(String(value))}"`;
            }
        }
    }
    
    if (selfClosingTags.includes(type)) {
        html += ' />';
        return html;
    }
    
    html += '>';
    
    // Add children
    const childrenHTML = children.map(child => renderToHTML(child)).join('');
    html += childrenHTML;
    
    html += `</${type}>`;
    
    return html;
}

/**
 * Escape HTML special characters
 */
function escapeHTML(text: string): string {
    const escapeMap: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;'
    };
    
    return text.replace(/[&<>"']/g, (match) => escapeMap[match] || match);
}

/**
 * Convert camelCase to kebab-case for CSS properties
 */
function camelToKebab(str: string): string {
    return str.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Transpile JSX/TSX code to JavaScript
 */
export function transpileJSX(code: string): string {
    // Configure TypeScript compiler options for JSX
    const compilerOptions: ts.CompilerOptions = {
        target: ts.ScriptTarget.ES2018,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.React,
        jsxFactory: 'React.createElement',
        allowJs: true,
        esModuleInterop: true,
        skipLibCheck: true,
        strict: false
    };

    // Transpile the code
    const result = ts.transpile(code, compilerOptions);
    
    return result;
}

/**
 * Evaluate JSX render function and return HTML
 */
export async function evaluateJSXRenderFunction(
    renderCode: string, 
    context: Record<string, unknown>
): Promise<{ html: string; waitUntil?: () => boolean }> {
    
    // Check if code contains JSX syntax
    const hasJSX = renderCode.includes('<') && renderCode.includes('>') && 
                   (renderCode.includes('</') || renderCode.includes('/>'));
    
    let finalCode: string;
    
    if (hasJSX) {
        // For JSX, we need to extract the body and transpile it
        let codeBody = renderCode.trim();
        
        // If it's an arrow function, extract the body
        if (codeBody.includes('=>')) {
            const arrowIndex = codeBody.indexOf('=>');
            codeBody = codeBody.substring(arrowIndex + 2).trim();
            
            // Remove outer curly braces if present
            if (codeBody.startsWith('{') && codeBody.endsWith('}')) {
                codeBody = codeBody.slice(1, -1).trim();
            }
        }
        
        // Wrap in function and transpile
        const wrappedCode = `
            function renderFunction(ctx) {
                const { time, frame, duration, width, height, ...args } = ctx;
                ${codeBody}
            }
        `;
        finalCode = transpileJSX(wrappedCode);
    } else {
        // No JSX, use original code
        finalCode = `function renderFunction(ctx) {
            const { time, frame, duration, width, height, ...args } = ctx;
            ${renderCode}
        }`;
    }
    
    // Create execution context with React and rendering utilities
    const executionContext = {
        React,
        renderToHTML,
        console,
        Math,
        Date,
        JSON,
        fetch,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        ...context
    };
    
    // Execute the render function
    const vm = await import('vm');
    const script = new vm.Script(`
        ${finalCode}
        renderFunction
    `);
    
    const renderFunction = script.runInNewContext(executionContext);
    const result = await Promise.resolve(renderFunction(context));
    
    // Handle different return types
    if (typeof result === 'string') {
        return { html: result };
    } else if (result && typeof result === 'object') {
        if (result.type) {
            // JSX element
            return { 
                html: renderToHTML(result),
                waitUntil: result.waitUntil 
            };
        } else if (result.html) {
            // Object with html property
            return {
                html: typeof result.html === 'string' ? result.html : renderToHTML(result.html),
                waitUntil: result.waitUntil
            };
        }
    }
    
    throw new Error('Render function must return a string, JSX element, or object with html property');
}

export { React };