# Distributed OpenCode Architecture Plan

## Overview
A scalable distributed system for controlling multiple OpenCode instances across different machines, with centralized command distribution and result aggregation.

## Architecture Components

### 1. Message Queue (Central Hub)
**Technology Options:**
- **Redis** (Recommended for simplicity)
  - Pub/Sub for real-time events
  - Lists for task queues
  - Sorted sets for priority queues
  - Built-in persistence options
- **RabbitMQ** (For advanced routing)
  - Topic exchanges for flexible routing
  - Message persistence
  - Dead letter queues for failed tasks
- **NATS** (For high performance)
  - Extremely lightweight
  - Built-in clustering
  - JetStream for persistence

**Key Features:**
- Task distribution queue
- Result aggregation channel
- Worker heartbeat/status monitoring
- Event streaming for real-time updates
- Command history storage

### 2. OpenCode Workers (Linux/Any OS)

#### Worker Service Architecture
```
┌─────────────────────────────────────┐
│         Worker Node                  │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐    │
│  │   Worker Manager Service    │    │
│  │  - Health monitoring        │    │
│  │  - Resource management      │    │
│  │  - Task scheduling          │    │
│  └──────────┬──────────────────┘    │
│             │                        │
│  ┌──────────▼──────────────────┐    │
│  │   OpenCode Instance(s)      │    │
│  │  - Multiple sessions        │    │
│  │  - Different models         │    │
│  │  - Project contexts         │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

#### Worker Implementation
```python
# worker.py - Python worker service example
import redis
import subprocess
import json
import threading
import time
from dataclasses import dataclass
from typing import Optional

@dataclass
class WorkerConfig:
    worker_id: str
    redis_host: str
    redis_port: int
    opencode_port: int
    capabilities: list  # ['code', 'research', 'analysis']
    max_concurrent_tasks: int = 1

