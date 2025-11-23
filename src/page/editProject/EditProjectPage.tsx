'use client';

import React, { FC } from 'react';
import * as api from '@/services/projectsService';
import { useParams } from 'next/navigation';
import ProjectEditor from '@/components/editProject/ProjectEditor';

const EditProjectPage = () => {
  const { id: routeId } = useParams();
  const id = Array.isArray(routeId) ? routeId[0] : routeId;

  return (
    <ProjectEditor
      projectId={id}
      getProject={api.getProject}
      createProject={api.createProject}
      updateProject={api.updateProject}
      deleteProject={api.deleteProject}
    />
  );
};  

export default EditProjectPage;