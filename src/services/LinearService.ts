import { invoke } from '@tauri-apps/api/core';
import type {
  LinearIssue,
  LinearUser,
  LinearTeam,
  LinearProject,
  LinearIssueState,
  LinearComment,
  LinearConfig,
  LinearFilterOptions,
  LinearSyncStatus,
  CreateSubIssueRequest,
  AgentAssignment,
  AgentTaskStatus,
  BatchAssignmentRequest,
  LinearStats,
  AgentTaskPlan,
  TaskStep
} from '../types/linear';

/**
 * Service for interacting with Linear API
 */
class LinearService {
  private config: LinearConfig | null = null;
  private cache: Map<string, any> = new Map();
  private syncStatus: LinearSyncStatus = {
    syncInProgress: false,
    issueCount: 0,
    projectCount: 0,
    teamCount: 0
  };

  constructor() {
    this.loadConfig();
  }

  /**
   * Load Linear configuration from localStorage
   */
  private loadConfig() {
    const saved = localStorage.getItem('linear-config');
    if (saved) {
      try {
        this.config = JSON.parse(saved);
      } catch (error) {
        console.error('Failed to load Linear config:', error);
      }
    }
  }

  /**
   * Save Linear configuration
   */
  public async saveConfig(config: LinearConfig): Promise<void> {
    this.config = config;
    localStorage.setItem('linear-config', JSON.stringify(config));

    // Update backend with new config
    await invoke('update_linear_config', { config });
  }

  /**
   * Get current configuration
   */
  public getConfig(): LinearConfig | null {
    return this.config;
  }

  /**
   * Check if Linear is configured
   */
  public isConfigured(): boolean {
    return !!this.config?.apiKey;
  }

