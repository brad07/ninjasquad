/**
 * Centralized API Key Management Service
 * Handles storage and retrieval of API keys for multiple AI providers
 */

export interface ApiKeyConfig {
  openai?: string;
  anthropic?: string;
  google?: string;
  [key: string]: string | undefined; // Allow for additional providers
}

export interface ProviderInfo {
  id: string;
  name: string;
  requiresKey: boolean;
  keyPlaceholder?: string;
  keyPrefix?: string; // e.g., "sk-" for OpenAI
  models?: string[];
}

// Define supported providers
export const AI_PROVIDERS: ProviderInfo[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    requiresKey: true,
    keyPlaceholder: 'sk-...',
    keyPrefix: 'sk-',
    models: ['gpt-5', 'gpt-4-turbo-preview', 'gpt-4', 'gpt-3.5-turbo']
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    requiresKey: true,
    keyPlaceholder: 'sk-ant-...',
    keyPrefix: 'sk-ant-',
    models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku', 'claude-2.1']
  },
  {
    id: 'google',
    name: 'Google AI',
    requiresKey: true,
    keyPlaceholder: 'AIza...',
    models: ['gemini-pro', 'gemini-pro-vision']
  }
];

class ApiKeyService {
  private static instance: ApiKeyService;
  private readonly STORAGE_KEY = 'ninja-squad-api-keys';
  private keys: ApiKeyConfig = {};

  private constructor() {
    this.loadKeys();
  }

  public static getInstance(): ApiKeyService {
    if (!ApiKeyService.instance) {
      ApiKeyService.instance = new ApiKeyService();
    }
    return ApiKeyService.instance;
  }

  /**
   * Load API keys from localStorage
   */
  private loadKeys(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        // Decrypt or decode if needed in production
        this.keys = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load API keys:', error);
      this.keys = {};
    }
  }

  /**
   * Save API keys to localStorage
   */
  private saveKeys(): void {
    try {
      // In production, encrypt before storing
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.keys));
    } catch (error) {
      console.error('Failed to save API keys:', error);
    }
  }

  /**
   * Get API key for a specific provider
   */
  public getKey(provider: string): string | undefined {
    return this.keys[provider];
  }

  /**
   * Set API key for a specific provider
   */
  public setKey(provider: string, key: string | undefined): void {
    if (key) {
      this.keys[provider] = key;
    } else {
      delete this.keys[provider];
    }
    this.saveKeys();
  }

  /**
   * Get all stored API keys
   */
  public getAllKeys(): ApiKeyConfig {
    return { ...this.keys };
  }

  /**
   * Set multiple API keys at once
   */
  public setKeys(keys: Partial<ApiKeyConfig>): void {
    this.keys = { ...this.keys, ...keys };
    // Remove undefined values
    Object.keys(this.keys).forEach(key => {
      if (this.keys[key] === undefined || this.keys[key] === '') {
        delete this.keys[key];
      }
    });
    this.saveKeys();
  }

  /**
   * Check if a provider has an API key configured
   */
  public hasKey(provider: string): boolean {
    return !!this.keys[provider];
  }

  /**
   * Validate API key format for a provider
   */
  public validateKeyFormat(provider: string, key: string): boolean {
    const providerInfo = AI_PROVIDERS.find(p => p.id === provider);
    if (!providerInfo) return false;
    if (!providerInfo.requiresKey) return true;

    // Basic validation - check if key is not empty
    if (!key || key.trim() === '') return false;

    // Check prefix if specified
    if (providerInfo.keyPrefix && !key.startsWith(providerInfo.keyPrefix)) {
      return false;
    }

    // Add more specific validation rules per provider
    switch (provider) {
      case 'openai':
        return key.startsWith('sk-') && key.length > 20;
      case 'anthropic':
        return key.startsWith('sk-ant-') && key.length > 20;
      case 'google':
        return key.startsWith('AIza') && key.length > 20;
      default:
        return key.length > 10; // Basic length check for others
    }
  }

  /**
   * Get provider info by ID
   */
  public getProviderInfo(providerId: string): ProviderInfo | undefined {
    return AI_PROVIDERS.find(p => p.id === providerId);
  }

  /**
   * Get all available providers
   */
  public getAllProviders(): ProviderInfo[] {
    return AI_PROVIDERS;
  }

  /**
   * Get providers that require API keys
   */
  public getProvidersRequiringKeys(): ProviderInfo[] {
    return AI_PROVIDERS.filter(p => p.requiresKey);
  }

  /**
   * Clear all stored API keys
   */
  public clearAllKeys(): void {
    this.keys = {};
    this.saveKeys();
  }

  /**
   * Clear API key for a specific provider
   */
  public clearKey(provider: string): void {
    delete this.keys[provider];
    this.saveKeys();
  }

  /**
   * Export keys (for backup)
   */
  public exportKeys(): string {
    return JSON.stringify(this.keys);
  }

  /**
   * Import keys (from backup)
   */
  public importKeys(jsonString: string): boolean {
    try {
      const imported = JSON.parse(jsonString);
      this.keys = imported;
      this.saveKeys();
      return true;
    } catch (error) {
      console.error('Failed to import API keys:', error);
      return false;
    }
  }

  /**
   * Get provider for a model name
   */
  public getProviderForModel(modelName: string): ProviderInfo | undefined {
    return AI_PROVIDERS.find(provider =>
      provider.models?.some(model =>
        model.toLowerCase() === modelName.toLowerCase()
      )
    );
  }

  /**
   * Check if any API key is configured
   */
  public hasAnyKey(): boolean {
    return Object.keys(this.keys).length > 0;
  }
}

// Export singleton instance
export const apiKeyService = ApiKeyService.getInstance();