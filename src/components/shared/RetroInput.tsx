import React, { useState, KeyboardEvent } from 'react';

export interface RetroInputProps {
  onSubmit: (message: string) => void;
  placeholder?: string;
  disabled?: boolean;
  themeColor?: 'cyan' | 'purple' | 'green' | 'yellow';
  buttonLabel?: string;
  additionalButtons?: Array<{
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary' | 'danger';
    disabled?: boolean;
  }>;
  showSubmitButton?: boolean;
  autoFocus?: boolean;
}

const themeColors = {
  cyan: {
    border: 'border-cyan-500/30',
    bg: 'bg-gray-900/50',
    text: 'text-cyan-100',
    placeholder: 'placeholder-cyan-700',
    button: 'bg-cyan-600 hover:bg-cyan-700',
    focus: 'focus:border-cyan-500 focus:ring-cyan-500'
  },
  purple: {
    border: 'border-purple-500/30',
    bg: 'bg-gray-900/50',
    text: 'text-purple-100',
    placeholder: 'placeholder-purple-700',
    button: 'bg-purple-600 hover:bg-purple-700',
    focus: 'focus:border-purple-500 focus:ring-purple-500'
  },
  green: {
    border: 'border-green-500/30',
    bg: 'bg-gray-900/50',
    text: 'text-green-100',
    placeholder: 'placeholder-green-700',
    button: 'bg-green-600 hover:bg-green-700',
    focus: 'focus:border-green-500 focus:ring-green-500'
  },
  yellow: {
    border: 'border-yellow-500/30',
    bg: 'bg-gray-900/50',
    text: 'text-yellow-100',
    placeholder: 'placeholder-yellow-700',
    button: 'bg-yellow-600 hover:bg-yellow-700',
    focus: 'focus:border-yellow-500 focus:ring-yellow-500'
  }
};

const buttonVariants = {
  primary: (themeColor: string) => themeColors[themeColor as keyof typeof themeColors].button,
  secondary: 'bg-gray-600 hover:bg-gray-700',
  danger: 'bg-red-600 hover:bg-red-700'
};

export const RetroInput: React.FC<RetroInputProps> = ({
  onSubmit,
  placeholder = 'Type your message...',
  disabled = false,
  themeColor = 'cyan',
  buttonLabel = 'Send',
  additionalButtons = [],
  showSubmitButton = true,
  autoFocus = true
}) => {
  const [input, setInput] = useState('');
  const colors = themeColors[themeColor];

  const handleSubmit = () => {
    if (input.trim() && !disabled) {
      onSubmit(input.trim());
      setInput('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className={`border-t ${colors.border} ${colors.bg} p-4`}>
      <div className="flex gap-2">
        {/* Textarea Input */}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          rows={3}
          className={`
            flex-1
            px-3 py-2
            ${colors.bg}
            border ${colors.border}
            rounded
            ${colors.text}
            ${colors.placeholder}
            font-mono text-sm
            ${colors.focus}
            focus:ring-1
            focus:outline-none
            resize-none
            disabled:opacity-50
            disabled:cursor-not-allowed
          `}
        />

        {/* Buttons Column */}
        <div className="flex flex-col gap-2">
          {/* Submit Button */}
          {showSubmitButton && (
            <button
              onClick={handleSubmit}
              disabled={disabled || !input.trim()}
              className={`
                px-4 py-2
                ${colors.button}
                text-white
                font-mono text-sm
                rounded
                transition-colors
                disabled:opacity-50
                disabled:cursor-not-allowed
                whitespace-nowrap
              `}
            >
              {buttonLabel}
            </button>
          )}

          {/* Additional Buttons */}
          {additionalButtons.map((btn, idx) => (
            <button
              key={idx}
              onClick={btn.onClick}
              disabled={btn.disabled || disabled}
              className={`
                px-4 py-2
                ${btn.variant ? buttonVariants[btn.variant](themeColor) : 'bg-gray-600 hover:bg-gray-700'}
                text-white
                font-mono text-sm
                rounded
                transition-colors
                disabled:opacity-50
                disabled:cursor-not-allowed
                whitespace-nowrap
              `}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Keyboard Hint */}
      <div className="mt-2 text-xs text-gray-500 font-mono">
        Press Enter to send • Shift+Enter for new line
      </div>
    </div>
  );
};