import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface WorkerStats {
  id: string;
  status: string;
  load: number;
  tasks: number;
}

interface TestStats {
  mode: string;
  running: boolean;
  num_workers: number;
  active_workers: number;
  total_load: number;
  total_tasks: number;
  workers: WorkerStats[];
}

interface TaskResultItem {
  id: string;
  type: string;
  result: string;
  timestamp: Date;
  success: boolean;
}

const DistributedTest: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [numWorkers, setNumWorkers] = useState(3);
  const [stats, setStats] = useState<TestStats | null>(null);
  const [taskResults, setTaskResults] = useState<TaskResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingTask, setProcessingTask] = useState(false);

  useEffect(() => {
    if (isRunning) {
      const interval = setInterval(updateStats, 2000);
      return () => clearInterval(interval);
    }
  }, [isRunning]);

  const updateStats = async () => {
    try {
      const stats = await invoke<TestStats>('get_local_test_stats');
      setStats(stats);
      setIsRunning(stats.running);
    } catch (err) {
      console.error('Failed to get stats:', err);
    }
  };

  const startTestMode = async () => {
    setLoading(true);
    setError(null);
    try {
      await invoke('start_local_test_mode', { numWorkers });
      setIsRunning(true);
      await updateStats();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const stopTestMode = async () => {
    setLoading(true);
    try {
      await invoke('stop_local_test_mode');
      setIsRunning(false);
      setStats(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const runTestTask = async (taskType: string) => {
    setProcessingTask(true);
    try {
      const result = await invoke<string>('simulate_distributed_task', { taskType });

      // Parse the result to extract meaningful information
      let parsedResult: any;
      try {
        parsedResult = JSON.parse(result.replace(/^Task \w+ completed: /, ''));
      } catch {
        parsedResult = result;
      }

      // Add to results history
      const newResult: TaskResultItem = {
        id: Date.now().toString(),
        type: taskType,
        result: typeof parsedResult === 'object' ? JSON.stringify(parsedResult, null, 2) : parsedResult,
        timestamp: new Date(),
        success: true
      };

      setTaskResults(prev => [newResult, ...prev.slice(0, 9)]); // Keep last 10 results
    } catch (err) {
      const newResult: TaskResultItem = {
        id: Date.now().toString(),
        type: taskType,
        result: String(err),
        timestamp: new Date(),
        success: false
      };
      setTaskResults(prev => [newResult, ...prev.slice(0, 9)]);
    } finally {
      setProcessingTask(false);
    }
  };

  const clearResults = () => {
    setTaskResults([]);
  };

  return (
    <div className="p-6 bg-gray-900 text-gray-100 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-blue-400">
          🧪 Distributed Mode - Local Test
        </h1>

        {/* Control Panel */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Test Control</h2>

          <div className="flex items-center space-x-4 mb-4">
            <div className="flex items-center space-x-2">
              <label htmlFor="workers" className="text-sm">Workers:</label>
              <input
                id="workers"
                type="number"
                min="1"
                max="10"
                value={numWorkers}
                onChange={(e) => setNumWorkers(parseInt(e.target.value))}
                disabled={isRunning}
                className="w-20 px-2 py-1 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>

            {!isRunning ? (
              <button
                onClick={startTestMode}
                disabled={loading}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50"
              >
                🚀 Start Test Mode
              </button>
            ) : (
              <button
                onClick={stopTestMode}
                disabled={loading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
              >
                🛑 Stop Test Mode
              </button>
            )}

            <button
              onClick={updateStats}
              disabled={!isRunning}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
            >
              🔄 Refresh Stats
            </button>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-500 text-red-400 px-4 py-2 rounded-lg">
              {error}
            </div>
          )}
        </div>

        {/* Test Tasks */}
        {isRunning && (
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Simulate Tasks</h2>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <button
                onClick={() => runTestTask('create_session')}
                disabled={processingTask}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                📦 Create Session
              </button>

              <button
                onClick={() => runTestTask('run_command')}
                disabled={processingTask}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ⚡ Run Command
              </button>

              <button
                onClick={() => runTestTask('health_check')}
                disabled={processingTask}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                💚 Health Check
              </button>
            </div>

            {processingTask && (
              <div className="bg-gray-700 p-4 rounded-lg mb-4">
                <div className="flex items-center space-x-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                  <span className="text-gray-300">Processing task...</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Task Results History */}
        {isRunning && taskResults.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Task Results History</h2>
              <button
                onClick={clearResults}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
              >
                Clear History
              </button>
            </div>

            <div className="space-y-3">
              {taskResults.map((result) => (
                <div
                  key={result.id}
                  className={`bg-gray-700 p-4 rounded-lg ${
                    result.success ? 'border-l-4 border-green-500' : 'border-l-4 border-red-500'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-3">
                      <span className="text-sm font-semibold text-blue-400">
                        {result.type === 'create_session' && '📦 Create Session'}
                        {result.type === 'run_command' && '⚡ Run Command'}
                        {result.type === 'health_check' && '💚 Health Check'}
                      </span>
                      <span className="text-xs text-gray-400">
                        {result.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${
                      result.success ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
                    }`}>
                      {result.success ? 'Success' : 'Failed'}
                    </span>
                  </div>

                  <div className="bg-gray-900 p-3 rounded font-mono text-xs overflow-x-auto">
                    <pre className="whitespace-pre-wrap">{result.result}</pre>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Statistics Dashboard */}
        {stats && stats.running && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">System Statistics</h2>

            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-700 p-4 rounded-lg">
                <div className="text-2xl font-bold text-green-400">{stats.num_workers}</div>
                <div className="text-sm text-gray-400">Total Workers</div>
              </div>

              <div className="bg-gray-700 p-4 rounded-lg">
                <div className="text-2xl font-bold text-blue-400">{stats.active_workers}</div>
                <div className="text-sm text-gray-400">Active Workers</div>
              </div>

              <div className="bg-gray-700 p-4 rounded-lg">
                <div className="text-2xl font-bold text-yellow-400">
                  {(stats.total_load * 100).toFixed(0)}%
                </div>
                <div className="text-sm text-gray-400">Total Load</div>
              </div>

              <div className="bg-gray-700 p-4 rounded-lg">
                <div className="text-2xl font-bold text-purple-400">{stats.total_tasks}</div>
                <div className="text-sm text-gray-400">Active Tasks</div>
              </div>
            </div>

            {/* Workers List */}
            <h3 className="text-lg font-semibold mb-3">Worker Details</h3>
            <div className="space-y-2">
              {stats.workers.map((worker) => (
                <div key={worker.id} className="bg-gray-700 p-4 rounded-lg flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${
                      worker.status === 'Online' ? 'bg-green-500' :
                      worker.status === 'Busy' ? 'bg-yellow-500' : 'bg-red-500'
                    }`} />
                    <span className="font-medium">{worker.id}</span>
                  </div>

                  <div className="flex items-center space-x-6">
                    <div className="text-sm">
                      <span className="text-gray-400">Status:</span>{' '}
                      <span className={
                        worker.status === 'Online' ? 'text-green-400' :
                        worker.status === 'Busy' ? 'text-yellow-400' : 'text-red-400'
                      }>
                        {worker.status}
                      </span>
                    </div>

                    <div className="text-sm">
                      <span className="text-gray-400">Load:</span>{' '}
                      <span className="text-blue-400">{(worker.load * 100).toFixed(0)}%</span>
                    </div>

                    <div className="text-sm">
                      <span className="text-gray-400">Tasks:</span>{' '}
                      <span className="text-purple-400">{worker.tasks}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* How It Works */}
        <div className="bg-gray-800 rounded-lg p-6 mt-6">
          <h2 className="text-xl font-semibold mb-4">📚 How Local Test Mode Works</h2>

          <div className="space-y-3 text-gray-300">
            <p>
              <strong className="text-blue-400">1. Start Test Mode:</strong> Creates N simulated workers
              on your local machine, all connecting to an in-memory message queue.
            </p>

            <p>
              <strong className="text-blue-400">2. Workers Poll Queue:</strong> Each worker continuously
              checks for new tasks in the queue, simulating distributed behavior.
            </p>

            <p>
              <strong className="text-blue-400">3. Task Distribution:</strong> When you simulate a task,
              it's added to the queue and picked up by an available worker.
            </p>

            <p>
              <strong className="text-blue-400">4. Results Return:</strong> Workers process tasks and
              return results through the queue, just like in a real distributed system.
            </p>

            <p className="text-sm text-gray-400 mt-4">
              💡 This mode helps you test the distributed architecture without needing multiple machines
              or a Redis server. Perfect for development and testing!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DistributedTest;