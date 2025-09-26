import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenCodeService } from './OpenCodeService';
import type { OpenCodeServer } from '../types';

// Mock Tauri invoke function
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Mock EventSource
global.EventSource = vi.fn() as any;

describe('OpenCodeService', () => {
  let service: OpenCodeService;

  beforeEach(() => {
    service = new OpenCodeService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    service.disconnect();
  });

  it('connects to server instance', async () => {
    const mockServer: OpenCodeServer = {
      id: 'server-123',
      host: 'localhost',
      port: 4096,
      status: 'Running',
      process_id: 1234,
    };

    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockResolvedValueOnce(mockServer);

    const result = await service.spawnServer(4096);

    expect(invoke).toHaveBeenCalledWith('spawn_opencode_server', { port: 4096 });
    expect(result).toEqual(mockServer);
  });

  it('sends prompt via API', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockResolvedValueOnce({ success: true });

    const result = await service.sendPrompt('server-123', 'Test prompt');

    expect(invoke).toHaveBeenCalledWith('distribute_task', { prompt: 'Test prompt' });
    expect(result).toEqual({ success: true });
  });

  it('receives SSE events', () => {
    const mockEventSource = {
      onmessage: null as any,
      onerror: null as any,
      close: vi.fn(),
    };

    (global.EventSource as any).mockImplementation(() => mockEventSource);

    const eventHandler = vi.fn();
    service.onEvent('test-event', eventHandler);

    service.connectToEventStream('http://localhost:4096');

    // Simulate receiving an event
    const testEvent = {
      event_type: 'test-event',
      data: { message: 'Test data' },
      timestamp: '2024-01-01T00:00:00Z',
    };

    mockEventSource.onmessage!({
      data: JSON.stringify(testEvent),
    } as MessageEvent);

    expect(eventHandler).toHaveBeenCalledWith(testEvent);
  });

  it('handles connection errors', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockRejectedValueOnce(new Error('Connection refused'));

    await expect(service.spawnServer(4096)).rejects.toThrow('Failed to spawn OpenCode server');
  });

  it('retries failed requests', async () => {
    const mockEventSource = {
      onmessage: null as any,
      onerror: null as any,
      close: vi.fn(),
    };

    (global.EventSource as any).mockImplementation(() => mockEventSource);

    vi.useFakeTimers();

    service.connectToEventStream('http://localhost:4096');

    // Trigger error
    mockEventSource.onerror!({ type: 'error' } as Event);

    // Should attempt reconnect after 5 seconds
    expect(global.EventSource).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5000);

    expect(global.EventSource).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});