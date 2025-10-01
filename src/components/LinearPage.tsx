import React, { useState, useEffect } from 'react';
import { linearService } from '../services/LinearService';
import { pluginService } from '../services/PluginService';
import type {
  LinearIssue,
  LinearUser,
  LinearTeam,
  LinearProject,
  LinearIssueState,
  LinearFilterOptions,
  LinearConfig,
  AgentTaskStatus,
  LinearStats,
  LinearComment
} from '../types/linear';
import {
  Search,
  RefreshCw,
  Settings,
  User,
  Calendar,
  Tag,
  GitBranch,
  Bot,
  CheckCircle,
  Circle,
  AlertCircle,
  Clock,
  ArrowUp,
  ArrowDown,
  Minus,
  Plus,
  ChevronUp,
  Edit2,
  Save,
  X,
  Loader2,
  MessageSquare,
  Send
} from 'lucide-react';
import { TipTapEditor } from './shared/TipTapEditor';
import ReactMarkdown from 'react-markdown';

// Sub-issue modal component
interface SubIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  parentIssue: LinearIssue;
  teams: LinearTeam[];
  teamMembers: LinearUser[];
  workflowStates: LinearIssueState[];
  projects: LinearProject[];
  onSubmit: (data: any) => Promise<void>;
}

const SubIssueModal: React.FC<SubIssueModalProps> = ({
  isOpen,
  onClose,
  parentIssue,
  teams: _teams,
  teamMembers,
  workflowStates: _workflowStates,
  projects,
  onSubmit
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState(3);
  const [estimatePoints, setEstimatePoints] = useState<number | undefined>();
  const [projectId, setProjectId] = useState(parentIssue.project?.id || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const agents = pluginService.getPlugins().filter(p =>
    p.id !== 'linear' && p.capabilities.codeExecution
  );
  const [selectedAgentId, setSelectedAgentId] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        parentId: parentIssue.id,
        title,
        description,
        assigneeId: assigneeId || undefined,
        priority,
        estimate: estimatePoints,
        projectId: projectId || undefined,
        assignToAgent: !!selectedAgentId,
        agentId: selectedAgentId || undefined,
        teamId: parentIssue.team?.id
      });

      // Reset form
      setTitle('');
      setDescription('');
      setAssigneeId('');
      setPriority(3);
      setEstimatePoints(undefined);
      setSelectedAgentId('');
      onClose();
    } catch (error) {
      console.error('Failed to create sub-issue:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white border-4 border-black rounded-lg shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-green-100 to-emerald-100 border-b-2 border-black">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white border-2 border-black rounded shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <Plus className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Create Sub-issue</h2>
                <p className="text-xs text-gray-600">Parent: {parentIssue.identifier} - {parentIssue.title}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/50 rounded transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[calc(90vh-140px)] overflow-y-auto">
          {/* Title */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-white border-2 border-black rounded shadow-[inset_2px_2px_0px_0px_rgba(0,0,0,0.1)] focus:outline-none focus:shadow-[inset_2px_2px_0px_0px_rgba(0,0,0,0.2)]"
              placeholder="Enter sub-issue title"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-white border-2 border-black rounded shadow-[inset_2px_2px_0px_0px_rgba(0,0,0,0.1)] focus:outline-none focus:shadow-[inset_2px_2px_0px_0px_rgba(0,0,0,0.2)] resize-none"
              placeholder="Add a description..."
              rows={4}
            />
          </div>

          {/* Two column layout */}
          <div className="grid grid-cols-2 gap-4">
            {/* Assignee */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Assignee</label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full px-3 py-2 bg-white border-2 border-black rounded shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] focus:outline-none"
              >
                <option value="">Unassigned</option>
                {teamMembers.map(member => (
                  <option key={member.id} value={member.id}>
                    {member.displayName || member.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white border-2 border-black rounded shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] focus:outline-none"
              >
                <option value={1}>🔴 Urgent</option>
                <option value={2}>🟠 High</option>
                <option value={3}>🟡 Medium</option>
                <option value={4}>🔵 Low</option>
              </select>
            </div>

            {/* Project */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Project</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full px-3 py-2 bg-white border-2 border-black rounded shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] focus:outline-none"
              >
                <option value="">No project</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Estimate */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Estimate (points)</label>
              <input
                type="number"
                value={estimatePoints || ''}
                onChange={(e) => setEstimatePoints(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full px-3 py-2 bg-white border-2 border-black rounded shadow-[inset_2px_2px_0px_0px_rgba(0,0,0,0.1)] focus:outline-none focus:shadow-[inset_2px_2px_0px_0px_rgba(0,0,0,0.2)]"
                placeholder="Story points"
                min="0"
              />
            </div>
          </div>

          {/* AI Agent Assignment */}
          {agents.length > 0 && (
            <div className="p-4 bg-yellow-50 border-2 border-black rounded">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                <Bot className="inline w-4 h-4 mr-1" />
                Assign to AI Agent
              </label>
              <select
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="w-full px-3 py-2 bg-white border-2 border-black rounded shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] focus:outline-none"
              >
                <option value="">No AI assignment</option>
                {agents.map(agent => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
              {selectedAgentId && (
                <p className="text-xs text-gray-600 mt-2">
                  The AI agent will automatically start working on this issue once created
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 border-t-2 border-black flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 border-2 border-black rounded hover:translate-y-0.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none transition-all font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || isSubmitting}
            className="px-4 py-2 bg-green-200 border-2 border-black rounded hover:translate-y-0.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Create Sub-issue
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

const LinearPage: React.FC = () => {
  const [config, setConfig] = useState<LinearConfig | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [defaultUsername, setDefaultUsername] = useState('');
  const [configMembers, setConfigMembers] = useState<LinearUser[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const [issues, setIssues] = useState<LinearIssue[]>([]);
  const [teams, setTeams] = useState<LinearTeam[]>([]);
  const [projects, setProjects] = useState<LinearProject[]>([]);
  const [teamMembers, setTeamMembers] = useState<LinearUser[]>([]);
  const [workflowStates, setWorkflowStates] = useState<LinearIssueState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedIssue, setSelectedIssue] = useState<LinearIssue | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [selectedMember, setSelectedMember] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('In Progress');
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState<LinearStats | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingStatus, setIsEditingStatus] = useState(false);
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [comments, setComments] = useState<LinearComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasLoadedStaticData, setHasLoadedStaticData] = useState(false);
  const [showSubIssueModal, setShowSubIssueModal] = useState(false);
  const [subIssueParent, setSubIssueParent] = useState<LinearIssue | null>(null);


  // Initialize and load static data once
  useEffect(() => {
    const savedConfig = linearService.getConfig();
    if (savedConfig) {
      setConfig(savedConfig);
      setApiKey(savedConfig.apiKey);
      setDefaultUsername(savedConfig.defaultUsername || '');
      loadStaticData();
      setIsInitialized(true);
    } else {
      setShowConfig(true);
    }
  }, []);

  // Reload data when filters change (but only after initialization)
  useEffect(() => {
    if (isInitialized && linearService.isConfigured()) {
      loadData({
        teamId: selectedTeam,
        memberId: selectedMember,
        stateName: filterStatus && filterStatus !== 'assigned' && filterStatus !== 'unassigned' ? filterStatus : undefined,
        isUnassigned: filterStatus === 'unassigned',
        isAssigned: filterStatus === 'assigned'
      });
    }
  }, [isInitialized, selectedTeam, selectedMember, filterStatus]);

  // Load comments when an issue is selected
  useEffect(() => {
    if (selectedIssue) {
      loadComments(selectedIssue.id);
    }
  }, [selectedIssue?.id]);

  // Load members when showing config with existing apiKey
  useEffect(() => {
    if (showConfig && apiKey && configMembers.length === 0) {
      fetchConfigMembers();
    }
  }, [showConfig, apiKey]);

  // Load static data (teams, members, states) - only once
  const loadStaticData = async () => {
    if (!linearService.isConfigured() || hasLoadedStaticData) return;

    try {
      const [teamsData, membersData, statesData, projectsData] = await Promise.all([
        linearService.getTeams(),
        linearService.getTeamMembers(),
        linearService.getWorkflowStates(),
        linearService.getProjects()
      ]);

      setTeams(teamsData);
      setProjects(projectsData);
      setWorkflowStates(statesData);

      // Sort team members alphabetically and set them
      const activeMembers = membersData
        .filter(m => m.active)
        .sort((a, b) => {
          const nameA = (a.displayName || a.name).toLowerCase();
          const nameB = (b.displayName || b.name).toLowerCase();
          return nameA.localeCompare(nameB);
        });
      setTeamMembers(activeMembers);

      // Set default filter to configured username if found
      const config = linearService.getConfig();
      if (config.defaultUsername) {
        const defaultMember = activeMembers.find(m =>
          (m.displayName || m.name).toLowerCase().includes(config.defaultUsername!.toLowerCase())
        );
        if (defaultMember) {
          setSelectedMember(defaultMember.id);
        }
      }

      setHasLoadedStaticData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Linear data');
    }
  };

  // Load data with filters
  const loadData = async (filters: { teamId?: string; memberId?: string; stateName?: string; isUnassigned?: boolean; isAssigned?: boolean } = {}) => {
    if (!linearService.isConfigured()) {
      setShowConfig(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Build filter options for the API
      const filterOptions: LinearFilterOptions = {};

      if (filters.teamId) {
        filterOptions.teamIds = [filters.teamId];
      }

      if (filters.isUnassigned) {
        filterOptions.isUnassigned = true;
      } else if (filters.isAssigned) {
        filterOptions.isAssigned = true;
      } else if (filters.memberId) {
        filterOptions.assigneeIds = [filters.memberId];
      }

      if (filters.stateName) {
        // Map state names to filter
        filterOptions.states = [filters.stateName];
      }

      // Only load issues now, static data is loaded separately
      const issuesData = await linearService.getIssues(filterOptions);
      setIssues(issuesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Linear data');
    } finally {
      setLoading(false);
    }
  };

  // Fetch members for config dropdown
  const fetchConfigMembers = async () => {
    if (!apiKey) return;

    setLoadingMembers(true);
    try {
      // Temporarily set the config to use the API key
      const tempConfig: LinearConfig = { apiKey };
      await linearService.saveConfig(tempConfig);

      const users = await linearService.getTeamMembers();
      const activeUsers = users.filter(u => u.active).sort((a, b) => {
        const nameA = (a.displayName || a.name).toLowerCase();
        const nameB = (b.displayName || b.name).toLowerCase();
        return nameA.localeCompare(nameB);
      });
      setConfigMembers(activeUsers);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
      setConfigMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  };

  // Save configuration
  const saveConfig = async () => {
    if (!apiKey) {
      setError('API key is required');
      return;
    }

    const newConfig: LinearConfig = {
      apiKey,
      syncInterval: 5,
      enableWebhooks: false,
      defaultUsername: defaultUsername || undefined
    };

    try {
      await linearService.saveConfig(newConfig);
      setConfig(newConfig);
      setShowConfig(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    }
  };

  // Filter issues (only client-side search since other filters are server-side now)
  const getFilteredIssues = () => {
    let filtered = [...issues];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(issue =>
        issue.title.toLowerCase().includes(query) ||
        issue.identifier.toLowerCase().includes(query) ||
        issue.description?.toLowerCase().includes(query)
      );
    }

    return filtered;
  };


  // Get available agents
  const getAvailableAgents = () => {
    // Get all registered plugins that are coding agents (not Linear itself)
    return pluginService.getPlugins().filter(p =>
      p.id !== 'linear' &&
      p.capabilities.codeExecution
    );
  };

  // Assign to agent
  const assignToAgent = async (issue: LinearIssue, agentId: string) => {
    try {
      await linearService.assignIssueToAgent(issue.id, agentId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign to agent');
    }
  };

  // Open sub-issue modal
  const openSubIssueModal = (parentIssue: LinearIssue) => {
    setSubIssueParent(parentIssue);
    setShowSubIssueModal(true);
  };

  // Create sub-issue
  const createSubIssue = async (data: any) => {
    try {
      await linearService.createSubIssue(data);
      await loadData({
        teamId: selectedTeam,
        memberId: selectedMember,
        stateName: filterStatus && filterStatus !== 'assigned' && filterStatus !== 'unassigned' ? filterStatus : undefined,
        isUnassigned: filterStatus === 'unassigned',
        isAssigned: filterStatus === 'assigned'
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create sub-issue');
      throw err;
    }
  };

  // Load statistics
  const loadStats = async () => {
    try {
      const data = await linearService.getStatistics();
      setStats(data);
      setShowStats(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load statistics');
    }
  };

  // Start editing title
  const startEditingTitle = () => {
    setEditedTitle(selectedIssue?.title || '');
    setIsEditingTitle(true);
  };

  // Start editing description
  const startEditingDescription = () => {
    setEditedDescription(selectedIssue?.description || '');
    setIsEditingDescription(true);
  };

  // Save edits
  const saveEdits = async () => {
    if (!selectedIssue) return;

    setIsSaving(true);
    try {
      const updates: any = {};
      if (isEditingTitle && editedTitle !== selectedIssue.title) {
        updates.title = editedTitle;
      }
      if (isEditingDescription && editedDescription !== selectedIssue.description) {
        updates.description = editedDescription;
      }

      if (Object.keys(updates).length > 0) {
        await linearService.updateIssue(selectedIssue.id, updates);

        // Update the local state
        const updatedIssues = issues.map(issue =>
          issue.id === selectedIssue.id
            ? { ...issue, ...updates }
            : issue
        );
        setIssues(updatedIssues);
        setSelectedIssue({ ...selectedIssue, ...updates });
      }

      setIsEditingTitle(false);
      setIsEditingDescription(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  // Change issue status
  const changeStatus = async (newStateId: string) => {
    if (!selectedIssue || newStateId === selectedIssue.state.id) {
      setIsEditingStatus(false);
      return;
    }

    setIsChangingStatus(true);
    try {
      await linearService.updateIssue(selectedIssue.id, { stateId: newStateId });

      // Find the full state object from our states list
      const newState = workflowStates.find(s => s.id === newStateId);
      if (newState) {
        // Update the local state
        const updatedIssues = issues.map(issue =>
          issue.id === selectedIssue.id
            ? { ...issue, state: newState }
            : issue
        );
        setIssues(updatedIssues);
        setSelectedIssue({ ...selectedIssue, state: newState });
      }
      setIsEditingStatus(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change status');
    } finally {
      setIsChangingStatus(false);
    }
  };

  // Load comments for an issue
  const loadComments = async (issueId: string) => {
    console.log('Loading comments for issue:', issueId);
    setIsLoadingComments(true);
    try {
      const issueComments = await linearService.getIssueComments(issueId);
      console.log('Comments loaded in component:', issueComments);
      setComments(issueComments);
    } catch (err) {
      console.error('Failed to load comments:', err);
    } finally {
      setIsLoadingComments(false);
    }
  };

  // Submit a new comment
  const submitComment = async () => {
    if (!selectedIssue || !newComment.trim()) return;

    setIsSubmittingComment(true);
    try {
      const comment = await linearService.addComment(selectedIssue.id, newComment);
      setComments([...comments, comment]);
      setNewComment('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add comment');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // Cancel editing
  const cancelEditing = () => {
    setIsEditingTitle(false);
    setIsEditingDescription(false);
    setEditedTitle('');
    setEditedDescription('');
  };

  // Get priority icon
  const getPriorityIcon = (priority: number) => {
    switch (priority) {
      case 1: return <ArrowUp className="w-4 h-4 text-red-500" />;
      case 2: return <ArrowUp className="w-4 h-4 text-orange-500" />;
      case 3: return <Minus className="w-4 h-4 text-yellow-500" />;
      case 4: return <ArrowDown className="w-4 h-4 text-blue-500" />;
      default: return <Circle className="w-4 h-4 text-gray-400" />;
    }
  };

  // Get status icon
  const getStatusIcon = (status?: AgentTaskStatus) => {
    if (!status) return null;

    switch (status) {
      case 'queued': return <Clock className="w-4 h-4 text-gray-500" />;
      case 'analyzing': return <Search className="w-4 h-4 text-blue-500 animate-pulse" />;
      case 'in_progress': return <RefreshCw className="w-4 h-4 text-yellow-500 animate-spin" />;
      case 'testing': return <AlertCircle className="w-4 h-4 text-purple-500" />;
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed': return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'blocked': return <AlertCircle className="w-4 h-4 text-orange-500" />;
      default: return null;
    }
  };

  // Configuration screen
  if (showConfig) {
    return (
      <div className="p-6 bg-gradient-to-br from-gray-50 to-white h-full">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-gradient-to-br from-violet-100 to-purple-100 rounded-xl">
                <Settings className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Linear Configuration</h2>
                <p className="text-sm text-gray-600">Connect your Linear workspace</p>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Linear API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 focus:bg-white transition-all duration-200"
                  placeholder="lin_api_..."
                />
                <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                  <span className="text-purple-500">ℹ️</span>
                  Get your API key from Linear Settings → API → Personal API keys
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Default User (Optional)
                </label>
                <div className="flex gap-2">
                  <select
                    value={defaultUsername}
                    onChange={(e) => setDefaultUsername(e.target.value)}
                    disabled={configMembers.length === 0}
                    className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-purple-500 focus:bg-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">None</option>
                    {configMembers.map((member) => (
                      <option key={member.id} value={member.displayName || member.name}>
                        {member.displayName || member.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={fetchConfigMembers}
                    disabled={!apiKey || loadingMembers}
                    className="px-4 py-3 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-xl font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {loadingMembers ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    {loadingMembers ? 'Loading...' : 'Load Users'}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                  <span className="text-purple-500">ℹ️</span>
                  {configMembers.length === 0
                    ? 'Click "Load Users" to fetch team members from Linear'
                    : 'Default member to filter issues by when opening Linear'}
                </p>
              </div>

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  onClick={saveConfig}
                  className="px-6 py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
                >
                  Save Configuration
                </button>
                {config && (
                  <button
                    onClick={() => setShowConfig(false)}
                    className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-all duration-200"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Statistics view
  if (showStats && stats) {
    return (
      <div className="p-6 bg-gradient-to-br from-gray-50 to-white h-full overflow-auto">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-yellow-100 to-orange-100 rounded-xl">
                  <div className="text-2xl">📊</div>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Linear Statistics</h2>
                  <p className="text-sm text-gray-600">Performance metrics and insights</p>
                </div>
              </div>
              <button
                onClick={() => setShowStats(false)}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors duration-200"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-xl border border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-blue-500/20 rounded-lg">
                    <Tag className="w-5 h-5 text-blue-700" />
                  </div>
                  <div className="text-3xl font-bold text-blue-700">{stats.totalIssues}</div>
                </div>
                <div className="text-sm font-medium text-blue-600">Total Issues</div>
              </div>
              <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 p-6 rounded-xl border border-yellow-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-yellow-500/20 rounded-lg">
                    <Bot className="w-5 h-5 text-yellow-700" />
                  </div>
                  <div className="text-3xl font-bold text-yellow-700">{stats.assignedToAgents}</div>
                </div>
                <div className="text-sm font-medium text-yellow-600">Assigned to AI</div>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-xl border border-green-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-green-500/20 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-green-700" />
                  </div>
                  <div className="text-3xl font-bold text-green-700">{stats.completedByAgents}</div>
                </div>
                <div className="text-sm font-medium text-green-600">Completed</div>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-xl border border-purple-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-purple-500/20 rounded-lg">
                    <RefreshCw className="w-5 h-5 text-purple-700" />
                  </div>
                  <div className="text-3xl font-bold text-purple-700">{stats.inProgress}</div>
                </div>
                <div className="text-sm font-medium text-purple-600">In Progress</div>
              </div>
              <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 p-6 rounded-xl border border-cyan-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-cyan-500/20 rounded-lg">
                    <Clock className="w-5 h-5 text-cyan-700" />
                  </div>
                  <div className="text-3xl font-bold text-cyan-700">
                    {stats.averageCompletionTime.toFixed(0)}m
                  </div>
                </div>
                <div className="text-sm font-medium text-cyan-600">Avg Completion</div>
              </div>
              <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 p-6 rounded-xl border border-emerald-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-emerald-500/20 rounded-lg">
                    <ChevronUp className="w-5 h-5 text-emerald-700" />
                  </div>
                  <div className="text-3xl font-bold text-emerald-700">
                    {stats.successRate.toFixed(1)}%
                  </div>
                </div>
                <div className="text-sm font-medium text-emerald-600">Success Rate</div>
              </div>
            </div>

            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Bot className="w-5 h-5 text-purple-600" />
              Agent Performance
            </h3>
            <div className="space-y-3">
              {Object.entries(stats.agentPerformance).map(([agentId, perf]) => (
                <div key={agentId} className="bg-gradient-to-r from-gray-50 to-gray-100 p-4 rounded-xl border border-gray-200 hover:shadow-md transition-all duration-200">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-gray-800 flex items-center gap-2">
                      <div className="p-1.5 bg-purple-100 rounded-lg">
                        <Bot className="w-4 h-4 text-purple-600" />
                      </div>
                      {agentId}
                    </span>
                    <div className="flex gap-6 text-sm">
                      <span className="flex items-center gap-1 text-blue-700 font-medium">
                        <div className="w-2 h-2 bg-blue-500 rounded-full" />
                        Assigned: {perf.assigned}
                      </span>
                      <span className="flex items-center gap-1 text-green-700 font-medium">
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                        Completed: {perf.completed}
                      </span>
                      <span className="flex items-center gap-1 text-red-700 font-medium">
                        <div className="w-2 h-2 bg-red-500 rounded-full" />
                        Failed: {perf.failed}
                      </span>
                      <span className="flex items-center gap-1 text-yellow-700 font-medium">
                        <Clock className="w-3 h-3" />
                        Avg: {perf.averageTime}m
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main UI
  return (
    <div className="flex h-full bg-stone-50">
      {/* Left Panel - Issue List */}
      <div className="w-2/5 bg-white flex flex-col border-r-2 border-black shadow-[4px_0_0_0_rgba(0,0,0,1)]">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-purple-100 to-pink-100 border-b-2 border-black">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white border-2 border-black rounded shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <GitBranch className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 font-mono">Linear Issues</h2>
                <p className="text-xs text-gray-600">Track & Manage</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={loadStats}
                className="p-1.5 bg-yellow-200 border-2 border-black rounded hover:translate-y-0.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none transition-all"
                title="Statistics"
              >
                <div className="text-lg">📊</div>
              </button>
              <button
                onClick={async () => {
                  // Refresh both static data and issues
                  setHasLoadedStaticData(false);
                  await loadStaticData();
                  loadData({
                    teamId: selectedTeam,
                    memberId: selectedMember,
                    stateName: filterStatus && filterStatus !== 'assigned' && filterStatus !== 'unassigned' ? filterStatus : undefined,
                    isUnassigned: filterStatus === 'unassigned',
                    isAssigned: filterStatus === 'assigned'
                  });
                }}
                className="p-1.5 bg-cyan-200 border-2 border-black rounded hover:translate-y-0.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none transition-all"
                disabled={loading}
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 text-black ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setShowConfig(true)}
                className="p-1.5 bg-pink-200 border-2 border-black rounded hover:translate-y-0.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none transition-all"
                title="Settings"
              >
                <Settings className="w-4 h-4 text-black" />
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-600" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search issues..."
              className="w-full pl-10 pr-3 py-2 bg-white border-2 border-black rounded shadow-[inset_2px_2px_0px_0px_rgba(0,0,0,0.1)] focus:outline-none focus:shadow-[inset_2px_2px_0px_0px_rgba(0,0,0,0.2)] text-sm"
            />
          </div>

          {/* Filters */}
          <div className="flex gap-2">
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              disabled={loading}
              className="flex-1 px-2 py-1 bg-white border-2 border-black rounded text-sm disabled:opacity-50 focus:outline-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
            >
              <option value="">All Teams</option>
              {teams.map(team => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>

            <select
              value={selectedMember}
              onChange={(e) => setSelectedMember(e.target.value)}
              disabled={loading}
              className="flex-1 px-2 py-1 bg-white border-2 border-black rounded text-sm disabled:opacity-50 focus:outline-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
            >
              <option value="">All Members</option>
              {teamMembers.map(member => (
                <option key={member.id} value={member.id}>{member.displayName || member.name}</option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              disabled={loading}
              className="flex-1 px-2 py-1 bg-white border-2 border-black rounded text-sm disabled:opacity-50 focus:outline-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
            >
              <option value="">All Status</option>
              <option value="unassigned">Unassigned to Anyone</option>
              <option value="assigned">Assigned to Someone</option>
              {(() => {
                // Deduplicate states by name, keeping one per unique name
                const uniqueStates = new Map<string, LinearIssueState>();
                workflowStates.forEach(state => {
                  if (!uniqueStates.has(state.name)) {
                    uniqueStates.set(state.name, state);
                  }
                });

                // Convert back to array and sort by type
                return Array.from(uniqueStates.values())
                  .sort((a, b) => {
                    // Sort by type order: backlog, unstarted, started, completed, canceled
                    const typeOrder = ['backlog', 'unstarted', 'started', 'completed', 'canceled'];
                    return typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type);
                  })
                  .map(state => (
                    <option key={state.id} value={state.name}>
                      {state.name}
                    </option>
                  ));
              })()}
            </select>
          </div>
        </div>

        {/* Issue List */}
        <div className="flex-1 overflow-auto bg-stone-50">
          {error && (
            <div className="p-4 bg-red-100 border-y-2 border-red-500 text-red-700">
              {error}
            </div>
          )}

          <div className="">
            {getFilteredIssues().map(issue => (
              <div key={issue.id} className="border-b-2 border-black">
                <div
                  className={`p-3 cursor-pointer transition-all ${selectedIssue?.id === issue.id ? 'bg-purple-100 border-l-4 border-purple-600' : 'hover:bg-stone-100'}`}
                  onClick={() => {
                    setSelectedIssue(issue);
                    setNewComment('');
                    setIsEditingStatus(false);
                    setIsEditingTitle(false);
                    setIsEditingDescription(false);
                  }}
                >
                  <div className="flex items-start gap-2">
                    {getPriorityIcon(issue.priority)}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono bg-black text-white px-1.5 py-0.5 rounded">{issue.identifier}</span>
                        {issue.agentAssignment && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-300 border border-black rounded text-xs font-bold">
                            <Bot className="w-3 h-3" />
                            AI
                          </span>
                        )}
                        {getStatusIcon(issue.agentStatus)}
                      </div>
                      <div className="text-sm font-semibold text-gray-900 mb-2">{issue.title}</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="inline-flex items-center px-2 py-0.5 text-xs border border-black rounded font-medium"
                          style={{ backgroundColor: issue.state.color + '30', color: issue.state.color }}
                        >
                          {issue.state.name}
                        </span>
                        {issue.assignee && (
                          <span className="text-xs text-gray-600 flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {issue.assignee.displayName}
                          </span>
                        )}
                        {issue.dueDate && (
                          <span className="text-xs text-orange-600 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(issue.dueDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Issue Details */}
      <div className="flex-1 flex flex-col bg-white">
        {selectedIssue ? (
          <>
            {/* Issue Header */}
            <div className="p-4 bg-gradient-to-r from-stone-100 to-stone-50 border-b-2 border-black">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-mono bg-black text-white px-2 py-1 rounded">{selectedIssue.identifier}</span>
                    {getPriorityIcon(selectedIssue.priority)}
                    {selectedIssue.agentAssignment && (
                      <span className="flex items-center gap-1 px-2 py-1 bg-yellow-300 border-2 border-black rounded text-xs font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                        <Bot className="w-3 h-3" />
                        AI: {selectedIssue.agentAssignment.agentId}
                      </span>
                    )}
                    {getStatusIcon(selectedIssue.agentStatus)}
                  </div>
                  <div className="flex items-center gap-2">
                    {isEditingTitle ? (
                      <input
                        type="text"
                        value={editedTitle}
                        onChange={(e) => setEditedTitle(e.target.value)}
                        className="text-xl font-semibold border-2 border-blue-500 rounded px-2 py-1 flex-1"
                        autoFocus
                      />
                    ) : (
                      <h3 className="text-xl font-semibold">{selectedIssue.title}</h3>
                    )}
                    {!isEditingTitle && !isEditingDescription && (
                      <button
                        onClick={startEditingTitle}
                        className="p-1 hover:bg-stone-100 rounded"
                        title="Edit title"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(isEditingTitle || isEditingDescription) && (
                    <>
                      <button
                        onClick={saveEdits}
                        disabled={isSaving}
                        className="p-2 hover:bg-gray-100 rounded text-green-600 disabled:opacity-50"
                        title="Save changes"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                      <button
                        onClick={cancelEditing}
                        disabled={isSaving}
                        className="p-2 hover:bg-gray-100 rounded text-red-600 disabled:opacity-50"
                        title="Cancel"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  <a
                    href={selectedIssue.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 hover:bg-gray-100 rounded"
                    title="Open in Linear"
                  >
                    🔗
                  </a>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-3">
                {!selectedIssue.agentAssignment && getAvailableAgents().length > 0 && (
                  <button
                    onClick={() => {
                      // For now, assign to the first available agent
                      const firstAgent = getAvailableAgents()[0];
                      if (firstAgent) {
                        assignToAgent(selectedIssue, firstAgent.id);
                      }
                    }}
                    className="px-4 py-2 bg-blue-200 border-2 border-black rounded hover:translate-y-0.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none transition-all text-sm font-bold flex items-center gap-2"
                  >
                    <Bot className="w-4 h-4" />
                    Assign to Agent
                  </button>
                )}
                <button
                  onClick={() => openSubIssueModal(selectedIssue)}
                  className="px-4 py-2 bg-green-200 border-2 border-black rounded hover:translate-y-0.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none transition-all text-sm font-bold flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create Sub-issue
                </button>
              </div>
            </div>

            {/* Issue Content */}
            <div className="flex-1 overflow-auto p-4 bg-white">
              {/* Metadata */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-xs text-gray-500 uppercase">Status</span>
                    {!isEditingTitle && !isEditingDescription && (
                      <button
                        onClick={() => setIsEditingStatus(!isEditingStatus)}
                        className="p-0.5 hover:bg-gray-100 rounded"
                        title="Edit status"
                      >
                        <Edit2 className="w-3 h-3 text-gray-600" />
                      </button>
                    )}
                  </div>
                  <div className="mt-1 relative">
                    {isEditingStatus ? (
                      <>
                        {isChangingStatus && (
                          <div className="absolute inset-0 flex items-center justify-center z-10 bg-white/80 rounded">
                            <Loader2 className="w-4 h-4 animate-spin text-gray-600" />
                          </div>
                        )}
                        <select
                          value={selectedIssue.state.id}
                          onChange={(e) => changeStatus(e.target.value)}
                          onBlur={() => setIsEditingStatus(false)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              setIsEditingStatus(false);
                            }
                          }}
                          disabled={isChangingStatus}
                          className="relative w-full px-3 py-1.5 pr-8 bg-white border-2 border-black rounded shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none transition-all text-sm font-medium disabled:opacity-50 focus:outline-none cursor-pointer appearance-none"
                          style={{
                            backgroundColor: selectedIssue.state.color + '20',
                            color: selectedIssue.state.color,
                            borderColor: selectedIssue.state.color
                          }}
                          autoFocus
                        >
                          {(() => {
                            // Get unique states for this team
                            // Get all workflow states (no team filtering)
                            const teamStates = workflowStates;

                            // Deduplicate by name and sort
                            const uniqueStates = new Map();
                            teamStates.forEach(state => {
                              if (!uniqueStates.has(state.name) || state.id === selectedIssue.state.id) {
                                uniqueStates.set(state.name, state);
                              }
                            });

                            return Array.from(uniqueStates.values())
                              .sort((a, b) => {
                                const typeOrder = ['backlog', 'unstarted', 'started', 'completed', 'canceled'];
                                return typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type);
                              })
                              .map(state => (
                                <option
                                  key={state.id}
                                  value={state.id}
                                >
                                  {state.name}
                                </option>
                              ));
                          })()}
                        </select>
                        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none">
                          <ChevronUp className="w-3 h-3 text-gray-600 -mb-1" />
                          <ArrowDown className="w-3 h-3 text-gray-600" />
                        </div>
                      </>
                    ) : (
                      <div
                        className="inline-block px-3 py-1 rounded-full text-sm font-medium"
                        style={{
                          backgroundColor: selectedIssue.state.color + '20',
                          color: selectedIssue.state.color,
                          border: `2px solid ${selectedIssue.state.color}`
                        }}
                      >
                        {selectedIssue.state.name}
                      </div>
                    )}
                  </div>
                </div>

                {selectedIssue.assignee && (
                  <div>
                    <span className="text-xs text-gray-500 uppercase">Assignee</span>
                    <div className="mt-1 flex items-center gap-2">
                      {selectedIssue.assignee.avatarUrl && (
                        <img
                          src={selectedIssue.assignee.avatarUrl}
                          alt={selectedIssue.assignee.name}
                          className="w-6 h-6 rounded-full"
                        />
                      )}
                      <span className="text-sm text-gray-700">{selectedIssue.assignee.displayName}</span>
                    </div>
                  </div>
                )}

                {selectedIssue.project && (
                  <div>
                    <span className="text-xs text-gray-500 uppercase">Project</span>
                    <div className="mt-1 text-sm text-gray-700">{selectedIssue.project.name}</div>
                  </div>
                )}

                {selectedIssue.dueDate && (
                  <div>
                    <span className="text-xs text-gray-500 uppercase">Due Date</span>
                    <div className="mt-1 text-sm flex items-center gap-1 text-gray-700">
                      <Calendar className="w-4 h-4" />
                      {new Date(selectedIssue.dueDate).toLocaleDateString()}
                    </div>
                  </div>
                )}

                {selectedIssue.estimate && (
                  <div>
                    <span className="text-xs text-gray-500 uppercase">Estimate</span>
                    <div className="mt-1 text-sm text-gray-700">{selectedIssue.estimate} points</div>
                  </div>
                )}

                {selectedIssue.labels.length > 0 && (
                  <div className="col-span-2">
                    <span className="text-xs text-gray-500 uppercase">Labels</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {selectedIssue.labels.map(label => (
                        <span
                          key={label.id}
                          className="px-2 py-0.5 rounded text-xs"
                          style={{ backgroundColor: label.color + '20', color: label.color }}
                        >
                          {label.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="mb-6">
                <div className="flex items-center gap-1 mb-2">
                  <h4 className="text-sm font-semibold text-gray-600 uppercase">Description</h4>
                  {!isEditingTitle && !isEditingDescription && (
                    <button
                      onClick={startEditingDescription}
                      className="p-0.5 hover:bg-gray-100 rounded"
                      title="Edit description"
                    >
                      <Edit2 className="w-3 h-3 text-gray-600" />
                    </button>
                  )}
                </div>
                {isEditingDescription ? (
                  <TipTapEditor
                    content={editedDescription}
                    onChange={(content) => setEditedDescription(content)}
                    placeholder="Add a description..."
                  />
                ) : (
                  selectedIssue.description ? (
                    <div className="prose prose-sm max-w-none text-gray-700">
                      <ReactMarkdown>{selectedIssue.description}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-gray-500 italic text-sm">No description</p>
                  )
                )}
              </div>

              {/* Agent Assignment Details */}
              {selectedIssue.agentAssignment && (
                <div className="mb-6 p-4 bg-gray-100 rounded-lg">
                  <h4 className="text-sm font-semibold text-gray-600 uppercase mb-3">Agent Assignment</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Agent:</span>
                      <span className="text-gray-700">{selectedIssue.agentAssignment.agentId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Status:</span>
                      <span className="flex items-center gap-2">
                        {getStatusIcon(selectedIssue.agentAssignment.status)}
                        <span className="text-gray-700">{selectedIssue.agentAssignment.status}</span>
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Assigned:</span>
                      <span>{new Date(selectedIssue.agentAssignment.assignedAt).toLocaleString()}</span>
                    </div>
                    {selectedIssue.agentAssignment.estimatedTime && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Estimated:</span>
                        <span>{selectedIssue.agentAssignment.estimatedTime} min</span>
                      </div>
                    )}
                    {selectedIssue.agentAssignment.actualTime && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Actual:</span>
                        <span>{selectedIssue.agentAssignment.actualTime} min</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Related Issues */}
              {(selectedIssue.parent || selectedIssue.children?.length) && (
                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-gray-600 uppercase mb-2">Related Issues</h4>
                  {selectedIssue.parent && (
                    <div className="mb-2">
                      <span className="text-xs text-gray-500">Parent:</span>
                      <div className="mt-1 p-2 bg-gray-100 rounded text-sm">
                        <span className="text-gray-500 mr-2">{selectedIssue.parent.identifier}</span>
                        <span className="text-gray-700">{selectedIssue.parent.title}</span>
                      </div>
                    </div>
                  )}
                  {selectedIssue.children?.length && (
                    <div>
                      <span className="text-xs text-gray-500">Sub-issues:</span>
                      <div className="mt-1 space-y-1">
                        {selectedIssue.children.map(child => (
                          <div key={child.id} className="p-2 bg-gray-100 rounded text-sm">
                            <span className="text-gray-500 mr-2">{child.identifier}</span>
                            <span className="text-gray-700">{child.title}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Comments Section */}
              <div className="border-t-2 border-black pt-4">
                <h4 className="text-sm font-semibold text-gray-600 uppercase mb-3 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Comments ({comments.length})
                </h4>

                {/* Comment List */}
                <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                  {isLoadingComments ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                    </div>
                  ) : comments.length === 0 ? (
                    <p className="text-gray-500 text-sm italic py-2">No comments yet</p>
                  ) : (
                    comments.map(comment => {
                      console.log('Rendering comment:', {
                        id: comment.id,
                        user: comment.user,
                        hasUser: !!comment.user,
                        userName: comment.user?.name,
                        userDisplayName: comment.user?.displayName,
                        userEmail: comment.user?.email
                      });
                      return (
                      <div key={comment.id} className="bg-stone-50 border-2 border-black rounded p-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                        <div className="flex items-start gap-2 mb-2">
                          {comment.user?.avatarUrl ? (
                            <img
                              src={comment.user.avatarUrl}
                              alt={comment.user?.name || 'User'}
                              className="w-6 h-6 rounded-full border border-black"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full border border-black bg-gray-200 flex items-center justify-center">
                              <User className="w-3 h-3 text-gray-600" />
                            </div>
                          )}
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-gray-900">
                                {comment.user?.displayName || comment.user?.name || comment.user?.email?.split('@')[0] || 'Linear User'}
                              </span>
                              <span className="text-xs text-gray-500">
                                {new Date(comment.createdAt).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-sm text-gray-700 whitespace-pre-wrap pl-8">
                          {comment.body}
                        </div>
                      </div>
                    );})
                  )}
                </div>

                {/* Add Comment */}
                <div className="flex gap-2">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.metaKey) {
                        submitComment();
                      }
                    }}
                    placeholder="Add a comment... (Cmd+Enter to send)"
                    className="flex-1 px-3 py-2 bg-white border-2 border-black rounded shadow-[inset_2px_2px_0px_0px_rgba(0,0,0,0.1)] focus:outline-none focus:shadow-[inset_2px_2px_0px_0px_rgba(0,0,0,0.2)] text-sm resize-none"
                    rows={3}
                    disabled={isSubmittingComment}
                  />
                  <button
                    onClick={submitComment}
                    disabled={!newComment.trim() || isSubmittingComment}
                    className="px-4 py-2 bg-purple-200 border-2 border-black rounded hover:translate-y-0.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed self-end"
                  >
                    {isSubmittingComment ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-stone-50">
            <div className="text-center">
              <GitBranch className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p className="text-gray-500">Select an issue to view details</p>
            </div>
          </div>
        )}
      </div>

      {/* Sub-issue Modal */}
      {subIssueParent && (
        <SubIssueModal
          isOpen={showSubIssueModal}
          onClose={() => {
            setShowSubIssueModal(false);
            setSubIssueParent(null);
          }}
          parentIssue={subIssueParent}
          teams={teams}
          teamMembers={teamMembers}
          workflowStates={workflowStates}
          projects={projects}
          onSubmit={createSubIssue}
        />
      )}
    </div>
  );
};

export default LinearPage;