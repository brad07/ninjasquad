# 🧪 Local Test Mode for Distributed Architecture

## Overview

Local Test Mode allows you to simulate the entire distributed OpenCode control system on a single machine. This is perfect for development, testing, and understanding how the distributed architecture works without needing multiple machines or external infrastructure.

## How It Works

```
┌─────────────────┐
│  Ninja Squad UI │
└────────┬────────┘
         │
    ┌────▼────┐
    │ In-Memory│
    │  Queue   │
    └────┬────┘
         │
    ┌────▼─────────────────────────┐
    │   Local Worker Pool           │
    │  ┌─────────┐  ┌─────────┐   │
    │  │Worker 0 │  │Worker 1 │   │
    │  └─────────┘  └─────────┘   │
    │  ┌─────────┐  ┌─────────┐   │
    │  │Worker 2 │  │Worker N │   │
    │  └─────────┘  └─────────┘   │
    └──────────────────────────────┘
```

## Quick Start

1. **Open Ninja Squad** and navigate to the "Test Mode" tab
2. **Start Local Test Mode** with desired number of workers (default: 3)
3. **Simulate Tasks** using the provided buttons
4. **Monitor** worker activity and statistics in real-time

## Features

### 🎯 Simulated Workers
- Each worker runs as a separate async task
- Workers poll the in-memory queue for tasks
- Simulates real distributed behavior locally

### 📊 Real-time Monitoring
- Live worker status (Online/Busy/Offline)
- Current load percentage
- Active task tracking
- Performance statistics

### 🔧 Task Simulation
Test three core task types:
- **Create Session**: Simulates spawning OpenCode server
- **Run Command**: Executes commands on "remote" workers
- **Health Check**: Verifies worker and server health

## Using Local Test Mode

### Starting Test Mode

```typescript
// Via UI: Click "Start Test Mode" button

// Via Code:
await invoke('start_local_test_mode', { numWorkers: 3 });
```

### Simulating Tasks

```typescript
// Create a new OpenCode session
await invoke('simulate_distributed_task', {
  taskType: 'create_session'
});

// Run a command
await invoke('simulate_distributed_task', {
  taskType: 'run_command'
});

// Health check
await invoke('simulate_distributed_task', {
  taskType: 'health_check'
});
```

### Getting Statistics

```typescript
const stats = await invoke('get_local_test_stats');
// Returns:
{
  "mode": "local_test",
  "running": true,
  "num_workers": 3,
  "active_workers": 3,
  "total_load": 0.3,
  "total_tasks": 1,
  "workers": [...]
}
```

## Architecture Details

### Components

1. **LocalTestMode Manager** (`queue/local_test.rs`)
   - Manages worker lifecycle
   - Provides test utilities
   - Tracks system statistics

2. **In-Memory Queue** (`queue/client.rs`)
   - Replaces Redis/RabbitMQ for testing
   - Stores tasks and results locally
   - Priority-based task ordering

3. **Worker Service** (`queue/worker.rs`)
   - Processes tasks from queue
   - Sends heartbeats
   - Returns results

### Task Flow

1. User clicks "Simulate Task" in UI
2. Task published to in-memory queue
3. Available worker picks up task
4. Worker processes task locally
5. Result returned via queue
6. UI displays result

## Benefits

### 👨‍💻 For Development
- No external dependencies (Redis, RabbitMQ)
- Fast iteration and testing
- Easy debugging with local logs

### 🧑‍🏫 For Learning
- Understand distributed concepts
- Visualize task distribution
- See worker coordination in action

### ✅ For Testing
- Validate distributed logic
- Test failure scenarios
- Performance benchmarking

## Configuration

Default settings in `queue/local_test.rs`:

```rust
QueueConfig {
    queue_type: QueueType::InMemory,
    heartbeat_interval_secs: 5,  // Faster for testing
    task_timeout_secs: 60,
    max_concurrent_tasks: 2,     // Per worker
}
```

## Limitations

Local Test Mode is designed for testing and development:

- Workers run in same process (not truly distributed)
- No network latency simulation
- Limited to local machine resources
- Not suitable for production testing

## Transitioning to Production

When ready for real distributed deployment:

1. **Configure Redis/RabbitMQ**
   ```rust
   QueueConfig {
       redis_url: Some("redis://your-redis:6379"),
       queue_type: QueueType::Redis,
   }
   ```

2. **Deploy Workers** to remote machines
   ```bash
   ./ninja-worker --redis-url redis://central:6379
   ```

3. **Enable Distributed Mode** in UI
   ```typescript
   await invoke('enable_distributed_mode', { enable: true });
   ```

## Troubleshooting

### Workers Not Starting
- Check console for errors
- Ensure no port conflicts
- Verify OpenCode service is running

### Tasks Not Processing
- Check worker status in UI
- Verify queue is running
- Look for task timeout errors

### Performance Issues
- Reduce number of workers
- Check system resources
- Monitor task execution times

## Example Use Cases

### 1. Testing Load Distribution
```javascript
// Start with 5 workers
await invoke('start_local_test_mode', { numWorkers: 5 });

// Send 10 tasks rapidly
for (let i = 0; i < 10; i++) {
  await invoke('simulate_distributed_task', {
    taskType: 'run_command'
  });
}

// Watch workers distribute load
```

### 2. Simulating Worker Failure
```javascript
// Start test mode
await invoke('start_local_test_mode', { numWorkers: 3 });

// Tasks will redistribute to remaining workers
// (Future: Add worker kill simulation)
```

### 3. Performance Testing
```javascript
// Measure task processing time
const start = Date.now();
const result = await invoke('simulate_distributed_task', {
  taskType: 'create_session'
});
console.log(`Task completed in ${Date.now() - start}ms`);
```

## Future Enhancements

- [ ] Network latency simulation
- [ ] Worker failure injection
- [ ] Load testing scenarios
- [ ] Task priority testing
- [ ] Queue persistence simulation
- [ ] Multi-machine test mode

## Summary

Local Test Mode provides a safe, efficient way to:
- Develop distributed features
- Test worker coordination
- Understand the architecture
- Validate task processing

Perfect for development before deploying to real distributed infrastructure!