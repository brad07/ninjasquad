import React, { useState, useEffect } from 'react';
import { X, FileText, GitBranch, ChevronDown } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';

interface DiffDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  workingDirectory: string;
}

export const DiffDrawer: React.FC<DiffDrawerProps> = ({
  isOpen,
  onClose,
  workingDirectory
}) => {
  const [changedFiles, setChangedFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diffContent, setDiffContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('split');

  // Load changed files when drawer opens
  useEffect(() => {
    if (isOpen) {
      loadChangedFiles();
    }
  }, [isOpen, workingDirectory]);

  // Load diff when file is selected
  useEffect(() => {
    if (selectedFile) {
      loadDiff(selectedFile);
    } else if (changedFiles.length === 0) {
      // Load all diffs if no files changed
      loadDiff(null);
    }
  }, [selectedFile]);

  const loadChangedFiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const files = await invoke<string[]>('get_git_changed_files', {
        workingDir: workingDirectory
      });
      setChangedFiles(files);

      // Auto-select first file if available
      if (files.length > 0) {
        setSelectedFile(files[0]);
      } else {
        // No changed files, load overall diff
        setSelectedFile(null);
        loadDiff(null);
      }
    } catch (err) {
      console.error('Failed to load changed files:', err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const loadDiff = async (filePath: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const diff = await invoke<string>('get_git_diff', {
        filePath,
        workingDir: workingDirectory
      });
      setDiffContent(diff);
    } catch (err) {
      console.error('Failed to load diff:', err);
      setError(String(err));
      setDiffContent('');
    } finally {
      setLoading(false);
    }
  };

  // Parse unified diff format for react-diff-viewer
  const parseDiff = (diffText: string) => {
    if (!diffText) return { oldCode: '', newCode: '' };

    // Simple parser for git diff format
    const lines = diffText.split('\n');
    let oldCode = '';
    let newCode = '';
    let inOld = false;
    let inNew = false;

    for (const line of lines) {
      if (line.startsWith('---')) {
        inOld = true;
        continue;
      }
      if (line.startsWith('+++')) {
        inOld = false;
        inNew = true;
        continue;
      }
      if (line.startsWith('@@')) {
        continue;
      }

      if (line.startsWith('-') && !line.startsWith('---')) {
        oldCode += line.substring(1) + '\n';
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        newCode += line.substring(1) + '\n';
      } else if (line.startsWith(' ')) {
        oldCode += line.substring(1) + '\n';
        newCode += line.substring(1) + '\n';
      }
    }

    return { oldCode, newCode };
  };

  const { oldCode, newCode } = parseDiff(diffContent);

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black bg-opacity-30 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-3/4 max-w-5xl bg-white border-l-4 border-black shadow-[-8px_0px_0px_0px_rgba(0,0,0,1)] z-50 flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 border-b-4 border-black bg-gradient-to-r from-cyan-100 to-blue-100">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <GitBranch className="h-6 w-6 text-blue-700" strokeWidth={2.5} />
              <h2 className="text-xl font-bold text-black">Code Changes</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 bg-red-400 text-black border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:bg-red-500 transition-all rounded"
              title="Close diff viewer"
            >
              <X className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </div>
          {/* Working Directory */}
          <div className="px-6 pb-3">
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-gray-600" />
              <span className="font-medium text-gray-700">Working Directory:</span>
              <span className="font-mono text-gray-900 bg-white px-2 py-1 rounded border border-gray-300">
                {workingDirectory}
              </span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b-2 border-gray-300 bg-gray-50">
          <div className="flex items-center gap-4">
            {/* File Selector */}
            {changedFiles.length > 0 && (
              <div className="relative">
                <select
                  value={selectedFile || ''}
                  onChange={(e) => setSelectedFile(e.target.value || null)}
                  className="appearance-none px-4 py-2 pr-10 bg-white border-2 border-black rounded text-sm font-medium text-gray-900 focus:outline-none focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer"
                >
                  <option value="">All Changes</option>
                  {changedFiles.map(file => (
                    <option key={file} value={file}>
                      {file}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none text-gray-600" />
              </div>
            )}

            {/* Changed files count */}
            <span className="text-sm font-medium text-gray-700">
              {changedFiles.length} {changedFiles.length === 1 ? 'file' : 'files'} changed
            </span>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('split')}
              className={`px-3 py-1.5 text-xs font-bold border-2 border-black transition-all rounded ${
                viewMode === 'split'
                  ? 'bg-cyan-400 text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              Split View
            </button>
            <button
              onClick={() => setViewMode('unified')}
              className={`px-3 py-1.5 text-xs font-bold border-2 border-black transition-all rounded ${
                viewMode === 'unified'
                  ? 'bg-cyan-400 text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              Unified View
            </button>
          </div>
        </div>

        {/* Diff Content */}
        <div className="flex-1 overflow-auto bg-gray-50">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin h-8 w-8 border-4 border-cyan-500 border-t-transparent rounded-full mx-auto mb-3"></div>
                <p className="text-sm text-gray-600 font-medium">Loading diff...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center p-6 bg-red-50 border-2 border-red-600 rounded-lg max-w-md">
                <p className="text-sm text-red-800 font-medium mb-2">Failed to load diff</p>
                <p className="text-xs text-red-600">{error}</p>
                <button
                  onClick={() => loadChangedFiles()}
                  className="mt-4 px-4 py-2 bg-red-400 text-black font-bold text-xs border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:bg-red-500 transition-all rounded"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : !diffContent || (oldCode === '' && newCode === '') ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center p-6">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-600 font-medium">No changes to display</p>
                <p className="text-xs text-gray-500 mt-1">Working directory is clean</p>
              </div>
            </div>
          ) : (
            <div className="p-4">
              <ReactDiffViewer
                oldValue={oldCode}
                newValue={newCode}
                splitView={viewMode === 'split'}
                compareMethod={DiffMethod.WORDS}
                styles={{
                  variables: {
                    dark: {
                      diffViewerBackground: '#ffffff',
                      addedBackground: '#e6ffed',
                      addedColor: '#24292e',
                      removedBackground: '#ffeef0',
                      removedColor: '#24292e',
                      wordAddedBackground: '#acf2bd',
                      wordRemovedBackground: '#fdb8c0',
                      addedGutterBackground: '#cdffd8',
                      removedGutterBackground: '#ffdce0',
                      gutterBackground: '#f6f8fa',
                      gutterBackgroundDark: '#f0f0f0',
                      highlightBackground: '#fffbdd',
                      highlightGutterBackground: '#fff5b1',
                    },
                  },
                  line: {
                    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
                    fontSize: '13px',
                  },
                }}
                leftTitle={selectedFile ? 'Before' : 'Original'}
                rightTitle={selectedFile ? 'After' : 'Modified'}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
};