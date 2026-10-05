import React, { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import MapStudioEditor from '@/components/MapStudioEditor';
import { HeadlessRenderer } from '@/components/RenderMode/HeadlessRenderer';
import { parseAutoCamParam } from '@/services/routeSlug';
import type { RouteDeepLinkRequest } from '@/services/routeDeepLink';

/**
 * Serves both `/` and `/routes/:slug` from one element, so dropping the deep
 * link from the URL after it is applied keeps the editor mounted.
 */
const Index = () => {
  const navigate = useNavigate();
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  // One-shot: captured on first render, because the URL is replaced once it has been applied.
  const [routeDeepLink] = useState<RouteDeepLinkRequest | null>(() =>
    slug ? { slug, autocam: parseAutoCamParam(searchParams.get('autocam')) } : null,
  );

  const params = new URLSearchParams(window.location.search);
  const renderJobId = params.get('render_job');
  const renderSecret = params.get('render_secret');

  if (renderJobId && renderSecret) {
    return <HeadlessRenderer jobId={renderJobId} secret={renderSecret} />;
  }

  return (
    <MapStudioEditor
      routeDeepLink={routeDeepLink}
      onRouteDeepLinkSettled={() => navigate('/', { replace: true })}
    />
  );
};

export default Index;
