import React, { ReactNode } from 'react';

export interface RetroWindowProps {
  title: string;
  themeColor?: 'cyan' | 'purple' | 'green' | 'yellow';
  sessionId?: string;
  status?: string;
  mode?: string;
  permissions?: string;
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  headerButtons?: ReactNode;
  showToolbar?: boolean;
  toolbarItems?: Array<{
    label: string;
    value: string;
    color?: string;
  }>;
  children: ReactNode;
  className?: string;
}

const themeColors = {
  cyan: {
    gradient: 'from-cyan-900/90 via-cyan-800/80 to-cyan-900/90',
    border: 'border-cyan-500/30',
    text: 'text-cyan-400',
    accent: 'text-cyan-300'
  },
  purple: {
    gradient: 'from-purple-900/90 via-purple-800/80 to-purple-900/90',
    border: 'border-purple-500/30',
    text: 'text-purple-400',
    accent: 'text-purple-300'
  },
  green: {
    gradient: 'from-green-900/90 via-green-800/80 to-green-900/90',
    border: 'border-green-500/30',
    text: 'text-green-400',
    accent: 'text-green-300'
  },
  yellow: {
    gradient: 'from-yellow-900/90 via-yellow-800/80 to-yellow-900/90',
    border: 'border-yellow-500/30',
    text: 'text-yellow-400',
    accent: 'text-yellow-300'
  }
};

export const RetroWindow: React.FC<RetroWindowProps> = ({
  title,
  themeColor = 'cyan',
  sessionId,
  status = 'READY',
  mode,
  permissions,
  onClose,
  onMinimize,
  onMaximize,
  headerButtons,
  showToolbar = true,
  toolbarItems,
  children,
  className = ''
}) => {
  const colors = themeColors[themeColor];

  return (
    <div className={`flex flex-col h-full bg-black ${className}`}>
      {/* Window Chrome */}
      <div className={`flex items-center justify-between px-4 py-2 bg-gradient-to-r ${colors.gradient} border-b ${colors.border}`}>
        <div className="flex items-center gap-3">
          {/* Window Buttons */}
          <div className="flex gap-2">
            {onClose && (
              <button
                onClick={onClose}
                className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
                title="Close"
              />
            )}
            {onMinimize && (
              <button
                onClick={onMinimize}
                className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-600 transition-colors"
                title="Minimize"
              />
            )}
            {onMaximize && (
              <button
                onClick={onMaximize}
                className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-600 transition-colors"
                title="Maximize"
              />
            )}
          </div>

          {/* Window Title */}
          <div className={`font-mono text-sm ${colors.text} tracking-wider`}>
            {title}
          </div>

          {/* Session ID */}
          {sessionId && (
            <div className="font-mono text-xs text-gray-500">
              [{sessionId.slice(0, 8)}]
            </div>
          )}
        </div>

        {/* Header Buttons */}
        {headerButtons && (
          <div className="flex items-center gap-2">
            {headerButtons}
          </div>
        )}
      </div>

      {/* Status Toolbar */}
      {showToolbar && (
        <div className={`px-4 py-1 bg-gray-900/80 border-b ${colors.border} font-mono text-xs`}>
          <div className="flex items-center gap-4">
            {/* Default toolbar items */}
            {status && (
              <div className="flex items-center gap-2">
                <span className="text-gray-500">STATUS:</span>
                <span className={colors.accent}>{status}</span>
              </div>
            )}
            {mode && (
              <div className="flex items-center gap-2">
                <span className="text-gray-500">MODE:</span>
                <span className={colors.accent}>{mode}</span>
              </div>
            )}
            {permissions && (
              <div className="flex items-center gap-2">
                <span className="text-gray-500">PERMISSIONS:</span>
                <span className={colors.accent}>{permissions}</span>
              </div>
            )}

            {/* Custom toolbar items */}
            {toolbarItems?.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-gray-500">{item.label}:</span>
                <span className={item.color || colors.accent}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Window Content */}
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
};