class OpenCodeWorker:
    def __init__(self, config: WorkerConfig):
        self.config = config
        self.redis = redis.Redis(
            host=config.redis_host,
            port=config.redis_port,
            decode_responses=True
        )
        self.pubsub = self.redis.pubsub()
        self.running = True
        self.current_task = None
        self.opencode_process = None

    def start(self):
        # Start OpenCode server
        self.start_opencode()

        # Subscribe to task channels
        self.pubsub.subscribe(f'worker:{self.config.worker_id}:commands')
        self.pubsub.subscribe('broadcast:commands')

        # Start heartbeat thread
        threading.Thread(target=self.heartbeat, daemon=True).start()

        # Main task loop
        self.task_loop()

    def start_opencode(self):
        """Start OpenCode server instance"""
        cmd = f"opencode serve --port {self.config.opencode_port}"
        self.opencode_process = subprocess.Popen(
            cmd.split(),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        time.sleep(3)  # Wait for server to start

    def heartbeat(self):
        """Send periodic heartbeat to Redis"""
        while self.running:
            status = {
                'worker_id': self.config.worker_id,
                'status': 'idle' if not self.current_task else 'busy',
                'current_task': self.current_task,
                'timestamp': time.time(),
                'capabilities': self.config.capabilities
            }
            self.redis.setex(
                f'worker:status:{self.config.worker_id}',
                10,  # TTL 10 seconds
                json.dumps(status)
            )
            time.sleep(5)

    def task_loop(self):
        """Main loop for processing tasks"""
        while self.running:
            # Check for priority tasks
            task = self.redis.lpop('tasks:priority')
            if not task:
                # Check regular task queue
                task = self.redis.lpop('tasks:queue')

            if task:
                self.process_task(json.loads(task))
            else:
                # Listen for pub/sub messages
                message = self.pubsub.get_message(timeout=1)
                if message and message['type'] == 'message':
                    self.handle_message(json.loads(message['data']))

    def process_task(self, task):
        """Process a single task"""
        self.current_task = task['id']

        # Update status
        self.redis.hset(
            f"task:{task['id']}",
            mapping={
                'status': 'processing',
                'worker': self.config.worker_id,
                'started_at': time.time()
            }
        )

        try:
            # Send task to OpenCode via API
            result = self.execute_opencode_task(task)

            # Store result
            self.redis.hset(
                f"task:{task['id']}",
                mapping={
                    'status': 'completed',
                    'result': json.dumps(result),
                    'completed_at': time.time()
                }
            )

            # Publish completion event
            self.redis.publish(
                f"task:{task['id']}:complete",
                json.dumps(result)
            )

        except Exception as e:
            # Handle failure
            self.redis.hset(
                f"task:{task['id']}",
                mapping={
                    'status': 'failed',
                    'error': str(e),
                    'failed_at': time.time()
                }
            )

        finally:
            self.current_task = None

    def execute_opencode_task(self, task):
        """Execute task on OpenCode instance"""
        # Use OpenCode SDK to send task
        # This would interact with OpenCode API
        pass
```

### 3. Control Application (Ninja Squad Enhancement)

#### New Components to Add

##### A. Connection Manager
```typescript
// src/services/DistributedService.ts
interface DistributedConfig {
  redisHost: string;
  redisPort: number;
  redisPassword?: string;
  namespace: string;  // For multi-tenant support
}

interface Worker {
  id: string;
  status: 'online' | 'offline' | 'busy';
  capabilities: string[];
  currentTask?: string;
  lastSeen: Date;
  performance: {
    tasksCompleted: number;
    averageTime: number;
    successRate: number;
  };
}

interface Task {
  id: string;
  type: 'code' | 'research' | 'analysis' | 'general';
  prompt: string;
  context?: {
    project?: string;
    files?: string[];
    previousTasks?: string[];
  };
  priority: number;
  requiredCapabilities?: string[];
  assignedWorker?: string;
  status: 'pending' | 'queued' | 'processing' | 'completed' | 'failed';
  result?: any;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

class DistributedService {
  private redis: RedisClient;
  private workers: Map<string, Worker>;
  private tasks: Map<string, Task>;
  private subscribers: Set<(event: DistributedEvent) => void>;

  async connect(config: DistributedConfig) {
    // Initialize Redis connection
    // Set up pub/sub listeners
    // Start monitoring workers
  }

  async submitTask(task: Omit<Task, 'id' | 'status' | 'createdAt'>): Promise<string> {
    // Generate task ID
    // Validate task
    // Add to appropriate queue
    // Return task ID for tracking
  }

  async getWorkers(): Promise<Worker[]> {
    // Return list of online workers
  }

  async getTaskStatus(taskId: string): Promise<Task> {
    // Get current task status
  }

  async distributeToWorkers(strategy: 'roundrobin' | 'leastbusy' | 'capabilities') {
    // Implement distribution strategies
  }
}
```

##### B. Task Orchestrator
```typescript
// src/services/TaskOrchestrator.ts
interface Workflow {
  id: string;
  name: string;
  tasks: WorkflowTask[];
  dependencies: TaskDependency[];
}

interface WorkflowTask {
  id: string;
  name: string;
  type: string;
  prompt: string;
  requiredCapabilities?: string[];
  timeout?: number;
  retryPolicy?: {
    maxRetries: number;
    backoff: 'linear' | 'exponential';
  };
}

interface TaskDependency {
  from: string;
  to: string;
  condition?: 'success' | 'failure' | 'always';
}

class TaskOrchestrator {
  async executeWorkflow(workflow: Workflow): Promise<WorkflowResult> {
    // Parse DAG
    // Execute tasks in order respecting dependencies
    // Handle retries and failures
    // Aggregate results
  }

  async splitLargeTask(task: string, chunkSize: number): Promise<Task[]> {
    // Break large tasks into smaller chunks
    // Useful for processing large codebases
  }

  async mapReduce<T, R>(
    items: T[],
    mapFn: (item: T) => Task,
    reduceFn: (results: any[]) => R
  ): Promise<R> {
    // Distribute map operations across workers
    // Collect and reduce results
  }
}
```

##### C. Monitoring Dashboard
```typescript
// src/components/DistributedDashboard.tsx
interface DashboardProps {
  workers: Worker[];
  tasks: Task[];
  systemHealth: SystemHealth;
}

const DistributedDashboard: React.FC<DashboardProps> = ({
  workers,
  tasks,
  systemHealth
}) => {
  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Worker Status Grid */}
      <div className="col-span-4">
        <WorkerGrid workers={workers} />
      </div>

      {/* Task Queue Visualization */}
      <div className="col-span-4">
        <TaskQueue tasks={tasks} />
      </div>

      {/* Performance Metrics */}
      <div className="col-span-4">
        <PerformanceMetrics />
      </div>

      {/* Real-time Task Stream */}
      <div className="col-span-12">
        <TaskStream />
      </div>
    </div>
  );
};
```

## Implementation Phases

### Phase 1: Infrastructure Setup (Week 1)
1. **Set up Redis Server**
   - Install Redis on a dedicated machine or use Redis Cloud
   - Configure persistence and backups
   - Set up authentication and SSL

2. **Create Worker Service**
   - Implement basic Python/Node.js worker
   - OpenCode integration via API
   - Basic task processing

3. **Update Ninja Squad**
   - Add Redis client library
   - Create DistributedService
   - Basic connection UI

### Phase 2: Core Functionality (Week 2-3)
1. **Task Distribution**
   - Implement task queues
   - Priority system
   - Worker selection algorithms

2. **Result Aggregation**
   - Collect results from workers
   - Handle partial results
   - Error aggregation

3. **Worker Management**
   - Health monitoring
   - Auto-restart failed workers
   - Resource usage tracking

### Phase 3: Advanced Features (Week 4-5)
1. **Workflow Engine**
   - DAG execution
   - Conditional logic
   - Parallel execution

2. **Load Balancing**
   - Smart task routing
   - Worker specialization
   - Dynamic scaling

3. **Fault Tolerance**
   - Task retry mechanisms
   - Dead letter queues
   - Checkpoint/resume

### Phase 4: UI and Monitoring (Week 6)
1. **Dashboard Development**
   - Real-time worker status
   - Task visualization
   - Performance metrics

2. **Alerting System**
   - Worker failure alerts
   - Task timeout notifications
   - System health alerts

## Deployment Architecture

### Development Environment
```yaml
# docker-compose.yml
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes

  worker-1:
    build: ./worker
    environment:
      - WORKER_ID=worker-1
      - REDIS_HOST=redis
      - OPENCODE_PORT=4096
    depends_on:
      - redis

  worker-2:
    build: ./worker
    environment:
      - WORKER_ID=worker-2
      - REDIS_HOST=redis
      - OPENCODE_PORT=4097
    depends_on:
      - redis

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - worker-1
      - worker-2

