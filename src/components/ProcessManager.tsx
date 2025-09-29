import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

export function ProcessManager() {
  const [testServers, setTestServers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadTestServers = async () => {
    try {
      const processes = await invoke('get_ninja_squad_processes');
      setTestServers(processes as any[]);
    } catch (error) {
      console.error('Failed to load test servers:', error);
    }
  };

  const killTestServersOnly = async () => {
    setLoading(true);
    try {
      const count = await invoke('kill_ninja_squad_processes_only');
      console.log(`Killed ${count} test servers`);
      await loadTestServers(); // Reload the list
      alert(`Successfully stopped ${count} OpenCode test server(s)`);
    } catch (error) {
      console.error('Failed to kill test servers:', error);
      alert('Failed to stop test servers: ' + error);
    } finally {
      setLoading(false);
    }
  };

  const killAllOpenCodeProcesses = async () => {
    if (!confirm('⚠️ This will kill ALL OpenCode processes on your system, including any you started manually outside of Ninja Squad. Continue?')) {
      return;
    }

    setLoading(true);
    try {
      const count = await invoke('kill_all_servers');
      console.log(`Killed ${count} OpenCode processes`);
      await loadTestServers(); // Reload the list
      alert(`Stopped ${count} OpenCode process(es) system-wide`);
    } catch (error) {
      console.error('Failed to kill all OpenCode processes:', error);
      alert('Failed to stop processes: ' + error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTestServers();
  }, []);

  return (
    <div className="p-4 bg-gray-700 text-white rounded-lg">
      <h2 className="text-xl font-bold mb-4">OpenCode Test Server Cleanup</h2>

      <div className="mb-4 p-3 bg-blue-900/30 border border-blue-700 rounded">
        <p className="text-sm text-blue-200">
          <strong>What this manages:</strong> Only OpenCode test servers spawned by Ninja Squad for development/testing.
        </p>
        <p className="text-sm text-blue-200 mt-1">
          <strong>What this DOESN'T affect:</strong> Your Claude Code sessions running in terminals - those are completely separate and untouched.
        </p>
      </div>

      <div className="mb-4">
        <h3 className="text-lg mb-2">Active Test Servers:</h3>
        {testServers.length === 0 ? (
          <p className="text-gray-400">No test servers currently running</p>
        ) : (
          <ul className="space-y-2">
            {testServers.map((proc) => (
              <li key={proc.id} className="bg-gray-800 p-2 rounded">
                <span className="font-mono text-sm">
                  PID: {proc.pid} | Port: {proc.port} | Type: {proc.type} | Status: {proc.status}
                </span>
                {proc.working_dir && (
                  <div className="text-xs text-gray-400 mt-1">
                    Dir: {proc.working_dir}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={killTestServersOnly}
          disabled={loading || testServers.length === 0}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded"
        >
          🧹 Clean Up Test Servers
        </button>

        <button
          onClick={killAllOpenCodeProcesses}
          disabled={loading}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 rounded"
        >
          ⚠️ Kill ALL OpenCode (System-wide)
        </button>

        <button
          onClick={loadTestServers}
          disabled={loading}
          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-500 rounded"
        >
          🔄 Refresh
        </button>
      </div>

      <div className="mt-4 p-2 bg-gray-800 rounded text-xs">
        <p className="text-gray-400">
          <strong>💡 Tip:</strong> Claude Code is your AI assistant that runs in your terminal.
          OpenCode test servers are what Ninja Squad spawns for testing. They're completely separate things!
        </p>
      </div>
    </div>
  );
}