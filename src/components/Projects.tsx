import React, { useState, useEffect } from 'react';
import { projectsService } from '../services/ProjectsService';
import type { Project } from '../types/project';
import { Star, FolderOpen, Clock, Plus, Trash, Edit, Folder } from 'lucide-react';

export const Projects: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [favoriteProjects, setFavoriteProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectPath, setNewProjectPath] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [selectedColor, setSelectedColor] = useState('#3b82f6');
  const [activeTab, setActiveTab] = useState<'all' | 'recent' | 'favorites'>('all');

  const colors = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#a855f7'
  ];

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const [allProjects, recent, favorites] = await Promise.all([
        projectsService.listProjects(),
        projectsService.listRecentProjects(5),
        projectsService.listFavoriteProjects()
      ]);
      setProjects(allProjects);
      setRecentProjects(recent);
      setFavoriteProjects(favorites);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBrowsePath = async () => {
    const selectedPath = await projectsService.selectProjectDirectory();
    if (selectedPath) {
      setNewProjectPath(selectedPath);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName || !newProjectPath) return;

    try {
      // Check if project already exists at this path
      const exists = await projectsService.projectExists(newProjectPath);
      if (exists) {
        const existing = await projectsService.getProjectByPath(newProjectPath);
        if (existing) {
          alert('A project already exists at this location.');
          return;
        }
      }

      // Create the project with the specified details
      const project = await projectsService.createProject({
        name: newProjectName,
        path: newProjectPath,
        description: newProjectDescription || undefined,
        color: selectedColor
      });

      if (project) {
        console.log('Project created successfully:', project);
        await loadProjects();

        // Close dialog and reset form
        setShowNewProjectDialog(false);
        setNewProjectName('');
        setNewProjectPath('');
        setNewProjectDescription('');
        setSelectedColor('#3b82f6');
      }
    } catch (error) {
      console.error('Failed to create project:', error);
      alert('Failed to create project. Please try again.');
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (confirm('Are you sure you want to delete this project?')) {
      await projectsService.deleteProject(id);
      await loadProjects();
    }
  };

  const handleToggleFavorite = async (project: Project) => {
    await projectsService.toggleFavorite(project);
    await loadProjects();
  };

  const handleOpenProject = async (project: Project) => {
    // Update last accessed time
    await projectsService.updateProjectLastAccessed(project.id);
    // This will be integrated with ServerControl
    console.log('Opening project:', project);
  };

  const getProjectsToDisplay = () => {
    switch (activeTab) {
      case 'recent':
        return recentProjects;
      case 'favorites':
        return favoriteProjects;
      default:
        return projects;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading projects...</div>
      </div>
    );
  }

  const displayProjects = getProjectsToDisplay();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <h2 className="text-lg font-semibold text-gray-100">Projects</h2>
        <button
          onClick={() => setShowNewProjectDialog(true)}
          className="p-2 text-blue-400 hover:bg-gray-800 rounded-md transition-colors"
          title="New Project"
        >
          <Plus size={20} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'all'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          All Projects
        </button>
        <button
          onClick={() => setActiveTab('recent')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'recent'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          Recent
        </button>
        <button
          onClick={() => setActiveTab('favorites')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'favorites'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          Favorites
        </button>
      </div>

      {/* Projects List */}
      <div className="flex-1 overflow-y-auto p-4">
        {displayProjects.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {activeTab === 'favorites'
              ? 'No favorite projects yet'
              : activeTab === 'recent'
              ? 'No recent projects'
              : 'No projects yet. Create your first project!'}
          </div>
        ) : (
          <div className="grid gap-3">
            {displayProjects.map((project) => (
              <div
                key={project.id}
                className="group relative p-4 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 rounded-lg transition-all cursor-pointer"
                onClick={() => handleOpenProject(project)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1">
                    <div
                      className="w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: project.color || '#3b82f6' }}
                    >
                      <Folder size={20} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-100 truncate">
                        {project.name}
                      </h3>
                      {project.description && (
                        <p className="text-sm text-gray-400 truncate">
                          {project.description}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1 truncate">
                        {project.path}
                      </p>
                      {project.lastAccessed && (
                        <div className="flex items-center mt-2 text-xs text-gray-500">
                          <Clock size={12} className="mr-1" />
                          Last accessed: {new Date(project.lastAccessed).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleFavorite(project);
                      }}
                      className={`p-1.5 rounded hover:bg-gray-700 transition-colors ${
                        project.isFavorite ? 'text-yellow-400' : 'text-gray-400'
                      }`}
                      title={project.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <Star size={16} fill={project.isFavorite ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProject(project.id);
                      }}
                      className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors"
                      title="Delete project"
                    >
                      <Trash size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Project Dialog */}
      {showNewProjectDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-96 max-w-full">
            <h3 className="text-lg font-semibold mb-4 text-gray-100">New Project</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Project Name
                </label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-100 focus:outline-none focus:border-blue-400"
                  placeholder="My Awesome Project"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Project Path
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={newProjectPath}
                    onChange={(e) => setNewProjectPath(e.target.value)}
                    className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-100 focus:outline-none focus:border-blue-400"
                    placeholder="/path/to/project"
                    readOnly
                  />
                  <button
                    onClick={handleBrowsePath}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors flex items-center space-x-2"
                  >
                    <FolderOpen size={18} />
                    <span>Browse</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-gray-100 focus:outline-none focus:border-blue-400"
                  placeholder="A brief description of your project"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Color
                </label>
                <div className="flex space-x-2">
                  {colors.map((color) => (
                    <button
                      key={color}
                      onClick={() => setSelectedColor(color)}
                      className={`w-8 h-8 rounded-md transition-transform ${
                        selectedColor === color ? 'ring-2 ring-white scale-110' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowNewProjectDialog(false);
                  setNewProjectName('');
                  setNewProjectPath('');
                  setNewProjectDescription('');
                  setSelectedColor('#3b82f6');
                }}
                className="px-4 py-2 text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProject}
                disabled={!newProjectName || !newProjectPath}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};