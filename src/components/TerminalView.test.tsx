import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TerminalView } from './TerminalView';
import type { OrchestratorSession } from '../types';

describe('TerminalView', () => {
  const mockSession: OrchestratorSession = {
    id: 'session-123',
    opencode_server_id: 'server-456',
    status: 'Working',
    created_at: '2024-01-01T00:00:00Z',
    task: {
      id: 'task-789',
      prompt: 'Test task',
      assigned_at: '2024-01-01T00:00:00Z',
    },
  };

  it('renders terminal output', () => {
    const output = 'Hello, World!\nThis is terminal output.';

    render(<TerminalView session={mockSession} output={output} />);

    const terminalOutput = screen.getByTestId('terminal-output');
    expect(terminalOutput).toHaveTextContent('Hello, World!');
    expect(terminalOutput).toHaveTextContent('This is terminal output.');
  });

  it('handles user input', () => {
    const handleInput = vi.fn();

    render(
      <TerminalView
        session={mockSession}
        output=""
        onInput={handleInput}
      />
    );

    const input = screen.getByTestId('terminal-input');
    fireEvent.change(input, { target: { value: 'test command' } });
    fireEvent.keyPress(input, { key: 'Enter', code: 'Enter', charCode: 13 });

    expect(handleInput).toHaveBeenCalledWith('test command');
  });

  it('displays connection status', () => {
    render(<TerminalView session={mockSession} output="" />);

    expect(screen.getByText('Working')).toBeInTheDocument();
    expect(screen.getByText('Session: session-123')).toBeInTheDocument();
  });

  it('shows error states', () => {
    const failedSession: OrchestratorSession = {
      ...mockSession,
      status: { Failed: 'Connection error' },
    };

    render(<TerminalView session={failedSession} output="Error occurred" />);

    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toHaveClass('text-red-500');
  });

  it('supports keyboard shortcuts', () => {
    const handleInput = vi.fn();

    render(
      <TerminalView
        session={mockSession}
        output=""
        onInput={handleInput}
      />
    );

    const input = screen.getByTestId('terminal-input');

    // Test Enter key
    fireEvent.change(input, { target: { value: 'command' } });
    fireEvent.keyPress(input, { key: 'Enter', code: 'Enter', charCode: 13 });

    expect(handleInput).toHaveBeenCalledWith('command');

    // Reset mock
    handleInput.mockClear();

    // Test that other keys don't trigger input
    fireEvent.change(input, { target: { value: 'another' } });
    fireEvent.keyPress(input, { key: 'Tab', code: 'Tab', charCode: 9 });

    expect(handleInput).not.toHaveBeenCalled();
  });

  it('disables input when session is not working', () => {
    const idleSession: OrchestratorSession = {
      ...mockSession,
      status: 'Idle',
    };

    render(
      <TerminalView
        session={idleSession}
        output=""
        onInput={vi.fn()}
      />
    );

    const input = screen.getByTestId('terminal-input');
    expect(input).toBeDisabled();
  });

  it('shows task information when available', () => {
    render(<TerminalView session={mockSession} output="" />);

    expect(screen.getByText('Task: Test task')).toBeInTheDocument();
    expect(screen.getByText(/Started:/)).toBeInTheDocument();
  });
});