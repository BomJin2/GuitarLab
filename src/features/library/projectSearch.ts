import type { ProjectSummary } from './projects';

const normalized = (text: string) => text.normalize('NFKC').toLowerCase();

export function filterProjects(
  projects: readonly ProjectSummary[],
  query: string,
): readonly ProjectSummary[] | null {
  if (query.length > 400 || [...query].length > 200) return null;
  const words = normalized(query).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return projects;
  return projects.filter((project) => {
    const text = normalized(`${project.title} ${project.artist ?? ''}`);
    return words.every((word) => text.includes(word));
  });
}
