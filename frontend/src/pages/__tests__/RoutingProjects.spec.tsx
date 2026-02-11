import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ComponentType, ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';

import { AppContent } from '@/App';

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

vi.mock('posthog-js/react', () => ({
  usePostHog: () => ({
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    identify: vi.fn(),
  }),
}));

vi.mock('@/hooks', async () => {
  const actual = await vi.importActual<typeof import('@/hooks')>('@/hooks');
  return {
    ...actual,
    useAuth: () => ({ isSignedIn: false }),
    useProjectRepos: () => ({ data: [] }),
    useBranchStatus: () => ({ data: null, error: null, isLoading: false }),
    useAttemptExecution: () => ({ isAttemptRunning: false }),
  };
});

vi.mock('@/hooks/useProjects', () => ({
  useProjects: () => ({
    projects: [
      {
        id: 'proj-1',
        name: 'Project One',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    projectsById: {
      'proj-1': {
        id: 'proj-1',
        name: 'Project One',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    },
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/hooks/useProjectStories', () => ({
  useProjectStories: () => ({
    data: [
      {
        id: 'story-1',
        title: 'Story One',
        description: 'Story description',
        status: 'todo',
        task_type: 'story',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/hooks/useProjectMutations', () => ({
  useProjectMutations: () => ({
    unlinkProject: { mutate: vi.fn() },
  }),
}));

vi.mock('@/hooks/useProjectTasks', () => ({
  useProjectTasks: () => ({
    tasks: [],
    tasksById: {},
    tasksByStatus: {},
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/hooks/useStoryTasks', () => ({
  useStoryTasks: () => ({
    tasks: [],
    tasksById: {},
    tasksByStatus: {},
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/hooks/useTaskAttempts', () => ({
  useTaskAttempts: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/hooks/useTaskAttempt', () => ({
  useTaskAttemptWithSession: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/hooks/useWorkspaceCount', () => ({
  useWorkspaceCount: () => ({ data: 0 }),
}));

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => true,
}));

vi.mock('@/contexts/ProjectContext', () => ({
  useProject: () => ({
    projectId: 'proj-1',
    project: {
      id: 'proj-1',
      name: 'Project One',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    isLoading: false,
    error: null,
    isError: false,
  }),
  ProjectProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/contexts/TerminalContext', () => ({
  TerminalProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ConfigProvider', () => ({
  useUserSystem: () => ({
    config: {
      analytics_enabled: false,
      disclaimer_acknowledged: true,
      onboarding_acknowledged: true,
      show_release_notes: false,
    },
    analyticsUserId: null,
    updateAndSaveConfig: vi.fn(),
    loading: false,
    loginStatus: { status: 'loggedout' },
    reloadSystem: vi.fn(),
  }),
  UserSystemProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/dialogs/global/DisclaimerDialog', () => ({
  DisclaimerDialog: { show: vi.fn(), hide: vi.fn() },
}));

vi.mock('@/components/dialogs/global/OnboardingDialog', () => ({
  OnboardingDialog: { show: vi.fn().mockResolvedValue({ profile: null, editor: null }), hide: vi.fn() },
}));

vi.mock('@/components/dialogs/global/ReleaseNotesDialog', () => ({
  ReleaseNotesDialog: { show: vi.fn(), hide: vi.fn() },
}));

vi.mock('@/components/dialogs/global/FeatureShowcaseDialog', () => ({
  FeatureShowcaseDialog: { show: vi.fn().mockResolvedValue(undefined), hide: vi.fn() },
}));

vi.mock('@/components/dialogs/global/BetaWorkspacesDialog', () => ({
  BetaWorkspacesDialog: { show: vi.fn().mockResolvedValue(false), hide: vi.fn() },
}));

vi.mock('@/lib/api', () => ({
  tasksApi: {
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('@/hooks/useDiscordOnlineCount', () => ({
  useDiscordOnlineCount: () => ({ data: 0 }),
}));

vi.mock('@/keyboard', () => ({
  Scope: { PROJECTS: 'projects', KANBAN: 'kanban' },
  useKeyCreate: () => undefined,
  useKeyExit: () => undefined,
  useKeyFocusSearch: () => undefined,
  useKeyNavUp: () => undefined,
  useKeyNavDown: () => undefined,
  useKeyNavLeft: () => undefined,
  useKeyNavRight: () => undefined,
  useKeyOpenDetails: () => undefined,
  useKeyDeleteTask: () => undefined,
  useKeyCycleViewBackward: () => undefined,
}));

vi.mock('@sentry/react', async () => {
  const actual = await vi.importActual<typeof import('@sentry/react')>(
    '@sentry/react'
  );
  return {
    ...actual,
    withSentryReactRouterV6Routing: (RoutesComp: ComponentType) => RoutesComp,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('project routing', () => {
  it('navigates to stories when clicking a project card', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/projects']}>
        <LocationDisplay />
        <AppContent />
      </MemoryRouter>
    );

    const card = await screen.findByText('Project One');
    await user.click(card);

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/projects/proj-1/stories'
      );
    });
  });

  it('redirects /projects/:projectId to /projects/:projectId/stories', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/proj-1']}>
        <LocationDisplay />
        <AppContent />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/projects/proj-1/stories'
      );
    });
  });

  it('navigates to story tasks when clicking a story card', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/projects/proj-1/stories']}>
        <LocationDisplay />
        <AppContent />
      </MemoryRouter>
    );

    const storyCard = await screen.findByText('Story One');
    await user.click(storyCard);

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/projects/proj-1/stories/story-1/tasks'
      );
    });
  });
});