volumes:
  redis-data:
```

### Production Environment
```
┌─────────────────────────────────────────┐
│            Load Balancer                │
└────────────────┬────────────────────────┘
                 │
     ┌───────────▼───────────┐
     │    Control Apps       │
     │  (Multiple Clients)   │
     └───────────┬───────────┘
                 │
     ┌───────────▼───────────┐
     │   Redis Cluster        │
     │  (3+ nodes for HA)    │
     └──┬────────┬────────┬──┘
        │        │        │
   ┌────▼──┐ ┌──▼───┐ ┌──▼────┐
   │Worker │ │Worker│ │Worker │
   │Node 1 │ │Node 2│ │Node N │
   └───────┘ └──────┘ └───────┘
```

## Security Considerations

### 1. Network Security
- VPN or private network for worker-to-redis communication
- TLS/SSL for all connections
- Firewall rules restricting access

### 2. Authentication
- Redis AUTH with strong passwords
- API keys for worker authentication
- JWT tokens for client sessions

### 3. Data Protection
- Encrypt sensitive data in tasks
- Implement data retention policies
- Audit logging for all operations

### 4. Rate Limiting
- Per-client task submission limits
- Worker resource consumption limits
- Queue size limits

## Monitoring and Observability

### 1. Metrics to Track
- **System Metrics**
  - Queue sizes and latency
  - Worker availability
  - Task throughput
  - Error rates

- **Performance Metrics**
  - Task completion time
  - Worker utilization
  - Resource usage per task
  - Success/failure ratios

- **Business Metrics**
  - Tasks per project
  - User activity
  - Cost per task
  - Model usage distribution

### 2. Logging Strategy
```json
{
  "timestamp": "2024-01-20T10:30:00Z",
  "level": "INFO",
  "worker_id": "worker-1",
  "task_id": "task-123",
  "event": "task_completed",
  "duration_ms": 4500,
  "model": "claude-sonnet-4-0",
  "token_usage": {
    "input": 1500,
    "output": 800
  }
}
```

### 3. Alerting Rules
- Worker offline > 2 minutes
- Queue size > 1000 tasks
- Task failure rate > 10%
- Average completion time > 5 minutes

## Cost Optimization

### 1. Resource Management
- Auto-scale workers based on queue size
- Shutdown idle workers after timeout
- Use spot instances for workers

### 2. Task Optimization
- Batch similar tasks together
- Cache common results
- Implement task deduplication

### 3. Model Selection
- Route simple tasks to cheaper models
- Use expensive models only when needed
- Implement fallback strategies

## Example Use Cases

### 1. Large Codebase Analysis
```typescript
// Analyze entire repository in parallel
const files = await getRepositoryFiles();
const chunks = chunkArray(files, 10);

