export interface ProjectSettings {
  defaultModel?: string;
  portRange?: [number, number];
  autoStartServer: boolean;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  description?: string;
  color?: string;
  createdAt: string;
  lastAccessed?: string;
  isFavorite: boolean;
  settings?: ProjectSettings;
}

export interface CreateProjectRequest {
  name: string;
  path: string;
  description?: string;
  color?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  color?: string;
  isFavorite?: boolean;
  settings?: ProjectSettings;
}