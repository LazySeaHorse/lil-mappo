import React from 'react';
import MapStudioEditor from '@/components/MapStudioEditor';
import { HeadlessRenderer } from '@/components/RenderMode/HeadlessRenderer';

const Index = () => {
  const params = new URLSearchParams(window.location.search);
  const renderJobId = params.get('render_job');
  const renderSecret = params.get('render_secret');

  if (renderJobId && renderSecret) {
    return <HeadlessRenderer jobId={renderJobId} secret={renderSecret} />;
  }

  return <MapStudioEditor />;
};

export default Index;
