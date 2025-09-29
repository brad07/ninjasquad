import React, { useState, useEffect } from 'react';
import { MessageSquare, Save, Power, Hash, AlertTriangle, CheckCircle, Loader2, Key, Eye, EyeOff, Send } from 'lucide-react';
import { slackService } from '../services/SlackService';
import { apiKeyService } from '../services/ApiKeyService';

interface SlackSettingsProps {
  onClose?: () => void;
}

export const SlackSettings: React.FC<SlackSettingsProps> = ({ onClose }) => {
  const [botToken, setBotToken] = useState('');
  const [signingSecret, setSigningSecret] = useState('');
  const [appToken, setAppToken] = useState('');
  const [channel, setChannel] = useState('sensei-approvals');
  const [enabled, setEnabled] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'error'>('disconnected');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [showTokens, setShowTokens] = useState({
    bot: false,
    signing: false,
    app: false
  });
  const [isTesting, setIsTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);

  useEffect(() => {
    // Load saved settings
    const savedChannel = localStorage.getItem('slack-channel') || 'sensei-approvals';
    const savedEnabled = localStorage.getItem('slack-enabled') === 'true';

    // Load credentials
    const savedBotToken = apiKeyService.getKey('slack-bot-token') || '';
    const savedSigningSecret = apiKeyService.getKey('slack-signing-secret') || '';
    const savedAppToken = apiKeyService.getKey('slack-app-token') || '';

    setBotToken(savedBotToken);
    setSigningSecret(savedSigningSecret);
    setAppToken(savedAppToken);
    setChannel(savedChannel);

    // Check if actually connected via the service (this is the source of truth)
    const isConnected = slackService.isEnabled();
    setEnabled(isConnected);
    setConnectionStatus(isConnected ? 'connected' : 'disconnected');
  }, []);

  const handleSaveCredentials = () => {
    // Save credentials to API key service
    apiKeyService.setKey('slack-bot-token', botToken);
    apiKeyService.setKey('slack-signing-secret', signingSecret);
    apiKeyService.setKey('slack-app-token', appToken);
    localStorage.setItem('slack-channel', channel);
  };

  const handleToggleSlack = async () => {
    if (enabled) {
      // Disable Slack
      await slackService.shutdown();
      setEnabled(false);
      setConnectionStatus('disconnected');
      localStorage.setItem('slack-enabled', 'false');
    } else {
      // Enable Slack
      setIsInitializing(true);
      setErrorMessage('');

      // Validate credentials
      if (!botToken || !signingSecret || !appToken) {
        setErrorMessage('Please enter all Slack credentials before connecting.');
        setConnectionStatus('error');
        setIsInitializing(false);
        return;
      }

      try {
        // Save settings first
        handleSaveCredentials();
        localStorage.setItem('slack-enabled', 'true');

        // Initialize Slack with actual credentials
        const success = await slackService.initialize({
          botToken,
          signingSecret,
          appToken,
          channel,
          enabled: true
        });

        if (success) {
          setEnabled(true);
          setConnectionStatus('connected');
        } else {
          setConnectionStatus('error');
          setErrorMessage('Failed to connect. Please check your Slack credentials.');
          localStorage.setItem('slack-enabled', 'false');
        }
      } catch (error) {
        console.error('Failed to initialize Slack:', error);
        setConnectionStatus('error');
        setErrorMessage('Connection failed: ' + (error as Error).message);
        localStorage.setItem('slack-enabled', 'false');
      } finally {
        setIsInitializing(false);
      }
    }
  };

  const toggleShowToken = (field: 'bot' | 'signing' | 'app') => {
    setShowTokens(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleTestSlack = async () => {
    if (!slackService.isEnabled()) {
      setErrorMessage('Please connect to Slack first before testing.');
      return;
    }

    setIsTesting(true);
    setTestSuccess(false);
    setErrorMessage('');

    try {
      const success = await slackService.sendMessage({
        text: '🚀 Ninja Squad SensAI integration is now active!',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '🚀 *Ninja Squad SensAI* integration is now active!\n_I\'ll notify you when AI recommendations need your approval._'
            }
          }
        ]
      });

      if (success) {
        setTestSuccess(true);
        setTimeout(() => setTestSuccess(false), 3000);
      } else {
        setErrorMessage('Failed to send test message. Check console for details.');
      }
    } catch (error) {
      setErrorMessage('Test failed: ' + (error as Error).message);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b-4 border-black bg-gradient-to-r from-blue-100 to-cyan-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-500 p-2 rounded-lg border-2 border-black">
              <MessageSquare className="h-6 w-6 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-black">Slack Integration</h2>
              <p className="text-sm text-gray-600 mt-0.5">
                Connect Slack for notifications and approvals
              </p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-600 hover:text-black transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Connection Status */}
        <div className={`p-4 border-2 rounded-lg ${
          connectionStatus === 'connected' ? 'bg-green-50 border-green-600' :
          connectionStatus === 'error' ? 'bg-red-50 border-red-600' :
          'bg-gray-50 border-gray-400'
        }`}>
          <div className="flex items-center gap-3">
            {isInitializing ? (
              <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
            ) : connectionStatus === 'connected' ? (
              <CheckCircle className="h-5 w-5 text-green-600" strokeWidth={2.5} />
            ) : connectionStatus === 'error' ? (
              <AlertTriangle className="h-5 w-5 text-red-600" strokeWidth={2.5} />
            ) : (
              <Power className="h-5 w-5 text-gray-500" strokeWidth={2.5} />
            )}
            <div className="flex-1">
              <p className="font-bold text-black">
                {isInitializing ? 'Connecting to Slack...' :
                 connectionStatus === 'connected' ? 'Connected to Slack' :
                 connectionStatus === 'error' ? 'Connection Error' :
                 'Not Connected'}
              </p>
              {errorMessage && (
                <p className="text-sm text-red-700 mt-1">{errorMessage}</p>
              )}
              {connectionStatus === 'connected' && (
                <p className="text-sm text-green-700 mt-1">
                  Notifications will be sent to #{channel}
                </p>
              )}
              {testSuccess && (
                <p className="text-sm text-green-700 mt-1 flex items-center gap-1">
                  <CheckCircle className="h-4 w-4" />
                  Test message sent successfully!
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {connectionStatus === 'connected' && (
                <button
                  onClick={handleTestSlack}
                  disabled={isTesting}
                  className="px-4 py-2 font-bold border-2 border-black rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] transition-all bg-blue-400 text-black hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isTesting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Test
                    </>
                  )}
                </button>
              )}
              <button
                onClick={handleToggleSlack}
                disabled={isInitializing}
                className={`px-4 py-2 font-bold border-2 border-black rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] transition-all ${
                  enabled
                    ? 'bg-red-400 text-black hover:bg-red-500'
                    : 'bg-green-400 text-black hover:bg-green-500'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isInitializing ? 'Connecting...' : enabled ? 'Disconnect' : 'Connect to Slack'}
              </button>
            </div>
          </div>
        </div>

        {/* Credentials Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-black uppercase">Slack Credentials</h3>

          {/* Bot Token */}
          <div>
            <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2 uppercase">
              <Key className="h-4 w-4" />
              Bot User OAuth Token
            </label>
            <div className="relative">
              <input
                type={showTokens.bot ? 'text' : 'password'}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="xoxb-your-bot-token"
                className="w-full px-4 py-3 pr-20 bg-white border-2 border-black rounded-lg text-black placeholder-gray-400 focus:border-blue-600 focus:outline-none focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => toggleShowToken('bot')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-600 hover:text-black hover:bg-gray-100 rounded transition-all"
              >
                {showTokens.bot ?
                  <EyeOff className="h-4 w-4" strokeWidth={2} /> :
                  <Eye className="h-4 w-4" strokeWidth={2} />
                }
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-1">Found in OAuth & Permissions section</p>
          </div>

          {/* Signing Secret */}
          <div>
            <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2 uppercase">
              <Key className="h-4 w-4" />
              Signing Secret
            </label>
            <div className="relative">
              <input
                type={showTokens.signing ? 'text' : 'password'}
                value={signingSecret}
                onChange={(e) => setSigningSecret(e.target.value)}
                placeholder="your-signing-secret"
                className="w-full px-4 py-3 pr-20 bg-white border-2 border-black rounded-lg text-black placeholder-gray-400 focus:border-blue-600 focus:outline-none focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => toggleShowToken('signing')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-600 hover:text-black hover:bg-gray-100 rounded transition-all"
              >
                {showTokens.signing ?
                  <EyeOff className="h-4 w-4" strokeWidth={2} /> :
                  <Eye className="h-4 w-4" strokeWidth={2} />
                }
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-1">Found in Basic Information section</p>
          </div>

          {/* App Token */}
          <div>
            <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2 uppercase">
              <Key className="h-4 w-4" />
              App-Level Token
            </label>
            <div className="relative">
              <input
                type={showTokens.app ? 'text' : 'password'}
                value={appToken}
                onChange={(e) => setAppToken(e.target.value)}
                placeholder="xapp-1-your-app-token"
                className="w-full px-4 py-3 pr-20 bg-white border-2 border-black rounded-lg text-black placeholder-gray-400 focus:border-blue-600 focus:outline-none focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => toggleShowToken('app')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-600 hover:text-black hover:bg-gray-100 rounded transition-all"
              >
                {showTokens.app ?
                  <EyeOff className="h-4 w-4" strokeWidth={2} /> :
                  <Eye className="h-4 w-4" strokeWidth={2} />
                }
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-1">Found in Basic Information → App-Level Tokens</p>
          </div>

          {/* Save Credentials Button */}
          <button
            onClick={handleSaveCredentials}
            className="px-4 py-2 bg-blue-500 text-white border-2 border-black rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:bg-blue-600 transition-all font-bold flex items-center gap-2"
          >
            <Save className="h-4 w-4" strokeWidth={2.5} />
            Save Credentials
          </button>
        </div>

        {/* Channel Configuration */}
        <div>
          <label className="block text-sm font-bold text-black mb-2 uppercase">
            Notification Channel
          </label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                <Hash className="h-4 w-4" />
              </div>
              <input
                type="text"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                placeholder="sensei-approvals"
                className="w-full pl-10 pr-4 py-3 bg-white border-2 border-black rounded-lg text-black placeholder-gray-400 focus:border-blue-600 focus:outline-none focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all"
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-600">
            The Slack channel where notifications will be sent
          </p>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 border-2 border-blue-600 rounded-lg p-4">
          <h3 className="font-bold text-black mb-2">Setup Instructions:</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
            <li>Create a Slack App at <span className="font-mono">api.slack.com/apps</span></li>
            <li>Enable Socket Mode in your app settings</li>
            <li>Add Bot Token Scopes: <span className="font-mono">chat:write</span>, <span className="font-mono">commands</span>, <span className="font-mono">app_mentions:read</span></li>
            <li>Install the app to your workspace</li>
            <li>Create an App-Level Token with <span className="font-mono">connections:write</span> scope</li>
            <li>Copy all three tokens and paste them above</li>
            <li>Invite the bot to your channel: <span className="font-mono">/invite @your-bot-name</span></li>
          </ol>
        </div>

        {/* Features */}
        <div className="bg-green-50 border-2 border-green-600 rounded-lg p-4">
          <h3 className="font-bold text-black mb-2">Features When Connected:</h3>
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
            <li>Real-time notifications for SensAI recommendations</li>
            <li>Approve or decline actions directly from Slack</li>
            <li>View confidence levels and suggested commands</li>
            <li>Automatic command execution on approval</li>
            <li>Thread-based conversation tracking</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default SlackSettings;