const tasks = chunks.map(chunk => ({
  type: 'analysis',
  prompt: `Analyze these files for security vulnerabilities: ${chunk.join(', ')}`,
  requiredCapabilities: ['code-analysis'],
  priority: 5
}));

const results = await orchestrator.mapReduce(
  tasks,
  task => distributedService.submitTask(task),
  results => aggregateVulnerabilities(results)
);
```

### 2. Multi-Model Consensus
```typescript
// Get opinions from different models
const models = ['claude-sonnet', 'gpt-4', 'llama-3'];
const tasks = models.map(model => ({
  type: 'general',
  prompt: userPrompt,
  context: { preferredModel: model },
  priority: 10
}));

const results = await Promise.all(
  tasks.map(task => distributedService.submitTask(task))
);

const consensus = analyzeConsensus(results);
```

### 3. Continuous Integration
```typescript
// Run AI code review on PR
async function onPullRequest(pr: PullRequest) {
  const changes = await pr.getChanges();

  const reviewTask = {
    type: 'code-review',
    prompt: `Review this pull request: ${pr.title}`,
    context: {
      files: changes.files,
      diff: changes.diff,
      guidelines: await getReviewGuidelines()
    },
    priority: 8,
    requiredCapabilities: ['code-review', 'security-analysis']
  };

  const review = await distributedService.submitTask(reviewTask);
  await pr.postComment(review.result);
}
```

## Success Metrics

1. **Scalability**: Support 100+ concurrent workers
2. **Throughput**: Process 1000+ tasks per hour
3. **Latency**: < 1 second queue time for priority tasks
4. **Reliability**: 99.9% task completion rate
5. **Efficiency**: 80%+ worker utilization

## Next Steps

1. **Prototype Development**
   - Set up basic Redis + 2 workers
   - Implement simple task distribution
   - Create monitoring dashboard

2. **Testing Strategy**
   - Load testing with synthetic tasks
   - Failure scenario testing
   - Performance benchmarking

3. **Documentation**
   - Worker deployment guide
   - API documentation
   - Troubleshooting guide

## Appendix

### A. Technology Comparison

| Feature | Redis | RabbitMQ | Kafka | NATS |
|---------|-------|----------|-------|------|
| Setup Complexity | Low | Medium | High | Low |
| Performance | High | Medium | High | Very High |
| Persistence | Optional | Yes | Yes | Optional |
| Clustering | Yes | Yes | Yes | Yes |
| Message Patterns | Pub/Sub, Queue | All | Stream | Pub/Sub, Queue |
| Best For | Simple, Fast | Complex Routing | Event Stream | Microservices |

### B. Worker Configuration Examples

```yaml
# worker-config.yml
worker:
  id: "${WORKER_ID}"
  capabilities:
    - code-generation
    - code-review
    - testing
  resources:
    max_memory: 8GB
    max_concurrent: 3
    timeout: 300s

opencode:
  port: 4096
  model: claude-sonnet-4-0
  max_tokens: 8000

redis:
  host: redis.internal
  port: 6379
  password: "${REDIS_PASSWORD}"
  ssl: true

monitoring:
  metrics_port: 9090
  log_level: info
  report_interval: 10s
```

### C. Sample API Endpoints

```typescript
// REST API for control application
POST   /api/tasks                 // Submit new task
GET    /api/tasks/:id             // Get task status
GET    /api/tasks                 // List tasks (with filters)
DELETE /api/tasks/:id             // Cancel task

GET    /api/workers               // List workers
GET    /api/workers/:id          // Get worker details
POST   /api/workers/:id/restart  // Restart worker

GET    /api/metrics              // System metrics
GET    /api/health               // Health check

// WebSocket endpoints for real-time updates
WS     /ws/tasks                 // Task event stream
WS     /ws/workers               // Worker status stream
WS     /ws/logs                  // Log stream
```

This distributed architecture provides massive scalability, fault tolerance, and the ability to coordinate OpenCode instances across multiple machines efficiently.