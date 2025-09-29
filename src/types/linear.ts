/**
 * Linear Integration Type Definitions
 */

/**
 * Linear User
 */
export interface LinearUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  displayName: string;
  active: boolean;
  createdAt: string;
}

/**
 * Linear Team
 */
export interface LinearTeam {
  id: string;
  name: string;
  key: string;
  description?: string;
  icon?: string;
  color?: string;
  private: boolean;
}

/**
 * Linear Project
 */
export interface LinearProject {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  state: 'planned' | 'started' | 'paused' | 'completed' | 'canceled';
  progress: number;
  startDate?: string;
  targetDate?: string;
  teams: LinearTeam[];
}

/**
 * Linear Issue Priority
 */
export type LinearPriority = 0 | 1 | 2 | 3 | 4; // 0 = No priority, 1 = Urgent, 2 = High, 3 = Normal, 4 = Low

/**
 * Linear Issue State
 */
export interface LinearIssueState {
  id: string;
  name: string;
  color: string;
  type: 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled';
}

/**
 * Linear Label
 */
export interface LinearLabel {
  id: string;
  name: string;
  color: string;
  description?: string;
}

/**
 * Linear Issue
 */
export interface LinearIssue {
  id: string;
  identifier: string; // e.g., "PROJ-123"
  title: string;
  description?: string;
  priority: LinearPriority;
  state: LinearIssueState;
  assignee?: LinearUser;
  creator: LinearUser;
  project?: LinearProject;
  team: LinearTeam;
  labels: LinearLabel[];
  parent?: LinearIssue;
  children?: LinearIssue[];
  estimate?: number;
  startedAt?: string;
  completedAt?: string;
  canceledAt?: string;
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
  url: string;
  branchName?: string;

  // Agent-specific fields
  agentAssignment?: AgentAssignment;
  agentStatus?: AgentTaskStatus;
}

/**
 * Agent Assignment
 */
export interface AgentAssignment {
  issueId: string;
  agentId: string;
  agentType: 'opencode' | 'claude-code' | 'custom';
  assignedAt: string;
  assignedBy: string;
  priority: number;
  estimatedTime?: number;
  actualTime?: number;
  status: AgentTaskStatus;
  metadata?: Record<string, any>;
}

/**
 * Agent Task Status
 */
export type AgentTaskStatus =
  | 'queued'
  | 'analyzing'
  | 'in_progress'
  | 'testing'
  | 'review_required'
  | 'completed'
  | 'failed'
  | 'blocked';

/**
 * Linear Comment
 */
export interface LinearComment {
  id: string;
  body: string;
  user: LinearUser;
  issue: LinearIssue;
  createdAt: string;
  updatedAt: string;
}

/**
 * Linear Attachment
 */
export interface LinearAttachment {
  id: string;
  title?: string;
  subtitle?: string;
  url: string;
  creator: LinearUser;
  createdAt: string;
  updatedAt: string;
}

/**
 * Linear API Configuration
 */
export interface LinearConfig {
  apiKey: string;
  organizationId?: string;
  teamIds?: string[];
  syncInterval?: number; // in minutes
  enableWebhooks?: boolean;
  webhookSecret?: string;
  defaultUsername?: string; // Default username to filter by
}

/**
 * Linear Sync Status
 */
export interface LinearSyncStatus {
  lastSyncAt?: string;
  syncInProgress: boolean;
  issueCount: number;
  projectCount: number;
  teamCount: number;
  error?: string;
}

/**
 * Linear Filter Options
 */
export interface LinearFilterOptions {
  teamIds?: string[];
  projectIds?: string[];
  assigneeIds?: string[];
  isUnassigned?: boolean;  // Filter for unassigned issues
  isAssigned?: boolean;    // Filter for assigned issues (has any assignee)
  states?: string[];
  priorities?: LinearPriority[];
  labels?: string[];
  hasAgent?: boolean;
  agentStatus?: AgentTaskStatus[];
  searchQuery?: string;
  includeArchived?: boolean;
  sortBy?: 'priority' | 'created' | 'updated' | 'dueDate' | 'title';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * Linear Webhook Event
 */
export interface LinearWebhookEvent {
  action: 'create' | 'update' | 'remove';
  type: 'Issue' | 'Comment' | 'Project' | 'IssueLabel';
  data: any;
  url: string;
  createdAt: string;
}

/**
 * Agent Task Plan
 */
export interface AgentTaskPlan {
  issueId: string;
  steps: TaskStep[];
  estimatedTime: number;
  requiredCapabilities: string[];
  suggestedAgent: string;
  dependencies: string[];
}

/**
 * Task Step
 */
export interface TaskStep {
  id: string;
  description: string;
  type: 'code' | 'test' | 'documentation' | 'review' | 'other';
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  estimatedTime?: number;
  actualTime?: number;
  result?: string;
  error?: string;
}

/**
 * Linear Integration Statistics
 */
export interface LinearStats {
  totalIssues: number;
  assignedToAgents: number;
  completedByAgents: number;
  inProgress: number;
  averageCompletionTime: number;
  successRate: number;
  agentPerformance: Record<string, {
    assigned: number;
    completed: number;
    failed: number;
    averageTime: number;
  }>;
}

/**
 * Create Sub-Issue Request
 */
export interface CreateSubIssueRequest {
  parentId: string;
  title: string;
  description?: string;
  assigneeId?: string;
  priority?: LinearPriority;
  estimate?: number;
  labels?: string[];
  projectId?: string;
  teamId?: string;
  assignToAgent?: boolean;
  agentId?: string;
}

/**
 * Batch Assignment Request
 */
export interface BatchAssignmentRequest {
  issueIds: string[];
  agentId: string;
  priority?: number;
  autoStart?: boolean;
}