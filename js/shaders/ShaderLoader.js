// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * ShaderLoader - Utility for loading and processing GLSL shader files
 */

// Cache for loaded shaders
const shaderCache = new Map();

/**
 * Load a shader file from the given path
 * @param {string} path - Path to the shader file
 * @returns {Promise<string>} - The shader source code
 */
export async function loadShader(path) {
    // Check cache first
    if (shaderCache.has(path)) {
        return shaderCache.get(path);
    }

    try {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`Failed to load shader: ${path} (${response.status})`);
        }
        const source = await response.text();
        shaderCache.set(path, source);
        return source;
    } catch (error) {
        console.error(`[SHADER] Error loading ${path}:`, error);
        throw error;
    }
}

/**
 * Load a shader and replace placeholders with config values
 * @param {string} path - Path to the shader file
 * @param {Object} replacements - Key-value pairs for placeholder replacement
 * @returns {Promise<string>} - The processed shader source code
 */
export async function loadShaderWithReplacements(path, replacements = {}) {
    let source = await loadShader(path);

    // Replace all placeholders
    for (const [key, value] of Object.entries(replacements)) {
        const placeholder = `%${key}%`;
        source = source.split(placeholder).join(String(value));
    }

    return source;
}

/**
 * Load multiple shaders in parallel
 * @param {Object} paths - Object with shader names as keys and paths as values
 * @returns {Promise<Object>} - Object with shader names as keys and source as values
 */
export async function loadShaders(paths) {
    const entries = Object.entries(paths);
    const results = await Promise.all(
        entries.map(async ([name, path]) => {
            const source = await loadShader(path);
            return [name, source];
        })
    );
    return Object.fromEntries(results);
}

/**
 * Preload shaders into cache for faster access later
 * @param {string[]} paths - Array of shader paths to preload
 */
export async function preloadShaders(paths) {
    await Promise.all(paths.map(path => loadShader(path)));
    console.log(`[SHADER] Preloaded ${paths.length} shaders`);
}

/**
 * Clear the shader cache
 */
export function clearShaderCache() {
    shaderCache.clear();
}

// Export default object for convenience
export default {
    loadShader,
    loadShaderWithReplacements,
    loadShaders,
    preloadShaders,
    clearShaderCache
};
