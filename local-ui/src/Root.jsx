import React, { useState, useEffect } from 'react';
import LandingPage from './landing/LandingPage';
import DocsPage from './landing/DocsPage';
import App from './App';

export default function Root() {
  const [currentPath, setCurrentPath] = useState(() => {
    return window.location.pathname + window.location.search;
  });

  useEffect(() => {
    localStorage.setItem('sanjeevani_theme', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname + window.location.search);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const pathname = currentPath.split('?')[0];

  // If path is /docs, render the System Architecture & Docs Page
  if (pathname === '/docs' || pathname.startsWith('/docs/')) {
    return (
      <DocsPage
        onOpenApp={(targetUrl) => navigate(typeof targetUrl === 'string' ? targetUrl : '/app')}
        onBackToLanding={() => navigate('/')}
      />
    );
  }

  // If path is /app, render the Paramedic Field App
  if (pathname === '/app' || pathname.startsWith('/app/')) {
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
      onOpenApp={(targetUrl) => navigate(typeof targetUrl === 'string' ? targetUrl : '/app')}
      onOpenDocs={() => navigate('/docs')}
    />
  );
}
