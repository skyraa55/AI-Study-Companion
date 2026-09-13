const AnthropicProvider = require('./providers/anthropicProvider');
const UnavailableProvider = require('./providers/unavailableProvider');

const providerFactories = {
  anthropic: () => new AnthropicProvider(),
  unavailable: () => new UnavailableProvider(),
};

const cache = {};

function getProvider(name) {
  const providerName = name || process.env.AI_PROVIDER || 'anthropic';

  if (!cache[providerName]) {
    const factory = providerFactories[providerName];
    if (!factory) {
      console.warn(`[providerRegistry] Unknown provider "${providerName}" - falling back to "unavailable"`);
      cache[providerName] = new UnavailableProvider();
    } else {
      try {
        cache[providerName] = factory();
      } catch (err) {
        console.error(`[providerRegistry] Failed to construct provider "${providerName}":`, err.message);
        cache[providerName] = new UnavailableProvider();
      }
    }
  }

  return cache[providerName];
}

function getFallbackProvider() {
  const fallbackName = process.env.AI_FALLBACK_PROVIDER;
  return fallbackName ? getProvider(fallbackName) : getProvider('unavailable');
}

module.exports = { getProvider, getFallbackProvider };