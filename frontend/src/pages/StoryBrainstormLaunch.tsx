import { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, FolderGit2 } from 'lucide-react';
import { useUserSystem } from '@/components/ConfigProvider';
import { useCreateWorkspace } from '@/hooks/useCreateWorkspace';
import { useProjectRepos, useRepoBranches } from '@/hooks';
import { getVariantOptions } from '@/utils/executor';
import { splitMessageToTitleDescription } from '@/utils/string';
import { paths } from '@/lib/paths';
import type { ExecutorProfileId, BaseCodingAgent, Repo } from 'shared/types';
import { useProject } from '@/contexts/ProjectContext';
import { Button } from '@/components/ui/button';

function buildBrainstormPrompt(projectName: string = 'this project'): string {
  return `/brainstorming-cards

项目：${projectName}

项目背景：
`;
}

export function StoryBrainstormLaunch() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { profiles, config } = useUserSystem();
  const { project } = useProject();

  const [message, setMessage] = useState('');
  const [selectedProfile, setSelectedProfile] =
    useState<ExecutorProfileId | null>(null);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [selectedBranches, setSelectedBranches] = useState<
    Record<string, string>
  >({});

  const { createWorkspace } = useCreateWorkspace();
  const { data: projectRepos = [], isLoading: isLoadingRepos } =
    useProjectRepos(projectId);

  // Initialize message with brainstorm prompt
  useEffect(() => {
    const projectName = project?.name || 'this project';
    setMessage(buildBrainstormPrompt(projectName));
  }, [project?.name]);

  // Default to user's config profile or first available executor
  const effectiveProfile = useMemo<ExecutorProfileId | null>(() => {
    if (selectedProfile) return selectedProfile;
    if (config?.executor_profile) return config.executor_profile;
    if (profiles) {
      const firstExecutor = Object.keys(profiles)[0] as BaseCodingAgent;
      if (firstExecutor) {
        const variants = Object.keys(profiles[firstExecutor]);
        return {
          executor: firstExecutor,
          variant: variants[0] ?? null,
        };
      }
    }
    return null;
  }, [selectedProfile, config?.executor_profile, profiles]);

  // Get variant options for the current executor
  const variantOptions = useMemo(
    () => getVariantOptions(effectiveProfile?.executor, profiles),
    [effectiveProfile?.executor, profiles]
  );

  // Build repos array for workspace creation
  const workspaceRepos = useMemo(() => {
    return projectRepos.map((repo) => ({
      repo_id: repo.id,
      target_branch:
        selectedBranches[repo.id] || repo.default_target_branch || 'main',
    }));
  }, [projectRepos, selectedBranches]);

  // Determine if we can submit
  const canSubmit =
    message.trim().length > 0 &&
    effectiveProfile !== null &&
    projectId !== undefined &&
    workspaceRepos.length > 0;

  // Handle variant change
  const handleVariantChange = useCallback(
    (variant: string | null) => {
      if (!effectiveProfile) return;
      setSelectedProfile({
        executor: effectiveProfile.executor,
        variant,
      });
    },
    [effectiveProfile]
  );

  // Handle executor change
  const handleExecutorChange = useCallback(
    (executor: BaseCodingAgent) => {
      const executorConfig = profiles?.[executor];
      if (!executorConfig) {
        setSelectedProfile({ executor, variant: null });
        return;
      }

      const variants = Object.keys(executorConfig);
      let targetVariant: string | null = null;

      if (
        config?.executor_profile?.executor === executor &&
        config?.executor_profile?.variant
      ) {
        const savedVariant = config.executor_profile.variant;
        if (variants.includes(savedVariant)) {
          targetVariant = savedVariant;
        }
      }

      if (!targetVariant) {
        targetVariant = variants.includes('DEFAULT')
          ? 'DEFAULT'
          : (variants[0] ?? null);
      }

      setSelectedProfile({ executor, variant: targetVariant });
    },
    [profiles, config?.executor_profile]
  );

  // Handle submit
  const handleSubmit = useCallback(async () => {
    setHasAttemptedSubmit(true);
    if (!canSubmit || !effectiveProfile || !projectId) return;

    const { title, description } = splitMessageToTitleDescription(message);

    await createWorkspace.mutateAsync({
      task: {
        project_id: projectId,
        title: `📋 Brainstorm: ${title}`,
        description,
        status: null,
        task_type: 'story',
        parent_workspace_id: null,
        parent_task_id: null,
        image_ids: null,
      },
      executor_profile_id: effectiveProfile,
      repos: workspaceRepos,
    });
  }, [
    canSubmit,
    effectiveProfile,
    projectId,
    message,
    createWorkspace,
    workspaceRepos,
  ]);

  // Navigate back to stories
  const handleBack = useCallback(() => {
    if (projectId) {
      navigate(paths.projectStories(projectId));
    }
  }, [navigate, projectId]);

  // Determine error to display
  const displayError =
    hasAttemptedSubmit && !projectId
      ? 'Project ID not found'
      : createWorkspace.error
        ? createWorkspace.error instanceof Error
          ? createWorkspace.error.message
          : 'Failed to create workspace'
        : null;

  // Handle case where no project exists
  if (!projectId) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-center max-w-md">
          <h2 className="text-lg font-medium text-high mb-2">
            Project not found
          </h2>
          <p className="text-sm text-low">
            Unable to start brainstorming session
          </p>
        </div>
      </div>
    );
  }

  // Handle case where no repos are configured
  if (!isLoadingRepos && projectRepos.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-center max-w-md space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <FolderGit2 className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-high mb-2">
              No Repository Configured
            </h2>
            <p className="text-sm text-muted-foreground">
              Please add a repository to your project before starting a
              brainstorming session.
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={handleBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Stories
            </Button>
            <Button onClick={() => navigate('/settings/repos')}>
              Add Repository
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 flex-col bg-primary h-full overflow-auto">
      {/* Centered content */}
      <div className="flex-1 flex items-start justify-center pt-12 pb-8 px-6">
        <div className="w-full max-w-2xl space-y-6">
          {/* Header */}
          <div>
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Stories
            </button>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-sm">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">
                  Story Brainstorm
                </h1>
                <p className="text-sm text-muted-foreground">
                  AI-assisted story generation for{' '}
                  {project?.name || 'your project'}
                </p>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="rounded-lg bg-muted/50 border border-border/50 p-4">
            <h3 className="text-sm font-medium text-foreground mb-2">
              How it works
            </h3>
            <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
              <li>Describe your project background and goals below</li>
              <li>AI will ask clarifying questions to understand your needs</li>
              <li>Review and refine the generated Story cards</li>
              <li>Extract and create Stories with one click</li>
            </ol>
          </div>

          {/* Branch Selection */}
          {projectRepos.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-foreground">
                Repository Branches
              </h3>
              <p className="text-xs text-muted-foreground">
                Select the target branch for each repository
              </p>
              <div className="space-y-2">
                {projectRepos.map((repo) => (
                  <BranchSelector
                    key={repo.id}
                    repo={repo}
                    selectedBranch={
                      selectedBranches[repo.id] ||
                      repo.default_target_branch ||
                      'main'
                    }
                    onBranchChange={(branch) =>
                      setSelectedBranches((prev) => ({
                        ...prev,
                        [repo.id]: branch,
                      }))
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* Form */}
          <div className="space-y-4">
            {/* Textarea */}
            <div className="rounded-lg border border-border bg-background">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your project background and goals..."
                className="w-full h-48 p-4 text-sm bg-transparent resize-none focus:outline-none"
                disabled={createWorkspace.isPending}
              />
            </div>

            {/* Controls row */}
            <div className="flex items-center justify-between gap-4">
              {/* Left side - executor selection */}
              <div className="flex items-center gap-3">
                <select
                  value={effectiveProfile?.executor ?? ''}
                  onChange={(e) =>
                    handleExecutorChange(e.target.value as BaseCodingAgent)
                  }
                  className="h-9 px-3 text-sm rounded-md border border-border bg-background"
                  disabled={createWorkspace.isPending}
                >
                  {Object.keys(profiles ?? {}).map((exec) => (
                    <option key={exec} value={exec}>
                      {exec
                        .split('_')
                        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                        .join(' ')}
                    </option>
                  ))}
                </select>

                {variantOptions.length > 1 && (
                  <select
                    value={effectiveProfile?.variant ?? 'DEFAULT'}
                    onChange={(e) => handleVariantChange(e.target.value)}
                    className="h-9 px-3 text-sm rounded-md border border-border bg-background"
                    disabled={createWorkspace.isPending}
                  >
                    {variantOptions.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Right side - submit button */}
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit || createWorkspace.isPending}
                size="default"
              >
                {createWorkspace.isPending ? (
                  <>
                    <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Start Brainstorm
                  </>
                )}
              </Button>
            </div>

            {/* Error message */}
            {displayError && (
              <div className="text-sm text-destructive">{displayError}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface BranchSelectorProps {
  repo: Repo;
  selectedBranch: string;
  onBranchChange: (branch: string) => void;
}

function BranchSelector({
  repo,
  selectedBranch,
  onBranchChange,
}: BranchSelectorProps) {
  const { data: branches, isLoading } = useRepoBranches(repo.id);

  // Filter to local branches only for cleaner UI
  const localBranches = branches?.filter((b) => !b.is_remote) ?? [];

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {repo.display_name || repo.name}
        </p>
      </div>
      <select
        value={selectedBranch}
        onChange={(e) => onBranchChange(e.target.value)}
        disabled={isLoading}
        className="h-9 px-3 text-sm rounded-md border border-border bg-background min-w-[120px]"
      >
        {isLoading ? (
          <option>Loading...</option>
        ) : localBranches.length > 0 ? (
          localBranches.map((branch) => (
            <option key={branch.name} value={branch.name}>
              {branch.name}
            </option>
          ))
        ) : (
          <option value={selectedBranch}>{selectedBranch}</option>
        )}
      </select>
    </div>
  );
}
