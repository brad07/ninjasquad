import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Plus, Server, Folder, Edit, Trash, Star, Terminal as TerminalIcon, Brain, Monitor, Zap } from 'lucide-react';
import { Button } from '@/components/retroui/Button';
import ClaudeIcon from './icons/ClaudeIcon';
import type { Project } from '../types/project';
import type { OpenCodeServer } from '../types';
import { projectsService } from '../services/ProjectsService';
import { opencodeSDKService } from '../services/OpenCodeSDKService';
import { senseiService } from '../services/SenseiService';
import { pluginService } from '../services/PluginService';
import { claudeCodeSDKService } from '../services/ClaudeCodeSDKService';
import Terminal from './Terminal';
import SenseiPanel from './SenseiPanel';
import SenseiSettings from './SenseiSettings';
import PluginSelector from './PluginSelector';
import ClaudeCodeUI from './plugins/ClaudeCodeUI';
import type { ServerMode } from './ModeToggle';

interface TmuxSession {
  id: string;
  name: string;
  project_path: string;
  created_at: string;
  is_active: boolean;
  window_count: number;
  pane_count: number;
}

interface ProjectViewProps {
  project: Project;
  onBack: () => void;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
}

const ProjectView: React.FC<ProjectViewProps> = ({ project, onBack, onEdit, onDelete }) => {
  const [servers, setServers] = useState<OpenCodeServer[]>([]);
  const [isSpawning, setIsSpawning] = useState(false);
  const [port, setPort] = useState(4097);
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-0');
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState<Record<string, boolean>>({});
  const [sessionIds, setSessionIds] = useState<Record<string, string>>({});
  const [isNewSession, setIsNewSession] = useState<Record<string, boolean>>({});
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showSenseiPanel, setShowSenseiPanel] = useState(true); // Show by default
  const [showSenseiSettings, setShowSenseiSettings] = useState(false);
  const [senseiEnabled, setSenseiEnabled] = useState<Record<string, boolean>>({});
  const [tmuxSessions, setTmuxSessions] = useState<TmuxSession[]>([]);
  const [isSpawningTmux, setIsSpawningTmux] = useState(false);
  const [isSendingCommand, setIsSendingCommand] = useState(false);
  const [activeTmuxSession, setActiveTmuxSession] = useState<TmuxSession | null>(null);
  const [tmuxOutput, setTmuxOutput] = useState<string[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true); // Enable by default
  const [automatedResponses, setAutomatedResponses] = useState(true);
  const [isProcessingLLM, setIsProcessingLLM] = useState(false);
  const [lastProcessedOutput, setLastProcessedOutput] = useState<string>('');
  const [llmProcessingStatus, setLLMProcessingStatus] = useState<string>('');
  const [lastLLMCallTime, setLastLLMCallTime] = useState<number>(0);
  const [rateLimitRemaining, setRateLimitRemaining] = useState<number>(0);
  const [hasProcessedCurrentWorking, setHasProcessedCurrentWorking] = useState<boolean>(false);
  const [hasSeenWorkingState, setHasSeenWorkingState] = useState<boolean>(false);
  const [isOpenCodeGenerating, setIsOpenCodeGenerating] = useState<boolean>(false);
  const [pendingLLMRequest, setPendingLLMRequest] = useState<{ context: string; output: string } | null>(null);
  const [senseiSystemPrompt, setSenseiSystemPrompt] = useState<string>('');
  const [senseiModel, setSenseiModel] = useState<string>('gpt-4o-mini');
  const [senseiTimeout, setSenseiTimeout] = useState<number>(2000); // Default 2 seconds
  const [lastProcessedLineCount, setLastProcessedLineCount] = useState<number>(0);
  const [generationStartIndex, setGenerationStartIndex] = useState<number>(0);
  const [outputAtGenerationStart, setOutputAtGenerationStart] = useState<string[]>([]);
  const [accumulatedGenerationOutput, setAccumulatedGenerationOutput] = useState<string[]>([]);
  const [lastLLMResponse, setLastLLMResponse] = useState<string>('');
  const [isWaitingForResponse, setIsWaitingForResponse] = useState<boolean>(false);
  const [llmResponseHistory, setLLMResponseHistory] = useState<Array<{
    timestamp: Date;
    type: 'request' | 'agent_response' | 'sensei_response';
    content: string;
    approved?: boolean;
  }>>([]);
  const [workingDisappearedTime, setWorkingDisappearedTime] = useState<number | null>(null);
  const [activePlugin, setActivePlugin] = useState<any>(null);
  const [showClaudeCode, setShowClaudeCode] = useState(false);
  const [claudeSessionId, setClaudeSessionId] = useState<string | null>(() => {
    // Restore session ID from localStorage if it exists
    const savedSessionId = localStorage.getItem(`claude-session-${project.id}`);
    if (savedSessionId) {
      console.log('Restored Claude session from localStorage:', savedSessionId);
    }
    return savedSessionId;
  });
  const [activeSessionTab, setActiveSessionTab] = useState<string | null>(null);
  const [pendingSenseiCount, setPendingSenseiCount] = useState<number>(0);
  const autoRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const workingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const latestTmuxOutputRef = useRef<string[]>([]);
  const lastKnownLineCountRef = useRef<number>(0); // Track how many lines we've seen to detect new content
  const lastSeenLinesRef = useRef<number>(0); // Track how many lines we've processed for accumulation
  const LLM_RATE_LIMIT_MS = 60000; // 1 minute between calls

  useEffect(() => {
    // Check active plugin
    const active = pluginService.getActivePlugin();
    setActivePlugin(active);

    loadProjectServers();
    loadTmuxSessions();

    // Load saved system prompt for this project
    const savedPrompt = localStorage.getItem(`sensei_prompt_${project.id}`);
    if (savedPrompt) {
      setSenseiSystemPrompt(savedPrompt);
    }

    // Load saved model for this project
    const savedModel = localStorage.getItem(`sensei_model_${project.id}`);
    if (savedModel) {
      setSenseiModel(savedModel);
    }

    // Load saved timeout for this project
    const savedTimeout = localStorage.getItem(`sensei_timeout_${project.id}`);
    if (savedTimeout) {
      setSenseiTimeout(parseInt(savedTimeout, 10));
    }
  }, [project.id]);

  // Claude Code now directly adds recommendations via senseiService.addClaudeCodeRecommendation()
  // No need for event listener anymore



  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Auto-refresh tmux output
  useEffect(() => {
    if (autoRefresh && activeTmuxSession) {
      autoRefreshIntervalRef.current = setInterval(() => {
        captureTmuxContent(activeTmuxSession.id);
      }, 100);

      return () => {
        if (autoRefreshIntervalRef.current) {
          clearInterval(autoRefreshIntervalRef.current);
          autoRefreshIntervalRef.current = null;
        }
      };
    } else {
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
        autoRefreshIntervalRef.current = null;
      }
    }
  }, [autoRefresh, activeTmuxSession]);

  // Keep track of the FULL output separately from display
  const [fullTmuxOutput, setFullTmuxOutput] = useState<string[]>([]);

  // Always keep the ref updated with latest FULL output
  useEffect(() => {
    latestTmuxOutputRef.current = fullTmuxOutput;
  }, [fullTmuxOutput]);

  // Process output through LLM when automated responses are enabled
  // This now monitors the DISPLAY output (tmuxOutput) for working indicators
  useEffect(() => {
    if (automatedResponses && tmuxOutput.length > 0 && !isProcessingLLM) {
      const currentDisplayOutput = tmuxOutput.join('\n');
      const currentFullOutput = fullTmuxOutput.join('\n');

      // Debug logging
      // Commented out to reduce log noise during auto-refresh (every 100ms)
      // console.log('Automated Response Check:', {
      //   enabled: automatedResponses,
      //   outputLength: tmuxOutput.length,
      //   lastLine: tmuxOutput[tmuxOutput.length - 1],
      //   processing: isProcessingLLM
      // });

      // Check if output has changed
      if (currentFullOutput !== lastProcessedOutput) {
        // Check for OpenCode processing indicators IN THE CURRENT DISPLAY
        // When OpenCode shows "working" or "generating", it means it's STILL processing - we should NOT respond yet
        const hasWorkingIndicator = tmuxOutput.some(line => {
          const lowerLine = line.toLowerCase();
          return (
            // Check for "working" with 0-3 dots
            (lowerLine.includes('working') && (
              lowerLine.includes('working...') ||
              lowerLine.includes('working..') ||
              lowerLine.includes('working.') ||
              lowerLine.includes('working')
            )) ||
            // Check for "generating" with 0-3 dots
            (lowerLine.includes('generating') && (
              lowerLine.includes('generating...') ||
              lowerLine.includes('generating..') ||
              lowerLine.includes('generating.') ||
              lowerLine.includes('generating')
            ))
          );
        });

        // Track working state transitions
        if (hasWorkingIndicator) {
          // Clear any timeout if working reappears
          if (workingTimeoutRef.current) {
            clearTimeout(workingTimeoutRef.current);
            workingTimeoutRef.current = null;
            setWorkingDisappearedTime(null);
            console.log('Working indicator reappeared, cancelled timeout');
          }

          if (!hasSeenWorkingState) {
            setHasSeenWorkingState(true);
            // Reset our tracking when generation starts
            lastSeenLinesRef.current = fullTmuxOutput.length;
            setAccumulatedGenerationOutput([]);
            console.log('[GENERATION START] Starting from line', fullTmuxOutput.length);
          }

          // Simple diff: only process lines we haven't seen yet
          const currentLineCount = fullTmuxOutput.length;
          if (currentLineCount > lastSeenLinesRef.current) {
            // Get ONLY the new lines since last time
            const newLines = fullTmuxOutput.slice(lastSeenLinesRef.current);

            // Process the new lines to extract only the relevant content
            let capturing = false;
            const relevantLines = [];

            for (const line of newLines) {
              // Start capturing AFTER we see the /share line (but not the line itself)
              if (line.includes('/share to create')) {
                capturing = true;
                continue; // Skip this line
              }

              // Stop capturing when we see the Build line
              if (line.match(/Build\s+claude-[\w-]+\s+\(\d{1,2}:\d{2}\s+[AP]M\)/)) {
                capturing = false;
                break; // Stop processing entirely
              }

              // Only capture lines when we're in the capturing state
              if (capturing) {
                // Skip working/generating indicators, empty lines, and user prompts
                const lowerLine = line.toLowerCase();
                const trimmedLine = line.trim();

                // Skip if it's a status indicator
                if (lowerLine.includes('working') || lowerLine.includes('generating')) {
                  continue;
                }

                // Skip if it looks like a user prompt (has timestamp like "(03:07 PM)")
                if (trimmedLine.match(/\(\d{1,2}:\d{2}\s+[AP]M\)$/)) {
                  continue;
                }

                // Skip OpenCode status lines with BUILD AGENT and ANSI sequences
                if (line.includes('BUILD AGENT') ||
                    line.includes('opencode v') ||
                    line.includes('[?7l') ||
                    line.includes('[?7h') ||
                    line.includes('[?25h') ||
                    line.includes('[?25l')) {
                  continue;
                }

                // Skip lines that are just ANSI escape sequences
                if (trimmedLine.match(/^(\[[\?;0-9]+[hlm])+$/)) {
                  continue;
                }

                // Skip empty lines
                if (trimmedLine.length === 0) {
                  continue;
                }

                relevantLines.push(line);
              }
            }

            if (relevantLines.length > 0) {
              setAccumulatedGenerationOutput(prev => {
                // Create a working copy of previous lines
                let workingLines = [...prev];

                for (const newLine of relevantLines) {
                  const trimmedNew = newLine.trim();
                  if (trimmedNew.length === 0) continue;

                  // Check if this new line is an extension of any existing line
                  let isExtension = false;
                  let extensionIndex = -1;

                  for (let i = workingLines.length - 1; i >= 0; i--) {
                    const existingTrimmed = workingLines[i].trim();

                    // Check if the new line starts with the existing line (it's an extension)
                    if (trimmedNew.startsWith(existingTrimmed) && trimmedNew.length > existingTrimmed.length) {
                      isExtension = true;
                      extensionIndex = i;
                      break;
                    }

                    // Check if existing line is a substring of new line (new line completes it)
                    if (existingTrimmed.length > 0 && trimmedNew.includes(existingTrimmed)) {
                      isExtension = true;
                      extensionIndex = i;
                      break;
                    }
                  }

                  if (isExtension && extensionIndex !== -1) {
                    // Replace the partial line with the more complete version
                    workingLines[extensionIndex] = newLine;
                  } else {
                    // Check if this line already exists (exact duplicate)
                    const isDuplicate = workingLines.some(line => line.trim() === trimmedNew);

                    if (!isDuplicate) {
                      // Only add if it's not a partial that will be extended later
                      // Simple heuristic: if it ends mid-word or doesn't end with punctuation and is short
                      const endsNaturally =
                        trimmedNew.match(/[.!?;:,]$/) ||
                        trimmedNew.match(/\)$/) ||
                        trimmedNew.match(/^[A-Z#/*]/) || // Starts like a header/comment/path
                        trimmedNew.length > 60; // Long enough to likely be complete

                      if (endsNaturally || trimmedNew.includes('/') || trimmedNew.match(/^\s*\d+\./)) {
                        workingLines.push(newLine);
                      }
                    }
                  }
                }

                console.log('[DEDUPED]', relevantLines.length, 'input lines to', workingLines.length, 'total lines');
                return workingLines;
              });
            }

            // Update our tracking
            lastSeenLinesRef.current = currentLineCount;
          }
          setIsOpenCodeGenerating(true);
          // Silently skip - OpenCode is still processing
          return;
        }

        // OpenCode is no longer showing working/generating
        // But wait for timeout before considering it done
        if (hasSeenWorkingState && isOpenCodeGenerating && !workingDisappearedTime) {
          const now = Date.now();
          setWorkingDisappearedTime(now);
          console.log(`Working indicator disappeared, starting ${senseiTimeout/1000}s timeout...`);

          // Set timeout to process after configured delay
          workingTimeoutRef.current = setTimeout(() => {
            console.log('Timeout reached, processing output');

            // Use the accumulated generation output
            const finalNewLines = accumulatedGenerationOutput;
            console.log('[TIMEOUT] Processing', finalNewLines.length, 'accumulated lines');

            setIsOpenCodeGenerating(false);
            setHasSeenWorkingState(false);
            setWorkingDisappearedTime(null);

            // Trigger processing - use the latest full output
            const currentFullOutput = latestTmuxOutputRef.current;
            const lastLine = currentFullOutput[currentFullOutput.length - 1] || '';

            // Check for common prompt patterns that indicate waiting for input
            const needsResponse =
              lastLine.endsWith('>') ||
              lastLine.endsWith('$') ||
              lastLine.endsWith('#') ||
              lastLine.endsWith('%') ||
              lastLine.includes('?') ||
              lastLine.includes('(y/n)') ||
              lastLine.includes('Y/N') ||
              lastLine.includes('[y/N]') ||
              lastLine.includes('Enter') ||
              lastLine.includes('password') ||
              lastLine.toLowerCase().includes('continue') ||
              // Check for OpenCode specific prompts
              lastLine.includes('enter send') ||
              lastLine === '' && currentTmuxOutput.length > 1; // Empty line after output might be waiting

            // Now that generation is complete, add the full generated content to history
            if (finalNewLines.length > 0) {
              const fullGenerationOutput = finalNewLines.join('\n');

              // Add the agent's complete response to history
              setLLMResponseHistory(prev => [...prev, {
                timestamp: new Date(),
                type: 'agent_response',
                content: fullGenerationOutput
              }]);

              if (needsResponse) {
                // Request approval using all the new lines that appeared during generation
                console.log('Sending new output for approval:', fullGenerationOutput.substring(0, 200) + '...');
                requestLLMApproval(fullGenerationOutput);
              } else {
                console.log('No response needed. Lines:', finalNewLines.length);
              }

              // Clear accumulated output for next generation
              setAccumulatedGenerationOutput([]);
            } else {
              console.log('No new content generated. Lines:', finalNewLines.length);
            }
          }, senseiTimeout);

          return;
        }

        // If we're waiting for timeout, just return
        if (workingDisappearedTime) {
          return;
        }

      }
    }
  }, [tmuxOutput, fullTmuxOutput, automatedResponses, isProcessingLLM, accumulatedGenerationOutput]);

  const loadProjectServers = async () => {
    try {
      // For now, filter servers by working directory matching project path
      const allServers = await invoke<OpenCodeServer[]>('list_opencode_servers');
      const projectServers = allServers.filter(s => s.working_dir === project.path);
      setServers(projectServers);

      // Auto-select first server if available and create session
      if (projectServers.length > 0 && !activeServerId) {
        const firstServer = projectServers[0];
        setActiveServerId(firstServer.id);

        // Auto-create session for the selected server
        if (!sessionReady[firstServer.id]) {
          await handleCreateSession(firstServer.id);
        }
      }
    } catch (error) {
      console.error('Failed to load project servers:', error);
    }
  };

  const loadTmuxSessions = async () => {
    try {
      const sessions = await invoke<TmuxSession[]>('list_tmux_sessions');
      // Filter sessions for this project
      const projectSessions = sessions.filter(s => s.project_path === project.path);
      setTmuxSessions(projectSessions);

      // Auto-select first session if available
      if (projectSessions.length > 0 && !activeTmuxSession) {
        setActiveTmuxSession(projectSessions[0]);
        await captureTmuxContent(projectSessions[0].id);
      }
    } catch (error) {
      console.error('Failed to load tmux sessions:', error);
    }
  };

  const spawnTmuxSession = async () => {
    // Check if Claude Code is the active plugin
    const active = pluginService.getActivePlugin();
    if (active?.id === 'claude-code') {
      // For Claude Code, open the chat interface instead of tmux
      setShowClaudeCode(true);
      // Initialize Claude Code session if needed
      if (!claudeSessionId) {
        try {
          const sessionId = await claudeCodeSDKService.createSession(undefined, project.path);
          setClaudeSessionId(sessionId);
          // Persist session ID to localStorage
          localStorage.setItem(`claude-session-${project.id}`, sessionId);
          console.log('Saved Claude session to localStorage:', sessionId);

          setActiveSessionTab(`claude-${sessionId}`); // Set active tab for Claude
          setNotification({
            message: `Claude Code session started in ${project.path}`,
            type: 'success'
          });
        } catch (error) {
          console.error('Failed to create Claude Code session:', error);
          setNotification({
            message: `Failed to start Claude Code: ${error}`,
            type: 'error'
          });
        }
      } else {
        // Using existing session (either from state or localStorage)
        setActiveSessionTab(`claude-${claudeSessionId}`); // Activate existing Claude session
        // Ensure it's still registered in the service
        const existingSession = claudeCodeSDKService.getSession(claudeSessionId);
        if (!existingSession) {
          console.log('Re-registering restored session:', claudeSessionId);
          // Create a new session and get the new ID from backend
          const newSessionId = await claudeCodeSDKService.createSession(undefined, project.path);
          setClaudeSessionId(newSessionId);
          // Update localStorage with new session ID
          localStorage.setItem(`claude-session-${project.id}`, newSessionId);
          console.log('Updated session ID from', claudeSessionId, 'to', newSessionId);
          setActiveSessionTab(`claude-${newSessionId}`);
        }
      }
      return;
    }

    // Original tmux logic for OpenCode
    setIsSpawningTmux(true);
    try {
      // Create a new tmux session for this project
      const session = await invoke<TmuxSession>('create_tmux_session', {
        projectPath: project.path
      });

      setTmuxSessions(prev => [...prev, session]);
      setActiveTmuxSession(session);
      setActiveSessionTab(`tmux-${session.id}`); // Set active tab for tmux
      setAutoRefresh(true); // Ensure auto-refresh is enabled

      // Capture initial content
      await captureTmuxContent(session.id);

      setNotification({
        message: `Tmux session created for ${project.name}`,
        type: 'success'
      });

      // Update project last accessed
      projectsService.updateProjectLastAccessed(project.id).catch(error => {
        console.error('Failed to update project last accessed time:', error);
      });
    } catch (error) {
      console.error('Failed to spawn tmux session:', error);
      setNotification({
        message: `Failed to create tmux session: ${error}`,
        type: 'error'
      });
    } finally {
      setIsSpawningTmux(false);
    }
  };

  const captureTmuxContent = async (sessionId: string) => {
    try {
      const rawContent = await invoke<string>('capture_tmux_pane', {
        sessionId
      });

      // Parse the response - it may contain both display and log content
      let displayContent = rawContent;
      let logContent = rawContent;

      if (rawContent.includes('<<<TMUX_SEPARATOR>>>')) {
        const parts = rawContent.split('<<<TMUX_SEPARATOR>>>');
        displayContent = parts[0]; // Current terminal display
        logContent = parts[1]; // Full log for AI context
      }

      // DEBUG: Log raw content during generation
      if (isOpenCodeGenerating || hasSeenWorkingState) {
        console.log('[RAW CAPTURE] Display content:', displayContent.length, 'chars, Log content:', logContent.length, 'chars');
      }

      // Clean up the DISPLAY content for the viewer
      const cleanedDisplayLines = displayContent.split('\n').map(line => {
        // First preserve the line for debugging
        const originalLine = line;

        // Aggressively remove ALL control characters and ANSI codes
        let cleanedLine = line
          .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')  // Remove ANSI escape sequences
          .replace(/\x1b\]0;[^\x07]*\x07/g, '')   // Remove terminal title sequences
          .replace(/\x1b\([AB]/g, '')              // Remove charset switching
          .replace(/\x1b[>=]/g, '')                // Remove keypad modes
          .replace(/\x08/g, '')                    // Remove backspace characters
          .replace(/\x0f/g, '')                    // Remove shift-in
          .replace(/\x0e/g, '')                    // Remove shift-out
          .replace(/[\x00-\x08\x0b-\x0c\x0e-\x1f]/g, '') // Remove other control chars except \n and \r
          .replace(/\r/g, '')                      // Remove carriage returns
          .replace(/[┃║╎╏┆┇┊┋]/g, '')     // Remove fancy vertical lines (not pipe |)
          .replace(/[━╌╍┄┅┈┉]/g, '')       // Remove fancy horizontal lines (not dash -)
          .replace(/[┌┐└┘├┤┬┴┼]/g, '')     // Remove corner and junction characters
          .replace(/[╔╗╚╝╠╣╦╩╬]/g, '')     // Remove double-line box characters
          .replace(/^\s*│\s*/g, '')         // Remove leading pipe with spaces
          .replace(/\s*│\s*$/g, '')         // Remove trailing pipe with spaces
          .trim();                          // Trim whitespace

        return cleanedLine;
      }).filter(line => {
        // Keep all non-empty lines and even empty lines (they might be significant)
        return true;
      });

      // Clean up the LOG content for AI context (if different from display)
      let cleanedLogLines = cleanedDisplayLines;
      if (logContent !== displayContent) {
        cleanedLogLines = logContent.split('\n').map(line => {
          // Same cleanup as display
          let cleanedLine = line
            .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
            .replace(/\x1b\]0;[^\x07]*\x07/g, '')
            .replace(/\x1b\([AB]/g, '')
            .replace(/\x1b[>=]/g, '')
            .replace(/\x08/g, '')
            .replace(/\x0f/g, '')
            .replace(/\x0e/g, '')
            .replace(/[\x00-\x08\x0b-\x0c\x0e-\x1f]/g, '')
            .replace(/\r/g, '')
            .replace(/[┃║╎╏┆┇┊┋]/g, '')
            .replace(/[━╌╍┄┅┈┉]/g, '')
            .replace(/[┌┐└┘├┤┬┴┼]/g, '')
            .replace(/[╔╗╚╝╠╣╦╩╬]/g, '')
            .replace(/^\s*│\s*/g, '')
            .replace(/\s*│\s*$/g, '')
            .trim();
          return cleanedLine;
        }).filter(line => true);
      }

      // Use display lines for the viewer (what's currently shown)
      setTmuxOutput(cleanedDisplayLines.slice(-500)); // Last 500 lines of display

      // Use log lines for AI context (full history)
      setFullTmuxOutput(cleanedLogLines);

      // Check if OpenCode is currently working (check in DISPLAY content - what's currently visible)
      // This is important because the working indicator appears in the current view
      const isWorking = cleanedDisplayLines.some(line =>
        line.includes('Working...') ||
        line.includes('Thinking...') ||
        line.includes('Generating...') ||
        line.includes('Processing...') ||
        line.includes('working...') ||  // lowercase variant
        line.includes('[working]')       // bracketed variant
      );

      // Debug log for working detection
      if (isOpenCodeGenerating || hasSeenWorkingState) {
        console.log('[WORKING CHECK] isWorking:', isWorking, 'in', cleanedDisplayLines.length, 'display lines');
        // Log last few lines to see what we're checking
        const lastFewLines = cleanedDisplayLines.slice(-5);
        console.log('[LAST LINES]:', lastFewLines);
      }

      if (isWorking && !isOpenCodeGenerating) {
        setIsOpenCodeGenerating(true);
        console.log('[WORKING] Detected working indicator - generation started');
      } else if (!isWorking && isOpenCodeGenerating && !isWaitingForResponse) {
        setIsOpenCodeGenerating(false);
        console.log('[WORKING] Working indicator gone - generation may be complete');
      }

      // Detect and extract LLM response if we're waiting for one
      if (isWaitingForResponse && cleanedDisplayLines.length > 0) {
        // Debug logging
        console.log('Looking for LLM response, total lines:', cleanedDisplayLines.length);

        // Strategy: Find where the response starts (first line with '>')
        // and collect everything until the next prompt indicator
        let responseStartIndex = -1;
        let responseEndIndex = cleanedDisplayLines.length;
        let inResponse = false;
        const responseLines: string[] = [];

        for (let i = 0; i < cleanedDisplayLines.length; i++) {
          const line = cleanedDisplayLines[i];
          const trimmedLine = line.trim();

          // Check if this is the start of a response
          if (!inResponse && trimmedLine.startsWith('>')) {
            inResponse = true;
            responseStartIndex = i;
            // Get the content after '>', if any on the first line
            const firstLineContent = line.replace(/^>\s*/, '').trim();
            if (firstLineContent) {
              responseLines.push(firstLineContent);
            }
          } else if (inResponse) {
            // Check if we've hit a new prompt (end of response)
            if (trimmedLine === '>' || trimmedLine === '$' || trimmedLine === '#' || trimmedLine === '%' ||
                trimmedLine.endsWith(' >') || trimmedLine.endsWith(' $') || trimmedLine.endsWith(' #')) {
              responseEndIndex = i;
              break;
            }
            // Otherwise, this is part of the response
            else if (trimmedLine) {
              // For continuation lines, check if they start with '>' and remove it
              if (trimmedLine.startsWith('>')) {
                responseLines.push(trimmedLine.substring(1).trim());
              } else {
                // This is a regular continuation line
                responseLines.push(line);
              }
            }
          }
        }

        // If we found a response, use it
        if (responseLines.length > 0) {
          const responseText = responseLines.join('\n').trim();

          if (responseText && responseText !== lastLLMResponse) {
            console.log('Found complete LLM response:', responseText.substring(0, 200) + '...');
            setLastLLMResponse(responseText);
            setIsWaitingForResponse(false);
            setIsOpenCodeGenerating(false); // Clear the generating flag

            // Don't add to history here - we'll add the complete generation
            // to history after the timeout in the generation monitoring section
            console.log('Agent acknowledged, waiting for generation to complete before adding to history');
          }
        } else {
          console.log('No response found yet, still waiting...');
        }
      }
    } catch (error) {
      console.error('Failed to capture tmux content:', error);
    }
  };

  const killTmuxSession = async (sessionId: string) => {
    try {
      await invoke('kill_tmux_session', { sessionId });
      setTmuxSessions(prev => prev.filter(s => s.id !== sessionId));
      if (activeTmuxSession?.id === sessionId) {
        setActiveTmuxSession(null);
        setTmuxOutput([]);
      }
      setNotification({
        message: 'Tmux session closed',
        type: 'success'
      });
    } catch (error) {
      console.error('Failed to kill tmux session:', error);
      setNotification({
        message: `Failed to close session: ${error}`,
        type: 'error'
      });
    }
  };

  const sendCommandToTmux = async (sessionId: string, command: string) => {
    try {
      // CRITICAL: Reset generation tracking state for the next cycle
      setHasSeenWorkingState(false);
      setIsOpenCodeGenerating(false);
      setWorkingDisappearedTime(null);
      setAccumulatedGenerationOutput([]);
      // Reset the line counter to current position
      lastSeenLinesRef.current = fullTmuxOutput.length;
      console.log('[APPROVAL SENT] Resetting state for next generation cycle');

      await invoke('send_tmux_command', {
        sessionId,
        command
      });
      setNotification({
        message: 'Command sent successfully',
        type: 'success'
      });

      // Refresh content after a short delay
      setTimeout(() => captureTmuxContent(sessionId), 100);
    } catch (error: any) {
      console.error('Failed to send command to tmux:', error);
      setNotification({
        message: `Failed to send command: ${error}`,
        type: 'error'
      });
    }
  };

  const requestLLMApproval = (output: string) => {
    if (!activeTmuxSession || isProcessingLLM) return;

    // Don't request if we already have a pending request
    if (pendingLLMRequest) return;

    // Check rate limit
    const now = Date.now();
    const timeSinceLastCall = now - lastLLMCallTime;

    if (timeSinceLastCall < LLM_RATE_LIMIT_MS) {
      const remainingTime = Math.ceil((LLM_RATE_LIMIT_MS - timeSinceLastCall) / 1000);
      setRateLimitRemaining(remainingTime);
      // Only show in UI, not in console
      setLLMProcessingStatus(`Rate limited (${remainingTime}s)`);

      // Clear the status after a moment
      setTimeout(() => {
        setLLMProcessingStatus('');
        setRateLimitRemaining(0);
      }, 3000);

      return;
    }

    // The output passed here is already the FULL accumulated generation output
    // It contains everything from the "working" indicator onward
    const currentLines = output.split('\n');

    // Filter out OpenCode progress indicators and status lines
    const filteredContent = currentLines.filter(line => {
      // Remove lines with token count/progress indicators like "16K/7%"
      if (line.includes('/share to create a shareable link') && line.match(/\d+K\/\d+%/)) {
        return false;
      }
      // Also filter out standalone progress indicators
      if (line.match(/^\s*\d+K\/\d+%\s*$/)) {
        return false;
      }
      // Filter out build status lines like "Build claude-sonnet-4-20250514 (11:24 AM)"
      if (line.match(/^\s*Build\s+claude-[\w-]+\s+\(\d{1,2}:\d{2}\s+[AP]M\)\s*$/)) {
        return false;
      }
      // Filter out the user's prompt line that starts with ">"
      if (line.trim().startsWith('>')) {
        return false;
      }
      return true;
    });

    const contextLines = filteredContent.join('\n').trim();

    console.log('Preparing LLM context (accumulated output):', {
      totalAccumulatedLines: currentLines.length,
      filteredLines: filteredContent.length,
      contextLength: contextLines.length,
      firstLine: filteredContent[0],
      lastLine: filteredContent[filteredContent.length - 1]
    });

    // Don't create request if context is empty
    if (!contextLines) {
      // Update the output but don't create a request
      setLastProcessedOutput(output);
      return;
    }

    // Set pending request for user approval
    setPendingLLMRequest({ context: contextLines, output: output });
    setLastProcessedOutput(output);
    // DON'T reset snapshot here - we'll reset it when we see the next "working" state
  };

  const processOutputWithLLM = async (contextLines: string) => {
    console.log('processOutputWithLLM called with:', {
      contextLines: contextLines.substring(0, 100) + '...',
      isProcessingLLM,
      activeTmuxSession: !!activeTmuxSession,
      senseiModel
    });

    if (isProcessingLLM || !activeTmuxSession) return;

    const now = Date.now();

    setIsProcessingLLM(true);
    setLastLLMCallTime(now);
    setLLMProcessingStatus('Analyzing terminal output...');

    // Add the agent's request to history
    setLLMResponseHistory(prev => [...prev, {
      timestamp: new Date(),
      type: 'agent_response',
      content: contextLines
    }]);

    try {
      // Log only the actual API call
      console.log('Step 1: Starting OpenAI API call');
      console.log('Parameters:', {
        contextLength: contextLines.length,
        projectPath: project.path,
        projectName: project.name,
        hasCustomPrompt: !!senseiSystemPrompt,
        model: senseiModel
      });
      console.log('[CONTEXT BEING SENT]:', contextLines.substring(0, 500) + '...');

      setLLMProcessingStatus('Sending to Sensei...');

      // Import the processing function
      console.log('Step 2: Importing processTerminalOutput function');
      const { processTerminalOutput } = await import('../api/ai/process-terminal');
      console.log('Step 3: Function imported successfully');

      // Process with LLM using custom prompt and model if available
      console.log('Step 4: Calling processTerminalOutput with model:', senseiModel);
      const llmResponse = await processTerminalOutput(
        contextLines,
        project.path,
        project.name,
        senseiSystemPrompt || undefined,
        senseiModel
      );
      console.log('Step 5: Received LLM response:', llmResponse);

      if (llmResponse && llmResponse.trim()) {
        console.log('Step 6: Processing valid response');
        setLLMProcessingStatus('Executing AI response...');

        // Add Sensei response to history
        setLLMResponseHistory(prev => [...prev, {
          timestamp: new Date(),
          type: 'sensei_response',
          content: llmResponse,
          approved: true
        }]);
        console.log('Step 7: Added to history');

        // Send LLM response to tmux
        console.log('Step 8: Sending to tmux session:', activeTmuxSession.id);
        await sendCommandToTmux(activeTmuxSession.id, llmResponse);
        console.log('Step 9: Command sent to tmux');

        setLLMProcessingStatus('Response sent!');

        // Clear status after a short delay
        setTimeout(() => setLLMProcessingStatus(''), 2000);

        setNotification({
          message: `AI: ${llmResponse.substring(0, 50)}${llmResponse.length > 50 ? '...' : ''}`,
          type: 'success'
        });
        console.log('Step 10: Process complete!');
      } else {
        console.log('Step 6: No response or empty response received');
        setLLMProcessingStatus('No action needed');
        setTimeout(() => setLLMProcessingStatus(''), 1500);
      }
    } catch (error: any) {
      console.error('LLM processing error:', error);
      console.error('Error details:', {
        message: error?.message,
        stack: error?.stack,
        response: error?.response,
        data: error?.response?.data
      });
      setLLMProcessingStatus(`AI processing failed: ${error?.message || 'Unknown error'}`);
      setTimeout(() => setLLMProcessingStatus(''), 3000);
    } finally {
      setIsProcessingLLM(false);
    }
  };

  const sendPromptToTmux = async (sessionId: string, prompt: string) => {
    setIsSendingCommand(true);
    setIsWaitingForResponse(true);
    setIsOpenCodeGenerating(true); // Mark that OpenCode is working
    setLastLLMResponse(''); // Clear previous response

    // CRITICAL: Reset tracking BEFORE sending the command
    lastSeenLinesRef.current = fullTmuxOutput.length;
    setAccumulatedGenerationOutput([]);
    setHasSeenWorkingState(false); // Reset for new generation
    console.log('[COMMAND] Starting generation from line', fullTmuxOutput.length);

    // Add the request to history immediately
    setLLMResponseHistory(prev => [...prev, {
      timestamp: new Date(),
      type: 'request',
      content: prompt
    }]);

    // Set a timeout to stop waiting after 30 seconds
    const timeoutId = setTimeout(() => {
      if (isWaitingForResponse) {
        setIsWaitingForResponse(false);
        setIsOpenCodeGenerating(false);
        setLastLLMResponse('Response timeout - check the terminal output above for the response.');
      }
    }, 30000);

    try {
      // First, clear any existing input and ensure we're at a fresh prompt
      await invoke('send_tmux_keys', {
        sessionId,
        keys: 'C-c'  // Cancel any current input
      });

      // Small delay to ensure prompt is ready
      await new Promise(resolve => setTimeout(resolve, 100));

      // Send the prompt text character by character to avoid issues
      // Split the prompt into smaller chunks to avoid overwhelming tmux
      const chunkSize = 50;
      for (let i = 0; i < prompt.length; i += chunkSize) {
        const chunk = prompt.slice(i, i + chunkSize);
        await invoke('send_tmux_keys', {
          sessionId,
          keys: chunk
        });
        // Small delay between chunks
        if (i + chunkSize < prompt.length) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      // Send Enter to execute
      await invoke('send_tmux_keys', {
        sessionId,
        keys: 'Enter'
      });

      setNotification({
        message: 'Prompt sent to OpenCode',
        type: 'success'
      });

      // Refresh content after a short delay
      setTimeout(() => captureTmuxContent(sessionId), 200);
    } catch (error: any) {
      console.error('Failed to send prompt to tmux:', error);
      setNotification({
        message: `Failed to send prompt: ${error}`,
        type: 'error'
      });
    } finally {
      setIsSendingCommand(false);
    }
  };

  const spawnServerForProject = async () => {
    setIsSpawning(true);
    try {
      // Spawn SDK server with project's working directory
      const newServer = await invoke<OpenCodeServer>('spawn_opencode_sdk_server', {
        port,
        model: selectedModel,
        workingDir: project.path
      });

      // Wait a bit for server to be ready
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Connect SDK client
      await opencodeSDKService.connectToServerWithSDK(port, selectedModel);

      // Reload servers
      await loadProjectServers();

      // Update project last accessed (don't wait for it)
      projectsService.updateProjectLastAccessed(project.id).catch(error => {
        console.error('Failed to update project last accessed time:', error);
      });

      setNotification({
        message: `Server started on port ${port}`,
        type: 'success'
      });

      setPort(port + 1);
      setActiveServerId(newServer.id);

      // Create session for the new server
      await handleCreateSession(newServer.id);
    } catch (error) {
      console.error('Failed to spawn server:', error);
      setNotification({
        message: `Failed to start server: ${error}`,
        type: 'error'
      });
    } finally {
      setIsSpawning(false);
    }
  };

  const handleCreateSession = async (serverId: string): Promise<boolean> => {
    try {
      const server = servers.find(s => s.id === serverId) ||
                     (await invoke<OpenCodeServer[]>('list_opencode_servers')).find(s => s.id === serverId);
      if (!server) return false;

      // Get or create SDK connection
      let sdkServer = opencodeSDKService.listSDKServers().find(s => s.port === server.port);
      if (!sdkServer) {
        sdkServer = await opencodeSDKService.connectToServerWithSDK(server.port, selectedModel);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Check for existing sessions
      const existingSessions = await opencodeSDKService.listSessionsForServer(sdkServer.id);
      let sessionToUse = null;

      if (existingSessions && existingSessions.length > 0) {
        // Connect to existing session
        sessionToUse = await opencodeSDKService.connectToExistingSession(sdkServer.id, existingSessions[0].id);
        setNotification({
          message: `Connected to existing session`,
          type: 'success'
        });
      } else {
        // Create new session
        sessionToUse = await opencodeSDKService.createSDKSession(sdkServer.id);
        setNotification({
          message: `New session created`,
          type: 'success'
        });
      }

      if (sessionToUse) {
        setSessionReady(prev => ({ ...prev, [serverId]: true }));
        setSessionIds(prev => ({ ...prev, [serverId]: sessionToUse.session.id }));
        setIsNewSession(prev => ({ ...prev, [serverId]: !existingSessions || existingSessions.length === 0 }));
      }

      return true;
    } catch (error) {
      console.error('Failed to create session:', error);
      setSessionReady(prev => ({ ...prev, [serverId]: true })); // Mark ready anyway
      return false;
    }
  };

  const handleStopServer = async (serverId: string) => {
    try {
      const server = servers.find(s => s.id === serverId);
      if (!server) return;

      // Disconnect SDK if connected
      const sdkServers = opencodeSDKService.listSDKServers();
      const sdkServer = sdkServers.find(s => s.port === server.port);
      if (sdkServer) {
        await opencodeSDKService.disconnectFromServerWithSDK(sdkServer.id);
      }

      // Stop the server
      await invoke('stop_opencode_server', { server_id: serverId });
      await loadProjectServers();

      if (activeServerId === serverId) {
        setActiveServerId(null);
      }

      setNotification({
        message: 'Server stopped',
        type: 'success'
      });
    } catch (error) {
      console.error('Failed to stop server:', error);
      setNotification({
        message: `Failed to stop server: ${error}`,
        type: 'error'
      });
    }
  };

  const handleToggleFavorite = async () => {
    await projectsService.toggleFavorite(project);
    onEdit({ ...project, isFavorite: !project.isFavorite });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Notification */}
      {notification && (
        <div className={`fixed top-20 right-4 px-4 py-3 rounded-lg shadow-lg z-50 transition-all ${
          notification.type === 'success'
            ? 'bg-green-500 text-white'
            : 'bg-red-500 text-white'
        }`}>
          <span className="font-medium">{notification.message}</span>
        </div>
      )}

      {/* Agent Controls - Combined Plugin Selector and Session Button */}
      <div className="bg-white border-b border-gray-200 p-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <PluginSelector />
            <Button
              onClick={spawnTmuxSession}
              disabled={isSpawningTmux}
              variant="default"
              className="font-bold shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all border-2 border-black bg-yellow-400 hover:bg-yellow-500 text-black"
              title={activePlugin?.id === 'claude-code' ? 'Start Claude Code chat session' : 'Start a new tmux session with OpenCode'}
            >
              <Zap className="mr-2 h-4 w-4" />
              {isSpawningTmux ? 'Starting...' : 'Start Agent Session'}
            </Button>
          </div>
          <div className="text-sm text-gray-600">
            {tmuxSessions.length + (claudeSessionId ? 1 : 0)} agent {(tmuxSessions.length + (claudeSessionId ? 1 : 0)) === 1 ? 'session' : 'sessions'} running
          </div>
        </div>
      </div>

      {/* Agent Session Tabs */}
      {(tmuxSessions.length > 0 || claudeSessionId) && (
        <div className="bg-white border-b border-gray-200 px-4 pt-2 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 overflow-x-auto">
            {/* Claude Code Sessions */}
            {claudeSessionId && (
              <button
                className={`px-4 py-2 rounded-t-lg text-sm flex items-center space-x-2 transition-colors ${
                  activeSessionTab === `claude-${claudeSessionId}`
                    ? 'bg-purple-200 text-black border-2 border-black border-b-0 font-bold'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-purple-50 hover:text-black hover:border-black'
                }`}
                onClick={() => {
                  setActiveSessionTab(`claude-${claudeSessionId}`);
                  setShowClaudeCode(true);
                  setActiveTmuxSession(null);
                }}
              >
                <ClaudeIcon className="text-orange-600" size="16" />
                <span>Claude Code</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // Clear session from localStorage when closing
                    localStorage.removeItem(`claude-session-${project.id}`);
                    console.log('Cleared Claude session from localStorage');
                    setClaudeSessionId(null);
                    setShowClaudeCode(false);
                    if (activeSessionTab === `claude-${claudeSessionId}`) {
                      setActiveSessionTab(null);
                    }
                  }}
                  className="ml-2 text-gray-400 hover:text-red-500"
                  title="Close session"
                >
                  ×
                </button>
              </button>
            )}

            {/* Tmux Sessions */}
            {tmuxSessions.map((session) => (
              <button
                key={session.id}
                className={`px-4 py-2 rounded-t-lg text-sm flex items-center space-x-2 transition-colors ${
                  activeSessionTab === `tmux-${session.id}`
                    ? 'bg-purple-200 text-black border-2 border-black border-b-0 font-bold'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-purple-50 hover:text-black hover:border-black'
                }`}
                onClick={() => {
                  setActiveSessionTab(`tmux-${session.id}`);
                  setActiveTmuxSession(session);
                  setShowClaudeCode(false);
                  setAutoRefresh(true);
                  lastKnownLineCountRef.current = 0;
                  setTmuxOutput([]);
                  setFullTmuxOutput([]);
                  captureTmuxContent(session.id);
                }}
              >
                <img src="/icons/opencode.svg" alt="OpenCode" className="w-4 h-4" />
                <span>{session.id.slice(0, 12)}...</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    killTmuxSession(session.id);
                    if (activeSessionTab === `tmux-${session.id}`) {
                      setActiveSessionTab(null);
                    }
                  }}
                  className="ml-2 text-gray-400 hover:text-red-500"
                  title="Kill session"
                >
                  ×
                </button>
              </button>
            ))}
            </div>
            {/* Sensei Toggle Button */}
            <button
              onClick={() => setShowSenseiPanel(!showSenseiPanel)}
              className={`p-1.5 rounded transition-colors relative ${
                showSenseiPanel
                  ? 'text-blue-400 bg-blue-600/20'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
              title="Toggle Sensei AI Assistant"
            >
              <Brain className="h-4 w-4" />
              {pendingSenseiCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                  {pendingSenseiCount}
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Claude Code UI or Tmux Terminal Display */}
      {showClaudeCode ? (
        <div className="flex-1 flex bg-gray-50 overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
            <ClaudeCodeUI
              plugin={activePlugin}
              session={claudeSessionId ? { id: claudeSessionId, agent_id: claudeSessionId } : undefined}
              server={undefined}
              onCommand={async (cmd) => {
                console.log('Claude Code command:', cmd);
              }}
              config={{
                ...pluginService.getPluginSettings('claude-code'),
                workingDirectory: project.path
              }}
            />
          </div>
          {showSenseiPanel && (
            <div className="w-96 flex-shrink-0 flex flex-col overflow-hidden">
              <SenseiPanel
                serverId="claude-code"
                sessionId={claudeSessionId || ''}
                onPendingCountChange={setPendingSenseiCount}
                onExecuteCommand={(command) => {
                  // Command will be executed through Claude Code
                }}
                onOpenSettings={() => setShowSenseiSettings(true)}
              />
            </div>
          )}
        </div>
      ) : activeTmuxSession ? (
        <div className="flex-1 flex bg-gray-50 overflow-hidden">
          <div className="flex-1 flex flex-col bg-black overflow-hidden">
            <div className="flex items-center justify-between bg-white p-3 border-b border-gray-200">
              <span className="text-green-400 text-sm font-mono">Tmux Session: {activeTmuxSession.id}</span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    setShowSenseiPanel(!showSenseiPanel);
                    setSenseiEnabled(prev => ({ ...prev, tmux: !prev.tmux }));
                    if (!showSenseiPanel && activeServerId && sessionIds[activeServerId]) {
                      // Initialize Sensei for tmux if we have a server session
                      senseiService.toggleSensei(activeServerId, sessionIds[activeServerId], true);
                    }
                  }}
                  className={`p-1.5 rounded transition-colors relative ${
                    showSenseiPanel
                      ? 'text-blue-400 bg-blue-600/20'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                  title="Toggle Sensei AI Assistant"
                >
                  <Brain className="h-4 w-4" />
                  {pendingSenseiCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                      {pendingSenseiCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={`px-3 py-1 rounded text-xs transition-colors ${
                    autoRefresh
                      ? 'bg-blue-500 text-white animate-pulse'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
                </button>
                <button
                  onClick={() => captureTmuxContent(activeTmuxSession.id)}
                  disabled={autoRefresh}
                  className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs transition-colors disabled:opacity-50"
                >
                  Refresh
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto font-mono text-sm text-green-400 bg-black p-4">
              <pre className="whitespace-pre">
                {tmuxOutput.map((line, index) => {
                  const isLastLine = index === tmuxOutput.length - 1;
                  const promptMatch = line.match(/^([>$#%])\s*/);

                  if (isLastLine && promptMatch) {
                    return (
                      <span key={index}>
                        {line}
                        <span className="inline-block w-2 h-4 bg-green-400 animate-pulse" />
                        {index < tmuxOutput.length - 1 ? '\n' : ''}
                      </span>
                    );
                  }

                  return (
                    <span key={index}>
                      {line}
                      {index < tmuxOutput.length - 1 ? '\n' : ''}
                    </span>
                  );
                })}
              </pre>
            </div>
          </div>
          {showSenseiPanel && (
            <div className="w-[600px] flex-shrink-0 overflow-hidden bg-white border-l border-gray-200">
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <Brain className={`h-5 w-5 ${isProcessingLLM ? 'text-yellow-400 animate-pulse' : 'text-blue-400'}`} />
                    <span className="font-medium text-gray-200">Sensei AI Assistant</span>
                    {isProcessingLLM && llmProcessingStatus && (
                      <span className="text-xs text-yellow-400 ml-2">
                        ({llmProcessingStatus})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setShowSenseiSettings(!showSenseiSettings)}
                      className="text-gray-400 hover:text-gray-200 p-1"
                      title="Settings"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setShowSenseiPanel(false)}
                      className="text-gray-400 hover:text-gray-200"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div className="flex-1 p-4 overflow-y-auto">
                  {showSenseiSettings ? (
                    /* Settings Panel */
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-gray-200">Sensei Settings</h3>
                        <button
                          onClick={() => setShowSenseiSettings(false)}
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
                          Back to Assistant
                        </button>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            Model
                          </label>
                          <select
                            value={senseiModel}
                            onChange={(e) => setSenseiModel(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded text-gray-900 text-sm focus:outline-none focus:border-blue-500"
                          >
                            <option value="gpt-4o-mini">GPT-4o Mini (Fast & Cheap)</option>
                            <option value="gpt-4o">GPT-4o (Most Capable)</option>
                            <option value="gpt-4-turbo">GPT-4 Turbo</option>
                            <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Legacy)</option>
                            <option value="gpt-5">GPT-5 (Experimental)</option>
                          </select>
                          <p className="text-xs text-gray-400 mt-2">
                            Select the OpenAI model to use for terminal analysis
                          </p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            Processing Timeout
                          </label>
                          <select
                            value={senseiTimeout}
                            onChange={(e) => setSenseiTimeout(parseInt(e.target.value, 10))}
                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded text-gray-900 text-sm focus:outline-none focus:border-blue-500"
                          >
                            <option value="1000">1 second</option>
                            <option value="2000">2 seconds (Default)</option>
                            <option value="3000">3 seconds</option>
                            <option value="5000">5 seconds</option>
                            <option value="10000">10 seconds</option>
                            <option value="15000">15 seconds</option>
                          </select>
                          <p className="text-xs text-gray-400 mt-2">
                            How long to wait after OpenCode stops showing "working" before processing output
                          </p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            System Prompt
                          </label>
                          <textarea
                            value={senseiSystemPrompt}
                            onChange={(e) => setSenseiSystemPrompt(e.target.value)}
                            placeholder={`Default prompt: You are an AI assistant helping with a development project called "${project.name}" at path "${project.path}".\nYou are monitoring terminal output and should provide helpful responses when needed.`}
                            className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:border-blue-500 resize-y font-mono"
                            rows={10}
                          />
                          <p className="text-xs text-gray-400 mt-2">
                            Customize how the AI assistant responds to terminal output. Leave empty to use the default prompt.
                          </p>
                        </div>

                        <div className="flex space-x-2">
                          <button
                            onClick={() => {
                              // Save to localStorage
                              localStorage.setItem(`sensei_prompt_${project.id}`, senseiSystemPrompt);
                              localStorage.setItem(`sensei_model_${project.id}`, senseiModel);
                              localStorage.setItem(`sensei_timeout_${project.id}`, senseiTimeout.toString());
                              setShowSenseiSettings(false);
                            }}
                            className="flex-1 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm transition-colors"
                          >
                            Save Settings
                          </button>
                          <button
                            onClick={() => {
                              setSenseiSystemPrompt('');
                              setSenseiModel('gpt-4o-mini');
                              setSenseiTimeout(2000);
                              localStorage.removeItem(`sensei_prompt_${project.id}`);
                              localStorage.removeItem(`sensei_model_${project.id}`);
                              localStorage.removeItem(`sensei_timeout_${project.id}`);
                            }}
                            className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded text-sm transition-colors"
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                  <div className="flex flex-col h-full space-y-4">
                    {/* Automated Response Toggle */}
                    <div className="bg-gray-100 rounded-lg p-3">
                      {!import.meta.env.VITE_OPENAI_API_KEY && (
                        <div className="mb-2 p-2 bg-yellow-900/50 border border-yellow-700 rounded">
                          <p className="text-xs text-yellow-400">
                            ⚠️ OpenAI API key not configured. Add VITE_OPENAI_API_KEY to .env.local
                          </p>
                        </div>
                      )}
                      {/* Hidden: Automated Responses toggle - always enabled by default */}
                      {automatedResponses && (
                        <div className="mt-2 text-xs flex items-center">
                          {isProcessingLLM ? (
                            <div className="text-yellow-400 flex items-center">
                              <span className="inline-block w-2 h-2 bg-yellow-400 rounded-full animate-pulse mr-2" />
                              <span className="animate-pulse">{llmProcessingStatus || 'Processing...'}</span>
                            </div>
                          ) : isOpenCodeGenerating ? (
                            <div className="text-blue-400 flex items-center">
                              <span className="inline-block w-2 h-2 bg-blue-400 rounded-full animate-pulse mr-2" />
                              <span className="animate-pulse">
                                Watching generation ({tmuxOutput.length - outputAtGenerationStart.length} lines)
                              </span>
                            </div>
                          ) : (
                            <div className="text-green-400 flex items-center">
                              <span className="inline-block w-2 h-2 bg-green-400 rounded-full mr-2" />
                              <span>Monitoring active</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Pending LLM Request Approval */}
                    {pendingLLMRequest && (
                      <div className="bg-yellow-50 border border-yellow-400 rounded p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-medium text-yellow-400">AI Response Requested</h4>
                          <span className="text-xs text-gray-400">
                            {pendingLLMRequest.context.split('\n').length} lines captured
                          </span>
                        </div>
                        <div className="space-y-2">
                          <p className="text-xs text-gray-300">Context to be sent:</p>
                          <div className="bg-gray-50 rounded p-2 max-h-32 overflow-y-auto">
                            <pre className="text-xs text-gray-400 whitespace-pre-wrap font-mono">
                              {pendingLLMRequest.context}
                            </pre>
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => {
                              processOutputWithLLM(pendingLLMRequest.context);
                              setPendingLLMRequest(null);
                            }}
                            className="flex-1 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded text-sm transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => {
                              setPendingLLMRequest(null);
                              setLastProcessedOutput(pendingLLMRequest.output); // Mark as processed to avoid re-triggering
                            }}
                            className="flex-1 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded text-sm transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    )}

                    {/* AI Prompt Input - Hide when approval is pending, command is running, or waiting for response */}
                    {!pendingLLMRequest && !isSendingCommand && !isWaitingForResponse && !isOpenCodeGenerating && (
                      <div className="space-y-2">
                        <h3 className="text-sm font-medium text-gray-300">AI Assistant</h3>
                        <textarea
                        placeholder="Ask Coding Agent for help with your code or commands..."
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:border-blue-500 resize-none"
                        rows={3}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.currentTarget.value) {
                            // Send as prompt to OpenCode in tmux
                            sendPromptToTmux(activeTmuxSession.id, e.currentTarget.value);
                            e.currentTarget.value = '';
                          }
                        }}
                      />
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-500">Ctrl+Enter to send</span>
                        <button
                          onClick={() => {
                            const textarea = document.querySelector('textarea[placeholder*="Ask Coding Agent"]') as HTMLTextAreaElement;
                            if (textarea && textarea.value) {
                              sendPromptToTmux(activeTmuxSession.id, textarea.value);
                              textarea.value = '';
                            }
                          }}
                          className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded text-sm transition-colors"
                        >
                          Ask Coding Agent
                        </button>
                      </div>
                    </div>
                    )}

                    {/* LLM Response History */}
                    {llmResponseHistory.length > 0 && (
                      <div className="bg-gray-100 rounded-lg p-3 flex-1 flex flex-col min-h-0">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-medium text-gray-300">Conversation History</h3>
                          <button
                            onClick={() => setLLMResponseHistory([])}
                            className="text-xs text-gray-400 hover:text-gray-200"
                          >
                            Clear
                          </button>
                        </div>
                        <div className="space-y-2 flex-1 overflow-y-auto min-h-0">
                          {llmResponseHistory.slice().reverse().map((item, index) => {
                            const borderColor = item.type === 'request' ? 'border-blue-500' :
                                              item.type === 'agent_response' ? 'border-purple-500' :
                                              'border-green-500';
                            const labelColor = item.type === 'request' ? 'text-blue-400' :
                                             item.type === 'agent_response' ? 'text-purple-400' :
                                             'text-green-400';
                            const label = item.type === 'request' ? 'You asked' :
                                        item.type === 'agent_response' ? 'Agent (OpenCode)' :
                                        'Sensei (AI)';

                            return (
                              <div key={index} className={`rounded p-2 text-xs bg-gray-50 border-l-2 ${borderColor}`}>
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center space-x-2">
                                    <span className="text-gray-600">
                                      {item.timestamp.toLocaleTimeString()}
                                    </span>
                                    <span className={`text-[10px] font-medium ${labelColor}`}>
                                      {label}
                                    </span>
                                  </div>
                                  {item.approved && (
                                    <span className="text-green-400 text-[10px]">Approved</span>
                                  )}
                                </div>
                                <div className="text-gray-800 font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                                  {item.content}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : servers.length > 0 ? (
        <div className="flex-1 flex flex-col">
          {/* Server Tabs */}
          <div className="flex bg-white border-b border-gray-200 overflow-x-auto">
            {servers.map((server) => {
              const isActive = activeServerId === server.id;
              const statusColor = server.status === 'Running' ? 'text-green-400' :
                                server.status === 'Starting' ? 'text-yellow-400' :
                                'text-red-400';

              return (
                <div
                  key={server.id}
                  className={`flex items-center px-4 py-3 cursor-pointer border-r border-gray-200 min-w-[200px] transition-colors ${
                    isActive ? 'bg-gray-100 text-gray-900' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                  onClick={async () => {
                    setActiveServerId(server.id);
                    if (!sessionReady[server.id]) {
                      await handleCreateSession(server.id);
                    }
                  }}
                >
                  <Server className="h-4 w-4 mr-2" />
                  <span className="text-sm font-medium">Port {server.port}</span>
                  <span className={`ml-2 text-xs ${statusColor}`}>●</span>
                  <div className="ml-auto flex items-center gap-2">
                    {isActive && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const enabled = !senseiEnabled[server.id];
                            setSenseiEnabled(prev => ({ ...prev, [server.id]: enabled }));
                            setShowSenseiPanel(enabled);
                            if (sessionIds[server.id]) {
                              senseiService.toggleSensei(server.id, sessionIds[server.id], enabled);
                            }
                          }}
                          className={`p-1.5 rounded transition-colors relative ${
                            senseiEnabled[server.id]
                              ? 'text-blue-400 bg-blue-600/20'
                              : 'text-gray-500 hover:text-gray-300'
                          }`}
                          title="Toggle Sensei AI Assistant"
                        >
                          <Brain className="h-4 w-4" />
                          {pendingSenseiCount > 0 && (
                            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                              {pendingSenseiCount}
                            </span>
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStopServer(server.id);
                          }}
                          className="text-gray-400 hover:text-red-400"
                        >
                          ×
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Terminal and Sensei Content */}
          <div className="flex-1 bg-gray-50 flex">
            <div className="flex-1 bg-gray-50">
              {activeServerId && sessionReady[activeServerId] ? (
                <Terminal
                  key={`${activeServerId}-${sessionIds[activeServerId]}`}
                  serverId={activeServerId}
                  sessionId={sessionIds[activeServerId]}
                  isNewSession={isNewSession[activeServerId] || false}
                  onClose={() => setActiveServerId(null)}
                  enableSensei={senseiEnabled[activeServerId] || false}
                />
              ) : activeServerId ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <Server className="h-12 w-12 mx-auto mb-4" />
                  <p>Initializing session...</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <TerminalIcon className="h-12 w-12 mx-auto mb-4" />
                  <p>Select a server to view terminal</p>
                </div>
              </div>
            )}
            </div>
            {showSenseiPanel && (
              <div className="w-96 flex-shrink-0 h-full">
                {activeServerId && sessionIds[activeServerId] ? (
                  <SenseiPanel
                    serverId={activeServerId}
                    sessionId={sessionIds[activeServerId]}
                    onPendingCountChange={setPendingSenseiCount}
                    onExecuteCommand={(command) => {
                      // Command will be executed through event system
                      // Command execution is visible in terminal
                    }}
                    onOpenSettings={() => setShowSenseiSettings(true)}
                  />
                ) : (
                  <div className="flex flex-col h-full bg-white border-l border-gray-200">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                      <div className="flex items-center gap-2">
                        <Brain className="h-5 w-5 text-gray-500" />
                        <span className="font-medium text-gray-200">Sensei AI Assistant</span>
                      </div>
                    </div>
                    <div className="flex-1 flex items-center justify-center p-4">
                      <div className="text-center">
                        <Brain className="h-12 w-12 text-gray-600 mb-3" />
                        <p className="text-gray-400 mb-2">{!activeServerId ? 'No server selected' : 'No session active'}</p>
                        <p className="text-sm text-gray-500">
                          {!activeServerId ? 'Select a server to use Sensei' : 'Create or connect to a session to use Sensei'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <Monitor className="h-16 w-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-700 text-lg mb-2">No agents running for this project</p>
            <p className="text-gray-600 text-sm">Click "Start Agent Session" to launch a new coding agent</p>
          </div>
        </div>
      )}

      {/* Sensei Settings Modal */}
      {showSenseiSettings && (
        <SenseiSettings
          serverId={activeServerId || 'claude-code'}
          sessionId={sessionIds[activeServerId] || claudeSessionId || 'claude-default'}
          isOpen={showSenseiSettings}
          onClose={() => setShowSenseiSettings(false)}
        />
      )}
    </div>
  );
};

export default ProjectView;