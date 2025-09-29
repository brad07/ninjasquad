import React from 'react';
import { Button } from '@/components/retroui/Button';
import { Badge } from '@/components/retroui/Badge';
import { Input } from '@/components/retroui/Input';
import { Alert } from '@/components/retroui/Alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/retroui/DropdownMenu';
import { AlertCircle, Zap, Rocket, Shield, Star, ChevronDown, Settings, User, LogOut, CreditCard } from 'lucide-react';

const RetroUIShowcase: React.FC = () => {
  const [selectedModel, setSelectedModel] = React.useState('claude-sonnet');

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-12 bg-gradient-to-br from-yellow-50 to-purple-50 min-h-screen">
      <div className="text-center space-y-4">
        <h1 className="text-6xl font-bold bg-gradient-to-r from-purple-600 to-yellow-500 bg-clip-text text-transparent">
          RetroUI Components
        </h1>
        <p className="text-xl text-gray-600">
          A neobrutalist design system for Ninja Squad
        </p>
      </div>

      {/* Buttons Section */}
      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-gray-800">Buttons</h2>
        <div className="flex flex-wrap gap-4">
          <Button>Default Button</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
        </div>

        <div className="flex flex-wrap gap-4">
          <Button size="sm">Small</Button>
          <Button size="default">Default</Button>
          <Button size="lg">Large</Button>
        </div>

        <div className="flex flex-wrap gap-4">
          <Button>
            <Zap className="mr-2 h-4 w-4" />
            With Icon
          </Button>
          <Button variant="secondary">
            <Rocket className="mr-2 h-4 w-4" />
            Launch
          </Button>
          <Button variant="outline">
            <Shield className="mr-2 h-4 w-4" />
            Secure
          </Button>
        </div>
      </section>

      {/* Badges Section */}
      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-gray-800">Badges</h2>
        <div className="flex flex-wrap gap-4">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>

        <div className="flex flex-wrap gap-4">
          <Badge variant="default">
            <Star className="mr-1 h-3 w-3" />
            Featured
          </Badge>
          <Badge variant="secondary">
            <Zap className="mr-1 h-3 w-3" />
            New
          </Badge>
          <Badge variant="destructive">
            <AlertCircle className="mr-1 h-3 w-3" />
            Critical
          </Badge>
        </div>
      </section>

      {/* Dropdown Menu Section */}
      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-gray-800">Dropdown Menus</h2>
        <div className="flex flex-wrap gap-4">
          {/* Basic Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="font-bold shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all border-2 border-black">
                Open Menu
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem>
                  <User className="mr-2 h-4 w-4" />
                  <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <CreditCard className="mr-2 h-4 w-4" />
                  <span>Billing</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Model Selector Style */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="font-bold shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all border-2 border-black bg-purple-400 hover:bg-purple-500">
                Select Model
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuLabel>AI Models</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={selectedModel} onValueChange={setSelectedModel}>
                <DropdownMenuRadioItem value="claude-sonnet">
                  Claude Sonnet 3.5
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="claude-opus">
                  Claude Opus
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="gpt-4">
                  GPT-4 Turbo
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="gpt-3.5">
                  GPT-3.5 Turbo
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Action Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="font-bold shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all border-2 border-black bg-green-400 hover:bg-green-500 text-black">
                Actions
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48">
              <DropdownMenuItem>
                <Zap className="mr-2 h-4 w-4" />
                <span>Quick Action</span>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Rocket className="mr-2 h-4 w-4" />
                <span>Deploy</span>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Shield className="mr-2 h-4 w-4" />
                <span>Security Scan</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </section>

      {/* Input Section */}
      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-gray-800">Input Fields</h2>
        <div className="max-w-md space-y-4">
          <Input placeholder="Default input" />
          <Input placeholder="Email" type="email" />
          <Input placeholder="Password" type="password" />
          <Input placeholder="Search..." type="search" />
          <Input disabled placeholder="Disabled input" />
        </div>
      </section>

      {/* Alert Section */}
      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-gray-800">Alerts</h2>
        <div className="space-y-4 max-w-2xl">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <Alert.Title>Default Alert</Alert.Title>
            <Alert.Description>
              This is a default alert with some informative text.
            </Alert.Description>
          </Alert>

          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <Alert.Title>Error Alert</Alert.Title>
            <Alert.Description>
              Something went wrong! Please try again.
            </Alert.Description>
          </Alert>

          <Alert className="border-green-500 bg-green-50">
            <Rocket className="h-4 w-4 text-green-600" />
            <Alert.Title className="text-green-800">Success!</Alert.Title>
            <Alert.Description className="text-green-700">
              Your action was completed successfully.
            </Alert.Description>
          </Alert>

          <Alert className="border-purple-500 bg-purple-50">
            <Star className="h-4 w-4 text-purple-600" />
            <Alert.Title className="text-purple-800">Pro Tip</Alert.Title>
            <Alert.Description className="text-purple-700">
              RetroUI components work great with Tauri applications!
            </Alert.Description>
          </Alert>
        </div>
      </section>

      {/* Combined Example */}
      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-gray-800">Example Card</h2>
        <div className="bg-white border-4 border-black rounded-lg shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 max-w-md">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-bold">Server Control</h3>
              <Badge variant="secondary">Active</Badge>
            </div>

            <p className="text-gray-600">
              Manage your OpenCode server with RetroUI components.
            </p>

            <div className="space-y-2">
              <Input placeholder="Enter port number..." />
              <div className="flex gap-2">
                <Button className="flex-1">
                  <Rocket className="mr-2 h-4 w-4" />
                  Start Server
                </Button>
                <Button variant="destructive">
                  Stop
                </Button>
              </div>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <Alert.Description>
                Server running on port 4096
              </Alert.Description>
            </Alert>
          </div>
        </div>
      </section>
    </div>
  );
};

export default RetroUIShowcase;