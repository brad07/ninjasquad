import React from 'react';
import { opencodeSDKService } from '../services/OpenCodeSDKService';
import type { OrchestratorSession } from '../types';

interface SessionDetailsProps {
  session: OrchestratorSession;
}

const SessionDetails: React.FC<SessionDetailsProps> = ({ session }) => {
  // Get the extended session data from SDK service
  const extendedSession = opencodeSDKService.getSDKSession(session.id);

  if (!extendedSession) {
    // This is a Process Mode session
    return (
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Session: {session.id}</h3>
        <div className="space-y-2">
          <div>
            <span className="font-medium text-gray-600 dark:text-gray-400">Status:</span>{' '}
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              session.status === 'Working' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
              session.status === 'Completed' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
              session.status === 'Idle' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
              'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
            }`}>
              {session.status}
            </span>
          </div>
          <div>
            <span className="font-medium text-gray-600 dark:text-gray-400">Server ID:</span>{' '}
            {session.server_id}
          </div>
          {session.task && (
            <div>
              <span className="font-medium text-gray-600 dark:text-gray-400">Task:</span>{' '}
              {session.task.prompt}
            </div>
          )}
        </div>
      </div>
    );
  }

  // This is an SDK session with extended data
  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-4">
        Session: {extendedSession.session.title || session.id}
      </h3>
      <div className="space-y-4">
        <div>
          <span className="font-medium text-gray-600 dark:text-gray-400">Status:</span>{' '}
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            extendedSession.status === 'Working' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
            extendedSession.status === 'Completed' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
            extendedSession.status === 'Idle' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
            'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
          }`}>
            {extendedSession.status}
          </span>
        </div>

        {extendedSession.lastPrompt && (
          <div>
            <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Last Prompt:</h4>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3">
              <pre className="whitespace-pre-wrap text-sm">{extendedSession.lastPrompt}</pre>
            </div>
          </div>
        )}

        {extendedSession.lastResponse && (
          <div>
            <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">AI Response:</h4>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 max-h-96 overflow-y-auto">
              {extendedSession.lastResponse.parts?.map((part: any, index: number) => {
                if (part.type === 'text') {
                  return (
                    <div key={index} className="mb-3">
                      <pre className="whitespace-pre-wrap text-sm font-mono">{part.text}</pre>
                    </div>
                  );
                } else if (part.type === 'tool_use') {
                  return (
                    <div key={index} className="mb-3 bg-gray-100 dark:bg-gray-800 rounded p-2">
                      <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                        Tool: {part.name}
                      </div>
                      <pre className="text-xs overflow-x-auto">
                        {JSON.stringify(part.input, null, 2)}
                      </pre>
                    </div>
                  );
                } else if (part.type === 'tool_result') {
                  return (
                    <div key={index} className="mb-3 bg-green-100 dark:bg-green-900/20 rounded p-2">
                      <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                        Tool Result:
                      </div>
                      <pre className="text-xs overflow-x-auto max-h-32 overflow-y-auto">
                        {typeof part.content === 'string'
                          ? part.content
                          : JSON.stringify(part.content, null, 2)}
                      </pre>
                    </div>
                  );
                }
                return null;
              })}
              {!extendedSession.lastResponse.parts && (
                <pre className="text-sm">
                  {JSON.stringify(extendedSession.lastResponse, null, 2)}
                </pre>
              )}
            </div>
          </div>
        )}

        <div className="text-xs text-gray-500 dark:text-gray-400">
          <div>Session ID: {session.id}</div>
          <div>Directory: {extendedSession.session.directory}</div>
          <div>Created: {new Date(extendedSession.session.time.created).toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
};

export default SessionDetails;