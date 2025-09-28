import React, { useState, useEffect } from 'react';
import { Plus, Star, Clock, Folder, ChevronRight, ChevronDown } from 'lucide-react';
import { projectsService } from '../services/ProjectsService';
import type { Project } from '../types/project';
import clsx from 'clsx';

interface ProjectSidebarProps {
  selectedProjectId: string | null;
  onProjectSelect: (project: Project | null) => void;
  onNewProject: () => void;
}

const ProjectSidebar: React.FC<ProjectSidebarProps> = ({
  selectedProjectId,
  onProjectSelect,
  onNewProject
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [favoriteProjects, setFavoriteProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState({
    favorites: true,
    recent: true,
    all: true
  });

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    try {
      // Load projects individually to handle potential errors
      let allProjects: Project[] = [];
      let recent: Project[] = [];
      let favorites: Project[] = [];

      try {
        allProjects = await projectsService.listProjects();
      } catch (error) {
        console.error('Failed to load all projects:', error);
        allProjects = [];
      }

      try {
        recent = await projectsService.listRecentProjects(3);
      } catch (error) {
        console.error('Failed to load recent projects:', error);
        recent = [];
      }

      try {
        favorites = await projectsService.listFavoriteProjects();
      } catch (error) {
        console.error('Failed to load favorite projects:', error);
        favorites = [];
      }

      // Sort all projects alphabetically
      setProjects((allProjects || []).sort((a, b) => a.name.localeCompare(b.name)));
      setRecentProjects((recent || []).sort((a, b) => a.name.localeCompare(b.name)));
      setFavoriteProjects((favorites || []).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      console.error('Failed to load projects:', error);
      // Set empty arrays as fallback
      setProjects([]);
      setRecentProjects([]);
      setFavoriteProjects([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const ProjectItem = ({ project }: { project: Project }) => {
    const isSelected = selectedProjectId === project.id;

    return (
      <button
        onClick={() => {
          onProjectSelect(project);
          // Update last accessed time, but don't block on it
          projectsService.updateProjectLastAccessed(project.id).catch(error => {
            console.error('Failed to update project last accessed time:', error);
          });
        }}
        className={clsx(
          'w-full px-3 py-2 rounded-md transition-colors text-left group',
          isSelected
            ? 'bg-blue-600 text-white'
            : 'hover:bg-gray-800 text-gray-300 hover:text-white'
        )}
      >
        <div className="flex items-center space-x-2">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: project.color || '#3b82f6' }}
          />
          <span className="text-sm truncate">{project.name}</span>
        </div>
      </button>
    );
  };

  const SectionHeader = ({
    title,
    icon: Icon,
    section,
    count
  }: {
    title: string;
    icon: React.ElementType;
    section: keyof typeof expandedSections;
    count: number;
  }) => (
    <button
      onClick={() => toggleSection(section)}
      className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-300 transition-colors"
    >
      <div className="flex items-center space-x-1.5">
        {expandedSections[section] ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <Icon className="h-3 w-3" />
        <span className="uppercase tracking-wider">{title}</span>
      </div>
      <span className="text-gray-600">{count}</span>
    </button>
  );

  if (loading) {
    return (
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">Projects</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Projects</h2>
          <button
            onClick={onNewProject}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors"
            title="New Project"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      {/* Projects List */}
      <div className="flex-1 overflow-y-auto py-2">
        {/* Favorites Section */}
        {favoriteProjects.length > 0 && (
          <div className="mb-4">
            <SectionHeader
              title="Favorites"
              icon={Star}
              section="favorites"
              count={favoriteProjects.length}
            />
            {expandedSections.favorites && (
              <div className="px-2 mt-1 space-y-0.5">
                {favoriteProjects.map(project => (
                  <ProjectItem key={project.id} project={project} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recent Section */}
        {recentProjects.length > 0 && (
          <div className="mb-4">
            <SectionHeader
              title="Recent"
              icon={Clock}
              section="recent"
              count={recentProjects.length}
            />
            {expandedSections.recent && (
              <div className="px-2 mt-1 space-y-0.5">
                {recentProjects.map(project => (
                  <ProjectItem key={project.id} project={project} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* All Projects Section */}
        <div>
          <SectionHeader
            title="All Projects"
            icon={Folder}
            section="all"
            count={projects.length}
          />
          {expandedSections.all && (
            <div className="px-2 mt-1 space-y-0.5">
              {projects.length > 0 ? (
                projects.map(project => (
                  <ProjectItem key={project.id} project={project} />
                ))
              ) : (
                <p className="text-center text-gray-500 text-sm py-4">
                  No projects yet
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="p-3 border-t border-gray-800">
        <button
          onClick={() => onProjectSelect(null)}
          className="w-full px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors text-left"
        >
          Show All Servers
        </button>
      </div>
    </aside>
  );
};

export default ProjectSidebar;