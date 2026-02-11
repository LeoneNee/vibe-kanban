import { useEffect } from 'react';
import { Outlet, useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { DevBanner } from '@/components/DevBanner';
import { Navbar } from '@/components/layout/Navbar';

export function NormalLayout() {
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view');
  const shouldHideNavbar = view === 'preview' || view === 'diffs';
  const location = useLocation();
  const navigate = useNavigate();

  // Redirect /projects/:projectId to /projects/:projectId/stories
  useEffect(() => {
    const match = location.pathname.match(/^\/projects\/([^/]+)$/);
    if (match) {
      navigate(`${location.pathname}/stories`, { replace: true });
    }
  }, [location.pathname, navigate]);

  return (
    <>
      <div className="flex flex-col h-screen">
        <DevBanner />
        {!shouldHideNavbar && <Navbar />}
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </div>
    </>
  );
}
