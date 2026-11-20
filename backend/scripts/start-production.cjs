'use strict';

/** Container entrypoint. Validate configuration before loading any app/provider modules. */
function validateProductionEnvironment(env) {
  if (env.NODE_ENV !== 'production') throw new Error('Production image requires NODE_ENV=production');
  const provider = (env.AI_PROVIDER || '').trim().toLowerCase();
  if (!['', 'ark', 'glm'].includes(provider)) throw new Error('Production image rejects mock or unknown AI_PROVIDER');
  if (Object.keys(env).some(key => key.startsWith('AI_MOCK_') && env[key])) throw new Error('Production image rejects AI_MOCK_ test injection flags');
  if (!provider && (env.ARK_API_KEY || env.GLM_API_KEY)) throw new Error('Configure AI_PROVIDER explicitly when model credentials are present');
  const enabled = value => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
  if (enabled(env.ENABLE_MCP) || enabled(env.ENABLE_SWAGGER)) throw new Error('Production image does not expose Swagger or MCP');
}

module.exports = { validateProductionEnvironment };
if (require.main === module) {
  try {
    validateProductionEnvironment(process.env);
    if (process.env.AI_PROVIDER) process.env.AI_PROVIDER = process.env.AI_PROVIDER.trim().toLowerCase();
    require('../dist/index.js');
  } catch (error) {
    console.error('[production-start]', error instanceof Error ? error.message : 'Invalid runtime configuration');
    process.exit(1);
  }
}
