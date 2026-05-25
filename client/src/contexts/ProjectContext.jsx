import { createContext, useContext, useState, useEffect } from 'react';

const ProjectContext = createContext();

export const ProjectProvider = ({ children }) => {
  const [activeProjectId, setActiveProjectId] = useState(() => {
    return localStorage.getItem('activeProjectId') || localStorage.getItem('last_project_id') || null;
  });
  const [projectName, setProjectName] = useState('');
  const [projectColor, setProjectColor] = useState('#4f46e5');
  const [projectKey, setProjectKey] = useState('');

  useEffect(() => {
    if (activeProjectId) {
      localStorage.setItem('activeProjectId', activeProjectId);
      localStorage.setItem('last_project_id', activeProjectId);
      window.dispatchEvent(new CustomEvent('projectChanged'));
    }
  }, [activeProjectId]);

  return (
    <ProjectContext.Provider value={{
      activeProjectId,
      setActiveProjectId,
      projectName,
      setProjectName,
      projectColor,
      setProjectColor,
      projectKey,
      setProjectKey
    }}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
};