  /**
   * GraphQL query helper
   */
  private async query<T>(query: string, variables?: Record<string, any>): Promise<T> {
    if (!this.config?.apiKey) {
      throw new Error('Linear API key not configured');
    }

    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.config.apiKey
      },
      body: JSON.stringify({ query, variables })
    });

    if (!response.ok) {
      throw new Error(`Linear API error: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.errors) {
      throw new Error(`Linear GraphQL error: ${JSON.stringify(data.errors)}`);
    }

    return data.data;
  }

  /**
   * Fetch current user
   */
  public async getCurrentUser(): Promise<LinearUser> {
    const query = `
      query Me {
        viewer {
          id
          name
          email
          avatarUrl
          displayName
          active
          createdAt
        }
      }
    `;

    const data = await this.query<{ viewer: LinearUser }>(query);
    return data.viewer;
  }

  /**
   * Fetch teams
   */
  public async getTeams(): Promise<LinearTeam[]> {
    const cacheKey = 'teams';
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const query = `
      query Teams {
        teams {
          nodes {
            id
            name
            key
            description
            icon
            color
            private
          }
        }
      }
    `;

    const data = await this.query<{ teams: { nodes: LinearTeam[] } }>(query);
    this.cache.set(cacheKey, data.teams.nodes);
    return data.teams.nodes;
  }

  /**
   * Fetch team members
   */
  public async getTeamMembers(teamId?: string): Promise<LinearUser[]> {
    const cacheKey = teamId ? `members-${teamId}` : 'members-all';
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const query = teamId ? `
      query TeamMembers($teamId: String!) {
        team(id: $teamId) {
          members {
            nodes {
              id
              name
              email
              avatarUrl
              displayName
              active
              createdAt
            }
          }
        }
      }
    ` : `
      query AllUsers {
        users {
          nodes {
            id
            name
            email
            avatarUrl
            displayName
            active
            createdAt
          }
        }
      }
    `;

    if (teamId) {
      const data = await this.query<{ team: { members: { nodes: LinearUser[] } } }>(query, { teamId });
      const members = data.team.members.nodes;
      this.cache.set(cacheKey, members);
      return members;
    } else {
      const data = await this.query<{ users: { nodes: LinearUser[] } }>(query);
      const users = data.users.nodes;
      this.cache.set(cacheKey, users);
      return users;
    }
  }

  /**
   * Fetch workflow states
   */
  public async getWorkflowStates(): Promise<LinearIssueState[]> {
    const cacheKey = 'workflow-states-all-teams';

    // Check localStorage cache first
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        // Cache for 1 hour
        if (parsed.timestamp && Date.now() - parsed.timestamp < 3600000) {
          return parsed.data;
        }
      } catch (e) {
        console.error('Failed to parse cached states:', e);
      }
    }

    // Query all teams first to get their states
    const teamsQuery = `
      query TeamsWithStates {
        teams {
          nodes {
            id
            name
            states {
              nodes {
                id
                name
                color
                type
                position
                description
              }
            }
          }
        }
      }
    `;

    const data = await this.query<{
      teams: {
        nodes: Array<{
          id: string;
          name: string;
          states: {
            nodes: LinearIssueState[]
          }
        }>
      }
    }>(teamsQuery);

    // Collect all unique states across all teams
    const allStates = new Map<string, LinearIssueState>();

    data.teams.nodes.forEach(team => {
      team.states.nodes.forEach(state => {
        // Use state name as key for deduplication
        if (!allStates.has(state.name)) {
          allStates.set(state.name, state);
        }
      });
    });

    const states = Array.from(allStates.values());

    // Cache in localStorage
    localStorage.setItem(cacheKey, JSON.stringify({
      timestamp: Date.now(),
      data: states
    }));

    return states;
  }

  /**
   * Fetch projects
   */
  public async getProjects(teamId?: string): Promise<LinearProject[]> {
    const query = `
      query Projects($filter: ProjectFilter) {
        projects(filter: $filter) {
          nodes {
            id
            name
            description
            icon
            color
            state
            progress
            startDate
            targetDate
            teams {
              nodes {
                id
                name
                key
              }
            }
          }
        }
      }
    `;

    const variables = teamId ? { filter: { team: { id: { eq: teamId } } } } : {};
    const data = await this.query<{ projects: { nodes: LinearProject[] } }>(query, variables);
    return data.projects.nodes;
  }

  /**
   * Fetch issues with filters
   */
  public async getIssues(options: LinearFilterOptions = {}): Promise<LinearIssue[]> {
    const query = `
      query Issues($filter: IssueFilter, $first: Int, $after: String) {
        issues(filter: $filter, first: $first, after: $after) {
          nodes {
            id
            identifier
            title
            description
            priority
            estimate
            startedAt
            completedAt
            canceledAt
            createdAt
            updatedAt
            dueDate
            url
            branchName
            state {
              id
              name
              color
              type
            }
            assignee {
              id
              name
              email
              avatarUrl
              displayName
            }
            creator {
              id
              name
              email
              displayName
            }
            project {
              id
              name
              color
            }
            team {
              id
              name
              key
            }
            labels {
              nodes {
                id
                name
                color
              }
            }
            parent {
              id
              identifier
              title
            }
            children {
              nodes {
                id
                identifier
                title
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    // Build filter
    const filter: any = {};

    if (options.teamIds?.length) {
      filter.team = { id: { in: options.teamIds } };
    }

    if (options.projectIds?.length) {
      filter.project = { id: { in: options.projectIds } };
    }

    if (options.isUnassigned) {
      // Filter for issues with no assignee
      filter.assignee = { null: true };
    } else if (options.isAssigned) {
      // Filter for issues with any assignee
      filter.assignee = { null: false };
    } else if (options.assigneeIds?.length) {
      filter.assignee = { id: { in: options.assigneeIds } };
    }

    if (options.states?.length) {
      filter.state = { name: { in: options.states } };
    }

    if (options.priorities?.length) {
      filter.priority = { in: options.priorities };
    }

    if (options.searchQuery) {
      filter.searchableContent = { contains: options.searchQuery };
    }

    // Fetch limited number of issues
    const variables = {
      filter,
      first: 20, // Only fetch 20 records
    };

    const data = await this.query<{
      issues: {
        nodes: LinearIssue[];
        pageInfo: {
          hasNextPage: boolean;
          endCursor: string;
        };
      };
    }>(query, variables);

    // Add agent assignment data from local storage
    const assignments = this.getAgentAssignments();
    return data.issues.nodes.map(issue => ({
      ...issue,
      agentAssignment: assignments.get(issue.id),
      agentStatus: assignments.get(issue.id)?.status
    }));
  }

  /**
   * Get a single issue by ID
   */
  public async getIssue(issueId: string): Promise<LinearIssue> {
    const query = `
      query Issue($id: String!) {
        issue(id: $id) {
          id
          identifier
          title
          description
          priority
          estimate
          startedAt
          completedAt
          canceledAt
          createdAt
          updatedAt
          dueDate
          url
          branchName
          state {
            id
            name
            color
            type
          }
          assignee {
            id
            name
            email
            avatarUrl
            displayName
          }
          creator {
            id
            name
            email
            displayName
          }
          project {
            id
            name
            color
          }
          team {
            id
            name
            key
          }
          labels {
            nodes {
              id
              name
              color
            }
          }
          parent {
            id
            identifier
            title
          }
          children {
            nodes {
              id
              identifier
              title
            }
          }
        }
      }
    `;

    const data = await this.query<{ issue: LinearIssue }>(query, { id: issueId });
    const assignments = this.getAgentAssignments();
    return {
      ...data.issue,
      agentAssignment: assignments.get(issueId),
      agentStatus: assignments.get(issueId)?.status
    };
  }

  /**
   * Create a sub-issue
   */
  public async createSubIssue(request: CreateSubIssueRequest): Promise<LinearIssue> {
    const mutation = `
      mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {
            id
            identifier
            title
            description
          }
        }
      }
    `;

    const parent = await this.getIssue(request.parentId);

    const input: any = {
      title: request.title,
      teamId: request.teamId || parent.team.id,
      parentId: request.parentId
    };

    // Add optional fields only if they are provided
    if (request.description) input.description = request.description;
    if (request.priority !== undefined) input.priority = request.priority;
    if (request.estimate !== undefined) input.estimate = request.estimate;
    if (request.assigneeId) input.assigneeId = request.assigneeId;
    if (request.projectId) input.projectId = request.projectId;
    if (request.labels && request.labels.length > 0) input.labelIds = request.labels;

    const data = await this.query<{ issueCreate: { issue: LinearIssue } }>(mutation, { input });

    const newIssue = data.issueCreate.issue;

    // If assigning to agent, create assignment
    if (request.assignToAgent && request.agentId) {
      await this.assignIssueToAgent(newIssue.id, request.agentId);
    }

    return newIssue;
  }

  /**
   * Update issue
   */
  public async updateIssue(issueId: string, updates: Partial<LinearIssue> & { stateId?: string }): Promise<LinearIssue> {
    const mutation = `
      mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) {
          success
          issue {
            id
            identifier
            title
            state {
              id
              name
              color
              type
            }
          }
        }
      }
    `;

    const input: any = {};
    if (updates.title) input.title = updates.title;
    if (updates.description !== undefined) input.description = updates.description;
    if (updates.priority !== undefined) input.priority = updates.priority;
    if (updates.estimate !== undefined) input.estimate = updates.estimate;
    if (updates.dueDate !== undefined) input.dueDate = updates.dueDate;
    if (updates.stateId !== undefined) input.stateId = updates.stateId;

    const data = await this.query<{ issueUpdate: { issue: LinearIssue } }>(
      mutation,
      { id: issueId, input }
    );

    return data.issueUpdate.issue;
  }

  /**
   * Get comments for an issue
   */
  public async getIssueComments(issueId: string): Promise<LinearComment[]> {
    const query = `
      query IssueComments($issueId: String!) {
        issue(id: $issueId) {
          comments {
            nodes {
              id
              body
              createdAt
              updatedAt
              user {
                id
                name
                displayName
                email
                avatarUrl
                active
              }
            }
          }
        }
      }
    `;

    try {
      const data = await this.query<{ issue: { comments: { nodes: any[] } } }>(
        query,
        { issueId }
      );

      // Debug log the raw comment data
      console.log('Raw comments from Linear API:', data.issue.comments.nodes);

      // Process comments to ensure user data is properly structured
      const processedComments = data.issue.comments.nodes.map(comment => {
        console.log('Processing comment:', {
          id: comment.id,
          user: comment.user,
          body: comment.body?.substring(0, 50) + '...'
        });

        return {
          ...comment,
          user: comment.user || {
            id: 'unknown',
            name: 'Linear User',
            displayName: 'Linear User',
            avatarUrl: null
          }
        };
      });

      console.log('Processed comments:', processedComments);
      return processedComments as LinearComment[];
    } catch (error) {
      console.error('Error fetching comments:', error);
      return [];
    }
  }

  /**
   * Add comment to issue
   */
  public async addComment(issueId: string, body: string): Promise<LinearComment> {
    const mutation = `
      mutation CreateComment($input: CommentCreateInput!) {
        commentCreate(input: $input) {
          success
          comment {
            id
            body
            createdAt
            updatedAt
            user {
              id
              name
              displayName
              avatarUrl
            }
          }
        }
      }
    `;

    const data = await this.query<{ commentCreate: { comment: LinearComment } }>(
      mutation,
      { input: { issueId, body } }
    );

    return data.commentCreate.comment;
  }

  /**
   * Assign issue to agent
   */
  public async assignIssueToAgent(
    issueId: string,
    agentId: string,
    priority: number = 1
  ): Promise<AgentAssignment> {
    const assignment: AgentAssignment = {
      issueId,
      agentId,
      agentType: this.getAgentType(agentId),
      assignedAt: new Date().toISOString(),
      assignedBy: 'current-user', // TODO: Get from current user
      priority,
      status: 'queued'
    };

    // Store assignment locally
    this.saveAgentAssignment(assignment);

    // Notify backend
    await invoke('assign_issue_to_agent', { assignment });

    // Add comment to Linear issue
    await this.addComment(
      issueId,
      `🤖 Assigned to ${agentId} agent for automated implementation`
    );

    return assignment;
  }

  /**
   * Batch assign issues to agent
   */
  public async batchAssignToAgent(request: BatchAssignmentRequest): Promise<AgentAssignment[]> {
    const assignments: AgentAssignment[] = [];

    for (let i = 0; i < request.issueIds.length; i++) {
      const assignment = await this.assignIssueToAgent(
        request.issueIds[i],
        request.agentId,
        request.priority || i + 1
      );
      assignments.push(assignment);
    }

    if (request.autoStart) {
      // Start processing first issue
      await this.startAgentTask(assignments[0].issueId, request.agentId);
    }

    return assignments;
  }

  /**
   * Start agent task
   */
  public async startAgentTask(issueId: string, agentId: string): Promise<void> {
    const issue = await this.getIssue(issueId);
    const assignment = this.getAgentAssignments().get(issueId);

    if (!assignment) {
      throw new Error('Issue not assigned to agent');
    }

    // Update status
    assignment.status = 'analyzing';
    this.saveAgentAssignment(assignment);

    // Generate task plan
    const plan = await this.generateTaskPlan(issue);

    // Send to agent
    await invoke('execute_agent_task', {
      issueId,
      agentId,
      issue,
      plan
    });
  }

  /**
   * Generate task plan for issue
   */
  private async generateTaskPlan(issue: LinearIssue): Promise<AgentTaskPlan> {
    const steps: TaskStep[] = [];

    // Analyze issue description to determine steps
    const hasTests = issue.description?.toLowerCase().includes('test');
    const hasDocs = issue.description?.toLowerCase().includes('document');

    // Basic implementation step
    steps.push({
      id: `${issue.id}-impl`,
      description: `Implement: ${issue.title}`,
      type: 'code',
      status: 'pending',
      estimatedTime: issue.estimate || 60
    });

    // Add test step if needed
    if (hasTests) {
      steps.push({
        id: `${issue.id}-test`,
        description: `Write tests for: ${issue.title}`,
        type: 'test',
        status: 'pending',
        estimatedTime: 30
      });
    }

    // Add documentation step if needed
    if (hasDocs) {
      steps.push({
        id: `${issue.id}-docs`,
        description: `Document: ${issue.title}`,
        type: 'documentation',
        status: 'pending',
        estimatedTime: 15
      });
    }

    return {
      issueId: issue.id,
      steps,
      estimatedTime: steps.reduce((sum, step) => sum + (step.estimatedTime || 0), 0),
      requiredCapabilities: ['file_operations', 'git_operations'],
      suggestedAgent: 'opencode',
      dependencies: issue.parent ? [issue.parent.id] : []
    };
  }

  /**
   * Update agent task status
   */
  public async updateAgentTaskStatus(
    issueId: string,
    status: AgentTaskStatus,
    metadata?: Record<string, any>
  ): Promise<void> {
    const assignment = this.getAgentAssignments().get(issueId);
    if (!assignment) return;

    assignment.status = status;
    if (metadata) {
      assignment.metadata = { ...assignment.metadata, ...metadata };
    }

    this.saveAgentAssignment(assignment);

    // Update Linear issue
    let comment = `🤖 Agent status: ${status}`;
    if (status === 'completed') {
      comment = '✅ Agent task completed successfully';
      // Move issue to done state
      await this.moveIssueToDone(issueId);
    } else if (status === 'failed') {
      comment = `❌ Agent task failed: ${metadata?.error || 'Unknown error'}`;
    }

    await this.addComment(issueId, comment);
  }

  /**
   * Move issue to done state
   */
  private async moveIssueToDone(issueId: string): Promise<void> {
    // Get team's done state
    const issue = await this.getIssue(issueId);
    const states = await this.getTeamStates(issue.team.id);
    const doneState = states.find(s => s.type === 'completed');

    if (doneState) {
      const mutation = `
        mutation UpdateIssueState($id: String!, $stateId: String!) {
          issueUpdate(id: $id, input: { stateId: $stateId }) {
            success
          }
        }
      `;

      await this.query(mutation, { id: issueId, stateId: doneState.id });
    }
  }

  /**
   * Get team workflow states
   */
  private async getTeamStates(teamId: string): Promise<any[]> {
    const query = `
      query TeamStates($teamId: String!) {
        team(id: $teamId) {
          states {
            nodes {
              id
              name
              type
            }
          }
        }
      }
    `;

    const data = await this.query<{ team: { states: { nodes: any[] } } }>(
      query,
      { teamId }
    );

    return data.team.states.nodes;
  }

  /**
   * Get agent assignments from localStorage
   */
  private getAgentAssignments(): Map<string, AgentAssignment> {
    const saved = localStorage.getItem('linear-agent-assignments');
    if (!saved) return new Map();

    try {
      const data = JSON.parse(saved);
      return new Map(Object.entries(data));
    } catch {
      return new Map();
    }
  }

  /**
   * Save agent assignment
   */
  private saveAgentAssignment(assignment: AgentAssignment): void {
    const assignments = this.getAgentAssignments();
    assignments.set(assignment.issueId, assignment);

    const data: Record<string, AgentAssignment> = {};
    assignments.forEach((value, key) => {
      data[key] = value;
    });

    localStorage.setItem('linear-agent-assignments', JSON.stringify(data));
  }

  /**
   * Get agent type from ID
   */
  private getAgentType(agentId: string): 'opencode' | 'claude-code' | 'custom' {
    if (agentId.includes('opencode')) return 'opencode';
    if (agentId.includes('claude')) return 'claude-code';
    return 'custom';
  }

  /**
   * Get Linear statistics
   */
  public async getStatistics(): Promise<LinearStats> {
    const issues = await this.getIssues();
    const assignments = this.getAgentAssignments();

    const stats: LinearStats = {
      totalIssues: issues.length,
      assignedToAgents: 0,
      completedByAgents: 0,
      inProgress: 0,
      averageCompletionTime: 0,
      successRate: 0,
      agentPerformance: {}
    };

    let totalCompletionTime = 0;
    let completedCount = 0;

    issues.forEach(issue => {
      const assignment = assignments.get(issue.id);
      if (assignment) {
        stats.assignedToAgents++;

        if (assignment.status === 'completed') {
          stats.completedByAgents++;
          completedCount++;
          if (assignment.actualTime) {
            totalCompletionTime += assignment.actualTime;
          }
        } else if (['analyzing', 'in_progress', 'testing'].includes(assignment.status)) {
          stats.inProgress++;
        }

        // Track per-agent stats
        if (!stats.agentPerformance[assignment.agentId]) {
          stats.agentPerformance[assignment.agentId] = {
            assigned: 0,
            completed: 0,
            failed: 0,
            averageTime: 0
          };
        }

        stats.agentPerformance[assignment.agentId].assigned++;
        if (assignment.status === 'completed') {
          stats.agentPerformance[assignment.agentId].completed++;
        } else if (assignment.status === 'failed') {
          stats.agentPerformance[assignment.agentId].failed++;
        }
      }
    });

    if (completedCount > 0) {
      stats.averageCompletionTime = totalCompletionTime / completedCount;
    }

    if (stats.assignedToAgents > 0) {
      stats.successRate = (stats.completedByAgents / stats.assignedToAgents) * 100;
    }

    return stats;
  }

  /**
   * Sync with Linear
   */
  public async sync(): Promise<LinearSyncStatus> {
    if (this.syncStatus.syncInProgress) {
      return this.syncStatus;
    }

    this.syncStatus.syncInProgress = true;
    this.syncStatus.error = undefined;

    try {
      // Clear cache
      this.cache.clear();

      // Fetch fresh data
      const [teams, projects, issues] = await Promise.all([
        this.getTeams(),
        this.getProjects(),
        this.getIssues()
      ]);

      this.syncStatus = {
        lastSyncAt: new Date().toISOString(),
        syncInProgress: false,
        issueCount: issues.length,
        projectCount: projects.length,
        teamCount: teams.length
      };

      // Save sync status
      localStorage.setItem('linear-sync-status', JSON.stringify(this.syncStatus));

    } catch (error) {
      this.syncStatus.syncInProgress = false;
      this.syncStatus.error = error instanceof Error ? error.message : 'Sync failed';
    }

    return this.syncStatus;
  }

  /**
   * Get sync status
   */
  public getSyncStatus(): LinearSyncStatus {
    return this.syncStatus;
  }
}

// Export singleton instance
export const linearService = new LinearService();