import React, { useState, useEffect } from 'react';
import LandingPage from './landing/LandingPage';
import DocsPage from './landing/DocsPage';
import App from './App';

export default function Root() {
  const [currentPath, setCurrentPath] = useState(() => {
    return window.location.pathname;
  });

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  // If path is /docs, render the System Architecture & Docs Page
  if (currentPath === '/docs' || currentPath.startsWith('/docs/')) {
    return (
      <DocsPage
        onOpenApp={() => navigate('/app')}
        onBackToLanding={() => navigate('/')}
      />
    );
  }

  // If path is /app, render the Paramedic Field App
  if (currentPath === '/app' || currentPath.startsWith('/app/')) {
    return (
      <App
        onBackToLanding={() => navigate('/')}
        onOpenDocs={() => navigate('/docs')}
      />
    );
  }

  // Otherwise, default to Landing Page at /
  return (
    <LandingPage
      onOpenApp={() => navigate('/app')}
      onOpenDocs={() => navigate('/docs')}
    />
  );
}
