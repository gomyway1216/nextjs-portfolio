'use client';

import React from 'react';
import * as api from '@/services/projectsService';
import type { ProjectInput } from '@/services/projectsService';
import { useParams } from 'next/navigation';
import ProjectEditor from '@/components/editProject/ProjectEditor';

const EditProjectPage = () => {
  const { id: routeId } = useParams();
  const id = Array.isArray(routeId) ? routeId[0] : routeId;

  // Wrapper function to adapt the API to ProjectEditor's expected interface
  const handleUpdateProject = async (project: ProjectInput) => {
    if (!id) throw new Error('Missing project id');
    await api.updateProject(id, project);
  };

  return (
    <ProjectEditor
      projectId={id}
      getProject={api.getProject}
      createProject={api.createProject}
      updateProject={handleUpdateProject}
      deleteProject={api.deleteProject}
    />
  );
};  

export default EditProjectPage;
