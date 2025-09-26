import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ServerCard } from './ServerCard';
import type { OpenCodeServer } from '../types';

describe('ServerCard', () => {
  const mockServer: OpenCodeServer = {
    id: 'server-123',
    host: 'localhost',
    port: 4096,
    status: 'Running',
    process_id: 1234,
  };

  it('renders server information', () => {
    render(<ServerCard server={mockServer} />);

    expect(screen.getByText('OpenCode Server')).toBeInTheDocument();
    expect(screen.getByText('server-123')).toBeInTheDocument();
    expect(screen.getByText('localhost')).toBeInTheDocument();
    expect(screen.getByText('4096')).toBeInTheDocument();
    expect(screen.getByText('1234')).toBeInTheDocument();
  });

  it('displays correct status indicator', () => {
    render(<ServerCard server={mockServer} />);

    expect(screen.getByText('Running')).toBeInTheDocument();
    // The status indicator should have green color class
    const statusIndicator = screen.getByText('Running').previousElementSibling;
    expect(statusIndicator).toHaveClass('bg-green-500');
  });

  it('shows appropriate action buttons based on status', () => {
    const { rerender } = render(<ServerCard server={mockServer} />);

    // Running server should show Stop and Health Check
    expect(screen.getByTestId('stop-button')).toBeInTheDocument();
    expect(screen.getByTestId('health-check-button')).toBeInTheDocument();
    expect(screen.queryByTestId('restart-button')).not.toBeInTheDocument();

    // Stopped server should show Restart
    const stoppedServer: OpenCodeServer = {
      ...mockServer,
      status: 'Stopped',
    };
    rerender(<ServerCard server={stoppedServer} />);

    expect(screen.queryByTestId('stop-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('health-check-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('restart-button')).toBeInTheDocument();
  });

  it('handles stop button click', () => {
    const handleStop = vi.fn();
    render(<ServerCard server={mockServer} onStop={handleStop} />);

    fireEvent.click(screen.getByTestId('stop-button'));
    expect(handleStop).toHaveBeenCalledTimes(1);
  });

  it('handles health check button click', () => {
    const handleHealthCheck = vi.fn();
    render(<ServerCard server={mockServer} onHealthCheck={handleHealthCheck} />);

    fireEvent.click(screen.getByTestId('health-check-button'));
    expect(handleHealthCheck).toHaveBeenCalledTimes(1);
  });

  it('handles restart button click', () => {
    const stoppedServer: OpenCodeServer = {
      ...mockServer,
      status: 'Stopped',
    };
    const handleRestart = vi.fn();
    render(<ServerCard server={stoppedServer} onRestart={handleRestart} />);

    fireEvent.click(screen.getByTestId('restart-button'));
    expect(handleRestart).toHaveBeenCalledTimes(1);
  });

  it('displays error status correctly', () => {
    const errorServer: OpenCodeServer = {
      ...mockServer,
      status: { Error: 'Connection failed' },
    };
    render(<ServerCard server={errorServer} />);

    expect(screen.getByText('Error: Connection failed')).toBeInTheDocument();
    const statusIndicator = screen.getByText('Error: Connection failed').previousElementSibling;
    expect(statusIndicator).toHaveClass('bg-red-500');
  });

  it('handles missing process_id gracefully', () => {
    const serverWithoutPid: OpenCodeServer = {
      ...mockServer,
      process_id: undefined,
    };
    render(<ServerCard server={serverWithoutPid} />);

    expect(screen.queryByText('PID:')).not.toBeInTheDocument();
  });
});