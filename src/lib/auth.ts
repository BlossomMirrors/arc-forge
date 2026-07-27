import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { genericOAuth, organization, type GenericOAuthConfig } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { PrismaClient } from '$lib/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '$env/dynamic/private';
import { sendEmail, renderNotificationEmail } from '$lib/server/email';

const {
	DATABASE_URL,
	BETTER_AUTH_URL,
	AUTHENTIK_CLIENT_ID,
	AUTHENTIK_CLIENT_SECRET,
	AUTHENTIK_URL,
	GITHUB_CLIENT_ID,
	GITHUB_CLIENT_SECRET
} = env;

const pgAdapter = new PrismaPg({ connectionString: DATABASE_URL });
const prisma = new PrismaClient({ adapter: pgAdapter });

// authentik calls its claim "groups"; we call it "roles" everywhere in Forge
function rolesFromProfile(profile: Record<string, unknown>): string[] {
	const groups = profile.groups;
	if (!Array.isArray(groups)) return [];
	return groups.filter((g): g is string => typeof g === 'string');
}

export const auth = betterAuth({
	secret: process.env.BETTER_AUTH_SECRET ?? crypto.randomUUID(),
	database: prismaAdapter(prisma, {
		provider: 'postgresql'
	}),
	baseURL: BETTER_AUTH_URL,
	account: {
		accountLinking: {
			// GitHub is only ever linked explicitly (via linkSocial, e.g. from the Flatpak
			// Git submission form) by an already-authenticated user, not used to sign in
			// as someone else's existing account - trusting it here just skips better-auth's
			// email-match/verified-email requirement for that already-consensual link.
			trustedProviders: ['github', 'blossom-accounts', 'email-password']
		}
	},
	user: {
		additionalFields: {
			roles: {
				type: 'string[]',
				required: false,
				// server-controlled only: never settable through the update-user API,
				// otherwise a user could self-grant "staff" by calling it directly
				input: false
			}
		}
	},
	socialProviders: {
		github: {
			clientId: GITHUB_CLIENT_ID ?? '',
			clientSecret: GITHUB_CLIENT_SECRET ?? '',
			// public_repo (not repo) so the Flatpak Git submission repo picker can only
			// ever see/list public repos - no private-repo access is ever requested
			scope: ['read:user', 'user:email', 'public_repo']
		}
	},
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: true,
		sendResetPassword: async ({ user, url }) => {
			await sendEmail({
				to: user.email,
				subject: 'Reset your Forge password',
				html: renderNotificationEmail({
					title: 'Reset your password',
					body: 'Click below to choose a new password. If you did not request this, ignore this email.',
					linkUrl: url
				})
			});
		}
	},
	emailVerification: {
		sendOnSignUp: true,
		autoSignInAfterVerification: true,
		sendVerificationEmail: async ({ user, url }) => {
			await sendEmail({
				to: user.email,
				subject: 'Verify your Forge email',
				html: renderNotificationEmail({
					title: 'Verify your email',
					body: 'Click below to confirm this address and finish signing in to Arc Forge.',
					linkUrl: url
				})
			});
		}
	},
	plugins: [
		genericOAuth({
			config: [
				{
					providerId: 'blossom-accounts',
					clientId: AUTHENTIK_CLIENT_ID,
					clientSecret: AUTHENTIK_CLIENT_SECRET,
					discoveryUrl: `${AUTHENTIK_URL}/application/o/arc-forge/.well-known/openid-configuration`,
					scopes: ['openid', 'email', 'profile', 'groups'],
					// `roles` isn't part of better-auth's base User type (it only exists via our
					// user.additionalFields config below), so the return type needs a cast here
					mapProfileToUser: ((profile: Record<string, unknown>) => ({
						roles: rolesFromProfile(profile)
					})) as unknown as GenericOAuthConfig['mapProfileToUser'],
					// re-sync roles from the authentik groups claim on every sign-in, not just account creation
					overrideUserInfo: true
				}
			]
		}),
		// "organizations" from the plugin's perspective; renamed to "developer profiles"
		// throughout Forge since that's what they represent here: the publisher
		// identity a PWA submission is attributed to.
		organization({
			requireEmailVerificationOnInvitation: false,
			schema: {
				organization: { modelName: 'developerProfile' },
				member: {
					modelName: 'developerProfileMember',
					fields: { organizationId: 'developerProfileId' }
				},
				invitation: {
					modelName: 'developerProfileInvitation',
					fields: { organizationId: 'developerProfileId' }
				},
				session: { fields: { activeOrganizationId: 'activeDeveloperProfileId' } }
			}
		}),
		sveltekitCookies(getRequestEvent)
	]
});
