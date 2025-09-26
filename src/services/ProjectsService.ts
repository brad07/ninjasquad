import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { Project, CreateProjectRequest, UpdateProjectRequest } from '../types/project';

class ProjectsService {
  async createProject(request: CreateProjectRequest): Promise<Project> {
    return await invoke<Project>('create_project', { request });
  }

  async getProject(id: string): Promise<Project | null> {
    return await invoke<Project | null>('get_project', { id });
  }

  async getProjectByPath(path: string): Promise<Project | null> {
    return await invoke<Project | null>('get_project_by_path', { path });
  }

  async listProjects(): Promise<Project[]> {
    return await invoke<Project[]>('list_projects');
  }

  async listFavoriteProjects(): Promise<Project[]> {
    return await invoke<Project[]>('list_favorite_projects');
  }

  async listRecentProjects(limit: number): Promise<Project[]> {
    return await invoke<Project[]>('list_recent_projects', { limit });
  }

  async updateProject(id: string, request: UpdateProjectRequest): Promise<Project | null> {
    return await invoke<Project | null>('update_project', { id, request });
  }

  async updateProjectLastAccessed(id: string): Promise<void> {
    await invoke('update_project_last_accessed', { id });
  }

  async deleteProject(id: string): Promise<boolean> {
    return await invoke<boolean>('delete_project', { id });
  }

  async projectExists(path: string): Promise<boolean> {
    return await invoke<boolean>('project_exists', { path });
  }

  async selectProjectDirectory(): Promise<string | null> {
    const selectedDir = await open({
      directory: true,
      multiple: false,
      title: 'Select Project Directory'
    });

    return selectedDir as string | null;
  }

  async createProjectWithDialog(name: string, description?: string, color?: string): Promise<Project | null> {
    const path = await this.selectProjectDirectory();
    if (!path) {
      return null;
    }

    // Check if project already exists at this path
    const exists = await this.projectExists(path);
    if (exists) {
      const existing = await this.getProjectByPath(path);
      if (existing) {
        return existing;
      }
    }

    return await this.createProject({
      name,
      path,
      description,
      color
    });
  }

  async toggleFavorite(project: Project): Promise<Project | null> {
    return await this.updateProject(project.id, {
      isFavorite: !project.isFavorite
    });
  }
}

export const projectsService = new ProjectsService();