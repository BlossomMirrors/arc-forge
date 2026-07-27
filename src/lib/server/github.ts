import { db } from './db';

const GITHUB_API = 'https://api.github.com';

export type GithubRepo = {
	id: number;
	fullName: string;
	cloneUrl: string;
	defaultBranch: string;
};

export async function hasGithubAccount(userId: string): Promise<boolean> {
	const account = await db.account.findFirst({
		where: { userId, providerId: 'github' },
		select: { id: true }
	});
	return !!account;
}

export async function getGithubAccessToken(userId: string): Promise<string | null> {
	// Classic GitHub OAuth App tokens don't expire, so there's no refresh flow here
	// (unlike Authentik's OIDC tokens, which better-auth's genericOAuth handles itself).
	const account = await db.account.findFirst({
		where: { userId, providerId: 'github' },
		select: { accessToken: true }
	});
	return account?.accessToken ?? null;
}

async function githubGet(path: string, accessToken: string): Promise<Response> {
	return fetch(`${GITHUB_API}${path}`, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
			Accept: 'application/vnd.github+json'
		}
	});
}

export async function listUserRepos(accessToken: string): Promise<GithubRepo[]> {
	const res = await githubGet(
		'/user/repos?per_page=100&affiliation=owner,collaborator&sort=updated',
		accessToken
	);
	if (!res.ok) return [];
	const repos = (await res.json()) as Array<{
		id: number;
		full_name: string;
		clone_url: string;
		default_branch: string;
		private: boolean;
	}>;
	// The public_repo OAuth scope already keeps private repos out of this response,
	// this filter is just a defensive second layer against relying on that alone.
	return repos
		.filter((repo) => !repo.private)
		.map((repo) => ({
			id: repo.id,
			fullName: repo.full_name,
			cloneUrl: repo.clone_url,
			defaultBranch: repo.default_branch
		}));
}

export async function listRepoBranches(
	accessToken: string,
	owner: string,
	repo: string
): Promise<string[]> {
	const res = await githubGet(
		`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`,
		accessToken
	);
	if (!res.ok) return [];
	const branches = (await res.json()) as Array<{ name: string }>;
	return branches.map((branch) => branch.name);
}
